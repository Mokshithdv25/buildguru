import React, { useEffect, useMemo, useState } from "react";
import { ArrowRight, Bot, Check, FileSearch, ShieldCheck, Sparkles, Users } from "lucide-react";
import { listPublishedPortfolios } from "../lib/api";
import { briefScopeWords, primaryCraftForBrief, rankPros } from "../lib/proMatching";
import { craftLabel, proDisplayName } from "./PublishedProsDirectory";
import { dispatchHomiCommand } from "./HmCommandCenter";
import "./HmProjectIntelligence.css";

export default function HmProjectIntelligence({
  context,
  brief = {},
  materials = [],
  actions = [],
  documents = [],
  payments = [],
  configured = true,
  onDecision,
  onOpenMaterials,
  onNavigatePath,
}) {
  const [pros, setPros] = useState([]);
  const [loadingPros, setLoadingPros] = useState(false);
  const [savingKey, setSavingKey] = useState("");
  const [error, setError] = useState("");
  const targetCraft = primaryCraftForBrief(brief);
  const city = brief?.city || brief?.location || context?.location || "";
  const scopeWords = useMemo(() => briefScopeWords(brief), [brief]);

  useEffect(() => {
    let active = true;
    setLoadingPros(true);
    listPublishedPortfolios({ limit: 50 })
      .then((rows) => {
        if (!active) return;
        setPros(rankPros(rows, { city, targetCraft, scopeWords, limit: 3 }));
      })
      .catch(() => {
        if (active) setPros([]);
      })
      .finally(() => {
        if (active) setLoadingPros(false);
      });
    return () => { active = false; };
  }, [city, targetCraft, scopeWords]);

  const artifacts = [
    brief && Object.keys(brief).length ? "Project brief" : null,
    context?.v0Summary?.hasEstimate ? "AI estimate" : null,
    context?.v0Summary?.hasImages ? "Design pack" : null,
    context?.taskCount ? `${context.taskCount} tasks` : null,
    documents.length ? `${documents.length} documents` : null,
    payments.length ? `${payments.length} payment records` : null,
    materials.length ? `${materials.length} material items` : null,
  ].filter(Boolean);

  const decidedTitles = new Set(actions.filter((action) => action.status === "approved" || action.status === "rejected").map((action) => action.title));
  const suggestions = [
    context?.nextTask ? {
      type: "follow_up",
      title: `Prepare follow-up: ${context.nextTask}`,
      rationale: "This is the next open task in the saved project checklist. Approval records the draft; it does not send a message automatically.",
      payload: { task: context.nextTask, phase: context.activePhase },
    } : null,
    materials.some((item) => item.status === "suggested") ? {
      type: "material_plan",
      title: "Approve the material checklist for vendor pricing",
      rationale: "Quantities remain editable. Approval freezes the current planning intent without placing an order.",
      payload: { itemCount: materials.length },
    } : null,
    documents.length ? {
      type: "document_review",
      title: `Review ${documents[0]?.file_name || "the latest project document"}`,
      rationale: "The file is attached to this project and can affect the next stage decision.",
      payload: { documentId: documents[0]?.id || null },
    } : null,
  ].filter((item) => item && !decidedTitles.has(item.title)).slice(0, 3);

  const decide = async (suggestion, decision) => {
    if (!configured) {
      setError("Approval history is not connected in the production workspace yet.");
      return;
    }
    const key = `${suggestion.type}-${suggestion.title}`;
    setSavingKey(key);
    setError("");
    try {
      await onDecision?.({
        actionType: suggestion.type,
        title: suggestion.title,
        rationale: suggestion.rationale,
        payload: suggestion.payload,
        decision,
      });
    } catch (err) {
      setError(err?.message || "Could not record that decision.");
    } finally {
      setSavingKey("");
    }
  };

  const approvePro = async (pro) => {
    const suggestion = {
      type: "contractor_shortlist",
      title: `Shortlist ${proDisplayName(pro)} for ${context?.projectTitle || "this project"}`,
      rationale: `Matched from published portfolio data: ${pro.matchReasons.join(", ") || craftLabel(pro.craft)}. This approval records the shortlist; it does not hire or contact the professional.`,
      payload: { portfolioId: pro.id, slug: pro.slug, matchScore: pro.matchScore, reasons: pro.matchReasons },
    };
    await decide(suggestion, "approved");
  };

  return (
    <section className="hm-project-intelligence" aria-label="Project intelligence">
      <div className="hm-project-intelligence__head">
        <div><span className="hm-project-intelligence__kicker"><Sparkles size={14} /> Project intelligence</span><h2>AI grounded in this project—not a generic chatbot</h2><p>Briefings, answers, takeoff, matches, and suggested actions use the active project’s saved artifacts.</p></div>
        <span className="hm-project-intelligence__guard"><ShieldCheck size={15} /> Approval required</span>
      </div>

      <div className="hm-project-intelligence__grid">
        <article className="hm-project-intelligence__card">
          <div className="hm-project-intelligence__card-icon"><Bot size={19} /></div>
          <h3>Ask anything about this project</h3>
          <p>Ask about scope, next steps, budget, documents, material quantities, or recent site updates.</p>
          <div className="hm-project-intelligence__sources">{artifacts.map((artifact) => <span key={artifact}>{artifact}</span>)}</div>
          <div className="hm-project-intelligence__buttons">
            <button type="button" onClick={() => dispatchHomiCommand("Give me today's briefing and cite the project artifacts you used")}>Today’s briefing</button>
            <button type="button" onClick={() => dispatchHomiCommand("What are the main risks and next decisions on this project?")}>Ask about risks</button>
          </div>
        </article>

        <article className="hm-project-intelligence__card">
          <div className="hm-project-intelligence__card-icon"><Users size={19} /></div>
          <h3>AI professional matching</h3>
          <p>Ranked from real published portfolios using trade, project scope, location, specialties, and profile completeness.</p>
          {loadingPros ? <div className="hm-project-intelligence__empty">Finding suitable professionals…</div> : pros.length ? <div className="hm-project-intelligence__matches">{pros.map((pro) => <div className="hm-project-intelligence__match" key={pro.id}><div><strong>{proDisplayName(pro)}</strong><span>{pro.matchScore}% fit · {pro.matchReasons.join(" · ") || craftLabel(pro.craft)}</span></div><div><button type="button" onClick={() => pro.slug && onNavigatePath?.(`/profile/${pro.slug}`)}>Profile</button><button type="button" className="is-primary" disabled={Boolean(savingKey)} onClick={() => approvePro(pro)}><Check size={13} /> Shortlist</button></div></div>)}</div> : <div className="hm-project-intelligence__empty">No published professionals match this project yet.</div>}
          <button type="button" className="hm-project-intelligence__text-link" onClick={() => onNavigatePath?.(`/browse?projectId=${encodeURIComponent(context?.projectId || "")}`)}>Compare all professionals <ArrowRight size={13} /></button>
        </article>

        <article className="hm-project-intelligence__card">
          <div className="hm-project-intelligence__card-icon"><FileSearch size={19} /></div>
          <h3>Approval queue</h3>
          <p>Homi can prepare actions and follow-ups, but nothing is sent, ordered, or hired without your recorded approval.</p>
          {suggestions.length ? <div className="hm-project-intelligence__approvals">{suggestions.map((suggestion) => { const key = `${suggestion.type}-${suggestion.title}`; return <div key={key}><strong>{suggestion.title}</strong><span>{suggestion.rationale}</span><div><button type="button" disabled={savingKey === key} onClick={() => decide(suggestion, "rejected")}>Dismiss</button><button type="button" className="is-primary" disabled={savingKey === key} onClick={() => decide(suggestion, "approved")}>{savingKey === key ? "Recording…" : "Approve"}</button></div></div>; })}</div> : <div className="hm-project-intelligence__empty">No new approvals need attention.</div>}
          {error ? <p className="hm-project-intelligence__error" role="alert">{error}</p> : null}
        </article>

        <article className="hm-project-intelligence__card hm-project-intelligence__card--materials">
          <div className="hm-project-intelligence__card-icon"><Sparkles size={19} /></div>
          <h3>Material takeoff & shopping checklist</h3>
          <p>{materials.length} editable planning items generated from the saved brief and AI v0 scope. Choose brands, change quantities, and approve before vendor pricing or ordering.</p>
          <button type="button" className="hm-project-intelligence__wide" onClick={onOpenMaterials}>Open editable material plan <ArrowRight size={14} /></button>
        </article>
      </div>
    </section>
  );
}
