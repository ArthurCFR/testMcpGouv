"use client";

import { CommuneAnalysis } from "@/app/types";
import MapCard from "./MapCard";
import PriceChart from "./PriceChart";

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, decimals = 0): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("fr-FR", { maximumFractionDigits: decimals });
}

// ── Sub-components ───────────────────────────────────────────────────────────

function SourceBadge({ source }: { source?: string }) {
  if (!source) return null;
  return (
    <span className="text-[10px] text-zinc-400 dark:text-zinc-600 font-mono bg-zinc-100 dark:bg-zinc-800/60 px-2 py-0.5 rounded-full truncate max-w-[120px]">
      {source}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] uppercase tracking-widest text-zinc-400 dark:text-zinc-600 font-semibold mb-1">
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
  const sizeClass =
    size === "4xl"
      ? "text-4xl"
      : size === "2xl"
      ? "text-2xl"
      : size === "xl"
      ? "text-xl"
      : "text-lg";

  if (value === null || value === undefined) {
    return <span className="text-zinc-300 dark:text-zinc-700 text-xl">—</span>;
  }

  return (
    <span className={`${sizeClass} font-black text-zinc-900 dark:text-white tracking-tight`}>
      {typeof value === "number" ? fmt(value) : value}
      {unit && <span className="text-sm font-medium text-zinc-400 dark:text-zinc-500 ml-1">{unit}</span>}
    </span>
  );
}

