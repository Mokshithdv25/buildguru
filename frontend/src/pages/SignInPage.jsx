import { useState, useRef, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, ArrowRight, ArrowLeft, Check, Loader2, Mail, Home, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HM_HEADER_BAR_CHROME_CLASS, HM_WORDMARK_TITLE_CLASS, hmLogoMarkSrc } from "../lib/hmBrand";
import { getSupabase, isSupabaseConfigured, getSupabaseInitError } from "../lib/supabaseClient";
import { fetchUserProfile, upsertUserProfile } from "../lib/userProfileApi";
import { establishHmSession, signOutHm } from "../lib/hmAuth";
import { resolvePostLoginPath } from "../lib/postLoginRoute";
import { useHmSession } from "../hooks/useHmSession";
import { authCallbackUrl, openNativeAuthUrl } from "../lib/nativeAuth";
import { isNativeApp } from "../lib/capacitorPlatform";
import {
  clearOAuthSignInIntent,
  hasPendingOAuthSignIn,
  persistOAuthSignInIntent,
  readOAuthSignInIntent,
} from "../lib/authIntent";

const EMAIL_SIGNUP_ENABLED = process.env.REACT_APP_EMAIL_SIGNUP_ENABLED === "true";
const PHONE_AUTH_ENABLED = process.env.REACT_APP_PHONE_AUTH_ENABLED === "true";

function portalPath(role, mode) {
  if (role === "pro") return mode === "signup" ? "/pro/join" : "/pro/sign-in";
  return mode === "signup" ? "/join" : "/sign-in?role=homeowner";
}

/**
 * Role-scoped Google and email/password authentication. The selected role is
 * an entry-session choice: changing roles still requires signing out first.
 * Phone OTP stays hidden until the production SMS provider is configured.
 */
