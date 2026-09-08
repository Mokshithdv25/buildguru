import React, { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";
import { formatInrShort } from "../../lib/projectFlowApi";
import { createWorkPackage, updateWorkPackage } from "../../lib/workPackagesApi";
import {
  PRICING_BASIS,
  WORK_PACKAGE_TYPES,
  WORK_PACKAGE_TYPE_ORDER,
  newScopeItemId,
  templateScopeItems,
  workPackageType,
} from "../../lib/workPackageCatalog";
import { draftWorkPackageScope } from "../../lib/aiApi";
import { craftLabel } from "../PublishedProsDirectory";
import "./workPackages.css";

function toDateInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function defaultDueDate() {
  const date = new Date();
  date.setDate(date.getDate() + 10);
  return toDateInput(date);
}

/** Build editable form state from an existing package row or a suggestion. */
function initialForm(seed) {
  const type = seed?.package_type || seed?.type || "construction";
  const meta = workPackageType(type);
  const scope = seed?.scope_items?.length ? seed.scope_items : seed?.scopeItems?.length ? seed.scopeItems : templateScopeItems(type);
  return {
    packageType: type,
    title: seed?.title || `${meta.label}`,
    summary: seed?.summary || "",
    scopeItems: scope.map((row) => ({ id: row.id || newScopeItemId(), label: row.label || "", quantity: row.quantity ?? "", unit: row.unit || "", notes: row.notes || "" })),
    inclusions: seed?.inclusions || "",
    exclusions: seed?.exclusions || "",
    pricingBasis: seed?.pricing_basis || seed?.pricingBasis || meta.pricingBasis,
    eligibleCrafts: seed?.eligible_crafts?.length ? seed.eligible_crafts : meta.crafts,
    siteVisitRequired: seed?.site_visit_required ?? ["construction", "interiors", "plumbing", "electrical", "painting", "carpentry"].includes(type),
    budgetHintInr: seed?.budget_hint_inr ?? seed?.budgetHintInr ?? "",
    showBudgetToPros: seed?.show_budget_to_pros ?? false,
    bidsDueAt: seed?.bids_due_at ? toDateInput(seed.bids_due_at) : defaultDueDate(),
    targetStart: seed?.target_start || "",
    targetCompletion: seed?.target_completion || "",
    maxBids: seed?.max_bids ?? 8,
    attachments: seed?.attachments_json || [],
  };
}

export default function WorkPackageComposer({
  open,
  projectId,
  flowType,
  brief = {},
  documents = [],
  seed = null,
  existing = null,
  onClose,
  onSaved,
}) {
  const [form, setForm] = useState(() => initialForm(existing || seed));
  const [saving, setSaving] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (open) {
      setForm(initialForm(existing || seed));
      setError("");
      setNotice("");
    }
  }, [open, existing, seed]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const meta = useMemo(() => workPackageType(form.packageType), [form.packageType]);
  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const chooseType = (type) => {
    const next = workPackageType(type);
    setForm((current) => {
      const previousMeta = workPackageType(current.packageType);
      const titleUntouched = !current.title || current.title === previousMeta.label || current.title.startsWith(`${previousMeta.label} —`);
      const scopeUntouched = JSON.stringify(current.scopeItems.map((r) => r.label)) === JSON.stringify(previousMeta.scopeTemplate.map((r) => r.label));
      return {
        ...current,
        packageType: type,
        title: titleUntouched ? next.label : current.title,
        scopeItems: scopeUntouched || !current.scopeItems.length ? templateScopeItems(type) : current.scopeItems,
        pricingBasis: next.pricingBasis,
        eligibleCrafts: next.crafts,
      };
    });
  };

  const updateScope = (id, field, value) => set("scopeItems", form.scopeItems.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  const removeScope = (id) => set("scopeItems", form.scopeItems.filter((row) => row.id !== id));
  const addScope = () => set("scopeItems", [...form.scopeItems, { id: newScopeItemId(), label: "", quantity: "", unit: "", notes: "" }]);
  const useTemplate = () => { set("scopeItems", templateScopeItems(form.packageType)); setNotice("Loaded the BuildGuru checklist for this trade. Edit quantities to match your project."); };

  const toggleCraft = (craft) => {
    const has = form.eligibleCrafts.includes(craft);
    set("eligibleCrafts", has ? form.eligibleCrafts.filter((c) => c !== craft) : [...form.eligibleCrafts, craft]);
  };

  const toggleDoc = (doc) => {
    const id = String(doc.id);
    const has = form.attachments.some((a) => String(a.document_id) === id);
    set("attachments", has
      ? form.attachments.filter((a) => String(a.document_id) !== id)
      : [...form.attachments, { document_id: id, name: doc.file_name || doc.name || "Document", category: doc.category || "other" }]);
  };

  const draftWithAi = async () => {
    setDrafting(true);
    setError("");
    setNotice("");
    try {
      const result = await draftWorkPackageScope({
        packageType: form.packageType,
        flow: flowType === "remodel" ? "remodel" : "new_home",
        brief,
        title: form.title,
      });
      setForm((current) => ({
        ...current,
        title: result.title || current.title,
        summary: result.summary || current.summary,
        scopeItems: (result.scope_items || []).length
          ? result.scope_items.map((row) => ({ id: newScopeItemId(), label: row.label || "", quantity: row.quantity ?? "", unit: row.unit || "", notes: row.notes || "" }))
          : current.scopeItems,
        inclusions: result.inclusions || current.inclusions,
        exclusions: result.exclusions || current.exclusions,
        siteVisitRequired: typeof result.site_visit_required === "boolean" ? result.site_visit_required : current.siteVisitRequired,
      }));
      setNotice(result.provider_note ? `Scope drafted from your brief. ${result.provider_note}` : "Scope drafted from your brief. Review every line before publishing.");
    } catch (err) {
      setError(err?.message || "AI drafting is unavailable right now. Use the checklist instead.");
    } finally {
      setDrafting(false);
    }
  };

  const save = async (publish) => {
    if (saving) return;
    setSaving(publish ? "publish" : "draft");
    setError("");
    try {
      const payload = {
        ...form,
        bidsDueAt: form.bidsDueAt ? `${form.bidsDueAt}T23:59:00` : null,
      };
      const saved = existing?.id
        ? await updateWorkPackage({ packageId: existing.id, ...payload })
        : await createWorkPackage({ projectId, ...payload });
      await onSaved?.(saved, { publish });
    } catch (err) {
      setError(err?.message || "Could not save this work package.");
    } finally {
      setSaving("");
    }
  };

  if (!open) return null;

  const craftOptions = [...new Set([...(meta.crafts || []), ...form.eligibleCrafts, "architect", "designer", "engineer", "contractor", "plumber", "electrician", "painter", "carpenter"])];

  return (
    <div className="hm-wp hm-wp__overlay" role="dialog" aria-modal="true" aria-labelledby="hm-wp-composer-title" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="hm-wp__modal">
        <div className="hm-wp__modal-head">
          <div>
            <h2 id="hm-wp-composer-title">{existing?.id ? "Edit work package" : "New work package"}</h2>
            <p>Describe one scope of work so professionals in that trade can price the same thing — that is what makes bids comparable.</p>
          </div>
          <button type="button" className="hm-wp__close" aria-label="Close" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="hm-wp__modal-body">
          <section className="hm-wp__step">
            <div className="hm-wp__step-title"><span>1</span><h3>What kind of work?</h3></div>
            <div className="hm-wp__types">
              {WORK_PACKAGE_TYPE_ORDER.map((id) => {
                const t = WORK_PACKAGE_TYPES[id];
                const Icon = t.Icon;
                return (
                  <button type="button" key={id} className={`hm-wp__type ${form.packageType === id ? "is-selected" : ""}`} onClick={() => chooseType(id)} aria-pressed={form.packageType === id}>
                    <span className="hm-wp__type-icon" style={{ background: t.tint, color: t.color }}><Icon size={16} /></span>
                    <span><strong>{t.label}</strong><small>{t.description}</small></span>
                  </button>
                );
              })}
            </div>
            <div className="hm-wp__field-row">
              <div className="hm-wp__field" style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="hm-wp-title">Package title</label>
                <input id="hm-wp-title" type="text" value={form.title} maxLength={140} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Electrical — 3BHK new build, Whitefield" />
              </div>
            </div>
            <div className="hm-wp__field">
              <span className="hm-wp__label">Who can bid</span>
              <div className="hm-wp__chips" style={{ marginTop: 4 }}>
                {craftOptions.map((craft) => (
                  <button type="button" key={craft} className={`hm-wp__filter ${form.eligibleCrafts.includes(craft) ? "is-active" : ""}`} onClick={() => toggleCraft(craft)} aria-pressed={form.eligibleCrafts.includes(craft)}>
                    {craftLabel(craft)}
                  </button>
                ))}
              </div>
              <span className="hm-wp__hint">Only published professionals in these trades see this package. You can also invite specific people after publishing.</span>
            </div>
          </section>

          <section className="hm-wp__step">
            <div className="hm-wp__step-title"><span>2</span><h3>Scope of work</h3></div>
            <div className="hm-wp__field">
              <label htmlFor="hm-wp-summary">Summary for bidders</label>
              <textarea id="hm-wp-summary" value={form.summary} maxLength={4000} onChange={(e) => set("summary", e.target.value)} placeholder={`Describe the ${meta.short.toLowerCase()} work in a few sentences: what exists today, what you want done, quality level, and anything unusual about the site.`} />
            </div>
            <div className="hm-wp__scope-editor">
              <div className="hm-wp__scope-row hm-wp__scope-row-head"><span>Scope line</span><span>Qty</span><span>Unit</span><span>Notes / spec</span><span /></div>
              {form.scopeItems.map((row) => (
                <div className="hm-wp__scope-row" key={row.id}>
                  <input type="text" value={row.label} placeholder="Work item" aria-label="Scope line" onChange={(e) => updateScope(row.id, "label", e.target.value)} />
                  <input type="text" value={row.quantity} placeholder="Qty" aria-label="Quantity" inputMode="decimal" onChange={(e) => updateScope(row.id, "quantity", e.target.value)} />
                  <input type="text" value={row.unit} placeholder="sq ft" aria-label="Unit" onChange={(e) => updateScope(row.id, "unit", e.target.value)} />
                  <input type="text" value={row.notes} placeholder="Brand, grade, count…" aria-label="Notes" onChange={(e) => updateScope(row.id, "notes", e.target.value)} />
                  <button type="button" className="hm-wp__icon-btn" aria-label="Remove line" onClick={() => removeScope(row.id)}><Trash2 size={14} /></button>
                </div>
              ))}
              <div className="hm-wp__scope-tools">
                <button type="button" className="hm-wp__btn-secondary is-small" onClick={addScope}><Plus size={13} /> Add line</button>
                <button type="button" className="hm-wp__btn-secondary is-small" onClick={useTemplate}>Use {meta.short.toLowerCase()} checklist</button>
                <button type="button" className="hm-wp__btn-secondary is-small" onClick={draftWithAi} disabled={drafting}>
                  {drafting ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} {drafting ? "Drafting…" : "Draft from my brief with AI"}
                </button>
              </div>
            </div>
            <div className="hm-wp__field-row">
              <div className="hm-wp__field">
                <label htmlFor="hm-wp-incl">Included (what the price must cover)</label>
                <textarea id="hm-wp-incl" value={form.inclusions} maxLength={3000} onChange={(e) => set("inclusions", e.target.value)} placeholder={meta.inclusionsHint || "Materials, testing, cleanup…"} />
              </div>
              <div className="hm-wp__field">
                <label htmlFor="hm-wp-excl">Excluded (priced elsewhere)</label>
                <textarea id="hm-wp-excl" value={form.exclusions} maxLength={3000} onChange={(e) => set("exclusions", e.target.value)} placeholder={meta.exclusionsHint || "Fixtures, approvals…"} />
              </div>
            </div>
          </section>

          <section className="hm-wp__step">
            <div className="hm-wp__step-title"><span>3</span><h3>Terms</h3></div>
            <div className="hm-wp__field-row">
              <div className="hm-wp__field">
                <label htmlFor="hm-wp-basis">Pricing basis</label>
                <select id="hm-wp-basis" value={form.pricingBasis} onChange={(e) => set("pricingBasis", e.target.value)}>
                  {Object.entries(PRICING_BASIS).map(([id, entry]) => <option key={id} value={id}>{entry.label}</option>)}
                </select>
                <span className="hm-wp__hint">{PRICING_BASIS[form.pricingBasis]?.hint}</span>
              </div>
              <div className="hm-wp__field">
                <label htmlFor="hm-wp-due">Bids due by</label>
                <input id="hm-wp-due" type="date" value={form.bidsDueAt} min={toDateInput(new Date())} onChange={(e) => set("bidsDueAt", e.target.value)} />
                <span className="hm-wp__hint">7–14 days gives professionals time to visit and price properly.</span>
              </div>
              <div className="hm-wp__field">
                <label htmlFor="hm-wp-max">Maximum bids</label>
                <input id="hm-wp-max" type="number" min="1" max="25" value={form.maxBids} onChange={(e) => set("maxBids", e.target.value)} />
                <span className="hm-wp__hint">Caps how many professionals can bid, so you compare 4–8 serious quotes instead of 30.</span>
              </div>
            </div>
            <div className="hm-wp__field-row">
              <div className="hm-wp__field">
                <label htmlFor="hm-wp-budget">Your budget for this package (₹)</label>
                <input id="hm-wp-budget" type="number" min="0" step="1000" inputMode="numeric" value={form.budgetHintInr} onChange={(e) => set("budgetHintInr", e.target.value)} placeholder="e.g. 450000" />
                <span className="hm-wp__hint">{form.budgetHintInr ? formatInrShort(form.budgetHintInr) : "Used to flag bids over budget."}</span>
                <label className="hm-wp__toggle"><input type="checkbox" checked={form.showBudgetToPros} onChange={(e) => set("showBudgetToPros", e.target.checked)} /> Show this budget to bidders</label>
              </div>
              <div className="hm-wp__field">
                <label htmlFor="hm-wp-start">Target start</label>
                <input id="hm-wp-start" type="date" value={form.targetStart} onChange={(e) => set("targetStart", e.target.value)} />
              </div>
              <div className="hm-wp__field">
                <label htmlFor="hm-wp-finish">Target completion</label>
                <input id="hm-wp-finish" type="date" value={form.targetCompletion} onChange={(e) => set("targetCompletion", e.target.value)} />
              </div>
            </div>
            <label className="hm-wp__toggle"><input type="checkbox" checked={form.siteVisitRequired} onChange={(e) => set("siteVisitRequired", e.target.checked)} /> Site visit required before bidding</label>
          </section>

          <section className="hm-wp__step">
            <div className="hm-wp__step-title"><span>4</span><h3>Reference documents</h3></div>
            {documents.length ? (
              <>
                <div className="hm-wp__docs">
                  {documents.map((doc) => {
                    const selected = form.attachments.some((a) => String(a.document_id) === String(doc.id));
                    return (
                      <label className={`hm-wp__doc ${selected ? "is-selected" : ""}`} key={doc.id}>
                        <input type="checkbox" checked={selected} onChange={() => toggleDoc(doc)} />
                        <span title={doc.file_name || doc.name}>{doc.file_name || doc.name || "Document"}</span>
                      </label>
                    );
                  })}
                </div>
                <span className="hm-wp__hint">Bidders see the document names so they know drawings exist. Files stay private; share them with shortlisted professionals directly.</span>
              </>
            ) : (
              <span className="hm-wp__hint">No documents in this project yet. Floor plans, photos and drawings uploaded under Documents can be referenced here.</span>
            )}
          </section>

          {error ? <p className="hm-wp__error" role="alert">{error}</p> : null}
          {notice ? <p className="hm-wp__notice">{notice}</p> : null}
        </div>

        <div className="hm-wp__modal-foot">
          <span className="hm-wp__hint">{form.scopeItems.filter((r) => r.label.trim()).length} scope lines · {form.eligibleCrafts.map(craftLabel).join(", ") || "any trade"}</span>
          <div>
            <button type="button" className="hm-wp__btn-quiet" onClick={onClose} disabled={Boolean(saving)}>Cancel</button>
            <button type="button" className="hm-wp__btn-secondary" onClick={() => save(false)} disabled={Boolean(saving)}>{saving === "draft" ? "Saving…" : "Save draft"}</button>
            <button type="button" className="hm-wp__btn" onClick={() => save(true)} disabled={Boolean(saving)}>{saving === "publish" ? "Publishing…" : existing?.status && existing.status !== "draft" ? "Save changes" : "Save & publish"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
