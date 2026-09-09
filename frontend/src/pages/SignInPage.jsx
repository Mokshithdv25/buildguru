import { useState, useRef, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Phone,
  ArrowRight,
  ArrowLeft,
  Check,
  ChevronRight,
  Loader2,
  Mail,
  Home,
  Briefcase,
  Sparkles,
  ShieldCheck,
  Users,
} from "lucide-react";
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
const EMAIL_LINK_AUTH_ENABLED = process.env.REACT_APP_EMAIL_LINK_AUTH_ENABLED !== "false";
const PHONE_AUTH_ENABLED = process.env.REACT_APP_PHONE_AUTH_ENABLED === "true";
const FACEBOOK_AUTH_ENABLED = process.env.REACT_APP_FACEBOOK_AUTH_ENABLED === "true";

const SOCIAL_PROVIDER_LABELS = {
  google: "Google",
  facebook: "Facebook",
};

function portalPath(role, mode) {
  if (role === "pro") return mode === "signup" ? "/pro/join" : "/pro/sign-in";
  return mode === "signup" ? "/join" : "/sign-in?role=homeowner";
}

const PUBLIC_URL = (typeof process !== "undefined" && process.env && process.env.PUBLIC_URL) || "";

/** Left-hand brand visual — same photography the marketing home uses, so sign-in feels like the same product. */
const BRAND_PANELS = {
  default: {
    image: `${PUBLIC_URL}/auth-signin.jpg`,
    alt: "Bright modern living room designed on BuildGuru",
    kicker: "India home planning workspace",
    headline: "From first idea to a clearer project plan.",
    points: [
      { icon: Sparkles, text: "AI designs, estimates, and project plans" },
      { icon: Users, text: "Homeowners and professionals together" },
      { icon: ShieldCheck, text: "One account, one workspace, no chaos" },
    ],
  },
  homeowner: {
    image: `${PUBLIC_URL}/auth-signin.jpg`,
    alt: "Bright modern living room designed on BuildGuru",
    kicker: "For homeowners",
    headline: "Design, build, and manage your home in one place.",
    points: [
      { icon: Sparkles, text: "AI design concepts and floor-plan directions" },
      { icon: Users, text: "Architects, contractors, and trades" },
      { icon: ShieldCheck, text: "Indicative cost estimates and project tracking" },
    ],
  },
  pro: {
    image: `${PUBLIC_URL}/pro_hero_banner.png`,
    alt: "Construction site table with blueprints and tools",
    kicker: "For professionals",
    headline: "Your portfolio, your leads, one workspace.",
    points: [
      { icon: Sparkles, text: "Publish your work to homeowners near you" },
      { icon: Users, text: "Qualified project leads, not cold enquiries" },
      { icon: ShieldCheck, text: "Bids, timelines, and payments in one place" },
    ],
  },
};

