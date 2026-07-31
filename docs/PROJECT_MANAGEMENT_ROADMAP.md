# Project management — future build roadmap

This document captures **what still needs to be designed, specified, and implemented** for BuildGuru project management. It is the source of truth for scope; the in-app `/project` screen is a **visual shell / demo** aligned with the product reference, not a finished backend feature set.

---

## Clarification (process)

- **Roadmap vs. UI prototype:** Product ideas (to-do, scheduling, marketplace, APIs, mandatory fields, etc.) belong here first. Shipping them requires specs, API contracts, auth, and QA — not only JSX.
- **Reference UI:** The target layout is the dashboard reference: phase strip → tasks + site feed & budget → discussion + milestones, soft panels on a warm canvas, compact sidebar (Overview … Settings).

---

## Near-term (MVP)

| Area | What to build | Notes |
|------|----------------|-------|
| **v0 → PM bridge** | ✅ Initial: `project_v0_packs` + `persistFlowAfterV0` on generate; handoff upserts same `projectId` | Run `db/project_pm_v0.sql` in Supabase; signed-in user gets `owner_user_id` when column exists |
| **Tasks** | Real task model: assignee, due date, phase link, comments, completion audit | Replace demo array with API + optimistic UI |
| **Timeline / phases** | Persist phase % and status; drill-down per phase | Today’s gauges are static |
| **Discussion** | Threaded messages, attachments, @mentions, read receipts | Wire to realtime or polling |
| **Site feed** | Upload pipeline, live flag, gallery carousel | Storage + moderation |
| **Budget** | Actuals vs. forecast, variance alerts, export | Needs ledger integration |
| **Milestones** | Dependencies, slack/float, ICS export | Link to schedule below |
| **Documents** | Deep link from nav; folder ACL | Route exists at `/documents` |
| **Auth & project access** | Multi-tenant project membership, roles | Blocks most features above |

### AI product roadmap — validated ideas, not current UI promises

These ideas should ship only after the persistent project workspace is stable and the underlying artifact permissions, audit trail, and evaluation quality are proven.

- [ ] **Project-artifact copilot (RAG):** answer homeowner and pro questions from approved briefs, drawings, BOQs, contracts, receipts, site photos, and discussion history, with citations back to the exact artifact.
- [ ] **Quantity takeoff and cost estimation agents:** extract quantities from approved drawings, maintain BOQ revisions, flag variance against actual payments, and require human sign-off before replacing a baseline.
- [ ] **Scheduling agent:** propose dependencies, update forecasts from task/site evidence, explain slippage, and draft reminders without silently changing contractual dates.
- [ ] **Drawing and documentation agents:** maintain floor-plan/elevation revision histories and draft RFIs, work orders, meeting minutes, approval trackers, and handover packs.
- [ ] **Site-photo intelligence:** compare dated progress photos with stages and drawings, surface possible delays or quality questions, and clearly label all observations as advisory.
- [ ] **Contractor matching:** match project scope, location, budget, availability, credentials, and portfolio evidence; keep homeowner choice and transparent ranking controls.
- [ ] **Agent-assisted shopping:** build material shortlists from the BOQ and design intent, compare compatible products and delivery constraints, and require confirmation before any cart or purchase action.
- [ ] **Professional portfolio product:** give pros a polished public portfolio, verified project evidence, service coverage, inquiry management, and an optional paid visibility tier without degrading organic relevance.

---

## Product backlog (your requested themes)

### 1. To-do list (distinct from “tasks”)

- [ ] Separate **quick to-dos** vs **construction tasks** (WBS-style).
- [ ] Recurrence, snooze, and “blocked by” links.
- [ ] Optional: personal vs. shared project checklist.

### 2. Scheduling

- [ ] Calendar month/week views on **Schedule** (or Timeline) tab.
- [ ] Drag site visits, holds, and milestone dates; timezone + reminders.
- [ ] Google / Outlook **read/write** sync (OAuth) — see APIs.

### 3. Marketplace

- [ ] From project: RFQ to matched pros, compare quotes, award work.
- [ ] Status sync back into **Budget** and **Tasks**.
- [ ] Nav entry only after PM ↔ marketplace contract is defined.

### 4. API connections

- [ ] Webhooks: task created, RFI answered, payment milestone released.
- [ ] API keys: create, rotate, revoke; signed payloads.
- [ ] Rate limits, retry policy, dead-letter queue for failed deliveries.
- [ ] Partner integrations (Slack/Teams) as separate OAuth apps.

### 5. Mandatory fields & gating

- [ ] Configurable **required fields** per project type (new build vs. remodel).
- [ ] Block actions (e.g. release payment, invite vendor) until checklist complete.
- [ ] Compliance docs: permit refs, COI, POC — versioned uploads.

---

## UX / UI polish (post-layout match)

- [ ] Responsive breakpoints: collapse to single column; sidebar drawer on mobile.
- [ ] Skeleton loaders and empty states for each panel.
- [ ] Accessibility: focus order, live regions for chat, contrast on status chips.

---

## Engineering foundations

- [ ] API: REST or GraphQL schema for `Project`, `Task`, `Message`, `Milestone`, `BudgetLine`.
- [ ] Realtime: WebSocket or SSE for discussion + feed.
- [ ] Notifications: email + push + in-app (bell in header).
- [ ] Audit log for money and contract-sensitive changes.

---

## Out of scope (until above stabilises)

- Full Gantt / critical path solver.
- Native mobile apps (reuse responsive web first).

---

*Last updated: product team — align this file before expanding `/project` beyond the reference shell.*
