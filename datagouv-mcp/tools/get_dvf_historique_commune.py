import asyncio
import json
import logging
from collections import defaultdict

import httpx
from mcp.server.fastmcp import FastMCP

from helpers import tabular_api_client
from tools.get_dvf_par_rue import (
    _DVF_DEP_RESOURCES,
    _dept_from_commune,
    _ensure_dept_cached,
    _fetch_all_rows,
    _fetch_rows_from_cache,
)

logger = logging.getLogger("datagouv_mcp")

# Annual commune-level aggregates (dataset 63dd1cc420bf925d5d1d8b1e).
# Only 2022-2024 are still indexed by the Tabular API (older files return 404).
# 2014-2022 is covered by the departmental fallback below.
_DVF_ANNUAL_RESOURCES: dict[int, str] = {
    2024: "1b85be7c-17ce-42dc-b191-3b8f3c469087",
    2023: "d7881695-1cb5-44c1-900c-00c7158ab766",
    2022: "0350f9a1-04ba-4eb1-9637-d642c9d367d7",
}


async def _fetch_year_from_annual(
    session: httpx.AsyncClient,
    annee: int,
    resource_id: str,
    code_commune: str,
) -> dict | None:
    """Fetch pre-aggregated DVF stats for one year from the annual commune file."""
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
        logger.debug(f"No DVF annual data for {code_commune} in {annee}", exc_info=True)
        return None


async def _fetch_history_from_dept(code_commune: str) -> list[dict]:
    """
    Fetch per-year price stats from the departmental DVF file (covers 2014–2022).
    Computes average price/m² from individual transactions, grouped by year.
    """
    dept = _dept_from_commune(code_commune)
    resource_id = _DVF_DEP_RESOURCES.get(dept)
    if not resource_id:
        return []

    try:
        async with httpx.AsyncClient(timeout=30.0) as session:
            all_rows, _ = await _fetch_all_rows(resource_id, code_commune, session)
    except tabular_api_client.ResourceNotAvailableError:
        logger.info(
            "Tabular API unavailable for dept DVF historique %s, trying cache", code_commune
        )
        try:
            await _ensure_dept_cached(resource_id)
            all_rows, _ = _fetch_rows_from_cache(resource_id, code_commune)
        except Exception:  # noqa: BLE001
            logger.debug(f"Cache fallback also failed for {code_commune}", exc_info=True)
            return []
    except Exception:  # noqa: BLE001
        logger.debug(f"Could not fetch dept DVF for {code_commune}", exc_info=True)
        return []

    by_year: dict[str, list[float]] = defaultdict(list)
    for row in all_rows:
        if row.get("logement") not in ("True", True, "true", 1, "1"):
            continue
        try:
            surface = float(row.get("surface_reelle_bati") or 0)
            valeur = float(row.get("valeur_fonciere") or 0)
        except (ValueError, TypeError):
            continue
        if surface <= 0 or valeur <= 0:
            continue
        year = row.get("annee")
        if year:
            by_year[str(year)].append(valeur / surface)

    result = []
    for year_str, prices in sorted(by_year.items()):
        try:
            result.append({
                "annee": int(year_str),
                "prix_m2": round(sum(prices) / len(prices)),
                "nb_mutations": len(prices),
            })
        except (ValueError, ZeroDivisionError):
            continue
    return result


def register_get_dvf_historique_commune_tool(mcp: FastMCP) -> None:
    @mcp.tool()
    async def get_dvf_historique_commune(code_commune: str) -> str:
        """
        Get historical real estate price data (price per m²) for a French commune
        over the period 2014–2024, from the DVF (Demandes de Valeurs Foncières) dataset.

        Uses two complementary sources:
        - 2014–2022: departmental DVF compilation (individual transactions grouped by year,
          fetched via Tabular API — same source as get_dvf_par_rue)
        - 2023–2024: annual commune-level aggregates (Tabular API, pre-computed)

        Returns a time series of average price per m² and number of mutations per year.

        Parameters:
            code_commune: INSEE commune code (5 characters, e.g. "34172" for Montpellier)
        """
        code_commune = code_commune.strip()
        if not code_commune:
            return "❌ Error: code_commune cannot be empty."

        # Paris arrondissements (75101–75120) are NOT in the annual commune files.
        if code_commune.startswith("75") and len(code_commune) == 5 and code_commune[2:].isdigit():
            arr_num = int(code_commune[2:])
            if 101 <= arr_num <= 120:
                return (
                    f"⚠️  Les arrondissements parisiens (75101–75120) ne sont PAS disponibles "
                    f"dans les fichiers DVF annuels par commune.\n\n"
                    f"Options disponibles :\n"
                    f"1. Série temporelle pour PARIS entier → utilise code_commune='75056'\n"
                    f"2. Prix médians cumulés (2014–2024) par arrondissement → "
                    f"query_cache('851d342f-9c96-41c1-924a-11a7a7aae8a6', "
                    f"\"SELECT code_geo, libelle_geo, med_prix_m2_whole_appartement, "
                    f"med_prix_m2_whole_maison FROM data WHERE echelle_geo='arrondissement' "
                    f"AND code_parent='75056' ORDER BY med_prix_m2_whole_appartement DESC\")\n\n"
                    f"Note : les données DVF annuelles par arrondissement n'existent pas "
                    f"sous forme de fichier CSV simple sur data.gouv.fr."
                )

        logger.info(f"Fetching DVF historique for commune {code_commune} (2014-2024)")

        # Fetch 2023-2024 from annual commune files (fast, pre-aggregated) in parallel
        # with the departmental fetch (2014-2022) via asyncio.gather
        async def _fetch_annual() -> list[dict]:
            async with httpx.AsyncClient(timeout=20.0) as session:
                tasks = [
                    _fetch_year_from_annual(session, annee, resource_id, code_commune)
                    for annee, resource_id in _DVF_ANNUAL_RESOURCES.items()
                ]
                results = await asyncio.gather(*tasks)
            return [r for r in results if r is not None]

        annual_list, dept_list = await asyncio.gather(
            _fetch_annual(),
            _fetch_history_from_dept(code_commune),
        )

        # Merge: annual files take precedence for overlapping years (better aggregation)
        by_year: dict[int, dict] = {r["annee"]: r for r in dept_list}
        for r in annual_list:
            by_year[r["annee"]] = r

        serie = sorted(by_year.values(), key=lambda x: x["annee"])

        if not serie:
            return (
                f"Aucune donnée DVF historique trouvée pour le code commune {code_commune}.\n"
                "La commune peut être trop petite (pas assez de transactions enregistrées) "
                "ou le code INSEE est incorrect."
            )

        lines = [
            f"DVF — Historique prix m² — {code_commune} (2014-2024)",
            f"Source : DVF par département (2014–2022) + agrégé par commune (2023–2024)",
            f"Années avec données : {len(serie)}",
            "",
            "annee | prix_m2_moyen | nb_mutations",
        ]
        for pt in serie:
            nb_str = str(pt["nb_mutations"]) if pt.get("nb_mutations") is not None else "n/a"
            lines.append(f"{pt['annee']}  |  {pt['prix_m2']} €/m²  |  {nb_str}")

        json_serie = [
            {"annee": p["annee"], "prix_m2": p["prix_m2"], "nb_mutations": p.get("nb_mutations")}
            for p in serie
        ]
        lines.extend([
            "",
            "JSON (à copier dans historique_prix) :",
            json.dumps(json_serie, ensure_ascii=False),
        ])

        return "\n".join(lines)
