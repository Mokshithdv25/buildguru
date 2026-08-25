import React from "react";
import { useNavigate } from "react-router-dom";
import {
  BriefcaseBusiness,
  ChevronRight,
  CreditCard,
  FolderKanban,
  Hammer,
  HousePlus,
  Images,
  LayoutDashboard,
  Settings,
  ShoppingBag,
  UserRound,
} from "lucide-react";
import MobileHeader from "../MobileHeader";
import { useHmSession } from "../../hooks/useHmSession";
import HmUserMenu from "../../components/HmUserMenu";
import { AUTH_UI_ENABLED } from "../../lib/authMode";
import { getProOnboardingResumePath } from "../../lib/hmAuth";

function AccountRow({ icon: Icon, title, sub, onClick }) {
  return (
    <button type="button" className="hm-m-account-row" onClick={onClick}>
      <span><Icon size={20} /></span>
      <span><strong>{title}</strong>{sub ? <small>{sub}</small> : null}</span>
      <ChevronRight size={18} aria-hidden />
    </button>
  );
}

export default function MobileAccountPage() {
  const navigate = useNavigate();
  const session = useHmSession();
  const name = session?.profile?.name || session?.user?.email || "Guest";
  const isPro = session?.role === "pro";
  const portfolioPath = isPro ? getProOnboardingResumePath() : null;

  return (
    <>
      <MobileHeader title="You" subtitle={session ? name : "Explore BuildGuru"} />
      <main className="hm-m-account-page">
        {session || !AUTH_UI_ENABLED ? (
          <section className="hm-m-account-profile">
            <span className="hm-m-account-avatar"><UserRound size={25} /></span>
            <div>
              <strong>{name}</strong>
              <small>{isPro ? "Professional workspace" : "Homeowner workspace"}</small>
            </div>
            <HmUserMenu />
          </section>
        ) : AUTH_UI_ENABLED ? (
          <section className="hm-m-account-signin">
            <span>Your work, waiting for you</span>
            <h1>Sign in to resume projects and portfolios.</h1>
            <p>Your project brief, saved ideas and professional work stay connected to your account.</p>
            <div><button type="button" className="hm-m-btn-primary" onClick={() => navigate("/sign-in")}>Sign in</button><button type="button" className="hm-m-btn-secondary" onClick={() => navigate("/join")}>Create account</button></div>
          </section>
        ) : null}

        {(session || !AUTH_UI_ENABLED) && !isPro ? (
          <section className="hm-m-account-group">
            <h2>Your workspace</h2>
            <AccountRow icon={FolderKanban} title="My projects" sub="Briefs, designs, team and site work" onClick={() => navigate("/project")} />
            <AccountRow icon={Images} title="Ideas" sub="Indian-home inspiration and saved directions" onClick={() => navigate("/design")} />
            <AccountRow icon={ShoppingBag} title="Materials" sub="Project-aware checklists and approvals" onClick={() => navigate("/shop")} />
            <AccountRow icon={HousePlus} title="Start another project" sub="New home or remodel" onClick={() => navigate("/build")} />
          </section>
        ) : null}

        {session && isPro ? (
          <section className="hm-m-account-group">
            <h2>Your professional workspace</h2>
            <AccountRow icon={LayoutDashboard} title="Dashboard" sub="Leads, jobs and profile strength" onClick={() => navigate("/pro")} />
            <AccountRow icon={BriefcaseBusiness} title="Edit portfolio" sub="Photos, specialties and public profile" onClick={() => navigate(portfolioPath || "/portfolio")} />
            <AccountRow icon={Hammer} title="Leads" sub="Review homeowner opportunities" onClick={() => navigate("/pro/leads")} />
          </section>
        ) : null}

        {session ? (
          <section className="hm-m-account-group">
            <h2>Account</h2>
            <AccountRow icon={CreditCard} title="Subscription" onClick={() => navigate("/subscriptions")} />
            <AccountRow icon={Settings} title="Account & settings" onClick={() => navigate("/account/settings")} />
          </section>
        ) : null}

        {!isPro && (!session || !AUTH_UI_ENABLED) ? (
          <section className="hm-m-account-pro-callout">
            <span><BriefcaseBusiness size={22} /></span>
            <div><small>Are you a professional?</small><strong>Build a portfolio that proves your work.</strong></div>
            <button type="button" onClick={() => navigate(session || !AUTH_UI_ENABLED ? "/craft" : "/pro/join")}><ChevronRight size={19} /></button>
          </section>
        ) : null}
      </main>
    </>
  );
}
