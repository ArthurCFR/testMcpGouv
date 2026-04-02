"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { CommuneAnalysis } from "@/app/types";
import IntroModal from "./IntroModal";

const ReportPreviewModal = dynamic(
  () => import("@/app/components/ReportPreviewModal"),
  { ssr: false }
);

interface Props {
  analysis: CommuneAnalysis | null;
  fullText: string;
}

export default function PDFButton({ analysis, fullText }: Props) {
  const [step, setStep] = useState<"idle" | "intro" | "report">("idle");
  const [agentName, setAgentName] = useState("");
  const [clientName, setClientName] = useState("");

  return (
    <>
      <button
        onClick={() => setStep("intro")}
        title="Aperçu et téléchargement du rapport"
        className="flex items-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-500 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
          <rect x="9" y="3" width="6" height="4" rx="1" strokeLinejoin="round" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6M9 16h4" />
        </svg>
        <span>Rapport</span>
      </button>

      {step === "intro" && (
        <IntroModal
          onConfirm={(agent, client) => { setAgentName(agent); setClientName(client); setStep("report"); }}
          onClose={() => setStep("idle")}
          initialAgent={agentName}
          initialClient={clientName}
        />
      )}

      {step === "report" && (
        <ReportPreviewModal
          isOpen
          onClose={() => setStep("idle")}
          analysis={analysis}
          currentText={fullText}
          agentName={agentName}
          clientName={clientName}
        />
      )}
    </>
  );
}
