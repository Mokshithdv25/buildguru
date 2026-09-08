import { getSupabase } from "./supabaseClient";
import { WORK_PACKAGE_TYPES } from "./workPackageCatalog";

/**
 * Work packages (trade-scoped RFQs) and structured bids.
 *
 * Homeowners own `project_work_packages` rows directly under RLS and read bids
 * through `work_package_bids_for_owner`. Decisions, publishing and Q&A answers go
 * through security-definer functions so a homeowner can never edit a bid.
 *
 * Professionals see packages through `pro_work_package_opportunities`, write
 * their own `project_work_package_bids` rows, and receive homeowner contact only
 * through `pro_awarded_work_packages` after acceptance.
 */

export const WORK_PACKAGE_STATUSES = ["draft", "open", "under_review", "awarded", "closed", "cancelled"];
export const WORK_PACKAGE_BID_DECISIONS = ["pending", "shortlisted", "accepted", "declined"];
export const WORK_PACKAGE_PRICING = ["turnkey", "labour_only", "material_only", "design_fee", "open"];

const PACKAGE_FIELDS = [
  "id", "project_id", "created_by", "package_type", "eligible_crafts", "title", "summary", "scope_items",
  "inclusions", "exclusions", "pricing_basis", "site_visit_required", "budget_hint_inr", "show_budget_to_pros",
  "bids_due_at", "target_start", "target_completion", "max_bids", "attachments_json", "status",
  "awarded_bid_id", "awarded_at", "published_at", "closed_at", "created_at", "updated_at",
].join(", ");

const OWNER_BID_FIELDS = [
  "bid_id", "package_id", "project_id", "portfolio_id", "status", "homeowner_decision", "homeowner_decided_at",
  "total_amount_inr", "gst_included", "pricing_basis", "line_items", "inclusions", "exclusions", "assumptions",
  "timeline_weeks", "can_start_on", "warranty_months", "advance_pct", "payment_schedule_note", "site_visit_done",
  "valid_until", "cover_note", "revision", "submitted_at", "craft", "pro_name", "pro_city", "years_experience",
  "specialties", "profile_photo", "slug", "profile_strength", "pro_phone", "pro_email", "was_invited",
].join(", ");

const PRO_BID_FIELDS = [
  "id", "package_id", "project_id", "portfolio_id", "status", "homeowner_decision", "homeowner_decided_at",
  "total_amount_inr", "gst_included", "pricing_basis", "line_items", "inclusions", "exclusions", "assumptions",
  "timeline_weeks", "can_start_on", "warranty_months", "advance_pct", "payment_schedule_note", "site_visit_done",
  "valid_until", "cover_note", "revision", "submitted_at", "withdrawn_at", "created_at", "updated_at",
].join(", ");

const OPPORTUNITY_FIELDS = [
  "package_id", "project_id", "package_type", "eligible_crafts", "title", "summary", "scope_items", "inclusions",
  "exclusions", "pricing_basis", "site_visit_required", "budget_hint_inr", "bids_due_at", "target_start",
  "target_completion", "max_bids", "status", "published_at", "attachment_names", "project_title", "flow_type",
  "city", "state", "scope_label", "area_sqft", "floors", "finish_tier", "styles_json", "has_ai_design_pack",
  "bid_count", "answered_question_count", "invited_to_you",
].join(", ");

const QUESTION_FIELDS = "id, package_id, project_id, portfolio_id, question, answer, answered_at, created_at";
const PRO_QUESTION_FIELDS = "id, package_id, question, answer, answered_at, created_at, asked_by_you";
const INVITE_FIELDS = "id, package_id, project_id, portfolio_id, invited_by, note, created_at";
const EVENT_FIELDS = "id, package_id, project_id, audience, target_portfolio_id, event_type, title, body, payload, read_at, created_at";
const AWARDED_FIELDS = [
  "bid_id", "package_id", "project_id", "portfolio_id", "package_title", "package_type", "project_title", "flow_type",
  "location", "city", "state", "total_amount_inr", "timeline_weeks", "homeowner_decided_at", "homeowner_name",
  "homeowner_phone", "homeowner_email",
].join(", ");

export function workPackageSchemaMissing(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST202" ||
    code === "PGRST205" ||
    code === "42703" ||
    message.includes("schema cache") ||
    message.includes("could not find the table") ||
    message.includes("could not find the function") ||
    (message.includes("relation") && message.includes("does not exist"))
  );
}

const NOT_ENABLED = "Work packages are not enabled on this workspace yet. Run the work packages migration.";

