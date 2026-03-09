"use client";

import { useRef, useState } from "react";

interface ChatInputProps {
  onSend: (text: string) => void;
  isLoading: boolean;
}

export default function ChatInput({ onSend, isLoading }: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || isLoading) return;
    onSend(trimmed);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
  };

  const active = Boolean(value.trim()) && !isLoading;
  const lit = focused || Boolean(value);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        background: "var(--c21-input-bg)",
        border: lit
          ? "1px solid var(--c21-gold)"
          : "1px solid rgba(212, 175, 55, 0.2)",
        borderRadius: "18px",
        padding: "0.45rem 0.45rem 0.45rem 1.25rem",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        boxShadow: lit
          ? "0 0 18px var(--c21-gold-glow), 0 8px 24px rgba(0,0,0,0.12)"
          : "0 6px 20px rgba(0,0,0,0.08)",
        transition: "box-shadow 0.3s ease, border-color 0.3s ease",
      }}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="Ex : Prix moyen au m² et logements sociaux à Bordeaux ?"
        rows={1}
        disabled={isLoading}
        style={{
          flex: 1,
          background: "transparent",
          border: "none",
          outline: "none",
          color: "var(--c21-text)",
          fontSize: "1rem",
          resize: "none",
          overflowY: "auto",
          lineHeight: 1.6,
          minHeight: "38px",
          maxHeight: "140px",
          fontFamily: "inherit",
          paddingTop: "0.35rem",
          paddingBottom: "0.35rem",
        }}
        className="placeholder:text-[color:var(--c21-text-muted)]"
      />

      <button
        onClick={handleSend}
        disabled={!active}
        style={{
          flexShrink: 0,
          alignSelf: "flex-end",
          marginBottom: "0.1rem",
          width: 38,
          height: 38,
          borderRadius: "12px",
          border: "none",
          background: active ? "var(--c21-gold)" : "rgba(212,175,55,0.18)",
          color: active ? "#000" : "var(--c21-text-muted)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: active ? "pointer" : "default",
          transition: "all 0.3s ease",
          boxShadow: active ? "0 0 12px var(--c21-gold-glow)" : "none",
        }}
        aria-label="Envoyer"
      >
        {isLoading ? (
          <svg
            style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }}
            viewBox="0 0 24 24"
            fill="none"
          >
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
          </svg>
        )}
      </button>
    </div>
  );
}
