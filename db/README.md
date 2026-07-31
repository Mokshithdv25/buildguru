# Production database rollout

These scripts are intended for the Supabase SQL Editor. Take a database backup or restore-point snapshot first, run each script to completion, and stop if any statement fails. Do not continue with a partially applied sequence.

## Choose one migration path

Before any production hardening, classify legacy anonymous projects. Launch mode
does not let a browser claim an unowned UUID because that would let anyone who
discovered an ID take another person's project.

```sql
select count(*) as anonymous_projects,
       min(created_at) as oldest,
       max(created_at) as newest
from public.projects
where owner_user_id is null;

select id, title, source, created_at
from public.projects
where owner_user_id is null
order by created_at desc;
```

If rows exist, stop the rollout. Export them, map ownership only from verified
support/account evidence, and purge rows that cannot be safely attributed after
the communicated recovery window. There is intentionally no automatic
client-side claim path.

| Database state | Run in this order |
| --- | --- |
| Existing BuildGuru production schema | `buildguru_rls_hardening.sql` → `buildguru_project_workspace.sql` → `buildguru_pro_leads.sql` → `buildguru_project_intelligence.sql` → `buildguru_careers.sql` |
| Empty Supabase project | `buildguru_single_setup.sql` → `buildguru_rls_hardening.sql` → `buildguru_project_workspace.sql` → `buildguru_pro_leads.sql` → `buildguru_project_intelligence.sql` → `buildguru_careers.sql` |
| Older v1/v1.1/v1.2 schema missing current columns or buckets | `buildguru_supabase_align.sql` → `buildguru_rls_hardening.sql` → `buildguru_project_workspace.sql` → `buildguru_pro_leads.sql` → `buildguru_project_intelligence.sql` → `buildguru_careers.sql` |
| Intentionally discard all BuildGuru data | Empty the four app buckets through Storage Admin, delete disposable users through Auth Admin, then `buildguru_production_reset.sql` → `buildguru_single_setup.sql` → `buildguru_rls_hardening.sql` → `buildguru_project_workspace.sql` → `buildguru_pro_leads.sql` → `buildguru_project_intelligence.sql` → `buildguru_careers.sql` |

`buildguru_single_setup.sql` is now fail-closed: it enables RLS, revokes anonymous table access, and creates private buckets without broad policies. The app is not ready until the hardening and workspace scripts also succeed, but an interrupted bootstrap does not expose the database.

`buildguru_production_reset.sql` is destructive and refuses to run while any BuildGuru storage object remains. Delete files through Storage Admin rather than deleting `storage.objects` rows directly. SQL does not delete Auth users; use Auth Admin when the accounts are also disposable. SMTP and confirmation-email delivery are Auth configuration and remain separate from every database script.

`supabase_storage.sql` is a standalone storage repair/reference script. The canonical production paths above already create or harden the required buckets; if this repair script is used later, re-run `buildguru_rls_hardening.sql` afterward and repeat the probes below.

## What the required scripts establish

- Owner-scoped RLS for projects, briefs, generated packs, stages, tasks, messages, documents, team members, and payment-ledger rows.
- Private `project-v0`, `project-documents`, and `portfolio-media` buckets with owner/path-scoped policies.
- A public, read-only `published_portfolios` view that excludes owner IDs, street address, email, phone, and license numbers.
- Backend-only writes to billing orders and entitlements; authenticated users may read only their own rows.
- A backend-only, atomic UTC-day counter that limits real AI image-pack requests per user.
- Workspace tables and progress triggers used by the web and native project hub.
- A professional lead inbox backed by a privacy-safe homeowner-project projection. It omits homeowner IDs, contact details, full location, and raw brief content; each professional can modify only responses tied to their own portfolio.
- An owner-scoped editable material takeoff and an approval log for AI-suggested follow-ups, professional shortlists, document reviews, and material-plan decisions.
- Public career listings and OAuth-free applications with private work-sample uploads, plus a separate trusted hiring-admin membership. Applicants may explicitly publish the safe portfolio projection; email and phone are never included in that public view.

## SQL verification

Run the readiness contract first. It must return `true`:

```sql
select public.launch_schema_ready();
select public.project_intelligence_ready();
```

Then inspect RLS directly. Every listed table must report `rls_enabled = true`.

```sql
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'portfolios', 'projects', 'project_briefs', 'project_v0_packs',
    'project_stages', 'project_tasks', 'project_messages', 'project_documents',
    'project_team_members', 'project_payments', 'billing_orders',
    'user_entitlements', 'ai_usage_daily', 'project_lead_responses',
    'project_material_items', 'project_agent_actions', 'career_admins',
    'career_jobs', 'career_applications'
  )
order by c.relname;
```

