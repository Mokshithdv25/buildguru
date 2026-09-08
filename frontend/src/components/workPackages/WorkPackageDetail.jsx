import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Inbox, Loader2, MessageCircleQuestion, Phone, Star, UserPlus, X } from "lucide-react";
import { formatInrShort } from "../../lib/projectFlowApi";
import { listPublishedPortfolios } from "../../lib/api";
import {
  PRICING_BASIS,
  dueState,
  formatDateShort,
  formatInrExact,
  pricingBasisLabel,
  workPackageStatus,
  workPackageType,
} from "../../lib/workPackageCatalog";
import { craftLabel } from "../PublishedProsDirectory";
import "./workPackages.css";

const DECISION_LABEL = { pending: "New bid", shortlisted: "Shortlisted", accepted: "Accepted", declined: "Declined" };
const FILTERS = [["all", "All"], ["pending", "New"], ["shortlisted", "Shortlisted"], ["accepted", "Accepted"], ["declined", "Declined"]];
const SORTS = [["price_asc", "Lowest price"], ["price_desc", "Highest price"], ["timeline", "Fastest"], ["newest", "Most recent"]];

function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

function budgetDelta(amount, budget) {
  const bid = Number(amount);
  const cap = Number(budget);
  if (!Number.isFinite(bid) || !Number.isFinite(cap) || cap <= 0) return { tone: "is-neutral", text: "No budget set" };
  const diff = bid - cap;
  const pct = Math.round((Math.abs(diff) / cap) * 100);
  if (Math.abs(diff) / cap < 0.02) return { tone: "is-neutral", text: "On budget" };
  if (diff < 0) return { tone: "is-under", text: `${pct}% under budget` };
  return { tone: "is-over", text: `${pct}% over budget` };
}

function decisionTone(decision) {
  if (decision === "accepted" || decision === "shortlisted") return "is-positive";
  if (decision === "declined") return "is-muted";
  return "";
}

