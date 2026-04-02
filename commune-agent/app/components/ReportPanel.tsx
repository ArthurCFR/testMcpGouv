"use client";

import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import dynamic from "next/dynamic";
import { CommuneAnalysis } from "@/app/types";
import { VizData } from "@/app/types/viz";
import C21Header from "./C21Header";
import ResultCards from "./ResultCards";

const DataViz = dynamic(() => import("./DataViz"), { ssr: false });

const C21_DARK = "#1c1917";
const C21_GOLD = "#b09a7a";

export interface ReportVersion {
  narrative: string; // stripped display text (editable)
  fullText: string;  // original with json-viz blocks (for DataViz)
}

interface ReportPanelProps {
  versions: ReportVersion[];
  versionIdx: number;
  setVersionIdx: (i: number) => void;
  onEditNarrative: (idx: number, narrative: string) => void;
  analysis: CommuneAnalysis | null;
  userNotes: string;
  onNotesChange: (notes: string) => void;
  agentName?: string;
  clientName?: string;
  onPDFClick: () => void;
  isUpdating?: boolean;
}

function parseVizBlocks(text: string): VizData[] {
  const blocks: VizData[] = [];
  const regex = /```json-viz\s*([\s\S]*?)\s*```/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    try { blocks.push(JSON.parse(match[1]) as VizData); } catch { /* skip */ }
  }
  return blocks;
}

function parseFirstAddress(text: string): string | undefined {
  const match = /```json-accessibility\s*([\s\S]*?)\s*```/i.exec(text);
  if (!match) return undefined;
  try { return (JSON.parse(match[1]) as { address?: string }).address; } catch { return undefined; }
}

