import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Copy, Eye, LayoutGrid, Link2, QrCode, ShieldCheck } from "lucide-react";
import { StepRail, ProfileStrength, LivePreview } from "../components/SharedUI";
import { HmHeaderBrandLockup } from "../components/HmBrandLockup";
import HmUserMenu from "../components/HmUserMenu";
import { HM_HEADER_BAR_CLASS, HM_TAGLINE_PORTFOLIO } from "../lib/hmBrand";
import { getPortfolioBase, getPortfolioMedia, migrateLegacyPortfolioMedia, setPortfolioBase, setPortfolioMedia } from "../lib/portfolioStorage";
import { publishPortfolio } from "../lib/api";
import { publicProfileUrl } from "../lib/publicWebUrl";

function WhatsAppLogo() {
  return (
    <svg width="27" height="27" viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="16" r="15" fill="#25D366" />
      <path fill="#fff" d="M23.7 8.3A10.8 10.8 0 0 0 6.8 21.4L5.3 27l5.7-1.5a10.8 10.8 0 0 0 12.7-17.2Zm-7.6 15.4c-1.8 0-3.6-.5-5.1-1.4l-.4-.2-3.4.9.9-3.3-.2-.4a8.7 8.7 0 1 1 8.2 4.4Zm4.8-6.5c-.3-.1-1.6-.8-1.9-.9-.2-.1-.4-.1-.6.2l-.8 1c-.1.2-.3.2-.6.1-1.5-.7-2.6-1.4-3.6-3.1-.3-.5.3-.5.8-1.6.1-.2 0-.4 0-.5l-.9-2.1c-.2-.5-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1 2.9 1.2 3.1c.1.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.6-.7 1.8-1.3.2-.6.2-1.1.1-1.3-.1-.1-.3-.2-.5-.3Z" />
    </svg>
  );
}

function FacebookLogo() {
  return (
    <svg width="27" height="27" viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="16" r="15" fill="#1877F2" />
      <path fill="#fff" d="M18.4 27V17.2h3.3l.5-3.8h-3.8V11c0-1.1.3-1.9 1.9-1.9h2V5.7c-.3 0-1.5-.2-2.9-.2-2.9 0-4.9 1.8-4.9 5.1v2.8h-3.3v3.8h3.3V27h3.9Z" />
    </svg>
  );
}

function LinkedInLogo() {
  return (
    <svg width="27" height="27" viewBox="0 0 32 32" aria-hidden>
      <rect x="1" y="1" width="30" height="30" rx="6" fill="#0A66C2" />
      <circle cx="9.5" cy="10" r="2.2" fill="#fff" />
      <path fill="#fff" d="M7.6 13.4h3.8V25H7.6V13.4Zm6.1 0h3.6V15h.1c.5-1 1.7-2 3.5-2 3.8 0 4.5 2.5 4.5 5.7V25h-3.8v-5.6c0-1.3 0-3-1.9-3s-2.2 1.4-2.2 2.9V25h-3.8V13.4Z" />
    </svg>
  );
}

