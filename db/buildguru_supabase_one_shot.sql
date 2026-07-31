-- BuildGuru — ONE-SHOT SUPABASE PRODUCTION UPGRADE
-- Paste this ENTIRE file into Supabase SQL Editor. Do not paste only a selection.

begin;
set local lock_timeout = '15s';
set local statement_timeout = '180s';

create schema if not exists buildguru_quarantine;
revoke all on schema buildguru_quarantine from public, anon, authenticated;
grant usage on schema buildguru_quarantine to service_role;

-- This Supabase project is dedicated to BuildGuru. Rebuild the Storage policy
-- set deterministically so a legacy permissive policy cannot survive.
do $hm_storage_cleanup$
declare
  policy_row record;
begin
  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
  loop
    execute format('drop policy if exists %I on storage.objects', policy_row.policyname);
  end loop;
end;
$hm_storage_cleanup$;

do $hm_migrate$
declare
  child_table text;
  backup_table text;
begin
  if to_regclass('public.projects') is not null then
    foreach child_table in array array[
      'project_briefs', 'project_ai_runs', 'project_v0_packs',
      'project_stages', 'project_tasks', 'project_messages',
      'project_documents', 'project_team_members', 'project_payments'
    ]
    loop
      if to_regclass('public.' || child_table) is not null then
        backup_table := 'orphan_' || child_table;
        execute format(
          'create table if not exists buildguru_quarantine.%I (like public.%I including all)',
          backup_table, child_table
        );
        execute format(
          'insert into buildguru_quarantine.%I
           select child.* from public.%I child
           join public.projects project on project.id = child.project_id
           where project.owner_user_id is null on conflict do nothing',
          backup_table, child_table
        );
      end if;
    end loop;

    create table if not exists buildguru_quarantine.orphan_projects
      (like public.projects including all);
    insert into buildguru_quarantine.orphan_projects
      select * from public.projects where owner_user_id is null
      on conflict do nothing;
    delete from public.projects where owner_user_id is null;
  end if;

  if to_regclass('public.portfolios') is not null then
    if to_regclass('public.portfolio_reports') is not null then
      create table if not exists buildguru_quarantine.orphan_portfolio_reports
        (like public.portfolio_reports including all);
      insert into buildguru_quarantine.orphan_portfolio_reports
        select report.* from public.portfolio_reports report
        join public.portfolios portfolio on portfolio.id = report.portfolio_id
        where portfolio.owner_user_id is null on conflict do nothing;
    end if;

    if to_regclass('public.blocked_portfolios') is not null then
      create table if not exists buildguru_quarantine.orphan_blocked_portfolios
        (like public.blocked_portfolios including all);
      insert into buildguru_quarantine.orphan_blocked_portfolios
        select blocked.* from public.blocked_portfolios blocked
        join public.portfolios portfolio on portfolio.id = blocked.portfolio_id
        where portfolio.owner_user_id is null on conflict do nothing;
    end if;

    create table if not exists buildguru_quarantine.orphan_portfolios
      (like public.portfolios including all);
    insert into buildguru_quarantine.orphan_portfolios
      select * from public.portfolios where owner_user_id is null
      on conflict do nothing;
    delete from public.portfolios where owner_user_id is null;

    update public.portfolios set specialties = '[]'::jsonb
      where specialties is null or jsonb_typeof(specialties) <> 'array';
    update public.portfolios set photos = '[]'::jsonb
      where photos is null or jsonb_typeof(photos) <> 'array';
  end if;

  if to_regclass('public.project_stages') is not null then
    if to_regclass('public.project_tasks') is not null then
      update public.project_tasks child set stage_id = null
      where stage_id is not null and not exists (
        select 1 from public.project_stages stage
        where stage.id = child.stage_id and stage.project_id = child.project_id
      );
    end if;
    if to_regclass('public.project_messages') is not null then
      update public.project_messages child set stage_id = null
      where stage_id is not null and not exists (
        select 1 from public.project_stages stage
        where stage.id = child.stage_id and stage.project_id = child.project_id
      );
    end if;
    if to_regclass('public.project_documents') is not null then
      update public.project_documents child set stage_id = null
      where stage_id is not null and not exists (
        select 1 from public.project_stages stage
        where stage.id = child.stage_id and stage.project_id = child.project_id
      );
    end if;
  end if;

  if to_regclass('public.project_professionals') is not null then
    create table if not exists buildguru_quarantine.legacy_project_professionals
      (like public.project_professionals including all);
    insert into buildguru_quarantine.legacy_project_professionals
      select * from public.project_professionals on conflict do nothing;
    drop table public.project_professionals cascade;
  end if;
end;
$hm_migrate$;

revoke all on all tables in schema buildguru_quarantine from public, anon, authenticated;
grant select on all tables in schema buildguru_quarantine to service_role;


-- =============================================================================
-- BuildGuru — FAIL-CLOSED BASE SCHEMA
-- Run on an empty/reset Supabase project, then run buildguru_rls_hardening.sql
-- and buildguru_project_workspace.sql. This bootstrap is deliberately safe if
-- the sequence stops early: private tables have RLS enabled, anonymous grants
-- are revoked, storage buckets are private, and no broad demo policies exist.
--
-- Gives every signed-in user a persistent row: email + role + name + phone + city
-- Projects, v0 packs, portfolios, and storage for the React app.
--
-- It is idempotent for the canonical schema, but it is not a legacy migration.
-- Use buildguru_production_reset.sql first when intentionally discarding an
-- older schema, and never use the obsolete open-demo SQL attachment.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 1) USER SESSION (email + role + profile — source of truth for the app)
-- -----------------------------------------------------------------------------
create table if not exists public.user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  role text not null default 'homeowner' check (role in ('homeowner', 'pro')),
  full_name text,
  phone text,
  city text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_profiles add column if not exists email text;

