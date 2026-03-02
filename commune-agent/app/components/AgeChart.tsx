"use client";

interface Tranche {
  tranche: string;
  femmes: number;
  hommes: number;
}

// Youngest at bottom → oldest at top: display list is reversed
const TRANCHES_ASC = [
  "0-4", "5-9", "10-14", "15-19", "20-24", "25-29",
  "30-34", "35-39", "40-44", "45-49", "50-54", "55-59",
  "60-64", "65-69", "70-74", "75-79", "80-84", "85-89",
  "90-94", "95-99", "100+",
];

const BAR_H = 13;
const LABEL_W = 38;
const TOP_PAD = 18; // room for column headers
const BOTTOM_PAD = 4;

export default function AgeChart({ data }: { data: Tranche[] }) {
  const byTranche = Object.fromEntries(data.map((d) => [d.tranche, d]));
  const maxVal = Math.max(
    1,
    ...data.flatMap((d) => [d.femmes, d.hommes])
  );

  const n = TRANCHES_ASC.length;
  const totalH = TOP_PAD + n * BAR_H + BOTTOM_PAD;
  // Chart area split equally left/right of center
  const chartW = 320;
  const halfW = chartW / 2;
  const svgW = LABEL_W + chartW;

  // Display from top=oldest to bottom=youngest
  const displayOrder = [...TRANCHES_ASC].reverse();

  return (
    <svg
      viewBox={`0 0 ${svgW} ${totalH}`}
      className="w-full"
      aria-label="Pyramide des âges"
    >
      {/* Column headers */}
      <text
        x={LABEL_W + halfW / 2}
        y={12}
        textAnchor="middle"
        fontSize={9}
        fill="#3b82f6"
        fontWeight="600"
      >
        Hommes
      </text>
      <text
        x={LABEL_W + halfW + halfW / 2}
        y={12}
        textAnchor="middle"
        fontSize={9}
        fill="#ec4899"
        fontWeight="600"
      >
        Femmes
      </text>

      {/* Center axis */}
      <line
        x1={LABEL_W + halfW}
        y1={TOP_PAD - 2}
        x2={LABEL_W + halfW}
        y2={TOP_PAD + n * BAR_H}
        stroke="#3f3f46"
        strokeWidth={1}
      />

      {displayOrder.map((t, i) => {
        const d = byTranche[t] ?? { femmes: 0, hommes: 0 };
        const y = TOP_PAD + i * BAR_H;
        const hPx = (d.hommes / maxVal) * halfW;
        const fPx = (d.femmes / maxVal) * halfW;
        const isDecade = parseInt(t.split("-")[0]) % 10 === 0 || t === "100+";

        return (
          <g key={t}>
            {/* Hommes bar — extends left from center */}
            <rect
              x={LABEL_W + halfW - hPx}
              y={y + 1}
              width={hPx}
              height={BAR_H - 2}
              fill="#3b82f6"
              fillOpacity={0.65}
              rx={1}
            />
            {/* Femmes bar — extends right from center */}
            <rect
              x={LABEL_W + halfW}
              y={y + 1}
              width={fPx}
              height={BAR_H - 2}
              fill="#ec4899"
              fillOpacity={0.65}
              rx={1}
            />
            {/* Age label — only decades + 100+ to reduce clutter */}
            <text
              x={LABEL_W - 4}
              y={y + BAR_H / 2 + 3.5}
              textAnchor="end"
              fontSize={isDecade ? 8.5 : 7}
              fill={isDecade ? "#a1a1aa" : "#52525b"}
              fontWeight={isDecade ? "600" : "400"}
            >
              {t}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
