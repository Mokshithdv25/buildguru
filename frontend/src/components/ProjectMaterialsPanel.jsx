import React, { useEffect, useMemo, useState } from "react";
import { Check, HardHat, PackagePlus, Save, ShoppingCart, Trash2 } from "lucide-react";
import { MATERIAL_BRANDS } from "../lib/projectIntelligenceApi";
import "./ProjectMaterialsPanel.css";

const STATUS_OPTIONS = [
  ["suggested", "Suggested"],
  ["approved", "Approved"],
  ["ordered", "Ordered"],
  ["received", "Received"],
];
const SOURCE_OPTIONS = [
  ["v0_estimate", "Saved estimate"],
  ["professional_recommendation", "Professional revised"],
  ["manual", "Added by you"],
];

export default function ProjectMaterialsPanel({ projectId, materials, configured, onSave, onRemove, onNavigateShop }) {
  const [rows, setRows] = useState(materials || []);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  useEffect(() => setRows(materials || []), [materials]);

  const approved = useMemo(() => rows.filter((row) => ["approved", "ordered", "received"].includes(row.status)).length, [rows]);
  const update = (id, patch) => setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));

  const save = async (item) => {
    if (!configured) {
      setError("The editable material plan is not connected in the production workspace yet.");
      return;
    }
    setSavingId(item.id);
    setError("");
    try {
      const saved = await onSave?.(item);
      if (saved) setRows((current) => current.map((row) => row.id === item.id ? saved : row));
    } catch (err) {
      setError(err?.message || "Could not save this material item.");
    } finally {
      setSavingId("");
    }
  };

  const remove = async (item) => {
    if (String(item.id).startsWith("draft-") || !configured) {
      setRows((current) => current.filter((row) => row.id !== item.id));
      return;
    }
    setSavingId(item.id);
    try {
      await onRemove?.(item.id);
      setRows((current) => current.filter((row) => row.id !== item.id));
    } catch (err) {
      setError(err?.message || "Could not remove this material item.");
    } finally {
      setSavingId("");
    }
  };

  const addCustom = (source = "manual") => {
    const id = `draft-custom-${Date.now()}`;
    setRows((current) => [...current, {
      id,
      project_id: projectId,
      category: "Other",
      item_name: "New material item",
      quantity: 1,
      unit: "unit",
      preferred_brand: "",
      status: "suggested",
      notes: "",
      source_artifact: source,
      seed_key: null,
      sort_order: current.length,
    }]);
  };

  return (
    <section className="hm-material-plan">
      <header className="hm-material-plan__head"><div><p>Estimate-linked takeoff</p><h1>Editable material & shopping checklist</h1><span>Synced from the saved estimate. When a professional revises the estimate, the generated rows are replaced; your approvals and manual additions remain separate.</span></div><div className="hm-material-plan__summary"><strong>{rows.length}</strong><span>items</span><strong>{approved}</strong><span>approved</span></div></header>
      <div className="hm-material-plan__notice"><Check size={16} /> Planning quantities are indicative. Structural drawings, MEP schedules, measured site quantities, and contractor BOQs take precedence.</div>
      {error ? <p className="hm-material-plan__error" role="alert">{error}</p> : null}
      <div className="hm-material-plan__table-wrap"><table><thead><tr><th>Material</th><th>Quantity</th><th>Preferred brand</th><th>Suggested by</th><th>Status</th><th aria-label="Actions" /></tr></thead><tbody>{rows.map((item) => { const brands = MATERIAL_BRANDS[item.category] || MATERIAL_BRANDS.Other; return <tr key={item.id}><td><select value={item.category} onChange={(event) => update(item.id, { category: event.target.value, preferred_brand: "" })} aria-label={`Category for ${item.item_name}`}>{Object.keys(MATERIAL_BRANDS).map((category) => <option key={category}>{category}</option>)}</select><input value={item.item_name} onChange={(event) => update(item.id, { item_name: event.target.value })} aria-label="Material name" /><small>{item.notes || "Editable planning item"}</small></td><td><div className="hm-material-plan__quantity"><input type="number" min="0" step="any" value={item.quantity} onChange={(event) => update(item.id, { quantity: event.target.value })} aria-label={`Quantity for ${item.item_name}`} /><input value={item.unit} onChange={(event) => update(item.id, { unit: event.target.value })} aria-label={`Unit for ${item.item_name}`} /></div></td><td><select value={item.preferred_brand || ""} onChange={(event) => update(item.id, { preferred_brand: event.target.value })}><option value="">Select later</option>{brands.map((brand) => <option key={brand}>{brand}</option>)}</select></td><td><select value={item.source_artifact || "manual"} onChange={(event) => update(item.id, { source_artifact: event.target.value })}>{SOURCE_OPTIONS.map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></td><td><select value={item.status} onChange={(event) => update(item.id, { status: event.target.value })}>{STATUS_OPTIONS.map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></td><td><div className="hm-material-plan__actions"><button type="button" onClick={() => save(item)} disabled={savingId === item.id} title="Save"><Save size={15} /></button><button type="button" onClick={() => remove(item)} disabled={savingId === item.id} title="Remove"><Trash2 size={15} /></button></div></td></tr>; })}</tbody></table></div>
      {!rows.length ? <div className="hm-material-plan__empty">No material items yet. Add one or return after saving a project brief.</div> : null}
      <footer className="hm-material-plan__footer"><div className="hm-material-plan__add-actions"><button type="button" className="hm-material-plan__secondary" onClick={() => addCustom("manual")}><PackagePlus size={16} /> Add material</button><button type="button" className="hm-material-plan__secondary" onClick={() => addCustom("professional_recommendation")}><HardHat size={16} /> Add professional suggestion</button></div><button type="button" className="hm-material-plan__primary" onClick={onNavigateShop}><ShoppingCart size={16} /> Open project carts</button></footer>
    </section>
  );
}
