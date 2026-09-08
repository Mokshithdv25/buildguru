import {
  Armchair,
  Building2,
  ConstructionIcon,
  DraftingCompass,
  Droplets,
  Hammer,
  Layers,
  PackageSearch,
  PaintBucket,
  Zap,
} from "lucide-react";

/**
 * Work package catalog — the trade-scoped RFQs a homeowner can post from a
 * project. Each type knows which professional crafts may bid, the default
 * pricing basis, and a scope checklist tuned to Indian residential builds so a
 * homeowner never starts from a blank page and every bidder prices the same
 * lines (which is what makes bids comparable).
 *
 * Keep `id` values and `crafts` in sync with:
 *   - db/buildguru_work_packages.sql (package_type check constraint)
 *   - frontend/src/lib/crafts.js (craft ids)
 */

export const PRICING_BASIS = {
  turnkey: { label: "Turnkey (labour + material)", short: "Turnkey", hint: "The professional supplies material and labour." },
  labour_only: { label: "Labour only", short: "Labour only", hint: "You buy material; the professional charges for work." },
  material_only: { label: "Material supply only", short: "Supply only", hint: "Delivery of specified material to site." },
  design_fee: { label: "Design fee", short: "Design fee", hint: "Professional fee for drawings, design and site visits." },
  open: { label: "Let professionals propose", short: "Open", hint: "Bidders state their own basis." },
};

export const WORK_PACKAGE_STATUS = {
  draft: { label: "Draft", tone: "muted" },
  open: { label: "Open for bids", tone: "positive" },
  under_review: { label: "Reviewing bids", tone: "warning" },
  awarded: { label: "Awarded", tone: "accent" },
  closed: { label: "Closed", tone: "muted" },
  cancelled: { label: "Cancelled", tone: "muted" },
};

const item = (label, quantity = "", unit = "", notes = "") => ({ label, quantity, unit, notes });

