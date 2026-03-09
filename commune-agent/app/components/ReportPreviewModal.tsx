"use client";

import century21Logo from "@/app/icons/Century-21-real-estate-Logo.png";
import { CommuneAnalysis } from "@/app/types";
import { VizData } from "@/app/types/viz";
import { Dispatch, SetStateAction, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import DataViz from "@/app/components/DataViz";
import ResultCards from "@/app/components/ResultCards";
import AccessibilitySnapshotModal from "@/app/components/AccessibilitySnapshotModal";
import type { SnapshotData } from "@/app/types/snapshot";
import type { TransitStop, Airport } from "@/app/types/accessibility";
import { getLineColor } from "@/app/lib/transitColors";

// ── Brand tokens ───────────────────────────────────────────────────────────────
const C21_DARK = "#1c1917";
const C21_GOLD = "#b09a7a";

// ── C21 Header (JSX replica of buildHeader) ───────────────────────────────────
function C21Header({
  analysis,
  agentName,
  clientName,
}: {
  analysis: CommuneAnalysis | null;
  agentName?: string;
  clientName?: string;
}) {
  const communeName = analysis?.commune?.nom ?? "Commune";
  const dept = analysis?.commune?.departement ?? "";
  const region = analysis?.commune?.region ?? "";
  const subtitle = [dept, region].filter(Boolean).join(" · ");
  const dateLabel = new Date().toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const hasAgent = agentName && agentName.trim();
  const hasClient = clientName && clientName.trim();

  return (
    <div
      style={{
        borderRadius: 8,
        overflow: "hidden",
        marginBottom: 24,
        fontFamily: "system-ui,-apple-system,sans-serif",
        border: "1px solid #e8e0d5",
      }}
    >
      {/* Logo zone */}
      <div
        style={{
          background: "#ffffff",
          padding: "14px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          borderBottom: `3px solid ${C21_GOLD}`,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={(century21Logo as { src: string }).src}
          style={{ height: 42, width: "auto", display: "block" }}
          alt="Century 21"
        />
      </div>

      {/* Dark zone */}
      <div style={{ background: C21_DARK, padding: "22px 24px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 26,
                fontWeight: 800,
                color: "#ffffff",
                letterSpacing: "-0.5px",
                lineHeight: 1.1,
              }}
            >
              {communeName}
            </div>
            {subtitle && (
              <div style={{ fontSize: 12, color: C21_GOLD, marginTop: 5 }}>
                {subtitle}
              </div>
            )}
          </div>
          <div style={{ textAlign: "right", paddingTop: 2 }}>
            <div style={{ fontSize: 9, color: "#78716c" }}>Rapport du</div>
            <div style={{ fontSize: 11, color: "#a8a29e", marginTop: 3 }}>
              {dateLabel}
            </div>
          </div>
        </div>

        {/* Agent / client line */}
        {(hasAgent || hasClient) && (
          <div
            style={{
              marginTop: 14,
              paddingTop: 12,
              borderTop: "1px solid rgba(255,255,255,0.08)",
              display: "flex",
              gap: 20,
              flexWrap: "wrap",
            }}
          >
            {hasAgent && (
              <div>
                <div style={{ fontSize: 8, color: "#57534e", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>
                  Agent
                </div>
                <div style={{ fontSize: 12, color: C21_GOLD, fontWeight: 600 }}>
                  {agentName}
                </div>
              </div>
            )}
            {hasClient && (
              <div>
                <div style={{ fontSize: 8, color: "#57534e", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>
                  Client
                </div>
                <div style={{ fontSize: 12, color: "#d6d3d1", fontWeight: 500 }}>
                  {clientName}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── PDF utilities (same as PDFButton) ─────────────────────────────────────────

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.readAsDataURL(blob);
  });
}

function cropWhitespace(
  src: string,
  maxOutputPx = 900
): Promise<{ dataUrl: string; ratio: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const thumbScale = Math.min(1, 800 / img.width);
      const tw = Math.floor(img.width * thumbScale);
      const th = Math.floor(img.height * thumbScale);
      const thumb = document.createElement("canvas");
      thumb.width = tw;
      thumb.height = th;
      const tCtx = thumb.getContext("2d")!;
      tCtx.fillStyle = "#ffffff";
      tCtx.fillRect(0, 0, tw, th);
      tCtx.drawImage(img, 0, 0, tw, th);
      const { data } = tCtx.getImageData(0, 0, tw, th);

      let minX = tw,
        maxX = 0,
        minY = th,
        maxY = 0;
      for (let y = 0; y < th; y++) {
        for (let x = 0; x < tw; x++) {
          const i = (y * tw + x) * 4;
          if (data[i] < 235 || data[i + 1] < 235 || data[i + 2] < 235) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      if (maxX <= minX || maxY <= minY) {
        resolve({ dataUrl: src, ratio: img.width / img.height });
        return;
      }

      const pad = Math.ceil(30 / thumbScale);
      const ox = Math.max(0, Math.floor(minX / thumbScale) - pad);
      const oy = Math.max(0, Math.floor(minY / thumbScale) - pad);
      const ow =
        Math.min(img.width, Math.ceil(maxX / thumbScale) + pad + 1) - ox;
      const oh =
        Math.min(img.height, Math.ceil(maxY / thumbScale) + pad + 1) - oy;

      const outScale = Math.min(1, maxOutputPx / ow);
      const fw = Math.floor(ow * outScale);
      const fh = Math.floor(oh * outScale);
      const out = document.createElement("canvas");
      out.width = fw;
      out.height = fh;
      out.getContext("2d")!.drawImage(img, ox, oy, ow, oh, 0, 0, fw, fh);

      resolve({ dataUrl: out.toDataURL("image/png"), ratio: fw / fh });
    };
    img.onerror = () => resolve({ dataUrl: src, ratio: 1.778 });
    img.src = src;
  });
}

function findSafeBreak(
  canvas: HTMLCanvasElement,
  targetY: number,
  windowPx: number
): number {
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
      if (data[i] < 230 || data[i + 1] < 230 || data[i + 2] < 230) {
        isLight = false;
        break;
      }
    }
    if (isLight) return from + row;
  }
  return targetY;
}

// ── Parsing utils (same as ChatMessage) ───────────────────────────────────────

function parseVizBlocks(text: string): VizData[] {
  const blocks: VizData[] = [];
  const regex = /```json-viz\s*([\s\S]*?)\s*```/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    try { blocks.push(JSON.parse(match[1]) as VizData); } catch { /* skip */ }
  }
  return blocks;
}

function stripJsonBlocks(text: string): string {
  return text
    .replace(/```json-suggest[\s\S]*?```/gi, "")
    .replace(/```json-viz[\s\S]*?```/gi, "")
    .replace(/```json[\s\S]*?```/gi, "")
    .replace(/===RÉPONSE===/g, "")
    .trim();
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  isOpen: boolean;
  onClose: () => void;
  analysis: CommuneAnalysis | null;
  agentName?: string;
  clientName?: string;
  versions: string[];
  setVersions: Dispatch<SetStateAction<string[]>>;
  versionIdx: number;
  setVersionIdx: Dispatch<SetStateAction<number>>;
}

export default function ReportPreviewModal({
  isOpen,
  onClose,
  analysis,
  agentName,
  clientName,
  versions,
  setVersions,
  versionIdx,
  setVersionIdx,
}: Props) {
  const [comment, setComment] = useState("");
  const [isRefining, setIsRefining] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [snapshots, setSnapshots] = useState<SnapshotData[]>([]);
  const [snapshotModalOpen, setSnapshotModalOpen] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset comment/refining state when modal opens
  useEffect(() => {
    if (isOpen) {
      setComment("");
      setIsRefining(false);
    }
  }, [isOpen]);

  // Escape closes
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  const currentText = versions[versionIdx];
  // Parse display text and viz blocks from the current version's full text
  const currentDisplayText = stripJsonBlocks(currentText);
  const currentVizBlocks = parseVizBlocks(currentText);

  const handleRefine = async () => {
    if (!comment.trim() || isRefining) return;
    const savedComment = comment.trim();
    setComment("");
    setIsRefining(true);

    const newVersionIdx = versions.length;

    // Append empty placeholder and navigate to it
    setVersions((prev) => [...prev, ""]);
    setVersionIdx(newVersionIdx);

    try {
      const res = await fetch("/api/refine-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportMarkdown: currentText,
          comment: savedComment,
        }),
      });

      if (!res.ok) throw new Error("Erreur lors du raffinement");

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let refined = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        refined += decoder.decode(value, { stream: true });
        const captured = refined;
        setVersions((prev) => {
          const updated = [...prev];
          updated[newVersionIdx] = captured;
          return updated;
        });
      }
    } catch (err) {
      console.error(err);
      // Remove failed version, go back
      setVersions((prev) => prev.slice(0, newVersionIdx));
      setVersionIdx(newVersionIdx - 1);
    } finally {
      setIsRefining(false);
    }
  };

  const handleDownloadPDF = async () => {
    const el = previewRef.current;
    if (!el) return;
    setPdfLoading(true);

    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all(
        [import("html2canvas"), import("jspdf")]
      );

      const communeName = analysis?.commune?.nom ?? "Commune";

      // Fetch and crop logo for footer
      let logoDataUrl = "";
      let logoRatio = 4.2;
      try {
        const resp = await fetch((century21Logo as { src: string }).src);
        const raw = await blobToDataUrl(await resp.blob());
        const cropped = await cropWhitespace(raw);
        logoDataUrl = cropped.dataUrl;
        logoRatio = cropped.ratio;
      } catch {
        // proceed without logo in footer
      }

      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: "#ffffff",
        onclone: (_doc) => {
          _doc.documentElement.classList.remove("dark");
        },
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
        slice.width = canvas.width;
        slice.height = sliceH;
        const ctx = slice.getContext("2d")!;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, slice.width, sliceH);
        ctx.drawImage(canvas, 0, srcY, canvas.width, sliceH, 0, 0, canvas.width, sliceH);

        pdf.addImage(
          slice.toDataURL("image/png"),
          "PNG",
          margin,
          margin,
          contentW,
          sliceH / pxPerMm
        );
        srcY += sliceH;
        pageCount++;
      }

      // ── Snapshot pages (one per accessibility snapshot) ──────────────────
      for (const snap of snapshots) {
        pdf.addPage();
        const sPageW = pdf.internal.pageSize.getWidth();
        const sPageH = pdf.internal.pageSize.getHeight();
        const sMargin = 12;
        const sContentW = sPageW - sMargin * 2;
        pageCount++;

        // Header
        pdf.setFontSize(12);
        pdf.setTextColor(28, 25, 23); // C21_DARK
        pdf.setFont("helvetica", "bold");
        pdf.text("Accessibilité", sMargin, sMargin + 7);
        pdf.setFontSize(8);
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(176, 154, 122); // C21_GOLD
        pdf.text(snap.address, sMargin, sMargin + 13);

        // Map image (square, centered)
        const mapTopY = sMargin + 18;
        const mapSize = Math.min(sContentW, (sPageH - sMargin * 2 - 18) * 0.65);
        const mapX = sMargin + (sContentW - mapSize) / 2;
        pdf.addImage(snap.imageDataUrl, "PNG", mapX, mapTopY, mapSize, mapSize);

        // Destination cards below the map
        const cardsY = mapTopY + mapSize + 7;
        const allDest: (TransitStop | Airport)[] = [
          ...snap.selectedTransit,
          ...snap.selectedAirports,
        ];
        if (allDest.length > 0) {
          const cardW = sContentW / Math.max(allDest.length, 1);
          const cardH = (sPageH - sMargin - cardsY - 10);

          allDest.forEach((dest, i) => {
            const cx = sMargin + i * cardW;
            const cw = cardW - 2;

            // Card background
            pdf.setFillColor(255, 255, 255);
            pdf.setDrawColor(229, 231, 235);
            pdf.setLineWidth(0.3);
            pdf.roundedRect(cx, cardsY, cw, cardH, 3, 3, "FD");

            const isTransit = "walkingTime" in dest;

            if (isTransit) {
              const stop = dest as TransitStop;
              const lineStr = stop.lines[0] ?? "";
              const rawColor = lineStr ? getLineColor(stop.type, lineStr) : "#6b7280";

              // Parse hex color to RGB
              const hexToRgb = (h: string) => {
                const c = h.replace("#", "");
                return [parseInt(c.slice(0,2),16), parseInt(c.slice(2,4),16), parseInt(c.slice(4,6),16)];
              };
              const [r,g,b] = hexToRgb(rawColor);

              // Badge circle/square
              const badgeSize = 6;
              const badgeX = cx + 3;
              const badgeY = cardsY + 3;
              pdf.setFillColor(r, g, b);
              pdf.setDrawColor(255, 255, 255);
              pdf.setLineWidth(0.4);
              if (stop.type === "tram") {
                pdf.roundedRect(badgeX, badgeY, badgeSize, badgeSize, 1, 1, "FD");
              } else {
                pdf.circle(badgeX + badgeSize / 2, badgeY + badgeSize / 2, badgeSize / 2, "FD");
              }

              // Line label inside badge
              if (lineStr) {
                pdf.setFontSize(4);
                pdf.setTextColor(255, 255, 255);
                pdf.text(lineStr.slice(0, 3), badgeX + badgeSize / 2, badgeY + badgeSize / 2 + 1.5, { align: "center" });
              }

              // Stop name
              pdf.setFontSize(6.5);
              pdf.setFont("helvetica", "bold");
              pdf.setTextColor(17, 24, 39);
              const nameY = cardsY + 5;
              const nameX = cx + 3;
              const maxNameW = cw - 6;
              pdf.text(stop.name, nameX, nameY + 7, { maxWidth: maxNameW });

              // Walking time
              pdf.setFontSize(6);
              pdf.setFont("helvetica", "normal");
              pdf.setTextColor(107, 114, 128);
              pdf.text(`${stop.walkingTime} min à pied`, nameX, nameY + 13, { maxWidth: maxNameW });

            } else {
              const airport = dest as Airport;

              // Airport badge
              pdf.setFillColor(239, 68, 68);
              pdf.setDrawColor(255, 255, 255);
              pdf.setLineWidth(0.4);
              pdf.roundedRect(cx + 3, cardsY + 3, 6, 6, 1, 1, "F");
              pdf.setFontSize(4);
              pdf.setTextColor(255, 255, 255);
              pdf.text("✈", cx + 6, cardsY + 7.5, { align: "center" });

              // Name
              pdf.setFontSize(6.5);
              pdf.setFont("helvetica", "bold");
              pdf.setTextColor(17, 24, 39);
              pdf.text(`${airport.city} · ${airport.iata}`, cx + 3, cardsY + 5 + 7, { maxWidth: cw - 6 });

              // Driving time
              pdf.setFontSize(6);
              pdf.setFont("helvetica", "normal");
              pdf.setTextColor(107, 114, 128);
              pdf.text(`${airport.drivingTime} min en voiture`, cx + 3, cardsY + 5 + 13, { maxWidth: cw - 6 });
            }
          });
        }

        // Reset font for footer
        pdf.setFont("helvetica", "normal");
      }

      // Footer on every page
      for (let i = 1; i <= pageCount; i++) {
        pdf.setPage(i);
        pdf.setDrawColor(232, 224, 213);
        pdf.setLineWidth(0.3);
        pdf.line(margin, pageH - 10, pageW - margin, pageH - 10);

        pdf.setFontSize(7);
        pdf.setTextColor(156, 163, 175);
        pdf.text("Commune Agent · data.gouv.fr", margin, pageH - 6);

        pdf.setTextColor(120, 113, 108);
        pdf.text(`${i} / ${pageCount}`, pageW / 2, pageH - 6, { align: "center" });

        if (logoDataUrl) {
          const logoHmm = 5;
          const logoWmm = logoHmm * logoRatio;
          pdf.addImage(
            logoDataUrl,
            "PNG",
            pageW - margin - logoWmm,
            pageH - logoHmm - 3,
            logoWmm,
            logoHmm
          );
        }
      }

      const safeCommune = communeName
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "")
        .toUpperCase();
      const dateStr = new Date().toISOString().slice(0, 10);
      const versionSuffix = versions.length > 1 ? `_V${versionIdx + 1}` : "";
      pdf.save(`Rapport_${safeCommune}${versionSuffix}_${dateStr}.pdf`);
    } finally {
      setPdfLoading(false);
    }
  };

  if (!isOpen) return null;

  const canGoPrev = versionIdx > 0;
  const canGoNext = versionIdx < versions.length - 1;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex flex-col" style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}>
      {/* Backdrop click */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Modal */}
      <div
        className="relative flex flex-col mx-auto my-6 rounded-2xl overflow-hidden shadow-2xl"
        style={{
          width: "min(860px, 95vw)",
          height: "calc(100vh - 48px)",
          background: "#f4f1ec",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Top bar ── */}
        <div
          className="shrink-0 flex items-center justify-between gap-4 px-5 py-3"
          style={{
            background: C21_DARK,
            borderBottom: `2px solid ${C21_GOLD}`,
          }}
        >
          {/* Left: title + version nav */}
          <div className="flex items-center gap-4">
            <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "#fff", letterSpacing: "-0.3px" }}>
              Aperçu du rapport
            </span>

            {versions.length > 1 && (
              <div className="flex items-center gap-1.5" style={{ background: "rgba(255,255,255,0.08)", borderRadius: 20, padding: "3px 10px" }}>
                <button
                  onClick={() => setVersionIdx((v) => Math.max(0, v - 1))}
                  disabled={!canGoPrev}
                  style={{
                    color: canGoPrev ? C21_GOLD : "#4a4540",
                    cursor: canGoPrev ? "pointer" : "default",
                    fontSize: "0.85rem",
                    lineHeight: 1,
                    padding: "0 2px",
                    transition: "color 0.15s",
                  }}
                  title="Version précédente"
                >
                  ←
                </button>
                <span style={{ fontSize: "0.72rem", color: "#a8a29e", minWidth: 40, textAlign: "center" }}>
                  V{versionIdx + 1} / {versions.length}
                </span>
                <button
                  onClick={() => setVersionIdx((v) => Math.min(versions.length - 1, v + 1))}
                  disabled={!canGoNext}
                  style={{
                    color: canGoNext ? C21_GOLD : "#4a4540",
                    cursor: canGoNext ? "pointer" : "default",
                    fontSize: "0.85rem",
                    lineHeight: 1,
                    padding: "0 2px",
                    transition: "color 0.15s",
                  }}
                  title="Version suivante"
                >
                  →
                </button>
              </div>
            )}
          </div>

          {/* Right: download + close */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadPDF}
              disabled={pdfLoading || isRefining}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: "0.78rem",
                fontWeight: 600,
                padding: "6px 14px",
                borderRadius: 8,
                background: pdfLoading ? "rgba(176,154,122,0.4)" : C21_GOLD,
                color: pdfLoading ? "#a8a29e" : "#1c1917",
                border: "none",
                cursor: pdfLoading ? "default" : "pointer",
                transition: "background 0.2s",
                opacity: isRefining ? 0.5 : 1,
              }}
              title="Télécharger le rapport en PDF"
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
              style={{
                width: 30,
                height: 30,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(255,255,255,0.08)",
                color: "#a8a29e",
                border: "none",
                cursor: "pointer",
                fontSize: "1rem",
                transition: "background 0.15s, color 0.15s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.16)";
                (e.currentTarget as HTMLElement).style.color = "#fff";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.08)";
                (e.currentTarget as HTMLElement).style.color = "#a8a29e";
              }}
              title="Fermer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* ── Preview scrollable area ── */}
        <div className="flex-1 overflow-y-auto" style={{ padding: "24px 20px 0" }}>
          {/* Paper simulation — position:relative to anchor the loader overlay */}
          <div
            style={{
              position: "relative",
              maxWidth: 700,
              margin: "0 auto",
              borderRadius: 4,
            }}
          >
            {/* Loader overlay — covers the paper while refining */}
            {isRefining && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 10,
                  borderRadius: 4,
                  background: "rgba(255,255,255,0.82)",
                  backdropFilter: "blur(3px)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 14,
                }}
              >
                {/* Animated dots */}
                <div style={{ display: "flex", gap: 6 }}>
                  {[0, 150, 300].map((delay) => (
                    <span
                      key={delay}
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: C21_GOLD,
                        display: "inline-block",
                        animation: "bounce 0.9s infinite",
                        animationDelay: `${delay}ms`,
                      }}
                    />
                  ))}
                </div>
                <span style={{ fontSize: "0.8rem", color: "#78716c", fontWeight: 500 }}>
                  Révision en cours…
                </span>
                <style>{`
                  @keyframes bounce {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-7px); }
                  }
                `}</style>
              </div>
            )}

            {/* Paper content */}
            <div
              ref={previewRef}
              style={{
                background: "#ffffff",
                padding: "32px 40px 48px",
                boxShadow: "0 4px 32px rgba(0,0,0,0.12)",
                borderRadius: 4,
              }}
            >
              <C21Header analysis={analysis} agentName={agentName} clientName={clientName} />

              {/* Markdown content — forced light mode */}
              <div className="prose prose-sm max-w-none" style={{ color: "#374151" }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {currentDisplayText}
                </ReactMarkdown>
              </div>

              {/* Viz blocks — parsed from current version's full text */}
              {currentVizBlocks.map((viz, i) => (
                <DataViz key={i} viz={viz} />
              ))}

              {/* Result cards */}
              {analysis && <ResultCards analysis={analysis} hideMeta />}
            </div>
          </div>

          {/* Bottom spacer */}
          <div style={{ height: 24 }} />
        </div>

        {/* ── Comment bar ── */}
        <div
          className="shrink-0"
          style={{
            background: "#fff",
            borderTop: "1px solid #e8e0d5",
            padding: "14px 20px",
          }}
        >
          <div className="flex items-end gap-3" style={{ maxWidth: 700, margin: "0 auto" }}>
            {/* Accessibility snapshot button */}
            <button
              onClick={() => setSnapshotModalOpen(true)}
              disabled={isRefining}
              title="Ajouter un snapshot accessibilité"
              style={{
                flexShrink: 0,
                width: 44,
                height: 44,
                borderRadius: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: snapshots.length > 0 ? C21_GOLD : C21_DARK,
                color: snapshots.length > 0 ? C21_DARK : C21_GOLD,
                border: `1.5px solid ${C21_GOLD}`,
                cursor: isRefining ? "default" : "pointer",
                opacity: isRefining ? 0.5 : 1,
                transition: "background 0.2s, color 0.2s",
                fontSize: "1.1rem",
                position: "relative",
              }}
            >
              📍
              {snapshots.length > 0 && (
                <span style={{
                  position: "absolute",
                  top: -6, right: -6,
                  width: 16, height: 16,
                  borderRadius: "50%",
                  background: "#22c55e",
                  color: "white",
                  fontSize: 9,
                  fontWeight: 800,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  border: "1.5px solid white",
                }}>
                  {snapshots.length}
                </span>
              )}
            </button>

            <div style={{ flex: 1, position: "relative" }}>
              <textarea
                ref={textareaRef}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Commentaire ou ajustement… (ex : Enlève les maisons sous 100m² du tableau)"
                rows={2}
                disabled={isRefining}
                style={{
                  width: "100%",
                  resize: "none",
                  borderRadius: 10,
                  border: "1.5px solid #e8e0d5",
                  padding: "10px 14px",
                  fontSize: "0.875rem",
                  color: "#374151",
                  background: isRefining ? "#f9f8f6" : "#fff",
                  outline: "none",
                  transition: "border-color 0.15s",
                  lineHeight: 1.5,
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = C21_GOLD)}
                onBlur={(e) => (e.currentTarget.style.borderColor = "#e8e0d5")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleRefine();
                  }
                }}
              />
            </div>

            <button
              onClick={handleRefine}
              disabled={!comment.trim() || isRefining}
              style={{
                flexShrink: 0,
                width: 44,
                height: 44,
                borderRadius: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: comment.trim() && !isRefining ? C21_DARK : "#e8e0d5",
                color: comment.trim() && !isRefining ? C21_GOLD : "#a8a29e",
                border: "none",
                cursor: comment.trim() && !isRefining ? "pointer" : "default",
                transition: "background 0.2s, color 0.2s",
              }}
              title="Envoyer le commentaire (Entrée)"
            >
              {isRefining ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
              )}
            </button>
          </div>

          {versions.length > 1 && (
            <p style={{ fontSize: "0.7rem", color: "#a8a29e", marginTop: 6, textAlign: "center" }}>
              {versions.length} version{versions.length > 1 ? "s" : ""} — utilisez ← → pour naviguer
            </p>
          )}
        </div>
      </div>
      {snapshotModalOpen && (
        <AccessibilitySnapshotModal
          isOpen={snapshotModalOpen}
          onClose={() => setSnapshotModalOpen(false)}
          defaultAddress={analysis?.commune?.nom ?? ""}
          onSnapshotReady={(snap) => {
            setSnapshots((prev) => [...prev, snap]);
            setSnapshotModalOpen(false);
          }}
        />
      )}
    </div>,
    document.body
  );
}
