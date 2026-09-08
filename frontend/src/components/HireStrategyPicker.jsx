import React from "react";
import { Building2, Check, DraftingCompass, Layers, Users } from "lucide-react";
import { HIRE_MODE_ORDER, HIRE_MODES } from "../lib/hireMode";
import "./hireStrategy.css";

const ICONS = {
  trades: Layers,
  gc: Building2,
  design_first: DraftingCompass,
  own_team: Users,
};

/**
 * Four-way hiring strategy, shown at the end of the design wizard and on the
 * project Hire tab. Selecting a card is the only write; parent owns state.
 */
export default function HireStrategyPicker({
  value,
  onChange,
  layout = "grid",
  disabled = false,
}) {
  return (
    <div
      className={`hm-hire ${layout === "stack" ? "is-stack" : ""}`}
      role="radiogroup"
      aria-label="How do you want to hire"
    >
      {HIRE_MODE_ORDER.map((id) => {
        const meta = HIRE_MODES[id];
        const Icon = ICONS[id];
        const selected = value === id;
        return (
          <label key={id} className={`hm-hire__card ${selected ? "is-selected" : ""} ${meta.recommended ? "is-recommended" : ""}`}>
            <input
              type="radio"
              name="hireMode"
              value={id}
              checked={selected}
              disabled={disabled}
              onChange={() => onChange?.(id)}
            />
            <span className="hm-hire__icon" aria-hidden>
              <Icon size={18} />
            </span>
            <span className="hm-hire__body">
              <span className="hm-hire__title">
                {meta.label}
                {meta.recommended ? <em>Recommended</em> : null}
              </span>
              <span className="hm-hire__summary">{meta.summary}</span>
            </span>
            <span className={`hm-hire__check ${selected ? "is-on" : ""}`} aria-hidden>
              <Check size={14} />
            </span>
          </label>
        );
      })}
    </div>
  );
}
