"use client";

import dynamic from "next/dynamic";

// Dynamic import prevents Leaflet from running during SSR (it requires `window`)
const LeafletMap = dynamic(() => import("./LeafletMap"), {
  ssr: false,
  loading: () => (
    <div
      style={{ height: 280 }}
      className="bg-zinc-950/50 flex items-center justify-center"
    >
      <span className="text-zinc-600 text-sm animate-pulse">
        Chargement de la carte…
      </span>
    </div>
  ),
});

export default function MapCard({
  code_insee,
  nom,
}: {
  code_insee: string;
  nom: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
      <div className="px-5 pt-4 pb-3 flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-lg">
          🗺️
        </div>
        <span className="font-semibold text-zinc-200">Localisation</span>
      </div>
      <LeafletMap code_insee={code_insee} nom={nom} />
    </div>
  );
}
