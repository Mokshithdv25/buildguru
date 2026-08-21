/** Registered legal entity (Razorpay / payment gateway website verification). */
export const LEGAL_BUSINESS_NAME = (process.env.REACT_APP_LEGAL_BUSINESS_NAME || "").trim();

export const LEGAL_BUSINESS_ADDRESS = (process.env.REACT_APP_LEGAL_BUSINESS_ADDRESS || "").trim();

export const SUPPORT_EMAIL = (process.env.REACT_APP_SUPPORT_EMAIL || "").trim();

export const PUBLIC_WEB_ORIGIN =
  (process.env.REACT_APP_PUBLIC_WEB_URL || "https://www.buildguru.ai").replace(/\/$/, "");

/** Footer line: brand + registered name when configured. */
export function legalEntityLine() {
  if (LEGAL_BUSINESS_NAME) {
    return `BuildGuru is a product of ${LEGAL_BUSINESS_NAME}.`;
  }
  return "BuildGuru · buildguru.ai";
}

/** Optional registered-office detail for legal pages. */
export function legalEntityDetailsParagraph() {
  if (!LEGAL_BUSINESS_NAME) return null;
  return LEGAL_BUSINESS_ADDRESS ? `Registered office: ${LEGAL_BUSINESS_ADDRESS}.` : null;
}
