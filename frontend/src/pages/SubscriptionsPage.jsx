import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, CreditCard, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { HM_HEADER_BAR_CHROME_CLASS, HM_WORDMARK_TITLE_CLASS, hmLogoMarkSrc } from "../lib/hmBrand";
import { AUTH_UI_ENABLED } from "../lib/authMode";
import { useHmSession } from "../hooks/useHmSession";
import { billingErrorMessage, fetchBillingSummary, purchasePlan } from "../lib/billingApi";
import HmUserMenu from "../components/HmUserMenu";
import { Capacitor } from "@capacitor/core";

const PLAN_COPY = {
  homeowner: {
    id: "homeowner_project_pass",
    name: "Project Pass",
    price: "₹4,999",
    cadence: "one-time per account",
    summary: "Turn your free exterior concept into an editable design and floor-plan package.",
    benefits: [
      "Generate floor-plan directions from your saved exterior",
      "Regenerate and revise designs with written change requests",
      "Saved project hub, tasks, timeline and documents",
      "Share your structured brief with professionals",
      "Account entitlement when paid access is enabled",
    ],
  },
  pro: {
    id: "pro_growth_30d",
    name: "Pro Growth",
    price: "₹1,999",
    cadence: "30 days",
    summary: "Publish your business and get discovered by homeowners in the directory.",
    benefits: [
      "Published professional portfolio and shareable profile",
      "Directory visibility and homeowner discovery",
      "Portfolio media, specialties and business details",
      "Account entitlement when paid access is enabled",
    ],
  },
};

function entitlementIsActive(entitlement) {
  if (!entitlement || entitlement.status !== "active") return false;
  if (!entitlement.active_until) return true;
  return new Date(entitlement.active_until).getTime() > Date.now();
}

