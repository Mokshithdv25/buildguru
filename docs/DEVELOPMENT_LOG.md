# BuildGuru development log

**Purpose:** One place in the repo for *what you asked for* and *what we shipped*, alongside git and Cursor transcripts.

**How to update:** After a meaningful session, add a dated section at the top of [Session notes](#session-notes) and link new commits from `git log`.

---

## Where records live

| Source | Location | What it captures |
|--------|----------|------------------|
| **This file** | `docs/DEVELOPMENT_LOG.md` | Human-readable requests → outcomes (you are here) |
| **Git** | `buildgurufinal` / `main` | Every **committed** code change + commit message |
| **Cursor agent transcript** | `~/.cursor/projects/Users-mokshith-Documents-buildguru-1/agent-transcripts/<uuid>/<uuid>.jsonl` | User/assistant messages (~2.1 MB main session); tool diffs often redacted |
| **Cursor chat UI** | This thread in the IDE | Full conversation; long threads may be **summarized** for the model |
| **Deploy logs** | Vercel + Render dashboards | Build/deploy events, not product requests |

**Main session transcript (most of the Grok/auth/deploy work):**  
`b2f4edb4-b9bf-48bf-8754-1887c096a3d6` — cite in chat as [Grok & demo session](b2f4edb4-b9bf-48bf-8754-1887c096a3d6).

Other transcript files in that folder are shorter or older chats.

---

## Session notes

### 2026-05-25 — Slim v0 pack (1 build elevation, remodel design-only)

**Request:** New build = 1 front holistic image + floor plans; remodel = 1–2 sequential angles from user photos, no floor plans.

**Shipped:** `GROK_V0_NEW_HOME_IMAGES=1`, `GROK_V0_REMODEL_IMAGES=2`, `GROK_V0_REMODEL_FLOOR_PLANS=0`; `inspirationImages` in brief; first concept uses xAI edit from uploads.

---

### 2026-05-25 — Floor plan multi-level refs (sequential only)

**Request:** Confirm sequential (not parallel prompts) for 2 design views; 3rd floor plan must see 1st + 2nd context.

**Shipped:** `_floor_plan_reference_urls` — up to 3 xAI refs: concept + ground + floor below (top floor uses two floors below). Concepts unchanged: image 2 via `/images/edits` from image 1.

---

### 2026-05-25 — Coherent Grok v0 + audit trail

**Requests (user):**
- Two design images looked like **different homes**; want image 2 generated from image 1 (another angle).
- Floor plans must match designs and **wizard selections**; ground/first floors should relate.
- Earlier: instant **placeholders** instead of waiting for Grok; hide dev/API copy; open demo without auth walls; Render vs Cloud Run vs Supabase.

**Shipped (git):**
| Commit | Summary |
|--------|---------|
| `c9b9e1a` | G+2 floor plan prompt fix |
| `54936c4` | Sequential Grok concepts (edit API), chained floor plans, full brief in prompts |
| `c288be9` | Wait for Grok, wake Render, no production mock fallback, clear stale localStorage v0 |
| `e777432` | Remove technical placeholder banners from UI |
| `a8a394b` | Harden v0-images API, strip embarrassing copy |
| `30346c8` | Fix production v0-images 500 + fallbacks |
| `20d09b8` | `AUTH_UI_ENABLED = false` open demo |

**Infra reminder:** Backend changes need **Render** redeploy; frontend needs **Vercel** + `REACT_APP_BACKEND_URL=https://buildguru-6o3h.onrender.com`.

---

### 2026-05 (earlier in same transcript) — Grok, auth, domain, marketplace

**Themes → work (not every commit; see `git log` before `54ac8ba`):**

| Theme | Outcome |
|-------|---------|
| Integrate **Grok** ($5 xAI credits) for build/remodel v0 | `backend/server.py` + `frontend/src/lib/aiApi.js` |
| **buildguru.online** on Vercel | Domain DNS; env vars on Vercel |
| **Google / email sign-in** | Supabase auth, redirect URLs, RLS SQL |
| Sign-in → **build/remodel** + profile menu | Routing, `HmUserMenu`, guards |
| Remodel showing **exteriors** / wrong estimate | Prompt + budget-anchored estimate fixes |
| **Find Pros** = search + location, results from published portfolios | Marketplace/browse changes |
| **Larger v0 images** in wizard | `V0MockResults.jsx` layout |
| Pitch deck, logo PNG, YC copy | `buildguru_pitch_v2.html`, docs |
| **Mobile** (Capacitor) | `docs/MOBILE.md`, mobile shell |
| Persist v0 to **project management** / Supabase | `projectFlowApi`, projects table |
| Only **2 complementary** Grok images per v0 (credits) | `GROK_V0_MOOD_IMAGES=2` |

---

## Git timeline (recent `main`)

```
c9b9e1a Fix G+2 floor plan prompt image reference
54936c4 Chain Grok v0 images for one coherent home design
c288be9 Wait for Grok v0 images instead of instant placeholders
e777432 Present v0 packs as product UI with no demo disclaimers
a8a394b Remove technical v0 placeholder copy; harden image API
30346c8 Fix production v0-images 500 and resilient AI fallbacks
6c1e64e Harden Vercel build against CI eslint failures
b5760ae Fix Vercel CI build: LandingNavbar hook deps
20d09b8 Disable auth UI for open demo access
54ac8ba Fix Vercel deep links, RLS hardening, and UAT UX gaps
```

Full history: `git log --oneline buildgurufinal/main`

---

## Related docs

- `docs/YC_DEMO_CHECKLIST.md` — pre-demo verification
- `docs/MOBILE.md` — iOS/Android
- `backend/.env.example` — Grok + Supabase env vars
- `render.yaml` — Render service defaults

---

## Template (copy for next session)

```markdown
### YYYY-MM-DD — Short title

**Requests:**
- …

**Shipped:**
| Commit | Summary |
|--------|---------|
| `abcdef0` | … |

**Notes / follow-up:**
- …
```
