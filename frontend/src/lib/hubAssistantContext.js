/** Serialize live project board data for Homi (Grok + local fallback). */

const MAX_TASKS = 40;
const MAX_MESSAGES = 20;
const MAX_DOCUMENTS = 20;
const MAX_PAYMENTS = 20;
const MAX_MATERIALS = 40;

function trimText(text, max = 280) {
  const s = String(text || "").trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function compactTask(task) {
  if (!task) return null;
  const title = task.name || task.title || "";
  if (!title) return null;
  return {
    id: task.id || null,
    title: trimText(title, 120),
    done: Boolean(task.done),
    status: task.status || (task.done ? "done" : "todo"),
    phase: task.phase || null,
    date: task.date || null,
    assignee: task.assignee || null,
  };
}

function compactMessage(msg) {
  if (!msg) return null;
  const text = msg.text || msg.message || "";
  if (!text) return null;
  return {
    role: msg.role || msg.author_role || "Team",
    name: msg.name || msg.role || "Team",
    phase: msg.phase || null,
    time: msg.time || null,
    text: trimText(text, 320),
  };
}

function compactPhase(phase) {
  if (!phase?.name) return null;
  return {
    name: phase.name,
    pct: Number(phase.pct ?? 0),
    status: phase.status || null,
  };
}

function compactBrief(brief) {
  if (!brief || typeof brief !== "object") return null;
  const fields = [
    "title", "homeType", "room", "mainGoal", "location", "city", "plotArea", "builtUpArea",
    "floors", "styles", "style", "budgetLabel", "budgetInr", "timeline", "completionTime",
    "startTimeline", "finishTier", "hasArchitect", "hasContractor", "dreamVision", "homeVision",
  ];
  const out = {};
  fields.forEach((key) => {
    const value = brief[key];
    if (value == null || value === "") return;
    out[key] = typeof value === "string" ? trimText(value, 500) : value;
  });
  return Object.keys(out).length ? out : null;
}

function compactDocument(document) {
  if (!document) return null;
  return {
    id: document.id || null,
    name: trimText(document.file_name || document.name || "Project document", 140),
    kind: document.kind || null,
    stageId: document.stage_id || null,
    createdAt: document.created_at || null,
  };
}

function compactPayment(payment) {
  if (!payment) return null;
  return {
    title: trimText(payment.title || "Payment", 120),
    category: payment.category || null,
    amountInr: Number(payment.amount_inr || 0),
    status: payment.status || null,
    dueDate: payment.due_date || null,
  };
}

function compactMaterial(item) {
  if (!item) return null;
  return {
    item: trimText(item.item_name || "Material", 120),
    category: item.category || null,
    quantity: Number(item.quantity || 0),
    unit: item.unit || "unit",
    brand: item.preferred_brand || null,
    status: item.status || "suggested",
    source: item.source_artifact || null,
  };
}

function compactBid(bid) {
  if (!bid) return null;
  return {
    pro: trimText(bid.pro_name || "Professional", 120),
    craft: bid.craft || null,
    city: bid.pro_city || null,
    amountInr: Number(bid.bid_amount_inr || 0),
    timelineWeeks: bid.bid_timeline_weeks ?? null,
    decision: bid.homeowner_decision || "pending",
    invited: Boolean(bid.was_invited),
    scope: trimText(bid.bid_scope_note || "", 320),
    submittedAt: bid.bid_submitted_at || null,
  };
}

function compactAction(action) {
  if (!action) return null;
  return {
    type: action.action_type || null,
    title: trimText(action.title || "Suggested action", 160),
    status: action.status || "suggested",
    rationale: trimText(action.rationale || "", 260),
    approvedAt: action.approved_at || null,
  };
}

function buildV0Summary(v0Pack) {
  if (!v0Pack) return null;
  const images = v0Pack.images?.images || v0Pack.images || [];
  const imageList = Array.isArray(images) ? images : [];
  const estimate = v0Pack.estimate || null;
  return {
    hasImages: imageList.length > 0,
    imageCount: imageList.length,
    hasEstimate: Boolean(estimate?.estimate_lines?.length || estimate?.total_indicative_inr),
    totalInr: estimate?.total_indicative_inr ?? null,
    lineCount: estimate?.estimate_lines?.length ?? 0,
    mock: Boolean(v0Pack.mock),
    generatedAt: v0Pack.generatedAt || null,
  };
}

/**
 * Build context payload sent to /api/ai/hub-assistant (Grok RAG-lite).
 * @param {Record<string, unknown>} params
 */
export function buildHubAssistantContext({
  signedIn = false,
  isDemoHub = false,
  userFirstName = "",
  projectId = "",
  projectTitle = "Your project",
  projectStatus = "",
  flowLabel = "",
  activePhase = "",
  phasePct = 0,
  tasks = [],
  messages = [],
  phases = [],
  taskCount = 0,
  pendingTaskCount = 0,
  nextTask = null,
  budgetLabel = null,
  hasV0 = false,
  v0Pack = null,
  postedBanner = false,
  wantsMarketplaceQuotes = true,
  hubQuery = "",
  signInPath = "/sign-in",
  location = "",
  timeline = "",
  brief = null,
  documents = [],
  payments = [],
  materials = [],
  agentActions = [],
  bids = [],
}) {
  const compactTasks = (tasks || []).map(compactTask).filter(Boolean).slice(0, MAX_TASKS);
  const compactMsgs = (messages || []).map(compactMessage).filter(Boolean).slice(-MAX_MESSAGES);
  const compactPhases = (phases || []).map(compactPhase).filter(Boolean);
  const pending = compactTasks.filter((t) => !t.done);
  const done = compactTasks.filter((t) => t.done);
  const compactDocs = (documents || []).map(compactDocument).filter(Boolean).slice(0, MAX_DOCUMENTS);
  const compactPayments = (payments || []).map(compactPayment).filter(Boolean).slice(0, MAX_PAYMENTS);
  const compactMaterials = (materials || []).map(compactMaterial).filter(Boolean).slice(0, MAX_MATERIALS);
  const compactActions = (agentActions || []).map(compactAction).filter(Boolean).slice(0, 20);
  const compactBids = (bids || []).map(compactBid).filter(Boolean).slice(0, 20);
  const bidAmounts = compactBids.map((bid) => bid.amountInr).filter((value) => value > 0);
  const lowestBidInr = bidAmounts.length ? Math.min(...bidAmounts) : null;
  const artifactRefs = [
    compactBrief(brief) ? "project brief" : null,
    buildV0Summary(v0Pack)?.hasEstimate ? "AI v0 estimate" : null,
    buildV0Summary(v0Pack)?.hasImages ? "AI design pack" : null,
    compactTasks.length ? "task board" : null,
    compactMsgs.length ? "site feed" : null,
    compactDocs.length ? "document register" : null,
    compactPayments.length ? "payment ledger" : null,
    compactMaterials.length ? "material plan" : null,
    compactActions.length ? "approval log" : null,
    compactBids.length ? "contractor bids" : null,
  ].filter(Boolean);

  return {
    signedIn,
    isDemoHub,
    userFirstName,
    projectId: projectId || "",
    projectTitle,
    projectStatus: projectStatus || "",
    flowLabel,
    activePhase,
    phasePct,
    location: location || "",
    timeline: timeline || "",
    taskCount: taskCount || compactTasks.length,
    pendingTaskCount: pendingTaskCount || pending.length,
    nextTask: nextTask || pending[0]?.title || null,
    budgetLabel,
    hasV0: hasV0 || Boolean(v0Pack?.images || v0Pack?.estimate),
    v0Summary: buildV0Summary(v0Pack),
    brief: compactBrief(brief),
    phases: compactPhases,
    tasks: compactTasks,
    pendingTasks: pending.slice(0, 15),
    completedTasks: done.slice(-10),
    messages: compactMsgs,
    recentMessages: compactMsgs.slice(-8),
    documents: compactDocs,
    payments: compactPayments,
    materials: compactMaterials,
    agentActions: compactActions,
    bids: compactBids,
    bidCount: compactBids.length,
    newBidCount: compactBids.filter((bid) => bid.decision === "pending").length,
    lowestBidInr,
    acceptedBidPro: compactBids.find((bid) => bid.decision === "accepted")?.pro || null,
    artifactRefs,
    postedBanner,
    wantsMarketplaceQuotes,
    hubQuery,
    signInPath,
  };
}
