import asyncio
import json
import logging
import math

import httpx
from mcp.server.fastmcp import FastMCP

logger = logging.getLogger("datagouv_mcp")

_BASE = "https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets"
_ANNUAIRE_API = f"{_BASE}/fr-en-annuaire-education/records"
_IVAL_API = f"{_BASE}/fr-en-indicateurs-de-resultat-des-lycees-gt_v2/records"
_DNB_API = f"{_BASE}/fr-en-dnb-par-etablissement/records"
_BAN_API = "https://api-adresse.data.gouv.fr/search/"

_ANNUAIRE_SELECT = ",".join([
    "identifiant_de_l_etablissement",
    "nom_etablissement",
    "type_etablissement",
    "statut_public_prive",
    "adresse_1",
    "code_postal",
    "nom_commune",
    "latitude",
    "longitude",
    "restauration",
    "hebergement",
    "ulis",
    "section_sport",
    "section_internationale",
    "voie_generale",
    "voie_technologique",
    "voie_professionnelle",
    "ecole_maternelle",
    "ecole_elementaire",
])


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


async def _geocode_adresse(adresse: str, client: httpx.AsyncClient) -> tuple[float, float] | None:
    """Geocode a French address using the BAN API. Returns (lat, lon) or None."""
    try:
        resp = await client.get(
            _BAN_API,
            params={"q": adresse, "limit": 1},
        )
        resp.raise_for_status()
        features = resp.json().get("features", [])
        if not features:
            return None
        coords = features[0]["geometry"]["coordinates"]  # [lon, lat]
        return float(coords[1]), float(coords[0])
    except Exception:
        logger.warning(f"BAN geocoding failed for '{adresse}'")
        return None


async def _fetch_annuaire(code_commune: str, client: httpx.AsyncClient) -> list[dict]:
    """Fetch all open schools for a commune (paginates automatically)."""
    all_records: list[dict] = []
    offset = 0
    limit = 100
    while True:
        resp = await client.get(
            _ANNUAIRE_API,
            params={
                "where": f'code_commune="{code_commune}" AND etat="OUVERT"',
                "select": _ANNUAIRE_SELECT,
                "order_by": "type_etablissement,nom_etablissement",
                "limit": limit,
                "offset": offset,
            },
        )
        resp.raise_for_status()
        body = resp.json()
        records = body.get("results", [])
        all_records.extend(records)
        if offset + limit >= body.get("total_count", 0):
            break
        offset += limit
    return all_records


async def _fetch_ival(code_commune: str, client: httpx.AsyncClient) -> dict[str, dict]:
    """Fetch latest IVAL bac results for all GT lycées in the commune."""
    try:
        resp = await client.get(
            _IVAL_API,
            params={
                "where": f'code_commune="{code_commune}"',
                "select": "uai,taux_reu_total,va_reu_total,presents_total,taux_acces_2nde,annee",
                "order_by": "annee DESC",
                "limit": 50,
            },
        )
        resp.raise_for_status()
        by_uai: dict[str, dict] = {}
        for rec in resp.json().get("results", []):
            uai = rec.get("uai")
            if uai and uai not in by_uai:  # keep most recent year only
                by_uai[uai] = rec
        return by_uai
    except Exception:
        logger.exception(f"IVAL fetch failed for commune {code_commune}")
        return {}


async def _fetch_dnb(code_commune: str, client: httpx.AsyncClient) -> dict[str, dict]:
    """Fetch latest DNB brevet results for all collèges in the commune."""
    try:
        resp = await client.get(
            _DNB_API,
            params={
                "where": f'commune="{code_commune}" AND type_d_etablissement="COLLEGE"',
                "select": (
                    "numero_d_etablissement,taux_de_reussite,presents,"
                    "admis_mention_bien,admis_mention_tres_bien,session"
                ),
                "order_by": "session DESC",
                "limit": 100,
            },
        )
        resp.raise_for_status()
        by_uai: dict[str, dict] = {}
        for rec in resp.json().get("results", []):
            uai = rec.get("numero_d_etablissement")
            if uai and uai not in by_uai:  # keep most recent session
                by_uai[uai] = rec
        return by_uai
    except Exception:
        logger.exception(f"DNB fetch failed for commune {code_commune}")
        return {}


def _bool_field(val) -> bool:
    """ODS returns booleans as int (1/0) or string ('1'/'0') or bool."""
    if val is None:
        return False
    try:
        return bool(int(val))
    except (TypeError, ValueError):
        return str(val).lower() in ("true", "oui", "yes")


def _parse_pct(val) -> float | None:
    """Parse percentage from various formats: float, '78.3', '78,30%'."""
    if val is None:
        return None
    try:
        return float(str(val).replace(",", ".").replace("%", "").strip())
    except (TypeError, ValueError):
        return None


def _fmt_pct(val) -> str:
    parsed = _parse_pct(val)
    if parsed is None:
        return "–"
    return f"{parsed:.1f} %"


def _fmt_va(val) -> str:
    """Format valeur ajoutée with sign."""
    if val is None:
        return "–"
    try:
        v = float(val)
        sign = "+" if v > 0 else ""
        return f"{sign}{v:.1f}"
    except (TypeError, ValueError):
        return str(val)


