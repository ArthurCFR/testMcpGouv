"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useRef, useState } from "react";
import ChatInput from "@/app/components/ChatInput";
import ChatMessage from "@/app/components/ChatMessage";
import ThemeToggle from "@/app/components/ThemeToggle";
import DataQueryAnimation from "@/app/components/DataQueryAnimation";

export default function Home() {
  const { messages, sendMessage, status, setMessages, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/analyze" }),
  });

  const isLoading = status === "submitted" || status === "streaming";
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── Header overlay state machine ──────────────────────────────────────────
  type OverlayState = "idle" | "active" | "done" | "out";
  const [overlayState, setOverlayState] = useState<OverlayState>("idle");
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    if (isLoading) {
      hasLoadedRef.current = true;
      setOverlayState("active");
      return;
    }
    if (!hasLoadedRef.current) return;
    setOverlayState("done");
    const t1 = setTimeout(() => setOverlayState("out"),  1200);
    const t2 = setTimeout(() => setOverlayState("idle"), 1700);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [isLoading]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = (text: string) => {
    if (isLoading) return;
    sendMessage({ text });
  };

  const handleReset = () => {
    setMessages([]);
  };

  return (
    <main className="flex flex-col h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white transition-colors">
      {/* Header */}
      <header className="shrink-0 relative border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
        <div
          className="max-w-3xl mx-auto px-4 flex items-center justify-between"
          style={{
            paddingTop:    overlayState === "active" ? "28px" : "12px",
            paddingBottom: overlayState === "active" ? "28px" : "12px",
            transition: "padding-top 500ms ease, padding-bottom 500ms ease",
          }}
        >
          <div>
            <h1 className="text-base font-bold tracking-tight text-zinc-900 dark:text-white">
              Commune Agent
            </h1>
            <p className="text-zinc-400 dark:text-zinc-600 text-xs">
              Données ouvertes · France
            </p>
          </div>
          <div className="flex items-center gap-3">
            {messages.length > 0 && (
              <button
                onClick={handleReset}
                className="text-xs text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600"
              >
                Nouvelle conversation
              </button>
            )}
            <ThemeToggle />
          </div>
        </div>

        {/* ── Blue overlay during data fetching ── */}
        <div
          className={`absolute inset-0 z-10 bg-blue-600 flex items-center justify-center transition-opacity duration-500 ${
            overlayState === "active" || overlayState === "done"
              ? "opacity-100"
              : "opacity-0 pointer-events-none"
          }`}
        >
          {/* Animation while loading */}
          <div className={`transition-opacity duration-300 ${overlayState === "active" ? "opacity-100" : "opacity-0"}`}>
            <DataQueryAnimation light />
          </div>

          {/* "Analyse terminée" once done */}
          <div
            className={`absolute flex items-center gap-2.5 text-white transition-opacity duration-300 ${
              overlayState === "done" || overlayState === "out" ? "opacity-100" : "opacity-0"
            }`}
          >
            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-white/20">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <span className="text-sm font-medium tracking-wide">Analyse terminée</span>
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
          {/* Empty state */}
          {messages.length === 0 && !isLoading && (
            <div className="py-24 text-center text-zinc-300 dark:text-zinc-700 space-y-3">
              <div className="text-5xl">🗺️</div>
              <p className="text-sm font-medium text-zinc-400 dark:text-zinc-600">
                Posez une question sur les communes françaises
              </p>
              <p className="text-xs text-zinc-300 dark:text-zinc-700 max-w-sm mx-auto leading-relaxed">
                Population, immobilier, logements sociaux — toutes les données proviennent de data.gouv.fr
              </p>
            </div>
          )}

          {/* Chat messages */}
          {messages.map((message, i) => {
            const isLastMessage = i === messages.length - 1;
            const isStreaming = isLoading && isLastMessage && message.role === "assistant";
            return (
              <ChatMessage
                key={message.id}
                message={message}
                isStreaming={isStreaming}
              />
            );
          })}


          {/* Error */}
          {error && (
            <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-600 dark:text-red-300">
              {error.message}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <ChatInput onSend={handleSend} isLoading={isLoading} />
        </div>
      </div>
    </main>
  );
}