function requireClient() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Work packages are not configured.");
  return supabase;
}

async function requireUserId(supabase) {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error("Sign in to continue.");
  return user.id;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizePackage(row) {
  if (!row) return row;
  return {
    ...row,
    scope_items: asArray(row.scope_items),
    attachments_json: asArray(row.attachments_json),
    eligible_crafts: Array.isArray(row.eligible_crafts) ? row.eligible_crafts : [],
  };
}

function normalizeBid(row) {
  if (!row) return row;
  return {
    ...row,
    line_items: asArray(row.line_items),
    specialties: asArray(row.specialties).filter(Boolean).map(String),
  };
}

function normalizeOpportunity(row) {
  return {
    ...row,
    scope_items: asArray(row.scope_items),
    attachment_names: asArray(row.attachment_names),
    styles: asArray(row.styles_json).filter(Boolean).map(String),
    eligible_crafts: Array.isArray(row.eligible_crafts) ? row.eligible_crafts : [],
    bid_count: Number(row.bid_count) || 0,
    answered_question_count: Number(row.answered_question_count) || 0,
  };
}

function cleanScopeItems(items) {
  return (items || [])
    .map((row) => ({
      id: String(row?.id || "").slice(0, 40) || undefined,
      label: String(row?.label || "").trim().slice(0, 240),
      quantity: row?.quantity === "" || row?.quantity == null ? "" : String(row.quantity).slice(0, 30),
      unit: String(row?.unit || "").trim().slice(0, 30),
      notes: String(row?.notes || "").trim().slice(0, 400),
    }))
    .filter((row) => row.label);
}

function optionalText(value, max) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (text.length > max) throw new Error(`Keep this under ${max} characters.`);
  return text;
}

function optionalNumber(value, { min = 0, max = Infinity, integer = false, label = "value" } = {}) {
  if (value === "" || value == null) return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < min || num > max || (integer && !Number.isInteger(num))) {
    throw new Error(`Enter a valid ${label}.`);
  }
  return num;
}

function optionalDate(value) {
  const text = String(value || "").trim();
  return text ? text : null;
}

// ---------------------------------------------------------------------------
// Homeowner — packages
// ---------------------------------------------------------------------------

export async function listWorkPackages(projectId) {
  const supabase = getSupabase();
  if (!supabase || !projectId) return { packages: [], configured: Boolean(supabase) };

  const { data, error } = await supabase
    .from("project_work_packages")
    .select(PACKAGE_FIELDS)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) {
    if (workPackageSchemaMissing(error)) return { packages: [], configured: false };
    throw error;
  }
  return { packages: (data || []).map(normalizePackage), configured: true };
}

function packagePayload(input) {
  const type = WORK_PACKAGE_TYPES[input.packageType] ? input.packageType : "other";
  const title = String(input.title || "").trim();
  if (title.length < 3) throw new Error("Give the work package a title (at least 3 characters).");
  if (title.length > 140) throw new Error("Keep the title under 140 characters.");
  const crafts = Array.isArray(input.eligibleCrafts) ? input.eligibleCrafts.filter(Boolean).map(String) : WORK_PACKAGE_TYPES[type].crafts;
  const maxBids = optionalNumber(input.maxBids, { min: 1, max: 25, integer: true, label: "bid limit (1–25)" }) ?? 8;
  return {
    package_type: type,
    eligible_crafts: crafts,
    title,
    summary: optionalText(input.summary, 4000),
    scope_items: cleanScopeItems(input.scopeItems),
    inclusions: optionalText(input.inclusions, 3000),
    exclusions: optionalText(input.exclusions, 3000),
    pricing_basis: WORK_PACKAGE_PRICING.includes(input.pricingBasis) ? input.pricingBasis : WORK_PACKAGE_TYPES[type].pricingBasis,
    site_visit_required: Boolean(input.siteVisitRequired),
    budget_hint_inr: optionalNumber(input.budgetHintInr, { min: 0, label: "budget in rupees" }),
    show_budget_to_pros: Boolean(input.showBudgetToPros),
    bids_due_at: input.bidsDueAt ? new Date(input.bidsDueAt).toISOString() : null,
    target_start: optionalDate(input.targetStart),
    target_completion: optionalDate(input.targetCompletion),
    max_bids: maxBids,
    attachments_json: (input.attachments || []).slice(0, 20).map((doc) => ({
      document_id: String(doc.document_id || doc.id || ""),
      name: String(doc.name || doc.file_name || "Document").slice(0, 160),
      category: String(doc.category || "other").slice(0, 40),
    })),
  };
}

