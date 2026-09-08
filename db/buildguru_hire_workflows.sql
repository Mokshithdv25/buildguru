-- BuildGuru — hiring strategy (whole-project vs trade RFQs vs own team)
-- Run after buildguru_work_packages.sql.
--
-- Houzz / BuildingConnected-style split:
--   gc            — one contractor / architect prices the whole brief
--   trades        — homeowner posts trade-scoped work packages (default)
--   design_first  — architecture & interiors RFQ before construction
--   own_team      — private hub; no marketplace posting
--
-- Whole-project leads stay on `pro_lead_opportunities`. Trade RFQs stay on
-- `pro_work_package_opportunities`. A project in trades / design_first /
-- own_team mode is hidden from the whole-project feed unless a professional
-- is explicitly invited. Expired open packages move to under_review.

begin;

-- ---------------------------------------------------------------------------
-- 1. Hire-mode helper (reads brief_json so older briefs keep working)
-- ---------------------------------------------------------------------------
create or replace function public.brief_hire_mode(brief_json jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(brief_json ->> 'hireMode', brief_json ->> 'hire_mode', '') in ('gc', 'trades', 'design_first', 'own_team')
      then coalesce(brief_json ->> 'hireMode', brief_json ->> 'hire_mode')
    when lower(coalesce(brief_json ->> 'hasArchitect', 'false')) in ('true', '1', 't')
      then 'own_team'
    else 'gc'
  end;
$$;

comment on function public.brief_hire_mode(jsonb) is
  'Hiring strategy for a project brief. Missing hireMode: own_team if hasArchitect, otherwise gc (legacy whole-project posting).';

revoke all on function public.brief_hire_mode(jsonb) from public, anon;
grant execute on function public.brief_hire_mode(jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Whole-project bids only when the homeowner asked for a GC / invited
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
        public.portfolio_is_invited(target_project_id, target_portfolio_id)
        or (
          public.brief_hire_mode(pb.brief_json) = 'gc'
          and (
            coalesce(pb.brief_json ->> 'referredProSlug', '') = ''
            or pf.slug = pb.brief_json ->> 'referredProSlug'
          )
        )
      )
  );
$$;

revoke all on function public.can_respond_to_project(uuid, text) from public, anon;
grant execute on function public.can_respond_to_project(uuid, text) to authenticated, service_role;

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
    exists (
      select 1
      from public.project_pro_invites pi
      join public.portfolios mine on mine.id = pi.portfolio_id
      where pi.project_id = p.id
        and mine.owner_user_id = auth.uid()
    )
    or (
      public.brief_hire_mode(pb.brief_json) = 'gc'
      and (
        coalesce(pb.brief_json ->> 'referredProSlug', '') = ''
        or exists (
          select 1
          from public.portfolios pf
          where pf.owner_user_id = auth.uid()
            and pf.slug = pb.brief_json ->> 'referredProSlug'
        )
      )
    )
  );

revoke all on public.pro_lead_opportunities from public, anon, authenticated;
grant select on public.pro_lead_opportunities to authenticated;

comment on view public.pro_lead_opportunities is
  'Whole-project opportunities for professionals. Hidden when the homeowner chose trade RFQs, design-first, or own-team, unless the professional is invited. Excludes owner identity, address, contact details, and raw brief content.';

-- ---------------------------------------------------------------------------
-- 3. Close expired open work packages (owner-scoped; safe to call on load)
-- ---------------------------------------------------------------------------
create or replace function public.close_expired_work_packages(target_project_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  update public.project_work_packages wp
  set status = 'under_review',
      closed_at = coalesce(wp.closed_at, now()),
      updated_at = now()
  where wp.status = 'open'
    and wp.bids_due_at is not null
    and wp.bids_due_at < now()
    and public.project_owned_by_user(wp.project_id)
    and (target_project_id is null or wp.project_id = target_project_id);

  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.close_expired_work_packages(uuid) from public, anon;
grant execute on function public.close_expired_work_packages(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Readiness
-- ---------------------------------------------------------------------------
create or replace function public.hire_workflows_ready()
returns boolean
language sql
stable
set search_path = public
as $$
  select
    exists (select 1 from information_schema.routines where routine_schema = 'public' and routine_name = 'brief_hire_mode')
    and exists (select 1 from information_schema.routines where routine_schema = 'public' and routine_name = 'close_expired_work_packages')
    and exists (select 1 from information_schema.views where table_schema = 'public' and table_name = 'pro_lead_opportunities')
    and exists (select 1 from information_schema.views where table_schema = 'public' and table_name = 'pro_work_package_opportunities');
$$;

grant execute on function public.hire_workflows_ready() to authenticated, service_role;

commit;

-- Verification (run separately):
-- select public.hire_workflows_ready();
-- select public.brief_hire_mode('{"hireMode":"trades"}'::jsonb);  -- trades
-- select public.brief_hire_mode('{"hasArchitect":true}'::jsonb); -- own_team
-- select public.brief_hire_mode('{}'::jsonb);                    -- gc
