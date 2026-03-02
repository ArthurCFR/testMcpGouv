"use client";

import { UIMessage } from "ai";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import AgentTrace from "@/app/components/AgentTrace";
import ResultCards from "@/app/components/ResultCards";
import DataViz from "@/app/components/DataViz";
import { CommuneAnalysis } from "@/app/types";
import { VizData } from "@/app/types/viz";

interface ChatMessageProps {
  message: UIMessage;
  isStreaming: boolean;
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

function parseVizBlocks(text: string): VizData[] {
  const blocks: VizData[] = [];
  const regex = /```json-viz\s*([\s\S]*?)\s*```/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    try {
      blocks.push(JSON.parse(match[1]) as VizData);
    } catch {
      // skip invalid blocks
    }
  }
  return blocks;
}

function stripJsonBlocks(text: string): string {
  return text
    .replace(/```json-viz[\s\S]*?```/gi, "")
    .replace(/```json[\s\S]*?```/gi, "")
    .replace(/===RÉPONSE===/g, "")
    .trim();
}

// ── Thinking collapse ─────────────────────────────────────────────────────────

function ThinkingSection({ texts }: { texts: string[] }) {
  const [open, setOpen] = useState(false);
  const steps = texts.length;

  return (
    <div className="rounded-xl overflow-hidden border border-zinc-100 dark:border-zinc-800/40">
      <button
        className="w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/20 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-[11px] text-zinc-400 dark:text-zinc-500">Réflexion</span>
        <span className="text-[11px] text-zinc-300 dark:text-zinc-700">
          · {steps} {steps === 1 ? "étape" : "étapes"}
        </span>
        <svg
          className={`w-3 h-3 ml-auto text-zinc-300 dark:text-zinc-700 transition-transform shrink-0 ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="border-t border-zinc-100 dark:border-zinc-800/40 px-4 py-3 space-y-3 text-sm text-zinc-400 dark:text-zinc-600 leading-relaxed">
          {texts.map((t, i) => (
            <p key={i} className="whitespace-pre-wrap">{t.trim()}</p>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ChatMessage({ message, isStreaming }: ChatMessageProps) {
  if (message.role === "user") {
    const text = (message.parts ?? [])
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("");

    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm px-4 py-3 bg-blue-600 text-white text-sm leading-relaxed whitespace-pre-wrap">
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
    const vizBlocks = parseVizBlocks(answerText);
    const analysis = parseAnalysisFromMessage(message);

    const hasTools = (message.parts ?? []).some(
      (p) =>
        (p as { type: string }).type === "dynamic-tool" ||
        (p as { type: string }).type.startsWith("tool-")
    );

    return (
      <div className="flex flex-col gap-3">
        {/* Thinking collapse — shown only after streaming, when there is intermediate reasoning */}
        {!isStreaming && thinkingTexts.length > 0 && (
          <ThinkingSection texts={thinkingTexts} />
        )}

        {/* Answer text */}
        {displayText && (
          <div className="prose prose-sm dark:prose-invert max-w-none text-zinc-800 dark:text-zinc-200 leading-relaxed">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayText}</ReactMarkdown>
          </div>
        )}

        {/* Viz blocks */}
        {vizBlocks.map((viz, i) => (
          <DataViz key={i} viz={viz} />
        ))}

        {/* Agent trace — only if tools were used */}
        {hasTools && (
          <AgentTrace messages={[message]} isRunning={isStreaming} />
        )}

        {/* Result cards — only when commune JSON detected */}
        {analysis && <ResultCards analysis={analysis} />}
      </div>
    );
  }

  return null;
}
