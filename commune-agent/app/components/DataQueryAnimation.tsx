"use client";

import Image from "next/image";
import agentIAIcon from "@/app/icons/agentIA.png";
import dataGouvIcon from "@/app/icons/Frame 34.png";

const W = 112;
const DUR = "1.8s";

interface Props {
  /** Adapt colors for a colored/dark background (e.g. the blue header overlay) */
  light?: boolean;
  /** Static mode: show icons + line without any animation */
  frozen?: boolean;
  /** Subtle mode: always show slow white dots (2× smaller, 4× slower) */
  subtle?: boolean;
}

export default function DataQueryAnimation({ light = false, frozen = false, subtle = false }: Props) {
  const dotRightColor = light ? "rgba(255,255,255,0.95)" : "#3b82f6";
  const dotLeftColor  = light ? "rgba(255,255,255,0.55)" : "#ef4444";

  const lineGradient = subtle
    ? "linear-gradient(90deg,rgba(255,255,255,.25) 0%,rgba(255,255,255,.1) 50%,rgba(255,255,255,.25) 100%)"
    : light
    ? "linear-gradient(90deg,rgba(255,255,255,.35) 0%,rgba(255,255,255,.12) 50%,rgba(255,255,255,.35) 100%)"
    : "linear-gradient(90deg,rgba(59,130,246,.3) 0%,rgba(161,161,170,.2) 50%,rgba(239,68,68,.3) 100%)";

  const pulseColorA = light ? "rgba(255,255,255,0.5)"  : "rgba(59,130,246,0.45)";
  const pulseColorB = light ? "rgba(255,255,255,0.35)" : "rgba(239,68,68,0.45)";

  const labelCls = light
    ? "text-white/55"
    : "text-zinc-400 dark:text-zinc-500";

  return (
    <>
      <style>{`
        @keyframes dg-right {
          0%   { left: 0px;    opacity: 0; }
          8%   {               opacity: 1; }
          92%  {               opacity: 1; }
          100% { left: ${W}px; opacity: 0; }
        }
        @keyframes dg-left {
          0%   { left: ${W}px; opacity: 0; }
          8%   {               opacity: 1; }
          92%  {               opacity: 1; }
          100% { left: 0px;    opacity: 0; }
        }
        @keyframes dg-pulse {
          0%, 100% { transform: scale(0.82); opacity: 0.55; }
          50%      { transform: scale(1.38); opacity: 0.12; }
        }
      `}</style>

      <div className="flex flex-col gap-1.5 py-0.5">
        <div className="flex items-center gap-3">

          {/* Agent IA icon */}
          <div className="w-9 h-9 relative flex items-center justify-center shrink-0">
            {!frozen && !subtle && (
              <div style={{
                position: "absolute", inset: 0,
                borderRadius: "50%",
                background: pulseColorA,
                animation: "dg-pulse 2.2s ease-in-out infinite",
              }} />
            )}
            <Image src={agentIAIcon} alt="Agent IA" width={30} height={30} className="object-contain relative z-10" />
          </div>

          {/* Flow channel */}
          <div className="relative shrink-0 overflow-hidden" style={{ width: W, height: 18 }}>
            <div
              className="absolute inset-x-0"
              style={{ top: "50%", height: 1, marginTop: -0.5, background: lineGradient }}
            />

            {/* Normal dots (active search) */}
            {!frozen && !subtle && ([0, -0.6, -1.2] as number[]).map((delay, i) => (
              <span
                key={`r${i}`}
                className="absolute rounded-full"
                style={{
                  width: 6, height: 6,
                  top: "50%", marginTop: -3,
                  background: dotRightColor,
                  animation: `dg-right ${DUR} linear ${delay}s infinite`,
                }}
              />
            ))}
            {!frozen && !subtle && ([-0.3, -0.9, -1.5] as number[]).map((delay, i) => (
              <span
                key={`l${i}`}
                className="absolute rounded-full"
                style={{
                  width: 5, height: 5,
                  top: "50%", marginTop: -2.5,
                  background: dotLeftColor,
                  animation: `dg-left ${DUR} linear ${delay}s infinite`,
                }}
              />
            ))}

            {/* Subtle dots (static, white, normal size) */}
            {subtle && ([18, 56, 94] as number[]).map((left, i) => (
              <span
                key={`sr${i}`}
                className="absolute rounded-full"
                style={{ width: 6, height: 6, top: "50%", marginTop: -3, left, background: "white" }}
              />
            ))}
          </div>

          {/* Marianne / data.gouv icon */}
          <div className="w-9 h-9 relative flex items-center justify-center shrink-0">
            {!frozen && !subtle && (
              <div style={{
                position: "absolute", inset: 0,
                borderRadius: "50%",
                background: pulseColorB,
                animation: "dg-pulse 2.2s ease-in-out 0.55s infinite",
              }} />
            )}
            <Image src={dataGouvIcon} alt="data.gouv" width={30} height={30} className="object-contain relative z-10" />
          </div>
        </div>

        {!frozen && !subtle && (
          <p className={`text-[10px] tracking-wide pl-0.5 ${labelCls}`}>
            Consultation data.gouv…
          </p>
        )}
      </div>
    </>
  );
}
