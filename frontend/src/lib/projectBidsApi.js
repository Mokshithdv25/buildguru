import { getSupabase } from "./supabaseClient";

/**
 * Homeowner side of the bidding loop. Bids are written only by professionals;
 * the homeowner reads them through `project_bids_for_owner` and records a
 * verdict through the `set_project_bid_decision` function, so a homeowner can
 * never edit a submitted price.
 */

const BID_FIELDS = [
  "bid_id",
  "project_id",
  "portfolio_id",
  "pro_status",
  "homeowner_decision",
  "homeowner_decided_at",
  "bid_amount_inr",
  "bid_timeline_weeks",
  "bid_scope_note",
  "bid_submitted_at",
  "bid_valid_until",
  "response_note",
  "craft",
  "pro_name",
  "pro_city",
  "years_experience",
  "specialties",
  "profile_photo",
  "slug",
  "profile_strength",
  "pro_phone",
  "pro_email",
  "was_invited",
].join(", ");

const INVITE_FIELDS = "id, project_id, portfolio_id, match_score, match_reason, created_at";

export const BID_DECISIONS = ["pending", "shortlisted", "accepted", "declined"];

function schemaIsMissing(error) {
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

export function bidDecisionLabel(decision) {
  return {
    pending: "New bid",
    shortlisted: "Shortlisted",
    accepted: "Accepted",
    declined: "Declined",
  }[decision] || "New bid";
}

function normalizeSpecialties(value) {
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

/** Bids submitted on a project the caller owns, newest first. */
export async function listProjectBids(projectId) {
  const supabase = getSupabase();
  if (!supabase || !projectId) return { bids: [], configured: Boolean(supabase) };

  const { data, error } = await supabase
    .from("project_bids_for_owner")
    .select(BID_FIELDS)
    .eq("project_id", projectId)
    .order("bid_submitted_at", { ascending: false });

  if (error) {
    if (schemaIsMissing(error)) return { bids: [], configured: false };
    throw error;
  }

  const bids = (data || []).map((row) => ({
    ...row,
    specialties: normalizeSpecialties(row.specialties),
  }));
  return { bids, configured: true };
}

export async function setBidDecision({ bidId, decision }) {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Project bids are not configured.");
  if (!bidId) throw new Error("Choose a bid to update.");
  if (!BID_DECISIONS.includes(decision)) throw new Error("Choose a valid decision.");

  const { data, error } = await supabase.rpc("set_project_bid_decision", {
    target_response_id: bidId,
    target_decision: decision,
  });
  if (error) {
    if (schemaIsMissing(error)) {
      throw new Error("Bidding is not enabled on this workspace yet. Run the project bids migration.");
    }
    throw error;
  }
  return Array.isArray(data) ? data[0] : data;
}

/** Invite a published professional to bid on this project. */
export async function inviteProToBid({ projectId, portfolioId, matchScore = null, matchReason = "" }) {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Professional invitations are not configured.");
  if (!projectId || !portfolioId) throw new Error("Choose a professional to invite.");

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error("Sign in to invite professionals.");

  const row = {
    project_id: projectId,
    portfolio_id: portfolioId,
    invited_by: user.id,
    match_score: matchScore == null ? null : Math.max(0, Math.min(100, Math.round(Number(matchScore)))),
    match_reason: String(matchReason || "").slice(0, 500) || null,
  };

  const { data, error } = await supabase
    .from("project_pro_invites")
    .upsert(row, { onConflict: "project_id,portfolio_id" })
    .select(INVITE_FIELDS)
    .single();
  if (error) {
    if (schemaIsMissing(error)) {
      throw new Error("Invitations are not enabled on this workspace yet. Run the project bids migration.");
    }
    throw error;
  }
  return data;
}

export async function listProjectInvites(projectId) {
  const supabase = getSupabase();
  if (!supabase || !projectId) return { invites: [], configured: Boolean(supabase) };

  const { data, error } = await supabase
    .from("project_pro_invites")
    .select(INVITE_FIELDS)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) {
    if (schemaIsMissing(error)) return { invites: [], configured: false };
    throw error;
  }
  return { invites: data || [], configured: true };
}

export async function removeProInvite({ projectId, portfolioId }) {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Professional invitations are not configured.");
  const { error } = await supabase
    .from("project_pro_invites")
    .delete()
    .eq("project_id", projectId)
    .eq("portfolio_id", portfolioId);
  if (error) throw error;
  return true;
}
