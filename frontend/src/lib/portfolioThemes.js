/** Portfolio look & feel presets for pro public profiles. */

export const PORTFOLIO_LAYOUTS = [
  { id: "classic", label: "Classic hero", description: "Centered name, full-width cover — great for architects." },
  { id: "editorial", label: "Editorial", description: "Taller hero, magazine-style — strong for design studios." },
  { id: "compact", label: "Compact", description: "Shorter hero, dense info — ideal for trades & contractors." },
];

export const PORTFOLIO_THEMES = [
  {
    id: "warm-studio",
    name: "Warm studio",
    tagline: "BuildGuru default — trusted terracotta",
    designImpact: "Soft cream canvas · serif headings · rounded project frames",
    accent: "#C85F2B",
    accentSoft: "#FDF0D8",
    border: "#EFE3D2",
    pageBg: "#FFFBF7",
    surface: "#FFFFFF",
    text: "#1C1917",
    muted: "#6A5E53",
    headingFont: "'Fraunces', 'Playfair Display', Georgia, serif",
    imageRadius: "18px",
    cardRadius: "22px",
    galleryGap: "12px",
    sectionMax: "1080px",
    shadow: "0 18px 50px rgba(99, 55, 30, 0.10)",
    heroOverlay: "linear-gradient(to bottom, rgba(0,0,0,0.12) 0%, rgba(0,0,0,0.68) 100%)",
    layout: "classic",
    swatch: ["#C85F2B", "#FDF0D8", "#1C1917"],
  },
  {
    id: "minimal-slate",
    name: "Minimal slate",
    tagline: "Clean lines, cool neutrals",
    designImpact: "Crisp sans type · square images · spacious editorial grid",
    accent: "#334155",
    accentSoft: "#F1F5F9",
    border: "#E2E8F0",
    pageBg: "#F8FAFC",
    surface: "#FFFFFF",
    text: "#0F172A",
    muted: "#64748B",
    headingFont: "'DM Sans', system-ui, sans-serif",
    imageRadius: "2px",
    cardRadius: "4px",
    galleryGap: "18px",
    sectionMax: "1160px",
    shadow: "0 12px 36px rgba(15, 23, 42, 0.06)",
    heroOverlay: "linear-gradient(to bottom, rgba(15,23,42,0.1) 0%, rgba(15,23,42,0.75) 100%)",
    layout: "editorial",
    swatch: ["#334155", "#F8FAFC", "#0F172A"],
  },
  {
    id: "heritage-clay",
    name: "Heritage clay",
    tagline: "Earthy browns — villas & restoration",
    designImpact: "Parchment canvas · heritage serif · framed photographs",
    accent: "#9A3412",
    accentSoft: "#FFEDD5",
    border: "#FED7AA",
    pageBg: "#FAF3E8",
    surface: "#FFF9F0",
    text: "#3F2C22",
    muted: "#75594A",
    headingFont: "'Fraunces', 'Playfair Display', Georgia, serif",
    imageRadius: "7px",
    cardRadius: "10px",
    galleryGap: "14px",
    sectionMax: "1040px",
    shadow: "0 18px 48px rgba(88, 52, 30, 0.12)",
    heroOverlay: "linear-gradient(135deg, rgba(68,36,20,0.2) 0%, rgba(28,25,23,0.72) 100%)",
    layout: "classic",
    swatch: ["#9A3412", "#FFEDD5", "#44403C"],
  },
  {
    id: "coastal-blue",
    name: "Coastal blue",
    tagline: "Calm blue-grey — contemporary homes",
    designImpact: "Airy blue canvas · elegant type · generous curved images",
    accent: "#1D4ED8",
    accentSoft: "#DBEAFE",
    border: "#BFDBFE",
    pageBg: "#EFF6FF",
    surface: "#FFFFFF",
    text: "#172554",
    muted: "#526482",
    headingFont: "'Playfair Display', 'Fraunces', Georgia, serif",
    imageRadius: "26px",
    cardRadius: "28px",
    galleryGap: "14px",
    sectionMax: "1120px",
    shadow: "0 20px 54px rgba(30, 64, 175, 0.10)",
    heroOverlay: "linear-gradient(to bottom, rgba(30,58,138,0.15) 0%, rgba(15,23,42,0.7) 100%)",
    layout: "editorial",
    swatch: ["#1D4ED8", "#EFF6FF", "#1E3A5F"],
  },
  {
    id: "forest-craft",
    name: "Forest craft",
    tagline: "Deep green — sustainable & landscape",
    designImpact: "Organic corners · natural green canvas · compact story flow",
    accent: "#047857",
    accentSoft: "#D1FAE5",
    border: "#A7F3D0",
    pageBg: "#F0FDF4",
    surface: "#FAFFFC",
    text: "#143027",
    muted: "#557065",
    headingFont: "'DM Sans', system-ui, sans-serif",
    imageRadius: "28px 8px 28px 8px",
    cardRadius: "28px 8px 28px 8px",
    galleryGap: "12px",
    sectionMax: "1020px",
    shadow: "0 18px 48px rgba(4, 120, 87, 0.09)",
    heroOverlay: "linear-gradient(to bottom, rgba(6,78,59,0.2) 0%, rgba(6,24,20,0.75) 100%)",
    layout: "compact",
    swatch: ["#047857", "#ECFDF5", "#14532D"],
  },
  {
    id: "noir-contrast",
    name: "Noir contrast",
    tagline: "High contrast — bold portfolios",
    designImpact: "Dark gallery canvas · bold sans type · edge-to-edge imagery",
    accent: "#F97316",
    accentSoft: "#FFF7ED",
    border: "#292524",
    pageBg: "#0C0A09",
    surface: "#1C1917",
    text: "#FAFAF9",
    muted: "#D6D3D1",
    headingFont: "'DM Sans', system-ui, sans-serif",
    imageRadius: "0px",
    cardRadius: "0px",
    galleryGap: "4px",
    sectionMax: "1200px",
    shadow: "none",
    heroOverlay: "linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.88) 100%)",
    layout: "compact",
    swatch: ["#F97316", "#FAFAF9", "#0C0A09"],
  },
];

