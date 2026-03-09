"use client";

import { CommuneAnalysis } from "@/app/types";
import MapCard from "./MapCard";
import PriceChart from "./PriceChart";
import AgeChart from "./AgeChart";

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, decimals = 0): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("fr-FR", { maximumFractionDigits: decimals });
}

// ── Sub-components ───────────────────────────────────────────────────────────

function SourceBadge({ source }: { source?: string }) {
  if (!source) return null;
  return (
    <span style={{
      fontSize: 10,
      color: "var(--c21-text-muted)",
      fontFamily: "monospace",
      background: "var(--c21-panel-bg)",
      padding: "2px 8px",
      borderRadius: "100px",
      border: "1px solid var(--c21-border)",
      maxWidth: 120,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      display: "inline-block",
    }}>
      {source}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: 10,
      textTransform: "uppercase",
      letterSpacing: "0.1em",
      color: "var(--c21-text-muted)",
      fontWeight: 600,
      marginBottom: 4,
    }}>
      {children}
    </p>
  );
}

function BigNumber({
  value,
  unit,
  size = "xl",
}: {
  value?: number | string | null;
  unit?: string;
  size?: "lg" | "xl" | "2xl" | "4xl";
}) {
  const fontSize =
    size === "4xl" ? "2.25rem"
    : size === "2xl" ? "1.5rem"
    : size === "xl"  ? "1.25rem"
    : "1.125rem";

  if (value === null || value === undefined) {
    return <span style={{ color: "var(--c21-text-faint)", fontSize: "1.25rem" }}>—</span>;
  }

  return (
    <span style={{ fontSize, fontWeight: 900, color: "var(--c21-text)", letterSpacing: "-0.03em" }}>
      {typeof value === "number" ? fmt(value) : value}
      {unit && (
        <span style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--c21-text-muted)", marginLeft: 4 }}>
          {unit}
        </span>
      )}
    </span>
  );
}

