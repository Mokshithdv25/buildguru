import React, { useEffect, useState } from "react";

const OR = "#C85F2B";

export function V0GeneratingPanel({ phase = "images", statusLine = "" }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [phase]);
  const step1Active = phase === "images" || phase === "revision";
  const floorActive = phase === "floor_plans";
  const step2Active = phase === "estimate";
  const step1Done = step2Active;
  const row = (n, label, sub, active, done) => (
    <div
      key={n}
      style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 12px", borderRadius: 10,
        background: active ? "rgba(200,95,43,0.08)" : "transparent",
        border: active ? "1px solid rgba(200,95,43,0.25)" : "1px solid transparent" }}
    >
      <div
        style={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center",
          justifyContent: "center", fontSize: 11, fontWeight: 800,
          background: done ? "#22A36B" : active ? "#C85F2B" : "#E7E5E4", color: done || active ? "#fff" : "#78716C" }}
      >{done ? "\u2713" : n}</div>
      <div><div style={{ fontSize: 13, fontWeight: 700 }}>{label}</div><div style={{ fontSize: 12, color: "#78716C" }}>{sub}</div></div>
    </div>
  );
  return (
    <div style={{ padding: "24px 20px", background: "linear-gradient(180deg,#FFFBF7,#FDF8F3)", border: "1px solid #EEDCCB", borderRadius: 14, marginBottom: 20 }}>
      <div style={{ fontSize: 15, fontWeight: 800, textAlign: "center", marginBottom: 4 }}>
        {floorActive ? "AI is drawing your floor plan" : phase === "revision" ? "AI is revising your design" : "AI is creating your exterior concept"}
      </div>
      <p style={{ fontSize: 12, color: "#7A6E62", textAlign: "center", margin: "0 0 8px" }}>
        Keep this page open. The request is active · {elapsed}s elapsed
      </p>
      {statusLine ? (
        <p style={{ fontSize: 12, color: "#C85F2B", textAlign: "center", margin: "0 0 16px", fontWeight: 600, lineHeight: 1.45 }}>
          {statusLine}
        </p>
      ) : null}
      {row(1, phase === "revision" ? "Design revision" : "Exterior concept", step1Active ? "Rendering…" : floorActive || step2Active ? "Done" : "Waiting", step1Active, floorActive || step1Done)}
      {row(2, "Floor plan", floorActive ? "Drawing from the approved exterior…" : "Available after the exterior", floorActive, false)}
      {row(3, "Estimate", step2Active ? "Building INR lines…" : "Saved with the free concept", step2Active, false)}
      <div style={{ height: 5, marginTop: 14, borderRadius: 99, overflow: "hidden", background: "#EDE8E0" }}>
        <div className="hm-v0-progress-pulse" style={{ width: "42%", height: "100%", borderRadius: 99, background: OR }} />
      </div>
    </div>
  );
}

