import json
import logging

import httpx
from mcp.server.fastmcp import FastMCP

logger = logging.getLogger("datagouv_mcp")

# INSEE — Recensement de la Population 2019 (géographie 2022)
# Dataset: 63ce5a88f6a32e536986f64a — "Population 2019 selon l'âge quinquennal"
# XLSX 34 938 communes, disponible via Tabular API
_RESOURCE_ID = "cc470c60-f914-4c89-b253-a04a22311f13"

_TRANCHES = [
    "0-4", "5-9", "10-14", "15-19", "20-24", "25-29",
    "30-34", "35-39", "40-44", "45-49", "50-54", "55-59",
    "60-64", "65-69", "70-74", "75-79", "80-84", "85-89",
    "90-94", "95-99", "100+",
]


def _normalize_code(code_commune: str) -> str:
    """
    Le dataset RP2019 stocke les codes commune sans zéro initial pour les
    départements 01–09 (ex : '01001' → '1001').  On essaie d'abord la version
    sans zéro initial, et on conserve l'original en fallback.
    """
    stripped = code_commune.lstrip("0")
    return stripped if stripped else code_commune


async def _query(session: httpx.AsyncClient, code: str) -> list[dict]:
    """Interroge la Tabular API et renvoie les lignes brutes (peut être vide)."""
    resp = await session.get(
        f"https://tabular-api.data.gouv.fr/api/resources/{_RESOURCE_ID}/data/",
        params={"COM__exact": code, "page_size": 1},
    )
    if resp.status_code == 404:
        return []
    resp.raise_for_status()
    return resp.json().get("data", [])


def register_get_pyramide_ages_commune_tool(mcp: FastMCP) -> None:
    @mcp.tool()
    async def get_pyramide_ages_commune(code_commune: str) -> str:
        """
        Retourne la pyramide des âges (tranches quinquennales) d'une commune française.

        Source : INSEE — Recensement de la Population 2019 (géographie 2022).
        Couverture : 34 938 communes (France métropolitaine + DROM).
        Résolution : tranches de 5 ans de 0–4 ans à 100+ ans, hommes et femmes séparés.

        Parameters:
            code_commune: Code INSEE de la commune (5 caractères, ex: "75056" pour Paris,
                          "69123" pour Lyon, "01001" pour Ambléon).

        Returns:
            Tableau des effectifs par tranche d'âge et sexe, plus un bloc JSON prêt à
            intégrer dans le champ pyramide_ages.tranches de la réponse finale.
        """
        code_commune = code_commune.strip()
        if not code_commune:
            return "❌ Error: code_commune ne peut pas être vide."

        logger.info(f"Fetching pyramide des âges for commune {code_commune}")

        code_query = _normalize_code(code_commune)

        try:
            async with httpx.AsyncClient(timeout=15.0) as session:
                rows = await _query(session, code_query)
                # Fallback : si le code normalisé ne donne rien, tente avec l'original
                if not rows and code_query != code_commune:
                    logger.debug(
                        f"Pyramide âges: no result for normalized code {code_query!r}, "
                        f"retrying with original {code_commune!r}"
                    )
                    rows = await _query(session, code_commune)
        except httpx.TimeoutException:
            return "❌ Délai d'attente dépassé lors de la récupération de la pyramide des âges."
        except Exception as e:
            logger.exception(f"Unexpected error fetching pyramide âges for {code_commune}")
            return f"❌ Erreur inattendue : {e}"

        if not rows:
            return (
                f"Aucune donnée de pyramide des âges trouvée pour le code commune {code_commune}.\n"
                "La commune peut être très petite, absente du RP2019 (commune nouvelle post-2019) "
                "ou le code INSEE est incorrect."
            )

        row = rows[0]
        nom = row.get("NCOM", code_commune)

        tranches_data = []
        for t in _TRANCHES:
            f_raw = row.get(f"F{t}")
            h_raw = row.get(f"H{t}")
            try:
                f_val = int(float(f_raw)) if f_raw is not None else 0
                h_val = int(float(h_raw)) if h_raw is not None else 0
            except (ValueError, TypeError):
                f_val, h_val = 0, 0
            tranches_data.append({"tranche": t, "femmes": f_val, "hommes": h_val})

        total_f = sum(d["femmes"] for d in tranches_data)
        total_h = sum(d["hommes"] for d in tranches_data)

        lines = [
            f"Pyramide des âges — {nom} ({code_commune})",
            "Source : INSEE — Recensement de la Population 2019 (géographie 2022)",
            "",
            f"{'tranche':<8} | {'femmes':>8} | {'hommes':>8}",
            "-" * 34,
        ]
        for d in tranches_data:
            lines.append(f"{d['tranche']:<8} | {d['femmes']:>8} | {d['hommes']:>8}")
        lines += [
            "-" * 34,
            f"{'Total':<8} | {total_f:>8} | {total_h:>8}",
            "",
            "JSON (à copier dans pyramide_ages.tranches) :",
            json.dumps(tranches_data, ensure_ascii=False),
        ]

        return "\n".join(lines)