function amountForScopeItem(bid, scopeItem, index) {
  const lines = bid.line_items || [];
  const byId = scopeItem.id ? lines.find((l) => l.scope_item_id && String(l.scope_item_id) === String(scopeItem.id)) : null;
  const byLabel = byId || lines.find((l) => l.label && scopeItem.label && l.label.trim().toLowerCase() === scopeItem.label.trim().toLowerCase());
  const row = byLabel || (lines.length === (bid.__scopeCount || 0) ? lines[index] : null);
  const amount = Number(row?.amount_inr);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

/** Side-by-side bid leveling: scope lines × bids, lowest per row highlighted. */
function BidLevelingTable({ pkg, bids }) {
  const scope = pkg.scope_items || [];
  const rows = scope.map((item, index) => {
    const amounts = bids.map((bid) => amountForScopeItem({ ...bid, __scopeCount: scope.length }, item, index));
    const valid = amounts.filter((a) => a != null);
    const min = valid.length > 1 ? Math.min(...valid) : null;
    return { item, amounts, min };
  });
  const totals = bids.map((bid) => Number(bid.total_amount_inr) || 0);
  const minTotal = totals.length > 1 ? Math.min(...totals.filter((t) => t > 0)) : null;
  const hasLineData = rows.some((r) => r.amounts.some((a) => a != null));

  const termRows = [
    ["Timeline", (b) => (b.timeline_weeks ? `${b.timeline_weeks} wks` : "—")],
    ["Can start", (b) => formatDateShort(b.can_start_on) || "—"],
    ["Warranty", (b) => (b.warranty_months != null ? `${b.warranty_months} mo` : "—")],
    ["Advance", (b) => (b.advance_pct != null ? `${b.advance_pct}%` : "—")],
    ["GST", (b) => (b.gst_included ? "Included" : "Extra")],
    ["Basis", (b) => pricingBasisLabel(b.pricing_basis, true)],
    ["Site visit", (b) => (b.site_visit_done ? "Done" : "Not yet")],
    ["Valid until", (b) => formatDateShort(b.valid_until) || "—"],
  ];

  return (
    <div className="hm-wp__leveling" role="region" aria-label="Compare bids side by side">
      <table>
        <thead>
          <tr>
            <th>Compare</th>
            {bids.map((bid) => (
              <th key={bid.bid_id}>
                {bid.pro_name}
                <small>{[craftLabel(bid.craft), bid.pro_city].filter(Boolean).join(" · ")}</small>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {hasLineData ? rows.map(({ item, amounts, min }) => (
            <tr key={item.id || item.label}>
              <td>{item.label}{item.quantity ? <small style={{ display: "block", color: "#9a9088", fontWeight: 500 }}>{item.quantity} {item.unit}</small> : null}</td>
              {amounts.map((amount, i) => (
                <td key={bids[i].bid_id} className={amount == null ? "is-missing" : min != null && amount === min ? "is-lowest" : ""}>
                  {amount == null ? "not itemised" : formatInrExact(amount)}
                </td>
              ))}
            </tr>
          )) : null}
          <tr className="is-total">
            <td>Total bid</td>
            {bids.map((bid, i) => (
              <td key={bid.bid_id} className={minTotal != null && totals[i] === minTotal ? "is-lowest" : ""}>{formatInrExact(bid.total_amount_inr)}</td>
            ))}
          </tr>
          {termRows.map(([label, read]) => (
            <tr key={label}>
              <td>{label}</td>
              {bids.map((bid) => <td key={bid.bid_id}>{read(bid)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BidCard({ bid, pkg, isLowest, busy, onDecision, onNavigatePath }) {
  const decision = bid.homeowner_decision || "pending";
  const delta = budgetDelta(bid.total_amount_inr, pkg.budget_hint_inr);
  const lines = (bid.line_items || []).filter((l) => l.label);
  const awardedElsewhere = pkg.status === "awarded" && pkg.awarded_bid_id && pkg.awarded_bid_id !== bid.bid_id;

  return (
    <article className={`hm-wp__bid ${decision === "accepted" ? "is-accepted" : ""} ${decision === "declined" ? "is-declined" : ""}`}>
      <div className="hm-wp__bid-top">
        <div className="hm-wp__pro">
          <div className="hm-wp__avatar">{bid.profile_photo ? <img src={bid.profile_photo} alt="" /> : initials(bid.pro_name)}</div>
          <div>
            <h3>{bid.pro_name}</h3>
            <span>{[craftLabel(bid.craft), bid.pro_city, bid.years_experience ? `${bid.years_experience} yrs` : "", bid.profile_strength ? `Profile ${bid.profile_strength}%` : ""].filter(Boolean).join(" · ")}</span>
          </div>
        </div>
        <div className="hm-wp__price">
          <strong>{formatInrExact(bid.total_amount_inr)}</strong>
          <span className={delta.tone}>{delta.text}{bid.gst_included ? " · incl. GST" : " · GST extra"}</span>
        </div>
      </div>

      <div className="hm-wp__badges">
        <span className={`hm-wp__badge ${decisionTone(decision)}`}>{DECISION_LABEL[decision]}</span>
        {isLowest ? <span className="hm-wp__badge is-positive">Lowest total</span> : null}
        {bid.was_invited ? <span className="hm-wp__badge is-invited">You invited them</span> : null}
        {bid.revision > 1 ? <span className="hm-wp__badge">Revision {bid.revision}</span> : null}
        <span className="hm-wp__badge">{pricingBasisLabel(bid.pricing_basis, true)}</span>
        {bid.site_visit_done ? <span className="hm-wp__badge is-positive">Visited site</span> : null}
        {bid.specialties.slice(0, 2).map((s) => <span className="hm-wp__badge" key={s}>{s}</span>)}
      </div>

      <div className="hm-wp__meta">
        <div><span>Timeline</span><strong>{bid.timeline_weeks ? `${bid.timeline_weeks} weeks` : "Not stated"}</strong></div>
        <div><span>Can start</span><strong>{formatDateShort(bid.can_start_on) || "Flexible"}</strong></div>
        <div><span>Warranty</span><strong>{bid.warranty_months != null ? `${bid.warranty_months} months` : "Not stated"}</strong></div>
        <div><span>Advance</span><strong>{bid.advance_pct != null ? `${bid.advance_pct}%` : "Not stated"}</strong></div>
        <div><span>Valid until</span><strong>{formatDateShort(bid.valid_until) || "Not stated"}</strong></div>
        <div><span>Sent</span><strong>{formatDateShort(bid.submitted_at) || "Recently"}</strong></div>
      </div>

      {lines.length ? (
        <div className="hm-wp__bid-lines">
          <table>
            <tbody>
              {lines.map((line, i) => (
                <tr key={`${line.label}-${i}`}>
                  <td>{line.label}{line.quantity ? <span style={{ color: "#9a9088" }}> · {line.quantity} {line.unit}{line.unit_rate_inr ? ` @ ${formatInrShort(line.unit_rate_inr)}` : ""}</span> : null}</td>
                  <td>{line.amount_inr != null ? formatInrExact(line.amount_inr) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {bid.inclusions || bid.exclusions || bid.assumptions ? (
        <div className="hm-wp__incl">
          {bid.inclusions ? <div><h4 className="is-in">Included</h4><p>{bid.inclusions}</p></div> : null}
          {bid.exclusions ? <div><h4 className="is-out">Excluded</h4><p>{bid.exclusions}</p></div> : null}
          {bid.assumptions ? <div><h4>Assumptions</h4><p>{bid.assumptions}</p></div> : null}
          {bid.payment_schedule_note ? <div><h4>Payment schedule</h4><p>{bid.payment_schedule_note}</p></div> : null}
        </div>
      ) : null}

      {bid.cover_note ? <p className="hm-wp__bid-note">{bid.cover_note}</p> : null}

      {bid.pro_phone || bid.pro_email ? (
        <div className="hm-wp__contact">
          <strong><Phone size={13} style={{ display: "inline", marginRight: 5 }} />Contact unlocked</strong>
          {bid.pro_phone ? <a href={`tel:${bid.pro_phone}`}>{bid.pro_phone}</a> : null}
          {bid.pro_email ? <a href={`mailto:${bid.pro_email}`}>{bid.pro_email}</a> : null}
        </div>
      ) : null}

      <div className="hm-wp__bid-actions">
        <p>
          {decision === "accepted"
            ? "Accepted. Your contact details are shared with this professional and the package is marked awarded."
            : decision === "shortlisted"
              ? "Shortlisted — their contact is unlocked above. Accepting shares yours and awards the package."
              : awardedElsewhere
                ? "This package is already awarded to another bid."
                : "Shortlist to unlock their contact details. Nothing is shared until you do."}
        </p>
        <div className="hm-wp__action-set">
          {bid.slug ? <button type="button" className="hm-wp__btn-secondary" onClick={() => onNavigatePath?.(`/profile/${bid.slug}`)}>View profile</button> : null}
          {decision !== "declined" ? (
            <button type="button" className="hm-wp__btn-quiet" disabled={busy} onClick={() => onDecision(bid, "declined")}><X size={13} /> Decline</button>
          ) : (
            <button type="button" className="hm-wp__btn-quiet" disabled={busy} onClick={() => onDecision(bid, "pending")}>Reconsider</button>
          )}
          {decision !== "shortlisted" && decision !== "accepted" ? (
            <button type="button" className="hm-wp__btn-secondary" disabled={busy} onClick={() => onDecision(bid, "shortlisted")}><Star size={13} /> Shortlist</button>
          ) : null}
          {decision !== "accepted" ? (
            <button type="button" className="hm-wp__btn" disabled={busy || awardedElsewhere} onClick={() => onDecision(bid, "accepted")}><Check size={13} /> {busy ? "Saving…" : "Accept & award"}</button>
          ) : (
            <button type="button" className="hm-wp__btn-quiet" disabled={busy} onClick={() => onDecision(bid, "shortlisted")}>Undo acceptance</button>
          )}
        </div>
      </div>
    </article>
  );
}

function InviteDrawer({ pkg, city, invites, onInvite, onClose }) {
  const [pros, setPros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [anywhere, setAnywhere] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const crafts = pkg.eligible_crafts?.length ? pkg.eligible_crafts : [null];
    Promise.all(crafts.map((craft) => listPublishedPortfolios({ craft: craft || undefined, city: anywhere ? undefined : city || undefined, limit: 12 }).catch(() => [])))
      .then((groups) => {
        if (!active) return;
        const seen = new Set();
        setPros(groups.flat().filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true))));
      })
      .catch((err) => active && setError(err?.message || "Could not load professionals."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [pkg.id, pkg.eligible_crafts, city, anywhere]);

  const invitedIds = new Set(invites.map((i) => String(i.portfolio_id)));

  const invite = async (pro) => {
    setBusyId(pro.id);
    setError("");
    try { await onInvite(pro); } catch (err) { setError(err?.message || "Could not send the invitation."); } finally { setBusyId(""); }
  };

  return (
    <div className="hm-wp hm-wp__overlay" role="dialog" aria-modal="true" aria-label="Invite professionals" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="hm-wp__modal" style={{ width: "min(640px, 100%)" }}>
        <div className="hm-wp__modal-head">
          <div>
            <h2>Invite professionals to bid</h2>
            <p>{pkg.eligible_crafts?.map(craftLabel).join(", ") || "Published professionals"}{city && !anywhere ? ` in ${city}` : ""}. Invited professionals are notified and can bid even if the package is not open to their trade.</p>
          </div>
          <button type="button" className="hm-wp__close" aria-label="Close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="hm-wp__modal-body">
          <label className="hm-wp__toggle"><input type="checkbox" checked={anywhere} onChange={(e) => setAnywhere(e.target.checked)} /> Include professionals outside {city || "my city"}</label>
          {error ? <p className="hm-wp__error" role="alert">{error}</p> : null}
          {loading ? <p className="hm-wp__hint"><Loader2 size={13} className="animate-spin" style={{ display: "inline", marginRight: 6 }} />Loading published professionals…</p> : pros.length === 0 ? (
            <div className="hm-wp__empty"><h3>No matching professionals yet</h3><p>Try including other cities, or open the package to more trades.</p></div>
          ) : (
            <div className="hm-wp__pros">
              {pros.map((pro) => {
                const name = pro.business_name || pro.full_name || "Professional";
                const invited = invitedIds.has(String(pro.id));
                return (
                  <div className="hm-wp__pro-row" key={pro.id}>
                    <div className="hm-wp__avatar" style={{ width: 40, height: 40 }}>{pro.profile_photo ? <img src={pro.profile_photo} alt="" /> : initials(name)}</div>
                    <div><strong>{name}</strong><span>{[craftLabel(pro.craft), pro.city, pro.years_experience ? `${pro.years_experience} yrs` : ""].filter(Boolean).join(" · ")}</span></div>
                    <button type="button" className={invited ? "hm-wp__btn-secondary is-small" : "hm-wp__btn is-small"} disabled={invited || busyId === pro.id} onClick={() => invite(pro)}>
                      {invited ? <><Check size={12} /> Invited</> : busyId === pro.id ? "Inviting…" : <><UserPlus size={12} /> Invite</>}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="hm-wp__modal-foot"><span className="hm-wp__hint">{invites.length} invited so far</span><div><button type="button" className="hm-wp__btn-secondary" onClick={onClose}>Done</button></div></div>
      </div>
    </div>
  );
}

export default function WorkPackageDetail({
  pkg,
  bids = [],
  questions = [],
  invites = [],
  city = "",
  onBack,
  onEdit,
  onPublish,
  onSetStatus,
  onDelete,
  onDecision,
  onAnswer,
  onInvite,
  onNavigatePath,
}) {
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("price_asc");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [answerDrafts, setAnswerDrafts] = useState({});
  const [inviting, setInviting] = useState(false);

  const meta = workPackageType(pkg.package_type);
  const Icon = meta.Icon;
  const status = workPackageStatus(pkg.status);
  const due = dueState(pkg.bids_due_at, pkg.status);
  const submitted = useMemo(() => bids.filter((b) => b.status === "submitted"), [bids]);
  const lowest = useMemo(() => {
    const amounts = submitted.map((b) => Number(b.total_amount_inr)).filter((n) => Number.isFinite(n) && n > 0);
    return amounts.length ? Math.min(...amounts) : null;
  }, [submitted]);
  const counts = useMemo(() => {
    const base = { all: submitted.length, pending: 0, shortlisted: 0, accepted: 0, declined: 0 };
    submitted.forEach((b) => { base[b.homeowner_decision || "pending"] += 1; });
    return base;
  }, [submitted]);
  const visible = useMemo(() => {
    const rows = submitted.filter((b) => filter === "all" || (b.homeowner_decision || "pending") === filter);
    const amount = (b) => Number(b.total_amount_inr) || 0;
    return [...rows].sort((a, b) => {
      if (sort === "price_asc") return amount(a) - amount(b);
      if (sort === "price_desc") return amount(b) - amount(a);
      if (sort === "timeline") return (Number(a.timeline_weeks) || 9999) - (Number(b.timeline_weeks) || 9999);
      return new Date(b.submitted_at || 0) - new Date(a.submitted_at || 0);
    });
  }, [submitted, filter, sort]);
  const compareSet = useMemo(() => submitted.filter((b) => b.homeowner_decision !== "declined").sort((a, b) => (Number(a.total_amount_inr) || 0) - (Number(b.total_amount_inr) || 0)).slice(0, 6), [submitted]);

  const run = async (key, fn) => {
    if (busy) return;
    setBusy(key);
    setError("");
    try { await fn(); } catch (err) { setError(err?.message || "Something went wrong."); } finally { setBusy(""); }
  };

  const unanswered = questions.filter((q) => !q.answered_at);

  return (
    <section className="hm-wp" aria-label={`Work package: ${pkg.title}`}>
      <button type="button" className="hm-wp__back" onClick={onBack}><ArrowLeft size={14} /> All work packages</button>

      <div className="hm-wp__card">
        <div className="hm-wp__detail-head">
          <div className="hm-wp__detail-title">
            <span className="hm-wp__type-icon" style={{ background: meta.tint, color: meta.color }}><Icon size={20} /></span>
            <div>
              <h2>{pkg.title}</h2>
              <div className="hm-wp__badges">
                <span className={`hm-wp__badge is-${status.tone}`}>{status.label}</span>
                <span className="hm-wp__badge">{meta.label}</span>
                {due.label && pkg.status === "open" ? <span className={`hm-wp__badge is-${due.tone}`}>{due.label}</span> : null}
                {pkg.site_visit_required ? <span className="hm-wp__badge">Site visit required</span> : null}
              </div>
            </div>
          </div>
          <div className="hm-wp__detail-actions">
            {pkg.status === "draft" ? (
              <>
                <button type="button" className="hm-wp__btn-danger" disabled={Boolean(busy)} onClick={() => run("delete", onDelete)}>Delete draft</button>
                <button type="button" className="hm-wp__btn-secondary" onClick={onEdit}>Edit</button>
                <button type="button" className="hm-wp__btn" disabled={Boolean(busy)} onClick={() => run("publish", onPublish)}>{busy === "publish" ? "Publishing…" : "Publish to professionals"}</button>
              </>
            ) : null}
            {pkg.status === "open" || pkg.status === "under_review" ? (
              <>
                <button type="button" className="hm-wp__btn-secondary" onClick={onEdit}>Edit</button>
                <button type="button" className="hm-wp__btn-secondary" onClick={() => setInviting(true)}><UserPlus size={13} /> Invite pros</button>
                {pkg.status === "open" ? (
                  <button type="button" className="hm-wp__btn-quiet" disabled={Boolean(busy)} onClick={() => run("status", () => onSetStatus("under_review"))}>Stop accepting bids</button>
                ) : (
                  <button type="button" className="hm-wp__btn-quiet" disabled={Boolean(busy)} onClick={() => run("status", () => onSetStatus("open"))}>Reopen bidding</button>
                )}
                <button type="button" className="hm-wp__btn-quiet" disabled={Boolean(busy)} onClick={() => run("status", () => onSetStatus("closed"))}>Close</button>
              </>
            ) : null}
            {pkg.status === "closed" || pkg.status === "cancelled" ? (
              <button type="button" className="hm-wp__btn-secondary" disabled={Boolean(busy)} onClick={() => run("publish", onPublish)}>Reopen for bids</button>
            ) : null}
            {pkg.status === "awarded" ? (
              <button type="button" className="hm-wp__btn-quiet" disabled={Boolean(busy)} onClick={() => run("status", () => onSetStatus("closed"))}>Mark complete & close</button>
            ) : null}
          </div>
        </div>

        <div className="hm-wp__meta">
          <div><span>Pricing basis</span><strong>{PRICING_BASIS[pkg.pricing_basis]?.label || "Open"}</strong></div>
          <div><span>Bids</span><strong>{submitted.length} of {pkg.max_bids} max</strong></div>
          <div><span>Bids due</span><strong>{pkg.bids_due_at ? formatDateShort(pkg.bids_due_at) : "No deadline"}</strong></div>
          <div><span>Your budget</span><strong>{pkg.budget_hint_inr ? `${formatInrShort(pkg.budget_hint_inr)}${pkg.show_budget_to_pros ? " · shown" : " · private"}` : "Not set"}</strong></div>
          <div><span>Target dates</span><strong>{[formatDateShort(pkg.target_start), formatDateShort(pkg.target_completion)].filter(Boolean).join(" → ") || "Flexible"}</strong></div>
          <div><span>Open to</span><strong>{pkg.eligible_crafts?.length ? pkg.eligible_crafts.map(craftLabel).join(", ") : "Any trade"}</strong></div>
        </div>
        {error ? <p className="hm-wp__error" role="alert">{error}</p> : null}
      </div>

      <div className="hm-wp__grid hm-wp__section">
        <div className="hm-wp__card">
          <div className="hm-wp__section-head"><div><h3>Scope of work</h3><p>Every bidder prices these lines.</p></div></div>
          {pkg.summary ? <p className="hm-wp__summary">{pkg.summary}</p> : null}
          {pkg.scope_items?.length ? (
            <ol className="hm-wp__scope-list">
              {pkg.scope_items.map((item, i) => (
                <li key={item.id || i}>
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  <div>{item.label}{item.notes ? <small>{item.notes}</small> : null}</div>
                  <em>{[item.quantity, item.unit].filter(Boolean).join(" ")}</em>
                </li>
              ))}
            </ol>
          ) : <p className="hm-wp__hint">No scope lines yet. Edit the package to add them — itemised scopes get itemised bids.</p>}
          {pkg.inclusions || pkg.exclusions ? (
            <div className="hm-wp__incl">
              {pkg.inclusions ? <div><h4 className="is-in">Included</h4><p>{pkg.inclusions}</p></div> : null}
              {pkg.exclusions ? <div><h4 className="is-out">Excluded</h4><p>{pkg.exclusions}</p></div> : null}
            </div>
          ) : null}
          {pkg.attachments_json?.length ? (
            <div className="hm-wp__chips">{pkg.attachments_json.map((a, i) => <span className="hm-wp__chip" key={`${a.document_id}-${i}`}>{a.name}</span>)}</div>
          ) : null}
        </div>

        <div className="hm-wp__card">
          <div className="hm-wp__section-head">
            <div><h3>Questions from bidders</h3><p>Your answers are shared with every eligible professional, so everyone prices the same facts.</p></div>
            {unanswered.length ? <span className="hm-wp__badge is-warning">{unanswered.length} to answer</span> : null}
          </div>
          {questions.length === 0 ? (
            <p className="hm-wp__hint"><MessageCircleQuestion size={13} style={{ display: "inline", marginRight: 5 }} />No questions yet. Professionals can ask before they bid.</p>
          ) : (
            <div className="hm-wp__qa">
              {questions.map((q) => (
                <div className="hm-wp__q" key={q.id}>
                  <p className="hm-wp__q-q">{q.question}</p>
                  <span className="hm-wp__q-meta">Asked {formatDateShort(q.created_at)}{q.answered_at ? ` · Answered ${formatDateShort(q.answered_at)}` : ""}</span>
                  {q.answer ? <p className="hm-wp__q-a">{q.answer}</p> : (
                    <div className="hm-wp__q-form">
                      <textarea value={answerDrafts[q.id] || ""} maxLength={3000} placeholder="Write a clear answer — every bidder will see it." onChange={(e) => setAnswerDrafts((c) => ({ ...c, [q.id]: e.target.value }))} />
                      <div><button type="button" className="hm-wp__btn is-small" disabled={busy === q.id || !(answerDrafts[q.id] || "").trim()} onClick={() => run(q.id, () => onAnswer(q, answerDrafts[q.id]))}>{busy === q.id ? "Posting…" : "Post answer"}</button></div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="hm-wp__section">
        <div className="hm-wp__section-head">
          <div><h3>Bids{submitted.length ? ` · ${submitted.length}` : ""}</h3><p>{lowest ? `Lowest ${formatInrExact(lowest)}` : pkg.status === "draft" ? "Publish the package to start receiving bids." : "Bids from eligible professionals appear here."}</p></div>
          {invites.length ? <span className="hm-wp__badge is-invited">{invites.length} invited</span> : null}
        </div>

        {compareSet.length >= 2 ? (
          <div style={{ marginBottom: 14 }}><BidLevelingTable pkg={pkg} bids={compareSet} /></div>
        ) : null}

        {submitted.length ? (
          <div className="hm-wp__toolbar">
            <div className="hm-wp__filters" role="tablist" aria-label="Filter bids">
              {FILTERS.map(([value, label]) => (
                <button key={value} type="button" role="tab" aria-selected={filter === value} className={`hm-wp__filter ${filter === value ? "is-active" : ""}`} onClick={() => setFilter(value)}>{label} · {counts[value] ?? 0}</button>
              ))}
            </div>
            <label className="hm-wp__sort">Sort<select value={sort} onChange={(e) => setSort(e.target.value)}>{SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          </div>
        ) : null}

        {submitted.length === 0 ? (
          <div className="hm-wp__empty">
            <div className="hm-wp__empty-icon"><Inbox size={22} /></div>
            <h3>{pkg.status === "draft" ? "Not published yet" : "No bids yet"}</h3>
            <p>{pkg.status === "draft" ? "Professionals only see published packages. Review the scope, then publish." : "Eligible professionals in your city have been notified. Inviting specific professionals is the fastest way to get the first bid."}</p>
            {pkg.status === "open" ? <button type="button" className="hm-wp__btn" style={{ marginTop: 16 }} onClick={() => setInviting(true)}><UserPlus size={13} /> Invite professionals</button> : null}
          </div>
        ) : visible.length === 0 ? (
          <div className="hm-wp__empty"><h3>Nothing in this stage</h3><p>Choose another filter to see the rest of the bids.</p></div>
        ) : (
          <div className="hm-wp__list">
            {visible.map((bid) => (
              <BidCard
                key={bid.bid_id}
                bid={bid}
                pkg={pkg}
                isLowest={lowest != null && Number(bid.total_amount_inr) === lowest && submitted.length > 1}
                busy={busy === bid.bid_id}
                onDecision={(b, decision) => run(b.bid_id, () => onDecision(b, decision))}
                onNavigatePath={onNavigatePath}
              />
            ))}
          </div>
        )}
      </div>

      {inviting ? <InviteDrawer pkg={pkg} city={city} invites={invites} onInvite={onInvite} onClose={() => setInviting(false)} /> : null}
    </section>
  );
}
