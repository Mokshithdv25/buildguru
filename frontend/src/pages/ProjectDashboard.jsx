import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  CalendarDays,
  Camera,
  Compass,
  CreditCard,
  FileText,
  FolderOpen,
  HardHat,
  Inbox,
  IndianRupee,
  Layers,
  LayoutGrid,
  ListChecks,
  Settings,
  Users,
  X,
} from "lucide-react";
import LandingNavbar from "../components/landing/LandingNavbar";
import {
  HM_FIXED_NAV_OFFSET_TAGLINE_CLASS,
  HM_TAGLINE_PROJECT_HUB,
  HM_HUB_DEMO_PROJECT,
  hmProjectHubPageBackground,
  hmProjectSidebarAsideStyle,
  hmProjectSidebarNavItemStyle,
  hmProjectSidebarNavScrollStyle,
} from "../lib/hmBrand";
import { AUTH_UI_ENABLED, PROJECT_HUB_DEMO_MODE } from "../lib/authMode";
import { useHmSession } from "../hooks/useHmSession";
import {
  formatInrShort,
  getRememberedProject,
  listLocalFlowProjects,
  claimAndListUserProjects,
  loadProjectBoard,
  addProjectTask,
  addProjectMessage,
  derivePhaseProgress,
  setProjectStageStatus,
  setProjectTaskDone,
  setProjectTaskStatus,
  updateProjectSchedule,
  updateProjectStageSchedule,
  updateProjectTaskDueDate,
  projectDisplayName,
  updateProjectHireMode,
} from "../lib/projectFlowApi";
import { listProjectDocuments, listProjectPayments, removeProjectDocument, updateProjectBudget, updateProjectDocumentCategory, updateProjectTitle, uploadProjectDocument } from "../lib/projectWorkspaceApi";
import { buildSignInRedirect } from "../lib/requireHomeownerAuth";
import { buildHubAssistantContext } from "../lib/hubAssistantContext";
import HmFormDialog from "../components/HmFormDialog";
import HmCommandCenter from "../components/HmCommandCenter";
import HmMorningBriefing from "../components/HmMorningBriefing";
import HmProjectIntelligence from "../components/HmProjectIntelligence";
import ProjectBidsPanel from "../components/ProjectBidsPanel";
import WorkPackagesHub from "../components/workPackages/WorkPackagesHub";
import { isOwnTeamHire, normalizeHireMode, postsWholeProjectLeads } from "../lib/hireMode";
import ProjectMaterialsPanel from "../components/ProjectMaterialsPanel";
import ProjectProMatches from "../components/ProjectProMatches";
import ProjectTimelineEditor from "../components/ProjectTimelineEditor";
import {
  loadProjectIntelligence,
  recordAgentDecision,
  removeProjectMaterial,
  saveProjectMaterial,
} from "../lib/projectIntelligenceApi";
import { listProjectBids, setBidDecision } from "../lib/projectBidsApi";
import { browseQuotesUrl, isProjectPostedPhase } from "../lib/projectPostingFlow";

const OR = "#C85F2B";
const SITE_FEED_CATEGORIES = [
  ["site_photo", "Progress photo"],
  ["site_progress", "Construction progress"],
  ["site_material", "Material delivery"],
  ["site_issue", "Issue or inspection"],
  ["site_other", "Other site update"],
];
const siteFeedCategoryLabel = (value) => SITE_FEED_CATEGORIES.find(([key]) => key === value)?.[1] || "Progress photo";

/** Soft panels — reference UI: warm off-white, hairline border, minimal shadow (not heavy white boxes). */
const panel = {
  background: "#FFFFFF",
  borderRadius: 14,
  border: "1px solid #E6E1DA",
  boxShadow: "0 1px 2px rgba(28, 25, 23, 0.04)",
};

const phases = [
  { name: "Design & Approval", pct: 50, color: OR, status: "On Track", statusColor: "#22A36B" },
  { name: "Sourcing", pct: 25, color: "#F59E0B", status: "In Progress", statusColor: "#F59E0B" },
  { name: "Site & Foundation", pct: 70, color: "#22A36B", status: "Ahead", statusColor: "#22A36B" },
  { name: "Structure", pct: 45, color: "#2A6496", status: "On Track", statusColor: "#22A36B" },
  { name: "Finishing", pct: 5, color: "#A8A29E", status: "Upcoming", statusColor: "#9A8F87" },
];

const INITIAL_TASKS = [
  { done: true, name: "Initial concept & mood boards", phase: "Design & Approval", date: "2 May 2024", assignee: "Neha Verma" },
  { done: true, name: "Working drawings issued for sanction", phase: "Design & Approval", date: "18 May 2024", assignee: "Neha Verma" },
  { done: false, name: "Final BBMP approval copy on file", phase: "Design & Approval", date: "28 Jun 2024", assignee: "Suresh Yadav" },
  { done: true, name: "Flooring shortlist from vendor", phase: "Sourcing", date: "20 Jun 2024", assignee: "Ankit Sharma" },
  { done: false, name: "Sanitaryware BOQ finalization", phase: "Sourcing", date: "25 Jun 2024", assignee: "Neha Verma" },
  { done: false, name: "Window frame colour samples", phase: "Sourcing", date: "28 Jun 2024", assignee: "Rajesh Kumar" },
  { done: true, name: "Site clearance & boundary marking", phase: "Site & Foundation", date: "8 Jun 2024", assignee: "Rajesh Kumar" },
  { done: true, name: "Excavation & PCC completed", phase: "Site & Foundation", date: "12 Jun 2024", assignee: "Rajesh Kumar" },
  { done: false, name: "Footing reinforcement inspection", phase: "Site & Foundation", date: "19 Jun 2024", assignee: "Neha Verma" },
  { done: true, name: "Slab 1 casting", phase: "Structure", date: "12 Jun 2024", assignee: "Rajesh Kumar" },
  { done: false, name: "Curing of slab 1", phase: "Structure", date: "In progress", assignee: "Rajesh Kumar" },
  { done: false, name: "Lintel / level beam schedule", phase: "Structure", date: "22 Jun 2024", assignee: "Bharat Hegde" },
  { done: false, name: "Mock-up room — paint & lighting", phase: "Finishing", date: "Aug 2024", assignee: "Neha Verma" },
];

const INITIAL_MESSAGES = [
  { phase: "Design & Approval", role: "Architect", name: "Neha Verma", time: "Mon, 9:10 AM", text: "Sanction set v4 is uploaded — please review column grid at the living area.", color: "#2A6496" },
  { phase: "Design & Approval", role: "Homeowner", name: "Ankit Sharma", time: "Mon, 9:22 AM", text: "Looks good. One minor change to store room door swing.", color: OR },
  { phase: "Sourcing", role: "Contractor", name: "Rajesh Kumar", time: "Tue, 3:40 PM", text: "Tile vendor will bring 600×600 samples on Thursday morning.", color: "#22A36B" },
  { phase: "Site & Foundation", role: "Contractor", name: "Rajesh Kumar", time: "Wed, 8:15 AM", text: "Footing pour scheduled Friday 7 AM — please keep parking clear for mixer.", color: "#22A36B" },
  { phase: "Structure", role: "Homeowner", name: "Ankit Sharma", time: "Today, 10:20 AM", text: "Can we confirm shuttering removal timeline for the first slab?", color: OR },
  { phase: "Structure", role: "Architect", name: "Neha Verma", time: "Today, 10:28 AM", text: "Stripping after 14 days cure minimum — I’ll sign off on day 15 if cube results are OK.", color: "#2A6496" },
  { phase: "Structure", role: "Contractor", name: "Rajesh Kumar", time: "Today, 10:35 AM", text: "Cube tests booked for Monday. Shuttering strip Tuesday if passes.", color: "#22A36B" },
  { phase: "Finishing", role: "Architect", name: "Neha Verma", time: "Last week", text: "We can freeze ceiling profiles once structure slab 2 is cast.", color: "#2A6496" },
];

/** Per-stage site feed, budget summary, docs preview, and budget modal lines. */
const STAGE_DETAILS = {
  "Design & Approval": {
    siteImage: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=640&q=75",
    siteCaption: "Design workshop — reviewing elevations and material palette",
    siteTime: "12 Jun 2024, 4:20 PM",
    budgetTotal: "₹1.20 Cr",
    budgetSpent: "₹14 L",
    spentPct: 11.7,
    barPct: 11.7,
    budgetRemaining: "₹1.06 Cr",
    expectedCost: "₹1.18 Cr",
    traffic: "green",
    docs: [
      { name: "Concept_Floor_Plans_v3.pdf", ext: "PDF" },
      { name: "Elevation_Render_Package.pdf", ext: "PDF" },
      { name: "Sanction_Submission_Checklist.xlsx", ext: "XLS" },
    ],
    miniGallery: [
      "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=200&q=70",
      "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=200&q=70",
      "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=200&q=70",
      "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=200&q=70",
    ],
    budgetLines: [
      ["Architecture (design phase)", "₹8.5 L"],
      ["Structural peer review", "₹2.2 L"],
      ["Authority fees & liaison", "₹3.3 L"],
    ],
  },
  Sourcing: {
    siteImage: "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=640&q=75",
    siteCaption: "Tile & sanitary showroom visit — shortlisting vendors",
    siteTime: "20 Jun 2024, 2:00 PM",
    budgetTotal: "₹1.20 Cr",
    budgetSpent: "₹22 L",
    spentPct: 18.3,
    barPct: 18.3,
    budgetRemaining: "₹98 L",
    expectedCost: "₹1.16 Cr",
    traffic: "green",
    docs: [
      { name: "Flooring_BOQ_Draft.xlsx", ext: "XLS" },
      { name: "Sanitary_Schedule_v1.pdf", ext: "PDF" },
      { name: "Vendor_Comparison_Tiles.pdf", ext: "PDF" },
    ],
    miniGallery: [
      "https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=200&q=70",
      "https://images.unsplash.com/photo-1600566752355-35792bedcfea?w=200&q=70",
      "https://images.unsplash.com/photo-1600573472592-401b289a6db5?w=200&q=70",
      "https://images.unsplash.com/photo-1600585154084-4e5fe7c39198?w=200&q=70",
    ],
    budgetLines: [
      ["Tile & stone advances", "₹9 L"],
      ["Sanitary & CP fittings", "₹7 L"],
      ["Windows & hardware deposits", "₹6 L"],
    ],
  },
  "Site & Foundation": {
    siteImage: "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=640&q=75",
    siteCaption: "Footing reinforcement in progress — north-east grid",
    siteTime: "Today, 8:30 AM",
    budgetTotal: "₹1.20 Cr",
    budgetSpent: "₹38 L",
    spentPct: 31.7,
    barPct: 31.7,
    budgetRemaining: "₹82 L",
    expectedCost: "₹1.14 Cr",
    traffic: "green",
    docs: [
      { name: "Soil_Test_Report.pdf", ext: "PDF" },
      { name: "Foundation_Layout_Approval.pdf", ext: "PDF" },
      { name: "Excavation_Log_Jun.pdf", ext: "PDF" },
    ],
    miniGallery: [
      "https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=200&q=70",
      "https://images.unsplash.com/photo-1590644360187-299417a9fdca?w=200&q=70",
      "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=200&q=70",
      "https://images.unsplash.com/photo-1541976590-713941681591?w=200&q=70",
    ],
    budgetLines: [
      ["Earthwork & PCC", "₹12 L"],
      ["Steel & concrete (foundation)", "₹18 L"],
      ["Shuttering & labour", "₹8 L"],
    ],
  },
  Structure: {
    siteImage: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=640&q=75",
    siteCaption: "Column shuttering work in progress — ground floor",
    siteTime: "14 Jun 2024, 10:30 AM",
    budgetTotal: "₹1.20 Cr",
    budgetSpent: "₹65 L",
    spentPct: 54.2,
    barPct: 54.2,
    budgetRemaining: "₹55 L",
    expectedCost: "₹1.15 Cr",
    traffic: "green",
    docs: [
      { name: "Structural_Drawing_Set_03.pdf", ext: "PDF" },
      { name: "Slab_Reinforcement_Photo_Log.pdf", ext: "PDF" },
      { name: "Concrete_Test_Cubes_Jun.pdf", ext: "PDF" },
    ],
    miniGallery: [
      "https://images.unsplash.com/photo-1541976590-713941681591?w=200&q=70",
      "https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=200&q=70",
      "https://images.unsplash.com/photo-1590644360187-299417a9fdca?w=200&q=70",
      "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=200&q=70",
    ],
    budgetLines: [
      ["RCC & steel (GF slab)", "₹28 L"],
      ["Shuttering & scaffolding", "₹18 L"],
      ["Structural consultant reviews", "₹4 L"],
      ["Crane / pump hire", "₹15 L"],
    ],
  },
  Finishing: {
    siteImage: "https://images.unsplash.com/photo-1615876234889-fd9cd39b94a9?w=640&q=75",
    siteCaption: "Sample flat — ceiling profile mock-up (planned)",
    siteTime: "Scheduled Jul 2024",
    budgetTotal: "₹1.20 Cr",
    budgetSpent: "₹4 L",
    spentPct: 3.3,
    barPct: 3.3,
    budgetRemaining: "₹1.16 Cr",
    expectedCost: "₹1.22 Cr",
    traffic: "green",
    docs: [
      { name: "Finish_Schedule_Draft.pdf", ext: "PDF" },
      { name: "MEP_Coordination_Sketches.pdf", ext: "PDF" },
    ],
    miniGallery: [
      "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=200&q=70",
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=200&q=70",
      "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=200&q=70",
      "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=200&q=70",
    ],
    budgetLines: [
      ["Samples & mock-ups", "₹2 L"],
      ["MEP design coordination", "₹2 L"],
    ],
  },
};

