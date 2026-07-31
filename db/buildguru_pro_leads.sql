-- BuildGuru — professional lead inbox
-- Run after buildguru_rls_hardening.sql and buildguru_project_workspace.sql.
-- This migration exposes a deliberately limited project projection to signed-in
-- professionals and stores each professional's private response state.

begin;

create table if not exists public.project_lead_responses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  portfolio_id text not null references public.portfolios (id) on delete cascade,
  status text not null default 'viewed' check (status in (
    'viewed', 'interested', 'proposal_sent', 'won', 'declined'
  )),
  response_note text check (char_length(response_note) <= 2000),
  proposed_budget numeric check (proposed_budget is null or proposed_budget >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, portfolio_id)
);

create index if not exists idx_project_lead_responses_portfolio_status
  on public.project_lead_responses (portfolio_id, status, updated_at desc);

create index if not exists idx_project_lead_responses_project
  on public.project_lead_responses (project_id);

drop trigger if exists trg_project_lead_responses_updated_at
  on public.project_lead_responses;
create trigger trg_project_lead_responses_updated_at
  before update on public.project_lead_responses
  for each row execute function public.set_updated_at();

alter table public.project_lead_responses enable row level security;

revoke all on public.project_lead_responses from public, anon, authenticated;
grant select, insert, update, delete on public.project_lead_responses to authenticated;
grant all on public.project_lead_responses to service_role;

-- The helper is security-definer so it can inspect homeowner-owned project rows
-- without granting professionals direct access to projects or briefs. It returns
-- true only for the caller's own portfolio and an opportunity visible to it.
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
      )
  );
$$;

revoke all on function public.can_respond_to_project(uuid, text) from public, anon;
grant execute on function public.can_respond_to_project(uuid, text) to authenticated, service_role;

drop policy if exists "pro_lead_responses_select_own" on public.project_lead_responses;
create policy "pro_lead_responses_select_own"
  on public.project_lead_responses for select
  to authenticated
  using (
    exists (
      select 1
      from public.portfolios pf
      where pf.id = project_lead_responses.portfolio_id
        and pf.owner_user_id = auth.uid()
    )
  );

drop policy if exists "pro_lead_responses_insert_own" on public.project_lead_responses;
create policy "pro_lead_responses_insert_own"
  on public.project_lead_responses for insert
  to authenticated
  with check (
    public.can_respond_to_project(project_lead_responses.project_id, project_lead_responses.portfolio_id)
  );

drop policy if exists "pro_lead_responses_update_own" on public.project_lead_responses;
create policy "pro_lead_responses_update_own"
  on public.project_lead_responses for update
  to authenticated
  using (
    exists (
      select 1
      from public.portfolios pf
      where pf.id = project_lead_responses.portfolio_id
        and pf.owner_user_id = auth.uid()
    )
  )
  with check (
    public.can_respond_to_project(project_lead_responses.project_id, project_lead_responses.portfolio_id)
  );

drop policy if exists "pro_lead_responses_delete_own" on public.project_lead_responses;
create policy "pro_lead_responses_delete_own"
  on public.project_lead_responses for delete
  to authenticated
  using (
    exists (
      select 1
      from public.portfolios pf
      where pf.id = project_lead_responses.portfolio_id
        and pf.owner_user_id = auth.uid()
    )
  );

-- This view intentionally omits owner_user_id, full location/address, contact
-- details, dream_vision, inspirations, and the raw brief_json payload. It is a
-- security-definer projection with its own auth and role checks because the
-- underlying project tables remain homeowner-only under RLS.
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
  pb.updated_at as posted_at,
  (coalesce(pb.brief_json ->> 'referredProSlug', '') <> '') as targeted_to_you
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
  );

revoke all on public.pro_lead_opportunities from public, anon, authenticated;
grant select on public.pro_lead_opportunities to authenticated;

comment on view public.pro_lead_opportunities is
  'Privacy-safe homeowner project opportunities visible only to authenticated professionals.';

commit;

-- Verification (run separately):
-- select relname, relrowsecurity from pg_class where relname = 'project_lead_responses';
-- select grantee, privilege_type from information_schema.role_table_grants
--   where table_schema = 'public' and table_name in ('project_lead_responses', 'pro_lead_opportunities');
-- As anon, selecting pro_lead_opportunities must return 401/403.
-- As a pro, the view must not contain owner_user_id, contact fields, location, or brief_json.
