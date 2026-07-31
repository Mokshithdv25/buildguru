-- BuildGuru launch workspace: checklist progress, team, documents, and payment ledger.
-- Run after buildguru_single_setup.sql and buildguru_rls_hardening.sql.

begin;

create table if not exists public.project_team_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  role text not null,
  email text,
  phone text,
  status text not null default 'active' check (status in ('invited', 'active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_payments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  category text not null default 'other' check (category in ('professional', 'contractor', 'material', 'permit', 'other')),
  amount_inr numeric not null check (amount_inr >= 0),
  status text not null default 'planned' check (status in ('planned', 'due', 'paid', 'cancelled')),
  due_date date,
  paid_at timestamptz,
  reference text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.project_documents add column if not exists storage_path text;
alter table public.project_documents add column if not exists uploaded_by_user_id uuid references auth.users(id) on delete set null;

create index if not exists idx_project_team_members_project on public.project_team_members(project_id, created_at);
create index if not exists idx_project_payments_project on public.project_payments(project_id, created_at desc);
create index if not exists idx_project_documents_project_created on public.project_documents(project_id, created_at desc);

drop trigger if exists trg_project_team_members_updated_at on public.project_team_members;
create trigger trg_project_team_members_updated_at before update on public.project_team_members
for each row execute function public.set_updated_at();

drop trigger if exists trg_project_payments_updated_at on public.project_payments;
create trigger trg_project_payments_updated_at before update on public.project_payments
for each row execute function public.set_updated_at();

alter table public.project_team_members enable row level security;
alter table public.project_payments enable row level security;

revoke all on public.project_team_members from public, anon, authenticated;
revoke all on public.project_payments from public, anon, authenticated;
grant select, insert, update, delete on public.project_team_members to authenticated;
grant select, insert, update, delete on public.project_payments to authenticated;
grant all on public.project_team_members to service_role;
grant all on public.project_payments to service_role;

drop policy if exists "project_team_members_select_own" on public.project_team_members;
create policy "project_team_members_select_own" on public.project_team_members for select to authenticated
using (public.project_owned_by_user(project_id));
drop policy if exists "project_team_members_insert_own" on public.project_team_members;
create policy "project_team_members_insert_own" on public.project_team_members for insert to authenticated
with check (public.project_owned_by_user(project_id));
drop policy if exists "project_team_members_update_own" on public.project_team_members;
create policy "project_team_members_update_own" on public.project_team_members for update to authenticated
using (public.project_owned_by_user(project_id)) with check (public.project_owned_by_user(project_id));
drop policy if exists "project_team_members_delete_own" on public.project_team_members;
create policy "project_team_members_delete_own" on public.project_team_members for delete to authenticated
using (public.project_owned_by_user(project_id));

drop policy if exists "project_payments_select_own" on public.project_payments;
create policy "project_payments_select_own" on public.project_payments for select to authenticated
using (public.project_owned_by_user(project_id));
drop policy if exists "project_payments_insert_own" on public.project_payments;
create policy "project_payments_insert_own" on public.project_payments for insert to authenticated
with check (public.project_owned_by_user(project_id));
drop policy if exists "project_payments_update_own" on public.project_payments;
create policy "project_payments_update_own" on public.project_payments for update to authenticated
using (public.project_owned_by_user(project_id)) with check (public.project_owned_by_user(project_id));
drop policy if exists "project_payments_delete_own" on public.project_payments;
create policy "project_payments_delete_own" on public.project_payments for delete to authenticated
using (public.project_owned_by_user(project_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('project-documents', 'project-documents', false, 15728640,
  array['application/pdf','image/jpeg','image/png','image/webp','text/plain','text/csv',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "project_documents_storage_select_own" on storage.objects;
create policy "project_documents_storage_select_own" on storage.objects for select to authenticated
using (bucket_id = 'project-documents' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "project_documents_storage_insert_own" on storage.objects;
create policy "project_documents_storage_insert_own" on storage.objects for insert to authenticated
with check (bucket_id = 'project-documents' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "project_documents_storage_update_own" on storage.objects;
create policy "project_documents_storage_update_own" on storage.objects for update to authenticated
using (bucket_id = 'project-documents' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'project-documents' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "project_documents_storage_delete_own" on storage.objects;
create policy "project_documents_storage_delete_own" on storage.objects for delete to authenticated
using (bucket_id = 'project-documents' and (storage.foldername(name))[1] = auth.uid()::text);

create or replace function public.recalculate_project_stage_progress(target_stage uuid, target_project uuid)
returns void language plpgsql security definer set search_path = public as $$
declare total_tasks integer; done_tasks integer; calculated integer; current_status text;
begin
  if target_stage is null then return; end if;
  select count(*), count(*) filter (where status = 'done') into total_tasks, done_tasks
  from public.project_tasks where project_id = target_project and stage_id = target_stage;
  if total_tasks = 0 then
    update public.project_stages
    set progress_percent = 0,
        status = case when status = 'blocked' then 'blocked' else 'upcoming' end
    where id = target_stage and project_id = target_project;
    return;
  end if;
  calculated := round((done_tasks::numeric / total_tasks::numeric) * 100);
  select status into current_status from public.project_stages where id = target_stage and project_id = target_project;
  update public.project_stages set
    progress_percent = calculated,
    status = case
      when current_status = 'blocked' then 'blocked'
      when calculated = 100 then 'done'
      when calculated > 0 or current_status = 'in_progress' then 'in_progress'
      else 'upcoming'
    end
  where id = target_stage and project_id = target_project;
end;
$$;

create or replace function public.project_task_progress_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  target_project uuid;
  old_project uuid;
  total_tasks integer;
  done_tasks integer;
  current_project_status text;
begin
  if tg_op = 'DELETE' then
    target_project := old.project_id;
    perform public.recalculate_project_stage_progress(old.stage_id, old.project_id);
  else
    target_project := new.project_id;
    perform public.recalculate_project_stage_progress(new.stage_id, new.project_id);
  end if;

  if tg_op = 'UPDATE' and (
    old.project_id is distinct from new.project_id
    or old.stage_id is distinct from new.stage_id
  ) then
    old_project := old.project_id;
    perform public.recalculate_project_stage_progress(old.stage_id, old.project_id);
  end if;

  select count(*), count(*) filter (where status = 'done') into total_tasks, done_tasks
  from public.project_tasks where project_id = target_project;
  select status into current_project_status from public.projects where id = target_project;
  if current_project_status not in ('archived', 'on_hold') then
    update public.projects set
      status = case when total_tasks > 0 and total_tasks = done_tasks then 'completed' else 'active' end,
      last_active_at = now()
    where id = target_project;
  end if;

  if old_project is not null and old_project is distinct from target_project then
    select count(*), count(*) filter (where status = 'done') into total_tasks, done_tasks
    from public.project_tasks where project_id = old_project;
    select status into current_project_status from public.projects where id = old_project;
    if current_project_status not in ('archived', 'on_hold') then
      update public.projects set
        status = case when total_tasks > 0 and total_tasks = done_tasks then 'completed' else 'active' end,
        last_active_at = now()
      where id = old_project;
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.recalculate_project_stage_progress(uuid, uuid) from public, anon, authenticated;
revoke all on function public.project_task_progress_trigger() from public, anon, authenticated;
drop trigger if exists trg_project_task_progress on public.project_tasks;
create trigger trg_project_task_progress after insert or update or delete on public.project_tasks
for each row execute function public.project_task_progress_trigger();

-- Render readiness calls this RPC. It validates the complete schema contract,
-- deterministic grants, required triggers/constraints, private buckets, and the
-- absence of legacy anonymous policies.
create or replace function public.launch_schema_ready()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $hm_ready$
declare
  relation_name text;
  relation_oid regclass;
  rls_on boolean;
  matching_count integer;
begin
  foreach relation_name in array array[
    'public.user_profiles',
    'public.portfolios',
    'public.portfolio_reports',
    'public.blocked_portfolios',
    'public.projects',
    'public.project_briefs',
    'public.project_ai_runs',
    'public.ai_usage_daily',
    'public.project_v0_packs',
    'public.project_stages',
    'public.project_tasks',
    'public.project_messages',
    'public.project_documents',
    'public.project_team_members',
    'public.project_payments',
    'public.billing_orders',
    'public.user_entitlements',
    'public.billing_webhook_events'
  ]
  loop
    relation_oid := to_regclass(relation_name);
    if relation_oid is null then
      return false;
    end if;

    select c.relrowsecurity into rls_on
    from pg_class c
    where c.oid = relation_oid;

    if rls_on is not true
       or has_table_privilege('anon', relation_name, 'SELECT')
       or has_table_privilege('anon', relation_name, 'INSERT')
       or has_table_privilege('anon', relation_name, 'UPDATE')
       or has_table_privilege('anon', relation_name, 'DELETE') then
      return false;
    end if;
  end loop;

  if to_regclass('public.published_portfolios') is null
     or to_regclass('public.project_professionals') is not null
     or to_regprocedure('public.get_my_session()') is null
     or to_regprocedure('public.activate_billing_order(uuid,text,text)') is null
     or to_regprocedure('public.consume_ai_daily_quota(uuid,text,integer)') is null
     or to_regprocedure('public.project_task_progress_trigger()') is null then
    return false;
  end if;

  select count(*) into matching_count
  from pg_attribute
  where attrelid in ('public.portfolios'::regclass, 'public.projects'::regclass)
    and attname = 'owner_user_id'
    and attnotnull
    and not attisdropped;
  if matching_count <> 2 then
    return false;
  end if;

  select count(*) into matching_count
  from storage.buckets
  where id in ('project-v0', 'portfolio-media', 'project-documents')
    and public is false;
  if matching_count <> 3 then
    return false;
  end if;

  select count(*) into matching_count
  from pg_policies
  where schemaname = 'storage'
    and tablename = 'objects'
    and policyname in (
      'project_v0_select_own',
      'project_v0_upload_own',
      'project_v0_update_own',
      'project_v0_delete_own',
      'portfolio_media_select_own',
      'portfolio_media_select_published',
      'portfolio_media_upload_own',
      'portfolio_media_update_own',
      'portfolio_media_delete_own',
      'project_documents_storage_select_own',
      'project_documents_storage_insert_own',
      'project_documents_storage_update_own',
      'project_documents_storage_delete_own'
    );
  if matching_count <> 13 then
    return false;
  end if;

  return true;
end;
$hm_ready$;

revoke all on function public.launch_schema_ready() from public, anon, authenticated;
grant execute on function public.launch_schema_ready() to service_role;

commit;
