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
  resume_url text,
  cover_note text not null check (char_length(trim(cover_note)) between 20 and 5000),
  candidate_profile jsonb not null default '{}'::jsonb
    check (jsonb_typeof(candidate_profile) = 'object'),
  work_sample_paths text[] not null default '{}'::text[],
  work_sample_captions jsonb not null default '[]'::jsonb
    check (jsonb_typeof(work_sample_captions) = 'array'),
  publish_portfolio boolean not null default false,
  profile_slug text,
  consent boolean not null check (consent = true),
  status text not null default 'received'
    check (status in ('received', 'reviewing', 'shortlisted', 'rejected', 'hired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.career_applications
  add column if not exists candidate_profile jsonb not null default '{}'::jsonb;
alter table public.career_applications
  add column if not exists work_sample_paths text[] not null default '{}'::text[];
alter table public.career_applications
  add column if not exists work_sample_captions jsonb not null default '[]'::jsonb;
alter table public.career_applications
  add column if not exists publish_portfolio boolean not null default false;
alter table public.career_applications
  add column if not exists profile_slug text;
alter table public.career_applications
  alter column resume_url drop not null;

create unique index if not exists career_applications_job_email_unique
  on public.career_applications (job_id, lower(email));
create index if not exists career_jobs_public_listing_idx
  on public.career_jobs (status, published_at desc);
create index if not exists career_applications_job_created_idx
  on public.career_applications (job_id, created_at desc);
create unique index if not exists career_applications_profile_slug_unique
  on public.career_applications (profile_slug)
  where profile_slug is not null;

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
    and coalesce(array_length(work_sample_paths, 1), 0) <= 8
    and not exists (
      select 1
      from unnest(work_sample_paths) as sample_path
      where sample_path not like id::text || '/%'
    )
    and (
      publish_portfolio = false
      or profile_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    )
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

-- Work samples are uploaded before the application row is submitted. Keep the
-- bucket private, cap files at 5 MB, and allow only browser-safe image formats.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'career-work-samples',
  'career-work-samples',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "career samples anonymous upload" on storage.objects;
create policy "career samples anonymous upload"
  on storage.objects for insert
  to anon, authenticated
  with check (
    bucket_id = 'career-work-samples'
    and name ~ '^[0-9a-f-]{36}/[0-9]+-[0-9a-f-]+\.(jpg|jpeg|png|webp)$'
  );

drop policy if exists "career admins read samples" on storage.objects;
create policy "career admins read samples"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'career-work-samples'
    and public.careers_is_admin()
  );

create or replace function public.career_work_sample_is_public(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.career_applications a
    where a.publish_portfolio = true
      and a.profile_slug is not null
      and p_object_name = any(a.work_sample_paths)
  );
$$;

revoke all on function public.career_work_sample_is_public(text) from public;
grant execute on function public.career_work_sample_is_public(text) to anon, authenticated;

drop policy if exists "published career samples are public" on storage.objects;
create policy "published career samples are public"
  on storage.objects for select
  to anon, authenticated
  using (
    bucket_id = 'career-work-samples'
    and public.career_work_sample_is_public(name)
  );

drop view if exists public.published_career_profiles;
create view public.published_career_profiles
with (security_invoker = false)
as
select
  a.id,
  a.profile_slug as slug,
  a.full_name,
  a.city,
  a.cover_note as short_bio,
  a.candidate_profile,
  a.work_sample_paths,
  a.work_sample_captions,
  a.created_at
from public.career_applications a
where a.publish_portfolio = true
  and a.profile_slug is not null
  and coalesce(array_length(a.work_sample_paths, 1), 0) > 0;

revoke all on public.published_career_profiles from public, anon, authenticated;
grant select on public.published_career_profiles to anon, authenticated;

-- Initial opening. A fixed ID keeps this seed safe to run more than once while
-- allowing the hiring admin to refine the role later without creating a copy.
insert into public.career_jobs (
  id,
  title,
  team,
  location,
  employment_type,
  workplace_type,
  summary,
  description,
  responsibilities,
  qualifications,
  status,
  published_at
)
values (
  '00000000-0000-4000-8000-000000000101'::uuid,
  'Architect Product Manager',
  'Product',
  'India',
  'full_time',
  'remote',
  'Bring hands-on residential design experience into the product and help make plans, elevations, estimates, and professional handoffs genuinely useful.',
  'HomeMakers is looking for an architect, civil engineer, or built-environment professional who enjoys improving how people work. You will help the product team understand residential planning, floor plans, elevations, estimates, material takeoffs, and local approval workflows. You do not need a traditional product-manager background. You do need practical judgment, curiosity about software, and the ability to explain architectural decisions clearly.',
  '[
    "Own product requirements for residential planning, floor-plan, elevation, estimate, and material-takeoff workflows",
    "Translate Indian residential drawing standards, building bye-laws, and approval processes into clear product rules and review checkpoints",
    "Review early product outputs for dimensional logic, circulation, constructability, climate response, and completeness",
    "Help define when an AI suggestion is useful and when a qualified local professional must review it",
    "Work closely with product designers and engineers to turn architectural expertise into simple user experiences",
    "Interview architects, engineers, contractors, and homeowners to identify workflow gaps and validate product decisions",
    "Shape the handoff from early homeowner concepts to local professionals preparing authority-specific sanction and construction drawings"
  ]'::jsonb,
  '[
    "Degree or diploma in architecture, civil engineering, structural engineering, or a closely related discipline",
    "At least two years of hands-on experience with Indian residential projects, drawings, or approval coordination",
    "Strong understanding of floor plans, elevations, dimensions, space planning, building services coordination, and drawing sets",
    "Working knowledge of how municipal and development-authority requirements vary across Indian cities and states",
    "Ability to distinguish indicative concepts from sanction-ready and construction-ready documentation",
    "Interest in translating professional workflows into simple requirements, checks, or user experiences",
    "Clear written communication and comfort working across architecture, product, design, and engineering teams",
    "Product management or construction-technology experience is valuable, but deep domain judgment and product thinking matter most"
  ]'::jsonb,
  'published',
  now()
)
on conflict (id) do update set
  title = excluded.title,
  team = excluded.team,
  location = excluded.location,
  employment_type = excluded.employment_type,
  workplace_type = excluded.workplace_type,
  summary = excluded.summary,
  description = excluded.description,
  responsibilities = excluded.responsibilities,
  qualifications = excluded.qualifications,
  updated_at = now();

commit;

-- Bootstrap a hiring admin only from the trusted SQL Editor/service role:
-- insert into public.career_admins (user_id)
-- select id from auth.users where email = 'YOUR_ADMIN_EMAIL'
-- on conflict (user_id) do nothing;
