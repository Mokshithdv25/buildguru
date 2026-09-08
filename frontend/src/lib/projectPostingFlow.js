/** URL phase after wizard — posted for bids/quotes (legacy: `handoff`). */
export const PROJECT_POSTED_PHASE = "posted";
export const LEGACY_HANDOFF_PHASE = "handoff";

export function isProjectPostedPhase(phase) {
  const p = String(phase || "").toLowerCase();
  return p === PROJECT_POSTED_PHASE || p === LEGACY_HANDOFF_PHASE;
}

export function projectHubPostedUrl({ source, projectId }) {
  const params = new URLSearchParams();
  if (projectId) params.set("projectId", projectId);
  if (source) params.set("source", source);
  params.set("phase", PROJECT_POSTED_PHASE);
  params.set("tab", "Bids");
  return `/project?${params.toString()}`;
}

export function browseQuotesUrl({ projectId, city } = {}) {
  const params = new URLSearchParams();
  if (projectId) params.set("projectId", projectId);
  if (city) params.set("city", city);
  const q = params.toString();
  return q ? `/browse?${q}` : "/browse";
}

export const WIZARD_FINAL_STEP = {
  title: "Post project",
  subtitle: "Trade RFQs, one contractor, or your own team",
};

export function proPathLabel(hireModeOrOwnTeam) {
  const ownTeam = typeof hireModeOrOwnTeam === "boolean"
    ? hireModeOrOwnTeam
    : hireModeOrOwnTeam === "own_team";
  if (ownTeam) return "I'm bringing my own architect / contractors";
  if (hireModeOrOwnTeam === "gc") return "Post the whole project for contractor bids";
  if (hireModeOrOwnTeam === "design_first") return "Post a design RFQ first";
  return "Split the work into trade RFQs";
}

export function proPathToggleLabel(hasOwnPros) {
  return hasOwnPros ? "Get marketplace quotes instead" : "I already have my team";
}
