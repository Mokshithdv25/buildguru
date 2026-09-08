/**
 * How a homeowner wants to hire after the design/estimate is ready.
 *
 * Pattern: Houzz category quotes + construction bid packages (BuildingConnected /
 * BidClerk). Comparable bids need a shared scope — either one GC prices the
 * whole brief, or each trade prices the same checklist.
 *
 * Keep ids in sync with db/buildguru_hire_workflows.sql (`brief_hire_mode`).
 */

export const HIRE_MODES = {
  trades: {
    id: "trades",
    label: "Split by trade",
    short: "Trade RFQs",
    recommended: true,
    summary: "Post separate RFQs for design, civil, electrical, plumbing, carpentry, painting, and materials.",
    detail: "Each trade prices the same checklist, so bids are comparable. Award one package at a time.",
    cta: "Post trade RFQs",
  },
  gc: {
    id: "gc",
    label: "One contractor",
    short: "Whole project",
    recommended: false,
    summary: "Post the whole brief and let a general contractor (or architect-led team) quote the job.",
    detail: "Best when you want a single point of contact. You can still add trade packages later.",
    cta: "Post whole project",
  },
  design_first: {
    id: "design_first",
    label: "Design first",
    short: "Design RFQ",
    recommended: false,
    summary: "Get an architect or interior designer on drawings before anyone prices construction.",
    detail: "Construction and MEP packages stay private until you publish them.",
    cta: "Post a design RFQ",
  },
  own_team: {
    id: "own_team",
    label: "I have my team",
    short: "Own team",
    recommended: false,
    summary: "Skip the marketplace. Invite people you already work with into this project hub.",
    detail: "Nothing is visible to marketplace professionals until you change this.",
    cta: "Open project hub",
  },
};

export const HIRE_MODE_ORDER = ["trades", "gc", "design_first", "own_team"];

export function hireModeMeta(id) {
  return HIRE_MODES[id] || HIRE_MODES.trades;
}

/** Resolve a brief (or raw id) to a hire mode. Legacy: hasArchitect → own_team, else gc. */
export function normalizeHireMode(briefOrMode) {
  if (typeof briefOrMode === "string") {
    return HIRE_MODES[briefOrMode] ? briefOrMode : "gc";
  }
  const brief = briefOrMode || {};
  const raw = brief.hireMode || brief.hire_mode;
  if (HIRE_MODES[raw]) return raw;
  if (brief.hasArchitect) return "own_team";
  return "gc";
}

export function isOwnTeamHire(mode) {
  return normalizeHireMode(mode) === "own_team";
}

/** Whole-project lead inbox (contractors quoting the entire brief). */
export function postsWholeProjectLeads(mode) {
  return normalizeHireMode(mode) === "gc";
}

/** Trade-scoped RFQs are the primary surface. */
export function postsWorkPackages(mode) {
  const id = normalizeHireMode(mode);
  return id === "trades" || id === "design_first";
}

/** Marketplace-visible at all (packages and/or whole-project). */
export function marketplacePostsProject(mode) {
  return normalizeHireMode(mode) !== "own_team";
}

export function hireModeFromLegacyFlag(hasOwnTeam) {
  return hasOwnTeam ? "own_team" : "trades";
}
