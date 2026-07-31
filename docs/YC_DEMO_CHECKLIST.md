# YC / investor demo checklist

Run through this **once** before sharing the live link. Production: Vercel frontend + Render API + Supabase.

## Must work (do not skip)

1. **Vercel env** — `REACT_APP_SUPABASE_URL`, `REACT_APP_SUPABASE_ANON_KEY`, `REACT_APP_BACKEND_URL` = `https://buildguru-6o3h.onrender.com` (no `/api`). Redeploy after changes.
2. **Supabase SQL** — `db/buildguru_single_setup.sql` then **`db/buildguru_rls_hardening.sql`** if production still has MVP anon/RLS-off policies.
3. **Redeploy Vercel** after this branch — deep links need root asset paths (`homepage` removed; `PUBLIC_URL` empty in `frontend/vercel.json`).
4. **Sign in with Email or Google** — not phone OTP (disabled in production).
5. **Homeowner path:** `/sign-in?role=homeowner` → `/build` → new home or remodel → generate v0 → handoff → URL must include `projectId=…`.
6. **Pro path:** `/sign-in?role=pro` → portfolio wizard → Go live → `/browse` + **`/profile/your-slug`** (only after publish; no `demo-pro` unless you create it).
7. **Public portfolio** — open your slug in an incognito window; must not show another user’s draft from this browser.
8. **Paid plan** — `/subscriptions` → Razorpay Test Mode checkout → successful payment must return as Active after server verification.
9. **Failed payment** — use the Razorpay failure path; the account must remain Free and no entitlement may be created.

## Safe demo script (5 min)

| Step | URL / action |
|------|----------------|
| Landing | Homepage scroll — hero, Start here, How it works |
| Homeowner | Sign in (homeowner) → Build → New home → short wizard → Generate v0 → Continue to hub |
| Project hub | Confirm your project title in sidebar + v0 images (not only Unsplash if API healthy) |
| Marketplace | `/browse` — published pros (empty if none live yet) |
| Pro | Sign out → Sign in (pro) → Dashboard → Leads → Finish/preview portfolio link |

## Known limitations (OK to say out loud)

- Pro dashboard metrics are **sample data** until CRM ships.
- Milestone **payment protection** is product direction, not live escrow yet.
- Phone OTP is **coming soon**; email/Google are real auth.
- `/project` while signed out shows sign-in CTA only (no sample Sharma/Neha dashboard).
- Deep links (`/profile/…`, `/build/new-home`, `/project/journey`) require a fresh Vercel deploy with root `/static/…` assets.

## If something breaks

- **Blank sign-in:** hard refresh; check Supabase env on Vercel.
- **Stock photos on v0:** Render `XAI_API_KEY`; regenerate v0 after deploy.
- **Handoff with no project:** sign in before wizard; check Supabase `projects` + align SQL.
- **Checkout unavailable:** confirm all three `RAZORPAY_*` values and `SUPABASE_SERVICE_ROLE_KEY` on Render, then check `/api/ai/status` for `payments_configured: true`.
- **Wrong name after login:** sign out, sign in again (device cache clears on user switch).
