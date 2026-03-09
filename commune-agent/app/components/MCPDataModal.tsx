"use client";

import { useEffect, useRef } from "react";

interface MCPDataModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DATABASES = [
  {
    icon: "📊",
    name: "Demandes de valeurs foncières (DVF)",
    publisher: "DGFiP — data.gouv.fr",
    coverage: "2014–2024 · toutes les communes de France",
    description: "Toutes les ventes immobilières enregistrées par les notaires. Prix au m², volumes, répartition par rue et par section cadastrale, biens comparables.",
  },
  {
    icon: "👥",
    name: "Recensement de la population",
    publisher: "INSEE · RP2019",
    coverage: "~35 000 communes",
    description: "Pyramide des âges par tranche quinquennale (0–100+). Permet de connaître le profil démographique d'une commune.",
  },
  {
    icon: "🏘️",
    name: "Base communale des logements",
    publisher: "INSEE · 2021",
    coverage: "~35 000 communes",
    description: "Stock de logements : maisons, appartements, résidences secondaires, logements vacants.",
  },
  {
    icon: "🏗️",
    name: "Logements sociaux (SRU)",
    publisher: "Caisse des Dépôts · août 2024",
    coverage: "35 228 communes",
    description: "Taux de logements sociaux et stock HLM. Indicateur clé pour comprendre le profil d'un territoire.",
  },
  {
    icon: "⚡",
    name: "Diagnostics de performance énergétique (DPE)",
    publisher: "ADEME · mise à jour quotidienne",
    coverage: "14 millions de DPE · depuis juillet 2021",
    description: "Répartition des étiquettes énergie (A à G) sur les logements existants d'une commune.",
  },
  {
    icon: "🔒",
    name: "Statistiques de la délinquance",
    publisher: "Ministère de l'Intérieur",
    coverage: "2016–2024 · géographie 2025",
    description: "Cambriolages, vols de véhicules, dégradations, trafics — données pertinentes pour évaluer le cadre de vie d'un quartier.",
  },
  {
    icon: "🏫",
    name: "Annuaire de l'éducation",
    publisher: "Ministère de l'Éducation nationale · MAJ quotidienne",
    coverage: "~60 000 établissements · toute la France",
    description: "Écoles maternelles et élémentaires, collèges et lycées (publics et privés). Résultats au bac (taux de réussite, valeur ajoutée) et au brevet (DNB) par établissement.",
  },
  {
    icon: "🔍",
    name: "Catalogue data.gouv.fr",
    publisher: "data.gouv.fr",
    coverage: "Des milliers de datasets publics",
    description: "Accès à l'ensemble du catalogue open data français. L'agent peut rechercher, télécharger et interroger n'importe quel dataset CSV en SQL.",
  },
];

const TRANSPORT_DATABASES = [
  {
    icon: "🚇",
    name: "Réseau Metro · Tram · RER",
    publisher: "IDFM (Île-de-France Mobilités)",
    coverage: "France entière · Metro, Tram, RER, VAL, Câble",
    description: "Localisation de toutes les stations des réseaux de metro, tramway et RER de France. Lignes, modes de transport, coordonnées GPS. Permet de trouver les transports en commun à proximité d'une adresse.",
  },
  {
    icon: "🚉",
    name: "Gares ferroviaires",
    publisher: "SNCF / data.gouv.fr",
    coverage: "France entière · gares voyageurs",
    description: "Position des gares de voyageurs sur tout le territoire français. Utile pour estimer la distance à la gare TGV ou intercités la plus proche.",
  },
  {
    icon: "✈️",
    name: "Aéroports",
    publisher: "DGAC / data.gouv.fr",
    coverage: "France entière · aéroports civils",
    description: "Position des aéroports civils français. Permet d'évaluer la connectivité aérienne d'une commune ou d'un quartier.",
  },
];

