# Private project storage

20 MB (20,000,000 bytes) per free account across all homeowner projects; 100 MB for an active `homeowner_project_pass` entitlement. Each file is limited to 15 MB. Limits are checked by PostgreSQL under an account advisory lock. The database ledger includes pending writes. No user-editable plan metadata is trusted.

Deploy the additive Supabase migration first. Create the private `buildguru-project-documents` R2 bucket, deploy the Worker, and set `SUPABASE_SERVICE_ROLE_KEY` and a random `DOWNLOAD_SIGNING_KEY` as Worker secrets (never frontend environment variables). Disable R2 public access. The binding avoids creating S3 credentials. Set `REACT_APP_PROJECT_STORAGE_URL` only after verifying uploads and downloads.

Before enabling the frontend, apply `activate-r2.sql` to disable direct document mutations and Supabase document uploads. Older clients can still read old files but must refresh to upload. Do not enable the new route without this step: old direct endpoints could bypass quota. The cap covers project documents, receipts, and site photos; professional portfolio media and generated design assets are separate existing systems.

The existing payment-verified Project Pass entitlement activates paid storage automatically. Payment checkout must be enabled/configured separately; no free storage overages are accepted while payment is pending. Downgrade/expiry preserves reading and deletion, and blocks new uploads above the reduced cap.

Upload order: authenticate -> verify project -> read at most 15 MB -> reserve actual bytes -> write R2 -> insert document. Failed/ambiguous writes stay charged until confirmed R2 deletion. Hourly reconciliation removes abandoned reservations and objects whose project metadata was deleted after 24 hours. Downloads use one-hour signed links and private no-store responses. Keep secrets private; rotate the download key to invalidate existing links.

Rollback: remove frontend gateway configuration and re-enable the former direct policies only if intentionally reverting the quota feature. R2 documents require the gateway for reads, so do not roll back the gateway while any R2 files exist. Do not delete the ledger before deleting its files. This integration does not migrate existing legacy objects; they remain readable and count toward quota.