export default function SubscriptionsPage() {
  const navigate = useNavigate();
  const session = useHmSession();
  const [summary, setSummary] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [paying, setPaying] = React.useState(false);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const isNativeApp = Capacitor.isNativePlatform();
  const billingEnabled = process.env.REACT_APP_BILLING_ENABLED === "true";

  const role = session?.role === "pro" ? "pro" : "homeowner";
  const plan = PLAN_COPY[role];
  const entitlement = summary?.entitlements?.find((item) => item.plan_id === plan.id);
  const active = entitlementIsActive(entitlement);

  const refresh = React.useCallback(async () => {
    if (!session || !billingEnabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      setSummary(await fetchBillingSummary());
    } catch (err) {
      setError(billingErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [session, billingEnabled]);

  React.useEffect(() => {
    if (session === undefined) return;
    if (AUTH_UI_ENABLED && session === null) {
      navigate("/sign-in?mode=signin&redirect=/subscriptions", { replace: true });
      return;
    }
    void refresh();
  }, [session, navigate, refresh]);

  const handlePurchase = async () => {
    setPaying(true);
    setError("");
    setNotice("");
    try {
      await purchasePlan(plan.id, session?.profile || {});
      setNotice("Payment verified. Your plan is active.");
      await refresh();
    } catch (err) {
      const message = billingErrorMessage(err);
      if (!/closed before payment/i.test(message)) setError(message);
    } finally {
      setPaying(false);
    }
  };

  if (session === undefined || (AUTH_UI_ENABLED && session === null)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-copper" />
      </div>
    );
  }

  const backPath = role === "pro" ? "/pro/dashboard" : "/project";
  const expiry = entitlement?.active_until
    ? new Date(entitlement.active_until).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <div className="hm-landing-page min-h-screen bg-background flex flex-col">
      <header className={`flex items-center gap-3 md:gap-4 px-5 md:px-10 py-3 min-h-[4.65rem] ${HM_HEADER_BAR_CHROME_CLASS}`}>
        <button
          type="button"
          onClick={() => navigate(backPath)}
          className="inline-flex shrink-0 items-center gap-2 text-sm text-muted-foreground hover:text-foreground bg-transparent border-none cursor-pointer font-body"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <button type="button" onClick={() => navigate("/")} className="flex items-center gap-2.5 bg-transparent border-none cursor-pointer p-0 min-w-0">
          <img src={hmLogoMarkSrc} alt="BuildGuru" className="w-12 h-12 shrink-0" width={48} height={48} />
          <span className={HM_WORDMARK_TITLE_CLASS}>BuildGuru</span>
        </button>
        <div className="flex-1" aria-hidden />
        <HmUserMenu />
      </header>

      <main className="flex-1 px-5 py-10 md:px-8">
        <div className="mx-auto w-full max-w-4xl">
          <div className="mb-7 max-w-2xl">
            <p className="font-body text-xs font-bold uppercase tracking-[0.16em] text-copper m-0 mb-2">Plans & billing</p>
            <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground m-0">Upgrade when you are ready to move forward.</h1>
            <p className="font-body text-sm md:text-base text-muted-foreground leading-relaxed mt-3 mb-0">
              Keep exploring on Free. Choose the paid plan when you want the full launch workflow for your {role === "pro" ? "business" : "home project"}.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-[0.78fr_1.22fr]">
            <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
              <p className="font-body text-xs font-bold uppercase tracking-wider text-muted-foreground m-0">Current plan</p>
              {loading ? (
                <div className="mt-5 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Checking billing…</div>
              ) : (
                <>
                  <div className="mt-4 flex items-center gap-3">
                    <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${active ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                      {active ? <Sparkles className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
                    </span>
                    <div>
                      <p className="font-display text-xl font-semibold text-foreground m-0">{active ? plan.name : "Free"}</p>
                      <p className="font-body text-xs text-muted-foreground m-0 mt-1">
                        {active ? (expiry ? `Active through ${expiry}` : "Active") : "₹0 · no card on file"}
                      </p>
                    </div>
                  </div>
                  <p className="font-body text-sm text-muted-foreground leading-relaxed mt-5 mb-0">
                    {active ? "Your payment has been verified and your entitlement is stored on your account." : "Free includes one saved exterior concept and indicative estimate. Floor plans and revisions require Project Pass."}
                  </p>
                </>
              )}
            </section>

            <section className="relative overflow-hidden rounded-3xl border-2 border-copper/40 bg-gradient-to-br from-[#FFF8F1] to-white p-6 md:p-7 shadow-sm">
              <div className="absolute right-0 top-0 rounded-bl-2xl bg-copper px-4 py-2 font-body text-[11px] font-bold uppercase tracking-wider text-white">Launch plan</div>
              <p className="font-display text-2xl font-bold text-foreground m-0 pr-24">{plan.name}</p>
              <p className="font-body text-sm text-muted-foreground mt-2 mb-0">{plan.summary}</p>
              {!isNativeApp ? (
                <div className="mt-5 flex items-end gap-2">
                  <span className="font-display text-4xl font-bold text-foreground">{plan.price}</span>
                  <span className="font-body text-sm text-muted-foreground pb-1">{plan.cadence}</span>
                </div>
              ) : null}
              <ul className="mt-6 space-y-3 p-0 list-none">
                {plan.benefits.map((benefit) => (
                  <li key={benefit} className="flex items-start gap-3 font-body text-sm text-foreground">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Check className="h-3.5 w-3.5" /></span>
                    {benefit}
                  </li>
                ))}
              </ul>

              {notice && <div role="status" className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 font-body text-sm text-emerald-800">{notice}</div>}
              {error && <div role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-body text-sm text-red-700">{error}</div>}

              {!isNativeApp && billingEnabled ? <button
                type="button"
                onClick={handlePurchase}
                disabled={paying || loading || active || Boolean(error && !summary)}
                className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-copper px-5 py-3.5 font-body text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-55"
              >
                {paying ? <Loader2 className="h-4 w-4 animate-spin" /> : active ? <Check className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}
                {paying ? "Opening secure checkout…" : active ? "Plan active" : `Pay ${plan.price} securely`}
              </button> : (
                <div className="mt-6 rounded-xl border border-border bg-white/80 px-4 py-3 font-body text-sm text-muted-foreground">
                  {isNativeApp
                    ? "This mobile build displays plan status only. Existing account entitlements sync automatically."
                    : "Checkout is not active while paid-access rules and refund handling are being verified."}
                </div>
              )}
              {!isNativeApp && billingEnabled ? <p className="font-body text-[11px] leading-relaxed text-muted-foreground text-center mt-3 mb-0">
                Processed by Razorpay. Access activates only after server-side payment verification.
              </p> : null}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