Seed each hiring admin only through the trusted SQL Editor/service role. This
does not change the homeowner/pro role stored in `user_profiles`:

```sql
insert into public.career_admins (user_id)
select id from auth.users where email = 'YOUR_ADMIN_EMAIL'
on conflict (user_id) do nothing;
```

Confirm the storage posture:

```sql
select id, public
from storage.buckets
where id in ('project-v0', 'project-documents', 'portfolio-media', 'career-work-samples')
order by id;
```

Expected: all four buckets report `public = false`. Portfolio owners can read their own media. Anonymous and authenticated public readers can select only an exact portfolio object referenced by a published portfolio or an opted-in published career profile; the frontend turns that permitted read into a short-lived signed URL. Career application photos remain private when the publish option is not selected.

## Anonymous API probes

Use the browser-safe Supabase anon/publishable key, never the service-role key:

```bash
export HM_SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
export HM_SUPABASE_ANON_KEY="YOUR_ANON_OR_PUBLISHABLE_KEY"

curl -i "$HM_SUPABASE_URL/rest/v1/published_portfolios?select=*&limit=1" \
  -H "apikey: $HM_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $HM_SUPABASE_ANON_KEY"

curl -i "$HM_SUPABASE_URL/rest/v1/projects?select=id&limit=1" \
  -H "apikey: $HM_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $HM_SUPABASE_ANON_KEY"

curl -i "$HM_SUPABASE_URL/rest/v1/billing_orders?select=id&limit=1" \
  -H "apikey: $HM_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $HM_SUPABASE_ANON_KEY"

curl -i "$HM_SUPABASE_URL/rest/v1/pro_lead_opportunities?select=*&limit=1" \
  -H "apikey: $HM_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $HM_SUPABASE_ANON_KEY"
```

The published view should return `200` and only the safe portfolio projection. The project, billing, and professional-lead requests must return `401` or `403`; any anonymous row is a release blocker. Repeat the private-table probe for `project_briefs`, `project_v0_packs`, `project_stages`, `project_tasks`, `project_messages`, `project_documents`, `project_team_members`, `project_payments`, `project_lead_responses`, and `user_entitlements`.

With two disposable professional accounts, confirm that each can see open, non-targeted project opportunities but only its own targeted opportunities and response rows. The `pro_lead_opportunities` response must never contain `owner_user_id`, `location`, contact fields, `dream_vision`, `inspirations_json`, or `brief_json`. Confirm that changing a response to another professional's `portfolio_id` fails.

Verify portfolio media with one draft portfolio and one published portfolio, each containing a disposable image at the required `{owner_user_id}/{portfolio_id}/...` path:

```bash
export HM_PUBLISHED_MEDIA_PATH="OWNER_UUID/PUBLISHED_PORTFOLIO_UUID/test.webp"
export HM_DRAFT_MEDIA_PATH="OWNER_UUID/DRAFT_PORTFOLIO_UUID/test.webp"

curl -i -X POST \
  "$HM_SUPABASE_URL/storage/v1/object/sign/portfolio-media/$HM_PUBLISHED_MEDIA_PATH" \
  -H "apikey: $HM_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $HM_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"expiresIn":60}'

curl -i -X POST \
  "$HM_SUPABASE_URL/storage/v1/object/sign/portfolio-media/$HM_DRAFT_MEDIA_PATH" \
  -H "apikey: $HM_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $HM_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"expiresIn":60}'
```

The published-path request should return a short-lived signed URL. The draft-path request must fail. Also verify that swapping either UUID in the published path fails, the direct `/storage/v1/object/public/portfolio-media/...` URL fails for both images, and the signed URL stops working after expiry.

Finally, create two disposable authenticated accounts. Each account must be able to read and modify its own project, but an attempted read using the other account's project ID must return no rows. Delete both accounts and their test data after verification.

## Portfolio safety operations

Professionals self-publish immediately with `moderation_status = 'approved'`.
Run `buildguru_portfolio_self_publish.sql` once on installations that used the
older review-gated schema. Continue to review user reports after publication:

```sql
select r.*, p.slug, p.full_name
from public.portfolio_reports r
join public.portfolios p on p.id = r.portfolio_id
where r.status in ('open', 'reviewing')
order by r.created_at;
```

Quarantine a reported portfolio with a trusted SQL Editor/service-role operation
while it is investigated:

```sql
update public.portfolios
set moderation_status = 'pending', updated_at = now()
where id = 'REPORTED_PORTFOLIO_ID';
```

Resolve or reject reports promptly and record the outcome in
`portfolio_reports.status`. Never expose service-role credentials in a client.
