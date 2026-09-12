import React, { useEffect, useMemo, useState } from "react";
import { ArrowRight, BriefcaseBusiness, Camera, CheckCircle2, MapPin, Pencil, Users, X } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import LandingNavbar from "../components/landing/LandingNavbar";
import LandingFooter from "../components/landing/LandingFooter";
import BackButton from "../components/BackButton";
import { useMobileNative } from "../hooks/useMobileNative";
import {
  isCurrentUserCareersAdmin,
  listAdminCareerJobs,
  listCareerApplications,
  listPublishedCareerJobs,
  saveCareerJob,
  submitCareerApplication,
  uploadCareerWorkSamples,
  updateCareerApplicationStatus,
  updateCareerJobStatus,
} from "../lib/careersApi";
import { roleUsesCareerApplicationProfile } from "../lib/careerApplicationProfile";
import "./CareersPage.css";

const EMPLOYMENT = {
  full_time: "Full time",
  part_time: "Part time",
  contract: "Contract",
  internship: "Internship",
};
const WORKPLACE = { remote: "Remote", hybrid: "Hybrid", onsite: "On-site" };
const APPLICATION_STATUSES = ["received", "reviewing", "shortlisted", "rejected", "hired"];
const ARCHITECT_SPECIALTIES = [
  "Floor plans",
  "Elevations",
  "Residential planning",
  "Approvals",
  "3D / BIM",
  "Estimates & materials",
  "Product thinking",
];

const EMPTY_JOB = {
  title: "",
  team: "",
  location: "",
  employment_type: "full_time",
  workplace_type: "onsite",
  summary: "",
  description: "",
  responsibilitiesText: "",
  qualificationsText: "",
  status: "draft",
  closes_at: "",
};

const EMPTY_APPLICATION = {
  full_name: "",
  email: "",
  phone: "",
  city: "",
  cover_note: "",
  experience_range: "",
  qualification: "",
  license_number: "",
  tools: "",
  specialties: [],
  publish_portfolio: false,
  consent: false,
};

function lines(value) {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}

function JobMeta({ job }) {
  return (
    <div className="hm-careers-meta">
      <span><Users size={15} />{job.team}</span>
      <span><MapPin size={15} />{job.location}</span>
      <span><BriefcaseBusiness size={15} />{EMPLOYMENT[job.employment_type]} · {WORKPLACE[job.workplace_type]}</span>
    </div>
  );
}

function makeApplicationId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `00000000-0000-4000-8000-${Date.now().toString().padStart(12, "0").slice(-12)}`;
}

function profileSlug(name, applicationId) {
  const base = String(name || "architect")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "architect";
  return `${base}-${applicationId.slice(-6)}`;
}

function optimizeWorkSample(file) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) {
      reject(new Error("Use JPG, PNG, or WebP project images."));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      reject(new Error("Each project image must be under 10 MB."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const scale = Math.min(1600 / image.width, 1200 / image.height, 1);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Could not process this image."));
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.76));
      };
      image.onerror = () => reject(new Error("Could not process this image."));
      image.src = String(reader.result || "");
    };
    reader.onerror = () => reject(new Error("Could not read this image."));
    reader.readAsDataURL(file);
  });
}

