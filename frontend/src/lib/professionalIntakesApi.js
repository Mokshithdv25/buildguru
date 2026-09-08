const SUPABASE_URL = String(process.env.REACT_APP_SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_ANON_KEY = String(process.env.REACT_APP_SUPABASE_ANON_KEY || "").trim();
const OPS_KEY = String(process.env.REACT_APP_PROFESSIONAL_INTAKE_OPS_KEY || "").trim();
const OPS_URL = `${SUPABASE_URL}/functions/v1/buildguru-professional-intake-ops`;

export function isProfessionalIntakeOpsConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && OPS_KEY);
}

async function opsRequest(options = {}) {
  if (!isProfessionalIntakeOpsConfigured()) {
    throw new Error("Local professional intake is not configured.");
  }
  const response = await fetch(OPS_URL, {
    ...options,
    headers: {
      "x-buildguru-ops-key": OPS_KEY,
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Could not update Supabase.");
  return payload;
}

export function isProfessionalIntakesSchemaMissing(error) {
  return ["42P01", "PGRST205"].includes(error?.code)
    || /professional_intakes|professional-intake-media/i.test(error?.message || "");
}

export async function listProfessionalIntakes() {
  return { configured: true, intakes: [] };
}

function cleanOptional(value) {
  const cleaned = String(value || "").trim();
  return cleaned || null;
}

function intakePayload(form) {
  return {
    id: form.id || null,
    craft: form.craft || "architect",
    slug: form.slug || null,
    is_listed: form.is_listed === true,
    full_name: String(form.full_name || "").trim(),
    business_name: String(form.business_name || "").trim(),
    email: cleanOptional(form.email)?.toLowerCase() || null,
    phone: String(form.phone || "").trim(),
    city: String(form.city || "Bengaluru").trim(),
    address: String(form.address || "").trim(),
    website_url: cleanOptional(form.website_url),
    google_maps_url: cleanOptional(form.google_maps_url),
    years_experience: cleanOptional(form.years_experience),
    license_number: cleanOptional(form.license_number),
    short_bio: cleanOptional(form.short_bio),
    specialties: (form.specialties || []).map((item) => String(item).trim()).filter(Boolean),
    status: form.status || "onboarded",
  };
}

export async function saveProfessionalIntake(form) {
  if (form.id) throw new Error("Create a new record from this local page instead of editing an existing profile.");
  const payload = await opsRequest({
    method: "POST",
    body: JSON.stringify({ action: "create", record: intakePayload(form) }),
  });
  return payload.intake;
}

export async function uploadProfessionalIntakeMedia(intakeId, files) {
  let latest = null;
  for (const file of files) {
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) {
      throw new Error(`${file.name}: use JPG, PNG, or WebP.`);
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new Error(`${file.name}: each image must be 5 MB or smaller.`);
    }
    const body = new FormData();
    body.append("intake_id", intakeId);
    body.append("file", file, file.name);
    const payload = await opsRequest({ method: "POST", body });
    latest = payload.intake;
  }
  return latest;
}

export async function addProfessionalIntakeMedia(intake, files) {
  if (!files.length) return intake;
  const remainingSlots = Math.max(0, 10 - (intake.work_sample_paths || []).length);
  if (!remainingSlots) throw new Error("This architect already has the maximum of 10 images.");
  return (await uploadProfessionalIntakeMedia(intake.id, files.slice(0, remainingSlots))) || intake;
}
