-- BuildGuru — scoped work packages (trade RFQs) and structured bids
-- Run after buildguru_project_bids.sql.
--
-- The existing bidding loop treats the whole project as the unit of a bid. This
-- migration lets a homeowner split a project into trade-scoped work packages
-- (design, structural, civil construction, interiors, carpentry, electrical,
-- plumbing, painting, materials supply) and run a proper request-for-quote on
-- each one, the way general contractors run bid packages:
--
--   1. project_work_packages          — the RFQ: scope items, inclusions,
--                                       exclusions, pricing basis, due date, cap.
--   2. project_work_package_invites   — homeowner invites specific published pros.
--   3. project_work_package_bids      — one structured bid per pro per package,
--                                       with line items so bids can be levelled.
--   4. project_work_package_questions — pro questions; homeowner answers become
--                                       visible to every eligible bidder (addenda).
--   5. project_work_package_events    — activity log that doubles as the in-app
--                                       notification feed for both sides.
--
-- Privacy contract (same as the project-level bidding loop):
--   * Professionals never read projects, briefs, or documents directly. They see
--     packages through pro_work_package_opportunities, which omits owner identity,
--     street address and contact details.
--   * Professional contact details reach the homeowner only after the homeowner
--     shortlists or accepts a bid (work_package_bids_for_owner).
--   * Homeowner contact details reach a professional only through
--     pro_awarded_work_packages after the homeowner accepts that pro's bid.
--   * Homeowners can never edit a bid amount; decisions go through
--     set_work_package_bid_decision.

begin;

-- ---------------------------------------------------------------------------
-- 0. Shared helper: does the caller own this portfolio?
-- ---------------------------------------------------------------------------
create or replace function public.work_package_portfolio_owned(target_portfolio_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.portfolios pf
    where pf.id = target_portfolio_id
      and pf.owner_user_id = auth.uid()
  );
$$;

revoke all on function public.work_package_portfolio_owned(text) from public, anon;
grant execute on function public.work_package_portfolio_owned(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1. Work packages (the RFQ)
-- ---------------------------------------------------------------------------
create table if not exists public.project_work_packages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  package_type text not null check (package_type in (
    'design', 'structural', 'construction', 'interiors', 'carpentry',
    'electrical', 'plumbing', 'painting', 'materials', 'other'
  )),
  -- Crafts allowed to see and bid. Empty means "any published professional".
  eligible_crafts text[] not null default '{}'::text[],
  title text not null check (char_length(btrim(title)) between 3 and 140),
  summary text check (summary is null or char_length(summary) <= 4000),
  -- [{ id, label, quantity, unit, notes }] — the lines every bidder prices against.
  scope_items jsonb not null default '[]'::jsonb check (jsonb_typeof(scope_items) = 'array'),
  inclusions text check (inclusions is null or char_length(inclusions) <= 3000),
  exclusions text check (exclusions is null or char_length(exclusions) <= 3000),
  pricing_basis text not null default 'turnkey' check (pricing_basis in (
    'turnkey', 'labour_only', 'material_only', 'design_fee', 'open'
  )),
  site_visit_required boolean not null default false,
  budget_hint_inr numeric check (budget_hint_inr is null or budget_hint_inr >= 0),
  show_budget_to_pros boolean not null default false,
  bids_due_at timestamptz,
  target_start date,
  target_completion date,
  max_bids integer not null default 8 check (max_bids between 1 and 25),
  -- [{ document_id, name, category }] — names only are exposed to professionals.
  attachments_json jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments_json) = 'array'),
  status text not null default 'draft' check (status in (
    'draft', 'open', 'under_review', 'awarded', 'closed', 'cancelled'
  )),
  awarded_bid_id uuid,
  awarded_at timestamptz,
  published_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_project_work_packages_project
  on public.project_work_packages (project_id, created_at desc);

create index if not exists idx_project_work_packages_open
  on public.project_work_packages (status, published_at desc)
  where status in ('open', 'under_review');

drop trigger if exists trg_project_work_packages_updated_at on public.project_work_packages;
create trigger trg_project_work_packages_updated_at
  before update on public.project_work_packages
  for each row execute function public.set_updated_at();

alter table public.project_work_packages enable row level security;

revoke all on public.project_work_packages from public, anon, authenticated;
grant select, insert, update, delete on public.project_work_packages to authenticated;
grant all on public.project_work_packages to service_role;

drop policy if exists "project_work_packages_select_owner" on public.project_work_packages;
create policy "project_work_packages_select_owner"
  on public.project_work_packages for select
  to authenticated
  using (public.project_owned_by_user(project_id));

drop policy if exists "project_work_packages_insert_owner" on public.project_work_packages;
create policy "project_work_packages_insert_owner"
  on public.project_work_packages for insert
  to authenticated
  with check (created_by = auth.uid() and public.project_owned_by_user(project_id));

drop policy if exists "project_work_packages_update_owner" on public.project_work_packages;
create policy "project_work_packages_update_owner"
  on public.project_work_packages for update
  to authenticated
  using (public.project_owned_by_user(project_id))
  with check (public.project_owned_by_user(project_id));

drop policy if exists "project_work_packages_delete_owner" on public.project_work_packages;
create policy "project_work_packages_delete_owner"
  on public.project_work_packages for delete
  to authenticated
  using (public.project_owned_by_user(project_id) and status = 'draft');

