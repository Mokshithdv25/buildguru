-- BuildGuru — homeowner ↔ professional bidding loop
-- Run after buildguru_pro_leads.sql.
--
-- This migration turns the professional lead inbox into a two-way bidding
-- marketplace:
--   1. A professional submits a structured bid (amount, timeline, scope note)
--      instead of only flipping a private pipeline flag.
--   2. The homeowner who owns the project can read those bids and record a
--      decision (shortlist / accept / decline).
--   3. A homeowner can invite specific professionals to bid on their project.
--   4. Contact details stay hidden on both sides until the homeowner accepts.

begin;

-- ---------------------------------------------------------------------------
-- 1. Homeowner invitations to specific professionals
-- ---------------------------------------------------------------------------
create table if not exists public.project_pro_invites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  portfolio_id text not null references public.portfolios (id) on delete cascade,
  invited_by uuid not null references auth.users (id) on delete cascade,
  match_score integer check (match_score is null or (match_score >= 0 and match_score <= 100)),
  match_reason text check (char_length(match_reason) <= 500),
  created_at timestamptz not null default now(),
  unique (project_id, portfolio_id)
);

create index if not exists idx_project_pro_invites_project
  on public.project_pro_invites (project_id, created_at desc);

create index if not exists idx_project_pro_invites_portfolio
  on public.project_pro_invites (portfolio_id);

alter table public.project_pro_invites enable row level security;

revoke all on public.project_pro_invites from public, anon, authenticated;
grant select, insert, delete on public.project_pro_invites to authenticated;
grant all on public.project_pro_invites to service_role;

-- The homeowner who owns the project manages its invitations.
drop policy if exists "project_pro_invites_select_owner" on public.project_pro_invites;
create policy "project_pro_invites_select_owner"
  on public.project_pro_invites for select
  to authenticated
  using (public.project_owned_by_user(project_id));

drop policy if exists "project_pro_invites_insert_owner" on public.project_pro_invites;
create policy "project_pro_invites_insert_owner"
  on public.project_pro_invites for insert
  to authenticated
  with check (
    invited_by = auth.uid()
    and public.project_owned_by_user(project_id)
    and exists (
      select 1
      from public.portfolios pf
      where pf.id = project_pro_invites.portfolio_id
        and pf.published = true
        and pf.moderation_status = 'approved'
    )
  );

drop policy if exists "project_pro_invites_delete_owner" on public.project_pro_invites;
create policy "project_pro_invites_delete_owner"
  on public.project_pro_invites for delete
  to authenticated
  using (public.project_owned_by_user(project_id));

-- Professionals never read this table directly; invitation state reaches them
-- through the security-definer helper and opportunity view below.
create or replace function public.portfolio_is_invited(
  target_project_id uuid,
  target_portfolio_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.project_pro_invites pi
    where pi.project_id = target_project_id
      and pi.portfolio_id = target_portfolio_id
  );
$$;