/** Horizontal bars comparing two values */
function CompareBar({
  labelA,
  valueA,
  labelB,
  valueB,
  colorA = "bg-sky-500",
  colorB = "bg-indigo-400",
  unit,
}: {
  labelA: string;
  valueA?: number | null;
  labelB: string;
  valueB?: number | null;
  colorA?: string;
  colorB?: string;
  unit?: string;
}) {
  if (!valueA && !valueB) return null;
  const max = Math.max(valueA ?? 0, valueB ?? 0);

  const Row = ({
    label,
    value,
    color,
  }: {
    label: string;
    value?: number | null;
    color: string;
  }) => (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-xs text-zinc-500 dark:text-zinc-500">{label}</span>
        {value != null && (
          <span className="text-sm font-bold text-zinc-900 dark:text-white">
            {fmt(value)}
            {unit && <span className="text-xs font-normal text-zinc-400 dark:text-zinc-500 ml-0.5">{unit}</span>}
          </span>
        )}
      </div>
      <div className="h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
        {value != null && (
          <div
            className={`h-full rounded-full ${color}`}
            style={{ width: `${(value / max) * 100}%` }}
          />
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
function ThresholdBar({
  value,
  threshold,
  thresholdLabel,
}: {
  value: number;
  threshold: number;
  thresholdLabel: string;
}) {
  const isAbove = value >= threshold;
  const fillColor = isAbove ? "bg-emerald-500" : "bg-amber-500";
  const scale = Math.max(threshold * 1.5, 100);
  const fillPct = Math.min((value / scale) * 100, 100);
  const markerPct = Math.min((threshold / scale) * 100, 100);

  return (
    <div>
      <div className="relative h-2 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-visible">
        <div
          className={`absolute left-0 top-0 h-full rounded-full ${fillColor}`}
          style={{ width: `${fillPct}%` }}
        />
        {/* Threshold marker */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-px h-3.5 bg-zinc-400/60 dark:bg-zinc-400/50 rounded"
          style={{ left: `${markerPct}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] mt-1.5 text-zinc-400 dark:text-zinc-600">
        <span>0 %</span>
        <span>{thresholdLabel}</span>
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function ResultCards({ analysis }: { analysis: CommuneAnalysis }) {
  const { commune, immobilier, population, logement, meta } = analysis;

  const hasImmo =
    immobilier.prix_median_m2_appt != null || immobilier.prix_median_m2_maison != null;
  const hasSRU = logement?.taux_logements_sociaux_pct != null;

  return (
    <div className="space-y-3">
      {/* ── Hero : commune ─────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-6 py-5">
        {/* Subtle gradient */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-blue-50 dark:from-blue-950/25 via-transparent to-transparent" />

        <div className="relative space-y-4">
          {/* Name + badges */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-3xl font-black tracking-tight text-zinc-900 dark:text-white">
                {commune.nom}
              </h2>
              {(commune.departement || commune.region) && (
                <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-500">
                  {[
                    commune.departement && `Dép. ${commune.departement}`,
                    commune.region,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              {commune.code_insee && (
                <span className="rounded-full border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 px-3 py-1 font-mono text-xs text-zinc-600 dark:text-zinc-300">
                  {commune.code_insee}
                </span>
              )}
              {population.grille_densite && (
                <span className="rounded-full bg-zinc-100/80 dark:bg-zinc-800/60 px-3 py-1 text-xs italic text-zinc-500 dark:text-zinc-500">
                  {population.grille_densite}
                </span>
              )}
            </div>
          </div>

          {/* Population quick stats */}
          {(population.total || population.superficie_km2 || population.densite_hab_km2) && (
            <div className="flex flex-wrap gap-6 border-t border-zinc-200 dark:border-zinc-800/60 pt-4">
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
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-500/15 text-lg">
                  🏠
                </div>
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">Marché immobilier</span>
              </div>
              <SourceBadge source={immobilier.source} />
            </div>

            <CompareBar
              labelA="Appartements"
              valueA={immobilier.prix_median_m2_appt}
              labelB="Maisons"
              valueB={immobilier.prix_median_m2_maison}
              colorA="bg-sky-500"
              colorB="bg-indigo-400"
              unit="€/m²"
            />

            {immobilier.historique_prix && immobilier.historique_prix.length >= 2 && (
              <div className="border-t border-zinc-100 dark:border-zinc-800/50 pt-3">
                <SectionLabel>Évolution prix m² (2014–2024)</SectionLabel>
                <PriceChart data={immobilier.historique_prix} />
              </div>
            )}

            {(immobilier.nb_transactions_appt != null ||
              immobilier.nb_transactions_maison != null) && (
              <div className="border-t border-zinc-100 dark:border-zinc-800/50 pt-3 grid grid-cols-2 gap-4">
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
        )}

        {/* Logements sociaux */}
        {hasSRU && (
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-500/15 text-lg">
                  🏗️
                </div>
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">Logements sociaux</span>
              </div>
              <SourceBadge source={logement?.source} />
            </div>

            <div>
              <SectionLabel>Taux SRU</SectionLabel>
              <BigNumber
                value={logement!.taux_logements_sociaux_pct!}
                unit="%"
                size="4xl"
              />
            </div>

            <ThresholdBar
              value={logement!.taux_logements_sociaux_pct!}
              threshold={25}
              thresholdLabel="Seuil légal 25 %"
            />

            <p className="text-[11px] text-zinc-400 dark:text-zinc-600 italic">
              {logement!.taux_logements_sociaux_pct! >= 25
                ? "✓ Conforme à l'obligation SRU"
                : "En dessous du seuil légal SRU (25 %)"}
            </p>
          </div>
        )}
      </div>

      {/* ── Meta strip ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-100 dark:border-zinc-800/40 bg-zinc-50 dark:bg-zinc-900/30 px-4 py-2.5">
        <span className="text-[11px] text-zinc-400 dark:text-zinc-600">
          <span className="text-zinc-600 dark:text-zinc-400 font-medium">{meta.nb_appels_mcp}</span> appels MCP
        </span>
        {meta.donnees_manquantes.length > 0 && (
          <>
            <span className="text-zinc-200 dark:text-zinc-800">·</span>
            <span className="text-[11px] text-zinc-400 dark:text-zinc-600">Données manquantes :</span>
            {meta.donnees_manquantes.map((d) => (
              <span
                key={d}
                className="text-[10px] bg-zinc-200/60 dark:bg-zinc-800/60 text-zinc-500 dark:text-zinc-600 px-2 py-0.5 rounded-full font-mono"
              >
                {d}
              </span>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
