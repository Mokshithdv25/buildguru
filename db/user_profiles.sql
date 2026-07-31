-- BuildGuru — user_profiles (pairs with Supabase Auth)
-- Run in Supabase SQL editor after core schema exists.

create table if not exists public.user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'homeowner' check (role in ('homeowner', 'pro')),
  full_name text,
  phone text,
  city text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_profiles_role on public.user_profiles (role);

alter table public.user_profiles enable row level security;

drop policy if exists "user_profiles_select_own" on public.user_profiles;
create policy "user_profiles_select_own" on public.user_profiles
  for select to authenticated
  using (auth.uid() = id);

drop policy if exists "user_profiles_insert_own" on public.user_profiles;
create policy "user_profiles_insert_own" on public.user_profiles
  for insert to authenticated
  with check (auth.uid() = id);

drop policy if exists "user_profiles_update_own" on public.user_profiles;
create policy "user_profiles_update_own" on public.user_profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop trigger if exists trg_user_profiles_updated_at on public.user_profiles;
create trigger trg_user_profiles_updated_at
  before update on public.user_profiles
  for each row execute function public.set_updated_at();
