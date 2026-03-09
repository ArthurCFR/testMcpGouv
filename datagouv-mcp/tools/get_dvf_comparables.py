import json
import logging

import httpx
from mcp.server.fastmcp import FastMCP

from helpers import tabular_api_client
from tools.dvf_national_cache import ensure_national_dvf_cached, fetch_national_rows_for_commune
from tools.get_dvf_par_rue import (
    _ALSACE_MOSELLE,
    _DVF_DEP_RESOURCES,
    _dept_from_commune,
    _ensure_dept_cached,
    _fetch_all_rows,
    _fetch_rows_from_cache,
)

logger = logging.getLogger("datagouv_mcp")

_VALID_TYPES = {"maison", "appartement"}


def register_get_dvf_comparables_tool(mcp: FastMCP) -> None:
    @mcp.tool()
    async def get_dvf_comparables(
        code_commune: str,
        type_local: str,
        surface_cible: float,
        surface_tolerance_pct: float = 20.0,
        max_results: int = 10,
        date_min: str | None = None,
    ) -> str:
        """
        Get individual DVF real estate transactions for a commune, filtered by property type
        and surface area, sorted by most recent date. Returns comparable sales with full context:
        total matching transactions, date range covered, and date of most recent sale.

        Data sources:
        - DVF par département (2014–2022) via Tabular API or SQLite cache
        - DVF national DGFiP (2023, 2024, 2025-S1) via per-commune SQLite cache (downloaded on
          first call, ~60-70 MB per year — first call may take 20-30s per missing year)

        NOT available for Alsace-Moselle (57, 67, 68).

        Parameters:
            code_commune: INSEE commune code (5 characters, e.g. "34172" for Montpellier)
            type_local: Property type — "Maison" or "Appartement" (case-insensitive)
            surface_cible: Target surface area in m²
            surface_tolerance_pct: ±% tolerance around surface_cible (default: 20 → ±20%)
            max_results: Number of most recent transactions to return (default: 10)
            date_min: Optional ISO date string (e.g. "2020-01-01") to exclude transactions
                      before this date. Use to focus on recent comparable sales only and
                      avoid diluting the analysis with pre-Covid or very old data.
        """
        code_commune = code_commune.strip()
        if not code_commune:
            return "❌ Error: code_commune cannot be empty."

        type_local_norm = type_local.strip().capitalize()
        if type_local_norm.lower() not in _VALID_TYPES:
            return (
                f"❌ type_local invalide : '{type_local}'. "
                "Valeurs acceptées : 'Maison' ou 'Appartement'."
            )

        if surface_cible <= 0:
            return "❌ surface_cible doit être > 0."

        dept = _dept_from_commune(code_commune)

        if dept in _ALSACE_MOSELLE:
            dept_names = {"57": "Moselle", "67": "Bas-Rhin", "68": "Haut-Rhin"}
            return (
                f"⚠️  Le département {dept} ({dept_names.get(dept, '')}) fait partie de l'Alsace-Moselle.\n"
                "Le régime juridique local exclut ces départements du dispositif DVF.\n"
                "Aucune donnée de transactions immobilières n'est disponible."
            )

        resource_id = _DVF_DEP_RESOURCES.get(dept)
        if not resource_id:
            return (
                f"❌ Département '{dept}' non trouvé dans la base DVF.\n"
                "Note : DOM/TOM non inclus dans ce dataset."
            )

        logger.info(
            "get_dvf_comparables: commune=%s, type=%s, surface=%.0fm² ±%.0f%% date_min=%s",
            code_commune, type_local_norm, surface_cible, surface_tolerance_pct, date_min,
        )

        try:
            async with httpx.AsyncClient(timeout=30.0) as session:
                all_rows, _ = await _fetch_all_rows(resource_id, code_commune, session)
        except tabular_api_client.ResourceNotAvailableError:
            logger.info(
                "Tabular API unavailable for dept %s, falling back to SQLite cache", dept
            )
            try:
                await _ensure_dept_cached(resource_id)
                all_rows, _ = _fetch_rows_from_cache(resource_id, code_commune)
            except Exception as e:  # noqa: BLE001
                logger.exception("Cache fallback failed for dept %s", dept)
                return f"❌ Données DVF indisponibles pour le département {dept} (Tabular API 404, cache échoué : {e})"
        except Exception as e:  # noqa: BLE001
            logger.exception("Error fetching DVF comparables for %s", code_commune)
            return f"❌ Erreur lors de la récupération des données : {e}"

        # --- Fetch 2023+ from national DGFiP files ---
        try:
            await ensure_national_dvf_cached(code_commune)
            national_rows = fetch_national_rows_for_commune(code_commune)
            if national_rows:
                all_rows = all_rows + national_rows
                logger.info(
                    "get_dvf_comparables: +%d rows from national DVF (2023+) for %s",
                    len(national_rows), code_commune,
                )
        except Exception:
            logger.exception("get_dvf_comparables: national DVF fetch failed for %s", code_commune)
            # Non-fatal — continue with 2014–2022 data only

        if not all_rows:
            return (
                f"Aucune transaction trouvée pour la commune {code_commune} "
                f"(département {dept.upper()}).\n"
                "La commune peut être trop petite ou le code INSEE est incorrect."
            )

        # --- Filter ---
        surface_min = surface_cible * (1 - surface_tolerance_pct / 100)
        surface_max = surface_cible * (1 + surface_tolerance_pct / 100)

        matching = []
        for row in all_rows:
            if row.get("logement") not in ("True", True, "true", 1, "1"):
                continue
            if (row.get("type_local") or "").strip().lower() != type_local_norm.lower():
                continue
            try:
                surface = float(row.get("surface_reelle_bati") or 0)
                valeur = float(row.get("valeur_fonciere") or 0)
            except (ValueError, TypeError):
                continue
            if surface <= 0 or valeur <= 0:
                continue
            if not (surface_min <= surface <= surface_max):
                continue

            date_str = (row.get("date_mutation") or "").strip()
            if date_min and date_str and date_str < date_min:
                continue
            matching.append({
                "date_mutation": date_str,
                "adresse": (row.get("adresse_numero") or "").strip()
                + " "
                + (row.get("adresse_nom_voie") or "").strip(),
                "surface_m2": round(surface, 1),
                "prix_total": round(valeur),
                "prix_m2": round(valeur / surface),
            })

        if not matching:
            return (
                f"Aucune transaction {type_local_norm} entre {surface_min:.0f} m² et {surface_max:.0f} m² "
                f"trouvée pour la commune {code_commune}.\n"
                f"({len(all_rows)} transactions brutes analysées, 0 correspondance.)\n"
                f"Essayez d'augmenter surface_tolerance_pct (ex: 30) ou de vérifier le type_local."
            )

        # --- IQR outlier removal on prix_m2 ---
        # Removes atypical sales (social housing, forced sales, errors) that would
        # distort the market reference. Only applied when ≥4 transactions to keep
        # enough data to compute meaningful quartiles.
        nb_before_iqr = len(matching)
        nb_iqr_excluded = 0
        if len(matching) >= 4:
            prices = sorted(t["prix_m2"] for t in matching)
            n = len(prices)
            q1 = prices[n // 4]
            q3 = prices[(3 * n) // 4]
            iqr = q3 - q1
            if iqr > 0:
                lower = q1 - 1.5 * iqr
                upper = q3 + 1.5 * iqr
                filtered = [t for t in matching if lower <= t["prix_m2"] <= upper]
                nb_iqr_excluded = nb_before_iqr - len(filtered)
                if nb_iqr_excluded > 0:
                    matching = filtered

        # --- Sort by date descending, take top N ---
        matching.sort(key=lambda x: x["date_mutation"], reverse=True)
        nb_matching = len(matching)
        dates = [t["date_mutation"] for t in matching if t["date_mutation"]]
        date_derniere = dates[0] if dates else "inconnue"
        date_premiere = dates[-1] if dates else "inconnue"
        top = matching[:max_results]

        # --- Format output ---
        periode_label = f"{date_min} → 2025" if date_min else "2014–2025"
        lines = [
            f"DVF — Comparables {type_local_norm} — commune {code_commune} ({periode_label})",
            f"Filtre surface : {surface_cible:.0f} m² ±{surface_tolerance_pct:.0f}% "
            f"→ [{surface_min:.0f} m² – {surface_max:.0f} m²]",
            f"Source : DVF par département 2014–2022 + DVF national 2023–2025-S1, data.gouv.fr",
            "",
            f"Transactions correspondant au filtre : {nb_matching}"
            + (f" ({nb_iqr_excluded} atypiques exclues par IQR)" if nb_iqr_excluded > 0 else ""),
            f"Période couverte : {date_premiere} → {date_derniere}",
            f"Dernière vente connue : {date_derniere}",
            f"Résultats affichés : {len(top)} (les plus récents)",
            "",
            f"{'Date':<12} {'Surface':>9} {'Prix total':>12} {'Prix m²':>10}  Adresse",
            "-" * 80,
        ]

        for t in top:
            prix_tot = f"{t['prix_total']:,} €".replace(",", " ")
            prix_m2 = f"{t['prix_m2']:,} €/m²".replace(",", " ")
            surface_str = f"{t['surface_m2']} m²"
            adresse = t["adresse"].strip()[:35]
            lines.append(
                f"{t['date_mutation']:<12} {surface_str:>9} {prix_tot:>12} {prix_m2:>10}  {adresse}"
            )

        lines += [
            "",
            "JSON :",
            json.dumps(
                {
                    "nb_transactions_matching": nb_matching,
                    "date_premiere_vente": date_premiere,
                    "date_derniere_vente": date_derniere,
                    "periode_couverte": f"{date_premiere} → {date_derniere} (sources: 2014–2022 DVF dépt + 2023–2025-S1 DVF national)",
                    "surface_filtre": {
                        "cible_m2": surface_cible,
                        "tolerance_pct": surface_tolerance_pct,
                        "min_m2": round(surface_min, 1),
                        "max_m2": round(surface_max, 1),
                    },
                    "transactions": top,
                },
                ensure_ascii=False,
            ),
        ]

        return "\n".join(lines)
