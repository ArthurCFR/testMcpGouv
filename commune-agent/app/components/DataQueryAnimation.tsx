"use client";

import Image from "next/image";
import agentIAIcon from "@/app/icons/agentIA.png";
import dataGouvIcon from "@/app/icons/Frame 34.png";

const W = 112;
const DUR = "1.8s";

interface Props {
  /** Adapt colors for a colored/dark background (e.g. the blue header overlay) */
  light?: boolean;
}

export default function DataQueryAnimation({ light = false }: Props) {
  const iconCls = light
    ? "bg-white/15 border-white/25"
    : "bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700";

  const dotRightColor = light ? "rgba(255,255,255,0.95)" : "#3b82f6";
  const dotLeftColor  = light ? "rgba(255,255,255,0.55)" : "#ef4444";

  const lineGradient = light
    ? "linear-gradient(90deg,rgba(255,255,255,.35) 0%,rgba(255,255,255,.12) 50%,rgba(255,255,255,.35) 100%)"
    : "linear-gradient(90deg,rgba(59,130,246,.3) 0%,rgba(161,161,170,.2) 50%,rgba(239,68,68,.3) 100%)";

  const glowA = light ? "dg-glow-white-a 2.2s ease-in-out infinite"       : "dg-glow-blue 2.2s ease-in-out infinite";
  const glowB = light ? "dg-glow-white-b 2.2s ease-in-out 0.55s infinite" : "dg-glow-red 2.2s ease-in-out 0.55s infinite";

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
        @keyframes dg-glow-blue {
          0%,100% { box-shadow: 0 0 0 0   rgba(59,130,246,0); }
          50%     { box-shadow: 0 0 0 3px rgba(59,130,246,0.18), 0 0 14px rgba(59,130,246,0.1); }
        }
        @keyframes dg-glow-red {
          0%,100% { box-shadow: 0 0 0 0   rgba(239,68,68,0); }
          50%     { box-shadow: 0 0 0 3px rgba(239,68,68,0.18), 0 0 14px rgba(239,68,68,0.1); }
        }
        @keyframes dg-glow-white-a {
          0%,100% { box-shadow: 0 0 0 0   rgba(255,255,255,0); }
          50%     { box-shadow: 0 0 0 3px rgba(255,255,255,0.22), 0 0 14px rgba(255,255,255,0.12); }
        }
        @keyframes dg-glow-white-b {
          0%,100% { box-shadow: 0 0 0 0   rgba(255,255,255,0); }
          50%     { box-shadow: 0 0 0 3px rgba(255,255,255,0.16), 0 0 14px rgba(255,255,255,0.08); }
        }
      `}</style>

      <div className="flex flex-col gap-1.5 py-0.5">
        <div className="flex items-center gap-3">

          {/* Agent IA icon */}
          <div
            className={`w-9 h-9 rounded-xl overflow-hidden border flex items-center justify-center p-0.5 shrink-0 ${iconCls}`}
            style={{ animation: glowA }}
          >
            <Image src={agentIAIcon} alt="Agent IA" width={30} height={30} className="object-contain" />
          </div>

          {/* Flow channel */}
          <div className="relative shrink-0 overflow-hidden" style={{ width: W, height: 18 }}>
            <div
              className="absolute inset-x-0"
              style={{ top: "50%", height: 1, marginTop: -0.5, background: lineGradient }}
            />
            {([0, -0.6, -1.2] as number[]).map((delay, i) => (
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
            {([-0.3, -0.9, -1.5] as number[]).map((delay, i) => (
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
          </div>

          {/* Marianne / data.gouv icon */}
          <div
            className={`w-9 h-9 rounded-xl overflow-hidden border flex items-center justify-center p-0.5 shrink-0 ${iconCls}`}
            style={{ animation: glowB }}
          >
            <Image src={dataGouvIcon} alt="data.gouv" width={30} height={30} className="object-contain" />
          </div>
        </div>

        <p className={`text-[10px] tracking-wide pl-0.5 ${labelCls}`}>
          Consultation data.gouv…
        </p>
      </div>
    </>
  );
}
