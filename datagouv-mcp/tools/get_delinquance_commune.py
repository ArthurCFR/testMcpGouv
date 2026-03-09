import json
import logging

import httpx
from mcp.server.fastmcp import FastMCP

from helpers import tabular_api_client

logger = logging.getLogger("datagouv_mcp")

# COM - Base statistique communale de la délinquance (Ministère de l'Intérieur, géo 2025)
# Couvre 2016–2024, ~4,7M lignes, accessible via Tabular API.
_RESOURCE_ID = "6252a84c-6b9e-4415-a743-fc6a631877bb"

# Indicateurs pertinents dans un contexte immobilier uniquement.
# On exclut volontairement : homicides, tentatives d'homicide, violences physiques
# intrafamiliales/hors cadre familial, violences sexuelles, escroqueries — car ils
# reflètent des situations personnelles sans lien direct avec la valeur ou le cadre de vie
# d'un bien immobilier.
_INDICATEURS_IMMOBILIER: set[str] = {
    "Cambriolages de logement",
    "Destructions et dégradations volontaires",
    "Vols avec armes",
    "Vols violents sans arme",
    "Vols d'accessoires sur véhicules",
    "Vols dans les véhicules",
    "Vols de véhicule",
    "Trafic de stupéfiants",
}


def register_get_delinquance_commune_tool(mcp: FastMCP) -> None:
    @mcp.tool()
    async def get_delinquance_commune(code_commune: str, annee: int = 2024) -> str:
        """
        Get crime and delinquency statistics relevant to real estate for a French commune.

        Returns only indicators that directly affect quality of life and real estate value:
        - Cambriolages de logement (burglaries)
        - Destructions et dégradations volontaires (vandalism)
        - Vols avec armes / Vols violents sans arme (armed/unarmed robbery)
        - Vols de véhicule / dans les véhicules / d'accessoires (vehicle-related theft)
        - Trafic de stupéfiants (drug trafficking)

        Deliberately excludes personal violence (domestic, sexual) and fraud, which are
        not relevant to real estate valuation or neighbourhood safety perception.

        Data source: Ministère de l'Intérieur — Base statistique communale de la
        délinquance enregistrée par la police et la gendarmerie nationales.
        Coverage: all French communes, 2016–2024.

        Note: For small communes below the confidentiality threshold, the exact count
        is not published (est_diffuse = "ndiff"). An estimated average is provided
        instead via complement_info_nombre.

        Parameters:
            code_commune: INSEE commune code (5 characters, e.g. "34172" for Montpellier,
                          "75056" for Paris, "69123" for Lyon)
            annee: Year to query (2016–2024, default: 2024)
        """
        code_commune = code_commune.strip()
        if not code_commune:
            return "❌ Error: code_commune ne peut pas être vide."

        if not (2016 <= annee <= 2024):
            return "❌ Error: annee doit être entre 2016 et 2024."

        logger.info(f"Fetching délinquance for commune {code_commune}, année {annee}")

        try:
            async with httpx.AsyncClient(timeout=30.0) as session:
                data = await tabular_api_client.fetch_resource_data(
                    _RESOURCE_ID,
                    page=1,
                    page_size=200,
                    params={
                        "CODGEO_2025__exact": code_commune,
                        "annee__exact": str(annee),
                    },
                    session=session,
                )
        except tabular_api_client.ResourceNotAvailableError:
            return (
                "❌ La base communale de délinquance n'est pas disponible via l'API Tabular."
            )
        except Exception as e:  # noqa: BLE001
            logger.exception(f"Error fetching délinquance for {code_commune}")
            return f"❌ Erreur lors de la requête : {e}"

        rows = data.get("data", [])
        if not rows:
            return (
                f"Aucune donnée de délinquance trouvée pour la commune {code_commune} "
                f"en {annee}.\n"
                "Vérifiez que le code INSEE est correct (5 caractères, ex: '34172')."
            )

        # Filter to real-estate-relevant indicators only
        rows = [r for r in rows if r.get("indicateur") in _INDICATEURS_IMMOBILIER]

        if not rows:
            return (
                f"Aucun indicateur immobilier trouvé pour {code_commune} en {annee}. "
                "La commune est peut-être trop petite ou le code INSEE est incorrect."
            )

        lines = [
            f"Délinquance — commune {code_commune} — {annee}",
            "Source : Ministère de l'Intérieur — Base communale (police + gendarmerie)",
            "Périmètre : indicateurs pertinents pour l'immobilier uniquement",
            "",
        ]

        result_data = []
        for row in sorted(rows, key=lambda r: r.get("indicateur", "")):
            indicateur = row.get("indicateur", "")
            unite = row.get("unite_de_compte", "")
            nombre_raw = row.get("nombre")
            taux_raw = row.get("taux_pour_mille")
            est_diffuse = row.get("est_diffuse", "")
            complement = row.get("complement_info_nombre")

            # Données non diffusées (petite commune) → on utilise l'estimé
            if est_diffuse == "ndiff" or nombre_raw is None or str(nombre_raw).strip() == "":
                nombre_val = None
                try:
                    nombre_str = f"~{float(complement):.1f} (estimé)" if complement else "non diffusé"
                except (TypeError, ValueError):
                    nombre_str = "non diffusé"
                taux_str = "–"
            else:
                try:
                    nombre_val = int(float(str(nombre_raw)))
                    nombre_str = str(nombre_val)
                except (TypeError, ValueError):
                    nombre_val = None
                    nombre_str = str(nombre_raw)
                try:
                    taux_str = f"{float(taux_raw):.3f} ‰" if taux_raw else "–"
                except (TypeError, ValueError):
                    taux_str = "–"

            lines.append(f"• {indicateur} ({unite})")
            lines.append(f"    Nombre : {nombre_str}   |   Taux : {taux_str}")

            result_data.append({
                "indicateur": indicateur,
                "unite": unite,
                "nombre": nombre_val,
                "taux_pour_mille": round(float(taux_raw), 4) if taux_raw else None,
                "est_diffuse": est_diffuse,
            })

        lines += [
            "",
            "JSON :",
            json.dumps(
                {"code_commune": code_commune, "annee": annee, "indicateurs": result_data},
                ensure_ascii=False,
            ),
        ]

        return "\n".join(lines)
