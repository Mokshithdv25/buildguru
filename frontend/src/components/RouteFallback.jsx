import React from "react";
import { HM_HEADER_BAR_CHROME_CLASS, hmLogoMarkSrc } from "../lib/hmBrand";
import HmMarketingWordmark from "./HmMarketingWordmark";

/** Full-viewport placeholder so route changes never flash a blank cream page. */
export default function RouteFallback({ label = "Loading BuildGuru…" }) {
  return (
    <div className="hm-route-fallback" role="status" aria-live="polite">
      <div className={`hm-route-fallback__bar ${HM_HEADER_BAR_CHROME_CLASS}`}>
        <img src={hmLogoMarkSrc} alt="" width={48} height={48} />
        <HmMarketingWordmark className="!pb-0 !text-[28px] md:!text-[32px]" />
      </div>
      <div className="hm-route-fallback__body">
        <span className="hm-route-fallback__spinner" aria-hidden />
        <p>{label}</p>
      </div>
    </div>
  );
}
