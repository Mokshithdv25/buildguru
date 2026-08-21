import {
  homeownerLandingPath,
  projectDashboardPath,
  resolvePostLoginPath,
} from "./postLoginRoute";

describe("post-login routing", () => {
  beforeEach(() => localStorage.clear());

  test("a homeowner with no saved project sees the build-type chooser", async () => {
    const path = await resolvePostLoginPath("homeowner", null, {
      userId: "owner-1",
      loadProjects: jest.fn().mockResolvedValue([]),
    });

    expect(path).toBe("/build");
  });

  test("a homeowner with a project opens its dashboard", async () => {
    const path = await resolvePostLoginPath("homeowner", null, {
      userId: "owner-1",
      loadProjects: jest.fn().mockResolvedValue([
        { id: "project-1", flow_type: "new_home", source: "build-new" },
      ]),
    });

    expect(path).toBe("/project?projectId=project-1&source=build-new");
  });

  test("the remembered project wins over the most recently updated project", () => {
    localStorage.setItem(
      "hm_last_project_owner-1",
      JSON.stringify({ projectId: "project-2", source: "remodel" }),
    );

    expect(homeownerLandingPath([
      { id: "project-1", flow_type: "new_home" },
      { id: "project-2", flow_type: "remodel" },
    ], "owner-1")).toBe("/project?projectId=project-2&source=remodel");
  });

  test("explicit flow redirects and professional destinations remain unchanged", async () => {
    const loadProjects = jest.fn();

    await expect(resolvePostLoginPath("homeowner", "/build/remodel", {
      userId: "owner-1",
      loadProjects,
    })).resolves.toBe("/build/remodel");
    await expect(resolvePostLoginPath("pro", null, {
      userId: "owner-1",
      loadProjects,
    })).resolves.toMatch(/^\/(pro\/dashboard|craft|details|portfolio-theme|portfolio|live)$/);
    expect(loadProjects).not.toHaveBeenCalled();
  });

  test("a failed project lookup falls back to the recoverable project hub", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    await expect(resolvePostLoginPath("homeowner", null, {
      userId: "owner-1",
      loadProjects: jest.fn().mockRejectedValue(new Error("network unavailable")),
    })).resolves.toBe("/project");
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  test("dashboard paths preserve remodel source context", () => {
    expect(projectDashboardPath({ id: "project 9", flow_type: "remodel" }))
      .toBe("/project?projectId=project+9&source=remodel");
  });
});
