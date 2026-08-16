import { getProOnboardingResumePath, readHmSession } from "./hmAuth";

/**
 * Pro onboarding entry — no sign-in wall while auth is off.
 * Static fallback is step 1 (`/craft`). Prefer getProEntryPath() at click time
 * so new pros start at step 1 and returning pros resume at the right step
 * instead of being dropped on the last step and bounced backward.
 */
export const PRO_ENTRY_PATH = "/craft";

/** Resume-aware pro entry: published pros go to their dashboard; everyone
 * else starts onboarding at step 1 (/craft). Mid-flow resume is intentionally
 * NOT used here — it belongs to the account "Edit portfolio" action — so the
 * marketing "Join as a Pro" CTA always begins at the first step. */
export function getProEntryPath() {
  const session = readHmSession();
  if (!session?.supabaseUserId || session.role !== "pro") return "/pro/join";
  const resume = getProOnboardingResumePath();
  return resume === "/pro/dashboard" ? resume : PRO_ENTRY_PATH;
}
