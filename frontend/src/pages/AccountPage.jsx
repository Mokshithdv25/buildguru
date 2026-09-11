import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HM_HEADER_BAR_CHROME_CLASS, HM_WORDMARK_TITLE_CLASS, hmLogoMarkSrc } from "../lib/hmBrand";
import { useHmSession } from "../hooks/useHmSession";
import { getProfileInitial, signOutHm } from "../lib/hmAuth";
import { getSupabase } from "../lib/supabaseClient";
import { fetchUserProfile, persistHmSessionFromSupabase, upsertUserProfile } from "../lib/userProfileApi";
import { formatInrShort, listUserProjects } from "../lib/projectFlowApi";
import { AUTH_UI_ENABLED } from "../lib/authMode";
import HmUserMenu from "../components/HmUserMenu";
import { deleteMyAccount } from "../lib/accountApi";

export default function AccountPage() {
  const navigate = useNavigate();
  const session = useHmSession();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [savedProjects, setSavedProjects] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  useEffect(() => {
    if (session === undefined) return;
    if (!AUTH_UI_ENABLED && !session) {
      navigate("/project", { replace: true });
      return;
    }
    if (!session) {
      navigate("/sign-in?mode=signin", { replace: true });
      return;
    }
    setName(session.profile?.name || "");
    setEmail(session.profile?.email || "");
    const rawPhone = session.profile?.phone || "";
    setPhone(rawPhone.replace(/^\+91/, ""));
    setCity(session.profile?.city || "");
  }, [session, navigate]);

  useEffect(() => {
    if (!session?.supabaseUserId) {
      setSavedProjects([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setProjectsLoading(true);
      try {
        const rows = await listUserProjects();
        if (!cancelled) setSavedProjects(rows);
      } catch (_) {
        if (!cancelled) setSavedProjects([]);
      } finally {
        if (!cancelled) setProjectsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.supabaseUserId]);

  const handleSave = async () => {
    if (!name.trim()) return;
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const sb = getSupabase();
      if (!sb) throw new Error("Sign-in is not configured on this deploy.");
      await upsertUserProfile({
        fullName: name.trim(),
        phone: phone ? `+91${phone.replace(/\D/g, "").slice(-10)}` : "",
        city: city.trim() || null,
        role: session?.role || "homeowner",
      });
      const {
        data: { user },
      } = await sb.auth.getUser();
      let profile = null;
      if (user) {
        try {
          profile = await fetchUserProfile(user.id);
        } catch (_) {
          /* ignore */
        }
        persistHmSessionFromSupabase(user, profile);
      }
      setMessage("Profile updated.");
    } catch (err) {
      setError(err?.message || "Could not save profile.");
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = () => {
    void signOutHm();
  };

  const handleDeleteAccount = async () => {
    const confirmation = window.prompt('This permanently deletes your account, projects, portfolio, files, and payment records. Type DELETE to continue.');
    if (confirmation !== "DELETE") return;
    setDeletingAccount(true);
    setError("");
    try {
      await deleteMyAccount();
      await signOutHm();
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Could not delete your account.");
      setDeletingAccount(false);
    }
  };

  if (session === undefined || session === null) {
    return (
      <div className="min-h-screen bg-[#FBF2E8] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[#C85F2B]" />
      </div>
    );
  }

  const initial = getProfileInitial(session);

  return (
    <div className="hm-landing-page min-h-screen bg-background flex flex-col">
      <header className={`flex items-center gap-3 md:gap-4 px-5 md:px-10 py-3 min-h-[4.65rem] ${HM_HEADER_BAR_CHROME_CLASS}`}>
        <button
          type="button"
          onClick={() => navigate(session.role === "pro" ? "/pro/dashboard" : "/build")}
          className="inline-flex shrink-0 items-center gap-2 text-sm text-muted-foreground hover:text-foreground bg-transparent border-none cursor-pointer font-body"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <button
          type="button"
          onClick={() => navigate("/")}
          className="flex items-center gap-2.5 bg-transparent border-none cursor-pointer p-0 min-w-0"
        >
          <img src={hmLogoMarkSrc} alt="BuildGuru" className="w-12 h-12 shrink-0" width={48} height={48} />
          <span className={HM_WORDMARK_TITLE_CLASS}>BuildGuru</span>
        </button>
        <div className="flex-1" aria-hidden />
        <HmUserMenu />
      </header>

      <main className="flex-1 flex items-start justify-center p-6">
        <div className="w-full max-w-md space-y-6">
          <div className="flex items-center gap-4">
            <span
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-2xl font-bold text-white"
              style={{ background: "linear-gradient(135deg, #C85F2B 0%, #E8A84A 100%)" }}
            >
              {initial}
            </span>
            <div>
              <h1 className="font-display text-2xl font-bold text-foreground m-0">Your account</h1>
              <p className="font-body text-sm text-muted-foreground mt-1 m-0">
                {session.role === "pro" ? "Professional" : "Homeowner"} · customize your profile
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card/90 p-6 space-y-4 shadow-sm">
            <div>
              <Label className="font-body text-sm font-semibold mb-1.5 block">Full name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="font-body rounded-xl border-2 h-11" />
            </div>
            <div>
              <Label className="font-body text-sm font-semibold mb-1.5 block">Email</Label>
              <Input value={email} disabled className="font-body rounded-xl border-2 h-11 bg-muted/30" />
              <p className="text-xs text-muted-foreground mt-1 font-body">From your sign-in email — update in account settings when available.</p>
            </div>
            <div>
              <Label className="font-body text-sm font-semibold mb-1.5 block">Phone</Label>
              <div className="flex gap-2">
                <span className="inline-flex items-center rounded-xl border-2 border-border px-3 text-sm text-muted-foreground font-body">+91</span>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  className="font-body rounded-xl border-2 h-11 flex-1"
                  inputMode="numeric"
                />
              </div>
            </div>
            <div>
              <Label className="font-body text-sm font-semibold mb-1.5 block">City</Label>
              <Input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g., Bengaluru"
                className="font-body rounded-xl border-2 h-11"
              />
            </div>

            {error ? <p className="text-sm text-destructive font-body">{error}</p> : null}
            {message ? <p className="text-sm text-green-700 font-body">{message}</p> : null}

            <Button
              onClick={handleSave}
              disabled={!name.trim() || loading}
              className="w-full gradient-copper text-primary-foreground font-body rounded-xl py-5"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Save changes
            </Button>
          </div>

          <div className="rounded-2xl border border-border bg-card/90 p-6 space-y-3 shadow-sm">
            <p className="font-body text-sm font-semibold text-foreground m-0">Saved projects</p>
            <p className="font-body text-xs text-muted-foreground m-0 leading-relaxed">
              Design, estimate, brief, and tasks from your build or remodel flows.
            </p>
            {projectsLoading ? (
              <p className="font-body text-xs text-muted-foreground m-0">Loading…</p>
            ) : savedProjects.length === 0 ? (
              <p className="font-body text-xs text-muted-foreground m-0">
                None yet. Complete a build or remodel flow and generate v0 while signed in.
              </p>
            ) : (
              <ul className="m-0 p-0 list-none space-y-2">
                {savedProjects.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => {
                        const src =
                          p.flow_type === "remodel" || p.source === "remodel"
                            ? "remodel"
                            : "build-new";
                        navigate(`/project?projectId=${encodeURIComponent(p.id)}&source=${src}`);
                      }}
                      className="w-full text-left rounded-xl border border-border px-3 py-2.5 bg-background hover:bg-muted/40 transition-colors font-body text-sm cursor-pointer"
                    >
                      <span className="font-semibold text-foreground block">{p.title || "Untitled project"}</span>
                      <span className="text-xs text-muted-foreground mt-0.5 block">
                        {p.flow_type === "remodel" ? "Remodel" : "New build"}
                        {p.budget_max ? ` · ${formatInrShort(p.budget_max)}` : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-border/80 bg-background/80 p-4 space-y-2">
            <p className="font-body text-sm font-semibold text-foreground m-0">More</p>
            <button type="button" onClick={() => navigate("/subscriptions")} className="block w-full text-left font-body text-sm text-copper hover:underline bg-transparent border-none cursor-pointer p-0">
              My subscription →
            </button>
            {session.role === "pro" ? (
              <button type="button" onClick={() => navigate("/pro/dashboard")} className="block w-full text-left font-body text-sm text-copper hover:underline bg-transparent border-none cursor-pointer p-0">
                Pro dashboard →
              </button>
            ) : (
              <>
                <button type="button" onClick={() => navigate("/build/new-home")} className="block w-full text-left font-body text-sm text-copper hover:underline bg-transparent border-none cursor-pointer p-0">
                  Start a new home →
                </button>
                <button type="button" onClick={() => navigate("/build/remodel")} className="block w-full text-left font-body text-sm text-copper hover:underline bg-transparent border-none cursor-pointer p-0">
                  Start a remodel →
                </button>
              </>
            )}
          </div>

          {AUTH_UI_ENABLED ? (
            <div className="space-y-2">
              <button type="button" onClick={handleSignOut} className="w-full font-body text-sm text-destructive hover:underline bg-transparent border-none cursor-pointer py-2">Sign out</button>
              <button type="button" disabled={deletingAccount} onClick={handleDeleteAccount} className="w-full font-body text-xs text-destructive hover:underline bg-transparent border-none cursor-pointer py-2">{deletingAccount ? "Deleting account…" : "Permanently delete account"}</button>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
