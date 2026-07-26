import { publicProfileUrl } from "./publicWebUrl";

const INTENT_KEY = "hm_career_portfolio_intent";
export const ARCHITECT_PRODUCT_MANAGER_JOB_ID = "00000000-0000-4000-8000-000000000101";

export function roleRequiresHomeMakersPortfolio(job) {
  return String(job?.id || "") === ARCHITECT_PRODUCT_MANAGER_JOB_ID;
}

export function readCareerPortfolioIntent() {
  try {
    return JSON.parse(localStorage.getItem(INTENT_KEY) || "null");
  } catch {
    return null;
  }
}

export function saveCareerPortfolioIntent(job, application = {}) {
  try {
    localStorage.setItem(INTENT_KEY, JSON.stringify({
      jobId: job.id,
      jobTitle: job.title,
      application,
      startedAt: new Date().toISOString(),
    }));
  } catch {
    /* localStorage may be unavailable in hardened browser contexts */
  }
}

export function attachPortfolioToCareerIntent({ id, slug }) {
  const intent = readCareerPortfolioIntent();
  if (!intent?.jobId || !slug) return null;
  const next = {
    ...intent,
    portfolioId: id || null,
    portfolioUrl: publicProfileUrl(slug),
  };
  try {
    localStorage.setItem(INTENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

export function clearCareerPortfolioIntent(jobId) {
  const intent = readCareerPortfolioIntent();
  if (!jobId || intent?.jobId === jobId) {
    try {
      localStorage.removeItem(INTENT_KEY);
    } catch {
      /* ignore */
    }
  }
}

export function readPublishedPortfolioForCareer() {
  try {
    const portfolio = JSON.parse(localStorage.getItem("hm_portfolio") || "null");
    if (!portfolio?.published || !portfolio?.slug) return null;
    return {
      id: portfolio.id || localStorage.getItem("hm_portfolio_id") || null,
      slug: portfolio.slug,
      url: publicProfileUrl(portfolio.slug),
      name: portfolio.business_name || portfolio.full_name || "Your HomeMakers practice",
    };
  } catch {
    return null;
  }
}

export function careerApplicationReturnPath(jobId) {
  return `/careers?apply=${encodeURIComponent(jobId)}`;
}
