import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { MapPin, Calendar, Building2, X } from "lucide-react";
import { findCraft } from "../lib/crafts";
import { getPublicProfile } from "../lib/api";
import { formatLocationLabel } from "../lib/formatLocation";
import { getPortfolioThemeFromRecord, portfolioThemeCssVars } from "../lib/portfolioThemes";
import { blockPortfolio, reportPortfolio } from "../lib/portfolioSafetyApi";
import RouteFallback from "../components/RouteFallback";
import "./PortfolioPage.css";

const FALLBACK_HERO = `${process.env.PUBLIC_URL || ""}/landing-hero.png`;

export default function PortfolioPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(null);

  const handleBlock = async () => {
    if (!data?.id || !window.confirm("Hide this professional from your directory and profile results?")) return;
    await blockPortfolio(data.id);
    navigate("/browse", { replace: true });
  };

  const handleReport = async () => {
    if (!data?.id) return;
    const reason = window.prompt(
      "Report reason: spam, harassment, sexual_content, hate_or_violence, impersonation, or other",
      "spam",
    );
    if (!reason) return;
    const details = window.prompt("Optional details for the moderation team", "") || "";
    try {
      await reportPortfolio(data.id, reason.trim().toLowerCase(), details);
      window.alert("Report received. Our moderation team may review it for safety.");
      navigate("/browse", { replace: true });
    } catch (error) {
      if (/sign in/i.test(error?.message || "")) {
        navigate(`/sign-in?mode=signin&redirect=${encodeURIComponent(`/profile/${slug}`)}`);
      } else {
        window.alert(error?.message || "Could not submit this report.");
      }
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const remote = await getPublicProfile(slug);
        setData(remote);
      } catch {
        setNotFound(true);
      }
    })();
  }, [slug]);

  if (notFound) return (
    <div className="hm-landing-page" style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans',sans-serif", background: "#faf9f7" }}>
      <div style={{ fontSize: 52, marginBottom: 12 }}>🏠</div>
      <h1 style={{ fontWeight: 800, fontSize: 22, marginBottom: 8 }}>Profile not found</h1>
      <p style={{ color: "#888", marginBottom: 8, maxWidth: 360, textAlign: "center", lineHeight: 1.5 }}>
        No published profile matches <strong>{slug}</strong>. Check the link or browse live pros.
      </p>
      <p style={{ color: "#aaa", fontSize: 13, marginBottom: 24 }}>Draft portfolios are only visible to their owner until Go Live.</p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
        <Link to="/browse" style={{ background: "#fff", color: "#E05A20", fontWeight: 700, padding: "12px 24px", borderRadius: 10, border: "2px solid #E05A20", fontSize: 15, textDecoration: "none" }}>
          Browse pros
        </Link>
        <Link to="/craft" style={{ background: "#E05A20", color: "#fff", fontWeight: 700, padding: "12px 32px", borderRadius: 10, fontSize: 15, textDecoration: "none" }}>
          Create your portfolio
        </Link>
      </div>
    </div>
  );

  if (!data) {
    return <RouteFallback label="Loading this portfolio…" />;
  }

  const craft = findCraft(data.craft);
  const craftLabel = craft?.name || data.craft || "Professional";
  const photos = Array.isArray(data.photos) ? data.photos.filter(Boolean) : [];
  const hero = data.cover_photo || photos[0] || craft?.hero || FALLBACK_HERO;
  const name = data.full_name || "Your Name";
  const city = formatLocationLabel(data.city) || data.city || "";
  const years = String(data.years_experience || "").replace(/\D/g, "");
  const business = data.business_name || "";
  const bio = data.short_bio || "";
  const specs = data.specialties?.length > 0 ? data.specialties : (craft?.specialties?.slice(0, 5) || []);

  const theme = getPortfolioThemeFromRecord(data);
  const themeVars = portfolioThemeCssVars(theme);
  const isEditorial = theme.layout === "editorial";

  const heroMeta = [
    city && { Icon: MapPin, text: city },
    years && { Icon: Calendar, text: `${years}+ years` },
    business && { Icon: Building2, text: business },
  ].filter(Boolean);

  const stats = [
    years && { value: `${years}+`, label: "Years of craft" },
    photos.length > 0 && { value: String(photos.length), label: "Projects shown" },
    specs.length > 0 && { value: String(specs.length), label: "Specialties" },
    city && { value: city.split(",")[0], label: "Based in" },
  ].filter(Boolean);

  const gallery = photos.slice(0, 10);
  const startWithPro = () => navigate(`/build?source=portfolio&pro=${encodeURIComponent(data.slug || data.id)}`);

  return (
    <div className={`hm-pf hm-pf--${theme.id} hm-pf--layout-${theme.layout}`} style={themeVars}>
      {/* ══ Hero ══ */}
      <div className={`hm-pf-hero hm-pf-hero--${theme.layout}`}>
        <div className="hm-pf-hero-bg" style={{ backgroundImage: `url(${hero})` }} />
        <div className="hm-pf-hero-overlay" />

        <button type="button" className="hm-pf-cta" onClick={startWithPro}>
          Work With Me
        </button>

        <div className="hm-pf-hero-content">
          <div className="hm-pf-hero-row">
            <div className="hm-pf-avatar">
              {data.profile_photo ? (
                <img src={data.profile_photo} alt={name} />
              ) : (
                <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1.4">
                  <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                </svg>
              )}
            </div>
            <div style={{ minWidth: 220 }}>
              <div className="hm-pf-craft">{craftLabel}</div>
              <h1 className={`hm-pf-name${isEditorial ? " hm-pf-serif" : ""}`}>{name}</h1>
              {heroMeta.length > 0 && (
                <div className="hm-pf-hero-meta">
                  {heroMeta.map((m, i) => {
                    const Icon = m.Icon;
                    return (
                      <span key={i}><Icon size={15} /> {m.text}</span>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ══ Stats band ══ */}
      {stats.length >= 2 && (
        <div className="hm-pf-stats">
          {stats.map((s) => (
            <div key={s.label} className="hm-pf-stat">
              <b>{s.value}</b>
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* ══ About ══ */}
      {(bio || specs.length > 0) && (
        <section className="hm-pf-section">
          <div className="hm-pf-kicker">About</div>
          <h2 className={`hm-pf-h2${isEditorial ? " hm-pf-serif" : ""}`}>
            {business ? business : `Meet ${name.split(" ")[0]}`}
          </h2>
          {bio && <p className="hm-pf-bio">{bio}</p>}
          {specs.length > 0 && (
            <div className="hm-pf-chips">
              {specs.slice(0, 8).map((s) => (
                <span key={s} className="hm-pf-chip">{s}</span>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ══ Work ══ */}
      <section className="hm-pf-section">
        <div className="hm-pf-kicker">Portfolio</div>
        <h2 className={`hm-pf-h2${isEditorial ? " hm-pf-serif" : ""}`}>Selected work</h2>
        {gallery.length > 0 ? (
          <div className={`hm-pf-gallery hm-pf-gallery--${theme.layout}`}>
            {gallery.map((src, i) => (
              <button type="button" key={`${src}-${i}`} className={`hm-pf-shot${i === 0 && gallery.length >= 3 && theme.layout !== "compact" ? " hm-pf-shot--feature" : ""}`} onClick={() => setSelectedPhoto({ src, index: i })} aria-label={`Open ${name} project ${i + 1}`}>
                <img src={src} alt={`${name} project ${i + 1}`} loading={i > 1 ? "lazy" : undefined} />
              </button>
            ))}
          </div>
        ) : (
          <div className="hm-pf-empty-work">
            Work photos coming soon.
          </div>
        )}
      </section>

      {selectedPhoto ? (
        <div className="hm-pf-lightbox" role="dialog" aria-modal="true" aria-label={`Project image ${selectedPhoto.index + 1}`} onClick={() => setSelectedPhoto(null)}>
          <button type="button" className="hm-pf-lightbox-close" onClick={() => setSelectedPhoto(null)} aria-label="Close image"><X size={22} /></button>
          <img src={selectedPhoto.src} alt={`${name} project ${selectedPhoto.index + 1}`} onClick={(event) => event.stopPropagation()} />
        </div>
      ) : null}

      {/* ══ Footer ══ */}
      <footer className="hm-pf-footer">
        <span>
          {name} · {craftLabel}{city ? ` · ${city}` : ""}
        </span>
        <details className="hm-pf-safety"><summary>Safety</summary><button type="button" onClick={handleReport}>Report profile</button><button type="button" onClick={handleBlock}>Block profile</button></details>
        <Link className="hm-pf-create-cta" to="/craft">Want a portfolio like this? Create yours</Link>
      </footer>
    </div>
  );
}
