import React, { useMemo, useState } from "react";
import { Check, Inbox, Phone, Star, X } from "lucide-react";
import { formatInrShort } from "../lib/projectFlowApi";
import { bidDecisionLabel } from "../lib/projectBidsApi";
import { craftLabel } from "./PublishedProsDirectory";
import "./ProjectBidsPanel.css";

const FILTERS = [
  ["all", "All bids"],
  ["pending", "New"],
  ["shortlisted", "Shortlisted"],
  ["accepted", "Accepted"],
  ["declined", "Declined"],
];

const SORTS = [
  ["price_asc", "Lowest price first"],
  ["price_desc", "Highest price first"],
  ["newest", "Most recent first"],
  ["timeline", "Fastest delivery first"],
];

function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

function decisionBadgeClass(decision) {
  if (decision === "accepted" || decision === "shortlisted") return "is-positive";
  if (decision === "declined") return "is-muted";
  return "";
}

/** How a bid compares with the homeowner's own budget ceiling. */
function budgetDelta(amount, budgetMax) {
  const bid = Number(amount);
  const cap = Number(budgetMax);
  if (!Number.isFinite(bid) || !Number.isFinite(cap) || cap <= 0) {
    return { tone: "is-neutral", text: "No budget set to compare" };
  }
  const diff = bid - cap;
  const pct = Math.round((Math.abs(diff) / cap) * 100);
  if (Math.abs(diff) / cap < 0.02) return { tone: "is-neutral", text: "On your budget" };
  if (diff < 0) return { tone: "is-under", text: `${pct}% under your budget` };
  return { tone: "is-over", text: `${pct}% over your budget` };
}