export default function ReportPanel({
  versions,
  versionIdx,
  setVersionIdx,
  onEditNarrative,
  analysis,
  userNotes,
  onNotesChange,
  agentName,
  clientName,
  onPDFClick,
  isUpdating = false,
}: ReportPanelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const current = versions[versionIdx];
  const vizBlocks = parseVizBlocks(current.fullText);
  const reportAddress = parseFirstAddress(current.fullText);

  const canGoPrev = versionIdx > 0;
  const canGoNext = versionIdx < versions.length - 1;

  const handleEditStart = () => {
    setEditText(current.narrative);
    setIsEditing(true);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const handleEditSave = () => {
    onEditNarrative(versionIdx, editText);
    setIsEditing(false);
  };

  const handleEditCancel = () => {
    setIsEditing(false);
  };

  return (
    <div className="flex flex-col" style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>

      {/* ── Top bar ── */}
      <div
        className="shrink-0 flex items-center justify-between px-4 py-2"
        style={{
          background: C21_DARK,
          borderBottom: `2px solid ${C21_GOLD}`,
        }}
      >
        {/* Left: commune name + version nav */}
        <div className="flex items-center gap-3 min-w-0">
          <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "#fff", letterSpacing: "-0.3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {analysis?.commune?.nom ?? "Rapport"}
          </span>

          {isUpdating && (
            <div className="flex items-center gap-1.5" style={{ background: "rgba(255,255,255,0.08)", borderRadius: 20, padding: "3px 10px" }}>
              <span style={{ fontSize: "0.7rem", color: "#a8a29e" }}>Mise à jour…</span>
              <div className="flex gap-1">
                {[0, 120, 240].map((d) => (
                  <span key={d} style={{ width: 4, height: 4, borderRadius: "50%", background: C21_GOLD, display: "inline-block", animation: "bounce 0.9s infinite", animationDelay: `${d}ms` }} />
                ))}
              </div>
            </div>
          )}

          {!isUpdating && versions.length > 1 && (
            <div className="flex items-center gap-1" style={{ background: "rgba(255,255,255,0.08)", borderRadius: 20, padding: "3px 10px" }}>
              <button
                onClick={() => setVersionIdx(Math.max(0, versionIdx - 1))}
                disabled={!canGoPrev}
                style={{ color: canGoPrev ? C21_GOLD : "#4a4540", cursor: canGoPrev ? "pointer" : "default", fontSize: "0.85rem", lineHeight: 1, padding: "0 2px", transition: "color 0.15s" }}
                title="Version précédente"
              >
                ←
              </button>
              <span style={{ fontSize: "0.72rem", color: "#a8a29e", minWidth: 40, textAlign: "center" }}>
                V{versionIdx + 1} / {versions.length}
              </span>
              <button
                onClick={() => setVersionIdx(Math.min(versions.length - 1, versionIdx + 1))}
                disabled={!canGoNext}
                style={{ color: canGoNext ? C21_GOLD : "#4a4540", cursor: canGoNext ? "pointer" : "default", fontSize: "0.85rem", lineHeight: 1, padding: "0 2px", transition: "color 0.15s" }}
                title="Version suivante"
              >
                →
              </button>
            </div>
          )}
        </div>

        {/* Right: PDF button */}
        <button
          onClick={onPDFClick}
          disabled={isUpdating}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: "0.78rem",
            fontWeight: 600,
            padding: "6px 14px",
            borderRadius: 8,
            background: isUpdating ? "rgba(176,154,122,0.3)" : C21_GOLD,
            color: isUpdating ? "#a8a29e" : C21_DARK,
            border: "none",
            cursor: isUpdating ? "default" : "pointer",
            transition: "opacity 0.2s",
            opacity: isUpdating ? 0.5 : 1,
          }}
          title="Télécharger le rapport en PDF"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          PDF
        </button>
      </div>

      {/* ── Scrollable paper area ── */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ background: "var(--c21-bg)", padding: "28px 20px" }}
      >
        <div
          style={{
            maxWidth: 700,
            margin: "0 auto",
            background: "var(--c21-sidebar-bg)",
            borderRadius: 4,
            padding: "32px 40px 48px",
            boxShadow: "0 4px 32px rgba(0,0,0,0.10)",
            position: "relative",
          }}
        >
          {/* Updating overlay */}
          {isUpdating && (
            <div style={{
              position: "absolute", inset: 0, zIndex: 10, borderRadius: 4,
              background: "var(--c21-header-bg)", backdropFilter: "blur(2px)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <div className="flex gap-2">
                {[0, 150, 300].map((d) => (
                  <span key={d} style={{ width: 8, height: 8, borderRadius: "50%", background: C21_GOLD, display: "inline-block", animation: "bounce 0.9s infinite", animationDelay: `${d}ms` }} />
                ))}
              </div>
            </div>
          )}

          <C21Header
            analysis={analysis}
            agentName={agentName}
            clientName={clientName}
            address={reportAddress}
          />

          {/* ── Narrative section ── */}
          <div style={{ position: "relative", marginBottom: 24 }}>
            {isEditing ? (
              <div>
                <textarea
                  ref={textareaRef}
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  style={{
                    width: "100%",
                    minHeight: 220,
                    resize: "vertical",
                    borderRadius: 8,
                    border: `1.5px solid ${C21_GOLD}`,
                    padding: "14px",
                    fontSize: "0.875rem",
                    color: "var(--c21-text)",
                    lineHeight: 1.7,
                    outline: "none",
                    fontFamily: "system-ui,-apple-system,sans-serif",
                    boxSizing: "border-box",
                    background: "var(--c21-input-bg)",
                  }}
                />
                <div className="flex gap-2 mt-2 justify-end">
                  <button
                    onClick={handleEditCancel}
                    style={{ fontSize: "0.78rem", color: "#a8a29e", background: "none", border: "none", cursor: "pointer", padding: "5px 10px" }}
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleEditSave}
                    style={{
                      fontSize: "0.78rem", fontWeight: 600, padding: "5px 14px", borderRadius: 6,
                      background: C21_DARK, color: C21_GOLD, border: "none", cursor: "pointer",
                    }}
                  >
                    Enregistrer
                  </button>
                </div>
              </div>
            ) : (
              <div className="group" style={{ position: "relative" }}>
                {/* Pencil button — visible on hover */}
                <button
                  onClick={handleEditStart}
                  title="Modifier le texte"
                  className="opacity-0 group-hover:opacity-100"
                  style={{
                    position: "absolute",
                    top: 0,
                    right: 0,
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: "0.7rem",
                    color: "#78716c",
                    background: "var(--c21-card-bg)",
                    border: "1px solid var(--c21-border)",
                    borderRadius: 6,
                    padding: "3px 8px",
                    cursor: "pointer",
                    transition: "opacity 0.15s, color 0.15s",
                    zIndex: 1,
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = C21_DARK; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "#78716c"; }}
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                  Modifier
                </button>

                <div className="prose prose-sm max-w-none c21-prose">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{current.narrative}</ReactMarkdown>
                </div>
              </div>
            )}
          </div>

          {/* ── Viz blocks ── */}
          {vizBlocks.map((viz, i) => (
            <DataViz key={i} viz={viz} />
          ))}

          {/* ── Result cards ── */}
          {analysis && <ResultCards analysis={analysis} hideMeta />}

          {/* ── Notes zone ── */}
          <div style={{ marginTop: 32, borderTop: "1px solid var(--c21-border)", paddingTop: 20 }}>
            <div style={{ fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--c21-text-muted)", marginBottom: 10 }}>
              Notes
            </div>
            <textarea
              value={userNotes}
              onChange={(e) => onNotesChange(e.target.value)}
              placeholder="Ajoutez vos observations, points à discuter avec le client…"
              rows={3}
              style={{
                width: "100%",
                resize: "vertical",
                borderRadius: 8,
                border: "1.5px solid var(--c21-border)",
                padding: "10px 14px",
                fontSize: "0.875rem",
                color: "var(--c21-text)",
                lineHeight: 1.6,
                outline: "none",
                transition: "border-color 0.15s",
                fontFamily: "system-ui,-apple-system,sans-serif",
                boxSizing: "border-box",
                background: "var(--c21-input-bg)",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = C21_GOLD)}
              onBlur={(e) => (e.currentTarget.style.borderColor = "var(--c21-border)")}
            />
          </div>
        </div>

        <div style={{ height: 24 }} />
      </div>

      <style>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }
      `}</style>
    </div>
  );
}
