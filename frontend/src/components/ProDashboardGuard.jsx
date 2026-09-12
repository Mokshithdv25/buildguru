import React, { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AUTH_UI_ENABLED } from "../lib/authMode";
import { useHmSession } from "../hooks/useHmSession";
import { readHmSession } from "../lib/hmAuth";
import AuthGateShell from "./AuthGateShell";

/** Pro-only gate for dashboard and marketplace management tools. */
export default function ProDashboardGuard({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const hookSession = useHmSession();
  const session = hookSession === undefined ? readHmSession() || undefined : hookSession;
  const authLoading = session === undefined;
  const signedIn = Boolean(session?.supabaseUserId);
  const signedInPro = signedIn && session?.role === "pro";

  useEffect(() => {
    if (!AUTH_UI_ENABLED) return;
    if (authLoading) return;
    if (!signedIn) {
      const redirect = encodeURIComponent(`${location.pathname}${location.search}`);
      navigate(`/pro/sign-in?redirect=${redirect}`, { replace: true });
      return;
    }
    if (session?.role !== "pro") {
      navigate("/build", { replace: true });
    }
  }, [authLoading, signedIn, session?.role, navigate, location.pathname, location.search]);

  if (!AUTH_UI_ENABLED) return children;

  if (signedInPro) return children;

  if (signedIn && session?.role !== "pro") {
    return <AuthGateShell message="Taking you to your project…" />;
  }

  return <AuthGateShell message={authLoading ? "Checking your account…" : "Taking you to sign in…"} />;
}
