"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { AccessibilityData, TransitType } from "@/app/types/accessibility";
import { selectTransitDestinations, selectAirportDestinations } from "@/app/lib/snapshotSelection";
import { getLineColor, getContrastText } from "@/app/lib/transitColors";

const SnapshotMap = dynamic(() => import("@/app/components/SnapshotMap"), {
  ssr: false,
  loading: () => (
    <div style={{ width: "100%", height: 300, background: "var(--c21-panel-bg)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ color: "var(--c21-text-muted)", fontSize: 13 }}>Chargement de la carte…</span>
    </div>
  ),
});

const STOP_FALLBACK_COLORS: Record<TransitType, string> = {
  metro: "#003189",
  rer: "#7B5EA7",
  tram: "#3EA55D",
  bus: "#E07A10",
  train: "#374151",
};

function TransitBadge({ type, lines }: { type: TransitType; lines: string[] }) {
  if (type === "train") {
    return (
      <div style={{ width: 20, height: 18, background: "#374151", borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
          <rect x="4" y="3" width="16" height="14" rx="3" />
          <line x1="4" y1="11" x2="20" y2="11" />
          <path d="M7 21l2-4h6l2 4" strokeLinecap="round" />
        </svg>
      </div>
    );
  }
  const lineRef = lines[0] ?? "";
  const color = lineRef ? getLineColor(type, lineRef) : STOP_FALLBACK_COLORS[type];
  const textColor = getContrastText(color);
  const rawLabel = lineRef || type.slice(0, 1).toUpperCase();
  const label = type === "tram" && lineRef && !lineRef.match(/^T\d/i) ? `T${rawLabel}` : rawLabel;
  const fs = label.length > 3 ? "6px" : label.length > 2 ? "7px" : label.length === 2 ? "8px" : "9px";
  return (
    <div style={{
      width: 20, height: 20, background: color,
      borderRadius: type === "tram" ? 3 : "50%",
      display: "flex", alignItems: "center", justifyContent: "center",
      color: textColor, fontSize: fs, fontWeight: 800, flexShrink: 0,
    }}>
      {label}
    </div>
  );
}

interface AccessibilityInlineProps {
  address: string;
  lat: number;
  lng: number;
}

// Use Railway endpoint if available (has transit .db files), else fall back to local API
const ACCESSIBILITY_API = process.env.NEXT_PUBLIC_ACCESSIBILITY_API_URL || "/api/accessibility/analyze";

export default function AccessibilityInline({ address, lat, lng }: AccessibilityInlineProps) {
  const [data, setData] = useState<AccessibilityData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(ACCESSIBILITY_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat, lng, address }),
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => setData(d as AccessibilityData))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [address, lat, lng]);

  if (loading) {
    return (
      <div style={{ padding: "12px 0" }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {[0, 150, 300].map((delay) => (
            <span
              key={delay}
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#b09a7a",
                display: "inline-block",
                animation: "bounce 0.9s infinite",
                animationDelay: `${delay}ms`,
              }}
            />
          ))}
          <span style={{ fontSize: 12, color: "var(--c21-text-muted)", marginLeft: 6 }}>
            Analyse de l&apos;accessibilité…
          </span>
        </div>
        <style>{`@keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }`}</style>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ padding: "8px 12px", background: "rgba(239,68,68,0.08)", borderRadius: 8, border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444", fontSize: 12 }}>
        Carte d&apos;accessibilité indisponible{error ? ` : ${error}` : ""}
      </div>
    );
  }

  // Selection is the source of truth for both legend and map
  const transit = selectTransitDestinations(data.transitStops, 5);
  const airports = selectAirportDestinations(data.airports, 2);

  return (
    <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid var(--c21-border)", background: "var(--c21-card-bg)", marginTop: 4 }}>
      {/* Header */}
      <div style={{ padding: "9px 14px", background: "var(--c21-sidebar-bg)", borderBottom: "2px solid var(--c21-gold)", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 13 }}>📍</span>
        <span style={{ color: "var(--c21-text)", fontWeight: 700, fontSize: "0.82rem", letterSpacing: "-0.2px" }}>Accessibilité</span>
        <span style={{ color: "var(--c21-gold)", fontSize: "0.78rem", marginLeft: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {address}
        </span>
      </div>

      {/* Map */}
      <div style={{ padding: 12 }}>
        <div style={{ borderRadius: 8, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
          <SnapshotMap
            data={data}
            width={680}
            height={420}
            overrideTransit={transit}
            overrideAirports={airports}
          />
        </div>
      </div>

      {/* Transit + airport pills */}
      {(transit.length > 0 || airports.length > 0) && (
        <div style={{ padding: "0 12px 12px", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {transit.map((s, i) => {
            const badges = s.lines.slice(0, 3);
            return (
              <div
                key={i}
                style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--c21-panel-bg)", borderRadius: 8, padding: "5px 10px", border: "1px solid var(--c21-border)", fontSize: 11 }}
              >
                <div style={{ display: "flex", gap: 3 }}>
                  {badges.length > 0
                    ? badges.map((line, j) => <TransitBadge key={j} type={s.type} lines={[line]} />)
                    : <TransitBadge type={s.type} lines={[]} />}
                </div>
                <span style={{ fontWeight: 700, color: "var(--c21-text)" }}>{s.name}</span>
                <span style={{ color: "var(--c21-text-muted)" }}>{s.walkingTime} min à pied</span>
              </div>
            );
          })}
          {airports.map((a, i) => (
            <div
              key={i}
              style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--c21-panel-bg)", borderRadius: 8, padding: "5px 10px", border: "1px solid var(--c21-border)", fontSize: 11 }}
            >
              <span style={{ fontSize: 12 }}>✈</span>
              <span style={{ fontWeight: 700, color: "var(--c21-text)" }}>{a.city} · {a.iata}</span>
              <span style={{ color: "var(--c21-text-muted)" }}>{a.drivingTime} min en voiture</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