export async function createWorkPackage({ projectId, ...input }) {
  const supabase = requireClient();
  if (!projectId) throw new Error("Choose a project first.");
  const userId = await requireUserId(supabase);
  const row = { project_id: projectId, created_by: userId, status: "draft", ...packagePayload(input) };
  const { data, error } = await supabase.from("project_work_packages").insert(row).select(PACKAGE_FIELDS).single();
  if (error) {
    if (workPackageSchemaMissing(error)) throw new Error(NOT_ENABLED);
    throw error;
  }
  return normalizePackage(data);
}

export async function updateWorkPackage({ packageId, ...input }) {
  const supabase = requireClient();
  if (!packageId) throw new Error("Choose a work package to update.");
  const { data, error } = await supabase
    .from("project_work_packages")
    .update(packagePayload(input))
    .eq("id", packageId)
    .select(PACKAGE_FIELDS)
    .single();
  if (error) throw error;
  return normalizePackage(data);
}

export async function deleteDraftWorkPackage(packageId) {
  const supabase = requireClient();
  const { error } = await supabase.from("project_work_packages").delete().eq("id", packageId).eq("status", "draft");
  if (error) throw error;
  return true;
}

export async function closeExpiredWorkPackages(projectId) {
  const supabase = getSupabase();
  if (!supabase) return 0;
  const { data, error } = await supabase.rpc("close_expired_work_packages", {
    target_project_id: projectId || null,
  });
  if (error) {
    if (workPackageSchemaMissing(error)) return 0;
    throw error;
  }
  return Number(data) || 0;
}

export async function publishWorkPackage(packageId) {
  const supabase = requireClient();
  const { data, error } = await supabase.rpc("publish_work_package", { target_package_id: packageId });
  if (error) {
    if (workPackageSchemaMissing(error)) throw new Error(NOT_ENABLED);
    throw error;
  }
  return normalizePackage(Array.isArray(data) ? data[0] : data);
}

export async function setWorkPackageStatus(packageId, status) {
  const supabase = requireClient();
  if (!["open", "under_review", "closed", "cancelled"].includes(status)) throw new Error("Choose a valid status.");
  const { data, error } = await supabase.rpc("set_work_package_status", {
    target_package_id: packageId,
    target_status: status,
  });
  if (error) throw error;
  return normalizePackage(Array.isArray(data) ? data[0] : data);
}

// ---------------------------------------------------------------------------
// Homeowner — bids, invites, questions, events
// ---------------------------------------------------------------------------

export async function listWorkPackageBidsForOwner(projectId) {
  const supabase = getSupabase();
  if (!supabase || !projectId) return { bids: [], configured: Boolean(supabase) };
  const { data, error } = await supabase
    .from("work_package_bids_for_owner")
    .select(OWNER_BID_FIELDS)
    .eq("project_id", projectId)
    .order("submitted_at", { ascending: false });
  if (error) {
    if (workPackageSchemaMissing(error)) return { bids: [], configured: false };
    throw error;
  }
  return { bids: (data || []).map(normalizeBid), configured: true };
}

export async function setWorkPackageBidDecision({ bidId, decision }) {
  const supabase = requireClient();
  if (!bidId) throw new Error("Choose a bid to update.");
  if (!WORK_PACKAGE_BID_DECISIONS.includes(decision)) throw new Error("Choose a valid decision.");
  const { data, error } = await supabase.rpc("set_work_package_bid_decision", {
    target_bid_id: bidId,
    target_decision: decision,
  });
  if (error) {
    if (workPackageSchemaMissing(error)) throw new Error(NOT_ENABLED);
    throw error;
  }
  return Array.isArray(data) ? data[0] : data;
}

export async function listWorkPackageInvites(projectId) {
  const supabase = getSupabase();
  if (!supabase || !projectId) return { invites: [], configured: Boolean(supabase) };
  const { data, error } = await supabase
    .from("project_work_package_invites")
    .select(INVITE_FIELDS)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) {
    if (workPackageSchemaMissing(error)) return { invites: [], configured: false };
    throw error;
  }
  return { invites: data || [], configured: true };
}

export async function inviteProToWorkPackage({ packageId, projectId, portfolioId, note = "" }) {
  const supabase = requireClient();
  if (!packageId || !projectId || !portfolioId) throw new Error("Choose a professional to invite.");
  const userId = await requireUserId(supabase);
  const { data, error } = await supabase
    .from("project_work_package_invites")
    .upsert(
      { package_id: packageId, project_id: projectId, portfolio_id: portfolioId, invited_by: userId, note: optionalText(note, 500) },
      { onConflict: "package_id,portfolio_id" },
    )
    .select(INVITE_FIELDS)
    .single();
  if (error) throw error;
  return data;
}

