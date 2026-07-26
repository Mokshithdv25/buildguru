import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, BriefcaseBusiness, CheckCircle2, MapPin, Pencil, Users } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import LandingNavbar from "../components/landing/LandingNavbar";
import LandingFooter from "../components/landing/LandingFooter";
import { useMobileNative } from "../hooks/useMobileNative";
import {
  isCurrentUserCareersAdmin,
  listAdminCareerJobs,
  listCareerApplications,
  listPublishedCareerJobs,
  saveCareerJob,
  submitCareerApplication,
  updateCareerApplicationStatus,
  updateCareerJobStatus,
} from "../lib/careersApi";
import {
  clearCareerPortfolioIntent,
  readCareerPortfolioIntent,
  readPublishedPortfolioForCareer,
  roleRequiresHomeMakersPortfolio,
  saveCareerPortfolioIntent,
} from "../lib/careerPortfolioIntent";
import { getProOnboardingResumePath } from "../lib/hmAuth";
import "./CareersPage.css";

const EMPLOYMENT = {
  full_time: "Full time",
  part_time: "Part time",
  contract: "Contract",
  internship: "Internship",
};
const WORKPLACE = { remote: "Remote", hybrid: "Hybrid", onsite: "On-site" };
const APPLICATION_STATUSES = ["received", "reviewing", "shortlisted", "rejected", "hired"];

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
  linkedin_url: "",
  portfolio_url: "",
  resume_url: "",
  cover_note: "",
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

function ApplicationForm({ job, onClose }) {
  const navigate = useNavigate();
  const portfolioRequired = roleRequiresHomeMakersPortfolio(job);
  const publishedPortfolio = readPublishedPortfolioForCareer();
  const savedIntent = readCareerPortfolioIntent();
  const savedDraft = savedIntent?.jobId === job.id ? savedIntent.application : null;
  const attachedPortfolioUrl = publishedPortfolio?.url || (savedIntent?.jobId === job.id ? savedIntent?.portfolioUrl : "") || "";
  const [form, setForm] = useState(() => ({
    ...EMPTY_APPLICATION,
    ...(savedDraft || {}),
    portfolio_url: attachedPortfolioUrl || savedDraft?.portfolio_url || "",
    consent: false,
  }));
  const [state, setState] = useState({ saving: false, error: "", sent: false });
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event) => {
    event.preventDefault();
    if (portfolioRequired && !attachedPortfolioUrl) {
      setState({ saving: false, sent: false, error: "Create and publish your HomeMakers portfolio before submitting this application." });
      return;
    }
    setState({ saving: true, error: "", sent: false });
    try {
      await submitCareerApplication(job.id, form);
      clearCareerPortfolioIntent(job.id);
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

  const buildPortfolio = () => {
    saveCareerPortfolioIntent(job, form);
    navigate(getProOnboardingResumePath());
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
            <button type="button" onClick={onClose}>Back to open roles</button>
          </div>
        ) : (
          <>
            <p className="hm-careers-eyebrow">Apply to HomeMakers</p>
            <h2 id="career-apply-title">{job.title}</h2>
            <JobMeta job={job} />
            {portfolioRequired ? (
              <div className={`hm-careers-portfolio-callout ${attachedPortfolioUrl ? "attached" : ""}`}>
                <div>
                  <strong>{attachedPortfolioUrl ? "HomeMakers portfolio attached" : "A HomeMakers portfolio is required"}</strong>
                  <p>
                    {attachedPortfolioUrl
                      ? `${publishedPortfolio?.name || "Your published portfolio"} will be reviewed with this application.`
                      : "Add your experience, project details, credentials, and work photos once. We will use the published portfolio as the main evidence for this role."}
                  </p>
                </div>
                {attachedPortfolioUrl ? (
                  <a href={attachedPortfolioUrl} target="_blank" rel="noreferrer">View portfolio</a>
                ) : (
                  <button type="button" onClick={buildPortfolio}>Create your portfolio <ArrowRight size={16} /></button>
                )}
              </div>
            ) : null}
            <form className="hm-careers-form" onSubmit={submit}>
              <label>Full name<input required minLength={2} value={form.full_name} onChange={(e) => set("full_name", e.target.value)} /></label>
              <label>Email<input required type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></label>
              <label>Phone<input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} /></label>
              <label>Current city<input value={form.city} onChange={(e) => set("city", e.target.value)} /></label>
              <label>LinkedIn URL<input type="url" placeholder="https://linkedin.com/in/…" value={form.linkedin_url} onChange={(e) => set("linkedin_url", e.target.value)} /></label>
              <label>
                {portfolioRequired ? "HomeMakers portfolio" : "Portfolio URL"}
                <input
                  required={portfolioRequired}
                  readOnly={portfolioRequired}
                  type="url"
                  placeholder={portfolioRequired ? "Create and publish your HomeMakers portfolio above" : "https://…"}
                  value={form.portfolio_url}
                  onChange={(e) => set("portfolio_url", e.target.value)}
                />
              </label>
              <label className="wide">Résumé link<input required type="url" placeholder="Google Drive, Dropbox, or your website" value={form.resume_url} onChange={(e) => set("resume_url", e.target.value)} /></label>
              <label className="wide">Why this role?<textarea required minLength={20} rows={5} value={form.cover_note} onChange={(e) => set("cover_note", e.target.value)} /></label>
              <label className="wide hm-careers-consent">
                <input required type="checkbox" checked={form.consent} onChange={(e) => set("consent", e.target.checked)} />
                <span>I consent to HomeMakers using this information to evaluate my application and contact me about this role.</span>
              </label>
              {state.error ? <p className="hm-careers-error wide" role="alert">{state.error}</p> : null}
              <button className="hm-careers-primary wide" type="submit" disabled={state.saving || (portfolioRequired && !attachedPortfolioUrl)}>
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
                    <span><a href={application.resume_url} target="_blank" rel="noreferrer">Résumé</a>{application.portfolio_url ? <> · <a href={application.portfolio_url} target="_blank" rel="noreferrer">Portfolio</a></> : null}</span>
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
            <Link to="/" className="hm-careers-back"><ArrowLeft size={16} /> Home</Link>
            <p className="hm-careers-eyebrow">Careers at HomeMakers</p>
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
                <button type="button" onClick={() => setSelectedJob(job)}>Apply now <ArrowRight size={17} /></button>
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
