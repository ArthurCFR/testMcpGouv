import json
import logging
import math

import httpx
from mcp.server.fastmcp import FastMCP

from helpers.transit_lookup import get_nearby_tram_metro, get_nearby_train_stations, is_ready as transit_is_ready

logger = logging.getLogger("datagouv_mcp")

_BAN_URL = "https://api-adresse.data.gouv.fr/search/"

# French metropolitan airports (hardcoded, static list)
_AIRPORTS = [
    {"iata": "CDG", "city": "Paris",            "lat": 49.00971, "lng":  2.54793},
    {"iata": "ORY", "city": "Paris",            "lat": 48.72333, "lng":  2.37944},
    {"iata": "LYS", "city": "Lyon",             "lat": 45.72561, "lng":  5.08111},
    {"iata": "NCE", "city": "Nice",             "lat": 43.65829, "lng":  7.21585},
    {"iata": "MRS", "city": "Marseille",        "lat": 43.43922, "lng":  5.22147},
    {"iata": "BOD", "city": "Bordeaux",         "lat": 44.82826, "lng": -0.71556},
    {"iata": "TLS", "city": "Toulouse",         "lat": 43.62933, "lng":  1.36378},
    {"iata": "NTE", "city": "Nantes",           "lat": 47.15321, "lng": -1.60811},
    {"iata": "SXB", "city": "Strasbourg",       "lat": 48.53834, "lng":  7.62827},
    {"iata": "LIL", "city": "Lille",            "lat": 50.56272, "lng":  3.08944},
    {"iata": "MPL", "city": "Montpellier",      "lat": 43.57614, "lng":  3.96302},
]


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(d_lng / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _get_transit_summary(lat: float, lng: float) -> str:
    """Local transit lookup using GTFS SQLite databases."""
    if not transit_is_ready():
        return "Données de transports non disponibles (bases GTFS absentes)."

    stops = get_nearby_tram_metro(lat, lng, 2000)

    # Add train stations for non-IDF locations
    is_idf = 48.1 < lat < 49.2 and 1.4 < lng < 3.6
    if not is_idf:
        trains = get_nearby_train_stations(lat, lng, 2000)
        stops.extend(trains)

    if not stops:
        return "Aucun transport en commun à moins de 2 km."

    lines = []
    for s in stops[:8]:
        mode = s["mode"]
        raw_lines = s.get("lines", [])
        if mode == "tram" and raw_lines:
            line_str = ", ".join(
                l if l.upper().startswith("T") else f"T{l}" for l in raw_lines[:3]
            )
        elif raw_lines:
            line_str = ", ".join(raw_lines[:3])
        else:
            line_str = ""

        suffix = f" ligne {line_str}" if line_str else ""
        dist_m = round(s["distKm"] * 1000)
        walk_min = round(dist_m / 1000 / 5 * 60)  # ~5 km/h walking estimate
        lines.append(f"- {s['name']} ({mode}{suffix}) : ~{walk_min} min à pied ({dist_m} m)")

    return "\n".join(lines)


def _get_airport_summary(lat: float, lng: float) -> str:
    """Nearby airports by straight-line distance (no OSRM call — fast)."""
    nearby = [
        {**a, "dist_km": _haversine_km(lat, lng, a["lat"], a["lng"])}
        for a in _AIRPORTS
        if _haversine_km(lat, lng, a["lat"], a["lng"]) < 130
    ]
    nearby.sort(key=lambda a: a["dist_km"])

    lines = []
    for a in nearby[:2]:
        drive_min = round(a["dist_km"] / 60 * 60)  # rough ~60 km/h estimate
        lines.append(f"- Aéroport {a['city']} {a['iata']} : ~{drive_min} min en voiture ({round(a['dist_km'])} km)")

    return "\n".join(lines)


def register_get_accessibility_snapshot_tool(mcp: FastMCP) -> None:
    @mcp.tool()
    async def get_accessibility_snapshot(address: str) -> str:
        """
        Géocode une adresse française via l'API BAN et retourne un bloc json-accessibility
        à inclure dans la réponse pour afficher la carte d'accessibilité (transports en commun,
        aéroports proches) directement dans la conversation.

        QUAND APPELER : dès qu'un utilisateur mentionne une adresse postale précise
        (numéro + rue + ville, ou lieu-dit + commune). Appelle ce tool automatiquement,
        sans attendre que l'utilisateur le demande.

        IMPORTANT : le résultat contient un bloc ```json-accessibility``` que tu dois
        inclure VERBATIM dans ta réponse finale (après ===RÉPONSE===), sans le modifier.

        Parameters:
            address: Adresse postale complète (ex: "15 rue de la Paix, Paris",
                     "3 impasse des Lilas, Marcillac-Vallon")
        """
        address = address.strip()
        if not address:
            return "❌ Erreur : l'adresse ne peut pas être vide."

        # Geocode via BAN API
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                resp = await client.get(
                    _BAN_URL,
                    params={"q": address, "limit": 1},
                    headers={"User-Agent": "CommuneAgent/1.0 (accessibility)"},
                )
                resp.raise_for_status()
                data = resp.json()
            except httpx.HTTPStatusError as e:
                logger.exception("BAN API HTTP error")
                return f"❌ Erreur BAN API : {e.response.status_code} — {e.response.text[:200]}"
            except Exception as e:
                logger.exception("BAN API network error")
                return f"❌ Erreur réseau BAN API : {e}"

        features = data.get("features", [])
        if not features:
            return (
                f"❌ Adresse introuvable dans la BAN : « {address} ».\n"
                f"Essayez avec l'adresse complète (numéro + rue + ville)."
            )

        feature = features[0]
        props = feature["properties"]
        coords = feature["geometry"]["coordinates"]  # GeoJSON : [lng, lat]
        lng, lat = coords[0], coords[1]
        label = props.get("label", address)
        score = props.get("score", 0)

        if score < 0.3:
            return (
                f"⚠️ Adresse géocodée avec un faible indice de confiance (score={score:.2f}) : "
                f"« {label} ». Précisez l'adresse si le résultat semble incorrect."
            )

        snap_data = {"address": label, "lat": lat, "lng": lng}
        bloc = f"```json-accessibility\n{json.dumps(snap_data, ensure_ascii=False)}\n```"

        # Local transit lookup (no network call — direct SQLite)
        transit_summary = _get_transit_summary(lat, lng)
        airport_summary = _get_airport_summary(lat, lng)

        transit_section = f"**Transports en commun (à pied depuis l'adresse) :**\n{transit_summary}"
        airport_section = (f"\n\n**Aéroports proches (en voiture) :**\n{airport_summary}") if airport_summary else ""

        return (
            f"✅ Adresse géocodée : « {label} » (lat={lat:.6f}, lng={lng:.6f}, score={score:.2f})\n\n"
            f"{transit_section}{airport_section}\n\n"
            f"Ces données de proximité sont disponibles pour le rapport.\n\n"
            f"Inclus VERBATIM le bloc suivant dans ta réponse finale (après ===RÉPONSE===) "
            f"pour afficher la carte d'accessibilité inline :\n\n"
            f"{bloc}"
        )
