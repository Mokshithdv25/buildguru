import { AUTH_UI_ENABLED } from "./authMode";
import { readHmSession } from "./hmAuth";

export function isHomeownerSignedIn() {
  if (!AUTH_UI_ENABLED) return true;
  const session = readHmSession();
  return Boolean(session?.supabaseUserId) && session.role !== "pro";
}

export function buildSignInRedirect(returnPath) {
  const path = returnPath && returnPath.startsWith("/") ? returnPath : "/build";
  return `/sign-in?redirect=${encodeURIComponent(path)}`;
}

export function navigateToHomeownerFlow(navigate, path, options) {
  const target = path && path.startsWith("/") ? path : "/build";
  if (isHomeownerSignedIn()) {
    navigate(target, options);
    return;
  }
  const session = readHmSession();
  if (session?.supabaseUserId && session.role === "pro") {
    navigate(`/sign-in?redirect=${encodeURIComponent(target)}`, options);
    return;
  }
  navigate(buildSignInRedirect(target), options);
}
