import { getSupabase } from "./supabaseClient";
import { persistV0ImagesToStorage, refreshV0ImagesFromStorage } from "./supabaseStorage";
import { isOwnTeamHire, marketplacePostsProject, normalizeHireMode } from "./hireMode";

const supabase = getSupabase();

function stageColor(status) {
  if (status === "done") return "#22A36B";
  if (status === "in_progress") return "#F59E0B";
  if (status === "blocked") return "#DC2626";
  return "#A8A29E";
}

function stagePill(status) {
  if (status === "done") return { label: "Done", color: "#22A36B" };
  if (status === "in_progress") return { label: "In Progress", color: "#F59E0B" };
  if (status === "blocked") return { label: "Blocked", color: "#DC2626" };
  return { label: "Upcoming", color: "#9A8F87" };
}

/** Derive visible stage progress from the saved checklist for that stage. */
export function derivePhaseProgress(phases = [], tasks = []) {
  return phases.map((phase) => {
    const phaseTasks = tasks.filter((task) => task.phase === phase.name);
    if (!phaseTasks.length) return phase;
    const completed = phaseTasks.filter((task) => task.done).length;
    const pct = Math.round((completed / phaseTasks.length) * 100);
    const status = phase.status === "Blocked"
      ? "Blocked"
      : pct === 100
        ? "Done"
        : pct > 0 || phase.status === "In Progress"
          ? "In Progress"
          : "Upcoming";
    const statusCode = status === "Done" ? "done" : status === "Blocked" ? "blocked" : status === "In Progress" ? "in_progress" : "upcoming";
    return { ...phase, pct, color: stageColor(statusCode), status, statusColor: stagePill(statusCode).color };
  });
}

/** Persist checklist-derived stage percentages and overall project state. */
export async function syncProjectProgress(projectId) {
  if (!supabase || !projectId) throw new Error("A saved project is required.");
  const [{ data: stages, error: stagesError }, { data: tasks, error: tasksError }, { data: project, error: projectError }] = await Promise.all([
    supabase.from("project_stages").select("id, status").eq("project_id", projectId),
    supabase.from("project_tasks").select("id, stage_id, status").eq("project_id", projectId),
    supabase.from("projects").select("status").eq("id", projectId).maybeSingle(),
  ]);
  if (stagesError) throw stagesError;
  if (tasksError) throw tasksError;
  if (projectError) throw projectError;

  await Promise.all((stages || []).map(async (stage) => {
    const checklist = (tasks || []).filter((task) => task.stage_id === stage.id);
    if (!checklist.length) return;
    const completed = checklist.filter((task) => task.status === "done").length;
    const progress = Math.round((completed / checklist.length) * 100);
    const status = stage.status === "blocked"
      ? "blocked"
      : progress === 100
        ? "done"
        : progress > 0 || stage.status === "in_progress"
          ? "in_progress"
          : "upcoming";
    const { error } = await supabase
      .from("project_stages")
      .update({ progress_percent: progress, status })
      .eq("id", stage.id)
      .eq("project_id", projectId);
    if (error) throw error;
  }));

  const checklist = tasks || [];
  const allDone = checklist.length > 0 && checklist.every((task) => task.status === "done");
  const protectedStatus = project?.status === "archived" || project?.status === "on_hold";
  const nextStatus = protectedStatus ? project.status : allDone ? "completed" : "active";
  const { error: projectUpdateError } = await supabase
    .from("projects")
    .update({ status: nextStatus, last_active_at: new Date().toISOString() })
    .eq("id", projectId);
  if (projectUpdateError) throw projectUpdateError;
}

export async function setProjectStageStatus(stageId, projectId, status) {
  const allowed = ["upcoming", "in_progress", "blocked", "done"];
  if (!supabase || !stageId || !projectId || !allowed.includes(status)) throw new Error("Choose a valid saved stage status.");
  const patch = status === "done" ? { status, progress_percent: 100 } : { status };
  const { error } = await supabase.from("project_stages").update(patch).eq("id", stageId).eq("project_id", projectId);
  if (error) throw error;
}

