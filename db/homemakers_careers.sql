-- =============================================================================
-- HomeMakers careers — public jobs, applications, and trusted hiring admins
-- =============================================================================
-- Run after the core HomeMakers migrations. Hiring admins are deliberately
-- separate from user_profiles.role so homeowner/pro authorization stays intact.

begin;

create table if not exists public.career_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.career_jobs (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 2 and 120),
  team text not null check (char_length(trim(team)) between 2 and 80),
  location text not null check (char_length(trim(location)) between 2 and 120),
  employment_type text not null default 'full_time'
    check (employment_type in ('full_time', 'part_time', 'contract', 'internship')),
  workplace_type text not null default 'onsite'
    check (workplace_type in ('remote', 'hybrid', 'onsite')),
  summary text not null check (char_length(trim(summary)) between 20 and 500),
  description text not null check (char_length(trim(description)) between 40 and 10000),
  responsibilities jsonb not null default '[]'::jsonb
    check (jsonb_typeof(responsibilities) = 'array'),
  qualifications jsonb not null default '[]'::jsonb
    check (jsonb_typeof(qualifications) = 'array'),
  status text not null default 'draft'
    check (status in ('draft', 'published', 'closed')),
  created_by uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  closes_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.career_applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.career_jobs(id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  email text not null check (char_length(trim(email)) between 5 and 254),
  phone text,
  city text,
  linkedin_url text,
  portfolio_url text,
  resume_url text not null check (char_length(trim(resume_url)) between 8 and 1000),
  cover_note text not null check (char_length(trim(cover_note)) between 20 and 5000),
  consent boolean not null check (consent = true),
  status text not null default 'received'
    check (status in ('received', 'reviewing', 'shortlisted', 'rejected', 'hired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists career_applications_job_email_unique
  on public.career_applications (job_id, lower(email));
create index if not exists career_jobs_public_listing_idx
  on public.career_jobs (status, published_at desc);
create index if not exists career_applications_job_created_idx
  on public.career_applications (job_id, created_at desc);

create or replace function public.careers_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.career_admins
    where user_id = auth.uid()
  );
$$;

revoke all on function public.careers_is_admin() from public;
grant execute on function public.careers_is_admin() to authenticated;

alter table public.career_admins enable row level security;
alter table public.career_jobs enable row level security;
alter table public.career_applications enable row level security;

drop policy if exists "career admins can read their membership" on public.career_admins;
create policy "career admins can read their membership"
  on public.career_admins for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "published career jobs are public" on public.career_jobs;
create policy "published career jobs are public"
  on public.career_jobs for select
  to anon, authenticated
  using (status = 'published' and (closes_at is null or closes_at > now()));

drop policy if exists "career admins manage jobs" on public.career_jobs;
create policy "career admins manage jobs"
  on public.career_jobs for all
  to authenticated
  using (public.careers_is_admin())
  with check (public.careers_is_admin());

drop policy if exists "public can apply to published jobs" on public.career_applications;
create policy "public can apply to published jobs"
  on public.career_applications for insert
  to anon, authenticated
  with check (
    status = 'received'
    and exists (
      select 1
      from public.career_jobs j
      where j.id = job_id
        and j.status = 'published'
        and (j.closes_at is null or j.closes_at > now())
    )
  );

drop policy if exists "career admins manage applications" on public.career_applications;
create policy "career admins manage applications"
  on public.career_applications for all
  to authenticated
  using (public.careers_is_admin())
  with check (public.careers_is_admin());

revoke all on public.career_admins from anon, authenticated;
revoke all on public.career_jobs from anon, authenticated;
revoke all on public.career_applications from anon, authenticated;

grant select on public.career_admins to authenticated;
grant select on public.career_jobs to anon, authenticated;
grant insert, update, delete on public.career_jobs to authenticated;
grant insert on public.career_applications to anon, authenticated;
grant select, update, delete on public.career_applications to authenticated;

commit;

-- Bootstrap a hiring admin only from the trusted SQL Editor/service role:
-- insert into public.career_admins (user_id)
-- select id from auth.users where email = 'YOUR_ADMIN_EMAIL'
-- on conflict (user_id) do nothing;