function ApplicationForm({ job, onClose }) {
  const applicationProfile = roleUsesCareerApplicationProfile(job);
  const [form, setForm] = useState(EMPTY_APPLICATION);
  const [applicationId] = useState(makeApplicationId);
  const [samples, setSamples] = useState([]);
  const [publishedSlug, setPublishedSlug] = useState("");
  const [state, setState] = useState({ saving: false, error: "", sent: false });
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const toggleSpecialty = (specialty) => {
    set("specialties", form.specialties.includes(specialty)
      ? form.specialties.filter((item) => item !== specialty)
      : [...form.specialties, specialty]);
  };

  const addSamples = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    try {
      const remaining = Math.max(0, 8 - samples.length);
      const optimized = await Promise.all(files.slice(0, remaining).map(optimizeWorkSample));
      setSamples((current) => [...current, ...optimized.map((dataUrl) => ({ dataUrl, caption: "" }))]);
      setState((current) => ({ ...current, error: "" }));
    } catch (error) {
      setState((current) => ({ ...current, error: error?.message || "Could not add these images." }));
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (applicationProfile && samples.length < 2) {
      setState({ saving: false, error: "Add at least two project images so we can understand your work.", sent: false });
      return;
    }
    if (applicationProfile && form.specialties.length === 0) {
      setState({ saving: false, error: "Choose at least one area you work on.", sent: false });
      return;
    }
    if (applicationProfile && samples.some((sample) => sample.caption.trim().length < 8)) {
      setState({ saving: false, error: "Add a short caption to every project image.", sent: false });
      return;
    }
    setState({ saving: true, error: "", sent: false });
    try {
      const workSamplePaths = applicationProfile
        ? await uploadCareerWorkSamples(applicationId, samples)
        : [];
      const slug = form.publish_portfolio ? profileSlug(form.full_name, applicationId) : "";
      await submitCareerApplication(job.id, {
        ...form,
        id: applicationId,
        work_sample_paths: workSamplePaths,
        work_sample_captions: samples.map((sample) => sample.caption.trim()),
        profile_slug: slug,
      });
      setPublishedSlug(slug);
      setState({ saving: false, error: "", sent: true });
    } catch (error) {
      const duplicate = error?.code === "23505";
      setState({
        saving: false,
        sent: false,
        error: duplicate ? "An application using this email has already been received for this role." : (error?.message || "We could not submit your application."),
      });
    }
  };

  return (
    <div className="hm-careers-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="hm-careers-modal" role="dialog" aria-modal="true" aria-labelledby="career-apply-title">
        <button type="button" className="hm-careers-modal-close" onClick={onClose} aria-label="Close application">×</button>
        {state.sent ? (
          <div className="hm-careers-success">
            <CheckCircle2 size={42} />
            <h2 id="career-apply-title">Application received</h2>
            <p>Thank you for applying for {job.title}. Our hiring team will contact you if there is a match.</p>
            {publishedSlug ? (
              <p className="hm-careers-success-note">
                Your selected work is also live as a BuildGuru portfolio. Your email, phone, and licence number remain private.
              </p>
            ) : null}
            {publishedSlug ? <Link className="hm-careers-profile-link" to={`/career-profile/${publishedSlug}`}>View your portfolio <ArrowRight size={16} /></Link> : null}
            <BackButton onClick={onClose} label="Open roles" />
          </div>
        ) : (
          <>
            <p className="hm-careers-eyebrow">Apply to BuildGuru</p>
            <h2 id="career-apply-title">{job.title}</h2>
            <JobMeta job={job} />
            {applicationProfile ? (
              <div className="hm-careers-application-notice">
                <strong>This is a job application built around your work.</strong>
                <p>
                  No Google sign-in and no résumé. Add a few project images and the details that matter. You can choose below whether the same submission also becomes a public BuildGuru portfolio.
                </p>
              </div>
            ) : null}
            <form className="hm-careers-form" onSubmit={submit}>
              <label>Full name<input required minLength={2} value={form.full_name} onChange={(e) => set("full_name", e.target.value)} /></label>
              <label>Email<input required type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></label>
              <label>Phone<input required type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} /></label>
              <label>Current city<input required value={form.city} onChange={(e) => set("city", e.target.value)} /></label>
              {applicationProfile ? (
                <>
                  <div className="hm-careers-form-section wide">
                    <span>Your practice</span>
                    <strong>A quick picture of what you know.</strong>
                  </div>
                  <label>
                    Relevant experience
                    <select required value={form.experience_range} onChange={(e) => set("experience_range", e.target.value)}>
                      <option value="">Select</option>
                      <option value="under_2">Under 2 years</option>
                      <option value="2_3">2–3 years</option>
                      <option value="4_6">4–6 years</option>
                      <option value="7_plus">7+ years</option>
                    </select>
                  </label>
                  <label>Architecture / engineering background<input placeholder="B.Arch, Diploma, B.Tech Civil…" value={form.qualification} onChange={(e) => set("qualification", e.target.value)} /></label>
                  <label>Licence / COA number<input required placeholder="e.g. CA/2022/123456" value={form.license_number} onChange={(e) => set("license_number", e.target.value)} /></label>
                  <label>Tools you use<input required placeholder="AutoCAD, Revit, SketchUp, BIM…" value={form.tools} onChange={(e) => set("tools", e.target.value)} /></label>
                  <fieldset className="hm-careers-specialties wide">
                    <legend>What do you work on?</legend>
                    <div>
                      {ARCHITECT_SPECIALTIES.map((specialty) => (
                        <label key={specialty}>
                          <input type="checkbox" checked={form.specialties.includes(specialty)} onChange={() => toggleSpecialty(specialty)} />
                          <span>{specialty}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <div className="hm-careers-form-section wide">
                    <span>Selected work</span>
                    <strong>Add 2–8 project images.</strong>
                    <p>Plans, elevations, details, site photos, models, or finished spaces are all useful. Only upload work you are allowed to share.</p>
                  </div>
                  <div className="hm-careers-samples wide">
                    {samples.map((sample, index) => (
                      <article key={`${applicationId}-${index}`}>
                        <img src={sample.dataUrl} alt="" />
                        <button type="button" aria-label={`Remove work sample ${index + 1}`} onClick={() => setSamples((items) => items.filter((_, itemIndex) => itemIndex !== index))}><X size={15} /></button>
                        <input
                          required
                          placeholder="What is this, and what did you do?"
                          value={sample.caption}
                          onChange={(event) => setSamples((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, caption: event.target.value } : item))}
                        />
                      </article>
                    ))}
                    {samples.length < 8 ? (
                      <label className="hm-careers-sample-upload">
                        <Camera size={24} />
                        <strong>Add project photos</strong>
                        <span>JPG, PNG or WebP</span>
                        <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={addSamples} />
                      </label>
                    ) : null}
                  </div>
                </>
              ) : null}
              <label className="wide">A little about your work<textarea required minLength={20} rows={4} placeholder="What kind of homes or design problems do you enjoy working on, and why does this role interest you?" value={form.cover_note} onChange={(e) => set("cover_note", e.target.value)} /></label>
              {applicationProfile ? (
                <label className="wide hm-careers-consent hm-careers-publish-choice">
                  <input type="checkbox" checked={form.publish_portfolio} onChange={(e) => set("publish_portfolio", e.target.checked)} />
                  <span><strong>Also publish this as my BuildGuru portfolio.</strong> My name, city, introduction, experience, tools, specialties, captions, and selected images will be public. My email, phone, and licence number will remain private.</span>
                </label>
              ) : null}
              <label className="wide hm-careers-consent">
                <input required type="checkbox" checked={form.consent} onChange={(e) => set("consent", e.target.checked)} />
                <span>I consent to BuildGuru using this information to evaluate my application and contact me about this role.</span>
              </label>
              {state.error ? <p className="hm-careers-error wide" role="alert">{state.error}</p> : null}
              <button className="hm-careers-primary wide" type="submit" disabled={state.saving}>
                {state.saving ? "Submitting…" : "Submit application"} <ArrowRight size={17} />
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}

function JobEditor({ job, onSaved, onCancel }) {
  const [form, setForm] = useState(() => job ? {
    ...job,
    responsibilitiesText: (job.responsibilities || []).join("\n"),
    qualificationsText: (job.qualifications || []).join("\n"),
    closes_at: job.closes_at ? job.closes_at.slice(0, 10) : "",
  } : EMPTY_JOB);
  const [state, setState] = useState({ saving: false, error: "" });
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event) => {
    event.preventDefault();
    setState({ saving: true, error: "" });
    try {
      const saved = await saveCareerJob({
        ...form,
        responsibilities: lines(form.responsibilitiesText),
        qualifications: lines(form.qualificationsText),
        closes_at: form.closes_at ? new Date(`${form.closes_at}T23:59:59`).toISOString() : null,
      });
      onSaved(saved);
    } catch (error) {
      setState({ saving: false, error: error?.message || "Could not save this role." });
    }
  };

  return (
    <form className="hm-careers-admin-editor" onSubmit={submit}>
      <div className="hm-careers-admin-heading">
        <div><p className="hm-careers-eyebrow">Hiring admin</p><h3>{job ? "Edit role" : "Post a role"}</h3></div>
        {job ? <button type="button" onClick={onCancel}>Cancel</button> : null}
      </div>
      <label>Job title<input required value={form.title} onChange={(e) => set("title", e.target.value)} /></label>
      <label>Team<input required value={form.team} onChange={(e) => set("team", e.target.value)} /></label>
      <label>Location<input required value={form.location} onChange={(e) => set("location", e.target.value)} /></label>
      <label>Employment<select value={form.employment_type} onChange={(e) => set("employment_type", e.target.value)}>{Object.entries(EMPLOYMENT).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Workplace<select value={form.workplace_type} onChange={(e) => set("workplace_type", e.target.value)}>{Object.entries(WORKPLACE).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Status<select value={form.status} onChange={(e) => set("status", e.target.value)}><option value="draft">Draft</option><option value="published">Published</option><option value="closed">Closed</option></select></label>
      <label className="wide">Short summary<textarea required minLength={20} rows={3} value={form.summary} onChange={(e) => set("summary", e.target.value)} /></label>
      <label className="wide">About the role<textarea required minLength={40} rows={6} value={form.description} onChange={(e) => set("description", e.target.value)} /></label>
      <label className="wide">Responsibilities <small>One per line</small><textarea rows={5} value={form.responsibilitiesText} onChange={(e) => set("responsibilitiesText", e.target.value)} /></label>
      <label className="wide">Qualifications <small>One per line</small><textarea rows={5} value={form.qualificationsText} onChange={(e) => set("qualificationsText", e.target.value)} /></label>
      <label>Applications close<input type="date" value={form.closes_at} onChange={(e) => set("closes_at", e.target.value)} /></label>
      {state.error ? <p className="hm-careers-error wide" role="alert">{state.error}</p> : null}
      <button className="hm-careers-primary wide" type="submit" disabled={state.saving}>{state.saving ? "Saving…" : "Save role"}</button>
    </form>
  );
}

function CareersAdmin({ jobs, setJobs }) {
  const [applications, setApplications] = useState([]);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    listCareerApplications().then(setApplications).catch((err) => setError(err?.message || "Could not load applications."));
  }, []);

  const refreshJobs = async () => setJobs(await listAdminCareerJobs());
  const changeJobStatus = async (id, status) => {
    try {
      await updateCareerJobStatus(id, status);
      await refreshJobs();
    } catch (err) {
      setError(err?.message || "Could not update role.");
    }
  };
  const changeApplicationStatus = async (id, status) => {
    try {
      await updateCareerApplicationStatus(id, status);
      setApplications((items) => items.map((item) => item.id === id ? { ...item, status } : item));
    } catch (err) {
      setError(err?.message || "Could not update application.");
    }
  };

  return (
    <section className="hm-careers-admin">
      <div className="hm-careers-section-title">
        <div><p className="hm-careers-eyebrow">Private workspace</p><h2>Careers admin</h2></div>
        <span>{jobs.length} roles · {applications.length} applications</span>
      </div>
      <JobEditor
        key={editing?.id || "new"}
        job={editing}
        onCancel={() => setEditing(null)}
        onSaved={async () => { setEditing(null); await refreshJobs(); }}
      />
      {error ? <p className="hm-careers-error" role="alert">{error}</p> : null}
      <div className="hm-careers-admin-grid">
        <div>
          <h3>Roles</h3>
          <div className="hm-careers-admin-list">
            {jobs.map((job) => (
              <article key={job.id}>
                <div><strong>{job.title}</strong><span>{job.team} · {job.status}</span></div>
                <div>
                  <button type="button" onClick={() => setEditing(job)}><Pencil size={14} /> Edit</button>
                  {job.status !== "published" ? <button type="button" onClick={() => changeJobStatus(job.id, "published")}>Publish</button> : <button type="button" onClick={() => changeJobStatus(job.id, "closed")}>Close</button>}
                </div>
              </article>
            ))}
            {!jobs.length ? <p>No roles created yet.</p> : null}
          </div>
        </div>
        <div>
          <h3>Applications</h3>
          <div className="hm-careers-admin-list applications">
            {applications.map((application) => {
              const job = jobs.find((item) => item.id === application.job_id);
              return (
                <article key={application.id}>
                  <div>
                    <strong>{application.full_name}</strong>
                    <span>{job?.title || "Role"} · {application.email}</span>
                    {application.candidate_profile?.experience_range ? (
                      <span>{application.candidate_profile.experience_range.replace("_", "–")} experience · {application.candidate_profile.qualification}</span>
                    ) : null}
                    {application.work_sample_urls?.length ? (
                      <div className="hm-careers-admin-samples">
                        {application.work_sample_urls.map((url, index) => (
                          <a key={url} href={url} target="_blank" rel="noreferrer" aria-label={`Open ${application.full_name} work sample ${index + 1}`}>
                            <img src={url} alt="" />
                            <span>{application.work_sample_captions?.[index] || `Sample ${index + 1}`}</span>
                          </a>
                        ))}
                      </div>
                    ) : null}
                    {application.candidate_profile?.tools ? (
                      <details className="hm-careers-application-answers">
                        <summary>Application answers</summary>
                        <p><strong>Licence / registration:</strong> {application.candidate_profile.license_number || "Not provided"}</p>
                        <p><strong>Tools:</strong> {application.candidate_profile.tools}</p>
                        <p><strong>Specialties:</strong> {(application.candidate_profile.specialties || []).join(", ")}</p>
                        <p><strong>Introduction:</strong> {application.cover_note}</p>
                        <p><strong>Public portfolio:</strong> {application.publish_portfolio ? "Published" : "Private"}</p>
                        {application.profile_slug ? <p><Link to={`/career-profile/${application.profile_slug}`}>View public portfolio</Link></p> : null}
                      </details>
                    ) : null}
                  </div>
                  <select value={application.status} onChange={(e) => changeApplicationStatus(application.id, e.target.value)}>
                    {APPLICATION_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                </article>
              );
            })}
            {!applications.length ? <p>No applications yet.</p> : null}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function CareersPage() {
  const mobile = useMobileNative();
  const [searchParams, setSearchParams] = useSearchParams();
  const [jobs, setJobs] = useState([]);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedJob, setSelectedJob] = useState(null);
  const [admin, setAdmin] = useState(false);
  const [team, setTeam] = useState("all");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const result = await listPublishedCareerJobs();
        if (!active) return;
        setConfigured(result.configured);
        setJobs(result.jobs);
        if (result.configured && await isCurrentUserCareersAdmin()) {
          setAdmin(true);
          setJobs(await listAdminCareerJobs());
        }
      } catch (err) {
        if (active) setError(err?.message || "Could not load open roles.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const applyId = searchParams.get("apply");
    if (!applyId || !jobs.length || selectedJob) return;
    const matchingJob = jobs.find((job) => job.id === applyId && job.status === "published");
    if (matchingJob) {
      setSelectedJob(matchingJob);
      setSearchParams({}, { replace: true });
    }
  }, [jobs, searchParams, selectedJob, setSearchParams]);

  const publicJobs = useMemo(
    () => jobs.filter((job) => job.status === "published" && (team === "all" || job.team === team)),
    [jobs, team],
  );
  const teams = [...new Set(jobs.filter((job) => job.status === "published").map((job) => job.team))];

  return (
    <div className="hm-careers-page">
      {!mobile ? <LandingNavbar tagline="Careers" /> : null}
      <main>
        <section className="hm-careers-hero">
          <div>
            <BackButton to="/" label="BuildGuru" className="hm-careers-back" />
            <p className="hm-careers-eyebrow">Careers at BuildGuru</p>
            <h1>Build the future of Indian home projects.</h1>
            <p>Join a team making design, hiring, materials and project delivery clearer for homeowners and professionals.</p>
            <a href="#open-roles" className="hm-careers-primary">See open roles <ArrowRight size={17} /></a>
          </div>
          <aside>
            <span>Work with purpose</span>
            <strong>One product. Two sides of the home-building journey.</strong>
            <p>We build for the families making high-stakes decisions and the professionals responsible for delivering them.</p>
          </aside>
        </section>

        <section className="hm-careers-values">
          <article><strong>Start with the real project</strong><p>We solve the handoffs, uncertainty and daily work behind building a home.</p></article>
          <article><strong>Earn trust through clarity</strong><p>Useful, honest tools matter more than inflated claims or decorative AI.</p></article>
          <article><strong>Build for Indian realities</strong><p>Climate, budgets, local professionals and material decisions shape the product.</p></article>
        </section>

        <section className="hm-careers-open" id="open-roles">
          <div className="hm-careers-section-title">
            <div><p className="hm-careers-eyebrow">Join the team</p><h2>Open roles</h2></div>
            {teams.length > 1 ? (
              <label>Team<select value={team} onChange={(e) => setTeam(e.target.value)}><option value="all">All teams</option>{teams.map((item) => <option key={item}>{item}</option>)}</select></label>
            ) : null}
          </div>
          {loading ? <p className="hm-careers-empty">Loading open roles…</p> : null}
          {!loading && !configured ? <p className="hm-careers-empty">Careers is being prepared. Please check back soon.</p> : null}
          {!loading && configured && error ? <p className="hm-careers-error" role="alert">{error}</p> : null}
          {!loading && configured && !error && !publicJobs.length ? (
            <div className="hm-careers-empty"><h3>No open roles right now.</h3><p>We are still building. Check back here for the next opportunity.</p></div>
          ) : null}
          <div className="hm-careers-jobs">
            {publicJobs.map((job) => (
              <article key={job.id}>
                <div><h3>{job.title}</h3><JobMeta job={job} /><p>{job.summary}</p></div>
                <button type="button" onClick={() => setSelectedJob(job)}>
                  Apply now <ArrowRight size={17} />
                </button>
                <div className="hm-careers-job-details">
                  <p>{job.description}</p>
                  {job.responsibilities?.length ? <><h4>What you will do</h4><ul>{job.responsibilities.map((item) => <li key={item}>{item}</li>)}</ul></> : null}
                  {job.qualifications?.length ? <><h4>What will help you succeed</h4><ul>{job.qualifications.map((item) => <li key={item}>{item}</li>)}</ul></> : null}
                </div>
              </article>
            ))}
          </div>
        </section>
        {admin ? <CareersAdmin jobs={jobs} setJobs={setJobs} /> : null}
      </main>
      {!mobile ? <LandingFooter /> : null}
      {selectedJob ? <ApplicationForm job={selectedJob} onClose={() => setSelectedJob(null)} /> : null}
    </div>
  );
}
