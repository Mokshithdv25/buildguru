import React, { useMemo, useState } from "react";
import { Check, ChevronRight, Inbox, Plus, Sparkles } from "lucide-react";
import { formatInrShort } from "../../lib/projectFlowApi";
import { dueState, formatDateShort, suggestWorkPackages, workPackageStatus, workPackageType } from "../../lib/workPackageCatalog";
import { hireModeMeta, isOwnTeamHire, normalizeHireMode } from "../../lib/hireMode";
import HireStrategyPicker from "../HireStrategyPicker";
import { craftLabel } from "../PublishedProsDirectory";
import "./workPackages.css";

function relativeTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diff = Date.now() - date.getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDateShort(value);
}

function PackageRow({ pkg, bids, onOpen }) {
  const meta = workPackageType(pkg.package_type);
  const Icon = meta.Icon;
  const status = workPackageStatus(pkg.status);
  const due = dueState(pkg.bids_due_at, pkg.status);
  const submitted = bids.filter((b) => b.status === "submitted");
  const pending = submitted.filter((b) => (b.homeowner_decision || "pending") === "pending").length;
  const lowest = submitted.length ? Math.min(...submitted.map((b) => Number(b.total_amount_inr) || Infinity)) : null;
  const awarded = submitted.find((b) => b.homeowner_decision === "accepted");

  return (
    <button type="button" className={`hm-wp__pkg ${pkg.status === "awarded" ? "is-awarded" : ""} ${["closed", "cancelled"].includes(pkg.status) ? "is-muted" : ""}`} onClick={() => onOpen(pkg)}>
      <span className="hm-wp__type-icon" style={{ background: meta.tint, color: meta.color }}><Icon size={18} /></span>
      <span>
        <span className="hm-wp__pkg-title">
          <h3>{pkg.title}</h3>
          <span className={`hm-wp__badge is-${status.tone}`}>{status.label}</span>
          {pending ? <span className="hm-wp__pkg-new" aria-label={`${pending} new bids`}>{pending}</span> : null}
        </span>
        <span className="hm-wp__pkg-sub">
          <span>{pkg.eligible_crafts?.length ? pkg.eligible_crafts.map(craftLabel).join(", ") : "Any trade"}</span>
          {pkg.status === "open" && due.label ? <span><strong>{due.label}</strong></span> : null}
          {awarded ? <span>Awarded to <strong>{awarded.pro_name}</strong></span> : null}
          {pkg.scope_items?.length ? <span>{pkg.scope_items.length} scope lines</span> : null}
        </span>
      </span>
      <span className="hm-wp__pkg-right">
        <strong>{submitted.length ? formatInrShort(awarded ? awarded.total_amount_inr : lowest) : "—"}</strong>
        <span>{submitted.length ? (awarded ? "awarded" : `lowest of ${submitted.length} ${submitted.length === 1 ? "bid" : "bids"}`) : pkg.status === "draft" ? "draft" : "no bids yet"}</span>
        <ChevronRight size={15} style={{ color: "#b5aca4" }} />
      </span>
    </button>
  );
}