/** Per-stage calendar-style reminders — editable on the board (demo seed until calendar sync). */
const MILESTONE_SEED = {
  "Design & Approval": [
    { id: "da-1", icon: "📐", name: "Statutory submission complete", date: "28 Jun 2024" },
    { id: "da-2", icon: "✅", name: "Client sign-off on finishes board", date: "05 Jul 2024" },
  ],
  Sourcing: [
    { id: "so-1", icon: "🧱", name: "Tiles & stone PO issued", date: "02 Jul 2024" },
    { id: "so-2", icon: "🚿", name: "Sanitaryware order confirmed", date: "10 Jul 2024" },
  ],
  "Site & Foundation": [
    { id: "sf-1", icon: "🏛️", name: "Plinth beam concrete", date: "20 Jun 2024" },
    { id: "sf-2", icon: "🔧", name: "Ground floor columns starter", date: "25 Jun 2024" },
  ],
  Structure: [
    { id: "st-1", icon: "🏗️", name: "Slab 1 casting complete", date: "12 Jun 2024" },
    { id: "st-2", icon: "🔧", name: "Slab 2 shuttering start", date: "05 Jul 2024" },
    { id: "st-3", icon: "⚡", name: "Electrical conduit rough-in", date: "15 Jul 2024" },
  ],
  Finishing: [
    { id: "fi-1", icon: "🎨", name: "Mock-up room sign-off", date: "Aug 2024" },
    { id: "fi-2", icon: "💡", name: "Lighting layout freeze", date: "Sep 2024" },
  ],
};

function navId(item) {
  return item.id || item.label;
}

function resolveHubTab(tab) {
  if (!tab) return "Overview";
  if (tab === "Hire") return "Bids";
  return tab;
}

const NAV = [
  { Icon: LayoutGrid, label: "Overview", path: null },
  { Icon: Inbox, id: "Bids", label: "Hire", path: null },
  { Icon: CalendarDays, label: "Timeline", path: null },
  { Icon: ListChecks, label: "Tasks", path: null },
  { Icon: IndianRupee, label: "Budget", path: null },
  { Icon: Layers, label: "Materials", path: null },
  { Icon: CreditCard, label: "Payments", path: "/project/payments" },
  { Icon: Camera, label: "Site Feed", path: null },
  { Icon: FileText, label: "Documents", path: "/documents" },
  { Icon: Compass, label: "Design journey", path: "/project/journey" },
  { Icon: HardHat, label: "Find Pros", path: "/project/browse" },
  { Icon: Users, label: "Team", path: "/team" },
  { Icon: Settings, label: "Settings", path: null },
];

/** Demo project funding — own equity vs bank loan; swap for ledger API later. */
const PROJECT_FUNDING = {
  totalBudget: "₹1.20 Cr",
  spentToDate: "₹78 L",
  pctOfTotalSpent: 65,
  ownEquityBudgeted: "₹42 L",
  bankLoanSanctioned: "₹78 L",
  spentFromOwnPocket: "₹26 L",
  spentFromLoanDisbursements: "₹52 L",
  loanTrancheReleasedPct: 67,
  monthlyBurnPlanned: "₹5.5 L / mo",
  monthlyBurnActual: "₹4.9 L / mo",
  runwayNote: "At current burn you are slightly under the draw schedule — room for one vendor advance if needed.",
};

function CircleProgress({ pct, color, size = 80 }) {
  const r = 28;
  const cx = 36;
  const cy = 36;
  const circ = 2 * Math.PI * r;
  const n = Math.round(Number(pct)) || 0;
  const dash = (n / 100) * circ;
  const holeR = 21;
  /** HTML overlay — SVG <text> inside <button> often loses digit glyphs (font inheritance). */
  const label = `${n}%`;
  const labelPx = Math.max(13, Math.round(size * 0.21));
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox="0 0 72 72" aria-hidden style={{ display: "block" }}>
        <circle cx={cx} cy={cy} r={holeR} fill="#FDFCFB" stroke="#EDEAE6" strokeWidth="1" />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#E8E6E3" strokeWidth="6" />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      </svg>
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: size,
          height: size,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: labelPx,
          fontWeight: 800,
          color: "#1C1917",
          fontFamily: "'DM Sans', 'Inter', ui-sans-serif, system-ui, sans-serif",
          pointerEvents: "none",
          lineHeight: 1,
          letterSpacing: "-0.02em",
        }}
      >
        {label}
      </div>
    </div>
  );
}

function Avatar({ name, size = 32, color = "#C85F2B" }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.38,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)}
    </div>
  );
}

function taskAssigneeColor(name) {
  if (name.includes("Neha")) return "#2A6496";
  if (name.includes("Rajesh")) return "#22A36B";
  if (name.includes("Suresh")) return "#D97706";
  if (name.includes("Bharat")) return "#7A4FC0";
  if (name === "You") return OR;
  return "#57534E";
}

function trafficDot(traffic) {
  if (traffic === "amber") return "#F59E0B";
  if (traffic === "red") return "#DC2626";
  return "#22A36B";
}

function flowSourceLabel(flowType, source) {
  if (source === "remodel" || flowType === "remodel") return "Remodel";
  if (source === "build-new" || flowType === "new_home") return "New build";
  return "Project";
}

