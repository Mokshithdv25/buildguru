# BuildGuru frontend

The shared React client for the BuildGuru web product and Capacitor iOS/Android apps. It covers homeowner design flows, professional portfolios, project workspaces, account management, and the mobile experience.

## Local development

Use Node 20 and npm 10. Copy `.env.example` to `.env.local`, provide the browser-safe Supabase URL and anon/publishable key, then run:

```bash
npm install
npm start
```

The local dev proxy forwards `/api` requests to the FastAPI backend. Never place a Supabase service-role key, an AI key, or a payment secret in a `REACT_APP_*` variable.

## Release checks

```bash
npm run verify:client-env
npm run build
npm run build:mobile
```

Production builds disable source maps. Native builds also reject HTTP/localhost endpoints and secret-looking frontend credentials before bundling. After a mobile build, copy the bundle into the native projects with the Capacitor commands documented in [MOBILE.md](../docs/MOBILE.md).

The complete deployment, database, auth, privacy, and store gates are in the root [README](../README.md), [database runbook](../db/README.md), and [release checklist](../store/RELEASE_CHECKLIST.md).
