import { getSupabase } from "./supabaseClient";

const JOB_FIELDS = "id,title,team,location,employment_type,workplace_type,summary,description,responsibilities,qualifications,status,published_at,closes_at,created_at,updated_at";
const APPLICATION_FIELDS = "id,job_id,full_name,email,phone,city,linkedin_url,portfolio_url,resume_url,cover_note,status,created_at,updated_at";

function client() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Careers is not connected yet.");
  return supabase;
}

export function isCareersSchemaMissing(error) {
  return ["42P01", "PGRST205", "42883"].includes(error?.code)
    || /career_(jobs|applications|admins)|careers_is_admin/i.test(error?.message || "");
}

function throwError(error) {
  if (error) throw error;
}

export async function listPublishedCareerJobs() {
  const { data, error } = await client()
    .from("career_jobs")
    .select(JOB_FIELDS)
    .eq("status", "published")
    .order("published_at", { ascending: false, nullsFirst: false });
  if (isCareersSchemaMissing(error)) return { configured: false, jobs: [] };
  throwError(error);
  return { configured: true, jobs: data || [] };
}

export async function isCurrentUserCareersAdmin() {
  const supabase = client();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) return false;
  const { data, error } = await supabase.rpc("careers_is_admin");
  if (isCareersSchemaMissing(error)) return false;
  throwError(error);
  return data === true;
}

export async function listAdminCareerJobs() {
  const { data, error } = await client()
    .from("career_jobs")
    .select(JOB_FIELDS)
    .order("created_at", { ascending: false });
  throwError(error);
  return data || [];
}

export async function listCareerApplications() {
  const { data, error } = await client()
    .from("career_applications")
    .select(APPLICATION_FIELDS)
    .order("created_at", { ascending: false });
  throwError(error);
  return data || [];
}

export async function saveCareerJob(job) {
  const supabase = client();
  const { data: authData } = await supabase.auth.getUser();
  const payload = {
    title: job.title.trim(),
    team: job.team.trim(),
    location: job.location.trim(),
    employment_type: job.employment_type,
    workplace_type: job.workplace_type,
    summary: job.summary.trim(),
    description: job.description.trim(),
    responsibilities: job.responsibilities,
    qualifications: job.qualifications,
    status: job.status,
    closes_at: job.closes_at || null,
    updated_at: new Date().toISOString(),
    ...(job.status === "published" && !job.published_at ? { published_at: new Date().toISOString() } : {}),
  };

  if (job.id) {
    const { data, error } = await supabase.from("career_jobs").update(payload).eq("id", job.id).select(JOB_FIELDS).single();
    throwError(error);
    return data;
  }

  const { data, error } = await supabase
    .from("career_jobs")
    .insert({ ...payload, created_by: authData?.user?.id || null })
    .select(JOB_FIELDS)
    .single();
  throwError(error);
  return data;
}

export async function updateCareerJobStatus(id, status) {
  const updates = {
    status,
    updated_at: new Date().toISOString(),
    ...(status === "published" ? { published_at: new Date().toISOString() } : {}),
  };
  const { data, error } = await client().from("career_jobs").update(updates).eq("id", id).select(JOB_FIELDS).single();
  throwError(error);
  return data;
}

export async function submitCareerApplication(jobId, application) {
  const payload = {
    job_id: jobId,
    full_name: application.full_name.trim(),
    email: application.email.trim().toLowerCase(),
    phone: application.phone.trim() || null,
    city: application.city.trim() || null,
    linkedin_url: application.linkedin_url.trim() || null,
    portfolio_url: application.portfolio_url.trim() || null,
    resume_url: application.resume_url.trim(),
    cover_note: application.cover_note.trim(),
    consent: application.consent === true,
    status: "received",
  };
  const { error } = await client().from("career_applications").insert(payload);
  throwError(error);
}

export async function updateCareerApplicationStatus(id, status) {
  const { error } = await client()
    .from("career_applications")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  throwError(error);
}
