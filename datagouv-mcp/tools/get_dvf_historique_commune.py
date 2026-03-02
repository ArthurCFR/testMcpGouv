import asyncio
import json
import logging

import httpx
from mcp.server.fastmcp import FastMCP

from helpers import tabular_api_client

logger = logging.getLogger("datagouv_mcp")

# DVF agrégé par commune — dataset 63dd1cc420bf925d5d1d8b1e
# Un fichier CSV par année, filtrable par INSEE_COM via Tabular API
_DVF_RESOURCES: dict[int, str] = {
    2024: "1b85be7c-17ce-42dc-b191-3b8f3c469087",
    2023: "d7881695-1cb5-44c1-900c-00c7158ab766",
    2022: "0350f9a1-04ba-4eb1-9637-d642c9d367d7",
    2021: "81d685b9-c789-4c9c-b33a-c0a79b61d434",
    2020: "cb076661-1b85-4b0e-9f81-7862b70ed408",
    2019: "084be72a-f586-47f7-92e6-02245e835934",
    2018: "4036107b-37fc-4fbf-a3de-ce9470d3b3cb",
    2017: "b61ec811-2628-4c74-9391-4f7c6429719b",
    2016: "acbdaf5e-50fe-490d-9f6c-c92995d8c709",
    2015: "7e87a5f4-2e9b-42c3-a9bf-6872fbec36ea",
    2014: "55b05288-8854-4e3b-8e0b-0e815a2642b7",
}


async def _fetch_year(
    session: httpx.AsyncClient,
    annee: int,
    resource_id: str,
    code_commune: str,
) -> dict | None:
    """Fetch DVF data for one year and one commune via Tabular API."""
    try:
        data = await tabular_api_client.fetch_resource_data(
            resource_id,
            page=1,
            page_size=1,
            params={"INSEE_COM__exact": code_commune},
            session=session,
        )
        rows = data.get("data", [])
        if not rows:
            return None
        row = rows[0]
        prix = row.get("Prixm2Moyen")
        nb = row.get("nb_mutations")
        if prix is None:
            return None
        return {
            "annee": annee,
            "prix_m2": round(float(prix)),
            "nb_mutations": int(nb) if nb is not None else None,
        }
    except Exception:  # noqa: BLE001
        logger.debug(f"No DVF data for {code_commune} in {annee}", exc_info=True)
        return None


def register_get_dvf_historique_commune_tool(mcp: FastMCP) -> None:
    @mcp.tool()
    async def get_dvf_historique_commune(code_commune: str) -> str:
        """
        Get historical real estate price data (price per m²) for a French commune
        over the period 2014–2024, from the DVF (Demandes de Valeurs Foncières) dataset.

        Queries 11 annual CSV files in parallel from data.gouv.fr Tabular API.
        Returns a time series of average price per m² (all transactions combined)
        and number of mutations per year.

        Data source: data.gouv.fr — "Indicateurs Immobiliers par commune et par année
        (prix et volumes sur la période 2014-2024)" (dataset 63dd1cc420bf925d5d1d8b1e).

        Parameters:
            code_commune: INSEE commune code (5 characters, e.g. "34172" for Montpellier)
        """
        code_commune = code_commune.strip()
        if not code_commune:
            return "❌ Error: code_commune cannot be empty."

        logger.info(f"Fetching DVF historique for commune {code_commune} (2014-2024)")

        async with httpx.AsyncClient(timeout=20.0) as session:
            tasks = [
                _fetch_year(session, annee, resource_id, code_commune)
                for annee, resource_id in sorted(_DVF_RESOURCES.items())
            ]
            results = await asyncio.gather(*tasks)

        serie = sorted(
            [r for r in results if r is not None],
            key=lambda x: x["annee"],
        )

        if not serie:
            return (
                f"Aucune donnée DVF historique trouvée pour le code commune {code_commune}.\n"
                "La commune peut être trop petite (pas assez de transactions enregistrées) "
                "ou le code INSEE est incorrect."
            )

        lines = [
            f"DVF — Historique prix m² — {code_commune} (2014-2024)",
            f"Source : data.gouv.fr — DVF agrégé par commune",
            f"Années avec données : {len(serie)}/11",
            "",
            "annee | prix_m2_moyen | nb_mutations",
        ]
        for pt in serie:
            nb_str = str(pt["nb_mutations"]) if pt["nb_mutations"] is not None else "n/a"
            lines.append(f"{pt['annee']}  |  {pt['prix_m2']} €/m²  |  {nb_str}")

        lines.extend([
            "",
            "JSON (à copier dans historique_prix) :",
            json.dumps(serie, ensure_ascii=False),
        ])

        return "\n".join(lines)
