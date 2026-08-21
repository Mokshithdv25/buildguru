import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Pencil, Plus, X } from "lucide-react";
import MobileHeader from "../MobileHeader";
import { useMobileHub } from "../hooks/useMobileHub";
import { flowTypeLabel, projectStatusLabel } from "../mobileIA";
import { AUTH_UI_ENABLED, PROJECT_HUB_DEMO_MODE } from "../../lib/authMode";
import {
  addProjectTask,
  derivePhaseProgress,
  formatInrShort,
  loadProjectBoard,
  setProjectStageStatus,
  setProjectTaskDone,
  updateProjectSchedule,
  updateProjectStageSchedule,
} from "../../lib/projectFlowApi";
import { buildSignInRedirect } from "../../lib/requireHomeownerAuth";
import { buildHubAssistantContext } from "../../lib/hubAssistantContext";
import HmProjectAssistant from "../../components/HmProjectAssistant";
import HmCommandCenter from "../../components/HmCommandCenter";
import HmMorningBriefing from "../../components/HmMorningBriefing";
import HmProjectIntelligence from "../../components/HmProjectIntelligence";
import ProjectBidsPanel from "../../components/ProjectBidsPanel";
import ProjectMaterialsPanel from "../../components/ProjectMaterialsPanel";
import ProjectProMatches from "../../components/ProjectProMatches";
import ProjectTimelineEditor from "../../components/ProjectTimelineEditor";
import { listProjectDocuments, listProjectPayments, updateProjectTitle } from "../../lib/projectWorkspaceApi";
import {
  loadProjectIntelligence,
  recordAgentDecision,
  removeProjectMaterial,
  saveProjectMaterial,
} from "../../lib/projectIntelligenceApi";
import { listProjectBids, setBidDecision } from "../../lib/projectBidsApi";

const PROJECT_TOOLS = [
  { label: "Documents", path: "/documents", icon: "📄" },
  { label: "Timeline & stages", path: "/project/journey", icon: "🧭" },
  { label: "Find pros", path: "/project/browse", icon: "👷" },
  { label: "Team", path: "/team", icon: "👥" },
  { label: "Payments", path: "/project/payments", icon: "💳" },
  { label: "Materials & shopping", path: "/shop", icon: "🧱" },
];

