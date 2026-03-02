import logging

import httpx
from mcp.server.fastmcp import FastMCP

logger = logging.getLogger("datagouv_mcp")

_CAISSE_DEPOTS_API = (
    "https://opendata.caissedesdepots.fr/api/explore/v2.1/catalog/datasets"
    "/logements-sociaux-dans-les-communes/records"
)


def register_get_logements_sociaux_commune_tool(mcp: FastMCP) -> None:
    @mcp.tool()
    async def get_logements_sociaux_commune(code_commune: str) -> str:
        """
        Get the social housing rate (taux de logements sociaux SRU) for a specific
        French commune from the Caisse des Dépôts open data API.

        Uses a filtered API call — returns data in under 1 second.
        Data source: opendata.caissedesdepots.fr (last update: August 2024).
        Coverage: 35 228 French communes.

        Parameters:
            code_commune: INSEE commune code (5 characters, e.g. "34172" for Montpellier)
        """
        code_commune = code_commune.strip()
        if not code_commune:
            return "❌ Error: code_commune cannot be empty."

        params = {
            "where": f'code_commune="{code_commune}"',
            "limit": 1,
            "select": "code_commune,nom_commune,taux_de_logements_sociaux,departement,region",
        }

        logger.info(
            f"Fetching logements sociaux for commune {code_commune} "
            f"from Caisse des Dépôts API"
        )

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(_CAISSE_DEPOTS_API, params=params)
                response.raise_for_status()
                data = response.json()

            total = data.get("total_count", 0)
            if total == 0:
                return (
                    f"Aucune donnée de logements sociaux trouvée pour le code commune {code_commune}.\n"
                    f"Vérifiez que le code INSEE est correct (5 chiffres)."
                )

            record = data["results"][0]
            nom = record.get("nom_commune", code_commune)
            taux = record.get("taux_de_logements_sociaux")
            departement = record.get("departement", "")
            region = record.get("region", "")

            if taux is None:
                taux_str = "non disponible"
            else:
                taux_str = f"{taux:.1f}%"

            lines = [
                f"Logements sociaux (SRU) — {nom} ({code_commune})",
                f"Département : {departement}",
                f"Région : {region}",
                f"Taux de logements sociaux : {taux_str}",
                f"Source : Caisse des Dépôts (données août 2024)",
                f"Note : Le seuil légal SRU est de 25 % pour les communes de plus de 3 500 habitants.",
            ]
            return "\n".join(lines)

        except httpx.TimeoutException:
            logger.warning(f"Timeout fetching logements sociaux for {code_commune}")
            return f"⏱️ Timeout lors de la requête Caisse des Dépôts pour {code_commune}."
        except httpx.HTTPStatusError as e:
            logger.error(
                f"HTTP error fetching logements sociaux for {code_commune}: {e.response.status_code}"
            )
            return f"❌ Erreur HTTP {e.response.status_code} lors de la requête Caisse des Dépôts."
        except Exception as e:  # noqa: BLE001
            logger.exception(f"Unexpected error fetching logements sociaux for {code_commune}")
            return f"❌ Erreur inattendue : {e}"
