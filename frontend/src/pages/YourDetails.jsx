import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { StepRail, ProfileStrength, LivePreview } from "../components/SharedUI";
import { HmHeaderBrandLockup } from "../components/HmBrandLockup";
import HmUserMenu from "../components/HmUserMenu";
import { HM_HEADER_BAR_CLASS, HM_TAGLINE_PORTFOLIO } from "../lib/hmBrand";
import { findCraft } from "../lib/crafts";
import { updatePortfolio } from "../lib/api";
import { useHmSession } from "../hooks/useHmSession";
import RouteFallback from "../components/RouteFallback";
import {
  getPortfolioBase,
  getPortfolioMedia,
  migrateLegacyPortfolioMedia,
  setPortfolioBase,
  setPortfolioMedia,
} from "../lib/portfolioStorage";
import {
  ArrowLeft,
  ArrowRight,
  User,
  Briefcase,
  MapPin,
  Clock,
  Phone,
  Mail,
  ShieldCheck,
  Pencil,
  Check,
  Download,
  Zap,
  UploadCloud,
  ImageIcon,
  X,
} from "lucide-react";

const MAX_COVER_BYTES = 5 * 1024 * 1024;
const MAX_PROFILE_BYTES = 3 * 1024 * 1024;
const MAX_MEDIA_CHARS = 3_200_000;