export const WORK_PACKAGE_TYPES = {
  design: {
    id: "design",
    label: "Architecture & interior design",
    short: "Design",
    crafts: ["architect", "designer"],
    pricingBasis: "design_fee",
    Icon: DraftingCompass,
    tint: "#FBE5D4",
    color: "#C85F2B",
    description: "Concept, working drawings, 3D views and approval support.",
    scopeTemplate: [
      item("Site measurement and existing-conditions survey"),
      item("Concept plan options", "2", "rounds", "Layout alternatives before locking a direction"),
      item("3D views for key spaces", "4", "views"),
      item("Working drawings — architectural, with structural coordination", "1", "set"),
      item("Electrical and plumbing layout drawings", "1", "set"),
      item("Municipal approval drawing set", "1", "set"),
      item("Material and finish specification schedule", "1", "document"),
      item("Site visits during execution", "6", "visits"),
    ],
    inclusionsHint: "Number of revision rounds, who prepares approval drawings, site-visit count.",
    exclusionsHint: "Government fees, structural design, MEP consultant fees.",
  },
  structural: {
    id: "structural",
    label: "Structural engineering",
    short: "Structural",
    crafts: ["engineer"],
    pricingBasis: "design_fee",
    Icon: Building2,
    tint: "#E6EBF1",
    color: "#4A6B8B",
    description: "Soil-based foundation design, RCC detailing, bar-bending schedules.",
    scopeTemplate: [
      item("Structural design based on soil report and architectural drawings"),
      item("Foundation and footing drawings", "1", "set"),
      item("Column, beam and slab RCC detailing", "1", "set"),
      item("Bar-bending schedule and steel quantity", "1", "document"),
      item("Staircase, lintel and sunshade details"),
      item("Site inspections at key pours", "4", "visits"),
    ],
    inclusionsHint: "Soil test arrangement, number of inspections, revisions if architecture changes.",
    exclusionsHint: "Soil testing charges, municipal structural stability certificate fees.",
  },
  construction: {
    id: "construction",
    label: "Civil construction (shell & core)",
    short: "Civil",
    crafts: ["contractor"],
    pricingBasis: "turnkey",
    Icon: ConstructionIcon,
    tint: "#FDF0D8",
    color: "#B98A2C",
    description: "Foundation to plastered shell — the main construction contract.",
    scopeTemplate: [
      item("Excavation, PCC and foundation as per structural drawings"),
      item("RCC framework — columns, beams, slabs", "", "", "Specify concrete grade, e.g. M25"),
      item("Brickwork or block work (specify red brick / AAC)", "", "sq ft"),
      item("Internal and external plastering", "", "sq ft"),
      item("Waterproofing — terrace, bathrooms, sunken slabs"),
      item("Flooring base (PCC / screed) ready for tiling"),
      item("Compound wall and gate"),
      item("Debris removal and site cleaning at handover"),
    ],
    inclusionsHint: "Material brands (cement, steel), water and power at site, scaffolding, curing.",
    exclusionsHint: "Tiles, sanitaryware, electrical fittings, painting, interiors, approvals.",
  },
  interiors: {
    id: "interiors",
    label: "Interiors & modular",
    short: "Interiors",
    crafts: ["designer", "carpenter", "contractor"],
    pricingBasis: "turnkey",
    Icon: Armchair,
    tint: "#F1EBE3",
    color: "#8B7E6E",
    description: "Modular kitchen, wardrobes, false ceiling and storage.",
    scopeTemplate: [
      item("Modular kitchen — base and wall units", "", "running ft", "Countertop material, shutters, hardware brand"),
      item("Wardrobes (sliding / hinged) per bedroom", "", "sq ft"),
      item("TV unit and living-room storage"),
      item("False ceiling — gypsum / POP with cove lighting", "", "sq ft"),
      item("Study / pooja unit / crockery unit"),
      item("Loose furniture (optional)"),
    ],
    inclusionsHint: "Plywood grade (BWP/MR), laminate or veneer, hardware brand (Hettich/Hafele), warranty.",
    exclusionsHint: "Appliances, countertop stone, electrical points, painting.",
  },
  carpentry: {
    id: "carpentry",
    label: "Carpentry & woodwork",
    short: "Carpentry",
    crafts: ["carpenter"],
    pricingBasis: "labour_only",
    Icon: Hammer,
    tint: "#F1EBE3",
    color: "#8B5E3C",
    description: "Doors, windows, frames, lofts and site-built woodwork.",
    scopeTemplate: [
      item("Main door with frame", "1", "nos", "Teak / engineered — specify"),
      item("Internal doors with frames", "", "nos", "Flush / laminated"),
      item("Windows and shutters (wood / UPVC)", "", "nos"),
      item("Loft shutters and overhead storage", "", "sq ft"),
      item("Kitchen carcass and shutters (if site-built)", "", "sq ft"),
      item("Hardware — hinges, channels, handles", "", "", "Brand"),
    ],
    inclusionsHint: "Plywood grade, laminate brand, hardware, polish or PU finish.",
    exclusionsHint: "Glass, locks, painting, electrical cut-outs.",
  },
  electrical: {
    id: "electrical",
    label: "Electrical",
    short: "Electrical",
    crafts: ["electrician"],
    pricingBasis: "turnkey",
    Icon: Zap,
    tint: "#FDF0D8",
    color: "#D19A2A",
    description: "Concealed wiring, points, DB, earthing and fixtures.",
    scopeTemplate: [
      item("Concealed conduit wiring — FRLS copper", "", "", "Wire brand, e.g. Polycab / Havells"),
      item("Light, fan and 5A / 15A socket points", "", "points", "Count per room"),
      item("Distribution board with MCBs and RCCB", "1", "nos"),
      item("Earthing and lightning protection"),
      item("AC and geyser points", "", "points"),
      item("Inverter / UPS wiring and changeover"),
      item("Data, TV and CCTV conduits"),
      item("Switches and plates", "", "", "Brand and series"),
    ],
    inclusionsHint: "Wire and switch brands, number of points, DB make, testing.",
    exclusionsHint: "Light fixtures, fans, appliances, meter connection charges.",
  },
  plumbing: {
    id: "plumbing",
    label: "Plumbing & sanitary",
    short: "Plumbing",
    crafts: ["plumber"],
    pricingBasis: "turnkey",
    Icon: Droplets,
    tint: "#E9EEF3",
    color: "#5A7B93",
    description: "Water lines, drainage, fixtures and tanks.",
    scopeTemplate: [
      item("Concealed CPVC / UPVC lines — hot and cold", "", "", "Pipe brand"),
      item("Bathroom fixture installation — WC, basin, shower, faucets", "", "bathrooms"),
      item("Kitchen sink, RO and dishwasher points"),
      item("Overhead tank, pump and sump connections"),
      item("Drainage, soil lines and floor traps"),
      item("Rainwater harvesting / STP tie-in"),
      item("Pressure testing and leak check before closing walls"),
    ],
    inclusionsHint: "Pipe brand, whether sanitaryware and CP fittings are supplied, testing.",
    exclusionsHint: "Sanitaryware, tiles, civil chasing and making good, water connection fees.",
  },
  painting: {
    id: "painting",
    label: "Painting & finishes",
    short: "Painting",
    crafts: ["painter"],
    pricingBasis: "turnkey",
    Icon: PaintBucket,
    tint: "#FBE5D4",
    color: "#C85F2B",
    description: "Putty, primer, interior and exterior paint, polish.",
    scopeTemplate: [
      item("Wall putty (2 coats) and primer", "", "sq ft"),
      item("Interior emulsion — 2 coats", "", "sq ft", "Brand and grade, e.g. Asian Royale"),
      item("Exterior weatherproof paint", "", "sq ft"),
      item("Texture or accent walls", "", "walls"),
      item("Wood polish / PU for doors and furniture"),
      item("Grill and metal enamel"),
    ],
    inclusionsHint: "Paint brand and grade, number of coats, scaffolding, masking and cleanup.",
    exclusionsHint: "Wall repairs beyond hairline cracks, wallpaper, waterproofing.",
  },
  materials: {
    id: "materials",
    label: "Materials supply",
    short: "Materials",
    crafts: ["contractor", "carpenter", "electrician", "plumber", "painter"],
    pricingBasis: "material_only",
    Icon: Layers,
    tint: "#EEF3EC",
    color: "#3F7A55",
    description: "Bulk supply quotes for cement, steel, tiles, fittings and more.",
    scopeTemplate: [
      item("Cement", "", "bags", "Grade and brand"),
      item("TMT steel Fe500D", "", "tonnes"),
      item("River sand / M-sand and aggregates", "", "units"),
      item("Bricks / AAC blocks", "", "nos"),
      item("Floor and wall tiles", "", "sq ft", "Brand, size, finish"),
      item("Sanitaryware and CP fittings", "", "sets"),
      item("Electrical wires and switches"),
      item("Paint"),
    ],
    inclusionsHint: "Delivery to site, unloading, GST, replacement of damaged goods.",
    exclusionsHint: "Storage at site, wastage above agreed percentage.",
  },
  other: {
    id: "other",
    label: "Other work",
    short: "Other",
    crafts: [],
    pricingBasis: "open",
    Icon: PackageSearch,
    tint: "#F0EFEE",
    color: "#6B645E",
    description: "Landscaping, solar, home automation, or anything not listed.",
    scopeTemplate: [item("Describe the work to be priced")],
    inclusionsHint: "",
    exclusionsHint: "",
  },
};

