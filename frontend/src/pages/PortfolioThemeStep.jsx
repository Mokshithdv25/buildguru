import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { StepRail, ProfileStrength, LivePreview } from "../components/SharedUI";
import { HmHeaderBrandLockup } from "../components/HmBrandLockup";
import HmUserMenu from "../components/HmUserMenu";
import { HM_HEADER_BAR_CLASS, HM_TAGLINE_PORTFOLIO } from "../lib/hmBrand";
import {
  DEFAULT_PORTFOLIO_LAYOUT,
  DEFAULT_PORTFOLIO_THEME_ID,
  PORTFOLIO_LAYOUTS,
  PORTFOLIO_THEMES,
  resolvePortfolioTheme,
} from "../lib/portfolioThemes";
import { getPortfolioBase, getPortfolioMedia, setPortfolioBase } from "../lib/portfolioStorage";
import { updatePortfolio } from "../lib/api";
import { ArrowLeft, ArrowRight, Palette, LayoutTemplate, Check } from "lucide-react";
import RouteFallback from "../components/RouteFallback";

function ThemeCard({ theme, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(theme.id)}
      className="text-left rounded-2xl border-2 p-4 transition-all w-full"
      style={{
        borderColor: selected ? theme.accent : "#EFE3D2",
        background: selected ? theme.accentSoft : "#FFFBF7",
        boxShadow: selected ? `0 8px 24px -8px ${theme.accent}44` : "none",
      }}
      aria-pressed={selected}
      data-testid={`theme-card-${theme.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-serif-display text-lg font-semibold text-[#1C1917]">{theme.name}</div>
          <div className="text-[12px] text-[#7A6E62] mt-0.5">{theme.tagline}</div>
          <div className="mt-2 text-[11px] font-medium leading-relaxed text-[#5F554D]">{theme.designImpact}</div>
        </div>
        {selected ? (
          <span
            className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
            style={{ background: theme.accent, color: "#fff" }}
          >
            <Check size={14} strokeWidth={3} />
          </span>
        ) : null}
      </div>
      <div className="flex gap-1.5 mt-3">
        {theme.swatch.map((c) => (
          <span key={c} className="w-8 h-8 rounded-lg border border-white shadow-sm" style={{ background: c }} aria-hidden />
        ))}
      </div>
      <div
        className="mt-3 h-10 rounded-lg border overflow-hidden relative"
        style={{ borderColor: theme.border }}
      >
        <div className="absolute inset-0" style={{ background: theme.swatch[2] || "#1C1917", opacity: 0.85 }} />
        <div
          className="absolute inset-0"
          style={{ background: theme.heroOverlay }}
        />
        <span className="absolute bottom-1.5 left-2 text-[10px] font-bold text-white">Preview strip</span>
      </div>
    </button>
  );
}

export default function PortfolioThemeStep() {
  const navigate = useNavigate();
  const [portfolioId, setPortfolioId] = useState("");
  const [craftId, setCraftId] = useState("");
  const [themeId, setThemeId] = useState(DEFAULT_PORTFOLIO_THEME_ID);
  const [layoutId, setLayoutId] = useState(DEFAULT_PORTFOLIO_LAYOUT);
  const [form, setForm] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const resolvedTheme = useMemo(() => resolvePortfolioTheme(themeId, layoutId), [themeId, layoutId]);

  const handleThemeSelect = (nextThemeId) => {
    const nextTheme = resolvePortfolioTheme(nextThemeId);
    setThemeId(nextThemeId);
    setLayoutId(nextTheme.layout);
  };

  useEffect(() => {
    const pid = localStorage.getItem("hm_portfolio_id");
    if (!pid) {
      navigate("/craft");
      return;
    }
    const saved = getPortfolioBase();
    const media = getPortfolioMedia(pid);
    setPortfolioId(pid);
    setCraftId(saved.craft || localStorage.getItem("hm_craft") || "");
    setThemeId(saved.portfolio_theme || DEFAULT_PORTFOLIO_THEME_ID);
    setLayoutId(saved.portfolio_layout || resolvePortfolioTheme(saved.portfolio_theme).layout);
    setForm({ ...saved, ...media });
  }, [navigate]);

  const handleContinue = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const saved = getPortfolioBase();
      const updated = {
        ...saved,
        portfolio_theme: themeId,
        portfolio_layout: layoutId,
        step: 3,
        profile_strength: 55,
      };
      setPortfolioBase(updated);
      await updatePortfolio(portfolioId, {
        portfolio_theme: themeId,
        portfolio_layout: layoutId,
        step: 3,
        profile_strength: 55,
      });
      navigate("/portfolio");
    } catch (err) {
      setError(err?.message || "Could not save theme.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!form) return <RouteFallback label="Loading theme…" />;

  return (
    <div className="relative min-h-screen bg-[#FBF7F2] overflow-x-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_100%_0%,rgba(193,132,78,0.08),transparent_50%)]" aria-hidden />

      <header className={`${HM_HEADER_BAR_CLASS} hm-desktop-only`} data-testid="hm-header">
        <div className="flex items-center gap-3 md:gap-4 min-w-0">
          <button
            type="button"
            onClick={() => navigate("/details")}
            className="flex items-center gap-2 text-sm font-semibold text-[#1C1917] hover:text-[#C85F2B] transition-colors border border-[#EFE3D2] px-3 py-2 rounded-lg bg-white shrink-0"
          >
            <ArrowLeft size={16} /> Back
          </button>
          <HmHeaderBrandLockup tagline={HM_TAGLINE_PORTFOLIO} truncateTitle className="min-w-0 flex-1" />
        </div>
        <div className="hidden md:block">
          <StepRail currentStep={3} />
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <ProfileStrength value={50} subtext="Make it yours" />
          <HmUserMenu />
        </div>
      </header>

      <div className="md:hidden px-6 mb-2 flex justify-center">
        <StepRail currentStep={3} />
      </div>

      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-0 px-6 md:px-12 pb-32">
        <section className="lg:pr-12 lg:border-r lg:border-[#EFE3D2] pt-8">
          <div className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.18em] uppercase px-3 py-1.5 rounded-full bg-[#FBE5D4] text-[#B04F20]">
            Step 3 of 5
          </div>

          <h1 className="mt-6 font-serif-display text-4xl md:text-5xl leading-[1.05] text-[#1C1917] font-medium">
            Your portfolio{" "}
            <span className="italic font-semibold text-[#C85F2B]">look &amp; feel</span>
          </h1>
          <p className="mt-3 text-[15px] text-[#6A5E53] max-w-md leading-relaxed">
            Architects and designers love controlling presentation. Pick a theme and layout — clients see this on your
            public profile.
          </p>

          <div className="mt-6 flex items-center gap-2 text-sm font-semibold text-[#1C1917]">
            <Palette size={16} className="text-[#C85F2B]" />
            Color theme
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            {PORTFOLIO_THEMES.map((t) => (
              <ThemeCard key={t.id} theme={t} selected={themeId === t.id} onSelect={handleThemeSelect} />
            ))}
          </div>

          <div className="mt-8 flex items-center gap-2 text-sm font-semibold text-[#1C1917]">
            <LayoutTemplate size={16} className="text-[#C85F2B]" />
            Page layout
          </div>
          <div className="flex flex-col gap-2 mt-3">
            {PORTFOLIO_LAYOUTS.map((l) => {
              const active = layoutId === l.id;
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setLayoutId(l.id)}
                  className="rounded-xl border px-4 py-3 text-left transition-colors"
                  style={{
                    borderColor: active ? resolvedTheme.accent : "#EFE3D2",
                    background: active ? resolvedTheme.accentSoft : "#fff",
                  }}
                  aria-pressed={active}
                >
                  <div className="font-semibold text-[#1C1917]">{l.label}</div>
                  <div className="text-[12px] text-[#7A6E62] mt-0.5">{l.description}</div>
                </button>
              );
            })}
          </div>

          {error ? (
            <div className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
          ) : null}

          <div className="mt-8 pt-6 border-t border-[#EFE3D2] flex justify-end">
            <button type="button" className="btn-continue" onClick={handleContinue} disabled={submitting}>
              {submitting ? "Saving…" : "Continue to project photos"}
              <ArrowRight size={18} className="arrow" />
            </button>
          </div>
        </section>

        <section className="lg:pl-12 lg:pt-8 pt-4">
          <LivePreview
            craftId={craftId}
            formValues={form}
            themeId={themeId}
            layoutId={layoutId}
            title="Live preview"
            subtitle="How homeowners will see your public portfolio"
          />
        </section>
      </div>
    </div>
  );
}
