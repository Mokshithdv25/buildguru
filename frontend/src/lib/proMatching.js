import { listPublishedPortfolios } from "./api";

/**
 * Ranks published professional portfolios against a saved project brief.
 *
 * Scoring is deliberately explainable: every point comes from a field the
 * homeowner can see on the professional's public profile, so the UI can show
 * why a match was suggested instead of an opaque number.
 */

const BASE_SCORE = 45;
const MAX_SCORE = 98;

function normalized(value) {
  return String(value || "").trim().toLowerCase();
}

function cityRoot(value) {
  return normalized(value).split(",")[0].trim();
}

/** Words from the brief used to look for overlapping specialties. */
export function briefScopeWords(brief = {}) {
  const source = [
    brief?.room,
    brief?.homeType,
    brief?.propertyType,
    brief?.mainGoal,
    brief?.finishTier,
    ...(Array.isArray(brief?.styles) ? brief.styles : []),
  ]
    .filter(Boolean)
    .join(" ");
  return normalized(source)
    .split(/\s+/)
    .filter((word) => word.length > 3)
    .slice(0, 8);
}

export function scorePro(pro, { city, targetCraft, scopeWords = [] } = {}) {
  let score = BASE_SCORE;
  const reasons = [];

  if (targetCraft && pro.craft === targetCraft) {
    score += 25;
  }

  const proCity = cityRoot(pro.city);
  const projectCity = cityRoot(city);
  if (projectCity && proCity && proCity.includes(projectCity)) {
    score += 15;
    reasons.push(`Works in ${pro.city}`);
  }

  const specialties = Array.isArray(pro.specialties) ? pro.specialties.map(normalized) : [];
  const overlap = scopeWords.filter((word) => specialties.some((specialty) => specialty.includes(word)));
  if (overlap.length) {
    score += Math.min(10, overlap.length * 4);
    reasons.push(`${overlap[0]} experience`);
  }

  const years = Number(pro.years_experience || 0);
  if (years >= 10) {
    score += 6;
    reasons.push(`${years} years experience`);
  } else if (years >= 4) {
    score += 3;
    reasons.push(`${years} years experience`);
  }

  score += Math.min(5, Math.round(Number(pro.profile_strength || 0) / 20));

  return { ...pro, matchScore: Math.min(MAX_SCORE, score), matchReasons: reasons.slice(0, 3) };
}

/**
 * The professional a homeowner needs first depends on whether they already
 * have a designer. Without one, the design decisions come before pricing.
 */
export function primaryCraftForBrief(brief = {}) {
  return brief?.hasArchitect ? "contractor" : "architect";
}

export function rankPros(rows, { city, targetCraft, scopeWords, limit = 3 } = {}) {
  return (rows || [])
    .map((pro) => scorePro(pro, { city, targetCraft, scopeWords }))
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, limit);
}

/**
 * Suggests the starting team for a freshly posted project: the design
 * professionals to talk to first, plus the builders who can price the work.
 * Returns disjoint groups so the same professional never appears twice.
 */
export async function suggestStartingTeam(brief = {}, { architectCount = 2, contractorCount = 3 } = {}) {
  const city = brief?.city || brief?.location || "";
  const scopeWords = briefScopeWords(brief);
  const rows = await listPublishedPortfolios({ limit: 60 });

  const designCrafts = new Set(["architect", "designer"]);
  const buildCrafts = new Set(["contractor", "engineer"]);

  const designers = rankPros(
    (rows || []).filter((pro) => designCrafts.has(pro.craft)),
    { city, targetCraft: "architect", scopeWords, limit: architectCount },
  );
  const chosen = new Set(designers.map((pro) => pro.id));

  const builders = rankPros(
    (rows || []).filter((pro) => buildCrafts.has(pro.craft) && !chosen.has(pro.id)),
    { city, targetCraft: "contractor", scopeWords, limit: contractorCount },
  );
  builders.forEach((pro) => chosen.add(pro.id));

  // Fall back to the strongest remaining trades so a thin local directory still
  // gives the homeowner someone to approach.
  const others = rankPros(
    (rows || []).filter((pro) => !chosen.has(pro.id)),
    { city, targetCraft: primaryCraftForBrief(brief), scopeWords, limit: 3 },
  );

  return {
    designers,
    builders,
    others: designers.length + builders.length >= 2 ? [] : others,
    totalPublished: (rows || []).length,
  };
}
