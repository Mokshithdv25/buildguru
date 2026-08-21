-- BuildGuru — verified low-risk production hardening
-- Applied to project aesavvlhpjickmnmyzzh on 2026-08-21.
-- Safe to rerun after the feature migrations; it does not rewrite RLS policies,
-- replace API views, drop data, or remove existing indexes.

begin;

-- Trigger functions do not need application-schema lookup. Pin their search
-- path and prevent direct API execution without affecting trigger execution.
alter function public.set_updated_at() set search_path = pg_catalog;
alter function public.touch_last_active_at() set search_path = pg_catalog;
revoke all on function public.touch_last_active_at()
  from public, anon, authenticated, service_role;

-- Event-trigger execution does not depend on client EXECUTE grants.
revoke all on function public.rls_auto_enable()
  from public, anon, authenticated, service_role;

-- careers_is_admin is an authenticated-only RPC and policy helper.
revoke all on function public.careers_is_admin() from anon;

-- Cover every application foreign key reported by the production advisor.
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

commit;