def register_get_ecoles_commune_tool(mcp: FastMCP) -> None:
    @mcp.tool()
    async def get_ecoles_commune(
        code_commune: str,
        adresse_reference: str = "",
    ) -> str:
        """
        Get schools (écoles, collèges, lycées) for a French commune, enriched with
        exam results (baccalauréat for GT lycées, brevet for collèges).

        For each école: name, type (maternelle/élémentaire), public/private status,
        address, and available services (restauration, hébergement, ULIS, etc.).

        For each collège: same info + latest DNB (brevet) pass rate and distinction rate.

        For each lycée GT: same info + latest bac pass rate and valeur ajoutée (how much
        the lycée outperforms or underperforms vs. predicted outcome given student profiles).
        Valeur ajoutée > 0 means the lycée adds value; < 0 means it underperforms.

        When adresse_reference is provided, the tool geocodes the address via the BAN API
        (Base Adresse Nationale), then calculates the exact walking/straight-line distance
        in km from that point to each school. Results are sorted by distance ascending.
        ALWAYS pass adresse_reference when the user mentions a specific address, street,
        or asks which school is nearest — do NOT guess proximity from memory.

        Data sources:
        - Annuaire de l'éducation (Ministère EN, updated daily) — all open schools
        - IVAL lycées GT (Ministère EN, annual) — bac results + valeur ajoutée
        - DNB par établissement (Ministère EN, annual) — brevet results
        - BAN (Base Adresse Nationale) — geocoding of adresse_reference

        ⚠️ PREREQUISITE: call resolve_commune first to get the exact INSEE code.

        Parameters:
            code_commune: INSEE commune code (5 chars, e.g. "92046" for Malakoff)
            adresse_reference: Optional — full address to measure distances from,
                               e.g. "15 rue du Colonel Fabien, Malakoff".
                               Pass "" to skip distance calculation.
        """
        code_commune = code_commune.strip()
        if not code_commune:
            return "❌ Erreur : code_commune ne peut pas être vide."

        logger.info(f"Fetching écoles for commune {code_commune}")

        async with httpx.AsyncClient(timeout=20.0) as client:
            # Geocode reference address if provided (parallel with annuaire fetch)
            adresse_ref = adresse_reference.strip()
            async def _noop() -> None:
                return None

            annuaire_task = asyncio.create_task(_fetch_annuaire(code_commune, client))
            geo_task = (
                asyncio.create_task(_geocode_adresse(adresse_ref, client))
                if adresse_ref
                else asyncio.create_task(_noop())
            )

            try:
                schools = await annuaire_task
            except Exception as e:
                geo_task.cancel()
                logger.exception(f"Annuaire fetch failed for {code_commune}")
                return f"❌ Erreur lors de la récupération de l'annuaire : {e}"

            geo_result = await geo_task  # (lat, lon) or None
            ref_lat, ref_lon = (geo_result if geo_result else (None, None))
            has_ref_point = ref_lat is not None

            if not schools:
                return (
                    f"Aucun établissement scolaire ouvert trouvé pour la commune {code_commune}.\n"
                    "Vérifiez le code INSEE (5 caractères, ex: '34172')."
                )

            # Parallel fetch of exam results
            ival_data, dnb_data = await asyncio.gather(
                _fetch_ival(code_commune, client),
                _fetch_dnb(code_commune, client),
            )

        # Enrich schools with exam data and optional distance
        enriched: list[dict] = []
        for s in schools:
            uai = s.get("identifiant_de_l_etablissement", "")
            etype = s.get("type_etablissement", "")
            lat = s.get("latitude")
            lon = s.get("longitude")

            entry: dict = {
                "uai": uai,
                "nom": s.get("nom_etablissement", ""),
                "type": etype,
                "statut": s.get("statut_public_prive", ""),
                "adresse": s.get("adresse_1", ""),
                "code_postal": s.get("code_postal", ""),
                "latitude": lat,
                "longitude": lon,
                "restauration": _bool_field(s.get("restauration")),
                "hebergement": _bool_field(s.get("hebergement")),
                "ulis": _bool_field(s.get("ulis")),
                "section_sport": _bool_field(s.get("section_sport")),
                "section_internationale": _bool_field(s.get("section_internationale")),
            }

            # Distance from reference point
            if has_ref_point and lat is not None and lon is not None:
                try:
                    entry["distance_km"] = round(
                        _haversine_km(ref_lat, ref_lon, float(lat), float(lon)), 2
                    )
                except (TypeError, ValueError):
                    entry["distance_km"] = None
            else:
                entry["distance_km"] = None

            # Enrich lycée GT with IVAL
            if etype.lower() in ("lycée", "lycee") and uai in ival_data:
                iv = ival_data[uai]
                entry["bac_taux_reussite"] = iv.get("taux_reu_total")
                entry["bac_valeur_ajoutee"] = iv.get("va_reu_total")
                entry["bac_presents"] = iv.get("presents_total")
                entry["bac_taux_acces_2nde"] = iv.get("taux_acces_2nde")
                entry["bac_session"] = iv.get("annee")
            elif etype.lower() in ("lycée", "lycee"):
                entry["bac_taux_reussite"] = None
                entry["bac_valeur_ajoutee"] = None
                entry["bac_presents"] = None
                entry["bac_taux_acces_2nde"] = None
                entry["bac_session"] = None

            # Enrich collège with DNB
            if etype.lower() == "collège" and uai in dnb_data:
                dnb = dnb_data[uai]
                entry["dnb_taux_reussite"] = _parse_pct(dnb.get("taux_de_reussite"))
                entry["dnb_presents"] = dnb.get("presents")
                entry["dnb_mention_bien"] = dnb.get("admis_mention_bien")
                entry["dnb_mention_tres_bien"] = dnb.get("admis_mention_tres_bien")
                entry["dnb_session"] = dnb.get("session")
            elif etype.lower() == "collège":
                entry["dnb_taux_reussite"] = None
                entry["dnb_presents"] = None
                entry["dnb_mention_bien"] = None
                entry["dnb_mention_tres_bien"] = None
                entry["dnb_session"] = None

            enriched.append(entry)

        # Sort: by distance if available, otherwise by type then name
        if has_ref_point:
            enriched.sort(key=lambda x: (x.get("distance_km") or 9999, x["nom"]))
        else:
            type_order = {"ecole": 0, "école": 0, "collège": 1, "lycée": 2, "lycee": 2}
            enriched.sort(
                key=lambda x: (
                    type_order.get(x["type"].lower(), 3),
                    x.get("statut", ""),
                    x["nom"],
                )
            )

        # ── Format output ──────────────────────────────────────────────────────────
        lines = [
            f"Établissements scolaires — commune {code_commune}",
            f"Source : Annuaire de l'éducation (Ministère EN, MAJ quotidienne)",
            f"Total : {len(enriched)} établissements ouverts",
            "",
        ]

        # Group by type for display
        type_groups: dict[str, list[dict]] = {}
        for e in enriched:
            key = e["type"] if e["type"] else "Autre"
            type_groups.setdefault(key, []).append(e)

        _TYPE_LABELS = {
            "Ecole": "🏫 ÉCOLES",
            "Ecole de la 2ème chance": "🏫 ÉCOLES",
            "Collège": "🏛️ COLLÈGES",
            "Lycée": "🎓 LYCÉES",
            "Lycée professionnel": "🔧 LYCÉES PROFESSIONNELS",
            "EREA": "📚 ÉTABLISSEMENTS SPÉCIALISÉS",
        }

        for etype_key, group in sorted(
            type_groups.items(),
            key=lambda kv: {"Ecole": 0, "Collège": 1, "Lycée": 2}.get(kv[0], 3),
        ):
            label = _TYPE_LABELS.get(etype_key, f"📋 {etype_key.upper()}")
            lines.append(f"{label} ({len(group)})")
            lines.append("─" * 60)

            for e in group:
                dist_str = (
                    f"  📍 {e['distance_km']} km" if e.get("distance_km") is not None else ""
                )
                statut_icon = "🔵" if e["statut"] == "Public" else "🔶"
                lines.append(f"{statut_icon} {e['nom']}{dist_str}")
                lines.append(f"   {e['adresse']}, {e['code_postal']}")

                # Services
                services = []
                if e.get("restauration"):
                    services.append("🍽️ restauration")
                if e.get("hebergement"):
                    services.append("🛏️ internat")
                if e.get("ulis"):
                    services.append("♿ ULIS")
                if e.get("section_sport"):
                    services.append("⚽ sport")
                if e.get("section_internationale"):
                    services.append("🌍 internationale")
                if services:
                    lines.append(f"   {' · '.join(services)}")

                # Exam results
                if "bac_taux_reussite" in e and e["bac_taux_reussite"] is not None:
                    va = _fmt_va(e.get("bac_valeur_ajoutee"))
                    session = e.get("bac_session", "")
                    lines.append(
                        f"   📊 Bac {session} : {_fmt_pct(e['bac_taux_reussite'])} de réussite"
                        f"  |  Valeur ajoutée : {va}"
                    )
                elif "bac_taux_reussite" in e:
                    lines.append("   📊 Résultats bac : non disponibles (lycée pro ou données manquantes)")

                if "dnb_taux_reussite" in e and e["dnb_taux_reussite"] is not None:
                    session = e.get("dnb_session", "")
                    tb = e.get("dnb_mention_tres_bien") or 0
                    b = e.get("dnb_mention_bien") or 0
                    lines.append(
                        f"   📊 Brevet {session} : {_fmt_pct(e['dnb_taux_reussite'])} de réussite"
                        f"  |  Mention TB : {tb}  ·  B : {b}"
                    )
                elif "dnb_taux_reussite" in e:
                    lines.append("   📊 Résultats brevet : non disponibles")

                lines.append("")

        lines += [
            "JSON :",
            json.dumps(
                {"code_commune": code_commune, "etablissements": enriched},
                ensure_ascii=False,
            ),
        ]

        return "\n".join(lines)
