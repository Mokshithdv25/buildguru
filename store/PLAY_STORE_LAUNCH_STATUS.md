# BuildGuru Google Play launch status

Updated: 2026-09-07

## Current release candidate state

- Package ID: `in.buildguru.app`
- Target SDK: 35
- Version: `1.0` / version code `1`
- Capacitor Android project: present
- Production web build: passed with `npm run build:mobile`
- Android asset sync: passed with `npx cap copy android`
- Signed Android App Bundle: built successfully at `frontend/android/app/build/outputs/bundle/release/app-release.aab`
- Bundle signature verification: passed with the generated BuildGuru upload certificate
- Native bundle checks: no source-map files and no `localhost:8000` references in the synced Android web assets
- Store copy, privacy/data-safety draft, screenshots, privacy route, terms route, and account deletion flow: present

## Blocking items before Play upload

1. Back up the generated upload keystore and credentials securely outside the repository before publishing. The keystore is currently protected by `frontend/android/.release/.gitignore`.
2. In Play Console complete App access, Ads, Content rating, Target audience, Data safety, Financial features, countries, and staged rollout settings.
3. Use dedicated homeowner and professional review accounts and replace any screenshot that contains a real professional without explicit permission.

## Product and policy gates

- Keep billing disabled in the native build until Google Play Billing or an allowed alternative-billing implementation is complete.
- Keep Razorpay checkout web-only for this release.
- Confirm production Supabase schema/RLS probes, email confirmation/recovery delivery, Render readiness, and account deletion before publishing.
- Confirm the final privacy/data-safety answers against the exact production providers and storage configuration.

## Validation already recorded

- `frontend` production build passed.
- `npm run build:mobile` and `npx cap copy android` built the mobile web bundle and copied it into Android; full `npm run cap:sync` still stops at iOS because Xcode is not installed/selected on this machine.
- The Android project uses `in.buildguru.app`, target SDK 35, and release signing is intentionally conditional on environment-only secrets.
