import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Inbox, Loader2, MapPin, MessageCircleQuestion, Phone } from "lucide-react";
import BackButton from "../components/BackButton";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import LandingNavbar from "../components/landing/LandingNavbar";
import { HM_FIXED_NAV_OFFSET_CLASS } from "../lib/hmBrand";
import { useMobileNative } from "../hooks/useMobileNative";
import { formatInrShort } from "../lib/projectFlowApi";
import {
  askWorkPackageQuestion,
  listAwardedWorkPackages,
  listWorkPackageEvents,
  listWorkPackageOpportunities,
  listWorkPackageQuestionsForPro,
  markWorkPackageEventsRead,
  submitWorkPackageBid,
  withdrawWorkPackageBid,
} from "../lib/workPackagesApi";
import { PRICING_BASIS, dueState, formatDateShort, formatInrExact, pricingBasisLabel, workPackageType } from "../lib/workPackageCatalog";
import { craftLabel } from "../components/PublishedProsDirectory";
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
  ["open", "Open to bid"],
  ["invited", "Invited"],
  ["mine", "My bids"],
  ["awarded", "Awarded"],
  ["closed", "Closed"],
];

const DECISION_LABEL = {
  pending: "Awaiting homeowner",
  shortlisted: "Shortlisted by homeowner",
  accepted: "Bid accepted",
  declined: "Not selected",
};

function relativeTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const mins = Math.round((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days < 7 ? `${days}d ago` : formatDateShort(value);
}

function emptyDraft(pkg) {
  return {
    lineItems: (pkg.scope_items || []).map((item) => ({ scope_item_id: item.id || null, label: item.label, quantity: item.quantity || "", unit: item.unit || "", unit_rate_inr: "", amount_inr: "" })),
    lumpSum: !(pkg.scope_items || []).length,
    totalAmountInr: "",
    gstIncluded: false,
    pricingBasis: pkg.pricing_basis && pkg.pricing_basis !== "open" ? pkg.pricing_basis : "turnkey",
    inclusions: "",
    exclusions: "",
    assumptions: "",
    timelineWeeks: "",
    canStartOn: "",
    warrantyMonths: "",
    advancePct: "",
    paymentScheduleNote: "",
    siteVisitDone: false,
    validUntil: "",
    coverNote: "",
  };
}

function draftFromBid(pkg, bid) {
  if (!bid) return emptyDraft(pkg);
  const base = emptyDraft(pkg);
  const lines = base.lineItems.map((line) => {
    const match = (bid.line_items || []).find((l) => (l.scope_item_id && l.scope_item_id === line.scope_item_id) || (l.label && l.label === line.label));
    return match ? { ...line, unit_rate_inr: match.unit_rate_inr ?? "", amount_inr: match.amount_inr ?? "" } : line;
  });
  return {
    ...base,
    lineItems: lines,
    lumpSum: !lines.some((l) => l.amount_inr !== "" && l.amount_inr != null),
    totalAmountInr: String(bid.total_amount_inr ?? ""),
    gstIncluded: Boolean(bid.gst_included),
    pricingBasis: bid.pricing_basis || base.pricingBasis,
    inclusions: bid.inclusions || "",
    exclusions: bid.exclusions || "",
    assumptions: bid.assumptions || "",
    timelineWeeks: bid.timeline_weeks == null ? "" : String(bid.timeline_weeks),
    canStartOn: bid.can_start_on || "",
    warrantyMonths: bid.warranty_months == null ? "" : String(bid.warranty_months),
    advancePct: bid.advance_pct == null ? "" : String(bid.advance_pct),
    paymentScheduleNote: bid.payment_schedule_note || "",
    siteVisitDone: Boolean(bid.site_visit_done),
    validUntil: bid.valid_until || "",
    coverNote: bid.cover_note || "",
  };
}

function lineTotal(lineItems) {
  return lineItems.reduce((sum, l) => sum + (Number(l.amount_inr) || 0), 0);
}

export default function ProWorkPackagesPage() {
  const navigate = useNavigate();
  const mobileNative = useMobileNative();
  const [searchParams, setSearchParams] = useSearchParams();
  const cache = useMemo(readPortfolioCache, []);
  const portfolioId = cache?.id || null;
  const requested = searchParams.get("view") || "open";
  const [filter, setFilter] = useState(FILTERS.some(([v]) => v === requested) ? requested : "open");
  const [packages, setPackages] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [awards, setAwards] = useState([]);
  const [events, setEvents] = useState([]);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [expandedId, setExpandedId] = useState(searchParams.get("package") || "");
  const [bidFormId, setBidFormId] = useState("");
  const [drafts, setDrafts] = useState({});
  const [questionDrafts, setQuestionDrafts] = useState({});
  const [busy, setBusy] = useState("");

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const [oppResult, awardResult, eventResult] = await Promise.all([
        listWorkPackageOpportunities(portfolioId),
        listAwardedWorkPackages(portfolioId),
        listWorkPackageEvents({ limit: 30 }),
      ]);
      setPackages(oppResult.packages);
      setConfigured(oppResult.configured);
      setAwards(awardResult.awards);
      setEvents(eventResult.events);
      setError(oppResult.error || "");
      if (oppResult.packages.length) {
        const qResult = await listWorkPackageQuestionsForPro(oppResult.packages.map((p) => p.package_id));
        setQuestions(qResult.questions);
      } else {
        setQuestions([]);
      }
    } catch (err) {
      setError(err?.message || "Could not load work packages.");
    } finally {
      setLoading(false);
    }
  }, [portfolioId]);

  useEffect(() => { load(); }, [load]);

  const selectFilter = (value) => {
    setFilter(value);
    const next = new URLSearchParams(searchParams);
    if (value === "open") next.delete("view"); else next.set("view", value);
    setSearchParams(next, { replace: true });
  };

  const counts = useMemo(() => ({
    open: packages.filter((p) => p.status === "open" && !(p.myBid && p.myBid.status === "submitted")).length,
    invited: packages.filter((p) => p.invited_to_you && p.status === "open").length,
    mine: packages.filter((p) => p.myBid && p.myBid.status === "submitted").length,
    awarded: packages.filter((p) => p.myBid?.homeowner_decision === "accepted").length,
    closed: packages.filter((p) => ["closed", "cancelled"].includes(p.status) || (p.status === "awarded" && p.myBid?.homeowner_decision !== "accepted")).length,
  }), [packages]);

  const visible = useMemo(() => packages.filter((p) => {
    const mine = p.myBid && p.myBid.status === "submitted";
    if (filter === "open") return p.status === "open" && !mine;
    if (filter === "invited") return p.invited_to_you && p.status === "open";
    if (filter === "mine") return mine;
    if (filter === "awarded") return p.myBid?.homeowner_decision === "accepted";
    return ["closed", "cancelled"].includes(p.status) || (p.status === "awarded" && p.myBid?.homeowner_decision !== "accepted");
  }), [packages, filter]);

  const unread = events.filter((e) => !e.read_at);

  const markRead = async (ids) => {
    setEvents((current) => current.map((e) => (ids.includes(e.id) ? { ...e, read_at: e.read_at || new Date().toISOString() } : e)));
    try { await markWorkPackageEventsRead(ids); } catch { /* optimistic */ }
  };

  const openBidForm = (pkg) => {
    const opening = bidFormId !== pkg.package_id;
    setBidFormId(opening ? pkg.package_id : "");
    setExpandedId(pkg.package_id);
    if (opening) setDrafts((c) => ({ ...c, [pkg.package_id]: c[pkg.package_id] || draftFromBid(pkg, pkg.myBid?.status === "submitted" ? pkg.myBid : null) }));
  };

  const updateDraft = (id, field, value) => setDrafts((c) => ({ ...c, [id]: { ...(c[id] || {}), [field]: value } }));
  const updateLine = (id, index, field, value) => setDrafts((c) => {
    const draft = c[id];
    const lines = draft.lineItems.map((l, i) => {
      if (i !== index) return l;
      const next = { ...l, [field]: value };
      const qty = Number(next.quantity);
      if (field === "unit_rate_inr" && Number.isFinite(qty) && qty > 0 && value !== "") next.amount_inr = String(Math.round(qty * Number(value)));
      return next;
    });
    const total = lineTotal(lines);
    return { ...c, [id]: { ...draft, lineItems: lines, totalAmountInr: draft.lumpSum ? draft.totalAmountInr : total ? String(total) : draft.totalAmountInr } };
  });

  const sendBid = async (pkg) => {
    if (!portfolioId || busy) return;
    const draft = drafts[pkg.package_id];
    setBusy(pkg.package_id);
    setError("");
    setNotice("");
    try {
      const total = draft.lumpSum ? draft.totalAmountInr : lineTotal(draft.lineItems) || draft.totalAmountInr;
      await submitWorkPackageBid({
        packageId: pkg.package_id,
        projectId: pkg.project_id,
        portfolioId,
        existingBidId: pkg.myBid?.id || null,
        ...draft,
        totalAmountInr: total,
        lineItems: draft.lumpSum ? [] : draft.lineItems,
      });
      setBidFormId("");
      setNotice(pkg.myBid?.status === "submitted" ? "Revised bid sent. The homeowner's earlier decision has been reset." : "Bid sent. You'll be notified when the homeowner shortlists or accepts.");
      await load({ silent: true });
    } catch (err) {
      setError(err?.message || "Could not submit this bid.");
    } finally {
      setBusy("");
    }
  };

  const withdraw = async (pkg) => {
    if (!pkg.myBid?.id || busy) return;
    setBusy(pkg.package_id);
    setError("");
    try {
      await withdrawWorkPackageBid(pkg.myBid.id);
      setDrafts((c) => ({ ...c, [pkg.package_id]: emptyDraft(pkg) }));
      await load({ silent: true });
    } catch (err) {
      setError(err?.message || "Could not withdraw this bid.");
    } finally {
      setBusy("");
    }
  };

  const ask = async (pkg) => {
    const text = questionDrafts[pkg.package_id] || "";
    if (!text.trim() || busy) return;
    setBusy(`q-${pkg.package_id}`);
    setError("");
    try {
      await askWorkPackageQuestion({ packageId: pkg.package_id, projectId: pkg.project_id, portfolioId, question: text });
      setQuestionDrafts((c) => ({ ...c, [pkg.package_id]: "" }));
      const qResult = await listWorkPackageQuestionsForPro(packages.map((p) => p.package_id));
      setQuestions(qResult.questions);
    } catch (err) {
      setError(err?.message || "Could not send your question.");
    } finally {
      setBusy("");
    }
  };

  const myCraft = cache?.craft ? craftLabel(cache.craft) : "your trade";

  return (
    <div className={`${mobileNative ? "" : HM_FIXED_NAV_OFFSET_CLASS} hm-pro-workspace`}>
      {!mobileNative ? <LandingNavbar /> : null}
      <main className="hm-pro-main">
        <header className="hm-pro-headline">
          <div>
            <p className="hm-pro-eyebrow">Professional workspace</p>
            <h1 className="hm-pro-title">Work packages for {myCraft}</h1>
            <p className="hm-pro-subtitle">Homeowners post trade-scoped requests for quotes — one package per trade with a fixed scope every bidder prices. Ask questions, bid line by line, and track the homeowner's decision.</p>
          </div>
          <BackButton to="/pro/dashboard" label="Dashboard" />
        </header>

        <nav className="hm-pro-segment" aria-label="Lead type">
          <Link to="/pro/rfqs" className="is-active">Work packages{counts.open ? <span className="hm-pro-count">{counts.open}</span> : null}</Link>
          <Link to="/pro/leads">Whole-project leads</Link>
        </nav>

        {events.length ? (
          <section className="hm-pro-feed" aria-label="Recent activity">
            {events.slice(0, unread.length ? Math.min(6, Math.max(3, unread.length)) : 3).map((event) => (
              <div className={`hm-pro-feed-item ${event.read_at ? "" : "is-unread"}`} key={event.id} role="button" tabIndex={0}
                onClick={() => { setExpandedId(event.package_id); if (!event.read_at) markRead([event.id]); }}
                onKeyDown={(e) => { if (e.key === "Enter") setExpandedId(event.package_id); }}>
                <span className="dot" />
                <div><strong>{event.title}</strong>{event.body ? <p>{event.body}</p> : null}</div>
                <time dateTime={event.created_at}>{relativeTime(event.created_at)}</time>
              </div>
            ))}
            {unread.length ? <button type="button" className="hm-pro-button-quiet" style={{ justifySelf: "start" }} onClick={() => markRead(unread.map((e) => e.id))}>Mark all read</button> : null}
          </section>
        ) : null}

        <div className="hm-pro-filters" role="tablist" aria-label="Filter work packages">
          {FILTERS.map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={filter === value} className={`hm-pro-filter ${filter === value ? "is-active" : ""}`} onClick={() => selectFilter(value)}>
              {label} · {counts[value] ?? 0}
            </button>
          ))}
        </div>

        {error ? <p className="hm-pro-error" role="alert">{error}</p> : null}
        {notice ? <p className="hm-pro-note" style={{ marginTop: 10, color: "#1d6b4b" }}>{notice}</p> : null}

        {loading ? (
          <section className="hm-pro-card hm-pro-empty" aria-live="polite"><Loader2 className="animate-spin hm-pro-empty-icon" size={24} /><h2>Loading work packages…</h2></section>
        ) : !portfolioId ? (
          <section className="hm-pro-card hm-pro-empty"><div className="hm-pro-empty-icon"><Inbox size={23} /></div><h2>Complete your professional profile first</h2><p>Work packages are matched to your trade and city, so publish your portfolio to see them.</p><button type="button" className="hm-pro-button" style={{ marginTop: 18 }} onClick={() => navigate("/craft")}>Continue profile</button></section>
        ) : !configured ? (
          <section className="hm-pro-card hm-pro-empty"><div className="hm-pro-empty-icon"><Inbox size={23} /></div><h2>Work packages are not live yet</h2><p>The production workspace still needs the work packages migration before homeowner RFQs can appear here.</p></section>
        ) : visible.length === 0 ? (
          <section className="hm-pro-card hm-pro-empty"><div className="hm-pro-empty-icon"><Inbox size={23} /></div><h2>{filter === "open" ? `No open work packages for ${myCraft} right now` : "Nothing here yet"}</h2><p>{filter === "open" ? "New packages posted by homeowners in your trade appear here automatically. Keep your profile published and your city current." : "Try another view."}</p></section>
        ) : (
          <section className="hm-pro-lead-list" aria-label="Work packages">
            {visible.map((pkg) => {
              const meta = workPackageType(pkg.package_type);
              const Icon = meta.Icon;
              const due = dueState(pkg.bids_due_at, pkg.status);
              const bid = pkg.myBid?.status === "submitted" ? pkg.myBid : null;
              const decision = bid?.homeowner_decision || "pending";
              const award = awards.find((a) => a.package_id === pkg.package_id);
              const isExpanded = expandedId === pkg.package_id;
              const showForm = bidFormId === pkg.package_id;
              const draft = drafts[pkg.package_id];
              const pkgQuestions = questions.filter((q) => q.package_id === pkg.package_id);
              const isBusy = busy === pkg.package_id;
              const canBid = pkg.status === "open" && !due.overdue && (bid || pkg.bid_count < pkg.max_bids);
              const slotsLeft = Math.max(0, pkg.max_bids - pkg.bid_count);

              return (
                <article className="hm-pro-card hm-pro-lead-card" key={pkg.package_id}>
                  <div className="hm-pro-lead-top">
                    <div className="hm-pro-wp-title">
                      <span className="hm-pro-wp-type" style={{ background: meta.tint, color: meta.color }}><Icon size={18} /></span>
                      <div>
                        <div className="hm-pro-badges">
                          {pkg.invited_to_you ? <span className="hm-pro-badge is-targeted">Invited by homeowner</span> : <span className="hm-pro-badge">{meta.label}</span>}
                          {pkg.status === "open" ? <span className={`hm-pro-badge ${due.tone === "warning" ? "" : "is-positive"}`}>{due.label || "Open"}</span> : <span className="hm-pro-badge is-muted">{pkg.status === "awarded" ? "Awarded" : pkg.status === "under_review" ? "Homeowner reviewing" : "Closed"}</span>}
                          {bid ? <span className={`hm-pro-badge ${decision === "declined" ? "is-muted" : "is-positive"}`}>{DECISION_LABEL[decision]}</span> : null}
                          {pkg.site_visit_required ? <span className="hm-pro-badge">Site visit required</span> : null}
                        </div>
                        <h2>{pkg.title}</h2>
                        <small>{pkg.project_title} · {pkg.flow_type === "remodel" ? "Remodel" : "New home"}{pkg.has_ai_design_pack ? " · AI design pack ready" : ""}</small>
                      </div>
                    </div>
                    <span className="hm-pro-date">Posted {formatDateShort(pkg.published_at) || "recently"}</span>
                  </div>

                  <div className="hm-pro-lead-meta">
                    <div className="hm-pro-meta-cell"><span>Location</span><strong><MapPin size={12} style={{ display: "inline", marginRight: 4 }} />{[pkg.city, pkg.state].filter(Boolean).join(", ")}</strong></div>
                    <div className="hm-pro-meta-cell"><span>Pricing basis</span><strong>{pricingBasisLabel(pkg.pricing_basis)}</strong></div>
                    <div className="hm-pro-meta-cell"><span>Homeowner budget</span><strong>{pkg.budget_hint_inr ? formatInrShort(pkg.budget_hint_inr) : "Not disclosed"}</strong></div>
                    <div className="hm-pro-meta-cell"><span>Bids</span><strong>{pkg.bid_count} of {pkg.max_bids}{slotsLeft && pkg.status === "open" ? ` · ${slotsLeft} left` : ""}</strong></div>
                  </div>

                  <div className="hm-pro-tags">
                    <span className="hm-pro-tag">{pkg.scope_label}</span>
                    {pkg.area_sqft ? <span className="hm-pro-tag">{pkg.area_sqft} sq ft</span> : null}
                    {pkg.floors ? <span className="hm-pro-tag">{pkg.floors} floors</span> : null}
                    {pkg.finish_tier ? <span className="hm-pro-tag">{pkg.finish_tier} finish</span> : null}
                    {pkg.target_start ? <span className="hm-pro-tag">Start {formatDateShort(pkg.target_start)}</span> : null}
                    {pkg.attachment_names.length ? <span className="hm-pro-tag">{pkg.attachment_names.length} reference {pkg.attachment_names.length === 1 ? "document" : "documents"}</span> : null}
                    {pkg.styles.slice(0, 3).map((s) => <span className="hm-pro-tag" key={s}>{s}</span>)}
                  </div>

                  {isExpanded ? (
                    <>
                      {pkg.summary ? <p className="hm-pro-wp-summary">{pkg.summary}</p> : null}
                      {pkg.scope_items.length ? (
                        <ol className="hm-pro-wp-scope">
                          {pkg.scope_items.map((item, i) => (
                            <li key={item.id || i}><span>{String(i + 1).padStart(2, "0")}</span><div>{item.label}{item.notes ? <small>{item.notes}</small> : null}</div><em>{[item.quantity, item.unit].filter(Boolean).join(" ")}</em></li>
                          ))}
                        </ol>
                      ) : null}
                      {pkg.inclusions || pkg.exclusions ? (
                        <div className="hm-pro-wp-incl">
                          {pkg.inclusions ? <div><h4 className="is-in">Homeowner expects included</h4><p>{pkg.inclusions}</p></div> : null}
                          {pkg.exclusions ? <div><h4 className="is-out">Excluded from this package</h4><p>{pkg.exclusions}</p></div> : null}
                        </div>
                      ) : null}
                      {pkg.attachment_names.length ? <p className="hm-pro-note" style={{ marginTop: 10 }}>Reference documents on file: {pkg.attachment_names.map((a) => a.name).join(", ")}. The homeowner shares files once you are shortlisted.</p> : null}

                      <div className="hm-pro-qa">
                        <h4><MessageCircleQuestion size={14} style={{ display: "inline", marginRight: 5 }} />Questions & answers{pkg.answered_question_count ? ` · ${pkg.answered_question_count} answered` : ""}</h4>
                        {pkgQuestions.map((q) => (
                          <div className="hm-pro-qa-item" key={q.id}>
                            <p>{q.question}{q.asked_by_you ? <span className="hm-pro-badge" style={{ marginLeft: 8 }}>You asked</span> : null}</p>
                            {q.answer ? <p className="answer">{q.answer}</p> : <span className="meta">Awaiting the homeowner's answer</span>}
                            {q.answered_at ? <span className="meta">Answered {formatDateShort(q.answered_at)} · visible to all bidders</span> : null}
                          </div>
                        ))}
                        {["open", "under_review"].includes(pkg.status) ? (
                          <div className="hm-pro-qa-form">
                            <textarea value={questionDrafts[pkg.package_id] || ""} maxLength={1500} placeholder="Ask about site access, existing conditions, material preferences… Answers are shared with every bidder." onChange={(e) => setQuestionDrafts((c) => ({ ...c, [pkg.package_id]: e.target.value }))} style={{ width: "100%", border: "1px solid #e0d2c4", borderRadius: 9, padding: "9px 11px", font: "inherit", fontSize: 13 }} />
                            <button type="button" className="hm-pro-button-secondary" disabled={busy === `q-${pkg.package_id}` || !(questionDrafts[pkg.package_id] || "").trim()} onClick={() => ask(pkg)}>{busy === `q-${pkg.package_id}` ? "Sending…" : "Ask"}</button>
                          </div>
                        ) : null}
                      </div>
                    </>
                  ) : null}

                  {bid ? (
                    <div className="hm-pro-bid-summary">
                      <div><span>Your bid</span><strong>{formatInrExact(bid.total_amount_inr)}{bid.gst_included ? " incl. GST" : ""}</strong></div>
                      <div><span>Timeline</span><strong>{bid.timeline_weeks ? `${bid.timeline_weeks} weeks` : "Not stated"}</strong></div>
                      <div><span>Revision</span><strong>{bid.revision}</strong></div>
                      <div><span>Homeowner</span><strong>{DECISION_LABEL[decision]}</strong></div>
                    </div>
                  ) : null}

                  {award ? (
                    <div className="hm-pro-award">
                      <strong><Phone size={13} style={{ display: "inline", marginRight: 5 }} />Awarded — homeowner contact unlocked</strong>
                      <div style={{ marginTop: 6 }}>
                        {award.homeowner_name}{award.location ? ` · ${award.location}` : ""}<br />
                        {award.homeowner_phone ? <a href={`tel:${award.homeowner_phone}`}>{award.homeowner_phone}</a> : null}
                        {award.homeowner_email ? <a href={`mailto:${award.homeowner_email}`}>{award.homeowner_email}</a> : null}
                      </div>
                    </div>
                  ) : (
                    <div className="hm-pro-disclosure">Homeowner name, address and contact details stay private until they accept your bid. Shortlisting shares your details with them first.</div>
                  )}

                  {showForm && draft ? (
                    <div className="hm-pro-bid-form">
                      <h4>{bid ? "Revise your bid" : "Place your bid"}</h4>
                      <p>The homeowner compares bids line by line against this scope. Itemised bids with clear inclusions get shortlisted far more often. Revising resets their decision.</p>

                      {draft.lineItems.length ? (
                        <>
                          <label className="hm-pro-check" style={{ marginBottom: 10 }}><input type="checkbox" checked={draft.lumpSum} onChange={(e) => updateDraft(pkg.package_id, "lumpSum", e.target.checked)} /> Quote a single lump sum instead of pricing each line</label>
                          {!draft.lumpSum ? (
                            <div className="hm-pro-lines">
                              <div className="hm-pro-line hm-pro-line-head"><span>Scope line</span><span>Rate (₹)</span><span>Amount (₹)</span></div>
                              {draft.lineItems.map((line, index) => (
                                <div className="hm-pro-line" key={line.scope_item_id || index}>
                                  <span title={line.label}>{line.label}{line.quantity || line.unit ? <small>{[line.quantity, line.unit].filter(Boolean).join(" ")}</small> : null}</span>
                                  <input type="number" min="0" inputMode="numeric" placeholder="rate" aria-label={`Unit rate for ${line.label}`} value={line.unit_rate_inr} onChange={(e) => updateLine(pkg.package_id, index, "unit_rate_inr", e.target.value)} />
                                  <input type="number" min="0" inputMode="numeric" placeholder="amount" aria-label={`Amount for ${line.label}`} value={line.amount_inr} onChange={(e) => updateLine(pkg.package_id, index, "amount_inr", e.target.value)} />
                                </div>
                              ))}
                              <div className="hm-pro-line-total"><span>Total from lines</span><strong>{formatInrExact(lineTotal(draft.lineItems))}</strong></div>
                            </div>
                          ) : null}
                        </>
                      ) : null}

                      <div className="hm-pro-bid-grid" style={{ marginTop: 12 }}>
                        <div className="hm-pro-field">
                          <label htmlFor={`total-${pkg.package_id}`}>Total bid (₹)</label>
                          <input id={`total-${pkg.package_id}`} type="number" min="0" step="1000" inputMode="numeric" value={draft.lumpSum || !lineTotal(draft.lineItems) ? draft.totalAmountInr : String(lineTotal(draft.lineItems))} readOnly={!draft.lumpSum && lineTotal(draft.lineItems) > 0} onChange={(e) => updateDraft(pkg.package_id, "totalAmountInr", e.target.value)} placeholder="450000" />
                          <span className="hm-pro-field-hint">{draft.totalAmountInr || lineTotal(draft.lineItems) ? formatInrExact(draft.lumpSum ? draft.totalAmountInr : lineTotal(draft.lineItems) || draft.totalAmountInr) : "For the whole package"}</span>
                        </div>
                        <div className="hm-pro-field">
                          <label htmlFor={`basis-${pkg.package_id}`}>Pricing basis</label>
                          <select id={`basis-${pkg.package_id}`} value={draft.pricingBasis} onChange={(e) => updateDraft(pkg.package_id, "pricingBasis", e.target.value)}>
                            {Object.entries(PRICING_BASIS).filter(([id]) => id !== "open").map(([id, entry]) => <option key={id} value={id}>{entry.label}</option>)}
                          </select>
                          <label className="hm-pro-check" style={{ marginTop: 4 }}><input type="checkbox" checked={draft.gstIncluded} onChange={(e) => updateDraft(pkg.package_id, "gstIncluded", e.target.checked)} /> GST included in total</label>
                        </div>
                        <div className="hm-pro-field">
                          <label htmlFor={`weeks-${pkg.package_id}`}>Timeline (weeks)</label>
                          <input id={`weeks-${pkg.package_id}`} type="number" min="1" max="520" inputMode="numeric" value={draft.timelineWeeks} onChange={(e) => updateDraft(pkg.package_id, "timelineWeeks", e.target.value)} placeholder="8" />
                        </div>
                        <div className="hm-pro-field">
                          <label htmlFor={`start-${pkg.package_id}`}>Can start on</label>
                          <input id={`start-${pkg.package_id}`} type="date" value={draft.canStartOn} onChange={(e) => updateDraft(pkg.package_id, "canStartOn", e.target.value)} />
                        </div>
                        <div className="hm-pro-field">
                          <label htmlFor={`warranty-${pkg.package_id}`}>Warranty (months)</label>
                          <input id={`warranty-${pkg.package_id}`} type="number" min="0" max="240" inputMode="numeric" value={draft.warrantyMonths} onChange={(e) => updateDraft(pkg.package_id, "warrantyMonths", e.target.value)} placeholder="12" />
                        </div>
                        <div className="hm-pro-field">
                          <label htmlFor={`advance-${pkg.package_id}`}>Advance (%)</label>
                          <input id={`advance-${pkg.package_id}`} type="number" min="0" max="100" inputMode="numeric" value={draft.advancePct} onChange={(e) => updateDraft(pkg.package_id, "advancePct", e.target.value)} placeholder="20" />
                        </div>
                        <div className="hm-pro-field">
                          <label htmlFor={`valid-${pkg.package_id}`}>Price valid until</label>
                          <input id={`valid-${pkg.package_id}`} type="date" value={draft.validUntil} onChange={(e) => updateDraft(pkg.package_id, "validUntil", e.target.value)} />
                        </div>
                        <div className="hm-pro-field">
                          <label>Site visit</label>
                          <label className="hm-pro-check"><input type="checkbox" checked={draft.siteVisitDone} onChange={(e) => updateDraft(pkg.package_id, "siteVisitDone", e.target.checked)} /> I have visited the site</label>
                        </div>
                        <div className="hm-pro-field hm-pro-field-wide">
                          <label htmlFor={`incl-${pkg.package_id}`}>Included in this price</label>
                          <textarea id={`incl-${pkg.package_id}`} value={draft.inclusions} maxLength={3000} onChange={(e) => updateDraft(pkg.package_id, "inclusions", e.target.value)} placeholder="Material brands, labour, testing, cleanup, transport…" />
                        </div>
                        <div className="hm-pro-field hm-pro-field-wide">
                          <label htmlFor={`excl-${pkg.package_id}`}>Excluded</label>
                          <textarea id={`excl-${pkg.package_id}`} value={draft.exclusions} maxLength={3000} onChange={(e) => updateDraft(pkg.package_id, "exclusions", e.target.value)} placeholder="Fixtures, civil making-good, approvals, anything priced separately…" />
                        </div>
                        <div className="hm-pro-field hm-pro-field-wide">
                          <label htmlFor={`assume-${pkg.package_id}`}>Assumptions & payment schedule</label>
                          <textarea id={`assume-${pkg.package_id}`} value={draft.assumptions} maxLength={2000} onChange={(e) => updateDraft(pkg.package_id, "assumptions", e.target.value)} placeholder="Site has power and water; 20% advance, 40% at rough-in, 40% on handover…" />
                        </div>
                        <div className="hm-pro-field hm-pro-field-wide">
                          <label htmlFor={`cover-${pkg.package_id}`}>Note to the homeowner</label>
                          <textarea id={`cover-${pkg.package_id}`} value={draft.coverNote} maxLength={3000} onChange={(e) => updateDraft(pkg.package_id, "coverNote", e.target.value)} placeholder="Why you're the right fit — similar projects, your crew, how you'll run the site." />
                        </div>
                      </div>
                      <div className="hm-pro-inline-actions">
                        <button type="button" className="hm-pro-button" disabled={isBusy} onClick={() => sendBid(pkg)}>{isBusy ? "Sending…" : bid ? "Send revised bid" : "Send bid to homeowner"}</button>
                        <button type="button" className="hm-pro-button-secondary" disabled={isBusy} onClick={() => setBidFormId("")}>Cancel</button>
                        {bid && decision !== "accepted" ? <button type="button" className="hm-pro-button-quiet" disabled={isBusy} onClick={() => withdraw(pkg)}>Withdraw bid</button> : null}
                      </div>
                    </div>
                  ) : null}

                  <div className="hm-pro-lead-actions">
                    <span className="hm-pro-date">{bid ? `Bid sent ${formatDateShort(bid.submitted_at)}` : pkg.myBid?.status === "withdrawn" ? "You withdrew your bid" : "No bid sent yet"}</span>
                    <div className="hm-pro-action-set">
                      <button type="button" className="hm-pro-button-secondary" aria-expanded={isExpanded} onClick={() => setExpandedId(isExpanded ? "" : pkg.package_id)}>
                        {isExpanded ? "Hide scope" : "View scope & Q&A"} {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                      </button>
                      {canBid && decision !== "accepted" ? (
                        <button type="button" className="hm-pro-button" aria-expanded={showForm} onClick={() => openBidForm(pkg)}>{bid ? "Revise bid" : "Place a bid"}</button>
                      ) : !bid && pkg.status === "open" ? (
                        <button type="button" className="hm-pro-button" disabled>{due.overdue ? "Bidding closed" : "Bid limit reached"}</button>
                      ) : null}
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
