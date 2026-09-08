# BuildGuru Google Play launch status

Updated: 2026-09-07

## Current release candidate state

- Package ID: `in.buildguru.app`
- Target SDK: 35
- Version: `1.0` / version code `1`
- Capacitor Android project: present
- Production web build: passed with `npm run build:mobile`
- Android asset sync: passed with `npx cap copy android` / `npx cap sync` up to the Android step
- Native bundle checks: no source-map files and no `localhost:8000` references in the synced Android web assets
- Store copy, privacy/data-safety draft, screenshots, privacy route, terms route, and account deletion flow: present

## Blocking items before Play upload

1. Install or select JDK 17 on the release machine. The current machine reports no Java runtime, so Gradle cannot produce a fresh release bundle.
2. Generate and back up the production upload keystore outside the repository.
3. Set `HM_ANDROID_KEYSTORE`, `HM_ANDROID_STORE_PASSWORD`, `HM_ANDROID_KEY_ALIAS`, and `HM_ANDROID_KEY_PASSWORD` only in the release environment.
4. Run `npm run cap:sync` and `./gradlew bundleRelease` from `frontend/android` with that JDK and signing configuration.
5. Verify the newly generated `.aab` timestamp and signature before uploading. The existing `frontend/android/app/build/outputs/bundle/release/app-release.aab` is an old artifact and is not the current release candidate.
6. In Play Console complete App access, Ads, Content rating, Target audience, Data safety, Financial features, countries, and staged rollout settings.
7. Use dedicated homeowner and professional review accounts and replace any screenshot that contains a real professional without explicit permission.

## Product and policy gates

- Keep billing disabled in the native build until Google Play Billing or an allowed alternative-billing implementation is complete.
- Keep Razorpay checkout web-only for this release.
- Confirm production Supabase schema/RLS probes, email confirmation/recovery delivery, Render readiness, and account deletion before publishing.
- Confirm the final privacy/data-safety answers against the exact production providers and storage configuration.

## Validation already recorded

- `frontend` production build passed.
- `npm run cap:sync` built the mobile web bundle and copied it into Android; its final iOS dependency step stopped because Xcode is not installed/selected on this machine.
- The Android project uses `in.buildguru.app`, target SDK 35, and release signing is intentionally conditional on environment-only secrets.