export const DEFAULT_PORTFOLIO_THEME_ID = "warm-studio";
export const DEFAULT_PORTFOLIO_LAYOUT = "classic";

export function resolvePortfolioTheme(themeId, layoutOverride) {
  const base = PORTFOLIO_THEMES.find((t) => t.id === themeId) || PORTFOLIO_THEMES[0];
  const layout = layoutOverride || base.layout || DEFAULT_PORTFOLIO_LAYOUT;
  return { ...base, layout };
}

export function getPortfolioThemeFromRecord(record) {
  if (!record || typeof record !== "object") {
    return resolvePortfolioTheme(DEFAULT_PORTFOLIO_THEME_ID);
  }
  return resolvePortfolioTheme(
    record.portfolio_theme || record.theme_id || DEFAULT_PORTFOLIO_THEME_ID,
    record.portfolio_layout || null,
  );
}

export function portfolioThemeCssVars(theme) {
  const t = theme || resolvePortfolioTheme(DEFAULT_PORTFOLIO_THEME_ID);
  return {
    "--hm-portfolio-accent": t.accent,
    "--hm-portfolio-accent-soft": t.accentSoft,
    "--hm-portfolio-border": t.border,
    "--hm-portfolio-hero-overlay": t.heroOverlay,
    "--hm-portfolio-page-bg": t.pageBg,
    "--hm-portfolio-surface": t.surface,
    "--hm-portfolio-text": t.text,
    "--hm-portfolio-muted": t.muted,
    "--hm-portfolio-heading-font": t.headingFont,
    "--hm-portfolio-image-radius": t.imageRadius,
    "--hm-portfolio-card-radius": t.cardRadius,
    "--hm-portfolio-gallery-gap": t.galleryGap,
    "--hm-portfolio-section-max": t.sectionMax,
    "--hm-portfolio-shadow": t.shadow,
  };
}
