import ProjectStorageMeter from "../components/ProjectStorageMeter";
import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import ProjectHubShell from "../components/ProjectHubShell";
import BackButton from "../components/BackButton";
import { useProjectWorkspace } from "../hooks/useProjectWorkspace";
import { projectDisplayName } from "../lib/projectFlowApi";
import { listProjectDocuments, removeProjectDocument, updateProjectDocumentCategory, uploadProjectDocument } from "../lib/projectWorkspaceApi";

const OR = "#C85F2B";
const DOCUMENT_CATEGORIES = [
  ["design_drawing", "Design drawings & floor plans"],
  ["approval_permit", "Approvals, permits & NOCs"],
  ["boq_estimate", "BOQ, estimates & quantity takeoff"],
  ["contract", "Contracts, work orders & quotations"],
  ["payment_receipt", "Payment receipts & invoices"],
  ["site_photo", "Site photos & progress"],
  ["site_progress", "Site feed · construction progress"],
  ["site_material", "Site feed · material delivery"],
  ["site_issue", "Site feed · issue or inspection"],
  ["site_other", "Site feed · other update"],
  ["property_legal", "Property and legal records"],
  ["warranty", "Warranties and manuals"],
  ["other", "Other project files"],
];
function sizeLabel(bytes) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentVault() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const picker = useRef(null);
  const { projects, project, projectId, loading: projectsLoading, error: projectError, selectProject } = useProjectWorkspace();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [previewDocument, setPreviewDocument] = useState(null);

  const isPreviewable = (document) => {
    const type = String(document?.mime_type || "").toLowerCase();
    return type === "application/pdf" || type.startsWith("image/");
  };

  const refresh = async () => {
    if (!projectId) return;
    setLoading(true);
    setError("");
    try { setDocuments(await listProjectDocuments(projectId)); }
    catch (err) { setError(err?.message || "Could not load project documents."); }
    finally { setLoading(false); }
  };

  useEffect(() => { refresh(); }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const upload = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length || !projectId) return;
    setUploading(true);
    setError("");
    try {
      const saved = [];
      for (const file of files) saved.push(await uploadProjectDocument({ projectId, stageId: searchParams.get("stageId") || null, file, category: "other" }));
      setDocuments((rows) => [...saved.reverse(), ...rows]);
    }
    catch (err) { setError(err?.message || "Could not upload the document."); }
    finally { setUploading(false); }
  };

  const changeCategory = async (document, kind) => {
    setError("");
    try {
      const updated = await updateProjectDocumentCategory(projectId, document.id, kind);
      setDocuments((rows) => rows.map((row) => row.id === document.id ? { ...row, ...updated, kind } : row));
    } catch (err) { setError(err?.message || "Could not update the document category."); }
  };

  const remove = async (document) => {
    if (!window.confirm(`Delete ${document.file_name}? This cannot be undone.`)) return;
    setError("");
    try {
      await removeProjectDocument(projectId, document);
      setDocuments((rows) => rows.filter((row) => row.id !== document.id));
    } catch (err) { setError(err?.message || "Could not delete the document."); }
  };

  return (
    <ProjectHubShell>
      <main style={{ width: "100%", maxWidth: 1050, margin: "0 auto", padding: "36px 24px", boxSizing: "border-box" }}>
        <BackButton to={projectId ? `/project?projectId=${encodeURIComponent(projectId)}` : "/project"} label="Project hub" />
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "end", flexWrap: "wrap", margin: "18px 0" }}>
          <div><h1 style={{ margin: 0, fontSize: 28 }}>Project documents</h1><p style={{ color: "#78716C", margin: "6px 0 0" }}>Private files saved to the selected homeowner project.</p></div>
          {projects.length > 1 ? <select value={projectId} onChange={(event) => selectProject(event.target.value)} style={{ padding: "10px 12px", border: "1px solid #D7CEC5", borderRadius: 9 }}>{projects.map((row, index) => <option key={row.id} value={row.id}>{projectDisplayName(row, index, projects)}</option>)}</select> : null}
        </div>
        <ProjectStorageMeter />
        {projectError || error ? <p role="alert" style={{ color: "#B42318" }}>{projectError || error}</p> : null}
        {projectsLoading ? <p>Loading projects…</p> : !project ? <div style={{ background: "#fff", border: "1px solid #E8E4DE", borderRadius: 14, padding: 24 }}>Create a project before uploading documents.</div> : (
          <section style={{ background: "#fff", border: "1px solid #E8E4DE", borderRadius: 14, padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 18 }}>
              <div><strong>{project.title || "Project"}</strong><div style={{ color: "#78716C", fontSize: 13, marginTop: 3 }}>{documents.length} saved {documents.length === 1 ? "file" : "files"}</div></div>
              <input ref={picker} type="file" hidden multiple onChange={upload} accept=".pdf,.jpg,.jpeg,.png,.webp,.txt,.csv,.docx,.xlsx" />
              <button type="button" disabled={uploading} onClick={() => picker.current?.click()} style={{ border: 0, borderRadius: 9, background: OR, color: "#fff", padding: "10px 14px", fontWeight: 700, cursor: "pointer" }}>{uploading ? "Uploading…" : "Upload documents"}</button>
            </div>
            {loading ? <p>Loading documents…</p> : documents.length === 0 ? <p style={{ color: "#78716C" }}>No documents have been uploaded to this project.</p> : documents.map((document) => (
              <div key={document.id} style={{ display: "flex", alignItems: "center", gap: 12, borderTop: "1px solid #F0E8DF", padding: "13px 0" }}>
                <span aria-hidden>📄</span>
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis" }}>{document.file_name}</div><div style={{ color: "#78716C", fontSize: 12, marginTop: 3 }}>{sizeLabel(document.size_bytes)}{document.created_at ? ` · ${new Date(document.created_at).toLocaleDateString("en-IN")}` : ""}</div></div>
                <select value={document.kind || "other"} onChange={(event) => changeCategory(document, event.target.value)} aria-label={`Category for ${document.file_name}`} style={{ padding: "7px 9px", border: "1px solid #D7CEC5", borderRadius: 8, background: "#fff", maxWidth: 220 }}>{DOCUMENT_CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                {document.signed_url && isPreviewable(document) ? <button type="button" onClick={() => setPreviewDocument(document)} style={{ border: 0, background: "none", color: OR, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Preview</button> : null}
                {document.signed_url ? <a href={document.signed_url} target="_blank" rel="noreferrer" style={{ color: "#78716C", fontWeight: 700, fontSize: 13 }}>Open</a> : null}
                <button type="button" onClick={() => remove(document)} style={{ border: 0, background: "none", color: "#B42318", cursor: "pointer" }}>Delete</button>
              </div>
            ))}
          </section>
        )}
      </main>
      {previewDocument?.signed_url ? (
        <div role="presentation" onClick={() => setPreviewDocument(null)} style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(28,25,23,.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div role="dialog" aria-modal="true" aria-label={`Preview ${previewDocument.file_name}`} onClick={(event) => event.stopPropagation()} style={{ width: "min(1100px, 96vw)", height: "min(86vh, 820px)", background: "#fff", borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 24px 80px rgba(0,0,0,.3)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "13px 16px", borderBottom: "1px solid #E8E4DE" }}>
              <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{previewDocument.file_name}</strong>
              <button type="button" onClick={() => setPreviewDocument(null)} style={{ border: 0, background: "#F5F1EC", color: "#57534E", borderRadius: 8, padding: "7px 12px", fontWeight: 700, cursor: "pointer" }}>Close</button>
            </div>
            <div style={{ flex: 1, minHeight: 0, background: "#F5F5F4", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {String(previewDocument.mime_type || "").toLowerCase() === "application/pdf" ? (
                <iframe title={`Preview ${previewDocument.file_name}`} src={previewDocument.signed_url} style={{ width: "100%", height: "100%", border: 0 }} />
              ) : (
                <img src={previewDocument.signed_url} alt={previewDocument.file_name} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </ProjectHubShell>
  );
}
