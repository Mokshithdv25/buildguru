import React, { useEffect, useMemo, useState } from "react";
import { ArrowRight, BriefcaseBusiness, ClipboardCheck, ExternalLink, FolderKanban, MessageSquareText, PackageSearch, Pencil, Share2, Sparkles, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import LandingNavbar from "../components/landing/LandingNavbar";
import HmHomiMascot from "../components/HmHomiMascot";
import HmProAssistant from "../components/HmProAssistant";
import HmCommandCenter from "../components/HmCommandCenter";
import { HM_FIXED_NAV_OFFSET_CLASS } from "../lib/hmBrand";
import { useHmSession } from "../hooks/useHmSession";
import { useMobileNative } from "../hooks/useMobileNative";
import { getProOnboardingResumePath, getProPublicProfilePath, readProPortfolioState } from "../lib/hmAuth";
import { getPortfolioMedia } from "../lib/portfolioStorage";
import { findCraft } from "../lib/crafts";
import { publicProfileUrl } from "../lib/publicWebUrl";
import { formatInrShort } from "../lib/projectFlowApi";
import { leadStatusLabel, listProLeads } from "../lib/proLeadsApi";
import { listWorkPackageEvents, listWorkPackageOpportunities } from "../lib/workPackagesApi";
import { dueState, workPackageType } from "../lib/workPackageCatalog";
import "./ProWorkspace.css";

function readPortfolioCache() {
  try {
    const raw = localStorage.getItem("hm_portfolio");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function Metric({ icon: Icon, label, value, detail }) {
  return (
    <article className="hm-pro-card hm-pro-metric">
      <div className="hm-pro-metric-top"><span className="hm-pro-metric-label">{label}</span><span className="hm-pro-metric-icon"><Icon size={17} /></span></div>
      <strong className="hm-pro-metric-value">{value}</strong>
      <span className="hm-pro-metric-detail">{detail}</span>
    </article>
  );
}

function leadBudget(lead) {
  const max = lead?.budget_max || lead?.budget_min;
  return max ? formatInrShort(max) : "Budget to discuss";
}

export default function ProDashboard() {
  const navigate = useNavigate();
  const mobileNative = useMobileNative();
  const session = useHmSession();
  const portfolioState = readProPortfolioState();
  const cache = useMemo(readPortfolioCache, []);
  const media = cache?.id ? getPortfolioMedia(cache.id) : { photos: [] };
  const firstName = (session?.profile?.name || cache?.full_name || session?.profile?.email?.split("@")[0] || "there").split(" ")[0];
  const isPublished = Boolean(cache?.published && cache?.slug);
  const profilePath = isPublished ? getProPublicProfilePath() : null;
  const profileStrength = Math.min(100, Number(cache?.profile_strength) || (isPublished ? 100 : portfolioState.step * 20));
  const craft = findCraft(cache?.craft);
  const shareUrl = isPublished ? publicProfileUrl(profilePath?.split("/").filter(Boolean).pop()) : "";
  const galleryCount = Array.isArray(media?.photos) ? media.photos.length : 0;
  const [leads, setLeads] = useState([]);
  const [leadsConfigured, setLeadsConfigured] = useState(true);
  const [leadsLoading, setLeadsLoading] = useState(true);
  const [leadError, setLeadError] = useState("");
  const [copied, setCopied] = useState(false);
  const [workPackages, setWorkPackages] = useState([]);
  const [workPackageEvents, setWorkPackageEvents] = useState([]);

  useEffect(() => {
    let active = true;
    Promise.all([
      listWorkPackageOpportunities(cache?.id).catch(() => ({ packages: [] })),
      listWorkPackageEvents({ unreadOnly: true, limit: 10 }).catch(() => ({ events: [] })),
    ]).then(([oppResult, eventResult]) => {
      if (!active) return;
      setWorkPackages(oppResult.packages || []);
      setWorkPackageEvents(eventResult.events || []);
    });
    return () => { active = false; };
  }, [cache?.id]);

  const openPackages = workPackages.filter((p) => p.status === "open" && !(p.myBid && p.myBid.status === "submitted"));
  const invitedPackages = openPackages.filter((p) => p.invited_to_you);
  const packageBidsOut = workPackages.filter((p) => p.myBid?.status === "submitted" && p.homeownerDecision === "pending");
  const packageAwards = workPackages.filter((p) => p.myBid?.status === "submitted" && p.homeownerDecision === "accepted");

  useEffect(() => {
    let active = true;
    listProLeads(cache?.id)
      .then((result) => {
        if (!active) return;
        setLeads(result.leads);
        setLeadsConfigured(result.configured);
        setLeadError(result.error || "");
      })
      .catch((error) => {
        if (active) setLeadError(error?.message || "Could not load your lead briefing.");
      })
      .finally(() => {
        if (active) setLeadsLoading(false);
      });
    return () => { active = false; };
  }, [cache?.id]);

  const newLeads = leads.filter((lead) => lead.status === "new");
  const followUps = leads.filter((lead) => ["interested", "bid_submitted", "proposal_sent"].includes(lead.status));
  const activeWork = leads.filter((lead) => lead.status === "won");
  const openBids = leads.filter((lead) => lead.status === "bid_submitted" && lead.homeownerDecision === "pending");
  const acceptedBids = leads.filter((lead) => lead.homeownerDecision === "accepted" && lead.status !== "won");
  const leadValue = leadsLoading ? "—" : leadsConfigured ? String(newLeads.length) : "Setup";
  const briefing = leadsLoading
    ? "I’m checking your homeowner opportunities and portfolio health."
    : !leadsConfigured
      ? "Your command center is ready. The production workspace still needs its homeowner lead connection enabled."
      : acceptedBids.length
        ? `${acceptedBids.length} ${acceptedBids.length === 1 ? "homeowner accepted your bid" : "homeowners accepted your bids"} — open the lead to start the engagement.`
        : newLeads.length || followUps.length || activeWork.length
          ? `${newLeads.length} new homeowner ${newLeads.length === 1 ? "lead" : "leads"}, ${openBids.length} ${openBids.length === 1 ? "bid" : "bids"} awaiting a decision, and ${activeWork.length} active ${activeWork.length === 1 ? "project" : "projects"}.`
          : "Your pipeline is clear today. New homeowner projects posted for quotes will appear here automatically.";

  const copyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copy your profile link:", shareUrl);
    }
  };

  const previewProfile = () => {
    if (profilePath) window.open(profilePath, "_blank", "noopener");
    else navigate(getProOnboardingResumePath());
  };

  const priorities = [
    packageAwards.length ? { icon: ClipboardCheck, title: `${packageAwards.length} work ${packageAwards.length === 1 ? "package" : "packages"} awarded to you`, detail: "The homeowner accepted your bid. Their contact details are unlocked.", path: "/pro/rfqs?view=awarded" } : null,
    invitedPackages.length ? { icon: Users, title: `${invitedPackages.length} homeowner ${invitedPackages.length === 1 ? "invitation" : "invitations"} to bid`, detail: "A homeowner picked you for a trade-scoped package. Invited bids close fastest.", path: "/pro/rfqs?view=invited" } : null,
    openPackages.length && !invitedPackages.length ? { icon: PackageSearch, title: `${openPackages.length} open work ${openPackages.length === 1 ? "package" : "packages"} in your trade`, detail: "Scoped RFQs with a fixed checklist to price line by line.", path: "/pro/rfqs" } : null,
    acceptedBids.length ? { icon: ClipboardCheck, title: `${acceptedBids.length} accepted ${acceptedBids.length === 1 ? "bid" : "bids"} ready to start`, detail: "The homeowner picked you. Their contact details are now unlocked.", path: "/pro/leads?status=bid_submitted" } : null,
    newLeads.length ? { icon: Users, title: `Review ${newLeads.length} new homeowner ${newLeads.length === 1 ? "lead" : "leads"}`, detail: "Check scope, budget, location, and fit.", path: "/pro/leads?status=new" } : null,
    followUps.length ? { icon: MessageSquareText, title: `Follow up on ${followUps.length} open ${followUps.length === 1 ? "conversation" : "conversations"}`, detail: "Keep interested and bid-stage projects moving.", path: "/pro/leads?status=interested" } : null,
    !isPublished ? { icon: Pencil, title: "Finish and publish your portfolio", detail: "Homeowners need a credible profile before choosing you.", path: getProOnboardingResumePath() } : null,
    isPublished && galleryCount < 3 ? { icon: Sparkles, title: "Add more proof of work", detail: "Three or more strong project images make your profile easier to evaluate.", path: "/portfolio" } : null,
  ].filter(Boolean).slice(0, 3);

  if (!priorities.length) priorities.push({ icon: ClipboardCheck, title: "No urgent actions", detail: "Your lead pipeline and public profile are up to date.", path: "/pro/leads" });

  const proContext = {
    signedIn: Boolean(session),
    firstName,
    published: isPublished,
    profileStrength,
    profilePath,
    shareUrl,
    craftLabel: craft?.name || cache?.craft || "",
    businessName: cache?.business_name || "",
    city: cache?.city || "",
    years: cache?.years_experience || "",
    specialties: Array.isArray(cache?.specialties) ? cache.specialties : [],
    leadCount: leads.length,
    newLeadCount: newLeads.length,
    followUpCount: followUps.length,
    openBidCount: openBids.length,
    acceptedBidCount: acceptedBids.length,
    activeProjectCount: activeWork.length,
    leads: leads.slice(0, 20).map((lead) => ({
      title: lead.title,
      status: lead.status,
      city: lead.city,
      budgetMin: lead.budget_min,
      budgetMax: lead.budget_max,
      timeline: lead.timeline_completion,
      scope: lead.scope_label,
      styles: lead.styles,
      targeted: lead.targeted_to_you || lead.invited_to_you,
      bidAmount: lead.response?.bid_amount_inr || null,
      homeownerDecision: lead.homeownerDecision,
    })),
    artifactRefs: ["homeowner lead inbox", "professional portfolio"],
  };

  return (
    <div className={`${mobileNative ? "" : HM_FIXED_NAV_OFFSET_CLASS} hm-pro-workspace`}>
      {!mobileNative ? <LandingNavbar /> : null}
      <main className="hm-pro-main">
        <header className="hm-pro-headline">
          <div><p className="hm-pro-eyebrow">Professional command center</p><h1 className="hm-pro-title">Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}, {firstName}.</h1><p className="hm-pro-subtitle">Your daily view of homeowner opportunities, follow-ups, active work, and the public profile that wins trust.</p></div>
        </header>

        <section className="hm-pro-card hm-pro-briefing">
          <div className="hm-pro-briefing-copy">
            <div className="hm-pro-mascot-wrap"><HmHomiMascot size={45} variant="hero" /></div>
            <div><p className="hm-pro-eyebrow">Today’s briefing</p><h2>Here’s where your attention belongs.</h2><p>{briefing}</p>{leadError ? <p className="hm-pro-error" role="alert">{leadError}</p> : null}</div>
          </div>
          <div className="hm-pro-briefing-actions">
            <button type="button" className="hm-pro-button" onClick={() => navigate("/pro/leads")}>Review leads <ArrowRight size={15} /></button>
            <button type="button" className="hm-pro-button-secondary" onClick={() => navigate("/pro/leads?status=won")}>Active work</button>
          </div>
        </section>

        <HmCommandCenter
          title="Professional project Q&A"
          status="Grounded in your homeowner leads, active-work pipeline, and portfolio"
          placeholder="Ask about today’s leads, follow-ups, active work, or draft a client update"
          tryPrompts={[
            { label: "Give me my daily briefing", message: "latest" },
            { label: "Which leads need attention?", message: "Which homeowner leads need my attention today?" },
            { label: "Summarize active work", message: "Summarize my active projects" },
            { label: "Draft a client follow-up", message: "draft a client update" },
          ]}
        />

        <section className="hm-pro-metrics" aria-label="Professional pipeline summary">
          <Metric icon={PackageSearch} label="Open work packages" value={leadsLoading ? "—" : String(openPackages.length)} detail={invitedPackages.length ? `${invitedPackages.length} invited directly to you` : "Trade-scoped RFQs you can bid on"} />
          <Metric icon={Users} label="New leads" value={leadValue} detail="Homeowner projects waiting for review" />
          <Metric icon={MessageSquareText} label="Bids out" value={leadsLoading ? "—" : String(openBids.length + packageBidsOut.length)} detail="Priced bids awaiting a homeowner decision" />
          <Metric icon={BriefcaseBusiness} label="Active work" value={leadsLoading ? "—" : String(activeWork.length + packageAwards.length)} detail="Won projects and awarded packages" />
          <Metric icon={Sparkles} label="Profile strength" value={`${profileStrength}%`} detail={isPublished ? "Portfolio live for homeowners" : "Portfolio not published yet"} />
        </section>

        <div className="hm-pro-dashboard-grid">
          <div className="hm-pro-stack">
            <section className="hm-pro-card">
              <div className="hm-pro-card-head"><div><h2>Work packages for your trade</h2><p>Scoped RFQs from homeowners — bid line by line.{workPackageEvents.length ? ` ${workPackageEvents.length} unread update${workPackageEvents.length === 1 ? "" : "s"}.` : ""}</p></div><button type="button" className="hm-pro-button-quiet" onClick={() => navigate("/pro/rfqs")}>Open RFQs <ArrowRight size={14} /></button></div>
              <div className="hm-pro-card-body">
                {workPackages.length === 0 ? <p className="hm-pro-note">No trade-scoped work packages are open for your craft yet. Homeowners post them from their project hub; you will be notified when one matches.</p> : (
                  <div className="hm-pro-mini-list">
                    {[...invitedPackages, ...openPackages.filter((p) => !p.invited_to_you), ...packageBidsOut].slice(0, 4).map((pkg) => {
                      const due = dueState(pkg.bids_due_at, pkg.status);
                      return (
                        <div className="hm-pro-mini-lead" key={pkg.package_id}>
                          <div><strong>{pkg.title}</strong><span>{workPackageType(pkg.package_type).label} · {pkg.city}{pkg.budget_hint_inr ? ` · ${formatInrShort(pkg.budget_hint_inr)}` : ""}{due.label ? ` · ${due.label}` : ""}</span></div>
                          <span className={`hm-pro-badge ${pkg.invited_to_you ? "is-targeted" : pkg.myBid?.status === "submitted" ? "is-positive" : ""}`}>{pkg.myBid?.status === "submitted" ? "Bid sent" : pkg.invited_to_you ? "Invited" : `${pkg.bid_count}/${pkg.max_bids} bids`}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>

            <section className="hm-pro-card">
              <div className="hm-pro-card-head"><div><h2>Today’s priorities</h2><p>Real actions derived from your pipeline and portfolio.</p></div></div>
              <div className="hm-pro-card-body hm-pro-priority-list">
                {priorities.map(({ icon: Icon, title, detail, path }) => <button type="button" className="hm-pro-priority" key={title} onClick={() => navigate(path)}><span className="hm-pro-priority-icon"><Icon size={17} /></span><span><strong>{title}</strong><span>{detail}</span></span><ArrowRight size={16} /></button>)}
              </div>
            </section>

            <section className="hm-pro-card">
              <div className="hm-pro-card-head"><div><h2>Lead pipeline</h2><p>Recent homeowner projects and their current stage.</p></div><button type="button" className="hm-pro-button-quiet" onClick={() => navigate("/pro/leads")}>View all <ArrowRight size={14} /></button></div>
              <div className="hm-pro-card-body">
                {!leadsConfigured ? <p className="hm-pro-note">The production lead connection is not enabled yet. Once connected, homeowner projects will flow into this pipeline.</p> : leads.length === 0 ? <p className="hm-pro-note">No homeowner projects are open for quotes yet. This remains separate from the professional marketplace.</p> : <div className="hm-pro-mini-list">{leads.slice(0, 4).map((lead) => <div className="hm-pro-mini-lead" key={lead.project_id}><div><strong>{lead.title}</strong><span>{lead.flow_type === "remodel" ? "Remodel" : "New home"} · {lead.city} · {leadBudget(lead)}</span></div><span className={`hm-pro-badge ${lead.homeownerDecision === "accepted" ? "is-targeted" : ["interested", "bid_submitted", "proposal_sent", "won"].includes(lead.status) ? "is-positive" : ""}`}>{lead.homeownerDecision === "accepted" ? "Bid accepted" : leadStatusLabel(lead.status)}</span></div>)}</div>}
              </div>
            </section>

            <section className="hm-pro-card">
              <div className="hm-pro-card-head"><div><h2>Active work</h2><p>Projects you have moved into delivery.</p></div><button type="button" className="hm-pro-button-quiet" onClick={() => navigate("/pro/leads?status=won")}>Open pipeline <ArrowRight size={14} /></button></div>
              <div className="hm-pro-card-body">{activeWork.length ? <div className="hm-pro-mini-list">{activeWork.slice(0, 3).map((lead) => <div className="hm-pro-mini-lead" key={lead.project_id}><div><strong>{lead.title}</strong><span>{lead.city} · {lead.timeline_completion || "Timeline to confirm"}</span></div><span className="hm-pro-badge is-positive">Active</span></div>)}</div> : <p className="hm-pro-note">Won homeowner projects will appear here. You can move a proposal to active once the homeowner confirms the engagement.</p>}</div>
            </section>
          </div>

          <aside className="hm-pro-stack">
            <section className="hm-pro-card">
              <div className="hm-pro-card-head"><div><h2>Studio controls</h2><p>Shortcuts for the work you do most.</p></div></div>
              <div className="hm-pro-card-body hm-pro-command-grid">
                <button type="button" className="hm-pro-command" onClick={() => navigate("/pro/leads")}><Users size={18} /> Review leads</button>
                <button type="button" className="hm-pro-command" onClick={() => navigate("/pro/leads?status=won")}><FolderKanban size={18} /> Active work</button>
                <button type="button" className="hm-pro-command" onClick={() => navigate("/browse")}><MessageSquareText size={18} /> Collaborate</button>
                <button type="button" className="hm-pro-command" onClick={() => navigate("/shop")}><PackageSearch size={18} /> Source materials</button>
              </div>
            </section>

            <section className="hm-pro-card">
              <div className="hm-pro-card-head"><div><h2>Portfolio health</h2><p>{isPublished ? "Live and visible to homeowners." : "Complete this to build homeowner trust."}</p></div></div>
              <div className="hm-pro-card-body">
                <div className="hm-pro-profile-summary"><div><strong>{profileStrength}%</strong><span>{galleryCount} work {galleryCount === 1 ? "image" : "images"}</span></div><span className={`hm-pro-badge ${isPublished ? "is-positive" : ""}`}>{isPublished ? "Live" : "Draft"}</span></div>
                <div className="hm-pro-progress" aria-label={`Portfolio ${profileStrength}% complete`}><span style={{ width: `${profileStrength}%` }} /></div>
                <div className="hm-pro-inline-actions">
                  <button type="button" className="hm-pro-button-secondary" onClick={() => navigate(isPublished ? "/details" : getProOnboardingResumePath())}><Pencil size={14} /> {isPublished ? "Edit" : "Continue"}</button>
                  {isPublished ? <button type="button" className="hm-pro-button-secondary" onClick={previewProfile}><ExternalLink size={14} /> Preview</button> : null}
                  {isPublished ? <button type="button" className="hm-pro-button-secondary" onClick={copyLink}><Share2 size={14} /> {copied ? "Copied" : "Share"}</button> : null}
                </div>
              </div>
            </section>
          </aside>
        </div>
      </main>
      <HmProAssistant context={proContext} onNavigatePath={(path) => navigate(path)} onPreview={previewProfile} onCopyLink={copyLink} />
    </div>
  );
}
