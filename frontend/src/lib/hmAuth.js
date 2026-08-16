import { fetchOwnedPortfolio } from "./api";
import { clearSupabaseLocalSession, getSupabase } from "./supabaseClient";
import { persistHmSessionFromSupabase } from "./userProfileApi";
import { clearAllPortfolioMediaCaches, setPortfolioMedia } from "./portfolioStorage";

const LAST_AUTH_USER_KEY = "hm_last_auth_user_id";
export const HM_SESSION_CLEARED_EVENT = "hm-session-cleared";
export const HM_SESSION_CHANGED_EVENT = "hm-session-changed";

function notifySessionCleared() {
  try {
    window.dispatchEvent(new Event(HM_SESSION_CLEARED_EVENT));
  } catch {
    /* ignore */
  }
}

function notifySessionChanged() {
  try {
    window.dispatchEvent(new Event(HM_SESSION_CHANGED_EVENT));
  } catch {
    /* ignore */
  }
}

/** Read cached session written by {@link persistHmSessionFromSupabase}. */
export function readHmSession() {
  try {
    const session = JSON.parse(localStorage.getItem("hmSession") || "null");
    const user = JSON.parse(localStorage.getItem("hmUser") || "null");
    if (!session?.signedInAt) return null;
    return {
      role: session.role || "homeowner",
      signedInAt: session.signedInAt,
      supabaseUserId: session.supabaseUserId || user?.supabaseUserId,
      profile: {
        name: user?.name || session.profile?.name || "",
        email: user?.email || session.profile?.email || "",
        phone: user?.phone || session.profile?.phone || "",
        city: user?.city || session.profile?.city || "",
      },
    };
  } catch {
    return null;
  }
}

export function getProfileInitial(session) {
  const name = session?.profile?.name || session?.profile?.email || "";
  const ch = String(name).trim().charAt(0);
  return ch ? ch.toUpperCase() : "?";
}

/** Clear device caches when a different Supabase user signs in (stale name / portfolio). */
export function clearHmUserDeviceCaches() {
  const keys = [
    "hmSession",
    "hmUser",
    "hm_portfolio",
    "hm_portfolio_id",
    "hm_build_new_flow",
    "hm_remodel_flow",
  ];
  keys.forEach((k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  });
  clearAllPortfolioMediaCaches();
  try {
    const perUserKeys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key?.startsWith("hm_last_project_")) perUserKeys.push(key);
    }
    perUserKeys.forEach((key) => localStorage.removeItem(key));
  } catch {
    /* ignore */
  }
}

/** Clear every local identity cache when Supabase reports no active session. */
export function clearHmSessionState() {
  clearHmUserDeviceCaches();
  try {
    localStorage.removeItem(LAST_AUTH_USER_KEY);
  } catch {
    /* ignore */
  }
  notifySessionCleared();
}

export function ensureUserDeviceIsolation(userId) {
  if (!userId) return;
  let previous = null;
  try {
    previous = localStorage.getItem(LAST_AUTH_USER_KEY);
  } catch {
    /* ignore */
  }
  if (previous && previous !== userId) {
    clearHmUserDeviceCaches();
  }
  try {
    localStorage.setItem(LAST_AUTH_USER_KEY, userId);
  } catch {
    /* ignore */
  }
}

/**
 * Role is an active workspace mode, not a permanent account classification.
 * The same Supabase user can enter either mode; preserve the current device
 * choice when background auth hydration runs without an explicit intent.
 */
export function resolveSessionRole({ profile, user, signInIntent }) {
  if (signInIntent === "pro" || signInIntent === "homeowner") return signInIntent;
  const existing = readHmSession();
  if (existing?.supabaseUserId === user?.id && (existing.role === "pro" || existing.role === "homeowner")) {
    return existing.role;
  }
  if (profile?.role === "pro" || profile?.role === "homeowner") return profile.role;
  const meta = user?.user_metadata?.role;
  if (meta === "pro" || meta === "homeowner") return meta;
  return "homeowner";
}

