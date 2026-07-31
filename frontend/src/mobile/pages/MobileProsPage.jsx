import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { MapPin, Search, RotateCcw } from "lucide-react";
import MobileHeader from "../MobileHeader";
import { craftLabel, proCardImage, proDisplayName } from "../../components/PublishedProsDirectory";
import { listPublishedPortfolios } from "../../lib/api";

const CATEGORIES = [
  { label: "Architect", craft: "architect", query: "Architect" },
  { label: "Contractor", craft: "contractor", query: "Contractor" },
  { label: "Carpenter", craft: "carpenter", query: "Carpenter" },
  { label: "Painter", craft: "painter", query: "Painter" },
  { label: "Electrician", craft: "electrician", query: "Electrician" },
  { label: "Plumber", craft: "plumber", query: "Plumber" },
];

function filterPros(pros, service, city, craft) {
  let rows = pros;
  const c = String(city || "").trim().replace(/,\s*IN$/i, "").toLowerCase();
  const s = String(service || "").trim().toLowerCase();
  if (craft) rows = rows.filter((p) => p.craft === craft);
  if (c) rows = rows.filter((p) => String(p.city || "").toLowerCase().includes(c));
  if (s) {
    rows = rows.filter((p) => {
      const name = proDisplayName(p).toLowerCase();
      const cr = craftLabel(p.craft).toLowerCase();
      return name.includes(s) || cr.includes(s);
    });
  }
  return rows;
}

export default function MobileProsPage() {
  const [searchParams] = useSearchParams();
  const initialQ = searchParams.get("q") || "";
  const [service, setService] = useState(initialQ);
  const [city, setCity] = useState("");
  const [craft, setCraft] = useState(null);
  const [hasSearched, setHasSearched] = useState(true);
  const [loading, setLoading] = useState(false);
  const [all, setAll] = useState([]);
  const [directoryError, setDirectoryError] = useState("");

  const fetchPros = useCallback(async (craftFilter, cityFilter = city) => {
    setLoading(true);
    setDirectoryError("");
    try {
      const rows = await listPublishedPortfolios({ craft: craftFilter || null, city: cityFilter.trim() || null, limit: 100 });
      setAll(rows);
    } catch (err) {
      setDirectoryError(err?.message || "Could not load professionals. Try again.");
    } finally {
      setLoading(false);
    }
  }, [city]);

  useEffect(() => {
    setHasSearched(true);
    fetchPros(null, "");
    // Initial directory load intentionally runs once; searches are explicit after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const results = useMemo(() => filterPros(all, service, city, craft), [all, service, city, craft]);

  const onSearch = (e) => {
    e.preventDefault();
    setHasSearched(true);
    fetchPros(craft);
  };

  const pickCategory = (cat) => {
    setService(cat.query);
    setCraft(cat.craft);
    setHasSearched(true);
    fetchPros(cat.craft);
  };

  const resetSearch = () => {
    setService("");
    setCity("");
    setCraft(null);
    setHasSearched(true);
    fetchPros(null, "");
  };

  return (
    <>
      <MobileHeader title="Find professionals" subtitle="Real work · direct project handoff" />
      <section className="hm-m-pro-search-panel">
        <span className="hm-m-search-eyebrow">BuildGuru professional network</span>
        <h1>Find someone whose work already feels right.</h1>
        <p>Compare published portfolios, then start a structured project with the professional attached.</p>
        <form onSubmit={onSearch}>
          <label><span>Service</span><div><Search size={18} /><input aria-label="Service" placeholder="Architect, contractor, painter…" value={service} onChange={(e) => setService(e.target.value)} /></div></label>
          <label><span>Location</span><div><MapPin size={18} /><input aria-label="City" placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} /></div></label>
          <button type="submit">Search professionals</button>
        </form>
      </section>
      <p className="hm-m-section-title">Browse by trade</p>
      <div className="hm-m-pill-row" style={{ marginBottom: 12 }}>
        {CATEGORIES.map((cat) => (
          <button key={cat.craft} type="button" className={`hm-m-pill${craft === cat.craft ? " active" : ""}`} onClick={() => pickCategory(cat)}>
            {cat.label}
          </button>
        ))}
      </div>
      <div className="hm-m-results-header" aria-live="polite">
        <div>
          <strong>{loading ? "Finding portfolio matches…" : `${results.length} professional${results.length === 1 ? "" : "s"}`}</strong>
          <span>{craft || service || city ? "Matching your current search" : "Published work you can compare"}</span>
        </div>
        {craft || service || city ? <button type="button" onClick={resetSearch}><RotateCcw size={15} /> Reset</button> : null}
      </div>
      {directoryError ? (
        <p role="alert" style={{ padding: 16, color: "#B42318" }}>{directoryError}</p>
      ) : !hasSearched ? (
        <p style={{ padding: "8px 16px 24px", fontSize: 14, color: "#78716C", lineHeight: 1.5 }}>
          Search or tap a trade to see professionals who completed their portfolio on BuildGuru.
        </p>
      ) : loading ? (
        <div className="hm-m-pro-skeleton" role="status" aria-label="Loading professionals">
          {[0, 1, 2].map((item) => <div key={item}><span /><p><i /><i /></p></div>)}
        </div>
      ) : results.length === 0 ? (
        <p style={{ padding: 16, color: "#78716C" }}>No matches yet. Try another service or city.</p>
      ) : (
        results.map((pro) => (
          <Link key={pro.id || pro.slug} to={pro.slug ? `/profile/${pro.slug}` : "#"} className="hm-m-pro-card">
            <img src={proCardImage(pro)} alt="" />
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{proDisplayName(pro)}</div>
              <div style={{ fontSize: 13, color: "#78716C", marginTop: 4 }}>
                {craftLabel(pro.craft)}
                {pro.city ? ` · ${pro.city}` : ""}
              </div>
            </div>
          </Link>
        ))
      )}
    </>
  );
}
