import React, { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AUTH_UI_ENABLED } from "../lib/authMode";
import { useHmSession } from "../hooks/useHmSession";

/** Pro-only gate for portfolio onboarding. */
export default function ProOnboardingGuard({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const session = useHmSession();
  const authLoading = session === undefined;
  const signedIn = Boolean(session?.supabaseUserId);
  const returnPath = `${location.pathname}${location.search}`;

  useEffect(() => {
    if (!AUTH_UI_ENABLED) return;
    if (authLoading) return;
    if (!signedIn) {
      navigate(`/pro/join?redirect=${encodeURIComponent(returnPath)}`, { replace: true });
    }
  }, [authLoading, signedIn, navigate, returnPath]);

  if (!AUTH_UI_ENABLED) return children;

  if (authLoading || !signedIn) {
    return (
      <div className="min-h-screen bg-[#FBF7F2] flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-[#C85F2B]" />
      </div>
    );
  }

  if (session?.role !== "pro") {
    return (
      <div className="min-h-screen bg-[#FBF7F2] flex items-center justify-center px-6">
        <div className="max-w-md rounded-2xl border border-[#E8D8C8] bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#C85F2B]">Professional access</p>
          <h1 className="mt-3 text-2xl font-bold text-[#2D241F]">Use a pro account to create a portfolio.</h1>
          <p className="mt-3 text-sm text-[#6F625A]">
            This onboarding flow is reserved for architects, contractors, designers, and vendors joining the marketplace.
          </p>
          <button
            type="button"
            onClick={() => navigate("/build", { replace: true })}
            className="mt-5 rounded-xl bg-[#2D241F] px-5 py-3 text-sm font-semibold text-white"
          >
            Continue as homeowner
          </button>
        </div>
      </div>
    );
  }

  return children;
}
