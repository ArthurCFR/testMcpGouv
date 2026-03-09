"use client";

import { useEffect, useState } from "react";

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

interface DataPoint {
  annee: number;
  prix_m2: number;
  nb_mutations?: number | null;
}

interface PriceChartProps {
  data: DataPoint[];
}

export default function PriceChart({ data }: PriceChartProps) {
  const [hoveredYear, setHoveredYear] = useState<number | null>(null);
  const dark = useDark();

  if (!data || data.length < 2) return null;

  const sorted = [...data].sort((a, b) => a.annee - b.annee);
  const prices = sorted.map((d) => d.prix_m2);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const range = maxPrice - minPrice || 1;

  // SVG viewport
  const W = 400;
  const H = 160;
  const padL = 50;
  const padR = 70;
  const padT = 18;
  const padB = 46; // room for rotated year labels

  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  // X axis proportional to real year (gaps between years are meaningful)
  const minYear = sorted[0].annee;
  const maxYear = sorted[sorted.length - 1].annee;
  const yearSpan = maxYear - minYear || 1;

  const xOfYear = (year: number) =>
    padL + ((year - minYear) / yearSpan) * plotW;
  const yOfPrice = (price: number) =>
    padT + (1 - (price - minPrice) / range) * plotH;

  const plotBottom = padT + plotH; // y coordinate of the x axis

  const linePoints = sorted
    .map((d) => `${xOfYear(d.annee)},${yOfPrice(d.prix_m2)}`)
    .join(" ");

  const areaPoints = [
    `${xOfYear(minYear)},${plotBottom}`,
    ...sorted.map((d) => `${xOfYear(d.annee)},${yOfPrice(d.prix_m2)}`),
    `${xOfYear(maxYear)},${plotBottom}`,
  ].join(" ");

  // Y-axis ticks
  const yTicks = [minPrice, Math.round((minPrice + maxPrice) / 2), maxPrice];

  const lastPt = sorted[sorted.length - 1];
  const lastY = yOfPrice(lastPt.prix_m2);
  const labelY = Math.max(padT + 10, Math.min(plotBottom - 2, lastY + 4));

  const fmt = (n: number) => n.toLocaleString("fr-FR");

  // Tooltip
  const TOOLTIP_W = 116;
  const hoveredPt = hoveredYear !== null
    ? sorted.find((d) => d.annee === hoveredYear) ?? null
    : null;
  const hasNb = hoveredPt?.nb_mutations != null;
  const TOOLTIP_H = hasNb ? 50 : 34;

  let tooltipEl: React.ReactNode = null;
  if (hoveredPt) {
    const cx = xOfYear(hoveredPt.annee);
    const cy = yOfPrice(hoveredPt.prix_m2);
    let tx = cx + 12;
    if (tx + TOOLTIP_W > W - padR) tx = cx - TOOLTIP_W - 12;
    let ty = cy - TOOLTIP_H - 8;
    if (ty < padT - 4) ty = cy + 10;

    const ttBg   = dark ? "#1a1b1f" : "#ffffff";
    const ttBdr  = dark ? "rgba(212,175,55,0.3)" : "#e4e4e7";
    const ttHead = "#d4af37";
    const ttMain = dark ? "#f8fafc" : "#1c1917";
    const ttSub  = dark ? "rgba(248,250,252,0.45)" : "rgba(28,25,23,0.45)";

    tooltipEl = (
      <g style={{ pointerEvents: "none" }}>
        <rect
          x={tx} y={ty}
          width={TOOLTIP_W} height={TOOLTIP_H}
          rx="5"
          fill={ttBg}
          stroke={ttBdr}
          strokeWidth="1"
        />
        <text x={tx + 10} y={ty + 16} fontSize="10" fontWeight="700" fill={ttHead}>
          {hoveredPt.annee}
        </text>
        <text x={tx + 10} y={ty + 30} fontSize="10" fill={ttMain}>
          {fmt(hoveredPt.prix_m2)} €/m²
        </text>
        {hasNb && (
          <text x={tx + 10} y={ty + 43} fontSize="9" fill={ttSub}>
            {fmt(hoveredPt.nb_mutations!)} ventes
          </text>
        )}
      </g>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full cursor-crosshair"
      style={{ height: H }}
      aria-label="Évolution du prix au m²"
      onMouseLeave={() => setHoveredYear(null)}
    >
      <defs>
        <linearGradient id="dvf-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(56,189,248)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="rgb(56,189,248)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Y-axis grid lines + labels */}
      {yTicks.map((price, i) => (
        <g key={i}>
          <line
            x1={padL}
            y1={yOfPrice(price)}
            x2={W - padR}
            y2={yOfPrice(price)}
            className="stroke-zinc-200 dark:stroke-zinc-800"
            strokeDasharray="3 3"
          />
          <text
            x={padL - 6}
            y={yOfPrice(price) + 4}
            textAnchor="end"
            fontSize="9"
            className="fill-zinc-400 dark:fill-zinc-500"
          >
            {price >= 1000
              ? `${(price / 1000).toFixed(price % 1000 === 0 ? 0 : 1)}k`
              : price}
          </text>
        </g>
      ))}

      {/* Area fill */}
      <polygon points={areaPoints} fill="url(#dvf-fill)" />

      {/* Line */}
      <polyline
        points={linePoints}
        fill="none"
        stroke="rgb(56,189,248)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Dots + x-axis labels + hitboxes */}
      {sorted.map((d) => {
        const cx = xOfYear(d.annee);
        const cy = yOfPrice(d.prix_m2);
        const isHovered = hoveredYear === d.annee;
        const isLast = d.annee === maxYear;

        return (
          <g key={d.annee}>
            {/* Invisible hitbox */}
            <circle
              cx={cx}
              cy={cy}
              r="10"
              fill="transparent"
              onMouseEnter={() => setHoveredYear(d.annee)}
            />
            {/* Visible dot */}
            <circle
              cx={cx}
              cy={cy}
              r={isHovered ? 4.5 : isLast ? 3.5 : 2.5}
              fill={isHovered ? "rgb(186,230,253)" : isLast ? "rgb(56,189,248)" : "rgb(30,100,130)"}
              stroke="rgb(56,189,248)"
              strokeWidth={isHovered ? 1.5 : 1}
              style={{ transition: "r 0.1s, fill 0.1s" }}
            />
            {/* X-axis label anchored at bottom of plot area, rotated -45° */}
            <text
              x={cx}
              y={plotBottom + 6}
              textAnchor="end"
              fontSize="9"
              className={
                isHovered
                  ? "fill-zinc-700 dark:fill-zinc-300"
                  : "fill-zinc-400 dark:fill-zinc-500"
              }
              transform={`rotate(-45, ${cx}, ${plotBottom + 6})`}
            >
              {d.annee}
            </text>
          </g>
        );
      })}

      {/* Last value label — hidden when hovering that point */}
      {hoveredYear !== maxYear && (
        <text
          x={W - padR + 6}
          y={labelY}
          fontSize="10"
          fontWeight="700"
          fill="rgb(56,189,248)"
        >
          {fmt(lastPt.prix_m2)} €/m²
        </text>
      )}

      {/* Tooltip on top */}
      {tooltipEl}
    </svg>
  );
}