export default function SignInPage({ portalRole = null, portalMode = null }) {
  const navigate = useNavigate();
  const currentSession = useHmSession();
  const [searchParams] = useSearchParams();
  const requestedSignUp = portalMode === "signup" || searchParams.get("mode") === "signup" || searchParams.get("signup") === "1";
  const roleSelected =
    portalRole === "pro" ||
    portalRole === "homeowner" ||
    searchParams.get("role") === "pro" ||
    searchParams.get("role") === "homeowner";
  const modeFromQuery = requestedSignUp && EMAIL_SIGNUP_ENABLED ? "signup" : "signin";
  const roleFromQuery = portalRole === "pro" || searchParams.get("role") === "pro" ? "pro" : "homeowner";
  const redirectFromQuery = (() => {
    const raw = searchParams.get("redirect");
    if (!raw) return null;
    try {
      const path = decodeURIComponent(raw);
      if (path.startsWith("/") && !path.startsWith("//")) return path;
    } catch (_) {
      /* ignore */
    }
    return null;
  })();

  const [step, setStep] = useState("entry");
  const [mode, setMode] = useState(modeFromQuery);
  const [accountRole, setAccountRole] = useState(roleFromQuery);
  const [authMethod, setAuthMethod] = useState("email");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [authError, setAuthError] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [pendingConfirmationEmail, setPendingConfirmationEmail] = useState("");
  const [passwordRecovery, setPasswordRecovery] = useState(
    () => searchParams.get("recovery") === "1" || window.location.hash.includes("type=recovery"),
  );

  const isSignUp = mode === "signup";
  const showPhoneOtp = PHONE_AUTH_ENABLED;
  const supabaseConfigured = isSupabaseConfigured();
  const supabaseInitError = getSupabaseInitError();
  const googleOnlySignUp = requestedSignUp && !EMAIL_SIGNUP_ENABLED && !passwordRecovery;

  const otpRefs = useRef([]);

  useEffect(() => {
    if ((portalMode === "signup" || searchParams.get("mode") === "signup") && EMAIL_SIGNUP_ENABLED) setMode("signup");
    if (portalRole === "pro" || searchParams.get("role") === "pro") setAccountRole("pro");
    if (searchParams.get("native_error")) {
      setStep("entry");
      setMode("signin");
      setLoading(false);
      setAuthNotice("");
      setAuthError("Sign-in could not be completed. Please try again or use email sign-in.");
    }
    if (searchParams.get("recovery") === "1") {
      setPasswordRecovery(true);
      setMode("signin");
    }
  }, [portalMode, portalRole, searchParams]);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return undefined;
    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setPasswordRecovery(true);
        setMode("signin");
        setStep("entry");
        setAuthError("");
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/");
  };

  // Resend timer countdown
  useEffect(() => {
    if (resendTimer > 0) {
      const t = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [resendTimer]);

  const authEmailRedirectTo = () => {
    const redirect = redirectFromQuery || (accountRole === "pro" ? "/pro/dashboard" : "/project");
    return authCallbackUrl(
      `/sign-in?mode=signin&role=${accountRole}&confirmed=1&redirect=${encodeURIComponent(redirect)}`,
    );
  };

  const handleResendConfirmation = async () => {
    const email = (pendingConfirmationEmail || authEmail).trim();
    if (!email) return;
    const sb = getSupabase();
    if (!sb) {
      setAuthError("Sign-in is not available on this deployment.");
      return;
    }
    if (resendTimer > 0) return;
    setAuthError("");
    setLoading(true);
    try {
      const { error } = await sb.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: authEmailRedirectTo() },
      });
      if (error) throw error;
      setPendingConfirmationEmail(email);
      setAuthNotice(`Confirmation email resent to ${email}. Check spam and promotions folders.`);
      setResendTimer(60);
    } catch (err) {
      setAuthError(err?.message || "Could not resend confirmation email. Try again in a minute.");
    } finally {
      setLoading(false);
    }
  };

  const handleSendOTP = async () => {
    if (phone.length < 10) return;
    const sb = getSupabase();
    if (!sb) {
      setAuthError("Phone sign-in is not available on this deployment.");
      return;
    }
    setAuthError("");
    setAuthNotice("");
    setLoading(true);
    try {
      const { error } = await sb.auth.signInWithOtp({
        phone: `+91${phone}`,
        options: {
          shouldCreateUser: requestedSignUp,
          data: requestedSignUp ? { role: accountRole } : undefined,
        },
      });
      if (error) throw error;
      setStep("otp");
      setResendTimer(60);
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch (err) {
      setAuthError(err?.message || "Could not send the verification code.");
    } finally {
      setLoading(false);
    }
  };

  const tryFinishEmailAuth = async (session, { signInIntent: suppliedIntent } = {}) => {
    const user = session.user;
    let profile = null;
    try {
      profile = await fetchUserProfile(user.id);
    } catch (_) {
      /* user_profiles table or policies not ready — continue to profile step */
    }
    const requestedRole = suppliedIntent || searchParams.get("role");
    const hasExplicitRole = requestedRole === "pro" || requestedRole === "homeowner";
    const signInIntent = hasExplicitRole ? requestedRole : accountRole;

    if (profile?.full_name?.trim()) {
      const resolvedRole = await establishHmSession(user, profile, { signInIntent });
      const destination = await resolvePostLoginPath(resolvedRole, redirectFromQuery, { userId: user.id });
      navigate(destination, { replace: true });
      return true;
    }
    const meta = user.user_metadata || {};
    const displayName =
      profile?.full_name ||
      meta.full_name ||
      meta.name ||
      [meta.given_name, meta.family_name].filter(Boolean).join(" ");
    setName(displayName || "");
    setEmail(user.email || authEmail);
    setCity(profile?.city || "");
    if (profile?.phone) {
      const digits = String(profile.phone).replace(/\D/g, "");
      if (digits.length >= 10) setPhone(digits.slice(-10));
    }
    setStep("details");
    return true;
  };

  const finishPasswordRecoveryAuth = async (session) => {
    const user = session.user;
    let profile = null;
    try {
      profile = await fetchUserProfile(user.id);
    } catch (_) {
      /* A missing optional profile must not block password recovery. */
    }
    const requestedRole = searchParams.get("role");
    const signInIntent = requestedRole === "pro" || requestedRole === "homeowner"
      ? requestedRole
      : undefined;
    const resolvedRole = await establishHmSession(user, profile, { signInIntent });
    const destination = await resolvePostLoginPath(resolvedRole, null, { userId: user.id });
    navigate(destination, { replace: true });
  };

  const handleContinueCurrentAccount = async () => {
    const activeRole = currentSession?.role === "pro" ? "pro" : "homeowner";
    const destination = await resolvePostLoginPath(activeRole, redirectFromQuery, {
      userId: currentSession?.supabaseUserId,
    });
    navigate(destination, { replace: true });
  };

  const handleSignOutForRole = async () => {
    setLoading(true);
    const destination = portalPath(accountRole, requestedSignUp ? "signup" : "signin");
    await signOutHm({ redirectTo: destination });
  };

  const handleRoleSelection = (role) => {
    const destination = portalPath(role, "signin");
    const separator = destination.includes("?") ? "&" : "?";
    navigate(redirectFromQuery ? `${destination}${separator}redirect=${encodeURIComponent(redirectFromQuery)}` : destination);
  };

  // Finish OAuth or email confirmation after the browser/native callback returns.
  useEffect(() => {
    const callbackPending =
      hasPendingOAuthSignIn() ||
      searchParams.get("confirmed") === "1" ||
      searchParams.get("oauth") === "1" ||
      searchParams.get("recovery") === "1" ||
      window.location.hash.includes("access_token=");
    if (!callbackPending) return undefined;
    const sb = getSupabase();
    if (!sb) return undefined;

    let cancelled = false;
    const finish = async (session) => {
      if (cancelled || !session?.user) return;
      if (searchParams.get("recovery") === "1" || window.location.hash.includes("type=recovery")) {
        setPasswordRecovery(true);
        setMode("signin");
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const queryRole = searchParams.get("role");
        const oauthRole = readOAuthSignInIntent()?.role;
        const signInIntent =
          queryRole === "pro" || queryRole === "homeowner"
            ? queryRole
            : oauthRole;
        await tryFinishEmailAuth(session, { signInIntent });
        clearOAuthSignInIntent();
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    sb.auth.getSession().then(({ data: { session } }) => {
      if (session) finish(session);
    });
    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((_event, session) => {
      if (session) finish(session);
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleGoogleSignIn = async () => {
    const sb = getSupabase();
    if (!sb) {
      setAuthError("Sign-in is not available on this deployment.");
      return;
    }
    setAuthError("");
    setLoading(true);
    try {
      persistOAuthSignInIntent(accountRole, { redirectPath: redirectFromQuery });
      const params = new URLSearchParams({ role: accountRole });
      if (requestedSignUp) params.set("signup", "1");
      if (redirectFromQuery) params.set("redirect", redirectFromQuery);
      const nextPath = `/sign-in?oauth=1&${params.toString()}`;
      const { data, error } = await sb.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: authCallbackUrl(nextPath),
          skipBrowserRedirect: isNativeApp(),
        },
      });
      if (error) throw error;
      if (isNativeApp()) {
        if (!data?.url) throw new Error("Google sign-in did not return an authorization URL.");
        await openNativeAuthUrl(data.url);
      }
      // Browser is navigating to Google — leave loading on.
    } catch (err) {
      clearOAuthSignInIntent();
      setLoading(false);
      setAuthError(err?.message || "Google sign-in failed. Please try again.");
    }
  };

  const handleForgotPassword = async () => {
    const email = authEmail.trim();
    if (!email) {
      setAuthError("Enter your email address first.");
      setAuthNotice("");
      return;
    }
    const sb = getSupabase();
    if (!sb) {
      setAuthError("Sign-in is not available on this deployment.");
      return;
    }
    setAuthError("");
    setAuthNotice("");
    setLoading(true);
    try {
      const recoveryParams = new URLSearchParams({ recovery: "1", role: accountRole });
      const { error } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: authCallbackUrl(`/sign-in?${recoveryParams.toString()}`),
      });
      if (error) throw error;
      setAuthNotice("If that email is registered, we sent a reset link. Check your inbox.");
    } catch (err) {
      setAuthError(err?.message || "Could not send reset email. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (authPassword.length < 8) {
      setAuthError("Password must be at least 8 characters.");
      return;
    }
    if (authPassword !== confirmPassword) {
      setAuthError("Passwords do not match.");
      return;
    }
    const sb = getSupabase();
    if (!sb) {
      setAuthError("Sign-in is not available on this deployment.");
      return;
    }
    setLoading(true);
    setAuthError("");
    setAuthNotice("");
    try {
      const { error } = await sb.auth.updateUser({ password: authPassword });
      if (error) throw error;
      const {
        data: { session },
      } = await sb.auth.getSession();
      setAuthPassword("");
      setConfirmPassword("");
      if (session) {
        await finishPasswordRecoveryAuth(session);
        setPasswordRecovery(false);
      } else {
        setPasswordRecovery(false);
        setAuthNotice("Password updated. Sign in with your new password.");
      }
    } catch (err) {
      setAuthError(err?.message || "Could not update your password. Request a new reset link.");
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSignIn = async () => {
    if (isSignUp && !EMAIL_SIGNUP_ENABLED) {
      setAuthError("Email account creation is temporarily unavailable. Continue with Google instead.");
      return;
    }
    if (!authEmail || !authPassword) return;
    if (isSignUp && authPassword !== confirmPassword) return;
    if (authPassword.length < 8) {
      setAuthError("Password must be at least 8 characters.");
      return;
    }
    setAuthError("");
    setAuthNotice("");
    setLoading(true);
    try {
      const sb = getSupabase();
      if (sb) {
        if (isSignUp) {
          const { data, error } = await sb.auth.signUp({
            email: authEmail.trim(),
            password: authPassword,
            options: {
              data: { role: accountRole },
              emailRedirectTo: authEmailRedirectTo(),
            },
          });
          if (error) throw error;
          if (!data.session) {
            const email = authEmail.trim();
            setPendingConfirmationEmail(email);
            setAuthNotice(
              `Account created for ${email}. Open the confirmation link we emailed you (check spam), then sign in with this email and password.`,
            );
            setMode("signin");
            return;
          }
          await tryFinishEmailAuth(data.session);
        } else {
          const { data, error } = await sb.auth.signInWithPassword({
            email: authEmail.trim(),
            password: authPassword,
          });
          if (error) throw error;
          await tryFinishEmailAuth(data.session);
        }
      } else {
        await new Promise((r) => setTimeout(r, 900));
        setEmail(authEmail);
        setStep("details");
      }
    } catch (err) {
      const msg = String(err?.message || "");
      if (/not confirmed|confirm your email/i.test(msg)) {
        setPendingConfirmationEmail(authEmail.trim());
        setAuthNotice(
          "This email is registered but not confirmed yet. Resend the confirmation link below, or ask your admin to disable email confirmation in Supabase.",
        );
      } else {
        setAuthError(msg || "Something went wrong. Try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOTPChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);
    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
    if (newOtp.every((d) => d !== "") && newOtp.join("").length === 6) {
      handleVerifyOTP(newOtp.join(""));
    }
  };

  const handleOTPKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOTPPaste = (e) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      e.preventDefault();
      const newOtp = pasted.split("");
      setOtp(newOtp);
      handleVerifyOTP(newOtp.join(""));
    }
  };

  const handleVerifyOTP = async (token = otp.join("")) => {
    if (token.length !== 6) return;
    const sb = getSupabase();
    if (!sb) {
      setAuthError("Phone sign-in is not available on this deployment.");
      return;
    }
    setAuthError("");
    setLoading(true);
    try {
      const { data, error } = await sb.auth.verifyOtp({
        phone: `+91${phone}`,
        token,
        type: "sms",
      });
      if (error) throw error;
      if (!data.session) throw new Error("Verification succeeded without a session. Please try again.");
      await tryFinishEmailAuth(data.session);
    } catch (err) {
      setAuthError(err?.message || "The verification code is invalid or expired.");
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async () => {
    if (!name.trim()) return;
    setAuthError("");
    setLoading(true);
    let postLoginRole = accountRole;
    let postLoginUserId = currentSession?.supabaseUserId;
    try {
      const sb = getSupabase();
      if (sb) {
        const {
          data: { session },
        } = await sb.auth.getSession();
        if (session?.user) {
          await upsertUserProfile({
            fullName: name.trim(),
            phone: phone ? `+91${phone}` : "",
            city: city.trim() || null,
            role: accountRole,
          });
          let profile = null;
          try {
            profile = await fetchUserProfile(session.user.id);
          } catch (_) {
            /* ignore */
          }
          postLoginRole = await establishHmSession(session.user, profile, { signInIntent: accountRole });
          postLoginUserId = session.user.id;
        }
      } else {
        await new Promise((r) => setTimeout(r, 800));
        const profile = { phone: phone ? `+91${phone}` : "", name, email, city };
        try {
          localStorage.setItem("hmUser", JSON.stringify(profile));
          localStorage.setItem(
            "hmSession",
            JSON.stringify({
              role: accountRole,
              signedInAt: new Date().toISOString(),
              profile,
            }),
          );
        } catch (_) {
          // ignore
        }
      }
      const destination = await resolvePostLoginPath(postLoginRole, redirectFromQuery, {
        userId: postLoginUserId,
      });
      setStep("done");
      setTimeout(() => {
        navigate(destination, { replace: true });
      }, 1800);
    } catch (err) {
      setAuthError(err?.message || "Could not save your profile.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    if (resendTimer > 0) return;
    const sb = getSupabase();
    if (!sb) return;
    setLoading(true);
    setAuthError("");
    try {
      const { error } = await sb.auth.resend({ type: "sms", phone: `+91${phone}` });
      if (error) throw error;
      setOtp(["", "", "", "", "", ""]);
      setResendTimer(60);
      otpRefs.current[0]?.focus();
    } catch (err) {
      setAuthError(err?.message || "Could not resend the verification code.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="hm-landing-page min-h-screen bg-background flex flex-col">
      {/* Top Bar — same chrome + lockup as marketing home */}
      <div
        className={`flex items-center gap-3 md:gap-4 px-5 md:px-10 py-3 min-h-[4.65rem] ${HM_HEADER_BAR_CHROME_CLASS}`}
      >
        <button
          type="button"
          onClick={step === "otp" ? () => setStep("entry") : goBack}
          className={`hm-mobile-auth-back flex shrink-0 items-center gap-1.5 text-muted-foreground font-body text-sm hover:text-foreground transition-colors bg-transparent border-none cursor-pointer ${
            step === "details" || step === "done" ? "invisible pointer-events-none" : ""
          }`}
        >
          <ArrowLeft className="w-4 h-4" />
          {step === "otp" ? "Change number" : "Back"}
        </button>
        <button
          type="button"
          onClick={() => navigate("/")}
          className="flex items-center gap-2.5 bg-transparent border-none cursor-pointer p-0 min-w-0"
        >
          <img
            src={hmLogoMarkSrc}
            alt="BuildGuru"
            className="w-12 h-12 md:w-[60px] md:h-[60px] shrink-0"
            width={60}
            height={60}
            decoding="async"
          />
          <span className={`hm-mobile-auth-wordmark ${HM_WORDMARK_TITLE_CLASS}`}>BuildGuru</span>
        </button>
        <div className="flex-1" aria-hidden />
      </div>

      {/* Centered Form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <AnimatePresence mode="wait">
            {/* ─── ENTRY STEP ─── */}
            {step === "entry" && (
              <motion.div
                key="entry"
                initial={false}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.2 }}
                className="space-y-7"
              >
                <div className="text-center">
                  <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-2">
                    {passwordRecovery
                      ? "Set a new password"
                      : !roleSelected
                      ? "Sign in to BuildGuru"
                      : requestedSignUp
                      ? accountRole === "pro" ? "Create a professional account" : "Create a homeowner account"
                      : accountRole === "pro" ? "Professional sign in" : "Homeowner sign in"}
                  </h2>
                  <p className="text-muted-foreground font-body text-base">
                    {passwordRecovery
                      ? "Choose a secure password and confirm it below."
                      : !roleSelected
                      ? "Choose how you are entering today. Your role stays active until you sign out."
                      : requestedSignUp
                      ? accountRole === "pro"
                        ? "Publish your work, manage your profile, and respond to qualified projects."
                        : "Save designs, estimates, professionals, and project progress in one account."
                      : accountRole === "pro"
                        ? "Access your portfolio, leads, and professional workspace."
                        : "Access your saved designs, estimates, and project workspace."}
                  </p>
                </div>

                {!passwordRecovery && !roleSelected ? (
                  <div className="grid gap-3">
                    <button
                      type="button"
                      onClick={() => handleRoleSelection("homeowner")}
                      className="flex items-center gap-4 rounded-2xl border-2 border-border bg-card p-4 text-left transition-colors hover:border-copper/50 hover:bg-copper/5"
                    >
                      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-copper/10 text-copper">
                        <Home className="h-5 w-5" />
                      </span>
                      <span>
                        <span className="block font-body text-sm font-bold text-foreground">Continue as a homeowner</span>
                        <span className="mt-1 block font-body text-xs text-muted-foreground">Plan, design, estimate, hire, and manage a project.</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRoleSelection("pro")}
                      className="flex items-center gap-4 rounded-2xl border-2 border-border bg-card p-4 text-left transition-colors hover:border-copper/50 hover:bg-copper/5"
                    >
                      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-copper/10 text-copper">
                        <Briefcase className="h-5 w-5" />
                      </span>
                      <span>
                        <span className="block font-body text-sm font-bold text-foreground">Continue as a professional</span>
                        <span className="mt-1 block font-body text-xs text-muted-foreground">Access your portfolio, leads, and professional workspace.</span>
                      </span>
                    </button>
                  </div>
                ) : null}

                {!passwordRecovery && roleSelected && (
                  <div className="rounded-xl border-2 border-border p-3.5 bg-card">
                    <p className="m-0 text-sm font-body font-semibold text-foreground">
                      {accountRole === "pro" ? "Professional account" : "Homeowner account"}
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground font-body">
                      {accountRole === "pro"
                        ? "For architects, contractors, designers, engineers, trades, and suppliers."
                        : "For people planning, building, renovating, or managing their property."}
                    </p>
                  </div>
                )}

                {!passwordRecovery && roleSelected && currentSession?.supabaseUserId ? (
                  <div className="rounded-xl border border-copper/25 bg-copper/5 p-3.5">
                    <p className="m-0 text-sm font-body font-semibold text-foreground">
                      Signed in as {currentSession.profile?.email || currentSession.profile?.name || "your account"}
                    </p>
                    <p className="mt-1 mb-3 text-xs leading-relaxed text-muted-foreground font-body">
                      You are signed in in {currentSession.role === "pro" ? "professional" : "homeowner"} mode.
                      {currentSession.role === accountRole
                        ? " Continue to your workspace below."
                        : ` Sign out before entering ${accountRole === "pro" ? "professional" : "homeowner"} mode.`}
                    </p>
                    <Button
                      type="button"
                      onClick={currentSession.role === accountRole ? handleContinueCurrentAccount : handleSignOutForRole}
                      disabled={loading}
                      className="w-full rounded-xl py-5 font-body text-sm font-semibold"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      {currentSession.role === accountRole
                        ? `Continue in ${accountRole === "pro" ? "professional" : "homeowner"} mode`
                        : `Sign out to use ${accountRole === "pro" ? "professional" : "homeowner"} mode`}
                    </Button>
                  </div>
                ) : null}

                {!passwordRecovery && roleSelected && currentSession === undefined ? (
                  <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Checking your session…
                  </div>
                ) : null}

                {passwordRecovery || (roleSelected && currentSession === null) ? (
                  <>
                  {!supabaseConfigured ? (
                    <p className="rounded-lg border border-amber-500/40 bg-amber-50 px-3 py-2 font-body text-sm text-amber-900">
                      Sign-in is temporarily unavailable. Please try again later.
                      {process.env.NODE_ENV === "development" ? (
                        <span className="block mt-2 text-xs font-mono text-amber-800/90">
                          Dev: set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY, then restart.
                          {supabaseInitError ? ` (${supabaseInitError.message})` : ""}
                        </span>
                      ) : null}
                    </p>
                  ) : null}

                  {authError && step === "entry" ? (
                    <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 font-body text-sm text-destructive">
                      {authError}
                    </p>
                  ) : null}

                  {authNotice && step === "entry" ? (
                    <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 font-body text-sm text-emerald-900">
                      {authNotice}
                    </p>
                  ) : null}

                  {requestedSignUp && !EMAIL_SIGNUP_ENABLED && step === "entry" ? (
                    <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 font-body text-sm text-blue-950">
                      Create your account with Google. Email account creation will return after verified delivery is configured.
                    </p>
                  ) : null}

                  {pendingConfirmationEmail && step === "entry" ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 font-body text-sm text-amber-950 space-y-2">
                      <p className="m-0">
                        Confirmation is still pending for <strong>{pendingConfirmationEmail}</strong>. Try resend once; if it does not arrive, contact support.
                      </p>
                      <button
                        type="button"
                        onClick={handleResendConfirmation}
                        disabled={loading || resendTimer > 0}
                        className="text-copper font-semibold hover:underline disabled:opacity-50"
                      >
                        {resendTimer > 0 ? `Resend confirmation in ${resendTimer}s` : "Resend confirmation email"}
                      </button>
                    </div>
                  ) : null}

                  {showPhoneOtp && !passwordRecovery ? (
                    <div className="flex rounded-xl border-2 border-border overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setAuthMethod("phone")}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 font-body text-sm font-medium transition-all ${
                          authMethod === "phone"
                            ? "bg-accent/10 text-copper border-r-2 border-border"
                            : "text-muted-foreground hover:bg-muted/30 border-r-2 border-border"
                        }`}
                      >
                        <Phone className="w-4 h-4" />
                        Phone
                      </button>
                      <button
                        type="button"
                        onClick={() => setAuthMethod("email")}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 font-body text-sm font-medium transition-all ${
                          authMethod === "email"
                            ? "bg-accent/10 text-copper"
                            : "text-muted-foreground hover:bg-muted/30"
                        }`}
                      >
                        <Mail className="w-4 h-4" />
                        Email
                      </button>
                    </div>
                  ) : null}

                  {/* Phone Input */}
                  {showPhoneOtp && !passwordRecovery && authMethod === "phone" && (
                    <>
                      <div className="space-y-3">
                        <Label className="font-body text-sm font-semibold block">
                          Phone Number
                        </Label>
                        <div className="flex gap-2">
                          <div className="flex items-center px-3.5 rounded-xl border-2 border-border bg-muted/30 font-body text-sm text-foreground shrink-0">
                            🇮🇳 +91
                          </div>
                          <Input
                            type="tel"
                            placeholder="98765 43210"
                            value={phone}
                            onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, "").slice(0, 10);
                              setPhone(val);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && phone.length === 10) handleSendOTP();
                            }}
                            className="font-body text-base tracking-wide rounded-xl border-2 h-12"
                          />
                        </div>
                      </div>

                      <Button
                        onClick={handleSendOTP}
                        disabled={phone.length < 10 || loading}
                        className="w-full gradient-copper text-primary-foreground font-body rounded-xl py-6 text-sm font-semibold"
                      >
                        {loading ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        ) : (
                          <Phone className="w-4 h-4 mr-2" />
                        )}
                        {loading ? "Sending OTP..." : (requestedSignUp ? "Send OTP to verify" : "Send OTP")}
                      </Button>
                    </>
                  )}

                  {/* Email Input */}
                  {!googleOnlySignUp && (passwordRecovery || !showPhoneOtp || authMethod === "email") && (
                    <>
                      <div className="space-y-4">
                        {!passwordRecovery && (
                          <div>
                            <Label className="font-body text-sm font-semibold mb-1.5 block">
                              Email Address
                            </Label>
                            <Input
                              type="email"
                              autoComplete="email"
                              placeholder="you@example.com"
                              value={authEmail}
                              onChange={(e) => setAuthEmail(e.target.value)}
                              className="font-body rounded-xl border-2 h-12"
                            />
                          </div>
                        )}
                        <div>
                          <Label className="font-body text-sm font-semibold mb-1.5 block">
                            {passwordRecovery ? "New Password" : isSignUp ? "Create Password" : "Password"}
                          </Label>
                          <Input
                            type="password"
                            autoComplete={isSignUp || passwordRecovery ? "new-password" : "current-password"}
                            placeholder={isSignUp || passwordRecovery ? "Min. 8 characters" : "Enter your password"}
                            value={authPassword}
                            onChange={(e) => setAuthPassword(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !isSignUp && authEmail && authPassword) handleEmailSignIn();
                            }}
                            className="font-body rounded-xl border-2 h-12"
                          />
                          {!isSignUp && !passwordRecovery && (
                            <div className="flex justify-end mt-1">
                              <button
                                type="button"
                                onClick={handleForgotPassword}
                                disabled={loading}
                                className="hm-mobile-auth-link text-copper font-body text-xs font-medium hover:underline disabled:opacity-50"
                              >
                                Forgot password?
                              </button>
                            </div>
                          )}
                        </div>
                        {(isSignUp || passwordRecovery) && (
                          <div>
                            <Label className="font-body text-sm font-semibold mb-1.5 block">
                              Confirm Password
                            </Label>
                            <Input
                              type="password"
                              autoComplete="new-password"
                              placeholder="Re-enter your password"
                              value={confirmPassword}
                              onChange={(e) => setConfirmPassword(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && authEmail && authPassword && confirmPassword === authPassword) handleEmailSignIn();
                              }}
                              className={`font-body rounded-xl border-2 h-12 ${
                                confirmPassword && confirmPassword !== authPassword
                                  ? "border-destructive focus-visible:ring-destructive/30"
                                  : ""
                              }`}
                            />
                            {confirmPassword && confirmPassword !== authPassword && (
                              <p className="text-destructive font-body text-xs mt-1">Passwords don't match</p>
                            )}
                          </div>
                        )}
                      </div>

                      <Button
                        onClick={passwordRecovery ? handleUpdatePassword : handleEmailSignIn}
                        disabled={
                          loading ||
                          !authPassword ||
                          (!passwordRecovery && !authEmail) ||
                          ((isSignUp || passwordRecovery) && authPassword !== confirmPassword)
                        }
                        className="w-full gradient-copper text-primary-foreground font-body rounded-xl py-6 text-sm font-semibold"
                      >
                        {loading ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        ) : (
                          <Mail className="w-4 h-4 mr-2" />
                        )}
                        {loading
                          ? (passwordRecovery ? "Updating password..." : isSignUp ? "Creating account..." : "Signing in...")
                          : (passwordRecovery ? "Save New Password" : isSignUp ? "Create Account" : "Sign In with Email")}
                      </Button>

                    </>
                  )}

                  {supabaseConfigured && !passwordRecovery ? (
                    <>
                      {!googleOnlySignUp ? (
                        <div className="flex items-center gap-3">
                          <div className="h-px flex-1 bg-border" />
                          <span className="font-body text-xs text-muted-foreground">or</span>
                          <div className="h-px flex-1 bg-border" />
                        </div>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleGoogleSignIn}
                        disabled={loading}
                        className="w-full rounded-xl py-6 font-body text-sm font-semibold gap-2 border-2"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
                          <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.16-3.16A10.96 10.96 0 0 0 12 1 11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z" />
                        </svg>
                        {requestedSignUp ? "Create account with Google" : "Sign in with Google"}
                      </Button>
                    </>
                  ) : null}

                  {!passwordRecovery && <p className="text-muted-foreground font-body text-[11px] text-center leading-relaxed">
                    By continuing, you agree to BuildGuru&apos;{" "}
                    <button type="button" onClick={() => navigate("/terms")} className="hm-mobile-auth-legal text-copper hover:underline">Terms of Service</button>
                    {" "}and{" "}
                    <button type="button" onClick={() => navigate("/privacy")} className="hm-mobile-auth-legal text-copper hover:underline">Privacy Policy</button>
                  </p>}

                  {/* Mode Toggle */}
                  {!passwordRecovery && <div className="pt-2 border-t border-border space-y-2">
                    <p className="text-center font-body text-sm text-muted-foreground">
                      {requestedSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
                      <button
                        type="button"
                        onClick={() => {
                          navigate(portalPath(accountRole, requestedSignUp ? "signin" : "signup"));
                        }}
                        className="text-copper font-semibold hover:underline"
                      >
                        {requestedSignUp ? "Sign In" : "Sign Up"}
                      </button>
                    </p>
                    <p className="text-center font-body text-xs text-muted-foreground">
                      {accountRole === "pro" ? "Looking for your homeowner account?" : "Are you an architect, contractor, or other professional?"}{" "}
                      <button
                        type="button"
                        onClick={() => navigate(portalPath(accountRole === "pro" ? "homeowner" : "pro", requestedSignUp ? "signup" : "signin"))}
                        className="text-copper font-semibold hover:underline"
                      >
                        {accountRole === "pro" ? "Homeowner access" : requestedSignUp ? "Join as a professional" : "Professional sign in"}
                      </button>
                    </p>
                  </div>}
                  </>
                ) : null}
                </motion.div>
              )}

              {/* ─── OTP STEP ─── */}
              {step === "otp" && (
                <motion.div
                  key="otp"
                  initial={false}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-8"
                >
                  <div>
                    <h2 className="font-display text-3xl font-bold text-foreground mb-2">
                      Verify your number
                    </h2>
                    <p className="text-muted-foreground font-body text-base">
                      We sent a 6-digit code to{" "}
                      <span className="text-foreground font-semibold">+91 {phone}</span>
                    </p>
                  </div>

                  {/* OTP Input */}
                  <div className="flex gap-3 justify-center" onPaste={handleOTPPaste}>
                    {otp.map((digit, i) => (
                      <input
                        key={i}
                        ref={(el) => { otpRefs.current[i] = el; }}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleOTPChange(i, e.target.value)}
                        onKeyDown={(e) => handleOTPKeyDown(i, e)}
                        className={`w-14 h-16 text-center text-2xl font-body font-bold rounded-xl border-2 transition-all outline-none ${
                          digit
                            ? "border-accent bg-accent/5 text-foreground"
                            : "border-border bg-card text-foreground focus:border-accent focus:ring-2 focus:ring-accent/20"
                        }`}
                      />
                    ))}
                  </div>

                  {loading && (
                    <div className="flex items-center justify-center gap-2 text-copper font-body text-sm">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Verifying...
                    </div>
                  )}

                  <div className="text-center space-y-3">
                    <button
                      type="button"
                      onClick={handleResendOTP}
                      disabled={resendTimer > 0}
                      className={`font-body text-sm font-medium transition-colors ${
                        resendTimer > 0
                          ? "text-muted-foreground cursor-not-allowed"
                          : "text-copper hover:underline"
                      }`}
                    >
                      {resendTimer > 0
                        ? `Resend OTP in ${resendTimer}s`
                        : "Didn't receive it? Resend OTP"}
                    </button>
                  </div>
                </motion.div>
              )}

              {/* ─── DETAILS STEP ─── */}
              {step === "details" && (
                <motion.div
                  key="details"
                  initial={false}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-6"
                >
                  <div>
                    <h2 className="font-display text-3xl font-bold text-foreground mb-2">
                      Complete your profile
                    </h2>
                    <p className="text-muted-foreground font-body text-base">
                      Just a few details so we can personalize your experience.
                    </p>
                  </div>

                  {phone && (
                    <div className="p-3 rounded-xl bg-green-50 border border-green-200 flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-600" />
                      <span className="font-body text-sm text-green-700 font-medium">
                        +91 {phone} verified
                      </span>
                    </div>
                  )}

                  <div className="space-y-4">
                    <div>
                      <Label className="font-body text-sm font-semibold mb-1.5 block">
                        Full Name <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        placeholder="e.g., Rahul Sharma"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="font-body rounded-xl border-2 h-12"
                        autoFocus
                      />
                    </div>

                    <div>
                      <Label className="font-body text-sm font-semibold mb-1.5 block">
                        Email{" "}
                        <span className="text-muted-foreground text-xs font-normal">
                          (for design PDFs & updates)
                        </span>
                      </Label>
                      <Input
                        type="email"
                        placeholder="rahul@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="font-body rounded-xl border-2 h-12"
                      />
                    </div>

                    <div>
                      <Label className="font-body text-sm font-semibold mb-1.5 block">
                        City{" "}
                        <span className="text-muted-foreground text-xs font-normal">
                          (for local rates & pros)
                        </span>
                      </Label>
                      <Input
                        placeholder="e.g., Bangalore"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && name.trim()) handleComplete();
                        }}
                        className="font-body rounded-xl border-2 h-12"
                      />
                    </div>
                  </div>

                  {authError && step === "details" ? (
                    <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 font-body text-sm text-destructive">
                      {authError}
                    </p>
                  ) : null}

                  <Button
                    onClick={handleComplete}
                    disabled={!name.trim() || loading}
                    className="w-full gradient-copper text-primary-foreground font-body rounded-xl py-6 text-sm font-semibold"
                  >
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <ArrowRight className="w-4 h-4 mr-2" />
                    )}
                    {loading ? "Setting up..." : "Get Started"}
                  </Button>
                </motion.div>
              )}

              {/* ─── DONE ─── */}
              {step === "done" && (
                <motion.div
                  key="done"
                  initial={false}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center py-12 space-y-6"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.1 }}
                    className="w-20 h-20 rounded-full gradient-copper flex items-center justify-center mx-auto"
                  >
                    <Check className="w-10 h-10 text-primary-foreground" />
                  </motion.div>
                  <div>
                    <h3 className="font-display text-2xl font-bold text-foreground">
                      Welcome, {name.split(" ")[0]}!
                    </h3>
                    <p className="text-muted-foreground font-body text-base mt-2">
                      Your account is ready. Redirecting...
                    </p>
                  </div>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: "100%" }}
                    transition={{ duration: 1.5, ease: "easeInOut" }}
                    className="h-1 gradient-copper rounded-full mx-auto max-w-xs"
                  />
                </motion.div>
              )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
