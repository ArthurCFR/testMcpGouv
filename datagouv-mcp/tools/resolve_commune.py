import json
import logging
import re

import httpx
from mcp.server.fastmcp import FastMCP

logger = logging.getLogger("datagouv_mcp")

_GEO_API_URL = "https://geo.api.gouv.fr/communes"

# Department code patterns: 1-2 digits, or 2A/2B (Corse), or 97x (DOM)
_DEP_CODE_RE = re.compile(r"^(?:\d{1,2}|2[AB]|9[7-9]\d)$", re.IGNORECASE)


def register_resolve_commune_tool(mcp: FastMCP) -> None:
    @mcp.tool()
    async def resolve_commune(nom: str, departement: str = "") -> str:
        """
        Resolve a French commune name to its official INSEE code.

        ⚠️ MANDATORY PREREQUISITE — Call this tool FIRST, before any tool that
        requires a commune INSEE code (get_dpe_commune, get_dvf_historique_commune,
        get_delinquance_commune, get_pyramide_ages_commune, get_stock_logements_commune,
        get_logements_sociaux_commune, get_dvf_sections_commune, get_dvf_par_rue, etc.).

        NEVER guess, infer, or assume an INSEE code from your training data.
        ALWAYS use the code returned by this tool in the current conversation.

        Uses geo.api.gouv.fr — the official French government geocoding API.
        Handles approximate spellings, missing accents, and partial names.

        Homonym handling: if multiple communes share the same name (e.g. "Saint-Martin"
        exists in 30+ departments), ALL matches are returned. In that case you MUST
        ask the user to confirm which commune they mean before calling any data tool.

        Parameters:
            nom: Commune name. Approximate spelling accepted (e.g. "marcillac",
                 "saint etienne", "Aix"). Do not include the department here.
            departement: Optional department number or code to narrow results and
                         avoid homonyms. Examples: "12", "69", "2A", "971".
                         Use this whenever the user mentions a department or region,
                         or when a previous context makes the department clear.
        """
        nom = nom.strip()
        if not nom:
            return "❌ Erreur : le paramètre 'nom' ne peut pas être vide."

        params: dict = {
            "nom": nom,
            "fields": "code,nom,codeDepartement,codeRegion,population,codesPostaux",
            "boost": "population",
            "limit": 10,
        }

        dep = departement.strip() if departement else ""
        if dep and _DEP_CODE_RE.match(dep):
            params["codeDep"] = dep.upper()

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(_GEO_API_URL, params=params)
                resp.raise_for_status()
                communes = resp.json()
        except httpx.HTTPStatusError as e:
            logger.exception("GéoAPI HTTP error")
            return f"❌ Erreur GéoAPI : {e.response.status_code} — {e.response.text[:200]}"
        except Exception as e:
            logger.exception("GéoAPI network error")
            return f"❌ Erreur réseau GéoAPI : {e}"

        if not communes:
            dep_hint = f" dans le département {dep}" if dep else ""
            return (
                f"❌ Aucune commune trouvée pour « {nom} »{dep_hint}.\n"
                f"Essayez avec l'orthographe complète, sans abréviation, "
                f"ou précisez le département avec le paramètre 'departement'."
            )

        results = [
            {
                "code_insee": c["code"],
                "nom_officiel": c["nom"],
                "departement": c.get("codeDepartement", ""),
                "region": c.get("codeRegion", ""),
                "population": c.get("population"),
                "codes_postaux": c.get("codesPostaux", []),
            }
            for c in communes
        ]

        lines = [
            f"Résolution de « {nom} »" + (f" (dep. {dep})" if dep else "") + " :",
            "",
        ]

        if len(results) == 1:
            c = results[0]
            pop_str = f"{c['population']:,} hab." if c["population"] else "population inconnue"
            lines += [
                "✅ Correspondance unique — utilisez ce code pour tous les appels suivants :",
                f"   Nom officiel  : {c['nom_officiel']}",
                f"   Code INSEE    : {c['code_insee']}",
                f"   Département   : {c['departement']}",
                f"   Population    : {pop_str}",
                f"   Code(s) postal: {', '.join(c['codes_postaux'])}",
            ]
        else:
            lines += [
                f"⚠️ {len(results)} communes correspondent à « {nom} » — STOP.",
                "Vous DEVEZ demander à l'utilisateur laquelle il vise avant tout appel de données.",
                "Présentez-lui la liste ci-dessous et attendez sa confirmation.",
                "",
            ]
            for i, c in enumerate(results, 1):
                pop_str = f"{c['population']:,} hab." if c["population"] else "pop. inconnue"
                cp = c["codes_postaux"][0] if c["codes_postaux"] else "?"
                lines.append(
                    f"  {i}. {c['nom_officiel']} "
                    f"(dep. {c['departement']}, CP {cp}) — {pop_str} "
                    f"→ INSEE : {c['code_insee']}"
                )

        lines += ["", "JSON:", json.dumps(results, ensure_ascii=False)]
        return "\n".join(lines)
