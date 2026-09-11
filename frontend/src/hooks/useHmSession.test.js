import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { HmSessionProvider, useHmSession } from "./useHmSession";

jest.mock("../lib/supabaseClient", () => ({
  getSupabase: jest.fn(() => null),
}));

jest.mock("../lib/userProfileApi", () => ({
  fetchUserProfile: jest.fn(),
}));

global.IS_REACT_ACT_ENVIRONMENT = true;

function Probe({ onSession }) {
  const session = useHmSession();
  onSession(session);
  return null;
}

describe("useHmSession", () => {
  let container;
  let root;

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  test("paints a cached homeowner session immediately", () => {
    localStorage.setItem(
      "hmSession",
      JSON.stringify({
        role: "homeowner",
        signedInAt: new Date().toISOString(),
        supabaseUserId: "user-1",
      }),
    );
    localStorage.setItem("hmUser", JSON.stringify({ supabaseUserId: "user-1", name: "Asha", email: "asha@example.com" }));

    let seen = null;
    act(() => {
      root.render(
        <HmSessionProvider>
          <Probe onSession={(session) => { seen = session; }} />
        </HmSessionProvider>,
      );
    });

    expect(seen?.supabaseUserId).toBe("user-1");
    expect(seen?.role).toBe("homeowner");
    expect(seen?.profile?.name).toBe("Asha");
  });
});
