import React, { useRef, useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import BackButton from "../components/BackButton";
import { RemodelSpecView } from "../components/ArchitectBriefSpec";
import VisionCaptureStep from "../components/VisionCaptureStep";
import ProQuotesEngagementCallout from "../components/ProQuotesEngagementCallout";
import {
  browseQuotesUrl,
  proPathLabel,
  proPathToggleLabel,
  projectHubPostedUrl,
  WIZARD_FINAL_STEP,
} from "../lib/projectPostingFlow";
import {
  V0EstimateSection,
  V0GeneratingPanel,
  V0MilestonesSection,
  V0VisualBundleSections,
} from "../components/V0MockResults";
import { getRemodelFlow, setRemodelFlow } from "../lib/projectFlowStorage";
import {
  requestV0Images,
  requestEstimatePlan,
  formatAiApiError,
  bundleHasGrokConcepts,
  sanitizeV0Bundle,
  sanitizePlanBundle,
} from "../lib/aiApi";
import { createFlowProjectRecord, persistFlowAfterV0, updateProjectEstimate, upsertFlowProject } from "../lib/projectFlowApi";
import { buildSignInRedirect, isHomeownerSignedIn } from "../lib/requireHomeownerAuth";
import {
  ColourHexSwatch,
  ColourOctagonCustom,
  normalizeHexColor,
  PALETTE_PRESET_HEX,
} from "../components/HmColourPickers";
import LandingNavbar from "../components/landing/LandingNavbar";
import { HM_FIXED_NAV_OFFSET_TAGLINE_CLASS, HM_TAGLINE_REMODEL } from "../lib/hmBrand";
import { canVisitWizardStep, nextMaxStepReached, wizardExitPath } from "../lib/wizardSteps";
import HireStrategyPicker from "../components/HireStrategyPicker";
import { hireModeFromLegacyFlag, hireModeMeta, isOwnTeamHire, normalizeHireMode } from "../lib/hireMode";
import HmMediaDropzone from "../components/HmMediaDropzone";
import WizardMobileStepBar from "../components/WizardMobileStepBar";
import { optimizeImageFileToDataUrl } from "../lib/imageDataUrl";

const REMODEL_STEPS = [
  { n: 1, title: "Your space", sub: "Photos, then vision" },
  { n: 2, title: "Goals", sub: "Budget and constraints" },
  { n: 3, title: "Style", sub: "Materials and colour" },
  { n: 4, title: "Review", sub: "Confirm brief" },
  { n: 5, title: "AI v0", sub: "Concept pack" },
  { n: 6, title: WIZARD_FINAL_STEP.title, sub: WIZARD_FINAL_STEP.subtitle },
];

const flowH1Style = {
  fontFamily: "Georgia, 'Times New Roman', Times, serif",
  fontSize: "clamp(1.35rem, 1.15rem + 0.5vw, 1.7rem)",
  fontWeight: 400,
  color: "#1C1917",
  lineHeight: 1.3,
  letterSpacing: "0",
  margin: 0,
};
/** Nine remodel targets — aligned with new-home taxonomy (no maid room). */
const REMODEL_ROOMS = [
  { label: "Living room", icon: "🛋️" },
  { label: "Kitchen", icon: "🍳" },
  { label: "Bedroom", icon: "🛏️" },
  { label: "Bathroom", icon: "🚿" },
  { label: "Dining area", icon: "🍽️" },
  { label: "Balcony / terrace", icon: "🌿" },
  { label: "Puja room", icon: "🪔" },
  { label: "Parking / garage", icon: "🚗" },
  { label: "Study, office, or hall", icon: "🚪" },
];
const PTYPES = ["Apartment","Independent House","Villa"];
const PAIN_OPTS = ["Cramped / Small","Poor Lighting","Not Enough Storage","Outdated Design","Poor Ventilation","Other"];
const GOAL_OPTS = [
  { v:"Improve Layout",        sub:"Make the space more functional",      icon:"⬡" },
  { v:"Upgrade Look",          sub:"Give the space a modern new look",     icon:"✦" },
  { v:"Add Storage",           sub:"More storage and better organization", icon:"▤" },
  { v:"Increase Property Value",sub:"Upgrade to increase property value", icon:"₹" },
  { v:"Other",                 sub:"Something else (specify later)",       icon:"○" },
];

const OR = "#C85F2B";

function budgetAmountClampedRemodel(budgetAmount) {
  return Math.min(99, Math.max(0, parseInt(String(budgetAmount ?? "0"), 10) || 0));
}

function remodelBudgetLabel(budgetUnit, budgetAmount) {
  const n = budgetAmountClampedRemodel(budgetAmount);
  if (n === 0) return "₹0";
  return budgetUnit === "Thousands" ? `₹${n}K` : `₹${n} L`;
}

const flowSection = { marginBottom: 28, paddingBottom: 26, borderBottom: "1px solid #EDE8E0" };

const cardStyle = {
  background: "#fff",
  borderRadius: 14,
  border: "1px solid #EFE3D2",
  padding: "20px 24px",
  marginBottom: 20,
  boxShadow: "0 1px 2px rgba(28, 25, 23, 0.04)",
};

const inputStyle = {
  border: "1px solid #D6D3D1",
  borderRadius: 8,
  padding: "9px 12px",
  fontSize: 14,
  background: "#fff",
  outline: "none",
};

const sumRow = { display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #F0EBE3", fontSize: 12 };

function RightPanel({
  step,
  dreamVision,
  room,
  ptype,
  len,
  breadth,
  photos,
  spaceNotes,
  mainGoal,
  changeLevel,
  budgetUnit,
  budgetAmount,
  layoutOk,
  mustKeep,
  dealbreakers3,
  styles,
  finishTier,
  startTimeline,
  completionTime,
  colourBase,
  colourSecondary,
}) {
  const area = (parseInt(len)||0)*(parseInt(breadth)||0);
  const budgetLine = remodelBudgetLabel(budgetUnit, budgetAmount);
  const colourLine =
    normalizeHexColor(colourBase) && normalizeHexColor(colourSecondary)
      ? `${normalizeHexColor(colourBase)} · ${normalizeHexColor(colourSecondary)}`
      : "—";
  const dv = String(dreamVision ?? "").trim();
  const infoBox = step === 1
    ? { icon:"✨", title:"Room and vision", color:"#44403C", bg:"#FBF6F0", border:"#EEDCCB", items:["Brief, photos, size in one step","Voice optional","Enough detail for a first pass"], art:"✨🪴" }
    : step === 2
    ? { icon:"🎯", title:"Goals", color:"#44403C", bg:"#FBF6F0", border:"#EEDCCB", items:["Outcomes and budget together","Less back-and-forth with pros","Dealbreakers stay visible"], art:"📋🪴" }
    : step === 3
    ? { icon:"✨", title:"Style", color:"#44403C", bg:"#FBF6F0", border:"#EEDCCB", items:["Style, materials, colours","Within the budget you set","Steers the concept"], art:"🛏️🪴" }
    : step === 4
    ? { icon:"📋", title:"Review", color:"#44403C", bg:"#FBF6F0", border:"#EEDCCB", items:["Same brief your architect sees","Then free AI v0","Working drawings: separate fee"], art:"✅🪴" }
    : step === 5
    ? { icon:"🤖", title:"Free v0", color:"#44403C", bg:"#FBF6F0", border:"#EEDCCB", items:["Indicative only — not sanction drawings","Share the pack to brief faster","Project hub for execution when you’re ready"], art:"💻🪴" }
    : step === 6
    ? { icon:"📮", title:"Post project", color:"#14532D", bg:"#F0FDF4", border:"#BBF7D0", items:["Get quotes from marketplace pros","Or invite your own team","Compare proposals in the hub"], art:"🧱🪴" }
    : null;
  return (
    <aside
      style={{
        width: 288,
        flexShrink: 0,
        background: "#FDFBF8",
        padding: "24px 22px",
        overflowY: "auto",
        position: "relative",
        paddingTop: 40,
      }}
    >
      <div className="preview-annotation select-none hidden lg:block">Live Preview</div>
      <div className="preview-card fade-up relative w-full max-w-full mx-auto">
        <div
          className="preview-hero"
          style={{
            backgroundImage:
              "url(https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=900&q=75)",
          }}
        />
        <div style={{ padding: "16px 18px 20px", marginTop: 0 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
        <div style={{ fontWeight:700, fontSize:14 }}>Project Summary</div>
        <button type="button" style={{ background:"none", border:"none", color:OR, fontWeight:700, fontSize:12, cursor:"pointer" }}>✏️ Edit</button>
      </div>
      {[
        ["Project Type","Remodel"],
        ["Location","Bengaluru, Karnataka"],
        ["Brief", dv ? `${dv.slice(0, 72)}${dv.length > 72 ? "…" : ""}` : "Add on step 1"],
        ["Room", room],
        ["Property Type", ptype],
        ["Room Size", area>0?`${len} ft × ${breadth} ft (${area} sq ft)`:"Not added yet"],
        ["Budget", budgetLine],
        ["Timeline", `${startTimeline} → ${completionTime}`],
        ["Photos", photos.length>0?`${photos.length} photos uploaded`:"Not uploaded yet"],
        ["Notes", spaceNotes.trim()?spaceNotes.slice(0,38)+(spaceNotes.length>38?"…":""):"Not added yet"],
        ...(step>=2?[
          ["Goal", mainGoal||"Not set"],
          ["Layout Change", layoutOk],
          ["Must Keep", mustKeep.length>0?mustKeep.slice(0,2).join(", "):"Not set"],
          ["Dealbreakers", dealbreakers3.length>0?dealbreakers3.slice(0,2).join(",\n"):"None"],
        ]:[]),
        ...(step>=3?[["Style", styles.join(" + ")],["Finish",finishTier],["Colours", colourLine]]:[]),
      ].map(([k,v]) => (
        <div key={k} style={sumRow}>
          <span style={{ color:"#7A6E62" }}>{k}</span>
          <span style={{ fontWeight:600, textAlign:"right", maxWidth:130, fontSize:12 }}>{v}</span>
        </div>
      ))}
      {infoBox ? (
        <div style={{ background:infoBox.bg, border:`1px solid ${infoBox.border}`, borderRadius:12, padding:"14px 16px", margin:"16px 0" }}>
          <div style={{ fontWeight:700, fontSize:12, color:infoBox.color, marginBottom:8 }}>{infoBox.icon} {infoBox.title}</div>
          {infoBox.items.map(t => (
            <div key={t} style={{ display:"flex", alignItems:"center", gap:6, marginBottom:5 }}>
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#22A36B" strokeWidth="1.8" strokeLinecap="round"/></svg>
              <span style={{ fontSize:11, color:infoBox.color }}>{t}</span>
            </div>
          ))}
          <div style={{ marginTop:10, fontSize:28, textAlign:"center" }}>{infoBox.art}</div>
        </div>
      ) : (
        <div style={{ background:"#FBF6F0", border:"1px solid #EEDCCB", borderRadius:12, padding:"14px 16px", margin:"16px 0" }}>
          <div style={{ fontWeight:700, fontSize:12, color:"#44403C", marginBottom:5 }}>🎯 Why this matters</div>
          <div style={{ fontSize:12, color:"#57534E", lineHeight:1.55 }}>
            {step === 2
              ? "Budget and boundaries on the same step as goals — less jumping between screens."
              : "Your answers keep AI and architects aligned with how you actually live."}
          </div>
          <div style={{ marginTop:8, fontSize:22 }}>🛋️🪴</div>
        </div>
      )}
      {step === 5 && (
        <div style={{ background:"#F8F4EF", border:"1px solid #E2D9CF", borderRadius:10, padding:"12px 14px", marginTop:12 }}>
          <div style={{ fontWeight:700, fontSize:12, marginBottom:8 }}>What happens next?</div>
          {[
            "Your architect or assigned professional reviews the AI v0 and tightens the concept.",
            "You collaborate with your own design expert — not a generic bot — to refine plans and finishes.",
            "Move into project management: one place for updates, visibility, and coordination.",
          ].map((t,i) => (
            <div key={i} style={{ display:"flex", gap:8, marginBottom:6, alignItems:"flex-start" }}>
              <div style={{ width:16, height:16, borderRadius:"50%", background:OR, color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:700, flexShrink:0, marginTop:1 }}>{i+1}</div>
              <span style={{ fontSize:11, color:"#5C5147", lineHeight:1.5 }}>{t}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ background:"#F0F8EE", border:"1px solid #C3DEB8", borderRadius:12, padding:"14px 16px" }}>
        <div style={{ fontWeight:700, fontSize:12, color:"#166534", marginBottom:4 }}>🔒 Your privacy matters</div>
        <div style={{ fontSize:12, color:"#15803D", lineHeight:1.5 }}>Your information is secure and only used for this project.</div>
      </div>
        </div>
      </div>
    </aside>
  );
}

export default function RemodelHome() {
  const navigate = useNavigate();
  const location = useLocation();
  const referredProSlug = new URLSearchParams(location.search).get("pro") || "";
  const flowMainRef = useRef(null);
  const [photosEncoding, setPhotosEncoding] = useState(false);
  const [styleImagesEncoding, setStyleImagesEncoding] = useState(false);
  const [step, setStep] = useState(1);
  const [maxStepReached, setMaxStepReached] = useState(1);

  const [dreamVision, setDreamVision] = useState("");
  const [visionInspirationItems, setVisionInspirationItems] = useState([]);
  // Step 2 — capture space
  const [photos, setPhotos] = useState([]);
  const [beforeImage, setBeforeImage] = useState(null);
  const [ptype, setPtype] = useState("Apartment");
  const [room, setRoom] = useState("Living room");
  const [len, setLen] = useState("15");
  const [breadth, setBreadth] = useState("12");
  // Step 3 — outcome notes & refs (vision captured on step 1)
  const [spaceNotes, setSpaceNotes] = useState("");
  const [mainGoal, setMainGoal] = useState("Improve Layout");
  const [painPoints, setPainPoints] = useState(["Cramped / Small","Poor Lighting","Not Enough Storage"]);
  const [changeLevel, setChangeLevel] = useState("Moderate Remodel");
  // Step 4 — remodel budget in thousands or lakhs (0–99)
  const [budgetUnit, setBudgetUnit] = useState("Lakhs");
  const [budgetAmount, setBudgetAmount] = useState("25");
  const [budgetNotes, setBudgetNotes] = useState("");
  const [startTimeline, setStartTimeline] = useState("Within 3 Months");
  const [completionTime, setCompletionTime] = useState("9 - 12 Months");
  const [layoutOk, setLayoutOk] = useState("Yes, open to changes");
  const [mustKeep, setMustKeep] = useState([]);
  const [dealbreakers3, setDealbreakers3] = useState([]);
  // Step 5 — style & finishes
  const [styles, setStyles] = useState(["Modern"]);
  const [finishTier, setFinishTier] = useState("Budget Friendly");
  const [colourBase, setColourBase] = useState("#F5F5F0");
  const [colourSecondary, setColourSecondary] = useState("#9B7B5C");
  // After AI v0 (step 7+)
  const [postAiNotes, setPostAiNotes] = useState("");
  const [v0Generated, setV0Generated] = useState(false);
  const [v0Generating, setV0Generating] = useState(false);
  const [v0GenPhase, setV0GenPhase] = useState("");
  const [v0GenStatus, setV0GenStatus] = useState("");
  const [beforeAfterPosition, setBeforeAfterPosition] = useState(50);
  const [projectSaving, setProjectSaving] = useState(false);
  const [v0ImageBundle, setV0ImageBundle] = useState(null);
  const [v0PlanBundle, setV0PlanBundle] = useState(null);
  const [flowProjectId, setFlowProjectId] = useState(null);
  const [architectHandoffNote, setArchitectHandoffNote] = useState("");
  const [hireMode, setHireMode] = useState("trades");
  const [stepBlockError, setStepBlockError] = useState("");
  const [inspirationImgs, setInspirationImgs] = useState([]);
  const suppressStepHistoryRef = useRef(false);
  const toggleStyle = (s) => setStyles(prev => prev.includes(s) ? prev.filter(x=>x!==s) : prev.length < 2 ? [...prev, s] : prev);

  const togglePain = (p) => setPainPoints(prev => prev.includes(p)?prev.filter(x=>x!==p):[...prev,p]);
  const area = (parseInt(len)||0)*(parseInt(breadth)||0);
  const sel = (v) => ({ border:`2px solid ${v?OR:"#D1C9BF"}`, background:v?"#FBE5D4":"#fff", borderRadius:10, cursor:"pointer", padding:"12px 14px", textAlign:"center", color:v?OR:"#1C1917" });

  const readImagesAsDataUrls = async (fileList) => {
    const files = Array.from(fileList || []).filter((f) => /^image\//.test(f.type));
    if (!files.length) return [];
    return Promise.all(files.slice(0, 8).map((file) => optimizeImageFileToDataUrl(file)));
  };

  /** Files arrive from HmMediaDropzone (drag-drop or picker). */
  const handleRoomPhotosUpload = async (files) => {
    setPhotosEncoding(true);
    try {
      const encoded = await readImagesAsDataUrls(files);
      if (encoded.length) {
        setPhotos((prev) => [...prev, ...encoded.map((url, i) => ({ url, label: `Photo ${prev.length + i + 1}` }))]);
        setBeforeImage((current) => current || encoded[0]);
        setRemodelFlow({ beforeImage: encoded[0] });
      }
    } finally {
      setPhotosEncoding(false);
    }
  };

  const handleStyleImagesUpload = async (files) => {
    setStyleImagesEncoding(true);
    try {
      const encoded = await readImagesAsDataUrls(files);
      if (encoded.length) setInspirationImgs((prev) => [...prev, ...encoded]);
    } finally {
      setStyleImagesEncoding(false);
    }
  };

  useEffect(() => {
    const f = getRemodelFlow();
    const saved = f.formSnapshot && typeof f.formSnapshot === "object" ? f.formSnapshot : f;
    if (saved.dreamVision != null) setDreamVision(String(saved.dreamVision));
    if (Array.isArray(saved.visionInspirationItems)) setVisionInspirationItems(saved.visionInspirationItems);
    if (Array.isArray(saved.photos)) setPhotos(saved.photos);
    if (saved.ptype) setPtype(String(saved.ptype));
    if (saved.room) setRoom(String(saved.room));
    if (saved.len != null) setLen(String(saved.len));
    if (saved.breadth != null) setBreadth(String(saved.breadth));
    if (saved.spaceNotes != null) setSpaceNotes(String(saved.spaceNotes));
    if (saved.mainGoal) setMainGoal(String(saved.mainGoal));
    if (Array.isArray(saved.painPoints)) setPainPoints(saved.painPoints);
    if (saved.changeLevel) setChangeLevel(String(saved.changeLevel));
    if (saved.budgetUnit) setBudgetUnit(String(saved.budgetUnit));
    if (saved.budgetAmount != null) setBudgetAmount(String(saved.budgetAmount));
    if (saved.budgetNotes != null) setBudgetNotes(String(saved.budgetNotes));
    if (saved.startTimeline) setStartTimeline(String(saved.startTimeline));
    if (saved.completionTime) setCompletionTime(String(saved.completionTime));
    if (saved.layoutOk) setLayoutOk(String(saved.layoutOk));
    if (Array.isArray(saved.mustKeep)) setMustKeep(saved.mustKeep);
    if (Array.isArray(saved.dealbreakers3)) setDealbreakers3(saved.dealbreakers3);
    if (Array.isArray(saved.styles)) setStyles(saved.styles);
    if (saved.finishTier) setFinishTier(String(saved.finishTier));
    if (saved.colourBase) setColourBase(String(saved.colourBase));
    if (saved.colourSecondary) setColourSecondary(String(saved.colourSecondary));
    if (saved.postAiNotes != null) setPostAiNotes(String(saved.postAiNotes));
    const savedStep = Number(f.activeStep || f.step);
    if (savedStep >= 1 && savedStep <= 6) { setStep(savedStep); setMaxStepReached(savedStep); }
    const hasRealV0 = bundleHasGrokConcepts(f.v0Images);
    if (hasRealV0) {
      setV0Generated(!!f.v0);
      setV0ImageBundle(sanitizeV0Bundle(f.v0Images));
      if (f.v0Plan) setV0PlanBundle(sanitizePlanBundle(f.v0Plan));
    } else {
      setV0Generated(false);
      setV0ImageBundle(null);
      setV0PlanBundle(null);
      if (f.v0 || f.v0Images) {
        setRemodelFlow({ v0: false, v0Images: null, v0Plan: null });
      }
    }
    if (f.projectId) setFlowProjectId(f.projectId);
    if (f.beforeImage) setBeforeImage(String(f.beforeImage));
    if (f.architectComment) setArchitectHandoffNote(String(f.architectComment));
    if (f.hireMode) setHireMode(normalizeHireMode(f.hireMode));
    else if (typeof f.hasArchitect === "boolean") setHireMode(hireModeFromLegacyFlag(f.hasArchitect));
  }, []);

  useEffect(() => {
    const marker = "hm-remodel-step";
    const current = window.history.state;
    if (!current?.[marker]) window.history.replaceState({ ...(current || {}), [marker]: step }, "", window.location.href);
    const onPopState = (event) => {
      const previous = Number(event.state?.[marker]);
      if (previous >= 1 && previous <= 6) { suppressStepHistoryRef.current = true; setStep(previous); setMaxStepReached((m) => Math.max(m, previous)); }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  // Install the history listener once; step is intentionally captured only for the initial entry.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (suppressStepHistoryRef.current) { suppressStepHistoryRef.current = false; return; }
    const marker = "hm-remodel-step";
    if (window.history.state?.[marker] !== step) window.history.pushState({ ...(window.history.state || {}), [marker]: step }, "", window.location.href);
  }, [step]);

  useEffect(() => {
    const snapshot = { dreamVision, visionInspirationItems, photos, ptype, room, len, breadth, spaceNotes, mainGoal, painPoints, changeLevel, budgetUnit, budgetAmount, budgetNotes, startTimeline, completionTime, layoutOk, mustKeep, dealbreakers3, styles, finishTier, colourBase, colourSecondary, postAiNotes };
    const timeoutId = setTimeout(() => setRemodelFlow({ formSnapshot: snapshot, activeStep: step, step }), 200);
    return () => clearTimeout(timeoutId);
  }, [dreamVision, visionInspirationItems, photos, ptype, room, len, breadth, spaceNotes, mainGoal, painPoints, changeLevel, budgetUnit, budgetAmount, budgetNotes, startTimeline, completionTime, layoutOk, mustKeep, dealbreakers3, styles, finishTier, colourBase, colourSecondary, postAiNotes, step]);

  useEffect(() => {
    if (!isHomeownerSignedIn() || v0Generating) return undefined;
    const local = getRemodelFlow();
    const timeoutId = setTimeout(async () => {
      try {
        const saved = await upsertFlowProject({
          projectId: flowProjectId || local.projectId,
          flowType: "remodel",
          brief: { ...remodelBriefPayload(), activeStep: step, step },
          source: "remodel",
          flowStep: v0Generated ? "v0" : "draft",
        });
        if (saved?.projectId && saved.projectId !== flowProjectId) {
          setFlowProjectId(saved.projectId);
          setRemodelFlow({ projectId: saved.projectId });
        }
      } catch (error) {
        console.warn("Could not autosave remodel progress:", error?.message || error);
      }
    }, 1200);
    return () => clearTimeout(timeoutId);
  // remodelBriefPayload is intentionally read from the current wizard state for the debounced draft save.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dreamVision, room, len, breadth, budgetUnit, budgetAmount, step, v0Generated, flowProjectId]);

  useEffect(() => {
    const raf = window.requestAnimationFrame(() => {
      flowMainRef.current?.scrollTo?.({ top: 0, left: 0, behavior: "auto" });
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [step]);

  const remodelBriefPayload = () => {
    const areaSqFt = (parseInt(len, 10) || 0) * (parseInt(breadth, 10) || 0);
    const budgetN = budgetAmountClampedRemodel(budgetAmount);
    const budgetInr = budgetUnit === "Thousands" ? budgetN * 1_000 : budgetN * 100_000;
    const referenceImages = [
      ...photos.map((photo) => photo?.url),
      ...visionInspirationItems
        .filter((item) => item?.type === "image")
        .map((item) => item.value),
      ...inspirationImgs,
    ]
      .filter((url) => typeof url === "string" && url && !url.includes("unsplash.com"))
      .slice(0, 3);
    return {
      flowWizard: "remodel_home",
      dreamVision,
      location: "Bengaluru, Karnataka",
      room,
      ptype,
      propertyType: ptype,
      len,
      breadth,
      roomSizeLabel:
        areaSqFt > 0
          ? `${len} ft × ${breadth} ft (${areaSqFt} sq ft)`
          : `${len} ft × ${breadth} ft`,
      areaSqFt,
      spaceNotes,
      mainGoal,
      painPoints,
      changeLevel,
      budgetUnit,
      budgetAmount: String(budgetN),
      budgetLabel: remodelBudgetLabel(budgetUnit, budgetAmount),
      budgetInr,
      budgetNotes,
      startTimeline,
      completionTime,
      layoutOk,
      mustKeep,
      dealbreakers3,
      styles,
      finishTier,
      colourBase,
      colourSecondary,
      visionInspirationCount: visionInspirationItems.length,
      inspirationCount: inspirationImgs.length,
      roomPhotoCount: photos.length,
      inspirationLinks: visionInspirationItems
        .filter((item) => item?.type === "link" && item?.value)
        .map((item) => item.value)
        .slice(0, 8),
      inspirationImages: referenceImages,
    };
  };

  const runRemodelV0 = async () => {
    if (!isHomeownerSignedIn()) {
      setStepBlockError("Sign in to generate and save your v0 design and estimate to your account.");
      navigate(buildSignInRedirect(`${location.pathname}${location.search}`));
      return;
    }
    setV0Generating(true);
    setStepBlockError("");
    setV0ImageBundle(null);
    setV0PlanBundle(null);
    setV0Generated(false);
    setV0GenStatus("");
    try {
      const brief = remodelBriefPayload();
      setV0GenPhase("images");
      const imagesPayload = await requestV0Images("remodel", brief, {
        onStatus: (msg) => setV0GenStatus(msg),
        mode: "concept",
      });
      setV0GenPhase("estimate");
      setV0GenStatus("Building your estimate…");
      const planPayload = await requestEstimatePlan("remodel", brief, imagesPayload);
      const imagesWithBefore = beforeImage
        ? { ...(imagesPayload || {}), before_images: [{ url: beforeImage, label: "Original room photo" }] }
        : imagesPayload;
      setV0ImageBundle(imagesWithBefore);
      setV0PlanBundle(planPayload);
      setV0Generated(true);
      const briefForSave = { ...brief, referredProSlug, step: 5, v0Generated: true };
      const saved = await persistFlowAfterV0({
        projectId: flowProjectId || getRemodelFlow().projectId,
        flowType: "remodel",
        brief: briefForSave,
        source: "remodel",
        v0Images: imagesWithBefore,
        v0Plan: planPayload,
      });
      const pid = saved?.projectId || null;
      if (pid) setFlowProjectId(pid);
      setRemodelFlow({ v0: true, v0Images: imagesWithBefore, v0Plan: planPayload, projectId: pid });
    } catch (e) {
      setStepBlockError(formatAiApiError(e));
    } finally {
      setV0Generating(false);
      setV0GenPhase("");
      setV0GenStatus("");
    }
  };

  return (
    <div className={`hm-wizard-page-root relative min-h-screen bg-[#FBF7F2] overflow-x-hidden ${HM_FIXED_NAV_OFFSET_TAGLINE_CLASS}`} style={{ fontFamily: "'DM Sans',Inter,system-ui,sans-serif", color: "#1C1917" }}>
      {/* Background accents matching the homepage */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_100%_0%,rgba(193,132,78,0.08),transparent_50%)]" aria-hidden />

      <div className="hm-desktop-only"><LandingNavbar tagline={HM_TAGLINE_REMODEL} /></div>

      <div className="hm-wizard-layout" style={{ display: "flex", minHeight: "calc(100vh - 5.75rem)", position: "relative", zIndex: 10 }}>
        <aside
          style={{
            width: 228,
            flexShrink: 0,
            background: "#fff",
            borderRight: "1px solid #EFE3D2",
            padding: "24px 0",
          }}
        >
          {REMODEL_STEPS.map((s) => {
            const visitable = canVisitWizardStep(s.n, maxStepReached);
            return (
            <button
              key={s.n}
              type="button"
              disabled={!visitable}
              onClick={() => {
                if (!visitable) return;
                setStepBlockError("");
                setStep(s.n);
              }}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "12px 18px",
                background: step === s.n ? "#FBF6F0" : "none",
                border: "none",
                borderLeft: step === s.n ? "3px solid #C85F2B" : "3px solid transparent",
                cursor: visitable ? "pointer" : "not-allowed",
                opacity: visitable ? 1 : 0.45,
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
              }}
            >
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  flexShrink: 0,
                  background: step === s.n ? "#C85F2B" : s.n < step ? "#22A36B" : "#EDE8E3",
                  color: step === s.n || s.n < step ? "#fff" : "#7A6E62",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 700,
                  marginTop: 1,
                }}
              >
                {s.n < step ? "✓" : s.n}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: step === s.n ? "#C85F2B" : "#1C1917", lineHeight: 1.3 }}>{s.title}</div>
                <div style={{ fontSize: 11, color: "#7A6E62", marginTop: 2, lineHeight: 1.4 }}>{s.sub}</div>
              </div>
            </button>
          );
          })}
        </aside>

        <main
          className="hm-wizard-main"
          ref={flowMainRef}
          style={{
            flex: 1,
            background: "#fff",
            padding: "28px 36px 48px",
            overflowY: "auto",
            maxWidth: 860,
            borderRight: "1px solid #EFE3D2",
            minWidth: 0,
          }}
        >
          <WizardMobileStepBar
            steps={REMODEL_STEPS}
            activeStep={step}
            maxStepReached={maxStepReached}
            onStepClick={(n) => {
              setStepBlockError("");
              setStep(n);
            }}
          />
          <BackButton className="hm-wizard-inline-back" onClick={() => (step === 1 ? navigate(wizardExitPath()) : setStep((s) => s - 1))} />

          {/* ═══ STEP 1 — Existing space, then vision ═══ */}
          {step===1 && <>
            <div style={{ marginBottom: 8 }}>
              <h1 style={{ ...flowH1Style, marginBottom: 10 }}>
                Your space
              </h1>
              <p style={{ fontSize: 13, color: "#57534E", margin: "0 0 18px", lineHeight: 1.55, maxWidth: 640 }}>
                Start with photos of the room as it is today, then describe what you want it to become.
              </p>
            </div>

            <div style={{ ...flowSection, paddingBottom: 28 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 14 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15, color: "#1C1917", letterSpacing: "-0.005em" }}>Photos of the space today</div>
                  <div style={{ fontSize: 13, color: "#78716C", marginTop: 3, lineHeight: 1.5, maxWidth: 560 }}>
                    Shoot in daylight from each corner and include doors, windows, and the ceiling. Clear angles help the AI and your professional read the room.
                  </div>
                </div>
                <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#9A3412", padding: "4px 9px", borderRadius: 999, background: "#FDF4EF", border: "1px solid #F3DCCB" }}>Required</span>
              </div>
              <HmMediaDropzone
                items={photos.map((p) => ({ src: p.url, label: p.label }))}
                onAddFiles={handleRoomPhotosUpload}
                onRemove={(index) => setPhotos((prev) => prev.filter((_, j) => j !== index))}
                busy={photosEncoding}
                max={8}
                title="Add photos of the room"
                hint="JPG, PNG, or WebP · drag files here or browse · up to 8"
                removeLabel="Remove room photo"
              />
            </div>

            <div style={flowSection}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ fontWeight: 600, fontSize: 15, color: "#1C1917", letterSpacing: "-0.005em" }}>Property &amp; room</span>
              </div>
              <div style={{ fontSize: 13, color: "#5C5147", marginBottom: 18, lineHeight: 1.55 }}>Nine common spaces — pick what matches this photoset (no maid room).</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 22 }}>
                {PTYPES.map(t=>(
                  <button key={t} type="button" onClick={()=>setPtype(t)} style={{ ...sel(ptype===t), display:"inline-flex", flexDirection:"row", alignItems:"center", gap:8, padding:"10px 16px", borderRadius:999, flex:"0 1 auto" }}>
                    <span style={{ fontSize: 18 }}>{t==="Apartment"?"🏢":t==="Independent House"?"🏠":"🏡"}</span>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{t}</span>
                  </button>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))", gap: 10 }}>
                {REMODEL_ROOMS.map(({ label, icon }) => (
                  <button key={label} type="button" onClick={()=>setRoom(label)} style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 14px", borderRadius:12, cursor:"pointer", border:room===label?`2px solid ${OR}`:"1px solid #E8E4DE", background:room===label?"#FFFBF7":"#fff", fontSize:13, fontWeight:600, color:room===label?OR:"#1C1917", textAlign:"left", boxShadow: room===label ? "0 4px 14px -6px rgba(200,95,43,0.25)" : "0 1px 3px rgba(28,25,23,0.04)" }}>
                    <span style={{ fontSize: 20 }} aria-hidden>{icon}</span>
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div style={flowSection}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ fontWeight: 600, fontSize: 15, color: "#1C1917", letterSpacing: "-0.005em" }}>Approximate size</span>
                <span style={{ fontSize: 12, color: "#A8A29E" }}>(feet)</span>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:14, flexWrap:"wrap", marginBottom:10 }}>
                {[["Length",len,setLen],["Breadth",breadth,setBreadth]].map(([lbl,val,fn],i)=>(
                  <React.Fragment key={lbl}>
                    {i===1 && <span style={{ fontSize:18, color:"#C8B89E" }}>×</span>}
                    <div><div style={{ fontSize:12, color:"#7A6E62", marginBottom:4 }}>{lbl}</div>
                      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                        <input value={val} onChange={e=>fn(e.target.value)} style={{ ...inputStyle, width:76 }}/><span style={{ fontSize:13 }}>ft</span>
                      </div>
                    </div>
                  </React.Fragment>
                ))}
                <span style={{ fontSize:18, color:"#C8B89E" }}>=</span>
                <div style={{ background:"linear-gradient(180deg,#FFFBF7,#F5EFE8)", border:"1px solid #EEDCCB", borderRadius:12, padding:"12px 22px", textAlign:"center" }}>
                  <div style={{ fontSize:11, color:"#7A6E62" }}>Approx. area</div>
                  <div style={{ fontWeight:800, fontSize:22, color:OR }}>{area}</div>
                  <div style={{ fontSize:11, color:"#7A6E62" }}>sq ft</div>
                </div>
              </div>
              <div style={{ fontSize:12, color:"#7A6E62" }}>Rough numbers are fine — you can refine later with a site visit.</div>
            </div>

            <div style={{ marginTop: 28, paddingTop: 22, borderTop: "1px solid #EDE8E0" }}>
              <div className="craft-type-label mt-1 mb-4">
                <span style={{ color: "#C85F2B" }}>●</span>
                <span>Vision &amp; inspiration</span>
              </div>
              <p style={{ fontSize: 13, color: "#57534E", margin: "0 0 14px", lineHeight: 1.55, maxWidth: 640 }}>
                Describe the remodel in your own words, then add mood photos, Pinterest-style images, or links.
              </p>
              <VisionCaptureStep
                embedded
                value={dreamVision}
                onChange={setDreamVision}
                placeholder="What should this room feel like when we’re done?"
                inspirationItems={visionInspirationItems}
                onInspirationItemsChange={setVisionInspirationItems}
                inspirationLabel="Inspiration (photos or links)"
              />
            </div>
          </>}

          {/* ═══ STEP 2 — Goals & constraints ═══ */}
          {step===2 && <>
            <h1 style={{ ...flowH1Style, marginBottom: 12 }}>
              Goals
            </h1>
            <p style={{ fontSize: 13, color: "#57534E", margin: "0 0 20px", lineHeight: 1.55, maxWidth: 640 }}>
              What you want fixed, budget, timeline, and boundaries.
            </p>

            <div style={flowSection}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 18 }}>🎯</span>
                <span style={{ fontWeight: 700, fontSize: 16 }}>Main goal</span>
                <span style={{ fontSize: 12, color: "#A8A29E" }}>one</span>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(160px, 1fr))", gap:12 }}>
                {GOAL_OPTS.map(g=>(
                  <button key={g.v} type="button" onClick={()=>setMainGoal(g.v)} style={{ ...sel(mainGoal===g.v), position:"relative", textAlign:"left", padding:"14px 16px", borderRadius:12, boxShadow: mainGoal===g.v ? "0 4px 16px -8px rgba(200,95,43,0.35)" : "0 1px 3px rgba(28,25,23,0.05)" }}>
                    {mainGoal===g.v && <div style={{ position:"absolute", top:10, right:10, width:18, height:18, borderRadius:"50%", background:OR, display:"flex", alignItems:"center", justifyContent:"center" }}><svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"/></svg></div>}
                    <div style={{ fontSize:24, marginBottom:6 }}>{g.icon}</div>
                    <div style={{ fontWeight:700, fontSize:13 }}>{g.v}</div>
                    <div style={{ fontSize:11, color:"#7A6E62", marginTop:4, lineHeight:1.45 }}>{g.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            <div style={flowSection}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 18 }}>⚠️</span>
                <span style={{ fontWeight: 700, fontSize: 16 }}>What&apos;s not working</span>
                <span style={{ fontSize: 12, color: "#A8A29E" }}>multi</span>
              </div>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                {PAIN_OPTS.map(p=>{
                  const on = painPoints.includes(p);
                  return (
                    <button key={p} type="button" onClick={()=>togglePain(p)} style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"9px 14px", borderRadius:999, cursor:"pointer", border:on?`2px solid ${OR}`:"1px solid #E8E4DE", background:on?"#FBE5D4":"#fff", position:"relative", fontSize:13, fontWeight:600, color:on?OR:"#1C1917" }}>
                      {on && <span style={{ width:8, height:8, borderRadius:"50%", background:OR }} aria-hidden />}
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={flowSection}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 18 }}>🔧</span>
                <span style={{ fontWeight: 700, fontSize: 16 }}>How much change?</span>
              </div>
              <div style={{ fontSize: 13, color: "#5C5147", marginBottom: 14, lineHeight: 1.55 }}>Typical paths: refresh walls &amp; finishes, swap carpentry and services, or occasionally reconfigure structure.</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(200px, 1fr))", gap:12, marginBottom:12 }}>
                {[
                  { v:"Light Refresh",       icon:"🖌️", sub:"Mostly paint, lighting, and light décor — furniture can stay." },
                  { v:"Moderate Remodel",     icon:"🔨", sub:"Carpentry, wardrobes, kitchen/bath upgrades; services as needed." },
                  { v:"Full Transformation",  icon:"🏗️", sub:"Layout moves, civil changes, or full replan when you’re ready for it." },
                ].map(o=>(
                  <button key={o.v} type="button" onClick={()=>setChangeLevel(o.v)} style={{ display:"flex", alignItems:"flex-start", gap:12, padding:"16px 16px", borderRadius:14, cursor:"pointer", border:changeLevel===o.v?`2px solid ${OR}`:"1px solid #E8E4DE", background:changeLevel===o.v?"#FFFBF7":"#fff", textAlign:"left", boxShadow: changeLevel===o.v ? "0 6px 20px -10px rgba(200,95,43,0.3)" : "none" }}>
                    <span style={{ fontSize: 22 }} aria-hidden>{o.icon}</span>
                    <div>
                      <div style={{ fontWeight:700, fontSize:14, color:changeLevel===o.v?OR:"#1C1917", marginBottom:6 }}>{o.v}</div>
                      <div style={{ fontSize:12, color:"#7A6E62", lineHeight:1.5 }}>{o.sub}</div>
                    </div>
                  </button>
                ))}
              </div>
              <div style={{ fontSize:12, color:"#78716C" }}>You can revisit this after seeing v0 concepts.</div>
            </div>

            <div style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 18 }}>✏️</span>
                <span style={{ fontWeight: 700, fontSize: 16 }}>Extra notes</span>
                <span style={{ fontSize: 12, color: "#A8A29E" }}>(optional)</span>
              </div>
              <p style={{ fontSize: 13, color: "#5C5147", margin: "0 0 14px", lineHeight: 1.55, maxWidth: 640 }}>
                Must-keeps, brands you like, or phasing — inspiration photos belong on step 1.
              </p>
              <textarea value={spaceNotes} onChange={e=>setSpaceNotes(e.target.value.slice(0,500))} placeholder="E.g. Keep the hall sofa; mainly new wall colour and TV wall. Prefer warm oak, not glossy white." rows={4} style={{ ...inputStyle, width:"100%", maxWidth:640, resize:"vertical", boxSizing:"border-box", fontFamily:"'DM Sans',sans-serif", marginBottom:10 }}/>
              <div style={{ fontSize:11, color:"#9A8F87", marginBottom:16 }}>{spaceNotes.length}/500</div>
            </div>

            <div style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid #EDE8E0" }}>
            <div className="craft-type-label mt-1 mb-4">
              <span style={{ color: "#C85F2B" }}>●</span>
              <span>Budget and boundaries</span>
            </div>
            <p style={{ fontSize: 14, color: "#57534E", margin: "0 0 22px", lineHeight: 1.6, maxWidth: 640 }}>
              Budget band, timeline, layout flexibility, must-keeps and dealbreakers — in one pass.
            </p>

            <div style={flowSection}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                <span style={{ fontSize: 16 }}>₹</span>
                <span style={{ fontWeight: 700, fontSize: 16 }}>1. Budget for this remodel</span>
                <span style={{ fontSize: 12, color: "#78716C", fontWeight: 600 }}>(required · above ₹0)</span>
              </div>
              <div style={{ fontSize: 13, color: "#5C5147", marginBottom: 16, maxWidth: 560, lineHeight: 1.55 }}>
                Choose <strong>thousands</strong> or <strong>lakhs</strong>, then set the amount from <strong>0 to 99</strong> (all-in band for this scope — materials, labour, finishes).
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end", marginBottom: 18 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11, fontWeight: 600, color: "#78716C", letterSpacing: "0.04em" }}>
                  AMOUNT IN
                  <select
                    value={budgetUnit}
                    onChange={(e) => setBudgetUnit(e.target.value)}
                    style={{
                      border: "1px solid #D6D3D1",
                      borderRadius: 6,
                      padding: "8px 12px",
                      fontSize: 13,
                      background: "#fff",
                      color: "#1C1917",
                      cursor: "pointer",
                      minWidth: 140,
                    }}
                  >
                    <option value="Thousands">Thousands (₹ K)</option>
                    <option value="Lakhs">Lakhs (₹ L)</option>
                  </select>
                </label>
                <div style={{ fontSize: 28, fontWeight: 800, color: "#C85F2B", fontVariantNumeric: "tabular-nums", paddingBottom: 2 }}>{remodelBudgetLabel(budgetUnit, budgetAmount)}</div>
              </div>
              <div style={{ maxWidth: 420, marginBottom: 8 }}>
                <input
                  type="range"
                  min={0}
                  max={99}
                  value={budgetAmountClampedRemodel(budgetAmount)}
                  onChange={(e) => setBudgetAmount(e.target.value)}
                  style={{ width: "100%", accentColor: "#C85F2B", cursor: "pointer" }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#A8A29E", marginTop: 6 }}>
                  <span>0</span>
                  <span>99</span>
                </div>
              </div>
              <div style={{ fontSize: 11, color: "#A8A29E", lineHeight: 1.5, marginBottom: 16 }}>Indicative band — final numbers follow site survey and selections.</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#44403C", marginBottom: 6 }}>Extra notes on cost (optional)</div>
              <textarea
                value={budgetNotes}
                onChange={(e) => setBudgetNotes(e.target.value)}
                placeholder="E.g. stretch for kitchen counters only, or phase paint first…"
                rows={2}
                style={{ width: "100%", maxWidth: 560, border: "1px solid #E7E5E4", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#1C1917", resize: "none", outline: "none", boxSizing: "border-box", fontFamily: "'DM Sans',sans-serif", background: "#FAFAF9" }}
              />
            </div>

            <div style={flowSection}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                <span style={{ fontSize: 16 }}>📅</span>
                <span style={{ fontWeight: 700, fontSize: 16 }}>2. Project timeline</span>
                <span style={{ fontSize: 12, color: "#A8A29E", fontWeight: 500 }}>(optional)</span>
              </div>
              <div className="hm-wizard-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start", maxWidth: 520 }}>
                <div>
                  <div style={{ fontSize: 12, color: "#5C5147", marginBottom: 6 }}>When do you plan to start?</div>
                  <select
                    value={startTimeline}
                    onChange={(e) => setStartTimeline(e.target.value)}
                    style={{ width: "100%", border: "1px solid #D6D3D1", borderRadius: 8, padding: "10px 12px", fontSize: 13, background: "#fff", color: "#1C1917", cursor: "pointer", boxSizing: "border-box" }}
                  >
                    {["Immediately","Within 3 Months","3–6 Months","6–12 Months","Not Sure"].map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#5C5147", marginBottom: 6 }}>Expected completion</div>
                  <select
                    value={completionTime}
                    onChange={(e) => setCompletionTime(e.target.value)}
                    style={{ width: "100%", border: "1px solid #D6D3D1", borderRadius: 8, padding: "10px 12px", fontSize: 13, background: "#fff", color: "#1C1917", cursor: "pointer", boxSizing: "border-box" }}
                  >
                    {["6 - 9 Months","9 - 12 Months","12 - 18 Months","18 - 24 Months","24 Months+"].map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ fontSize: 11, color: "#A8A29E", marginTop: 12, lineHeight: 1.45 }}>Starting early usually helps lock materials and crew.</div>
            </div>

            {/* Layout change */}
            <div style={{ ...cardStyle, border: "1px solid #E8E4DE", boxShadow: "none" }}>
              <div style={{ fontWeight:700, fontSize:15, marginBottom:14 }}>3. Are you okay changing the layout? <span style={{ fontWeight:400, color:"#7A6E62", fontSize:13 }}>(moving walls, kitchen, etc.)</span></div>
              <div className="hm-wizard-grid-3" style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
                {[
                  { v:"Yes, open to changes", sub:"I'm open to layout, wall or space changes." },
                  { v:"No, keep layout same",  sub:"I want to retain the existing layout." },
                  { v:"Not sure",              sub:"I'll decide after seeing the design options." },
                ].map(o => (
                  <button key={o.v} onClick={()=>setLayoutOk(o.v)} style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"14px 14px", borderRadius:10, cursor:"pointer", border:layoutOk===o.v?`2px solid ${OR}`:"1.5px solid #D1C9BF", background:layoutOk===o.v?"#FBE5D4":"#fff", textAlign:"left", position:"relative" }}>
                    {layoutOk===o.v && <div style={{ position:"absolute", top:8, right:8, width:18, height:18, borderRadius:"50%", background:OR, display:"flex", alignItems:"center", justifyContent:"center" }}><svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"/></svg></div>}
                    <div style={{ width:14, height:14, borderRadius:"50%", border:layoutOk===o.v?`4px solid ${OR}`:"2px solid #C8B89E", background:layoutOk===o.v?"#fff":"transparent", flexShrink:0, marginTop:2 }} />
                    <div>
                      <div style={{ fontWeight:700, fontSize:13, color:layoutOk===o.v?OR:"#1C1917", marginBottom:4 }}>{o.v}</div>
                      <div style={{ fontSize:11, color:"#7A6E62", lineHeight:1.5 }}>{o.sub}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Must-keep */}
            <div style={{ ...cardStyle, border: "1px solid #E8E4DE", boxShadow: "none" }}>
              <div style={{ fontWeight:700, fontSize:15, marginBottom:4 }}>4. What should stay as-is in <span style={{ color:OR }}>{room}</span>? <span style={{ fontWeight:400, color:"#7A6E62" }}>(optional)</span></div>
              <div style={{ fontSize:13, color:"#7A6E62", marginBottom:14 }}>Hall, bedroom, or study — tick what must not move while we repaint, redo services, or refresh carpentry.</div>
              <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:10 }}>
                {["Mostly walls / paint only","Keep large furniture (sofa, bed, etc.)","Keep flooring as-is","Keep layout & services","Doors & windows","False ceiling","Other"].map(mk => {
                  const on = mustKeep.includes(mk);
                  return (
                    <button key={mk} onClick={()=>setMustKeep(prev=>on?prev.filter(x=>x!==mk):[...prev,mk])} style={{ display:"flex", alignItems:"center", gap:8, padding:"9px 14px", borderRadius:8, cursor:"pointer", border:on?`2px solid ${OR}`:"1.5px solid #D1C9BF", background:on?"#FBE5D4":"#fff" }}>
                      {on && <div style={{ width:14, height:14, borderRadius:3, background:OR, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><svg width="8" height="8" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"/></svg></div>}
                      <span style={{ fontSize:13, fontWeight:600, color:on?OR:"#1C1917" }}>{mk}</span>
                    </button>
                  );
                })}
              </div>
              <div style={{ background:"#EBF3FB", border:"1px solid #C3DCF0", borderRadius:8, padding:"8px 12px", display:"flex", alignItems:"center", gap:6 }}>
                <span>ℹ️</span><span style={{ fontSize:12, color:"#2A6496" }}>You can select multiple, but we'll prioritise the most important ones.</span>
              </div>
            </div>

            {/* Dealbreakers */}
            <div style={{ ...cardStyle, border: "1px solid #E8E4DE", boxShadow: "none" }}>
              <div style={{ fontWeight:700, fontSize:15, marginBottom:4 }}>5. Dealbreakers <span style={{ fontWeight:400, color:"#7A6E62" }}>(optional)</span></div>
              <div style={{ fontSize:13, color:"#7A6E62", marginBottom:14 }}>Hard limits for this phase — we’ll route designs around them.</div>
              <div style={{ display:"flex", gap:16, flexWrap:"wrap" }}>
                {["No wall breaking","No plumbing changes","No major construction","Avoid dust / noise","Other"].map(d => {
                  const on = dealbreakers3.includes(d);
                  return (
                    <label key={d} style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer" }}>
                      <div onClick={()=>setDealbreakers3(prev=>on?prev.filter(x=>x!==d):[...prev,d])} style={{ width:16, height:16, borderRadius:4, border:on?`2px solid ${OR}`:"2px solid #C8B89E", background:on?OR:"#fff", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", flexShrink:0 }}>
                        {on && <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"/></svg>}
                      </div>
                      <span style={{ fontSize:13, fontWeight:500, color:"#1C1917" }}>{d}</span>
                    </label>
                  );
                })}
              </div>
            </div>
            </div>
          </>}

          {/* ═══ STEP 3 — Style ═══ */}
          {step===3 && <>
            <h1 style={{ ...flowH1Style, marginBottom: 18 }}>
              Style
            </h1>

            {/* Style cards */}
            <div style={{ ...cardStyle, border: "1px solid #E8E4DE", boxShadow: "0 2px 12px rgba(28,25,23,0.04)" }}>
              <div style={{ fontWeight:700, fontSize:15, marginBottom:4 }}>1. Select your preferred style <span style={{ fontWeight:400, color:"#7A6E62" }}>(Choose up to 2)</span></div>
              <div style={{ display:"flex", gap:12, marginTop:12, flexWrap:"wrap" }}>
                {[
                  { v:"Modern",        img:"https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=150&q=70" },
                  { v:"Minimalist",    img:"https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=150&q=70" },
                  { v:"Scandinavian",  img:"https://images.unsplash.com/photo-1592229506151-845940174bb0?w=150&q=70" },
                  { v:"Contemporary", img:"https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=150&q=70" },
                  { v:"Traditional",   img:"https://images.unsplash.com/photo-1631679706909-1844bbd07221?w=150&q=70" },
                ].map(s => {
                  const on = styles.includes(s.v);
                  return (
                    <button key={s.v} type="button" onClick={()=>toggleStyle(s.v)} style={{ cursor:"pointer", borderRadius:12, overflow:"hidden", border:"none", padding:0, background:"transparent", boxShadow: on ? `0 0 0 2px ${OR}, 0 4px 14px -6px rgba(200,95,43,0.25)` : "0 1px 4px rgba(28,25,23,0.08)", width:112, flexShrink:0, position:"relative", font:"inherit" }}>
                      {on && <div style={{ position:"absolute", top:6, right:6, width:20, height:20, borderRadius:"50%", background:OR, display:"flex", alignItems:"center", justifyContent:"center", zIndex:1 }}><svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"/></svg></div>}
                      <img src={s.img} alt={s.v} style={{ width:"100%", height:86, objectFit:"cover", display:"block" }}/>
                      <div style={{ padding:"8px 8px", fontSize:12, fontWeight:600, color:on?OR:"#1C1917", background:"#fff", textAlign:"center" }}>{s.v}</div>
                    </button>
                  );
                })}
                <div style={{ cursor:"default", borderRadius:12, border:"1px dashed #C8B89E", width:112, flexShrink:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:6, height:118, background:"#FDFBF8" }}>
                  <span style={{ fontSize:26 }}>🎨</span>
                  <div style={{ fontSize:11, fontWeight:600, color:"#7A6E62", textAlign:"center", padding: "0 6px" }}>Describe in notes</div>
                </div>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:12, fontSize:12, color:"#7A6E62" }}>
                <span>ℹ️</span><span>Up to 2 styles — we blend them in the concept.</span>
              </div>
            </div>

            {/* Material finish */}
            <div style={{ ...cardStyle, border: "1px solid #E8E4DE", boxShadow: "none" }}>
              <div style={{ fontWeight:700, fontSize:15, marginBottom:14 }}>2. Materials and finish</div>
              <div className="hm-wizard-grid-3" style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:12 }}>
                {[
                  { v:"Budget Friendly", icon:"💼", sub:"Practical and durable materials that are easy on the budget." },
                  { v:"Mid Range",       icon:"🛋️", sub:"Good quality materials with a balance of style, durability and cost." },
                  { v:"Premium",         icon:"💎", sub:"High-end materials and finishes for a luxurious look and feel." },
                ].map(f => {
                  const on = finishTier === f.v;
                  return (
                    <button key={f.v} onClick={()=>setFinishTier(f.v)} style={{ display:"flex", alignItems:"flex-start", gap:12, padding:"14px", borderRadius:10, cursor:"pointer", border:on?`2px solid ${OR}`:"1.5px solid #D1C9BF", background:on?"#FBE5D4":"#fff", textAlign:"left", position:"relative" }}>
                      {on && <div style={{ position:"absolute", top:8, right:8, width:18, height:18, borderRadius:"50%", background:OR, display:"flex", alignItems:"center", justifyContent:"center" }}><svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"/></svg></div>}
                      <span style={{ fontSize:24, flexShrink:0 }}>{f.icon}</span>
                      <div>
                        <div style={{ fontWeight:700, fontSize:13, color:on?OR:"#1C1917", marginBottom:4 }}>{f.v}</div>
                        <div style={{ fontSize:11, color:"#7A6E62", lineHeight:1.5 }}>{f.sub}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div style={{ background:"#F0F8EE", border:"1px solid #C3DEB8", borderRadius:8, padding:"7px 12px", display:"flex", alignItems:"center", gap:6 }}>
                <span>🌿</span><span style={{ fontSize:12, color:"#2A6A30" }}>This helps us recommend the right materials and accurate estimates.</span>
              </div>
            </div>

            {/* Interior colours — primary + secondary (same pattern as new home) */}
            <div style={{ ...cardStyle, border: "1px solid #E8E4DE", boxShadow: "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 18 }}>🎨</span>
                <span style={{ fontWeight: 700, fontSize: 16 }}>3. Interior colour scheme</span>
              </div>
              <div style={{ fontSize: 13, color: "#7A6E62", marginBottom: 14, lineHeight: 1.55 }}>
                Primary field colour and a secondary for trims, niches, or accent walls — presets plus any hex you want.
              </div>
              <div className="hm-wizard-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginBottom: 12 }}>
                {[
                  { title: "Primary / main", key: "base", state: colourBase, set: setColourBase, hint: "Walls and large fields" },
                  { title: "Secondary / accent", key: "sec", state: colourSecondary, set: setColourSecondary, hint: "Trims, feature wall, wood tones" },
                ].map((slot) => (
                  <div key={slot.key}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#44403C", marginBottom: 4 }}>{slot.title}</div>
                    <div style={{ fontSize: 10, color: "#A8A29E", marginBottom: 10 }}>{slot.hint}</div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: "#78716C", marginBottom: 8, fontVariantNumeric: "tabular-nums" }}>{normalizeHexColor(slot.state) || slot.state}</div>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                      {PALETTE_PRESET_HEX.map((c) => {
                        const pk = normalizeHexColor(c);
                        const selected = normalizeHexColor(slot.state) === pk;
                        return (
                          <ColourHexSwatch
                            key={`${slot.key}-${c}`}
                            colour={c}
                            selected={selected}
                            onClick={() => {
                              const h = normalizeHexColor(c);
                              if (h) slot.set(h);
                            }}
                          />
                        );
                      })}
                      <ColourOctagonCustom
                        onPick={(raw) => {
                          const h = normalizeHexColor(raw);
                          if (h) slot.set(h);
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Inspiration images */}
            <div style={{ ...cardStyle, border: "1px solid #E8E4DE", boxShadow: "none" }}>
              <div style={{ fontWeight:600, fontSize:15, marginBottom:3, letterSpacing: "-0.005em" }}>4. Inspiration images <span style={{ fontWeight:400, color:"#7A6E62" }}>(optional)</span></div>
              <div style={{ fontSize:13, color:"#78716C", marginBottom:14, lineHeight: 1.5 }}>Rooms, finishes, or details you like. These sharpen the AI concepts and your professional's read on your taste.</div>
              <HmMediaDropzone
                compact
                items={inspirationImgs.map((src) => ({ src, label: "" }))}
                onAddFiles={handleStyleImagesUpload}
                onRemove={(index) => setInspirationImgs((prev) => prev.filter((_, j) => j !== index))}
                busy={styleImagesEncoding}
                max={8}
                title="Add inspiration images"
                hint="JPG, PNG, or WebP · drag files here or browse"
                removeLabel="Remove inspiration image"
              />
            </div>
          </>}

          {/* ═══ STEP 4 — Review ═══ */}
          {step===4 && <>
            <h1 style={{ ...flowH1Style, marginBottom: 18 }}>
              Review
            </h1>
            <div style={{ ...cardStyle, maxWidth: 640 }}>
              <div style={{ padding: "8px 0 12px", borderBottom: "1px solid #F0EBE3" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#78716C", marginBottom: 6 }}>Brief</div>
                <div style={{ fontSize: 13, color: "#1C1917", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{String(dreamVision ?? "").trim() || "—"}</div>
              </div>
              {[
                ["Room", room],
                ["Property", ptype],
                ["Size", area > 0 ? `${len} ft × ${breadth} ft (${area} sq ft)` : "—"],
                ["Main goal", mainGoal || "—"],
                ["Budget", remodelBudgetLabel(budgetUnit, budgetAmount)],
                ["Timeline", `${startTimeline} → ${completionTime}`],
                ["Style", styles.join(" + ")],
                ["Finish", finishTier],
                ["Layout change", layoutOk],
                ["Must keep", mustKeep.length ? mustKeep.join(", ") : "—"],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderTop: "1px solid #F0EBE3", fontSize: 13 }}>
                  <span style={{ color: "#7A6E62" }}>{k}</span>
                  <span style={{ fontWeight: 600, textAlign: "right", lineHeight: 1.4, maxWidth: 320 }}>{v}</span>
                </div>
              ))}
            </div>
          </>}

          {/* ═══ STEP 5 — AI v0 ═══ */}
          {step===5 && <>
            <h1 style={{ ...flowH1Style, marginBottom: 12 }}>
              AI concepts (v0)
            </h1>
            <p style={{ fontSize: 13, color: "#57534E", margin: "0 0 18px", lineHeight: 1.55, maxWidth: 640 }}>
              Indicative estimate and visuals from your brief. No architect assigned here — share with your pro before working drawings.
            </p>
            {!v0Generated && !v0Generating && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Generate v0 for {room}</div>
                <p style={{ fontSize: 13, color: "#57534E", lineHeight: 1.5, margin: "0 0 12px" }}>Indicative visuals and estimate — saved with your project when you continue.</p>
                {!isHomeownerSignedIn() ? (
                  <div style={{ padding: "12px 14px", borderRadius: 10, background: "#FDF4EF", border: "1px solid #EEDCCB", marginBottom: 12, fontSize: 13, color: "#57534E", lineHeight: 1.5 }}>
                    <strong style={{ color: "#1C1917" }}>Sign in required</strong> before Generate v0.
                    <button type="button" onClick={() => navigate(buildSignInRedirect(`${location.pathname}${location.search}`))} className="btn-continue !rounded-xl !px-6 !py-3 block mt-3 text-sm">Sign in to continue</button>
                  </div>
                ) : null}
                <button type="button" onClick={runRemodelV0} disabled={!isHomeownerSignedIn()} className="btn-continue !rounded-xl !px-6 !py-3.5 text-sm disabled:opacity-50">Generate v0</button>
              </div>
            )}
            {v0Generating && <V0GeneratingPanel phase={v0GenPhase || "images"} statusLine={v0GenStatus} />}

            {v0Generated && (<>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16, flexWrap:"wrap", gap:16 }}>
              <div>
                <h2 style={{ ...flowH1Style, fontSize: "1.25rem", marginBottom: 8 }}>
                  Your v0 concept is ready
                </h2>
                <p style={{ fontSize: 14, color: "#57534E", margin: 0, lineHeight: 1.6, maxWidth: 520 }}>
                  Here&apos;s a first design direction from everything you shared.
                </p>
              </div>
              <span style={{ background:"#F5EFE8", border:"1px solid #EEDCCB", borderRadius:999, padding:"7px 12px", fontWeight:700, fontSize:12, color:"#8B5E3C" }}>
                AI concept preview
              </span>
            </div>

            {/* Quick stats */}
            <div style={{ border:"1px solid #EEDCCB", borderRadius:14, padding:"16px 22px", marginBottom:20, display:"flex", flexWrap:"wrap", gap:"20px 36px", background:"linear-gradient(180deg,#FFFBF7,#FDFBF8)" }}>
              {[
                { icon:"🛋️", label:"Style",        val: styles.join(" + ") },
                { icon:"₹",   label:"Budget",       val: remodelBudgetLabel(budgetUnit, budgetAmount) },
                { icon:"📅",  label:"Timeline",     val: `${startTimeline} → ${completionTime}` },
                { icon:"📐",  label:"Layout", val: layoutOk },
              ].map(s => (
                <div key={s.label}>
                  <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, color:"#7A6E62", marginBottom:2 }}><span>{s.icon}</span>{s.label}</div>
                  <div style={{ fontWeight:700, fontSize:14, color:"#1C1917" }}>{s.val}</div>
                </div>
              ))}
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Plans, renders &amp; estimate</div>
              <p style={{ fontSize: 13, color: "#5C5147", margin: "0 0 14px", lineHeight: 1.55, maxWidth: 640 }}>
                Your <strong>free AI v0</strong> includes <strong>layout plans</strong>, complementary <strong>interior concepts</strong>, and a
                <strong>design plan estimate</strong> you can send to your architect — scoped to this room.
              </p>
              <V0VisualBundleSections
                bundle={v0ImageBundle}
                floorPlanTitle="Room / layout plans (v0)"
                elevationTitle="Interior concept renders"
                interiorRenders
              />
              <V0EstimateSection planBundle={v0PlanBundle} title="Design plan estimate (for your architect)" onChange={async (next) => { setV0PlanBundle(next); const pid = flowProjectId || getRemodelFlow().projectId; if (pid) { try { await updateProjectEstimate(pid, next); setRemodelFlow({ v0Plan: next }); } catch (e) { setStepBlockError(e.message); } } }} />
              <V0MilestonesSection planBundle={v0PlanBundle} />
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
                border: "1px solid #EEDCCB",
                background: "#FFFBF7",
                borderRadius: 12,
                padding: "10px 12px",
                marginBottom: 16,
              }}
            >
              <div style={{ fontSize: 12, color: "#57534E", lineHeight: 1.45 }}>
                <strong style={{ color: "#1C1917" }}>How you&apos;ll hire:</strong> {proPathLabel(hireMode)}
              </div>
              <button
                type="button"
                onClick={() => {
                  const next = hireMode === "own_team" ? "trades" : "own_team";
                  setHireMode(next);
                  setRemodelFlow({ hireMode: next, hasArchitect: next === "own_team" });
                }}
                style={{
                  background: "#fff",
                  border: "1.5px solid #D1C9BF",
                  borderRadius: 8,
                  padding: "7px 12px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  color: "#3D3530",
                }}
              >
                {proPathToggleLabel(hireMode === "own_team")}
              </button>
            </div>
            <ProQuotesEngagementCallout
              hasOwnPros={hireMode === "own_team"}
              onBrowseForQuotes={hireMode === "own_team" ? undefined : () => navigate(browseQuotesUrl({ projectId: flowProjectId }))}
            />

            {/* BEFORE / AFTER */}
            <div style={{ ...cardStyle, border: "1px solid #E8E4DE", boxShadow: "0 4px 20px -8px rgba(28,25,23,0.08)" }}>
              <div style={{ fontWeight:700, fontSize:15, marginBottom:12 }}>{room} — first AI v0</div>
              <div style={{ position:"relative", height:200, borderRadius:12, overflow:"hidden", border:"1px solid #EEDCCB", marginBottom:8 }}>
                <img src={v0ImageBundle?.images?.[0]?.url || "https://images.unsplash.com/photo-1631679706909-1844bbd07221?w=400&q=75"} alt="after AI v0" style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover", display:"block" }}/>
                <img src={beforeImage || "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=400&q=75"} alt={beforeImage ? "Your uploaded room before remodel" : "Before remodel placeholder"} style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover", objectPosition:"left", clipPath:`inset(0 ${100 - beforeAfterPosition}% 0 0)`, zIndex:1, display:"block" }}/>
                <div style={{ position:"absolute", top:0, bottom:0, left:`calc(${beforeAfterPosition}% - 1px)`, width:2, background:"#fff", boxShadow:"0 0 0 1px rgba(28,25,23,.2)", zIndex:2, pointerEvents:"none" }} />
                <div style={{ position:"absolute", top:10, left:10, background:"rgba(0,0,0,0.55)", color:"#fff", fontSize:10, fontWeight:700, padding:"3px 8px", borderRadius:4, zIndex:3 }}>BEFORE</div>
                <div style={{ position:"absolute", top:10, right:10, background:"#22A36B", color:"#fff", fontSize:10, fontWeight:700, padding:"3px 8px", borderRadius:4, zIndex:3 }}>AFTER (AI v0)</div>
                <input aria-label="Compare before and after" type="range" min="0" max="100" value={beforeAfterPosition} onChange={(e) => setBeforeAfterPosition(Number(e.target.value))} style={{ position:"absolute", inset:0, width:"100%", height:"100%", opacity:0, cursor:"ew-resize", zIndex:4, margin:0 }} />
                <div aria-hidden="true" style={{ position:"absolute", top:"50%", left:`${beforeAfterPosition}%`, transform:"translate(-50%,-50%)", background:"rgba(255,255,255,0.95)", border:"1px solid #EEDCCB", borderRadius:"50%", width:32, height:32, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, zIndex:3, pointerEvents:"none", fontSize:14 }}>⟷</div>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"#78716C", marginBottom:12 }}><span>Drag to compare</span><span>{beforeAfterPosition}% before</span></div>
              <div style={{ background:"#FBF6F0", border:"1px solid #EEDCCB", borderRadius:12, padding:"14px 16px", marginBottom:14 }}>
                <div style={{ fontWeight:700, fontSize:13, color:"#44403C", marginBottom:8 }}>After this AI pass</div>
                <p style={{ fontSize:12, color:"#57534E", lineHeight:1.6, margin:0 }}>
                  This v0 is a machine first draft. Your <strong>architect or assigned professional</strong> will review it, tighten the layout and materials, and share solid options — you are <strong>not</strong> limited to “our” in-house expert; you keep working with <strong>your</strong> design partner.
                </p>
              </div>
              <div style={{ fontSize:12, fontWeight:600, color:"#44403C", marginBottom:6 }}>Anything to add while they review? <span style={{ fontWeight:400, color:"#78716C" }}>(optional)</span></div>
              <textarea
                value={postAiNotes}
                onChange={(e) => setPostAiNotes(e.target.value.slice(0, 400))}
                placeholder="E.g. prefer matte finishes, keep the puja corner untouched, or share vendor constraints…"
                rows={3}
                style={{ width:"100%", border:"1px solid #E7E5E4", borderRadius:8, padding:"10px 12px", fontSize:13, resize:"vertical", fontFamily:"'DM Sans',sans-serif", boxSizing:"border-box", background:"#FAFAF9" }}
              />
              <div style={{ fontSize:11, color:"#9A8F87", marginTop:4 }}>{postAiNotes.length}/400</div>
            </div>

            {/* Single narrative — replaces rigid included / not-included grid */}
            <div style={{ ...flowSection, marginBottom: 18 }}>
              <div style={{ fontWeight:700, fontSize:15, marginBottom:10 }}>What this concept is (and isn&apos;t)</div>
              <p style={{ fontSize:13, color:"#57534E", lineHeight:1.65, margin:"0 0 14px" }}>
                The preview above is an <strong>AI-generated concept</strong> from your photos and brief — not a final working drawing. Scope (paint, carpentry, civil, services) will be confirmed with your professional after sign-off.
              </p>
              <p style={{ fontSize:13, color:"#57534E", lineHeight:1.65, margin:"0 0 12px" }}>
                Next: <strong>post your project</strong> for quotes from pros — or bring your own team — then manage everything in the project hub.
              </p>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))", gap:12, marginBottom:8 }}>
              {[
                { icon:"✏️", title:"Request tweaks", sub:"Layout, palette, storage, or phasing — your expert updates the brief.", toProject: false },
                { icon:"🔄", title:"Regenerate v0", sub:"Spin another pair of complementary AI directions (2 images in free v0).", toProject: false },
                { icon:"🚀", title:"Go to detailed design", sub:"Lock a direction and open tasks, milestones, and site coordination.", toProject: true },
              ].map(a => (
                <button
                  key={a.title}
                  type="button"
                  onClick={() => {
                    if (a.title === "Regenerate v0") {
                      runRemodelV0();
                      return;
                    }
                    if (!a.toProject) return;
                    if (!v0Generated) {
                      setStepBlockError("Generate your free v0 first — then post the project for quotes.");
                      return;
                    }
                    setStep(6);
                    setMaxStepReached((m) => Math.max(m, 6));
                  }}
                  style={{ display:"flex", alignItems:"flex-start", gap:12, padding:"16px", borderRadius:14, cursor:"pointer", border:"1px solid #E8E4DE", background:"#fff", textAlign:"left", boxShadow:"0 2px 10px rgba(28,25,23,0.04)" }}
                >
                  <span style={{ fontSize:22 }} aria-hidden>{a.icon}</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:700, fontSize:14, marginBottom:4 }}>{a.title}</div>
                    <div style={{ fontSize:12, color:"#7A6E62", lineHeight:1.45 }}>{a.sub}</div>
                  </div>
                  <span style={{ color:OR, fontSize:16, fontWeight:700 }}>→</span>
                </button>
              ))}
            </div>
            </>)}
          </>}

          {/* ═══ STEP 6 — Post project ═══ */}
          {step===6 && <>
            <h1 style={{ ...flowH1Style, marginBottom: 12 }}>
              Post your project
            </h1>
            <p style={{ fontSize: 13, color: "#57534E", margin: "0 0 16px", lineHeight: 1.55, maxWidth: 640 }}>
              Choose how professionals will quote this remodel. Trade RFQs let electricians, plumbers and carpenters price the same checklist so bids are comparable.
            </p>
            <div style={{ marginBottom: 18, maxWidth: 720 }}>
              <HireStrategyPicker
                value={hireMode}
                onChange={(next) => {
                  setHireMode(next);
                  setRemodelFlow({ hireMode: next, hasArchitect: next === "own_team" });
                }}
              />
            </div>
            <div style={{ background: "#F7F3EE", border: "1px solid #E6DFD3", borderRadius: 12, padding: 16, marginBottom: 16, maxHeight: 420, overflow: "auto" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#44403C", marginBottom: 10 }}>Shared remodel specification</div>
              <RemodelSpecView
                dreamVision={dreamVision}
                room={room}
                ptype={ptype}
                len={len}
                breadth={breadth}
                area={area}
                spaceNotes={spaceNotes}
                mainGoal={mainGoal}
                painPoints={painPoints}
                changeLevel={changeLevel}
                budgetLabel={remodelBudgetLabel(budgetUnit, budgetAmount)}
                budgetNotes={budgetNotes}
                startTimeline={startTimeline}
                completionTime={completionTime}
                layoutOk={layoutOk}
                mustKeep={mustKeep}
                dealbreakers3={dealbreakers3}
                styles={styles}
                finishTier={finishTier}
                colourBase={colourBase}
                colourSecondary={colourSecondary}
                postAiNotes={postAiNotes}
                inspirationCount={inspirationImgs.length}
                photoCount={photos.length}
              />
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#44403C", marginBottom: 6 }}>Notes for pros reviewing this project (optional)</div>
            <textarea
              value={architectHandoffNote}
              onChange={(e) => {
                const v = e.target.value.slice(0, 1200);
                setArchitectHandoffNote(v);
                setRemodelFlow({ architectComment: v });
              }}
              placeholder="Access constraints, vendor preferences, or phasing for your professional…"
              rows={4}
              style={{ width: "100%", maxWidth: 640, border: "1px solid #E7E5E4", borderRadius: 8, padding: "10px 12px", fontSize: 13, resize: "vertical", fontFamily: "'DM Sans',sans-serif", boxSizing: "border-box", background: "#FAFAF9" }}
            />
            <p style={{ fontSize: 13, color: "#57534E", lineHeight: 1.55, marginTop: 16, marginBottom: 0 }}>
              Your project hub is where quotes arrive, you compare proposals, onboard your team, and track the remodel through site.
            </p>
          </>}

          <div className="hm-wizard-footer" style={{ marginTop: 44, paddingTop: 28, borderTop: "1px solid #EDE8E0" }}>
            {stepBlockError ? (
              <div role="alert" style={{ marginBottom: 16, fontSize: 13, color: "#B45309", fontWeight: 500, lineHeight: 1.45 }}>
                {stepBlockError}
              </div>
            ) : null}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
              <button
                type="button"
                className="hm-wizard-inline-back"
                onClick={() => (step === 1 ? navigate(wizardExitPath()) : setStep((s) => s - 1))}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 13,
                  color: "#6A5E53",
                  padding: 0,
                  fontWeight: 600,
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                  <path d="m15 18-6-6 6-6" />
                </svg>
                Back
              </button>
              <button
                type="button"
                disabled={(step === 5 && !v0Generated) || projectSaving}
                className="btn-continue text-sm md:text-[15px] !px-6 !py-3 md:!px-8 md:!py-3.5 !shadow-[0_8px_22px_-8px_rgba(200,95,43,0.45)] !rounded-[999px] disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={async () => {
                  setStepBlockError("");
                  if (step === 2 && budgetAmountClampedRemodel(budgetAmount) < 1) {
                    setStepBlockError("Please set a remodel budget above zero (same rule as new home).");
                    return;
                  }
                  if (step === 4) {
                    setStep(5);
                    setMaxStepReached((m) => Math.max(m, 5));
                    return;
                  }
                  if (step === 5) {
                    if (!v0Generated) {
                      setStepBlockError('Run "Generate v0" first — that creates the free pack to share with an architect.');
                      return;
                    }
                    setRemodelFlow({
                      v0: true,
                      hasArchitect: isOwnTeamHire(hireMode),
                      hireMode,
                    });
                    setStep(6);
                    setMaxStepReached((m) => Math.max(m, 6));
                    return;
                  }
                  if (step === 6) {
                    setProjectSaving(true);
                    try {
                      const briefPayload = {
                        ...remodelBriefPayload(),
                        referredProSlug,
                        architectHandoffNote,
                        hireMode,
                        hasArchitect: isOwnTeamHire(hireMode),
                        postAiNotes,
                        step,
                        v0Generated,
                      };
                      const created = await createFlowProjectRecord({
                        projectId: flowProjectId || getRemodelFlow().projectId,
                        flowType: "remodel",
                        brief: briefPayload,
                        source: "remodel",
                        aiPlan: v0PlanBundle,
                        v0Images: v0ImageBundle,
                        v0Plan: v0PlanBundle,
                      });
                      if (!created?.projectId) {
                        setStepBlockError(
                          "Could not save this project. Sign in with email, then try again.",
                        );
                        return;
                      }
                      navigate(projectHubPostedUrl({ source: "remodel", projectId: created.projectId }));
                    } catch (err) {
                      console.error("Failed to persist project from remodel flow:", err);
                      setStepBlockError("Could not save this project to database yet. Please retry.");
                    } finally {
                      setProjectSaving(false);
                    }
                    return;
                  }
                  if (step === 1) {
                    if (!photos.length) {
                      setStepBlockError("Add at least one photo of your existing space.");
                      return;
                    }
                    const vision = String(dreamVision ?? "").trim();
                    if (vision.length < 30) {
                      setStepBlockError("Please describe your vision in a few sentences (30+ characters). Use voice or type — any language is fine.");
                      return;
                    }
                  }
                  if (step < 4) {
                    const next = step + 1;
                    setStep(next);
                    setMaxStepReached((m) => nextMaxStepReached(m, step));
                  }
                }}
              >
                {step === 4 && "Continue to free AI v0"}
                {step === 5 && "Continue to post project"}
                {step === 6 &&
                  (projectSaving
                    ? "Saving & posting…"
                    : hireModeMeta(hireMode).cta)}
                {step < 4 && "Continue"}
                <svg className="arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>

        </main>

        <RightPanel
          step={step}
          dreamVision={dreamVision}
          room={room}
          ptype={ptype}
          len={len}
          breadth={breadth}
          photos={photos}
          spaceNotes={spaceNotes}
          mainGoal={mainGoal}
          changeLevel={changeLevel}
          budgetUnit={budgetUnit}
          budgetAmount={budgetAmount}
          layoutOk={layoutOk}
          mustKeep={mustKeep}
          dealbreakers3={dealbreakers3}
          styles={styles}
          finishTier={finishTier}
          startTimeline={startTimeline}
          completionTime={completionTime}
          colourBase={colourBase}
          colourSecondary={colourSecondary}
        />
      </div>
    </div>
  );
}
