"use client";

import { UIMessage } from "ai";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import dynamic from "next/dynamic";
import AgentTrace from "@/app/components/AgentTrace";
import ResultCards from "@/app/components/ResultCards";
import DataViz from "@/app/components/DataViz";
import { CommuneAnalysis } from "@/app/types";
import { VizData } from "@/app/types/viz";

const PDFButton = dynamic(() => import("@/app/components/PDFButton"), { ssr: false });
const AccessibilityInline = dynamic(() => import("@/app/components/AccessibilityInline"), { ssr: false });


interface SuggestOption {
  label: string;
  value: string;
}
interface SuggestData {
  type: "suggest";
  question?: string;
  options: SuggestOption[];
}

interface ChatMessageProps {
  message: UIMessage;
  isStreaming: boolean;
  onSuggest?: (text: string) => void;
  isReportMode?: boolean;
}

const ANSWER_MARKER = "===RÉPONSE===";

// ── Parsers ───────────────────────────────────────────────────────────────────

function parseAnalysisFromMessage(message: UIMessage): CommuneAnalysis | null {
  const textParts = (message.parts ?? []).filter(
    (p): p is { type: "text"; text: string } => p.type === "text"
  );
  const lastText = textParts.at(-1)?.text ?? "";
  // Use the answer portion only if the marker is present
  const markerIdx = lastText.indexOf(ANSWER_MARKER);
  const searchText = markerIdx !== -1 ? lastText.slice(markerIdx + ANSWER_MARKER.length) : lastText;
  const match = searchText.match(/```json(?!-viz)\s*([\s\S]*?)\s*```/i);
  if (!match) return null;
  try {
    return JSON.parse(match[1]) as CommuneAnalysis;
  } catch {
    return null;
  }
}

interface AccessibilitySnap {
  address: string;
  lat: number;
  lng: number;
}

type ChatSegment =
  | { type: "text"; content: string }
  | { type: "viz"; data: VizData }
  | { type: "accessibility"; snap: AccessibilitySnap };

function parseChatSegments(text: string): ChatSegment[] {
  const segments: ChatSegment[] = [];
  const regex = /```(json-viz|json-accessibility)\s*([\s\S]*?)\s*```/gi;
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const raw = text.slice(lastIdx, match.index)
      .replace(/```json-suggest[\s\S]*?```/gi, "")
      .replace(/```json[\s\S]*?```/gi, "")
      .replace(/===RÉPONSE===/g, "")
      .trim();
    if (raw) segments.push({ type: "text", content: raw });

    const blockType = match[1].toLowerCase();
    const blockContent = match[2];
    if (blockType === "json-viz") {
      try { segments.push({ type: "viz", data: JSON.parse(blockContent) as VizData }); } catch { /* skip */ }
    } else if (blockType === "json-accessibility") {
      try { segments.push({ type: "accessibility", snap: JSON.parse(blockContent) as AccessibilitySnap }); } catch { /* skip */ }
    }
    lastIdx = match.index + match[0].length;
  }

  const remaining = text.slice(lastIdx)
    .replace(/```json-suggest[\s\S]*?```/gi, "")
    .replace(/```json[\s\S]*?```/gi, "")
    .replace(/===RÉPONSE===/g, "")
    .trim();
  if (remaining) segments.push({ type: "text", content: remaining });

  return segments;
}

function parseSuggestBlock(text: string): SuggestData | null {
  const match = /```json-suggest\s*([\s\S]*?)\s*```/i.exec(text);
  if (!match) return null;
  try { return JSON.parse(match[1]) as SuggestData; } catch { return null; }
}

function stripJsonBlocks(text: string): string {
  return text
    .replace(/```json-suggest[\s\S]*?```/gi, "")
    .replace(/```json-viz[\s\S]*?```/gi, "")
    .replace(/```json-accessibility[\s\S]*?```/gi, "")
    .replace(/```json[\s\S]*?```/gi, "")
    .replace(/===RÉPONSE===/g, "")
    .trim();
}