create index if not exists idx_user_profiles_role on public.user_profiles (role);
create index if not exists idx_user_profiles_email on public.user_profiles (email);

drop trigger if exists trg_user_profiles_updated_at on public.user_profiles;
create trigger trg_user_profiles_updated_at
  before update on public.user_profiles
  for each row execute function public.set_updated_at();

-- Auto-create / refresh profile when someone signs up (Auth → Postgres)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta_role text;
begin
  meta_role := coalesce(
    new.raw_user_meta_data ->> 'role',
    new.raw_app_meta_data ->> 'role',
    'homeowner'
  );
  if meta_role not in ('homeowner', 'pro') then
    meta_role := 'homeowner';
  end if;

  insert into public.user_profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      ''
    ),
    meta_role
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(nullif(excluded.full_name, ''), user_profiles.full_name),
    updated_at = now();

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep email in sync if user changes it in Auth
create or replace function public.handle_user_email_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.user_profiles
  set email = new.email, updated_at = now()
  where id = new.id;
  return new;
end;
$$;

revoke all on function public.handle_user_email_updated() from public, anon, authenticated;

drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row execute function public.handle_user_email_updated();

-- Backfill profiles for users that already exist in Auth
insert into public.user_profiles (id, email, full_name, role)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', ''),
  case
    when coalesce(u.raw_user_meta_data ->> 'role', u.raw_app_meta_data ->> 'role') = 'pro' then 'pro'
    else 'homeowner'
  end
from auth.users u
on conflict (id) do update set
  email = excluded.email,
  full_name = coalesce(nullif(excluded.full_name, ''), user_profiles.full_name),
  updated_at = now();

alter table public.user_profiles enable row level security;

revoke all on public.user_profiles from public, anon, authenticated;
grant select, insert, update on public.user_profiles to authenticated;
grant all on public.user_profiles to service_role;

drop policy if exists "user_profiles_select_own" on public.user_profiles;
create policy "user_profiles_select_own" on public.user_profiles
  for select to authenticated using (auth.uid() = id);

drop policy if exists "user_profiles_insert_own" on public.user_profiles;
create policy "user_profiles_insert_own" on public.user_profiles
  for insert to authenticated with check (auth.uid() = id);

drop policy if exists "user_profiles_update_own" on public.user_profiles;
create policy "user_profiles_update_own" on public.user_profiles
  for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

-- One query the app (or you) can use: returns role + email + profile for current user
create or replace function public.get_my_session()
returns table (
  user_id uuid,
  email text,
  role text,
  full_name text,
  phone text,
  city text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    coalesce(p.email, u.email),
    p.role,
    p.full_name,
    p.phone,
    p.city
  from public.user_profiles p
  inner join auth.users u on u.id = p.id
  where p.id = auth.uid();
$$;

revoke all on function public.get_my_session() from public, anon, authenticated;
grant execute on function public.get_my_session() to authenticated;

-- -----------------------------------------------------------------------------
-- 2) PORTFOLIOS (pros)
-- -----------------------------------------------------------------------------
create table if not exists public.portfolios (
  id text primary key,
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  craft text not null,
  full_name text,
  business_name text,
  city text,
  address text,
  portfolio_theme text,
  portfolio_layout text,
  years_experience text,
  phone text,
  email text,
  license_number text,
  short_bio text,
  specialties jsonb not null default '[]'::jsonb
    check (jsonb_typeof(specialties) = 'array'),
  photos jsonb not null default '[]'::jsonb
    check (jsonb_typeof(photos) = 'array'),
  cover_photo text,
  profile_photo text,
  profile_strength integer not null default 15,
  step integer not null default 1,
  published boolean not null default false,
  slug text unique,
  status text not null default 'draft' check (status in ('draft', 'published', 'abandoned')),
  last_active_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.portfolios add column if not exists owner_user_id uuid references auth.users (id) on delete cascade;
alter table public.portfolios drop constraint if exists portfolios_owner_user_id_fkey;
alter table public.portfolios
  add constraint portfolios_owner_user_id_fkey
  foreign key (owner_user_id) references auth.users (id) on delete cascade;
alter table public.portfolios alter column owner_user_id set not null;
-- Wizard fields added after the initial schema: street address (details step) and
-- look & feel (theme step). Without these columns Supabase rejects the whole write,
-- so details and theme silently fail to persist.
alter table public.portfolios add column if not exists address text;
alter table public.portfolios add column if not exists portfolio_theme text;
alter table public.portfolios add column if not exists portfolio_layout text;

alter table public.portfolios drop constraint if exists portfolios_specialties_array_check;
alter table public.portfolios
  add constraint portfolios_specialties_array_check
  check (jsonb_typeof(specialties) = 'array');
alter table public.portfolios drop constraint if exists portfolios_photos_array_check;
alter table public.portfolios
  add constraint portfolios_photos_array_check
  check (jsonb_typeof(photos) = 'array');

create index if not exists idx_portfolios_published on public.portfolios (published);
create index if not exists idx_portfolios_owner_user on public.portfolios (owner_user_id);

drop trigger if exists trg_portfolios_updated_at on public.portfolios;
create trigger trg_portfolios_updated_at
  before update on public.portfolios
  for each row execute function public.set_updated_at();

-- Fail closed until the hardening script installs owner-scoped policies and the
-- safe published_portfolios projection.
alter table public.portfolios enable row level security;
revoke all on public.portfolios from public, anon, authenticated;
grant all on public.portfolios to service_role;

-- Remove only obsolete broad policies. Existing production owner policies are
-- intentionally preserved if this idempotent bootstrap is re-run.
drop policy if exists "public_read_published_portfolios" on public.portfolios;
drop policy if exists "anon_read_portfolios_mvp" on public.portfolios;
drop policy if exists "anon_insert_portfolios_mvp" on public.portfolios;
drop policy if exists "anon_update_portfolios_mvp" on public.portfolios;

-- -----------------------------------------------------------------------------
-- 3) HOMEOWNER PROJECTS + BRIEFS + AI + V0 PACK
-- -----------------------------------------------------------------------------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  title text,
  flow_type text not null check (flow_type in ('new_home', 'remodel')),
  status text not null default 'draft' check (status in (
    'draft', 'review', 'planning', 'active', 'on_hold', 'completed', 'archived'
  )),
  source text,
  location text,
  city text,
  state text,
  budget_min numeric,
  budget_max numeric,
  timeline_start text,
  timeline_completion text,
  last_active_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.projects add column if not exists source text;
