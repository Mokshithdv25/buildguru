import { getSupabase } from "./supabaseClient";

const JOB_FIELDS = "id,title,team,location,employment_type,workplace_type,summary,description,responsibilities,qualifications,status,published_at,closes_at,created_at,updated_at";
const APPLICATION_FIELDS = "id,job_id,full_name,email,phone,city,cover_note,candidate_profile,work_sample_paths,work_sample_captions,publish_portfolio,profile_slug,status,created_at,updated_at";
const CAREER_SAMPLES_BUCKET = "career-work-samples";

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
  const supabase = client();
  const { data, error } = await supabase
    .from("career_applications")
    .select(APPLICATION_FIELDS)
    .order("created_at", { ascending: false });
  throwError(error);
  return Promise.all((data || []).map(async (application) => {
    const paths = application.work_sample_paths || [];
    if (!paths.length) return { ...application, work_sample_urls: [] };
    const { data: signed, error: signError } = await supabase.storage
      .from(CAREER_SAMPLES_BUCKET)
      .createSignedUrls(paths, 3600);
    return {
      ...application,
      work_sample_urls: signError ? [] : (signed || []).map((item) => item.signedUrl).filter(Boolean),
    };
  }));
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
    id: application.id,
    job_id: jobId,
    full_name: application.full_name.trim(),
    email: application.email.trim().toLowerCase(),
    phone: application.phone.trim() || null,
    city: application.city.trim() || null,
    linkedin_url: null,
    portfolio_url: null,
    resume_url: null,
    cover_note: application.cover_note.trim(),
    candidate_profile: {
      experience_range: application.experience_range,
      qualification: application.qualification.trim(),
      tools: application.tools.trim(),
      specialties: application.specialties,
    },
    work_sample_paths: application.work_sample_paths,
    work_sample_captions: application.work_sample_captions,
    publish_portfolio: application.publish_portfolio === true,
    profile_slug: application.publish_portfolio ? application.profile_slug : null,
    consent: application.consent === true,
    status: "received",
  };
  const { error } = await client().from("career_applications").insert(payload);
  throwError(error);
}

function dataUrlBytes(dataUrl) {
  const match = String(dataUrl).match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!match) throw new Error("Use JPG, PNG, or WebP work samples.");
  return {
    contentType: match[1],
    bytes: Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0)),
  };
}

export async function uploadCareerWorkSamples(applicationId, samples) {
  const supabase = client();
  const paths = [];
  for (let index = 0; index < samples.length; index += 1) {
    const parsed = dataUrlBytes(samples[index].dataUrl);
    const objectId = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const extension = parsed.contentType === "image/png" ? "png" : parsed.contentType === "image/webp" ? "webp" : "jpg";
    const path = `${applicationId}/${index}-${objectId}.${extension}`;
    const { error } = await supabase.storage.from(CAREER_SAMPLES_BUCKET).upload(path, parsed.bytes, {
      contentType: parsed.contentType,
      upsert: false,
    });
    throwError(error);
    paths.push(path);
  }
  return paths;
}

export async function getPublishedCareerProfile(slug) {
  const supabase = client();
  const { data, error } = await supabase
    .from("published_career_profiles")
    .select("id,slug,full_name,city,short_bio,candidate_profile,work_sample_paths,work_sample_captions,created_at")
    .eq("slug", slug)
    .maybeSingle();
  throwError(error);
  if (!data) throw new Error("Portfolio not found.");
  const { data: signed, error: signError } = await supabase.storage
    .from(CAREER_SAMPLES_BUCKET)
    .createSignedUrls(data.work_sample_paths || [], 3600);
  throwError(signError);
  return {
    ...data,
    work_sample_urls: (signed || []).map((item) => item.signedUrl).filter(Boolean),
  };
}

export async function updateCareerApplicationStatus(id, status) {
  const { error } = await client()
    .from("career_applications")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  throwError(error);
}
