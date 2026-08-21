import { fetchOwnedPortfolio } from "./api";
import { establishHmSession } from "./hmAuth";
import { persistOAuthSignInIntent, readOAuthSignInIntent } from "./authIntent";
import { persistHmSessionFromSupabase, updateUserProfileRole } from "./userProfileApi";

jest.mock("./api", () => ({ fetchOwnedPortfolio: jest.fn() }));
jest.mock("./supabaseClient", () => ({
  clearSupabaseLocalSession: jest.fn(),
  getSupabase: jest.fn(() => null),
}));
jest.mock("./userProfileApi", () => ({
  persistHmSessionFromSupabase: jest.fn(),
  updateUserProfileRole: jest.fn(),
}));
jest.mock("./portfolioStorage", () => ({
  clearAllPortfolioMediaCaches: jest.fn(),
  setPortfolioMedia: jest.fn(),
}));

describe("role-specific session establishment", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    fetchOwnedPortfolio.mockResolvedValue(null);
  });

  test("homeowner OAuth intent beats an existing professional profile and cache", async () => {
    const user = {
      id: "user-1",
      email: "owner@example.com",
      user_metadata: { role: "pro" },
    };
    const profile = { id: user.id, role: "pro", full_name: "Owner" };
    localStorage.setItem(
      "hmSession",
      JSON.stringify({ role: "pro", signedInAt: new Date().toISOString(), supabaseUserId: user.id }),
    );
    localStorage.setItem("hmUser", JSON.stringify({ supabaseUserId: user.id }));
    persistOAuthSignInIntent("homeowner");

    const role = await establishHmSession(user, profile, {
      signInIntent: readOAuthSignInIntent()?.role,
    });

    expect(role).toBe("homeowner");
    expect(persistHmSessionFromSupabase).toHaveBeenCalledWith(
      user,
      profile,
      { activeRole: "homeowner" },
    );
    expect(updateUserProfileRole).not.toHaveBeenCalled();
  });
});
