"use client";

import { useEffect, useRef, useState } from "react";
import type { BanFeature } from "@/app/types/accessibility";

interface Props {
  onSelect: (feature: BanFeature) => void;
  disabled?: boolean;
  defaultValue?: string;
}

export default function AddressSearch({ onSelect, disabled, defaultValue }: Props) {
  const [query, setQuery] = useState(defaultValue ?? "");
  const [suggestions, setSuggestions] = useState<BanFeature[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (query.length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=6&autocomplete=1`
        );
        const data = await res.json() as { features: BanFeature[] };
        setSuggestions(data.features ?? []);
        setOpen(true);
        setActiveIdx(-1);
      } catch {
        setSuggestions([]);
      }
    }, 250);
  }, [query]);

  const handleSelect = (feature: BanFeature) => {
    setQuery(feature.properties.label);
    setSuggestions([]);
    setOpen(false);
    onSelect(feature);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || !suggestions.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      handleSelect(suggestions[activeIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <div style={{ position: "relative" }}>
        <svg
          style={{
            position: "absolute",
            left: 14,
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--c21-text-muted)",
            pointerEvents: "none",
            flexShrink: 0,
          }}
          width="16"
          height="16"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"
          />
          <circle cx="12" cy="10" r="3" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          disabled={disabled}
          placeholder="Entrez une adresse francaise..."
          style={{
            width: "100%",
            paddingLeft: 42,
            paddingRight: 16,
            paddingTop: 13,
            paddingBottom: 13,
            background: "var(--c21-input-bg)",
            border: "1px solid var(--c21-border)",
            borderRadius: 12,
            color: "var(--c21-text)",
            fontSize: "0.95rem",
            outline: "none",
            transition: "border-color 0.2s",
            opacity: disabled ? 0.5 : 1,
          }}
          onMouseEnter={(e) => {
            if (!disabled)
              (e.currentTarget as HTMLElement).style.borderColor =
                "var(--c21-gold)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor =
              "var(--c21-border)";
          }}
        />
      </div>

      {open && suggestions.length > 0 && (
        <ul
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            background: "var(--c21-sidebar-bg)",
            border: "1px solid var(--c21-border)",
            borderRadius: 12,
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
            zIndex: 999,
            listStyle: "none",
            margin: 0,
            padding: "6px 0",
            maxHeight: 280,
            overflowY: "auto",
          }}
        >
          {suggestions.map((f, i) => (
            <li
              key={f.properties.label + i}
              onMouseDown={() => handleSelect(f)}
              style={{
                padding: "10px 16px",
                cursor: "pointer",
                background:
                  i === activeIdx ? "var(--c21-panel-bg)" : "transparent",
                transition: "background 0.15s",
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
              onMouseEnter={(e) => {
                setActiveIdx(i);
                (e.currentTarget as HTMLElement).style.background =
                  "var(--c21-panel-bg)";
              }}
              onMouseLeave={(e) => {
                if (i !== activeIdx)
                  (e.currentTarget as HTMLElement).style.background =
                    "transparent";
              }}
            >
              <span
                style={{
                  fontSize: "0.88rem",
                  color: "var(--c21-text)",
                  fontWeight: 500,
                }}
              >
                {f.properties.label}
              </span>
              <span
                style={{ fontSize: "0.75rem", color: "var(--c21-text-muted)" }}
              >
                {f.properties.context}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
