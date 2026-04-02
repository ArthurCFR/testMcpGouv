"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const C21_DARK = "#1c1917";
const C21_GOLD = "#b09a7a";

interface IntroModalProps {
  onConfirm: (agent: string, client: string) => void;
  onClose: () => void;
  initialAgent?: string;
  initialClient?: string;
}

export default function IntroModal({ onConfirm, onClose, initialAgent = "", initialClient = "" }: IntroModalProps) {
  const [agent, setAgent] = useState(initialAgent);
  const [client, setClient] = useState(initialClient);
  const agentRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    agentRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter") onConfirm(agent, client);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [agent, client, onConfirm, onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
    >
      <div className="absolute inset-0" onClick={onClose} />

      <div
        className="relative rounded-2xl overflow-hidden shadow-2xl"
        style={{ width: "min(440px, 92vw)", background: "#f4f1ec" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ background: C21_DARK, padding: "22px 28px 20px", borderBottom: `2px solid ${C21_GOLD}` }}>
          <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#fff", letterSpacing: "-0.3px" }}>
            Personnaliser le rapport
          </div>
          <div style={{ fontSize: "0.75rem", color: "#78716c", marginTop: 5 }}>
            Ces informations seront intégrées dans l&apos;en-tête du rapport
          </div>
        </div>

        {/* Form */}
        <div style={{ padding: "24px 28px" }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "#78716c", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 7 }}>
              Nom de l&apos;agent
            </label>
            <input
              ref={agentRef}
              type="text"
              value={agent}
              onChange={(e) => setAgent(e.target.value)}
              placeholder="ex : Jean Dupont"
              style={{
                width: "100%",
                borderRadius: 10,
                border: "1.5px solid #e8e0d5",
                padding: "10px 14px",
                fontSize: "0.9rem",
                color: "#1c1917",
                background: "#fff",
                outline: "none",
                transition: "border-color 0.15s",
                boxSizing: "border-box",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = C21_GOLD)}
              onBlur={(e) => (e.currentTarget.style.borderColor = "#e8e0d5")}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "#78716c", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 7 }}>
              Nom du client
            </label>
            <input
              type="text"
              value={client}
              onChange={(e) => setClient(e.target.value)}
              placeholder="ex : Marie Martin"
              style={{
                width: "100%",
                borderRadius: 10,
                border: "1.5px solid #e8e0d5",
                padding: "10px 14px",
                fontSize: "0.9rem",
                color: "#1c1917",
                background: "#fff",
                outline: "none",
                transition: "border-color 0.15s",
                boxSizing: "border-box",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = C21_GOLD)}
              onBlur={(e) => (e.currentTarget.style.borderColor = "#e8e0d5")}
            />
          </div>

          <div className="flex items-center gap-3 justify-between">
            <button
              onClick={onClose}
              style={{
                fontSize: "0.8rem",
                color: "#a8a29e",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "6px 0",
                textDecoration: "underline",
                textUnderlineOffset: 3,
              }}
            >
              Annuler
            </button>

            <button
              onClick={() => onConfirm(agent, client)}
              style={{
                fontSize: "0.85rem",
                fontWeight: 700,
                padding: "10px 24px",
                borderRadius: 10,
                background: C21_DARK,
                color: C21_GOLD,
                border: "none",
                cursor: "pointer",
                letterSpacing: "-0.2px",
                transition: "opacity 0.15s",
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.opacity = "0.85")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.opacity = "1")}
            >
              Ouvrir le rapport →
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