alter table public.projects add column if not exists owner_user_id uuid references auth.users (id) on delete cascade;
alter table public.projects drop constraint if exists projects_owner_user_id_fkey;
alter table public.projects
  add constraint projects_owner_user_id_fkey
  foreign key (owner_user_id) references auth.users (id) on delete cascade;
alter table public.projects alter column owner_user_id set not null;
alter table public.projects add column if not exists last_active_at timestamptz not null default now();

create index if not exists idx_projects_owner on public.projects (owner_user_id);

drop trigger if exists trg_projects_updated_at on public.projects;
create trigger trg_projects_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

create table if not exists public.project_briefs (
  project_id uuid primary key references public.projects (id) on delete cascade,
  brief_version integer not null default 1,
  brief_json jsonb not null default '{}'::jsonb,
  dream_vision text,
  inspirations_json jsonb not null default '[]'::jsonb,
  last_completed_step integer,
  flow_step text,
  flow_status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.project_briefs add column if not exists flow_step text;

alter table public.project_briefs drop constraint if exists project_briefs_flow_status_check;
alter table public.project_briefs
  add constraint project_briefs_flow_status_check
  check (flow_status in ('draft', 'v0_ready', 'open_for_quotes', 'submitted', 'abandoned'));

drop trigger if exists trg_project_briefs_updated_at on public.project_briefs;
create trigger trg_project_briefs_updated_at
  before update on public.project_briefs
  for each row execute function public.set_updated_at();

create table if not exists public.project_ai_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  run_type text not null check (run_type in ('v0_images', 'estimate_plan')),
  provider text,
  status text not null default 'completed' check (status in ('queued', 'running', 'completed', 'failed')),
  input_json jsonb,
  output_json jsonb,
  error_text text,
  created_at timestamptz not null default now()
);

create index if not exists idx_project_ai_runs_project on public.project_ai_runs (project_id);

create table if not exists public.project_v0_packs (
  project_id uuid primary key references public.projects (id) on delete cascade,
  images_json jsonb,
  floor_plans_json jsonb,
  estimate_json jsonb,
  is_mock boolean not null default false,
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_project_v0_packs_generated_at
  on public.project_v0_packs (generated_at desc);

drop trigger if exists trg_project_v0_packs_updated_at on public.project_v0_packs;
create trigger trg_project_v0_packs_updated_at
  before update on public.project_v0_packs
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 4) PROJECT MANAGEMENT (stages, tasks, messages, documents)
-- -----------------------------------------------------------------------------
create table if not exists public.project_stages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  status text not null default 'upcoming' check (status in ('upcoming', 'in_progress', 'blocked', 'done')),
  progress_percent integer not null default 0 check (progress_percent between 0 and 100),
  start_date date,
  due_date date,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'project_stages_id_project_key'
      and conrelid = 'public.project_stages'::regclass
  ) then
    alter table public.project_stages
      add constraint project_stages_id_project_key unique (id, project_id);
  end if;
end;
$$;

create table if not exists public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  stage_id uuid references public.project_stages (id) on delete set null,
  title text not null,
  description text,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'blocked', 'done')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  assignee_portfolio_id text references public.portfolios (id) on delete set null,
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  stage_id uuid references public.project_stages (id) on delete set null,
  author_portfolio_id text references public.portfolios (id) on delete set null,
  author_role text,
  message text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.project_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  stage_id uuid references public.project_stages (id) on delete set null,
  uploaded_by_portfolio_id text references public.portfolios (id) on delete set null,
  kind text default 'file',
  file_name text not null,
  file_url text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

create index if not exists idx_project_stages_project_sort
  on public.project_stages (project_id, sort_order);
create index if not exists idx_project_tasks_project_created
  on public.project_tasks (project_id, created_at desc);
create index if not exists idx_project_tasks_stage
  on public.project_tasks (stage_id);
create index if not exists idx_project_messages_project_created
  on public.project_messages (project_id, created_at desc);

-- Prevent a task, message, or document from pointing at a stage that belongs to
-- another project. The single-column FK above still nulls stage_id on deletion;
-- these composite FKs enforce tenant consistency while the stage exists.
alter table public.project_tasks
  drop constraint if exists project_tasks_stage_project_fk;
alter table public.project_tasks
  add constraint project_tasks_stage_project_fk
  foreign key (stage_id, project_id)
  references public.project_stages (id, project_id);

alter table public.project_messages
  drop constraint if exists project_messages_stage_project_fk;
