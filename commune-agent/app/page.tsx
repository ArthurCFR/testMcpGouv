"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import ChatInput from "@/app/components/ChatInput";
import ChatMessage from "@/app/components/ChatMessage";
import ThemeToggle from "@/app/components/ThemeToggle";
import DataQueryAnimation from "@/app/components/DataQueryAnimation";
import HistorySidebar, { SavedConversation } from "@/app/components/HistorySidebar";
import MCPDataModal from "@/app/components/MCPDataModal";

const HISTORY_KEY = "commune-agent-history";

function loadHistory(): SavedConversation[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveHistory(history: SavedConversation[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

type Mode = "neutre" | "vendeur" | "acheteur";

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: "neutre",   label: "Neutre" },
  { value: "vendeur",  label: "🟢 Vendeur" },
  { value: "acheteur", label: "🔵 Acheteur" },
];

export default function Home() {
  const [mode, setMode] = useState<Mode>("neutre");
  const [mcpModalOpen, setMcpModalOpen] = useState(false);
  const modeRef = useRef<Mode>("neutre");
  modeRef.current = mode;

  // Restore current session from sessionStorage (survives tab navigation)
  const savedSession = useMemo(() => {
    try {
      const s = sessionStorage.getItem("commune-agent-current-session");
      return s ? JSON.parse(s) : null;
    } catch { return null; }
  }, []);

  // Transport créé une seule fois — lit modeRef.current à chaque requête
  // (évite le problème de useChat qui ne relit pas un transport recréé)
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/analyze",
        fetch: async (url, options) => {
          const body = JSON.parse((options?.body as string) ?? "{}");
          body.mode = modeRef.current;
          return fetch(url, { ...options, body: JSON.stringify(body) });
        },
      }),
    [] // créé une seule fois
  );

  const { messages, sendMessage, status, setMessages, error } = useChat({ transport });

  const isLoading = status === "submitted" || status === "streaming";
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const userJustSentRef = useRef(false);

  // ── History sidebar ────────────────────────────────────────────────────────
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [history, setHistory] = useState<SavedConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sessionIdRef = useRef<string>(savedSession?.sessionId ?? crypto.randomUUID());
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const historyRef = useRef(history);
  historyRef.current = history;
  const prevLoadingRef = useRef(false);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  // Restore current session messages on mount
  useEffect(() => {
    if (savedSession?.messages?.length) {
      setMessages(savedSession.messages);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist current session to sessionStorage on each message change
  useEffect(() => {
    if (messages.length > 0) {
      sessionStorage.setItem("commune-agent-current-session", JSON.stringify({
        messages,
        sessionId: sessionIdRef.current,
      }));
    } else {
      sessionStorage.removeItem("commune-agent-current-session");
    }
  }, [messages]);

  useEffect(() => {
    const wasLoading = prevLoadingRef.current;
    prevLoadingRef.current = isLoading;
    if (!wasLoading || isLoading) return;
    const msgs = messagesRef.current;
    if (msgs.length === 0) return;

    const firstUser = msgs.find((m) => m.role === "user");
    const title = firstUser
      ? (firstUser.parts ?? [])
          .filter((p): p is { type: "text"; text: string } => p.type === "text")
          .map((p) => p.text)
          .join("")
          .slice(0, 60) || "Conversation"
      : "Conversation";

    const conv: SavedConversation = {
      id: sessionIdRef.current,
      title,
      savedAt: Date.now(),
      messages: msgs as SavedConversation["messages"],
    };

    const hist = historyRef.current;
    const idx = hist.findIndex((c) => c.id === conv.id);
    const updated =
      idx >= 0
        ? hist.map((c, i) => (i === idx ? conv : c))
        : [conv, ...hist].slice(0, 30);

    setHistory(updated);
    saveHistory(updated);
    setActiveId(conv.id);
  }, [isLoading]);

  const handleLoad = (conv: SavedConversation) => {
    setMessages(conv.messages);
    setActiveId(conv.id);
    sessionIdRef.current = conv.id;
  };

  const handleDelete = (id: string) => {
    const updated = history.filter((c) => c.id !== id);
    setHistory(updated);
    saveHistory(updated);
    if (activeId === id) setActiveId(null);
  };

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
    el.scrollTop = el.scrollHeight;
  }, []);

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
    setActiveId(null);
    sessionIdRef.current = crypto.randomUUID();
    sessionStorage.removeItem("commune-agent-current-session");
  };

  return (
    <>
    <MCPDataModal isOpen={mcpModalOpen} onClose={() => setMcpModalOpen(false)} />
    <div
      className="flex h-screen"
      style={{
        backgroundColor: "var(--c21-bg)",
        backgroundImage: `
          radial-gradient(circle at 15% 50%, var(--c21-bg-gradient-a), transparent 25%),
          radial-gradient(circle at 85% 30%, var(--c21-bg-gradient-b), transparent 25%)
        `,
        color: "var(--c21-text)",
      }}
    >
      {/* ── Left history panel ── */}
      <HistorySidebar
        isOpen={sidebarOpen}
        conversations={history}
        activeId={activeId}
        onLoad={handleLoad}
        onDelete={handleDelete}
        onClose={() => setSidebarOpen(false)}
      />

      {/* ── Main chat area ── */}
      <main className="flex flex-col flex-1 min-w-0">

        {/* ── Header glassmorphism ── */}
        <header
          className="shrink-0 relative z-10"
          style={{
            background: "var(--c21-header-bg)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            borderBottom: "1px solid var(--c21-border)",
            animation: "slideDown 0.8s ease-out",
          }}
        >
          <div
            className="max-w-3xl mx-auto px-6 relative flex items-center justify-between"
            style={{
              paddingTop:    overlayState === "active" ? "28px" : "14px",
              paddingBottom: overlayState === "active" ? "28px" : "14px",
              transition: "padding-top 500ms ease, padding-bottom 500ms ease",
            }}
          >
            {/* Left: sidebar toggle + title + badge */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen((v) => !v)}
                title="Historique"
                className="c21-icon-btn"
                style={{ color: "var(--c21-text-muted)" }}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>

              <span style={{ fontWeight: 600, fontSize: "1.1rem", letterSpacing: "-0.5px", color: "var(--c21-text)" }}>
                Commune Agent
              </span>

              <button
                onClick={() => setMcpModalOpen(true)}
                title="Voir les données accessibles"
                style={{
                  fontSize: "0.72rem",
                  background: "var(--c21-panel-bg)",
                  padding: "0.35rem 0.75rem",
                  borderRadius: "20px",
                  color: "var(--c21-text-muted)",
                  border: "1px solid var(--c21-border)",
                  fontWeight: 400,
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  cursor: "pointer",
                  transition: "border-color 0.2s, color 0.2s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = "var(--c21-blue)";
                  (e.currentTarget as HTMLElement).style.color = "var(--c21-blue)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = "var(--c21-border)";
                  (e.currentTarget as HTMLElement).style.color = "var(--c21-text-muted)";
                }}
              >
                <svg width="7" height="7" viewBox="0 0 8 8" fill="none">
                  <circle cx="4" cy="4" r="4" fill="var(--c21-blue)" />
                </svg>
                MCP - Data.gouv
              </button>
            </div>

            {/* Right: CENTURY 21 + new conv + theme */}
            <div className="flex items-center gap-3">
              <Link
                href="/accessibilite"
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 500,
                  padding: "0.25rem 0.65rem",
                  borderRadius: 20,
                  color: "var(--c21-text-muted)",
                  border: "1px solid var(--c21-border)",
                  textDecoration: "none",
                  transition: "all 0.2s",
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = "var(--c21-gold)";
                  (e.currentTarget as HTMLElement).style.color = "var(--c21-gold)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = "var(--c21-border)";
                  (e.currentTarget as HTMLElement).style.color = "var(--c21-text-muted)";
                }}
              >
                Accessibilite
              </Link>

              <span style={{ fontWeight: 800, letterSpacing: "2px", fontSize: "0.9rem", color: "var(--c21-text)" }}>
                CENTURY{" "}
                <span style={{ color: "var(--c21-gold)" }}>21</span>
              </span>

              <div style={{ width: 1, height: 16, background: "var(--c21-border)" }} />

              {messages.length > 0 && (
                <button
                  onClick={handleReset}
                  title="Nouvelle conversation"
                  style={{ color: "var(--c21-text-muted)", cursor: "pointer", transition: "color 0.2s", lineHeight: 0 }}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              )}

              <ThemeToggle />
            </div>
          </div>

          {/* ── Overlay during data fetching ── */}
          <div
            className="absolute inset-0 z-10 flex items-center justify-center"
            style={{
              background: overlayState === "done" || overlayState === "out"
                ? "rgba(20, 83, 45, 0.92)"
                : "rgba(148, 116, 18, 0.92)",
              backdropFilter: "blur(8px)",
              opacity: overlayState === "active" || overlayState === "done" ? 1 : 0,
              pointerEvents: overlayState === "active" || overlayState === "done" ? "auto" : "none",
              transition: "opacity 0.5s, background 0.4s",
            }}
          >
            <div style={{ opacity: overlayState === "active" ? 1 : 0, transition: "opacity 0.3s" }}>
              <DataQueryAnimation light />
            </div>
            <div
              className="absolute flex items-center gap-2.5"
              style={{
                color: "#f8fafc",
                opacity: overlayState === "done" || overlayState === "out" ? 1 : 0,
                transition: "opacity 0.3s",
              }}
            >
              <div style={{
                width: 24, height: 24, borderRadius: "50%",
                background: "rgba(74, 222, 128, 0.28)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span style={{ fontSize: "0.875rem", fontWeight: 500, letterSpacing: "0.05em" }}>
                Analyse terminée
              </span>
            </div>
          </div>
        </header>

        {/* ── Messages ── */}
        <div className="flex-1 relative min-h-0">
          <div
            className="h-full overflow-y-auto"
            style={{ overflowAnchor: "none" }}
            ref={scrollContainerRef}
            onScroll={handleScroll}
          >
            <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">

              {/* Empty state */}
              {messages.length === 0 && !isLoading && (
                <div className="py-20 text-center space-y-6 flex flex-col items-center">
                  {/* Floating AI logo */}
                  <div style={{ position: "relative", width: 110, height: 110, animation: "float 6s ease-in-out infinite" }}>
                    <div style={{
                      position: "absolute",
                      top: "-10%", left: "-10%", right: "-10%", bottom: "-10%",
                      background: "radial-gradient(circle, var(--c21-gold-glow), transparent 70%)",
                      animation: "c21-pulse 3s infinite alternate",
                      zIndex: 1,
                      borderRadius: "50%",
                    }} />
                    <div style={{
                      position: "relative", zIndex: 2,
                      width: "100%", height: "100%",
                      background: "linear-gradient(135deg, var(--c21-gold), var(--c21-blue))",
                      borderRadius: "30%",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "3rem",
                      boxShadow: "0 0 30px var(--c21-gold-glow)",
                    }}>
                      🏙️
                    </div>
                  </div>

                  <h1 style={{
                    fontSize: "2.6rem",
                    fontWeight: 800,
                    background: "linear-gradient(to right, var(--c21-text), var(--c21-gold))",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    animation: "fadeInUp 1s ease-out",
                    letterSpacing: "-1px",
                    lineHeight: 1.3,
                  }}>
                    Expertise locale augmentée.
                  </h1>

                  <p style={{
                    color: "var(--c21-text-muted)",
                    fontSize: "1.05rem",
                    lineHeight: 1.6,
                    maxWidth: 560,
                    animation: "fadeInUp 1.2s ease-out",
                  }}>
                    Posez votre question sur les communes françaises.<br />
                    Population, dynamisme immobilier, logements sociaux —{" "}
                    explorez les données officielles via l&apos;IA.
                  </p>
                </div>
              )}

              {messages.map((message, i) => {
                const isLastMessage = i === messages.length - 1;
                const isStreaming = isLoading && isLastMessage && message.role === "assistant";
                return (
                  <ChatMessage
                    key={message.id}
                    message={message}
                    isStreaming={isStreaming}
                    onSuggest={isLastMessage && !isLoading ? handleSend : undefined}
                  />
                );
              })}

              {error && (
                <div style={{
                  borderRadius: "12px",
                  border: "1px solid rgba(239,68,68,0.3)",
                  background: "rgba(239,68,68,0.07)",
                  padding: "12px 16px",
                  fontSize: "0.875rem",
                  color: "#ef4444",
                }}>
                  {error.message}
                </div>
              )}
            </div>
          </div>

          {/* Gradient fade */}
          <div
            className="absolute bottom-0 left-0 right-0 h-20 pointer-events-none transition-opacity duration-300"
            style={{
              background: "linear-gradient(to bottom, transparent, var(--c21-scrollfade-to))",
              opacity: isAtBottom ? 0 : 1,
            }}
          />

          {/* Scroll-to-bottom button */}
          <button
            onClick={scrollToBottom}
            title="Défiler vers le bas"
            className="absolute bottom-4 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300"
            style={{
              background: "var(--c21-panel-bg)",
              border: "1px solid var(--c21-border)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              opacity: isAtBottom ? 0 : 1,
              pointerEvents: isAtBottom ? "none" : "auto",
              transform: isAtBottom ? "translateY(8px) translateX(-50%)" : "translateY(0) translateX(-50%)",
              color: "var(--c21-text-muted)",
            }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        {/* ── Input ── */}
        <div
          className="shrink-0"
          style={{
            borderTop: "1px solid var(--c21-border)",
            background: "var(--c21-header-bg)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
          }}
        >
          <div className="max-w-3xl mx-auto px-4 py-3 space-y-2">
            {/* Mode toggle */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: "0.7rem", color: "var(--c21-text-muted)", letterSpacing: "0.05em", userSelect: "none" }}>
                MODE
              </span>
              {MODE_OPTIONS.map(({ value, label }) => {
                const isActive = mode === value;
                const accentColor =
                  value === "vendeur" ? "var(--c21-gold)" :
                  value === "acheteur" ? "var(--c21-blue)" :
                  "var(--c21-text-muted)";
                return (
                  <button
                    key={value}
                    onClick={() => setMode(value)}
                    style={{
                      fontSize: "0.72rem",
                      padding: "0.22rem 0.6rem",
                      borderRadius: "20px",
                      border: `1px solid ${isActive ? accentColor : "var(--c21-border)"}`,
                      background: isActive
                        ? value === "vendeur" ? "rgba(212,175,55,0.12)"
                        : value === "acheteur" ? "rgba(56,189,248,0.12)"
                        : "var(--c21-panel-bg)"
                        : "transparent",
                      color: isActive ? accentColor : "var(--c21-text-muted)",
                      cursor: "pointer",
                      fontWeight: isActive ? 600 : 400,
                      transition: "all 0.2s",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <ChatInput onSend={handleSend} isLoading={isLoading} />
          </div>
        </div>
      </main>
    </div>
    </>
  );
}
