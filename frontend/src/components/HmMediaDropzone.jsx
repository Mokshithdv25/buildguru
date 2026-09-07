import React, { useCallback, useId, useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import "./HmMediaDropzone.css";

/**
 * Shared photo uploader for homeowner flows.
 *
 * - Drag-and-drop with a click/keyboard fallback (the whole zone is a label for a hidden input).
 * - Existing items render as a uniform preview grid with a hover/focus remove control.
 * - Presentation only: the parent owns the item list and encodes files (`onAddFiles(files)`).
 *
 * `items` is an array of `{ src, label? }`.
 */
export default function HmMediaDropzone({
  items = [],
  onAddFiles,
  onRemove,
  max = 8,
  title = "Add photos",
  hint = "JPG, PNG, or WebP · drag files here or browse",
  emptyDescription = "",
  disabled = false,
  busy = false,
  compact = false,
  accept = "image/*",
  className = "",
  removeLabel = "Remove photo",
  inputId,
}) {
  const generatedId = useId();
  const id = inputId || `hm-dropzone-${generatedId}`;
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  const canEdit = typeof onAddFiles === "function" && !disabled && !busy;
  const remaining = Math.max(0, max - items.length);
  const atLimit = remaining === 0;

  const acceptFiles = useCallback(
    (fileList) => {
      if (!canEdit || atLimit) return;
      const files = Array.from(fileList || []).filter((file) => /^image\//.test(file.type));
      if (!files.length) return;
      onAddFiles(files.slice(0, remaining));
    },
    [atLimit, canEdit, onAddFiles, remaining],
  );

  const onInputChange = (event) => {
    acceptFiles(event.target.files);
    event.target.value = "";
  };

  const onDragEnter = (event) => {
    event.preventDefault();
    if (!canEdit || atLimit) return;
    dragDepth.current += 1;
    setDragging(true);
  };
  const onDragLeave = (event) => {
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };
  const onDragOver = (event) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = canEdit && !atLimit ? "copy" : "none";
  };
  const onDrop = (event) => {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    acceptFiles(event.dataTransfer?.files);
  };

  const onZoneKeyDown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (canEdit && !atLimit) inputRef.current?.click();
    }
  };

  const showTiles = items.length > 0;
  const zoneClass = [
    "hm-dropzone__zone",
    dragging ? "is-dragging" : "",
    !canEdit || atLimit ? "is-disabled" : "",
    showTiles ? "is-tile" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={`hm-dropzone${compact ? " hm-dropzone--compact" : ""}${className ? ` ${className}` : ""}`}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        multiple={max > 1}
        className="hm-dropzone__input"
        onChange={onInputChange}
        disabled={!canEdit || atLimit}
        tabIndex={-1}
      />

      {showTiles ? (
        <div className="hm-dropzone__grid" role="list" aria-label="Uploaded photos">
          {items.map((item, index) => (
            <figure className="hm-dropzone__tile" role="listitem" key={`${item.src}-${index}`}>
              <img src={item.src} alt={item.label || `Photo ${index + 1}`} loading="lazy" />
              {item.label ? <figcaption>{item.label}</figcaption> : null}
              {typeof onRemove === "function" && !disabled ? (
                <button
                  type="button"
                  className="hm-dropzone__remove"
                  onClick={() => onRemove(index)}
                  aria-label={`${removeLabel}${item.label ? `: ${item.label}` : ""}`}
                >
                  <X size={13} strokeWidth={2.4} />
                </button>
              ) : null}
            </figure>
          ))}
          {!atLimit && canEdit ? (
            <label htmlFor={id} className={zoneClass} tabIndex={0} onKeyDown={onZoneKeyDown} role="button" aria-label={`${title} (${remaining} more)`}>
              {busy ? <Loader2 size={18} className="hm-dropzone__spin" /> : <ImagePlus size={18} strokeWidth={1.8} />}
              <span>{dragging ? "Drop to add" : "Add more"}</span>
            </label>
          ) : null}
        </div>
      ) : (
        <label htmlFor={id} className={zoneClass} tabIndex={canEdit && !atLimit ? 0 : -1} onKeyDown={onZoneKeyDown} role="button" aria-disabled={!canEdit || atLimit}>
          <span className="hm-dropzone__icon" aria-hidden>
            {busy ? <Loader2 size={20} className="hm-dropzone__spin" /> : <ImagePlus size={20} strokeWidth={1.7} />}
          </span>
          <span className="hm-dropzone__copy">
            <strong>{dragging ? "Drop photos to add them" : title}</strong>
            <span>{hint}</span>
            {emptyDescription ? <em>{emptyDescription}</em> : null}
          </span>
          <span className="hm-dropzone__browse" aria-hidden>
            Browse
          </span>
        </label>
      )}

      <div className="hm-dropzone__meta">
        <span>
          {items.length} of {max} added
        </span>
        {atLimit ? <span className="hm-dropzone__limit">Limit reached — remove a photo to add another.</span> : null}
      </div>
    </div>
  );
}
