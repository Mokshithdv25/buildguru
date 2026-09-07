import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, MapPin, Search, X } from "lucide-react";
import "./LocationAutocomplete.css";

const LOCATION_OPTIONS = [
  ["Bengaluru, Karnataka", "Karnataka"],
  ["Mysuru, Karnataka", "Karnataka"],
  ["Mangaluru, Karnataka", "Karnataka"],
  ["Hassan, Karnataka", "Karnataka"],
  ["Hubballi, Karnataka", "Karnataka"],
  ["Mumbai, Maharashtra", "Maharashtra"],
  ["Pune, Maharashtra", "Maharashtra"],
  ["Nagpur, Maharashtra", "Maharashtra"],
  ["New Delhi, Delhi", "Delhi"],
  ["Gurugram, Haryana", "Haryana"],
  ["Noida, Uttar Pradesh", "Uttar Pradesh"],
  ["Chandigarh, Chandigarh", "Chandigarh"],
  ["Hyderabad, Telangana", "Telangana"],
  ["Chennai, Tamil Nadu", "Tamil Nadu"],
  ["Kochi, Kerala", "Kerala"],
  ["Thiruvananthapuram, Kerala", "Kerala"],
  ["Goa, Goa", "Goa"],
  ["Ahmedabad, Gujarat", "Gujarat"],
  ["Jaipur, Rajasthan", "Rajasthan"],
  ["Kolkata, West Bengal", "West Bengal"],
];

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

export default function LocationAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = "Search city, locality or district",
  required = false,
  id = "project-location",
  label = "Project location",
}) {
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const [remote, setRemote] = useState(null);
  const [status, setStatus] = useState("");
  const cacheRef = useRef(new Map());

  useEffect(() => {
    const query = String(value || "").trim();
    setRemote(null);
    setActiveIndex(-1);
    setStatus("");
    if (!open || query.length < 3) return;
    if (cacheRef.current.has(normalize(query))) {
      setRemote(cacheRef.current.get(normalize(query)));
      setStatus("done");
      return;
    }
    let current = true;
    const controller = new AbortController();
    let timeout;
    setStatus("loading");
    const timer = setTimeout(async () => {
      timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const params = new URLSearchParams({ q: query, limit: "6", lang: "en", bbox: "68,6,98,38" });
        const response = await fetch(`https://photon.komoot.io/api/?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Location search unavailable");
        const data = await response.json();
        if (!Array.isArray(data.features)) throw new Error("Invalid location response");
        const seen = new Set();
        const results = data.features.flatMap(({ properties: p }) => {
          if (!p || p.countrycode?.toUpperCase() !== "IN") return [];
          const parts = [...new Set([p.name, p.city || p.district || p.county, p.state].filter(Boolean))];
          const name = parts.join(", ");
          if (!name || seen.has(name)) return [];
          seen.add(name);
          return [[name, parts.slice(1).join(", ") || "India"]];
        });
        if (!current) return;
        if (cacheRef.current.size >= 50) cacheRef.current.delete(cacheRef.current.keys().next().value);
        cacheRef.current.set(normalize(query), results);
        setRemote(results);
        setStatus("done");
      } catch {
        if (current) setStatus("error");
      } finally {
        clearTimeout(timeout);
      }
    }, 450);
    return () => { current = false; clearTimeout(timer); clearTimeout(timeout); controller.abort(); };
  }, [value, open]);

  const suggestions = useMemo(() => {
    if (remote?.length) return remote;
    const query = normalize(value);
    if (!query) return LOCATION_OPTIONS.slice(0, 6);
    return LOCATION_OPTIONS.filter(([name]) => normalize(name).includes(query)).slice(0, 6);
  }, [value, remote]);

  useEffect(() => {
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const choose = (name, state) => {
    onChange(name);
    onSelect?.({ label: name, city: name.split(",")[0].trim(), state });
    setOpen(false);
    setActiveIndex(-1);
  };

  const onKeyDown = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => Math.min(index + 1, suggestions.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && open && activeIndex >= 0 && suggestions[activeIndex]) {
      event.preventDefault();
      choose(...suggestions[activeIndex]);
    } else if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  return (
    <div className="hm-location" ref={rootRef} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) { setOpen(false); setActiveIndex(-1); }
    }}>
      {label ? (
        <label className="hm-location__label" htmlFor={id}>
          {label} {required ? <span>(required)</span> : null}
        </label>
      ) : null}
      <div className={`hm-location__field${open && suggestions.length ? " is-open" : ""}`}>
        <Search className="hm-location__search" size={14} strokeWidth={2} aria-hidden />
        <input
          ref={inputRef}
          id={id}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          required={required}
          aria-required={required}
          aria-activedescendant={open && activeIndex >= 0 && suggestions[activeIndex] ? `${id}-option-${activeIndex}` : undefined}
          aria-expanded={open}
          aria-controls={`${id}-suggestions`}
          aria-autocomplete="list"
        />
        {value ? (
          <button type="button" className="hm-location__clear" onClick={() => { onChange(""); inputRef.current?.focus(); setOpen(true); }} aria-label="Clear location">
            <X size={14} strokeWidth={2} />
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="hm-location__menu">
          <div className="hm-location__menu-label">{value ? "Suggested locations" : "Popular project locations"}</div>
          <div id={`${id}-suggestions`} role="listbox" aria-label="Suggested locations">
          {suggestions.map(([name, state], index) => (
            <button
              type="button"
              role="option"
              id={`${id}-option-${index}`}
              tabIndex={-1}
              aria-selected={activeIndex === index}
              className={`hm-location__option${activeIndex === index ? " is-active" : ""}`}
              key={name}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(name, state)}
            >
              <span className="hm-location__pin"><MapPin size={14} strokeWidth={1.9} /></span>
              <span><strong>{name.split(",")[0]}</strong><small>{state}</small></span>
              {value === name ? <Check size={14} aria-hidden /> : null}
            </button>
          ))}
          </div>
          <div className="hm-location__hint" role="status">
            {status === "loading" ? "Searching locations…" : status === "error" ? "Live search is unavailable. Choose a city above or enter your location manually." : !suggestions.length ? "No matching locations. Try a nearby city or enter your location manually." : "Choose a suggestion or enter your location manually."}
          </div>
          <div className="hm-location__hint">Location search by <a href="https://photon.komoot.io" target="_blank" rel="noreferrer">Photon</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a></div>
        </div>
      ) : null}
    </div>
  );
}
