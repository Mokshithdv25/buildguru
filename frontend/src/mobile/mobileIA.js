/**
 * Mobile IA: Houzz-style shell + BuildGuru product flows.
 *
 * Framework (inspired by Houzz):
 *   bottom tabs · search-first discovery · saved boards · project hub · profile
 *
 * Our details (already on desktop):
 *   One project entry · Indian-home inspiration · Marketplace · Project PM · Pro portfolio onboarding
 */

export const MOBILE_TABS = [
  { id: "home", label: "Home", path: "/" },
  { id: "design", label: "Ideas", path: "/design" },
  { id: "pros", label: "Pros", path: "/browse" },
  { id: "project", label: "Project", path: "/project" },
  { id: "you", label: "You", path: "/account" },
];

/** Curated directions from the same Indian-home library used on desktop. */
export const INDIAN_HOME_STYLES = [
  {
    id: "kerala",
    title: "Kerala & coastal",
    subtitle: "Sloping roofs, courtyards and breeze-friendly plans",
    image: "arch_kerala.png",
  },
  {
    id: "traditional",
    title: "Traditional warmth",
    subtitle: "Courtyards, jaalis and craft-forward facades",
    image: "arch_traditional.png",
  },
  {
    id: "modern",
    title: "Modern metro",
    subtitle: "Clean lines for Bengaluru, Mumbai and Hyderabad",
    image: "arch_modern.png",
  },
  {
    id: "colonial",
    title: "Heritage & colonial",
    subtitle: "Verandahs, lime finishes and timeless proportions",
    image: "arch_colonial.png",
  },
  {
    id: "fusion",
    title: "Fusion & eclectic",
    subtitle: "Regional character with a contemporary shell",
    image: "arch_fusion.png",
  },
];

export const INDIAN_ROOM_IDEAS = [
  { id: "living", title: "Living rooms", image: "theme_living_room.png" },
  { id: "kitchen", title: "Kitchens", image: "theme_kitchen.png" },
  { id: "bedroom", title: "Bedrooms", image: "theme_bedroom.png" },
  { id: "puja", title: "Puja rooms", image: "theme_puja_room.png" },
];

/** Pro-side flow (You tab). */
export const HM_PRO_FLOWS = [
  {
    id: "portfolio",
    label: "Build your portfolio",
    sub: "Craft → details → theme → photos → go live",
    path: "/craft",
  },
  {
    id: "pro-dashboard",
    label: "Pro dashboard",
    sub: "Leads & profile strength",
    path: "/pro",
  },
];

/** Indian home context — room filters for pro portfolio discovery on Home. */
export const INDIAN_ROOM_FILTERS = [
  { id: "all", label: "All work" },
  { id: "architect", label: "Architects", craft: "architect" },
  { id: "contractor", label: "Contractors", craft: "contractor" },
  { id: "kitchen", label: "Modular kitchen", craft: null },
  { id: "puja", label: "Puja room", craft: null },
  { id: "villa", label: "Villas & plots", craft: "architect" },
];

export function flowTypeLabel(flowType, source) {
  if (flowType === "remodel" || source === "remodel") return "Remodel";
  if (flowType === "new_home" || source === "build-new") return "New home build";
  return "Home project";
}

export function projectStatusLabel(status) {
  if (status === "v0_ready") return "AI v0 ready";
  if (status === "submitted") return "Brief submitted";
  if (status === "active") return "On site";
  return status || "In progress";
}
