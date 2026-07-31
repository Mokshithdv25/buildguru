# BuildGuru

India’s home platform: AI design and estimates, marketplace, project hub, and materials — homeowners and pros on the same projects.

**Repo:** [buildgurufinal](https://github.com/Mokshithdv25/buildgurufinal) · **Web:** Vercel · **API:** Render

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Web frontend + mobile app (React, Capacitor iOS/Android)   │
│  Web frontend hosted on Vercel                              │
└──────────────────────────┬──────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┬─────────────────┐
         ▼                 ▼                 ▼
┌─────────────┐   ┌─────────────┐   ┌─────────────────────┐
│  Supabase   │   │  Render     │   │  xAI (Grok)         │
│  Auth, DB,  │   │  FastAPI    │   │  Floor plans &      │
│  storage    │   │  backend    │   │  design images      │
└─────────────┘   └─────────────┘   └─────────────────────┘
                                              ┌─────────────┐
                                              │  Razorpay   │
                                              │  INR plans  │
                                              └─────────────┘

Domain / DNS: Ionos
Source control: GitHub
```

| Layer | Role |
|--------|------|
| **Frontend** | React (CRA + CRACO), Tailwind, Framer Motion; Capacitor for native shells |
| **Backend** | Python FastAPI on Render — AI generation, project flow APIs |
| **Data** | Supabase (Postgres, auth, file storage) |
| **AI** | Grok via xAI API (`XAI_API_KEY` on Render) |
| **Payments** | Razorpay Standard Checkout; the backend creates orders, verifies captures, handles webhooks, and records entitlements |
| **Hosting** | Vercel (frontend only), Render (FastAPI), Ionos (domain) |

---

## Capabilities today

**Homeowners**

- New-home and remodel wizards with **AI layouts, visuals, and estimates**
- Sign-in–gated flows; project pack can persist to Supabase
- Marketing site and inspiration content
- Project hub for saved v0 packs, briefs, and seeded phases/tasks after handoff
- Browse marketplace and shop (catalog UI; checkout not live)
- Razorpay Test Mode checkout for the ₹4,999 Project Pass, with server-side capture verification

**Professionals**

- Onboarding: craft → details → portfolio → go live
- Public portfolio (`/profile/:slug`)
- ₹1,999 Pro Growth 30-day pass through Razorpay Test Mode
- Pro dashboard and leads UI (sample metrics labeled in-app where applicable)

**Mobile**

- Capacitor apps (iOS / Android) sharing the same React codebase

**Not built yet**

- Two-sided “project posted → pro opts in” marketplace loop
- Homeowner ↔ pro messaging and hire/award flow
- Live milestone **payment protection** (escrow / payouts)
- Full agentic materials checkout
- **Financing / AI financier matching** (project + credit) — later

---

## Vision & roadmap

**North star:** One place from idea to move-in. Homeowner builds a rich **project package** (design + estimates + details). Contractors **see it and choose to work on it**; homeowners **pick and message** pros. Same hub for execution, **agentic materials shopping** (AI suggests, human approves), and **milestone payment protection**.

**Next (in order)**

1. Project as a marketplace object (shared designs/estimates, access control)
2. Pro project feed — discover jobs, express interest
3. Hire flow — shortlist, message, award
4. Project management MVP — real tasks, phases, site feed, discussion
5. Agentic shop v1 — BOM-linked materials, approval before buy
6. Payment protection v1 — milestones, hold/release, pro payouts

**Later**

- AI **financier matching** (project context + credit score, with consent/compliance)
- Construction financing UX (partners, legal) — only after payments core

---

## Stack & tools

| Tool | Use |
|------|-----|
| **GitHub** | Source, `buildgurufinal` main branch |
| **Vercel** | Production frontend only |
| **Render** | Production API |
| **Supabase** | Database, auth, storage |
| **Ionos** | Domain / DNS |
| **xAI (Grok)** | AI floor plans and design images |
| **Razorpay** | India payment gateway for paid account plans |
| **Capacitor** | Native iOS & Android |
| **FastAPI** | Backend |
| **React** | Web and mobile UI |

---

## Launch activation

Treat a deployment as a release candidate only when both Vercel and Render are running the same reviewed revision and the live checks below pass.

1. Apply the production Supabase migrations in the documented order. Existing schemas use `db/buildguru_rls_hardening.sql`, then `db/buildguru_project_workspace.sql`; fresh projects first use the fail-closed `db/buildguru_single_setup.sql`. Intentional clean resets and legacy upgrades have separate paths in [db/README.md](db/README.md).
2. Keep production email account creation disabled until custom SMTP delivery, confirmation, and password recovery pass end-to-end tests. Google OAuth is the current account-creation path. Allow `https://www.buildguru.online/sign-in`, `https://buildguru.online/sign-in`, and `in.buildguru.app://auth/callback`; require email confirmation before re-enabling email sign-up. Sign in with Apple remains a release blocker for App Store submission.
3. Build the frontend with Node 20. Keep the non-secret production origins in `frontend/.env.production`; set `REACT_APP_SUPABASE_URL` and `REACT_APP_SUPABASE_ANON_KEY` in Vercel and in ignored `frontend/.env.production.local` for native release builds.
4. On Render, set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `XAI_API_KEY`, and the three `RAZORPAY_*` values from `backend/.env.example`. Keep `ALLOW_AI_MOCKS=false`.
5. Deploy Render and verify `/health/ready`, `/api/ai/status`, and an authenticated `/api/ai/hub-assistant` request. Then deploy the Vercel frontend and confirm its API traffic goes to Render.
6. Run the anonymous and cross-account RLS probes in [db/README.md](db/README.md). Public discovery must use only `published_portfolios`; anonymous requests to project and billing tables must fail.
7. Keep Razorpay in Test Mode. A paid webhook currently records an entitlement, but paid feature access is not yet enforced from that entitlement. Live keys and real charges remain blocked until those product gates are implemented and tested.

*Full release gate: [store/RELEASE_CHECKLIST.md](store/RELEASE_CHECKLIST.md). Detailed PM backlog: [docs/PROJECT_MANAGEMENT_ROADMAP.md](docs/PROJECT_MANAGEMENT_ROADMAP.md). Native build notes: [docs/MOBILE.md](docs/MOBILE.md). Pitch competitor framing: [docs/COMPETITIVE_POSITIONING.md](docs/COMPETITIVE_POSITIONING.md) (Material Depot, Room Story AI, Livspace / Homelane vs. us).*
