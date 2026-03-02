/**
 * Agent server — processus Node.js séparé, sans Next.js.
 *
 * Pourquoi un processus séparé ?
 * Next.js patche globalThis.fetch au démarrage. Le SDK MCP utilise
 * (this._fetch ?? fetch), où `fetch` est globalThis.fetch au moment
 * de l'appel. Sans ce serveur, le transport SSE du SDK MCP tombait
 * sur le fetch patché (buffering, dedup) au lieu du fetch Node.js natif.
 *
 * Ici, globalThis.fetch = fetch Node.js 20 natif, non modifié.
 * Même pattern que scripts/explore-datasets.ts qui fonctionne.
 *
 * Usage : npx tsx agent-server/index.ts
 */

import Anthropic from "@anthropic-ai/sdk";
import express from "express";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// ── Types (inline — pas d'alias @/ ici) ──────────────────────────────────────

interface AgentTraceEvent {
  id: string;
  type: "tool_call" | "tool_result" | "thinking" | "text";
  timestamp: number;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  status?: "pending" | "success" | "error";
  content?: string;
  duration?: number;
}

interface CommuneAnalysis {
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
    source?: string;
  };
  population: {
    total?: number | null;
    source?: string;
    annee?: number | string | null;
  };
  meta: {
    nb_appels_mcp: number;
    donnees_manquantes: string[];
  };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MCP_SERVER_URL = process.env.MCP_SERVER_URL ?? "http://localhost:8000/mcp";

// ── MCP client ── identique à explore-datasets.ts, SANS fetch custom ─────────
// globalThis.fetch ici = fetch Node.js 20 natif, non patché.

