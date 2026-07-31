import { getSupabase } from "./supabaseClient";

/** Persistent session row: email + role + profile (requires buildguru_single_setup.sql). */
export async function fetchMySession() {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.rpc("get_my_session");
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row || null;
}

export async function fetchUserProfile(userId) {
  const sb = getSupabase();
  if (!sb || !userId) return null;
  const { data, error } = await sb.from("user_profiles").select("*").eq("id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertUserProfile({ fullName, phone, city, role }) {
  const sb = getSupabase();
  if (!sb) return null;
  const {
    data: { user },
    error: userErr,
  } = await sb.auth.getUser();
  if (userErr) throw userErr;
  if (!user) throw new Error("Not signed in");

  const row = {
    id: user.id,
    email: user.email || null,
    role: role === "pro" ? "pro" : "homeowner",
    full_name: fullName,
    phone: phone || null,
    city: city || null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await sb.from("user_profiles").upsert(row, { onConflict: "id" });
  if (error) throw error;
  return row;
}

/** Persist the homeowner/pro choice made at the start of an OAuth flow. */
export async function updateUserProfileRole(role) {
  const sb = getSupabase();
  if (!sb) return null;
  const {
    data: { user },
    error: userErr,
  } = await sb.auth.getUser();
  if (userErr) throw userErr;
  if (!user) throw new Error("Not signed in");

  const normalizedRole = role === "pro" ? "pro" : "homeowner";
  const { error } = await sb
    .from("user_profiles")
    .update({ role: normalizedRole, updated_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) throw error;
  return normalizedRole;
}

/** Sync localStorage keys used by the rest of the app (until full auth rollout). */
export function persistHmSessionFromSupabase(user, profile, { activeRole } = {}) {
  if (!user) return;
  const role =
    activeRole === "pro" || activeRole === "homeowner"
      ? activeRole
      : profile?.role || user.user_metadata?.role || "homeowner";
  const name = profile?.full_name || "";
  const emailStr = profile?.email || user.email || "";
  try {
    localStorage.setItem(
      "hmUser",
      JSON.stringify({
        phone: profile?.phone || "",
        name,
        email: emailStr,
        city: profile?.city || "",
        supabaseUserId: user.id,
      }),
    );
    localStorage.setItem(
      "hmSession",
      JSON.stringify({
        role,
        signedInAt: new Date().toISOString(),
        profile: { phone: profile?.phone, name, email: emailStr, city: profile?.city },
        supabaseUserId: user.id,
      }),
    );
  } catch (_) {
    // ignore quota
  }
}
