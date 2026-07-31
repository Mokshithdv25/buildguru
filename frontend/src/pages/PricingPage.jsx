import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Check } from "lucide-react";
import LandingNavbar from "../components/landing/LandingNavbar";
import LandingFooter from "../components/landing/LandingFooter";
import { LEGAL_BUSINESS_NAME, SUPPORT_EMAIL, legalEntityLine } from "../lib/legalBusiness";
import { AUTH_UI_ENABLED } from "../lib/authMode";

const SERVICES = [
  {
    id: "free",
    name: "Free exploration",
    price: "₹0",
    cadence: "forever",
    summary: "Start a build or remodel brief and generate one indicative AI exterior concept and estimate range.",
    features: [
      "New home or remodel flow",
      "One saved exterior concept (v0)",
      "Indicative estimate band",
      "Browse published professional portfolios",
    ],
    cta: "Start a project",
    path: "/build",
    highlight: false,
  },
  {
    id: "homeowner_project_pass",
    name: "Project Pass",
    price: "₹4,999",
    cadence: "one-time per account",
    summary: "Full AI design workspace, floor-plan directions, revisions, and project hub for homeowners.",
    features: [
      "Floor-plan directions from your saved exterior",
      "Design revisions with written change requests",
      "Project hub: tasks, timeline, documents, site feed",
      "Share structured brief with professionals",
      "Secure Razorpay checkout",
    ],
    cta: "View checkout",
    path: "/subscriptions",
    highlight: true,
  },
  {
    id: "pro_growth_30d",
    name: "Pro Growth",
    price: "₹1,999",
    cadence: "30 days",
    summary: "Publish your practice, get directory visibility, and receive clearer homeowner briefs.",
    features: [
      "Published portfolio and shareable profile link",
      "Marketplace / directory visibility",
      "Portfolio media, specialties, business details",
      "Secure Razorpay checkout",
    ],
    cta: "View checkout",
    path: "/subscriptions",
    highlight: false,
  },
];

export default function PricingPage() {
  const navigate = useNavigate();
  const billingEnabled = process.env.REACT_APP_BILLING_ENABLED === "true";

  return (
    <div className="hm-landing-page min-h-screen flex flex-col">
      <LandingNavbar tagline="Pricing & services" />
      <main className="flex-1 px-5 py-10 md:px-8 md:py-14">
        <div className="mx-auto max-w-5xl">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-copper mb-6"
          >
            <ArrowLeft size={16} /> Home
          </Link>
          <p className="font-body text-xs font-bold uppercase tracking-[0.16em] text-copper m-0 mb-2">
            Products &amp; services
          </p>
          <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground m-0">
            Plans for homeowners and professionals
          </h1>
          <p className="font-body text-sm md:text-base text-muted-foreground leading-relaxed mt-3 max-w-2xl">
            {legalEntityLine()} All prices are in Indian Rupees (INR), inclusive of applicable taxes where charged.
            Digital services are delivered inside your BuildGuru account after payment verification.
          </p>
          {LEGAL_BUSINESS_NAME ? (
            <p className="font-body text-sm text-foreground mt-2">
              Legal entity: <strong>{LEGAL_BUSINESS_NAME}</strong>
            </p>
          ) : null}

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {SERVICES.map((plan) => (
              <article
                key={plan.id}
                className={`rounded-3xl border p-6 shadow-sm flex flex-col ${
                  plan.highlight ? "border-copper/50 bg-gradient-to-b from-[#FFF8F1] to-card" : "border-border bg-card"
                }`}
              >
                <h2 className="font-display text-xl font-semibold text-foreground m-0">{plan.name}</h2>
                <div className="mt-3 flex items-end gap-1">
                  <span className="font-display text-3xl font-bold text-foreground">{plan.price}</span>
                  <span className="font-body text-sm text-muted-foreground pb-1">{plan.cadence}</span>
                </div>
                <p className="font-body text-sm text-muted-foreground mt-3 mb-0 leading-relaxed">{plan.summary}</p>
                <ul className="mt-5 space-y-2.5 p-0 list-none flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex gap-2 font-body text-sm text-foreground">
                      <Check className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => navigate(plan.path)}
                  className={`mt-6 w-full rounded-xl py-3 font-body text-sm font-semibold border-none cursor-pointer ${
                    plan.highlight
                      ? "gradient-copper text-primary-foreground"
                      : "bg-secondary text-foreground hover:bg-secondary/80"
                  }`}
                >
                  {plan.id === "free" ? plan.cta : billingEnabled || !AUTH_UI_ENABLED ? plan.cta : "Sign in to purchase"}
                </button>
              </article>
            ))}
          </div>

          <section className="mt-12 rounded-2xl border border-border bg-card p-6 md:p-8">
            <h2 className="font-display text-xl font-semibold text-foreground m-0">How payment works</h2>
            <p className="font-body text-sm text-muted-foreground leading-relaxed mt-3 mb-0">
              Paid plans use Razorpay Standard Checkout (HTTPS). Your card or UPI details are entered on Razorpay&apos;s
              secure page — not on BuildGuru. Access activates only after our server verifies the payment signature.
              {SUPPORT_EMAIL ? (
                <>
                  {" "}Questions or billing support:{" "}
                  <a href={`mailto:${SUPPORT_EMAIL}`} className="text-copper font-semibold hover:underline">
                    {SUPPORT_EMAIL}
                  </a>
                  .
                </>
              ) : null} See{" "}
              <Link to="/terms#refunds" className="text-copper font-semibold hover:underline">
                refunds &amp; cancellations
              </Link>
              .
            </p>
          </section>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