-- ---------------------------------------------------------------------------
-- 2. Invitations to specific professionals
-- ---------------------------------------------------------------------------
create table if not exists public.project_work_package_invites (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.project_work_packages (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  portfolio_id text not null references public.portfolios (id) on delete cascade,
  invited_by uuid not null references auth.users (id) on delete cascade,
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  unique (package_id, portfolio_id)
);

create index if not exists idx_project_work_package_invites_portfolio
  on public.project_work_package_invites (portfolio_id, created_at desc);

alter table public.project_work_package_invites enable row level security;

revoke all on public.project_work_package_invites from public, anon, authenticated;
grant select, insert, delete on public.project_work_package_invites to authenticated;
grant all on public.project_work_package_invites to service_role;

drop policy if exists "project_work_package_invites_select_owner" on public.project_work_package_invites;
create policy "project_work_package_invites_select_owner"
  on public.project_work_package_invites for select
  to authenticated
  using (public.project_owned_by_user(project_id));

drop policy if exists "project_work_package_invites_insert_owner" on public.project_work_package_invites;
create policy "project_work_package_invites_insert_owner"
  on public.project_work_package_invites for insert
  to authenticated
  with check (
    invited_by = auth.uid()
    and public.project_owned_by_user(project_id)
    and exists (
      select 1 from public.project_work_packages wp
      where wp.id = project_work_package_invites.package_id
        and wp.project_id = project_work_package_invites.project_id
    )
    and exists (
      select 1 from public.portfolios pf
      where pf.id = project_work_package_invites.portfolio_id
        and pf.published = true
        and pf.moderation_status = 'approved'
    )
  );

drop policy if exists "project_work_package_invites_delete_owner" on public.project_work_package_invites;
create policy "project_work_package_invites_delete_owner"
  on public.project_work_package_invites for delete
  to authenticated
  using (public.project_owned_by_user(project_id));

create or replace function public.work_package_is_invited(
  target_package_id uuid,
  target_portfolio_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.project_work_package_invites i
    where i.package_id = target_package_id
      and i.portfolio_id = target_portfolio_id
  );
$$;

revoke all on function public.work_package_is_invited(uuid, text) from public, anon;
grant execute on function public.work_package_is_invited(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Structured bids
-- ---------------------------------------------------------------------------
create table if not exists public.project_work_package_bids (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.project_work_packages (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  portfolio_id text not null references public.portfolios (id) on delete cascade,
  -- The professional's own state. Withdrawn bids stay for the audit trail.
  status text not null default 'submitted' check (status in ('submitted', 'withdrawn')),
  -- The homeowner's verdict, written only through set_work_package_bid_decision.
  homeowner_decision text not null default 'pending' check (homeowner_decision in (
    'pending', 'shortlisted', 'accepted', 'declined'
  )),
  homeowner_decided_at timestamptz,
  total_amount_inr numeric not null check (total_amount_inr > 0),
  gst_included boolean not null default false,
  pricing_basis text not null default 'turnkey' check (pricing_basis in (
    'turnkey', 'labour_only', 'material_only', 'design_fee', 'open'
  )),
  -- [{ scope_item_id, label, quantity, unit, unit_rate_inr, amount_inr }]
  line_items jsonb not null default '[]'::jsonb check (jsonb_typeof(line_items) = 'array'),
  inclusions text check (inclusions is null or char_length(inclusions) <= 3000),
  exclusions text check (exclusions is null or char_length(exclusions) <= 3000),
  assumptions text check (assumptions is null or char_length(assumptions) <= 2000),
  timeline_weeks integer check (timeline_weeks is null or (timeline_weeks > 0 and timeline_weeks <= 520)),
  can_start_on date,
  warranty_months integer check (warranty_months is null or (warranty_months >= 0 and warranty_months <= 240)),
  advance_pct integer check (advance_pct is null or (advance_pct >= 0 and advance_pct <= 100)),
  payment_schedule_note text check (payment_schedule_note is null or char_length(payment_schedule_note) <= 1500),
  site_visit_done boolean not null default false,
  valid_until date,
  cover_note text check (cover_note is null or char_length(cover_note) <= 3000),
  revision integer not null default 1,
  submitted_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (package_id, portfolio_id)
);

create index if not exists idx_project_work_package_bids_package
  on public.project_work_package_bids (package_id, status, submitted_at desc);

create index if not exists idx_project_work_package_bids_portfolio
  on public.project_work_package_bids (portfolio_id, updated_at desc);

create index if not exists idx_project_work_package_bids_project
  on public.project_work_package_bids (project_id);

alter table public.project_work_packages
  drop constraint if exists project_work_packages_awarded_bid_fk;
alter table public.project_work_packages
  add constraint project_work_packages_awarded_bid_fk
  foreign key (awarded_bid_id) references public.project_work_package_bids (id) on delete set null;

drop trigger if exists trg_project_work_package_bids_updated_at on public.project_work_package_bids;
create trigger trg_project_work_package_bids_updated_at
  before update on public.project_work_package_bids
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Visibility and bidding eligibility for professionals
-- ---------------------------------------------------------------------------
-- A professional sees a package when it is open (or under review / awarded after
-- the due date), or when they already hold a bid on it; the project must not be
-- archived and the caller must own a published portfolio in an eligible craft —
-- or have been invited explicitly.
create or replace function public.can_view_work_package(
  target_package_id uuid,
  target_portfolio_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.project_work_packages wp
    join public.projects p on p.id = wp.project_id
    join public.portfolios pf on pf.id = target_portfolio_id
    where wp.id = target_package_id
      and pf.owner_user_id = auth.uid()
      and pf.published = true
      and pf.moderation_status = 'approved'
      and exists (
        select 1 from public.user_profiles up
        where up.id = auth.uid() and up.role = 'pro'
      )
      and (
        wp.status in ('open', 'under_review', 'awarded')
        or exists (
          select 1 from public.project_work_package_bids b
          where b.package_id = wp.id and b.portfolio_id = pf.id
        )
      )
      and p.status <> 'archived'
      and (
        cardinality(wp.eligible_crafts) = 0
        or pf.craft = any (wp.eligible_crafts)
        or public.work_package_is_invited(wp.id, pf.id)
      )
  );
$$;

revoke all on function public.can_view_work_package(uuid, text) from public, anon;
grant execute on function public.can_view_work_package(uuid, text) to authenticated, service_role;

create or replace function public.can_bid_on_work_package(
  target_package_id uuid,
  target_portfolio_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_view_work_package(target_package_id, target_portfolio_id)
    and exists (
      select 1
      from public.project_work_packages wp
      where wp.id = target_package_id
        and wp.status = 'open'
        and (wp.bids_due_at is null or wp.bids_due_at >= now())
    );
$$;

revoke all on function public.can_bid_on_work_package(uuid, text) from public, anon;
grant execute on function public.can_bid_on_work_package(uuid, text) to authenticated, service_role;

alter table public.project_work_package_bids enable row level security;

revoke all on public.project_work_package_bids from public, anon, authenticated;
-- No delete grant: a professional withdraws instead, preserving the audit trail.
grant select, insert, update on public.project_work_package_bids to authenticated;
grant all on public.project_work_package_bids to service_role;

drop policy if exists "work_package_bids_select_pro_own" on public.project_work_package_bids;
create policy "work_package_bids_select_pro_own"
  on public.project_work_package_bids for select
  to authenticated
  using (public.work_package_portfolio_owned(portfolio_id));

-- Homeowners read submitted bids on their own packages, never withdrawn ones,
-- and never gain insert/update rights on this table.
drop policy if exists "work_package_bids_select_project_owner" on public.project_work_package_bids;
create policy "work_package_bids_select_project_owner"
  on public.project_work_package_bids for select
  to authenticated
  using (
    status = 'submitted'
    and public.project_owned_by_user(project_id)
  );

drop policy if exists "work_package_bids_insert_pro_own" on public.project_work_package_bids;
create policy "work_package_bids_insert_pro_own"
  on public.project_work_package_bids for insert
  to authenticated
  with check (
    public.work_package_portfolio_owned(portfolio_id)
    and public.can_bid_on_work_package(package_id, portfolio_id)
    and exists (
      select 1 from public.project_work_packages wp
      where wp.id = project_work_package_bids.package_id
        and wp.project_id = project_work_package_bids.project_id
    )
  );

drop policy if exists "work_package_bids_update_pro_own" on public.project_work_package_bids;
create policy "work_package_bids_update_pro_own"
  on public.project_work_package_bids for update
  to authenticated
  using (public.work_package_portfolio_owned(portfolio_id))
  with check (public.work_package_portfolio_owned(portfolio_id));

-- Business rules the client cannot be trusted with: bid cap, due date on
-- revisions, no edits to an accepted bid, revision counter, decision reset.
create or replace function public.enforce_work_package_bid_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cap integer;
  submitted_count integer;
  price_changed boolean;
begin
  if tg_op = 'INSERT' then
    new.status := 'submitted';
    new.homeowner_decision := 'pending';
    new.homeowner_decided_at := null;
    new.revision := 1;
    new.submitted_at := now();
    new.withdrawn_at := null;

    select wp.max_bids into cap
    from public.project_work_packages wp
    where wp.id = new.package_id;

    select count(*) into submitted_count
    from public.project_work_package_bids b
    where b.package_id = new.package_id
      and b.status = 'submitted';

    if cap is not null and submitted_count >= cap then
      raise exception 'This work package has reached its bid limit';
    end if;
    return new;
  end if;

  -- UPDATE
  -- set_work_package_bid_decision only touches the decision columns; let it through.
  if current_setting('buildguru.allow_decision_write', true) = 'on' then
    return new;
  end if;

  if old.homeowner_decision = 'accepted' and new.status = 'submitted'
     and (new.total_amount_inr is distinct from old.total_amount_inr
          or new.line_items is distinct from old.line_items) then
    raise exception 'An accepted bid cannot be revised. Ask the homeowner to reopen the package.';
  end if;

  -- Only the homeowner's decision function may change these two columns.
  new.homeowner_decision := old.homeowner_decision;
  new.homeowner_decided_at := old.homeowner_decided_at;

  -- Withdraw
  if new.status = 'withdrawn' and old.status = 'submitted' then
    new.withdrawn_at := now();
    new.homeowner_decision := 'pending';
    new.homeowner_decided_at := null;
    return new;
  end if;

  -- Re-submit after withdrawal, or revise a live bid: package must still be open.
  if new.status = 'submitted' then
    if not public.can_bid_on_work_package(new.package_id, new.portfolio_id) then
      raise exception 'This work package is no longer accepting bids';
    end if;

    if old.status = 'withdrawn' then
      select wp.max_bids into cap from public.project_work_packages wp where wp.id = new.package_id;
      select count(*) into submitted_count
      from public.project_work_package_bids b
      where b.package_id = new.package_id and b.status = 'submitted' and b.id <> new.id;
      if cap is not null and submitted_count >= cap then
        raise exception 'This work package has reached its bid limit';
      end if;
      new.withdrawn_at := null;
      new.revision := old.revision + 1;
      new.submitted_at := now();
      new.homeowner_decision := 'pending';
      new.homeowner_decided_at := null;
      return new;
    end if;

    price_changed :=
      new.total_amount_inr is distinct from old.total_amount_inr
      or new.line_items is distinct from old.line_items
      or new.inclusions is distinct from old.inclusions
      or new.exclusions is distinct from old.exclusions
      or new.timeline_weeks is distinct from old.timeline_weeks
      or new.gst_included is distinct from old.gst_included
      or new.pricing_basis is distinct from old.pricing_basis
      or new.advance_pct is distinct from old.advance_pct
      or new.warranty_months is distinct from old.warranty_months;

    if price_changed then
      new.revision := old.revision + 1;
      new.submitted_at := now();
      -- A revised price invalidates a stale shortlist/acceptance.
      new.homeowner_decision := 'pending';
      new.homeowner_decided_at := null;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_work_package_bid_rules on public.project_work_package_bids;
create trigger trg_enforce_work_package_bid_rules
  before insert or update on public.project_work_package_bids
  for each row execute function public.enforce_work_package_bid_rules();

-- Trigger helpers are never RPC entry points.
revoke all on function public.enforce_work_package_bid_rules() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Questions and answers (addenda)
-- ---------------------------------------------------------------------------
create table if not exists public.project_work_package_questions (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.project_work_packages (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  portfolio_id text not null references public.portfolios (id) on delete cascade,
  question text not null check (char_length(btrim(question)) between 3 and 1500),
  answer text check (answer is null or char_length(answer) <= 3000),
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_project_work_package_questions_package
  on public.project_work_package_questions (package_id, created_at);

drop trigger if exists trg_project_work_package_questions_updated_at on public.project_work_package_questions;
create trigger trg_project_work_package_questions_updated_at
  before update on public.project_work_package_questions
  for each row execute function public.set_updated_at();

alter table public.project_work_package_questions enable row level security;

revoke all on public.project_work_package_questions from public, anon, authenticated;
grant select, insert on public.project_work_package_questions to authenticated;
grant all on public.project_work_package_questions to service_role;

-- The asker sees their own question; the homeowner sees every question on their
-- packages. Other bidders read answered questions through the view below.
drop policy if exists "work_package_questions_select" on public.project_work_package_questions;
create policy "work_package_questions_select"
  on public.project_work_package_questions for select
  to authenticated
  using (
    public.work_package_portfolio_owned(portfolio_id)
    or public.project_owned_by_user(project_id)
  );

drop policy if exists "work_package_questions_insert_pro" on public.project_work_package_questions;
create policy "work_package_questions_insert_pro"
  on public.project_work_package_questions for insert
  to authenticated
  with check (
    public.work_package_portfolio_owned(portfolio_id)
    and public.can_view_work_package(package_id, portfolio_id)
    and exists (
      select 1 from public.project_work_packages wp
      where wp.id = project_work_package_questions.package_id
        and wp.project_id = project_work_package_questions.project_id
        and wp.status in ('open', 'under_review')
    )
  );

-- ---------------------------------------------------------------------------
-- 6. Activity log / notification feed
-- ---------------------------------------------------------------------------
create table if not exists public.project_work_package_events (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.project_work_packages (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  audience text not null check (audience in ('owner', 'pro')),
  -- Set for audience = 'pro'; the professional who should be notified.
  target_portfolio_id text references public.portfolios (id) on delete cascade,
  event_type text not null check (event_type in (
    'package_published', 'package_closed', 'package_reopened', 'invited',
    'bid_submitted', 'bid_revised', 'bid_withdrawn',
    'question_asked', 'question_answered',
    'bid_shortlisted', 'bid_accepted', 'bid_declined', 'bid_reconsidered'
  )),
  title text not null check (char_length(title) <= 200),
  body text check (body is null or char_length(body) <= 1000),
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_project_work_package_events_owner
  on public.project_work_package_events (project_id, created_at desc)
  where audience = 'owner';

create index if not exists idx_project_work_package_events_pro
  on public.project_work_package_events (target_portfolio_id, created_at desc)
  where audience = 'pro';

alter table public.project_work_package_events enable row level security;

revoke all on public.project_work_package_events from public, anon, authenticated;
grant select on public.project_work_package_events to authenticated;
grant all on public.project_work_package_events to service_role;

drop policy if exists "work_package_events_select_owner" on public.project_work_package_events;
create policy "work_package_events_select_owner"
  on public.project_work_package_events for select
  to authenticated
  using (audience = 'owner' and public.project_owned_by_user(project_id));

drop policy if exists "work_package_events_select_pro" on public.project_work_package_events;
create policy "work_package_events_select_pro"
  on public.project_work_package_events for select
  to authenticated
  using (audience = 'pro' and public.work_package_portfolio_owned(target_portfolio_id));

create or replace function public.log_work_package_event(
  target_package_id uuid,
  target_audience text,
  target_portfolio text,
  target_type text,
  target_title text,
  target_body text default null,
  target_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid;
begin
  select wp.project_id into pid from public.project_work_packages wp where wp.id = target_package_id;
  if pid is null then return; end if;
  insert into public.project_work_package_events
    (package_id, project_id, audience, target_portfolio_id, event_type, title, body, payload)
  values
    (target_package_id, pid, target_audience, target_portfolio, target_type,
     left(target_title, 200), left(target_body, 1000), coalesce(target_payload, '{}'::jsonb));
end;
$$;

revoke all on function public.log_work_package_event(uuid, text, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.log_work_package_event(uuid, text, text, text, text, text, jsonb) to service_role;

-- Bid activity → homeowner feed
create or replace function public.notify_work_package_bid_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  pkg_title text;
  pro_name text;
begin
  select wp.title into pkg_title from public.project_work_packages wp where wp.id = new.package_id;
  select coalesce(nullif(btrim(pf.business_name), ''), nullif(btrim(pf.full_name), ''), 'A professional')
    into pro_name from public.portfolios pf where pf.id = new.portfolio_id;

  if tg_op = 'INSERT' then
    perform public.log_work_package_event(
      new.package_id, 'owner', null, 'bid_submitted',
      pro_name || ' sent a bid on ' || pkg_title,
      'Total ₹' || to_char(new.total_amount_inr, 'FM9,99,99,99,999') || case when new.timeline_weeks is not null then ' · ' || new.timeline_weeks || ' weeks' else '' end,
      jsonb_build_object('bid_id', new.id, 'portfolio_id', new.portfolio_id));
  elsif new.status = 'withdrawn' and old.status = 'submitted' then
    perform public.log_work_package_event(
      new.package_id, 'owner', null, 'bid_withdrawn',
      pro_name || ' withdrew their bid on ' || pkg_title, null,
      jsonb_build_object('bid_id', new.id, 'portfolio_id', new.portfolio_id));
  elsif new.status = 'submitted' and new.revision > old.revision then
    perform public.log_work_package_event(
      new.package_id, 'owner', null, 'bid_revised',
      pro_name || ' revised their bid on ' || pkg_title,
      'Now ₹' || to_char(new.total_amount_inr, 'FM9,99,99,99,999') || ' (revision ' || new.revision || ')',
      jsonb_build_object('bid_id', new.id, 'portfolio_id', new.portfolio_id));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_work_package_bid_activity on public.project_work_package_bids;
create trigger trg_notify_work_package_bid_activity
  after insert or update on public.project_work_package_bids
  for each row execute function public.notify_work_package_bid_activity();

revoke all on function public.notify_work_package_bid_activity() from public, anon, authenticated;

-- Question asked → homeowner feed
create or replace function public.notify_work_package_question()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  pkg_title text;
begin
  select wp.title into pkg_title from public.project_work_packages wp where wp.id = new.package_id;
  perform public.log_work_package_event(
    new.package_id, 'owner', null, 'question_asked',
    'New question on ' || pkg_title,
    left(new.question, 300),
    jsonb_build_object('question_id', new.id));
  return new;
end;
$$;

drop trigger if exists trg_notify_work_package_question on public.project_work_package_questions;
create trigger trg_notify_work_package_question
  after insert on public.project_work_package_questions
  for each row execute function public.notify_work_package_question();

revoke all on function public.notify_work_package_question() from public, anon, authenticated;

-- Invitation → professional feed
create or replace function public.notify_work_package_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  pkg record;
begin
  select wp.title, wp.status into pkg from public.project_work_packages wp where wp.id = new.package_id;
  if pkg.status in ('open', 'under_review') then
    perform public.log_work_package_event(
      new.package_id, 'pro', new.portfolio_id, 'invited',
      'A homeowner invited you to bid on ' || pkg.title,
      new.note,
      jsonb_build_object('package_id', new.package_id));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_work_package_invite on public.project_work_package_invites;
create trigger trg_notify_work_package_invite
  after insert on public.project_work_package_invites
  for each row execute function public.notify_work_package_invite();

revoke all on function public.notify_work_package_invite() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Homeowner write paths (security definer, ownership enforced inside)
-- ---------------------------------------------------------------------------
create or replace function public.publish_work_package(target_package_id uuid)
returns public.project_work_packages
language plpgsql
security definer
set search_path = ''
as $$
declare
  pkg public.project_work_packages;
  invited record;
begin
  select * into pkg from public.project_work_packages wp
  where wp.id = target_package_id and public.project_owned_by_user(wp.project_id);
  if pkg.id is null then
    raise exception 'Work package not found for this project';
  end if;
  if pkg.status not in ('draft', 'closed', 'under_review') then
    raise exception 'Only draft or closed work packages can be published';
  end if;
  if char_length(btrim(pkg.title)) < 3 then
    raise exception 'Give the work package a title';
  end if;
  if jsonb_array_length(pkg.scope_items) = 0 and coalesce(char_length(btrim(pkg.summary)), 0) < 20 then
    raise exception 'Describe the scope: add scope items or a summary before publishing';
  end if;
  if pkg.bids_due_at is not null and pkg.bids_due_at < now() then
    raise exception 'The bid due date has already passed. Choose a new due date.';
  end if;

  update public.project_work_packages wp
  set status = 'open',
      published_at = coalesce(wp.published_at, now()),
      closed_at = null,
      updated_at = now()
  where wp.id = target_package_id
  returning * into pkg;

  -- Anyone invited while it was a draft gets their notification now.
  for invited in
    select i.portfolio_id, i.note from public.project_work_package_invites i where i.package_id = pkg.id
  loop
    perform public.log_work_package_event(
      pkg.id, 'pro', invited.portfolio_id, 'invited',
      'A homeowner invited you to bid on ' || pkg.title,
      invited.note,
      jsonb_build_object('package_id', pkg.id));
  end loop;

  return pkg;
end;
$$;

revoke all on function public.publish_work_package(uuid) from public, anon;
grant execute on function public.publish_work_package(uuid) to authenticated, service_role;

create or replace function public.set_work_package_status(target_package_id uuid, target_status text)
returns public.project_work_packages
language plpgsql
security definer
set search_path = ''
as $$
declare
  pkg public.project_work_packages;
begin
  if target_status not in ('open', 'under_review', 'closed', 'cancelled') then
    raise exception 'Invalid work package status';
  end if;

  select * into pkg from public.project_work_packages wp
  where wp.id = target_package_id and public.project_owned_by_user(wp.project_id);
  if pkg.id is null then
    raise exception 'Work package not found for this project';
  end if;
  if pkg.status = 'draft' then
    raise exception 'Publish the work package first';
  end if;
  if pkg.status = 'awarded' and target_status in ('open', 'under_review') then
    raise exception 'Reconsider the accepted bid before reopening this package';
  end if;

  update public.project_work_packages wp
  set status = target_status,
      closed_at = case when target_status in ('closed', 'cancelled') then now() else null end,
      updated_at = now()
  where wp.id = target_package_id
  returning * into pkg;

  if target_status in ('closed', 'cancelled') then
    perform public.log_work_package_event(pkg.id, 'pro', b.portfolio_id, 'package_closed',
      pkg.title || ' is no longer accepting bids', null, jsonb_build_object('package_id', pkg.id))
    from public.project_work_package_bids b
    where b.package_id = pkg.id and b.status = 'submitted' and b.homeowner_decision <> 'accepted';
  elsif target_status = 'open' then
    perform public.log_work_package_event(pkg.id, 'pro', b.portfolio_id, 'package_reopened',
      pkg.title || ' is open for bids again', null, jsonb_build_object('package_id', pkg.id))
    from public.project_work_package_bids b
    where b.package_id = pkg.id;
  end if;

  return pkg;
end;
$$;

revoke all on function public.set_work_package_status(uuid, text) from public, anon;
grant execute on function public.set_work_package_status(uuid, text) to authenticated, service_role;

create or replace function public.set_work_package_bid_decision(
  target_bid_id uuid,
  target_decision text
)
returns public.project_work_package_bids
language plpgsql
security definer
set search_path = ''
as $$
declare
  bid public.project_work_package_bids;
  pkg public.project_work_packages;
  other_accepted uuid;
  evt text;
  msg text;
begin
  if target_decision not in ('pending', 'shortlisted', 'accepted', 'declined') then
    raise exception 'Invalid bid decision';
  end if;

  select * into bid from public.project_work_package_bids b
  where b.id = target_bid_id
    and b.status = 'submitted'
    and public.project_owned_by_user(b.project_id);
  if bid.id is null then
    raise exception 'Bid not found for this project';
  end if;

  select * into pkg from public.project_work_packages wp where wp.id = bid.package_id;

  if target_decision = 'accepted' then
    select b.id into other_accepted
    from public.project_work_package_bids b
    where b.package_id = bid.package_id and b.homeowner_decision = 'accepted' and b.id <> bid.id
    limit 1;
    if other_accepted is not null then
      raise exception 'Another bid is already accepted on this work package. Reconsider it first.';
    end if;
  end if;

  perform set_config('buildguru.allow_decision_write', 'on', true);
  update public.project_work_package_bids b
  set homeowner_decision = target_decision,
      homeowner_decided_at = case when target_decision = 'pending' then null else now() end,
      updated_at = now()
  where b.id = target_bid_id
  returning * into bid;
  perform set_config('buildguru.allow_decision_write', 'off', true);

  if target_decision = 'accepted' then
    update public.project_work_packages wp
    set status = 'awarded', awarded_bid_id = bid.id, awarded_at = now(), updated_at = now()
    where wp.id = bid.package_id;
  elsif pkg.awarded_bid_id = bid.id then
    -- Reconsidering / declining the accepted bid reopens the package.
    update public.project_work_packages wp
    set status = case when wp.bids_due_at is not null and wp.bids_due_at < now() then 'under_review' else 'open' end,
        awarded_bid_id = null, awarded_at = null, updated_at = now()
    where wp.id = bid.package_id;
  end if;

  evt := case target_decision
    when 'shortlisted' then 'bid_shortlisted'
    when 'accepted' then 'bid_accepted'
    when 'declined' then 'bid_declined'
    else 'bid_reconsidered' end;
  msg := case target_decision
    when 'shortlisted' then 'You were shortlisted for ' || pkg.title || '. The homeowner can now see your contact details.'
    when 'accepted' then 'Your bid on ' || pkg.title || ' was accepted. Homeowner contact details are now available.'
    when 'declined' then 'Your bid on ' || pkg.title || ' was not selected.'
    else 'The homeowner reopened their decision on ' || pkg.title || '.' end;

  perform public.log_work_package_event(bid.package_id, 'pro', bid.portfolio_id, evt, msg, null,
    jsonb_build_object('bid_id', bid.id, 'package_id', bid.package_id));

  return bid;
end;
$$;

revoke all on function public.set_work_package_bid_decision(uuid, text) from public, anon;
grant execute on function public.set_work_package_bid_decision(uuid, text) to authenticated, service_role;

create or replace function public.answer_work_package_question(target_question_id uuid, target_answer text)
returns public.project_work_package_questions
language plpgsql
security definer
set search_path = ''
as $$
declare
  q public.project_work_package_questions;
  pkg_title text;
begin
  if coalesce(char_length(btrim(target_answer)), 0) < 1 then
    raise exception 'Write an answer first';
  end if;

  update public.project_work_package_questions x
  set answer = left(btrim(target_answer), 3000),
      answered_at = now(),
      updated_at = now()
  where x.id = target_question_id
    and public.project_owned_by_user(x.project_id)
  returning * into q;

  if q.id is null then
    raise exception 'Question not found for this project';
  end if;

  select wp.title into pkg_title from public.project_work_packages wp where wp.id = q.package_id;
  perform public.log_work_package_event(q.package_id, 'pro', q.portfolio_id, 'question_answered',
    'The homeowner answered your question on ' || pkg_title, left(q.answer, 300),
    jsonb_build_object('question_id', q.id, 'package_id', q.package_id));

  return q;
end;
$$;

revoke all on function public.answer_work_package_question(uuid, text) from public, anon;
grant execute on function public.answer_work_package_question(uuid, text) to authenticated, service_role;

create or replace function public.mark_work_package_events_read(target_event_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  update public.project_work_package_events e
  set read_at = now()
  where e.id = any (target_event_ids)
    and e.read_at is null
    and (
      (e.audience = 'owner' and public.project_owned_by_user(e.project_id))
      or (e.audience = 'pro' and public.work_package_portfolio_owned(e.target_portfolio_id))
    );
  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.mark_work_package_events_read(uuid[]) from public, anon;
grant execute on function public.mark_work_package_events_read(uuid[]) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. Professional-facing views
-- ---------------------------------------------------------------------------
drop view if exists public.pro_work_package_opportunities;
create view public.pro_work_package_opportunities
with (security_barrier = true)
as
select
  wp.id as package_id,
  wp.project_id,
  wp.package_type,
  wp.eligible_crafts,
  wp.title,
  wp.summary,
  wp.scope_items,
  wp.inclusions,
  wp.exclusions,
  wp.pricing_basis,
  wp.site_visit_required,
  case when wp.show_budget_to_pros then wp.budget_hint_inr else null end as budget_hint_inr,
  wp.bids_due_at,
  wp.target_start,
  wp.target_completion,
  wp.max_bids,
  wp.status,
  wp.published_at,
  (
    select coalesce(jsonb_agg(jsonb_build_object('name', a ->> 'name', 'category', a ->> 'category')), '[]'::jsonb)
    from jsonb_array_elements(wp.attachments_json) a
  ) as attachment_names,
  coalesce(nullif(btrim(p.title), ''),
    case when p.flow_type = 'remodel' then 'Home remodel' else 'New home project' end
  ) as project_title,
  p.flow_type,
  coalesce(
    nullif(btrim(p.city), ''),
    nullif(btrim(split_part(p.location, ',', 1)), ''),
    'Location shared after acceptance'
  ) as city,
  nullif(btrim(p.state), '') as state,
  coalesce(
    nullif(btrim(pb.brief_json ->> 'room'), ''),
    nullif(btrim(pb.brief_json ->> 'homeType'), ''),
    case when p.flow_type = 'remodel' then 'Remodel scope' else 'New home scope' end
  ) as scope_label,
  nullif(btrim(pb.brief_json ->> 'areaSqFt'), '') as area_sqft,
  nullif(btrim(pb.brief_json ->> 'floors'), '') as floors,
  nullif(btrim(pb.brief_json ->> 'finishTier'), '') as finish_tier,
  case when jsonb_typeof(pb.brief_json -> 'styles') = 'array' then pb.brief_json -> 'styles' else '[]'::jsonb end as styles_json,
  (coalesce(pb.brief_json ->> 'v0Generated', 'false') = 'true') as has_ai_design_pack,
  (
    select count(*) from public.project_work_package_bids b
    where b.package_id = wp.id and b.status = 'submitted'
  ) as bid_count,
  (
    select count(*) from public.project_work_package_questions q
    where q.package_id = wp.id and q.answered_at is not null
  ) as answered_question_count,
  exists (
    select 1 from public.project_work_package_invites i
    join public.portfolios mine on mine.id = i.portfolio_id
    where i.package_id = wp.id and mine.owner_user_id = auth.uid()
  ) as invited_to_you
from public.project_work_packages wp
join public.projects p on p.id = wp.project_id
left join public.project_briefs pb on pb.project_id = p.id
where exists (
  select 1 from public.portfolios mine
  where mine.owner_user_id = auth.uid()
    and public.can_view_work_package(wp.id, mine.id)
);

revoke all on public.pro_work_package_opportunities from public, anon, authenticated;
grant select on public.pro_work_package_opportunities to authenticated;

comment on view public.pro_work_package_opportunities is
  'Trade-scoped work packages visible to eligible or invited professionals. Omits owner identity, street address, contact details, documents, and the raw brief.';

-- Answered questions are addenda: every eligible bidder sees them. Unanswered
-- questions stay private to the asker.
drop view if exists public.work_package_questions_for_pros;
create view public.work_package_questions_for_pros
with (security_barrier = true)
as
select
  q.id,
  q.package_id,
  q.question,
  q.answer,
  q.answered_at,
  q.created_at,
  public.work_package_portfolio_owned(q.portfolio_id) as asked_by_you
from public.project_work_package_questions q
where exists (
    select 1 from public.portfolios mine
    where mine.owner_user_id = auth.uid()
      and public.can_view_work_package(q.package_id, mine.id)
  )
  and (q.answered_at is not null or public.work_package_portfolio_owned(q.portfolio_id));

revoke all on public.work_package_questions_for_pros from public, anon, authenticated;
grant select on public.work_package_questions_for_pros to authenticated;

drop view if exists public.pro_awarded_work_packages;
create view public.pro_awarded_work_packages
with (security_barrier = true)
as
select
  b.id as bid_id,
  b.package_id,
  b.project_id,
  b.portfolio_id,
  wp.title as package_title,
  wp.package_type,
  p.title as project_title,
  p.flow_type,
  p.location,
  p.city,
  p.state,
  b.total_amount_inr,
  b.timeline_weeks,
  b.homeowner_decided_at,
  coalesce(nullif(btrim(up.full_name), ''), 'Homeowner') as homeowner_name,
  up.phone as homeowner_phone,
  up.email as homeowner_email
from public.project_work_package_bids b
join public.project_work_packages wp on wp.id = b.package_id
join public.projects p on p.id = b.project_id
join public.portfolios pf on pf.id = b.portfolio_id
left join public.user_profiles up on up.id = p.owner_user_id
where b.homeowner_decision = 'accepted'
  and b.status = 'submitted'
  and pf.owner_user_id = auth.uid();

revoke all on public.pro_awarded_work_packages from public, anon, authenticated;
grant select on public.pro_awarded_work_packages to authenticated;

comment on view public.pro_awarded_work_packages is
  'Work packages where the homeowner accepted the caller''s bid. The only path that releases homeowner contact details for a work package.';

-- ---------------------------------------------------------------------------
-- 9. Homeowner-facing bid view (professional identity, contact gated)
-- ---------------------------------------------------------------------------
drop view if exists public.work_package_bids_for_owner;
create view public.work_package_bids_for_owner
with (security_barrier = true)
as
select
  b.id as bid_id,
  b.package_id,
  b.project_id,
  b.portfolio_id,
  b.status,
  b.homeowner_decision,
  b.homeowner_decided_at,
  b.total_amount_inr,
  b.gst_included,
  b.pricing_basis,
  b.line_items,
  b.inclusions,
  b.exclusions,
  b.assumptions,
  b.timeline_weeks,
  b.can_start_on,
  b.warranty_months,
  b.advance_pct,
  b.payment_schedule_note,
  b.site_visit_done,
  b.valid_until,
  b.cover_note,
  b.revision,
  b.submitted_at,
  pf.craft,
  coalesce(nullif(btrim(pf.business_name), ''), nullif(btrim(pf.full_name), ''), 'Professional') as pro_name,
  pf.city as pro_city,
  pf.years_experience,
  pf.specialties,
  pf.profile_photo,
  pf.slug,
  pf.profile_strength,
  case when b.homeowner_decision in ('shortlisted', 'accepted') then pf.phone else null end as pro_phone,
  case when b.homeowner_decision in ('shortlisted', 'accepted') then pf.email else null end as pro_email,
  public.work_package_is_invited(b.package_id, b.portfolio_id) as was_invited
from public.project_work_package_bids b
join public.portfolios pf on pf.id = b.portfolio_id
where b.status = 'submitted'
  and public.project_owned_by_user(b.project_id);

revoke all on public.work_package_bids_for_owner from public, anon, authenticated;
grant select on public.work_package_bids_for_owner to authenticated;

comment on view public.work_package_bids_for_owner is
  'Submitted bids on the caller''s own work packages. Professional contact details appear only after the homeowner shortlists or accepts.';

-- ---------------------------------------------------------------------------
-- 10. Readiness contract
-- ---------------------------------------------------------------------------
create or replace function public.work_packages_ready()
returns boolean
language sql
stable
set search_path = public
as $$
  select
    exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'project_work_packages')
    and exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'project_work_package_bids')
    and exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'project_work_package_questions')
    and exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'project_work_package_events')
    and exists (select 1 from information_schema.views where table_schema = 'public' and table_name = 'pro_work_package_opportunities')
    and exists (select 1 from information_schema.views where table_schema = 'public' and table_name = 'work_package_bids_for_owner')
    and exists (select 1 from information_schema.views where table_schema = 'public' and table_name = 'pro_awarded_work_packages')
    and exists (select 1 from information_schema.routines where routine_schema = 'public' and routine_name = 'set_work_package_bid_decision');
$$;

grant execute on function public.work_packages_ready() to authenticated, service_role;

commit;

-- Verification (run separately):
-- select public.work_packages_ready();
--
-- As anon, every one of these must return 401/403:
--   project_work_packages, project_work_package_bids, project_work_package_invites,
--   project_work_package_questions, project_work_package_events,
--   pro_work_package_opportunities, work_package_bids_for_owner, pro_awarded_work_packages
--
-- With two disposable pro accounts (one electrician, one plumber) and one
-- homeowner account, confirm:
--   1. A published electrical package appears only to the electrician unless
--      the plumber is invited.
--   2. The 9th bid on a package with max_bids = 8 fails.
--   3. A bid revision resets homeowner_decision to pending and bumps revision.
--   4. The homeowner sees pro_phone / pro_email only after shortlist or accept.
--   5. Accepting a bid moves the package to 'awarded'; a second accept fails.
--   6. pro_awarded_work_packages returns homeowner contact only to the accepted pro.
--   7. An unanswered question is invisible to the other professional; once
--      answered, both see it.