function submittedLabel(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export default function ProjectBidsPanel({
  bids = [],
  configured = true,
  budgetMax,
  loading = false,
  onDecision,
  onNavigatePath,
  onFindPros,
  matchesSlot = null,
}) {
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("price_asc");
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");

  const counts = useMemo(() => {
    const base = { all: bids.length, pending: 0, shortlisted: 0, accepted: 0, declined: 0 };
    bids.forEach((bid) => {
      const key = bid.homeowner_decision || "pending";
      if (base[key] != null) base[key] += 1;
    });
    return base;
  }, [bids]);

  const visible = useMemo(() => {
    const rows = bids.filter((bid) => filter === "all" || (bid.homeowner_decision || "pending") === filter);
    const amount = (bid) => Number(bid.bid_amount_inr) || 0;
    return [...rows].sort((a, b) => {
      if (sort === "price_asc") return amount(a) - amount(b);
      if (sort === "price_desc") return amount(b) - amount(a);
      if (sort === "timeline") return (Number(a.bid_timeline_weeks) || 9999) - (Number(b.bid_timeline_weeks) || 9999);
      return new Date(b.bid_submitted_at || 0) - new Date(a.bid_submitted_at || 0);
    });
  }, [bids, filter, sort]);

  const lowest = useMemo(() => {
    const amounts = bids.map((bid) => Number(bid.bid_amount_inr)).filter((value) => Number.isFinite(value) && value > 0);
    return amounts.length ? Math.min(...amounts) : null;
  }, [bids]);

  const decide = async (bid, decision) => {
    if (savingId) return;
    setSavingId(bid.bid_id);
    setError("");
    try {
      await onDecision?.({ bidId: bid.bid_id, decision });
    } catch (err) {
      setError(err?.message || "Could not record that decision.");
    } finally {
      setSavingId("");
    }
  };

  return (
    <section className="hm-bids" aria-label="Contractor bids">
      <div className="hm-bids__head">
        <div>
          <p className="hm-bids__kicker">Marketplace bids</p>
          <h2>Bids on your project</h2>
          <span>
            Professionals price your posted brief and send a bid with what the amount covers. Shortlist a bid to
            unlock the professional's contact details, and accept when you are ready to engage them.
          </span>
        </div>
        <div className="hm-bids__summary">
          <strong>{bids.length}</strong>
          <span>{bids.length === 1 ? "bid received" : "bids received"}</span>
          <strong>{lowest ? formatInrShort(lowest) : "—"}</strong>
          <span>lowest bid</span>
        </div>
      </div>

      {!configured ? (
        <div className="hm-bids__empty">
          <div className="hm-bids__empty-icon"><Inbox size={22} /></div>
          <h3>Bidding is not enabled on this workspace yet</h3>
          <p>Your project is saved. Run the project bids migration on the production database and professional bids will appear here automatically.</p>
        </div>
      ) : loading ? (
        <div className="hm-bids__empty" aria-live="polite">
          <h3>Loading bids…</h3>
        </div>
      ) : (
        <>
          {bids.length ? (
            <div className="hm-bids__toolbar">
              <div className="hm-bids__filters" role="tablist" aria-label="Filter bids">
                {FILTERS.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={filter === value}
                    className={`hm-bids__filter ${filter === value ? "is-active" : ""}`}
                    onClick={() => setFilter(value)}
                  >
                    {label} · {counts[value] ?? 0}
                  </button>
                ))}
              </div>
              <label className="hm-bids__sort">
                Sort
                <select value={sort} onChange={(e) => setSort(e.target.value)}>
                  {SORTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
            </div>
          ) : null}

          {error ? <p className="hm-bids__error" role="alert">{error}</p> : null}

          {bids.length === 0 ? (
            <div className="hm-bids__empty">
              <div className="hm-bids__empty-icon"><Inbox size={22} /></div>
              <h3>No bids yet</h3>
              <p>Your brief is live for professionals in your area. Bids usually arrive within a few days — inviting a professional directly is the fastest way to get the first one.</p>
              {onFindPros ? (
                <button type="button" className="hm-bids__button" style={{ marginTop: 16 }} onClick={onFindPros}>
                  Find and invite professionals
                </button>
              ) : null}
            </div>
          ) : visible.length === 0 ? (
            <div className="hm-bids__empty">
              <div className="hm-bids__empty-icon"><Inbox size={22} /></div>
              <h3>Nothing in this stage</h3>
              <p>Choose another stage to see the rest of your bids.</p>
            </div>
          ) : (
            <div className="hm-bids__list">
              {visible.map((bid) => {
                const decision = bid.homeowner_decision || "pending";
                const delta = budgetDelta(bid.bid_amount_inr, budgetMax);
                const busy = savingId === bid.bid_id;
                const isLowest = lowest != null && Number(bid.bid_amount_inr) === lowest;

                return (
                  <article
                    className={`hm-bids__card ${decision === "accepted" ? "is-accepted" : ""} ${decision === "declined" ? "is-declined" : ""}`}
                    key={bid.bid_id}
                  >
                    <div className="hm-bids__card-top">
                      <div className="hm-bids__pro">
                        <div className="hm-bids__avatar">
                          {bid.profile_photo ? <img src={bid.profile_photo} alt="" /> : initials(bid.pro_name)}
                        </div>
                        <div>
                          <h3>{bid.pro_name}</h3>
                          <span>
                            {[craftLabel(bid.craft), bid.pro_city, bid.years_experience ? `${bid.years_experience} yrs` : ""]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </div>
                      </div>
                      <div className="hm-bids__price">
                        <strong>{formatInrShort(bid.bid_amount_inr)}</strong>
                        <span className={delta.tone}>{delta.text}</span>
                      </div>
                    </div>

                    <div className="hm-bids__badges">
                      <span className={`hm-bids__badge ${decisionBadgeClass(decision)}`}>{bidDecisionLabel(decision)}</span>
                      {isLowest && bids.length > 1 ? <span className="hm-bids__badge is-positive">Lowest bid</span> : null}
                      {bid.was_invited ? <span className="hm-bids__badge is-invited">You invited them</span> : null}
                      {bid.specialties.slice(0, 3).map((item) => (
                        <span className="hm-bids__badge" key={item}>{item}</span>
                      ))}
                    </div>

                    <div className="hm-bids__meta">
                      <div><span>Delivery</span><strong>{bid.bid_timeline_weeks ? `${bid.bid_timeline_weeks} weeks` : "Not stated"}</strong></div>
                      <div><span>Bid sent</span><strong>{submittedLabel(bid.bid_submitted_at) || "Recently"}</strong></div>
                      <div><span>Price valid until</span><strong>{bid.bid_valid_until ? submittedLabel(bid.bid_valid_until) : "Not stated"}</strong></div>
                      <div><span>Profile strength</span><strong>{bid.profile_strength ? `${bid.profile_strength}%` : "—"}</strong></div>
                    </div>

                    {bid.bid_scope_note ? <p className="hm-bids__scope">{bid.bid_scope_note}</p> : null}

                    {bid.pro_phone || bid.pro_email ? (
                      <div className="hm-bids__contact">
                        <strong><Phone size={13} style={{ display: "inline", marginRight: 5 }} />Contact unlocked</strong>
                        {bid.pro_phone ? <a href={`tel:${bid.pro_phone}`}>{bid.pro_phone}</a> : null}
                        {bid.pro_email ? <a href={`mailto:${bid.pro_email}`}>{bid.pro_email}</a> : null}
                      </div>
                    ) : null}

                    <div className="hm-bids__actions">
                      <p className="hm-bids__note">
                        {decision === "accepted"
                          ? "Accepted. Your contact details have been shared with this professional."
                          : decision === "shortlisted"
                            ? "Shortlisted. Their contact details are unlocked above — accepting shares yours in return."
                            : "Shortlist to unlock their contact details. Nothing is shared until you do."}
                      </p>
                      <div className="hm-bids__action-set">
                        {bid.slug ? (
                          <button type="button" className="hm-bids__button-secondary" onClick={() => onNavigatePath?.(`/profile/${bid.slug}`)}>
                            View profile
                          </button>
                        ) : null}
                        {decision !== "declined" ? (
                          <button type="button" className="hm-bids__button-quiet" disabled={busy} onClick={() => decide(bid, "declined")}>
                            <X size={13} /> Decline
                          </button>
                        ) : (
                          <button type="button" className="hm-bids__button-quiet" disabled={busy} onClick={() => decide(bid, "pending")}>
                            Reconsider
                          </button>
                        )}
                        {decision !== "shortlisted" && decision !== "accepted" ? (
                          <button type="button" className="hm-bids__button-secondary" disabled={busy} onClick={() => decide(bid, "shortlisted")}>
                            <Star size={13} /> Shortlist
                          </button>
                        ) : null}
                        {decision !== "accepted" ? (
                          <button type="button" className="hm-bids__button" disabled={busy} onClick={() => decide(bid, "accepted")}>
                            <Check size={13} /> {busy ? "Saving…" : "Accept bid"}
                          </button>
                        ) : (
                          <button type="button" className="hm-bids__button" disabled>Accepted</button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      {matchesSlot}
    </section>
  );
}
