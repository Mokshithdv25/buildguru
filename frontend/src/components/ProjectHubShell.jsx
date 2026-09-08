import React, { useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import LandingNavbar from "./landing/LandingNavbar";
import {
  HM_FIXED_NAV_OFFSET_TAGLINE_CLASS,
  HM_TAGLINE_PROJECT_HUB,
  hmProjectHubPageBackground,
  hmProjectSidebarAsideStyle,
  hmProjectSidebarFooterStyle,
  hmProjectSidebarNavItemStyle,
  hmProjectSidebarNavScrollStyle,
  hmProjectSidebarProjectCardStyle,
} from "../lib/hmBrand";
import { PROJECT_HUB_NAV, hubNavActive } from "../lib/projectHubNav";

const OR = "#C85F2B";

export default function ProjectHubShell({ children, hubQuery: hubQueryProp }) {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const currentTab = new URLSearchParams(search).get("tab") || "";
  const shellFont = { fontFamily: "'DM Sans','Inter',sans-serif", color: "#1C1917" };

  const hubQuery = useMemo(() => {
    if (hubQueryProp != null && hubQueryProp !== "") return hubQueryProp.startsWith("?") ? hubQueryProp : `?${hubQueryProp}`;
    const pid = new URLSearchParams(search).get("projectId");
    if (!pid) return "";
    const src = new URLSearchParams(search).get("source");
    return `?projectId=${encodeURIComponent(pid)}${src ? `&source=${encodeURIComponent(src)}` : ""}`;
  }, [hubQueryProp, search]);

  const goNav = (item) => {
    if (item?.tab) {
      const params = new URLSearchParams(hubQuery.replace(/^\?/, ""));
      params.set("tab", item.tab);
      navigate(`/project?${params.toString()}`);
      return;
    }
    if (item?.path && item.path !== "#") navigate(`${item.path}${hubQuery}`);
  };

  return (
    <div className={HM_FIXED_NAV_OFFSET_TAGLINE_CLASS} style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: hmProjectHubPageBackground, ...shellFont }}>
      <div className="hm-desktop-only">
        <LandingNavbar tagline={HM_TAGLINE_PROJECT_HUB} />
      </div>
      <div style={{ display: "flex", flex: 1, minWidth: 0, minHeight: 0 }}>
        <aside style={hmProjectSidebarAsideStyle} className="hm-project-sidebar hm-desktop-only">
          <div style={{ padding: "14px 20px 8px", fontSize: 10, fontWeight: 700, color: "#9A8F87", letterSpacing: "0.08em" }}>PROJECTS</div>
          <div style={{ padding: "0 10px 8px" }}>
            <div
              style={hmProjectSidebarProjectCardStyle}
              onClick={() => navigate(`/project${hubQuery || ""}`)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") navigate(`/project${hubQuery || ""}`);
              }}
              role="button"
              tabIndex={0}
            >
              <div style={{ fontWeight: 700, fontSize: 13, color: OR }}>Active project</div>
              <div style={{ fontSize: 11, color: "#9A8F87" }}>Open project hub overview</div>
            </div>
          </div>
          <nav style={hmProjectSidebarNavScrollStyle}>
            {PROJECT_HUB_NAV.map((n) => (
              <div
                key={n.label}
                role="button"
                tabIndex={0}
                onClick={() => goNav(n)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") goNav(n);
                }}
                style={hmProjectSidebarNavItemStyle(hubNavActive(pathname, n.path, n.tab, currentTab))}
              >
                <n.icon size={16} strokeWidth={hubNavActive(pathname, n.path, n.tab, currentTab) ? 2.1 : 1.8} style={{ flexShrink: 0 }} aria-hidden />
                {n.label}
              </div>
            ))}
          </nav>
          <div style={hmProjectSidebarFooterStyle}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Need Help?</div>
            <div style={{ fontSize: 11, color: "#7A6E62", marginBottom: 10 }}>Chat with our team to find the right expert.</div>
            <button type="button" style={{ width: "100%", background: OR, color: "#fff", border: "none", borderRadius: 8, padding: "9px 0", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
              💬 Start Chat
            </button>
          </div>
        </aside>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: "#fff", overflowY: "auto", overflowX: "hidden", minHeight: 0 }}>{children}</div>
      </div>
    </div>
  );
}
