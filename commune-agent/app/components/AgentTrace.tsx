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
  logement: { icon: "🏗️", short: "SRU" },
  population: { icon: "👥", short: "Pop." },
  insee: { icon: "📊", short: "INSEE" },
  resource: { icon: "🗄️", short: "Data" },
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

  useEffect(() => {
    if (expanded) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, expanded]);

  const assistantParts = messages
    .filter((m) => m.role === "assistant")
    .flatMap((m) => (m.parts ?? []) as AnyPart[]);

  const toolParts = assistantParts.filter(
    (p) => p.type === "dynamic-tool" || p.type.startsWith("tool-")
  );

  if (assistantParts.length === 0 && !isRunning) return null;

  return (
    <div className="rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800/60 bg-zinc-50 dark:bg-zinc-900/40">
      {/* ── Compact strip ── */}
      <button
        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-100 dark:hover:bg-white/[0.02] transition-colors text-left"
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
          <span className="text-[11px] text-zinc-400 dark:text-zinc-500 font-medium whitespace-nowrap">
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
                className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-mono whitespace-nowrap border transition-all ${
                  isPending
                    ? "bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800/50"
                    : isError
                    ? "bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800/50"
                    : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-500 border-emerald-200 dark:border-emerald-900/50"
                }`}
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
        <div className="shrink-0 flex items-center gap-2 ml-auto text-zinc-400 dark:text-zinc-600">
          <span className="text-[10px]">{toolParts.length} appels</span>
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
        <div className="border-t border-zinc-200 dark:border-zinc-800/40 px-4 py-3 max-h-56 overflow-y-auto font-mono text-[11px] space-y-2 bg-white dark:bg-transparent">
          {assistantParts.map((part, i) => {
            if (part.type === "dynamic-tool" || part.type.startsWith("tool-")) {
              const toolName = String(part.toolName ?? "");
              const state = String(part.state ?? "");
              const input = part.input as Record<string, unknown> | undefined;
              const output = part.output;
              const { icon } = getToolMeta(toolName);

              return (
                <div key={String(part.toolCallId ?? i)} className="space-y-0.5">
                  <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
                    <span>{icon}</span>
                    <span className="text-blue-500 dark:text-blue-400/90">{toolName}</span>
                    {input && (
                      <span className="text-zinc-400 dark:text-zinc-600 truncate max-w-xs">
                        {JSON.stringify(input).slice(0, 70)}…
                      </span>
                    )}
                    {state === "output-available" && (
                      <span className="ml-auto text-emerald-600 dark:text-emerald-500 shrink-0">✓</span>
                    )}
                    {state === "output-error" && (
                      <span className="ml-auto text-red-500 dark:text-red-400 shrink-0">✗</span>
                    )}
                  </div>
                  {output !== undefined && (
                    <div className="text-zinc-400 dark:text-zinc-600 pl-5 truncate">
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
                <div key={i} className="flex gap-2 text-zinc-400 dark:text-zinc-600 line-clamp-2">
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
