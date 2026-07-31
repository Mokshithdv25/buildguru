import React from "react";
import { PenLine } from "lucide-react";

const OR = "#C85F2B";

/**
 * Explains that sanction-grade work is paid to the architect — not a fixed BuildGuru “drawing package”.
 */
export default function ArchitectEngagementCallout({ onBrowseArchitects }) {
  return (
    <div
      style={{
        border: "1.5px solid #EEDCCB",
        background: "linear-gradient(180deg, #FFFBF7, #FDFBF8)",
        borderRadius: 16,
        padding: "20px 22px",
        marginBottom: 20,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
        <span
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            background: "#E8E4DE",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <PenLine size={20} color="#44403C" aria-hidden />
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: "#1C1917", lineHeight: 1.25 }}>Real drawings = your architect&apos;s scope</div>
          <p style={{ fontSize: 13, color: "#57534E", lineHeight: 1.55, margin: "8px 0 0" }}>
            Floor plans, elevations, sanctions, and site-ready coordination are produced by a licensed professional you engage.
            <strong> Their fee is between you and them</strong> — we don&apos;t price that here. Use the v0 pack above so they see vision,
            constraints, and numbers before they quote.
          </p>
          <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 12, color: "#44403C", lineHeight: 1.5 }}>
            <li style={{ marginBottom: 4 }}>BuildGuru doesn&apos;t assign an architect in the free v0 step</li>
            <li style={{ marginBottom: 4 }}>Share this brief + v0 so they understand you faster — then you agree scope &amp; fees directly</li>
            <li>Project hub is where execution starts, when you&apos;re ready to pull the team in</li>
          </ul>
        </div>
      </div>
      {typeof onBrowseArchitects === "function" ? (
        <button
          type="button"
          onClick={onBrowseArchitects}
          className="btn-continue !rounded-xl !px-5 !py-2.5 text-sm"
          style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
        >
          <span style={{ color: OR, fontWeight: 700 }}>Find architects</span>
          <span style={{ fontSize: 12, fontWeight: 500, color: "#57534E" }}>Marketplace · get quotes</span>
        </button>
      ) : null}
    </div>
  );
}
