import React from "react";
import { Home, Images, MapPinned, Palette, Ruler, Sparkles, Wrench } from "lucide-react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import LandingNavbar from "../components/landing/LandingNavbar";
import { HM_FIXED_NAV_OFFSET_TAGLINE_CLASS, HM_TAGLINE_BUILD_CHOOSER } from "../lib/hmBrand";
import { isHomeownerSignedIn, navigateToHomeownerFlow } from "../lib/requireHomeownerAuth";

const NEW_HOME_STEPS = [
  { Icon: MapPinned, label: "Define plot" },
  { Icon: Ruler, label: "Plan rooms" },
  { Icon: Palette, label: "Choose style" },
  { Icon: Sparkles, label: "AI design + estimate" },
];

const RENOVATE_STEPS = [
  { Icon: Images, label: "Add photos" },
  { Icon: Home, label: "Choose space" },
  { Icon: Wrench, label: "Set upgrades" },
  { Icon: Sparkles, label: "AI design + costs" },
];

function StepIcon({ Icon, label }) {
  return (
    <div
      className="flex flex-col items-center gap-2 flex-1 min-w-[56px]"
      style={{ maxWidth: 88 }}
    >
      <div
        className="flex items-center justify-center rounded-xl"
        style={{
          width: 44,
          height: 44,
          border: "1px solid #EEDCCB",
          background: "linear-gradient(180deg, #FFFBF7 0%, #F5EFE8 100%)",
          fontSize: 17,
          boxShadow: "0 1px 2px rgba(28,25,23,0.04)",
        }}
      >
        <Icon size={18} strokeWidth={1.8} aria-hidden />
      </div>
      <div
        className="text-center font-medium leading-snug"
        style={{ fontSize: 11, color: "#57534E", lineHeight: 1.35 }}
      >
        {label}
      </div>
    </div>
  );
}

function StepDivider() {
  return (
    <div
      className="flex shrink-0 items-center self-center px-0.5 text-[#D6CFC4] text-xs font-light select-none"
      style={{ paddingTop: 14 }}
      aria-hidden
    >
      ›
    </div>
  );
}

function FeatureRow({ text }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <path d="M3 8 L6.5 11.5 L13 5" stroke="#C85F2B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <span style={{ fontSize: 14, color: "#3D3530" }}>{text}</span>
    </div>
  );
}

