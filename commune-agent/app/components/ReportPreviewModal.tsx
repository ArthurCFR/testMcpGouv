"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CommuneAnalysis } from "@/app/types";
import { VizData } from "@/app/types/viz";
import C21Header from "@/app/components/C21Header";
import ResultCards from "@/app/components/ResultCards";
import DataViz from "@/app/components/DataViz";
import century21Logo from "@/app/icons/Century-21-real-estate-Logo.png";
import type { AccessibilityData, TransitStop, Airport, TransitType } from "@/app/types/accessibility";
import { getLineColor, getContrastText } from "@/app/lib/transitColors";
import { selectTransitDestinations, selectAirportDestinations } from "@/app/lib/snapshotSelection";

const SnapshotMap = dynamic(() => import("@/app/components/SnapshotMap"), { ssr: false });

const C21_DARK = "#1c1917";
const C21_GOLD = "#b09a7a";

// ── PDF utilities ─────────────────────────────────────────────────────────────

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.readAsDataURL(blob);
  });
}

function cropWhitespace(src: string, maxOutputPx = 900): Promise<{ dataUrl: string; ratio: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const thumbScale = Math.min(1, 800 / img.width);
      const tw = Math.floor(img.width * thumbScale);
      const th = Math.floor(img.height * thumbScale);
      const thumb = document.createElement("canvas");
      thumb.width = tw; thumb.height = th;
      const tCtx = thumb.getContext("2d")!;
      tCtx.fillStyle = "#ffffff"; tCtx.fillRect(0, 0, tw, th);
      tCtx.drawImage(img, 0, 0, tw, th);
      const { data } = tCtx.getImageData(0, 0, tw, th);
      let minX = tw, maxX = 0, minY = th, maxY = 0;
      for (let y = 0; y < th; y++) {
        for (let x = 0; x < tw; x++) {
          const i = (y * tw + x) * 4;
          if (data[i] < 235 || data[i + 1] < 235 || data[i + 2] < 235) {
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX <= minX || maxY <= minY) { resolve({ dataUrl: src, ratio: img.width / img.height }); return; }
      const pad = Math.ceil(30 / thumbScale);
      const ox = Math.max(0, Math.floor(minX / thumbScale) - pad);
      const oy = Math.max(0, Math.floor(minY / thumbScale) - pad);
      const ow = Math.min(img.width, Math.ceil(maxX / thumbScale) + pad + 1) - ox;
      const oh = Math.min(img.height, Math.ceil(maxY / thumbScale) + pad + 1) - oy;
      const outScale = Math.min(1, maxOutputPx / ow);
      const fw = Math.floor(ow * outScale); const fh = Math.floor(oh * outScale);
      const out = document.createElement("canvas"); out.width = fw; out.height = fh;
      out.getContext("2d")!.drawImage(img, ox, oy, ow, oh, 0, 0, fw, fh);
      resolve({ dataUrl: out.toDataURL("image/png"), ratio: fw / fh });
    };
    img.onerror = () => resolve({ dataUrl: src, ratio: 1.778 });
    img.src = src;
  });
}

function findSafeBreak(canvas: HTMLCanvasElement, targetY: number, windowPx: number): number {
  const ctx = canvas.getContext("2d");
  if (!ctx) return targetY;
  const from = Math.max(0, targetY - windowPx);
  const len = targetY - from;
  if (len <= 0) return targetY;
  const { data } = ctx.getImageData(0, from, canvas.width, len);
  for (let row = len - 1; row >= 0; row--) {
    let isLight = true;
    for (let x = 0; x < canvas.width; x += 16) {
      const i = (row * canvas.width + x) * 4;
      if (data[i] < 230 || data[i + 1] < 230 || data[i + 2] < 230) { isLight = false; break; }
    }
    if (isLight) return from + row;
  }
  return targetY;
}

// ── Segment parsing ───────────────────────────────────────────────────────────

type Segment =
  | { type: "text"; textIdx: number; raw: string }
  | { type: "viz"; data: VizData };

interface AccessibilitySnap { address: string; lat: number; lng: number; }

interface ParseResult {
  segments: Segment[];
  accessSnaps: AccessibilitySnap[];
}

