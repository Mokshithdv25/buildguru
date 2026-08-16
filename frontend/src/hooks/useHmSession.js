import { useEffect, useState } from "react";
import { getSupabase } from "../lib/supabaseClient";
import {
  clearHmSessionState,
  establishHmSession,
  HM_SESSION_CHANGED_EVENT,
  HM_SESSION_CLEARED_EVENT,
  readHmSession,
} from "../lib/hmAuth";
import { fetchUserProfile } from "../lib/userProfileApi";

/** Reactive homeowner/pro session from localStorage + Supabase auth events. */
export function useHmSession() {
  // undefined means auth is still hydrating; null means confirmed signed out.
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    const refresh = () => setSession(readHmSession());

    let cancelled = false;

    // If Supabase has a session but our local cache is missing/stale, restore it.
    const hydrateFromSupabase = async () => {
      const sb = getSupabase();
      if (!sb) {
        if (!cancelled) refresh();
        return;
      }
      try {
        const { data: { session: sbSession } } = await sb.auth.getSession();
        if (cancelled) return;
        if (!sbSession?.user) {
          clearHmSessionState();
          if (!cancelled) setSession(null);
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
        await establishHmSession(sbSession.user, profile);
        if (!cancelled) refresh();
      } catch (_) {
        if (!cancelled) setSession(readHmSession());
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
      ? sb.auth.onAuthStateChange((_event, sbSession) => {
          if (!sbSession) {
            clearHmSessionState();
            if (!cancelled) setSession(null);
            return;
          }
          void hydrateFromSupabase();
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