export default function WhatAreYouBuilding() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromPortfolio = (searchParams.get("source") || "").toLowerCase() === "portfolio";
  const referredPro = searchParams.get("pro") || "";
  const flowParams = new URLSearchParams();
  if (fromPortfolio) flowParams.set("source", "portfolio");
  if (referredPro) flowParams.set("pro", referredPro);
  const flowQuery = flowParams.toString() ? `?${flowParams.toString()}` : "";
  const goHomeowner = (event, path) => {
    if (isHomeownerSignedIn()) return;
    event.preventDefault();
    navigateToHomeownerFlow(navigate, path);
  };

  return (
    <div
      className={`relative isolate min-h-screen overflow-x-hidden bg-[#FBF7F2] ${HM_FIXED_NAV_OFFSET_TAGLINE_CLASS}`}
      style={{ fontFamily: "'DM Sans',Inter,system-ui,sans-serif", color: "#1C1917" }}
    >
      {/* Must not capture clicks — was blocking Back / card CTAs under some stacks */}
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_100%_0%,rgba(193,132,78,0.08),transparent_50%)]"
        aria-hidden
      />

      <LandingNavbar tagline={HM_TAGLINE_BUILD_CHOOSER} />

      {/* ── MAIN ── */}
      <main className="relative z-10 mx-auto max-w-[920px] px-5 pb-20 pt-8 md:px-8 md:pb-24 md:pt-10">

        {/* Native link — avoids onClick blocked by overlays; goes to home (reliable exit from chooser) */}
        <Link
          to="/"
          className="relative z-10 mb-8 inline-flex cursor-pointer items-center gap-2 text-sm text-[#5C5147] no-underline transition-colors hover:text-[#C85F2B]"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
            <path d="m15 18-6-6 6-6"/>
          </svg>
          Back
        </Link>

      {/* Heading */}
        <div className="text-center mb-10 md:mb-12">
          <h1 className="font-serif-display text-3xl md:text-[2.35rem] font-semibold text-[#1C1917] tracking-tight leading-tight m-0 mb-3">
            What are you building?
          </h1>
          <p className="text-[15px] md:text-base text-[#57534E] leading-relaxed max-w-md mx-auto m-0">
            Choose the path that fits your project. Both paths end with a clear brief,
            AI concepts, an estimate, and a project hub you can keep using.
          </p>
        </div>

        {/* Cards — cream surfaces like Build / Remodel, not flat white boxes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">

          {/* Card 1 – whole card navigates (single Link = reliable cursor + click) */}
          <Link
            to={`/build/new-home${flowQuery}`}
            onClick={(event) => goHomeowner(event, `/build/new-home${flowQuery}`)}
            aria-label="Build a New Home — Get started"
            className="group relative z-10 block cursor-pointer rounded-2xl border border-[#EEDCCB] text-inherit no-underline outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-[#4A90D9] focus-visible:ring-offset-2 hover:ring-2 hover:ring-[#4A90D9] hover:shadow-[0_10px_36px_-12px_rgba(74,144,217,0.22),0_1px_3px_rgba(28,25,23,0.05)]"
            style={{
              background: "linear-gradient(180deg, #FFFBF7 0%, #FDFBF8 55%, #F8F4EF 100%)",
              padding: "28px 24px 26px",
              boxShadow: "0 2px 12px rgba(28, 25, 23, 0.05)",
            }}
          >
            {/* Title */}
            <h2 className="font-serif-display text-xl md:text-[1.35rem] font-semibold text-center text-[#1C1917] tracking-tight m-0 mb-5">
              Build a New Home
            </h2>

              {/* Illustration */}
            <div style={{
              display: "flex", justifyContent: "center", marginBottom: 20,
              height: 110
            }}>
              <img
                src="https://cdn.builder.io/api/v1/image/assets/TEMP/new-home-illustration?width=200"
                alt="Build new home"
                draggable={false}
                style={{ objectFit: "contain", maxHeight: "100%" }}
                onError={e => {
                  e.target.style.display = "none";
                  e.target.nextSibling.style.display = "flex";
                }}
              />
              {/* SVG fallback */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 120, height: 110
              }}>
                <svg width="110" height="100" viewBox="0 0 120 110" fill="none">
                  {/* Ground */}
                  <ellipse cx="60" cy="88" rx="50" ry="12" fill="#D4E8C2" opacity="0.6"/>
                  {/* Tripod / surveying instrument */}
                  <line x1="60" y1="30" x2="30" y2="80" stroke="#8B7355" strokeWidth="2.5" strokeLinecap="round"/>
                  <line x1="60" y1="30" x2="60" y2="82" stroke="#8B7355" strokeWidth="2.5" strokeLinecap="round"/>
                  <line x1="60" y1="30" x2="90" y2="80" stroke="#8B7355" strokeWidth="2.5" strokeLinecap="round"/>
                  {/* Instrument head */}
                  <rect x="48" y="20" width="24" height="14" rx="4" fill="#4A90D9"/>
                  <circle cx="60" cy="27" r="4" fill="#fff" opacity="0.7"/>
                  {/* Blueprint corners */}
                  <rect x="8" y="60" width="30" height="22" rx="3" fill="#EBF3FB" stroke="#4A90D9" strokeWidth="1.5"/>
                  <line x1="14" y1="67" x2="32" y2="67" stroke="#4A90D9" strokeWidth="1" opacity="0.6"/>
                  <line x1="14" y1="72" x2="28" y2="72" stroke="#4A90D9" strokeWidth="1" opacity="0.6"/>
                  <line x1="14" y1="77" x2="26" y2="77" stroke="#4A90D9" strokeWidth="1" opacity="0.6"/>
                </svg>
              </div>
            </div>

            {/* Description */}
            <p className="text-[13px] md:text-sm text-[#57534E] leading-relaxed m-0 mb-4">
              Describe your plot and lifestyle — get floor plans, renders, and a ballpark cost.
            </p>

            {/* Features */}
            <div className="mb-5 pb-5 border-b border-[#EDE8E0]">
              <FeatureRow text="Saved brief" />
              <FeatureRow text="AI exterior concepts" />
              <FeatureRow text="Estimate + project hub" />
            </div>

            {/* Steps */}
            <div className="flex items-start justify-between gap-1 mb-7">
              {NEW_HOME_STEPS.map((s, i) => (
                <React.Fragment key={s.label}>
                  <StepIcon Icon={s.Icon} label={s.label} />
                  {i < NEW_HOME_STEPS.length - 1 && <StepDivider />}
                </React.Fragment>
              ))}
            </div>

            <span className="inline-flex items-center gap-2 text-[15px] font-bold text-[#C85F2B] group-hover:text-[#A64F24] transition-colors">
              Get Started
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </span>
          </Link>

          {/* Card 2 – Renovate / Remodel */}
          <Link
            to={`/build/remodel${flowQuery}`}
            onClick={(event) => goHomeowner(event, `/build/remodel${flowQuery}`)}
            aria-label="Renovate or remodel — Get started"
            className="group relative z-10 block cursor-pointer rounded-2xl border border-[#EEDCCB] text-inherit no-underline outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-[#C85F2B] focus-visible:ring-offset-2 hover:ring-2 hover:ring-[#C85F2B] hover:shadow-[0_10px_36px_-12px_rgba(200,95,43,0.2),0_1px_3px_rgba(28,25,23,0.05)]"
            style={{
              background: "linear-gradient(180deg, #FFFBF7 0%, #FDFBF8 55%, #F8F4EF 100%)",
              padding: "28px 24px 26px",
              boxShadow: "0 2px 12px rgba(28, 25, 23, 0.05)",
            }}
          >
            {/* Title */}
            <h2 className="font-serif-display text-xl md:text-[1.35rem] font-semibold text-center text-[#1C1917] tracking-tight m-0 mb-5">
              Renovate / Remodel
            </h2>

            {/* Illustration */}
            <div style={{
              display: "flex", justifyContent: "center", marginBottom: 20, height: 110
            }}>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 120, height: 110
              }}>
                <svg width="110" height="100" viewBox="0 0 120 110" fill="none">
                  {/* House body */}
                  <rect x="22" y="46" width="64" height="44" rx="3" fill="#F9C784"/>
                  <rect x="22" y="46" width="64" height="44" rx="3" stroke="#E8A84A" strokeWidth="1.5"/>
                  {/* Roof */}
                  <path d="M14 48 L54 20 L94 48 Z" fill="#C85F2B" stroke="#B04F20" strokeWidth="1.5"/>
                  {/* Door */}
                  <rect x="48" y="66" width="14" height="24" rx="2" fill="#8B5E3C"/>
                  {/* Windows */}
                  <rect x="28" y="54" width="16" height="14" rx="2" fill="#A8D4E8" stroke="#7AB8D0" strokeWidth="1"/>
                  <rect x="64" y="54" width="16" height="14" rx="2" fill="#A8D4E8" stroke="#7AB8D0" strokeWidth="1"/>
                  {/* Wrench */}
                  <g transform="translate(70, 20) rotate(30)">
                    <rect x="-4" y="-18" width="8" height="26" rx="4" fill="#7A7A7A"/>
                    <circle cx="0" cy="-18" r="7" fill="none" stroke="#7A7A7A" strokeWidth="3"/>
                    <circle cx="0" cy="-18" r="3" fill="#F5EFE8"/>
                  </g>
                </svg>
              </div>
            </div>

            {/* Description */}
            <p className="text-[13px] md:text-sm text-[#57534E] leading-relaxed m-0 mb-4">
              Upload room photos, describe your vision, and get AI designs and costs.
            </p>

            {/* Features */}
            <div className="mb-5 pb-5 border-b border-[#EDE8E0]">
              <FeatureRow text="Room photo upload" />
              <FeatureRow text="AI remodel concepts" />
              <FeatureRow text="Costs, tasks + pros" />
            </div>

            {/* Steps */}
            <div className="flex items-start justify-between gap-1 mb-7">
              {RENOVATE_STEPS.map((s, i) => (
                <React.Fragment key={s.label}>
                  <StepIcon Icon={s.Icon} label={s.label} />
                  {i < RENOVATE_STEPS.length - 1 && <StepDivider />}
                </React.Fragment>
              ))}
            </div>

            <span className="inline-flex items-center gap-2 text-[15px] font-bold text-[#C85F2B] group-hover:text-[#A64F24] transition-colors">
              Get Started
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </span>
          </Link>

        </div>
      </main>
    </div>
  );
}
