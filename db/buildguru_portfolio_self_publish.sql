-- BuildGuru portfolio self-publishing migration.
-- Run this entire file once in the Supabase SQL Editor after the production
-- one-shot schema. It removes the old pre-publication review trigger while
-- preserving the approved public projection and report-based quarantine.

begin;

drop trigger if exists trg_portfolio_moderation_insert on public.portfolios;
drop trigger if exists trg_portfolio_moderation_update on public.portfolios;
drop function if exists public.enforce_portfolio_moderation();

-- Portfolios already submitted under the former review flow become live now.
update public.portfolios
set moderation_status = 'approved', updated_at = now()
where published = true
  and moderation_status = 'pending';

-- Public discovery remains restricted to explicitly published profiles. A
-- repeatedly reported profile is returned to pending by the existing safety
-- quarantine function and therefore disappears from this projection.
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
where published = true
  and moderation_status = 'approved';

revoke all on public.published_portfolios from public, anon, authenticated;
grant select on public.published_portfolios to anon, authenticated;

commit;

select
  count(*) filter (where published = true and moderation_status = 'approved') as live_portfolios,
  count(*) filter (where published = true and moderation_status = 'pending') as still_waiting
from public.portfolios;
