"use client";

import { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, CartesianGrid, Legend,
  PieChart, Pie,
} from "recharts";
import { VizData, TableViz, BarChartViz, LineChartViz, PieChartViz } from "@/app/types/viz";

// ── Dark mode hook ────────────────────────────────────────────────────────────

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

// ── Colour palette ────────────────────────────────────────────────────────────

const PALETTE = ["#3b82f6", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#84cc16"];

function barColor(value: number, hasNegatives: boolean): string {
  if (!hasNegatives) return "#3b82f6";
  return value >= 0 ? "#10b981" : "#f87171";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtNum(v: string | number | null): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return v.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
  return v;
}

function CardWrapper({ title, children, caption }: {
  title?: string;
  children: React.ReactNode;
  caption?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
      {title && (
        <div className="px-5 pt-4 pb-3 border-b border-zinc-100 dark:border-zinc-800/50">
          <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
            {title}
          </p>
        </div>
      )}
      <div className={title ? "px-5 py-4" : "p-5"}>
        {children}
      </div>
      {caption && (
        <div className="px-5 pb-4 border-t border-zinc-100 dark:border-zinc-800/50 pt-2">
          <p className="text-[11px] text-zinc-400 dark:text-zinc-600 italic">{caption}</p>
        </div>
      )}
    </div>
  );
}

// ── Table ─────────────────────────────────────────────────────────────────────

function TableCard({ viz }: { viz: TableViz }) {
  return (
    <CardWrapper title={viz.title} caption={viz.caption}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100 dark:border-zinc-800/60">
              {viz.columns.map((col) => (
                <th
                  key={col.key}
                  className={`pb-2 font-semibold text-[11px] uppercase tracking-wide text-zinc-400 dark:text-zinc-600 whitespace-nowrap
                    ${col.align === "right" ? "text-right pr-2 last:pr-0" : col.align === "center" ? "text-center" : "text-left pr-4"}`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {viz.rows.map((row, i) => (
              <tr
                key={i}
                className={`border-b border-zinc-50 dark:border-zinc-800/30 last:border-0
                  ${i % 2 === 0 ? "" : "bg-zinc-50/50 dark:bg-zinc-800/10"}`}
              >
                {viz.columns.map((col) => {
                  const v = row[col.key];
                  const str = fmtNum(v);
                  const isPositive = typeof v === "string" && v.startsWith("+");
                  const isNegative = typeof v === "string" && v.startsWith("-") && v !== "—";
                  return (
                    <td
                      key={col.key}
                      className={`py-2.5 whitespace-nowrap
                        ${col.align === "right" ? "text-right pr-2 last:pr-0 font-mono text-xs" : col.align === "center" ? "text-center" : "text-left pr-4"}
                        ${isPositive ? "text-emerald-600 dark:text-emerald-400 font-semibold" : ""}
                        ${isNegative ? "text-red-500 dark:text-red-400 font-semibold" : ""}
                        ${!isPositive && !isNegative ? "text-zinc-700 dark:text-zinc-300" : ""}
                      `}
                    >
                      {str}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CardWrapper>
  );
}

// ── Bar chart ─────────────────────────────────────────────────────────────────

function BarCard({ viz }: { viz: BarChartViz }) {
  const dark = useDark();
  const hasNegatives = viz.values.some((v) => v < 0);

  const data = viz.labels.map((label, i) => ({
    label: label.length > 14 ? label.slice(0, 13) + "…" : label,
    fullLabel: label,
    value: viz.values[i] ?? 0,
  }));

  const tickColor = dark ? "#71717a" : "#a1a1aa";
  const gridColor = dark ? "#27272a" : "#f4f4f5";
  const tooltipBg = dark ? "#18181b" : "#ffffff";
  const tooltipBorder = dark ? "#3f3f46" : "#e4e4e7";

  return (
    <CardWrapper title={viz.title}>
      <ResponsiveContainer width="100%" height={Math.max(200, data.length * 36)}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
          <XAxis
            type="number"
            tick={{ fontSize: 11, fill: tickColor }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${v}${viz.unit ? " " + viz.unit : ""}`}
          />
          <YAxis
            type="category"
            dataKey="label"
            tick={{ fontSize: 11, fill: tickColor }}
            tickLine={false}
            axisLine={false}
            width={110}
          />
          <Tooltip
            contentStyle={{
              background: tooltipBg,
              border: `1px solid ${tooltipBorder}`,
              borderRadius: 8,
              fontSize: 12,
              color: dark ? "#e4e4e7" : "#3f3f46",
            }}
            formatter={(value: number | undefined, _name: string | undefined, props: { payload?: { fullLabel: string } }) => [
              value != null ? `${value.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}${viz.unit ? " " + viz.unit : ""}` : "—",
              props.payload?.fullLabel ?? "",
            ]}
            labelFormatter={() => ""}
            cursor={{ fill: dark ? "#27272a" : "#f4f4f5" }}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={28}>
            {data.map((d, i) => (
              <Cell key={i} fill={barColor(d.value, hasNegatives)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </CardWrapper>
  );
}

// ── Line chart ────────────────────────────────────────────────────────────────

function LineCard({ viz }: { viz: LineChartViz }) {
  const dark = useDark();

  const allXValues = Array.from(
    new Set(viz.series.flatMap((s) => s.data.map((d) => d.x)))
  ).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const chartData = allXValues.map((x) => {
    const row: Record<string, string | number> = { x };
    viz.series.forEach((s) => {
      const point = s.data.find((d) => d.x === x);
      row[s.label] = point?.y ?? NaN;
    });
    return row;
  });

  const tickColor = dark ? "#71717a" : "#a1a1aa";
  const gridColor = dark ? "#27272a" : "#f4f4f5";
  const tooltipBg = dark ? "#18181b" : "#ffffff";
  const tooltipBorder = dark ? "#3f3f46" : "#e4e4e7";

  return (
    <CardWrapper title={viz.title}>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartData} margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
          <XAxis
            dataKey="x"
            tick={{ fontSize: 11, fill: tickColor }}
            tickLine={false}
            axisLine={false}
            label={viz.x_label ? { value: viz.x_label, position: "insideBottom", offset: -4, fontSize: 11, fill: tickColor } : undefined}
          />
          <YAxis
            tick={{ fontSize: 11, fill: tickColor }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${v.toLocaleString("fr-FR", { maximumFractionDigits: 0 })}${viz.unit ? " " + viz.unit : ""}`}
            label={viz.y_label ? { value: viz.y_label, angle: -90, position: "insideLeft", fontSize: 11, fill: tickColor } : undefined}
            width={viz.y_label ? 64 : 48}
          />
          <Tooltip
            contentStyle={{
              background: tooltipBg,
              border: `1px solid ${tooltipBorder}`,
              borderRadius: 8,
              fontSize: 12,
              color: dark ? "#e4e4e7" : "#3f3f46",
            }}
            formatter={(value: number | undefined, name: string | undefined) => [
              value != null ? `${value.toLocaleString("fr-FR", { maximumFractionDigits: 0 })}${viz.unit ? " " + viz.unit : ""}` : "—",
              name ?? "",
            ]}
          />
          {viz.series.length > 1 && (
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
          )}
          {viz.series.map((s, i) => (
            <Line
              key={s.label}
              type="monotone"
              dataKey={s.label}
              stroke={PALETTE[i % PALETTE.length]}
              strokeWidth={2}
              dot={{ r: 3, fill: PALETTE[i % PALETTE.length] }}
              activeDot={{ r: 5 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </CardWrapper>
  );
}

// ── Pie chart ─────────────────────────────────────────────────────────────────

function PieCard({ viz }: { viz: PieChartViz }) {
  const dark = useDark();
  const tooltipBg = dark ? "#18181b" : "#ffffff";
  const tooltipBorder = dark ? "#3f3f46" : "#e4e4e7";
  const total = viz.slices.reduce((s, sl) => s + sl.value, 0);

  return (
    <CardWrapper title={viz.title}>
      <div className="flex items-center gap-4">
        <ResponsiveContainer width={160} height={160}>
          <PieChart>
            <Pie
              data={viz.slices}
              dataKey="value"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius={48}
              outerRadius={72}
              paddingAngle={2}
              strokeWidth={0}
            >
              {viz.slices.map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: tooltipBg,
                border: `1px solid ${tooltipBorder}`,
                borderRadius: 8,
                fontSize: 12,
                color: dark ? "#e4e4e7" : "#3f3f46",
              }}
              formatter={(value: number | undefined, name: string | undefined) => [
                value != null ? `${value.toLocaleString("fr-FR")}${viz.unit ? " " + viz.unit : ""}` : "—",
                name ?? "",
              ]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex-1 space-y-2">
          {viz.slices.map((sl, i) => {
            const pct = total > 0 ? ((sl.value / total) * 100).toFixed(1) : "0";
            return (
              <div key={i} className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: PALETTE[i % PALETTE.length] }}
                />
                <span className="text-sm text-zinc-700 dark:text-zinc-300 truncate">{sl.label}</span>
                <span className="ml-auto text-sm font-semibold text-zinc-900 dark:text-white font-mono shrink-0">
                  {sl.value.toLocaleString("fr-FR")}
                  {viz.unit && <span className="text-xs font-normal text-zinc-400 ml-0.5">{viz.unit}</span>}
                </span>
                <span className="text-xs text-zinc-400 dark:text-zinc-600 font-mono shrink-0 w-14 text-right">
                  {pct} %
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </CardWrapper>
  );
}

// ── Main dispatcher ───────────────────────────────────────────────────────────

export default function DataViz({ viz }: { viz: VizData }) {
  if (viz.type === "table") return <TableCard viz={viz} />;
  if (viz.type === "bar_chart") return <BarCard viz={viz} />;
  if (viz.type === "line_chart") return <LineCard viz={viz} />;
  if (viz.type === "pie_chart") return <PieCard viz={viz} />;
  return null;
}
