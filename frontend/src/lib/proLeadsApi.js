import { getSupabase } from "./supabaseClient";

const LEAD_FIELDS = [
  "project_id",
  "title",
  "flow_type",
  "city",
  "state",
  "budget_min",
  "budget_max",
  "timeline_completion",
  "start_timeline",
  "scope_label",
  "styles_json",
  "property_type",
  "area_sqft",
  "room_size_label",
  "plot_width",
  "plot_length",
  "floors",
  "facing",
  "finish_tier",
  "main_goal",
  "change_level",
  "homeowner_has_architect",
  "has_ai_design_pack",
  "posted_at",
  "targeted_to_you",
  "invited_to_you",
].join(", ");

const RESPONSE_FIELDS = [
  "id",
  "project_id",
  "portfolio_id",
  "status",
  "response_note",
  "proposed_budget",
  "bid_amount_inr",
  "bid_timeline_weeks",
  "bid_scope_note",
  "bid_submitted_at",
  "bid_valid_until",
  "homeowner_decision",
  "homeowner_decided_at",
  "created_at",
  "updated_at",
].join(", ");

const AWARDED_FIELDS = [
  "project_id",
  "title",
  "flow_type",
  "location",
  "city",
  "state",
  "timeline_completion",
  "bid_amount_inr",
  "bid_timeline_weeks",
  "homeowner_decided_at",
  "homeowner_name",
  "homeowner_phone",
  "homeowner_email",
].join(", ");

const PRO_STATUSES = ["viewed", "interested", "bid_submitted", "proposal_sent", "won", "declined"];

function schemaIsMissing(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    code === "42703" ||
    message.includes("schema cache") ||
    message.includes("could not find the table") ||
    (message.includes("column") && message.includes("does not exist")) ||
    (message.includes("relation") && message.includes("does not exist"))
  );
}

