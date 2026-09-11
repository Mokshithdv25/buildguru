import {
  clearOAuthSignInIntent,
  getOAuthRootRecoveryPath,
  hasPendingOAuthSignIn,
  persistOAuthSignInIntent,
  readOAuthSignInIntent,
} from "./authIntent";

describe("OAuth workspace intent", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => jest.restoreAllMocks());

  test("preserves an explicit homeowner selection across the OAuth redirect", () => {
    jest.spyOn(Date, "now").mockReturnValue(1_000_000);
    persistOAuthSignInIntent("homeowner", { redirectPath: "/project/design" });

    expect(hasPendingOAuthSignIn()).toBe(true);
    expect(readOAuthSignInIntent()).toEqual({
      role: "homeowner",
      redirectPath: "/project/design",
      createdAt: 1_000_000,
    });
  });

  test("does not accept an expired role selection", () => {
    localStorage.setItem(
      "hm_oauth_intent_v1",
      JSON.stringify({ role: "pro", createdAt: 1_000_000 }),
    );

    expect(readOAuthSignInIntent(1_000_000 + 16 * 60 * 1000)).toBeNull();
    expect(localStorage.getItem("hm_oauth_intent_v1")).toBeNull();
  });

  test("clears both current and legacy OAuth markers", () => {
    persistOAuthSignInIntent("pro");
    clearOAuthSignInIntent();

    expect(hasPendingOAuthSignIn()).toBe(false);
  });

  test("recovers a homeowner OAuth callback that lands on the marketing root", () => {
    const intent = { role: "homeowner", redirectPath: null, createdAt: 1_000_000 };

    expect(getOAuthRootRecoveryPath("/", intent, { search: "", hash: "#access_token=abc" })).toBe(
      "/sign-in?oauth=1&role=homeowner",
    );
    expect(getOAuthRootRecoveryPath("/project", intent, { search: "", hash: "#access_token=abc" })).toBeNull();
  });

  test("does not bounce a normal homepage visit when an OAuth intent is still cached", () => {
    const intent = { role: "homeowner", redirectPath: "/build/new-home", createdAt: 1_000_000 };

    expect(getOAuthRootRecoveryPath("/", intent, { search: "", hash: "" })).toBeNull();
  });

  test("preserves a safe requested destination during root callback recovery", () => {
    const intent = { role: "pro", redirectPath: "/pro/leads?status=new", createdAt: 1_000_000 };

    expect(getOAuthRootRecoveryPath("/", intent, { search: "", hash: "#access_token=abc" })).toBe(
      "/sign-in?oauth=1&role=pro&redirect=%2Fpro%2Fleads%3Fstatus%3Dnew",
    );
  });
});
