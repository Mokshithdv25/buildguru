# Native release checklist

## Completed in the repository

- Bundle/package ID set to `in.buildguru.app`
- Version 1.0 / build 1 configured
- Capacitor Android and iOS projects present
- Mobile production web bundle generated and copied to both native projects
- Branded BuildGuru icons and splash screens generated for iOS and Android
- Android Studio, JDK 17, Android SDK Platform 35, Build Tools 35, and platform tools installed
- Public privacy policy and terms routes present
- In-app permanent account deletion implemented
- App Store and Play Store listing copy drafted
- Privacy and data-safety disclosures drafted

## Required before uploading

- Apply the production Supabase scripts in the path documented by `db/README.md`. Existing schemas use `db/buildguru_rls_hardening.sql`, then `db/buildguru_project_workspace.sql`, `db/buildguru_pro_leads.sql`, and `db/buildguru_project_intelligence.sql`; fresh projects first use the fail-closed `db/buildguru_single_setup.sql`. Use the destructive reset only when data loss is intentional.
- Run the SQL, anonymous, storage, and two-account isolation probes in `db/README.md`. Any anonymous project/billing row or exposure of a portfolio owner ID, street address, email, phone, license number, or private media blocks release.
- Keep the Resend domain verified and Supabase custom SMTP healthy while `REACT_APP_EMAIL_SIGNUP_ENABLED=true`. Confirmation, resend, and password-recovery delivery must pass before every release. Allow `https://www.buildguru.ai/sign-in`, `https://buildguru.ai/sign-in`, and `in.buildguru.app://auth/callback`; set the flag to `false` immediately if transactional delivery fails.
- Set `REACT_APP_SUPABASE_URL` and the browser-safe `REACT_APP_SUPABASE_ANON_KEY` in Vercel and in ignored `frontend/.env.production.local` for native builds. Never expose the service-role key to the frontend.
- Configure production Supabase service-role, AI, CORS, and Razorpay Test Mode secrets on Render. Keep `ALLOW_AI_MOCKS=false`.
- Redeploy the Render backend and the frontend-only Vercel project from the reviewed revision; confirm both services report that same revision before treating them as release candidates.
- Verify Render returns `200` from `/health/ready`, exposes the current `/api/ai/status`, and accepts an authenticated `/api/ai/hub-assistant` request. Confirm the Vercel frontend sends API traffic to Render.
- Confirm real image packs stop at `AI_DAILY_IMAGE_PACKS` per user per UTC day with `429` and `Retry-After`; a quota-storage failure must return `503` instead of calling the provider.
- Build with Node 20 and run `npm run cap:sync`; reject any web or native bundle containing source maps, `localhost:8000`, or a temporary Capacitor `server.url`.
- Test Google and email/password account creation/sign-in, sign-out, and stale-session cleanup on web and installed iOS and Android builds. Test PKCE email confirmation, resend, and password recovery against verified Resend SMTP.
- Confirm `portfolio-media` is private: an anonymous reader can obtain a short-lived signed URL only for an exact published `{owner_user_id}/{portfolio_id}/...` path, while draft, mismatched-prefix, direct-public, and expired URL probes fail.
- Confirm the professional lead view rejects anonymous access, never exposes homeowner IDs, contact details, full location, or raw brief data, and isolates each professional's targeted opportunities and response rows.
- Confirm material items and agent-action approvals are owner-scoped, quantity and brand edits persist, and no suggested follow-up, shortlist, hire, or order is represented as executed without explicit approval history.
- Review every pending portfolio before approval; test Report profile and Block profile on web, iOS, and Android; assign an owner and response SLA for the `portfolio_reports` queue.
- Confirm `support@buildguru.online` is monitored for safety and moderation escalations.
- Keep `BILLING_ENABLED=false`, `ALLOW_LIVE_BILLING=false`, and Razorpay in Test Mode. Paid webhooks record entitlements, but paid features are not yet gated by those entitlements; Live Mode keys and real charges stay blocked until entitlement enforcement and downgrade/expiry tests pass.
- Keep Razorpay checkout web-only unless the publisher enrolls in Google Play alternative billing and implements the required choice/reporting APIs; native builds currently show entitlement status without a purchase CTA
- Add StoreKit/Google Play Billing before selling digital feature access directly inside the native apps
- Create dedicated homeowner and professional review accounts
- Replace any placeholder marketing claims or testimonials that cannot be substantiated
- Confirm legal entity name, support contact, privacy policy, and disclosures with the publisher

## Android publisher actions

- Create or select the Play Console app for `in.buildguru.app`
- Generate and securely back up a Play upload keystore
- Configure release signing outside source control
- Export `HM_ANDROID_KEYSTORE`, `HM_ANDROID_STORE_PASSWORD`, `HM_ANDROID_KEY_ALIAS`, and `HM_ANDROID_KEY_PASSWORD`; the Gradle release build consumes these without committing secrets
- Upload the signed `.aab`
- Complete App access, Ads, Content rating, Target audience, Data safety, and Financial features declarations
- Upload phone screenshots and a 1024×500 feature graphic
- Choose countries, pricing, and production rollout

## iOS publisher actions

- Implement and verify Sign in with Apple alongside Google OAuth before App Store submission
- Install full Xcode and select `/Applications/Xcode.app/Contents/Developer`
- Review and accept the Xcode license (`sudo xcodebuild -license`) before running CocoaPods or an archive build
- Sign into Xcode with the Apple Developer account
- Select the correct Team and provisioning profile for `in.buildguru.app`
- Archive and validate the app, then upload it to App Store Connect
- Create the App Store Connect app record
- Add review credentials, privacy answers, age rating, export-compliance answers, screenshots, and metadata
- Submit the selected build for review

Developer-account credentials, legal attestations, signing keys, pricing, and the final Submit for Review actions must be completed by the account owner.
