import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { LEGAL_BUSINESS_NAME, SUPPORT_EMAIL, legalEntityDetailsParagraph } from "../lib/legalBusiness";

const aboutParagraph = () => {
  const details = legalEntityDetailsParagraph();
  const base =
    "BuildGuru (buildguru.ai) helps plan home construction and remodeling in India: AI-assisted design concepts and estimates, a project hub, a marketplace of professionals, and portfolio tools for professionals. By creating an account or using the platform you agree to these terms.";
  if (LEGAL_BUSINESS_NAME) {
    return `BuildGuru is operated by ${LEGAL_BUSINESS_NAME}. ${details || ""} ${base}`.replace(/\s+/g, " ").trim();
  }
  return base;
};

const refundInstructions = SUPPORT_EMAIL
  ? `If you were charged in error or checkout failed after payment, contact ${SUPPORT_EMAIL} within 7 days with your Razorpay payment ID and account email.`
  : "If you were charged in error or checkout failed after payment, keep your Razorpay payment ID and account email. A verified billing-support contact will be displayed at checkout before paid purchases are enabled.";

const contactInstructions = SUPPORT_EMAIL
  ? `Questions: ${SUPPORT_EMAIL}.`
  : "Any verified contact details will be published on this website.";

const TERMS_SECTIONS = [
  {
    h: "1. About BuildGuru",
    p: aboutParagraph(),
  },
  {
    h: "2. AI concepts are indicative",
    p: "AI-generated designs, floor plans, and cost estimates (\"v0 packs\") are early concepts to help you brief professionals. They are not sanction drawings, structural designs, or fixed quotations. Always validate designs, compliance with local bye-laws, and costs with a licensed architect, engineer, or contractor before acting on them.",
  },
  {
    h: "3. Your account",
    p: "You are responsible for the accuracy of the information you provide and for keeping your login credentials secure. Homeowner and professional accounts must represent real people or businesses. We may suspend accounts that misuse the platform, post misleading content, or attempt to access other users' data.",
  },
  {
    h: "4. Professionals and the marketplace",
    p: "Professional profiles, portfolios, quotes, and proposals are provided by the professionals themselves. BuildGuru does not employ, certify, or guarantee any professional. Verify licenses, references, and agreements directly before hiring. Contracts and payments for work are between you and the professional unless a BuildGuru payment feature explicitly states otherwise.",
  },
  {
    h: "5. Your content",
    p: "You keep ownership of the content you upload (photos, briefs, portfolio work). You grant BuildGuru a license to store, process, and display that content to operate the platform — for example showing a published portfolio to potential clients, or using your brief to generate AI concepts.",
  },
  {
    h: "6. Acceptable use",
    p: "Do not upload unlawful content, others' copyrighted work without permission, or attempt to scrape, reverse-engineer, or disrupt the platform. Do not use AI outputs to misrepresent professional qualifications.",
  },
  {
    h: "7. Liability",
    p: "The platform is provided \"as is\". To the maximum extent permitted by law, BuildGuru is not liable for construction outcomes, cost overruns, disputes with professionals, or decisions made from AI-generated concepts. Nothing in these terms limits liability that cannot be limited under applicable law.",
  },
  {
    h: "8. Refunds and cancellations",
    id: "refunds",
    p: `Paid digital plans (Project Pass, Pro Growth) are non-refundable once access has been activated on your account, except where required by applicable law or where we fail to deliver the purchased digital service. ${refundInstructions} Approved refunds are processed back to the original payment method via Razorpay. You may cancel future renewals by not purchasing again; Pro Growth is a fixed 30-day pass, not an auto-renewing subscription unless we explicitly state otherwise on the checkout page.`,
  },
  {
    h: "9. Changes and contact",
    p: `We may update these terms as the platform evolves; continued use after an update means you accept the revised terms. ${contactInstructions} These terms are governed by the laws of India.`,
  },
];

