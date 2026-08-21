const DEFAULT_PUBLIC_WEB_ORIGIN = "https://www.buildguru.ai";

function normalizedConfiguredOrigin() {
  const raw = String(process.env.REACT_APP_PUBLIC_WEB_URL || "").trim();
  if (!raw || raw.includes("undefined")) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.origin : "";
  } catch {
    return "";
  }
}

/** Canonical web origin for links that leave the app (share sheets, QR, email). */
export function publicWebOrigin() {
  if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
    return window.location.origin;
  }
  return normalizedConfiguredOrigin() || DEFAULT_PUBLIC_WEB_ORIGIN;
}

export function publicProfileUrl(slug) {
  const safeSlug = encodeURIComponent(String(slug || "").trim());
  return `${publicWebOrigin()}/profile/${safeSlug}`;
}
