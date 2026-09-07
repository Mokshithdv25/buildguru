import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageSquareText, X } from "lucide-react";
import { askHubAssistant } from "../lib/hubAssistantApi";
import { buildLatestBriefing } from "../lib/hubAssistantCommands";
import "./HmProjectAssistant.css";

function renderBold(text) {
  return String(text || "").split("\n").map((line, lineIndex) => {
    const parts = line.split(/\*\*(.+?)\*\*/g);
    return <React.Fragment key={lineIndex}>{lineIndex > 0 ? <br /> : null}{parts.map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part))}</React.Fragment>;
  });
}

const QUICK_PROMPTS = [
  { label: "What's new?", message: "latest" },
  { label: "Tasks", message: "tasks" },
  { label: "Budget", message: "budget" },
  { label: "Materials", message: "Show my material takeoff and selected brands" },
  { label: "Project Q&A", message: "What are the main risks and next decisions on this project?" },
];

export default function HmProjectAssistant({
  context,
  onNavTab,
  onNavigatePath,
  onAddTask,
  defaultPhase = "Structure",
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState(() => [
    {
      id: "welcome",
      role: "homi",
      text: "Ask anything about this project's **brief, estimate, tasks, documents, payments, site updates, or material plan**. Answers use only the artifacts attached to the active project.",
    },
  ]);
  const scrollRef = useRef(null);

  const ctx = useMemo(() => context || {}, [context]);
  const initialBriefing = useMemo(() => buildLatestBriefing(ctx), [ctx]);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("hm-open-assistant", onOpen);
    return () => window.removeEventListener("hm-open-assistant", onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open, busy]);

  const applyAction = useCallback(
    (action) => {
      if (!action) return;
      if (action.type === "nav" && action.nav) onNavTab?.(action.nav);
      if (action.type === "path" && action.path) onNavigatePath?.(action.path);
      if (action.type === "addTask" && action.title) onAddTask?.(action.title, defaultPhase);
    },
    [onNavTab, onNavigatePath, onAddTask, defaultPhase],
  );

  const sendMessage = useCallback(
    async (raw) => {
      const text = String(raw || "").trim();
      if (!text || busy) return;
      setInput("");
      setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: "user", text }]);
      setBusy(true);
      setMessages((prev) => [...prev, { id: "typing", role: "homi", text: "Homi is thinking…", typing: true }]);

      try {
        const result = await askHubAssistant({ message: text, context: ctx });
        applyAction(result.action);
        setMessages((prev) => {
          const withoutTyping = prev.filter((m) => m.id !== "typing");
          return [
            ...withoutTyping,
            {
              id: `h-${Date.now()}`,
              role: "homi",
              text: result.text,
              source: result.source,
            },
          ];
        });
      } finally {
        setBusy(false);
      }
    },
    [busy, ctx, applyAction],
  );

  useEffect(() => {
    const onSend = (e) => {
      const msg = e?.detail?.message;
      if (msg) {
        setOpen(true);
        sendMessage(msg);
      }
    };
    window.addEventListener("hm-assistant-send", onSend);
    return () => window.removeEventListener("hm-assistant-send", onSend);
  }, [sendMessage]);

  useEffect(() => {
    if (!open) return;
    setMessages((prev) => {
      if (prev.length > 1) return prev;
      return [
        {
          id: "welcome",
          role: "homi",
          text: initialBriefing,
        },
      ];
    });
  }, [open, initialBriefing]);

  return (
    <>
      {open ? (
        <div className="hm-assistant-panel" role="dialog" aria-label="Project assistant">
          <div className="hm-assistant-head">
            <div>
              <h3>Project assistant</h3>
              <p>Answers and actions grounded in this project's saved artifacts</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close assistant"
              style={{
                marginLeft: "auto",
                border: "none",
                background: "transparent",
                fontSize: 20,
                cursor: "pointer",
                color: "#78716C",
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
          <div className="hm-assistant-chips">
            {QUICK_PROMPTS.map((q) => (
              <button
                key={q.label}
                type="button"
                className="hm-assistant-chip"
                onClick={() => sendMessage(q.message)}
                disabled={busy}
              >
                {q.label}
              </button>
            ))}
            {!ctx.signedIn ? (
              <button
                type="button"
                className="hm-assistant-chip"
                onClick={() => onNavigatePath?.(ctx.signInPath)}
              >
                Sign in
              </button>
            ) : null}
          </div>
          <div className="hm-assistant-msgs" ref={scrollRef}>
            {messages.map((m) => (
              <div
                key={m.id}
                className={`hm-assistant-bubble ${m.role === "user" ? "user" : "homi"}${m.typing ? " typing" : ""}`}
              >
                {renderBold(m.text)}
              </div>
            ))}
          </div>
          <form
            className="hm-assistant-input-row"
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage(input);
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about this project's scope, budget, documents, materials…"
              disabled={busy}
              aria-label="Message Homi"
            />
            <button type="submit" className="hm-assistant-send" disabled={busy || !input.trim()}>
              Send
            </button>
          </form>
        </div>
      ) : null}
      <button
        type="button"
        className={`hm-assistant-fab${open ? " open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? "Close project assistant" : "Open project assistant"}
        title="Project assistant"
      >
        {open ? <X size={22} strokeWidth={2.2} aria-hidden /> : <MessageSquareText size={22} strokeWidth={2} aria-hidden />}
      </button>
    </>
  );
}
