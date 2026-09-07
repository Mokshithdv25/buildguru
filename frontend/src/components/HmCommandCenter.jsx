import React, { useState } from "react";
import { ArrowUp, Mic } from "lucide-react";
import { COMMAND_CENTER_TRY_PROMPTS } from "../lib/hubBriefing";
import "./HmCommandCenter.css";

export function dispatchHomiCommand(message) {
  if (!String(message || "").trim()) return;
  window.dispatchEvent(new CustomEvent("hm-assistant-send", { detail: { message: String(message).trim() } }));
}

/**
 * Project assistant entry point on the hub overview. Plain, grounded, no mascot.
 */
export default function HmCommandCenter({
  tryPrompts = COMMAND_CENTER_TRY_PROMPTS,
  busy = false,
  title = "Project assistant",
  status = "Answers use this project's saved brief, estimate, tasks, documents, and budget",
  placeholder = "Ask about scope, tasks, documents, materials, budget, or today's priorities",
}) {
  const [input, setInput] = useState("");

  const submit = (text) => {
    const msg = String(text ?? input).trim();
    if (!msg || busy) return;
    setInput("");
    dispatchHomiCommand(msg);
  };

  const onMic = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      dispatchHomiCommand("help");
      return;
    }
    const rec = new SpeechRecognition();
    rec.lang = "en-IN";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const said = e.results?.[0]?.[0]?.transcript;
      if (said) submit(said);
    };
    rec.start();
  };

  return (
    <section className="hm-command-center" aria-label="Project assistant">
      <div className="hm-command-center__head">
        <h2 className="hm-command-center__title">{title}</h2>
        <div className="hm-command-center__status">
          <span className="hm-command-center__dot" aria-hidden />
          {status}
        </div>
      </div>
      <form
        className="hm-command-center__form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          className="hm-command-center__input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          disabled={busy}
          aria-label="Ask the project assistant"
        />
        <button type="button" className="hm-command-center__mic" onClick={onMic} aria-label="Voice input" title="Voice input (where supported)">
          <Mic size={16} strokeWidth={2} />
        </button>
        <button type="submit" className="hm-command-center__send" disabled={busy || !input.trim()} aria-label="Send">
          <ArrowUp size={16} strokeWidth={2.4} />
        </button>
      </form>
      <div className="hm-command-center__try">
        <span className="hm-command-center__try-label">Suggested</span>
        {tryPrompts.map((p) => (
          <button key={p.label} type="button" className="hm-command-center__pill" onClick={() => submit(p.message)} disabled={busy}>
            {p.label}
          </button>
        ))}
      </div>
    </section>
  );
}
