"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useCallback, useEffect, useRef, useState } from "react";
import ChatInput from "@/app/components/ChatInput";
import ChatMessage from "@/app/components/ChatMessage";
import ThemeToggle from "@/app/components/ThemeToggle";
import DataQueryAnimation from "@/app/components/DataQueryAnimation";

export default function Home() {
  const { messages, sendMessage, status, setMessages, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/analyze" }),
  });

  const isLoading = status === "submitted" || status === "streaming";
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const userJustSentRef = useRef(false);

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

  // ── Scroll tracking ──────────────────────────────────────────────────────
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    setIsAtBottom(atBottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight; // instant (pas smooth) pour éviter les conflits
  }, []);

  // Auto-scroll : quand l'user envoie OU pendant le stream si déjà en bas
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || messages.length === 0) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    if (userJustSentRef.current || atBottom) {
      userJustSentRef.current = false;
      el.scrollTop = el.scrollHeight;
      setIsAtBottom(true);
    }
  }, [messages]);

  const handleSend = (text: string) => {
    if (isLoading) return;
    userJustSentRef.current = true;
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
          className="max-w-3xl mx-auto px-4 relative flex items-center justify-between"
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
          <div className="absolute left-1/2 -translate-x-1/2">
            <DataQueryAnimation frozen />
          </div>
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <button
                onClick={handleReset}
                title="Nouvelle conversation"
                className="w-7 h-7 flex items-center justify-center text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors rounded-lg border border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
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
      <div className="flex-1 relative min-h-0">
        {/* Scrollable content */}
        <div
          className="h-full overflow-y-auto"
          style={{ overflowAnchor: "none" }}
          ref={scrollContainerRef}
          onScroll={handleScroll}
        >
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
          </div>
        </div>

        {/* Gradient fade-to-background when content below */}
        <div
          className={`absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-b from-transparent to-zinc-50 dark:to-zinc-950 pointer-events-none transition-opacity duration-300 ${
            isAtBottom ? "opacity-0" : "opacity-100"
          }`}
        />

        {/* Scroll-to-bottom button */}
        <button
          onClick={scrollToBottom}
          title="Défiler vers le bas"
          className={`absolute bottom-4 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 shadow-md flex items-center justify-center transition-all duration-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 ${
            isAtBottom ? "opacity-0 pointer-events-none translate-y-2" : "opacity-100 translate-y-0"
          }`}
        >
          <svg className="w-4 h-4 text-zinc-500 dark:text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
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
