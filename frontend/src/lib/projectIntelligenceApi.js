import { getSupabase } from "./supabaseClient";

const MATERIAL_FIELDS = "id, project_id, category, item_name, quantity, unit, preferred_brand, status, notes, source_artifact, seed_key, sort_order, created_at, updated_at";
const ACTION_FIELDS = "id, project_id, action_type, title, rationale, payload_json, status, approved_by_user_id, approved_at, executed_at, created_at, updated_at";

export const MATERIAL_BRANDS = {
  Cement: ["UltraTech", "ACC", "Ambuja", "Dalmia", "Shree Cement"],
  Steel: ["Tata Tiscon", "JSW Neosteel", "SAIL", "Kamdhenu"],
  Masonry: ["Magicrete", "Siporex", "Biltech", "Local approved vendor"],
  Flooring: ["Kajaria", "Somany", "Johnson", "Orientbell"],
  Paint: ["Asian Paints", "Berger", "Nerolac", "Dulux"],
  Electrical: ["Polycab", "Havells", "Finolex", "RR Kabel"],
  Plumbing: ["Astral", "Ashirvad", "Supreme", "Prince"],
  Waterproofing: ["Dr. Fixit", "Fosroc", "Sika", "MYK Arment"],
  Joinery: ["Greenply", "CenturyPly", "Merino", "Action Tesa"],
  Other: ["To be selected"],
};

function schemaIsMissing(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();
  return code === "42P01" || code === "PGRST205" || message.includes("schema cache") || (message.includes("relation") && message.includes("does not exist"));
}

function positiveNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return 0;
}

function rounded(value, step = 1) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.max(step, Math.ceil(value / step) * step);
}

