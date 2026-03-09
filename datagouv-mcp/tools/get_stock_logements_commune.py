import io
import json
import logging
import re
import zipfile

import httpx
from mcp.server.fastmcp import FastMCP

from helpers import cache_manager

logger = logging.getLogger("datagouv_mcp")

# INSEE — Base communale Logements 2021 (géographie au 01/01/2024)
# Contient ~35 000 communes, colonnes P21_MAISON, P21_APPART, P21_LOG, etc.
_CACHE_KEY = "insee_base_cc_logement_2021"
_INSEE_ZIP_URL = (
    "https://www.insee.fr/fr/statistiques/fichier/8202349/base-cc-logement-2021_csv.zip"
)


def _safe_code(code: str) -> str:
    """Sanitize commune code to prevent SQL injection (5 alphanumeric chars max)."""
    return re.sub(r"[^A-Za-z0-9]", "", code)[:10]


def register_get_stock_logements_commune_tool(mcp: FastMCP) -> None:
    @mcp.tool()
    async def get_stock_logements_commune(code_commune: str) -> str:
        """
        Get housing stock by type (houses vs apartments) for a French commune.

        Returns the number of houses, apartments, primary/secondary/vacant residences,
        and owner vs renter breakdown.

        Source: INSEE — Base communale Logements 2021 (géographie 2024).
        Coverage: ~35,000 communes (France hors Mayotte + arrondissements municipaux).

        On first call, downloads and caches the full national dataset (~39 MB compressed).
        All subsequent calls are instant (SQLite lookup, <50 ms).

        Parameters:
            code_commune: INSEE commune code (5 characters, e.g. "34172" for Montpellier,
                          "75056" for Paris, "01001" for Ambléon)
        """
        code_commune = code_commune.strip()
        if not code_commune:
            return "❌ Error: code_commune ne peut pas être vide."

        logger.info(f"Fetching stock logements for commune {code_commune}")

        # --- Download & cache on first call ---
        if not cache_manager.is_cached(_CACHE_KEY):
            logger.info("Cache absent — téléchargement de la base INSEE logements 2021...")
            try:
                async with httpx.AsyncClient(timeout=180.0, follow_redirects=True) as client:
                    resp = await client.get(_INSEE_ZIP_URL)
                    resp.raise_for_status()
                    zip_bytes = resp.content
            except httpx.TimeoutException:
                return (
                    "❌ Timeout lors du téléchargement de la base logements INSEE (180 s). "
                    "Réessayez dans quelques instants."
                )
            except Exception as e:  # noqa: BLE001
                logger.exception("Error downloading INSEE logements ZIP")
                return f"❌ Erreur lors du téléchargement : {e}"

            # Extract CSV from ZIP — pick the largest CSV (= fichier communes)
            try:
                with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
                    csv_entries = [
                        (name, zf.getinfo(name).file_size)
                        for name in zf.namelist()
                        if name.lower().endswith(".csv")
                    ]
                    if not csv_entries:
                        return "❌ Aucun fichier CSV trouvé dans l'archive INSEE."
                    # Largest CSV = fichier communes (pas arrondissements)
                    csv_name = max(csv_entries, key=lambda x: x[1])[0]
                    csv_bytes = zf.read(csv_name)
                    logger.info(
                        f"Extracted '{csv_name}' ({len(csv_bytes) / 1024 / 1024:.1f} MB)"
                    )
            except Exception as e:  # noqa: BLE001
                logger.exception("Error extracting ZIP")
                return f"❌ Erreur lors de l'extraction du ZIP : {e}"

            # Ingest into SQLite cache
            try:
                result = cache_manager.ingest_csv_to_cache(
                    resource_id=_CACHE_KEY,
                    content=csv_bytes,
                    is_gzipped=False,
                    resource_url=_INSEE_ZIP_URL,
                    resource_title="INSEE Base communale Logements 2021",
                )
                logger.info(
                    f"Indexé {result['row_count']:,} communes — "
                    f"colonnes: {result['columns'][:8]}"
                )
            except Exception as e:  # noqa: BLE001
                logger.exception("Error ingesting logements CSV to cache")
                return f"❌ Erreur lors de l'indexation en cache : {e}"

        # --- Query by commune code ---
        safe_code = _safe_code(code_commune)
        try:
            # CODGEO is the standard INSEE commune identifier (5-char string)
            rows = cache_manager.run_query(
                _CACHE_KEY,
                f"SELECT * FROM data WHERE CODGEO = '{safe_code}' LIMIT 1",
            )
            # Fallback: some exports use CODCOM
            if not rows:
                rows = cache_manager.run_query(
                    _CACHE_KEY,
                    f"SELECT * FROM data WHERE CODCOM = '{safe_code}' LIMIT 1",
                )
        except FileNotFoundError:
            return "❌ Cache introuvable après initialisation — relancez la requête."
        except Exception as e:  # noqa: BLE001
            logger.exception(f"Error querying logements cache for {code_commune}")
            return f"❌ Erreur lors de la requête : {e}"

        if not rows:
            return (
                f"Aucune donnée de stock de logements trouvée pour la commune {code_commune}.\n"
                "Vérifiez que le code INSEE est correct (5 caractères avec zéros, ex: '01001').\n"
                "Note : Paris (75056), Lyon (69123) et Marseille (13055) ont des données globales."
            )

        row = rows[0]
        nom = row.get("LIBGEO") or row.get("LIBCOM") or code_commune

        def _int(col: str) -> int | None:
            v = row.get(col)
            if v is None or str(v).strip() == "":
                return None
            try:
                return int(float(v))
            except (ValueError, TypeError):
                return None

        def _get(suffix: str) -> int | None:
            """Try year prefixes P21_, P22_, P20_, P19_ then no prefix."""
            for prefix in ("P21_", "P22_", "P20_", "P19_", "P_"):
                v = _int(f"{prefix}{suffix}")
                if v is not None:
                    return v
            return None

        total = _get("LOG")
        maisons = _get("MAISON")
        apparts = _get("APPART")
        rp = _get("RP")
        rsecocc = _get("RSECOCC")
        vacants = _get("LOGVAC")
        proprietaires = _get("RP_PROP")
        locataires = _get("RP_LOC")
        hlm = _get("RP_LOCHLMV")

        def _fmt(v: int | None) -> str:
            return f"{v:,}".replace(",", "\u202f") if v is not None else "–"

        def _pct(num: int | None, den: int | None) -> str:
            if num is None or den is None or den == 0:
                return ""
            return f" ({num * 100 / den:.1f} %)"

        lines = [
            f"Stock de logements — {nom} ({code_commune})",
            "Source : INSEE — Base communale Logements 2021 (géographie 01/01/2024)",
            "",
            f"Total logements          : {_fmt(total)}",
            f"  ↳ Maisons              : {_fmt(maisons)}{_pct(maisons, total)}",
            f"  ↳ Appartements         : {_fmt(apparts)}{_pct(apparts, total)}",
            "",
            f"Résidences principales   : {_fmt(rp)}{_pct(rp, total)}",
            f"  ↳ Propriétaires        : {_fmt(proprietaires)}{_pct(proprietaires, rp)}",
            f"  ↳ Locataires (total)   : {_fmt(locataires)}{_pct(locataires, rp)}",
            f"  ↳ dont HLM             : {_fmt(hlm)}{_pct(hlm, locataires)}",
            f"Résidences secondaires   : {_fmt(rsecocc)}{_pct(rsecocc, total)}",
            f"Logements vacants        : {_fmt(vacants)}{_pct(vacants, total)}",
        ]

        data_out = {
            "code_commune": code_commune,
            "nom": nom,
            "total_logements": total,
            "maisons": maisons,
            "appartements": apparts,
            "residences_principales": rp,
            "residences_secondaires": rsecocc,
            "logements_vacants": vacants,
            "proprietaires": proprietaires,
            "locataires": locataires,
            "locataires_hlm": hlm,
        }
        lines += ["", "JSON :", json.dumps(data_out, ensure_ascii=False)]
        return "\n".join(lines)