function AuthBrandPanel({ role, mode }) {
  const panel = BRAND_PANELS[role] || BRAND_PANELS.default;
  const image = mode === "signup" ? `${PUBLIC_URL}/auth-signup.jpg` : panel.image;
  return (
    <aside className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-center" aria-hidden="true">
      <AnimatePresence mode="wait" initial={false}>
        <motion.img
          key={image}
          src={image}
          alt={panel.alt}
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="absolute inset-0 h-full w-full object-cover"
        />
      </AnimatePresence>
      <div className="absolute inset-0 bg-gradient-to-t from-[#120d09]/90 via-[#1b140f]/45 to-[#241a13]/10" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#120d09]/35 to-transparent" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_85%,rgba(193,132,78,0.28),transparent_45%)]" />

      <div className="relative z-10 p-10 xl:p-14">
        <motion.div
          key={role}
          initial={false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="max-w-md"
        >
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#e3c7a3]/30 bg-white/10 px-3 py-1.5 font-body text-[11px] font-semibold uppercase tracking-[0.18em] text-[#e3c7a3] backdrop-blur-sm">
            {panel.kicker}
          </p>
          <h2 className="mb-6 font-display text-[2.1rem] font-semibold leading-[1.15] tracking-tight text-[#fcfbfa] xl:text-[2.5rem]">
            {panel.headline}
          </h2>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {panel.points.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 font-body text-[15px] text-[#f2eee9]/90">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#e3c7a3]/30 bg-white/10 text-[#e3c7a3] backdrop-blur-sm">
                  <Icon className="h-4 w-4" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </motion.div>
      </div>
    </aside>
  );
}

function RoleCard({ icon: Icon, title, description, image, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hm-mobile-auth-role group relative flex w-full items-center gap-4 overflow-hidden rounded-2xl border border-border/70 bg-white p-3 pr-4 text-left shadow-[0_1px_0_rgba(255,255,255,0.8)_inset,0_10px_30px_-18px_rgba(52,34,18,0.35)] transition-all duration-200 hover:-translate-y-0.5 hover:border-copper/50 hover:shadow-[0_18px_40px_-20px_rgba(52,34,18,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper/50"
    >
      <span className="relative h-[68px] w-[68px] shrink-0 overflow-hidden rounded-xl">
        <img
          src={image}
          alt=""
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />
        <span className="absolute inset-0 bg-gradient-to-t from-[#120d09]/55 to-transparent" />
        <span className="absolute bottom-1.5 left-1.5 flex h-7 w-7 items-center justify-center rounded-lg bg-white/90 text-copper shadow-sm">
          <Icon className="h-4 w-4" />
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-body text-[15px] font-bold text-foreground">{title}</span>
        <span className="mt-0.5 block font-body text-[13px] leading-snug text-muted-foreground">{description}</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground/60 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-copper" />
    </button>
  );
}

/**
 * Role-scoped social, email/password, and passwordless email authentication. The selected role is
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
    const requestedRole = portalRole === "pro" || portalRole === "homeowner"
      ? portalRole
      : searchParams.get("role");
    if (requestedRole === "pro" || requestedRole === "homeowner") setAccountRole(requestedRole);
    if ((portalMode === "signup" || searchParams.get("mode") === "signup") && EMAIL_SIGNUP_ENABLED) {
      setMode("signup");
    } else if (searchParams.get("recovery") !== "1") {
      setMode("signin");
    }
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

  // If a user cancels the provider dialog or presses Back, the browser may
  // restore this page from its back-forward cache with the OAuth spinner still
  // active. Clear that abandoned intent so another provider attempt is usable.
  useEffect(() => {
    const resetAbandonedOAuth = () => {
      const url = new URL(window.location.href);
      const callbackRoute =
        url.searchParams.get("oauth") === "1" ||
        url.searchParams.get("confirmed") === "1" ||
        url.searchParams.get("recovery") === "1" ||
        url.hash.includes("access_token=") ||
        url.hash.includes("type=recovery");
      if (callbackRoute) return;
      clearOAuthSignInIntent();
      setLoading(false);
    };
    const handlePageShow = () => resetAbandonedOAuth();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") resetAbandonedOAuth();
    };
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("popstate", handlePageShow);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("popstate", handlePageShow);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
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

  const handleSocialSignIn = async (provider) => {
    const providerLabel = SOCIAL_PROVIDER_LABELS[provider];
    if (!providerLabel) {
      setAuthError("That sign-in provider is not supported.");
      return;
    }
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
        provider,
        options: {
          redirectTo: authCallbackUrl(nextPath),
          skipBrowserRedirect: isNativeApp(),
        },
      });
      if (error) throw error;
      if (isNativeApp()) {
        if (!data?.url) throw new Error(`${providerLabel} sign-in did not return an authorization URL.`);
        await openNativeAuthUrl(data.url);
      }
      // Browser is navigating to the provider — leave loading on.
    } catch (err) {
      clearOAuthSignInIntent();
      setLoading(false);
      setAuthError(err?.message || `${providerLabel} sign-in failed. Please try again.`);
    }
  };

  const handleEmailLinkSignIn = async () => {
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
      const { error } = await sb.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: requestedSignUp,
          emailRedirectTo: authEmailRedirectTo(),
          data: requestedSignUp ? { role: accountRole } : undefined,
        },
      });
      if (error) throw error;
      setAuthNotice(
        requestedSignUp
          ? `We sent a secure account link to ${email}. Open it on this device to finish signing up.`
          : `If ${email} is registered, we sent a secure sign-in link. Check spam and promotions folders too.`,
      );
    } catch (err) {
      setAuthError(err?.message || "Could not send the secure email link. Try again in a minute.");
    } finally {
      setLoading(false);
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

      {/* Split layout: brand visual (desktop only) + form */}
      <div className="grid flex-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] xl:grid-cols-2">
        <AuthBrandPanel
          role={roleSelected || passwordRecovery ? accountRole : "default"}
          mode={isSignUp ? "signup" : "signin"}
        />
        <div className="flex items-center justify-center px-5 py-8 sm:p-10">
        <div className="w-full max-w-[26rem]">
          <AnimatePresence mode="wait">
            {/* ─── ENTRY STEP ─── */}
            {step === "entry" && (
              <motion.div
                key="entry"
                initial={false}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <div className={roleSelected || passwordRecovery ? "text-left" : "text-center"}>
                  {!passwordRecovery && roleSelected ? (
                    <div className="mb-4 flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-copper/20 bg-copper/[0.07] px-2.5 py-1 font-body text-[11px] font-semibold uppercase tracking-[0.14em] text-copper">
                        {accountRole === "pro" ? <Briefcase className="h-3 w-3" /> : <Home className="h-3 w-3" />}
                        {accountRole === "pro" ? "Professional" : "Homeowner"}
                      </span>
                      <button
                        type="button"
                        onClick={() => navigate(portalPath(accountRole === "pro" ? "homeowner" : "pro", requestedSignUp ? "signup" : "signin"))}
                        className="font-body text-xs font-medium text-muted-foreground underline-offset-2 hover:text-copper hover:underline"
                      >
                        Switch
                      </button>
                    </div>
                  ) : null}
                  <h2 className="font-display text-[1.9rem] md:text-[2.25rem] font-semibold tracking-tight leading-[1.15] text-foreground mb-2">
                    {passwordRecovery
                      ? "Set a new password"
                      : !roleSelected
                      ? "Welcome to BuildGuru"
                      : requestedSignUp
                      ? "Create your account"
                      : "Welcome back"}
                  </h2>
                  <p className="text-muted-foreground font-body text-[15px] leading-relaxed">
                    {passwordRecovery
                      ? "Choose a secure password and confirm it below."
                      : !roleSelected
                      ? "How are you signing in today?"
                      : requestedSignUp
                      ? accountRole === "pro"
                        ? "Start publishing your work and receiving project leads."
                        : "Save your designs, estimates, and project in one place."
                      : accountRole === "pro"
                        ? "Sign in to your professional workspace."
                        : "Sign in to pick up where you left off."}
                  </p>
                </div>

                {!passwordRecovery && !roleSelected ? (
                  <>
                    <div className="grid gap-3">
                      <RoleCard
                        icon={Home}
                        image={`${PUBLIC_URL}/auth-signup.jpg`}
                        title="I'm a homeowner"
                        description="Plan, design, estimate, and hire for my project."
                        onClick={() => handleRoleSelection("homeowner")}
                      />
                      <RoleCard
                        icon={Briefcase}
                        image={BRAND_PANELS.pro.image}
                        title="I'm a professional"
                        description="Architect, contractor, designer, or trade."
                        onClick={() => handleRoleSelection("pro")}
                      />
                    </div>
                    <p className="m-0 text-center font-body text-xs text-muted-foreground">
                      Your role stays active until you sign out.
                    </p>
                  </>
                ) : null}

                {!passwordRecovery && roleSelected && currentSession?.supabaseUserId ? (
                  <div className="rounded-2xl border border-copper/25 bg-white p-4 shadow-[0_24px_60px_-36px_rgba(52,34,18,0.35)]">
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
                  <div className="flex items-center justify-center gap-2 rounded-2xl border border-border/70 bg-white p-5 font-body text-sm text-muted-foreground">
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

                  <div className="space-y-4 rounded-2xl border border-border/70 bg-white p-5 shadow-[0_1px_0_rgba(255,255,255,0.8)_inset,0_24px_60px_-36px_rgba(52,34,18,0.35)] sm:p-6">
                  {supabaseConfigured && !passwordRecovery ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleSocialSignIn("google")}
                        disabled={loading}
                        className="h-12 w-full gap-2.5 rounded-xl border border-border bg-white font-body text-sm font-semibold text-foreground shadow-sm hover:border-copper/40 hover:bg-copper/[0.04] hover:text-foreground"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
                          <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.16-3.16A10.96 10.96 0 0 0 12 1 11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z" />
                        </svg>
                        Continue with Google
                      </Button>
                      {FACEBOOK_AUTH_ENABLED ? (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => handleSocialSignIn("facebook")}
                          disabled={loading}
                          className="h-12 w-full gap-2.5 rounded-xl border border-border bg-white font-body text-sm font-semibold text-foreground shadow-sm hover:border-copper/40 hover:bg-copper/[0.04] hover:text-foreground"
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
                            <path fill="#1877F2" d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.03 1.79-4.7 4.53-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.95.93-1.95 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07Z" />
                          </svg>
                          Continue with Facebook
                        </Button>
                      ) : null}
                      {!googleOnlySignUp ? (
                        <div className="flex items-center gap-3 pt-1">
                          <div className="h-px flex-1 bg-border" />
                          <span className="font-body text-xs text-muted-foreground">or continue with email</span>
                          <div className="h-px flex-1 bg-border" />
                        </div>
                      ) : null}
                    </>
                  ) : null}

                  {showPhoneOtp && !passwordRecovery ? (
                    <div className="flex rounded-xl border border-border overflow-hidden">
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
                        <Label className="font-body text-[13px] font-medium text-foreground/80 block">
                          Phone number
                        </Label>
                        <div className="flex gap-2">
                          <div className="flex items-center px-3.5 rounded-xl border border-border bg-muted/40 font-body text-sm text-foreground shrink-0">
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
                            className="h-12 rounded-xl border border-border bg-white font-body text-base tracking-wide shadow-none focus-visible:border-copper/60 focus-visible:ring-2 focus-visible:ring-copper/20"
                          />
                        </div>
                      </div>

                      <Button
                        onClick={handleSendOTP}
                        disabled={phone.length < 10 || loading}
                        className="h-12 w-full rounded-xl gradient-copper font-body text-sm font-semibold text-primary-foreground shadow-[0_10px_24px_-12px_rgba(168,106,49,0.7)] transition-opacity hover:opacity-90"
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
                            <Label className="font-body text-[13px] font-medium text-foreground/80 mb-1.5 block">
                              Email
                            </Label>
                            <Input
                              type="email"
                              autoComplete="email"
                              placeholder="you@example.com"
                              value={authEmail}
                              onChange={(e) => setAuthEmail(e.target.value)}
                              className="h-12 rounded-xl border border-border bg-white font-body shadow-none focus-visible:border-copper/60 focus-visible:ring-2 focus-visible:ring-copper/20"
                            />
                          </div>
                        )}
                        <div>
                          <Label className="font-body text-[13px] font-medium text-foreground/80 mb-1.5 block">
                            {passwordRecovery ? "New password" : isSignUp ? "Create password" : "Password"}
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
                            className="h-12 rounded-xl border border-border bg-white font-body shadow-none focus-visible:border-copper/60 focus-visible:ring-2 focus-visible:ring-copper/20"
                          />
                          {!isSignUp && !passwordRecovery && (
                            <div className="flex justify-end mt-1">
                              <button
                                type="button"
                                onClick={handleForgotPassword}
                                disabled={loading}
                                className="hm-mobile-auth-link font-body text-xs font-medium text-muted-foreground hover:text-copper hover:underline disabled:opacity-50"
                              >
                                Forgot password?
                              </button>
                            </div>
                          )}
                        </div>
                        {(isSignUp || passwordRecovery) && (
                          <div>
                            <Label className="font-body text-[13px] font-medium text-foreground/80 mb-1.5 block">
                              Confirm password
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
                              className={`h-12 rounded-xl border border-border bg-white font-body shadow-none focus-visible:border-copper/60 focus-visible:ring-2 focus-visible:ring-copper/20 ${
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
                        className="h-12 w-full rounded-xl gradient-copper font-body text-sm font-semibold text-primary-foreground shadow-[0_10px_24px_-12px_rgba(168,106,49,0.7)] transition-opacity hover:opacity-90"
                      >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        {loading
                          ? (passwordRecovery ? "Updating password…" : isSignUp ? "Creating account…" : "Signing in…")
                          : (passwordRecovery ? "Save new password" : isSignUp ? "Create account" : "Sign in")}
                        {!loading ? <ArrowRight className="w-4 h-4" /> : null}
                      </Button>

                      {EMAIL_LINK_AUTH_ENABLED && !passwordRecovery ? (
                        <p className="m-0 text-center font-body text-xs text-muted-foreground">
                          Prefer not to use a password?{" "}
                          <button
                            type="button"
                            onClick={handleEmailLinkSignIn}
                            disabled={loading || !authEmail}
                            className="hm-mobile-auth-link inline-flex items-center gap-1 font-semibold text-copper hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                            title={!authEmail ? "Enter your email above first" : undefined}
                          >
                            <Mail className="h-3.5 w-3.5" />
                            {requestedSignUp ? "Email me a sign-up link" : "Email me a sign-in link"}
                          </button>
                        </p>
                      ) : null}

                    </>
                  )}
                  </div>

                  {!passwordRecovery && <p className="text-muted-foreground font-body text-[11px] text-center leading-relaxed">
                    By continuing, you agree to BuildGuru&apos;s{" "}
                    <button type="button" onClick={() => navigate("/terms")} className="hm-mobile-auth-legal text-copper hover:underline">Terms of Service</button>
                    {" "}and{" "}
                    <button type="button" onClick={() => navigate("/privacy")} className="hm-mobile-auth-legal text-copper hover:underline">Privacy Policy</button>
                  </p>}

                  {/* Mode Toggle */}
                  {!passwordRecovery && <p className="m-0 text-center font-body text-sm text-muted-foreground">
                    {requestedSignUp ? "Already have an account?" : "New to BuildGuru?"}{" "}
                    <button
                      type="button"
                      onClick={() => {
                        navigate(portalPath(accountRole, requestedSignUp ? "signin" : "signup"));
                      }}
                      className="hm-mobile-auth-link font-semibold text-copper hover:underline"
                    >
                      {requestedSignUp ? "Sign in" : "Create an account"}
                    </button>
                  </p>}
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
                        className="h-12 rounded-xl border border-border bg-white font-body shadow-none focus-visible:border-copper/60 focus-visible:ring-2 focus-visible:ring-copper/20"
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
                        className="h-12 rounded-xl border border-border bg-white font-body shadow-none focus-visible:border-copper/60 focus-visible:ring-2 focus-visible:ring-copper/20"
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
                        className="h-12 rounded-xl border border-border bg-white font-body shadow-none focus-visible:border-copper/60 focus-visible:ring-2 focus-visible:ring-copper/20"
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
    </div>
  );
}