function normalizeStyles(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function leadStatusLabel(status) {
  return {
    new: "New",
    viewed: "Viewed",
    interested: "Interested",
    bid_submitted: "Bid submitted",
    proposal_sent: "Proposal sent",
    won: "Active project",
    declined: "Declined",
  }[status] || "New";
}

export function homeownerDecisionLabel(decision) {
  return {
    pending: "Awaiting homeowner",
    shortlisted: "Shortlisted by homeowner",
    accepted: "Bid accepted",
    declined: "Not selected",
  }[decision] || "";
}

/** Scope fields the professional needs to price the work, labelled for display. */
export function leadScopeDetails(lead) {
  const plot = [lead?.plot_width, lead?.plot_length].filter(Boolean).join(" × ");
  return [
    ["Property", lead?.property_type],
    ["Plot", plot ? `${plot} ft` : ""],
    ["Area", lead?.area_sqft ? `${lead.area_sqft} sq ft` : lead?.room_size_label],
    ["Floors", lead?.floors],
    ["Facing", lead?.facing],
    ["Finish level", lead?.finish_tier],
    ["Main goal", lead?.main_goal],
    ["Change level", lead?.change_level],
    ["Start", lead?.start_timeline],
  ].filter(([, value]) => Boolean(String(value || "").trim()));
}

export async function listProLeads(portfolioId) {
  const supabase = getSupabase();
  if (!supabase || !portfolioId) {
    return {
      leads: [],
      configured: Boolean(supabase),
      error: portfolioId ? null : "Finish your professional profile to receive leads.",
    };
  }

  const [leadResult, responseResult] = await Promise.all([
    supabase.from("pro_lead_opportunities").select(LEAD_FIELDS).order("posted_at", { ascending: false }),
    supabase.from("project_lead_responses").select(RESPONSE_FIELDS).eq("portfolio_id", portfolioId),
  ]);

  const firstError = leadResult.error || responseResult.error;
  if (firstError) {
    if (schemaIsMissing(firstError)) return { leads: [], configured: false, error: null };
    throw firstError;
  }

  const responses = new Map((responseResult.data || []).map((row) => [String(row.project_id), row]));
  const leads = (leadResult.data || []).map((row) => {
    const response = responses.get(String(row.project_id)) || null;
    return {
      ...row,
      styles: normalizeStyles(row.styles_json),
      response,
      status: response?.status || "new",
      homeownerDecision: response?.homeowner_decision || "pending",
    };
  });

  return { leads, configured: true, error: null };
}

export async function updateProLeadResponse({ projectId, portfolioId, status, note = null, proposedBudget = null }) {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Professional leads are not configured.");
  if (!projectId || !portfolioId) throw new Error("Choose a valid homeowner project.");
  if (!PRO_STATUSES.includes(status)) throw new Error("Choose a valid lead status.");

  const row = {
    project_id: projectId,
    portfolio_id: portfolioId,
    status,
    response_note: note || null,
    proposed_budget: proposedBudget == null || proposedBudget === "" ? null : Number(proposedBudget),
  };

  const { data, error } = await supabase
    .from("project_lead_responses")
    .upsert(row, { onConflict: "project_id,portfolio_id" })
    .select(RESPONSE_FIELDS)
    .single();
  if (error) throw error;
  return data;
}

/**
 * Submits or revises a structured bid. The homeowner decision resets to
 * `pending` on a revision so a stale acceptance never applies to a new price.
 */
export async function submitProBid({
  projectId,
  portfolioId,
  amountInr,
  timelineWeeks = null,
  scopeNote = "",
  validUntil = null,
}) {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Professional bidding is not configured.");
  if (!projectId || !portfolioId) throw new Error("Choose a valid homeowner project.");

  const amount = Number(amountInr);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Enter your bid amount in rupees.");
  }

  const weeks = timelineWeeks === "" || timelineWeeks == null ? null : Number(timelineWeeks);
  if (weeks != null && (!Number.isInteger(weeks) || weeks <= 0 || weeks > 520)) {
    throw new Error("Enter the delivery timeline in weeks (1–520).");
  }

  const note = String(scopeNote || "").trim();
  if (note.length > 4000) throw new Error("Keep the scope note under 4000 characters.");

  const row = {
    project_id: projectId,
    portfolio_id: portfolioId,
    status: "bid_submitted",
    bid_amount_inr: amount,
    bid_timeline_weeks: weeks,
    bid_scope_note: note || null,
    bid_submitted_at: new Date().toISOString(),
    bid_valid_until: validUntil || null,
    // Keep the legacy column aligned so older reports stay accurate.
    proposed_budget: amount,
    homeowner_decision: "pending",
    homeowner_decided_at: null,
  };

  const { data, error } = await supabase
    .from("project_lead_responses")
    .upsert(row, { onConflict: "project_id,portfolio_id" })
    .select(RESPONSE_FIELDS)
    .single();
  if (error) {
    if (schemaIsMissing(error)) {
      throw new Error("Bidding is not enabled on this workspace yet. Run the project bids migration.");
    }
    throw error;
  }
  return data;
}

export async function withdrawProBid({ projectId, portfolioId }) {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Professional bidding is not configured.");
  if (!projectId || !portfolioId) throw new Error("Choose a valid homeowner project.");

  const { data, error } = await supabase
    .from("project_lead_responses")
    .update({
      status: "interested",
      bid_amount_inr: null,
      bid_timeline_weeks: null,
      bid_scope_note: null,
      bid_submitted_at: null,
      bid_valid_until: null,
      proposed_budget: null,
      homeowner_decision: "pending",
      homeowner_decided_at: null,
    })
    .eq("project_id", projectId)
    .eq("portfolio_id", portfolioId)
    .select(RESPONSE_FIELDS)
    .single();
  if (error) throw error;
  return data;
}

/** Projects where the homeowner accepted this professional's bid. */
export async function listAwardedProjects(portfolioId) {
  const supabase = getSupabase();
  if (!supabase || !portfolioId) return { projects: [], configured: Boolean(supabase) };

  const { data, error } = await supabase
    .from("pro_awarded_projects")
    .select(AWARDED_FIELDS)
    .eq("portfolio_id", portfolioId)
    .order("homeowner_decided_at", { ascending: false });
  if (error) {
    if (schemaIsMissing(error)) return { projects: [], configured: false };
    throw error;
  }
  return { projects: data || [], configured: true };
}
