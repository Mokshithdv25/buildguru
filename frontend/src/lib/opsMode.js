/** Internal data-entry UI is intentionally available only from a local dev build. */
export const LOCAL_OPS_UI_ENABLED =
  process.env.NODE_ENV !== "production"
  && process.env.REACT_APP_ENABLE_LOCAL_OPS_ONBOARDING !== "false";
