export const ARCHITECT_PRODUCT_MANAGER_JOB_ID = "00000000-0000-4000-8000-000000000101";

export function roleUsesCareerApplicationProfile(job) {
  return String(job?.id || "") === ARCHITECT_PRODUCT_MANAGER_JOB_ID;
}
