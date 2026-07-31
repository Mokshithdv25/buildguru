# Store privacy and data-safety draft

This is a technical disclosure draft, not legal advice. The publisher must confirm it against the exact production configuration before submission.

## Data linked to the user

| Data category | Examples | Purpose |
| --- | --- | --- |
| Contact information | Name, email, phone, city | Account management and service communication; city may appear on a published professional profile |
| User content | Project briefs, photos, portfolio media, documents, messages | App functionality and AI generation requested by the user |
| Financial information | Subscription purchase status; owner-entered project payment records | Paid-plan fulfillment and project ledger functionality |
| Identifiers | Supabase account ID, project and portfolio IDs | Authentication, security, account-scoped storage |
| Diagnostics | API errors and essential server logs | Reliability, fraud prevention, security |

## Data handling declarations

- Data is encrypted in transit using HTTPS.
- Account-scoped database rows use Supabase authentication and row-level security.
- Generated project-v0 images and project documents use private buckets and expiring signed URLs.
- Published professional profiles are exposed through a safe public view that omits owner IDs, street address, email, phone, and license numbers.
- Portfolio photos use a private `portfolio-media` bucket. Draft photos remain owner-only; photos for a published portfolio are delivered through short-lived signed URLs only when the object path exactly matches that portfolio's owner and ID.
- New and materially edited professional portfolios remain private until manual moderation approval. Signed-in users can report profiles, every visitor can block a profile, and repeated independent reports may quarantine a profile from public results pending review.
- No personal data is sold.
- No third-party advertising or cross-app tracking SDK is configured.
- Users can permanently delete their account and associated projects, portfolios, and files in Account & Settings. Minimized payment-event records may be retained where required for fraud prevention, tax, accounting, or other legal obligations; full Razorpay webhook payloads are not stored.

## Service providers

- Supabase: authentication, database, file storage
- Vercel: frontend web application hosting
- Render: FastAPI backend hosting
- xAI, Google, or an OpenAI-compatible provider: only when configured and used for an AI request
- Razorpay: Test Mode paid-plan checkout and payment confirmation until entitlement-based access control is enforced and approved for live billing

## Apple App Privacy answers draft

- Contact Info: collected, linked to identity, app functionality
- User Content: collected, linked to identity, app functionality
- Purchases: collected, linked to identity, app functionality
- Identifiers: collected, linked to identity, app functionality and security
- Diagnostics: collected only through essential infrastructure logs; not used for tracking
- Tracking: No

## Google Play Data safety answers draft

- Collects personal info, photos/files, app activity/content, and purchase information
- Shares data with service providers for app functionality and user-requested AI processing
- Data is encrypted in transit
- Users can request deletion in-app and through support@buildguru.online
- No advertising use and no sale of personal data
