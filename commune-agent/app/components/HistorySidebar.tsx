"use client";

import { UIMessage } from "ai";

export interface SavedConversation {
  id: string;
  title: string;
  savedAt: number;
  messages: UIMessage[];
}

interface Props {
  isOpen: boolean;
  conversations: SavedConversation[];
  activeId: string | null;
  onLoad: (conv: SavedConversation) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "À l'instant";
  if (mins < 60) return `Il y a ${mins} min`;
  if (hours < 24) return `Il y a ${hours} h`;
  if (days < 7) return `Il y a ${days} j`;
  return new Date(ts).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export default function HistorySidebar({ isOpen, conversations, activeId, onLoad, onDelete, onClose }: Props) {
  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-20 md:hidden"
          style={{ background: "rgba(0,0,0,0.35)" }}
          onClick={onClose}
        />
      )}

      {/* Wrapper — controls width for push effect on desktop */}
      <div
        className="shrink-0 overflow-hidden transition-all duration-300 ease-in-out"
        style={{ width: isOpen ? 256 : 0 }}
      >
        <aside
          className="w-64 h-full flex flex-col"
          style={{
            background: "var(--c21-sidebar-bg)",
            borderRight: "1px solid var(--c21-border)",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 shrink-0"
            style={{ borderBottom: "1px solid var(--c21-border)" }}
          >
            <span style={{
              fontSize: "0.68rem",
              fontWeight: 600,
              color: "var(--c21-text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}>
              Historique
            </span>
            <button
              onClick={onClose}
              className="flex items-center justify-center transition-opacity"
              style={{ width: 24, height: 24, color: "var(--c21-text-muted)" }}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto py-2">
            {conversations.length === 0 ? (
              <div className="px-4 py-10 text-center space-y-2">
                <div className="text-3xl">💬</div>
                <p style={{ fontSize: "0.75rem", color: "var(--c21-text-muted)" }}>Aucune conversation</p>
                <p style={{ fontSize: "0.72rem", color: "var(--c21-text-faint)", lineHeight: 1.5 }}>
                  Vos analyses apparaissent ici automatiquement
                </p>
              </div>
            ) : (
              <ul className="px-2 space-y-0.5">
                {conversations.map((conv) => {
                  const isActive = conv.id === activeId;
                  return (
                    <li key={conv.id} className="group relative">
                      <button
                        onClick={() => onLoad(conv)}
                        className="w-full text-left px-3 py-2.5 rounded-lg transition-all"
                        style={{
                          background: isActive ? "rgba(212,175,55,0.1)" : "transparent",
                          borderLeft: isActive ? "2px solid var(--c21-gold)" : "2px solid transparent",
                        }}
                      >
                        <p
                          className="text-sm truncate pr-6 font-medium"
                          style={{ color: isActive ? "var(--c21-gold)" : "var(--c21-text)" }}
                        >
                          {conv.title}
                        </p>
                        <p style={{ fontSize: "0.7rem", color: "var(--c21-text-faint)", marginTop: 2 }}>
                          {timeAgo(conv.savedAt)}
                        </p>
                      </button>

                      {/* Delete */}
                      <button
                        onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
                        title="Supprimer"
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-all"
                        style={{ color: "var(--c21-text-faint)" }}
                        onMouseEnter={e => (e.currentTarget.style.color = "#ef4444")}
                        onMouseLeave={e => (e.currentTarget.style.color = "var(--c21-text-faint)")}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