export default function MCPDataModal({ isOpen, onClose }: MCPDataModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div
        className="relative w-full max-w-xl max-h-[85vh] flex flex-col rounded-2xl overflow-hidden"
        style={{
          background: "var(--c21-bg)",
          border: "1px solid var(--c21-border)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.4)",
        }}
      >
        {/* Header */}
        <div
          className="shrink-0 flex items-center justify-between px-6 py-4"
          style={{ borderBottom: "1px solid var(--c21-border)" }}
        >
          <div>
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--c21-text)" }}>
              Bases de données accessibles
            </div>
            <div style={{ fontSize: "0.72rem", color: "var(--c21-text-muted)", marginTop: "0.15rem" }}>
              Données officielles françaises interrogées en temps réel
            </div>
          </div>
          <button
            onClick={onClose}
            className="c21-icon-btn"
            style={{ color: "var(--c21-text-muted)" }}
            title="Fermer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-2">
          {DATABASES.map((db) => (
            <div
              key={db.name}
              className="flex items-start gap-3 rounded-xl px-4 py-3"
              style={{ background: "var(--c21-panel-bg)", border: "1px solid var(--c21-border)" }}
            >
              <span style={{ fontSize: "1.3rem", lineHeight: 1, marginTop: "0.1rem", flexShrink: 0 }}>
                {db.icon}
              </span>
              <div className="min-w-0">
                <div style={{ fontWeight: 600, fontSize: "0.82rem", color: "var(--c21-text)", lineHeight: 1.3 }}>
                  {db.name}
                </div>
                <div style={{ fontSize: "0.72rem", color: "var(--c21-text)", opacity: 0.6, marginTop: "0.15rem", lineHeight: 1.4 }}>
                  {db.description}
                </div>
                <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: "0.4rem" }}>
                  <span style={{
                    fontSize: "0.65rem",
                    padding: "0.1rem 0.45rem",
                    borderRadius: "4px",
                    background: "rgba(56,189,248,0.1)",
                    color: "var(--c21-blue)",
                    border: "1px solid rgba(56,189,248,0.2)",
                    fontWeight: 500,
                    whiteSpace: "nowrap",
                  }}>
                    {db.publisher}
                  </span>
                  <span style={{ fontSize: "0.65rem", color: "var(--c21-text-muted)", whiteSpace: "nowrap" }}>
                    {db.coverage}
                  </span>
                </div>
              </div>
            </div>
          ))}

          {/* Transport section separator */}
          <div className="flex items-center gap-2 pt-2 pb-1">
            <div style={{ flex: 1, height: "1px", background: "var(--c21-border)" }} />
            <span style={{ fontSize: "0.65rem", color: "var(--c21-text-muted)", whiteSpace: "nowrap", fontWeight: 500, letterSpacing: "0.04em" }}>
              TRANSPORTS & MOBILITÉ
            </span>
            <div style={{ flex: 1, height: "1px", background: "var(--c21-border)" }} />
          </div>

          {TRANSPORT_DATABASES.map((db) => (
            <div
              key={db.name}
              className="flex items-start gap-3 rounded-xl px-4 py-3"
              style={{
                background: "rgba(139,92,246,0.06)",
                border: "1px solid rgba(139,92,246,0.2)",
              }}
            >
              <span style={{ fontSize: "1.3rem", lineHeight: 1, marginTop: "0.1rem", flexShrink: 0 }}>
                {db.icon}
              </span>
              <div className="min-w-0">
                <div style={{ fontWeight: 600, fontSize: "0.82rem", color: "var(--c21-text)", lineHeight: 1.3 }}>
                  {db.name}
                </div>
                <div style={{ fontSize: "0.72rem", color: "var(--c21-text)", opacity: 0.6, marginTop: "0.15rem", lineHeight: 1.4 }}>
                  {db.description}
                </div>
                <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: "0.4rem" }}>
                  <span style={{
                    fontSize: "0.65rem",
                    padding: "0.1rem 0.45rem",
                    borderRadius: "4px",
                    background: "rgba(139,92,246,0.12)",
                    color: "rgb(167,139,250)",
                    border: "1px solid rgba(139,92,246,0.25)",
                    fontWeight: 500,
                    whiteSpace: "nowrap",
                  }}>
                    {db.publisher}
                  </span>
                  <span style={{ fontSize: "0.65rem", color: "var(--c21-text-muted)", whiteSpace: "nowrap" }}>
                    {db.coverage}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          className="shrink-0 px-6 py-3"
          style={{ borderTop: "1px solid var(--c21-border)", fontSize: "0.68rem", color: "var(--c21-text-muted)" }}
        >
          L&apos;agent peut aussi explorer librement le catalogue data.gouv.fr et interroger tout dataset public en SQL.
        </div>
      </div>
    </div>
  );
}