function readImageDataUrl(file, maxBytes) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) {
      reject(new Error("Use JPG, PNG, or WebP."));
      return;
    }
    if (file.size > maxBytes) {
      reject(new Error(`Image must be under ${Math.round(maxBytes / (1024 * 1024))} MB.`));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

function optimizeImageDataUrl(file, { maxW = 1280, maxH = 720, quality = 0.72 } = {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(maxW / img.width, maxH / img.height, 1);
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Could not process image."));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("Could not process image."));
      img.src = String(reader.result || "");
    };
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}



export default function YourDetails() {
  const navigate = useNavigate();
  const hmSession = useHmSession();
  const hmProfile = hmSession?.profile;
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  
  const [portfolioId, setPortfolioId] = useState("");
  const [craftId, setCraftId] = useState("");
  const [craftDetails, setCraftDetails] = useState(null);

  const coverInputRef = useRef(null);
  const profileInputRef = useRef(null);

  const [form, setForm] = useState({
    full_name: "",
    business_name: "",
    city: "",
    address: "",
    years_experience: "",
    phone: "",
    email: "",
    license_number: "",
    short_bio: "",
    specialties: [],
    cover_photo: "",
    profile_photo: "",
  });

  useEffect(() => {
    const pid = localStorage.getItem("hm_portfolio_id");
    if (!pid) {
      navigate("/craft");
      return;
    }
    setPortfolioId(pid);

    migrateLegacyPortfolioMedia(pid);
    const saved = getPortfolioBase();
    const media = getPortfolioMedia(pid);
    const craft = saved.craft || localStorage.getItem("hm_craft") || "";
    setCraftId(craft);
    setCraftDetails(findCraft(craft));
    const profilePhone = hmProfile?.phone || "";
    const phoneDigits = profilePhone.replace(/\D/g, "").slice(-10);
    setForm({
      full_name: saved.full_name || hmProfile?.name || "",
      business_name: saved.business_name || "",
      city: saved.city || hmProfile?.city || "",
      address: saved.address || "",
      years_experience: saved.years_experience || "",
      phone: saved.phone || phoneDigits || "",
      email: saved.email || hmProfile?.email || "",
      license_number: saved.license_number || "",
      short_bio: saved.short_bio || "",
      specialties: saved.specialties || [],
      cover_photo: media.cover_photo || "",
      profile_photo: media.profile_photo || "",
    });
    setLoading(false);
  }, [navigate, hmProfile]);

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleCoverFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      await readImageDataUrl(file, MAX_COVER_BYTES);
      const url = await optimizeImageDataUrl(file, { maxW: 1600, maxH: 900, quality: 0.72 });
      if (url.length > MAX_MEDIA_CHARS / 2) {
        throw new Error("Cover image is still too large after optimization. Try a smaller image.");
      }
      setForm((prev) => ({ ...prev, cover_photo: url }));
      setError(null);
    } catch (err) {
      setError(err.message || "Upload failed");
    }
  };

  const handleProfileFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      await readImageDataUrl(file, MAX_PROFILE_BYTES);
      const url = await optimizeImageDataUrl(file, { maxW: 640, maxH: 640, quality: 0.76 });
      setForm((prev) => ({ ...prev, profile_photo: url }));
      setError(null);
    } catch (err) {
      setError(err.message || "Upload failed");
    }
  };

  const toggleSpecialty = (spec) => {
    setForm(prev => {
      const isSelected = prev.specialties.includes(spec);
      if (isSelected) {
        return { ...prev, specialties: prev.specialties.filter(s => s !== spec) };
      } else {
        return { ...prev, specialties: [...prev.specialties, spec] };
      }
    });
  };

  const handleSave = async (nextRoute) => {
    try {
      const saved = getPortfolioBase();
      const mediaPayload = {
        cover_photo: form.cover_photo || "",
        profile_photo: form.profile_photo || "",
        photos: getPortfolioMedia(portfolioId).photos || [],
      };
      const { syncPortfolioMediaForSave } = await import("../lib/portfolioMediaSync");
      const mediaForDb = await syncPortfolioMediaForSave(portfolioId, mediaPayload);
      setPortfolioMedia(portfolioId, mediaForDb);

      const { cover_photo, profile_photo, photos, ...nonMediaForm } = form;
      const { photos: _p, cover_photo: _c, profile_photo: _pp, ...savedNoMedia } = saved;
      const updated = { ...savedNoMedia, ...nonMediaForm, step: 2, profile_strength: 50 };
      
      setPortfolioBase(updated);
      await updatePortfolio(portfolioId, {
        ...nonMediaForm,
        ...mediaForDb,
        step: 2,
        profile_strength: 50,
      });
      setError(null);
      
      if (nextRoute) {
        navigate(nextRoute);
      } else {
        alert("Saved! You can come back later.");
      }
    } catch (err) {
      console.error(err);
      setError(err?.message || "Could not save your details. Check your connection and try again.");
    }
  };

  if (loading) return <RouteFallback label="Loading your details…" />;

  return (
    <div className="relative min-h-screen bg-[#FBF7F2] overflow-x-hidden">
      {/* Background accents matching the homepage */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_100%_0%,rgba(193,132,78,0.08),transparent_50%)]" aria-hidden />

      {/* Header */}
      <header className={`${HM_HEADER_BAR_CLASS} hm-desktop-only`} data-testid="hm-header">
        <div className="flex items-center gap-3 md:gap-4 min-w-0">
          <button
            type="button"
            onClick={() => navigate("/craft")}
            className="flex items-center gap-2 text-sm font-semibold text-[#1C1917] hover:text-[#C85F2B] transition-colors border border-[#EFE3D2] px-3 py-2 rounded-lg bg-white shrink-0"
          >
            <ArrowLeft size={16} /> Back
          </button>
          <HmHeaderBrandLockup tagline={HM_TAGLINE_PORTFOLIO} truncateTitle className="min-w-0 flex-1" />
        </div>

        <div className="hidden md:block">
          <StepRail currentStep={2} />
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <ProfileStrength value={35} subtext="Keep going!" />
          <HmUserMenu />
        </div>
      </header>

      {/* Mobile step rail */}
      <div className="md:hidden px-6 mb-2 flex justify-center">
        <StepRail currentStep={2} />
      </div>

      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-0 px-6 md:px-12 pb-32">
        {/* LEFT */}
        <section className="lg:pr-12 lg:border-r lg:border-[#EFE3D2] pt-8">
          <div className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.18em] uppercase px-3 py-1.5 rounded-full bg-[#FBE5D4] text-[#B04F20]">
            Step 2 of 5
          </div>

          <div className="flex items-center justify-between mt-6">
            <h1 className="font-serif-display text-4xl md:text-5xl leading-[1.05] text-[#1C1917] font-medium">
              Let's build your <span className="italic font-semibold text-[#C85F2B]">identity</span>
            </h1>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#B04F20] bg-[#FDF0D8] px-3 py-1.5 rounded-full">
              <ShieldCheck size={14} /> Name, Phone, Email &amp; License required
            </div>
          </div>

          <p className="mt-4 text-[15px] text-[#6A5E53] max-w-md leading-relaxed">
            Add a few details so clients know who you are and how to reach you.
          </p>

          <div className="mt-8 space-y-4">
            <div className="rounded-2xl border border-[#EFE3D2] bg-white p-5 space-y-5">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-[#1C1917]">
                  <ImageIcon size={16} className="text-[#C85F2B]" />
                  Cover photo
                </div>
                <p className="text-[12px] text-[#7A6E62] mt-1 mb-3">
                  Landscape image for the top banner of your portfolio (replaces the default craft image until you add one).
                </p>
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  id="hm-cover-photo"
                  onChange={handleCoverFile}
                />
                <div className="relative rounded-xl border-2 border-dashed border-[#EFE3D2] bg-[#FFFBF6] overflow-hidden aspect-[21/9] min-h-[120px] max-h-[180px] group">
                  {form.cover_photo ? (
                    <>
                      <img src={form.cover_photo} alt="" className="absolute inset-0 w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                      <button
                        type="button"
                        onClick={() => handleChange("cover_photo", "")}
                        className="absolute top-2 right-2 flex items-center gap-1 rounded-lg bg-white/95 px-2.5 py-1.5 text-xs font-semibold text-[#1C1917] border border-[#EFE3D2] shadow-sm hover:text-red-600"
                      >
                        <X size={14} /> Remove
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => coverInputRef.current?.click()}
                      className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[#7A6E62] hover:text-[#C85F2B] hover:bg-[#FDF0D8]/40 transition-colors"
                    >
                      <UploadCloud size={28} className="text-[#C85F2B]" />
                      <span className="text-sm font-semibold text-[#1C1917]">Upload cover</span>
                      <span className="text-[11px] font-medium uppercase tracking-wider text-[#A89A8C]">JPG, PNG or WebP · max 5 MB</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-4 pt-1 border-t border-[#EFE3D2]">
                <div className="shrink-0">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#1C1917] mb-1">
                    <User size={16} className="text-[#C85F2B]" />
                    Profile photo
                  </div>
                  <p className="text-[12px] text-[#7A6E62] max-w-[220px]">
                    A clear headshot — clients connect with faces.
                  </p>
                </div>
                <input
                  ref={profileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  id="hm-profile-photo"
                  onChange={handleProfileFile}
                />
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="relative w-[88px] h-[88px] rounded-full border-[5px] border-white shadow-md overflow-hidden bg-[#EFE3D2] shrink-0 flex items-center justify-center text-[#B8A898]">
                    {form.profile_photo ? (
                      <img src={form.profile_photo} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <User size={40} strokeWidth={1.4} />
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => profileInputRef.current?.click()}
                      className="inline-flex items-center gap-2 rounded-lg border border-[#EFE3D2] bg-white px-3 py-2 text-sm font-semibold text-[#1C1917] hover:border-[#C85F2B] transition-colors"
                    >
                      <UploadCloud size={16} className="text-[#C85F2B]" />
                      {form.profile_photo ? "Replace" : "Upload"}
                    </button>
                    {form.profile_photo ? (
                      <button
                        type="button"
                        onClick={() => handleChange("profile_photo", "")}
                        className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold text-[#7A6E62] hover:text-red-600"
                      >
                        <X size={16} /> Remove
                      </button>
                    ) : null}
                  </div>
                </div>
                <span className="text-[11px] font-medium text-[#A89A8C] sm:ml-auto shrink-0">Max 3 MB</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[13px] font-semibold text-[#1C1917] mb-1.5 block">Full Name <span className="text-[#C85F2B]">*</span></label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A89A8C]">
                    <User size={16} />
                  </div>
                  <input type="text" name="full_name" value={form.full_name} onChange={(e) => handleChange("full_name", e.target.value)} className="w-full bg-white border border-[#EFE3D2] rounded-xl pl-9 pr-4 py-3 text-sm focus:outline-none focus:border-[#C85F2B] transition-colors" placeholder="e.g. Ravi Kumar" />
                </div>
              </div>
              <div>
                <label className="text-[13px] font-semibold text-[#1C1917] mb-1.5 block">Business / Firm Name <span className="text-[#C85F2B]">*</span></label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A89A8C]">
                    <Briefcase size={16} />
                  </div>
                  <input type="text" name="business_name" value={form.business_name} onChange={(e) => handleChange("business_name", e.target.value)} className="w-full bg-white border border-[#EFE3D2] rounded-xl pl-9 pr-4 py-3 text-sm focus:outline-none focus:border-[#C85F2B] transition-colors" placeholder="e.g. Ravi Electrical Services" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[13px] font-semibold text-[#1C1917] mb-1.5 block">City <span className="text-[#C85F2B]">*</span></label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A89A8C]">
                    <MapPin size={16} />
                  </div>
                  <input type="text" name="city" value={form.city} onChange={(e) => handleChange("city", e.target.value)} className="w-full bg-white border border-[#EFE3D2] rounded-xl pl-9 pr-4 py-3 text-sm focus:outline-none focus:border-[#C85F2B] transition-colors" placeholder="e.g. Bangalore" />
                </div>
              </div>
              <div>
                <label className="text-[13px] font-semibold text-[#1C1917] mb-1.5 block">Years of Experience</label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A89A8C]">
                    <Clock size={16} />
                  </div>
                  <input
                    type="number"
                    name="years_experience"
                    min="0"
                    max="60"
                    value={form.years_experience}
                    onChange={(e) => handleChange("years_experience", e.target.value)}
                    className="w-full bg-white border border-[#EFE3D2] rounded-xl pl-9 pr-4 py-3 text-sm focus:outline-none focus:border-[#C85F2B] transition-colors"
                    placeholder="e.g. 8"
                  />
                </div>
              </div>
            </div>

            {/* Address */}
            <div>
              <label className="text-[13px] font-semibold text-[#1C1917] mb-1.5 block">Address / Area</label>
              <div className="relative">
                <div className="absolute left-3 top-3 text-[#A89A8C]">
                  <MapPin size={16} />
                </div>
                <textarea
                  name="address"
                  rows={2}
                  value={form.address}
                  onChange={(e) => handleChange("address", e.target.value)}
                  className="w-full bg-white border border-[#EFE3D2] rounded-xl pl-9 pr-4 py-3 text-sm focus:outline-none focus:border-[#C85F2B] transition-colors resize-none"
                  placeholder="e.g. 12th Cross, Indiranagar, Bangalore - 560038"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[13px] font-semibold text-[#1C1917] mb-1.5 block">Phone Number <span className="text-[#C85F2B]">*</span></label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A89A8C]">
                    <Phone size={16} />
                  </div>
                  <input type="tel" name="phone" value={form.phone} onChange={(e) => handleChange("phone", e.target.value)} className="w-full bg-white border border-[#EFE3D2] rounded-xl pl-9 pr-4 py-3 text-sm focus:outline-none focus:border-[#C85F2B] transition-colors" placeholder="+91 98765 43210" autoComplete="tel" />
                </div>
              </div>
              <div>
                <label className="text-[13px] font-semibold text-[#1C1917] mb-1.5 block">Email <span className="text-[#C85F2B]">*</span></label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A89A8C]">
                    <Mail size={16} />
                  </div>
                  <input
                    type="email"
                    name="email"
                    value={form.email}
                    onChange={(e) => handleChange("email", e.target.value)}
                    className="w-full bg-white border border-[#EFE3D2] rounded-xl pl-9 pr-4 py-3 text-sm focus:outline-none focus:border-[#C85F2B] transition-colors"
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                </div>
              </div>
            </div>
            <div className="-mt-1 rounded-xl border border-[#DCE9E2] bg-[#F3FAF6] px-4 py-3 text-[12px] leading-relaxed text-[#456052]">
              <strong>Private contact details:</strong> phone, email, street address, and licence information are never displayed on your public portfolio. Homeowner inquiries begin through BuildGuru.
            </div>

            <div>
              <label className="text-[13px] font-semibold text-[#1C1917] mb-1.5 block">License / COA Number <span className="text-[#C85F2B]">*</span></label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A89A8C]">
                  <ShieldCheck size={16} />
                </div>
                <input type="text" name="license_number" value={form.license_number} onChange={(e) => handleChange("license_number", e.target.value)} className="w-full bg-white border border-[#EFE3D2] rounded-xl pl-9 pr-4 py-3 text-sm focus:outline-none focus:border-[#C85F2B] transition-colors" placeholder="e.g. ELE/KA/2020/45678" />
              </div>
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-[#1C1917] mb-1">
                <Pencil size={14} className="text-[#C85F2B]" /> Short Bio
              </label>
              <div className="text-[12px] text-[#7A6E62] mb-2">Tell clients about your expertise in one or two lines.</div>
              <div className="relative">
                <textarea 
                  value={form.short_bio} 
                  onChange={e => {
                    if (e.target.value.length <= 150) handleChange("short_bio", e.target.value)
                  }}
                  rows={3}
                  className="w-full p-4 bg-white border border-[#EFE3D2] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#C85F2B]/20 focus:border-[#C85F2B] transition-all text-[#1C1917] placeholder-[#A89A8C] resize-none"
                  placeholder="Reliable electrical solutions for homes and businesses..."
                />
                <div className="absolute bottom-3 right-3 text-[11px] font-medium text-[#A89A8C]">
                  {form.short_bio.length}/150
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="flex items-center gap-2 text-sm font-semibold text-[#1C1917]">
                  <Zap size={14} className="text-[#C85F2B]" /> Your Specialties
                </label>
                <button className="text-xs font-semibold text-[#C85F2B] flex items-center gap-1 hover:text-[#B04F20] transition-colors">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                  Customize
                </button>
              </div>
              <div className="text-[12px] text-[#7A6E62] mb-3">Select the services you specialize in (choose at least 1)</div>
              
              <div className="flex flex-wrap gap-2.5">
                {craftDetails?.specialties?.map(spec => {
                  const selected = form.specialties.includes(spec);
                  return (
                    <button
                      key={spec}
                      onClick={() => toggleSpecialty(spec)}
                      className={`px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 border ${
                        selected 
                          ? "bg-[#C85F2B] text-white border-[#C85F2B] shadow-sm shadow-[#C85F2B]/20" 
                          : "bg-white text-[#6A5E53] border-[#EFE3D2] hover:border-[#C85F2B] hover:bg-[#FFFBF6]"
                      }`}
                    >
                      {spec}
                      {selected && <Check size={14} />}
                    </button>
                  );
                })}
              </div>
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <div className="mt-12 pt-6 border-t border-[#EFE3D2] flex flex-col sm:flex-row items-center gap-4 justify-between">
              <button
                onClick={() => handleSave()}
                className="flex items-center gap-2 text-sm font-semibold text-[#6A5E53] hover:text-[#1C1917] transition-colors px-4 py-2 rounded-lg hover:bg-[#F9F5F0]"
              >
                <Download size={16} /> Save & Exit
              </button>
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <div className="flex items-center gap-2 text-[12px] font-medium text-[#7A6E62]">
                  <ShieldCheck size={14} /> Your data is saved locally and private
                </div>
                <button
                  onClick={() => handleSave("/portfolio-theme")}
                  disabled={
                    submitting ||
                    !form.full_name ||
                    !form.phone ||
                    !form.email?.trim() ||
                    !form.license_number
                  }
                  className="btn-continue w-full sm:w-auto"
                >
                  {submitting ? "Saving..." : "Continue to look & feel"}
                  <ArrowRight size={18} className="arrow" />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* RIGHT */}
        <section className="lg:pl-12 lg:pt-8 pt-4">
          <LivePreview craftId={craftId} formValues={form} themeId={form.portfolio_theme} layoutId={form.portfolio_layout} />
        </section>
      </div>
    </div>
  );
}
