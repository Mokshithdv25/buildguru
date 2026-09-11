const OAUTH_INTENT_KEY = "hm_oauth_intent_v1";
const LEGACY_OAUTH_PENDING_KEY = "hm_oauth_pending";
const OAUTH_INTENT_TTL_MS = 15 * 60 * 1000;

function normalizeRole(role) {
  return role === "pro" || role === "homeowner" ? role : null;
}

function normalizeRedirectPath(path) {
  const candidate = String(path || "").trim();
  return candidate.startsWith("/") && !candidate.startsWith("//") ? candidate : null;
}

function storageAvailable() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

/** Persist the workspace selected before leaving the app for OAuth. */
export function persistOAuthSignInIntent(role, { redirectPath = null } = {}) {
  const normalizedRole = normalizeRole(role);
  if (!normalizedRole || !storageAvailable()) return;
  try {
    localStorage.setItem(
      OAUTH_INTENT_KEY,
      JSON.stringify({
        role: normalizedRole,
        redirectPath: normalizeRedirectPath(redirectPath),
        createdAt: Date.now(),
      }),
    );
    // Keep this during one release cycle so callbacks started on the previous
    // frontend still complete after the new bundle is deployed.
    localStorage.setItem(LEGACY_OAUTH_PENDING_KEY, "1");
  } catch (_) {
    /* localStorage can be unavailable in hardened browser contexts */
  }
}

/** Return a recent OAuth workspace choice without consuming it. */
export function readOAuthSignInIntent(now = Date.now()) {
  if (!storageAvailable()) return null;
  try {
    const raw = localStorage.getItem(OAUTH_INTENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const role = normalizeRole(parsed?.role);
    const createdAt = Number(parsed?.createdAt);
    if (!role || !Number.isFinite(createdAt) || now - createdAt > OAUTH_INTENT_TTL_MS || createdAt > now + 60_000) {
      clearOAuthSignInIntent();
      return null;
    }
    return {
      role,
      redirectPath: normalizeRedirectPath(parsed?.redirectPath),
      createdAt,
    };
  } catch (_) {
    clearOAuthSignInIntent();
    return null;
  }
}

function locationLooksLikeOAuthCallback(location) {
  const hash = String(location?.hash || "");
  const search = String(location?.search || "");
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return (
    hash.includes("access_token=") ||
    hash.includes("refresh_token=") ||
    params.has("code") ||
    params.get("oauth") === "1"
  );
}

/**
 * Supabase falls back to the configured Site URL when a requested redirect is
 * not allow-listed. Recover that root callback through the normal sign-in
 * completion page so profile setup and role-specific navigation still run.
 *
 * Only fire when the URL still looks like a provider callback. A leftover
 * 15-minute intent must not bounce an already-signed-in homepage visit.
 */
export function getOAuthRootRecoveryPath(
  pathname,
  intent = readOAuthSignInIntent(),
  location = typeof window === "undefined" ? { search: "", hash: "" } : window.location,
) {
  if (pathname !== "/" || !intent?.role) return null;
  if (!locationLooksLikeOAuthCallback(location)) return null;
  const params = new URLSearchParams({ oauth: "1", role: intent.role });
  if (intent.redirectPath) params.set("redirect", intent.redirectPath);
  return `/sign-in?${params.toString()}`;
}

export function hasPendingOAuthSignIn() {
  if (readOAuthSignInIntent()) return true;
  if (!storageAvailable()) return false;
  try {
    return localStorage.getItem(LEGACY_OAUTH_PENDING_KEY) === "1";
  } catch (_) {
    return false;
  }
}

export function clearOAuthSignInIntent() {
  if (!storageAvailable()) return;
  try {
    localStorage.removeItem(OAUTH_INTENT_KEY);
    localStorage.removeItem(LEGACY_OAUTH_PENDING_KEY);
  } catch (_) {
    /* ignore */
  }
}
