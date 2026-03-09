"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState, useEffect } from "react";
import AddressSearch from "@/app/components/accessibility/AddressSearch";
import AccessibilityPanel from "@/app/components/accessibility/AccessibilityPanel";
import ThemeToggle from "@/app/components/ThemeToggle";
import type { AccessibilityData, BanFeature } from "@/app/types/accessibility";

// Leaflet must not be server-side rendered
const AccessibilityMap = dynamic(
  () => import("@/app/components/accessibility/AccessibilityMap"),
  { ssr: false, loading: () => <div style={{ height: "100%", background: "var(--c21-bg)" }} /> }
);

function useDark(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const check = () => setDark(document.documentElement.classList.contains("dark"));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

type Phase = "idle" | "l1" | "l2" | "done";

const PHASE_LABEL: Record<Exclude<Phase, "idle">, string> = {
  l1: "Transport a pied...",
  l2: "Aeroports...",
  done: "Analyse terminee",
};

export default function AccessibilitePage() {
  const dark = useDark();
  const [data, setData] = useState<AccessibilityData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");

  // Persist data across tab navigations
  useEffect(() => {
    if (data) sessionStorage.setItem("accessibility-data", JSON.stringify(data));
    else sessionStorage.removeItem("accessibility-data");
  }, [data]);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("accessibility-data");
      if (saved) setData(JSON.parse(saved));
    } catch {}
  }, []);

  const handleAddressSelect = async (feature: BanFeature) => {
    setError(null);
    setData(null);
    setPhase("idle");
    setLoading(true);

    const [lng, lat] = feature.geometry.coordinates;

    try {
      const res = await fetch("/api/accessibility/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lng, address: feature.properties.label }),
      });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const result: AccessibilityData = await res.json();
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "var(--c21-bg)",
        backgroundImage: `
          radial-gradient(circle at 15% 50%, var(--c21-bg-gradient-a), transparent 25%),
          radial-gradient(circle at 85% 30%, var(--c21-bg-gradient-b), transparent 25%)
        `,
        color: "var(--c21-text)",
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header
        style={{
          flexShrink: 0,
          background: "var(--c21-header-bg)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--c21-border)",
          zIndex: 10,
        }}
      >
        <div
          style={{
            maxWidth: "none",
            padding: "14px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {/* Left: nav tabs */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Link
              href="/"
              style={{
                fontSize: "0.8rem",
                fontWeight: 500,
                padding: "0.3rem 0.75rem",
                borderRadius: 20,
                color: "var(--c21-text-muted)",
                border: "1px solid var(--c21-border)",
                textDecoration: "none",
                transition: "all 0.2s",
              }}
            >
              Commune Agent
            </Link>
            <div
              style={{
                fontSize: "0.8rem",
                fontWeight: 600,
                padding: "0.3rem 0.75rem",
                borderRadius: 20,
                color: "var(--c21-gold)",
                border: "1px solid var(--c21-gold)",
                background: "rgba(212,175,55,0.08)",
              }}
            >
              Accessibilite
            </div>
          </div>

          {/* Center: title */}
          <span
            style={{
              fontWeight: 600,
              fontSize: "1rem",
              letterSpacing: "-0.3px",
              color: "var(--c21-text)",
              position: "absolute",
              left: "50%",
              transform: "translateX(-50%)",
            }}
          >
            Rapport d&apos;accessibilite
          </span>

          {/* Right: branding + theme */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span
              style={{
                fontWeight: 800,
                letterSpacing: "2px",
                fontSize: "0.9rem",
                color: "var(--c21-text)",
              }}
            >
              CENTURY{" "}
              <span style={{ color: "var(--c21-gold)" }}>21</span>
            </span>
            <div style={{ width: 1, height: 16, background: "var(--c21-border)" }} />
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* ── Body: left panel + map ─────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>

        {/* ── Left panel ──────────────────────────────────────────────── */}
        <aside
          style={{
            width: 380,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            borderRight: "1px solid var(--c21-border)",
            background: "var(--c21-sidebar-bg)",
            overflowY: "auto",
          }}
        >
          <div style={{ padding: "20px 18px", display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Search */}
            <div>
              <p
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--c21-text-muted)",
                  marginBottom: 8,
                }}
              >
                Adresse
              </p>
              <AddressSearch onSelect={handleAddressSelect} disabled={loading} />
            </div>

            {/* Loading state */}
            {loading && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  padding: "16px",
                  background: "var(--c21-panel-bg)",
                  border: "1px solid var(--c21-border)",
                  borderRadius: 10,
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    border: "2.5px solid var(--c21-border)",
                    borderTopColor: "var(--c21-gold)",
                    animation: "spin 0.8s linear infinite",
                  }}
                />
                <span style={{ fontSize: "0.8rem", color: "var(--c21-text-muted)" }}>
                  Calcul de l&apos;accessibilite...
                </span>
              </div>
            )}

            {/* Error */}
            {error && (
              <div
                style={{
                  padding: "12px 14px",
                  background: "rgba(239,68,68,0.07)",
                  border: "1px solid rgba(239,68,68,0.25)",
                  borderRadius: 10,
                  fontSize: "0.82rem",
                  color: "#ef4444",
                }}
              >
                {error}
              </div>
            )}

            {/* Animation phase indicator */}
            {phase !== "idle" && data && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 12px",
                  background:
                    phase === "done"
                      ? "rgba(62,165,93,0.1)"
                      : "rgba(212,175,55,0.08)",
                  border: `1px solid ${phase === "done" ? "rgba(62,165,93,0.3)" : "rgba(212,175,55,0.25)"}`,
                  borderRadius: 8,
                }}
              >
                {phase === "done" ? (
                  <svg
                    width="14"
                    height="14"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="#3EA55D"
                    strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <div
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: "50%",
                      border: "2px solid var(--c21-border)",
                      borderTopColor: "var(--c21-gold)",
                      animation: "spin 0.8s linear infinite",
                      flexShrink: 0,
                    }}
                  />
                )}
                <span
                  style={{
                    fontSize: "0.78rem",
                    fontWeight: 500,
                    color: phase === "done" ? "#3EA55D" : "var(--c21-text-muted)",
                  }}
                >
                  {PHASE_LABEL[phase]}
                </span>
              </div>
            )}

            {/* Results panel */}
            {data && !loading && (
              <AccessibilityPanel
                data={data}
                phase={phase === "idle" ? "l1" : phase}
              />
            )}

            {/* Empty state hint */}
            {!data && !loading && !error && (
              <div
                style={{
                  padding: "32px 0",
                  textAlign: "center",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: "16px",
                    background: "linear-gradient(135deg, var(--c21-gold), var(--c21-blue))",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "1.6rem",
                    boxShadow: "0 0 20px var(--c21-gold-glow)",
                  }}
                >
                  🗺️
                </div>
                <div>
                  <p
                    style={{
                      fontSize: "0.88rem",
                      fontWeight: 600,
                      color: "var(--c21-text)",
                      marginBottom: 4,
                    }}
                  >
                    Analyse d&apos;accessibilite
                  </p>
                  <p
                    style={{
                      fontSize: "0.78rem",
                      color: "var(--c21-text-muted)",
                      lineHeight: 1.5,
                      maxWidth: 260,
                    }}
                  >
                    Entrez une adresse pour visualiser les transports a pied et les aeroports en voiture.
                  </p>
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* ── Map ──────────────────────────────────────────────────────── */}
        <main style={{ flex: 1, position: "relative", minWidth: 0 }}>
          <AccessibilityMap
            data={data}
            dark={dark}
            onPhaseChange={(p) => setPhase(p)}
          />
        </main>
      </div>
    </div>
  );
}
