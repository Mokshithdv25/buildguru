import ProjectStorageMeter from "../../components/ProjectStorageMeter";
import React, { useEffect, useRef, useState } from "react";
import MobileHeader from "../MobileHeader";
import { useProjectWorkspace } from "../../hooks/useProjectWorkspace";
import { listProjectDocuments, removeProjectDocument, uploadProjectDocument } from "../../lib/projectWorkspaceApi";

export default function MobileDocumentsPage() {
  const picker = useRef(null);
  const { projectId, project, loading: projectsLoading, error: projectError } = useProjectWorkspace();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false; setLoading(true); setError("");
    listProjectDocuments(projectId).then((rows) => { if (!cancelled) setDocuments(rows); }).catch((err) => { if (!cancelled) setError(err?.message || "Could not load documents."); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId]);

  const upload = async (event) => {
    const files = Array.from(event.target.files || []); event.target.value = ""; if (!files.length) return;
    setLoading(true); setError("");
    try { const saved = []; for (const file of files) saved.push(await uploadProjectDocument({ projectId, file })); setDocuments((rows) => [...saved.reverse(), ...rows]); }
    catch (err) { setError(err?.message || "Could not upload the document."); }
    finally { setLoading(false); }
  };

  const remove = async (document) => {
    if (!window.confirm(`Delete ${document.file_name}?`)) return;
    try { await removeProjectDocument(projectId, document); setDocuments((rows) => rows.filter((row) => row.id !== document.id)); }
    catch (err) { setError(err?.message || "Could not delete the document."); }
  };

  return <><MobileHeader title="Project documents" subtitle={project?.title || "Private saved files"} backTo="/project" /><ProjectStorageMeter />
    {projectError || error ? <p role="alert" style={{ padding: "0 16px", color: "#B42318" }}>{projectError || error}</p> : null}
    {!projectsLoading && !project ? <div className="hm-m-empty" style={{ margin: 16 }}>Create a project before uploading documents.</div> : <div style={{ padding: 16 }}>
      <input ref={picker} type="file" hidden multiple onChange={upload} accept=".pdf,.jpg,.jpeg,.png,.webp,.txt,.csv,.docx,.xlsx" />
      <button type="button" className="hm-m-btn-primary" disabled={loading || !projectId} onClick={() => picker.current?.click()}>{loading ? "Uploading…" : "Upload documents"}</button>
      <div style={{ marginTop: 14 }}>{documents.length === 0 && !loading ? <p style={{ color: "#78716C", fontSize: 14 }}>No saved documents yet.</p> : documents.map((document) => <div key={document.id} className="hm-m-card" style={{ margin: "8px 0", display: "flex", gap: 10, alignItems: "center" }}><span>📄</span><div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis" }}>{document.file_name}</div>{document.signed_url ? <a href={document.signed_url} target="_blank" rel="noreferrer" style={{ color: "#C85F2B", fontSize: 12 }}>Open</a> : null}<button type="button" onClick={() => remove(document)} style={{ border: 0, background: "none", color: "#B42318" }}>Delete</button></div>)}</div>
    </div>}
  </>;
}
