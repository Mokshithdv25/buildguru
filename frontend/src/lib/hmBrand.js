/**
 * Shared BuildGuru chrome — logo sizes, header bar, wordmark.
 * Top bar + lockup match the marketing homepage (`LandingNavbar`) for a single baseline.
 */

/** Logo asset used in all header lockups (same mark as homepage). */
export const hmLogoMarkSrc = `${typeof process !== "undefined" && process.env && process.env.PUBLIC_URL ? process.env.PUBLIC_URL : ""}/logo.svg`;

/** Full-width marketing / wizard header — img px size (sidebar scales from this) */
export const HM_LOGO_HEADER = 62;

/** Pro portfolio & onboarding (craft pick, details, publish) */
export const HM_TAGLINE_PORTFOLIO = "Your Portfolio. Your Identity.";

/** New-home build wizard only (`/build/new-home`) */
export const HM_TAGLINE_NEW_HOME = "Turn your vision into your dream home with the power of AI";

/** Remodel / renovate wizard only (`/build/remodel`) */
export const HM_TAGLINE_REMODEL = "Reimagine your home with the power of AI";

/** “What are you building?” chooser (`/build`) — before new vs remodel */
export const HM_TAGLINE_BUILD_CHOOSER = "New build or refresh — your vision, powered by AI";

/** Project hub — /project, documents, team, marketplace, stage sidebars */
export const HM_TAGLINE_PROJECT_HUB = "Project management made hassle-free with the power of AI";

/** Marketing homepage under the main lockup (`/`) */
export const HM_TAGLINE_HOME_PLATFORM = "Design, build, and manage your home in one place — with the power of AI";

/** Narrow project sidebar rail — scaled with title so ratio matches header lockup */
export const HM_LOGO_COMPACT = 40;

/** Project hub (e.g. /project) — larger mark + wordmark; pass to {@link HmSidebarBrandMark} as `size` */
export const HM_LOGO_PROJECT_SIDEBAR = 56;

/** Content offset below fixed marketing nav (no tagline). */
export const HM_FIXED_NAV_OFFSET_CLASS = "pt-[4.65rem]";

/** Content offset when nav shows a contextual tagline under the wordmark. */
export const HM_FIXED_NAV_OFFSET_TAGLINE_CLASS = "pt-[5.75rem]";

/** Border + cream wash + blur — shared by fixed landing nav and sticky app headers */
export const HM_HEADER_BAR_CHROME_CLASS =
  "border-b border-black/5 bg-[rgba(251,247,242,0.92)] backdrop-blur-2xl backdrop-saturate-150";

/** Wizard / flow pages: full-width row under the marketing top bar */
export const HM_HEADER_BAR_CLASS = [
  "relative z-20 sticky top-0",
  HM_HEADER_BAR_CHROME_CLASS,
  "px-5 md:px-10 py-3",
  "flex flex-wrap items-center justify-between gap-4",
  "min-h-[4.65rem]",
].join(" ");

/** Project hub & tools: same chrome, 3-column grid (brand / project / actions) */
export const HM_PROJECT_HUB_HEADER_CLASS = [
  "relative z-20 sticky top-0",
  HM_HEADER_BAR_CHROME_CLASS,
  "px-5 md:px-10 py-3 md:py-4",
  "flex flex-col gap-3 sm:grid sm:grid-cols-[auto_minmax(0,1.5fr)_auto] sm:items-center sm:gap-x-3 md:gap-x-6 sm:gap-y-0",
].join(" ");

/** Primary “BuildGuru” wordmark next to the mark — homepage baseline */
export const HM_WORDMARK_TITLE_CLASS =
  "font-display text-[30px] md:text-[42px] tracking-[0.03em] font-semibold leading-none pb-1 text-[#A86A31] [text-shadow:0_1px_0_rgba(255,255,255,0.25)]";

/** Context line under the wordmark — black body tone, not accent copper */
export const HM_WORDMARK_TAGLINE_CLASS =
  "text-[12px] sm:text-[13px] font-semibold text-[#1C1917] tracking-wide mt-0.5 max-w-md whitespace-normal";

