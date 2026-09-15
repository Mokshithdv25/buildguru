import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import ProjectHubShell from "../components/ProjectHubShell";
import BackButton from "../components/BackButton";
import { formatInrShort, loadProjectBoard } from "../lib/projectFlowApi";

const OR = "#C85F2B";
const AI_BADGE = "#7A4FC0";
const ARCH_BADGE = "#2A6496";

const panel = {
  background: "linear-gradient(180deg, #FDFCFB 0%, #FAF9F7 100%)",
  borderRadius: 12,
  border: "1px solid #E8E6E3",
  boxShadow: "0 1px 2px rgba(28, 25, 23, 0.045)",
};

function StepHeader({ step, title, subtitle, accent }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 16 }}>
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: accent,
          color: "#fff",
          fontSize: 15,
          fontWeight: 800,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {step}
      </div>
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>{title}</h2>
        {subtitle ? (
          <p style={{ fontSize: 13, color: "#7A6E62", margin: "6px 0 0", lineHeight: 1.45 }}>{subtitle}</p>
        ) : null}
      </div>
    </div>
  );
}

/** Demo narrative when no projectId in URL. */
const DEMO_STEPS = {
  client: {
    step: 1,
    title: "What you gave us (client input)",
    subtitle: "Everything the family and site context contributed before serious drawing work — the brief the AI and architect had to respect.",
    captured: "Captured: 5–10 Mar 2024 (intake & follow-up)",
    blocks: [
      {
        label: "Site & rules",
        text: "30×50 corner plot, BBMP; setbacks and road widths fixed from day one. Two covered cars + visitor scooter; lift shaft reserved for a later phase.",
      },
      {
        label: "Style & programme",
        text: "Calm modern Indian — wood, stone, lots of natural light; not a glossy “hotel” look. 3 bedrooms, study, open kitchen–dining, utility, staff room, terrace sit-out.",
      },
    ],
  },
  ai: {
    step: 2,
    title: "What AI generated",
    subtitle: "First-pass artefacts from your answers — narrative, massing ideas, and a rough cost shape.",
    rows: [
      { when: "12 Mar 2024", body: <><strong>v0 narrative brief</strong> — scope story and suggested phasing.</> },
      { when: "22 Mar 2024", body: <><strong>Estimate skeleton</strong> — broad BOQ buckets tied to the brief.</> },
    ],
  },
  architect: {
    step: 3,
    title: "What the architect refined",
    subtitle: "Professional drawings — resolving clashes, code, and how you actually live in the house.",
    rows: [{ when: "28 Mar 2024", body: <>Scheme revisions and circulation improvements.</> }],
  },
  agreed: {
    step: 4,
    title: "What was finally agreed",
    subtitle: "The line in the sand after reviews — what site and contracts treat as approved.",
    when: "Pending quotes",
    bullets: [<>Post your project or invite pros to send proposals for the next scope.</>],
  },
};

function clientBlocksFromBrief(brief, flowType) {
  const blocks = [];
  if (brief?.location || brief?.city) {
    blocks.push({ label: "Location", text: [brief.location, brief.city].filter(Boolean).join(" · ") });
  }
  if (brief?.room || brief?.homeType) {
    blocks.push({
      label: flowType === "remodel" ? "Space" : "Home type",
      text: brief.room || brief.homeType,
    });
  }
  if (brief?.dreamVision || brief?.homeVision) {
    blocks.push({ label: "Vision", text: String(brief.dreamVision || brief.homeVision).slice(0, 400) });
  }
  if (brief?.mainGoal) {
    blocks.push({ label: "Goals", text: brief.mainGoal });
  }
  if (brief?.budgetLabel || brief?.budgetInr) {
    blocks.push({
      label: "Budget band",
      text: brief.budgetLabel || formatInrShort(brief.budgetInr),
    });
  }
  if (brief?.completionTime || brief?.timeline) {
    blocks.push({ label: "Timeline", text: brief.completionTime || brief.timeline });
  }
  return blocks.length ? blocks : [{ label: "Brief", text: "Your wizard answers are saved on this project." }];
}

