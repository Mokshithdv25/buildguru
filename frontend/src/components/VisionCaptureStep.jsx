import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link2, Mic, Square, X } from "lucide-react";
import { optimizeImageFileToDataUrl } from "../lib/imageDataUrl";
import HmMediaDropzone from "./HmMediaDropzone";
import "./VisionCaptureStep.css";

const MAX_INSPIRATION_IMAGES = 8;

function linkHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Free-text brief + optional dictation + inspiration (photos and links).
 * Presentation lives in VisionCaptureStep.css; the parent owns all state.
 */
export default function VisionCaptureStep({
  value,
  onChange,
  headline,
  subcopy,
  placeholder = "Describe the space you want — how it should feel, who uses it, what matters most.",
  minChars = 30,
  /** When true, skip the large serif page title (parent supplies the step headline). */
  embedded = false,
  /** When true (default with embedded), hide the small "Your vision" row — parent title already covers it. */
  showVisionSectionLabel = undefined,
  /** Optional inspiration assets (image data URLs + social links). */
  inspirationItems = [],
  onInspirationItemsChange = undefined,
  inspirationLabel = "Inspiration",
}) {
  const showLabel = showVisionSectionLabel !== undefined ? showVisionSectionLabel : !embedded;
  const taRef = useRef(null);
  const recRef = useRef(null);
  const [listening, setListening] = useState(false);
  const [speechErr, setSpeechErr] = useState("");
  const [inspirationErr, setInspirationErr] = useState("");
  const [encoding, setEncoding] = useState(false);
  const [socialUrl, setSocialUrl] = useState("");

  const appendTranscript = useCallback(
    (chunk) => {
      const t = String(chunk || "").trim();
      if (!t) return;
      onChange(value ? `${value.trim()} ${t}` : t);
    },
    [onChange, value],
  );

  useEffect(() => {
    return () => {
      try {
        recRef.current?.stop?.();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const toggleVoice = () => {
    setSpeechErr("");
    const SR = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
    if (!SR) {
      setSpeechErr("Dictation isn't supported in this browser. Type your brief, or try Chrome.");
      return;
    }
    if (listening && recRef.current) {
      try {
        recRef.current.stop();
      } catch {
        /* ignore */
      }
      setListening(false);
      return;
    }
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = "en-IN";
    rec.onresult = (ev) => {
      const text = Array.from(ev.results)
        .map((r) => r[0]?.transcript)
        .join(" ")
        .trim();
      appendTranscript(text);
      setListening(false);
    };
    rec.onerror = () => {
      setSpeechErr("Couldn't capture audio. Try again, or type instead.");
      setListening(false);
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setSpeechErr("Microphone didn't start. Check browser permissions.");
      setListening(false);
    }
  };

  const trimmedLength = value.trim().length;
  const progress = Math.min(100, Math.round((trimmedLength / Math.max(1, minChars)) * 100));
  const reachedMin = trimmedLength >= minChars;
  const shortHint = trimmedLength > 0 && !reachedMin ? `A few more details help — aim for ${minChars}+ characters.` : null;

  const canEditInspiration = typeof onInspirationItemsChange === "function";
  const imageItems = inspirationItems.filter((x) => x?.type === "image");
  const linkItems = inspirationItems.filter((x) => x?.type === "link");

  const handleAddFiles = async (files) => {
    if (!canEditInspiration) return;
    setInspirationErr("");
    setEncoding(true);
    try {
      const encoded = await Promise.all(
        files.map(async (file) => ({
          type: "image",
          value: await optimizeImageFileToDataUrl(file),
          label: file.name || "upload",
        })),
      );
      onInspirationItemsChange([...(inspirationItems || []), ...encoded]);
    } catch {
      setInspirationErr("One of the images couldn't be processed. Try a smaller JPG, PNG, or WebP.");
    } finally {
      setEncoding(false);
    }
  };

  const removeImageAt = (imageIndex) => {
    if (!canEditInspiration) return;
    let seen = -1;
    onInspirationItemsChange(
      inspirationItems.filter((item) => {
        if (item?.type !== "image") return true;
        seen += 1;
        return seen !== imageIndex;
      }),
    );
  };

  const addSocialLink = () => {
    if (!canEditInspiration) return;
    const raw = String(socialUrl || "").trim();
    if (!raw) return;
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      const u = new URL(withScheme);
      onInspirationItemsChange([...(inspirationItems || []), { type: "link", value: u.toString() }]);
      setSocialUrl("");
      setInspirationErr("");
    } catch {
      setInspirationErr("Enter a valid post or profile URL.");
    }
  };

  const removeInspiration = (idx) => {
    if (!canEditInspiration) return;
    onInspirationItemsChange(inspirationItems.filter((_, i) => i !== idx));
  };

  return (
    <div className="hm-vision">
      {!embedded && headline ? (
        <div className="hm-vision__headline">
          <h1 className="font-serif-display text-3xl md:text-[2.25rem] font-medium text-[#1C1917] tracking-tight leading-tight m-0 mb-3">
            {headline}
          </h1>
          {subcopy ? <p>{subcopy}</p> : null}
        </div>
      ) : null}

      {showLabel ? (
        <div className="craft-type-label mt-1 mb-4">
          <span style={{ color: "#C85F2B" }}>●</span>
          <span>Your vision</span>
        </div>
      ) : null}

      {/* Brief editor */}
      <section className={`hm-vision__editor${listening ? " is-listening" : ""}`} aria-label="Project brief">
        <header className="hm-vision__editor-head">
          <div>
            <h3>Your brief</h3>
            <p>Written in any language. This paragraph guides the AI concepts and your professional.</p>
          </div>
          <span className={`hm-vision__count${reachedMin ? " is-complete" : ""}`} aria-live="polite">
            {trimmedLength} / {minChars}+
          </span>
        </header>

        <textarea
          ref={taRef}
          className="hm-vision__textarea"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={embedded ? 5 : 6}
          aria-label="Project brief"
        />

        <div className="hm-vision__progress" aria-hidden>
          <span style={{ width: `${progress}%` }} />
        </div>

        <footer className="hm-vision__editor-foot">
          <button type="button" className={`hm-vision__dictate${listening ? " is-on" : ""}`} onClick={toggleVoice} aria-pressed={listening}>
            {listening ? <Square size={13} strokeWidth={2.4} /> : <Mic size={14} strokeWidth={2} />}
            {listening ? "Stop dictation" : "Dictate"}
          </button>
          <span className="hm-vision__foot-note">{listening ? "Listening in English (India)…" : shortHint || "Voice input is optional."}</span>
        </footer>
        {speechErr ? <p className="hm-vision__error">{speechErr}</p> : null}
      </section>

      {/* Inspiration */}
      <section className="hm-vision__inspiration" aria-label={inspirationLabel}>
        <header className="hm-vision__section-head">
          <div>
            <h3>{inspirationLabel}</h3>
            <p>Photos, screenshots, or links from Instagram, Pinterest, YouTube, and similar.</p>
          </div>
          {imageItems.length + linkItems.length > 0 ? (
            <span className="hm-vision__section-count">
              {imageItems.length + linkItems.length} saved
            </span>
          ) : null}
        </header>

        <HmMediaDropzone
          compact
          items={imageItems.map((item) => ({ src: item.value, label: "" }))}
          onAddFiles={canEditInspiration ? handleAddFiles : undefined}
          onRemove={canEditInspiration ? removeImageAt : undefined}
          max={MAX_INSPIRATION_IMAGES}
          busy={encoding}
          disabled={!canEditInspiration}
          title="Add inspiration photos"
          hint="JPG, PNG, or WebP · drag files here or browse"
          removeLabel="Remove inspiration photo"
        />

        <div className="hm-vision__link-row">
          <span className="hm-vision__link-icon" aria-hidden>
            <Link2 size={15} strokeWidth={1.9} />
          </span>
          <input
            value={socialUrl}
            onChange={(e) => setSocialUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addSocialLink();
              }
            }}
            placeholder="Paste a post or board link"
            aria-label="Inspiration link"
            disabled={!canEditInspiration}
          />
          <button type="button" onClick={addSocialLink} disabled={!canEditInspiration || !socialUrl.trim()}>
            Add link
          </button>
        </div>

        {linkItems.length > 0 ? (
          <ul className="hm-vision__links">
            {inspirationItems.map((item, idx) =>
              item?.type === "link" ? (
                <li key={`${item.value}-${idx}`}>
                  <a href={item.value} target="_blank" rel="noreferrer" title={item.value}>
                    <strong>{linkHost(item.value)}</strong>
                    <span>{item.value}</span>
                  </a>
                  {canEditInspiration ? (
                    <button type="button" onClick={() => removeInspiration(idx)} aria-label={`Remove link ${linkHost(item.value)}`}>
                      <X size={13} strokeWidth={2.3} />
                    </button>
                  ) : null}
                </li>
              ) : null,
            )}
          </ul>
        ) : null}

        {inspirationErr ? <p className="hm-vision__error">{inspirationErr}</p> : null}
      </section>

      {!embedded ? (
        <p className="hm-vision__afterword">
          Later steps cover plot, rooms, and budget. This paragraph keeps the AI and your architect aligned on <strong>why</strong> you&apos;re
          building, not only on checklist answers.
        </p>
      ) : null}
    </div>
  );
}
