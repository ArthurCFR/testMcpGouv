import type { TransitType } from "@/app/types/accessibility";

// ── Official RATP / IDFM line colors ────────────────────────────────────────

export const METRO_LINE_COLORS: Record<string, string> = {
  "1":    "#FFCD00",
  "2":    "#003CA6",
  "3":    "#837902",
  "3bis": "#6EC4E8",
  "4":    "#CF009E",
  "5":    "#FF7E2E",
  "6":    "#6ECA97",
  "7":    "#FA9ABA",
  "7bis": "#83C491",
  "8":    "#E19BDF",
  "9":    "#B6BD00",
  "10":   "#C9910D",
  "11":   "#704B1C",
  "12":   "#007852",
  "13":   "#98D4E2",
  "14":   "#62259D",
  "15":   "#B90845",
  "16":   "#F3A4BA",
  "17":   "#D5C900",
  "18":   "#00AA9C",
};

export const RER_LINE_COLORS: Record<string, string> = {
  "A": "#E2231A",
  "B": "#3D75C9",
  // RER C yellow is too light for white-bg badge → darkened for readability
  "C": "#CC9900",
  "D": "#00814F",
  "E": "#C66014",
};

export const TRAM_LINE_COLORS: Record<string, string> = {
  "T1":  "#005DA4",
  "T2":  "#00A850",
  "T3a": "#C96112",
  "T3b": "#7DBBDE",
  "T4":  "#F68E2A",
  "T5":  "#7DB71A",
  "T6":  "#8E3B8B",
  "T7":  "#E2231A",
  "T8":  "#6A1FAB",
  "T9":  "#00A79D",
  "T10": "#E05206",
  "T11": "#0099CC",
  "T12": "#00A850",
  "T13": "#E05206",
};

// Fallback per type when the line ref isn't in the dictionary
const TYPE_FALLBACK: Record<TransitType, string> = {
  metro: "#003189",
  rer:   "#7B5EA7",
  tram:  "#3EA55D",
  bus:   "#E07A10",
  train: "#E05206",
};

// Palette of visually distinct colors for unknown non-RATP lines.
// Hash-based: same line ref always maps to same color; different refs to different colors.
const GENERIC_PALETTE = [
  "#E2231A", "#003CA6", "#007852", "#CF009E", "#FF7E2E",
  "#837902", "#6ECA97", "#3D75C9", "#C96112", "#704B1C",
  "#62259D", "#1a7a6e", "#8B4513", "#1E90FF", "#CC0066",
];

function hashColor(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (Math.imul(31, h) + s.charCodeAt(i)) | 0; }
  return GENERIC_PALETTE[Math.abs(h) % GENERIC_PALETTE.length];
}

export function getLineColor(type: TransitType, lineRef: string): string {
  if (type === "metro") return METRO_LINE_COLORS[lineRef] ?? hashColor(`metro_${lineRef}`);
  if (type === "rer")   return RER_LINE_COLORS[lineRef]   ?? TYPE_FALLBACK.rer;
  if (type === "tram")  return TRAM_LINE_COLORS[lineRef]  ?? hashColor(`tram_${lineRef}`);
  return TYPE_FALLBACK[type];
}

/** Returns "white" or dark text color depending on background luminance. */
export function getContrastText(hexColor: string): string {
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? "#1c1917" : "white";
}
