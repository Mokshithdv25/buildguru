import { Capacitor } from "@capacitor/core";
import { getSupabase } from "./supabaseClient";
import { clearOAuthSignInIntent } from "./authIntent";

export const NATIVE_AUTH_CALLBACK = "in.buildguru.app://auth/callback";

export function authCallbackUrl(nextPath) {
  const safeNext = String(nextPath || "/sign-in");
  if (Capacitor.isNativePlatform()) {
    return `${NATIVE_AUTH_CALLBACK}?next=${encodeURIComponent(safeNext)}`;
  }
  return `${window.location.origin}${safeNext}`;
}

export async function openNativeAuthUrl(url) {
  if (!Capacitor.isNativePlatform()) {
    window.location.assign(url);
    return;
  }
  const { Browser } = await import("@capacitor/browser");
  await Browser.open({ url, presentationStyle: "popover" });
}

const NATIVE_AUTH_ERROR_CODE = "callback_failed";

function safeSignInPath(requestedNext) {
  const candidate = String(requestedNext || "/sign-in");
  return candidate.startsWith("/sign-in") && !candidate.startsWith("//")
    ? candidate
    : "/sign-in";
}

function navigateFromNativeCallback(path) {
  window.history.replaceState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.dispatchEvent(new CustomEvent("hm-native-auth-callback"));
}

/** Exchange Supabase's native OAuth/email callback and return to the SPA route. */
export async function handleNativeAuthCallback(url) {
  if (!url || !String(url).startsWith(NATIVE_AUTH_CALLBACK)) return false;
  let nextPath = "/sign-in";
  let callbackError = null;
  try {
    const parsed = new URL(url);
    nextPath = safeSignInPath(parsed.searchParams.get("next"));
    const hash = new URLSearchParams(parsed.hash.replace(/^#/, ""));
    const providerError =
      parsed.searchParams.get("error_description") ||
      hash.get("error_description") ||
      parsed.searchParams.get("error") ||
      hash.get("error");
    if (providerError) throw new Error("The identity provider rejected the sign-in callback.");

    const sb = getSupabase();
    if (!sb) throw new Error("Sign-in is not configured on this deployment.");
    const code = parsed.searchParams.get("code");
    if (!code) throw new Error("The sign-in callback did not include a PKCE authorization code.");
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (error) throw error;
  } catch (error) {
    callbackError = error;
  } finally {
    try {
      const { Browser } = await import("@capacitor/browser");
      await Browser.close();
    } catch {
      /* Browser may already be closed for email-link callbacks. */
    }
  }

  if (callbackError) {
    clearOAuthSignInIntent();
    const errorUrl = new URL(nextPath, window.location.origin);
    errorUrl.searchParams.delete("oauth");
    errorUrl.searchParams.delete("confirmed");
    errorUrl.searchParams.delete("recovery");
    errorUrl.searchParams.set("native_error", NATIVE_AUTH_ERROR_CODE);
    navigateFromNativeCallback(`${errorUrl.pathname}${errorUrl.search}${errorUrl.hash}`);
    return true;
  }

  navigateFromNativeCallback(nextPath);
  return true;
}