alter table public.project_messages
  add constraint project_messages_stage_project_fk
  foreign key (stage_id, project_id)
  references public.project_stages (id, project_id);

alter table public.project_documents
  drop constraint if exists project_documents_stage_project_fk;
alter table public.project_documents
  add constraint project_documents_stage_project_fk
  foreign key (stage_id, project_id)
  references public.project_stages (id, project_id);

drop trigger if exists trg_project_tasks_updated_at on public.project_tasks;
create trigger trg_project_tasks_updated_at
  before update on public.project_tasks
  for each row execute function public.set_updated_at();

-- Fail closed until buildguru_rls_hardening.sql installs owner-scoped policies.
alter table public.projects enable row level security;
alter table public.project_briefs enable row level security;
alter table public.project_stages enable row level security;
alter table public.project_tasks enable row level security;
alter table public.project_messages enable row level security;
alter table public.project_documents enable row level security;
alter table public.project_v0_packs enable row level security;
alter table public.project_ai_runs enable row level security;

revoke all on public.projects from public, anon, authenticated;
revoke all on public.project_briefs from public, anon, authenticated;
revoke all on public.project_stages from public, anon, authenticated;
revoke all on public.project_tasks from public, anon, authenticated;
revoke all on public.project_messages from public, anon, authenticated;
revoke all on public.project_documents from public, anon, authenticated;
revoke all on public.project_v0_packs from public, anon, authenticated;
revoke all on public.project_ai_runs from public, anon, authenticated;

grant all on public.projects to service_role;
grant all on public.project_briefs to service_role;
grant all on public.project_stages to service_role;
grant all on public.project_tasks to service_role;
grant all on public.project_messages to service_role;
grant all on public.project_documents to service_role;
grant all on public.project_v0_packs to service_role;
grant all on public.project_ai_runs to service_role;

