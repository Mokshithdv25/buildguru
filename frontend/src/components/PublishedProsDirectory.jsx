import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listPublishedPortfolios } from "../lib/api";
import { CRAFTS } from "../lib/craftData";

const OR = "#C85F2B";

const TRADE_FALLBACK_IMG = {
  architect: "pro_architect.png",
  contractor: "pro_contractor.png",
  carpenter: "pro_carpenter.png",
  painter: "pro_painter.png",
  electrician: "pro_electrician.png",
  plumber: "pro_plumber.png",
};

export function craftLabel(craftId) {
  return CRAFTS[craftId]?.name || craftId || "Professional";
}

export function proDisplayName(pro) {
  return pro.business_name || pro.full_name || "Professional";
}

export function proCardImage(pro) {
  if (pro.cover_photo && !String(pro.cover_photo).startsWith("data:")) return pro.cover_photo;
  if (Array.isArray(pro.photos) && pro.photos[0] && !String(pro.photos[0]).startsWith("data:")) return pro.photos[0];
  const file = TRADE_FALLBACK_IMG[pro.craft] || "pro_architect.png";
  return `${process.env.PUBLIC_URL || ""}/${file}`;
}

export function proInitials(pro) {
  const name = proDisplayName(pro);
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function usePublishedPros({ craft, city, limit = 24 } = {}) {
  const [pros, setPros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const rows = await listPublishedPortfolios({ craft, city, limit });
        if (!cancelled) setPros(rows);
      } catch (err) {
        if (!cancelled) setError(err?.message || "Could not load professionals.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [craft, city, limit]);

  return { pros, loading, error };
}

/**
 * Real professionals from published portfolios (Supabase).
 * Used on home, /browse, /project/browse, and nav dropdowns.
 */
export default function PublishedProsDirectory({
  variant = "cards",
  title = "Find pros near you",
  subtitle = "People who published their portfolio on BuildGuru.",
  limit = 12,
  craft = null,
  city = null,
  hubQuery = "",
  className = "",
}) {
  const { pros, loading, error } = usePublishedPros({ craft, city, limit });

  if (loading) {
    return (
      <div className={className}>
        {title ? <h2 style={{ fontSize: variant === "strip" ? 14 : 22, fontWeight: 600, color: "#1C1917", marginBottom: 8 }}>{title}</h2> : null}
        <p style={{ fontSize: 14, color: "#9A8F87" }}>Loading professionals…</p>
      </div>
    );
  }

  if (error) {
    return <p role="alert" className={className} style={{ fontSize: 14, color: "#B42318" }}>{error}</p>;
  }

  if (!pros.length) {
    return (
      <div className={className}>
        {title ? <h2 style={{ fontSize: variant === "strip" ? 14 : 22, fontWeight: 600, color: "#1C1917", marginBottom: 8 }}>{title}</h2> : null}
        {subtitle ? <p style={{ fontSize: 14, color: "#9A8F87", lineHeight: 1.55, marginBottom: 0 }}>{subtitle}</p> : null}
        <p style={{ fontSize: 14, color: "#9A8F87", lineHeight: 1.55, marginTop: 12 }}>
          No professionals match yet. Try another trade or check back later.
        </p>
      </div>
    );
  }

  const profileTo = (pro) => (pro.slug ? `/profile/${pro.slug}` : null);

  if (variant === "strip") {
    return (
      <div className={className}>
        {title ? (
          <p style={{ fontSize: 13, fontWeight: 600, color: "#f2eee9", marginBottom: 10, opacity: 0.95 }}>{title}</p>
        ) : null}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {pros.slice(0, 8).map((pro) => {
            const to = profileTo(pro);
            const inner = (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 12px 6px 6px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.12)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  color: "#fcfbfa",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                <span
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: OR,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 800,
                  }}
                >
                  {proInitials(pro)}
                </span>
                {proDisplayName(pro)}
              </span>
            );
            return to ? (
              <Link key={pro.id} to={to} style={{ textDecoration: "none" }}>
                {inner}
              </Link>
            ) : (
              <span key={pro.id}>{inner}</span>
            );
          })}
          <Link
            to={`/browse${hubQuery}`}
            style={{ fontSize: 12, fontWeight: 700, color: "#e3c7a3", textDecoration: "underline", marginLeft: 4 }}
          >
            View all →
          </Link>
        </div>
      </div>
    );
  }

  if (variant === "list") {
    return (
      <div className={className}>
        <p style={{ fontSize: 11, fontWeight: 700, color: OR, marginBottom: 8, letterSpacing: "0.06em" }}>LIVE ON BUILDGURU</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
          {pros.slice(0, limit).map((pro) => {
            const to = profileTo(pro);
            const row = (
              <span style={{ fontSize: 13, fontWeight: 600, color: "#1C1917" }}>{proDisplayName(pro)}</span>
            );
            return to ? (
              <Link
                key={pro.id}
                to={to}
                style={{
                  textDecoration: "none",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: "transparent",
                }}
                className="hover:bg-secondary/70"
              >
                <span>
                  {row}
                  <span style={{ display: "block", fontSize: 11, color: "#7A6E62", fontWeight: 500, marginTop: 2 }}>
                    {craftLabel(pro.craft)}
                    {pro.city ? ` · ${pro.city}` : ""}
                  </span>
                </span>
                <span style={{ fontSize: 11, color: OR }}>Profile →</span>
              </Link>
            ) : (
              <div key={pro.id} style={{ padding: "8px 10px" }}>
                {row}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div className={className}>
        {title ? <h3 style={{ fontSize: 16, fontWeight: 700, color: "#1C1917", margin: "0 0 6px" }}>{title}</h3> : null}
        {subtitle ? <p style={{ fontSize: 13, color: "#7A6E62", margin: "0 0 14px", lineHeight: 1.5 }}>{subtitle}</p> : null}
        <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {pros.map((pro) => {
            const to = profileTo(pro);
            return (
              <li key={pro.id} style={{ marginBottom: 10 }}>
                {to ? (
                  <Link to={to} style={{ textDecoration: "none", color: "inherit", display: "flex", gap: 12, alignItems: "center" }}>
                    <img
                      src={proCardImage(pro)}
                      alt=""
                      style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover", border: "1px solid #E5E5E5" }}
                    />
                    <span>
                      <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: "#1C1917" }}>{proDisplayName(pro)}</span>
                      <span style={{ fontSize: 12, color: "#7A6E62" }}>
                        {craftLabel(pro.craft)}
                        {pro.city ? ` · ${pro.city}` : ""}
                      </span>
                    </span>
                  </Link>
                ) : (
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{proDisplayName(pro)}</span>
                )}
              </li>
            );
          })}
        </ul>
        <Link to={`/browse${hubQuery}`} style={{ fontSize: 13, fontWeight: 700, color: OR }}>
          Browse all professionals →
        </Link>
      </div>
    );
  }

  return (
    <div className={className}>
      {title ? <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8, color: "#1C1917" }}>{title}</h2> : null}
      {subtitle ? <p style={{ fontSize: 14, color: "#7A6E62", marginBottom: 20, lineHeight: 1.5 }}>{subtitle}</p> : null}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 20 }}>
        {pros.map((pro) => {
          const to = profileTo(pro);
          const card = (
            <div style={{ border: "1px solid #E5E5E5", borderRadius: 8, overflow: "hidden", background: "#fff", height: "100%" }}>
              <div style={{ width: "100%", aspectRatio: "4/3", overflow: "hidden" }}>
                <img src={proCardImage(pro)} alt={proDisplayName(pro)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
              <div style={{ padding: "12px 14px" }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#1C1917" }}>{proDisplayName(pro)}</div>
                <div style={{ fontSize: 12, color: "#7A6E62", marginTop: 4 }}>
                  {craftLabel(pro.craft)}
                  {pro.city ? ` · ${pro.city}` : ""}
                </div>
              </div>
            </div>
          );
          return to ? (
            <Link key={pro.id} to={to} style={{ textDecoration: "none", color: "inherit" }}>
              {card}
            </Link>
          ) : (
            <div key={pro.id}>{card}</div>
          );
        })}
      </div>
    </div>
  );
}