function makeSeed(projectId, category, itemName, quantity, unit, sortOrder, notes) {
  const slug = `${category}-${itemName}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return {
    id: `draft-${slug}`,
    project_id: projectId,
    category,
    item_name: itemName,
    quantity,
    unit,
    preferred_brand: "",
    status: "suggested",
    notes,
    source_artifact: "brief_and_v0_estimate",
    seed_key: slug,
    sort_order: sortOrder,
  };
}

function materialCategoryForEstimateLabel(label) {
  const value = String(label || "").toLowerCase();
  if (/electrical|lighting|cable|wire|switch|socket|mep|hvac/.test(value)) return "Electrical";
  if (/plumb|sanitary|bath|drain|pipe|fixture/.test(value)) return "Plumbing";
  if (/paint/.test(value)) return "Paint";
  if (/tile|floor|stone|surface/.test(value)) return "Flooring";
  if (/carpentry|joinery|kitchen|wardrobe|cabinet|plywood|wood|interior/.test(value)) return "Joinery";
  if (/steel|tmt|reinforcement|metal/.test(value)) return "Steel";
  if (/cement|concrete|masonry|brick|block|structure|shell|facade|civil/.test(value)) return "Masonry";
  if (/waterproof/.test(value)) return "Waterproofing";
  return "Other";
}

/** Editable material rows derived from the saved estimate. */
export function deriveMaterialTakeoff({ projectId, brief = {}, v0Pack = null } = {}) {
  const estimateLines = Array.isArray(v0Pack?.estimate?.estimate_lines) ? v0Pack.estimate.estimate_lines : [];
  return estimateLines
    .map((line, index) => {
      const label = String(line?.label || `Estimate line ${index + 1}`).trim();
      const quantity = positiveNumber(line?.quantity, 1);
      const unit = String(line?.unit || "allowance").trim();
      const amount = positiveNumber(line?.amount_inr, line?.expected_inr, line?.high_inr);
      const note = [
        line?.note,
        amount ? `Estimate allowance: ₹${Math.round(amount).toLocaleString("en-IN")}` : null,
      ].filter(Boolean).join(" · ") || "Copied from the saved project estimate; confirm quantities with the revised professional BOQ.";
      return makeSeed(projectId, materialCategoryForEstimateLabel(label), label, rounded(quantity), unit, index, note);
    });
}

export async function loadProjectIntelligence({ projectId, brief, v0Pack }) {
  const supabase = getSupabase();
  const draft = deriveMaterialTakeoff({ projectId, brief, v0Pack });
  if (!supabase || !projectId) return { materials: draft, actions: [], configured: false };

  const [materialsResult, actionsResult] = await Promise.all([
    supabase.from("project_material_items").select(MATERIAL_FIELDS).eq("project_id", projectId).neq("status", "removed").order("sort_order"),
    supabase.from("project_agent_actions").select(ACTION_FIELDS).eq("project_id", projectId).order("created_at", { ascending: false }),
  ]);
  const firstError = materialsResult.error || actionsResult.error;
  if (firstError) {
    if (schemaIsMissing(firstError)) return { materials: draft, actions: [], configured: false };
    throw firstError;
  }

  const allMaterials = materialsResult.data || [];
  const generatedSources = ["brief_and_v0_estimate", "v0_estimate"];
  let materials = allMaterials.filter((item) => !generatedSources.includes(item.source_artifact) || draft.length);
  // Do not show brief-only coefficients as if they came from an estimate.
  if (!draft.length) return { materials, actions: actionsResult.data || [], configured: true };

  const hasSavedEstimateRows = allMaterials.some((item) => item.source_artifact === "v0_estimate");
  if (!hasSavedEstimateRows && allMaterials.some((item) => generatedSources.includes(item.source_artifact))) {
    const staleIds = allMaterials
      .filter((item) => generatedSources.includes(item.source_artifact) && item.status === "suggested")
      .map((item) => item.id);
    if (staleIds.length) {
      const { error: staleError } = await supabase
        .from("project_material_items")
        .update({ status: "removed" })
        .eq("project_id", projectId)
        .in("id", staleIds);
      if (staleError) throw staleError;
    }
    materials = allMaterials.filter((item) => !generatedSources.includes(item.source_artifact));
  }
  if (!hasSavedEstimateRows) {
    const rows = draft.map(({ id, ...row }) => row);
    const { data, error } = await supabase
      .from("project_material_items")
      .upsert(rows, { onConflict: "project_id,seed_key", ignoreDuplicates: true })
      .select(MATERIAL_FIELDS);
    if (error) throw error;
    materials = [...materials, ...(data || [])];
  }
  return { materials, actions: actionsResult.data || [], configured: true };
}

/** Replace generated material rows whenever the project estimate is revised. */
export async function syncEstimateMaterials(projectId, estimate) {
  const supabase = getSupabase();
  if (!supabase || !projectId) return;
  const draft = deriveMaterialTakeoff({ projectId, v0Pack: { estimate } });
  const { data: existing, error: existingError } = await supabase
    .from("project_material_items")
    .select(MATERIAL_FIELDS)
    .eq("project_id", projectId)
    .in("source_artifact", ["brief_and_v0_estimate", "v0_estimate"]);
  if (existingError) {
    if (schemaIsMissing(existingError)) return;
    throw existingError;
  }
  const protectedSeeds = new Set((existing || []).filter((item) => item.status !== "suggested").map((item) => item.seed_key));
  const replaceable = (existing || []).filter((item) => item.status === "suggested");
  if (replaceable.length) {
    const { error } = await supabase
      .from("project_material_items")
      .update({ status: "removed" })
      .eq("project_id", projectId)
      .in("id", replaceable.map((item) => item.id));
    if (error) throw error;
  }
  const rowsToInsert = draft.filter((row) => !protectedSeeds.has(row.seed_key));
  if (!rowsToInsert.length) return;
  const { error } = await supabase
    .from("project_material_items")
    .upsert(rowsToInsert.map(({ id, ...row }) => ({ ...row, source_artifact: "v0_estimate" })), { onConflict: "project_id,seed_key" });
  if (error) throw error;
}

export async function listProjectMaterials(projectId) {
  const supabase = getSupabase();
  if (!supabase || !projectId) return [];
  const { data, error } = await supabase
    .from("project_material_items")
    .select(MATERIAL_FIELDS)
    .eq("project_id", projectId)
    .neq("status", "removed")
    .order("sort_order");
  if (error) {
    if (schemaIsMissing(error)) return [];
    throw error;
  }
  return data || [];
}

export async function saveProjectMaterial(projectId, item) {
  const supabase = getSupabase();
  if (!supabase || !projectId) throw new Error("Project material storage is not configured.");
  const payload = {
    project_id: projectId,
    category: item.category || "Other",
    item_name: String(item.item_name || "Material item").trim(),
    quantity: Math.max(0, Number(item.quantity || 0)),
    unit: String(item.unit || "unit").trim(),
    preferred_brand: String(item.preferred_brand || "").trim() || null,
    status: item.status || "suggested",
    notes: String(item.notes || "").trim() || null,
    source_artifact: item.source_artifact || "manual",
    seed_key: item.seed_key || null,
    sort_order: Number(item.sort_order || 0),
  };
  let query;
  if (String(item.id || "").startsWith("draft-") || !item.id) {
    query = supabase.from("project_material_items").upsert(payload, { onConflict: "project_id,seed_key" });
  } else {
    query = supabase.from("project_material_items").update(payload).eq("project_id", projectId).eq("id", item.id);
  }
  const { data, error } = await query.select(MATERIAL_FIELDS).single();
  if (error) throw error;
  return data;
}

export async function removeProjectMaterial(projectId, itemId) {
  const supabase = getSupabase();
  if (!supabase || !projectId || !itemId) throw new Error("Choose a saved material item.");
  const { error } = await supabase.from("project_material_items").update({ status: "removed" }).eq("project_id", projectId).eq("id", itemId);
  if (error) throw error;
}

export async function recordAgentDecision({ projectId, actionType, title, rationale, payload = {}, decision }) {
  const supabase = getSupabase();
  if (!supabase || !projectId) throw new Error("Project approval storage is not configured.");
  const status = decision === "approved" ? "approved" : "rejected";
  const row = {
    project_id: projectId,
    action_type: actionType,
    title,
    rationale: rationale || null,
    payload_json: payload,
    status,
    approved_at: status === "approved" ? new Date().toISOString() : null,
  };
  const { data: authData } = await supabase.auth.getSession();
  if (status === "approved") row.approved_by_user_id = authData?.session?.user?.id || null;
  const { data, error } = await supabase.from("project_agent_actions").insert(row).select(ACTION_FIELDS).single();
  if (error) throw error;
  return data;
}
