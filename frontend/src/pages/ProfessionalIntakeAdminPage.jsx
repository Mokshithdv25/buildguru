import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import BackButton from "../components/BackButton";
import {
  Building2,
  CheckCircle2,
  ImagePlus,
  Loader2,
  MapPin,
  Plus,
  Save,
  UserRound,
} from "lucide-react";
import {
  addProfessionalIntakeMedia,
  isProfessionalIntakeOpsConfigured,
  listProfessionalIntakes,
  saveProfessionalIntake,
} from "../lib/professionalIntakesApi";
import "./ProfessionalIntakeAdminPage.css";

const EMPTY_FORM = {
  id: "",
  craft: "architect",
  slug: "",
  is_listed: false,
  full_name: "",
  business_name: "",
  email: "",
  phone: "",
  city: "Bengaluru",
  address: "",
  website_url: "",
  google_maps_url: "",
  years_experience: "",
  license_number: "",
  short_bio: "",
  specialties_text: "",
  specialties: [],
  status: "onboarded",
  work_sample_paths: [],
  work_sample_urls: [],
};

export default function ProfessionalIntakeAdminPage() {
  const [configured, setConfigured] = useState(isProfessionalIntakeOpsConfigured());
  const [loadingRows, setLoadingRows] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [intakes, setIntakes] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [files, setFiles] = useState([]);

  const selectedFileNames = useMemo(() => files.map((file) => file.name), [files]);

  const loadRows = async () => {
    setLoadingRows(true);
    try {
      const result = await listProfessionalIntakes();
      setConfigured(result.configured);
      setIntakes(result.intakes);
    } catch (err) {
      setError(err?.message || "Could not load internal professional records.");
    } finally {
      setLoadingRows(false);
    }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      if (!isProfessionalIntakeOpsConfigured()) return;
      try {
        await loadRows();
      } catch (err) {
        if (active) setError(err?.message || "Could not verify operations access.");
      }
    })();
    return () => { active = false; };
  }, []);

  const change = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };

  const changeChecked = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.checked }));
  };

  const reset = () => {
    setForm(EMPTY_FORM);
    setFiles([]);
    setError("");
    setNotice("");
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const specialties = form.specialties_text
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      let saved = await saveProfessionalIntake({ ...form, specialties });
      if (files.length) saved = await addProfessionalIntakeMedia(saved, files);
      setIntakes((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setForm(EMPTY_FORM);
      setFiles([]);
      setNotice(
        saved.is_listed && saved.status !== "archived"
          ? `${saved.business_name} saved and listed in professional search.`
          : `${saved.business_name} saved privately.`,
      );
    } catch (err) {
      setError(err?.message || "Could not save this architect.");
    } finally {
      setSaving(false);
    }
  };

  if (!configured) {
    return (
      <main className="hm-ops-state">
        <Building2 size={34} />
        <h1>Local operations key missing</h1>
        <p>Add <code>REACT_APP_PROFESSIONAL_INTAKE_OPS_KEY</code> to <code>frontend/.env</code>, then restart the local page.</p>
      </main>
    );
  }

  return (
    <main className="hm-ops-page">
      <header className="hm-ops-header">
        <div>
          <BackButton to="/" label="BuildGuru" className="hm-ops-back" />
          <p>LOCAL OPERATIONS</p>
          <h1>Onboard an architect</h1>
          <span>Save the private contact record and list its safe profile fields in professional search.</span>
        </div>
        <button type="button" className="hm-ops-secondary" onClick={reset}><Plus size={16} /> New architect</button>
      </header>

      <div className="hm-ops-layout">
        <form className="hm-ops-form" onSubmit={submit}>
          <section>
            <div className="hm-ops-section-title"><UserRound size={19} /><div><h2>Business details</h2><p>Fields marked * are required.</p></div></div>
            <div className="hm-ops-grid">
              <label>Contact name *<input required value={form.full_name} onChange={change("full_name")} placeholder="Architect's name" /></label>
              <label>Firm / studio *<input required value={form.business_name} onChange={change("business_name")} placeholder="Business name" /></label>
              <label>Phone *<input required value={form.phone} onChange={change("phone")} inputMode="tel" placeholder="+91…" /></label>
              <label>Email<input value={form.email} onChange={change("email")} type="email" placeholder="studio@example.com" /></label>
              <label>Years of experience<input value={form.years_experience} onChange={change("years_experience")} placeholder="e.g. 12" /></label>
              <label>COA / licence number<input value={form.license_number} onChange={change("license_number")} placeholder="Optional" /></label>
            </div>
          </section>

          <section>
            <div className="hm-ops-section-title"><MapPin size={19} /><div><h2>Location and links</h2></div></div>
            <div className="hm-ops-grid">
              <label>City *<input required value={form.city} onChange={change("city")} /></label>
              <label className="hm-ops-wide">Address *<textarea required rows="2" value={form.address} onChange={change("address")} placeholder="Full office address" /></label>
              <label>Website<input value={form.website_url} onChange={change("website_url")} type="url" placeholder="https://…" /></label>
              <label>Google Maps link<input value={form.google_maps_url} onChange={change("google_maps_url")} type="url" placeholder="https://maps.google.com/…" /></label>
            </div>
          </section>

          <section>
            <div className="hm-ops-section-title"><Building2 size={19} /><div><h2>Profile information</h2></div></div>
            <div className="hm-ops-grid">
              <label className="hm-ops-wide">Specialties<input value={form.specialties_text} onChange={change("specialties_text")} placeholder="Residential, villas, interiors — separate with commas" /></label>
              <label className="hm-ops-wide">Short bio<textarea rows="4" value={form.short_bio} onChange={change("short_bio")} placeholder="A short internal profile summary" maxLength="2000" /></label>
              <label className="hm-ops-listing-toggle">
                <input type="checkbox" checked={form.is_listed} onChange={changeChecked("is_listed")} />
                <span><strong>Show in professional search</strong><small>Only name, firm, city, experience, bio, specialties, and project images are public. Phone, email, address, links, and licence stay private.</small></span>
              </label>
            </div>
          </section>

          <section>
            <div className="hm-ops-section-title"><ImagePlus size={19} /><div><h2>Project images</h2><p>Optional, up to 10 JPG/PNG/WebP files, 5 MB each.</p></div></div>
            <label className="hm-ops-upload">
              <ImagePlus size={24} />
              <strong>Choose project photos</strong>
              <span>{selectedFileNames.length ? selectedFileNames.join(", ") : "No new files selected"}</span>
              <input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={(event) => setFiles(Array.from(event.target.files || []).slice(0, 10))} />
            </label>
            {form.work_sample_urls?.length ? <div className="hm-ops-images">{form.work_sample_urls.map((url, index) => <img src={url} alt={`Saved project ${index + 1}`} key={url} />)}</div> : null}
          </section>

          {error ? <div className="hm-ops-error" role="alert">{error}</div> : null}
          {notice ? <div className="hm-ops-success"><CheckCircle2 size={17} /> {notice}</div> : null}
          <button className="hm-ops-primary" type="submit" disabled={saving}>
            {saving ? <Loader2 className="hm-ops-spin" /> : <Save size={17} />}
            Save architect
          </button>
        </form>

        <aside className="hm-ops-list">
          <div className="hm-ops-list-heading"><div><p>THIS SESSION</p><h2>{intakes.length} added</h2></div>{loadingRows ? <Loader2 className="hm-ops-spin" /> : null}</div>
          {!intakes.length ? <div className="hm-ops-empty">Profiles you add now will appear here.</div> : null}
          {intakes.map((item) => (
            <article key={item.id}>
              <div className="hm-ops-record">
                <div className="hm-ops-record-title"><strong>{item.business_name}</strong><em className={item.is_listed && item.status !== "archived" ? "is-listed" : "is-private"}>{item.is_listed && item.status !== "archived" ? "Listed" : "Private"}</em></div>
                <span>{item.full_name} · {item.city}</span>
                <span>{item.phone}</span>
              </div>
            </article>
          ))}
        </aside>
      </div>
    </main>
  );
}