const PRIVACY_SECTIONS = [
  {
    h: "1. What we collect",
    p: "Account details (name, email, phone, city), project briefs (plot details, budget bands, room photos, preferences), professional portfolio content (business details, work photos), private project documents, team contacts, owner-entered payment records, subscription purchase records, and technical data needed to operate and secure the service.",
  },
  {
    h: "2. How we use it",
    p: "To run your account and projects, generate AI design concepts and estimates from your brief, show published portfolios in the marketplace, connect homeowners and professionals, and keep the platform secure. We do not sell your personal data.",
  },
  {
    h: "3. AI processing",
    p: "Your project brief and uploaded room photos may be sent to the AI provider configured for the requested feature, including xAI, Google, or OpenAI-compatible services, to generate concepts, estimates, or assistant responses. Only the content needed for the request is sent; results are stored in your project so you can revisit them.",
  },
  {
    h: "4. Where your data lives",
    p: "Data is processed by our infrastructure providers: Supabase (database, authentication, and file storage), Vercel (web hosting), Render (API hosting), configured AI providers, and Razorpay when you choose a paid plan. Published portfolios and their photos are public by design — that is what the marketplace shows to potential clients.",
  },
  {
    h: "5. What is public vs private",
    p: "Public: portfolios you publish (name, business, city, specialties, work photos). Private: your project briefs, budgets, documents, and account details — visible only to you when signed in.",
  },
  {
    h: "6. Your choices",
    p: "You can edit your profile and portfolio, control whether a portfolio is published, and permanently delete your account, projects, portfolios, and files from Account & Settings. A minimized payment-event audit may be retained where required for fraud prevention, tax, accounting, or other legal obligations.",
  },
  {
    h: "7. Cookies and analytics",
    p: "We use essential browser storage to keep you signed in, remember the active project, and retain in-progress drafts on your device. We do not run advertising trackers or sell personal data.",
  },
  {
    h: "8. Contact",
    p: SUPPORT_EMAIL
      ? `For privacy questions or requests: ${SUPPORT_EMAIL}.`
      : "Use Account & Settings for available privacy controls. Any additional verified privacy contact will be published on this page.",
  },
];

/** Terms of Service / Privacy Policy — static legal pages required for launch & app stores. */
export default function LegalPage({ kind = "terms" }) {
  const isTerms = kind === "terms";
  const sections = isTerms ? TERMS_SECTIONS : PRIVACY_SECTIONS;
  const title = isTerms ? "Terms of Service" : "Privacy Policy";

  return (
    <div className="min-h-screen bg-[#FBF7F2]" style={{ fontFamily: "'DM Sans', Inter, system-ui, sans-serif" }}>
      <div className="mx-auto max-w-2xl px-6 py-10 md:py-14">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#1C1917] hover:text-[#C85F2B] transition-colors mb-8"
        >
          <ArrowLeft size={16} /> BuildGuru
        </Link>

        <h1 className="font-serif-display text-3xl md:text-4xl font-semibold text-[#1C1917] mb-2">{title}</h1>
        <p className="text-sm text-[#7A6E62] mb-8">Last updated: July 2026</p>

        <div className="space-y-6">
          {sections.map((s) => (
            <section
              key={s.h}
              id={s.id || undefined}
              className="bg-white border border-[#EFE3D2] rounded-2xl p-5 scroll-mt-24"
            >
              <h2 className="text-[15px] font-bold text-[#1C1917] mb-2">{s.h}</h2>
              <p className="text-sm leading-relaxed text-[#57534E] m-0">{s.p}</p>
            </section>
          ))}
        </div>

        <p className="text-xs text-[#9A8F87] mt-8">
          Read the{" "}
          <Link to={isTerms ? "/privacy" : "/terms"} className="text-[#C85F2B] font-semibold hover:underline">
            {isTerms ? "Privacy Policy" : "Terms of Service"}
          </Link>{" "}
          as well.
        </p>
      </div>
    </div>
  );
}
