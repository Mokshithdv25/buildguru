import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { StepRail, ProfileStrength, LivePreview } from "../components/SharedUI";
import { HmHeaderBrandLockup } from "../components/HmBrandLockup";
import HmUserMenu from "../components/HmUserMenu";
import { HM_HEADER_BAR_CLASS, HM_TAGLINE_PORTFOLIO } from "../lib/hmBrand";
import {
  Home,
  Sparkles,
  Building2,
  Wrench,
  Check,
  ArrowRight,
  Shield,
  Lightbulb,
  ImageIcon,
  Pencil,
  User,
  MapPin,
  DraftingCompass,
  Armchair,
  ConstructionIcon,
  Hammer,
  PaintBucket,
  Zap,
  Droplets,
  IndianRupee,
  Globe,
  Handshake,
} from "lucide-react";



import { CRAFTS, findCraft } from "../lib/crafts";
import { DEFAULT_PORTFOLIO_THEME_ID, DEFAULT_PORTFOLIO_LAYOUT } from "../lib/portfolioThemes";
import { createPortfolio } from "../lib/api";

function CraftCard({ craft, selected, onSelect, wide }) {
  const Icon = craft.Icon;
  return (
    <button
      type="button"
      className={`craft-card ${wide ? "flex items-center gap-4 text-left" : ""}`}
      data-selected={selected ? "true" : "false"}
      data-testid={`craft-card-${craft.id}`}
      onClick={() => onSelect(craft.id)}
      aria-pressed={selected}
    >
      <div className="craft-check" aria-hidden>
        <Check size={14} strokeWidth={3} />
      </div>

      {wide ? (
        <>
          <div
            className="craft-icon-wrap shrink-0"
            style={{ background: craft.tint, margin: 0 }}
          >
            <Icon size={26} color={craft.iconColor} strokeWidth={1.6} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-serif-display text-xl font-semibold text-[#1C1917] leading-tight">
              {craft.name}
            </div>
            <div className="text-sm text-[#7A6E62] mt-1">{craft.tagline}</div>
          </div>
        </>
      ) : (
        <>
          <div className="craft-icon-wrap" style={{ background: craft.tint }}>
            <Icon size={26} color={craft.iconColor} strokeWidth={1.6} />
          </div>
          <div className="font-serif-display text-lg font-semibold text-[#1C1917] leading-tight">
            {craft.name}
          </div>
          <div className="text-[13px] text-[#7A6E62] mt-1.5 leading-snug">
            {craft.tagline}
          </div>
        </>
      )}
    </button>
  );
}

export default function CraftSelection() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const profileStrength = useMemo(() => (selected ? 25 : 15), [selected]);

  const handleContinue = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      const created = await createPortfolio(selected);
      if (!created?.id) throw new Error("The server did not return a portfolio ID.");
      const id = created.id;
      localStorage.setItem("hm_portfolio_id", id);
      localStorage.setItem("hm_craft", selected);
      // Keep local cache for offline/fallback pages.
      const portfolio = {
        ...(created || {}),
        id,
        craft: selected,
        portfolio_theme: DEFAULT_PORTFOLIO_THEME_ID,
        portfolio_layout: DEFAULT_PORTFOLIO_LAYOUT,
      };
      localStorage.setItem("hm_portfolio", JSON.stringify(portfolio));
      setSubmitting(false);
      navigate("/details");
    } catch (err) {
      console.error("Create portfolio failed:", err);
      setError(err?.message || "Could not create your portfolio. Check your connection and try again.");
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-[#FBF7F2] overflow-x-hidden">
      {/* Background accents matching the homepage */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_100%_0%,rgba(193,132,78,0.08),transparent_50%)]" aria-hidden />

      {/* Header */}
      <header className={`${HM_HEADER_BAR_CLASS} hm-desktop-only`} data-testid="hm-header">
        <div className="flex items-center gap-3 md:gap-4 min-w-0">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="flex items-center gap-2 text-sm font-semibold text-[#1C1917] hover:text-[#57534E] transition-colors border border-[#EFE3D2] px-3 py-2 rounded-lg bg-white shrink-0"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
              <path d="m15 18-6-6 6-6" />
            </svg>
            Back
          </button>
          <HmHeaderBrandLockup tagline={HM_TAGLINE_PORTFOLIO} truncateTitle className="min-w-0 flex-1" />
        </div>

        <div className="hidden md:block">
          <StepRail currentStep={1} />
        </div>

        <div className="flex items-center gap-3">
          <ProfileStrength value={profileStrength} />
          <HmUserMenu />
        </div>
      </header>

      {/* Mobile step rail */}
      <div className="md:hidden px-6 mb-2 flex justify-center">
        <StepRail currentStep={1} />
      </div>

      {/* Divider */}
      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-0 px-6 md:px-12 pb-6">
        {/* LEFT */}
        <section className="lg:pr-12 lg:border-r lg:border-[#EFE3D2]">
          <div
            className="inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.18em] uppercase px-3 py-1 rounded-full"
            style={{ background: "#FBE5D4", color: "#B04F20" }}
            data-testid="step-indicator"
          >
            Step 1 of 5
          </div>

          <h1 className="mt-3 font-serif-display text-4xl md:text-5xl leading-[1.05] text-[#1C1917] font-medium">
            What's your{" "}
            <span
              className="italic font-semibold"
              style={{ color: "#C85F2B" }}
            >
              craft
            </span>
            ?
          </h1>

          <p className="mt-2 text-[14px] text-[#6A5E53] max-w-md leading-relaxed">
            Choose what you do best. We'll tailor your portfolio experience
            just for you.
          </p>

          {/* Design & engineering */}
          <div className="mt-5">
            <div className="craft-type-label">
              <Sparkles size={14} color="#C85F2B" />
              <span>Design & engineering</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3">
              {CRAFTS.design.items.map((c) => (
                <CraftCard
                  key={c.id}
                  craft={c}
                  selected={selected === c.id}
                  onSelect={setSelected}
                />
              ))}
            </div>
          </div>

          {/* Build Professionals */}
          <div className="mt-4">
            <div className="craft-type-label">
              <Building2 size={14} color="#B04F20" />
              <span>Build Professionals</span>
            </div>
            <div className="mt-3">
              {CRAFTS.build.items.map((c) => (
                <CraftCard
                  key={c.id}
                  craft={c}
                  selected={selected === c.id}
                  onSelect={setSelected}
                  wide
                />
              ))}
            </div>
          </div>

          {/* Skilled Trades */}
          <div className="mt-4">
            <div className="craft-type-label">
              <Wrench size={14} color="#B04F20" />
              <span>Skilled Trades</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
              {CRAFTS.trades.items.map((c) => (
                <CraftCard
                  key={c.id}
                  craft={c}
                  selected={selected === c.id}
                  onSelect={setSelected}
                />
              ))}
            </div>
          </div>

          {error && (
            <div
              className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2"
              data-testid="craft-error"
            >
              {error}
            </div>
          )}
          <div className="mt-6 pt-4 border-t border-[#EFE3D2] flex flex-col sm:flex-row items-center gap-3 justify-between">
            <div
              className="flex items-center gap-3 bg-white/70 border border-[#EFE3D2] rounded-xl px-4 py-3"
              data-testid="privacy-note"
            >
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                style={{ background: "#F1EBE3" }}
              >
                <Shield size={16} color="#8B7E6E" />
              </div>
              <div className="leading-tight">
                <div className="text-[13px] font-semibold text-[#1C1917]">
                  Your information is private and secure
                </div>
                <div className="text-[12px] text-[#7A6E62]">
                  We never share your data with anyone.
                </div>
              </div>
            </div>

            <button
              type="button"
              className="btn-continue w-full sm:w-auto"
              onClick={handleContinue}
              disabled={!selected || submitting}
              data-testid="continue-btn"
            >
              {submitting ? "Saving..." : "Continue"}
              <ArrowRight size={18} className="arrow" />
            </button>
          </div>
        </section>

        {/* RIGHT — benefits above live preview */}
        <section className="lg:pl-12 lg:pt-4">
          <div className="mb-6 rounded-2xl border border-[#EFE3D2] bg-white/85 p-4 shadow-sm">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[#B04F20]">Why join on BuildGuru</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[
                {
                  Icon: Zap,
                  title: "Close deals faster",
                  text: "Clients arrive with clearer briefs; structured approvals cut months of back-and-forth.",
                },
                {
                  Icon: IndianRupee,
                  title: "Get paid on time",
                  text: "Milestone-based payouts aligned to phases — less chasing after you have already delivered.",
                },
                {
                  Icon: Globe,
                  title: "Get discovered",
                  text: "Marketplace visibility plus one serious portfolio link — no separate website required.",
                },
                {
                  Icon: Handshake,
                  title: "Collaborate in one workspace",
                  text: "Timelines, files, and threads with clients and trades — fewer lost WhatsApp chains.",
                },
              ].map((b) => (
                <div key={b.title} className="flex gap-3 rounded-xl border border-[#F5EFE8] bg-[#FFFBF7] p-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#1C1917] text-white">
                    <b.Icon size={16} strokeWidth={1.5} />
                  </div>
                  <div className="min-w-0">
                    <div className="font-serif-display text-sm font-semibold text-[#1C1917]">{b.title}</div>
                    <p className="mt-0.5 text-[12px] leading-snug text-[#6A5E53]">{b.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <LivePreview craftId={selected} />
        </section>
      </div>
    </div>
  );
}