export function V0MilestonesSection({ planBundle }) {
  const milestones = planBundle?.milestones;
  if (!milestones?.length) return null;
  return (
    <div style={{ marginBottom: 20, border: "1px solid #EEDCCB", borderRadius: 14, background: "#FFFBF7" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #EDE8E0", fontWeight: 800 }}>Project milestones</div>
      <ul style={{ margin: 0, padding: "12px 16px 16px 32px", fontSize: 13, lineHeight: 1.6 }}>
        {milestones.map((m, i) => (
          <li key={i}><strong>{m.title}</strong>{m.timeframe ? ` — ${m.timeframe}` : ""}</li>
        ))}
      </ul>
    </div>
  );
}

export function formatInr(amount) {
  if (amount == null || amount === "") return "—";
  const n = Number(amount);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

function sumEstimateLines(lines) {
  if (!Array.isArray(lines)) return 0;
  return lines.reduce((s, l) => {
    const v = l?.amount_inr;
    return s + (typeof v === "number" && Number.isFinite(v) ? v : 0);
  }, 0);
}

function estimateCsv(planBundle) {
  const rows = [["Line item", "Quantity", "Unit", "Unit rate INR", "Low INR", "Expected INR", "High INR", "Basis / note"]];
  (planBundle?.estimate_lines || []).forEach((line) => rows.push([
    line.label, line.quantity ?? "", line.unit || "", line.unit_rate_inr ?? "",
    line.low_inr ?? "", line.amount_inr ?? "", line.high_inr ?? "", line.note || "",
  ]));
  rows.push(["Indicative subtotal", "", "", "", "", planBundle?.total_indicative_inr ?? sumEstimateLines(planBundle?.estimate_lines), "", "Ex-GST unless stated"]);
  return rows.map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
}

function downloadEstimateCsv(planBundle) {
  const blob = new Blob([estimateCsv(planBundle)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `buildguru-estimate-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * Indicative cost breakdown from plan/estimate API (or mock).
 */
export function V0EstimateSection({ planBundle, title = "Design plan estimate (for your architect)" }) {
  const lines = planBundle?.estimate_lines;
  if (!lines?.length) return null;
  const total =
    typeof planBundle?.total_indicative_inr === "number"
      ? planBundle.total_indicative_inr
      : sumEstimateLines(lines);

  return (
    <div
      style={{
        border: "1px solid #EEDCCB",
        borderRadius: 14,
        overflow: "hidden",
        marginBottom: 20,
        background: "linear-gradient(180deg,#FFFBF7,#FDFBF8)",
      }}
    >
      <div style={{ padding: "14px 16px", borderBottom: "1px solid #EDE8E0", background: "#FBF6F0", display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
        <div><div style={{ fontWeight: 800, fontSize: 15, color: "#1C1917" }}>{title}</div>
        <div style={{ fontSize: 12, color: "#78716C", marginTop: 4, lineHeight: 1.45 }}>
          Working estimate for professional validation. Range, quantity, and rate quality improve as dimensions and specifications are confirmed.
        </div></div>
        <button type="button" onClick={() => downloadEstimateCsv(planBundle)} style={{ border: "1px solid #C85F2B", color: "#A54818", background: "#fff", borderRadius: 8, padding: "8px 10px", fontSize: 12, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}>Download CSV</button>
      </div>
      <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 760 }}>
        <thead>
          <tr style={{ textAlign: "left", color: "#78716C", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            <th style={{ padding: "10px 16px", fontWeight: 700, borderBottom: "1px solid #EDE8E0" }}>Line item</th>
            <th style={{ padding: "10px 10px", fontWeight: 700, borderBottom: "1px solid #EDE8E0", textAlign: "right" }}>Qty</th>
            <th style={{ padding: "10px 10px", fontWeight: 700, borderBottom: "1px solid #EDE8E0" }}>Unit</th>
            <th style={{ padding: "10px 10px", fontWeight: 700, borderBottom: "1px solid #EDE8E0", textAlign: "right" }}>Rate</th>
            <th style={{ padding: "10px 16px", fontWeight: 700, borderBottom: "1px solid #EDE8E0", textAlign: "right" }}>Expected / range</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((row, i) => (
            <tr key={i} style={{ borderBottom: "1px solid #F5F0EA" }}>
              <td style={{ padding: "12px 16px", color: "#44403C", verticalAlign: "top" }}>
                <div style={{ fontWeight: 600 }}>{row.label}</div>
                {row.note ? <div style={{ fontSize: 11, color: "#78716C", marginTop: 4, lineHeight: 1.4 }}>{row.note}</div> : null}
              </td>
              <td style={{ padding: "12px 10px", textAlign: "right", verticalAlign: "top" }}>{row.quantity ?? "—"}</td>
              <td style={{ padding: "12px 10px", verticalAlign: "top" }}>{row.unit || "allowance"}</td>
              <td style={{ padding: "12px 10px", textAlign: "right", whiteSpace: "nowrap", verticalAlign: "top" }}>{row.unit_rate_inr ? formatInr(row.unit_rate_inr) : "—"}</td>
              <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 700, color: "#1C1917", whiteSpace: "nowrap", verticalAlign: "top" }}>
                <div>{formatInr(row.amount_inr)}</div>
                {row.low_inr || row.high_inr ? <div style={{ fontSize: 11, color: "#78716C", fontWeight: 500, marginTop: 3 }}>{formatInr(row.low_inr)}–{formatInr(row.high_inr)}</div> : null}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ background: "#FDF8F3" }}>
            <td colSpan={4} style={{ padding: "14px 16px", fontWeight: 800, color: "#1C1917" }}>Indicative subtotal (ex-GST)</td>
            <td style={{ padding: "14px 16px", textAlign: "right", fontWeight: 800, fontSize: 16, color: OR, fontVariantNumeric: "tabular-nums" }}>
              {formatInr(total)}
            </td>
          </tr>
        </tfoot>
      </table></div>
      {planBundle?.project_summary ? (
        <div style={{ padding: "12px 16px 16px", fontSize: 12, color: "#57534E", lineHeight: 1.55, borderTop: "1px solid #EDE8E0" }}>
          {planBundle.project_summary}
        </div>
      ) : null}
      {(planBundle?.estimate_basis || planBundle?.assumptions?.length || planBundle?.exclusions?.length) ? (
        <div style={{ padding: "14px 16px 16px", borderTop: "1px solid #EDE8E0", display: "grid", gap: 12, fontSize: 12, lineHeight: 1.5 }}>
          <div><strong>Estimate basis</strong><div style={{ color: "#57534E", marginTop: 3 }}>{planBundle.estimate_basis || "Structured brief and regional allowances."} · Confidence: {planBundle.confidence || "low"}</div></div>
          {planBundle.assumptions?.length ? <div><strong>Assumptions</strong><ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{planBundle.assumptions.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
          {planBundle.exclusions?.length ? <div><strong>Exclusions</strong><ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{planBundle.exclusions.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
        </div>
      ) : null}
    </div>
  );
}

/** Large concept image — caption below, minimal chrome (no thumbnail boxes). */
async function downloadVisual(url, label) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("download failed");
    const blobUrl = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a");
    anchor.href = blobUrl;
    anchor.download = `${String(label || "buildguru-v0").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.jpg`;
    anchor.click();
    URL.revokeObjectURL(blobUrl);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

function conceptImageCard(entry, i, variant = "elevation", onOpen) {
  const label = entry && typeof entry === "object" ? entry.label || `Concept ${i + 1}` : `Concept ${i + 1}`;
  const url = entry?.url;
  const hint = entry?.hint;
  const isPlan = variant === "plan";

  return (
    <figure key={label + i} style={{ margin: 0 }}>
      <div
        style={{
          position: "relative",
          width: "100%",
          borderRadius: 16,
          overflow: "hidden",
          background: "#F5F0EA",
          boxShadow: "0 12px 40px -12px rgba(28, 25, 23, 0.18)",
          ...(isPlan
            ? { minHeight: 340, display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }
            : { aspectRatio: variant === "interior" ? "4 / 3" : "16 / 9", minHeight: 300 }),
        }}
      >
        {url ? (
          <img
            src={url}
            alt={label}
            loading="lazy"
            style={{
              width: "100%",
              height: isPlan ? "auto" : "100%",
              maxHeight: isPlan ? 520 : undefined,
              display: "block",
              objectFit: isPlan ? "contain" : "cover",
              objectPosition: "center",
            }}
          />
        ) : null}
        {url ? (
          <div style={{ position: "absolute", right: 10, bottom: 10, display: "flex", gap: 8 }}>
            <button type="button" onClick={() => onOpen?.(entry)} aria-label={`Zoom ${label}`} style={{ border: "none", borderRadius: 999, padding: "8px 12px", background: "rgba(28,25,23,.82)", color: "#fff", fontWeight: 700, cursor: "pointer" }}>⌕ Zoom</button>
            <button type="button" onClick={() => downloadVisual(url, label)} aria-label={`Download ${label}`} style={{ border: "none", borderRadius: 999, padding: "8px 12px", background: "rgba(255,255,255,.92)", color: "#1C1917", fontWeight: 700, cursor: "pointer" }}>↓ Download</button>
          </div>
        ) : null}
      </div>
      <figcaption style={{ paddingTop: 12, paddingBottom: 4 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: "#1C1917", letterSpacing: "-0.01em" }}>{label}</div>
        {hint ? (
          <div style={{ fontSize: 13, color: "#57534E", marginTop: 6, lineHeight: 1.5, maxWidth: 720 }}>{hint}</div>
        ) : null}
      </figcaption>
    </figure>
  );
}

/**
 * Renders `floor_plans` + `images` from v0 image bundle (mock or API).
 */
export function V0VisualBundleSections({
  bundle,
  floorPlanTitle = "Floor plans (AI v0)",
  elevationTitle = "Elevations & massing",
  interiorRenders = false,
}) {
  const [zoomed, setZoomed] = useState(null);
  let floorPlans = Array.isArray(bundle?.floor_plans) ? bundle.floor_plans : [];
  let elevations = Array.isArray(bundle?.images) ? bundle.images : [];

  /* Older mocks only had `images`; split by label when we can tell plans from elevations */
  if (!floorPlans.length && elevations.length) {
    const planish = (e) => /plan|floor|layout|blueprint/i.test(String(e?.label || ""));
    const fp = elevations.filter(planish);
    const el = elevations.filter((e) => !planish(e));
    if (fp.length) {
      floorPlans = fp;
      elevations = el;
    }
  }

  if (!floorPlans.length && !elevations.length) return null;

  return (
    <>
      {floorPlans.length ? (
        <div style={{ marginBottom: 36 }}>
          <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 8, color: "#1C1917" }}>{floorPlanTitle}</div>
          <p style={{ fontSize: 13, color: "#57534E", margin: "0 0 20px", lineHeight: 1.5 }}>
            Layout directions for briefing — not sanction drawings.
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: floorPlans.length > 1 ? "repeat(auto-fit, minmax(320px, 1fr))" : "1fr",
              gap: 28,
            }}
          >
            {floorPlans.map((e, i) => conceptImageCard(e, i, "plan", setZoomed))}
          </div>
        </div>
      ) : null}
      {elevations.length ? (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 8, color: "#1C1917" }}>{elevationTitle}</div>
          <p style={{ fontSize: 13, color: "#57534E", margin: "0 0 20px", lineHeight: 1.5 }}>
            Concept directions from your brief — share with your architect to refine.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
            {elevations.map((e, i) => conceptImageCard(e, i, interiorRenders ? "interior" : "elevation", setZoomed))}
          </div>
        </div>
      ) : null}
      {zoomed?.url ? (
        <div role="dialog" aria-modal="true" aria-label={zoomed.label || "AI design preview"} onClick={() => setZoomed(null)} style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(17,15,13,.9)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <button type="button" onClick={() => setZoomed(null)} aria-label="Close zoom" style={{ position: "absolute", top: 18, right: 22, border: "none", background: "rgba(255,255,255,.14)", color: "#fff", borderRadius: 999, width: 42, height: 42, fontSize: 22, cursor: "pointer" }}>×</button>
          <img src={zoomed.url} alt={zoomed.label || "AI design"} onClick={(event) => event.stopPropagation()} style={{ maxWidth: "94vw", maxHeight: "88vh", objectFit: "contain", borderRadius: 12, boxShadow: "0 24px 80px rgba(0,0,0,.45)" }} />
        </div>
      ) : null}
      <style>{`@keyframes hmV0Pulse{0%{transform:translateX(-110%)}100%{transform:translateX(260%)}}.hm-v0-progress-pulse{animation:hmV0Pulse 1.8s ease-in-out infinite}`}</style>
    </>
  );
}
