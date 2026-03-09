import json
import logging
import math

import httpx
from mcp.server.fastmcp import FastMCP

from helpers import tabular_api_client

logger = logging.getLogger("datagouv_mcp")

# Statistiques totales DVF — resource contenant sections, communes, départements
_DVF_STATS_RESOURCE_ID = "851d342f-9c96-41c1-924a-11a7a7aae8a6"


def register_get_dvf_sections_commune_tool(mcp: FastMCP) -> None:
    @mcp.tool()
    async def get_dvf_sections_commune(code_commune: str) -> str:
        """
        Get DVF real estate price statistics broken down by cadastral section
        (sub-commune geographic zones) for a French commune.

        Sections are the finest granularity available in the aggregated DVF stats dataset.
        A large city like Montpellier has ~200 sections, allowing intra-city price mapping.

        Returns median price per m² for apartments and houses per section, sorted from most
        to least expensive. Only sections with at least one recorded transaction are shown.

        Note: Sections are identified by cadastral codes (e.g. "34172000AL"), not named
        neighborhoods. Only available for communes with enough transactions (typically >10k pop).

        Data source: data.gouv.fr — "Statistiques DVF" (2014–2024 cumulative).

        Parameters:
            code_commune: INSEE commune code (5 characters, e.g. "34172" for Montpellier)
        """
        code_commune = code_commune.strip()
        if not code_commune:
            return "❌ Error: code_commune cannot be empty."

        logger.info(f"Fetching DVF sections for commune {code_commune}")

        try:
            async with httpx.AsyncClient(timeout=30.0) as session:
                # First page — also tells us total count
                first = await tabular_api_client.fetch_resource_data(
                    _DVF_STATS_RESOURCE_ID,
                    page=1,
                    page_size=100,
                    params={
                        "code_parent__exact": code_commune,
                        "echelle_geo__exact": "section",
                    },
                    session=session,
                )

                total = first.get("meta", {}).get("total", 0)
                if total == 0:
                    return (
                        f"Aucune section cadastrale trouvée pour la commune {code_commune}.\n"
                        "Causes possibles :\n"
                        "- La commune est trop petite (pas assez de transactions DVF enregistrées)\n"
                        "- Le code INSEE est incorrect\n"
                        "- La commune fait partie d'Alsace-Moselle (DVF non applicable)"
                    )

                all_rows = list(first.get("data", []))

                # Fetch remaining pages if needed
                total_pages = math.ceil(total / 100)
                if total_pages > 1:
                    for page_num in range(2, total_pages + 1):
                        page_data = await tabular_api_client.fetch_resource_data(
                            _DVF_STATS_RESOURCE_ID,
                            page=page_num,
                            page_size=100,
                            params={
                                "code_parent__exact": code_commune,
                                "echelle_geo__exact": "section",
                            },
                            session=session,
                        )
                        all_rows.extend(page_data.get("data", []))

        except tabular_api_client.ResourceNotAvailableError:
            return "❌ Le dataset Statistiques DVF n'est pas disponible via l'API Tabular."
        except Exception as e:  # noqa: BLE001
            logger.exception(f"Error fetching DVF sections for {code_commune}")
            return f"❌ Erreur lors de la récupération des sections : {e}"

        # Keep only sections with at least one transaction
        def _int(val: str | None) -> int | None:
            try:
                return int(val) if val else None
            except (ValueError, TypeError):
                return None

        sections = []
        for row in all_rows:
            nb_apt = _int(row.get("nb_ventes_whole_appartement"))
            nb_mai = _int(row.get("nb_ventes_whole_maison"))
            nb_mix = _int(row.get("nb_ventes_whole_apt_maison"))
            med_apt = _int(row.get("med_prix_m2_whole_appartement"))
            med_mai = _int(row.get("med_prix_m2_whole_maison"))
            med_mix = _int(row.get("med_prix_m2_whole_apt_maison"))

            if nb_mix is None and nb_apt is None and nb_mai is None:
                continue

            sections.append({
                "code_section": row.get("code_geo", ""),
                "nb_ventes_appart": nb_apt,
                "med_m2_appart": med_apt,
                "nb_ventes_maison": nb_mai,
                "med_m2_maison": med_mai,
                "nb_ventes_total": nb_mix,
                "med_m2_total": med_mix,
            })

        if not sections:
            return (
                f"Aucune section avec des transactions DVF pour la commune {code_commune}.\n"
                f"({total} sections cadastrales existent mais aucune avec des données de prix.)"
            )

        # Sort by total median price descending (fallback to appart then maison)
        sections.sort(
            key=lambda s: s["med_m2_total"] or s["med_m2_appart"] or s["med_m2_maison"] or 0,
            reverse=True,
        )

        def _fmt(val: int | None) -> str:
            return f"{val:,} €/m²".replace(",", " ") if val is not None else "–"

        def _fmt_nb(val: int | None) -> str:
            return str(val) if val is not None else "–"

        lines = [
            f"DVF — Sections cadastrales — commune {code_commune} (2014–2024 cumulé)",
            f"Source : Statistiques totales DVF, data.gouv.fr",
            f"Sections avec transactions : {len(sections)} / {total}",
            "",
            f"{'Section':<14} {'Med €/m² (mix)':<16} {'Nb ventes':<12} "
            f"{'Med €/m² apt':<15} {'Med €/m² mais':<15}",
            "-" * 74,
        ]

        for s in sections:
            lines.append(
                f"{s['code_section']:<14} "
                f"{_fmt(s['med_m2_total']):<16} "
                f"{_fmt_nb(s['nb_ventes_total']):<12} "
                f"{_fmt(s['med_m2_appart']):<15} "
                f"{_fmt(s['med_m2_maison']):<15}"
            )

        lines += [
            "",
            "JSON :",
            json.dumps(sections, ensure_ascii=False),
        ]

        return "\n".join(lines)