export async function removeWorkPackageInvite({ packageId, portfolioId }) {
  const supabase = requireClient();
  const { error } = await supabase
    .from("project_work_package_invites")
    .delete()
    .eq("package_id", packageId)
    .eq("portfolio_id", portfolioId);
  if (error) throw error;
  return true;
}

export async function listWorkPackageQuestionsForOwner(projectId) {
  const supabase = getSupabase();
  if (!supabase || !projectId) return { questions: [], configured: Boolean(supabase) };
  const { data, error } = await supabase
    .from("project_work_package_questions")
    .select(QUESTION_FIELDS)
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  if (error) {
    if (workPackageSchemaMissing(error)) return { questions: [], configured: false };
    throw error;
  }
  return { questions: data || [], configured: true };
}

export async function answerWorkPackageQuestion({ questionId, answer }) {
  const supabase = requireClient();
  const text = String(answer || "").trim();
  if (!text) throw new Error("Write an answer first.");
  const { data, error } = await supabase.rpc("answer_work_package_question", {
    target_question_id: questionId,
    target_answer: text,
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

/** Activity feed for the caller (homeowner: their projects; pro: their portfolio). */
export async function listWorkPackageEvents({ projectId = null, unreadOnly = false, limit = 40 } = {}) {
  const supabase = getSupabase();
  if (!supabase) return { events: [], configured: false };
  let query = supabase.from("project_work_package_events").select(EVENT_FIELDS).order("created_at", { ascending: false }).limit(limit);
  if (projectId) query = query.eq("project_id", projectId);
  if (unreadOnly) query = query.is("read_at", null);
  const { data, error } = await query;
  if (error) {
    if (workPackageSchemaMissing(error)) return { events: [], configured: false };
    throw error;
  }
  return { events: data || [], configured: true };
}

export async function markWorkPackageEventsRead(eventIds = []) {
  const supabase = getSupabase();
  if (!supabase || !eventIds.length) return 0;
  const { data, error } = await supabase.rpc("mark_work_package_events_read", { target_event_ids: eventIds });
  if (error) {
    if (workPackageSchemaMissing(error)) return 0;
    throw error;
  }
  return Number(data) || 0;
}

// ---------------------------------------------------------------------------
// Professional — opportunities, bids, questions, awards
// ---------------------------------------------------------------------------

export async function listWorkPackageOpportunities(portfolioId) {
  const supabase = getSupabase();
  if (!supabase || !portfolioId) {
    return {
      packages: [],
      configured: Boolean(supabase),
      error: portfolioId ? null : "Finish and publish your professional profile to receive work packages.",
    };
  }

  const [oppResult, bidResult] = await Promise.all([
    supabase.from("pro_work_package_opportunities").select(OPPORTUNITY_FIELDS).order("published_at", { ascending: false }),
    supabase.from("project_work_package_bids").select(PRO_BID_FIELDS).eq("portfolio_id", portfolioId),
  ]);
  const firstError = oppResult.error || bidResult.error;
  if (firstError) {
    if (workPackageSchemaMissing(firstError)) return { packages: [], configured: false, error: null };
    throw firstError;
  }

  const bids = new Map((bidResult.data || []).map((row) => [String(row.package_id), normalizeBid(row)]));
  const packages = (oppResult.data || []).map((row) => {
    const opp = normalizeOpportunity(row);
    const myBid = bids.get(String(opp.package_id)) || null;
    return { ...opp, myBid, homeownerDecision: myBid?.homeowner_decision || "pending" };
  });
  return { packages, configured: true, error: null };
}

function bidPayload(input) {
  const total = Number(input.totalAmountInr);
  if (!Number.isFinite(total) || total <= 0) throw new Error("Enter your total bid amount in rupees.");
  const lineItems = (input.lineItems || [])
    .map((row) => ({
      scope_item_id: String(row?.scope_item_id || row?.scopeItemId || "").slice(0, 40) || null,
      label: String(row?.label || "").trim().slice(0, 240),
      quantity: row?.quantity === "" || row?.quantity == null ? "" : String(row.quantity).slice(0, 30),
      unit: String(row?.unit || "").trim().slice(0, 30),
      unit_rate_inr: row?.unit_rate_inr === "" || row?.unit_rate_inr == null ? null : Number(row.unit_rate_inr),
      amount_inr: row?.amount_inr === "" || row?.amount_inr == null ? null : Number(row.amount_inr),
    }))
    .filter((row) => row.label && (row.amount_inr == null || Number.isFinite(row.amount_inr)));
  return {
    total_amount_inr: total,
    gst_included: Boolean(input.gstIncluded),
    pricing_basis: WORK_PACKAGE_PRICING.includes(input.pricingBasis) ? input.pricingBasis : "turnkey",
    line_items: lineItems,
    inclusions: optionalText(input.inclusions, 3000),
    exclusions: optionalText(input.exclusions, 3000),
    assumptions: optionalText(input.assumptions, 2000),
    timeline_weeks: optionalNumber(input.timelineWeeks, { min: 1, max: 520, integer: true, label: "timeline in weeks (1–520)" }),
    can_start_on: optionalDate(input.canStartOn),
    warranty_months: optionalNumber(input.warrantyMonths, { min: 0, max: 240, integer: true, label: "warranty in months (0–240)" }),
    advance_pct: optionalNumber(input.advancePct, { min: 0, max: 100, integer: true, label: "advance percentage (0–100)" }),
    payment_schedule_note: optionalText(input.paymentScheduleNote, 1500),
    site_visit_done: Boolean(input.siteVisitDone),
    valid_until: optionalDate(input.validUntil),
    cover_note: optionalText(input.coverNote, 3000),
  };
}

/** Submit a new bid or revise an existing one. Revisions reset the homeowner's decision server-side. */
export async function submitWorkPackageBid({ packageId, projectId, portfolioId, existingBidId = null, ...input }) {
  const supabase = requireClient();
  if (!packageId || !projectId || !portfolioId) throw new Error("Choose a work package to bid on.");
  const payload = bidPayload(input);

  const query = existingBidId
    ? supabase.from("project_work_package_bids").update({ ...payload, status: "submitted" }).eq("id", existingBidId)
    : supabase.from("project_work_package_bids").insert({ package_id: packageId, project_id: projectId, portfolio_id: portfolioId, ...payload });

  const { data, error } = await query.select(PRO_BID_FIELDS).single();
  if (error) {
    if (workPackageSchemaMissing(error)) throw new Error(NOT_ENABLED);
    if (String(error.code) === "42501" || /row-level security/i.test(error.message || "")) {
      throw new Error("This work package is not accepting bids from your profile right now.");
    }
    throw error;
  }
  return normalizeBid(data);
}

export async function withdrawWorkPackageBid(bidId) {
  const supabase = requireClient();
  const { data, error } = await supabase
    .from("project_work_package_bids")
    .update({ status: "withdrawn" })
    .eq("id", bidId)
    .select(PRO_BID_FIELDS)
    .single();
  if (error) throw error;
  return normalizeBid(data);
}

export async function listWorkPackageQuestionsForPro(packageIds = []) {
  const supabase = getSupabase();
  if (!supabase || !packageIds.length) return { questions: [], configured: Boolean(supabase) };
  const { data, error } = await supabase
    .from("work_package_questions_for_pros")
    .select(PRO_QUESTION_FIELDS)
    .in("package_id", packageIds)
    .order("created_at", { ascending: true });
  if (error) {
    if (workPackageSchemaMissing(error)) return { questions: [], configured: false };
    throw error;
  }
  return { questions: data || [], configured: true };
}

export async function askWorkPackageQuestion({ packageId, projectId, portfolioId, question }) {
  const supabase = requireClient();
  const text = String(question || "").trim();
  if (text.length < 3) throw new Error("Write your question first.");
  if (text.length > 1500) throw new Error("Keep the question under 1500 characters.");
  const { data, error } = await supabase
    .from("project_work_package_questions")
    .insert({ package_id: packageId, project_id: projectId, portfolio_id: portfolioId, question: text })
    .select(QUESTION_FIELDS)
    .single();
  if (error) throw error;
  return data;
}

export async function listAwardedWorkPackages(portfolioId) {
  const supabase = getSupabase();
  if (!supabase || !portfolioId) return { awards: [], configured: Boolean(supabase) };
  const { data, error } = await supabase
    .from("pro_awarded_work_packages")
    .select(AWARDED_FIELDS)
    .eq("portfolio_id", portfolioId)
    .order("homeowner_decided_at", { ascending: false });
  if (error) {
    if (workPackageSchemaMissing(error)) return { awards: [], configured: false };
    throw error;
  }
  return { awards: data || [], configured: true };
}
