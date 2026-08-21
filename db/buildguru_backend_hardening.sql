-- BuildGuru — PROPOSED backend hardening and API-view isolation
-- NOT YET APPROVED OR APPLIED TO PRODUCTION.
-- Rehearse this migration against a staging branch/restore before adding it to
-- the production rollout. It rewrites API views and RLS policies, so it needs
-- an explicit production change-window approval even though it deletes no data.

begin;

-- Keep privileged helpers outside the schemas exposed by PostgREST. Public
-- views remain stable API contracts, but execute only narrowly projected
-- functions from this non-exposed schema.
create schema if not exists buildguru_private;
revoke all on schema buildguru_private from public;
grant usage on schema buildguru_private to anon, authenticated, service_role;

create or replace function buildguru_private.careers_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.career_admins ca
    where ca.user_id = (select auth.uid())
  );
$$;

create or replace function buildguru_private.project_owned_by_user(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = p_project_id
      and p.owner_user_id is not null
      and p.owner_user_id = (select auth.uid())
  );
$$;

create or replace function buildguru_private.portfolio_is_invited(
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

create or replace function buildguru_private.can_respond_to_project(
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
      and pf.owner_user_id = (select auth.uid())
      and exists (
        select 1
        from public.user_profiles up
        where up.id = (select auth.uid())
          and up.role = 'pro'
      )
      and pb.flow_status = 'open_for_quotes'
      and p.status in ('planning', 'active')
      and (
        coalesce(pb.brief_json ->> 'referredProSlug', '') = ''
        or pf.slug = pb.brief_json ->> 'referredProSlug'
        or buildguru_private.portfolio_is_invited(target_project_id, target_portfolio_id)
      )
  );
$$;

create or replace function buildguru_private.career_work_sample_is_public(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.career_applications a
    where a.publish_portfolio = true
      and a.profile_slug is not null
      and p_object_name = any(a.work_sample_paths)
  );
$$;

create or replace function buildguru_private.portfolio_media_is_published(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.portfolios p
    where p.published = true
      and p.moderation_status = 'approved'
      and p.owner_user_id::text = split_part(p_object_name, '/', 1)
      and p.id::text = split_part(p_object_name, '/', 2)
      and (
        public.portfolio_media_object_name(p.cover_photo) = p_object_name
        or public.portfolio_media_object_name(p.profile_photo) = p_object_name
        or exists (
          select 1
          from jsonb_array_elements_text(coalesce(p.photos, '[]'::jsonb)) media(url)
          where public.portfolio_media_object_name(media.url) = p_object_name
        )
      )
  );
$$;

-- Safe public directory projections.
create or replace function buildguru_private.published_portfolios()
returns table (
  id text,
  craft text,
  full_name text,
  business_name text,
  city text,
  years_experience text,
  short_bio text,
  specialties jsonb,
  photos jsonb,
  cover_photo text,
  profile_photo text,
  slug text,
  profile_strength integer,
  portfolio_theme text,
  portfolio_layout text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id, p.craft, p.full_name, p.business_name, p.city,
    p.years_experience, p.short_bio, p.specialties, p.photos,
    p.cover_photo, p.profile_photo, p.slug, p.profile_strength,
    p.portfolio_theme, p.portfolio_layout, p.updated_at
  from public.portfolios p
  where p.published = true
    and p.moderation_status = 'approved';
$$;

create or replace function buildguru_private.published_career_profiles()
returns table (
  id uuid,
  slug text,
  full_name text,
  city text,
  short_bio text,
  candidate_profile jsonb,
  work_sample_paths text[],
  work_sample_captions jsonb,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    a.id,
    a.profile_slug,
    a.full_name,
    a.city,
    a.cover_note,
    a.candidate_profile - 'license_number',
    a.work_sample_paths,
    a.work_sample_captions,
    a.created_at
  from public.career_applications a
  where a.publish_portfolio = true
    and a.profile_slug is not null
    and coalesce(array_length(a.work_sample_paths, 1), 0) > 0;
$$;

-- Homeowner-facing submitted bids. Professional contact stays gated until a
-- shortlist or acceptance decision.
create or replace function buildguru_private.project_bids_for_owner()
returns table (
  bid_id uuid,
  project_id uuid,
  portfolio_id text,
  pro_status text,
  homeowner_decision text,
  homeowner_decided_at timestamptz,
  bid_amount_inr numeric,
  bid_timeline_weeks integer,
  bid_scope_note text,
  bid_submitted_at timestamptz,
  bid_valid_until date,
  response_note text,
  craft text,
  pro_name text,
  pro_city text,
  years_experience text,
  specialties jsonb,
  profile_photo text,
  slug text,
  profile_strength integer,
  pro_phone text,
  pro_email text,
  was_invited boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.id,
    r.project_id,
    r.portfolio_id,
    r.status,
    r.homeowner_decision,
    r.homeowner_decided_at,
    r.bid_amount_inr,
    r.bid_timeline_weeks,
    r.bid_scope_note,
    r.bid_submitted_at,
    r.bid_valid_until,
    r.response_note,
    pf.craft,
    coalesce(nullif(btrim(pf.business_name), ''), nullif(btrim(pf.full_name), ''), 'Professional'),
    pf.city,
    pf.years_experience,
    pf.specialties,
    pf.profile_photo,
    pf.slug,
    pf.profile_strength,
    case when r.homeowner_decision in ('shortlisted', 'accepted') then pf.phone else null end,
    case when r.homeowner_decision in ('shortlisted', 'accepted') then pf.email else null end,
    buildguru_private.portfolio_is_invited(r.project_id, r.portfolio_id)
  from public.project_lead_responses r
  join public.portfolios pf on pf.id = r.portfolio_id
  where r.bid_submitted_at is not null
    and buildguru_private.project_owned_by_user(r.project_id);
$$;

-- Professional lead projection. It intentionally excludes owner identity,
-- street address, contact details, free-text vision, and raw brief JSON.
create or replace function buildguru_private.pro_lead_opportunities()
returns table (
  project_id uuid,
  title text,
  flow_type text,
  city text,
  state text,
  budget_min numeric,
  budget_max numeric,
  timeline_completion text,
  start_timeline text,
  scope_label text,
  styles_json jsonb,
  property_type text,
  area_sqft text,
  room_size_label text,
  plot_width text,
  plot_length text,
  floors text,
  facing text,
  finish_tier text,
  main_goal text,
  change_level text,
  homeowner_has_architect boolean,
  has_ai_design_pack boolean,
  posted_at timestamptz,
  targeted_to_you boolean,
  invited_to_you boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    coalesce(nullif(btrim(p.title), ''),
      case when p.flow_type = 'remodel' then 'Home remodel' else 'New home project' end),
    p.flow_type,
    coalesce(nullif(btrim(p.city), ''), nullif(btrim(split_part(p.location, ',', 1)), ''),
      'Location shared after acceptance'),
    nullif(btrim(p.state), ''),
    p.budget_min,
    p.budget_max,
    nullif(btrim(p.timeline_completion), ''),
    nullif(btrim(pb.brief_json ->> 'startTimeline'), ''),
    coalesce(nullif(btrim(pb.brief_json ->> 'room'), ''),
      nullif(btrim(pb.brief_json ->> 'homeType'), ''),
      case when p.flow_type = 'remodel' then 'Remodel scope' else 'New home scope' end),
    case when jsonb_typeof(pb.brief_json -> 'styles') = 'array'
      then pb.brief_json -> 'styles' else '[]'::jsonb end,
    nullif(btrim(pb.brief_json ->> 'propertyType'), ''),
    nullif(btrim(pb.brief_json ->> 'areaSqFt'), ''),
    nullif(btrim(pb.brief_json ->> 'roomSizeLabel'), ''),
    nullif(btrim(pb.brief_json ->> 'dimW'), ''),
    nullif(btrim(pb.brief_json ->> 'dimL'), ''),
    nullif(btrim(pb.brief_json ->> 'floors'), ''),
    nullif(btrim(pb.brief_json ->> 'facing'), ''),
    nullif(btrim(pb.brief_json ->> 'finishTier'), ''),
    nullif(btrim(pb.brief_json ->> 'mainGoal'), ''),
    nullif(btrim(pb.brief_json ->> 'changeLevel'), ''),
    lower(coalesce(pb.brief_json ->> 'hasArchitect', 'false')) = 'true',
    lower(coalesce(pb.brief_json ->> 'v0Generated', 'false')) = 'true',
    pb.updated_at,
    coalesce(pb.brief_json ->> 'referredProSlug', '') <> '',
    exists (
      select 1
      from public.project_pro_invites pi
      join public.portfolios mine on mine.id = pi.portfolio_id
      where pi.project_id = p.id
        and mine.owner_user_id = (select auth.uid())
    )
  from public.projects p
  join public.project_briefs pb on pb.project_id = p.id
  where pb.flow_status = 'open_for_quotes'
    and p.status in ('planning', 'active')
    and exists (
      select 1
      from public.user_profiles up
      where up.id = (select auth.uid())
        and up.role = 'pro'
    )
    and (
      coalesce(pb.brief_json ->> 'referredProSlug', '') = ''
      or exists (
        select 1
        from public.portfolios pf
        where pf.owner_user_id = (select auth.uid())
          and pf.slug = pb.brief_json ->> 'referredProSlug'
      )
      or exists (
        select 1
        from public.project_pro_invites pi
        join public.portfolios mine on mine.id = pi.portfolio_id
        where pi.project_id = p.id
          and mine.owner_user_id = (select auth.uid())
      )
    );
$$;

create or replace function buildguru_private.pro_awarded_projects()
returns table (
  project_id uuid,
  title text,
  flow_type text,
  location text,
  city text,
  state text,
  timeline_completion text,
  bid_amount_inr numeric,
  bid_timeline_weeks integer,
  homeowner_decided_at timestamptz,
  portfolio_id text,
  homeowner_name text,
  homeowner_phone text,
  homeowner_email text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
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
    coalesce(nullif(btrim(up.full_name), ''), 'Homeowner'),
    up.phone,
    up.email
  from public.project_lead_responses r
  join public.projects p on p.id = r.project_id
  join public.portfolios pf on pf.id = r.portfolio_id
  left join public.user_profiles up on up.id = p.owner_user_id
  where r.homeowner_decision = 'accepted'
    and pf.owner_user_id = (select auth.uid());
$$;

revoke all on all functions in schema buildguru_private from public;
grant execute on function buildguru_private.careers_is_admin() to anon, authenticated, service_role;
grant execute on function buildguru_private.career_work_sample_is_public(text) to anon, authenticated, service_role;
grant execute on function buildguru_private.portfolio_media_is_published(text) to anon, authenticated, service_role;
grant execute on function buildguru_private.published_portfolios() to anon, authenticated, service_role;
grant execute on function buildguru_private.published_career_profiles() to anon, authenticated, service_role;
grant execute on function buildguru_private.project_owned_by_user(uuid) to authenticated, service_role;
grant execute on function buildguru_private.portfolio_is_invited(uuid, text) to authenticated, service_role;
grant execute on function buildguru_private.can_respond_to_project(uuid, text) to authenticated, service_role;
grant execute on function buildguru_private.project_bids_for_owner() to authenticated, service_role;
grant execute on function buildguru_private.pro_lead_opportunities() to authenticated, service_role;
grant execute on function buildguru_private.pro_awarded_projects() to authenticated, service_role;

-- Public RPC-compatible wrappers do not own privileges. They expose only a
-- boolean about the caller and delegate privileged reads to private helpers.
create or replace function public.careers_is_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$ select buildguru_private.careers_is_admin(); $$;

create or replace function public.project_owned_by_user(p_project_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$ select buildguru_private.project_owned_by_user(p_project_id); $$;

create or replace function public.portfolio_is_invited(
  target_project_id uuid,
  target_portfolio_id text
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$ select buildguru_private.portfolio_is_invited(target_project_id, target_portfolio_id); $$;

create or replace function public.can_respond_to_project(
  target_project_id uuid,
  target_portfolio_id text
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$ select buildguru_private.can_respond_to_project(target_project_id, target_portfolio_id); $$;

revoke all on function public.careers_is_admin() from public, anon, authenticated;
grant execute on function public.careers_is_admin() to authenticated, service_role;
revoke all on function public.project_owned_by_user(uuid) from public, anon, authenticated;
grant execute on function public.project_owned_by_user(uuid) to authenticated, service_role;
revoke all on function public.portfolio_is_invited(uuid, text) from public, anon, authenticated;
grant execute on function public.portfolio_is_invited(uuid, text) to authenticated, service_role;
revoke all on function public.can_respond_to_project(uuid, text) from public, anon, authenticated;
grant execute on function public.can_respond_to_project(uuid, text) to authenticated, service_role;

-- Repoint Storage RLS at non-exposed helpers and remove direct RPC access to
-- the old public SECURITY DEFINER helpers.
drop policy if exists "portfolio_media_select_published" on storage.objects;
create policy "portfolio_media_select_published"
  on storage.objects for select
  to anon, authenticated
  using (
    bucket_id = 'portfolio-media'
    and buildguru_private.portfolio_media_is_published(name)
  );

drop policy if exists "published career samples are public" on storage.objects;
create policy "published career samples are public"
  on storage.objects for select
  to anon, authenticated
  using (
    bucket_id = 'career-work-samples'
    and buildguru_private.career_work_sample_is_public(name)
  );

revoke all on function public.portfolio_media_is_published(text) from public, anon, authenticated, service_role;
revoke all on function public.career_work_sample_is_public(text) from public, anon, authenticated, service_role;
revoke all on function public.rls_auto_enable() from public, anon, authenticated, service_role;

-- Stable API view names, now marked security_invoker. Their only sources are
-- narrowly projected private functions, not the raw owner-protected tables.
create or replace view public.published_portfolios
with (security_invoker = true, security_barrier = true)
as select * from buildguru_private.published_portfolios();

create or replace view public.published_career_profiles
with (security_invoker = true, security_barrier = true)
as select * from buildguru_private.published_career_profiles();

create or replace view public.project_bids_for_owner
with (security_invoker = true, security_barrier = true)
as select * from buildguru_private.project_bids_for_owner();

create or replace view public.pro_lead_opportunities
with (security_invoker = true, security_barrier = true)
as select * from buildguru_private.pro_lead_opportunities();

create or replace view public.pro_awarded_projects
with (security_invoker = true, security_barrier = true)
as select * from buildguru_private.pro_awarded_projects();

revoke all on public.published_portfolios from public, anon, authenticated;
grant select on public.published_portfolios to anon, authenticated;
revoke all on public.published_career_profiles from public, anon, authenticated;
grant select on public.published_career_profiles to anon, authenticated;
revoke all on public.project_bids_for_owner from public, anon, authenticated;
grant select on public.project_bids_for_owner to authenticated;
revoke all on public.pro_lead_opportunities from public, anon, authenticated;
grant select on public.pro_lead_opportunities to authenticated;
revoke all on public.pro_awarded_projects from public, anon, authenticated;
grant select on public.pro_awarded_projects to authenticated;

-- Avoid repeated permissive policy evaluation while preserving the exact
-- career and bidding authorization behavior.
drop policy if exists "published career jobs are public" on public.career_jobs;
drop policy if exists "career admins manage jobs" on public.career_jobs;
create policy "career jobs visible to public or admins"
  on public.career_jobs for select
  to anon, authenticated
  using (
    (status = 'published' and (closes_at is null or closes_at > now()))
    or buildguru_private.careers_is_admin()
  );
create policy "career admins insert jobs"
  on public.career_jobs for insert to authenticated
  with check (buildguru_private.careers_is_admin());
create policy "career admins update jobs"
  on public.career_jobs for update to authenticated
  using (buildguru_private.careers_is_admin())
  with check (buildguru_private.careers_is_admin());
create policy "career admins delete jobs"
  on public.career_jobs for delete to authenticated
  using (buildguru_private.careers_is_admin());

drop policy if exists "career admins manage applications" on public.career_applications;
create policy "career admins select applications"
  on public.career_applications for select to authenticated
  using (buildguru_private.careers_is_admin());
create policy "career admins update applications"
  on public.career_applications for update to authenticated
  using (buildguru_private.careers_is_admin())
  with check (buildguru_private.careers_is_admin());
create policy "career admins delete applications"
  on public.career_applications for delete to authenticated
  using (buildguru_private.careers_is_admin());

drop policy if exists "pro_lead_responses_select_own" on public.project_lead_responses;
drop policy if exists "project_lead_responses_select_project_owner" on public.project_lead_responses;
create policy "project lead responses select authorized"
  on public.project_lead_responses for select to authenticated
  using (
    exists (
      select 1 from public.portfolios pf
      where pf.id = project_lead_responses.portfolio_id
        and pf.owner_user_id = (select auth.uid())
    )
    or (
      bid_submitted_at is not null
      and public.project_owned_by_user(project_id)
    )
  );

-- Pin trigger search paths and remove accidental direct execution.
alter function public.set_updated_at() set search_path = pg_catalog;
alter function public.touch_last_active_at() set search_path = pg_catalog;
revoke all on function public.touch_last_active_at() from public, anon, authenticated, service_role;

-- Cover every currently reported application foreign key without dropping the
-- useful young-database indexes that have not yet accumulated usage metrics.
create index if not exists billing_webhook_events_order_idx
  on public.billing_webhook_events (billing_order_id);
create index if not exists blocked_portfolios_portfolio_idx
  on public.blocked_portfolios (portfolio_id);
create index if not exists career_jobs_created_by_idx
  on public.career_jobs (created_by);
create index if not exists portfolio_reports_reporter_idx
  on public.portfolio_reports (reporter_user_id);
create index if not exists project_agent_actions_approved_by_idx
  on public.project_agent_actions (approved_by_user_id);
create index if not exists project_documents_stage_project_idx
  on public.project_documents (stage_id, project_id);
create index if not exists project_documents_uploader_portfolio_idx
  on public.project_documents (uploaded_by_portfolio_id);
create index if not exists project_documents_uploader_user_idx
  on public.project_documents (uploaded_by_user_id);
create index if not exists project_messages_author_portfolio_idx
  on public.project_messages (author_portfolio_id);
create index if not exists project_messages_stage_project_idx
  on public.project_messages (stage_id, project_id);
create index if not exists project_pro_invites_invited_by_idx
  on public.project_pro_invites (invited_by);
create index if not exists project_tasks_assignee_portfolio_idx
  on public.project_tasks (assignee_portfolio_id);
create index if not exists project_tasks_stage_project_idx
  on public.project_tasks (stage_id, project_id);
create index if not exists user_entitlements_source_order_idx
  on public.user_entitlements (source_order_id);

-- Convert auth.uid() calls in every existing RLS policy into init-plans. The
-- placeholder makes this block safe to rerun without nesting SELECT wrappers.
do $bg_rls$
declare
  policy_row record;
  next_qual text;
  next_check text;
  statement text;
begin
  for policy_row in
    select
      ns.nspname as schema_name,
      cls.relname as table_name,
      pol.polname as policy_name,
      pg_get_expr(pol.polqual, pol.polrelid) as using_expression,
      pg_get_expr(pol.polwithcheck, pol.polrelid) as check_expression
    from pg_policy pol
    join pg_class cls on cls.oid = pol.polrelid
    join pg_namespace ns on ns.oid = cls.relnamespace
    where ns.nspname in ('public', 'storage')
      and (
        coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') like '%auth.uid()%'
        or coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') like '%auth.uid()%'
      )
  loop
    next_qual := replace(
      replace(policy_row.using_expression, '(select auth.uid())', '__BG_AUTH_UID__'),
      'auth.uid()', '(select auth.uid())'
    );
    next_qual := replace(next_qual, '__BG_AUTH_UID__', '(select auth.uid())');

    next_check := replace(
      replace(policy_row.check_expression, '(select auth.uid())', '__BG_AUTH_UID__'),
      'auth.uid()', '(select auth.uid())'
    );
    next_check := replace(next_check, '__BG_AUTH_UID__', '(select auth.uid())');

    statement := format(
      'alter policy %I on %I.%I',
      policy_row.policy_name,
      policy_row.schema_name,
      policy_row.table_name
    );
    if next_qual is not null then
      statement := statement || format(' using (%s)', next_qual);
    end if;
    if next_check is not null then
      statement := statement || format(' with check (%s)', next_check);
    end if;
    execute statement;
  end loop;
end;
$bg_rls$;

commit;
