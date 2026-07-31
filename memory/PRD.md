# BuildGuru — Portfolio Builder

## Original Problem Statement
Build the BuildGuru onboarding page (Step 1 — "What's your craft?") per the provided mockup.
User clarifications:
- Build first page fully functional
- Backend to save portfolio data (MongoDB)
- Live preview updates dynamically
- Single select (only one craft)
- Continue button disabled until selection
- Subsequent pages (Details / Portfolio / Go Live) mockups will be provided later

## Architecture
- **Frontend**: React (CRA) + Tailwind + lucide-react. Fonts: Fraunces (serif display), DM Sans (body), Caveat (script annotations). Page at `/app/frontend/src/pages/CraftSelection.jsx`.
- **Backend**: FastAPI, `/api/portfolio` CRUD. MongoDB collection `portfolios`. All datetimes ISO-stored.
- **Data flow**: Selecting a craft + Continue → `POST /api/portfolio {craft}` → response stored in `localStorage` (`hm_portfolio_id`, `hm_craft`) ready for Step 2.

## User Personas
- Architects, designers, engineers
- Contractors
- Skilled trades (plumbers, electricians, painters, carpenters)

## Core Requirements (static)
- Craft selection across 3 groups: Design Professionals, Build Professionals, Skilled Trades
- Live preview card mirroring the chosen craft
- Progress rail (Step 1 → 4) with per-step labels
- Profile Strength indicator (ring + percent)
- Privacy reassurance footer
- Single-select, disabled Continue until selection

## Implemented (Jan 2026)
- Step 1 "What's your craft?" page pixel-close to mockup
- 8 craft cards with custom icon, tint, tagline, hero image, and specialties
- Live preview card dynamically updating hero, badge, craft label, and specialty chips
- Animated checkmark + orange border on selected card
- Profile Strength ring animates 15% → 25% on selection
- Continue button disabled/enabled state + hover arrow micro-animation
- Sticky bottom footer with privacy note + Continue CTA (clear of Emergent badge)
- Backend endpoints: `POST /api/portfolio`, `GET /api/portfolio/{id}`, `PATCH /api/portfolio/{id}`
- MongoDB persistence with UUID ids (no ObjectId leakage)
- `localStorage` continuity for upcoming steps

## Backlog / P0 Next
- Step 2 "Your Details" (name, city, about, specialties) — awaiting mockup
- Step 3 "Your Portfolio" (project uploads) — awaiting mockup
- Step 4 "Go Live" (publish) — awaiting mockup
- Wire Continue button to navigate to Step 2 once built
- Patch endpoint will be reused for each subsequent step

## P1
- Load existing portfolio on mount if `hm_portfolio_id` already exists (resume flow)
- Authenticated sessions (currently anonymous)
- Image upload integration for portfolio hero / project tiles

## P2
- Server-side validation / rate limiting
- Analytics on step drop-off
- i18n support
