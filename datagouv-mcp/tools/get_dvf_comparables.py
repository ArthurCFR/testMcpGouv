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
        adresse_rue: str | None = None,
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
            adresse_rue: Optional street name (e.g. "RUE DE LA PAIX"). When provided,
                         any matching transaction from 2024+ on this same street is
                         GUARANTEED to appear in results, even beyond max_results.
                         This ensures hyper-local recent comparables are never missed.
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
        except Exception as tabular_err:  # noqa: BLE001
            is_404 = isinstance(tabular_err, tabular_api_client.ResourceNotAvailableError)
            if is_404:
                logger.info(
                    "Tabular API 404 for dept %s, falling back to SQLite cache", dept
                )
            else:
                logger.warning(
                    "Tabular API error for dept %s (%s), falling back to SQLite cache",
                    dept, tabular_err,
                )
            try:
                await _ensure_dept_cached(resource_id)
                all_rows, _ = _fetch_rows_from_cache(resource_id, code_commune)
            except Exception as cache_err:  # noqa: BLE001
                logger.exception("Cache fallback failed for dept %s", dept)
                reason = "Tabular API 404" if is_404 else f"Tabular API : {tabular_err}"
                return f"❌ Données DVF indisponibles pour le département {dept} ({reason}, cache échoué : {cache_err})"

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
            if str(row.get("type_local") or "").strip().lower() != type_local_norm.lower():
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

            date_str = str(row.get("date_mutation") or "").strip()
            if date_min and date_str and date_str < date_min:
                continue
            matching.append({
                "date_mutation": date_str,
                "adresse": str(row.get("adresse_numero") or "").strip()
                + " "
                + str(row.get("adresse_nom_voie") or "").strip(),
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

        # --- Compute aggregate stats on ALL matching transactions (post-IQR) ---
        all_prices = sorted(t["prix_m2"] for t in matching)
        n_all = len(all_prices)
        stats_prix_m2 = {
            "nb_transactions": n_all,
            "min": all_prices[0],
            "max": all_prices[-1],
            "mediane": all_prices[n_all // 2] if n_all % 2 == 1 else round((all_prices[n_all // 2 - 1] + all_prices[n_all // 2]) / 2),
            "q1": all_prices[n_all // 4],
            "q3": all_prices[(3 * n_all) // 4],
        }
        stats_prix_m2["fourchette_marche"] = f"{stats_prix_m2['q1']} – {stats_prix_m2['q3']} €/m²"

        # --- Flag remaining soft outliers (post-IQR) ---
        # After hard IQR exclusion, flag transactions that are still notably
        # off-market using a tighter band (Q1 − 0.5·IQR / Q3 + 0.5·IQR).
        # These passed the 1.5·IQR filter but remain suspicious.
        nb_flagged = 0
        if len(matching) >= 4:
            flag_prices = sorted(t["prix_m2"] for t in matching)
            fn = len(flag_prices)
            fq1 = flag_prices[fn // 4]
            fq3 = flag_prices[(3 * fn) // 4]
            fiqr = fq3 - fq1
            if fiqr > 0:
                soft_lower = fq1 - 0.5 * fiqr
                soft_upper = fq3 + 0.5 * fiqr
                for t in matching:
                    if t["prix_m2"] < soft_lower:
                        t["outlier"] = "low"
                        nb_flagged += 1
                    elif t["prix_m2"] > soft_upper:
                        t["outlier"] = "high"
                        nb_flagged += 1

        # --- Sort by date descending, take top N ---
        matching.sort(key=lambda x: x["date_mutation"], reverse=True)
        nb_matching = len(matching)
        dates = [t["date_mutation"] for t in matching if t["date_mutation"]]
        date_derniere = dates[0] if dates else "inconnue"
        date_premiere = dates[-1] if dates else "inconnue"

        # --- Force same-street 2024+ transactions into results ---
        # When adresse_rue is provided, any 2024+ transaction on that street
        # is guaranteed to appear, even if max_results would cut it.
        rue_norm = (adresse_rue or "").strip().upper()
        same_street_forced = []
        rest = []
        if rue_norm:
            for t in matching:
                t_rue = t["adresse"].upper()
                # Match street name (ignore house number at start)
                if rue_norm in t_rue and t["date_mutation"] >= "2024-01-01":
                    t["same_street"] = True
                    same_street_forced.append(t)
                else:
                    rest.append(t)
            # Fill remaining slots with non-forced transactions
            remaining_slots = max(max_results - len(same_street_forced), 0)
            top = same_street_forced + rest[:remaining_slots]
            # Re-sort the combined list by date
            top.sort(key=lambda x: x["date_mutation"], reverse=True)
        else:
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
            "",
            f"📊 Statistiques de prix (sur les {nb_matching} transactions filtrées) :",
            f"   Médiane : {stats_prix_m2['mediane']:,} €/m²".replace(",", " "),
            f"   Q1 (25e centile) : {stats_prix_m2['q1']:,} €/m²".replace(",", " "),
            f"   Q3 (75e centile) : {stats_prix_m2['q3']:,} €/m²".replace(",", " "),
            f"   Fourchette de marché (Q1–Q3) : {stats_prix_m2['fourchette_marche']}",
            f"   Min : {stats_prix_m2['min']:,} €/m²  |  Max : {stats_prix_m2['max']:,} €/m²".replace(",", " "),
            "",
            f"Résultats affichés : {len(top)} (les plus récents)"
            + (f" (dont {len(same_street_forced)} même rue 2024+)" if same_street_forced else "")
            + (f" (dont {sum(1 for t in top if 'outlier' in t)} prix atypiques signalés)" if nb_flagged > 0 else ""),
            "",
            f"{'Date':<12} {'Surface':>9} {'Prix total':>12} {'Prix m²':>10}  Adresse",
            "-" * 80,
        ]

        _OUTLIER_LABELS = {
            "low": "  ⚠️ prix atypique bas — bien probablement dégradé ou vente atypique",
            "high": "  ⚠️ prix atypique haut — bien premium ou transaction exceptionnelle",
        }
        for t in top:
            prix_tot = f"{t['prix_total']:,} €".replace(",", " ")
            prix_m2 = f"{t['prix_m2']:,} €/m²".replace(",", " ")
            surface_str = f"{t['surface_m2']} m²"
            adresse = t["adresse"].strip()[:35]
            line = f"{t['date_mutation']:<12} {surface_str:>9} {prix_tot:>12} {prix_m2:>10}  {adresse}"
            if t.get("same_street"):
                line += "  📍 même rue"
            if "outlier" in t:
                line += _OUTLIER_LABELS[t["outlier"]]
            lines.append(line)

        lines += [
            "",
            "JSON :",
            json.dumps(
                {
                    "nb_transactions_matching": nb_matching,
                    "nb_iqr_excluded": nb_iqr_excluded,
                    "nb_outliers_flagged": nb_flagged,
                    "date_premiere_vente": date_premiere,
                    "date_derniere_vente": date_derniere,
                    "periode_couverte": f"{date_premiere} → {date_derniere} (sources: 2014–2022 DVF dépt + 2023–2025-S1 DVF national)",
                    "stats_prix_m2": stats_prix_m2,
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