async function createMCPClient(): Promise<Client> {
  const client = new Client({ name: "commune-agent", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(MCP_SERVER_URL), {
    requestInit: { headers: { Host: "localhost" } },
    // Pas de fetch: → (this._fetch ?? fetch) utilise globalThis.fetch Node.js
  });
  await client.connect(transport);
  return client;
}

function extractToolResultText(result: CallToolResult): string {
  if (!result?.content) return "(pas de résultat)";
  return result.content
    .filter((c) => c.type === "text")
    .map((c) => (c as { type: "text"; text: string }).text)
    .join("\n");
}

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Tu es un agent d'analyse territoriale. L'utilisateur te donne le nom d'une commune française.
Tu dois produire un profil structuré en interrogeant data.gouv.fr via les outils MCP disponibles.

## ÉTAPE 1 — Résolution INSEE (obligatoire, 1 appel)

Utilise query_resource_data sur le dataset COG pour résoudre le nom en code INSEE :
- resource_id : "0c3d9bc4-5a70-4d35-8b03-b84e57fda861"
- filter_column : "LIBELLE"
- filter_operator : "contains"
- filter_value : le nom de la commune

Si plusieurs résultats (ex: "Saint-Martin"), prends le résultat le plus probable selon le contexte.
Extrait : code INSEE (col "COM"), département (2 premiers chiffres), région.

## ÉTAPE 2 — Collecte des données (2 appels)

### 2a. Prix immobiliers DVF (appel 1)
- resource_id : "851d342f-9c96-41c1-924a-11a7a7aae8a6"
- question : "prix immobiliers commune"
- filter_column : "code_geo"
- filter_value : code INSEE
Colonnes utiles : nb_ventes_whole_appartement, med_prix_m2_whole_appartement, nb_ventes_whole_maison, med_prix_m2_whole_maison

### 2b. Population légale (appel 2)
- resource_id : "8cb92c8f-26e2-4705-b9bf-a76aba8c0450"
- question : "population commune"
- filter_column : "Code Officiel Commune / Arrondissement Municipal"
- filter_value : code INSEE
Colonnes utiles : "Population totale" (→ population.total), "Population municipale", "Année de recensement" (→ population.annee)

## ÉTAPE 3 — Gestion des échecs

Si un appel retourne une erreur 400 ou "not found" :
- Essaie avec filter_operator "contains" au lieu de "exact"
- Si toujours en échec, note "données indisponibles" pour ce bloc et continue
- Ne fais jamais plus de 2 tentatives par dataset

## ÉTAPE 4 — Output JSON structuré

Quand tu as toutes les données disponibles, retourne UNIQUEMENT ce JSON, sans texte autour :

{
  "commune": {
    "nom": "...",
    "code_insee": "...",
    "departement": "...",
    "region": "..."
  },
  "immobilier": {
    "prix_median_m2_appt": null,
    "prix_median_m2_maison": null,
    "nb_transactions_appt": null,
    "nb_transactions_maison": null,
    "evolution_prix_2022_2024_pct": null,
    "source": "DVF"
  },
  "population": {
    "total": null,
    "source": "INSEE populations légales",
    "annee": null
  },
  "meta": {
    "nb_appels_mcp": 0,
    "donnees_manquantes": ["logements_sociaux: dataset trop volumineux pour streaming temps réel"]
  }
}

## RÈGLES ABSOLUES

- Ne cherche JAMAIS les dataset IDs via search_datasets — ils sont fournis ci-dessus.
- N'appelle JAMAIS download_and_parse_resource — aucun dataset de cette V1 ne le nécessite.
- L'évolution de prix n'est pas calculable (dataset DVF agrégé sans colonne année) — laisse evolution_prix_2022_2024_pct à null.
- Le champ meta.nb_appels_mcp doit refléter le nombre réel d'appels effectués.`;

// ── SSE helpers ───────────────────────────────────────────────────────────────

function sse(res: express.Response, type: string, data: unknown): void {
  res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
}

function emitTrace(res: express.Response, event: AgentTraceEvent): void {
  sse(res, "trace", event);
}

// ── Route POST /analyze ───────────────────────────────────────────────────────

app.post("/analyze", async (req: express.Request, res: express.Response) => {
  const commune: string = req.body?.commune;

  if (!commune || typeof commune !== "string") {
    res.status(400).json({ error: "Commune manquante" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  let mcp: Client | null = null;
  let eventCounter = 0;

  try {
    // ── 1. Init MCP ──────────────────────────────────────────────────
    emitTrace(res, {
      id: "mcp-init",
      type: "thinking",
      timestamp: Date.now(),
      content: `Connexion au serveur MCP ${MCP_SERVER_URL}…`,
    });

    mcp = await createMCPClient();
    const { tools: mcpTools } = await mcp.listTools();

    emitTrace(res, {
      id: "mcp-ready",
      type: "thinking",
      timestamp: Date.now(),
      content: `Serveur MCP prêt — ${mcpTools.length} outil(s) : ${mcpTools.map((t) => t.name).join(", ")}`,
    });

    // ── 2. Convertit les outils MCP → format Anthropic ───────────────
    const anthropicTools: Anthropic.Tool[] = mcpTools.map((t) => ({
      name: t.name,
      description: t.description ?? `Outil MCP : ${t.name}`,
      input_schema: {
        type: "object" as const,
        properties:
          (t.inputSchema as { properties?: Record<string, unknown> })
            ?.properties ?? {},
        required:
          (t.inputSchema as { required?: string[] })?.required ?? [],
      },
    }));

    // ── 3. Boucle agentique ──────────────────────────────────────────
    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: `Analyse la commune de ${commune}.` },
    ];

    while (true) {
      const response = await anthropic.messages.create({
        model: "claude-opus-4-6",
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: anthropicTools,
        messages,
      });

      const toolUseBlocks: Anthropic.ToolUseBlock[] = [];
      const toolResultContent: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type === "text" && block.text.trim()) {
          emitTrace(res, {
            id: `text-${++eventCounter}`,
            type: "text",
            timestamp: Date.now(),
            content: block.text,
          });
        } else if (block.type === "tool_use") {
          const callId = `tool-${++eventCounter}`;
          const callEvent: AgentTraceEvent = {
            id: callId,
            type: "tool_call",
            timestamp: Date.now(),
            toolName: block.name,
            toolInput: block.input as Record<string, unknown>,
            status: "pending",
          };
          emitTrace(res, callEvent);
          toolUseBlocks.push(block);

          const t0 = Date.now();
          let resultText: string;
          let callStatus: "success" | "error" = "success";

          try {
            const result = (await mcp.callTool(
              {
                name: block.name,
                arguments: block.input as Record<string, unknown>,
              },
              undefined,
              { timeout: 180_000 }
            )) as CallToolResult;
            resultText = extractToolResultText(result);
          } catch (err) {
            callStatus = "error";
            resultText = `Erreur: ${err instanceof Error ? err.message : String(err)}`;
          }

          const duration = Date.now() - t0;

          emitTrace(res, { ...callEvent, status: callStatus, duration });
          emitTrace(res, {
            id: `result-${callId}`,
            type: "tool_result",
            timestamp: Date.now(),
            toolName: block.name,
            content: resultText,
          });

          toolResultContent.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: resultText,
          });
        }
      }

      messages.push({ role: "assistant", content: response.content });

      if (toolResultContent.length > 0) {
        messages.push({ role: "user", content: toolResultContent });
      }

      if (response.stop_reason === "end_turn" || toolUseBlocks.length === 0) {
        const lastText = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n");

        try {
          const match = lastText.match(/\{[\s\S]*\}/);
          if (match) {
            const parsed = JSON.parse(match[0]) as CommuneAnalysis;
            sse(res, "result", parsed);
          } else {
            sse(res, "error", "Impossible d'extraire le résultat JSON de la réponse.");
          }
        } catch {
          sse(res, "error", "Résultat non parseable : " + lastText.slice(0, 300));
        }
        break;
      }
    }
  } catch (err) {
    sse(res, "error", err instanceof Error ? err.message : "Erreur inconnue");
  } finally {
    await mcp?.close();
    res.write("data: [DONE]\n\n");
    res.end();
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.AGENT_SERVER_PORT ?? "3001", 10);
app.listen(PORT, () => {
  process.stderr.write(`Agent server listening on http://localhost:${PORT}\n`);
  process.stderr.write(`MCP server: ${MCP_SERVER_URL}\n`);
});
