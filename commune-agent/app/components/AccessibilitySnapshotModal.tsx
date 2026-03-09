"use client";

import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import AddressSearch from "@/app/components/accessibility/AddressSearch";
import type { SnapshotMapHandle } from "@/app/components/SnapshotMap";
import type { BanFeature, AccessibilityData } from "@/app/types/accessibility";
import type { SnapshotData } from "@/app/types/snapshot";
import { selectTransitDestinations, selectAirportDestinations } from "@/app/lib/snapshotSelection";

const SnapshotMap = dynamic(() => import("@/app/components/SnapshotMap"), {
  ssr: false,
  loading: () => (
    <div style={{ width: 600, height: 600, background: "#f0f0f0", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ color: "#9ca3af", fontSize: 14 }}>Chargement de la carte…</span>
    </div>
  ),
});

// ── Brand tokens ───────────────────────────────────────────────────────────────
const C21_DARK = "#1c1917";
const C21_GOLD = "#b09a7a";

// ── Loading spinner ────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "40px 0" }}>
      <div style={{ display: "flex", gap: 6 }}>
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            style={{
              width: 8, height: 8, borderRadius: "50%",
              background: C21_GOLD, display: "inline-block",
              animation: "bounce 0.9s infinite",
              animationDelay: `${delay}ms`,
            }}
          />
        ))}
      </div>
      <span style={{ fontSize: "0.8rem", color: "#78716c", fontWeight: 500 }}>
        Analyse de l&apos;accessibilité…
      </span>
      <style>{`@keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-7px)} }`}</style>
    </div>
  );
}

// ── Props ──────────────────────────────────────────────────────────────────────
interface Props {
  isOpen: boolean;
  onClose: () => void;
  defaultAddress?: string;
  onSnapshotReady: (snap: SnapshotData) => void;
}

type Phase = "idle" | "loading" | "map" | "capturing";

