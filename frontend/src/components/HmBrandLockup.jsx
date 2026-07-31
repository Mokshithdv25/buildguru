import React from "react";
import { Link } from "react-router-dom";
import {
  HM_HUB_DEMO_PROJECT,
  HM_LOGO_COMPACT,
  HM_SIDEBAR_WORDMARK_CLASS,
  HM_TAGLINE_BUILD_CHOOSER,
  HM_TAGLINE_PROJECT_HUB,
  HM_WORDMARK_TAGLINE_CLASS,
  HM_WORDMARK_TAGLINE_SINGLE_LINE,
  HM_WORDMARK_TITLE_CLASS,
  HM_PROJECT_HUB_HEADER_CLASS,
  hmLogoMarkSrc,
} from "../lib/hmBrand";

/**
 * Marketing / wizard header — logo + wordmark link to the platform home (`/`).
 * Default tagline: build chooser. Pass {@link HM_TAGLINE_NEW_HOME}, {@link HM_TAGLINE_REMODEL}, or {@link HM_TAGLINE_PORTFOLIO} per flow.
 * Use {@link HM_WORDMARK_TAGLINE_SINGLE_LINE} for one-line project hub toolbars.
 */
export function HmHeaderBrandLockup({
  tagline = HM_TAGLINE_BUILD_CHOOSER,
  to = "/",
  className = "",
  truncateTitle = false,
  taglineClassName,
}) {
  const subline = taglineClassName || HM_WORDMARK_TAGLINE_CLASS;
  return (
    <Link
      to={to}
      title={tagline}
      aria-label={`BuildGuru. ${tagline}`}
      className={`flex items-center gap-2.5 md:gap-4 no-underline text-inherit shrink-0 ${className}`.trim()}
    >
      <img
        src={hmLogoMarkSrc}
        alt=""
        className="w-12 h-12 md:w-[60px] md:h-[60px] shrink-0"
        width={60}
        height={60}
        decoding="async"
      />
      <div className={`leading-tight min-w-0${truncateTitle ? " min-w-0" : ""}`}>
        <div className={`${HM_WORDMARK_TITLE_CLASS}${truncateTitle ? " truncate" : ""}`}>BuildGuru</div>
        <div className={subline}>{tagline}</div>
      </div>
    </Link>
  );
}

/**
 * Project sidebar rail — default {@link HM_LOGO_COMPACT}; pass a larger `size` + `titleClassName` for /project.
 * Optional `tagline` for the project-management subline (see {@link HM_TAGLINE_PROJECT_HUB}).
 */
export function HmSidebarBrandMark({ className = "", size, titleClassName, tagline }) {
  const logoSize = size !== undefined && size !== null ? size : HM_LOGO_COMPACT;
  return (
    <div className={`flex flex-col min-w-0 w-full ${tagline ? "gap-1" : ""} ${className}`.trim()}>
      <div className="flex items-center gap-3.5 min-w-0">
        <img
          src={hmLogoMarkSrc}
          alt=""
          width={logoSize}
          height={logoSize}
          className="shrink-0"
          style={{ width: logoSize, height: logoSize }}
          decoding="async"
        />
        <span className={titleClassName || HM_SIDEBAR_WORDMARK_CLASS}>BuildGuru</span>
      </div>
      {tagline ? (
        <p
          className="text-[11px] font-semibold text-[#1C1917] leading-snug mt-1.5 pr-0.5"
          style={{ wordBreak: "break-word" }}
        >
          {tagline}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Center of project hub: current project (matches demo identity across tools).
 * Full-width border under the app header (same line treatment as build / remodel / portfolio bars).
 */
export function ProjectHubProjectCenter({
  line1 = HM_HUB_DEMO_PROJECT.line1,
  line2 = HM_HUB_DEMO_PROJECT.line2,
  meta = HM_HUB_DEMO_PROJECT.meta,
  showEdit = true,
}) {
  return (
    <div className="min-w-0 w-full sm:px-1">
      <div className="mx-auto max-w-2xl text-center">
        <div className="inline-flex max-w-full flex-wrap items-center justify-center gap-1.5">
          <h1 className="m-0 text-center font-serif-display text-base font-semibold leading-snug text-[#1C1917] sm:text-lg md:text-xl">
            {line1}
            <span className="font-medium text-[#57534E]"> · {line2}</span>
          </h1>
          {showEdit ? (
            <button type="button" className="bg-transparent p-0 text-sm text-[#9A8F87] cursor-default border-none" aria-label="Project name" tabIndex={-1}>
              ✏️
            </button>
          ) : null}
        </div>
        {meta ? <p className="m-0 mt-0.5 text-center text-[11px] text-[#9A8F87] sm:text-xs">{meta}</p> : null}
      </div>
    </div>
  );
}

/**
 * Sticky top bar: same mark + title + tagline as build / remodel / portfolio ({@link HM_WORDMARK_TITLE_CLASS}).
 * Optional `center` (usually {@link ProjectHubProjectCenter}) and `trailing` (alerts, profile).
 */
export function ProjectHubAppHeader({ center, trailing = null }) {
  return (
    <header className={HM_PROJECT_HUB_HEADER_CLASS}>
      <div className="min-w-0 flex shrink-0 justify-start sm:col-start-1">
        <HmHeaderBrandLockup
          tagline={HM_TAGLINE_PROJECT_HUB}
          taglineClassName={HM_WORDMARK_TAGLINE_SINGLE_LINE}
        />
      </div>
      {center ? (
        <div className="min-w-0 border-t border-black/5 pt-3 sm:order-none sm:col-start-2 sm:border-t-0 sm:pt-0">
          {center}
        </div>
      ) : null}
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 sm:col-start-3 sm:shrink-0 sm:pl-1 md:pl-2">{trailing}</div>
    </header>
  );
}
