import {
  clearOAuthSignInIntent,
  hasPendingOAuthSignIn,
  persistOAuthSignInIntent,
  readOAuthSignInIntent,
} from "./authIntent";

describe("OAuth workspace intent", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => jest.restoreAllMocks());

  test("preserves an explicit homeowner selection across the OAuth redirect", () => {
    jest.spyOn(Date, "now").mockReturnValue(1_000_000);
    persistOAuthSignInIntent("homeowner");

    expect(hasPendingOAuthSignIn()).toBe(true);
    expect(readOAuthSignInIntent()).toEqual({ role: "homeowner", createdAt: 1_000_000 });
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
});
