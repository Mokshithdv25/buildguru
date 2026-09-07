import React, { useMemo } from "react";
import { ArrowUpRight, Volume2 } from "lucide-react";
import {
  buildHubAgenda,
  buildHubBadges,
  buildSuggestedActions,
  briefingToSpeech,
  formatBriefingDate,
  getTimeGreeting,
} from "../lib/hubBriefing";
import { buildLatestBriefing } from "../lib/hubAssistantCommands";
import { dispatchHomiCommand } from "./HmCommandCenter";
import "./HmMorningBriefing.css";

function renderInlineBold(text) {
  const parts = String(text || "").split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part));
}

/**
 * Daily briefing header for the project hub. Structured status first, then a short
 * narrative agenda and grounded follow-up actions. No mascots or decorative art.
 */
export default function HmMorningBriefing({ context, pendingTasks = [], onNavigatePath }) {
  const ctx = useMemo(() => context || {}, [context]);
  const firstName = ctx.userFirstName || "";
  const badges = useMemo(() => buildHubBadges(ctx, { pendingTasks: pendingTasks.length }), [ctx, pendingTasks.length]);
  const agenda = useMemo(
    () => buildHubAgenda(ctx, { pendingTasks, selectedPhase: ctx.activePhase }),
    [ctx, pendingTasks],
  );
  const suggested = useMemo(() => buildSuggestedActions(ctx), [ctx]);

  const playBriefing = () => {
    const text = buildLatestBriefing(ctx);
    dispatchHomiCommand("latest");
    window.dispatchEvent(new CustomEvent("hm-open-assistant"));
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(briefingToSpeech(text));
      u.rate = 0.95;
      u.lang = "en-IN";
      window.speechSynthesis.speak(u);
    }
  };

  const onAction = (action) => {
    if (action.path) onNavigatePath?.(action.path);
    dispatchHomiCommand(action.message);
    window.dispatchEvent(new CustomEvent("hm-open-assistant"));
  };

  return (
    <section className="hm-brief" aria-label="Daily briefing">
      <div className="hm-brief__top">
        <div className="hm-brief__intro">
          <div className="hm-brief__eyebrow">Daily briefing · {formatBriefingDate()}</div>
          <h1 className="hm-brief__greeting">
            {getTimeGreeting()}
            {firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="hm-brief__sub">What changed, what is blocked, and which decisions need you today.</p>
        </div>
        <button type="button" className="hm-brief__play" onClick={playBriefing}>
          <Volume2 size={15} strokeWidth={2} />
          Play briefing
        </button>
      </div>

      {badges.length ? (
        <dl className="hm-brief__stats">
          {badges.map((b) => (
            <div key={`${b.label}-${b.value}`} className={`hm-brief__stat hm-brief__stat--${b.tone}`}>
              <dt>{b.label}</dt>
              <dd>{b.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <p className="hm-brief__agenda">{renderInlineBold(agenda)}</p>

      {suggested.length ? (
        <div className="hm-brief__actions" role="group" aria-label="Suggested follow-ups">
          {suggested.map((a) => (
            <button key={a.label} type="button" className="hm-brief__action" onClick={() => onAction(a)}>
              <span>{a.label}</span>
              <ArrowUpRight size={14} strokeWidth={2} />
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
