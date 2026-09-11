import React from "react";
import { useNavigate } from "react-router-dom";
import LandingNavbar from "../components/landing/LandingNavbar";
import LandingInspirationSection from "../components/landing/LandingInspirationSection";
import LandingFooter from "../components/landing/LandingFooter";
import { HM_FIXED_NAV_OFFSET_CLASS } from "../lib/hmBrand";

/** Desktop destination for Software → Designs (mobile already has /design). */
export default function DesignPage() {
  const navigate = useNavigate();
  return (
    <div className="hm-landing-page min-h-screen bg-background">
      <LandingNavbar />
      <div className={HM_FIXED_NAV_OFFSET_CLASS}>
        <LandingInspirationSection onExplore={() => navigate("/build")} />
      </div>
      <LandingFooter />
    </div>
  );
}