function mapFlowType(source) {
  if (source === "build-new") return "new_home";
  if (source === "remodel") return "remodel";
  return null;
}

export function formatInrShort(amountInr) {
  const n = Number(amountInr);
  if (!Number.isFinite(n) || n <= 0) return "TBD";
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2).replace(/\.00$/, "")} Cr`;
  if (n >= 100_000) return `₹${Math.round(n / 100_000)} L`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

export function projectDisplayName(project, index = 0, projects = []) {
  const base = String(project?.title || (project?.flow_type === "remodel" || project?.source === "remodel" ? "Remodel project" : "New home build")).trim();
  const sameBase = projects.filter((row) => String(row?.title || (row?.flow_type === "remodel" || row?.source === "remodel" ? "Remodel project" : "New home build")).trim() === base);
  if (sameBase.length <= 1) return base;
  const context = String(project?.location || project?.city || "").trim();
  if (context && sameBase.filter((row) => String(row?.location || row?.city || "").trim() === context).length === 1) return `${base} · ${context}`;
  return `${base} ${index + 1}`;
}

function budgetFieldsFromBrief(brief) {
  if (typeof brief?.budgetInr === "number" && brief.budgetInr > 0) {
    const cap = Math.round(brief.budgetInr);
    return { budget_min: cap, budget_max: cap, budgetBand: brief.budgetLabel || formatInrShort(cap) };
  }
  const amount = Number(brief?.budgetAmount || 0);
  const unit = brief?.budgetUnit;
  if (amount > 0 && unit) {
    const cap = unit === "Crores" ? amount * 10_000_000 : amount * 100_000;
    const rounded = Math.round(cap);
    return {
      budget_min: rounded,
      budget_max: rounded,
      budgetBand: brief?.budgetLabel || `${brief.budgetAmount} ${unit}`,
    };
  }
  return { budget_min: null, budget_max: null, budgetBand: brief?.budgetLabel || null };
}

async function getCurrentUserId() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data?.session?.user?.id || null;
}

function lastProjectStorageKey(userId) {
  return `hm_last_project_${userId}`;
}

/** Remember which project this user last opened (per device). */
export function rememberActiveProject(userId, projectId, source) {
  if (!userId || !projectId) return;
  try {
    localStorage.setItem(
      lastProjectStorageKey(userId),
      JSON.stringify({ projectId, source: source || "", at: Date.now() })
    );
  } catch (_) {
    /* ignore */
  }
}

export function getRememberedProject(userId) {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(lastProjectStorageKey(userId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Compatibility wrapper: launch mode creates and lists only authenticated projects. */
export async function claimAndListUserProjects(userId) {
  if (!userId) return [];
  return listUserProjects();
}

/** All projects owned by the signed-in user (for return visits). */
export async function listUserProjects() {
  if (!supabase) return [];
  const userId = await getCurrentUserId();
  if (!userId) return [];
  const { data, error } = await supabase
    .from("projects")
    .select("id, title, flow_type, status, source, location, city, timeline_start, timeline_completion, budget_min, budget_max, created_at, updated_at")
    .eq("owner_user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) {
    throw new Error(`Could not load your saved projects: ${error.message}`);
  }
  return data || [];
}

/** Projects referenced in this browser's build/remodel flows (no account required). */
export function listLocalFlowProjects() {
  const out = [];
  try {
    const build = JSON.parse(localStorage.getItem("hm_build_new_flow") || "{}");
    if (build?.projectId) {
      out.push({
        id: build.projectId,
        title: build.title || "New home",
        flow_type: "new_home",
        source: "build-new",
      });
    }
  } catch (_) {
    /* ignore */
  }
  try {
    const remodel = JSON.parse(localStorage.getItem("hm_remodel_flow") || "{}");
    if (remodel?.projectId && !out.some((p) => p.id === remodel.projectId)) {
      out.push({
        id: remodel.projectId,
        title: remodel.title || "Remodel",
        flow_type: "remodel",
        source: "remodel",
      });
    }
  } catch (_) {
    /* ignore */
  }
  return out;
}

function seedFromBrief(brief, flowType, aiPlan = null) {
  const area = Number(brief?.plotArea || brief?.len || 0) * Number(brief?.breadth || 1);
  const style = Array.isArray(brief?.styles) ? brief.styles.join(" + ") : brief?.style || "selected style";
  const location = brief?.location || brief?.city || "project location";
  const goal = brief?.mainGoal || (Array.isArray(brief?.lifestyle) ? brief.lifestyle[0] : "") || "project goals";

  const phases = [
    { name: "Design & Approval", pct: 8, color: "#C85F2B", status: "In Progress", statusColor: "#F59E0B" },
    { name: "Sourcing", pct: 0, color: "#A8A29E", status: "Upcoming", statusColor: "#9A8F87" },
    { name: "Site & Foundation", pct: 0, color: "#A8A29E", status: "Upcoming", statusColor: "#9A8F87" },
    { name: "Structure", pct: 0, color: "#A8A29E", status: "Upcoming", statusColor: "#9A8F87" },
    { name: "Finishing", pct: 0, color: "#A8A29E", status: "Upcoming", statusColor: "#9A8F87" },
  ];

  const llmMilestones = Array.isArray(aiPlan?.milestones) ? aiPlan.milestones : [];
  const estimateLines = Array.isArray(aiPlan?.estimate_lines) ? aiPlan.estimate_lines : [];

  const milestoneTasks = llmMilestones.slice(0, 5).map((m, idx) => ({
    done: false,
    name: String(m?.title || `Milestone ${idx + 1}`),
    phase: phases[Math.min(idx, phases.length - 1)].name,
    date: String(m?.timeframe || "Planned"),
    assignee: "Team",
  }));

  const estimateTasks = estimateLines.slice(0, 4).map((line, idx) => ({
    done: false,
    name: `Review estimate: ${line?.label || `Line ${idx + 1}`}${line?.amount_inr ? ` (${formatInrShort(line.amount_inr)})` : ""}`,
    phase: idx < 2 ? "Design & Approval" : "Sourcing",
    date: "From v0 estimate",
    assignee: "You",
  }));

  const genericTasks = [
    {
      done: false,
      name: `Finalize ${flowType === "remodel" ? "remodel" : "home"} concept for ${location}`,
      phase: "Design & Approval",
      date: "This week",
      assignee: "Architect",
    },
    {
      done: false,
      name: `Freeze ${style} material shortlist`,
      phase: "Sourcing",
      date: "Next",
      assignee: "Contractor",
    },
    {
      done: false,
      name: `Confirm site readiness${area > 0 ? ` (${Math.round(area)} sq ft scope)` : ""}`,
      phase: "Site & Foundation",
      date: "Planned",
      assignee: "Site Team",
    },
    {
      done: false,
      name: "Lock structural execution sequence",
      phase: "Structure",
      date: "Planned",
      assignee: "Engineer",
    },
    {
      done: false,
      name: `Prepare finishing plan around "${goal}"`,
      phase: "Finishing",
      date: "Planned",
      assignee: "Designer",
    },
  ];

  const tasks =
    milestoneTasks.length > 0
      ? [...milestoneTasks, ...estimateTasks].slice(0, 8)
      : estimateTasks.length > 0
        ? [...estimateTasks, ...genericTasks].slice(0, 8)
        : genericTasks;

  const summaryNote = aiPlan?.project_summary
    ? String(aiPlan.project_summary).slice(0, 280)
    : null;

  const messages = [
    {
      phase: "Design & Approval",
      role: "System",
      name: "BuildGuru",
      time: "Just now",
      text: `Project created from ${flowType === "remodel" ? "Remodel" : "Build New Home"} brief for ${location}.`,
      color: "#2A6496",
    },
    {
      phase: "Design & Approval",
      role: "System",
      name: "BuildGuru",
      time: "Just now",
      text: summaryNote || `Primary direction captured: ${goal}.`,
      color: "#2A6496",
    },
  ];

  if (aiPlan?.total_indicative_inr) {
    messages.push({
      phase: "Design & Approval",
      role: "System",
      name: "BuildGuru",
      time: "Just now",
      text: `Indicative v0 total: ${formatInrShort(aiPlan.total_indicative_inr)} (ballpark — validate with your architect).`,
      color: "#2A6496",
    });
  }

  return { phases, tasks, messages };
}

async function saveProjectV0Pack(projectId, v0Images, v0Plan) {
  if (!v0Images && !v0Plan) return;
  const row = {
    project_id: projectId,
    images_json: v0Images || null,
    floor_plans_json: v0Images?.floorPlans || v0Images?.floor_plans || null,
    estimate_json: v0Plan || null,
    is_mock: Boolean(v0Images?.mock || v0Plan?.mock),
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("project_v0_packs").upsert(row, { onConflict: "project_id" });
  if (error) throw new Error(`Could not save the project design and estimate: ${error.message}`);

  if (v0Images) {
    const { error: imageRunError } = await supabase.from("project_ai_runs").insert({
      project_id: projectId,
      run_type: "v0_images",
      provider: v0Images?.provider || "grok",
      status: "completed",
      output_json: v0Images,
    });
    if (imageRunError) throw new Error(`Could not record the image generation: ${imageRunError.message}`);
  }
  if (v0Plan) {
    const { error: planRunError } = await supabase.from("project_ai_runs").insert({
      project_id: projectId,
      run_type: "estimate_plan",
      provider: v0Plan?.provider || "grok",
      status: "completed",
      output_json: v0Plan,
    });
    if (planRunError) throw new Error(`Could not record the estimate generation: ${planRunError.message}`);
  }
}

function v0MimeType(item) {
  const value = String(item?.mime_type || item?.mimeType || item?.storage_path || item?.url || '').toLowerCase();
  if (value.includes('.png') || value.includes('image/png')) return 'image/png';
  if (value.includes('.webp') || value.includes('image/webp')) return 'image/webp';
  if (value.includes('.gif') || value.includes('image/gif')) return 'image/gif';
  return 'image/jpeg';
}

/** Index private v0 assets in the document vault without copying their bytes. */
async function indexV0DesignDocuments(projectId, ownerUserId, imageBundle) {
  if (!projectId || !ownerUserId || !imageBundle) return;
  const items = [
    ...(imageBundle.images || []).map((item) => ({ item, prefix: 'Initial design concept' })),
    ...(imageBundle.floor_plans || imageBundle.floorPlans || []).map((item) => ({ item, prefix: 'Initial design floor plan' })),
  ].filter(({ item }) => item?.storage_path);
  if (!items.length) return;
  const rows = items.map(({ item, prefix }, index) => ({
    project_id: projectId,
    uploaded_by_user_id: ownerUserId,
    kind: 'design_drawing',
    source_type: 'v0_design',
    file_name: `${prefix} ${index + 1}.${v0MimeType(item).split('/')[1]}`,
    file_url: item.storage_path,
    storage_path: item.storage_path,
    storage_provider: 'supabase_v0',
    mime_type: v0MimeType(item),
    size_bytes: Number(item.size_bytes) || null,
  }));
  const { error } = await supabase.from('project_documents').upsert(rows, {
    onConflict: 'project_id,source_type,storage_path',
  });
  if (error) throw new Error(`Could not index the saved design in project documents: ${error.message}`);
}

async function ensureProjectStagesAndTasks(projectId, brief, flowType, aiPlan) {
  const { data: existingStages, error: stagesCheckError } = await supabase
    .from("project_stages")
    .select("id")
    .eq("project_id", projectId)
    .limit(1);
  if (stagesCheckError) throw stagesCheckError;
  const { data: existingTasks, error: tasksCheckError } = await supabase
    .from("project_tasks")
    .select("id")
    .eq("project_id", projectId)
    .limit(1);
  if (tasksCheckError) throw tasksCheckError;

  if (existingStages?.length && existingTasks?.length) return;

  const seeded = seedFromBrief(brief, flowType, aiPlan);
  let stageIdByName = {};

  if (!existingStages?.length) {
    const stageRows = seeded.phases.map((p, idx) => ({
      project_id: projectId,
      name: p.name,
      sort_order: idx,
      status: p.status === "Done" ? "done" : p.status === "In Progress" ? "in_progress" : "upcoming",
      progress_percent: p.pct,
    }));
    const { data: stages, error: stageInsertError } = await supabase.from("project_stages").insert(stageRows).select("*");
    if (stageInsertError) throw stageInsertError;
    stageIdByName = Object.fromEntries((stages || []).map((s) => [s.name, s.id]));
  } else {
    const { data: stages, error: stageLoadError } = await supabase
      .from("project_stages")
      .select("*")
      .eq("project_id", projectId);
    if (stageLoadError) throw stageLoadError;
    stageIdByName = Object.fromEntries((stages || []).map((s) => [s.name, s.id]));
  }

  if (!existingTasks?.length) {
    const { error: taskInsertError } = await supabase.from("project_tasks").insert(
      seeded.tasks.map((t) => ({
        project_id: projectId,
        stage_id: stageIdByName[t.phase] || null,
        title: t.name,
        description: null,
        status: t.done ? "done" : "todo",
        priority: "medium",
      }))
    );
    if (taskInsertError) throw taskInsertError;
  }

  const { data: existingMsgs, error: messageCheckError } = await supabase
    .from("project_messages")
    .select("id")
    .eq("project_id", projectId)
    .limit(1);
  if (messageCheckError) throw messageCheckError;
  if (!existingMsgs?.length) {
    const { error: messageInsertError } = await supabase.from("project_messages").insert(
      seeded.messages.map((m) => ({
        project_id: projectId,
        stage_id: stageIdByName[m.phase] || null,
        author_role: m.role,
        message: m.text,
      }))
    );
    if (messageInsertError) throw messageInsertError;
  }
}

/**
 * Create or update a flow project; persist brief, budget, v0 pack, and seed tasks once.
 */
export async function upsertFlowProject({
  projectId: existingProjectId,
  flowType,
  brief,
  source = "flow",
  aiPlan = null,
  v0Images = null,
  v0Plan = null,
  flowStep = "v0",
}) {
  if (!supabase) return null;

  const ownerUserId = await getCurrentUserId();
  if (!ownerUserId) {
    throw new Error("Sign in to save your project");
  }
  const budget = budgetFieldsFromBrief(brief);
  const title =
    brief?.title ||
    (flowType === "remodel"
      ? `${brief?.room || "Remodel"} remodel`
      : `${brief?.homeType || "New home"} build`);

  const city = brief?.city || "";
  const location = brief?.location || "";
  const timeline = brief?.timeline || brief?.completionTime || "";

  const projectRow = {
    title,
    flow_type: flowType,
    status: flowStep === "handoff" || flowStep === "posted" ? "planning" : "draft",
    source,
    location,
    city,
    timeline_completion: timeline,
    budget_min: budget.budget_min,
    budget_max: budget.budget_max,
    owner_user_id: ownerUserId,
  };

  let projectId = existingProjectId || null;
  let project = null;

  if (projectId) {
    const { data, error } = await supabase
      .from("projects")
      .update(projectRow)
      .eq("id", projectId)
      .select("*")
      .single();
    if (error) throw error;
    project = data;
  } else {
    const { data, error } = await supabase.from("projects").insert(projectRow).select("*").single();
    if (error) throw error;
    project = data;
    projectId = project.id;
  }

  const hireMode = normalizeHireMode(brief);
  const posted = flowStep === "handoff" || flowStep === "posted";
  const briefPayload = {
    ...brief,
    hireMode,
    hasArchitect: isOwnTeamHire(hireMode),
    budgetBand: budget.budgetBand,
    budgetInr: brief?.budgetInr ?? budget.budget_max ?? budget.budget_min,
    ownerUserId,
  };

  const { error: briefErr } = await supabase.from("project_briefs").upsert(
    {
      project_id: projectId,
      brief_version: 1,
      brief_json: briefPayload,
      dream_vision: brief?.dreamVision || brief?.homeVision || "",
      inspirations_json: brief?.visionInspirationItems || [],
      last_completed_step: Number(brief?.step || brief?.activeStep || 5),
      flow_status: posted && marketplacePostsProject(hireMode) ? "open_for_quotes" : "v0_ready",
      flow_step: flowStep,
    },
    { onConflict: "project_id" }
  );
  if (briefErr) throw briefErr;

  const plan = v0Plan || aiPlan;
  let imagesForStore = v0Images;
  if (v0Images && ownerUserId) {
    imagesForStore = await persistV0ImagesToStorage({
      userId: ownerUserId,
      projectId,
      imageBundle: v0Images,
    });
  }
  await saveProjectV0Pack(projectId, imagesForStore, plan);
  await indexV0DesignDocuments(projectId, ownerUserId, imagesForStore);
  await ensureProjectStagesAndTasks(projectId, briefPayload, flowType, plan);

  if (ownerUserId) rememberActiveProject(ownerUserId, projectId, source);

  return { projectId, project };
}

/** After v0 generate — saves design + estimate for the user without waiting for handoff. */
export async function persistFlowAfterV0({ projectId, flowType, brief, source, v0Images, v0Plan }) {
  return upsertFlowProject({
    projectId,
    flowType,
    brief,
    source,
    v0Images,
    v0Plan,
    aiPlan: v0Plan,
    flowStep: "v0",
  });
}

export async function createFlowProjectRecord({
  projectId,
  flowType,
  brief,
  source = "flow",
  aiPlan = null,
  v0Images = null,
  v0Plan = null,
}) {
  return upsertFlowProject({
    projectId,
    flowType,
    brief,
    source,
    aiPlan,
    v0Images,
    v0Plan: v0Plan || aiPlan,
    flowStep: "posted",
  });
}

/** Switch hiring strategy on a posted project without re-running the wizard. */
export async function updateProjectHireMode(projectId, hireMode) {
  if (!supabase || !projectId) throw new Error("A saved project is required.");
  const mode = normalizeHireMode(hireMode);
  const { data: brief, error: readError } = await supabase
    .from("project_briefs")
    .select("brief_json")
    .eq("project_id", projectId)
    .maybeSingle();
  if (readError) throw readError;
  const nextJson = {
    ...(brief?.brief_json || {}),
    hireMode: mode,
    hasArchitect: isOwnTeamHire(mode),
  };
  const { error } = await supabase
    .from("project_briefs")
    .update({
      brief_json: nextJson,
      flow_status: marketplacePostsProject(mode) ? "open_for_quotes" : "v0_ready",
    })
    .eq("project_id", projectId);
  if (error) throw error;
  return { hireMode: mode, brief: nextJson };
}

async function loadV0Pack(projectId) {
  const { data, error } = await supabase
    .from("project_v0_packs")
    .select("*")
    .eq("project_id", projectId)
    .limit(1);
  if (!error && data?.[0]) {
    const row = data[0];
    const images = await refreshV0ImagesFromStorage(row.images_json);
    return {
      images,
      floorPlans: images?.floorPlans || images?.floor_plans || row.floor_plans_json,
      estimate: row.estimate_json,
      mock: row.is_mock,
      generatedAt: row.generated_at,
    };
  }
  if (error) {
    console.warn("loadV0Pack (project_v0_packs):", error.message);
  }

  const { data: runs } = await supabase
    .from("project_ai_runs")
    .select("*")
    .eq("project_id", projectId)
    .in("run_type", ["v0_images", "estimate_plan"])
    .eq("status", "completed")
    .order("created_at", { ascending: false });
  if (!runs?.length) return null;

  const imagesRun = runs.find((r) => r.run_type === "v0_images");
  const planRun = runs.find((r) => r.run_type === "estimate_plan");
  const images = await refreshV0ImagesFromStorage(imagesRun?.output_json || null);
  return {
    images,
    floorPlans: images?.floorPlans || images?.floor_plans || null,
    estimate: planRun?.output_json || null,
    mock: Boolean(imagesRun?.output_json?.mock || planRun?.output_json?.mock),
    generatedAt: imagesRun?.created_at || planRun?.created_at,
  };
}

export async function loadProjectBoard({ projectId, source }) {
  if (!supabase) throw new Error("Project storage is not configured.");

  const ownerUserId = await getCurrentUserId();
  if (!ownerUserId) throw new Error("Sign in to load your saved project.");

  let resolvedProjectId = projectId || "";
  let project = null;

  if (!resolvedProjectId) {
    const flowType = mapFlowType(source);
    if (flowType) {
      let q = supabase
        .from("projects")
        .select("*")
        .eq("flow_type", flowType)
        .order("created_at", { ascending: false })
        .limit(1);
      q = q.eq("owner_user_id", ownerUserId);
      const { data, error } = await q;
      if (error) throw error;
      project = data?.[0] || null;
      resolvedProjectId = project?.id || "";
    }
  }

  if (!resolvedProjectId) return null;

  if (!project) {
    let q = supabase.from("projects").select("*").eq("id", resolvedProjectId);
    q = q.eq("owner_user_id", ownerUserId);
    const { data, error } = await q.limit(1);
    if (error) throw error;
    project = data?.[0] || null;
  }

  if (!project) return null;

  if (project.owner_user_id && project.owner_user_id !== ownerUserId) {
    return null;
  }

  if (ownerUserId && project?.id) {
    rememberActiveProject(ownerUserId, project.id, source || project.source);
  }

  const { data: briefRows, error: briefError } = await supabase
    .from("project_briefs")
    .select("*")
    .eq("project_id", resolvedProjectId)
    .limit(1);
  if (briefError) throw briefError;
  const brief = briefRows?.[0]?.brief_json || {};
  const v0Pack = await loadV0Pack(resolvedProjectId);

  const { data: stages, error: stagesError } = await supabase
    .from("project_stages")
    .select("*")
    .eq("project_id", resolvedProjectId)
    .order("sort_order", { ascending: true });
  if (stagesError) throw stagesError;
  const { data: tasks, error: tasksError } = await supabase
    .from("project_tasks")
    .select("*")
    .eq("project_id", resolvedProjectId)
    .order("created_at", { ascending: true });
  if (tasksError) throw tasksError;
  const { data: messages, error: messagesError } = await supabase
    .from("project_messages")
    .select("*")
    .eq("project_id", resolvedProjectId)
    .order("created_at", { ascending: true });
  if (messagesError) throw messagesError;

  const stageById = Object.fromEntries((stages || []).map((s) => [s.id, s.name]));
  let phaseRows = (stages || []).map((s) => {
    const pill = stagePill(s.status);
    return {
      id: s.id,
      name: s.name,
      startDate: s.start_date || "",
      dueDate: s.due_date || "",
      pct: Number(s.progress_percent || 0),
      color: stageColor(s.status),
      status: pill.label,
      statusColor: pill.color,
    };
  });

  const shortDate = (iso) => {
    if (!iso) return null;
    try {
      return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    } catch {
      return null;
    }
  };

  const taskRows = (tasks || []).map((t) => ({
    id: t.id,
    done: t.status === "done",
    status: t.status || "todo",
    name: t.title,
    phase: stageById[t.stage_id] || "Design & Approval",
    date: shortDate(t.due_date) || "No due date",
    dueDate: t.due_date || "",
    assignee: "Team",
  }));
  phaseRows = derivePhaseProgress(phaseRows, taskRows);

  const messageRows = (messages || []).map((m) => ({
    id: m.id,
    phase: stageById[m.stage_id] || "Design & Approval",
    role: m.author_role || "Team",
    name: m.author_role || "Team",
    time: shortDate(m.created_at) || "Recent",
    text: m.message,
    color: "#2A6496",
  }));

  return {
    projectId: resolvedProjectId,
    project,
    brief,
    v0Pack,
    phases: phaseRows,
    tasks: taskRows,
    messages: messageRows,
  };
}

/** Update the homeowner-controlled overall schedule stored on the project. */
export async function updateProjectSchedule(projectId, { timelineStart = "", timelineCompletion = "" } = {}) {
  if (!supabase || !projectId) throw new Error("Choose a saved project first.");
  const { data, error } = await supabase
    .from("projects")
    .update({
      timeline_start: String(timelineStart || "").trim() || null,
      timeline_completion: String(timelineCompletion || "").trim() || null,
      last_active_at: new Date().toISOString(),
    })
    .eq("id", projectId)
    .select("id, timeline_start, timeline_completion")
    .single();
  if (error) throw error;
  return data;
}

/** Persist exact dates for a project stage. */
export async function updateProjectStageSchedule({ projectId, stageId, startDate = "", dueDate = "" }) {
  if (!supabase || !projectId || !stageId) throw new Error("Choose a saved project stage first.");
  if (startDate && dueDate && startDate > dueDate) throw new Error("Stage end date must be on or after its start date.");
  const { data, error } = await supabase
    .from("project_stages")
    .update({ start_date: startDate || null, due_date: dueDate || null })
    .eq("project_id", projectId)
    .eq("id", stageId)
    .select("id, start_date, due_date")
    .single();
  if (error) throw error;
  return data;
}

/** Persist a task due date shown on the editable timeline. */
export async function updateProjectTaskDueDate({ projectId, taskId, dueDate = "" }) {
  if (!supabase || !projectId || !taskId) throw new Error("Choose a saved task first.");
  const { data, error } = await supabase
    .from("project_tasks")
    .update({ due_date: dueDate || null })
    .eq("project_id", projectId)
    .eq("id", taskId)
    .select("id, due_date")
    .single();
  if (error) throw error;
  return data;
}

/** Persist a new task on the board; returns the inserted row id (or null offline). */
export async function addProjectTask({ projectId, title, phaseName }) {
  if (!supabase) throw new Error("Project storage is not configured.");
  if (!projectId || !title?.trim()) throw new Error("A project and task title are required.");
  let stageId = null;
  if (phaseName) {
      const { data: stages, error: stageError } = await supabase
        .from("project_stages")
        .select("id, name")
        .eq("project_id", projectId);
      if (stageError) throw stageError;
      stageId = (stages || []).find((s) => s.name === phaseName)?.id || null;
  }
    const { data, error } = await supabase
      .from("project_tasks")
      .insert({ project_id: projectId, stage_id: stageId, title: title.trim() })
      .select("id")
      .maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error("The task was not saved.");
  await syncProjectProgress(projectId);
  return data.id;
}

/** Persist a site-feed message; returns inserted row id (or null offline). */
export async function addProjectMessage({ projectId, text, phaseName, authorRole = "Homeowner" }) {
  if (!supabase) throw new Error("Project storage is not configured.");
  if (!projectId || !text?.trim()) throw new Error("A project and message are required.");
    let stageId = null;
    if (phaseName) {
      const { data: stages, error: stageError } = await supabase
        .from("project_stages")
        .select("id, name")
        .eq("project_id", projectId);
      if (stageError) throw stageError;
      stageId = (stages || []).find((s) => s.name === phaseName)?.id || null;
    }
    const { data, error } = await supabase
      .from("project_messages")
      .insert({ project_id: projectId, stage_id: stageId, author_role: authorRole, message: text.trim() })
      .select("id")
      .maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error("The message was not saved.");
  return data.id;
}

/** Persist a task done/todo toggle. */
export async function setProjectTaskDone(taskId, done) {
  if (!supabase) throw new Error("Project storage is not configured.");
  if (!taskId) throw new Error("A saved task is required.");
  const { data, error } = await supabase
      .from("project_tasks")
      .update({ status: done ? "done" : "todo", updated_at: new Date().toISOString() })
      .eq("id", taskId)
      .select("project_id")
      .maybeSingle();
  if (error) throw error;
  if (!data?.project_id) throw new Error("The task was not found in this account.");
  await syncProjectProgress(data.project_id);
}

export async function setProjectTaskStatus(taskId, status) {
  const allowed = ["todo", "in_progress", "blocked", "done"];
  if (!supabase || !taskId || !allowed.includes(status)) throw new Error("Choose a valid task status.");
  const { data, error } = await supabase
    .from("project_tasks")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", taskId)
    .select("project_id")
    .maybeSingle();
  if (error) throw error;
  if (!data?.project_id) throw new Error("The task was not found in this account.");
  await syncProjectProgress(data.project_id);
}