function parseSegments(text: string): ParseResult {
  const segments: Segment[] = [];
  const accessSnaps: AccessibilitySnap[] = [];
  // Match json-viz and json-accessibility blocks (skip json-suggest, bare json)
  const regex = /```(json-viz|json-accessibility)\s*([\s\S]*?)\s*```/gi;
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  let textIdx = 0;

  while ((match = regex.exec(text)) !== null) {
    const raw = text.slice(lastIdx, match.index)
      .replace(/```json-suggest[\s\S]*?```/gi, "")
      .replace(/```json[\s\S]*?```/gi, "")
      .replace(/===RÉPONSE===/g, "")
      .trim();
    if (raw) segments.push({ type: "text", textIdx: textIdx++, raw });

    const blockType = match[1].toLowerCase();
    const blockContent = match[2];

    if (blockType === "json-viz") {
      try { segments.push({ type: "viz", data: JSON.parse(blockContent) as VizData }); } catch { /* skip */ }
    } else if (blockType === "json-accessibility") {
      try { accessSnaps.push(JSON.parse(blockContent) as AccessibilitySnap); } catch { /* skip */ }
    }

    lastIdx = match.index + match[0].length;
  }

  const remaining = text.slice(lastIdx)
    .replace(/```json-suggest[\s\S]*?```/gi, "")
    .replace(/```json[\s\S]*?```/gi, "")
    .replace(/===RÉPONSE===/g, "")
    .trim();
  if (remaining) segments.push({ type: "text", textIdx: textIdx++, raw: remaining });

  return { segments, accessSnaps };
}

// ── Accessibility legend ──────────────────────────────────────────────────────

const TYPE_LABEL: Record<TransitType, string> = {
  metro: "Métro",
  rer: "RER",
  tram: "Tram",
  bus: "Bus",
  train: "Train",
};

