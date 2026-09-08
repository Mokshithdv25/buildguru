import { PROJECT_STORAGE_ENABLED, storageRequest, notifyStorageChanged } from "./projectStorageApi";
import { compressFile } from "./mediaCompression";
import { getSupabase } from "./supabaseClient";

const supabase = getSupabase();
const DOCUMENT_BUCKET = "project-documents";

async function requireUser() {
  if (!supabase) throw new Error("Project storage is not configured.");
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const userId = data?.session?.user?.id;
  if (!userId) throw new Error("Sign in to manage this project.");
  return userId;
}

function requireProject(projectId) {
  if (!projectId) throw new Error("Choose a saved project first.");
}

export async function listProjectTeam(projectId) {
  requireProject(projectId);
  await requireUser();
  const { data, error } = await supabase.from("project_team_members").select("*").eq("project_id", projectId).order("created_at");
  if (error) throw error;
  return data || [];
}

export async function addProjectTeamMember(projectId, member) {
  requireProject(projectId);
  await requireUser();
  const name = String(member?.name || "").trim();
  const role = String(member?.role || "").trim();
  if (!name || !role) throw new Error("Name and role are required.");
  const { data, error } = await supabase.from("project_team_members").insert({
    project_id: projectId,
    name,
    role,
    email: String(member?.email || "").trim() || null,
    phone: String(member?.phone || "").trim() || null,
    status: member?.status || "active",
  }).select("*").maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateProjectTeamMember(projectId, id, patch) {
  requireProject(projectId);
  await requireUser();
  const { data, error } = await supabase.from("project_team_members").update(patch).eq("project_id", projectId).eq("id", id).select("*").maybeSingle();
  if (error) throw error;
  return data;
}

export async function removeProjectTeamMember(projectId, id) {
  requireProject(projectId);
  await requireUser();
  const { error } = await supabase.from("project_team_members").delete().eq("project_id", projectId).eq("id", id);
  if (error) throw error;
}

export async function listProjectDocuments(projectId) {
  requireProject(projectId);
  if (PROJECT_STORAGE_ENABLED) return storageRequest(`/documents?projectId=${encodeURIComponent(projectId)}`);
  await requireUser();
  const { data, error } = await supabase.from("project_documents").select("*").eq("project_id", projectId).order("created_at", { ascending: false });
  if (error) throw error;
  return Promise.all((data || []).map(async (document) => {
    if (!document.storage_path) return { ...document, signed_url: document.file_url };
    const { data: signed, error: signedError } = await supabase.storage.from(DOCUMENT_BUCKET).createSignedUrl(document.storage_path, 3600);
    return { ...document, signed_url: signedError ? null : signed?.signedUrl || null };
  }));
}

export async function uploadProjectDocument({ projectId, stageId = null, file, category = "other" }) {
  requireProject(projectId);
  const userId = await requireUser();
  const uploadFile = await compressFile(file, { preserveDetail: false });
  if (PROJECT_STORAGE_ENABLED) {
    if (!uploadFile?.size) throw new Error("Choose a non-empty file.");
    if (uploadFile.size > 15000000) throw new Error("Each file must be 15 MB or smaller.");
    const params = new URLSearchParams({ projectId, name: uploadFile.name, category });
    if (stageId) params.set("stageId", stageId);
    try {
      return await storageRequest(`/documents?${params}`, { method: "POST", body: uploadFile, headers: { "Content-Type": uploadFile.type || "application/octet-stream" } });
    } finally { notifyStorageChanged(); }
  }
  if (!uploadFile) throw new Error("Choose a document to upload.");
  if (uploadFile.size > 15 * 1024 * 1024) throw new Error("Documents must be 15 MB or smaller.");
  const safeName = String(uploadFile.name || "document").replace(/[^a-zA-Z0-9._-]+/g, "-");
  const storagePath = `${userId}/${projectId}/${Date.now()}-${safeName}`;
  const { error: uploadError } = await supabase.storage.from(DOCUMENT_BUCKET).upload(storagePath, uploadFile, { contentType: uploadFile.type || "application/octet-stream", upsert: false });
  if (uploadError) throw uploadError;
  const { data, error } = await supabase.from("project_documents").insert({
    project_id: projectId,
    stage_id: stageId,
    uploaded_by_user_id: userId,
    kind: String(category || "other").slice(0, 60),
    file_name: uploadFile.name,
    file_url: storagePath,
    storage_path: storagePath,
    mime_type: uploadFile.type || null,
    size_bytes: uploadFile.size,
  }).select("*").maybeSingle();
  if (error) {
    await supabase.storage.from(DOCUMENT_BUCKET).remove([storagePath]);
    throw error;
  }
  const { data: signed } = await supabase.storage.from(DOCUMENT_BUCKET).createSignedUrl(storagePath, 3600);
  return { ...data, signed_url: signed?.signedUrl || null };
}

export async function updateProjectTitle(projectId, title) {
  requireProject(projectId);
  await requireUser();
  const cleanTitle = String(title || "").trim().slice(0, 120);
  if (!cleanTitle) throw new Error("Enter a project name.");
  const { data, error } = await supabase
    .from("projects")
    .update({ title: cleanTitle, last_active_at: new Date().toISOString() })
    .eq("id", projectId)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error("The project could not be renamed.");
  return data;
}

export async function updateProjectBudget(projectId, amountInr) {
  requireProject(projectId);
  await requireUser();
  const amount = Number(amountInr);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a budget greater than ₹0.");
  const { data, error } = await supabase
    .from("projects")
    .update({ budget_min: amount, budget_max: amount, last_active_at: new Date().toISOString() })
    .eq("id", projectId)
    .select("id, budget_min, budget_max, updated_at")
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error("The project budget could not be updated.");
  return data;
}

export async function removeProjectDocument(projectId, document) {
  requireProject(projectId);
  if (PROJECT_STORAGE_ENABLED) {
    try { return await storageRequest(`/documents/${encodeURIComponent(document.id)}?projectId=${encodeURIComponent(projectId)}`, { method: "DELETE" }); }
    finally { notifyStorageChanged(); }
  }
  await requireUser();
  if (document?.storage_path) {
    const { error: storageError } = await supabase.storage.from(DOCUMENT_BUCKET).remove([document.storage_path]);
    if (storageError) throw storageError;
  }
  const { error } = await supabase.from("project_documents").delete().eq("project_id", projectId).eq("id", document.id);
  if (error) throw error;
}

export async function updateProjectDocumentCategory(projectId, documentId, category) {
  requireProject(projectId);
  const value = String(category || "other").trim().slice(0, 60) || "other";
  if (PROJECT_STORAGE_ENABLED) {
    try {
      return await storageRequest(`/documents/${encodeURIComponent(documentId)}?projectId=${encodeURIComponent(projectId)}`, {
        method: "PATCH",
        body: JSON.stringify({ kind: value }),
        headers: { "Content-Type": "application/json" },
      });
    } finally { notifyStorageChanged(); }
  }
  await requireUser();
  const { data, error } = await supabase.from("project_documents").update({ kind: value }).eq("project_id", projectId).eq("id", documentId).select("*").maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error("The document category could not be updated.");
  const { data: signed } = data.storage_path ? await supabase.storage.from(DOCUMENT_BUCKET).createSignedUrl(data.storage_path, 3600) : { data: null };
  return { ...data, signed_url: signed?.signedUrl || data.file_url || null };
}

export async function listProjectPayments(projectId) {
  requireProject(projectId);
  await requireUser();
  const { data, error } = await supabase.from("project_payments").select("*").eq("project_id", projectId).order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function addProjectPayment(projectId, payment) {
  requireProject(projectId);
  await requireUser();
  const title = String(payment?.title || "").trim();
  const amount = Number(payment?.amount_inr);
  if (!title || !Number.isFinite(amount) || amount < 0) throw new Error("A payment title and valid amount are required.");
  const { data, error } = await supabase.from("project_payments").insert({
    project_id: projectId,
    title,
    amount_inr: amount,
    category: payment?.category || "other",
    status: payment?.status || "planned",
    due_date: payment?.due_date || null,
    paid_at: payment?.status === "paid" ? new Date().toISOString() : null,
    reference: String(payment?.reference || "").trim() || null,
    notes: String(payment?.notes || "").trim() || null,
  }).select("*").maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateProjectPayment(projectId, id, patch) {
  requireProject(projectId);
  await requireUser();
  const next = { ...patch };
  if (patch.status === "paid" && !patch.paid_at) next.paid_at = new Date().toISOString();
  if (patch.status && patch.status !== "paid") next.paid_at = null;
  const { data, error } = await supabase.from("project_payments").update(next).eq("project_id", projectId).eq("id", id).select("*").maybeSingle();
  if (error) throw error;
  return data;
}

export async function removeProjectPayment(projectId, id) {
  requireProject(projectId);
  await requireUser();
  const { error } = await supabase.from("project_payments").delete().eq("project_id", projectId).eq("id", id);
  if (error) throw error;
}