/** Project hub & tools — one line under the wordmark */
export const HM_WORDMARK_TAGLINE_SINGLE_LINE =
  "text-[10px] sm:text-[11px] md:text-xs font-semibold text-[#1C1917] tracking-wide mt-0.5 whitespace-nowrap leading-tight min-w-0";

/** Sidebar strip behind logo + wordmark (project tools) — gap matches header gap-3 */
export const HM_SIDEBAR_BRAND_CLASS =
  "flex items-center gap-3 px-5 py-[17px] border-b border-black/5 bg-[rgba(251,247,242,0.92)] backdrop-blur-xl backdrop-saturate-150 cursor-pointer";

/** Sidebar “BuildGuru” — same copper display treatment as the main header, scaled down */
export const HM_SIDEBAR_WORDMARK_CLASS =
  "font-display text-lg font-semibold text-[#A86A31] tracking-[0.03em] leading-tight [text-shadow:0_1px_0_rgba(255,255,255,0.2)]";

/** Bigger project-hub wordmark (pair with {@link HM_LOGO_PROJECT_SIDEBAR}) */
export const HM_SIDEBAR_WORDMARK_LG_CLASS =
  "font-display text-2xl font-semibold text-[#A86A31] tracking-[0.03em] leading-tight [text-shadow:0_1px_0_rgba(255,255,255,0.2)]";

/** Primary accent — keep in sync with `OR` in project pages */
const HM_ACCENT = "#C85F2B";

/** Project hub left rail width (px). */
export const HM_PROJECT_SIDEBAR_RAIL_PX = 232;

/** Demo project copy for hub UIs (replace with real project from API). */
export const HM_HUB_DEMO_PROJECT = {
  line1: "Shanti Nagar Residence",
  line2: "Sharma Project",
  meta: "Remodel · Bengaluru, Karnataka",
};

/**
 * Project hub left rail (Overview, Documents, Team, Marketplace, stage).
 * Overview used warm gray; other tabs used flat white — unify on this.
 */
export const hmProjectSidebarAsideStyle = {
  width: HM_PROJECT_SIDEBAR_RAIL_PX,
  flexShrink: 0,
  background: "#F5F3F0",
  borderRight: "1px solid #E5E2DD",
  display: "flex",
  flexDirection: "column",
  position: "sticky",
  top: 0,
  alignSelf: "flex-start",
  /** Below fixed marketing nav with contextual tagline */
  height: "calc(100dvh - 5.75rem)",
  minHeight: 0,
  overflowY: "auto",
};

/** Full-page wash behind project hub content (match `ProjectDashboard`). */
export const hmProjectHubPageBackground = "#F0EDE8";

/** “Current project” block under PROJECTS — readable on the gray rail */
export const hmProjectSidebarProjectCardStyle = {
  background: "#FFFBF7",
  border: "1px solid #E5E2DD",
  borderRadius: 8,
  padding: "10px 12px",
  cursor: "pointer",
};

/** Sidebar nav scroll area — inset matches Overview */
export const hmProjectSidebarNavScrollStyle = {
  flex: 1,
  padding: "0 10px",
  overflowY: "auto",
};

/**
 * One nav row — active: muted fill + orange left rail (same as Overview).
 * Inactive: transparent + reserved left border so width does not jump.
 */
export function hmProjectSidebarNavItemStyle(active) {
  return {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 8,
    marginBottom: 2,
    background: active ? "#EDE8E4" : "transparent",
    cursor: "pointer",
    color: active ? "#1C1917" : "#5C5147",
    fontWeight: active ? 700 : 500,
    fontSize: 14,
    borderLeft: active ? `3px solid ${HM_ACCENT}` : "3px solid transparent",
  };
}

/** Bottom help / chat strip */
export const hmProjectSidebarFooterStyle = {
  padding: "16px 16px",
  borderTop: "1px solid #E5E2DD",
  background: "#F0EDE8",
};
