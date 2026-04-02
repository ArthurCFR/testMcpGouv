"use client";

import century21Logo from "@/app/icons/Century-21-real-estate-Logo.png";
import { CommuneAnalysis } from "@/app/types";

const C21_DARK = "#1c1917";
const C21_GOLD = "#b09a7a";

export default function C21Header({
  analysis,
  agentName,
  clientName,
  address,
}: {
  analysis: CommuneAnalysis | null;
  agentName?: string;
  clientName?: string;
  address?: string;
}) {
  const communeName = analysis?.commune?.nom ?? "";
  const dept = analysis?.commune?.departement ?? "";
  const region = analysis?.commune?.region ?? "";
  // Primary line: address if available, otherwise commune name
  const primaryLine = address || communeName || "Rapport";
  // Secondary line: commune context (only if address is shown and commune info available)
  const secondaryLine = address && communeName
    ? [communeName, dept, region].filter(Boolean).join(" · ")
    : !address ? [dept, region].filter(Boolean).join(" · ") : "";
  const dateLabel = new Date().toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const hasAgent = agentName && agentName.trim();
  const hasClient = clientName && clientName.trim();

  return (
    <div
      style={{
        borderRadius: 8,
        overflow: "hidden",
        marginBottom: 24,
        fontFamily: "system-ui,-apple-system,sans-serif",
        border: "1px solid #e8e0d5",
      }}
    >
      {/* Logo zone */}
      <div
        style={{
          background: "#ffffff",
          padding: "14px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          borderBottom: `3px solid ${C21_GOLD}`,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={(century21Logo as { src: string }).src}
          style={{ height: 42, width: "auto", display: "block" }}
          alt="Century 21"
        />
      </div>

      {/* Dark zone */}
      <div style={{ background: C21_DARK, padding: "22px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#ffffff", letterSpacing: "-0.2px", lineHeight: 1.2 }}>
              {primaryLine}
            </div>
            {secondaryLine && (
              <div style={{ fontSize: 11, color: C21_GOLD, marginTop: 4 }}>{secondaryLine}</div>
            )}
          </div>
          <div style={{ textAlign: "right", paddingTop: 2 }}>
            <div style={{ fontSize: 9, color: "#78716c" }}>Rapport du</div>
            <div style={{ fontSize: 11, color: "#a8a29e", marginTop: 3 }}>{dateLabel}</div>
          </div>
        </div>

        {(hasAgent || hasClient) && (
          <div
            style={{
              marginTop: 14,
              paddingTop: 12,
              borderTop: "1px solid rgba(255,255,255,0.08)",
              display: "flex",
              gap: 20,
              flexWrap: "wrap",
            }}
          >
            {hasAgent && (
              <div>
                <div style={{ fontSize: 8, color: "#57534e", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>
                  Agent
                </div>
                <div style={{ fontSize: 12, color: C21_GOLD, fontWeight: 600 }}>{agentName}</div>
              </div>
            )}
            {hasClient && (
              <div>
                <div style={{ fontSize: 8, color: "#57534e", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>
                  Client
                </div>
                <div style={{ fontSize: 12, color: "#d6d3d1", fontWeight: 500 }}>{clientName}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