function SuggestButtons({ data, onSuggest }: { data: SuggestData; onSuggest: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-2 mt-1">
      {data.question && (
        <p className="text-sm font-medium" style={{ color: "var(--c21-text-muted)" }}>
          {data.question}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {data.options.map((opt, i) => (
          <button
            key={i}
            onClick={() => onSuggest(opt.value)}
            className="text-sm px-3 py-1.5 rounded-full transition-all"
            style={{
              border: "1px solid var(--c21-border)",
              background: "var(--c21-panel-bg)",
              color: "var(--c21-text)",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--c21-gold)";
              e.currentTarget.style.color = "var(--c21-gold)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--c21-border)";
              e.currentTarget.style.color = "var(--c21-text)";
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Thinking collapse ─────────────────────────────────────────────────────────

function ThinkingSection({ texts }: { texts: string[] }) {
  const [open, setOpen] = useState(false);
  const steps = texts.length;

  return (
    <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid var(--c21-border)" }}>
      <button
        className="w-full flex items-center gap-2 px-4 py-2 text-left transition-colors"
        style={{ background: "var(--c21-panel-bg)" }}
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={e => (e.currentTarget.style.opacity = "0.8")}
        onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
      >
        <span style={{ fontSize: 11, color: "var(--c21-text-muted)" }}>Réflexion</span>
        <span style={{ fontSize: 11, color: "var(--c21-text-faint)" }}>
          · {steps} {steps === 1 ? "étape" : "étapes"}
        </span>
        <svg
          className={`w-3 h-3 ml-auto transition-transform shrink-0 ${open ? "rotate-180" : ""}`}
          style={{ color: "var(--c21-text-faint)" }}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div
          className="space-y-3 text-sm leading-relaxed"
          style={{
            borderTop: "1px solid var(--c21-border)",
            padding: "12px 16px",
            color: "var(--c21-text-muted)",
          }}
        >
          {texts.map((t, i) => (
            <p key={i} className="whitespace-pre-wrap">{t.trim()}</p>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Throttled markdown renderer ───────────────────────────────────────────────
// Renders at most ~10fps during streaming to avoid O(n) ReactMarkdown re-parses.

function ThrottledMarkdown({ text, isStreaming }: { text: string; isStreaming: boolean }) {
  const latestRef = useRef(text);
  latestRef.current = text;

  const [displayed, setDisplayed] = useState(text);

  // Interval-based flush during streaming
  useEffect(() => {
    if (!isStreaming) {
      setDisplayed(latestRef.current);
      return;
    }
    const id = setInterval(() => {
      setDisplayed(latestRef.current);
    }, 100);
    return () => clearInterval(id);
  }, [isStreaming]);

  // Sync when text changes while not streaming (conversation navigation)
  useEffect(() => {
    if (!isStreaming) setDisplayed(text);
  }, [text, isStreaming]);

  return (
    <div className="prose prose-sm max-w-none leading-relaxed c21-prose">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayed}</ReactMarkdown>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ChatMessage({ message, isStreaming, onSuggest, isReportMode = false }: ChatMessageProps) {
  if (message.role === "user") {
    const text = (message.parts ?? [])
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("");

    return (
      <div className="flex justify-end">
        <div
          className="max-w-[80%] text-sm leading-relaxed whitespace-pre-wrap"
          style={{
            background: "var(--c21-gold)",
            color: "#0f1115",
            fontWeight: 500,
            borderRadius: "18px 18px 4px 18px",
            padding: "10px 16px",
          }}
        >
          {text}
        </div>
      </div>
    );
  }

  if (message.role === "assistant") {
    const allTextParts = (message.parts ?? []).filter(
      (p): p is { type: "text"; text: string } => p.type === "text"
    );

    // ── Split thinking vs answer ──────────────────────────────────────────────
    // During streaming: show everything as answer (we don't know the split yet).
    // After streaming: use ANSWER_MARKER to split the last text part, then
    //   prepend any earlier text parts as thinking steps.

    let answerText = "";
    const thinkingTexts: string[] = [];

    if (isStreaming) {
      // Show all text live during streaming (no collapse yet)
      answerText = allTextParts.map((p) => p.text).join("");
    } else {
      const lastPart = allTextParts.at(-1);
      const prevParts = allTextParts.slice(0, -1);

      // Earlier steps → thinking
      for (const p of prevParts) {
        const clean = stripJsonBlocks(p.text);
        if (clean.trim()) thinkingTexts.push(clean);
      }

      // Last step → split on ANSWER_MARKER
      if (lastPart) {
        const markerIdx = lastPart.text.indexOf(ANSWER_MARKER);
        if (markerIdx !== -1) {
          const preAnswer = stripJsonBlocks(lastPart.text.slice(0, markerIdx));
          if (preAnswer.trim()) thinkingTexts.push(preAnswer);
          answerText = lastPart.text.slice(markerIdx + ANSWER_MARKER.length);
        } else {
          answerText = lastPart.text;
        }
      }
    }

    const displayText = stripJsonBlocks(answerText);
    const chatSegments = !isStreaming ? parseChatSegments(answerText) : [];
    const suggestData = !isStreaming ? parseSuggestBlock(answerText) : null;
    const analysis = parseAnalysisFromMessage(message);

    const hasTools = (message.parts ?? []).some(
      (p) =>
        (p as { type: string }).type === "dynamic-tool" ||
        (p as { type: string }).type.startsWith("tool-")
    );

    return (
      <div className="flex flex-col gap-3">
        {/* ── Content ── */}
        <div className="flex flex-col gap-3">
          {/* Thinking collapse — shown only after streaming, when there is intermediate reasoning */}
          {!isStreaming && thinkingTexts.length > 0 && (
            <div data-pdf-skip="">
              <ThinkingSection texts={thinkingTexts} />
            </div>
          )}

          {/* Typing indicator — shown during tool calls before any text arrives */}
          {isStreaming && !displayText && (
            <div className="flex gap-[5px] items-center py-1" style={{ paddingLeft: 2 }}>
              {[0, 160, 320].map((delay) => (
                <span
                  key={delay}
                  className="w-1.5 h-1.5 rounded-full animate-bounce"
                  style={{
                    background: "var(--c21-text-faint)",
                    animationDelay: `${delay}ms`,
                    animationDuration: "1s",
                  }}
                />
              ))}
            </div>
          )}

          {/* During streaming: single throttled block. After: interleaved segments. */}
          {isStreaming ? (
            displayText && <ThrottledMarkdown text={displayText} isStreaming={isStreaming} />
          ) : (
            chatSegments.map((seg, i) => {
              if (seg.type === "text") return <ThrottledMarkdown key={i} text={seg.content} isStreaming={false} />;
              if (seg.type === "viz") return <DataViz key={i} viz={seg.data} />;
              if (seg.type === "accessibility") return <AccessibilityInline key={i} address={seg.snap.address} lat={seg.snap.lat} lng={seg.snap.lng} />;
              return null;
            })
          )}

          {/* Suggest buttons — disambiguation */}
          {suggestData && onSuggest && (
            <SuggestButtons data={suggestData} onSuggest={onSuggest} />
          )}

          {/* Agent trace — only if tools were used */}
          {hasTools && (
            <div data-pdf-skip="">
              <AgentTrace messages={[message]} isRunning={isStreaming} />
            </div>
          )}

          {/* Result cards — hidden in report mode (shown in ReportPanel instead) */}
          {analysis && !isReportMode && <ResultCards analysis={analysis} />}
        </div>

        {/* Rapport button — hidden in report mode */}
        {!isStreaming && !isReportMode && (
          <div className="flex justify-end pt-1" style={{ opacity: 0.7 }}>
            <PDFButton analysis={analysis} fullText={answerText} />
          </div>
        )}
      </div>
    );
  }

  return null;
}
