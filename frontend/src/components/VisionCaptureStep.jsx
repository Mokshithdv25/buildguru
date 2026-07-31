import React, { useCallback, useEffect, useRef, useState } from "react";
import { optimizeImageFileToDataUrl } from "../lib/imageDataUrl";

/**
 * Free-text + optional voice capture — styled to match BuildGuru craft flows (warm cream / terracotta).
 */
export default function VisionCaptureStep({
  value,
  onChange,
  headline,
  subcopy,
  placeholder = "Describe your dream space in any language…",
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
  const showLabel =
    showVisionSectionLabel !== undefined ? showVisionSectionLabel : !embedded;
  const taRef = useRef(null);
  const fileRef = useRef(null);
  const [listening, setListening] = useState(false);
  const [speechErr, setSpeechErr] = useState("");
  const [inspirationErr, setInspirationErr] = useState("");
  const [socialUrl, setSocialUrl] = useState("");
  const recRef = useRef(null);

  const appendTranscript = useCallback(
    (chunk) => {
      const t = String(chunk || "").trim();
      if (!t) return;
      onChange(value ? `${value.trim()} ${t}` : t);
    },
    [onChange, value]
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
      setSpeechErr("Voice isn’t supported in this browser — type instead, or try Chrome.");
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
      setSpeechErr("Couldn’t capture voice — try again or type.");
      setListening(false);
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setSpeechErr("Microphone didn’t start — check permissions.");
      setListening(false);
    }
  };

  const shortHint =
    value.trim().length > 0 && value.trim().length < minChars ? `Add a bit more (${minChars}+ characters helps the AI).` : null;
  const imageItems = inspirationItems.filter((x) => x?.type === "image");
  const linkItems = inspirationItems.filter((x) => x?.type === "link");

  const canEditInspiration = typeof onInspirationItemsChange === "function";

  const handleUploadImages = async (ev) => {
    if (!canEditInspiration) return;
    const files = Array.from(ev.target.files || []).filter((f) => /^image\//.test(f.type));
    ev.target.value = "";
    if (files.length === 0) return;
    setInspirationErr("");
    try {
      const encoded = await Promise.all(
        files.slice(0, 8).map(async (file) => ({
          type: "image",
          value: await optimizeImageFileToDataUrl(file),
          label: file.name || "upload",
        })),
      );
      onInspirationItemsChange([...(inspirationItems || []), ...encoded]);
    } catch {
      setInspirationErr("Couldn’t optimize one of the images. Try a smaller JPG, PNG, or WebP file.");
    }
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
    <div>
      {!embedded && headline ? (
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 24, marginBottom: 24, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 320px", minWidth: 0 }}>
            <h1 className="font-serif-display text-3xl md:text-[2.25rem] font-medium text-[#1C1917] tracking-tight leading-tight m-0 mb-3">
              {headline}
            </h1>
            {subcopy ? (
              <p style={{ fontSize: 14, color: "#6A5E53", margin: 0, lineHeight: 1.65, maxWidth: 560 }}>{subcopy}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {showLabel ? (
        <div className="craft-type-label mt-1 mb-4">
          <span style={{ color: "#C85F2B" }}>●</span>
          <span>Your vision</span>
        </div>
      ) : null}

      <div
        style={{
          borderRadius: 16,
          padding: "16px 18px",
          background: "#FDFBF8",
          border: "1px solid #EFE3D2",
          boxShadow: "0 8px 28px -12px rgba(200, 95, 43, 0.12)",
        }}
      >
        <div style={{ display: "flex", alignItems: "stretch", gap: 14, flexWrap: "wrap" }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              flexShrink: 0,
              background: "linear-gradient(145deg, #FFF9F4 0%, #F5EDE4 100%)",
              border: "1px solid #E8DDD3",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
              lineHeight: 1,
              color: "#C85F2B",
            }}
            aria-hidden
          >
            ✨
          </div>
          <div style={{ flex: "1 1 240px", minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            <textarea
              ref={taRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              rows={embedded ? 4 : 5}
              style={{
                width: "100%",
                boxSizing: "border-box",
                background: "#fff",
                border: "1px solid #D6D3D1",
                borderRadius: 12,
                padding: "14px 16px",
                fontSize: 15,
                lineHeight: 1.55,
                color: "#1C1917",
                outline: "none",
                resize: "vertical",
                minHeight: embedded ? 100 : 120,
                fontFamily: "'DM Sans', Inter, system-ui, sans-serif",
              }}
            />
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  type="button"
                  onClick={toggleVoice}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 14px",
                    borderRadius: 999,
                    border: listening ? "2px solid #C85F2B" : "1px solid #D6D3D1",
                    background: listening ? "#FFFBF7" : "#fff",
                    color: listening ? "#C85F2B" : "#57534E",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                  aria-pressed={listening}
                >
                  {listening ? "● Listening…" : "🎤 Voice"}
                </button>
                <span style={{ fontSize: 11, color: "#A8A29E" }}>Optional · EN-IN</span>
              </div>
              <span style={{ fontSize: 11, color: "#A8A29E" }}>
                {value.trim().length}/{minChars}+ suggested
              </span>
            </div>
          </div>
        </div>
        {speechErr ? (
          <div style={{ marginTop: 12, fontSize: 12, color: "#B45309", lineHeight: 1.45 }}>{speechErr}</div>
        ) : null}
        {shortHint ? (
          <div style={{ marginTop: 12, fontSize: 12, color: "#92400E", lineHeight: 1.45 }}>{shortHint}</div>
        ) : null}
      </div>

      <div
        style={{
          marginTop: 14,
          borderRadius: 14,
          padding: "14px 16px",
          background: "#FFFBF7",
          border: "1px solid #EEDCCB",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 16 }} aria-hidden>
            🧠
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#1C1917" }}>{inspirationLabel}</span>
        </div>
        <div style={{ fontSize: 12, color: "#7A6E62", lineHeight: 1.5, marginBottom: 10 }}>
          Upload photos/screenshots or paste Instagram, Pinterest, YouTube, or other social links.
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
          <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={handleUploadImages} />
          <button
            type="button"
            onClick={() => fileRef.current?.click?.()}
            disabled={!canEditInspiration}
            style={{
              border: "1px solid #D6D3D1",
              background: "#fff",
              borderRadius: 999,
              padding: "8px 12px",
              fontSize: 12,
              fontWeight: 700,
              color: "#44403C",
              cursor: canEditInspiration ? "pointer" : "default",
            }}
          >
            + Upload images
          </button>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flex: "1 1 320px", minWidth: 220 }}>
            <input
              value={socialUrl}
              onChange={(e) => setSocialUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addSocialLink();
                }
              }}
              placeholder="Paste social post link"
              style={{
                width: "100%",
                border: "1px solid #D6D3D1",
                borderRadius: 8,
                padding: "8px 10px",
                fontSize: 12,
                background: "#fff",
              }}
            />
            <button
              type="button"
              onClick={addSocialLink}
              disabled={!canEditInspiration}
              style={{
                border: "1px solid #D6D3D1",
                background: "#fff",
                borderRadius: 8,
                padding: "8px 10px",
                fontSize: 12,
                fontWeight: 700,
                color: "#44403C",
                cursor: canEditInspiration ? "pointer" : "default",
              }}
            >
              Add
            </button>
          </div>
        </div>
        {imageItems.length > 0 ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            {inspirationItems.map((item, idx) =>
              item?.type === "image" ? (
                <div key={`${item.value}-${idx}`} style={{ position: "relative", borderRadius: 10, overflow: "hidden", border: "1px solid #E5E7EB" }}>
                  <img src={item.value} alt={item.label || "inspiration"} style={{ width: 84, height: 64, objectFit: "cover", display: "block" }} />
                  <button
                    type="button"
                    onClick={() => removeInspiration(idx)}
                    style={{
                      position: "absolute",
                      top: 4,
                      right: 4,
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      border: "none",
                      background: "rgba(255,255,255,0.9)",
                      fontSize: 12,
                      lineHeight: 1,
                      cursor: "pointer",
                    }}
                  >
                    ×
                  </button>
                </div>
              ) : null
            )}
          </div>
        ) : null}
        {linkItems.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {inspirationItems.map((item, idx) =>
              item?.type === "link" ? (
                <div
                  key={`${item.value}-${idx}`}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 10,
                    border: "1px solid #E7E5E4",
                    background: "#fff",
                    borderRadius: 8,
                    padding: "6px 8px",
                  }}
                >
                  <a
                    href={item.value}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: 12, color: "#2A6496", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    {item.value}
                  </a>
                  <button type="button" onClick={() => removeInspiration(idx)} style={{ border: "none", background: "none", fontSize: 14, cursor: "pointer" }}>
                    ×
                  </button>
                </div>
              ) : null
            )}
          </div>
        ) : null}
        {inspirationErr ? <div style={{ marginTop: 8, fontSize: 12, color: "#B45309" }}>{inspirationErr}</div> : null}
      </div>

      {!embedded ? (
        <p style={{ fontSize: 12, color: "#78716C", marginTop: 16, lineHeight: 1.55, maxWidth: 640 }}>
          Later steps cover plot, rooms, and budget — this paragraph keeps AI and your architect aligned on{" "}
          <strong style={{ color: "#57534E" }}>why</strong> you&apos;re building, not only checklist answers.
        </p>
      ) : null}
    </div>
  );
}
