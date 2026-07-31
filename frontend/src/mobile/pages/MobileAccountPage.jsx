import React from "react";
import { useNavigate } from "react-router-dom";
import MobileHeader from "../MobileHeader";
import { useHmSession } from "../../hooks/useHmSession";
import HmUserMenu from "../../components/HmUserMenu";
import { HM_PRO_FLOWS } from "../mobileIA";
import { AUTH_UI_ENABLED } from "../../lib/authMode";
import { getProOnboardingResumePath } from "../../lib/hmAuth";

export default function MobileAccountPage() {
  const navigate = useNavigate();
  const session = useHmSession();
  const name = session?.profile?.name || session?.user?.email || "Guest";
  const isPro = session?.role === "pro";
  const portfolioPath = isPro ? getProOnboardingResumePath() : null;

  return (
    <>
      <MobileHeader title="You" subtitle={session ? name : "Explore BuildGuru"} />
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        {session || !AUTH_UI_ENABLED ? (
          <div className="hm-m-card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontWeight: 700 }}>{name}</div>
              <div style={{ fontSize: 13, color: "#78716C", marginTop: 4 }}>
                {isPro ? "Professional" : "Homeowner"}
              </div>
            </div>
            <HmUserMenu />
          </div>
        ) : AUTH_UI_ENABLED ? (
          <>
            <button type="button" className="hm-m-btn-primary" onClick={() => navigate("/sign-in")}>
              Sign in
            </button>
            <button
              type="button"
              className="hm-m-btn-secondary"
              onClick={() => navigate("/sign-in?mode=signup&role=pro&redirect=%2Fcraft")}
            >
              Join as a pro
            </button>
          </>
        ) : null}

        {(session || !AUTH_UI_ENABLED) && !isPro ? (
          <>
            <p className="hm-m-section-title" style={{ padding: 0, margin: "8px 0 0" }}>
              Projects
            </p>
            <button type="button" className="hm-m-list-row" onClick={() => navigate("/project")}>
              <span className="hm-m-list-icon">📁</span>
              <span>
                <span className="hm-m-list-title">My projects</span>
                <span className="hm-m-list-sub">Build, remodel & site hub</span>
              </span>
            </button>
            <p className="hm-m-section-title" style={{ padding: 0, margin: "8px 0 0" }}>
              Start something new
            </p>
            <button type="button" className="hm-m-list-row" onClick={() => navigate("/build/new-home")}>
              <span className="hm-m-list-icon">🏠</span>
              <span>
                <span className="hm-m-list-title">Start a new home</span>
              </span>
            </button>
            <button type="button" className="hm-m-list-row" onClick={() => navigate("/build/remodel")}>
              <span className="hm-m-list-icon">🎨</span>
              <span>
                <span className="hm-m-list-title">Start a remodel</span>
              </span>
            </button>
          </>
        ) : null}

        {session && isPro ? (
          <>
            <p className="hm-m-section-title" style={{ padding: 0, margin: "8px 0 0" }}>
              Work
            </p>
            <button type="button" className="hm-m-list-row" onClick={() => navigate("/pro")}>
              <span className="hm-m-list-icon">📊</span>
              <span>
                <span className="hm-m-list-title">My projects</span>
                <span className="hm-m-list-sub">Leads & jobs dashboard</span>
              </span>
            </button>
            <button type="button" className="hm-m-list-row" onClick={() => navigate(portfolioPath || "/portfolio")}>
              <span className="hm-m-list-icon">🛠️</span>
              <span>
                <span className="hm-m-list-title">Edit portfolio</span>
              </span>
            </button>
          </>
        ) : null}

        {session ? (
          <>
            <p className="hm-m-section-title" style={{ padding: 0, margin: "8px 0 0" }}>
              Account
            </p>
            <button type="button" className="hm-m-list-row" onClick={() => navigate("/subscriptions")}>
              <span className="hm-m-list-icon">💳</span>
              <span>
                <span className="hm-m-list-title">My subscription</span>
              </span>
            </button>
            <button type="button" className="hm-m-list-row" onClick={() => navigate("/account/settings")}>
              <span className="hm-m-list-icon">⚙️</span>
              <span>
                <span className="hm-m-list-title">Account & settings</span>
              </span>
            </button>
          </>
        ) : null}

        {!isPro && (!session || !AUTH_UI_ENABLED) ? (
          <>
            <p className="hm-m-section-title" style={{ padding: 0, margin: "8px 0 0" }}>
              Professional
            </p>
            {HM_PRO_FLOWS.map((flow) => (
              <button key={flow.id} type="button" className="hm-m-list-row" onClick={() => navigate(flow.path)}>
                <span className="hm-m-list-icon">🛠️</span>
                <span>
                  <span className="hm-m-list-title">{flow.label}</span>
                  <span className="hm-m-list-sub">{flow.sub}</span>
                </span>
              </button>
            ))}
          </>
        ) : null}
      </div>
    </>
  );
}
