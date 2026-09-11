import React, { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AUTH_UI_ENABLED } from "../lib/authMode";
import { useHmSession } from "../hooks/useHmSession";
import { readHmSession } from "../lib/hmAuth";
import { buildSignInRedirect } from "../lib/requireHomeownerAuth";
import LandingNavbar from "./landing/LandingNavbar";
import { HM_FIXED_NAV_OFFSET_TAGLINE_CLASS, HM_TAGLINE_NEW_HOME } from "../lib/hmBrand";

function GateShell({ message }) {
  return (
    <div className={`min-h-screen bg-[#FBF7F2] ${HM_FIXED_NAV_OFFSET_TAGLINE_CLASS}`}>
      <LandingNavbar tagline={HM_TAGLINE_NEW_HOME} />
      <div className="flex min-h-[calc(100vh-5.75rem)] flex-col items-center justify-center gap-3 px-6 text-center">
        <Loader2 className="h-7 w-7 animate-spin text-[#C85F2B]" />
        <p className="m-0 font-body text-sm font-medium text-[#57534E]">{message}</p>
      </div>
    </div>
  );
}

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
    return <GateShell message="Opening your professional workspace…" />;
  }

  return <GateShell message={authLoading ? "Checking your account…" : "Taking you to sign in…"} />;
}
