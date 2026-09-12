import React from "react";
import { useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import LandingNavbar from "./landing/LandingNavbar";
import {
  HM_FIXED_NAV_OFFSET_TAGLINE_CLASS,
  HM_TAGLINE_BUILD_CHOOSER,
  HM_TAGLINE_HOME_PLATFORM,
  HM_TAGLINE_NEW_HOME,
  HM_TAGLINE_PORTFOLIO,
  HM_TAGLINE_PROJECT_HUB,
  HM_TAGLINE_REMODEL,
} from "../lib/hmBrand";

export function gateTaglineForPath(pathname) {
  if (pathname.startsWith("/build/new-home")) return HM_TAGLINE_NEW_HOME;
  if (pathname.startsWith("/build/remodel")) return HM_TAGLINE_REMODEL;
  if (pathname.startsWith("/build")) return HM_TAGLINE_BUILD_CHOOSER;
  if (
    pathname.startsWith("/pro") ||
    pathname.startsWith("/craft") ||
    pathname.startsWith("/details") ||
    pathname.startsWith("/portfolio") ||
    pathname.startsWith("/live")
  ) {
    return HM_TAGLINE_PORTFOLIO;
  }
  if (
    pathname.startsWith("/project") ||
    pathname.startsWith("/documents") ||
    pathname.startsWith("/team") ||
    pathname.startsWith("/stage")
  ) {
    return HM_TAGLINE_PROJECT_HUB;
  }
  return HM_TAGLINE_HOME_PLATFORM;
}

/** Navbar + spinner so auth gates never leave a blank cream page. */
export default function AuthGateShell({ message, tagline }) {
  const { pathname } = useLocation();
  return (
    <div className={`min-h-screen bg-[#FBF7F2] ${HM_FIXED_NAV_OFFSET_TAGLINE_CLASS}`}>
      <LandingNavbar tagline={tagline || gateTaglineForPath(pathname)} />
      <div className="flex min-h-[calc(100vh-5.75rem)] flex-col items-center justify-center gap-3 px-6 text-center">
        <Loader2 className="h-7 w-7 animate-spin text-[#C85F2B]" />
        <p className="m-0 font-body text-sm font-medium text-[#57534E]">{message}</p>
      </div>
    </div>
  );
}
