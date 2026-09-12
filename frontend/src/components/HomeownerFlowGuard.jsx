import React, { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AUTH_UI_ENABLED } from "../lib/authMode";
import { useHmSession } from "../hooks/useHmSession";
import { readHmSession } from "../lib/hmAuth";
import { buildSignInRedirect } from "../lib/requireHomeownerAuth";
import AuthGateShell from "./AuthGateShell";

/** Homeowner-only gate for project creation and project management. */
export default function HomeownerFlowGuard({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const hookSession = useHmSession();
  const session = hookSession === undefined ? readHmSession() || undefined : hookSession;
  const authLoading = session === undefined;
  const signedInHomeowner = Boolean(session?.supabaseUserId) && session.role !== "pro";
  const returnPath = `${location.pathname}${location.search}`;

  useEffect(() => {
    if (!AUTH_UI_ENABLED) return;
    if (authLoading) return;
    if (session?.role === "pro") {
      navigate("/pro/dashboard", { replace: true });
      return;
    }
    if (!signedInHomeowner) {
      navigate(buildSignInRedirect(returnPath), { replace: true });
    }
  }, [authLoading, session?.role, signedInHomeowner, navigate, returnPath]);

  if (!AUTH_UI_ENABLED) return children;

  if (signedInHomeowner) return children;

  if (session?.role === "pro") {
    return <AuthGateShell message="Opening your professional workspace…" />;
  }

  return <AuthGateShell message={authLoading ? "Checking your account…" : "Taking you to sign in…"} />;
}
