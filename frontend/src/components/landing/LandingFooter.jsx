import React from "react";
import { Link } from "react-router-dom";
import HmMarketingWordmark from "../HmMarketingWordmark";
import { LEGAL_BUSINESS_NAME, SUPPORT_EMAIL, legalEntityLine } from "../../lib/legalBusiness";

export default function LandingFooter() {
  return (
    <footer className="border-t border-border bg-secondary py-12">
      <div className="container">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="max-w-md">
            <HmMarketingWordmark className="!text-xl !pb-0" />
            <p className="mt-3 font-body text-sm leading-relaxed text-muted-foreground">
              {legalEntityLine()}
            </p>
            {LEGAL_BUSINESS_NAME ? (
              <p className="mt-2 font-body text-xs text-muted-foreground">
                Registered business name: <strong className="text-foreground">{LEGAL_BUSINESS_NAME}</strong>
              </p>
            ) : null}
            {SUPPORT_EMAIL ? (
              <p className="mt-2 font-body text-sm text-muted-foreground">
                Contact:{" "}
                <a href={`mailto:${SUPPORT_EMAIL}`} className="text-copper font-semibold hover:underline">
                  {SUPPORT_EMAIL}
                </a>
              </p>
            ) : null}
          </div>
          <nav className="flex flex-wrap gap-x-8 gap-y-3 font-body text-sm" aria-label="Site footer">
            <Link to="/pricing" className="text-muted-foreground hover:text-copper font-semibold">
              Pricing &amp; services
            </Link>
            <Link to="/browse" className="text-muted-foreground hover:text-copper font-semibold">
              Find professionals
            </Link>
            <Link to="/subscriptions" className="text-muted-foreground hover:text-copper font-semibold">
              Plans &amp; billing
            </Link>
            <Link to="/careers" className="text-muted-foreground hover:text-copper font-semibold">
              Careers
            </Link>
            <Link to="/guides" className="text-muted-foreground hover:text-copper font-semibold">
              Home project guides
            </Link>
            <Link to="/terms" className="text-muted-foreground hover:text-copper font-semibold">
              Terms of Service
            </Link>
            <Link to="/privacy" className="text-muted-foreground hover:text-copper font-semibold">
              Privacy Policy
            </Link>
            <Link to="/terms#refunds" className="text-muted-foreground hover:text-copper font-semibold">
              Refunds &amp; cancellations
            </Link>
          </nav>
        </div>
        <p className="mt-8 border-t border-border/60 pt-6 text-center font-body text-xs text-muted-foreground md:text-left">
          © {new Date().getFullYear()} BuildGuru. Secure checkout via Razorpay (India). Site served over HTTPS.
        </p>
      </div>
    </footer>
  );
}
