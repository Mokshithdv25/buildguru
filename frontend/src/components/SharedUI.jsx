import React from "react";
import { findCraft } from "../lib/crafts";
import { getPortfolioThemeFromRecord, portfolioThemeCssVars } from "../lib/portfolioThemes";
import { User, Pencil, MapPin, ImageIcon, Lightbulb } from "lucide-react";

export function StepRail({ currentStep = 1 }) {
  const steps = [
    { n: 1, label: "Your Craft" },
    { n: 2, label: "Your Details" },
    { n: 3, label: "Look & Feel" },
    { n: 4, label: "Your Portfolio" },
    { n: 5, label: "Go Live" },
  ];
  return (
    <div
      className="flex items-center gap-3 md:gap-4 w-full max-w-xl"
      data-testid="step-rail"
    >
      {steps.map((s, i) => (
        <React.Fragment key={s.n}>
          <div className="flex flex-col items-center gap-2 shrink-0">
            <div
              className="step-dot"
              data-state={currentStep === s.n ? "active" : "idle"}
              data-testid={`step-dot-${s.n}`}
            >
              {currentStep > s.n ? (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-[#C85F2B]"
                >
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              ) : (
                s.n
              )}
            </div>
            <span
              className={`text-[11px] md:text-xs font-medium tracking-wide ${
                currentStep === s.n ? "text-[#1C1917]" : "text-[#A89A8C]"
              }`}
            >
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className="step-rail -mt-5"
              data-filled={currentStep > s.n ? "true" : "false"}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

export function ProfileStrength({ value = 15, subtext }) {
  const deg = Math.round((value / 100) * 360);
  return (
    <div className="profile-strength-pill" data-testid="profile-strength">
      <div>
        <div className="text-[11px] font-semibold tracking-wider text-[#B04F20] uppercase">
          Profile Strength
        </div>
        <div className="flex items-end gap-2 mt-0.5">
          <div className="font-serif-display text-2xl font-semibold text-[#C85F2B] leading-none">
            {value}%
          </div>
          {subtext && (
            <div className="text-[10px] font-semibold text-[#C85F2B] leading-none mb-0.5">
              {subtext}
            </div>
          )}
        </div>
      </div>
      <div
        className="strength-ring"
        style={{ "--strength-deg": `${deg}deg` }}
        aria-hidden
      />
    </div>
  );
}

export function LivePreview({
  craftId,
  formValues = {},
  themeId,
  layoutId,
  title,
  subtitle,
  showTestimonial = false,
}) {
  const craft = findCraft(craftId);
  const theme = getPortfolioThemeFromRecord({
    portfolio_theme: themeId || formValues.portfolio_theme,
    portfolio_layout: layoutId || formValues.portfolio_layout,
  });
  const themeStyle = portfolioThemeCssVars(theme);
  const displayName = craft ? craft.name : "Architect";
  const hero =
    formValues.cover_photo ||
    craft?.hero ||
    "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1400&q=70";
  
  const specialties = formValues.specialties && formValues.specialties.length > 0 
    ? formValues.specialties 
    : (craft?.specialties || ["Residential", "Commercial", "Sustainable"]);
    
  const name = formValues.full_name || "Your Name";
  const business = formValues.business_name || displayName;
  const city = formValues.city || "Your City";
  const about = formValues.short_bio || "Your professional story will appear here.";
  const years = formValues.years_experience || "8+ Years";
  const uploadedPhotos = formValues.photos || [];

  return (
    <div className="relative w-full max-w-[440px] mx-auto">
      {title ? (
        <div className="mb-4">
          <div className="flex items-center gap-2 text-[#C85F2B] font-semibold text-sm select-none">
             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
             {title}
          </div>
          {subtitle && <div className="text-[12px] text-[#7A6E62] mt-0.5">{subtitle}</div>}
        </div>
      ) : (
        <>
          <div className="preview-annotation select-none">Live Preview</div>
          <svg
            className="absolute -top-10 left-[180px] text-[#C85F2B]"
            width="42"
            height="42"
            viewBox="0 0 42 42"
            fill="none"
            aria-hidden
          >
            <path
              d="M5 6 C 18 8, 28 18, 30 32"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d="M26 28 L30 32 L34 26"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
        </>
      )}

      <div
        className={`preview-card preview-card--${theme.layout} preview-card--theme-${theme.id} fade-up`}
        key={`${craftId || "default"}-${theme.id}-${theme.layout}`}
        data-testid="live-preview-card"
        style={themeStyle}
      >
        <div
          className="preview-hero"
          style={{
            backgroundImage: `url(${hero})`,
          }}
        >
          <div className="preview-hero-overlay" aria-hidden />
          <div
            className="preview-badge"
            data-testid="live-preview-badge"
          >
            {craft ? <craft.Icon size={14} color={craft.iconColor} /> : null}
            {displayName}
          </div>
          <div className="preview-avatar overflow-hidden">
            {formValues.profile_photo ? (
              <img
                src={formValues.profile_photo}
                alt={name ? `${name} profile` : "Profile"}
                className="preview-avatar-img"
              />
            ) : (
              <User size={38} strokeWidth={1.4} />
            )}
            <span className="edit-dot" aria-hidden>
              <Pencil size={13} />
            </span>
          </div>
        </div>

        <div className="preview-card-content pt-14 px-7 pb-7">
          <div
            className="preview-name font-serif-display text-3xl font-semibold text-[#1C1917]"
            data-testid="live-preview-name"
          >
            {name}
          </div>
          <div
            className="preview-business font-semibold text-[15px] mt-0.5 hm-portfolio-accent-text"
            data-testid="live-preview-craft"
          >
            {business}
          </div>
          <div className="preview-meta mt-2 flex items-center gap-1.5 text-sm text-[#7A6E62]">
            <MapPin size={14} strokeWidth={1.8} />
            <span>{city}</span>
          </div>
          <div className="preview-divider mt-6 h-px bg-[#EFE3D2]" />

          <div className="mt-5">
            <div className="preview-section-title font-semibold text-[#1C1917] mb-3">About</div>
            <div className="preview-about text-sm text-[#7A6E62] leading-relaxed">
              {about}
            </div>
          </div>

          <div className="mt-6">
            <div className="preview-section-title font-semibold text-[#1C1917] mb-3">Specialties</div>
            <div className="flex flex-wrap gap-2">
              {specialties.slice(0, 5).map((s, i) => (
                <div
                  key={s + i}
                  className="hm-portfolio-tag px-3 py-1 rounded-full text-[12px] font-medium"
                >
                  {s}
                </div>
              ))}
              {specialties.length > 5 && (
                <div className="bg-[#F3E7D6] text-[#A89A8C] px-3 py-1 rounded-full text-[12px] font-medium">
                  +{specialties.length - 5} more
                </div>
              )}
            </div>
          </div>

          <div className="mt-6">
            <div className="preview-section-title font-semibold text-[#1C1917] mb-3">{uploadedPhotos.length > 0 ? "Our Work" : "Projects"}</div>
            {uploadedPhotos.length > 0 ? (
               <div className="preview-gallery flex items-center gap-2 overflow-hidden relative">
                 {uploadedPhotos.slice(0, 4).map((p, i) => (
                    <img key={i} src={p} alt="portfolio" className="preview-gallery-item w-[84px] h-[84px] object-cover rounded-xl border border-[#EFE3D2]" />
                 ))}
                 {uploadedPhotos.length > 4 && (
                    <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-white via-white/80 to-transparent flex flex-col justify-center items-end pr-2">
                      <div className="w-8 h-8 bg-white border border-[#EFE3D2] rounded-full flex items-center justify-center shadow-sm text-[#1C1917]">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m9 18 6-6-6-6"/></svg>
                      </div>
                    </div>
                 )}
               </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="skeleton-tile">
                    <ImageIcon size={20} />
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <div className="preview-stat-band mt-6 flex justify-between border border-[#EFE3D2] rounded-xl p-4 bg-[#FFFDFB]">
             <div className="flex flex-col items-center">
                <div className="flex items-center text-[#B04F20] font-semibold gap-1"><ShieldCheckIcon /> {years.split(" ")[0]}</div>
                <div className="text-[10px] text-[#A89A8C] font-medium uppercase mt-0.5">Years Exp.</div>
             </div>
             <div className="flex flex-col items-center">
                <div className="flex items-center text-[#B04F20] font-semibold gap-1"><ImageIcon size={14} /> {uploadedPhotos.length}</div>
                <div className="text-[10px] text-[#A89A8C] font-medium uppercase mt-0.5">Work photos</div>
             </div>
          </div>
        </div>
      </div>
      
      {showTestimonial && (
        <div className="mt-4 bg-[#FFFDFB] border border-[#EFE3D2] rounded-2xl p-5">
          <div className="text-[13px] text-[#1C1917] leading-relaxed font-medium">
            Client reviews are not displayed until BuildGuru can verify that they came from a completed project.
          </div>
        </div>
      )}
      
      {!formValues.photos && !showTestimonial && (
        <div className="mt-6 bg-[#FDF0D8]/40 border border-[#EFE3D2] rounded-2xl p-5 flex items-start gap-4">
          <div
            className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
            style={{ background: "#FDF0D8" }}
          >
            <Lightbulb size={22} color="#D4A64A" strokeWidth={1.6} />
          </div>
          <div>
            <div className="font-semibold text-[#1C1917]">Why complete your details?</div>
            <div className="text-sm text-[#7A6E62] mt-1 leading-relaxed">
              Complete, accurate profiles help potential clients understand your experience and work.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ShieldCheckIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>;
}
