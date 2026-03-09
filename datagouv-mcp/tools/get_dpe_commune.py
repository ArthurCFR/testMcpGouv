import asyncio
import json
import logging

import httpx
from mcp.server.fastmcp import FastMCP

logger = logging.getLogger("datagouv_mcp")

# ADEME — DPE Logements existants (depuis juillet 2021)
# 14M+ DPE, mise à jour quotidienne
_DPE_BASE_URL = "https://data.ademe.fr/data-fair/api/v1/datasets/dpe03existant"

_LABEL_ORDER = ["A", "B", "C", "D", "E", "F", "G"]

# Dans la base ADEME, les logements de Paris, Lyon et Marseille sont indexés
# sous leurs codes d'arrondissement (pas sous le code ville-centre).
# On génère la liste des codes d'arrondissement pour construire une query OR.
_ARRONDISSEMENTS: dict[str, list[str]] = {
    "75056": [f"751{i:02d}" for i in range(1, 21)],  # 75101-75120
    "69123": [f"6938{i}" for i in range(1, 10)],     # 69381-69389
    "13055": [f"132{i:02d}" for i in range(1, 17)],  # 13201-13216
}


async def _values_agg(
    session: httpx.AsyncClient, field: str, qs: str, agg_size: int = 10
) -> list[dict]:
    """Fetch value distribution from the ADEME DPE API."""
    resp = await session.get(
        f"{_DPE_BASE_URL}/values_agg",
        params={"field": field, "qs": qs, "agg_size": agg_size},
    )
    resp.raise_for_status()
    data = resp.json()
    return data.get("aggs", [])


async def _metric_agg(
    session: httpx.AsyncClient, metric: str, field: str, qs: str
) -> float | None:
    """Fetch a scalar metric (avg, min, max…) from the ADEME DPE API."""
    resp = await session.get(
        f"{_DPE_BASE_URL}/metric_agg",
        params={"metric": metric, "field": field, "qs": qs},
    )
    resp.raise_for_status()
    data = resp.json()
    return data.get(metric)


