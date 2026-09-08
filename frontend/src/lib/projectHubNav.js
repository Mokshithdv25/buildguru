/**
 * Sidebar destinations for project hub pages (Documents, Team, Shop, Find Pros, etc.).
 * Paths must match App.js routes.
 */
export const PROJECT_HUB_NAV = [
  { icon: LayoutGrid, label: "Overview", path: "/project" },
  { icon: Inbox, label: "Bids", path: "#", tab: "Bids" },
  { icon: CalendarDays, label: "Timeline", path: "#", tab: "Timeline" },
  { icon: ListChecks, label: "Tasks", path: "#", tab: "Tasks" },
  { icon: WalletCards, label: "Budget", path: "#", tab: "Budget" },
  { icon: CreditCard, label: "Payments", path: "/project/payments" },
  { icon: Camera, label: "Site Feed", path: "#", tab: "Site Feed" },
  { icon: FileText, label: "Documents", path: "/documents" },
  { icon: Compass, label: "Design journey", path: "/project/journey" },
  { icon: ShoppingCart, label: "Shop", path: "/project/shop" },
  { icon: HardHat, label: "Find Pros", path: "/project/browse" },
  { icon: Users, label: "Team", path: "/team" },
  { icon: Settings, label: "Settings", path: "#" },
];

/** Whether a sidebar item should render as active for the current pathname. */
export function hubNavActive(pathname, itemPath, itemTab = "", currentTab = "") {
  if (itemTab) return pathname === "/project" && currentTab === itemTab;
  if (!itemPath || itemPath === "#") return false;
  if (itemPath === "/project/browse") return pathname === "/project/browse" || pathname === "/marketplace";
  return pathname === itemPath;
}
import { CalendarDays, Camera, Compass, CreditCard, FileText, HardHat, Inbox, LayoutGrid, ListChecks, Settings, ShoppingCart, Users, WalletCards } from "lucide-react";
