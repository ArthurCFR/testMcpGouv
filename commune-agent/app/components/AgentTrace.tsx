"use client";

import { UIMessage } from "ai";
import { useEffect, useRef, useState } from "react";

interface AgentTraceProps {
  messages: UIMessage[];
  isRunning: boolean;
}

type AnyPart = { type: string; [key: string]: unknown };

const TOOL_META: Record<string, { icon: string; short: string }> = {
  dvf: { icon: "🏠", short: "DVF" },
  dpe: { icon: "⚡", short: "DPE" },
  delinquance: { icon: "🚨", short: "Délinquance" },
  logement: { icon: "🏗️", short: "SRU" },
  population: { icon: "👥", short: "Pop." },
  insee: { icon: "📊", short: "INSEE" },
  resource: { icon: "🗄️", short: "Data" },
  cache: { icon: "🗃️", short: "Cache" },
};

function getToolMeta(toolName: string): { icon: string; short: string } {
  const lower = toolName.toLowerCase();
  for (const [key, meta] of Object.entries(TOOL_META)) {
    if (lower.includes(key)) return meta;
  }
  const parts = toolName.split("_");
  return { icon: "⚙️", short: parts[parts.length - 1] ?? toolName };
}

export default function AgentTrace({ messages, isRunning }: AgentTraceProps) {
  const [expanded, setExpanded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const innerContainerRef = useRef<HTMLDivElement>(null);

  // Bring the trace into view only when the user explicitly expands it
  useEffect(() => {
    if (expanded) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [expanded]);

  // Scroll the inner log to bottom when new tool calls arrive (while expanded)
  useEffect(() => {
    if (!expanded) return;
    const el = innerContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, expanded]);

  const assistantParts = messages
    .filter((m) => m.role === "assistant")
    .flatMap((m) => (m.parts ?? []) as AnyPart[]);

  const toolParts = assistantParts.filter(
    (p) => p.type === "dynamic-tool" || p.type.startsWith("tool-")
  );

  if (assistantParts.length === 0 && !isRunning) return null;

  return (
    <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid var(--c21-border)", background: "var(--c21-panel-bg)" }}>
      <style>{`
        @keyframes at-done-pulse {
          0%,100% { background: rgba(16,185,129,0); }
          50%      { background: rgba(16,185,129,0.10); }
        }
      `}</style>
      {/* ── Compact strip ── */}
      <button
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left"
        style={{
          animation: isRunning ? undefined : "at-done-pulse 2.8s ease-in-out infinite",
          transition: "background 0.6s ease",
        }}
        onMouseEnter={e => (e.currentTarget.style.animationPlayState = "paused")}
        onMouseLeave={e => (e.currentTarget.style.animationPlayState = "running")}
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Status indicator */}
        <div className="shrink-0 flex items-center gap-2">
          {isRunning ? (
            <span className="flex gap-[3px] items-center">
              {[0, 150, 300].map((delay) => (
                <span
                  key={delay}
                  className="w-1 h-1 rounded-full bg-amber-400 animate-bounce"
                  style={{ animationDelay: `${delay}ms` }}
                />
              ))}
            </span>
          ) : (
            <span className="w-2 h-2 rounded-full bg-emerald-500/80" />
          )}
          <span style={{ fontSize: 11, color: "var(--c21-text-muted)", fontWeight: 500, whiteSpace: "nowrap" }}>
            {isRunning ? "En cours" : "Terminé"}
          </span>
        </div>

        {/* Tool chips */}
        <div className="flex gap-1.5 flex-1 overflow-x-auto scrollbar-none">
          {toolParts.map((p, i) => {
            const toolName = String(p.toolName ?? "");
            const state = String(p.state ?? "");
            const isPending = state === "input-streaming" || state === "input-available";
            const isError = state === "output-error";
            const { icon, short } = getToolMeta(toolName);

            return (
              <span
                key={String(p.toolCallId ?? i)}
                className="inline-flex items-center gap-1 font-mono whitespace-nowrap transition-all"
                style={{
                  fontSize: 10,
                  padding: "2px 8px",
                  borderRadius: "100px",
                  border: isPending
                    ? "1px solid rgba(251,191,36,0.35)"
                    : isError
                    ? "1px solid rgba(239,68,68,0.35)"
                    : "1px solid rgba(16,185,129,0.35)",
                  background: isPending
                    ? "rgba(251,191,36,0.1)"
                    : isError
                    ? "rgba(239,68,68,0.1)"
                    : "rgba(16,185,129,0.08)",
                  color: isPending
                    ? "#fbbf24"
                    : isError
                    ? "#f87171"
                    : "#10b981",
                }}
              >
                <span>{icon}</span>
                <span>{short}</span>
                {isPending && (
                  <span className="w-1 h-1 rounded-full bg-amber-400 animate-pulse" />
                )}
                {!isPending && !isError && <span className="opacity-60">✓</span>}
                {isError && <span>✗</span>}
              </span>
            );
          })}
        </div>

        {/* Count + toggle */}
        <div className="shrink-0 flex items-center gap-2 ml-auto" style={{ color: "var(--c21-text-faint)" }}>
          <span style={{ fontSize: 10 }}>{toolParts.length} appels</span>
          <svg
            className={`w-3 h-3 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* ── Expanded log ── */}
      {expanded && (
        <div
          ref={innerContainerRef}
          className="font-mono space-y-2 overflow-y-auto"
          style={{
            borderTop: "1px solid var(--c21-border)",
            padding: "12px 16px",
            maxHeight: 224,
            fontSize: 11,
            background: "var(--c21-card-bg)",
          }}
        >
          {assistantParts.map((part, i) => {
            if (part.type === "dynamic-tool" || part.type.startsWith("tool-")) {
              const toolName = String(part.toolName ?? "");
              const state = String(part.state ?? "");
              const input = part.input as Record<string, unknown> | undefined;
              const output = part.output;
              const { icon } = getToolMeta(toolName);

              return (
                <div key={String(part.toolCallId ?? i)} className="space-y-0.5">
                  <div className="flex items-center gap-2" style={{ color: "var(--c21-text-muted)" }}>
                    <span>{icon}</span>
                    <span style={{ color: "#3b82f6" }}>{toolName}</span>
                    {input && (
                      <span className="truncate max-w-xs" style={{ color: "var(--c21-text-faint)" }}>
                        {JSON.stringify(input).slice(0, 70)}…
                      </span>
                    )}
                    {state === "output-available" && (
                      <span className="ml-auto shrink-0" style={{ color: "#10b981" }}>✓</span>
                    )}
                    {state === "output-error" && (
                      <span className="ml-auto shrink-0" style={{ color: "#f87171" }}>✗</span>
                    )}
                  </div>
                  {output !== undefined && (
                    <div className="pl-5 truncate" style={{ color: "var(--c21-text-faint)" }}>
                      {typeof output === "string"
                        ? output.slice(0, 120)
                        : JSON.stringify(output).slice(0, 120)}
                      …
                    </div>
                  )}
                </div>
              );
            }

            if (part.type === "text") {
              const text = String(part.text ?? "")
                .replace(/```json[\s\S]*?```/g, "")
                .trim();
              if (!text) return null;
              return (
                <div key={i} className="flex gap-2 line-clamp-2" style={{ color: "var(--c21-text-faint)" }}>
                  <span>📝</span>
                  <span>{text.slice(0, 200)}</span>
                </div>
              );
            }

            return null;
          })}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}