function TransitBadge({ stop }: { stop: TransitStop }) {
  const line = stop.lines[0] ?? "";
  const color = line ? getLineColor(stop.type, line) : "#6b7280";
  const text = getContrastText(color);
  const label = stop.type === "tram" && line && !line.match(/^T\d/i) ? `T${line}` : (line || TYPE_LABEL[stop.type][0]);
  const isSquare = stop.type === "tram";
  const isTrain = stop.type === "train";

  if (isTrain) {
    return (
      <div style={{ width: 22, height: 18, background: "#374151", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
          <rect x="4" y="3" width="16" height="14" rx="3" strokeLinejoin="round" />
          <line x1="4" y1="11" x2="20" y2="11" strokeLinecap="round" />
          <line x1="8" y1="3" x2="8" y2="11" strokeLinecap="round" />
          <line x1="16" y1="3" x2="16" y2="11" strokeLinecap="round" />
        </svg>
      </div>
    );
  }

  const fs = label.length > 3 ? "7px" : label.length > 2 ? "8px" : label.length === 2 ? "9px" : "10px";
  return (
    <div style={{
      width: 22, height: 22,
      background: color,
      borderRadius: isSquare ? 4 : "50%",
      display: "flex", alignItems: "center", justifyContent: "center",
      color: text, fontSize: fs, fontWeight: 800, flexShrink: 0,
      letterSpacing: "-0.5px",
    }}>
      {label.slice(0, 4)}
    </div>
  );
}

function AccessibilityLegend({ transit, airports }: { transit: TransitStop[]; airports: Airport[] }) {
  if (transit.length === 0 && airports.length === 0) return null;

  return (
    <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
      {transit.map((stop, i) => (
        <div key={i} style={{
          display: "flex", alignItems: "center", gap: 6,
          background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8,
          padding: "5px 10px 5px 6px", fontSize: "0.72rem",
        }}>
          <TransitBadge stop={stop} />
          <div>
            <div style={{ fontWeight: 600, color: "#111827", lineHeight: 1.2 }}>
              {stop.name.length > 22 ? stop.name.slice(0, 20) + "…" : stop.name}
            </div>
            <div style={{ color: "#6b7280", fontSize: "0.65rem" }}>{stop.walkingTime} min à pied</div>
          </div>
        </div>
      ))}
      {airports.map((ap, i) => (
        <div key={i} style={{
          display: "flex", alignItems: "center", gap: 6,
          background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8,
          padding: "5px 10px 5px 6px", fontSize: "0.72rem",
        }}>
          <div style={{ width: 22, height: 22, background: "#ef4444", borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", color: "white", flexShrink: 0 }}>
            ✈
          </div>
          <div>
            <div style={{ fontWeight: 600, color: "#111827", lineHeight: 1.2 }}>
              {ap.city} · {ap.iata}
            </div>
            <div style={{ color: "#6b7280", fontSize: "0.65rem" }}>{ap.drivingTime} min en voiture</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Editable text block ────────────────────────────────────────────────────────

function EditableText({
  value, onChange, isEditing, onToggle,
}: {
  value: string;
  onChange: (v: string) => void;
  isEditing: boolean;
  onToggle: () => void;
}) {
  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={onToggle}
        title={isEditing ? "Valider" : "Modifier ce paragraphe"}
        style={{
          position: "absolute", top: 0, right: 0, zIndex: 1,
          width: 26, height: 26, borderRadius: 6,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: isEditing ? "#e5e7eb" : "transparent",
          border: "1px solid #e5e7eb",
          cursor: "pointer", color: "#9ca3af",
          transition: "background 0.15s, color 0.15s",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = "#e5e7eb";
          (e.currentTarget as HTMLElement).style.color = "#6b7280";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = isEditing ? "#e5e7eb" : "transparent";
          (e.currentTarget as HTMLElement).style.color = "#9ca3af";
        }}
      >
        {isEditing ? (
          <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        )}
      </button>

      {isEditing ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: "100%",
            minHeight: Math.max(80, value.split("\n").length * 22 + 32),
            fontSize: "0.875rem", lineHeight: 1.7, color: "#374151",
            border: "1.5px solid #d1d5db", borderRadius: 6, padding: "8px 36px 8px 10px",
            resize: "vertical", fontFamily: "inherit",
            background: "#fafafa", outline: "none",
            boxSizing: "border-box",
          }}
          autoFocus
        />
      ) : (
        <div
          className="prose prose-sm max-w-none"
          style={{ color: "#374151", paddingRight: 32, cursor: "text" }}
          onClick={onToggle}
          title="Cliquer pour modifier"
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  isOpen: boolean;
  onClose: () => void;
  analysis: CommuneAnalysis | null;
  currentText: string;
  userNotes?: string;
  agentName?: string;
  clientName?: string;
}

export default function ReportPreviewModal({
  isOpen,
  onClose,
  analysis,
  currentText,
  userNotes = "",
  agentName,
  clientName,
}: Props) {
  const [pdfLoading, setPdfLoading] = useState(false);
  const [inlineAccessData, setInlineAccessData] = useState<AccessibilityData[]>([]);

  const [segments, setSegments] = useState<Segment[]>([]);
  const [accessSnaps, setAccessSnaps] = useState<AccessibilitySnap[]>([]);
  const [textContents, setTextContents] = useState<string[]>([]);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [notesText, setNotesText] = useState("");

  const previewRef = useRef<HTMLDivElement>(null);

  // Re-parse and reset editable content when modal opens or source changes
  useEffect(() => {
    if (!isOpen) return;
    const parsed = parseSegments(currentText);
    setSegments(parsed.segments);
    setAccessSnaps(parsed.accessSnaps);
    setTextContents(
      parsed.segments
        .filter((s): s is Extract<Segment, { type: "text" }> => s.type === "text")
        .map((s) => s.raw)
    );
    setEditingIdx(null);
    setNotesText(userNotes);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, currentText, userNotes]);

  // Load accessibility data for the collected accessibility snaps
  useEffect(() => {
    if (!isOpen || accessSnaps.length === 0) { setInlineAccessData([]); return; }

    Promise.all(
      accessSnaps.map((b) =>
        fetch("/api/accessibility/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat: b.lat, lng: b.lng, address: b.address }),
        }).then((r) => r.json() as Promise<AccessibilityData>).catch(() => null)
      )
    ).then((results) => {
      setInlineAccessData(results.filter((r): r is AccessibilityData => r !== null));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, accessSnaps]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  const handleDownloadPDF = async () => {
    setEditingIdx(null);
    await new Promise((r) => setTimeout(r, 80));

    const el = previewRef.current;
    if (!el) return;
    setPdfLoading(true);

    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all(
        [import("html2canvas"), import("jspdf")]
      );

      let logoDataUrl = "";
      let logoRatio = 4.2;
      try {
        const resp = await fetch((century21Logo as { src: string }).src);
        const raw = await blobToDataUrl(await resp.blob());
        const cropped = await cropWhitespace(raw);
        logoDataUrl = cropped.dataUrl;
        logoRatio = cropped.ratio;
      } catch { /* proceed without logo */ }

      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: "#ffffff",
        onclone: (_doc) => { _doc.documentElement.classList.remove("dark"); },
      });

      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 12;
      const contentW = pageW - margin * 2;
      const pxPerMm = canvas.width / contentW;
      const nominalSliceH = Math.floor((pageH - margin * 2) * pxPerMm);
      const searchWindow = Math.floor(nominalSliceH * 0.08);
      let srcY = 0;
      let pageCount = 0;

      while (srcY < canvas.height) {
        if (pageCount > 0) pdf.addPage();
        const remaining = canvas.height - srcY;
        let sliceH: number;
        if (remaining <= nominalSliceH) {
          sliceH = remaining;
        } else {
          const idealBreak = srcY + nominalSliceH;
          const safeBreak = findSafeBreak(canvas, idealBreak, searchWindow);
          sliceH = safeBreak - srcY;
          if (sliceH <= 0) sliceH = nominalSliceH;
        }
        const slice = document.createElement("canvas");
        slice.width = canvas.width; slice.height = sliceH;
        const ctx = slice.getContext("2d")!;
        ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, slice.width, sliceH);
        ctx.drawImage(canvas, 0, srcY, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
        pdf.addImage(slice.toDataURL("image/png"), "PNG", margin, margin, contentW, sliceH / pxPerMm);
        srcY += sliceH;
        pageCount++;
      }

      for (let i = 1; i <= pageCount; i++) {
        pdf.setPage(i);
        pdf.setDrawColor(232, 224, 213); pdf.setLineWidth(0.3);
        pdf.line(margin, pageH - 10, pageW - margin, pageH - 10);
        pdf.setFontSize(7); pdf.setTextColor(156, 163, 175);
        pdf.text("Commune Agent · data.gouv.fr", margin, pageH - 6);
        pdf.setTextColor(120, 113, 108);
        pdf.text(`${i} / ${pageCount}`, pageW / 2, pageH - 6, { align: "center" });
        if (logoDataUrl) {
          const logoHmm = 5; const logoWmm = logoHmm * logoRatio;
          pdf.addImage(logoDataUrl, "PNG", pageW - margin - logoWmm, pageH - logoHmm - 3, logoWmm, logoHmm);
        }
      }

      const safeCommune = (analysis?.commune?.nom ?? "Commune")
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "_")
        .replace(/_+/g, "_").replace(/^_|_$/g, "").toUpperCase();
      const dateStr = new Date().toISOString().slice(0, 10);
      pdf.save(`Rapport_${safeCommune}_${dateStr}.pdf`);
    } finally {
      setPdfLoading(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex flex-col" style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}>
      <div className="absolute inset-0" onClick={onClose} />

      <div
        className="relative flex flex-col mx-auto my-6 rounded-2xl overflow-hidden shadow-2xl"
        style={{ width: "min(860px, 95vw)", height: "calc(100vh - 48px)", background: "#f4f1ec" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Top bar ── */}
        <div
          className="shrink-0 flex items-center justify-between gap-4 px-5 py-3"
          style={{ background: C21_DARK, borderBottom: `2px solid ${C21_GOLD}` }}
        >
          <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "#fff", letterSpacing: "-0.3px" }}>
            Aperçu du rapport
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadPDF}
              disabled={pdfLoading}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                fontSize: "0.78rem", fontWeight: 600, padding: "6px 14px", borderRadius: 8,
                background: pdfLoading ? "rgba(176,154,122,0.4)" : C21_GOLD,
                color: pdfLoading ? "#a8a29e" : C21_DARK,
                border: "none", cursor: pdfLoading ? "default" : "pointer", transition: "background 0.2s",
              }}
            >
              {pdfLoading ? (
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              )}
              {pdfLoading ? "Génération…" : "Télécharger PDF"}
            </button>

            <button
              onClick={onClose}
              style={{ width: 30, height: 30, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.08)", color: "#a8a29e", border: "none", cursor: "pointer", fontSize: "1rem", transition: "background 0.15s, color 0.15s" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.16)"; (e.currentTarget as HTMLElement).style.color = "#fff"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.08)"; (e.currentTarget as HTMLElement).style.color = "#a8a29e"; }}
              title="Fermer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* ── Paper preview ── */}
        <div className="flex-1 overflow-y-auto" style={{ padding: "24px 20px 0" }}>
          <div style={{ maxWidth: 700, margin: "0 auto", borderRadius: 4 }}>
            <div
              ref={previewRef}
              style={{ background: "#ffffff", padding: "32px 40px 48px", boxShadow: "0 4px 32px rgba(0,0,0,0.12)", borderRadius: 4 }}
            >
              <C21Header
                analysis={analysis}
                agentName={agentName}
                clientName={clientName}
                address={accessSnaps[0]?.address}
              />

              {/* ── Interleaved segments ── */}
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {segments.map((seg, i) => {
                  if (seg.type === "text") {
                    const isEditing = editingIdx === seg.textIdx;
                    return (
                      <EditableText
                        key={i}
                        value={textContents[seg.textIdx] ?? seg.raw}
                        onChange={(v) => setTextContents((prev) => {
                          const next = [...prev];
                          next[seg.textIdx] = v;
                          return next;
                        })}
                        isEditing={isEditing}
                        onToggle={() => setEditingIdx(isEditing ? null : seg.textIdx)}
                      />
                    );
                  }

                  if (seg.type === "viz") {
                    return <DataViz key={i} viz={seg.data} />;
                  }

                  return null;
                })}
              </div>

              {analysis && (
                <div style={{ marginTop: 24 }}>
                  <ResultCards analysis={analysis} hideMeta />
                </div>
              )}

              {/* ── Accessibilité (section unique en fin de rapport) ── */}
              {inlineAccessData.length > 0 && (
                <div style={{ marginTop: 32, borderTop: "1px solid #e8e0d5", paddingTop: 20 }}>
                  <div style={{ fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a8a29e", marginBottom: 16 }}>
                    Accessibilité
                  </div>
                  {inlineAccessData.map((d, i) => {
                    const transit = selectTransitDestinations(d.transitStops, 5);
                    const airports = selectAirportDestinations(d.airports, 2);
                    return (
                      <div key={i} style={{ marginBottom: i < inlineAccessData.length - 1 ? 28 : 0 }}>
                        <div style={{ fontSize: "0.75rem", color: "#6b7280", marginBottom: 8 }}>{d.address}</div>
                        <div style={{ borderRadius: 8, overflow: "hidden", border: "1px solid #e5e7eb" }}>
                          <SnapshotMap
                            data={d}
                            width={620}
                            height={340}
                            overrideTransit={transit}
                            overrideAirports={airports}
                          />
                        </div>
                        <AccessibilityLegend transit={transit} airports={airports} />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── Notes de l'agent ── */}
              <div style={{ marginTop: 32, borderTop: "1px solid #e8e0d5", paddingTop: 20 }}>
                <div style={{ fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a8a29e", marginBottom: 10 }}>
                  Notes de l&apos;agent
                </div>
                <textarea
                  value={notesText}
                  onChange={(e) => setNotesText(e.target.value)}
                  placeholder="Ajoutez vos notes ici…"
                  style={{
                    width: "100%", minHeight: 80,
                    fontSize: "0.875rem", lineHeight: 1.6, color: "#374151",
                    border: "1.5px solid #e5e7eb", borderRadius: 6, padding: "8px 10px",
                    resize: "vertical", fontFamily: "inherit",
                    background: "#fafafa", outline: "none",
                    boxSizing: "border-box",
                    whiteSpace: "pre-wrap",
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "#d1d5db"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "#e5e7eb"; }}
                />
              </div>
            </div>
          </div>
          <div style={{ height: 24 }} />
        </div>
      </div>
    </div>,
    document.body
  );
}