def register_get_dpe_commune_tool(mcp: FastMCP) -> None:
    @mcp.tool()
    async def get_dpe_commune(code_commune: str) -> str:
        """
        Get energy performance (DPE) statistics for a French commune's housing stock.

        Returns aggregate data from the ADEME DPE database (14M+ diagnostics,
        updated daily), covering all existing residential buildings diagnosed
        since July 2021:

        - Distribution of DPE labels (A → G), including share of "passoires thermiques" (F+G)
        - Distribution of GES labels (A → G)
        - Average energy consumption (kWh primary energy / m² / year)
        - Average GES emissions (kg CO₂ eq / m² / year)
        - Main heating energy types (gas, electricity, fuel oil…)
        - Building type breakdown (apartment vs house)

        Data source: ADEME — DPE Logements existants (depuis juillet 2021)
        API: data.ademe.fr/datasets/dpe03existant

        Parameters:
            code_commune: INSEE commune code (5 characters, e.g. "34172" for Montpellier,
                          "75056" for Paris, "69123" for Lyon)
        """
        code_commune = code_commune.strip()
        if not code_commune:
            return "❌ Erreur : code_commune ne peut pas être vide."

        # Pour Paris, Lyon, Marseille : les DPE sont indexés par arrondissement
        arr_codes = _ARRONDISSEMENTS.get(code_commune)
        if arr_codes:
            codes_quoted = " OR ".join(f'"{c}"' for c in arr_codes)
            qs = f"code_insee_ban:({codes_quoted})"
            logger.info(
                "Fetching DPE stats for %s via %d arrondissement codes",
                code_commune, len(arr_codes),
            )
        else:
            qs = f'code_insee_ban:"{code_commune}"'
            logger.info("Fetching DPE stats for commune %s", code_commune)

        try:
            async with httpx.AsyncClient(timeout=30.0) as session:
                (
                    dpe_labels,
                    ges_labels,
                    energie_chauffage,
                    type_batiment,
                    conso_avg,
                    ges_avg,
                ) = await asyncio.gather(
                    _values_agg(session, "etiquette_dpe", qs, agg_size=7),
                    _values_agg(session, "etiquette_ges", qs, agg_size=7),
                    _values_agg(session, "type_energie_principale_chauffage", qs, agg_size=6),
                    _values_agg(session, "type_batiment", qs, agg_size=5),
                    _metric_agg(session, "avg", "conso_5_usages_par_m2_ep", qs),
                    _metric_agg(session, "avg", "emission_ges_5_usages_par_m2", qs),
                )
        except httpx.HTTPStatusError as e:
            logger.exception(f"HTTP error fetching DPE for {code_commune}")
            return f"❌ Erreur API ADEME : {e.response.status_code} — {e.response.text[:200]}"
        except Exception as e:  # noqa: BLE001
            logger.exception(f"Error fetching DPE for {code_commune}")
            return f"❌ Erreur lors de la requête DPE : {e}"

        if not dpe_labels:
            return (
                f"Aucune donnée DPE trouvée pour la commune {code_commune}.\n"
                "Vérifiez que le code INSEE est correct (5 caractères, ex: '34172').\n"
                "Note : seuls les logements diagnostiqués depuis juillet 2021 sont couverts."
            )

        # --- Build label distributions ---
        # Data Fair uses "total" (not "count") as the count key in aggs
        def _count(agg: dict) -> int:
            return int(agg.get("total") or agg.get("count") or 0)

        total_dpe = sum(_count(a) for a in dpe_labels)

        def fmt_label_dist(aggs: list[dict], order: list[str]) -> list[dict]:
            by_label = {a["value"]: _count(a) for a in aggs}
            total = sum(by_label.values())
            result = []
            for lbl in order:
                count = by_label.get(lbl, 0)
                pct = round(count / total * 100, 1) if total else 0
                result.append({"label": lbl, "count": count, "pct": pct})
            return result

        dpe_dist = fmt_label_dist(dpe_labels, _LABEL_ORDER)
        ges_dist = fmt_label_dist(ges_labels, _LABEL_ORDER)

        passoires_count = sum(_count(a) for a in dpe_labels if a["value"] in ("F", "G"))
        passoires_pct = round(passoires_count / total_dpe * 100, 1) if total_dpe else 0

        energie_dist = [
            {"energie": a["value"], "count": _count(a),
             "pct": round(_count(a) / total_dpe * 100, 1) if total_dpe else 0}
            for a in sorted(energie_chauffage, key=lambda x: -_count(x))
        ]
        batiment_dist = [
            {"type": a["value"], "count": _count(a),
             "pct": round(_count(a) / total_dpe * 100, 1) if total_dpe else 0}
            for a in sorted(type_batiment, key=lambda x: -_count(x))
        ]

        # --- Text output ---
        lines = [
            f"DPE Logements — commune {code_commune}",
            f"Source : ADEME (logements existants, depuis juillet 2021)",
            f"Total DPE analysés : {total_dpe:,}",
            "",
            "── Étiquettes DPE (énergie) ──",
        ]
        for d in dpe_dist:
            bar = "█" * int(d["pct"] / 5)
            lines.append(f"  {d['label']} : {d['pct']:5.1f}%  {bar}  ({d['count']:,})")
        lines.append(
            f"\n  ⚠️  Passoires thermiques (F+G) : {passoires_pct}% ({passoires_count:,} logements)"
        )

        lines += ["", "── Étiquettes GES (émissions) ──"]
        for d in ges_dist:
            lines.append(f"  {d['label']} : {d['pct']:5.1f}%  ({d['count']:,})")

        if conso_avg is not None:
            lines.append(f"\n── Consommation moyenne : {conso_avg:.0f} kWhEP/m²/an ──")
        if ges_avg is not None:
            lines.append(f"── Émissions GES moyennes : {ges_avg:.1f} kgCO₂eq/m²/an ──")

        lines += ["", "── Énergie principale de chauffage ──"]
        for d in energie_dist:
            lines.append(f"  {d['energie']} : {d['pct']}%  ({d['count']:,})")

        lines += ["", "── Type de bâtiment ──"]
        for d in batiment_dist:
            lines.append(f"  {d['type']} : {d['pct']}%  ({d['count']:,})")

        # --- JSON payload ---
        result_json = {
            "code_commune": code_commune,
            "total_dpe": total_dpe,
            "passoires_thermiques_pct": passoires_pct,
            "conso_moyenne_kwhep_m2_an": round(conso_avg) if conso_avg is not None else None,
            "ges_moyen_kgco2_m2_an": round(ges_avg, 1) if ges_avg is not None else None,
            "etiquettes_dpe": dpe_dist,
            "etiquettes_ges": ges_dist,
            "energie_chauffage": energie_dist,
            "type_batiment": batiment_dist,
        }

        lines += [
            "",
            "JSON :",
            json.dumps(result_json, ensure_ascii=False),
        ]

        return "\n".join(lines)
