import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ProjectHubShell from "../components/ProjectHubShell";
import BackButton from "../components/BackButton";
import { projectDisplayName } from "../lib/projectFlowApi";
import { useProjectWorkspace } from "../hooks/useProjectWorkspace";
import { addProjectTeamMember, listProjectTeam, removeProjectTeamMember, updateProjectTeamMember } from "../lib/projectWorkspaceApi";

const OR = "#C85F2B";
const EMPTY = { name: "", role: "", email: "", phone: "", status: "active" };

export default function TeamPage() {
  const navigate = useNavigate();
  const { projects, project, projectId, loading: projectsLoading, error: projectError, selectProject } = useProjectWorkspace();
  const [members, setMembers] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!projectId) { setMembers([]); setLoading(false); return undefined; }
    let cancelled = false;
    (async () => {
      setLoading(true); setError(""); setMembers([]);
      try { const rows = await listProjectTeam(projectId); if (!cancelled) setMembers(rows); }
      catch (err) { if (!cancelled) setError(err?.message || "Could not load the project team."); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  const submit = async (event) => {
    event.preventDefault(); setSaving(true); setError("");
    try { const saved = await addProjectTeamMember(projectId, form); setMembers((rows) => [...rows, saved]); setForm(EMPTY); }
    catch (err) { setError(err?.message || "Could not add the team member."); }
    finally { setSaving(false); }
  };

  const changeStatus = async (member, status) => {
    setError("");
    try { const updated = await updateProjectTeamMember(projectId, member.id, { status }); setMembers((rows) => rows.map((row) => row.id === member.id ? updated : row)); }
    catch (err) { setError(err?.message || "Could not update the team member."); }
  };

  const remove = async (member) => {
    if (!window.confirm(`Remove ${member.name} from this project?`)) return;
    try { await removeProjectTeamMember(projectId, member.id); setMembers((rows) => rows.filter((row) => row.id !== member.id)); }
    catch (err) { setError(err?.message || "Could not remove the team member."); }
  };

  return (
    <ProjectHubShell>
      <main style={{ maxWidth: 980, margin: "0 auto", padding: "36px 24px" }}>
        <BackButton to={projectId ? `/project?projectId=${encodeURIComponent(projectId)}` : "/project"} label="Project hub" />
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "end", flexWrap: "wrap", margin: "18px 0" }}>
          <div><h1 style={{ margin: 0, fontSize: 28 }}>Project team</h1><p style={{ color: "#78716C", margin: "6px 0 0" }}>People and contact details saved to this project.</p></div>
          {projects.length > 1 ? <select value={projectId} onChange={(event) => selectProject(event.target.value)} style={{ padding: "10px 12px", border: "1px solid #D7CEC5", borderRadius: 9 }}>{projects.map((row, index) => <option key={row.id} value={row.id}>{projectDisplayName(row, index, projects)}</option>)}</select> : null}
        </div>
        {projectError || error ? <p role="alert" style={{ color: "#B42318" }}>{projectError || error}</p> : null}
        {projectsLoading ? <p>Loading projects…</p> : !project ? <div style={{ background: "#fff", padding: 24, borderRadius: 14 }}>Create a project before adding a team.</div> : (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, .8fr) minmax(0, 1.2fr)", gap: 16 }} className="project-team-grid">
            <form onSubmit={submit} style={{ background: "#fff", border: "1px solid #E8E4DE", borderRadius: 14, padding: 20, alignSelf: "start" }}>
              <h2 style={{ margin: "0 0 14px", fontSize: 18 }}>Add team member</h2>
              {[['name','Name'],['role','Role'],['email','Email'],['phone','Phone']].map(([key,label]) => <label key={key} style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 11 }}>{label}<input value={form[key]} type={key === 'email' ? 'email' : 'text'} onChange={(event) => setForm((row) => ({ ...row, [key]: event.target.value }))} required={key === 'name' || key === 'role'} style={{ display: "block", width: "100%", boxSizing: "border-box", marginTop: 5, padding: "10px 11px", border: "1px solid #D7CEC5", borderRadius: 8 }} /></label>)}
              <button type="submit" disabled={saving} style={{ width: "100%", border: 0, borderRadius: 9, background: OR, color: "#fff", padding: "11px 14px", fontWeight: 700, cursor: "pointer" }}>{saving ? "Saving…" : "Save member"}</button>
              <p style={{ color: "#78716C", fontSize: 11, lineHeight: 1.5, marginBottom: 0 }}>This saves a contact record. It does not send an email invitation.</p>
            </form>
            <section style={{ background: "#fff", border: "1px solid #E8E4DE", borderRadius: 14, padding: 20 }}>
              <h2 style={{ margin: "0 0 14px", fontSize: 18 }}>{project.title || "Project"} · {members.length} members</h2>
              {loading ? <p>Loading team…</p> : members.length === 0 ? <p style={{ color: "#78716C" }}>No team members have been saved.</p> : members.map((member) => <div key={member.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "13px 0", borderTop: "1px solid #F0E8DF" }}><div style={{ width: 38, height: 38, borderRadius: "50%", background: "#FBE8DC", color: OR, display: "grid", placeItems: "center", fontWeight: 800 }}>{String(member.name || "TM").slice(0,2).toUpperCase()}</div><div style={{ flex: 1 }}><div style={{ fontWeight: 700 }}>{member.name || "Unnamed member"}</div><div style={{ color: "#78716C", fontSize: 12, marginTop: 3 }}>{member.role || "Team member"}{member.email ? ` · ${member.email}` : ""}{member.phone ? ` · ${member.phone}` : ""}</div></div><select value={member.status || "active"} onChange={(event) => changeStatus(member, event.target.value)} style={{ border: "1px solid #D7CEC5", borderRadius: 8, padding: "7px" }}><option value="invited">Invited</option><option value="active">Active</option><option value="inactive">Inactive</option></select><button type="button" onClick={() => remove(member)} style={{ border: 0, background: "none", color: "#B42318", cursor: "pointer" }}>Remove</button></div>)}
            </section>
          </div>
        )}
      </main>
    </ProjectHubShell>
  );
}