/** Horizontal bars comparing two values */
function CompareBar({
  labelA, valueA,
  labelB, valueB,
  colorA = "#3b82f6",
  colorB = "#d4af37",
  unit,
}: {
  labelA: string; valueA?: number | null;
  labelB: string; valueB?: number | null;
  colorA?: string; colorB?: string;
  unit?: string;
}) {
  if (!valueA && !valueB) return null;
  const max = Math.max(valueA ?? 0, valueB ?? 0);

  const Row = ({ label, value, color }: { label: string; value?: number | null; color: string }) => (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <span style={{ fontSize: "0.75rem", color: "var(--c21-text-muted)" }}>{label}</span>
        {value != null && (
          <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--c21-text)" }}>
            {fmt(value)}
            {unit && <span style={{ fontSize: "0.75rem", fontWeight: 400, color: "var(--c21-text-muted)", marginLeft: 2 }}>{unit}</span>}
          </span>
        )}
      </div>
      <div style={{ height: 6, background: "var(--c21-border)", borderRadius: 999, overflow: "hidden" }}>
        {value != null && (
          <div style={{ height: "100%", borderRadius: 999, background: color, width: `${(value / max) * 100}%` }} />
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-2.5">
      <Row label={labelA} value={valueA} color={colorA} />
      <Row label={labelB} value={valueB} color={colorB} />
    </div>
  );
}

/** Progress bar with threshold marker */
function ThresholdBar({ value, threshold, thresholdLabel }: {
  value: number; threshold: number; thresholdLabel: string;
}) {
  const isAbove = value >= threshold;
  const fillColor = isAbove ? "#22c55e" : "#f59e0b";
  const scale = Math.max(threshold * 1.5, 100);
  const fillPct = Math.min((value / scale) * 100, 100);
  const markerPct = Math.min((threshold / scale) * 100, 100);

  return (
    <div>
      <div style={{ position: "relative", height: 8, background: "var(--c21-border)", borderRadius: 999, overflow: "visible" }}>
        <div style={{ position: "absolute", left: 0, top: 0, height: "100%", borderRadius: 999, background: fillColor, width: `${fillPct}%` }} />
        <div style={{
          position: "absolute", top: "50%", transform: "translateY(-50%)",
          width: 1, height: 14, background: "var(--c21-text-muted)",
          opacity: 0.5, borderRadius: 1, left: `${markerPct}%`,
        }} />
      </div>
      <div className="flex justify-between" style={{ fontSize: 10, marginTop: 6, color: "var(--c21-text-muted)" }}>
        <span>0 %</span>
        <span>{thresholdLabel}</span>
      </div>
    </div>
  );
}

// Card wrapper
function Card({ children, accent }: { children: React.ReactNode; accent?: string }) {
  return (
    <div style={{
      borderRadius: 16,
      border: "1px solid var(--c21-border)",
      background: "var(--c21-card-bg)",
      padding: "20px",
      backdropFilter: "blur(8px)",
      WebkitBackdropFilter: "blur(8px)",
      ...(accent ? { borderLeft: `3px solid ${accent}` } : {}),
    }}>
      {children}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function ResultCards({ analysis, hideMeta }: { analysis: CommuneAnalysis; hideMeta?: boolean }) {
  const { commune, immobilier, population, logement, pyramide_ages, meta } = analysis;

  const hasImmo =
    immobilier.prix_median_m2_appt != null || immobilier.prix_median_m2_maison != null;
  const hasSRU = logement?.taux_logements_sociaux_pct != null;

  return (
    <div className="space-y-3">
      {/* ── Hero : commune ─────────────────────────────────────── */}
      <div style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: 16,
        border: "1px solid var(--c21-border)",
        background: "var(--c21-card-bg)",
        padding: "20px 24px",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}>
        {/* Subtle gold gradient */}
        <div style={{
          pointerEvents: "none",
          position: "absolute", inset: 0,
          background: "linear-gradient(135deg, rgba(212,175,55,0.06) 0%, transparent 50%)",
        }} />

        <div className="relative space-y-4">
          {/* Name + badges */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 style={{ fontSize: "1.875rem", fontWeight: 900, letterSpacing: "-0.03em", color: "var(--c21-text)" }}>
                {commune.nom}
              </h2>
              {(commune.departement || commune.region) && (
                <p style={{ marginTop: 2, fontSize: "0.875rem", color: "var(--c21-text-muted)" }}>
                  {[
                    commune.departement && `Dép. ${commune.departement}`,
                    commune.region,
                  ].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              {commune.code_insee && (
                <span style={{
                  borderRadius: 999,
                  border: "1px solid var(--c21-border)",
                  background: "var(--c21-panel-bg)",
                  padding: "4px 12px",
                  fontFamily: "monospace",
                  fontSize: "0.75rem",
                  color: "var(--c21-text-muted)",
                }}>
                  {commune.code_insee}
                </span>
              )}
              {population.grille_densite && (
                <span style={{
                  borderRadius: 999,
                  background: "var(--c21-panel-bg)",
                  padding: "4px 12px",
                  fontSize: "0.75rem",
                  fontStyle: "italic",
                  color: "var(--c21-text-muted)",
                }}>
                  {population.grille_densite}
                </span>
              )}
            </div>
          </div>

          {/* Population quick stats */}
          {(population.total || population.superficie_km2 || population.densite_hab_km2) && (
            <div className="flex flex-wrap gap-6" style={{ borderTop: "1px solid var(--c21-border)", paddingTop: 16 }}>
              {population.total != null && (
                <div>
                  <SectionLabel>Population</SectionLabel>
                  <BigNumber value={population.total} unit="hab." size="xl" />
                </div>
              )}
              {population.densite_hab_km2 != null && (
                <div>
                  <SectionLabel>Densité</SectionLabel>
                  <BigNumber value={population.densite_hab_km2} unit="hab/km²" size="xl" />
                </div>
              )}
              {population.superficie_km2 != null && (
                <div>
                  <SectionLabel>Superficie</SectionLabel>
                  <BigNumber value={population.superficie_km2} unit="km²" size="xl" />
                </div>
              )}
              {population.source && (
                <div className="ml-auto self-end pb-0.5">
                  <SourceBadge source={population.source} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Map ────────────────────────────────────────────────── */}
      {commune.code_insee && (
        <MapCard code_insee={commune.code_insee} nom={commune.nom} />
      )}

      {/* ── Data cards ─────────────────────────────────────────── */}
      <div className={`grid gap-3 ${hasSRU ? "md:grid-cols-2" : "grid-cols-1"}`}>
        {/* Marché immobilier */}
        {hasImmo && (
          <Card accent="var(--c21-blue)">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div style={{
                    width: 32, height: 32, borderRadius: 10,
                    background: "rgba(59,130,246,0.12)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "1.1rem",
                  }}>🏠</div>
                  <span style={{ fontWeight: 600, color: "var(--c21-text)" }}>Marché immobilier</span>
                </div>
                <SourceBadge source={immobilier.source} />
              </div>

              <CompareBar
                labelA="Appartements"
                valueA={immobilier.prix_median_m2_appt}
                labelB="Maisons"
                valueB={immobilier.prix_median_m2_maison}
                colorA="#3b82f6"
                colorB="#d4af37"
                unit="€/m²"
              />

              {immobilier.historique_prix && immobilier.historique_prix.length >= 2 && (
                <div style={{ borderTop: "1px solid var(--c21-border)", paddingTop: 12 }}>
                  <SectionLabel>Évolution prix m² (2014–2024)</SectionLabel>
                  <PriceChart data={immobilier.historique_prix} />
                </div>
              )}

              {(immobilier.nb_transactions_appt != null || immobilier.nb_transactions_maison != null) && (
                <div className="grid grid-cols-2 gap-4" style={{ borderTop: "1px solid var(--c21-border)", paddingTop: 12 }}>
                  <div>
                    <SectionLabel>Ventes appt.</SectionLabel>
                    <BigNumber value={immobilier.nb_transactions_appt} size="lg" />
                  </div>
                  <div>
                    <SectionLabel>Ventes maisons</SectionLabel>
                    <BigNumber value={immobilier.nb_transactions_maison} size="lg" />
                  </div>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Logements sociaux */}
        {hasSRU && (
          <Card accent="var(--c21-gold)">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div style={{
                    width: 32, height: 32, borderRadius: 10,
                    background: "rgba(212,175,55,0.12)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "1.1rem",
                  }}>🏗️</div>
                  <span style={{ fontWeight: 600, color: "var(--c21-text)" }}>Logements sociaux</span>
                </div>
                <SourceBadge source={logement?.source} />
              </div>

              <div>
                <SectionLabel>Taux SRU</SectionLabel>
                <BigNumber value={logement!.taux_logements_sociaux_pct!} unit="%" size="4xl" />
              </div>

              <ThresholdBar
                value={logement!.taux_logements_sociaux_pct!}
                threshold={25}
                thresholdLabel="Seuil légal 25 %"
              />

              <p style={{ fontSize: 11, color: "var(--c21-text-muted)", fontStyle: "italic" }}>
                {logement!.taux_logements_sociaux_pct! >= 25
                  ? "✓ Conforme à l'obligation SRU"
                  : "En dessous du seuil légal SRU (25 %)"}
              </p>
            </div>
          </Card>
        )}
      </div>

      {/* ── Pyramide des âges ──────────────────────────────────── */}
      {pyramide_ages?.tranches && pyramide_ages.tranches.length >= 2 && (
        <Card>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div style={{
                  width: 32, height: 32, borderRadius: 10,
                  background: "rgba(168,85,247,0.12)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "1.1rem",
                }}>👥</div>
                <span style={{ fontWeight: 600, color: "var(--c21-text)" }}>Pyramide des âges</span>
              </div>
              {pyramide_ages.source && <SourceBadge source={pyramide_ages.source} />}
            </div>
            <AgeChart data={pyramide_ages.tranches} />
          </div>
        </Card>
      )}

      {/* ── Meta strip ─────────────────────────────────────────── */}
      {!hideMeta && <div
        data-pdf-skip=""
        className="flex flex-wrap items-center gap-3 px-4 py-2.5"
        style={{ borderRadius: 12, border: "1px solid var(--c21-border)", background: "var(--c21-panel-bg)" }}
      >
        <span style={{ fontSize: 11, color: "var(--c21-text-muted)" }}>
          <span style={{ color: "var(--c21-text)", fontWeight: 500 }}>{meta.nb_appels_mcp}</span> appels MCP
        </span>
        {meta.donnees_manquantes.length > 0 && (
          <>
            <span style={{ color: "var(--c21-border)" }}>·</span>
            <span style={{ fontSize: 11, color: "var(--c21-text-muted)" }}>Données manquantes :</span>
            {meta.donnees_manquantes.map((d) => (
              <span
                key={d}
                style={{
                  fontSize: 10,
                  background: "var(--c21-panel-bg)",
                  color: "var(--c21-text-muted)",
                  padding: "2px 8px",
                  borderRadius: 999,
                  fontFamily: "monospace",
                  border: "1px solid var(--c21-border)",
                }}
              >
                {d}
              </span>
            ))}
          </>
        )}
      </div>}
    </div>
  );
}
