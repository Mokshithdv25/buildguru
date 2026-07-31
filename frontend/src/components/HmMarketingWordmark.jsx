import React from "react";
import { HM_WORDMARK_TITLE_CLASS } from "../lib/hmBrand";

/** Marketing lockup — BuildGuru on landing nav and footer only. */
export default function HmMarketingWordmark({ className = "", as: Tag = "span" }) {
  return <Tag className={`${HM_WORDMARK_TITLE_CLASS} ${className}`.trim()}>BuildGuru</Tag>;
}