export default function ProjectDashboard() {
  const navigate = useNavigate();
  const hmSession = useHmSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const [userProjects, setUserProjects] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [dismissPostedBanner, setDismissPostedBanner] = useState(false);
  const postedPhase = searchParams.get("phase");
  const showPostedBanner =
    !dismissPostedBanner &&
    (searchParams.get("source") === "build-new" || searchParams.get("source") === "remodel") &&
    isProjectPostedPhase(postedPhase);
  const [activeNav, setActiveNav] = useState(() => resolveHubTab(searchParams.get("tab") || "Overview"));
  const [selectedPhase, setSelectedPhase] = useState("Structure");
  const [phaseRows, setPhaseRows] = useState([]);
  const [briefData, setBriefData] = useState(null);
  const [v0Pack, setV0Pack] = useState(null);
  const [msg, setMsg] = useState("");
  const [msgs, setMsgs] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [projectDocuments, setProjectDocuments] = useState([]);
  const [payments, setPayments] = useState([]);
  const [materialItems, setMaterialItems] = useState([]);
  const [agentActions, setAgentActions] = useState([]);
  const [intelligenceConfigured, setIntelligenceConfigured] = useState(true);
  const [bids, setBids] = useState([]);
  const [bidsConfigured, setBidsConfigured] = useState(true);
  const [bidsLoading, setBidsLoading] = useState(false);
  const [projectTitleDraft, setProjectTitleDraft] = useState("");
  const [renamingProject, setRenamingProject] = useState(false);
  const [siteUploading, setSiteUploading] = useState(false);
  const [selectedSiteFeedEntry, setSelectedSiteFeedEntry] = useState(null);
  const sitePhotoPickerRef = useRef(null);
  const [boardError, setBoardError] = useState("");
  const [budgetDetailOpen, setBudgetDetailOpen] = useState(false);
  const [budgetDetailScope, setBudgetDetailScope] = useState("stage");
  const [budgetEditOpen, setBudgetEditOpen] = useState(false);
  const [taskAddOpen, setTaskAddOpen] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskStage, setNewTaskStage] = useState("Structure");
  const [milestonesByPhase, setMilestonesByPhase] = useState(() =>
    PROJECT_HUB_DEMO_MODE
      ? Object.fromEntries(Object.entries(MILESTONE_SEED).map(([phase, rows]) => [phase, rows.map((m) => ({ ...m }))]))
      : {}
  );
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [milestoneDialog, setMilestoneDialog] = useState({
    open: false,
    mode: "add",
    phase: "",
    id: null,
    initial: { name: "", date: "" },
  });

  const activeProjectId = searchParams.get("projectId") || "";
  const isLiveProject = Boolean(activeProjectId);

  useEffect(() => {
    const requestedTab = searchParams.get("tab");
    if (!requestedTab) return;
    const item = NAV.find((n) => !n.path && (n.id === requestedTab || n.label === requestedTab));
    if (item) setActiveNav(navId(item));
  }, [searchParams]);

  const hubQuery = useMemo(() => {
    const pid = activeProjectId;
    const src = searchParams.get("source");
    if (!pid) return "";
    return `?projectId=${encodeURIComponent(pid)}${src ? `&source=${encodeURIComponent(src)}` : ""}`;
  }, [searchParams, activeProjectId]);

  const openProject = (project, { preserveQuery = true } = {}) => {
    const src =
      project.source === "remodel" || project.flow_type === "remodel"
        ? "remodel"
        : project.source === "build-new" || project.flow_type === "new_home"
          ? "build-new"
          : project.source || "";
    const q = preserveQuery ? new URLSearchParams(searchParams) : new URLSearchParams();
    q.set("projectId", project.id);
    if (src) q.set("source", src);
    navigate(`/project?${q.toString()}`);
  };

  useEffect(() => {
    const userId = hmSession?.supabaseUserId;
    if (!AUTH_UI_ENABLED && !userId) {
      const local = listLocalFlowProjects();
      setUserProjects(local);
      setProjectsLoading(false);
      if (!activeProjectId && local.length > 0 && !isProjectPostedPhase(searchParams.get("phase"))) {
        openProject(local[0], { preserveQuery: false });
      }
      return;
    }
    if (!userId) {
      setUserProjects([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setProjectsLoading(true);
      try {
        const rows = await claimAndListUserProjects(userId);
        if (cancelled) return;
        setUserProjects(rows);
        if (!activeProjectId && rows.length > 0 && !isProjectPostedPhase(searchParams.get("phase"))) {
          const remembered = getRememberedProject(userId);
          const pick =
            rows.find((p) => p.id === remembered?.projectId) ||
            rows[0];
          if (pick) openProject(pick, { preserveQuery: false });
        }
      } catch (err) {
        console.error("Failed to list user projects:", err);
      } finally {
        if (!cancelled) setProjectsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- openProject stable enough; only run when auth/projectId gate changes
  }, [hmSession?.supabaseUserId, activeProjectId]);
  const liveStageDetail = useMemo(() => {
    if (!isLiveProject) return null;
    const v0Images = [
      ...(v0Pack?.images?.images || []),
      ...(v0Pack?.images?.floor_plans || v0Pack?.images?.floorPlans || v0Pack?.floorPlans || []),
    ].map((img) => img?.url).filter(Boolean);
    const estimate = v0Pack?.estimate;
    const budgetTotal =
      (userProjects.find((row) => row.id === activeProjectId)?.budget_max ? formatInrShort(userProjects.find((row) => row.id === activeProjectId).budget_max) : null) ||
      briefData?.budgetLabel ||
      (briefData?.budgetInr ? formatInrShort(briefData.budgetInr) : null) ||
      (briefData?.budgetUnit && briefData?.budgetAmount
        ? `₹${briefData.budgetAmount} ${briefData.budgetUnit === "Crores" ? "Cr" : "L"}`
        : "TBD");
    const indicative =
      estimate?.total_indicative_inr != null ? formatInrShort(estimate.total_indicative_inr) : null;
    const budgetLines = (estimate?.estimate_lines || []).map((line) => [
      line?.label || "Line item",
      line?.amount_inr != null ? formatInrShort(line.amount_inr) : "TBD",
    ]);
    const selectedStageId = phaseRows.find((row) => row.name === selectedPhase)?.id;
    const uploadedForStage = projectDocuments.filter((document) => !document.stage_id || document.stage_id === selectedStageId);
    const uploadedPhotos = uploadedForStage.filter((document) => String(document.kind || "").startsWith("site_") && document.signed_url).map((document) => document.signed_url);
    return {
      siteImage: v0Images[0] || "",
      siteCaption:
        (estimate?.project_summary ? String(estimate.project_summary).slice(0, 120) : null) ||
        `AI v0 saved for ${selectedPhase}.` +
          (briefData?.location ? ` Location: ${briefData.location}.` : ""),
      siteTime: v0Pack?.generatedAt ? "From saved v0 pack" : "Recently updated",
      budgetTotal,
      budgetSpent: indicative ? `Indicative v0: ${indicative}` : "Early planning",
      spentPct: 0,
      barPct: 0,
      budgetRemaining: budgetTotal,
      expectedCost: indicative || "To be finalized",
      traffic: "green",
      docs: [
        { name: "AI v0 concept images", ext: "IMG" },
        ...(v0Pack?.floorPlans?.length || v0Pack?.images?.floor_plans?.length
          ? [{ name: "AI v0 floor plans", ext: "PLAN" }]
          : []),
        { name: "Indicative estimate (v0)", ext: "EST" },
        { name: "Project brief snapshot", ext: "JSON" },
        ...uploadedForStage.map((document) => ({ name: document.file_name, ext: String(document.kind || "FILE").replaceAll("_", " ").toUpperCase() })),
      ],
      miniGallery: [...uploadedPhotos, ...v0Images].slice(0, 4),
      budgetLines: budgetLines.length ? budgetLines : [["Planning baseline", budgetTotal]],
    };
  }, [isLiveProject, v0Pack, briefData, selectedPhase, phaseRows, projectDocuments, userProjects, activeProjectId]);
  const stageDetail = isLiveProject && liveStageDetail ? liveStageDetail : STAGE_DETAILS[selectedPhase];
  useEffect(() => {
    if (!activeProjectId) {
      if (PROJECT_HUB_DEMO_MODE) {
        setPhaseRows(phases);
        setTasks(INITIAL_TASKS);
        setMsgs(INITIAL_MESSAGES);
        setSelectedPhase("Structure");
        setMilestonesByPhase(
          Object.fromEntries(Object.entries(MILESTONE_SEED).map(([phase, rows]) => [phase, rows.map((m) => ({ ...m }))]))
        );
      } else {
        setPhaseRows([]);
        setTasks([]);
        setMsgs([]);
        setSelectedPhase("Design & Approval");
        setMilestonesByPhase({});
      }
      setBriefData(null);
      setV0Pack(null);
      setProjectDocuments([]);
      setPayments([]);
      setMaterialItems([]);
      setAgentActions([]);
      setIntelligenceConfigured(true);
      setBids([]);
      setBidsConfigured(true);
      return;
    }
    const run = async () => {
      setBoardError("");
      setPhaseRows([]);
      setTasks([]);
      setMsgs([]);
      setBriefData(null);
      setV0Pack(null);
      setMilestonesByPhase({});
      try {
        const source = searchParams.get("source") || "";
        const projectId = searchParams.get("projectId") || "";
        const [board, documents, paymentRows] = await Promise.all([
          loadProjectBoard({ source, projectId }),
          listProjectDocuments(projectId),
          listProjectPayments(projectId),
        ]);
        if (!board) throw new Error("This project could not be loaded for the signed-in account.");
        if (Array.isArray(board.phases)) {
          setPhaseRows(board.phases);
          setSelectedPhase((prev) =>
            board.phases.some((p) => p.name === prev) ? prev : (board.phases[0]?.name || "")
          );
        }
        setTasks(Array.isArray(board.tasks) ? board.tasks : []);
        setMsgs(Array.isArray(board.messages) ? board.messages : []);
        setBriefData(board.brief || null);
        setV0Pack(board.v0Pack || null);
        setProjectDocuments(documents || []);
        setPayments(paymentRows || []);
        try {
          const intelligence = await loadProjectIntelligence({
            projectId,
            brief: board.brief || {},
            v0Pack: board.v0Pack || null,
          });
          setMaterialItems(intelligence.materials || []);
          setAgentActions(intelligence.actions || []);
          setIntelligenceConfigured(intelligence.configured);
        } catch (intelligenceError) {
          console.warn("Could not load project intelligence:", intelligenceError?.message || intelligenceError);
          setMaterialItems([]);
          setAgentActions([]);
          setIntelligenceConfigured(false);
        }
        setBidsLoading(true);
        try {
          const bidResult = await listProjectBids(projectId);
          setBids(bidResult.bids || []);
          setBidsConfigured(bidResult.configured);
        } catch (bidError) {
          console.warn("Could not load project bids:", bidError?.message || bidError);
          setBids([]);
          setBidsConfigured(false);
        } finally {
          setBidsLoading(false);
        }
        const ms = board.v0Pack?.estimate?.milestones;
        if (Array.isArray(ms) && ms.length) {
          setMilestonesByPhase({
              "Design & Approval": ms.map((m, i) => ({
                id: `v0-ms-${i}`,
                icon: "📐",
                name: String(m?.title || `Milestone ${i + 1}`),
                date: String(m?.timeframe || "Planned"),
              })),
          });
        }
      } catch (err) {
        console.error("Failed to load project board from Supabase:", err);
        setBoardError(err?.message || "Could not load the saved project.");
      }
    };
    run();
  }, [searchParams, activeProjectId]);

  const phaseOrder = useMemo(() => phaseRows.map((p) => p.name), [phaseRows]);
  const phaseRank = useMemo(() => Object.fromEntries(phaseOrder.map((n, i) => [n, i])), [phaseOrder]);

  const filteredTasks = useMemo(() => tasks.filter((t) => t.phase === selectedPhase), [tasks, selectedPhase]);
  const filteredMsgs = useMemo(() => msgs.filter((m) => m.phase === selectedPhase), [msgs, selectedPhase]);
  const [workPackageNewBids, setWorkPackageNewBids] = useState(0);
  const newBidCount = useMemo(
    () => bids.filter((bid) => (bid.homeowner_decision || "pending") === "pending").length + workPackageNewBids,
    [bids, workPackageNewBids],
  );
  const selectedWorkPackageId = searchParams.get("package") || "";
  const selectWorkPackage = useCallback((packageId) => {
    const next = new URLSearchParams(searchParams);
    if (packageId) {
      next.set("package", packageId);
      next.set("tab", "Bids");
    } else {
      next.delete("package");
    }
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
  const acceptedBid = useMemo(() => bids.find((bid) => bid.homeowner_decision === "accepted") || null, [bids]);
  const phaseMilestones = milestonesByPhase[selectedPhase] || [];
  const fundingSnapshot = useMemo(() => {
    if (!isLiveProject) return PROJECT_FUNDING;
    const totalLabel =
      (userProjects.find((row) => row.id === activeProjectId)?.budget_max ? formatInrShort(userProjects.find((row) => row.id === activeProjectId).budget_max) : null) ||
      briefData?.budgetLabel ||
      (briefData?.budgetUnit && briefData?.budgetAmount
        ? `₹${briefData.budgetAmount} ${briefData.budgetUnit === "Crores" ? "Cr" : "L"}`
        : "TBD");
    const indicative = v0Pack?.estimate?.total_indicative_inr;
    const paidTotal = payments.filter((row) => row.status === "paid").reduce((sum, row) => sum + Number(row.amount_inr || 0), 0);
    const committedTotal = payments.filter((row) => row.status === "due" || row.status === "planned").reduce((sum, row) => sum + Number(row.amount_inr || 0), 0);
    const budgetTotal = Number(userProjects.find((row) => row.id === activeProjectId)?.budget_max || briefData?.budgetInr || 0);
    return {
      totalBudget: totalLabel,
      spentToDate: paidTotal ? formatInrShort(paidTotal) : "₹0",
      pctOfTotalSpent: budgetTotal > 0 ? Math.min(100, Math.round((paidTotal / budgetTotal) * 100)) : 0,
      ownEquityBudgeted: totalLabel,
      bankLoanSanctioned: null,
      spentFromOwnPocket: "—",
      spentFromLoanDisbursements: null,
      loanTrancheReleasedPct: null,
      monthlyBurnPlanned: "To be planned",
      monthlyBurnActual: paidTotal ? `${formatInrShort(paidTotal)} recorded` : "No paid entries",
      runwayNote: indicative
        ? `Saved AI v0 estimate: ${formatInrShort(indicative)}. Paid: ${paidTotal ? formatInrShort(paidTotal) : "₹0"}; planned or due: ${committedTotal ? formatInrShort(committedTotal) : "₹0"}.`
        : `${payments.length} ledger entr${payments.length === 1 ? "y" : "ies"}; paid: ${paidTotal ? formatInrShort(paidTotal) : "₹0"}.`,
    };
  }, [isLiveProject, briefData, v0Pack, payments, userProjects, activeProjectId]);

  const isSignedIn = AUTH_UI_ENABLED ? Boolean(hmSession?.supabaseUserId) : true;
  const needsSignIn = AUTH_UI_ENABLED && !isSignedIn;
  const isDemoHub = PROJECT_HUB_DEMO_MODE && !activeProjectId;
  const needsProjectPick = !needsSignIn && !activeProjectId && !projectsLoading && !isDemoHub;
  const hubReady = !needsSignIn && !needsProjectPick;
  const postedMissingProject =
    isProjectPostedPhase(searchParams.get("phase")) && !activeProjectId && !projectsLoading;
  const hireMode = normalizeHireMode(briefData || {});
  const briefHasOwnPros = isOwnTeamHire(hireMode);
  const localDraftProjects = useMemo(() => listLocalFlowProjects(), []);
  const activeProjectMeta = useMemo(
    () => userProjects.find((p) => p.id === activeProjectId) || null,
    [userProjects, activeProjectId],
  );
  useEffect(() => {
    setProjectTitleDraft(activeProjectMeta?.title || "");
  }, [activeProjectMeta?.title]);
  const signInRedirectPath = buildSignInRedirect(
    activeProjectId ? `/project?projectId=${encodeURIComponent(activeProjectId)}` : "/project",
  );

  const pendingTasks = useMemo(() => tasks.filter((t) => !t.done), [tasks]);
  const nextOpenTask = pendingTasks[0]?.name || null;

  const assistantContext = useMemo(
    () =>
      buildHubAssistantContext({
        signedIn: isSignedIn,
        isDemoHub,
        userFirstName: (hmSession?.name || hmSession?.email || "").split(/\s+/)[0] || "",
        projectId: activeProjectId,
        projectTitle:
          activeProjectMeta?.title || briefData?.title || (isDemoHub ? HM_HUB_DEMO_PROJECT.line2 : "Your project"),
        projectStatus: activeProjectMeta?.status || "",
        flowLabel: isDemoHub
          ? HM_HUB_DEMO_PROJECT.meta
          : flowSourceLabel(activeProjectMeta?.flow_type, activeProjectMeta?.source),
        activePhase: selectedPhase,
        phasePct: phaseRows.find((p) => p.name === selectedPhase)?.pct ?? 0,
        tasks,
        messages: msgs,
        phases: phaseRows,
        taskCount: tasks.length,
        pendingTaskCount: pendingTasks.length,
        nextTask: nextOpenTask,
        budgetLabel:
          briefData?.budgetLabel ||
          (activeProjectMeta?.budget_max ? formatInrShort(activeProjectMeta.budget_max) : null),
        hasV0: Boolean(v0Pack?.images || v0Pack?.estimate),
        v0Pack,
        brief: briefData,
        documents: projectDocuments,
        payments,
        materials: materialItems,
        agentActions,
        location: activeProjectMeta?.location || briefData?.location || briefData?.city || "",
        timeline: activeProjectMeta?.timeline_completion || briefData?.timeline || "",
        postedBanner: showPostedBanner,
        wantsMarketplaceQuotes: !briefHasOwnPros,
        bids,
        hubQuery,
        signInPath: signInRedirectPath,
      }),
    [
      bids,
      isSignedIn,
      hmSession,
      activeProjectId,
      isDemoHub,
      activeProjectMeta,
      briefData,
      selectedPhase,
      phaseRows,
      tasks,
      msgs,
      pendingTasks.length,
      nextOpenTask,
      v0Pack,
      projectDocuments,
      payments,
      materialItems,
      agentActions,
      showPostedBanner,
      briefHasOwnPros,
      hubQuery,
      signInRedirectPath,
    ],
  );

  const saveMaterial = async (item) => {
    const saved = await saveProjectMaterial(activeProjectId, item);
    setMaterialItems((current) => current.map((row) => row.id === item.id ? saved : row));
    return saved;
  };

  const removeMaterial = async (itemId) => {
    await removeProjectMaterial(activeProjectId, itemId);
    setMaterialItems((current) => current.filter((row) => row.id !== itemId));
  };

  const decideAgentAction = async (decision) => {
    const saved = await recordAgentDecision({ projectId: activeProjectId, ...decision });
    setAgentActions((current) => [saved, ...current]);
    return saved;
  };

  // Accepting a bid also unlocks the professional's contact details, which the
  // server only reveals on re-read, so refresh the list instead of patching it.
  const decideBid = async ({ bidId, decision }) => {
    await setBidDecision({ bidId, decision });
    const refreshed = await listProjectBids(activeProjectId);
    setBids(refreshed.bids || []);
    setBidsConfigured(refreshed.configured);
  };

  const saveProjectSchedule = async (schedule) => {
    const saved = await updateProjectSchedule(activeProjectId, schedule);
    setUserProjects((rows) => rows.map((row) => row.id === activeProjectId ? { ...row, ...saved } : row));
    return saved;
  };

  const saveStageSchedule = async (phase, schedule) => {
    const saved = await updateProjectStageSchedule({ projectId: activeProjectId, stageId: phase.id, ...schedule });
    setPhaseRows((rows) => rows.map((row) => row.id === phase.id ? { ...row, startDate: saved.start_date || "", dueDate: saved.due_date || "" } : row));
    return saved;
  };

  const saveTaskDueDate = async (task, dueDate) => {
    const saved = await updateProjectTaskDueDate({ projectId: activeProjectId, taskId: task.id, dueDate });
    const label = saved.due_date ? new Date(`${saved.due_date}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "No due date";
    setTasks((rows) => rows.map((row) => row.id === task.id ? { ...row, dueDate: saved.due_date || "", date: label } : row));
  };

  const allTasksSorted = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const pa = phaseRank[a.phase] ?? 99;
      const pb = phaseRank[b.phase] ?? 99;
      if (pa !== pb) return pa - pb;
      return String(a.date).localeCompare(String(b.date), undefined, { numeric: true });
    });
  }, [tasks, phaseRank]);

  const siteFeedEntries = useMemo(
    () => {
      if (isLiveProject) {
        const media = [
          ...(v0Pack?.images?.images || []).map((image) => ({ ...image, kind: "concept" })),
          ...(v0Pack?.images?.floor_plans || v0Pack?.images?.floorPlans || v0Pack?.floorPlans || []).map((image) => ({ ...image, kind: "floor" })),
          ...projectDocuments
            .filter((document) => String(document.kind || "").startsWith("site_") && document.signed_url)
            .map((document) => ({
              documentId: document.id,
              url: document.signed_url,
              label: document.file_name,
              kind: "site",
              category: document.kind,
              created_at: document.created_at,
              stage_id: document.stage_id,
            })),
        ].filter((image) => image?.url);
        if (!media.length) return [];
        return media.map((item, index) => ({
          phase: phaseRows.find((phase) => phase.id === item.stage_id)?.name || "Design & Approval",
          image: item.url,
          caption: item.label || (item.kind === "floor" ? `Saved floor plan ${index + 1}` : index === 0 ? (v0Pack?.estimate?.project_summary || "Saved AI v0 concept") : `Saved concept ${index + 1}`),
          time: item.created_at ? new Date(item.created_at).toLocaleDateString("en-IN") : "Saved with this project",
        }));
      }
      return phaseOrder.map((name) => {
        const d = STAGE_DETAILS[name];
        return { phase: name, image: d.siteImage, caption: d.siteCaption, time: d.siteTime };
      });
    },
    [phaseOrder, phaseRows, isLiveProject, v0Pack, projectDocuments]
  );

  const allBudgetLines = useMemo(() => {
    if (isLiveProject && v0Pack?.estimate?.estimate_lines?.length) {
      return v0Pack.estimate.estimate_lines.map((line) => ({
        phase: "Design & Approval",
        label: line?.label || "Line item",
        amt: line?.amount_inr != null ? formatInrShort(line.amount_inr) : "TBD",
      }));
    }
    const rows = [];
    for (const name of phaseOrder) {
      const d = STAGE_DETAILS[name];
      for (const [label, amt] of d.budgetLines || []) {
        rows.push({ phase: name, label, amt });
      }
    }
    return rows;
  }, [phaseOrder, isLiveProject, v0Pack]);

  const sendMsg = async () => {
    if (!msg.trim()) return;
    const text = msg.trim();
    setBoardError("");
    try {
      let id = `demo-${Date.now()}`;
      if (isLiveProject && activeProjectId) {
        id = await addProjectMessage({ projectId: activeProjectId, text, phaseName: selectedPhase });
      }
      setMsgs((prev) => [...prev, { id, phase: selectedPhase, role: "Homeowner", name: "You", time: "Just now", text, color: OR }]);
      setMsg("");
    } catch (err) {
      setBoardError(err?.message || "Could not save the message.");
    }
  };

  /** Add task to board state and persist to Supabase (id patched in when saved). */
  const createTask = async (name, phase) => {
    const title = String(name || "").trim();
    if (!title) return;
    const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    setBoardError("");
    try {
      let id = `demo-${Date.now()}`;
      if (isLiveProject && activeProjectId) {
        id = await addProjectTask({ projectId: activeProjectId, title, phaseName: phase });
      }
      setTasks((prev) => {
        const next = [...prev, { id, done: false, status: "todo", name: title, phase, date: today, assignee: "You" }];
        setPhaseRows((rows) => derivePhaseProgress(rows, next));
        return next;
      });
    } catch (err) {
      setBoardError(err?.message || "Could not save the task.");
    }
  };

  const toggleTaskDone = async (task) => {
    const nextDone = !task.done;
    setBoardError("");
    try {
      if (isLiveProject) await setProjectTaskDone(task.id, nextDone);
      setTasks((prev) => {
        const next = prev.map((x) => (x.id === task.id ? { ...x, done: nextDone, status: nextDone ? "done" : "todo" } : x));
        setPhaseRows((rows) => derivePhaseProgress(rows, next));
        return next;
      });
    } catch (err) {
      setBoardError(err?.message || "Could not update the task.");
    }
  };

  const changeTaskStatus = async (task, status) => {
    setBoardError("");
    try {
      if (isLiveProject) await setProjectTaskStatus(task.id, status);
      setTasks((prev) => {
        const next = prev.map((row) => row.id === task.id ? { ...row, status, done: status === "done" } : row);
        setPhaseRows((rows) => derivePhaseProgress(rows, next));
        return next;
      });
    } catch (err) {
      setBoardError(err?.message || "Could not update the task status.");
    }
  };

  const renameActiveProject = async () => {
    if (!activeProjectId || !projectTitleDraft.trim()) return;
    setRenamingProject(true);
    setBoardError("");
    try {
      const updated = await updateProjectTitle(activeProjectId, projectTitleDraft);
      setUserProjects((rows) => rows.map((row) => row.id === updated.id ? { ...row, ...updated } : row));
    } catch (err) {
      setBoardError(err?.message || "Could not rename the project.");
    } finally {
      setRenamingProject(false);
    }
  };

  const saveProjectBudget = async ({ amount }) => {
    try {
      const updated = await updateProjectBudget(activeProjectId, amount.replace(/[,₹\s]/g, ""));
      setUserProjects((rows) => rows.map((row) => row.id === updated.id ? { ...row, ...updated } : row));
      setBudgetEditOpen(false);
      setBoardError("");
    } catch (err) {
      setBoardError(err?.message || "Could not update the project budget.");
    }
  };

  const uploadSitePhoto = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !activeProjectId) return;
    const stage = phaseRows.find((row) => row.name === selectedPhase);
    setSiteUploading(true);
    setBoardError("");
    try {
      const saved = await uploadProjectDocument({
        projectId: activeProjectId,
        stageId: stage?.id || null,
        file,
        category: "site_photo",
      });
      setProjectDocuments((rows) => [saved, ...rows]);
    } catch (err) {
      setBoardError(err?.message || "Could not upload the site photo.");
    } finally {
      setSiteUploading(false);
    }
  };

  const removeSitePhoto = async (entry) => {
    if (!entry?.documentId || !activeProjectId) return;
    if (!window.confirm(`Delete ${entry.label || "this site photo"}? This cannot be undone.`)) return;
    setBoardError("");
    try {
      const document = projectDocuments.find((row) => row.id === entry.documentId);
      if (document) await removeProjectDocument(activeProjectId, document);
      setProjectDocuments((rows) => rows.filter((row) => row.id !== entry.documentId));
    } catch (err) {
      setBoardError(err?.message || "Could not delete the site photo.");
    }
  };

  const changeSiteFeedCategory = async (entry, kind) => {
    if (!entry?.documentId || !activeProjectId) return;
    setBoardError("");
    try {
      const updated = await updateProjectDocumentCategory(activeProjectId, entry.documentId, kind);
      setProjectDocuments((rows) => rows.map((row) => row.id === entry.documentId ? { ...row, ...updated, kind } : row));
    } catch (err) {
      setBoardError(err?.message || "Could not update the site feed category.");
    }
  };

  const updateSelectedStageStatus = async (event) => {
    const status = event.target.value;
    const stage = phaseRows.find((row) => row.name === selectedPhase);
    if (!stage?.id || !activeProjectId) return;
    if (status === "done" && stage.pct < 100) {
      setBoardError("Complete every checklist task before marking this stage done.");
      return;
    }
    setBoardError("");
    try {
      await setProjectStageStatus(stage.id, activeProjectId, status);
      const pill = status === "done"
        ? { label: "Done", color: "#22A36B" }
        : status === "blocked"
          ? { label: "Blocked", color: "#DC2626" }
          : status === "in_progress"
            ? { label: "In Progress", color: "#F59E0B" }
            : { label: "Upcoming", color: "#9A8F87" };
      setPhaseRows((rows) => rows.map((row) => row.id === stage.id ? {
        ...row,
        status: pill.label,
        statusColor: pill.color,
        pct: status === "done" ? 100 : row.pct,
      } : row));
    } catch (err) {
      setBoardError(err?.message || "Could not update the stage status.");
    }
  };

  const addTask = () => {
    setTaskDialogOpen(true);
  };

  const submitNewTask = ({ value: name }) => {
    if (!name) return;
    createTask(name, selectedPhase);
    setTaskDialogOpen(false);
  };

  const commitNewTaskForTab = () => {
    if (!newTaskTitle.trim()) return;
    createTask(newTaskTitle, newTaskStage);
    setNewTaskTitle("");
    setTaskAddOpen(false);
  };

  const openVaultForStage = () => {
    const stage = phaseRows.find((row) => row.name === selectedPhase);
    const params = new URLSearchParams(hubQuery.replace(/^\?/, ""));
    if (stage?.id) params.set("stageId", stage.id);
    params.set("stage", selectedPhase);
    navigate(`/documents?${params.toString()}`);
  };

  const addMilestone = () => {
    setMilestoneDialog({
      open: true,
      mode: "add",
      phase: selectedPhase,
      id: null,
      initial: { name: "", date: "" },
    });
  };

  const editMilestoneFromPhase = (phase, id) => {
    const row = (milestonesByPhase[phase] || []).find((x) => x.id === id);
    if (!row) return;
    setMilestoneDialog({
      open: true,
      mode: "edit",
      phase,
      id,
      initial: { name: row.name, date: row.date },
    });
  };

  const submitMilestoneDialog = ({ name, date }) => {
    if (!name) return;
    const targetDate = date || "TBD";
    const { mode, phase, id } = milestoneDialog;
    if (mode === "add") {
      const newId = `m-${Date.now()}`;
      setMilestonesByPhase((prev) => ({
        ...prev,
        [phase]: [...(prev[phase] || []), { id: newId, icon: "📌", name, date: targetDate }],
      }));
    } else if (id) {
      setMilestonesByPhase((prev) => ({
        ...prev,
        [phase]: (prev[phase] || []).map((x) => (x.id === id ? { ...x, name, date: targetDate } : x)),
      }));
    }
    setMilestoneDialog((s) => ({ ...s, open: false }));
  };

  const removeMilestoneFromPhase = (phase, id) => {
    if (!window.confirm("Remove this milestone / reminder?")) return;
    setMilestonesByPhase((prev) => ({
      ...prev,
      [phase]: (prev[phase] || []).filter((x) => x.id !== id),
    }));
  };

  const editMilestone = (id) => editMilestoneFromPhase(selectedPhase, id);
  const removeMilestone = (id) => removeMilestoneFromPhase(selectedPhase, id);

  const budgetModalLineItems =
    budgetDetailScope === "project"
      ? allBudgetLines.map((r) => (
          <div key={`${r.phase}-${r.label}`} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: "1px solid #EDEAE6", fontSize: 13, gap: 12 }}>
            <span style={{ color: "#57534E", minWidth: 0 }}>
              <span style={{ fontWeight: 700, color: OR }}>{r.phase}</span>
              <span style={{ color: "#A8A29E" }}> · </span>
              {r.label}
            </span>
            <span style={{ fontWeight: 700, flexShrink: 0 }}>{r.amt}</span>
          </div>
        ))
      : (stageDetail.budgetLines || []).map(([label, amt]) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: "1px solid #EDEAE6", fontSize: 13 }}>
            <span style={{ color: "#57534E" }}>{label}</span>
            <span style={{ fontWeight: 700 }}>{amt}</span>
          </div>
        ));

  return (
    <div
      className={HM_FIXED_NAV_OFFSET_TAGLINE_CLASS}
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        background: hmProjectHubPageBackground,
        fontFamily: "'DM Sans','Inter',system-ui,sans-serif",
        color: "#1C1917",
      }}
    >
      <LandingNavbar tagline={HM_TAGLINE_PROJECT_HUB} />
      <div
        style={{
          display: "flex",
          flex: 1,
          minWidth: 0,
          minHeight: 0,
        }}
      >
      <aside style={hmProjectSidebarAsideStyle}>
        <div style={{ padding: "14px 20px 6px", fontSize: 10, fontWeight: 700, color: "#9A8F87", letterSpacing: "0.08em" }}>
          YOUR PROJECTS
        </div>
        {(AUTH_UI_ENABLED ? hmSession?.supabaseUserId : true) ? (
          <div style={{ padding: "0 12px 10px" }}>
            {projectsLoading ? (
              <div style={{ fontSize: 11, color: "#9A8F87", padding: "4px 8px" }}>Loading saved projects…</div>
            ) : userProjects.length === 0 ? (
              <div style={{ fontSize: 11, color: "#9A8F87", padding: "4px 8px", lineHeight: 1.45 }}>
                No saved projects yet. Finish a build or remodel flow with v0 — it will appear here.
              </div>
            ) : (
              <select
                aria-label="Select project"
                value={activeProjectId || userProjects[0]?.id || ""}
                onChange={(event) => {
                  const selected = userProjects.find((p) => p.id === event.target.value);
                  if (selected) openProject(selected);
                }}
                style={{ width: "100%", boxSizing: "border-box", padding: "10px 9px", borderRadius: 8, border: `1.5px solid ${OR}`, background: "#FDF4EF", color: "#1C1917", fontFamily: "inherit", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
              >
                {userProjects.map((p, index) => <option key={p.id} value={p.id}>{projectDisplayName(p, index, userProjects)}</option>)}
              </select>
            )}
          </div>
        ) : (
          <div
            style={{
              margin: "0 12px 12px",
              padding: "10px 12px",
              borderRadius: 10,
              background: "linear-gradient(135deg, #FFF7ED, #FBE5D4)",
              border: "1px solid #F0DCC8",
              fontSize: 11,
              color: "#57534E",
              lineHeight: 1.45,
            }}
          >
            <div style={{ fontWeight: 800, color: "#9A3412", marginBottom: 4 }}>Save your projects</div>
            {localDraftProjects.length > 0 ? (
              <div style={{ marginBottom: 6 }}>
                {localDraftProjects.length} draft{localDraftProjects.length === 1 ? "" : "s"} on this device — sign in to
                sync everywhere.
              </div>
            ) : (
              <div style={{ marginBottom: 6 }}>Sign in with email to keep v0 packs & briefs in your account.</div>
            )}
            <button
              type="button"
              onClick={() => navigate(signInRedirectPath)}
              style={{
                width: "100%",
                background: OR,
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "8px 0",
                fontWeight: 700,
                fontSize: 11,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Sign in
            </button>
          </div>
        )}
        <div style={{ padding: "8px 20px 6px", fontSize: 10, fontWeight: 700, color: "#9A8F87", letterSpacing: "0.08em" }}>
          HUB
        </div>
        <nav style={hmProjectSidebarNavScrollStyle}>
          {NAV.map((n) => {
            const key = navId(n);
            const active = activeNav === key;
            return (
              <div
                key={key}
                role="button"
                tabIndex={0}
                onClick={() => (n.path ? navigate(`${n.path}${hubQuery}`) : setActiveNav(key))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    if (n.path) navigate(`${n.path}${hubQuery}`);
                    else setActiveNav(key);
                  }
                }}
                style={hmProjectSidebarNavItemStyle(active)}
              >
                <n.Icon size={16} strokeWidth={active ? 2.1 : 1.8} style={{ flexShrink: 0, color: active ? OR : "#8A7F75" }} aria-hidden />
                {n.label}
                {key === "Bids" && newBidCount > 0 ? (
                  <span
                    aria-label={`${newBidCount} new bids`}
                    style={{
                      marginLeft: "auto",
                      background: OR,
                      color: "#fff",
                      borderRadius: 999,
                      padding: "1px 7px",
                      fontSize: 10,
                      fontWeight: 800,
                    }}
                  >
                    {newBidCount}
                  </span>
                ) : null}
              </div>
            );
          })}
        </nav>
      </aside>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {postedMissingProject && (
          <div
            className="px-5 md:px-10"
            style={{
              background: "#FEF2F2",
              borderBottom: "1px solid #FECACA",
              paddingTop: 12,
              paddingBottom: 12,
              fontSize: 13,
              color: "#991B1B",
              lineHeight: 1.5,
            }}
          >
            <strong>Project not saved yet.</strong> Complete the wizard and post again — or pick a saved project from
            the left.
          </div>
        )}
        {isSignedIn && hmSession?.name && !needsSignIn && (
          <div
            className="px-5 md:px-10"
            style={{
              background: "linear-gradient(90deg, #FFF7ED, #FFFBF7)",
              borderBottom: "1px solid #F0DCC8",
              paddingTop: 10,
              paddingBottom: 10,
              fontSize: 13,
              color: "#57534E",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <span>
              Welcome back, <strong style={{ color: "#1C1917" }}>{hmSession.name.split(/\s+/)[0]}</strong>
              {userProjects.length > 0
                ? ` — ${userProjects.length} saved project${userProjects.length === 1 ? "" : "s"} in your account.`
                : " — finish a build or remodel flow to save your first project."}
            </span>
          </div>
        )}
        {showPostedBanner && (
          <div
            className="px-5 md:px-10"
            style={{
              background: "linear-gradient(90deg, #ECFDF5, #F8FAF5)",
              borderBottom: "1px solid #A7F3D0",
              paddingTop: 12,
              paddingBottom: 12,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ fontSize: 13, color: "#065F46", lineHeight: 1.5, maxWidth: 720 }}>
              <strong>Project posted.</strong>{" "}
              {briefHasOwnPros
                ? "You chose to bring your own team — invite architects and contractors under Team. Switch to trade RFQs any time under Hire."
                : hireMode === "gc"
                  ? "Contractors can now bid on the whole brief. Compare those bids here, or add trade packages if you want electricians and plumbers to quote separately."
                  : hireMode === "design_first"
                    ? "Post a design RFQ from Hire so architects price drawings before anyone quotes construction."
                    : "Your next step is Hire: pick the trades (electrical, plumbing, carpentry, civil, materials) and go live so matching professionals can bid the same checklist."}
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
              {!briefHasOwnPros ? (
                <button
                  type="button"
                  onClick={() => setActiveNav("Bids")}
                  style={{
                    background: OR,
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    padding: "6px 14px",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {hireMode === "gc" ? "Review contractor bids" : "Set up RFQs"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate(`/team${hubQuery}`)}
                  style={{
                    background: OR,
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    padding: "6px 14px",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Invite your team
                </button>
              )}
            <button
              type="button"
              onClick={() => {
                setDismissPostedBanner(true);
                const p = new URLSearchParams(searchParams);
                p.delete("source");
                p.delete("phase");
                setSearchParams(p, { replace: true });
              }}
              style={{
                background: "rgba(255,255,255,0.9)",
                border: "1px solid #6EE7B7",
                borderRadius: 8,
                padding: "6px 12px",
                fontSize: 12,
                fontWeight: 600,
                color: "#047857",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              Dismiss
            </button>
            </div>
          </div>
        )}

        <div className="px-5 md:px-10" style={{ flex: 1, paddingTop: 20, paddingBottom: 32, overflowY: "auto" }}>
          {needsSignIn ? (
            <div style={{ ...panel, padding: 32, maxWidth: 520, margin: "48px auto", textAlign: "center" }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, margin: "0 auto 14px", display: "flex", alignItems: "center", justifyContent: "center", background: "#FDF4EF", border: "1px solid #F3DCCB", color: OR }} aria-hidden>
                <FolderOpen size={22} strokeWidth={1.8} />
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 10, letterSpacing: "-0.01em" }}>Sign in to open your project hub</div>
              <p style={{ fontSize: 14, color: "#57534E", lineHeight: 1.6, margin: "0 0 12px" }}>
                Saved builds, AI v0 designs, and estimates stay in your account. We only show projects linked to your sign-in.
              </p>
              {localDraftProjects.length > 0 ? (
                <p style={{ fontSize: 13, color: "#9A3412", fontWeight: 600, margin: "0 0 18px" }}>
                  {localDraftProjects.length} project draft{localDraftProjects.length === 1 ? "" : "s"} on this device
                  will sync when you sign in.
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => navigate(signInRedirectPath)}
                style={{
                  background: OR,
                  color: "#fff",
                  border: "none",
                  borderRadius: 10,
                  padding: "12px 24px",
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: "pointer",
                  marginRight: 10,
                  marginBottom: 8,
                }}
              >
                Sign in with email
              </button>
              <button
                type="button"
                onClick={() => navigate("/build")}
                style={{
                  background: "#fff",
                  color: OR,
                  border: `1.5px solid ${OR}`,
                  borderRadius: 10,
                  padding: "11px 18px",
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: "pointer",
                  display: "block",
                  margin: "0 auto",
                }}
              >
                Start a build (no account)
              </button>
            </div>
          ) : null}
          {!needsSignIn && needsProjectPick ? (
            <div style={{ ...panel, padding: 32, maxWidth: 560, margin: "32px auto", textAlign: "center" }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, margin: "0 auto 14px", display: "flex", alignItems: "center", justifyContent: "center", background: "#FDF4EF", border: "1px solid #F3DCCB", color: OR }} aria-hidden>
                <LayoutGrid size={22} strokeWidth={1.8} />
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, letterSpacing: "-0.01em" }}>Select a project</div>
              <p style={{ fontSize: 14, color: "#57534E", lineHeight: 1.6, margin: "0 0 20px" }}>
                {userProjects.length > 0
                  ? "Choose a saved project in the sidebar, or start a new home or remodel flow."
                  : "Complete a build or remodel wizard with AI v0 — your project lands here. Or start fresh below."}
              </p>
              {userProjects.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20, textAlign: "left" }}>
                  {userProjects.slice(0, 4).map((p, index) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => openProject(p)}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "12px 14px",
                        borderRadius: 10,
                        border: `1.5px solid ${OR}`,
                        background: "#FDF4EF",
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: 14, color: "#1C1917" }}>{projectDisplayName(p, index, userProjects)}</div>
                      <div style={{ fontSize: 12, color: "#78716C", marginTop: 2 }}>{flowSourceLabel(p.flow_type, p.source)}</div>
                    </button>
                  ))}
                </div>
              ) : null}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
                <button
                  type="button"
                  onClick={() => navigate("/build/new-home")}
                  style={{
                    background: OR,
                    color: "#fff",
                    border: "none",
                    borderRadius: 10,
                    padding: "12px 22px",
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: "pointer",
                  }}
                >
                  Start a build
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/build/remodel")}
                  style={{
                    background: "#fff",
                    color: OR,
                    border: `1.5px solid ${OR}`,
                    borderRadius: 10,
                    padding: "11px 20px",
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: "pointer",
                  }}
                >
                  Remodel a room
                </button>
              </div>
            </div>
          ) : null}
          {hubReady && activeNav === "Overview" && (
          <>
          <div className="px-5 md:px-10">
            {isLiveProject ? (
              <div style={{ marginBottom: 18, paddingTop: 4 }}>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8A7F75", marginBottom: 6 }}>
                  {flowSourceLabel(activeProjectMeta?.flow_type, activeProjectMeta?.source)}
                  {activeProjectMeta?.location ? ` · ${activeProjectMeta.location}` : ""}
                  {activeProjectMeta?.budget_max ? ` · ${formatInrShort(activeProjectMeta.budget_max)} budget` : ""}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <input
                    id="project-title"
                    aria-label="Project name"
                    value={projectTitleDraft}
                    onChange={(event) => setProjectTitleDraft(event.target.value.slice(0, 120))}
                    onKeyDown={(event) => event.key === "Enter" && renameActiveProject()}
                    placeholder="Untitled project"
                    style={{
                      flex: "1 1 320px",
                      minWidth: 0,
                      border: "1px solid transparent",
                      borderBottom: "1px solid #E5E2DD",
                      borderRadius: 0,
                      background: "transparent",
                      padding: "2px 0 6px",
                      fontSize: 26,
                      fontWeight: 600,
                      letterSpacing: "-0.015em",
                      lineHeight: 1.2,
                      color: "#1C1917",
                      fontFamily: "inherit",
                      outline: "none",
                    }}
                  />
                  {projectTitleDraft.trim() && projectTitleDraft.trim() !== activeProjectMeta?.title ? (
                    <button
                      type="button"
                      onClick={renameActiveProject}
                      disabled={renamingProject}
                      style={{ border: 0, borderRadius: 8, background: "#1C1917", color: "#fff", padding: "9px 14px", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit", opacity: renamingProject ? 0.6 : 1 }}
                    >
                      {renamingProject ? "Saving…" : "Save name"}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
            <HmMorningBriefing
              context={assistantContext}
              pendingTasks={pendingTasks}
              onNavigatePath={(path) => navigate(path)}
            />
            {isLiveProject && !briefHasOwnPros && bids.length ? (
              <button
                type="button"
                onClick={() => setActiveNav("Bids")}
                style={{
                  ...panel,
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                  marginBottom: 14,
                  padding: "14px 18px",
                  border: `1px solid ${acceptedBid ? "#A7F3D0" : "#F0DCC8"}`,
                  textAlign: "left",
                  cursor: "pointer",
                  font: "inherit",
                }}
              >
                <span style={{ fontSize: 13.5, color: "#57534E", lineHeight: 1.5 }}>
                  {acceptedBid
                    ? `You accepted ${acceptedBid.pro_name}'s bid of ${formatInrShort(acceptedBid.bid_amount_inr)}.`
                    : `${bids.length} professional ${bids.length === 1 ? "bid" : "bids"} on this project${newBidCount ? ` — ${newBidCount} still need a decision.` : "."}`}
                </span>
                <span style={{ color: OR, fontSize: 12, fontWeight: 800, flexShrink: 0 }}>Open bids →</span>
              </button>
            ) : null}
            {isLiveProject && !briefHasOwnPros && showPostedBanner ? (
              <div style={{ marginBottom: 14 }}>
                <ProjectProMatches
                  projectId={activeProjectId}
                  brief={briefData || {}}
                  onNavigatePath={(path) => navigate(path)}
                />
              </div>
            ) : null}
            <HmCommandCenter />
            {isLiveProject ? (
              <HmProjectIntelligence
                context={assistantContext}
                brief={briefData || {}}
                materials={materialItems}
                actions={agentActions}
                documents={projectDocuments}
                payments={payments}
                configured={intelligenceConfigured}
                onDecision={decideAgentAction}
                onOpenMaterials={() => setActiveNav("Materials")}
                onNavigatePath={(path) => navigate(path)}
              />
            ) : null}
            {boardError ? (
              <div role="alert" style={{ margin: "12px 0", padding: "11px 14px", borderRadius: 10, background: "#FEF3F2", color: "#B42318", fontSize: 13 }}>
                {boardError}
              </div>
            ) : null}
          </div>
          {/* Phase progress — clickable stages */}
          <div style={{ ...panel, padding: "18px 20px 14px", marginBottom: 14 }}>
            <div style={{ display: "flex", gap: 0, flex: 1, overflowX: "auto", paddingBottom: 8 }}>
              {phaseRows.map((p, i) => {
                const sel = selectedPhase === p.name;
                return (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => setSelectedPhase(p.name)}
                    aria-pressed={sel}
                    aria-label={`${p.name}, ${p.pct}% complete`}
                    style={{
                      flex: "1 0 108px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 6,
                      padding: "10px 8px 12px",
                      marginRight: i < 4 ? 10 : 0,
                      paddingRight: i < 4 ? 10 : 0,
                      borderRight: i < 4 ? "1px solid #EDEAE6" : "none",
                      background: sel ? "#FBFAF8" : "transparent",
                      border: sel ? "1px solid #D9D2C8" : "1px solid transparent",
                      borderRadius: 12,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      color: "inherit",
                    }}
                  >
                    <CircleProgress pct={p.pct} color={p.color} />
                    <div style={{ fontWeight: 700, fontSize: 11, textAlign: "center", lineHeight: 1.35, color: "#292524" }}>{p.name}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: p.statusColor }} />
                      <span style={{ fontSize: 10, color: p.statusColor, fontWeight: 600 }}>{p.status}</span>
                    </div>
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", borderTop: "1px solid #EDEAE6", paddingTop: 12, marginTop: 2 }}>
              <button
                type="button"
                onClick={() => setActiveNav("Timeline")}
                style={{
                  background: "#fff",
                  border: "1px solid #D6D3D1",
                  borderRadius: 8,
                  padding: "7px 14px",
                  color: "#1C1917",
                  fontWeight: 600,
                  fontSize: 12,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  fontFamily: "inherit",
                }}
              >
                <CalendarDays size={14} strokeWidth={2} aria-hidden />
                View timeline
              </button>
              {isLiveProject ? (
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#57534E", fontWeight: 700 }}>
                  {selectedPhase} status
                  <select
                    value={phaseRows.find((row) => row.name === selectedPhase)?.status === "Done" ? "done" : phaseRows.find((row) => row.name === selectedPhase)?.status === "Blocked" ? "blocked" : phaseRows.find((row) => row.name === selectedPhase)?.status === "In Progress" ? "in_progress" : "upcoming"}
                    onChange={updateSelectedStageStatus}
                    style={{ border: "1px solid #D4CEC6", borderRadius: 8, background: "#fff", padding: "7px 9px", fontSize: 12 }}
                  >
                    <option value="upcoming">Upcoming</option>
                    <option value="in_progress">In progress</option>
                    <option value="blocked">Blocked</option>
                    <option value="done" disabled={(phaseRows.find((row) => row.name === selectedPhase)?.pct || 0) < 100}>Done — checklist complete</option>
                  </select>
                </label>
              ) : null}
              <span style={{ fontSize: 12, color: "#9A8F87" }}>Stage percentage is calculated from completed checklist tasks.</span>
            </div>
          </div>

          {/* Phase board: (Tasks | Docs 50/50) + Discussion below | Site + budget (right rail) */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) minmax(280px, 320px)",
              gap: 20,
              marginBottom: 18,
              alignItems: "start",
            }}
            className="project-dash-phase-main"
          >
            <div className="project-dash-main-stack" style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
              <div className="project-dash-top-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, minWidth: 0 }}>
                <div style={{ ...panel, padding: "22px 24px", display: "flex", flexDirection: "column", minHeight: 320 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexShrink: 0 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 18 }}>Tasks</div>
                      <div style={{ fontSize: 13, color: "#9A8F87", marginTop: 4 }}>Checklist · {selectedPhase}</div>
                    </div>
                    <button type="button" onClick={() => setActiveNav("Tasks")} style={{ background: "none", border: "none", color: OR, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                      View All
                    </button>
                  </div>
                  <div style={{ flex: 1, overflowY: "auto", minHeight: 200, maxHeight: 520, marginRight: -4, paddingRight: 4 }}>
                    {filteredTasks.length === 0 ? (
                      <div style={{ fontSize: 14, color: "#9A8F87", padding: "8px 0 4px" }}>No tasks for this stage yet.</div>
                    ) : null}
                    {filteredTasks.map((t) => (
                      <div key={`${t.phase}-${t.name}-${t.date}`} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 0", borderBottom: "1px solid #EDEAE6" }}>
                        <button
                          type="button"
                          onClick={() => toggleTaskDone(t)}
                          style={{ background: "none", border: "none", cursor: "pointer", padding: 0, flexShrink: 0 }}
                        >
                          {t.done ? (
                            <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#22A36B", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
                              </svg>
                            </div>
                          ) : (
                            <div style={{ width: 26, height: 26, borderRadius: "50%", border: "2px solid #D4CEC6" }} />
                          )}
                        </button>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 16, color: t.done ? "#9A8F87" : "#1C1917", textDecoration: t.done ? "line-through" : "none", lineHeight: 1.35 }}>{t.name}</div>
                          <div style={{ fontSize: 13, color: "#9A8F87", marginTop: 4 }}>{t.assignee}</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#7A6E62", flexShrink: 0 }}>
                          <CalendarDays size={14} strokeWidth={1.9} aria-hidden style={{ color: "#A8A29E" }} />
                          <span>{t.date}</span>
                        </div>
                        <select value={t.status || (t.done ? "done" : "todo")} onChange={(event) => changeTaskStatus(t, event.target.value)} aria-label={`Status for ${t.name}`} style={{ border: "1px solid #D4CEC6", borderRadius: 8, background: "#fff", padding: "7px 8px", fontSize: 12 }}>
                          <option value="todo">To-do</option>
                          <option value="in_progress">In progress</option>
                          <option value="blocked">Blocked</option>
                          <option value="done">Completed</option>
                        </select>
                        <Avatar name={t.assignee} size={32} color={taskAssigneeColor(t.assignee)} />
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={addTask} style={{ background: "none", border: "none", color: OR, fontWeight: 700, fontSize: 15, cursor: "pointer", marginTop: 14, display: "flex", alignItems: "center", gap: 8, padding: 0, flexShrink: 0 }}>
                    <span style={{ fontSize: 22 }}>+</span> Add Task
                  </button>
                </div>

                <div style={{ ...panel, padding: "22px 24px", display: "flex", flexDirection: "column", minHeight: 320, minWidth: 0 }}>
                  <div style={{ flexShrink: 0, marginBottom: 14 }}>
                    <div style={{ fontWeight: 700, fontSize: 18 }}>Docs / media</div>
                    <div style={{ fontSize: 13, color: "#9A8F87", marginTop: 4, lineHeight: 1.45 }}>
                      {isLiveProject ? "Files saved with this project's AI v0 pack." : "Sample files and photos for this stage."}
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14, flexShrink: 0 }}>
                    {(stageDetail.miniGallery || []).slice(0, 2).map((src, idx) => (
                      <div key={idx} style={{ borderRadius: 10, overflow: "hidden", height: 96, background: "#E8E6E3" }}>
                        <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0, marginBottom: 14 }}>
                    {(stageDetail.docs || []).slice(0, 3).map((d) => (
                      <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, border: "1px solid #EDEAE6", background: "#FDFCFB" }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: "#fff", background: d.ext === "PDF" ? "#EF4444" : "#22A36B", padding: "4px 7px", borderRadius: 5 }}>{d.ext}</span>
                        <span style={{ fontSize: 13, fontWeight: 600, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
                      </div>
                    ))}
                    {(stageDetail.docs || []).length > 3 ? <div style={{ fontSize: 12, color: "#9A8F87" }}>+{(stageDetail.docs || []).length - 3} more</div> : null}
                  </div>
                  {!isLiveProject ? (
                    <button type="button" onClick={openVaultForStage} style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `1.5px solid ${OR}`, background: "#fff", color: OR, fontWeight: 700, fontSize: 14, cursor: "pointer", flexShrink: 0, marginBottom: 16 }}>
                      All documents →
                    </button>
                  ) : null}
                  <div style={{ borderTop: "1px solid #EDEAE6", paddingTop: 14, flex: 1, minHeight: 140, display: "flex", flexDirection: "column" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexShrink: 0 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 16 }}>Milestones & reminders</div>
                        <div style={{ fontSize: 12, color: "#9A8F87", marginTop: 4 }}>
                          {isLiveProject ? "Saved from this project's estimate" : "Editable for this demo stage"}
                        </div>
                      </div>
                      {!isLiveProject ? (
                        <button type="button" onClick={addMilestone} style={{ background: "none", border: "none", color: OR, fontWeight: 700, fontSize: 14, cursor: "pointer", padding: "4px 0" }}>
                          + Add
                        </button>
                      ) : null}
                    </div>
                    <div style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
                      {phaseMilestones.length === 0 ? <div style={{ fontSize: 14, color: "#9A8F87" }}>No milestones yet.</div> : null}
                      {phaseMilestones.map((m) => (
                        <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid #F0EBE3" }}>
                          <span style={{ flexShrink: 0, width: 8, height: 8, borderRadius: "50%", background: OR, boxShadow: "0 0 0 3px #FBE5D4" }} aria-hidden />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 15, lineHeight: 1.35 }}>{m.name}</div>
                            <div style={{ fontSize: 13, color: OR, fontWeight: 700, marginTop: 4 }}>{m.date}</div>
                          </div>
                          {!isLiveProject ? (
                            <>
                              <button type="button" onClick={() => editMilestone(m.id)} style={{ border: "none", background: "none", color: "#7A6E62", cursor: "pointer", fontSize: 13, fontWeight: 600, flexShrink: 0 }}>
                                Edit
                              </button>
                              <button type="button" onClick={() => removeMilestone(m.id)} style={{ border: "none", background: "none", color: "#B91C1C", cursor: "pointer", flexShrink: 0, display: "inline-flex", padding: 4 }} aria-label="Remove">
                                <X size={14} strokeWidth={2.2} aria-hidden />
                              </button>
                            </>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ ...panel, padding: "22px 24px", display: "flex", flexDirection: "column", minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexShrink: 0 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 18 }}>Discussion</div>
                    <div style={{ fontSize: 13, color: "#9A8F87", marginTop: 4 }}>{selectedPhase} thread</div>
                  </div>
                  <button type="button" style={{ background: "none", border: "none", color: OR, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                    New Message
                  </button>
                </div>
                <div style={{ maxHeight: 380, overflowY: "auto", marginBottom: 16, minHeight: 120 }}>
                  {filteredMsgs.length === 0 ? <div style={{ fontSize: 14, color: "#9A8F87" }}>No messages in this stage yet. Say hello below.</div> : null}
                  {filteredMsgs.map((m, i) => (
                    <div key={`${m.time}-${m.name}-${i}`} style={{ display: "flex", gap: 12, marginBottom: 18 }}>
                      <Avatar name={m.name} size={38} color={m.color} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 700, fontSize: 15 }}>{m.role}</span>
                          <span style={{ fontSize: 13, color: "#9A8F87" }}>({m.name})</span>
                          <span style={{ fontSize: 12, color: "#9A8F87", marginLeft: "auto" }}>{m.time}</span>
                        </div>
                        <div style={{ fontSize: 15, color: "#3D3530", lineHeight: 1.55, background: "#F3F1EE", borderRadius: "0 12px 12px 12px", padding: "12px 16px", border: "1px solid #EDEAE6" }}>{m.text}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, border: "1px solid #D4CEC6", borderRadius: 12, padding: "12px 16px", background: "#FDFCFB" }}>
                  <input
                    value={msg}
                    onChange={(e) => setMsg(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendMsg()}
                    placeholder="Message this stage…"
                    style={{ flex: 1, border: "none", outline: "none", fontSize: 15, background: "transparent" }}
                  />
                  <button
                    type="button"
                    onClick={sendMsg}
                    style={{ background: OR, border: "none", borderRadius: "50%", width: 36, height: 36, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                    aria-label="Send"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
              <div style={{ ...panel, padding: "18px 20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>Latest site feed</div>
                    <div style={{ fontSize: 12, color: "#9A8F87", marginTop: 4 }}>{selectedPhase}</div>
                  </div>
                  <button type="button" onClick={() => setActiveNav("Site Feed")} style={{ background: "none", border: "none", color: OR, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                    View All
                  </button>
                </div>
                {stageDetail.siteImage ? (
                  <div style={{ borderRadius: 12, overflow: "hidden", position: "relative", marginBottom: 10 }}>
                    <img src={stageDetail.siteImage} alt="" style={{ width: "100%", height: 168, objectFit: "cover", display: "block" }} />
                    <div style={{ position: "absolute", top: 10, left: 10, background: "rgba(28,25,23,0.72)", color: "#fff", fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 20 }}>Latest</div>
                  </div>
                ) : (
                  <div style={{ borderRadius: 12, marginBottom: 10, padding: 18, background: "#F3F1EE", color: "#7A6E62", fontSize: 13 }}>
                    No saved site media yet.
                  </div>
                )}
                <div style={{ fontSize: 12, color: "#9A8F87", marginBottom: 4 }}>{stageDetail.siteTime}</div>
                <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.45 }}>{stageDetail.siteCaption}</div>
              </div>

              <div style={{ ...panel, padding: "18px 20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>Budget pacing</div>
                  <div style={{ width: 11, height: 11, borderRadius: "50%", background: trafficDot(stageDetail.traffic) }} title="Status" />
                </div>
                <div style={{ fontSize: 12, color: "#9A8F87", marginBottom: 10 }}>Total project budget {stageDetail.budgetTotal}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#57534E", marginBottom: 6 }}>Spent this stage</div>
                <div style={{ fontWeight: 800, fontSize: 24, color: OR, marginBottom: 12 }}>{stageDetail.budgetSpent}</div>
                <div style={{ height: 9, background: "#E8E6E3", borderRadius: 5, marginBottom: 12, overflow: "hidden" }}>
                  <div style={{ width: `${stageDetail.barPct}%`, height: "100%", background: `linear-gradient(90deg,#22A36B,${OR})`, borderRadius: 5 }} />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setBudgetDetailScope("stage");
                    setBudgetDetailOpen(true);
                  }}
                  style={{ width: "100%", background: "none", border: "none", color: OR, fontWeight: 700, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}
                >
                  View Budget Details →
                </button>
              </div>
            </div>
          </div>

          </>
          )}

          {hubReady && activeNav === "Bids" && (
            isLiveProject ? (
              <WorkPackagesHub
                projectId={activeProjectId}
                project={activeProjectMeta}
                brief={briefData || {}}
                estimate={v0Pack?.estimate || null}
                documents={projectDocuments}
                selectedPackageId={selectedWorkPackageId}
                onSelectPackage={selectWorkPackage}
                onNavigatePath={(path) => navigate(path)}
                hireMode={hireMode}
                onHireModeChange={async (next) => {
                  const result = await updateProjectHireMode(activeProjectId, next);
                  setBriefData((current) => ({ ...(current || {}), ...(result.brief || {}) }));
                }}
                onChanged={({ bids: packageBids }) => setWorkPackageNewBids(
                  packageBids.filter((bid) => bid.status === "submitted" && (bid.homeowner_decision || "pending") === "pending").length,
                )}
                footerSlot={
                  postsWholeProjectLeads(hireMode) || bids.length ? (
                  <div style={{ marginTop: 28, paddingTop: 22, borderTop: "1px solid #E6E1DA" }}>
                    <ProjectBidsPanel
                      bids={bids}
                      configured={bidsConfigured}
                      loading={bidsLoading}
                      budgetMax={activeProjectMeta?.budget_max || briefData?.budgetInr}
                      onDecision={decideBid}
                      onNavigatePath={(path) => navigate(path)}
                      onFindPros={() => navigate(browseQuotesUrl({ projectId: activeProjectId, city: briefData?.city }))}
                      matchesSlot={
                        <div style={{ marginTop: 22 }}>
                          <ProjectProMatches
                            projectId={activeProjectId}
                            brief={briefData || {}}
                            onNavigatePath={(path) => navigate(path)}
                            compact={bids.length > 0}
                          />
                        </div>
                      }
                    />
                  </div>
                  ) : null
                }
              />
            ) : (
              <ProjectBidsPanel
                bids={bids}
                configured={bidsConfigured}
                loading={bidsLoading}
                budgetMax={activeProjectMeta?.budget_max || briefData?.budgetInr}
                onDecision={decideBid}
                onNavigatePath={(path) => navigate(path)}
                onFindPros={() => navigate(browseQuotesUrl({ projectId: activeProjectId, city: briefData?.city }))}
              />
            )
          )}

          {hubReady && activeNav === "Materials" && (
            <ProjectMaterialsPanel
              projectId={activeProjectId}
              materials={materialItems}
              configured={intelligenceConfigured}
              onSave={saveMaterial}
              onRemove={removeMaterial}
              onNavigateShop={() => navigate(`/project/shop${hubQuery}`)}
            />
          )}

          {hubReady && activeNav === "Timeline" && (
            <div style={{ maxWidth: 800 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 8px" }}>Timeline</h2>
              <p style={{ fontSize: 14, color: "#7A6E62", margin: "0 0 22px", lineHeight: 1.55 }}>
                Set the overall target, stage dates, and task due dates. Progress still comes from completed checklist tasks—not invented calendar dates.
              </p>
              {isLiveProject ? <div style={{ marginBottom: 16 }}><ProjectTimelineEditor project={activeProjectMeta} brief={briefData} phases={phaseRows} onSaveProject={saveProjectSchedule} onSaveStage={saveStageSchedule} /></div> : null}
              <div style={{ ...panel, padding: "22px 24px" }}>
                <div style={{ borderLeft: "3px solid #E8E6E3", marginLeft: 10, paddingLeft: 20 }}>
                  {phaseOrder.map((ph) => (
                    <div key={ph} style={{ marginBottom: 20 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: OR, letterSpacing: "0.06em" }}>{ph}</div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: phaseRows.find((row) => row.name === ph)?.statusColor || "#78716C" }}>{phaseRows.find((row) => row.name === ph)?.status || "Upcoming"} · {phaseRows.find((row) => row.name === ph)?.pct || 0}%</span>
                      </div>
                      {(milestonesByPhase[ph] || []).length === 0 && tasks.filter((task) => task.phase === ph).length === 0 ? (
                        <div style={{ fontSize: 13, color: "#9A8F87" }}>No milestones or scheduled tasks yet.</div>
                      ) : (
                        <>
                        {(milestonesByPhase[ph] || []).map((m) => (
                          <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0 12px 6px", borderBottom: "1px solid #F0EBE3", position: "relative" }}>
                            <div
                              style={{
                                position: "absolute",
                                left: -29,
                                top: 16,
                                width: 11,
                                height: 11,
                                borderRadius: "50%",
                                background: OR,
                                border: "2px solid #fff",
                                boxShadow: "0 0 0 2px #E8E6E3",
                              }}
                              aria-hidden
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 700, fontSize: 15 }}>{m.name}</div>
                              <div style={{ fontSize: 13, color: OR, fontWeight: 700, marginTop: 4 }}>{m.date}</div>
                            </div>
                            {!isLiveProject ? (
                              <>
                                <button type="button" onClick={() => editMilestoneFromPhase(ph, m.id)} style={{ border: "none", background: "none", color: "#7A6E62", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                                  Edit
                                </button>
                                <button type="button" onClick={() => removeMilestoneFromPhase(ph, m.id)} style={{ border: "none", background: "none", color: "#B91C1C", cursor: "pointer", display: "inline-flex", padding: 4 }} aria-label="Remove">
                                  <X size={14} strokeWidth={2.2} aria-hidden />
                                </button>
                              </>
                            ) : null}
                          </div>
                        ))}
                        {tasks.filter((task) => task.phase === ph).map((task) => (
                          <div key={`timeline-${task.id}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0 10px 6px", borderBottom: "1px solid #F0EBE3" }}>
                            <span
                              aria-hidden
                              style={{
                                flexShrink: 0,
                                width: 16,
                                height: 16,
                                borderRadius: "50%",
                                boxSizing: "border-box",
                                border: task.done ? "none" : `2px solid ${task.status === "in_progress" ? "#D97706" : "#D4CEC6"}`,
                                background: task.done ? "#22A36B" : "transparent",
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              {task.done ? (
                                <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
                                  <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
                                </svg>
                              ) : null}
                            </span>
                            <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 14 }}>{task.name}</div><div style={{ fontSize: 12, color: "#78716C", marginTop: 3 }}>{task.date || "No due date"}</div></div>
                            {isLiveProject ? <label style={{ display: "grid", gap: 3, color: "#78716C", fontSize: 9, fontWeight: 700 }}>DUE DATE<input type="date" value={task.dueDate || ""} onChange={(event) => saveTaskDueDate(task, event.target.value)} style={{ border: "1px solid #D4CEC6", borderRadius: 7, padding: "6px 7px", fontSize: 11 }} /></label> : null}
                            <span style={{ fontSize: 11, fontWeight: 700, color: task.done ? "#15803D" : task.status === "in_progress" ? "#B45309" : "#78716C" }}>{task.done ? "Completed" : task.status === "in_progress" ? "In progress" : "To-do"}</span>
                          </div>
                        ))}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {hubReady && activeNav === "Tasks" && (
            <div style={{ maxWidth: 900 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 8px" }}>All tasks</h2>
              <p style={{ fontSize: 14, color: "#7A6E62", margin: "0 0 18px", lineHeight: 1.55 }}>
                One list across every stage. When you add a task, you tag which stage it belongs to — that keeps the list clean without a filter bar.
              </p>
              {taskAddOpen ? (
                <div style={{ ...panel, padding: "18px 20px", marginBottom: 18, border: `1.5px solid ${OR}`, background: "#FFFBF7" }}>
                  <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 12 }}>New task</div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#57534E", marginBottom: 6 }} htmlFor="new-task-title">
                    What needs to be done?
                  </label>
                  <input
                    id="new-task-title"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), commitNewTaskForTab())}
                    placeholder="e.g. Sign off on plumbing mock-up"
                    style={{ width: "100%", boxSizing: "border-box", border: "1.5px solid #D4CEC6", borderRadius: 8, padding: "10px 12px", fontSize: 15, outline: "none" }}
                    autoFocus
                  />
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#57534E", marginTop: 14, marginBottom: 6 }} htmlFor="new-task-stage">
                    Stage
                  </label>
                  <select
                    id="new-task-stage"
                    value={newTaskStage}
                    onChange={(e) => setNewTaskStage(e.target.value)}
                    style={{ width: "100%", maxWidth: 360, border: "1.5px solid #D4CEC6", borderRadius: 8, padding: "10px 12px", fontSize: 14, background: "#fff" }}
                    aria-label="Stage for this task"
                  >
                    {phaseOrder.map((ph) => (
                      <option key={ph} value={ph}>
                        {ph}
                      </option>
                    ))}
                  </select>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
                    <button
                      type="button"
                      onClick={commitNewTaskForTab}
                      style={{ padding: "10px 18px", borderRadius: 8, border: "none", background: OR, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
                    >
                      Add task
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTaskAddOpen(false);
                        setNewTaskTitle("");
                      }}
                      style={{ padding: "10px 18px", borderRadius: 8, border: "1.5px solid #D4CEC6", background: "#fff", fontWeight: 600, fontSize: 14, cursor: "pointer", color: "#57534E" }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
              <div style={{ ...panel, padding: "22px 24px" }}>
                {allTasksSorted.length === 0 ? (
                  <div style={{ fontSize: 14, color: "#9A8F87" }}>No tasks yet — add your first one below.</div>
                ) : (
                  allTasksSorted.map((t) => (
                    <div key={`${t.phase}-${t.name}-${t.date}`} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 0", borderBottom: "1px solid #EDEAE6" }}>
                      <button
                        type="button"
                        onClick={() => toggleTaskDone(t)}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, flexShrink: 0 }}
                      >
                        {t.done ? (
                          <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#22A36B", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                              <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
                            </svg>
                          </div>
                        ) : (
                          <div style={{ width: 26, height: 26, borderRadius: "50%", border: "2px solid #D4CEC6" }} />
                        )}
                      </button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 15, color: t.done ? "#9A8F87" : "#1C1917", textDecoration: t.done ? "line-through" : "none", lineHeight: 1.35 }}>{t.name}</div>
                        <div style={{ fontSize: 12, color: "#9A8F87", marginTop: 4 }}>
                          <span style={{ fontWeight: 700, color: OR }}>{t.phase}</span>
                          {" · "}
                          {t.assignee}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#7A6E62", flexShrink: 0 }}>
                        <CalendarDays size={14} strokeWidth={1.9} aria-hidden style={{ color: "#A8A29E" }} />
                        <span>{t.date}</span>
                      </div>
                      <select value={t.status || (t.done ? "done" : "todo")} onChange={(event) => changeTaskStatus(t, event.target.value)} aria-label={`Status for ${t.name}`} style={{ border: "1px solid #D4CEC6", borderRadius: 8, background: "#fff", padding: "7px 8px", fontSize: 12 }}>
                        <option value="todo">To-do</option>
                        <option value="in_progress">In progress</option>
                        <option value="blocked">Blocked</option>
                        <option value="done">Completed</option>
                      </select>
                      <Avatar name={t.assignee} size={32} color={taskAssigneeColor(t.assignee)} />
                    </div>
                  ))
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (taskAddOpen) return;
                    setNewTaskStage(selectedPhase);
                    setNewTaskTitle("");
                    setTaskAddOpen(true);
                  }}
                  style={{ background: "none", border: "none", color: OR, fontWeight: 700, fontSize: 15, cursor: "pointer", marginTop: 16, display: "flex", alignItems: "center", gap: 8, padding: 0 }}
                >
                  <span style={{ fontSize: 22 }}>+</span> Add task
                </button>
              </div>
            </div>
          )}

          {hubReady && activeNav === "Budget" && (
            <div style={{ maxWidth: 820 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 8px" }}>Budget</h2>
              <p style={{ fontSize: 14, color: "#7A6E62", margin: "0 0 22px", lineHeight: 1.55 }}>
                Total budget, spend pacing, and how much has left your own accounts versus the bank loan tranche - planning estimates until ledger integrations are live.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16, marginBottom: 18 }}>
                <div style={{ ...panel, padding: "18px 20px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#9A8F87", letterSpacing: "0.06em" }}>TOTAL BUDGET</div>
                    {isLiveProject ? <button type="button" onClick={() => setBudgetEditOpen(true)} style={{ border: 0, background: "none", color: OR, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 }}>Edit budget</button> : null}
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 800, marginTop: 8 }}>{fundingSnapshot.totalBudget}</div>
                  <div style={{ fontSize: 13, color: "#7A6E62", marginTop: 6 }}>Spent to date: {fundingSnapshot.spentToDate}</div>
                  <div style={{ height: 10, background: "#E8E6E3", borderRadius: 6, marginTop: 14, overflow: "hidden" }}>
                    <div style={{ width: `${fundingSnapshot.pctOfTotalSpent}%`, height: "100%", background: `linear-gradient(90deg,#22A36B,${OR})`, borderRadius: 6 }} />
                  </div>
                  <div style={{ fontSize: 12, color: "#9A8F87", marginTop: 6 }}>
                    {isLiveProject ? `${fundingSnapshot.pctOfTotalSpent}% of total budget paid from ${payments.length} ledger entr${payments.length === 1 ? "y" : "ies"}` : `${fundingSnapshot.pctOfTotalSpent}% of total budget used (illustrative)`}
                  </div>
                </div>
                <div style={{ ...panel, padding: "18px 20px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#9A8F87", letterSpacing: "0.06em" }}>PACING</div>
                  <div style={{ fontSize: 15, fontWeight: 700, marginTop: 10 }}>Planned burn {fundingSnapshot.monthlyBurnPlanned}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, marginTop: 6, color: OR }}>Actual {fundingSnapshot.monthlyBurnActual}</div>
                  <p style={{ fontSize: 13, color: "#57534E", margin: "14px 0 0", lineHeight: 1.5 }}>{fundingSnapshot.runwayNote}</p>
                </div>
              </div>
              {!isLiveProject ? (
              <div style={{ ...panel, padding: "22px 24px", marginBottom: 18 }}>
                <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6 }}>Funding mix &amp; sources</div>
                <p style={{ fontSize: 13, color: "#7A6E62", margin: "0 0 18px", lineHeight: 1.5 }}>
                  Budget was split between your own equity and a sanctioned home loan. Below is how much has actually been paid from each bucket (vendor advances, site cheques, etc.).
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
                  <div style={{ background: "#F8F4EF", border: "1px solid #E2D9CF", borderRadius: 12, padding: "16px 18px" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#57534E" }}>Sanctioned — own funds</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "#1C1917", marginTop: 6 }}>{fundingSnapshot.ownEquityBudgeted}</div>
                    <div style={{ fontSize: 12, color: "#7A6E62", marginTop: 4 }}>Paid from your accounts</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: OR, marginTop: 8 }}>{fundingSnapshot.spentFromOwnPocket}</div>
                  </div>
                  <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 12, padding: "16px 18px" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#57534E" }}>Sanctioned — bank loan</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "#1C1917", marginTop: 6 }}>{fundingSnapshot.bankLoanSanctioned}</div>
                    <div style={{ fontSize: 12, color: "#7A6E62", marginTop: 4 }}>Disbursed to site / vendors</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "#2563EB", marginTop: 8 }}>{fundingSnapshot.spentFromLoanDisbursements}</div>
                    <div style={{ fontSize: 11, color: "#64748B", marginTop: 8 }}>Tranches released: {fundingSnapshot.loanTrancheReleasedPct}% of loan limit (planned)</div>
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#44403C", marginBottom: 8 }}>Spend this far — by source</div>
                <div style={{ height: 14, borderRadius: 8, overflow: "hidden", display: "flex", marginBottom: 8 }}>
                  <div
                    title="From own pocket"
                    style={{ width: "33%", background: OR, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "#fff" }}
                  >
                    Own
                  </div>
                  <div
                    title="From loan disbursements"
                    style={{ flex: 1, background: "#2563EB", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "#fff" }}
                  >
                    Loan
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "#9A8F87" }}>Illustrative split of {fundingSnapshot.spentToDate} — not tax advice.</div>
                <button
                  type="button"
                  onClick={() => {
                    setBudgetDetailScope("project");
                    setBudgetDetailOpen(true);
                  }}
                  style={{ marginTop: 18, padding: "12px 18px", borderRadius: 10, border: `1.5px solid ${OR}`, background: "#fff", color: OR, fontWeight: 700, fontSize: 14, cursor: "pointer" }}
                >
                  View all line items (every stage) →
                </button>
              </div>
              ) : (
                <div style={{ ...panel, padding: "22px 24px", marginBottom: 18 }}>
                  <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6 }}>Recorded payments</div>
                  <p style={{ fontSize: 13, color: "#7A6E62", margin: 0, lineHeight: 1.5 }}>
                    {payments.length ? `${payments.length} persistent ledger entr${payments.length === 1 ? "y" : "ies"} are included in the spend totals above.` : "No owner payments, loan disbursements, or vendor transactions have been recorded for this project."}
                  </p>
                  <button type="button" onClick={() => navigate(`/project/payments${hubQuery}`)} style={{ marginTop: 14, border: 0, borderRadius: 9, background: OR, color: "#fff", padding: "10px 15px", fontWeight: 700, cursor: "pointer" }}>{payments.length ? "Edit spending & receipts" : "Add spending"}</button>
                </div>
              )}
            </div>
          )}

          {hubReady && activeNav === "Site Feed" && (
            <div style={{ maxWidth: 900 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <h2 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 8px" }}>Site feed</h2>
                {isLiveProject ? <><input ref={sitePhotoPickerRef} type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={uploadSitePhoto} /><button type="button" disabled={siteUploading} onClick={() => sitePhotoPickerRef.current?.click()} style={{ border: 0, borderRadius: 9, background: OR, color: "#fff", padding: "9px 14px", fontWeight: 700, cursor: "pointer" }}>{siteUploading ? "Uploading…" : "Upload site update"}</button></> : null}
              </div>
              <p style={{ fontSize: 14, color: "#7A6E62", margin: "0 0 22px", lineHeight: 1.55 }}>
                Latest site photos and notes from each stage, newest updates first within this project.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14 }}>
                {siteFeedEntries.length === 0 ? (
                  <div style={{ ...panel, padding: "20px 22px", color: "#7A6E62", fontSize: 14, gridColumn: "1 / -1" }}>
                    No saved site photos or concept images yet.
                  </div>
                ) : null}
                {[...siteFeedEntries].reverse().map((entry, index) => (
                  <div key={`${entry.phase}-${entry.caption}-${index}`} style={{ ...panel, padding: 8, overflow: "hidden" }} className="project-site-feed-card">
                    <button type="button" onClick={() => setSelectedSiteFeedEntry(entry)} aria-label={`Preview ${entry.caption}`} style={{ position: "relative", display: "block", width: "100%", aspectRatio: "1 / 1", padding: 0, border: 0, borderRadius: 10, overflow: "hidden", background: "#E8E6E3", cursor: "zoom-in" }}>
                      <img src={entry.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                      <div style={{ position: "absolute", inset: "auto 0 0", padding: "28px 10px 9px", background: "linear-gradient(transparent, rgba(28,25,23,.78))", color: "#fff", textAlign: "left" }}><div style={{ fontSize: 11, fontWeight: 800 }}>{entry.phase}</div><div style={{ fontSize: 11, opacity: .86, marginTop: 2 }}>{entry.time}</div></div>
                    </button>
                    <div style={{ padding: "8px 4px 3px" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, color: "#78716C", fontSize: 11 }}><span>{entry.time}</span><span>{entry.documentId ? siteFeedCategoryLabel(entry.category) : "Concept"}</span></div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 7 }}>
                        {entry.documentId ? <select value={entry.category || "site_photo"} onChange={(event) => changeSiteFeedCategory(entry, event.target.value)} aria-label={`Category for ${entry.caption}`} style={{ minWidth: 0, flex: 1, padding: "5px 6px", border: "1px solid #D7CEC5", borderRadius: 7, background: "#fff", fontSize: 11 }}><option value="site_photo">Progress photo</option>{SITE_FEED_CATEGORIES.slice(1).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select> : null}
                        <button type="button" onClick={() => { setSelectedPhase(entry.phase); setActiveNav("Overview"); }} style={{ marginLeft: "auto", background: "none", border: "none", color: OR, fontWeight: 700, fontSize: 11, cursor: "pointer", padding: 0 }}>Stage →</button>
                        {entry.documentId ? <button type="button" onClick={() => removeSitePhoto(entry)} style={{ background: "none", border: "none", color: "#B42318", fontWeight: 700, fontSize: 11, cursor: "pointer", padding: 0 }}>Delete</button> : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {hubReady && activeNav === "Settings" && (
            <div style={{ maxWidth: 720 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 8px" }}>Settings</h2>
              <p style={{ fontSize: 14, color: "#7A6E62", margin: "0 0 22px", lineHeight: 1.55 }}>
                Project preferences and profile controls.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ ...panel, padding: "18px 20px" }}>
                  <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 8 }}>Project profile</div>
                  <div style={{ fontSize: 13, color: "#57534E", lineHeight: 1.55 }}>The project name can be changed from Overview and is saved immediately to your Supabase project. Location and project type continue to come from the saved brief.</div>
                </div>
                <div style={{ ...panel, padding: "18px 20px" }}>
                  <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 8 }}>Notifications</div>
                  <div style={{ fontSize: 13, color: "#57534E", lineHeight: 1.55 }}>Email &amp; WhatsApp for milestones, site uploads, and payment reminders — toggles coming soon.</div>
                </div>
                <div style={{ ...panel, padding: "18px 20px" }}>
                  <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 8 }}>Data &amp; exports</div>
                  <div style={{ fontSize: 13, color: "#57534E", lineHeight: 1.55 }}>Download a ZIP of documents and a CSV of tasks for your own records.</div>
                </div>
              </div>
            </div>
          )}

          {budgetDetailOpen ? (
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="budget-detail-title"
              onClick={() => setBudgetDetailOpen(false)}
              style={{ position: "fixed", inset: 0, background: "rgba(28,25,23,0.45)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{ background: "#FDFCFB", borderRadius: 14, maxWidth: 440, width: "100%", padding: "22px 24px", border: "1px solid #E8E6E3", boxShadow: "0 12px 40px rgba(0,0,0,0.12)" }}
              >
                <div id="budget-detail-title" style={{ fontWeight: 800, fontSize: 17, marginBottom: 6 }}>
                  {budgetDetailScope === "project" ? "Budget — all stages" : `Budget — ${selectedPhase}`}
                </div>
                <div style={{ fontSize: 12, color: "#7A6E62", marginBottom: 16 }}>
                  {budgetDetailScope === "project"
                    ? "Planning line items rolled up from every stage. Live ledger sync can replace these estimates."
                    : "Planning breakdown for this stage. Live ledger sync can replace these estimates."}
                </div>
                {budgetModalLineItems}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0 8px", marginTop: 4, fontSize: 14, fontWeight: 800 }}>
                  <span>{budgetDetailScope === "project" ? "Illustrative project spend" : "Stage spend (illustrative)"}</span>
                  <span style={{ color: OR }}>{budgetDetailScope === "project" ? fundingSnapshot.spentToDate : stageDetail.budgetSpent}</span>
                </div>
                <button type="button" onClick={() => setBudgetDetailOpen(false)} style={{ marginTop: 12, width: "100%", padding: "10px", borderRadius: 8, border: "none", background: OR, color: "#fff", fontWeight: 700, cursor: "pointer" }}>
                  Close
                </button>
              </div>
            </div>
          ) : null}
          {selectedSiteFeedEntry ? (
            <div role="dialog" aria-modal="true" aria-label="Site feed preview" onClick={() => setSelectedSiteFeedEntry(null)} style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(28,25,23,.78)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
              <div onClick={(event) => event.stopPropagation()} style={{ width: "min(980px, 94vw)", maxHeight: "92vh", background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,.32)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 16px", borderBottom: "1px solid #E8E4DE" }}><div><strong>{selectedSiteFeedEntry.phase}</strong><div style={{ color: "#78716C", fontSize: 12, marginTop: 2 }}>{selectedSiteFeedEntry.time}{selectedSiteFeedEntry.documentId ? ` · ${siteFeedCategoryLabel(selectedSiteFeedEntry.category)}` : " · Concept"}</div></div><button type="button" onClick={() => setSelectedSiteFeedEntry(null)} style={{ border: 0, background: "#F5F1EC", borderRadius: 8, padding: "7px 11px", fontWeight: 700, cursor: "pointer" }}>Close</button></div>
                <div style={{ background: "#1C1917", display: "flex", justifyContent: "center", alignItems: "center", maxHeight: "calc(92vh - 72px)" }}><img src={selectedSiteFeedEntry.image} alt={selectedSiteFeedEntry.caption || "Site update"} style={{ display: "block", maxWidth: "100%", maxHeight: "calc(92vh - 72px)", objectFit: "contain" }} /></div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>

      <HmFormDialog
        open={budgetEditOpen}
        onOpenChange={setBudgetEditOpen}
        title="Update project budget"
        description="Set the current total budget for this project."
        fields={[{ name: "amount", label: "Total budget (INR)", placeholder: "e.g. 2500000" }]}
        initialValues={{ amount: String(activeProjectMeta?.budget_max || briefData?.budgetInr || "") }}
        submitLabel="Save budget"
        onSubmit={saveProjectBudget}
      />
      <HmFormDialog
        open={taskDialogOpen}
        onOpenChange={setTaskDialogOpen}
        title={`Add task — ${selectedPhase}`}
        fields={[{ name: "value", label: "Task title", placeholder: "e.g. Review slab drawings" }]}
        submitLabel="Add task"
        onSubmit={submitNewTask}
      />
      <HmFormDialog
        open={milestoneDialog.open}
        onOpenChange={(open) => setMilestoneDialog((s) => ({ ...s, open }))}
        title={milestoneDialog.mode === "add" ? "Add reminder / milestone" : "Edit milestone"}
        description={milestoneDialog.phase ? `Stage: ${milestoneDialog.phase}` : undefined}
        fields={[
          { name: "name", label: "Name", placeholder: "e.g. Footing inspection" },
          { name: "date", label: "Target date", placeholder: "e.g. 5 Jul 2024 (optional)" },
        ]}
        initialValues={milestoneDialog.initial}
        submitLabel={milestoneDialog.mode === "add" ? "Add" : "Save"}
        onSubmit={submitMilestoneDialog}
      />

      <style>{`
        @media (max-width: 1100px) {
          .project-dash-phase-main {
            grid-template-columns: 1fr !important;
          }
        }
        @media (max-width: 720px) {
          .project-dash-top-split {
            grid-template-columns: 1fr !important;
          }
          .project-site-feed-card {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
