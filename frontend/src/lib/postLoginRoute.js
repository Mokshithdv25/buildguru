import { getPostLoginPath } from "./hmAuth";
import { getRememberedProject, listUserProjects } from "./projectFlowApi";

function projectSource(project) {
  if (project?.source === "remodel" || project?.flow_type === "remodel") return "remodel";
  if (project?.source === "build-new" || project?.flow_type === "new_home") return "build-new";
  return project?.source || "";
}

export function projectDashboardPath(project) {
  if (!project?.id) return "/build";
  const params = new URLSearchParams({ projectId: project.id });
  const source = projectSource(project);
  if (source) params.set("source", source);
  return `/project?${params.toString()}`;
}

export function homeownerLandingPath(projects, userId) {
  const rows = Array.isArray(projects) ? projects : [];
  if (!rows.length) return "/build";
  const remembered = getRememberedProject(userId);
  const project = rows.find((row) => row.id === remembered?.projectId) || rows[0];
  return projectDashboardPath(project);
}

/**
 * Resolve the default post-login destination from persisted account data.
 * Explicit safe redirects still win so signing in mid-flow returns to that flow.
 */
export async function resolvePostLoginPath(
  role,
  redirectPath,
  { userId, loadProjects = listUserProjects } = {},
) {
  const defaultPath = getPostLoginPath(role, redirectPath);
  if (role !== "homeowner" || defaultPath !== "/project") return defaultPath;

  try {
    const projects = await loadProjects();
    return homeownerLandingPath(projects, userId);
  } catch (error) {
    console.error("Could not resolve homeowner landing project:", error);
    // /project repeats the owned-project lookup and provides a recoverable UI.
    return defaultPath;
  }
}