revoke all on function public.portfolio_is_invited(uuid, text) from public, anon;
grant execute on function public.portfolio_is_invited(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Turn lead responses into real bids
-- ---------------------------------------------------------------------------
alter table public.project_lead_responses
  add column if not exists bid_amount_inr numeric
    check (bid_amount_inr is null or bid_amount_inr >= 0),
  add column if not exists bid_timeline_weeks integer
    check (bid_timeline_weeks is null or (bid_timeline_weeks > 0 and bid_timeline_weeks <= 520)),
  add column if not exists bid_scope_note text
    check (bid_scope_note is null or char_length(bid_scope_note) <= 4000),
  add column if not exists bid_submitted_at timestamptz,
  add column if not exists bid_valid_until date,
  add column if not exists homeowner_decision text not null default 'pending',
  add column if not exists homeowner_decided_at timestamptz;

-- `status` is the professional's own pipeline. `homeowner_decision` is the
-- homeowner's verdict. Keeping them separate avoids the two parties fighting
-- over a single column.
alter table public.project_lead_responses
  drop constraint if exists project_lead_responses_status_check;
alter table public.project_lead_responses
  add constraint project_lead_responses_status_check
  check (status in (
    'viewed', 'interested', 'bid_submitted', 'proposal_sent', 'won', 'declined'
  ));

alter table public.project_lead_responses
  drop constraint if exists project_lead_responses_homeowner_decision_check;
alter table public.project_lead_responses
  add constraint project_lead_responses_homeowner_decision_check
  check (homeowner_decision in ('pending', 'shortlisted', 'accepted', 'declined'));

-- A bid is only meaningful with an amount attached.
alter table public.project_lead_responses
  drop constraint if exists project_lead_responses_bid_complete_check;
alter table public.project_lead_responses
  add constraint project_lead_responses_bid_complete_check
  check (bid_submitted_at is null or bid_amount_inr is not null);

create index if not exists idx_project_lead_responses_project_bids
  on public.project_lead_responses (project_id, bid_submitted_at desc)
  where bid_submitted_at is not null;

-- ---------------------------------------------------------------------------
-- 3. Professionals may respond to open, or explicitly invited, projects
-- ---------------------------------------------------------------------------
create or replace function public.can_respond_to_project(
  target_project_id uuid,
  target_portfolio_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.portfolios pf
    join public.project_briefs pb on pb.project_id = target_project_id
    join public.projects p on p.id = pb.project_id
    where pf.id = target_portfolio_id
      and pf.owner_user_id = auth.uid()
      and exists (
        select 1
        from public.user_profiles up
        where up.id = auth.uid()
          and up.role = 'pro'
      )
      and pb.flow_status = 'open_for_quotes'
      and p.status in ('planning', 'active')
      and (
        coalesce(pb.brief_json ->> 'referredProSlug', '') = ''
        or pf.slug = pb.brief_json ->> 'referredProSlug'
        or public.portfolio_is_invited(target_project_id, target_portfolio_id)
      )
  );
$$;

revoke all on function public.can_respond_to_project(uuid, text) from public, anon;
grant execute on function public.can_respond_to_project(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Homeowner read access to bids on their own project
-- ---------------------------------------------------------------------------
-- The professional keeps exclusive write access. The homeowner gains read
-- access only to submitted bids on projects they own, and records decisions
-- through the security-definer function below so they cannot rewrite bid
-- amounts. Restricting to submitted bids keeps a professional's private
-- pipeline state (viewed, interested, declined) invisible to the homeowner.
drop policy if exists "project_lead_responses_select_project_owner" on public.project_lead_responses;
create policy "project_lead_responses_select_project_owner"
  on public.project_lead_responses for select
  to authenticated
  using (
    bid_submitted_at is not null
    and public.project_owned_by_user(project_id)
  );

create or replace function public.set_project_bid_decision(
  target_response_id uuid,
  target_decision text
)
returns public.project_lead_responses
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected public.project_lead_responses;
begin
  if target_decision not in ('pending', 'shortlisted', 'accepted', 'declined') then
    raise exception 'Invalid bid decision';
  end if;

  update public.project_lead_responses r
  set homeowner_decision = target_decision,
      homeowner_decided_at = case when target_decision = 'pending' then null else now() end,
      updated_at = now()
  where r.id = target_response_id
    and public.project_owned_by_user(r.project_id)
    and r.bid_submitted_at is not null
  returning r.* into affected;

  if affected.id is null then
    raise exception 'Bid not found for this project';
  end if;

  return affected;
end;
$$;

revoke all on function public.set_project_bid_decision(uuid, text) from public, anon;
grant execute on function public.set_project_bid_decision(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Homeowner-facing bid view (professional identity, contact gated)
-- ---------------------------------------------------------------------------
-- Business contact details are withheld until the homeowner shortlists or
-- accepts, so a posted project cannot be used to harvest professional contacts.
create or replace view public.project_bids_for_owner
with (security_barrier = true)
as
select
  r.id as bid_id,
  r.project_id,
  r.portfolio_id,
  r.status as pro_status,
  r.homeowner_decision,
  r.homeowner_decided_at,
  r.bid_amount_inr,
  r.bid_timeline_weeks,
  r.bid_scope_note,
  r.bid_submitted_at,
  r.bid_valid_until,
  r.response_note,
  pf.craft,
  coalesce(nullif(btrim(pf.business_name), ''), nullif(btrim(pf.full_name), ''), 'Professional') as pro_name,
  pf.city as pro_city,
  pf.years_experience,
  pf.specialties,
  pf.profile_photo,
  pf.slug,
  pf.profile_strength,
  case when r.homeowner_decision in ('shortlisted', 'accepted') then pf.phone else null end as pro_phone,
  case when r.homeowner_decision in ('shortlisted', 'accepted') then pf.email else null end as pro_email,
  (public.portfolio_is_invited(r.project_id, r.portfolio_id)) as was_invited
from public.project_lead_responses r
join public.portfolios pf on pf.id = r.portfolio_id
where r.bid_submitted_at is not null
  and public.project_owned_by_user(r.project_id);

revoke all on public.project_bids_for_owner from public, anon, authenticated;
grant select on public.project_bids_for_owner to authenticated;

comment on view public.project_bids_for_owner is
  'Bids submitted on the caller''s own projects. Professional contact details appear only after the homeowner shortlists or accepts.';

-- ---------------------------------------------------------------------------
-- 6. Professional opportunity view — richer scope, still no homeowner identity
-- ---------------------------------------------------------------------------
-- A professional needs enough scope to price the work: rooms, size, style,
-- finish level and goals. This view still omits owner_user_id, the street
-- address, contact details, and the raw brief payload.
-- PostgreSQL cannot CREATE OR REPLACE a view when the new projection changes
-- existing column names or order, so recreate this derived API surface inside
-- the transaction. No persisted data lives in the view.
drop view if exists public.pro_lead_opportunities;
create or replace view public.pro_lead_opportunities
with (security_barrier = true)
as
select
  p.id as project_id,
  coalesce(nullif(btrim(p.title), ''),
    case when p.flow_type = 'remodel' then 'Home remodel' else 'New home project' end
  ) as title,
  p.flow_type,
  coalesce(
    nullif(btrim(p.city), ''),
    nullif(btrim(split_part(p.location, ',', 1)), ''),
    'Location shared after acceptance'
  ) as city,
  nullif(btrim(p.state), '') as state,
  p.budget_min,
  p.budget_max,
  nullif(btrim(p.timeline_completion), '') as timeline_completion,
  nullif(btrim(pb.brief_json ->> 'startTimeline'), '') as start_timeline,
  coalesce(
    nullif(btrim(pb.brief_json ->> 'room'), ''),
    nullif(btrim(pb.brief_json ->> 'homeType'), ''),
    case when p.flow_type = 'remodel' then 'Remodel scope' else 'New home scope' end
  ) as scope_label,
  case
    when jsonb_typeof(pb.brief_json -> 'styles') = 'array'
      then pb.brief_json -> 'styles'
    else '[]'::jsonb
  end as styles_json,
  -- Scope detail for pricing (no free-text vision, no contact, no address).
  nullif(btrim(pb.brief_json ->> 'propertyType'), '') as property_type,
  nullif(btrim(pb.brief_json ->> 'areaSqFt'), '') as area_sqft,
  nullif(btrim(pb.brief_json ->> 'roomSizeLabel'), '') as room_size_label,
  nullif(btrim(pb.brief_json ->> 'dimW'), '') as plot_width,
  nullif(btrim(pb.brief_json ->> 'dimL'), '') as plot_length,
  nullif(btrim(pb.brief_json ->> 'floors'), '') as floors,
  nullif(btrim(pb.brief_json ->> 'facing'), '') as facing,
  nullif(btrim(pb.brief_json ->> 'finishTier'), '') as finish_tier,
  nullif(btrim(pb.brief_json ->> 'mainGoal'), '') as main_goal,
  nullif(btrim(pb.brief_json ->> 'changeLevel'), '') as change_level,
  coalesce((pb.brief_json ->> 'hasArchitect')::boolean, false) as homeowner_has_architect,
  (coalesce(pb.brief_json ->> 'v0Generated', 'false') = 'true') as has_ai_design_pack,
  pb.updated_at as posted_at,
  (coalesce(pb.brief_json ->> 'referredProSlug', '') <> '') as targeted_to_you,
  exists (
    select 1
    from public.project_pro_invites pi
    join public.portfolios mine on mine.id = pi.portfolio_id
    where pi.project_id = p.id
      and mine.owner_user_id = auth.uid()
  ) as invited_to_you
from public.projects p
join public.project_briefs pb on pb.project_id = p.id
where pb.flow_status = 'open_for_quotes'
  and p.status in ('planning', 'active')
  and exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid()
      and up.role = 'pro'
  )
  and (
    coalesce(pb.brief_json ->> 'referredProSlug', '') = ''
    or exists (
      select 1
      from public.portfolios pf
      where pf.owner_user_id = auth.uid()
        and pf.slug = pb.brief_json ->> 'referredProSlug'
    )
    or exists (
      select 1
      from public.project_pro_invites pi
      join public.portfolios mine on mine.id = pi.portfolio_id
      where pi.project_id = p.id
        and mine.owner_user_id = auth.uid()
    )
  );

revoke all on public.pro_lead_opportunities from public, anon, authenticated;
grant select on public.pro_lead_opportunities to authenticated;

comment on view public.pro_lead_opportunities is
  'Privacy-safe homeowner project opportunities visible only to authenticated professionals. Excludes owner identity, address, contact details, and raw brief content.';

-- ---------------------------------------------------------------------------
-- 7. Homeowner contact released to an accepted professional only
-- ---------------------------------------------------------------------------
create or replace view public.pro_awarded_projects
with (security_barrier = true)
as
select
  p.id as project_id,
  p.title,
  p.flow_type,
  p.location,
  p.city,
  p.state,
  p.timeline_completion,
  r.bid_amount_inr,
  r.bid_timeline_weeks,
  r.homeowner_decided_at,
  r.portfolio_id,
  coalesce(nullif(btrim(up.full_name), ''), 'Homeowner') as homeowner_name,
  up.phone as homeowner_phone,
  up.email as homeowner_email
from public.project_lead_responses r
join public.projects p on p.id = r.project_id
join public.portfolios pf on pf.id = r.portfolio_id
left join public.user_profiles up on up.id = p.owner_user_id
where r.homeowner_decision = 'accepted'
  and pf.owner_user_id = auth.uid();

revoke all on public.pro_awarded_projects from public, anon, authenticated;
grant select on public.pro_awarded_projects to authenticated;

comment on view public.pro_awarded_projects is
  'Projects where the homeowner accepted the caller''s bid. This is the only path that releases homeowner contact details to a professional.';

-- ---------------------------------------------------------------------------
-- 8. Readiness contract
-- ---------------------------------------------------------------------------
create or replace function public.project_bids_ready()
returns boolean
language sql
stable
set search_path = public
as $$
  select
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'project_lead_responses'
        and column_name = 'bid_amount_inr'
    )
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'project_lead_responses'
        and column_name = 'homeowner_decision'
    )
    and exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'project_pro_invites'
    )
    and exists (
      select 1 from information_schema.views
      where table_schema = 'public' and table_name = 'project_bids_for_owner'
    )
    and exists (
      select 1 from information_schema.views
      where table_schema = 'public' and table_name = 'pro_awarded_projects'
    );
$$;

grant execute on function public.project_bids_ready() to authenticated, service_role;

commit;

-- Verification (run separately):
-- select public.project_bids_ready();
--
-- As anon, every one of these must return 401/403:
--   project_pro_invites, project_bids_for_owner, pro_awarded_projects
--
-- With two disposable pro accounts and one homeowner account, confirm:
--   1. A pro can submit a bid on an open project, and cannot write a bid using
--      another pro's portfolio_id.
--   2. The homeowner sees both bids in project_bids_for_owner, with pro_phone
--      and pro_email null until the bid is shortlisted or accepted.
--   3. A second homeowner sees zero rows for the same project.
--   4. set_project_bid_decision fails for a project the caller does not own.
--   5. pro_awarded_projects returns homeowner contact only for the accepted pro.