-- -----------------------------------------------------------------------------
-- 5) STORAGE (v0 images + portfolio photos)
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('project-v0', 'project-v0', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('portfolio-media', 'portfolio-media', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Remove obsolete broad storage policies. Hardened owner policies are preserved
-- on idempotent re-runs and are installed by the hardening script on fresh DBs.
drop policy if exists "demo_storage_insert" on storage.objects;
drop policy if exists "demo_storage_update" on storage.objects;
drop policy if exists "project_v0_select_public" on storage.objects;
drop policy if exists "portfolio_media_select_public" on storage.objects;

-- -----------------------------------------------------------------------------
-- 6) VERIFY (run while signed in, or replace auth.uid() with a real uuid)
-- -----------------------------------------------------------------------------
-- select * from public.get_my_session();
-- select id, email, role, full_name from public.user_profiles order by updated_at desc limit 10;

-- =============================================================================
-- BuildGuru — RLS hardening (run once in Supabase SQL Editor after single_setup)
-- Owner-scoped projects; portfolios writable only by owner; published pros public.
-- =============================================================================

-- The app marks a posted brief as open_for_quotes. Earlier schemas rejected it,
-- which made the final project-save step fail after a successful v0 generation.
alter table public.project_briefs
  drop constraint if exists project_briefs_flow_status_check;
alter table public.project_briefs
  add constraint project_briefs_flow_status_check
  check (flow_status in ('draft', 'v0_ready', 'open_for_quotes', 'submitted', 'abandoned'));

-- Helper: current user owns the project row
create or replace function public.project_owned_by_user(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = p_project_id
      and p.owner_user_id is not null
      and p.owner_user_id = auth.uid()
  );
$$;

revoke all on function public.project_owned_by_user(uuid) from public, anon, authenticated;
grant execute on function public.project_owned_by_user(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Portfolios — owners use the base table; public readers use a safe projection.
-- -----------------------------------------------------------------------------
alter table public.portfolios
  add column if not exists moderation_status text not null default 'pending';
alter table public.portfolios
  drop constraint if exists portfolios_moderation_status_check;
alter table public.portfolios
  add constraint portfolios_moderation_status_check
  check (moderation_status in ('pending', 'approved', 'rejected'));

drop trigger if exists trg_portfolio_moderation_insert on public.portfolios;
drop trigger if exists trg_portfolio_moderation_update on public.portfolios;
drop function if exists public.enforce_portfolio_moderation();

-- Owners self-publish immediately. Safety reports can still quarantine a live
-- portfolio by returning it to pending through quarantine_reported_portfolio().
update public.portfolios
set moderation_status = 'approved', updated_at = now()
where published = true and moderation_status = 'pending';

create index if not exists idx_portfolios_public_directory
  on public.portfolios (craft, city, updated_at desc)
  where published = true and moderation_status = 'approved';

alter table public.portfolios enable row level security;

drop policy if exists "anon_insert_portfolios_mvp" on public.portfolios;
drop policy if exists "anon_update_portfolios_mvp" on public.portfolios;
drop policy if exists "anon_read_portfolios_mvp" on public.portfolios;
drop policy if exists "public_read_published_portfolios" on public.portfolios;
drop policy if exists "portfolios_select_published" on public.portfolios;
drop policy if exists "portfolios_insert_own" on public.portfolios;
drop policy if exists "portfolios_update_own" on public.portfolios;

drop policy if exists "portfolio_select_own_or_published" on public.portfolios;
drop policy if exists "portfolio_select_own" on public.portfolios;
create policy "portfolio_select_own"
  on public.portfolios for select to authenticated
  using (owner_user_id = auth.uid());

drop policy if exists "portfolio_select_published_anon" on public.portfolios;

drop policy if exists "portfolio_insert_own" on public.portfolios;
create policy "portfolio_insert_own"
  on public.portfolios for insert to authenticated
  with check (owner_user_id = auth.uid());

drop policy if exists "portfolio_update_own" on public.portfolios;
create policy "portfolio_update_own"
  on public.portfolios for update to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists "portfolio_delete_own" on public.portfolios;
create policy "portfolio_delete_own"
  on public.portfolios for delete to authenticated
  using (owner_user_id = auth.uid());

-- Never expose owner ids, street address, contact details, or license numbers
-- through the public PostgREST surface. The view is read-only to API roles.
create or replace view public.published_portfolios
with (security_barrier = true)
as
select
  id,
  craft,
  full_name,
  business_name,
  city,
  years_experience,
  short_bio,
  specialties,
  photos,
  cover_photo,
  profile_photo,
  slug,
  profile_strength,
  portfolio_theme,
  portfolio_layout,
  updated_at
from public.portfolios
where published = true and moderation_status = 'approved';

revoke all on public.portfolios from public, anon, authenticated;
grant select, insert, update, delete on public.portfolios to authenticated;
grant all on public.portfolios to service_role;
revoke all on public.published_portfolios from public, anon, authenticated;
grant select on public.published_portfolios to anon, authenticated;

-- Durable provider-spend guard. The backend consumes one row atomically before
-- each real image-pack request; browsers cannot read or mutate usage counters.
create table if not exists public.ai_usage_daily (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null default ((now() at time zone 'utc')::date),
  usage_kind text not null check (usage_kind in ('image_pack')),
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date, usage_kind)
);

alter table public.ai_usage_daily enable row level security;
revoke all on public.ai_usage_daily from public, anon, authenticated;
grant select, insert, update, delete on public.ai_usage_daily to service_role;

create or replace function public.consume_ai_daily_quota(
  p_user_id uuid,
  p_usage_kind text,
  p_limit integer
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  consumed boolean := false;
begin
  if p_user_id is null or p_usage_kind <> 'image_pack' or p_limit < 1 then
    return false;
  end if;

  insert into public.ai_usage_daily as usage (
    user_id, usage_date, usage_kind, request_count, updated_at
  ) values (
    p_user_id, (now() at time zone 'utc')::date, p_usage_kind, 1, now()
  )
  on conflict (user_id, usage_date, usage_kind) do update
  set request_count = usage.request_count + 1,
      updated_at = now()
  where usage.request_count < p_limit
  returning true into consumed;

  return coalesce(consumed, false);
end;
$$;

revoke all on function public.consume_ai_daily_quota(uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.consume_ai_daily_quota(uuid, text, integer)
  to service_role;

-- Post-publication safeguards: reports and blocks remain available, and repeated
-- credible reports automatically quarantine a profile from public discovery.
-- visibility; signed-in visitors can report and block profiles in-app.
create table if not exists public.portfolio_reports (
  id uuid primary key default gen_random_uuid(),
  portfolio_id text not null references public.portfolios(id) on delete cascade,
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('spam', 'harassment', 'sexual_content', 'hate_or_violence', 'impersonation', 'other')),
  details text check (char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  unique (portfolio_id, reporter_user_id)
);

create table if not exists public.blocked_portfolios (
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_id text not null references public.portfolios(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, portfolio_id)
);

alter table public.portfolio_reports enable row level security;
alter table public.blocked_portfolios enable row level security;
revoke all on public.portfolio_reports from public, anon, authenticated;
revoke all on public.blocked_portfolios from public, anon, authenticated;
grant select, insert on public.portfolio_reports to authenticated;
grant select, insert, delete on public.blocked_portfolios to authenticated;
grant all on public.portfolio_reports to service_role;
grant all on public.blocked_portfolios to service_role;

drop policy if exists "portfolio_reports_insert_own" on public.portfolio_reports;
create policy "portfolio_reports_insert_own" on public.portfolio_reports
  for insert to authenticated with check (reporter_user_id = auth.uid());
drop policy if exists "portfolio_reports_select_own" on public.portfolio_reports;
create policy "portfolio_reports_select_own" on public.portfolio_reports
  for select to authenticated using (reporter_user_id = auth.uid());

drop policy if exists "blocked_portfolios_select_own" on public.blocked_portfolios;
create policy "blocked_portfolios_select_own" on public.blocked_portfolios
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "blocked_portfolios_insert_own" on public.blocked_portfolios;
create policy "blocked_portfolios_insert_own" on public.blocked_portfolios
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "blocked_portfolios_delete_own" on public.blocked_portfolios;
create policy "blocked_portfolios_delete_own" on public.blocked_portfolios
  for delete to authenticated using (user_id = auth.uid());

create or replace function public.quarantine_reported_portfolio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    select count(distinct r.reporter_user_id)
    from public.portfolio_reports r
    where r.portfolio_id = new.portfolio_id
      and r.status in ('open', 'reviewing')
  ) >= 3 then
    update public.portfolios
    set moderation_status = 'pending', updated_at = now()
    where id = new.portfolio_id;
  end if;
  return new;
end;
$$;

revoke all on function public.quarantine_reported_portfolio() from public, anon, authenticated;
drop trigger if exists trg_quarantine_reported_portfolio on public.portfolio_reports;
create trigger trg_quarantine_reported_portfolio
  after insert on public.portfolio_reports
  for each row execute function public.quarantine_reported_portfolio();

-- -----------------------------------------------------------------------------
-- Projects + children — enable owner-scoped RLS
-- -----------------------------------------------------------------------------
alter table public.projects enable row level security;
alter table public.project_briefs enable row level security;
alter table public.project_stages enable row level security;
alter table public.project_tasks enable row level security;
alter table public.project_messages enable row level security;
alter table public.project_documents enable row level security;
alter table public.project_v0_packs enable row level security;
alter table public.project_ai_runs enable row level security;

revoke all on public.projects from public, anon, authenticated;
revoke all on public.project_briefs from public, anon, authenticated;
revoke all on public.project_stages from public, anon, authenticated;
revoke all on public.project_tasks from public, anon, authenticated;
revoke all on public.project_messages from public, anon, authenticated;
revoke all on public.project_documents from public, anon, authenticated;
revoke all on public.project_v0_packs from public, anon, authenticated;
revoke all on public.project_ai_runs from public, anon, authenticated;

grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.project_briefs to authenticated;
grant select, insert, update, delete on public.project_stages to authenticated;
grant select, insert, update, delete on public.project_tasks to authenticated;
grant select, insert, update, delete on public.project_messages to authenticated;
grant select, insert, update, delete on public.project_documents to authenticated;
grant select, insert, update, delete on public.project_v0_packs to authenticated;
grant select, insert on public.project_ai_runs to authenticated;

grant all on public.projects to service_role;
grant all on public.project_briefs to service_role;
grant all on public.project_stages to service_role;
grant all on public.project_tasks to service_role;
grant all on public.project_messages to service_role;
grant all on public.project_documents to service_role;
grant all on public.project_v0_packs to service_role;
grant all on public.project_ai_runs to service_role;

-- Remove every older permissive policy name. PostgreSQL ORs permissive
-- policies together, so leaving one behind defeats the stricter policies below.
drop policy if exists "projects_insert_auth" on public.projects;
drop policy if exists "projects_update_own_or_claim" on public.projects;
drop policy if exists "project_briefs_via_project" on public.project_briefs;
drop policy if exists "project_v0_packs_via_project" on public.project_v0_packs;
drop policy if exists "mvp_project_v0_packs_all" on public.project_v0_packs;
drop policy if exists "project_stages_via_project" on public.project_stages;
drop policy if exists "project_tasks_via_project" on public.project_tasks;
drop policy if exists "project_messages_via_project" on public.project_messages;

drop policy if exists "projects_select_own" on public.projects;
create policy "projects_select_own"
  on public.projects for select to authenticated
  using (owner_user_id = auth.uid());

drop policy if exists "projects_insert_own" on public.projects;
create policy "projects_insert_own"
  on public.projects for insert to authenticated
  with check (owner_user_id = auth.uid());

drop policy if exists "projects_update_own" on public.projects;
create policy "projects_update_own"
  on public.projects for update to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists "projects_delete_own" on public.projects;
create policy "projects_delete_own"
  on public.projects for delete to authenticated
  using (owner_user_id = auth.uid());

-- Launch mode never writes anonymous projects. Do not let a signed-in user claim
-- an unowned UUID discovered outside their account.
drop policy if exists "projects_claim_orphan" on public.projects;

-- project_briefs
drop policy if exists "project_briefs_select_own" on public.project_briefs;
create policy "project_briefs_select_own"
  on public.project_briefs for select to authenticated
  using (public.project_owned_by_user(project_id));

drop policy if exists "project_briefs_insert_own" on public.project_briefs;
create policy "project_briefs_insert_own"
  on public.project_briefs for insert to authenticated
  with check (public.project_owned_by_user(project_id));

drop policy if exists "project_briefs_update_own" on public.project_briefs;
create policy "project_briefs_update_own"
  on public.project_briefs for update to authenticated
  using (public.project_owned_by_user(project_id))
  with check (public.project_owned_by_user(project_id));

drop policy if exists "project_briefs_delete_own" on public.project_briefs;
create policy "project_briefs_delete_own"
  on public.project_briefs for delete to authenticated
  using (public.project_owned_by_user(project_id));

-- project_v0_packs
drop policy if exists "project_v0_packs_select_own" on public.project_v0_packs;
create policy "project_v0_packs_select_own"
  on public.project_v0_packs for select to authenticated
  using (public.project_owned_by_user(project_id));

drop policy if exists "project_v0_packs_insert_own" on public.project_v0_packs;
create policy "project_v0_packs_insert_own"
  on public.project_v0_packs for insert to authenticated
  with check (public.project_owned_by_user(project_id));

drop policy if exists "project_v0_packs_update_own" on public.project_v0_packs;
create policy "project_v0_packs_update_own"
  on public.project_v0_packs for update to authenticated
  using (public.project_owned_by_user(project_id))
  with check (public.project_owned_by_user(project_id));

drop policy if exists "project_v0_packs_delete_own" on public.project_v0_packs;
create policy "project_v0_packs_delete_own"
  on public.project_v0_packs for delete to authenticated
  using (public.project_owned_by_user(project_id));

-- project_ai_runs
drop policy if exists "project_ai_runs_select_own" on public.project_ai_runs;
create policy "project_ai_runs_select_own"
  on public.project_ai_runs for select to authenticated
  using (public.project_owned_by_user(project_id));

drop policy if exists "project_ai_runs_insert_own" on public.project_ai_runs;
create policy "project_ai_runs_insert_own"
  on public.project_ai_runs for insert to authenticated
  with check (public.project_owned_by_user(project_id));

-- project_stages
drop policy if exists "project_stages_select_own" on public.project_stages;
create policy "project_stages_select_own"
  on public.project_stages for select to authenticated
  using (public.project_owned_by_user(project_id));

drop policy if exists "project_stages_insert_own" on public.project_stages;
create policy "project_stages_insert_own"
  on public.project_stages for insert to authenticated
  with check (public.project_owned_by_user(project_id));

drop policy if exists "project_stages_update_own" on public.project_stages;
create policy "project_stages_update_own"
  on public.project_stages for update to authenticated
  using (public.project_owned_by_user(project_id))
  with check (public.project_owned_by_user(project_id));

drop policy if exists "project_stages_delete_own" on public.project_stages;
create policy "project_stages_delete_own"
  on public.project_stages for delete to authenticated
  using (public.project_owned_by_user(project_id));

-- project_tasks
drop policy if exists "project_tasks_select_own" on public.project_tasks;
create policy "project_tasks_select_own"
  on public.project_tasks for select to authenticated
  using (public.project_owned_by_user(project_id));

drop policy if exists "project_tasks_insert_own" on public.project_tasks;
create policy "project_tasks_insert_own"
  on public.project_tasks for insert to authenticated
  with check (public.project_owned_by_user(project_id));

drop policy if exists "project_tasks_update_own" on public.project_tasks;
create policy "project_tasks_update_own"
  on public.project_tasks for update to authenticated
  using (public.project_owned_by_user(project_id))
  with check (public.project_owned_by_user(project_id));

drop policy if exists "project_tasks_delete_own" on public.project_tasks;
create policy "project_tasks_delete_own"
  on public.project_tasks for delete to authenticated
  using (public.project_owned_by_user(project_id));

-- project_messages
drop policy if exists "project_messages_select_own" on public.project_messages;
create policy "project_messages_select_own"
  on public.project_messages for select to authenticated
  using (public.project_owned_by_user(project_id));

drop policy if exists "project_messages_insert_own" on public.project_messages;
create policy "project_messages_insert_own"
  on public.project_messages for insert to authenticated
  with check (public.project_owned_by_user(project_id));

drop policy if exists "project_messages_update_own" on public.project_messages;
create policy "project_messages_update_own"
  on public.project_messages for update to authenticated
  using (public.project_owned_by_user(project_id))
  with check (public.project_owned_by_user(project_id));

drop policy if exists "project_messages_delete_own" on public.project_messages;
create policy "project_messages_delete_own"
  on public.project_messages for delete to authenticated
  using (public.project_owned_by_user(project_id));

-- project_documents
drop policy if exists "project_documents_select_own" on public.project_documents;
create policy "project_documents_select_own"
  on public.project_documents for select to authenticated
  using (public.project_owned_by_user(project_id));

drop policy if exists "project_documents_insert_own" on public.project_documents;
create policy "project_documents_insert_own"
  on public.project_documents for insert to authenticated
  with check (public.project_owned_by_user(project_id));

drop policy if exists "project_documents_update_own" on public.project_documents;
create policy "project_documents_update_own"
  on public.project_documents for update to authenticated
  using (public.project_owned_by_user(project_id))
  with check (public.project_owned_by_user(project_id));

drop policy if exists "project_documents_delete_own" on public.project_documents;
create policy "project_documents_delete_own"
  on public.project_documents for delete to authenticated
  using (public.project_owned_by_user(project_id));

-- -----------------------------------------------------------------------------
-- Storage — remove anonymous write access; users write only below {auth.uid()}/
-- -----------------------------------------------------------------------------
drop policy if exists "demo_storage_insert" on storage.objects;
drop policy if exists "demo_storage_update" on storage.objects;
drop policy if exists "project_v0_select_public" on storage.objects;

update storage.buckets
set public = false
where id in ('project-v0', 'portfolio-media');

drop policy if exists "project_v0_select_own" on storage.objects;
create policy "project_v0_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'project-v0'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "project_v0_upload_own" on storage.objects;
create policy "project_v0_upload_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'project-v0'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "project_v0_update_own" on storage.objects;
create policy "project_v0_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'project-v0' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'project-v0' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "project_v0_delete_own" on storage.objects;
create policy "project_v0_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'project-v0' and (storage.foldername(name))[1] = auth.uid()::text);

-- A published profile may expose only objects in its exact
-- {owner_user_id}/{portfolio_id}/ prefix. Draft portfolio media stays private.
create or replace function public.portfolio_media_object_name(p_media_url text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select coalesce(
    nullif(
      split_part(
        split_part(coalesce(p_media_url, ''), '/storage/v1/object/sign/portfolio-media/', 2),
        '?',
        1
      ),
      ''
    ),
    nullif(
      split_part(
        split_part(coalesce(p_media_url, ''), '/storage/v1/object/public/portfolio-media/', 2),
        '?',
        1
      ),
      ''
    )
  );
$$;

revoke all on function public.portfolio_media_object_name(text) from public, anon, authenticated;

create or replace function public.portfolio_media_is_published(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
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
          from jsonb_array_elements_text(coalesce(p.photos, '[]'::jsonb)) as media(url)
          where public.portfolio_media_object_name(media.url) = p_object_name
        )
      )
  );
$$;

revoke all on function public.portfolio_media_is_published(text) from public;
grant execute on function public.portfolio_media_is_published(text) to anon, authenticated;

drop policy if exists "portfolio_media_select_public" on storage.objects;
drop policy if exists "portfolio_media_select_own" on storage.objects;
create policy "portfolio_media_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'portfolio-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "portfolio_media_select_published" on storage.objects;
create policy "portfolio_media_select_published" on storage.objects
  for select to anon, authenticated
  using (
    bucket_id = 'portfolio-media'
    and public.portfolio_media_is_published(name)
  );

drop policy if exists "portfolio_media_upload_own" on storage.objects;
create policy "portfolio_media_upload_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'portfolio-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "portfolio_media_update_own" on storage.objects;
create policy "portfolio_media_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'portfolio-media' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'portfolio-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "portfolio_media_delete_own" on storage.objects;
create policy "portfolio_media_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'portfolio-media' and (storage.foldername(name))[1] = auth.uid()::text);

-- -----------------------------------------------------------------------------
-- Billing — only the backend service role writes gateway state and entitlements
-- -----------------------------------------------------------------------------
create table if not exists public.billing_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_id text not null check (plan_id in ('homeowner_project_pass', 'pro_growth_30d')),
  amount_paise integer not null check (amount_paise > 0),
  currency text not null default 'INR' check (currency = 'INR'),
  gateway text not null default 'razorpay' check (gateway = 'razorpay'),
  gateway_order_id text not null unique,
  gateway_order_status text,
  gateway_payment_id text unique,
  gateway_payment_status text,
  receipt text not null unique,
  status text not null default 'created' check (status in ('created', 'paid', 'failed', 'refunded')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_billing_orders_user_created
  on public.billing_orders (user_id, created_at desc);

-- A user can have only one unpaid checkout per plan. The API reuses it instead
-- of creating multiple payable Razorpay orders for repeated clicks/retries.
create unique index if not exists idx_billing_orders_one_created_per_plan
  on public.billing_orders (user_id, plan_id)
  where status = 'created';

create table if not exists public.user_entitlements (
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_id text not null check (plan_id in ('homeowner_project_pass', 'pro_growth_30d')),
  status text not null default 'active' check (status in ('active', 'expired', 'revoked')),
  active_from timestamptz not null default now(),
  active_until timestamptz,
  source_order_id uuid references public.billing_orders (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (user_id, plan_id)
);

create table if not exists public.billing_webhook_events (
  event_id text primary key,
  event_type text,
  billing_order_id uuid references public.billing_orders (id) on delete set null,
  payload jsonb not null,
  received_at timestamptz not null default now()
);

alter table public.billing_webhook_events
  add column if not exists billing_order_id uuid references public.billing_orders (id) on delete set null;

-- Redact any full legacy Razorpay payloads left by an earlier backend version.
update public.billing_webhook_events
set payload = jsonb_strip_nulls(jsonb_build_object(
  'gateway_order_id', coalesce(
    payload #>> '{payload,payment,entity,order_id}',
    payload #>> '{payload,order,entity,id}'
  ),
  'gateway_payment_id', payload #>> '{payload,payment,entity,id}',
  'payment_status', payload #>> '{payload,payment,entity,status}',
  'amount', payload #> '{payload,payment,entity,amount}',
  'currency', payload #>> '{payload,payment,entity,currency}'
))
where payload ? 'payload';

-- One transaction for capture + entitlement. This prevents webhook retries from
-- accidentally extending a 30-day pass more than once.
create or replace function public.activate_billing_order(
  p_order_id uuid,
  p_payment_id text,
  p_payment_status text
)
returns public.billing_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.billing_orders;
  v_current_until timestamptz;
  v_until timestamptz;
begin
  select * into v_order
  from public.billing_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Billing order not found';
  end if;
  if v_order.status = 'paid' then
    return v_order;
  end if;

  if v_order.plan_id = 'pro_growth_30d' then
    select active_until into v_current_until
    from public.user_entitlements
    where user_id = v_order.user_id and plan_id = v_order.plan_id;
    v_until := greatest(now(), coalesce(v_current_until, now())) + interval '30 days';
  else
    v_until := null;
  end if;

  update public.billing_orders
  set status = 'paid',
      gateway_payment_id = p_payment_id,
      gateway_payment_status = p_payment_status,
      paid_at = now(),
      updated_at = now()
  where id = p_order_id
  returning * into v_order;

  insert into public.user_entitlements (
    user_id, plan_id, status, active_from, active_until, source_order_id, updated_at
  ) values (
    v_order.user_id, v_order.plan_id, 'active', now(), v_until, v_order.id, now()
  )
  on conflict (user_id, plan_id) do update set
    status = 'active',
    active_from = now(),
    active_until = excluded.active_until,
    source_order_id = excluded.source_order_id,
    updated_at = now();

  return v_order;
end;
$$;

revoke all on function public.activate_billing_order(uuid, text, text) from public, anon, authenticated;
grant execute on function public.activate_billing_order(uuid, text, text) to service_role;

alter table public.billing_orders enable row level security;
alter table public.user_entitlements enable row level security;
alter table public.billing_webhook_events enable row level security;

drop policy if exists "billing_orders_select_own" on public.billing_orders;
create policy "billing_orders_select_own" on public.billing_orders
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "user_entitlements_select_own" on public.user_entitlements;
create policy "user_entitlements_select_own" on public.user_entitlements
  for select to authenticated using (user_id = auth.uid());

revoke all on public.billing_orders from public, anon, authenticated;
revoke all on public.user_entitlements from public, anon, authenticated;
revoke all on public.billing_webhook_events from public, anon, authenticated;
grant select on public.billing_orders to authenticated;
grant select on public.user_entitlements to authenticated;
grant all on public.billing_orders to service_role;
grant all on public.user_entitlements to service_role;
grant all on public.billing_webhook_events to service_role;

-- BuildGuru launch workspace: checklist progress, team, documents, and payment ledger.
-- Run after buildguru_single_setup.sql and buildguru_rls_hardening.sql.

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


do $hm_verify$
begin
  if not public.launch_schema_ready() then
    raise exception 'BuildGuru schema readiness check failed; transaction rolled back';
  end if;
end;
$hm_verify$;

commit;
select public.launch_schema_ready() as launch_schema_ready;
