import { createContext, useContext, useEffect, useState } from "react";
import { getSupabase } from "../lib/supabaseClient";
import {
  clearHmSessionState,
  establishHmSession,
  HM_SESSION_CHANGED_EVENT,
  HM_SESSION_CLEARED_EVENT,
  readHmSession,
} from "../lib/hmAuth";
import { fetchUserProfile } from "../lib/userProfileApi";
import { readOAuthSignInIntent } from "../lib/authIntent";

const HmSessionContext = createContext(undefined);

function useHmSessionSource() {
  // Cached session paints immediately so chrome never flashes "Sign In".
  // undefined means no cache yet and Supabase is still hydrating; null means signed out.
  const [session, setSession] = useState(() => readHmSession() || undefined);

  useEffect(() => {
    const refresh = () => setSession(readHmSession());

    let cancelled = false;

    const hydrateFromSupabase = async () => {
      const sb = getSupabase();
      if (!sb) {
        if (!cancelled) setSession(readHmSession());
        return;
      }
      try {
        const { data: { session: sbSession } } = await sb.auth.getSession();
        if (cancelled) return;
        if (!sbSession?.user) {
          // Keep a cached homeowner session until SIGNED_OUT. getSession() can
          // report null while the client is still restoring the user.
          if (!cancelled) setSession(readHmSession() || null);
          return;
        }
        const cached = readHmSession();
        if (cached?.supabaseUserId === sbSession.user.id) {
          if (!cancelled) setSession(cached);
          return;
        }
        let profile = null;
        try {
          profile = await fetchUserProfile(sbSession.user.id);
        } catch (_) {
          /* ignore */
        }
        await establishHmSession(sbSession.user, profile, {
          signInIntent: readOAuthSignInIntent()?.role,
        });
        if (!cancelled) refresh();
      } catch (_) {
        if (!cancelled) setSession(readHmSession() || undefined);
      }
    };
    void hydrateFromSupabase();

    const onStorage = (e) => {
      if (!e.key || e.key === "hmSession" || e.key === "hmUser") refresh();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(HM_SESSION_CLEARED_EVENT, refresh);
    window.addEventListener(HM_SESSION_CHANGED_EVENT, refresh);

    const sb = getSupabase();
    const subscription = sb
      ? sb.auth.onAuthStateChange((event, sbSession) => {
          if (sbSession) {
            void hydrateFromSupabase();
            return;
          }
          if (event === "SIGNED_OUT" || event === "USER_DELETED") {
            clearHmSessionState();
            if (!cancelled) setSession(null);
          }
        }).data.subscription
      : null;

    return () => {
      cancelled = true;
      subscription?.unsubscribe();
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(HM_SESSION_CLEARED_EVENT, refresh);
      window.removeEventListener(HM_SESSION_CHANGED_EVENT, refresh);
    };
  }, []);

  return session;
}

/** One auth subscription for the whole app so nav chrome does not re-hydrate on every route. */
export function HmSessionProvider({ children }) {
  const session = useHmSessionSource();
  return <HmSessionContext.Provider value={session}>{children}</HmSessionContext.Provider>;
}

/** Reactive homeowner/pro session from localStorage + Supabase auth events. */
export function useHmSession() {
  const ctx = useContext(HmSessionContext);
  // Provider value is the live session. If a tree renders without the provider,
  // fall back to the device cache so gated pages never sit on a blank screen.
  return ctx === undefined ? readHmSession() || undefined : ctx;
}