export default function GoLive() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [slug, setSlug] = useState("");
  const [craft, setCraft] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const portfolioId = localStorage.getItem("hm_portfolio_id");
    if (!portfolioId) {
      navigate("/craft");
      return;
    }
    migrateLegacyPortfolioMedia(portfolioId);
    const saved = getPortfolioBase();
    if (!saved.full_name) {
      navigate("/details");
      return;
    }
    if (!saved.portfolio_theme) {
      navigate("/portfolio-theme");
      return;
    }
    const media = getPortfolioMedia(portfolioId);
    (async () => {
      try {
        const { syncPortfolioMediaForSave } = await import("../lib/portfolioMediaSync");
        const { updatePortfolio } = await import("../lib/api");
        const mediaForDb = await syncPortfolioMediaForSave(portfolioId, media);
        setPortfolioMedia(portfolioId, mediaForDb);
        await updatePortfolio(portfolioId, {
          photos: mediaForDb.photos,
          cover_photo: mediaForDb.cover_photo,
          profile_photo: mediaForDb.profile_photo,
        });
        const published = await publishPortfolio(portfolioId);
        const liveRecord = { ...saved, ...published, ...mediaForDb, published: true, moderation_status: "approved", step: 5, profile_strength: 100 };
        setPortfolioBase(liveRecord);
        setForm(liveRecord);
        setSlug(liveRecord.slug || "");
        setCraft(liveRecord.craft || "");
      } catch (publishError) {
        console.error("Portfolio publish failed:", publishError);
        setError(publishError?.message || "Could not publish your portfolio. Check your connection and try again.");
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  const profileUrl = publicProfileUrl(slug);
  const profileHost = (() => {
    try { return new URL(profileUrl).host; } catch { return "www.homemakers.online"; }
  })();
  const shareMessage = `View my professional portfolio on HomeMakers: ${profileUrl}`;

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(profileUrl); } catch { window.prompt("Copy your portfolio link:", profileUrl); }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  const nativeShare = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: `${form?.full_name || "My"} portfolio`, url: profileUrl }); return; } catch { return; }
    }
    copyLink();
  };

  if (loading) return null;
  if (error) return <div className="min-h-screen bg-[#FBF7F2] p-10 text-center"><p className="text-red-600">{error}</p><button type="button" className="hm-primary-btn mt-5" onClick={() => window.location.reload()}>Try publishing again</button></div>;

  const firstName = form?.full_name?.split(" ")[0] || "there";
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#FBF7F2]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_100%_0%,rgba(193,132,78,0.08),transparent_50%)]" aria-hidden />
      <header className={`${HM_HEADER_BAR_CLASS} hm-desktop-only`} data-testid="hm-header">
        <HmHeaderBrandLockup tagline={HM_TAGLINE_PORTFOLIO} />
        <div className="hidden md:block"><StepRail currentStep={5} /></div>
        <div className="flex shrink-0 items-center gap-3"><ProfileStrength value={100} subtext="Live and shareable" /><HmUserMenu /></div>
      </header>
      <div className="mb-2 flex justify-center px-6 md:hidden"><StepRail currentStep={5} /></div>

      <div className="relative z-10 grid grid-cols-1 gap-8 px-6 pb-32 md:px-12 lg:grid-cols-2 lg:gap-0">
        <section className="pt-8 lg:border-r lg:border-[#EFE3D2] lg:pr-12">
          <div className="inline-flex items-center gap-2 rounded-full bg-green-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-green-700"><CheckCircle2 size={14} /> Published instantly</div>
          <h1 className="mt-6 font-serif-display text-4xl font-medium leading-[1.05] text-[#1C1917] md:text-5xl">You&apos;re live, <span className="italic font-semibold text-[#C85F2B]">{firstName}!</span></h1>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-[#6A5E53]">Your work is public now. Share the link anywhere and let every inquiry begin through HomeMakers.</p>

          <div className="mt-8 rounded-2xl border border-[#EFE3D2] bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2"><span className="text-sm font-semibold text-[#1C1917]">Your live portfolio link</span><span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">Live</span></div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="min-w-0 flex-1 select-all truncate rounded-xl border border-[#EFE3D2] bg-[#F9F5F0] px-4 py-3 font-medium text-[#1C1917]"><span className="text-[#C85F2B]">{profileHost}/profile/</span>{slug}</div>
              <button type="button" onClick={copyLink} className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#C85F2B] px-5 py-3 font-semibold text-white hover:bg-[#B04F20]">{copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}{copied ? "Copied" : "Copy link"}</button>
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-[12px] text-[#7A6E62]"><ShieldCheck size={14} /> Your phone, email, address, and licence details are never shown publicly.</div>
          </div>

          <div className="mt-8">
            <div className="mb-1 text-sm font-semibold text-[#1C1917]">Share your work</div>
            <div className="mb-4 text-[12px] text-[#7A6E62]">A portfolio this good should travel.</div>
            <div className="flex gap-3 overflow-x-auto pb-2">
              <button type="button" aria-label="Share portfolio on WhatsApp" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(shareMessage)}`, "_blank", "noopener")} className="flex h-20 w-24 shrink-0 flex-col items-center justify-center gap-2 rounded-2xl border border-[#EFE3D2] bg-white text-xs font-bold hover:border-green-500"><WhatsAppLogo /> WhatsApp</button>
              <button type="button" aria-label="Share portfolio on Facebook" onClick={() => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(profileUrl)}`, "_blank", "noopener")} className="flex h-20 w-24 shrink-0 flex-col items-center justify-center gap-2 rounded-2xl border border-[#EFE3D2] bg-white text-xs font-bold hover:border-blue-500"><FacebookLogo /> Facebook</button>
              <button type="button" aria-label="Share portfolio on LinkedIn" onClick={() => window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(profileUrl)}`, "_blank", "noopener")} className="flex h-20 w-24 shrink-0 flex-col items-center justify-center gap-2 rounded-2xl border border-[#EFE3D2] bg-white text-xs font-bold hover:border-blue-700"><LinkedInLogo /> LinkedIn</button>
              <button type="button" onClick={nativeShare} className="flex h-20 w-24 shrink-0 flex-col items-center justify-center gap-2 rounded-2xl border border-[#EFE3D2] bg-white text-xs font-bold hover:border-[#C85F2B]"><Link2 size={18} /> Share</button>
              <button type="button" onClick={() => window.open(`https://api.qrserver.com/v1/create-qr-code/?size=360x360&data=${encodeURIComponent(profileUrl)}`, "_blank", "noopener")} className="flex h-20 w-24 shrink-0 flex-col items-center justify-center gap-2 rounded-2xl border border-[#EFE3D2] bg-white text-xs font-bold hover:border-[#C85F2B]"><QrCode size={18} /> QR code</button>
            </div>
          </div>

          <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-[#EFE3D2] pt-6 sm:flex-row">
            <button type="button" onClick={() => window.open(`/profile/${slug}`, "_blank", "noopener")} className="flex items-center gap-2 rounded-xl border border-[#EFE3D2] bg-white px-6 py-3 font-semibold text-[#1C1917]"><Eye size={18} /> Preview as client</button>
            <button type="button" onClick={() => navigate("/pro/dashboard")} className="btn-continue flex items-center">Go to dashboard <LayoutGrid size={18} className="ml-2" /></button>
          </div>
        </section>

        <section className="pt-4 pb-20 lg:pt-8 lg:pl-12 lg:pb-0">
          <LivePreview craftId={craft} formValues={form} themeId={form?.portfolio_theme} layoutId={form?.portfolio_layout} title="Your live portfolio" subtitle="Exactly how homeowners see your work" showTestimonial />
        </section>
      </div>
    </div>
  );
}
