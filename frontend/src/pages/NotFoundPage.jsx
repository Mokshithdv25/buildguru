import React from "react";
import { Link } from "react-router-dom";
import LandingNavbar from "../components/landing/LandingNavbar";
import LandingFooter from "../components/landing/LandingFooter";
import { HM_FIXED_NAV_OFFSET_CLASS } from "../lib/hmBrand";

/** Unknown URLs stay in history so browser Back still works. */
export default function NotFoundPage() {
  return (
    <div className="hm-landing-page min-h-screen bg-[#FBF7F2]">
      <LandingNavbar />
      <main className={`${HM_FIXED_NAV_OFFSET_CLASS} px-6 py-20 text-center`}>
        <p className="font-body text-xs font-bold uppercase tracking-[0.16em] text-copper">Page not found</p>
        <h1 className="mt-3 font-display text-3xl font-semibold text-foreground">This screen is not here.</h1>
        <p className="mx-auto mt-3 max-w-md font-body text-sm text-muted-foreground">
          Use Back to return to the previous page, or continue from home.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => window.history.back()}
            className="rounded-xl border border-[#E8D8C8] bg-white px-5 py-3 font-body text-sm font-semibold text-[#1C1917]"
          >
            Go back
          </button>
          <Link
            to="/"
            className="rounded-xl bg-[#C85F2B] px-5 py-3 font-body text-sm font-semibold text-white no-underline"
          >
            Home
          </Link>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
