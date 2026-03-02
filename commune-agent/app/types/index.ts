// Types for the commune agent

export interface AgentTraceEvent {
  id: string;
  type: "tool_call" | "tool_result" | "thinking" | "text";
  timestamp: number;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  status?: "pending" | "success" | "error";
  content?: string;
  duration?: number;
}

export interface CommuneAnalysis {
  commune: {
    nom: string;
    code_insee?: string;
    departement?: string;
    region?: string;
  };
  immobilier: {
    prix_median_m2_appt?: number | null;
    prix_median_m2_maison?: number | null;
    nb_transactions_appt?: number | null;
    nb_transactions_maison?: number | null;
    evolution_prix_2022_2024_pct?: number | null;
    historique_prix?: Array<{
      annee: number;
      prix_m2: number;
      nb_mutations?: number | null;
    }> | null;
    source?: string;
  };
  population: {
    total?: number | null;
    densite_hab_km2?: number | null;
    superficie_km2?: number | null;
    grille_densite?: string | null;
    source?: string;
  };
  logement?: {
    taux_logements_sociaux_pct?: number | null;
    source?: string;
  };
  pyramide_ages?: {
    tranches?: Array<{
      tranche: string;
      femmes: number;
      hommes: number;
    }> | null;
    source?: string;
  } | null;
  meta: {
    nb_appels_mcp: number;
    donnees_manquantes: string[];
  };
}

export interface AnalyzeRequest {
  commune: string;
}

export interface AnalyzeStreamChunk {
  type: "trace" | "result" | "error" | "done";
  data: AgentTraceEvent | CommuneAnalysis | string;
}
