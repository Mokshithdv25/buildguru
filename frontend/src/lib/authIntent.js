const OAUTH_INTENT_KEY = "hm_oauth_intent_v1";
const LEGACY_OAUTH_PENDING_KEY = "hm_oauth_pending";
const OAUTH_INTENT_TTL_MS = 15 * 60 * 1000;

function normalizeRole(role) {
  return role === "pro" || role === "homeowner" ? role : null;
}

function storageAvailable() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

/** Persist the workspace selected before leaving the app for OAuth. */
export function persistOAuthSignInIntent(role) {
  const normalizedRole = normalizeRole(role);
  if (!normalizedRole || !storageAvailable()) return;
  try {
    localStorage.setItem(
      OAUTH_INTENT_KEY,
      JSON.stringify({ role: normalizedRole, createdAt: Date.now() }),
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
    return { role, createdAt };
  } catch (_) {
    clearOAuthSignInIntent();
    return null;
  }
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
