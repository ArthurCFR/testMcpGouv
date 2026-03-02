"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useRef } from "react";
import ChatInput from "@/app/components/ChatInput";
import ChatMessage from "@/app/components/ChatMessage";
import ThemeToggle from "@/app/components/ThemeToggle";

export default function Home() {
  const { messages, sendMessage, status, setMessages, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/analyze" }),
  });

  const isLoading = status === "submitted" || status === "streaming";
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
      <header className="shrink-0 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
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

          {/* Typing indicator while waiting for first token */}
          {isLoading && (messages.length === 0 || messages[messages.length - 1]?.role === "user") && (
            <div className="flex gap-[3px] items-center h-5 pl-1">
              {[0, 150, 300].map((delay) => (
                <span
                  key={delay}
                  className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-600 animate-bounce"
                  style={{ animationDelay: `${delay}ms` }}
                />
              ))}
            </div>
          )}

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