function stepsFromBoard(board) {
  const brief = board?.brief || {};
  const v0 = board?.v0Pack;
  const estimate = v0?.estimate;
  const flowType = board?.project?.flow_type || "new_home";
  const generated = v0?.generatedAt
    ? new Date(v0.generatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : "Saved with your project";

  const aiRows = [];
  if (estimate?.project_summary) {
    aiRows.push({
      when: generated,
      body: <><strong>v0 summary</strong> — {estimate.project_summary}</>,
    });
  }
  const imgCount = (v0?.images?.images || []).length;
  if (imgCount > 0) {
    aiRows.push({
      when: generated,
      body: (
        <>
          <strong>{imgCount} concept image{imgCount > 1 ? "s" : ""}</strong> — stored on your project board (Site feed &amp; Documents).
        </>
      ),
    });
  }
  if (estimate?.estimate_lines?.length) {
    aiRows.push({
      when: generated,
      body: (
        <>
          <strong>Indicative estimate</strong> — {estimate.estimate_lines.length} line items
          {estimate.total_indicative_inr != null ? ` totalling ${formatInrShort(estimate.total_indicative_inr)}` : ""} (ballpark).
        </>
      ),
    });
  }
  if (!aiRows.length) {
    aiRows.push({
      when: "—",
      body: <>Generate v0 in the build or remodel flow to populate this section.</>,
    });
  }

  const handoff = brief?.architectHandoffNote || brief?.architectComment;
  const agreedBullets = [
    ...(estimate?.milestones || []).slice(0, 3).map((m) => (
      <span key={m.title}>
        <strong>{m.title}</strong>
        {m.timeframe ? ` — ${m.timeframe}` : ""}
      </span>
    )),
    handoff ? <>Notes for pros: {String(handoff).slice(0, 200)}</> : null,
  ].filter(Boolean);

  return {
    client: {
      step: 1,
      title: "What you gave us (client input)",
      subtitle: "Your wizard brief — saved per project for you and your architect.",
      captured: `Saved: ${generated}`,
      blocks: clientBlocksFromBrief(brief, flowType),
    },
    ai: {
      step: 2,
      title: "What AI generated",
      subtitle: "v0 design images and indicative estimate from your brief (not a final quote).",
      rows: aiRows,
      images: (v0?.images?.images || []).slice(0, 4),
    },
    architect: {
      step: 3,
      title: "What professionals quote next",
      subtitle: "Pros review your v0 pack and send proposals for drawings, sanction, and build scope.",
      rows: handoff
        ? [{ when: "Posted", body: <>{handoff}</> }]
        : [{ when: "—", body: <>Post the project for marketplace quotes or invite your own team from Find Pros.</> }],
    },
    agreed: {
      step: 4,
      title: "Planning checklist (from v0)",
      subtitle: "Milestones and tasks seeded from your estimate — track them on the project board.",
      when: generated,
      bullets:
        agreedBullets.length > 0
          ? agreedBullets
          : [<>Open Overview to see tasks created from your v0 milestones.</>],
    },
  };
}

export default function ProjectDesignJourney() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("projectId") || "";
  const source = searchParams.get("source") || "";
  const [loading, setLoading] = useState(Boolean(projectId));
  const [steps, setSteps] = useState(DEMO_STEPS);

  const hubQuery = useMemo(() => {
    if (!projectId) return "";
    return `?projectId=${encodeURIComponent(projectId)}${source ? `&source=${encodeURIComponent(source)}` : ""}`;
  }, [projectId, source]);

  useEffect(() => {
    if (!projectId) {
      setSteps(DEMO_STEPS);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const board = await loadProjectBoard({ projectId, source });
        if (!cancelled && board) setSteps(stepsFromBoard(board));
      } catch (err) {
        console.error("Design journey load failed:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, source]);

  const STEPS = steps;

  return (
    <ProjectHubShell>
      <div
        className="px-5 md:px-10"
        style={{
          flex: 1,
          paddingTop: 24,
          paddingBottom: 40,
          overflowY: "auto",
          fontFamily: "'DM Sans','Inter',system-ui,sans-serif",
          color: "#1C1917",
          maxWidth: 920,
        }}
      >
        <div style={{ marginBottom: 28 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: "#9A8F87", letterSpacing: "0.1em", margin: "0 0 8px" }}>PROJECT ORIGIN</p>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>Design journey</h1>
          <p style={{ fontSize: 14, color: "#7A6E62", marginTop: 10, lineHeight: 1.55, maxWidth: 680 }}>
            Four beats: <strong>your input</strong>, <strong>what AI drafted</strong>, <strong>what the architect refined</strong>, and <strong>what everyone locked</strong>.
            {projectId ? " Showing your saved project." : " Complete a flow with v0 to populate yours."}
          </p>
          {loading ? (
            <p style={{ fontSize: 13, color: "#9A8F87", marginTop: 8 }}>Loading saved design &amp; estimate…</p>
          ) : null}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
            <BackButton to={`/project${hubQuery}`} label="Project overview" />
            <button
              type="button"
              onClick={() => navigate(`/documents${hubQuery}`)}
              style={{
                padding: "9px 16px",
                borderRadius: 9,
                border: `1.5px solid ${OR}`,
                background: "#FDF4EF",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
                color: "#44403C",
              }}
            >
              Open document vault
            </button>
          </div>
        </div>

        <section style={{ ...panel, padding: "22px 24px", marginBottom: 16 }}>
          <StepHeader step={STEPS.client.step} title={STEPS.client.title} subtitle={STEPS.client.subtitle} accent={OR} />
          <p style={{ fontSize: 12, fontWeight: 700, color: "#9A8F87", margin: "0 0 14px", letterSpacing: "0.04em" }}>{STEPS.client.captured}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {STEPS.client.blocks.map((b) => (
              <div key={b.label} style={{ paddingBottom: 14, borderBottom: "1px solid #F0EBE3" }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: OR, marginBottom: 6 }}>{b.label}</div>
                <div style={{ fontSize: 14, color: "#44403C", lineHeight: 1.55 }}>{b.text}</div>
              </div>
            ))}
          </div>
        </section>

        <section style={{ ...panel, padding: "22px 24px", marginBottom: 16, borderLeft: `4px solid ${AI_BADGE}` }}>
          <StepHeader step={STEPS.ai.step} title={STEPS.ai.title} subtitle={STEPS.ai.subtitle} accent={AI_BADGE} />
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {STEPS.ai.rows.map((r, i) => (
              <div
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: "104px 1fr",
                  gap: 12,
                  alignItems: "start",
                  padding: "14px 0",
                  borderBottom: i < STEPS.ai.rows.length - 1 ? "1px solid #F0EBE3" : "none",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: "#9A8F87" }}>{r.when}</div>
                <div style={{ fontSize: 14, color: "#44403C", lineHeight: 1.55 }}>{r.body}</div>
              </div>
            ))}
          </div>
          {STEPS.ai.images?.length ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10, marginTop: 16 }}>
              {STEPS.ai.images.map((img, i) => (
                <img
                  key={img.url || i}
                  src={img.url}
                  alt={img.label || `Concept ${i + 1}`}
                  style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 10, border: "1px solid #EDE8E0" }}
                />
              ))}
            </div>
          ) : null}
        </section>

        <section style={{ ...panel, padding: "22px 24px", marginBottom: 16, borderLeft: `4px solid ${ARCH_BADGE}` }}>
          <StepHeader step={STEPS.architect.step} title={STEPS.architect.title} subtitle={STEPS.architect.subtitle} accent={ARCH_BADGE} />
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {STEPS.architect.rows.map((r, i) => (
              <div key={i} style={{ padding: "12px 0", borderBottom: i < STEPS.architect.rows.length - 1 ? "1px solid #F0EBE3" : "none" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#9A8F87", marginBottom: 6 }}>{r.when}</div>
                <div style={{ fontSize: 14, color: "#44403C", lineHeight: 1.55 }}>{r.body}</div>
              </div>
            ))}
          </div>
        </section>

        <section style={{ ...panel, padding: "22px 24px", marginBottom: 16 }}>
          <StepHeader step={STEPS.agreed.step} title={STEPS.agreed.title} subtitle={STEPS.agreed.subtitle} accent="#57534E" />
          <p style={{ fontSize: 12, fontWeight: 700, color: "#9A8F87", margin: "0 0 12px" }}>{STEPS.agreed.when}</p>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: "#44403C", lineHeight: 1.6 }}>
            {STEPS.agreed.bullets.map((b, i) => (
              <li key={i} style={{ marginBottom: 10 }}>
                {b}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </ProjectHubShell>
  );
}
