-- =============================================================================
-- HomeMakers — DESTRUCTIVE PRODUCTION RESET
-- =============================================================================
-- Permanently removes all HomeMakers public-schema data and legacy policies.
-- It deliberately preserves the Supabase project, Auth configuration, API keys,
-- OAuth providers, and bucket records. Empty application buckets through the
-- Supabase Storage API/Dashboard first; delete disposable Auth users through the
-- Auth Admin UI/API separately.
--
-- After this succeeds, run in order:
--   1. homemakers_single_setup.sql
--   2. homemakers_rls_hardening.sql
--   3. homemakers_project_workspace.sql
--   4. homemakers_pro_leads.sql
--   5. homemakers_project_intelligence.sql
--   6. homemakers_careers.sql
-- The base setup is fail-closed, so an interrupted rebuild does not expose data.
-- =============================================================================

begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

-- Never remove storage metadata with live objects. Doing so through SQL can
-- orphan the physical files managed by the Storage service.
do $$
begin
  if exists (
    select 1
    from storage.objects
    where bucket_id in ('project-v0', 'portfolio-media', 'project-documents')
  ) then
    raise exception 'HomeMakers storage buckets are not empty; delete objects through Storage Admin first';
  end if;
end;
$$;

-- These triggers reference public functions/tables and must be removed first.
drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_auth_user_email_updated on auth.users;

-- This Supabase project is dedicated to HomeMakers. Rebuild storage access from
-- an empty policy set so no unknown permissive policy can survive the reset.
do $$
declare
  policy_row record;
begin
  for policy_row in
    select tablename, policyname
    from pg_policies
    where schemaname = 'storage'
  loop
    execute format(
      'drop policy if exists %I on storage.%I',
      policy_row.policyname,
      policy_row.tablename
    );
  end loop;
end;
$$;

drop view if exists public.pro_lead_opportunities cascade;
drop view if exists public.published_portfolios cascade;

drop table if exists
  public.career_applications,
  public.career_jobs,
  public.career_admins,
  public.project_team_members,
  public.project_payments,
  public.project_agent_actions,
  public.project_material_items,
  public.portfolio_reports,
  public.blocked_portfolios,
  public.ai_usage_daily,
  public.billing_webhook_events,
  public.user_entitlements,
  public.billing_orders,
  public.project_documents,
  public.project_messages,
  public.project_tasks,
  public.project_stages,
  public.project_v0_packs,
  public.project_ai_runs,
  public.project_briefs,
  public.project_professionals,
  public.projects,
  public.portfolios,
  public.project_lead_responses,
  public.user_profiles
cascade;

drop function if exists public.launch_schema_ready() cascade;
drop function if exists public.project_intelligence_ready() cascade;
drop function if exists public.project_task_progress_trigger() cascade;
drop function if exists public.recalculate_project_stage_progress(uuid, uuid) cascade;
drop function if exists public.activate_billing_order(uuid, text, text) cascade;
drop function if exists public.quarantine_reported_portfolio() cascade;
drop function if exists public.consume_ai_daily_quota(uuid, text, integer) cascade;
drop function if exists public.portfolio_media_is_published(text) cascade;
drop function if exists public.portfolio_media_object_name(text) cascade;
drop function if exists public.enforce_portfolio_moderation() cascade;
drop function if exists public.project_owned_by_user(uuid) cascade;
drop function if exists public.get_my_session() cascade;
drop function if exists public.handle_user_email_updated() cascade;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.set_updated_at() cascade;
drop function if exists public.can_respond_to_project(uuid, text) cascade;
drop function if exists public.careers_is_admin() cascade;

commit;