export default function MobileProjectPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { session, projects, activeProject, loadingProjects } = useMobileHub();
  const [selectedId, setSelectedId] = useState(null);
  const overviewRef = useRef(null);
  const designsRef = useRef(null);
  const stagesRef = useRef(null);
  const tasksRef = useRef(null);
  const materialsRef = useRef(null);
  const bidsRef = useRef(null);
  const toolsRef = useRef(null);
  const taskInputRef = useRef(null);

  useEffect(() => {
    const requestedId = searchParams.get("projectId");
    if (requestedId && requestedId !== selectedId) setSelectedId(requestedId);
    else if (activeProject && !selectedId) setSelectedId(activeProject.id);
  }, [activeProject, searchParams, selectedId]);

  const project = projects.find((p) => p.id === selectedId) || activeProject;
  const isDemoHub = PROJECT_HUB_DEMO_MODE && !project && !loadingProjects;
  const needsProjectPick = !project && !loadingProjects && !isDemoHub;
  const [projectTitle, setProjectTitle] = useState("");
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState(null);
  const title = projectTitle || project?.title || "Your project";
  const subtitle = project
    ? `${flowTypeLabel(project.flow_type, project.source)} · ${projectStatusLabel(project.status)}`
    : needsProjectPick
      ? "Select or start a project"
      : "Loading…";

  const budget =
    project?.budget_min || project?.budget_max
      ? formatInrShort(project.budget_max || project.budget_min)
      : null;

  const [board, setBoard] = useState(null);
  const [boardLoading, setBoardLoading] = useState(false);
  const [boardError, setBoardError] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskSaving, setTaskSaving] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [payments, setPayments] = useState([]);
  const [materialItems, setMaterialItems] = useState([]);
  const [agentActions, setAgentActions] = useState([]);
  const [intelligenceConfigured, setIntelligenceConfigured] = useState(false);
  const [bids, setBids] = useState([]);
  const [bidsConfigured, setBidsConfigured] = useState(true);

  useEffect(() => {
    const nextTitle = project?.title || "Your project";
    setProjectTitle(nextTitle);
    setRenameDraft(nextTitle);
    setRenameOpen(false);
  }, [project?.id, project?.title]);

  useEffect(() => {
    if (!project?.id) {
      setBoard(null);
      setDocuments([]);
      setPayments([]);
      setMaterialItems([]);
      setAgentActions([]);
      setBids([]);
      setBidsConfigured(true);
      setBoardError("");
      return;
    }
    let cancelled = false;
    (async () => {
      setBoardLoading(true);
      setBoardError("");
      try {
        const data = await loadProjectBoard({ projectId: project.id, source: project.source });
        if (!data) throw new Error("This project could not be loaded for the signed-in account.");
        if (!cancelled) setBoard(data);
        const [documentsResult, paymentsResult, intelligenceResult, bidsResult] = await Promise.allSettled([
          listProjectDocuments(project.id),
          listProjectPayments(project.id),
          loadProjectIntelligence({ projectId: project.id, brief: data.brief, v0Pack: data.v0Pack }),
          listProjectBids(project.id),
        ]);
        if (!cancelled) {
          setDocuments(documentsResult.status === "fulfilled" ? documentsResult.value : []);
          setPayments(paymentsResult.status === "fulfilled" ? paymentsResult.value : []);
          if (intelligenceResult.status === "fulfilled") {
            setMaterialItems(intelligenceResult.value.materials || []);
            setAgentActions(intelligenceResult.value.actions || []);
            setIntelligenceConfigured(Boolean(intelligenceResult.value.configured));
          } else {
            setMaterialItems([]);
            setAgentActions([]);
            setIntelligenceConfigured(false);
          }
          if (bidsResult.status === "fulfilled") {
            setBids(bidsResult.value.bids || []);
            setBidsConfigured(Boolean(bidsResult.value.configured));
          } else {
            setBids([]);
            setBidsConfigured(false);
          }
        }
      } catch (err) {
        if (!cancelled) setBoardError(err?.message || "Could not load this project.");
      } finally {
        if (!cancelled) setBoardLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [project?.id, project?.source]);

  useEffect(() => {
    if (searchParams.get("tab") !== "Materials" || !project?.id) return;
    const timer = window.setTimeout(() => materialsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 250);
    return () => window.clearTimeout(timer);
  }, [project?.id, materialItems.length, searchParams]);

  const hubQuery = project?.id ? `?projectId=${encodeURIComponent(project.id)}` : "";
  const boardTasks = useMemo(() => board?.tasks || [], [board?.tasks]);
  const boardMsgs = useMemo(() => board?.messages || [], [board?.messages]);
  const boardPhases = useMemo(() => board?.phases || [], [board?.phases]);
  const activePhase = boardPhases.find((p) => p.status === "In Progress")?.name || boardPhases[0]?.name || "";
  const v0Media = useMemo(() => [
    ...(board?.v0Pack?.images?.images || []),
    ...(board?.v0Pack?.images?.floor_plans || board?.v0Pack?.images?.floorPlans || board?.v0Pack?.floorPlans || []),
  ].map((item, index) => ({
    url: typeof item === "string" ? item : item?.url,
    label: item?.label || (index === 0 ? "Exterior concept" : `AI design ${index + 1}`),
  })).filter((item) => item.url), [board?.v0Pack]);
  const openTasks = boardTasks.filter((task) => !task.done).length;
  const overallProgress = boardPhases.length
    ? Math.round(boardPhases.reduce((sum, phase) => sum + Number(phase.pct || 0), 0) / boardPhases.length)
    : 0;

  const renameProject = async (event) => {
    event.preventDefault();
    if (!project?.id || !renameDraft.trim() || renameDraft.trim() === title) return;
    setRenaming(true);
    setBoardError("");
    try {
      const saved = await updateProjectTitle(project.id, renameDraft);
      setProjectTitle(saved.title);
      setRenameDraft(saved.title);
      setRenameOpen(false);
    } catch (error) {
      setBoardError(error?.message || "Could not rename this project.");
    } finally {
      setRenaming(false);
    }
  };

  const goToSection = (ref, { focus = false } = {}) => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (focus) window.setTimeout(() => taskInputRef.current?.focus(), 350);
  };

  const saveTask = async (event) => {
    event.preventDefault();
    const titleValue = taskTitle.trim();
    if (!project?.id || !titleValue || !activePhase) return;
    setTaskSaving(true);
    setBoardError("");
    try {
      const id = await addProjectTask({ projectId: project.id, title: titleValue, phaseName: activePhase });
      setBoard((current) => ({
        ...current,
        tasks: [...(current?.tasks || []), { id, name: titleValue, phase: activePhase, done: false, date: "Just now", assignee: "Team" }],
        phases: derivePhaseProgress(current?.phases || [], [...(current?.tasks || []), { id, name: titleValue, phase: activePhase, done: false }]),
      }));
      setTaskTitle("");
    } catch (err) {
      setBoardError(err?.message || "Could not save the task.");
    } finally {
      setTaskSaving(false);
    }
  };

  const toggleTask = async (task) => {
    setBoardError("");
    try {
      await setProjectTaskDone(task.id, !task.done);
      setBoard((current) => ({
        ...current,
        tasks: (current?.tasks || []).map((row) => row.id === task.id ? { ...row, done: !row.done } : row),
        phases: derivePhaseProgress(
          current?.phases || [],
          (current?.tasks || []).map((row) => row.id === task.id ? { ...row, done: !row.done } : row),
        ),
      }));
    } catch (err) {
      setBoardError(err?.message || "Could not update the task.");
    }
  };

  const changeStageStatus = async (event) => {
    const stage = boardPhases.find((row) => row.name === activePhase);
    if (!stage?.id || !project?.id) return;
    const status = event.target.value;
    if (status === "done" && stage.pct < 100) {
      setBoardError("Complete every checklist task before marking this stage done.");
      return;
    }
    setBoardError("");
    try {
      await setProjectStageStatus(stage.id, project.id, status);
      const label = status === "done" ? "Done" : status === "blocked" ? "Blocked" : status === "in_progress" ? "In Progress" : "Upcoming";
      setBoard((current) => ({ ...current, phases: (current?.phases || []).map((row) => row.id === stage.id ? { ...row, status: label, pct: status === "done" ? 100 : row.pct } : row) }));
    } catch (err) {
      setBoardError(err?.message || "Could not update the stage status.");
    }
  };

  const saveMaterial = async (item) => {
    const saved = await saveProjectMaterial(project.id, item);
    setMaterialItems((current) => current.map((row) => row.id === item.id ? saved : row));
    return saved;
  };

  const removeMaterial = async (itemId) => {
    await removeProjectMaterial(project.id, itemId);
    setMaterialItems((current) => current.filter((row) => row.id !== itemId));
  };

  const decideAgentAction = async (decision) => {
    const saved = await recordAgentDecision({ projectId: project.id, ...decision });
    setAgentActions((current) => [saved, ...current]);
    return saved;
  };

  // Contact details are only revealed by the server on re-read, so refresh.
  const decideBid = async ({ bidId, decision }) => {
    await setBidDecision({ bidId, decision });
    const refreshed = await listProjectBids(project.id);
    setBids(refreshed.bids || []);
    setBidsConfigured(refreshed.configured);
  };

  const saveProjectSchedule = async (schedule) => {
    const saved = await updateProjectSchedule(project.id, schedule);
    setBoard((current) => ({ ...current, project: { ...(current?.project || {}), ...saved } }));
    return saved;
  };

  const saveStageSchedule = async (phase, schedule) => {
    const saved = await updateProjectStageSchedule({ projectId: project.id, stageId: phase.id, ...schedule });
    setBoard((current) => ({ ...current, phases: (current?.phases || []).map((row) => row.id === phase.id ? { ...row, startDate: saved.start_date || "", dueDate: saved.due_date || "" } : row) }));
    return saved;
  };

  const assistantContext = useMemo(
    () =>
      buildHubAssistantContext({
        signedIn: AUTH_UI_ENABLED ? Boolean(session?.supabaseUserId) : true,
        isDemoHub,
        userFirstName: (session?.name || "").split(/\s+/)[0] || "",
        projectId: project?.id || "",
        projectTitle: title,
        projectStatus: project?.status || "",
        flowLabel: project ? flowTypeLabel(project.flow_type, project.source) : "",
        activePhase,
        phasePct: boardPhases.find((p) => p.name === activePhase)?.pct ?? 0,
        tasks: boardTasks,
        messages: boardMsgs,
        phases: boardPhases,
        pendingTaskCount: boardTasks.filter((t) => !t.done).length,
        budgetLabel: budget,
        hasV0: Boolean(board?.v0Pack?.images || board?.v0Pack?.estimate),
        brief: board?.brief,
        v0Pack: board?.v0Pack,
        documents,
        payments,
        materials: materialItems,
        agentActions,
        bids,
        location: project?.location || project?.city || "",
        timeline: board?.project?.timeline_completion || project?.timeline_completion || "",
        hubQuery,
        signInPath: buildSignInRedirect("/project"),
      }),
    [
      bids,
      session?.supabaseUserId,
      session?.name,
      isDemoHub,
      project,
      title,
      activePhase,
      boardTasks,
      boardMsgs,
      boardPhases,
      board?.v0Pack,
      board?.brief,
      board?.project?.timeline_completion,
      documents,
      payments,
      materialItems,
      agentActions,
      budget,
      hubQuery,
    ],
  );

  return (
    <>
      <MobileHeader
        title={title}
        subtitle={subtitle}
        right={(
          <div className="hm-m-header-actions">
            {project?.id ? <button type="button" className="hm-m-icon-btn" aria-label="Rename project" onClick={() => setRenameOpen((open) => !open)}><Pencil size={19} /></button> : null}
            <button type="button" className="hm-m-icon-btn" aria-label="Start a new project" onClick={() => navigate("/build")}><Plus size={22} /></button>
          </div>
        )}
      />
      {project?.id ? (
        <nav className="hm-m-project-nav" aria-label="Project sections">
          <button type="button" onClick={() => goToSection(overviewRef)}>Overview</button>
          <button type="button" onClick={() => goToSection(bidsRef)}>Bids{bids.length ? ` (${bids.length})` : ""}</button>
          <button type="button" onClick={() => goToSection(designsRef)}>Designs</button>
          <button type="button" onClick={() => goToSection(stagesRef)}>Stages</button>
          <button type="button" onClick={() => goToSection(tasksRef)}>Tasks</button>
          <button type="button" onClick={() => goToSection(materialsRef)}>Materials</button>
          <button type="button" onClick={() => goToSection(toolsRef)}>Tools</button>
        </nav>
      ) : null}
      {AUTH_UI_ENABLED && !session?.supabaseUserId ? (
        <div style={{ padding: 16 }}>
          <p style={{ fontSize: 14, color: "#78716C", marginBottom: 16, lineHeight: 1.5 }}>
            Sign in to sync projects from build & remodel flows across devices.
          </p>
          <button
            type="button"
            className="hm-m-btn-primary"
            onClick={() => navigate(buildSignInRedirect("/project"))}
          >
            Sign in with email
          </button>
          <button type="button" className="hm-m-btn-secondary" style={{ marginTop: 10 }} onClick={() => navigate("/build")}>
            Start without signing in
          </button>
        </div>
      ) : needsProjectPick ? (
        <div className="hm-m-empty" style={{ margin: 16 }}>
          <p style={{ fontSize: 14, color: "#78716C", marginBottom: 16, lineHeight: 1.5 }}>
            {projects.length > 0
              ? "Pick a saved project below, or start a new build or remodel."
              : "Finish a build or remodel flow with AI v0 — it appears here automatically."}
          </p>
          {projects.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              {projects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="hm-m-btn-secondary"
                  onClick={() => setSelectedId(p.id)}
                >
                  {p.title || "Project"}
                </button>
              ))}
            </div>
          ) : null}
          <button type="button" className="hm-m-btn-primary" onClick={() => navigate("/build/new-home")}>
            Build a new home
          </button>
          <button type="button" className="hm-m-btn-secondary" style={{ marginTop: 10 }} onClick={() => navigate("/build/remodel")}>
            Remodel a room
          </button>
          <button
            type="button"
            className="hm-m-btn-secondary"
            style={{ marginTop: 10 }}
            onClick={() => window.dispatchEvent(new CustomEvent("hm-open-assistant"))}
          >
            Ask Homi
          </button>
        </div>
      ) : (
        <>
          {renameOpen ? (
            <form className="hm-m-inline-editor" onSubmit={renameProject}>
              <label htmlFor="hm-mobile-project-title">Project name</label>
              <div><input id="hm-mobile-project-title" value={renameDraft} maxLength={120} onChange={(event) => setRenameDraft(event.target.value)} /><button type="submit" disabled={renaming || !renameDraft.trim() || renameDraft.trim() === title}>{renaming ? "Saving…" : "Save"}</button></div>
            </form>
          ) : null}
          <div ref={overviewRef} className="hm-m-project-section-anchor" style={{ padding: "0 16px" }}>
            <HmMorningBriefing context={assistantContext} onNavigatePath={(path) => navigate(path)} />
            <HmCommandCenter />
          </div>
          <HmProjectIntelligence
            context={assistantContext}
            brief={board?.brief || {}}
            materials={materialItems}
            actions={agentActions}
            documents={documents}
            payments={payments}
            configured={intelligenceConfigured}
            onDecision={decideAgentAction}
            onOpenMaterials={() => goToSection(materialsRef)}
            onNavigatePath={(path) => navigate(path)}
          />
          {projects.length > 1 ? (
            <div className="hm-m-pill-row" style={{ marginTop: 8 }}>
              {projects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`hm-m-pill${p.id === project?.id ? " active" : ""}`}
                  onClick={() => setSelectedId(p.id)}
                >
                  {p.title || "Project"}
                </button>
              ))}
            </div>
          ) : null}

          {budget ? (
            <div className="hm-m-card" style={{ margin: "12px 16px" }}>
              <div style={{ fontSize: 12, color: "#78716C" }}>Budget band</div>
              <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{budget}</div>
              {project?.city ? <div style={{ fontSize: 13, color: "#78716C", marginTop: 6 }}>{project.city}</div> : null}
              {board?.project?.timeline_completion || project?.timeline_completion ? <div style={{ fontSize: 13, color: "#78716C", marginTop: 4 }}>Target: {board?.project?.timeline_completion || project.timeline_completion}</div> : null}
              <button type="button" className="hm-m-card-link" onClick={() => navigate(`/project/payments${hubQuery}`)}>View spending & receipts →</button>
            </div>
          ) : null}

          <p className="hm-m-section-title">At a glance</p>
          <div className="hm-m-metric-grid">
            <div><strong>{overallProgress}%</strong><span>Overall progress</span></div>
            <div><strong>{openTasks}</strong><span>Open tasks</span></div>
            <div><strong>{bids.length}</strong><span>Bids received</span></div>
            <div><strong>{v0Media.length}</strong><span>Saved AI visuals</span></div>
          </div>

          <div ref={bidsRef} className="hm-m-project-section-anchor" style={{ padding: "0 16px", marginTop: 16 }}>
            <ProjectBidsPanel
              bids={bids}
              configured={bidsConfigured}
              loading={boardLoading}
              budgetMax={project?.budget_max || board?.brief?.budgetInr}
              onDecision={decideBid}
              onNavigatePath={(path) => navigate(path)}
              onFindPros={() => navigate(`/project/browse${hubQuery}`)}
              matchesSlot={
                <div style={{ marginTop: 18 }}>
                  <ProjectProMatches
                    projectId={project?.id}
                    brief={board?.brief || {}}
                    onNavigatePath={(path) => navigate(path)}
                    compact
                  />
                </div>
              }
            />
          </div>

          {v0Media.length > 0 || board?.v0Pack?.estimate ? (
            <section ref={designsRef} className="hm-m-v0-card hm-m-project-section-anchor">
              <div className="hm-m-v0-heading"><div><span>AI design pack</span><strong>{v0Media.length ? `${v0Media.length} saved visual${v0Media.length === 1 ? "" : "s"}` : "Estimate ready"}</strong></div><button type="button" onClick={() => navigate(`/project/journey${hubQuery}`)}>Open journey</button></div>
              {board?.v0Pack?.estimate?.project_summary ? <p>{board.v0Pack.estimate.project_summary}</p> : null}
              {board?.v0Pack?.estimate?.total_indicative_inr ? <div className="hm-m-v0-estimate">Indicative v0 estimate <strong>{formatInrShort(board.v0Pack.estimate.total_indicative_inr)}</strong></div> : null}
              {v0Media.length > 0 ? <div className="hm-m-v0-media">{v0Media.slice(0, 6).map((media, index) => <button type="button" key={`${media.url}-${index}`} onClick={() => setSelectedMedia(media)} aria-label={`Open ${media.label}`}><img src={media.url} alt={media.label} loading="lazy" /><span>{media.label}</span></button>)}</div> : null}
            </section>
          ) : null}

          {boardError ? <p role="alert" style={{ padding: "10px 16px", color: "#B42318", fontSize: 13 }}>{boardError}</p> : null}
          <div ref={stagesRef} className="hm-m-project-section-anchor"><p className="hm-m-section-title">Timeline & stages</p></div>
          {boardLoading ? (
            <p style={{ padding: "0 16px", color: "#78716C", fontSize: 13 }}>Loading saved project…</p>
          ) : boardPhases.length === 0 ? (
            <p style={{ padding: "0 16px", color: "#78716C", fontSize: 13 }}>No saved phases are available for this project.</p>
          ) : (
          <div className="hm-m-phase-scroll">
            {boardPhases.map((ph) => (
              <div key={ph.name} className="hm-m-phase-card">
                <div style={{ fontSize: 13, fontWeight: 700 }}>{ph.name}</div>
                <div style={{ fontSize: 12, color: "#78716C", marginTop: 6 }}>{ph.pct}%</div>
                <div className="hm-m-progress">
                  <span style={{ width: `${Math.max(ph.pct, 4)}%`, background: ph.color }} />
                </div>
              </div>
            ))}
          </div>
          )}
          {activePhase ? (
            <label className="hm-m-stage-status">
              <span>{activePhase} status</span>
              <select value={boardPhases.find((row) => row.name === activePhase)?.status === "Done" ? "done" : boardPhases.find((row) => row.name === activePhase)?.status === "Blocked" ? "blocked" : boardPhases.find((row) => row.name === activePhase)?.status === "In Progress" ? "in_progress" : "upcoming"} onChange={changeStageStatus} style={{ flex: 1, padding: 9, border: "1px solid #E5DED6", borderRadius: 8, background: "#fff" }}>
                <option value="upcoming">Upcoming</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option><option value="done" disabled={(boardPhases.find((row) => row.name === activePhase)?.pct || 0) < 100}>Done — checklist complete</option>
              </select>
            </label>
          ) : null}
          <ProjectTimelineEditor
            project={board?.project || project}
            brief={board?.brief || {}}
            phases={boardPhases}
            onSaveProject={saveProjectSchedule}
            onSaveStage={saveStageSchedule}
          />

          <div ref={tasksRef} className="hm-m-project-section-anchor"><p className="hm-m-section-title" style={{ marginTop: 16 }}>Tasks</p></div>
          <div style={{ padding: "0 16px" }}>
            <form onSubmit={saveTask} style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input
                ref={taskInputRef}
                value={taskTitle}
                onChange={(event) => setTaskTitle(event.target.value)}
                placeholder={activePhase ? `Add a task to ${activePhase}` : "Project phases are still loading"}
                disabled={!activePhase || taskSaving}
                style={{ flex: 1, minWidth: 0, border: "1px solid #E7DED3", borderRadius: 10, padding: "10px 12px" }}
              />
              <button type="submit" className="hm-m-btn-primary" disabled={!taskTitle.trim() || !activePhase || taskSaving} style={{ width: "auto", padding: "0 16px" }}>
                {taskSaving ? "Saving…" : "Add"}
              </button>
            </form>
            {boardTasks.length === 0 ? (
              <p style={{ color: "#78716C", fontSize: 13 }}>No saved tasks yet.</p>
            ) : boardTasks.map((task) => (
              <label key={task.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 0", borderBottom: "1px solid #F0E8DF" }}>
                <input type="checkbox" checked={Boolean(task.done)} onChange={() => toggleTask(task)} />
                <span style={{ flex: 1, fontSize: 14, textDecoration: task.done ? "line-through" : "none" }}>
                  {task.name}
                  <small style={{ display: "block", color: "#78716C", marginTop: 3 }}>{task.phase}</small>
                </span>
              </label>
            ))}
          </div>

          <div ref={materialsRef} className="hm-m-project-section-anchor" style={{ paddingTop: 18 }}>
            <ProjectMaterialsPanel
              projectId={project?.id}
              materials={materialItems}
              configured={intelligenceConfigured}
              onSave={saveMaterial}
              onRemove={removeMaterial}
              onNavigateShop={() => navigate(`/shop${hubQuery}`)}
            />
          </div>

          <p ref={toolsRef} className="hm-m-section-title hm-m-project-section-anchor" style={{ marginTop: 16 }}>
            Project hub
          </p>
          <div className="hm-m-grid-2" style={{ padding: "0 16px 24px" }}>
            {PROJECT_TOOLS.map((link) => (
              <button key={link.path} type="button" className="hm-m-quick" onClick={() => navigate(`${link.path}${hubQuery}`)}>
                <span className="hm-m-quick-icon">{link.icon}</span>
                <span className="hm-m-quick-label">{link.label}</span>
              </button>
            ))}
          </div>
          {loadingProjects ? <p style={{ padding: 16, color: "#78716C", fontSize: 13 }}>Loading projects…</p> : null}
          <button
            type="button"
            className="hm-m-btn-secondary"
            style={{ width: "calc(100% - 32px)", margin: "0 16px 16px" }}
            onClick={() => window.dispatchEvent(new CustomEvent("hm-open-assistant"))}
          >
            ✨ Ask Homi (AI co-pilot)
          </button>
          <div className="hm-m-dock-spacer" />
          <div className="hm-m-project-dock" aria-label="Project quick actions">
            <button type="button" onClick={() => goToSection(tasksRef, { focus: true })}><span>＋</span>Add task</button>
            <button type="button" onClick={() => navigate(`/documents${hubQuery}`)}><span>↥</span>Upload</button>
            <button type="button" className="primary" onClick={() => window.dispatchEvent(new CustomEvent("hm-open-assistant"))}><span>✦</span>Ask Homi</button>
          </div>
        </>
      )}
      <HmProjectAssistant
        context={assistantContext}
        onNavigatePath={(path) => navigate(path)}
        defaultPhase="Design & approval"
      />
      {selectedMedia ? <div className="hm-m-media-lightbox" role="dialog" aria-modal="true" onClick={() => setSelectedMedia(null)}><button type="button" aria-label="Close image" onClick={() => setSelectedMedia(null)}><X size={22} /></button><img src={selectedMedia.url} alt={selectedMedia.label} onClick={(event) => event.stopPropagation()} /><span>{selectedMedia.label}</span></div> : null}
    </>
  );
}