export const WORK_PACKAGE_TYPE_ORDER = [
  "design", "structural", "construction", "interiors", "carpentry",
  "electrical", "plumbing", "painting", "materials", "other",
];

export function workPackageType(id) {
  return WORK_PACKAGE_TYPES[id] || WORK_PACKAGE_TYPES.other;
}

export function workPackageStatus(status) {
  return WORK_PACKAGE_STATUS[status] || WORK_PACKAGE_STATUS.draft;
}

export function pricingBasisLabel(id, short = false) {
  const entry = PRICING_BASIS[id] || PRICING_BASIS.open;
  return short ? entry.short : entry.label;
}

let scopeCounter = 0;
export function newScopeItemId() {
  scopeCounter += 1;
  return `s${Date.now().toString(36)}${scopeCounter.toString(36)}`;
}

/** Deep-copy a template into editable scope items with ids. */
export function templateScopeItems(typeId) {
  return workPackageType(typeId).scopeTemplate.map((row) => ({ id: newScopeItemId(), ...row }));
}

// ---------------------------------------------------------------------------
// Suggestions from the project brief and AI estimate
// ---------------------------------------------------------------------------

const ESTIMATE_KEYWORDS = [
  ["design", /design|architect|drawing/i],
  ["structural", /structur(e|al)\b(?!.*shell)|foundation/i],
  ["construction", /structure & shell|shell|civil|rcc|brick|masonry|plaster|demolition|site prep|facade|exterior/i],
  ["interiors", /interior|kitchen|wardrobe|modular|false ceiling|furniture/i],
  ["carpentry", /carpentry|wood|door|window/i],
  ["electrical", /electric|lighting|wiring/i],
  ["plumbing", /plumb|sanitary|water|drain/i],
  ["painting", /paint|finish/i],
  ["materials", /material|supply|tiles?\b|cement|steel/i],
];

function estimateBucketsByType(estimateLines = []) {
  const buckets = {};
  estimateLines.forEach((line) => {
    const label = String(line?.label || "");
    const amount = Number(line?.amount_inr) || 0;
    if (!label || amount <= 0) return;
    const hits = ESTIMATE_KEYWORDS.filter(([, re]) => re.test(label)).map(([type]) => type);
    // "Services (MEP rough-in)" style lines split evenly across the trades they name.
    const services = /mep|services/i.test(label) ? ["electrical", "plumbing"] : [];
    const targets = [...new Set([...hits, ...services])];
    if (!targets.length) return;
    const share = amount / targets.length;
    targets.forEach((type) => {
      buckets[type] = buckets[type] || { amount: 0, labels: [] };
      buckets[type].amount += share;
      buckets[type].labels.push(label);
    });
  });
  return buckets;
}

