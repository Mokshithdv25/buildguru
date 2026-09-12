import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useHmSession } from "./useHmSession";
import { claimAndListUserProjects } from "../lib/projectFlowApi";

export function useProjectWorkspace() {
  const session = useHmSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestedId = searchParams.get("projectId") || "";

  useEffect(() => {
    if (session === undefined) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const rows = await claimAndListUserProjects(session?.supabaseUserId);
        if (cancelled) return;
        setProjects(rows || []);
        if (!requestedId && rows?.[0]?.id) {
          const next = new URLSearchParams(searchParams);
          next.set("projectId", rows[0].id);
          setSearchParams(next, { replace: true });
        }
      } catch (err) {
        if (!cancelled) setError(err?.message || "Could not load your projects.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // Search params are updated only when selecting a project.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.supabaseUserId, requestedId]);

  const project = useMemo(() => projects.find((row) => row.id === requestedId) || projects[0] || null, [projects, requestedId]);
  const selectProject = (projectId) => {
    const next = new URLSearchParams(searchParams);
    next.set("projectId", projectId);
    setSearchParams(next);
  };
  return { session, projects, project, projectId: project?.id || "", loading, error, selectProject };
}
