import { isHomeownerSignedIn, navigateToHomeownerFlow } from "./requireHomeownerAuth";

describe("homeowner flow navigation", () => {
  beforeEach(() => localStorage.clear());

  test("treats a cached homeowner session as signed in", () => {
    localStorage.setItem(
      "hmSession",
      JSON.stringify({ role: "homeowner", signedInAt: new Date().toISOString(), supabaseUserId: "user-1" }),
    );
    expect(isHomeownerSignedIn()).toBe(true);
  });

  test("sends signed-in homeowners straight to the target path", () => {
    localStorage.setItem(
      "hmSession",
      JSON.stringify({ role: "homeowner", signedInAt: new Date().toISOString(), supabaseUserId: "user-1" }),
    );
    const navigate = jest.fn();
    navigateToHomeownerFlow(navigate, "/build/new-home");
    expect(navigate).toHaveBeenCalledWith("/build/new-home", undefined);
  });

  test("sends signed-out users to sign-in with a return path", () => {
    const navigate = jest.fn();
    navigateToHomeownerFlow(navigate, "/build/new-home");
    expect(navigate).toHaveBeenCalledWith("/sign-in?redirect=%2Fbuild%2Fnew-home", undefined);
  });
});
