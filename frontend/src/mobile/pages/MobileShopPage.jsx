import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, CheckCircle2, ClipboardList, Sparkles } from "lucide-react";
import MobileHeader from "../MobileHeader";
import { listProjectMaterials } from "../../lib/projectIntelligenceApi";
import { publicAsset } from "../../lib/publicAsset";

const CATEGORIES = [
  { id: "structural", label: "Structure", sub: "Cement, steel & blocks", img: "shop_steel.png" },
  { id: "finishes", label: "Finishes", sub: "Tiles, paint & flooring", img: "shop_flooring.png" },
  { id: "kitchen", label: "Kitchen & bath", sub: "Fixtures, counters & fittings", img: "theme_kitchen.png" },
  { id: "exterior", label: "Exterior", sub: "Cladding, roofing & paint", img: "ext_stone_cladding_1777777555080.png" },
];

export default function MobileShopPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("projectId") || "";
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(Boolean(projectId));

  useEffect(() => {
    let active = true;
    if (!projectId) {
      setMaterials([]);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    listProjectMaterials(projectId)
      .then((rows) => { if (active) setMaterials(rows || []); })
      .catch(() => { if (active) setMaterials([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectId]);

  const approved = useMemo(() => materials.filter((item) => ["approved", "ordered", "received"].includes(item.status)), [materials]);
  const aiSuggested = useMemo(() => materials.filter((item) => /brief|v0|ai/i.test(item.source_artifact || "") && item.status === "suggested"), [materials]);
  const professionalSuggested = useMemo(() => materials.filter((item) => /professional|contractor|architect|designer/i.test(item.source_artifact || "")), [materials]);
  return (
    <>
      <MobileHeader title="Materials" subtitle={projectId ? "Your project checklist" : "Plan before you purchase"} backTo={-1} />
      {!projectId ? (
        <section className="hm-m-materials-hero">
          <span><Sparkles size={14} /> Project-aware materials</span>
          <h1>Choose with context, not guesswork.</h1>
          <p>Browse useful categories now, or open a project to turn its brief and estimate into an editable checklist.</p>
          <button type="button" onClick={() => navigate("/project")}>
            Open my project <ArrowRight size={17} />
          </button>
        </section>
      ) : null}
      {projectId ? (
        <section className="hm-m-card hm-m-materials-checklist">
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
            <div><strong style={{ fontSize: 16 }}><ClipboardList size={17} /> Project checklist</strong><span style={{ display: "block", marginTop: 3, color: "#78716C", fontSize: 12 }}>{approved.length} approved · {materials.length} total</span></div>
            <button type="button" className="hm-m-card-link" onClick={() => navigate(`/project?projectId=${encodeURIComponent(projectId)}&tab=Materials`)}>Edit plan</button>
          </div>
          {loading ? <p style={{ color: "#78716C", fontSize: 13 }}>Loading project materials…</p> : (
            <div style={{ display: "grid", gap: 9, marginTop: 12 }}>
              {[
                ["AI suggested", aiSuggested, "From your brief and estimate"],
                ["Professional suggested", professionalSuggested, "Captured from your project professional"],
                ["Approved list", approved, "Confirmed before pricing or ordering"],
              ].map(([title, rows, copy]) => <div key={title} style={{ border: "1px solid #EEE6DE", borderRadius: 10, padding: 10, background: "#FFFCF9" }}><strong style={{ display: "block", fontSize: 13 }}>{title} · {rows.length}</strong><span style={{ display: "block", marginTop: 3, color: "#78716C", fontSize: 10 }}>{copy}</span>{rows.slice(0, 3).map((item) => <span key={item.id} style={{ display: "block", marginTop: 7, color: "#4B423A", fontSize: 11 }}>{item.item_name} · {item.quantity} {item.unit}{item.preferred_brand ? ` · ${item.preferred_brand}` : ""}</span>)}</div>)}
            </div>
          )}
        </section>
      ) : null}
      <div className="hm-m-section-heading hm-m-section-heading--compact">
        <div><span>Explore</span><h2>Materials by category</h2></div>
      </div>
      <div className="hm-m-material-category-grid">
        {CATEGORIES.map((c) => (
          <button key={c.id} type="button" onClick={() => projectId ? navigate(`/project?projectId=${encodeURIComponent(projectId)}&tab=Materials`) : navigate("/project")}>
            <img src={publicAsset(c.img)} alt="" loading="lazy" />
            <span><strong>{c.label}</strong><small>{c.sub}</small></span>
          </button>
        ))}
      </div>
      <p className="hm-m-materials-note"><CheckCircle2 size={16} /> Final brands, quantities, prices and orders stay subject to owner approval and professional/vendor confirmation.</p>
    </>
  );
}
