import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import WorkPackagesBoard from "./WorkPackagesBoard";
import WorkPackageComposer from "./WorkPackageComposer";
import WorkPackageDetail from "./WorkPackageDetail";
import {
  answerWorkPackageQuestion,
  closeExpiredWorkPackages,
  createWorkPackage,
  deleteDraftWorkPackage,
  inviteProToWorkPackage,
  listWorkPackageBidsForOwner,
  listWorkPackageEvents,
  listWorkPackageInvites,
  listWorkPackageQuestionsForOwner,
  listWorkPackages,
  markWorkPackageEventsRead,
  publishWorkPackage,
  setWorkPackageBidDecision,
  setWorkPackageStatus,
} from "../../lib/workPackagesApi";
import { normalizeHireMode } from "../../lib/hireMode";

/**
 * Homeowner work-package experience for one project: board → detail → composer.
 * Owns all data loading so the dashboard and mobile page only pass context.
 *
 * `selectedPackageId` / `onSelectPackage` are optional; when provided the parent
 * can sync the open package with the URL.
 */
export default function WorkPackagesHub({
  projectId,
  project = null,
  brief = {},
  estimate = null,
  documents = [],
  selectedPackageId: controlledSelectedId,
  onSelectPackage,
  onNavigatePath,
  onChanged,
  footerSlot = null,
  hireMode: hireModeProp,
  onHireModeChange,
}) {
  const [packages, setPackages] = useState([]);
  const [bids, setBids] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [invites, setInvites] = useState([]);
  const [events, setEvents] = useState([]);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [internalSelectedId, setInternalSelectedId] = useState("");
  const [composer, setComposer] = useState({ open: false, seed: null, existing: null });

  const selectedId = controlledSelectedId !== undefined ? controlledSelectedId : internalSelectedId;
  const select = useCallback((id) => {
    if (onSelectPackage) onSelectPackage(id || "");
    else setInternalSelectedId(id || "");
  }, [onSelectPackage]);

  // Parents pass inline callbacks; keep them out of the reload dependency list.
  const onChangedRef = useRef(onChanged);
  useEffect(() => { onChangedRef.current = onChanged; }, [onChanged]);

  const reload = useCallback(async ({ silent = false } = {}) => {
    if (!projectId) return;
    if (!silent) setLoading(true);
    try {
      try { await closeExpiredWorkPackages(projectId); } catch { /* optional RPC */ }
      const [pkgResult, bidResult, questionResult, inviteResult, eventResult] = await Promise.all([
        listWorkPackages(projectId),
        listWorkPackageBidsForOwner(projectId),
        listWorkPackageQuestionsForOwner(projectId),
        listWorkPackageInvites(projectId),
        listWorkPackageEvents({ projectId, limit: 40 }),
      ]);
      setPackages(pkgResult.packages);
      setBids(bidResult.bids);
      setQuestions(questionResult.questions);
      setInvites(inviteResult.invites);
      setEvents(eventResult.events);
      setConfigured(pkgResult.configured);
      setError("");
      onChangedRef.current?.({ packages: pkgResult.packages, bids: bidResult.bids });
    } catch (err) {
      setError(err?.message || "Could not load work packages.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { reload(); }, [reload]);

  const bidsByPackage = useMemo(() => {
    const map = {};
    bids.forEach((bid) => { (map[bid.package_id] = map[bid.package_id] || []).push(bid); });
    return map;
  }, [bids]);

  const selected = useMemo(() => packages.find((p) => p.id === selectedId) || null, [packages, selectedId]);

  const openComposer = (seed = null, existing = null) => setComposer({ open: true, seed, existing });
  const closeComposer = () => setComposer({ open: false, seed: null, existing: null });

  const handleSaved = async (saved, { publish }) => {
    let pkg = saved;
    if (publish && ["draft", "closed", "under_review"].includes(saved.status)) {
      pkg = await publishWorkPackage(saved.id);
    }
    closeComposer();
    await reload({ silent: true });
    select(pkg.id);
  };

  const createMany = async (suggestions, { publish = false } = {}) => {
    for (const s of suggestions) {
      // Sequential so ordering in the list is stable.
      // eslint-disable-next-line no-await-in-loop
      const created = await createWorkPackage({
        projectId,
        packageType: s.type,
        title: s.title,
        scopeItems: s.scopeItems,
        pricingBasis: s.pricingBasis,
        budgetHintInr: s.budgetHintInr ?? "",
        summary: s.estimateLabels?.length ? `Covers the estimate lines: ${s.estimateLabels.join(", ")}.` : "",
        siteVisitRequired: !["design", "structural", "materials"].includes(s.type),
        bidsDueAt: new Date(Date.now() + 10 * 86400000).toISOString(),
      });
      if (publish) {
        // eslint-disable-next-line no-await-in-loop
        await publishWorkPackage(created.id);
      }
    }
    await reload({ silent: true });
  };

  const city = project?.city || brief?.city || String(project?.location || "").split(",")[0] || "";
  const hireMode = hireModeProp || normalizeHireMode(brief);

  if (selected) {
    return (
      <>
        <WorkPackageDetail
          pkg={selected}
          bids={bidsByPackage[selected.id] || []}
          questions={questions.filter((q) => q.package_id === selected.id)}
          invites={invites.filter((i) => i.package_id === selected.id)}
          city={city}
          onBack={() => select("")}
          onEdit={() => openComposer(null, selected)}
          onPublish={async () => { await publishWorkPackage(selected.id); await reload({ silent: true }); }}
          onSetStatus={async (status) => { await setWorkPackageStatus(selected.id, status); await reload({ silent: true }); }}
          onDelete={async () => { await deleteDraftWorkPackage(selected.id); select(""); await reload({ silent: true }); }}
          onDecision={async (bid, decision) => { await setWorkPackageBidDecision({ bidId: bid.bid_id, decision }); await reload({ silent: true }); }}
          onAnswer={async (question, answer) => { await answerWorkPackageQuestion({ questionId: question.id, answer }); await reload({ silent: true }); }}
          onInvite={async (pro) => { await inviteProToWorkPackage({ packageId: selected.id, projectId, portfolioId: pro.id }); await reload({ silent: true }); }}
          onNavigatePath={onNavigatePath}
        />
        <WorkPackageComposer
          open={composer.open}
          projectId={projectId}
          flowType={project?.flow_type}
          brief={brief}
          documents={documents}
          seed={composer.seed}
          existing={composer.existing}
          onClose={closeComposer}
          onSaved={handleSaved}
        />
      </>
    );
  }

  return (
    <>
      <WorkPackagesBoard
        packages={packages}
        bidsByPackage={bidsByPackage}
        events={events}
        flowType={project?.flow_type}
        brief={brief}
        estimate={estimate}
        hireMode={hireMode}
        onHireModeChange={onHireModeChange}
        configured={configured}
        loading={loading}
        onOpen={(pkg) => select(pkg.id)}
        onCreate={(seed) => openComposer(seed)}
        onCreateMany={createMany}
        onMarkEventsRead={async (ids) => {
          setEvents((current) => current.map((e) => (ids.includes(e.id) ? { ...e, read_at: e.read_at || new Date().toISOString() } : e)));
          try { await markWorkPackageEventsRead(ids); } catch { /* optimistic */ }
        }}
      />
      {error ? <p className="hm-wp__error" role="alert">{error}</p> : null}
      {footerSlot}
      <WorkPackageComposer
        open={composer.open}
        projectId={projectId}
        flowType={project?.flow_type}
        brief={brief}
        documents={documents}
        seed={composer.seed}
        existing={composer.existing}
        onClose={closeComposer}
        onSaved={handleSaved}
      />
    </>
  );
}