const ROOM_TRADES = {
  kitchen: ["interiors", "plumbing", "electrical", "painting", "construction"],
  bathroom: ["plumbing", "construction", "electrical", "painting"],
  bedroom: ["interiors", "electrical", "painting", "carpentry"],
  living: ["interiors", "electrical", "painting"],
  "whole home": ["design", "construction", "interiors", "electrical", "plumbing", "painting", "carpentry"],
  home: ["design", "construction", "interiors", "electrical", "plumbing", "painting", "carpentry"],
  exterior: ["construction", "painting"],
  terrace: ["construction", "plumbing", "painting"],
};

function tradesForRemodelRoom(room) {
  const key = String(room || "").toLowerCase();
  const match = Object.keys(ROOM_TRADES).find((k) => key.includes(k));
  return match ? ROOM_TRADES[match] : ["design", "construction", "interiors", "electrical", "plumbing", "painting"];
}

/**
 * Propose work packages for a project. Returns an ordered array of
 * { type, title, reason, budgetHintInr, scopeItems, pricingBasis }.
 */
export function suggestWorkPackages({ flowType, brief = {}, estimate = null, existingTypes = [], hireMode = null } = {}) {
  const mode = hireMode || brief?.hireMode || brief?.hire_mode;
  if (mode === "own_team") return [];

  const isRemodel = flowType === "remodel";
  const buckets = estimateBucketsByType(estimate?.estimate_lines || []);
  const room = brief?.room || brief?.homeType || "";
  const projectLabel = isRemodel ? `${room || "home"} remodel` : "new home";

  let types;
  if (mode === "design_first") {
    types = ["design"];
  } else if (isRemodel) {
    types = tradesForRemodelRoom(room);
  } else {
    types = ["design", "structural", "construction", "electrical", "plumbing", "carpentry", "interiors", "painting", "materials"];
  }

  const reasons = {
    design: brief?.hasArchitect ? "" : "No architect on the project yet — get drawings before anyone prices construction.",
    structural: "Required for RCC drawings and municipal approvals on a new build.",
    construction: isRemodel ? "Civil changes: chasing, tiling, waterproofing and making good." : "The main shell contract — usually the largest bid.",
    interiors: isRemodel ? `Modular and storage work for the ${room || "space"}.` : "Modular kitchen, wardrobes and ceilings once the shell is up.",
    carpentry: "Doors, windows and site-built woodwork.",
    electrical: "Points, wiring and DB — best quoted from the design layout.",
    plumbing: "Lines, drainage and fixtures — quote before walls close.",
    painting: "Putty, primer and finishing coats at the end of the schedule.",
    materials: "Compare bulk supply rates for cement, steel and tiles separately from labour.",
  };

  return types
    .filter((type) => !existingTypes.includes(type))
    .map((type) => {
      const meta = workPackageType(type);
      const bucket = buckets[type];
      return {
        type,
        title: `${meta.label} — ${projectLabel}`,
        reason: reasons[type] || meta.description,
        budgetHintInr: bucket ? Math.round(bucket.amount / 1000) * 1000 : null,
        estimateLabels: bucket ? bucket.labels : [],
        scopeItems: templateScopeItems(type),
        pricingBasis: meta.pricingBasis,
      };
    });
}

/** Human-friendly due-date state for a package. */
export function dueState(bidsDueAt, status) {
  if (!bidsDueAt) return { label: status === "open" ? "No deadline" : "", tone: "muted", overdue: false };
  const due = new Date(bidsDueAt);
  if (Number.isNaN(due.getTime())) return { label: "", tone: "muted", overdue: false };
  const ms = due.getTime() - Date.now();
  const days = Math.ceil(ms / 86400000);
  if (ms < 0) return { label: "Bidding closed", tone: "muted", overdue: true };
  if (days <= 1) return { label: "Due today", tone: "warning", overdue: false };
  if (days <= 3) return { label: `Due in ${days} days`, tone: "warning", overdue: false };
  return { label: `Due in ${days} days`, tone: "positive", overdue: false };
}

export function formatDateShort(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/** Sum bid line items; falls back to null when there are none. */
/**
 * Precise rupee formatting for bid comparison. `formatInrShort` rounds to
 * whole lakhs, which hides the difference between competing bids.
 */
export function formatInrExact(amountInr) {
  const n = Number(amountInr);
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2).replace(/\.?0+$/, "")} Cr`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

export function sumLineItems(lineItems = []) {
  const total = (lineItems || []).reduce((sum, row) => sum + (Number(row?.amount_inr) || 0), 0);
  return total > 0 ? total : null;
}
