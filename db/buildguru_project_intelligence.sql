-- BuildGuru — project intelligence, material takeoff, and approval queue
-- Run after buildguru_project_workspace.sql and buildguru_pro_leads.sql.

begin;

create table if not exists public.project_material_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  category text not null,
  item_name text not null,
  quantity numeric not null default 0 check (quantity >= 0),
  unit text not null default 'unit',
  preferred_brand text,
  status text not null default 'suggested' check (status in (
    'suggested', 'approved', 'ordered', 'received', 'removed'
  )),
  notes text check (char_length(notes) <= 1000),
  source_artifact text not null default 'project_brief',
  seed_key text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, seed_key)
);

create table if not exists public.project_agent_actions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  action_type text not null check (action_type in (
    'follow_up', 'contractor_shortlist', 'material_plan', 'task_suggestion', 'document_review'
  )),
  title text not null,
  rationale text,
  payload_json jsonb not null default '{}'::jsonb,
  status text not null default 'suggested' check (status in (
    'suggested', 'approved', 'rejected', 'executed'
  )),
  approved_by_user_id uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  executed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_project_material_items_project
  on public.project_material_items(project_id, status, sort_order);
create index if not exists idx_project_agent_actions_project
  on public.project_agent_actions(project_id, status, created_at desc);

drop trigger if exists trg_project_material_items_updated_at on public.project_material_items;
create trigger trg_project_material_items_updated_at
  before update on public.project_material_items
  for each row execute function public.set_updated_at();

drop trigger if exists trg_project_agent_actions_updated_at on public.project_agent_actions;
create trigger trg_project_agent_actions_updated_at
  before update on public.project_agent_actions
  for each row execute function public.set_updated_at();

alter table public.project_material_items enable row level security;
alter table public.project_agent_actions enable row level security;

revoke all on public.project_material_items from public, anon, authenticated;
revoke all on public.project_agent_actions from public, anon, authenticated;
grant select, insert, update, delete on public.project_material_items to authenticated;
grant select, insert, update, delete on public.project_agent_actions to authenticated;
grant all on public.project_material_items to service_role;
grant all on public.project_agent_actions to service_role;

drop policy if exists "project_material_items_select_own" on public.project_material_items;
create policy "project_material_items_select_own" on public.project_material_items
  for select to authenticated using (public.project_owned_by_user(project_id));
drop policy if exists "project_material_items_insert_own" on public.project_material_items;
create policy "project_material_items_insert_own" on public.project_material_items
  for insert to authenticated with check (public.project_owned_by_user(project_id));
drop policy if exists "project_material_items_update_own" on public.project_material_items;
create policy "project_material_items_update_own" on public.project_material_items
  for update to authenticated using (public.project_owned_by_user(project_id))
  with check (public.project_owned_by_user(project_id));
drop policy if exists "project_material_items_delete_own" on public.project_material_items;
create policy "project_material_items_delete_own" on public.project_material_items
  for delete to authenticated using (public.project_owned_by_user(project_id));

drop policy if exists "project_agent_actions_select_own" on public.project_agent_actions;
create policy "project_agent_actions_select_own" on public.project_agent_actions
  for select to authenticated using (public.project_owned_by_user(project_id));
drop policy if exists "project_agent_actions_insert_own" on public.project_agent_actions;
create policy "project_agent_actions_insert_own" on public.project_agent_actions
  for insert to authenticated with check (
    public.project_owned_by_user(project_id)
    and (approved_by_user_id is null or approved_by_user_id = auth.uid())
  );
drop policy if exists "project_agent_actions_update_own" on public.project_agent_actions;
create policy "project_agent_actions_update_own" on public.project_agent_actions
  for update to authenticated using (public.project_owned_by_user(project_id))
  with check (
    public.project_owned_by_user(project_id)
    and (approved_by_user_id is null or approved_by_user_id = auth.uid())
  );
drop policy if exists "project_agent_actions_delete_own" on public.project_agent_actions;
create policy "project_agent_actions_delete_own" on public.project_agent_actions
  for delete to authenticated using (public.project_owned_by_user(project_id));

create or replace function public.project_intelligence_ready()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    to_regclass('public.project_material_items') is not null
    and to_regclass('public.project_agent_actions') is not null
    and coalesce((select relrowsecurity from pg_class where oid = 'public.project_material_items'::regclass), false)
    and coalesce((select relrowsecurity from pg_class where oid = 'public.project_agent_actions'::regclass), false)
    and not has_table_privilege('anon', 'public.project_material_items', 'SELECT')
    and not has_table_privilege('anon', 'public.project_agent_actions', 'SELECT');
$$;

revoke all on function public.project_intelligence_ready() from public, anon, authenticated;
grant execute on function public.project_intelligence_ready() to service_role;

commit;

-- Material quantities are an editable planning draft, not a structural BOQ.
-- Every approval or rejection is retained in project_agent_actions for audit.
