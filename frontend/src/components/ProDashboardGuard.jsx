import React, { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AUTH_UI_ENABLED } from "../lib/authMode";
import { useHmSession } from "../hooks/useHmSession";

/** Pro-only gate for dashboard and marketplace management tools. */
export default function ProDashboardGuard({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const session = useHmSession();
  const authLoading = session === undefined;
  const signedIn = Boolean(session?.supabaseUserId);

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

  if (authLoading || !signedIn || session?.role !== "pro") {
    return (
      <div className="min-h-screen bg-[#FBF7F2] flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-[#C85F2B]" />
      </div>
    );
  }

  return children;
}
