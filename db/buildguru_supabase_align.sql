-- BuildGuru: align existing v1/v1.1/v1.2 Supabase schema with current frontend
-- Safe to run multiple times. Run AFTER your v1 setup scripts.
--
-- You already have: portfolios, projects, project_briefs, project_ai_runs, PM tables.
-- This adds what the React app expects and fixes one constraint mismatch.
--
-- LEGACY ALIGNMENT ONLY. Production must run buildguru_rls_hardening.sql after
-- this file. This script now fails closed instead of disabling project RLS.

-- =========================
-- 1) Portfolios: link to auth user (for "my portfolio" + optional tightening later)
-- =========================
alter table public.portfolios
  add column if not exists owner_user_id uuid references auth.users (id) on delete set null;

create index if not exists idx_portfolios_owner_user on public.portfolios (owner_user_id);

-- =========================
-- 2) project_briefs: allow flow_status used by the app ('v0_ready')
-- =========================
alter table public.project_briefs
  drop constraint if exists project_briefs_flow_status_check;

alter table public.project_briefs
  add constraint project_briefs_flow_status_check
  check (flow_status in ('draft', 'v0_ready', 'open_for_quotes', 'submitted', 'abandoned'));

-- =========================
-- 3) project_v0_packs: denormalized v0 bundle (images + estimate) for project hub UI
--    (Your project_ai_runs table remains the audit log; app can write both.)
-- =========================
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

alter table public.project_v0_packs enable row level security;

-- Optional MVP policies if you re-enable RLS later:
-- alter table public.project_v0_packs enable row level security;
-- create policy "mvp_project_v0_packs_all" on public.project_v0_packs
--   for all to anon, authenticated using (true) with check (true);

-- =========================
-- 4) Storage buckets (portfolio photos + v0 concept images)
--    See db/supabase_storage.sql for full storage.objects policies.
-- =========================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('project-v0', 'project-v0', false, 10485760, array['image/jpeg','image/png','image/webp','image/gif']),
  ('portfolio-media', 'portfolio-media', false, 10485760, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- =========================
-- 5) Sanity checks (optional)
-- =========================
-- select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'project_v0_packs';
-- select conname from pg_constraint where conrelid = 'public.project_briefs'::regclass;
