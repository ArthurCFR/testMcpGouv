"use client";

import type { AccessibilityData, TransitStop, TransitType } from "@/app/types/accessibility";
import { getLineColor, getContrastText } from "@/app/lib/transitColors";

// ── Per-line colored badge ───────────────────────────────────────────────────
function LineBadge({ type, line }: { type: TransitType; line: string }) {
  const color = getLineColor(type, line);
  const textColor = getContrastText(color);

  if (type === "metro") {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 22,
          height: 22,
          borderRadius: "50%",
          background: color,
          color: textColor,
          fontSize: "0.6rem",
          fontWeight: 800,
          padding: "0 4px",
          letterSpacing: "-0.02em",
          flexShrink: 0,
          lineHeight: 1,
        }}
      >
        {line}
      </span>
    );
  }

  if (type === "rer") {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 22,
          height: 22,
          borderRadius: 4,
          background: "white",
          border: `2px solid ${color}`,
          color: color,
          fontSize: "0.6rem",
          fontWeight: 800,
          padding: "0 3px",
          flexShrink: 0,
          lineHeight: 1,
        }}
      >
        {line}
      </span>
    );
  }

  if (type === "tram") {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 22,
          height: 22,
          borderRadius: 4,
          background: color,
          color: textColor,
          fontSize: "0.6rem",
          fontWeight: 800,
          padding: "0 4px",
          flexShrink: 0,
          lineHeight: 1,
        }}
      >
        {line}
      </span>
    );
  }

  return (
    <span
      style={{
        fontSize: "0.62rem",
        fontWeight: 700,
        color: color,
        background: `${color}18`,
        border: `1px solid ${color}40`,
        borderRadius: 4,
        padding: "0px 4px",
        lineHeight: "1.6",
      }}
    >
      {line}
    </span>
  );
}