export default function WorkPackagesBoard({
  packages = [],
  bidsByPackage = {},
  events = [],
  flowType,
  brief = {},
  estimate = null,
  configured = true,
  loading = false,
  onOpen,
  onCreate,
  onCreateMany,
  onMarkEventsRead,
  hireMode: hireModeProp,
  onHireModeChange,
}) {
  const [selectedSuggestions, setSelectedSuggestions] = useState(() => new Set());
  const [creatingMany, setCreatingMany] = useState(false);
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [changingMode, setChangingMode] = useState(false);
  const hireMode = normalizeHireMode(hireModeProp || brief);

  const suggestions = useMemo(
    () => suggestWorkPackages({ flowType, brief, estimate, hireMode, existingTypes: packages.map((p) => p.package_type) }),
    [flowType, brief, estimate, hireMode, packages],
  );

  const stats = useMemo(() => {
    const allBids = Object.values(bidsByPackage).flat().filter((b) => b.status === "submitted");
    return {
      open: packages.filter((p) => p.status === "open").length,
      bids: allBids.length,
      pending: allBids.filter((b) => (b.homeowner_decision || "pending") === "pending").length,
      awarded: packages.filter((p) => p.status === "awarded").length,
    };
  }, [packages, bidsByPackage]);

  const unread = events.filter((e) => !e.read_at);
  const visibleEvents = showAllEvents ? events.slice(0, 20) : events.slice(0, 5);

  const toggleSuggestion = (type) => {
    setSelectedSuggestions((current) => {
      const next = new Set(current);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });
  };

  const createSelected = async (publish = false) => {
    const chosen = suggestions.filter((s) => selectedSuggestions.has(s.type));
    if (!chosen.length || creatingMany) return;
    setCreatingMany(true);
    try {
      await onCreateMany?.(chosen, { publish });
      setSelectedSuggestions(new Set());
    } finally {
      setCreatingMany(false);
    }
  };

  const switchMode = async (next) => {
    if (!onHireModeChange || next === hireMode || changingMode) return;
    setChangingMode(true);
    try {
      await onHireModeChange(next);
    } finally {
      setChangingMode(false);
    }
  };

  const mode = hireModeMeta(hireMode);
  const ownTeam = isOwnTeamHire(hireMode);

  const grouped = useMemo(() => {
    const order = { open: 0, under_review: 1, draft: 2, awarded: 3, closed: 4, cancelled: 5 };
    return [...packages].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || new Date(b.created_at) - new Date(a.created_at));
  }, [packages]);

  return (
    <section className="hm-wp" aria-label="Work packages">
      <div className="hm-wp__head">
        <div>
          <p className="hm-wp__kicker">Hire professionals</p>
          <h2>{ownTeam ? "Your team" : mode.short}</h2>
          <span className="hm-wp__head-copy">
            {ownTeam
              ? "This project is private. Invite people you already work with under Team, or switch to a marketplace strategy below to start collecting comparable bids."
              : hireMode === "gc"
                ? "Contractors see the whole brief and send a single bid. Add trade packages if you also want electricians, plumbers or carpenters to quote their own scope."
                : hireMode === "design_first"
                  ? "Start with an architecture or interiors RFQ. Construction and MEP packages stay suggested until you publish them."
                  : "Split the project into trade-scoped RFQs — design, civil, electrical, plumbing, carpentry, materials. Every bidder prices the same checklist, then you compare line by line and award."}
          </span>
          <div className="hm-wp__head-actions">
            {!ownTeam ? (
              <button type="button" className="hm-wp__btn" onClick={() => onCreate?.()} disabled={!configured}><Plus size={14} /> New work package</button>
            ) : null}
          </div>
        </div>
        <div className="hm-wp__stats" aria-label="Work package summary">
          <div><strong>{stats.open}</strong><span>open for bids</span></div>
          <div><strong>{stats.bids}</strong><span>{stats.pending ? `bids · ${stats.pending} new` : "bids received"}</span></div>
          <div><strong>{stats.awarded}</strong><span>awarded</span></div>
        </div>
      </div>

      {onHireModeChange ? (
        <div className="hm-wp__section">
          <div className="hm-wp__section-head">
            <div>
              <h3>Hiring strategy</h3>
              <p>{changingMode ? "Saving…" : "You can change this any time. Trade RFQs stay on their own feed; whole-project bids only go out in “One contractor” mode."}</p>
            </div>
          </div>
          <HireStrategyPicker value={hireMode} onChange={switchMode} disabled={changingMode} />
        </div>
      ) : null}

      {!configured ? (
        <div className="hm-wp__empty hm-wp__section">
          <div className="hm-wp__empty-icon"><Inbox size={22} /></div>
          <h3>Work packages are not enabled on this workspace yet</h3>
          <p>Your project is saved. Run <code>db/buildguru_work_packages.sql</code> on the production database and trade-scoped bidding will appear here automatically.</p>
        </div>
      ) : loading ? (
        <div className="hm-wp__empty hm-wp__section" aria-live="polite"><h3>Loading work packages…</h3></div>
      ) : (
        <>
          {events.length ? (
            <div className="hm-wp__section">
              <div className="hm-wp__section-head">
                <div><h3>Activity</h3><p>{unread.length ? `${unread.length} unread` : "You're up to date"}</p></div>
                <div style={{ display: "flex", gap: 8 }}>
                  {unread.length ? <button type="button" className="hm-wp__btn-quiet is-small" onClick={() => onMarkEventsRead?.(unread.map((e) => e.id))}>Mark all read</button> : null}
                  {events.length > 5 ? <button type="button" className="hm-wp__btn-quiet is-small" onClick={() => setShowAllEvents((v) => !v)}>{showAllEvents ? "Show less" : `Show all (${Math.min(events.length, 20)})`}</button> : null}
                </div>
              </div>
              <div className="hm-wp__activity">
                {visibleEvents.map((event) => {
                  const pkg = packages.find((p) => p.id === event.package_id);
                  return (
                    <div className={`hm-wp__event ${event.read_at ? "" : "is-unread"}`} key={event.id} role="button" tabIndex={0} style={{ cursor: pkg ? "pointer" : "default" }}
                      onClick={() => { if (pkg) onOpen?.(pkg); if (!event.read_at) onMarkEventsRead?.([event.id]); }}
                      onKeyDown={(e) => { if (e.key === "Enter" && pkg) onOpen?.(pkg); }}>
                      <span className="hm-wp__event-dot" />
                      <div><strong>{event.title}</strong>{event.body ? <p>{event.body}</p> : null}</div>
                      <time dateTime={event.created_at}>{relativeTime(event.created_at)}</time>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {grouped.length ? (
            <div className="hm-wp__section">
              <div className="hm-wp__section-head"><div><h3>Your packages</h3><p>Open a package to review scope, answer questions and compare bids.</p></div></div>
              <div className="hm-wp__list">
                {grouped.map((pkg) => <PackageRow key={pkg.id} pkg={pkg} bids={bidsByPackage[pkg.id] || []} onOpen={onOpen} />)}
              </div>
            </div>
          ) : null}

          {suggestions.length ? (
            <div className="hm-wp__section">
              <div className="hm-wp__section-head">
                <div>
                  <h3><Sparkles size={15} style={{ display: "inline", marginRight: 6, color: "#c85f2b" }} />{grouped.length ? "Suggested next packages" : "Suggested packages for this project"}</h3>
                  <p>Built from your brief{estimate?.estimate_lines?.length ? " and AI estimate" : ""}. Each comes with a scope checklist you can edit before publishing.</p>
                </div>
              </div>
              <div className="hm-wp__suggest">
                {suggestions.map((s) => {
                  const meta = workPackageType(s.type);
                  const Icon = meta.Icon;
                  const selected = selectedSuggestions.has(s.type);
                  return (
                    <button type="button" key={s.type} className={`hm-wp__suggest-card ${selected ? "is-selected" : ""}`} onClick={() => toggleSuggestion(s.type)} aria-pressed={selected}>
                      <span className="hm-wp__suggest-check"><Check size={13} /></span>
                      <span className="hm-wp__type-icon" style={{ background: meta.tint, color: meta.color, width: 36, height: 36 }}><Icon size={16} /></span>
                      <h4>{meta.label}</h4>
                      <p>{s.reason}</p>
                      {s.budgetHintInr ? <span className="hm-wp__hint">≈ {formatInrShort(s.budgetHintInr)} in your estimate</span> : null}
                    </button>
                  );
                })}
              </div>
              <div className="hm-wp__suggest-actions">
                <button type="button" className="hm-wp__btn" disabled={!selectedSuggestions.size || creatingMany} onClick={() => createSelected(true)}>
                  {creatingMany ? "Publishing…" : `Go live with ${selectedSuggestions.size || ""} ${selectedSuggestions.size === 1 ? "RFQ" : "RFQs"}`.replace("  ", " ")}
                </button>
                <button type="button" className="hm-wp__btn-secondary" disabled={!selectedSuggestions.size || creatingMany} onClick={() => createSelected(false)}>
                  Save as drafts
                </button>
                <button type="button" className="hm-wp__btn-quiet" onClick={() => onCreate?.(suggestions.find((s) => selectedSuggestions.has(s.type)) || null)}>
                  {selectedSuggestions.size === 1 ? "Edit before posting" : "Start from scratch"}
                </button>
                <p>Going live sends the RFQ to matching published professionals. Drafts stay private.</p>
              </div>
            </div>
          ) : null}

          {!grouped.length && !suggestions.length ? (
            <div className="hm-wp__empty hm-wp__section">
              <div className="hm-wp__empty-icon"><Inbox size={22} /></div>
              <h3>{ownTeam ? "No marketplace RFQs on this project" : "No work packages yet"}</h3>
              <p>{ownTeam ? "Switch to split-by-trade or one-contractor above when you want comparable bids." : "Create your first package to start collecting comparable bids."}</p>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