/** Portfolio wizard progress from local draft (device). */
export function readProPortfolioState() {
  try {
    const raw = localStorage.getItem("hm_portfolio");
    const parsed = raw ? JSON.parse(raw) : null;
    const hasId = Boolean(localStorage.getItem("hm_portfolio_id"));
    if (parsed?.published) {
      return {
        status: "published",
        step: 5,
      };
    }
    if (parsed?.step) return { status: "draft", step: Number(parsed.step) || 1 };
    if (hasId) return { status: "draft", step: 1 };
    return { status: "none", step: 0 };
  } catch {
    return { status: "none", step: 0 };
  }
}

/** Cache server portfolio row for device-side resume paths. */
export function persistProPortfolioCache(row) {
  if (!row?.id) return;
  try {
    localStorage.setItem("hm_portfolio_id", row.id);
    const { photos, cover_photo, profile_photo, ...base } = row;
    localStorage.setItem("hm_portfolio", JSON.stringify({ ...base, published: Boolean(row.published) }));
    localStorage.setItem("hm_craft", row.craft || "");
    setPortfolioMedia(row.id, {
      photos: Array.isArray(photos) ? photos : [],
      cover_photo: cover_photo || "",
      profile_photo: profile_photo || "",
    });
  } catch {
    /* ignore */
  }
}

/** Pull the signed-in pro's portfolio from Supabase into localStorage (new device / cleared cache). */
export async function syncProPortfolioFromServer(ownerUserId) {
  if (!ownerUserId) return null;
  const row = await fetchOwnedPortfolio(ownerUserId);
  if (row) persistProPortfolioCache(row);
  else {
    try {
      localStorage.removeItem("hm_portfolio");
      localStorage.removeItem("hm_portfolio_id");
    } catch {
      /* ignore */
    }
  }
  return row;
}

export function getProPublicProfilePath() {
  try {
    const raw = localStorage.getItem("hm_portfolio");
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed?.published && parsed?.slug) {
      return `/profile/${parsed.slug}`;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Resume portfolio wizard at the next step (step = steps completed), or dashboard when live. */
export function getProOnboardingResumePath() {
  const { status, step } = readProPortfolioState();
  if (status === "published" || status === "review") return "/pro/dashboard";
  if (step >= 4) return "/live";
  if (step >= 3) return "/portfolio";
  if (step >= 2) return "/portfolio-theme";
  if (step >= 1 || status === "draft") return "/details";
  return "/craft";
}

export function getProLandingPath() {
  return getProOnboardingResumePath();
}

export function getHomeownerLandingPath() {
  return "/project";
}

/** Where to send the user right after sign-in. */
export function getPostLoginPath(role, redirectPath) {
  const path = String(redirectPath || "").trim();
  if (path.startsWith("/") && !path.startsWith("/sign-in")) {
    return path;
  }
  if (role === "pro") return getProLandingPath();
  return getHomeownerLandingPath();
}

/**
 * After Supabase auth: isolate device caches, persist session role, sync pro portfolio when needed.
 */
export async function establishHmSession(user, profile, { signInIntent } = {}) {
  if (!user?.id) return null;
  ensureUserDeviceIsolation(user.id);
  const activeRole = resolveSessionRole({ profile, user, signInIntent });
  persistHmSessionFromSupabase(user, profile, { activeRole });
  notifySessionChanged();
  if (activeRole === "pro") {
    try {
      await syncProPortfolioFromServer(user.id);
    } catch (_) {
      /* portfolio table may not be ready */
    }
  }
  return activeRole;
}

/** Clear local session and Supabase auth. Call after navigating away from guarded pages. */
export async function signOutHm({ redirectTo = "/" } = {}) {
  clearHmSessionState();

  const sb = getSupabase();
  if (sb) {
    // Attempt remote revocation, but never let a network failure preserve a local token.
    const signOutPromise = sb.auth.signOut({ scope: "local" }).catch((error) => {
      console.warn("Supabase sign-out could not reach the auth service:", error?.message || error);
    });
    await Promise.race([signOutPromise, new Promise((r) => setTimeout(r, 2500))]);
  }
  clearSupabaseLocalSession();
  notifySessionCleared(); // ensure listeners refresh after Supabase clears its session
  // Several data modules hold the original Supabase client singleton. A hard
  // navigation destroys that in-memory client so a later sign-in starts cleanly.
  if (typeof window !== "undefined") {
    const safeRedirect = redirectTo.startsWith("/") && !redirectTo.startsWith("//") ? redirectTo : "/";
    window.location.replace(safeRedirect);
  }
}
