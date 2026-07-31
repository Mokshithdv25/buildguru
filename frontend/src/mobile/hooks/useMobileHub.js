import { useEffect, useMemo, useState } from "react";
import { getBuildFlow, getRemodelFlow } from "../../lib/projectFlowStorage";
import { AUTH_UI_ENABLED } from "../../lib/authMode";
import { claimAndListUserProjects, listLocalFlowProjects } from "../../lib/projectFlowApi";
import { listPublishedPortfolios } from "../../lib/api";
import { useHmSession } from "../../hooks/useHmSession";
import { flowTypeLabel, projectStatusLabel } from "../mobileIA";

function buildResume(build) {
  if (!build?.projectId && !build?.preV0 && !build?.v0) return null;
  if (build.v0 || build.postV0) {
    return { label: "New home — v0 ready", sub: "Review AI pack & open project hub", path: "/project" };
  }
  if (build.preV0 || build.projectId) {
    return { label: "Continue new home brief", sub: "Pick up where you left off", path: "/build/new-home" };
  }
  return null;
}

function remodelResume(remodel) {
  if (!remodel?.projectId && !remodel?.preV0 && !remodel?.v0) return null;
  if (remodel.v0 || remodel.postV0) {
    return { label: "Remodel — v0 ready", sub: "Review concepts & estimate", path: "/project" };
  }
  if (remodel.preV0 || remodel.projectId) {
    return { label: "Continue remodel brief", sub: "Room photos & style steps", path: "/build/remodel" };
  }
  return null;
}

/** Aggregates real BuildGuru state for mobile home / design hubs. */
export function useMobileHub({ includeProCount = false } = {}) {
  const session = useHmSession();
  const [projects, setProjects] = useState([]);
  const [proCount, setProCount] = useState(0);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [projectError, setProjectError] = useState("");

  const build = useMemo(() => getBuildFlow(), []);
  const remodel = useMemo(() => getRemodelFlow(), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingProjects(true);
      setProjectError("");
      try {
        const rows =
          !AUTH_UI_ENABLED && !session?.supabaseUserId
            ? listLocalFlowProjects()
            : session?.supabaseUserId
              ? await claimAndListUserProjects(session.supabaseUserId)
              : [];
        if (!cancelled) setProjects(rows || []);
      } catch (error) {
        if (!cancelled) {
          setProjects([]);
          setProjectError(error?.message || "Could not load saved projects.");
        }
      } finally {
        if (!cancelled) setLoadingProjects(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.supabaseUserId]);

  useEffect(() => {
    if (!includeProCount) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const rows = await listPublishedPortfolios({ limit: 1 });
        if (!cancelled) setProCount(rows?.length || 0);
      } catch {
        if (!cancelled) setProCount(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [includeProCount]);

  const activeProject = projects[0] || null;

  const resumeCards = useMemo(() => {
    const cards = [];
    const b = buildResume(build);
    const r = remodelResume(remodel);
    if (b) cards.push({ id: "build-resume", ...b });
    if (r) cards.push({ id: "remodel-resume", ...r });
    if (activeProject) {
      cards.push({
        id: "project-active",
        label: activeProject.title || "Your project",
        sub: `${flowTypeLabel(activeProject.flow_type, activeProject.source)} · ${projectStatusLabel(activeProject.status)}`,
        path: "/project",
      });
    }
    if (proCount > 0) {
      cards.push({
        id: "pros-nearby",
        label: "Browse published pros",
        sub: "Real portfolios on BuildGuru",
        path: "/browse",
      });
    }
    return cards.slice(0, 4);
  }, [build, remodel, activeProject, proCount]);

  return {
    session,
    projects,
    activeProject,
    loadingProjects,
    projectError,
    proCount,
    build,
    remodel,
    resumeCards,
  };
}
