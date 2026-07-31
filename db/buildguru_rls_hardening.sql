-- =============================================================================
-- BuildGuru — RLS hardening (run once in Supabase SQL Editor after single_setup)
-- Owner-scoped projects; portfolios writable only by owner; published pros public.
-- =============================================================================

begin;

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

commit;
