import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronUp, Inbox, Loader2, MapPin } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import LandingNavbar from "../components/landing/LandingNavbar";
import BackButton from "../components/BackButton";
import { HM_FIXED_NAV_OFFSET_CLASS } from "../lib/hmBrand";
import { useMobileNative } from "../hooks/useMobileNative";
import { formatInrShort } from "../lib/projectFlowApi";
import {
  homeownerDecisionLabel,
  leadScopeDetails,
  leadStatusLabel,
  listProLeads,
  submitProBid,
  updateProLeadResponse,
  withdrawProBid,
} from "../lib/proLeadsApi";
import "./ProWorkspace.css";

function readPortfolioCache() {
  try {
    const raw = localStorage.getItem("hm_portfolio");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const FILTERS = [
  ["all", "All"],
  ["new", "New"],
  ["interested", "Interested"],
  ["bid_submitted", "Bid submitted"],
  ["won", "Active projects"],
  ["declined", "Declined"],
];

const EMPTY_FILTER_TITLES = {
  new: "No new leads",
  interested: "No interested leads",
  bid_submitted: "No bids awaiting a decision",
  won: "No active projects",
  declined: "No declined leads",
};

function budgetLabel(lead) {
  if (lead.budget_min && lead.budget_max && Number(lead.budget_min) !== Number(lead.budget_max)) {
    return `${formatInrShort(lead.budget_min)} – ${formatInrShort(lead.budget_max)}`;
  }
  return formatInrShort(lead.budget_max || lead.budget_min);
}

function postedLabel(value) {
  if (!value) return "Recently posted";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently posted";
  return `Posted ${date.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;
}

function statusBadgeClass(status) {
  if (["interested", "bid_submitted", "proposal_sent", "won"].includes(status)) return "is-positive";
  if (status === "declined") return "is-muted";
  return "";
}

function decisionBadgeClass(decision) {
  if (decision === "accepted" || decision === "shortlisted") return "is-positive";
  if (decision === "declined") return "is-muted";
  return "";
}

function emptyBidDraft() {
  return { amountInr: "", timelineWeeks: "", scopeNote: "", validUntil: "" };
}

function draftFromResponse(response) {
  if (!response?.bid_submitted_at) return emptyBidDraft();
  return {
    amountInr: response.bid_amount_inr == null ? "" : String(response.bid_amount_inr),
    timelineWeeks: response.bid_timeline_weeks == null ? "" : String(response.bid_timeline_weeks),
    scopeNote: response.bid_scope_note || "",
    validUntil: response.bid_valid_until || "",
  };
}

export default function ProLeadsPage() {
  const navigate = useNavigate();
  const mobileNative = useMobileNative();
  const [searchParams, setSearchParams] = useSearchParams();
  const cache = useMemo(readPortfolioCache, []);
  const portfolioId = cache?.id || null;
  const requestedStatus = searchParams.get("status") || "all";
  const [filter, setFilter] = useState(FILTERS.some(([value]) => value === requestedStatus) ? requestedStatus : "all");
  const [leads, setLeads] = useState([]);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState("");
  const [bidDrafts, setBidDrafts] = useState({});

  useEffect(() => {
    let active = true;
    setLoading(true);
    listProLeads(portfolioId)
      .then((result) => {
        if (!active) return;
        setLeads(result.leads);
        setConfigured(result.configured);
        setError(result.error || "");
      })
      .catch((err) => {
        if (active) setError(err?.message || "Could not load homeowner project leads.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [portfolioId]);

  const selectFilter = (value) => {
    setFilter(value);
    const next = new URLSearchParams(searchParams);
    if (value === "all") next.delete("status");
    else next.set("status", value);
    setSearchParams(next, { replace: true });
  };

  const visibleLeads = useMemo(
    () => leads.filter((lead) => filter === "all" || lead.status === filter),
    [filter, leads],
  );

  const applyResponse = (projectId, response) => {
    setLeads((current) => current.map((item) => (
      item.project_id === projectId
        ? { ...item, status: response.status, response, homeownerDecision: response.homeowner_decision || "pending" }
        : item
    )));
  };

  const setStatus = async (lead, status) => {
    if (!portfolioId || savingId) return;
    setSavingId(lead.project_id);
    setError("");
    try {
      const response = await updateProLeadResponse({ projectId: lead.project_id, portfolioId, status });
      applyResponse(lead.project_id, response);
    } catch (err) {
      setError(err?.message || "Could not update this lead.");
    } finally {
      setSavingId("");
    }
  };

  const toggleBidForm = (lead) => {
    const opening = expandedId !== lead.project_id;
    setExpandedId(opening ? lead.project_id : "");
    if (opening) {
      setBidDrafts((current) => ({
        ...current,
        [lead.project_id]: current[lead.project_id] || draftFromResponse(lead.response),
      }));
    }
  };

  const updateDraft = (projectId, field, value) => {
    setBidDrafts((current) => ({
      ...current,
      [projectId]: { ...(current[projectId] || emptyBidDraft()), [field]: value },
    }));
  };

  const sendBid = async (lead) => {
    if (!portfolioId || savingId) return;
    const draft = bidDrafts[lead.project_id] || emptyBidDraft();
    setSavingId(lead.project_id);
    setError("");
    try {
      const response = await submitProBid({
        projectId: lead.project_id,
        portfolioId,
        amountInr: draft.amountInr,
        timelineWeeks: draft.timelineWeeks,
        scopeNote: draft.scopeNote,
        validUntil: draft.validUntil || null,
      });
      applyResponse(lead.project_id, response);
      setExpandedId("");
    } catch (err) {
      setError(err?.message || "Could not submit this bid.");
    } finally {
      setSavingId("");
    }
  };

  const removeBid = async (lead) => {
    if (!portfolioId || savingId) return;
    setSavingId(lead.project_id);
    setError("");
    try {
      const response = await withdrawProBid({ projectId: lead.project_id, portfolioId });
      applyResponse(lead.project_id, response);
      setBidDrafts((current) => ({ ...current, [lead.project_id]: emptyBidDraft() }));
    } catch (err) {
      setError(err?.message || "Could not withdraw this bid.");
    } finally {
      setSavingId("");
    }
  };

  return (
    <div className={`${mobileNative ? "" : HM_FIXED_NAV_OFFSET_CLASS} hm-pro-workspace`}>
      {!mobileNative ? <LandingNavbar /> : null}
      <main className="hm-pro-main">
        <header className="hm-pro-headline">
          <div>
            <p className="hm-pro-eyebrow">Professional workspace</p>
            <h1 className="hm-pro-title">Homeowner project leads</h1>
            <p className="hm-pro-subtitle">Whole-project bids — homeowners who asked one contractor or architect to price the entire brief. Trade RFQs (electrical, plumbing, carpentry, materials) are under Work packages.</p>
          </div>
          <BackButton to="/pro/dashboard" label="Dashboard" />
        </header>

        <nav className="hm-pro-segment" aria-label="Lead type">
          <Link to="/pro/rfqs">Work packages</Link>
          <Link to="/pro/leads" className="is-active">Whole-project leads</Link>
        </nav>

        <div className="hm-pro-filters" role="tablist" aria-label="Filter project leads">
          {FILTERS.map(([value, label]) => {
            const count = value === "all" ? leads.length : leads.filter((lead) => lead.status === value).length;
            return (
              <button key={value} type="button" role="tab" aria-selected={filter === value} className={`hm-pro-filter ${filter === value ? "is-active" : ""}`} onClick={() => selectFilter(value)}>
                {label} · {count}
              </button>
            );
          })}
        </div>

        {error ? <p className="hm-pro-error" role="alert">{error}</p> : null}

        {loading ? (
          <section className="hm-pro-card hm-pro-empty" aria-live="polite"><Loader2 className="animate-spin hm-pro-empty-icon" size={24} /><h2>Loading homeowner projects…</h2></section>
        ) : !portfolioId ? (
          <section className="hm-pro-card hm-pro-empty"><div className="hm-pro-empty-icon"><Inbox size={23} /></div><h2>Complete your professional profile first</h2><p>Your portfolio identifies your business when you bid on a homeowner project.</p><button type="button" className="hm-pro-button" style={{ marginTop: 18 }} onClick={() => navigate("/craft")}>Continue profile</button></section>
        ) : !configured ? (
          <section className="hm-pro-card hm-pro-empty"><div className="hm-pro-empty-icon"><Inbox size={23} /></div><h2>The homeowner lead connection is not live yet</h2><p>Your private project inbox is ready in the app. The production workspace still needs its lead and bidding migrations enabled before homeowner projects can appear here.</p></section>
        ) : visibleLeads.length === 0 ? (
          <section className="hm-pro-card hm-pro-empty"><div className="hm-pro-empty-icon"><Inbox size={23} /></div><h2>{filter === "all" ? "No homeowner projects are open yet" : EMPTY_FILTER_TITLES[filter]}</h2><p>{filter === "all" ? "New project briefs posted for quotes will land here automatically. Your marketplace profile remains separate." : "Try another pipeline stage to see the rest of your opportunities."}</p></section>
        ) : (
          <section className="hm-pro-lead-list" aria-label="Homeowner project opportunities">
            {visibleLeads.map((lead) => {
              const scope = leadScopeDetails(lead);
              const bid = lead.response?.bid_submitted_at ? lead.response : null;
              const decision = lead.homeownerDecision || "pending";
              const draft = bidDrafts[lead.project_id] || emptyBidDraft();
              const isExpanded = expandedId === lead.project_id;
              const busy = savingId === lead.project_id;

              return (
                <article className="hm-pro-card hm-pro-lead-card" key={lead.project_id}>
                  <div className="hm-pro-lead-top">
                    <div>
                      <div className="hm-pro-badges">
                        {lead.invited_to_you ? (
                          <span className="hm-pro-badge is-targeted">Invited by homeowner</span>
                        ) : lead.targeted_to_you ? (
                          <span className="hm-pro-badge is-targeted">Sent to you</span>
                        ) : (
                          <span className="hm-pro-badge">Open opportunity</span>
                        )}
                        <span className={`hm-pro-badge ${statusBadgeClass(lead.status)}`}>{leadStatusLabel(lead.status)}</span>
                        {bid && decision !== "pending" ? (
                          <span className={`hm-pro-badge ${decisionBadgeClass(decision)}`}>{homeownerDecisionLabel(decision)}</span>
                        ) : null}
                        {lead.has_ai_design_pack ? <span className="hm-pro-badge">AI design pack ready</span> : null}
                      </div>
                      <h2>{lead.title}</h2>
                    </div>
                    <span className="hm-pro-date">{postedLabel(lead.posted_at)}</span>
                  </div>

                  <div className="hm-pro-lead-meta">
                    <div className="hm-pro-meta-cell"><span>Project</span><strong>{lead.flow_type === "remodel" ? "Remodel" : "New home"}</strong></div>
                    <div className="hm-pro-meta-cell"><span>Location</span><strong><MapPin size={12} style={{ display: "inline", marginRight: 4 }} />{[lead.city, lead.state].filter(Boolean).join(", ")}</strong></div>
                    <div className="hm-pro-meta-cell"><span>Homeowner budget</span><strong>{budgetLabel(lead)}</strong></div>
                    <div className="hm-pro-meta-cell"><span>Timeline</span><strong>{lead.timeline_completion || "Discuss with homeowner"}</strong></div>
                  </div>

                  <div className="hm-pro-tags">
                    <span className="hm-pro-tag">{lead.scope_label}</span>
                    {lead.homeowner_has_architect ? <span className="hm-pro-tag">Architect already engaged</span> : <span className="hm-pro-tag">No architect yet</span>}
                    {lead.styles.slice(0, 4).map((style) => <span className="hm-pro-tag" key={style}>{style}</span>)}
                  </div>

                  {scope.length ? (
                    <div className="hm-pro-scope">
                      {scope.map(([label, value]) => (
                        <div key={label}><span>{label}</span><strong>{value}</strong></div>
                      ))}
                    </div>
                  ) : null}

                  {bid ? (
                    <div className="hm-pro-bid-summary">
                      <div><span>Your bid</span><strong>{formatInrShort(bid.bid_amount_inr)}</strong></div>
                      <div><span>Delivery</span><strong>{bid.bid_timeline_weeks ? `${bid.bid_timeline_weeks} weeks` : "Not stated"}</strong></div>
                      <div><span>Homeowner</span><strong>{homeownerDecisionLabel(decision)}</strong></div>
                      {bid.bid_scope_note ? <p className="hm-pro-bid-summary-note">{bid.bid_scope_note}</p> : null}
                    </div>
                  ) : null}

                  {decision === "accepted" ? (
                    <div className="hm-pro-disclosure">
                      The homeowner accepted your bid. Their contact details are now on your dashboard under active projects.
                    </div>
                  ) : (
                    <div className="hm-pro-disclosure">
                      Homeowner name, address, and contact details stay private until they accept your bid.
                    </div>
                  )}

                  {isExpanded ? (
                    <div className="hm-pro-bid-form">
                      <h4>{bid ? "Revise your bid" : "Place your bid"}</h4>
                      <p>The homeowner compares bids side by side. Revising a bid resets their decision, so send your best price and a clear scope.</p>
                      <div className="hm-pro-bid-grid">
                        <div className="hm-pro-field">
                          <label htmlFor={`amount-${lead.project_id}`}>Bid amount (₹)</label>
                          <input id={`amount-${lead.project_id}`} type="number" min="0" step="1000" inputMode="numeric" value={draft.amountInr} onChange={(e) => updateDraft(lead.project_id, "amountInr", e.target.value)} placeholder="4500000" />
                          <span className="hm-pro-field-hint">{draft.amountInr ? formatInrShort(draft.amountInr) : "Total for your scope"}</span>
                        </div>
                        <div className="hm-pro-field">
                          <label htmlFor={`weeks-${lead.project_id}`}>Delivery (weeks)</label>
                          <input id={`weeks-${lead.project_id}`} type="number" min="1" max="520" step="1" inputMode="numeric" value={draft.timelineWeeks} onChange={(e) => updateDraft(lead.project_id, "timelineWeeks", e.target.value)} placeholder="36" />
                          <span className="hm-pro-field-hint">Optional</span>
                        </div>
                        <div className="hm-pro-field">
                          <label htmlFor={`valid-${lead.project_id}`}>Price valid until</label>
                          <input id={`valid-${lead.project_id}`} type="date" value={draft.validUntil} onChange={(e) => updateDraft(lead.project_id, "validUntil", e.target.value)} />
                          <span className="hm-pro-field-hint">Optional</span>
                        </div>
                        <div className="hm-pro-field hm-pro-field-wide">
                          <label htmlFor={`scope-${lead.project_id}`}>What the price covers</label>
                          <textarea id={`scope-${lead.project_id}`} value={draft.scopeNote} onChange={(e) => updateDraft(lead.project_id, "scopeNote", e.target.value)} maxLength={4000} placeholder="Included: structure, brickwork, plastering, basic electrical and plumbing. Excluded: interiors, modular kitchen, compound wall." />
                          <span className="hm-pro-field-hint">Listing inclusions and exclusions is the single biggest reason homeowners shortlist a bid.</span>
                        </div>
                      </div>
                      <div className="hm-pro-inline-actions">
                        <button type="button" className="hm-pro-button" disabled={busy} onClick={() => sendBid(lead)}>
                          {busy ? "Sending…" : bid ? "Send revised bid" : "Send bid to homeowner"}
                        </button>
                        <button type="button" className="hm-pro-button-secondary" disabled={busy} onClick={() => setExpandedId("")}>Cancel</button>
                        {bid ? (
                          <button type="button" className="hm-pro-button-quiet" disabled={busy} onClick={() => removeBid(lead)}>Withdraw bid</button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  <div className="hm-pro-lead-actions">
                    <span className="hm-pro-date">{bid ? `Bid sent ${new Date(bid.bid_submitted_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : "No bid sent yet"}</span>
                    <div className="hm-pro-action-set">
                      {lead.status !== "won" && decision !== "accepted" ? (
                        <button type="button" className="hm-pro-button-secondary" disabled={busy} onClick={() => setStatus(lead, "declined")}>Not a fit</button>
                      ) : null}
                      {!["interested", "bid_submitted", "won"].includes(lead.status) ? (
                        <button type="button" className="hm-pro-button-secondary" disabled={busy} onClick={() => setStatus(lead, "interested")}>Interested</button>
                      ) : null}
                      {decision === "accepted" ? (
                        <button type="button" className="hm-pro-button" disabled={busy} onClick={() => setStatus(lead, "won")}>Move to active work</button>
                      ) : (
                        <button type="button" className="hm-pro-button" aria-expanded={isExpanded} onClick={() => toggleBidForm(lead)}>
                          {bid ? "Revise bid" : "Place a bid"}
                          {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </main>
    </div>
  );
}