export default function AccessibilitySnapshotModal({
  isOpen,
  onClose,
  defaultAddress,
  onSnapshotReady,
}: Props) {
  const [selectedFeature, setSelectedFeature] = useState<BanFeature | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [accessData, setAccessData] = useState<AccessibilityData | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const snapshotMapRef = useRef<SnapshotMapHandle>(null);

  async function handleAnalyze() {
    if (!selectedFeature) return;
    setError(null);
    setAccessData(null);
    setMapReady(false);
    setPhase("loading");

    const [lng, lat] = selectedFeature.geometry.coordinates;
    const address = selectedFeature.properties.label;

    try {
      const res = await fetch("/api/accessibility/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lng, address }),
      });
      if (!res.ok) throw new Error("Erreur lors de l'analyse");
      const data = (await res.json()) as AccessibilityData;
      setAccessData(data);
      setPhase("map");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
      setPhase("idle");
    }
  }

  async function handleAddToReport() {
    if (!snapshotMapRef.current || !accessData) return;
    setPhase("capturing");
    try {
      const imageDataUrl = await snapshotMapRef.current.capture();
      const selectedTransit = selectTransitDestinations(accessData.transitStops, 3);
      const selectedAirports = selectAirportDestinations(accessData.airports, 2);
      onSnapshotReady({
        address: accessData.address,
        imageDataUrl,
        selectedTransit,
        selectedAirports,
      });
    } catch {
      setPhase("map");
    }
  }

  function handleClose() {
    setPhase("idle");
    setAccessData(null);
    setSelectedFeature(null);
    setMapReady(false);
    setError(null);
    onClose();
  }

  if (!isOpen) return null;

  const isCapturing = phase === "capturing";
  const canAnalyze = !!selectedFeature && phase !== "loading" && !isCapturing;
  // snapshotMapRef.current is not reactive — remove from guard (next/dynamic doesn't propagate ref changes as renders).
  // handleAddToReport already guards with an early return if the ref is null.
  const canAdd = (phase === "map" || isCapturing) && mapReady;

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 99999, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0" onClick={handleClose} />

      {/* Modal */}
      <div
        className="relative flex flex-col rounded-2xl overflow-hidden shadow-2xl"
        style={{
          width: "min(680px, 96vw)",
          maxHeight: "calc(100vh - 40px)",
          background: "#f4f1ec",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div
          className="shrink-0 flex items-center justify-between px-5 py-3"
          style={{ background: C21_DARK, borderBottom: `2px solid ${C21_GOLD}` }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 16 }}>📍</span>
            <span style={{ color: "#fff", fontWeight: 700, fontSize: "0.95rem", letterSpacing: "-0.3px" }}>
              Snapshot accessibilité
            </span>
          </div>
          <button
            onClick={handleClose}
            style={{
              width: 30, height: 30, borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "rgba(255,255,255,0.08)", color: "#a8a29e",
              border: "none", cursor: "pointer", fontSize: "1rem",
            }}
          >
            ✕
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto" style={{ padding: "20px 24px" }}>

          {/* Address search row */}
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <AddressSearch
                onSelect={setSelectedFeature}
                disabled={phase === "loading" || phase === "capturing"}
                defaultValue={defaultAddress}
              />
            </div>
            <button
              onClick={handleAnalyze}
              disabled={!canAnalyze}
              style={{
                flexShrink: 0,
                padding: "0 20px",
                height: 48,
                borderRadius: 12,
                fontWeight: 700,
                fontSize: "0.85rem",
                background: canAnalyze ? C21_DARK : "#e8e0d5",
                color: canAnalyze ? C21_GOLD : "#a8a29e",
                border: "none",
                cursor: canAnalyze ? "pointer" : "default",
                transition: "background 0.2s, color 0.2s",
                whiteSpace: "nowrap",
              }}
            >
              Analyser
            </button>
          </div>

          {/* Error */}
          {error && (
            <div style={{ marginTop: 12, padding: "10px 14px", background: "#fef2f2", borderRadius: 8, border: "1px solid #fca5a5", color: "#b91c1c", fontSize: "0.85rem" }}>
              {error}
            </div>
          )}

          {/* Loading */}
          {phase === "loading" && <Spinner />}

          {/* Map */}
          {(phase === "map" || phase === "capturing") && accessData && (
            <div style={{ marginTop: 16 }}>
              <div
                style={{
                  borderRadius: 10, overflow: "hidden",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
                  border: "1px solid #e8e0d5",
                  opacity: phase === "capturing" ? 0.7 : 1,
                  transition: "opacity 0.2s",
                }}
              >
                <SnapshotMap
                  ref={snapshotMapRef}
                  data={accessData}
                  size={Math.min(628, typeof window !== "undefined" ? window.innerWidth - 80 : 600)}
                  onReady={() => setMapReady(true)}
                />
              </div>

              {/* Mini dest list */}
              {mapReady && (() => {
                const transit = selectTransitDestinations(accessData.transitStops, 3);
                const airports = selectAirportDestinations(accessData.airports, 2);
                const all = [...transit, ...airports];
                return all.length > 0 ? (
                  <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {transit.map((s, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, background: "white", borderRadius: 8, padding: "6px 10px", border: "1px solid #e5e7eb", fontSize: 12 }}>
                        <span style={{ fontWeight: 700 }}>{s.name}</span>
                        <span style={{ color: "#6b7280" }}>{s.walkingTime} min</span>
                      </div>
                    ))}
                    {airports.map((a, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, background: "white", borderRadius: 8, padding: "6px 10px", border: "1px solid #e5e7eb", fontSize: 12 }}>
                        <span>✈</span>
                        <span style={{ fontWeight: 700 }}>{a.city}</span>
                        <span style={{ color: "#6b7280" }}>{a.drivingTime} min</span>
                      </div>
                    ))}
                  </div>
                ) : null;
              })()}

              {!mapReady && (
                <div style={{ marginTop: 10, textAlign: "center", color: "#9ca3af", fontSize: 12 }}>
                  Chargement des tuiles…
                </div>
              )}
            </div>
          )}

          {/* Idle placeholder */}
          {phase === "idle" && !error && (
            <div style={{ marginTop: 20, padding: "32px 0", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
              Entrez une adresse et cliquez <strong>Analyser</strong> pour générer le snapshot.
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div
          className="shrink-0 flex items-center justify-end gap-3 px-5 py-3"
          style={{ background: "#fff", borderTop: "1px solid #e8e0d5" }}
        >
          {phase === "capturing" && (
            <span style={{ fontSize: "0.8rem", color: "#78716c" }}>Capture en cours…</span>
          )}
          <button
            onClick={handleClose}
            style={{
              padding: "8px 18px", borderRadius: 8, fontSize: "0.85rem", fontWeight: 600,
              background: "transparent", color: "#78716c", border: "1.5px solid #e8e0d5",
              cursor: "pointer",
            }}
          >
            Annuler
          </button>
          <button
            onClick={handleAddToReport}
            disabled={!canAdd || isCapturing}
            style={{
              padding: "8px 20px", borderRadius: 8, fontSize: "0.85rem", fontWeight: 700,
              background: canAdd && !isCapturing ? C21_DARK : "#e8e0d5",
              color: canAdd && !isCapturing ? C21_GOLD : "#a8a29e",
              border: "none",
              cursor: canAdd && !isCapturing ? "pointer" : "default",
              transition: "background 0.2s, color 0.2s",
            }}
          >
            Ajouter au rapport
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