// ── Mode icon badge (shape varies per transport type) ────────────────────────
function ModeBadge({ type }: { type: TransitType }) {
  if (type === "metro") {
    return (
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: "#003189",
          color: "white",
          fontSize: 9,
          fontWeight: 800,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        M
      </div>
    );
  }

  if (type === "rer") {
    return (
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: "#7B5EA7",
          color: "white",
          fontSize: 9,
          fontWeight: 800,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        R
      </div>
    );
  }

  if (type === "tram") {
    return (
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: 4,
          background: "#3EA55D",
          color: "white",
          fontSize: 9,
          fontWeight: 800,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        T
      </div>
    );
  }

  if (type === "train") {
    return (
      <div
        style={{
          width: 26,
          height: 22,
          borderRadius: 4,
          background: "#374151",
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {/* train icon */}
        <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
          <rect x="4" y="3" width="16" height="14" rx="3" strokeLinejoin="round" />
          <path strokeLinecap="round" d="M4 11h16" />
          <path strokeLinecap="round" d="M8 3v8M16 3v8" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 21l2-4h6l2 4" />
        </svg>
      </div>
    );
  }

  // bus
  return (
    <div
      style={{
        width: 22,
        height: 22,
        borderRadius: 4,
        background: "#E07A10",
        color: "white",
        fontSize: 9,
        fontWeight: 800,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      B
    </div>
  );
}

// ── Build line sections: group stops by line, max 2 stops per line ───────────
function buildLineSections(
  stops: TransitStop[],
): Array<{ line: string; type: TransitType; stops: TransitStop[] }> {
  // stops are already sorted closest-first
  const seen = new Map<string, { type: TransitType; stops: TransitStop[] }>();
  for (const stop of stops) {
    for (const line of stop.lines) {
      const existing = seen.get(line);
      if (!existing) {
        seen.set(line, { type: stop.type, stops: [stop] });
      } else if (existing.stops.length < 2 && !existing.stops.includes(stop)) {
        existing.stops.push(stop);
      }
    }
  }
  return Array.from(seen.entries()).map(([line, val]) => ({
    line,
    type: val.type,
    stops: val.stops,
  }));
}

function StopRow({ stop, line }: { stop: TransitStop; line?: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "7px 12px",
        background: "var(--c21-panel-bg)",
        border: "1px solid var(--c21-border)",
        borderRadius: 8,
        marginBottom: 3,
      }}
    >
      {line ? <LineBadge type={stop.type} line={line} /> : <ModeBadge type={stop.type} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: "0.82rem",
            fontWeight: 500,
            color: "var(--c21-text)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {stop.name}
        </div>
        <div style={{ fontSize: "0.72rem", color: "var(--c21-text-muted)", marginTop: 1 }}>
          {stop.walkingDistance < 1000
            ? `${stop.walkingDistance} m`
            : `${(stop.walkingDistance / 1000).toFixed(1)} km`}
        </div>
      </div>
      <div
        style={{
          fontSize: "0.9rem",
          fontWeight: 700,
          color: "var(--c21-text)",
          whiteSpace: "nowrap",
        }}
      >
        {stop.walkingTime} min
      </div>
    </div>
  );
}

interface Props {
  data: AccessibilityData;
  phase: "l1" | "l2" | "done";
}

export default function AccessibilityPanel({ data, phase }: Props) {
  const showAirports = phase === "l2" || phase === "done";

  // Separate stops: those with lines (metro/tram/rer) grouped by line, others by type
  const linedStops = data.transitStops.filter(
    (s) => (s.type === "metro" || s.type === "tram" || s.type === "rer") && s.lines.length > 0,
  );
  const trainStops = data.transitStops.filter((s) => s.type === "train");
  const busStops   = data.transitStops.filter((s) => s.type === "bus");

  const lineSections = buildLineSections(linedStops);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ── Address recap ─────────────────────────────────────────────── */}
      <div
        style={{
          padding: "12px 14px",
          background: "var(--c21-panel-bg)",
          border: "1px solid var(--c21-border)",
          borderRadius: 10,
          fontSize: "0.85rem",
          color: "var(--c21-text-muted)",
          display: "flex",
          gap: 8,
          alignItems: "flex-start",
        }}
      >
        <svg
          style={{ color: "var(--c21-gold)", flexShrink: 0, marginTop: 1 }}
          width="14"
          height="14"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
        <span style={{ color: "var(--c21-text)", fontWeight: 500, lineHeight: 1.4 }}>
          {data.address}
        </span>
      </div>

      {/* ── Level 1: Transit stops ─────────────────────────────────────── */}
      <div>
        <div
          style={{
            fontSize: "0.7rem",
            fontWeight: 700,
            letterSpacing: "0.08em",
            color: "var(--c21-text-muted)",
            textTransform: "uppercase",
            marginBottom: 10,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Acces a pied
        </div>

        {data.transitStops.length === 0 ? (
          <p style={{ fontSize: "0.82rem", color: "var(--c21-text-muted)", fontStyle: "italic" }}>
            Aucun transport en commun trouve dans un rayon de 2 km.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

            {/* Metro / tram / RER grouped by line */}
            {lineSections.map(({ line, type, stops }) => {
              const color = getLineColor(type, line);
              const textColor = getContrastText(color);
              return (
                <div key={`${type}::${line}`}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      marginBottom: 5,
                      padding: "4px 10px 4px 8px",
                      background: `${color}18`,
                      borderLeft: `3px solid ${color}`,
                      borderRadius: "0 6px 6px 0",
                    }}
                  >
                    <LineBadge type={type} line={line} />
                    <span
                      style={{
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        color: color,
                        letterSpacing: "0.03em",
                      }}
                    >
                      {type === "metro" ? "Métro" : type === "rer" ? "RER" : "Tram"} {line}
                    </span>
                  </div>
                  {stops.map((stop) => (
                    <StopRow key={stop.id} stop={stop} line={line} />
                  ))}
                </div>
              );
            })}

            {/* Train stations */}
            {trainStops.length > 0 && (
              <div>
                <div
                  style={{
                    fontSize: "0.68rem",
                    fontWeight: 700,
                    color: "#374151",
                    marginBottom: 5,
                    letterSpacing: "0.04em",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <rect x="4" y="3" width="16" height="14" rx="3" strokeLinejoin="round" />
                    <path strokeLinecap="round" d="M4 11h16" />
                    <path strokeLinecap="round" d="M8 3v8M16 3v8" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 21l2-4h6l2 4" />
                  </svg>
                  Gare
                </div>
                {trainStops.map((stop) => (
                  <StopRow key={stop.id} stop={stop} />
                ))}
              </div>
            )}

            {/* Bus */}
            {busStops.length > 0 && (
              <div>
                <div
                  style={{
                    fontSize: "0.68rem",
                    fontWeight: 700,
                    color: "#E07A10",
                    marginBottom: 5,
                    letterSpacing: "0.04em",
                  }}
                >
                  Bus
                </div>
                {busStops.map((stop) => (
                  <div
                    key={stop.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "7px 12px",
                      background: "var(--c21-panel-bg)",
                      border: "1px solid var(--c21-border)",
                      borderRadius: 8,
                      marginBottom: 3,
                    }}
                  >
                    <ModeBadge type="bus" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: "0.82rem",
                          fontWeight: 500,
                          color: "var(--c21-text)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {stop.name}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", marginTop: 2 }}>
                        {stop.lines.slice(0, 6).map((line) => (
                          <LineBadge key={line} type="bus" line={line} />
                        ))}
                        <span style={{ fontSize: "0.72rem", color: "var(--c21-text-muted)" }}>
                          {stop.walkingDistance < 1000
                            ? `${stop.walkingDistance} m`
                            : `${(stop.walkingDistance / 1000).toFixed(1)} km`}
                        </span>
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: "0.9rem",
                        fontWeight: 700,
                        color: "var(--c21-text)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {stop.walkingTime} min
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Level 2: Airports ─────────────────────────────────────────── */}
      {showAirports && (
        <div>
          <div
            style={{
              fontSize: "0.7rem",
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: "var(--c21-text-muted)",
              textTransform: "uppercase",
              marginBottom: 10,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
            Aeroports en voiture
          </div>

          {data.airports.length === 0 ? (
            <p style={{ fontSize: "0.82rem", color: "var(--c21-text-muted)", fontStyle: "italic" }}>
              Aucun aeroport a moins de 90 minutes.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {data.airports.map((airport) => (
                <div
                  key={airport.iata}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 12px",
                    background: "var(--c21-panel-bg)",
                    border: "1px solid var(--c21-border)",
                    borderRadius: 8,
                  }}
                >
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      background: "#ef4444",
                      borderRadius: 7,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 14,
                      flexShrink: 0,
                    }}
                  >
                    ✈
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: "0.82rem",
                        fontWeight: 500,
                        color: "var(--c21-text)",
                      }}
                    >
                      {airport.city}
                      <span
                        style={{
                          marginLeft: 5,
                          fontSize: "0.68rem",
                          fontWeight: 700,
                          color: "#ef4444",
                          background: "rgba(239,68,68,0.1)",
                          padding: "1px 5px",
                          borderRadius: 4,
                        }}
                      >
                        {airport.iata}
                      </span>
                    </div>
                    <div style={{ fontSize: "0.72rem", color: "var(--c21-text-muted)" }}>
                      {airport.name} · {airport.drivingDistance} km
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: "0.9rem",
                      fontWeight: 700,
                      color: "var(--c21-text)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {airport.drivingTime} min
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
