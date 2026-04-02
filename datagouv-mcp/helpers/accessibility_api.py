"""
REST endpoint /api/accessibility — returns full AccessibilityData JSON
matching the TypeScript interface expected by AccessibilityInline.tsx.

Replaces the Vercel /api/accessibility/analyze endpoint which needs local .db files.
"""

import json
import logging
import math

import httpx

from helpers.transit_lookup import (
    get_all_stops_for_line,
    get_nearby_tram_metro,
    get_nearby_train_stations,
)

logger = logging.getLogger("datagouv_mcp")

AIRPORTS = [
    {"iata": "CDG", "name": "Charles de Gaulle", "city": "Paris",            "lat": 49.00971, "lng":  2.54793},
    {"iata": "ORY", "name": "Orly",              "city": "Paris",            "lat": 48.72333, "lng":  2.37944},
    {"iata": "LYS", "name": "Saint-Exupéry",     "city": "Lyon",            "lat": 45.72561, "lng":  5.08111},
    {"iata": "NCE", "name": "Côte d'Azur",       "city": "Nice",            "lat": 43.65829, "lng":  7.21585},
    {"iata": "MRS", "name": "Provence",           "city": "Marseille",       "lat": 43.43922, "lng":  5.22147},
    {"iata": "BOD", "name": "Mérignac",           "city": "Bordeaux",        "lat": 44.82826, "lng": -0.71556},
    {"iata": "TLS", "name": "Blagnac",            "city": "Toulouse",        "lat": 43.62933, "lng":  1.36378},
    {"iata": "NTE", "name": "Atlantique",         "city": "Nantes",          "lat": 47.15321, "lng": -1.60811},
    {"iata": "SXB", "name": "Entzheim",           "city": "Strasbourg",      "lat": 48.53834, "lng":  7.62827},
    {"iata": "LIL", "name": "Lesquin",            "city": "Lille",           "lat": 50.56272, "lng":  3.08944},
    {"iata": "MPL", "name": "Méditerranée",       "city": "Montpellier",     "lat": 43.57614, "lng":  3.96302},
]

OSRM_WALKING_ENDPOINTS = [
    "https://routing.openstreetmap.de/routed-foot/route/v1/foot",
    "https://router.project-osrm.org/route/v1/foot",
]
OSRM_DRIVING_BASE = "https://router.project-osrm.org/route/v1/driving"

TYPE_CAPS = {"metro": 20, "rer": 10, "tram": 20, "train": 4, "bus": 5}
PRIORITY = {"metro": 0, "rer": 1, "tram": 2, "train": 3, "bus": 4}


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


async def _osrm_route(
    client: httpx.AsyncClient,
    profile: str,
    from_lat: float, from_lng: float,
    to_lat: float, to_lng: float,
) -> dict | None:
    """Fetch route from OSRM. Returns {durationSec, distanceM, coords} or None."""
    if profile == "driving":
        endpoints = [OSRM_DRIVING_BASE]
    else:
        endpoints = OSRM_WALKING_ENDPOINTS

    for base in endpoints:
        url = f"{base}/{from_lng},{from_lat};{to_lng},{to_lat}?overview=full&geometries=geojson"
        try:
            resp = await client.get(url, headers={"User-Agent": "CommuneAgent/1.0"}, timeout=8.0)
            if resp.status_code != 200:
                continue
            data = resp.json()
            if data.get("code") != "Ok" or not data.get("routes"):
                continue
            route = data["routes"][0]
            # GeoJSON [lng, lat] → Leaflet [lat, lng]
            coords = [[c[1], c[0]] for c in route["geometry"]["coordinates"]]
            return {
                "durationSec": route["duration"],
                "distanceM": route["distance"],
                "coords": coords,
            }
        except Exception:
            continue
    return None


def _walking_fallback(from_lat: float, from_lng: float, to_lat: float, to_lng: float) -> dict:
    dist_m = _haversine_km(from_lat, from_lng, to_lat, to_lng) * 1000 * 1.3
    return {
        "durationSec": (dist_m / 1000 / 5) * 3600,
        "distanceM": dist_m,
        "coords": [[from_lat, from_lng], [to_lat, to_lng]],
    }


def _apply_caps(candidates: list[dict]) -> list[dict]:
    candidates.sort(key=lambda c: (PRIORITY.get(c["type"], 9), c["distKm"]))
    type_count: dict[str, int] = {}
    result = []
    for c in candidates:
        count = type_count.get(c["type"], 0)
        if count < TYPE_CAPS.get(c["type"], 5):
            result.append(c)
            type_count[c["type"]] = count + 1
    return result


async def compute_accessibility(lat: float, lng: float, address: str) -> dict:
    """Compute full AccessibilityData matching the TypeScript interface."""

    # 1. Find stop candidates from local SQLite
    candidate_map: dict[str, dict] = {}

    for s in get_nearby_tram_metro(lat, lng, 2000):
        key = f"{s['mode']}::{s['name'].lower().strip()}"
        candidate_map[key] = {
            "id": f"gtfs::{s['name']}",
            "name": s["name"],
            "type": s["mode"],
            "lat": s["lat"],
            "lng": s["lng"],
            "distKm": s["distKm"],
            "lines": s["lines"],
        }

    is_idf = 48.1 < lat < 49.2 and 1.4 < lng < 3.6
    if not is_idf:
        for s in get_nearby_train_stations(lat, lng, 2000):
            key = f"train::{s['name'].lower().strip()}"
            if key not in candidate_map:
                candidate_map[key] = {
                    "id": f"gtfs::{s['name']}",
                    "name": s["name"],
                    "type": "train",
                    "lat": s["lat"],
                    "lng": s["lng"],
                    "distKm": s["distKm"],
                    "lines": [],
                }

    candidates = _apply_caps(list(candidate_map.values()))

    # 2. Fetch walking routes (parallel) + airports driving routes
    async with httpx.AsyncClient() as client:
        # Transit walking routes
        transit_stops = []
        for c in candidates:
            route = await _osrm_route(client, "walking", lat, lng, c["lat"], c["lng"])
            if route is None:
                route = _walking_fallback(lat, lng, c["lat"], c["lng"])
            walking_time = round(route["durationSec"] / 60)
            if walking_time > 20:
                continue
            transit_stops.append({
                "id": c["id"],
                "name": c["name"],
                "type": c["type"],
                "lat": c["lat"],
                "lng": c["lng"],
                "lines": c["lines"],
                "walkingTime": walking_time,
                "walkingDistance": round(route["distanceM"]),
                "routeCoords": route["coords"],
            })

        # Airport driving routes
        nearby_airports = sorted(
            [a for a in AIRPORTS if _haversine_km(lat, lng, a["lat"], a["lng"]) < 130],
            key=lambda a: _haversine_km(lat, lng, a["lat"], a["lng"]),
        )[:5]

        airports = []
        for a in nearby_airports:
            route = await _osrm_route(client, "driving", lat, lng, a["lat"], a["lng"])
            if route is None:
                continue
            if route["durationSec"] > 90 * 60:
                continue
            airports.append({
                "iata": a["iata"],
                "name": a["name"],
                "city": a["city"],
                "lat": a["lat"],
                "lng": a["lng"],
                "drivingTime": round(route["durationSec"] / 60),
                "drivingDistance": round(route["distanceM"] / 1000),
                "routeCoords": route["coords"],
            })

    # 3. Line shapes (tram/metro/rer lines drawn on map)
    line_shapes: dict[str, dict] = {}
    lines_with_type: dict[str, str] = {}
    for stop in transit_stops:
        if stop["type"] in ("train", "bus"):
            continue
        for line in stop["lines"]:
            if line not in lines_with_type:
                lines_with_type[line] = stop["type"]

    for line, line_type in lines_with_type.items():
        segments = get_all_stops_for_line(line, lat, lng, 60, line_type)
        if not segments:
            continue
        line_shapes[line] = {
            "type": line_type,
            "segments": [
                [
                    {"name": s["name"], "lat": s["lat"], "lng": s["lng"], "isTerminus": i == 0 or i == len(seg) - 1}
                    for i, s in enumerate(seg)
                ]
                for seg in segments
            ],
        }

    return {
        "address": address,
        "lat": lat,
        "lng": lng,
        "transitStops": transit_stops,
        "airports": airports,
        "lineShapes": line_shapes,
    }


async def handle_accessibility_request(scope: dict, receive, send) -> None:
    """ASGI handler for POST /api/accessibility."""
    # Read request body
    body = b""
    while True:
        message = await receive()
        body += message.get("body", b"")
        if not message.get("more_body", False):
            break

    try:
        payload = json.loads(body)
        lat = float(payload["lat"])
        lng = float(payload["lng"])
        address = str(payload.get("address", ""))
    except (json.JSONDecodeError, KeyError, ValueError) as e:
        error_body = json.dumps({"error": str(e)}).encode()
        await send({"type": "http.response.start", "status": 400, "headers": [
            (b"content-type", b"application/json"),
            (b"content-length", str(len(error_body)).encode()),
        ]})
        await send({"type": "http.response.body", "body": error_body})
        return

    try:
        result = await compute_accessibility(lat, lng, address)
        result_body = json.dumps(result, ensure_ascii=False).encode()
    except Exception as e:
        logger.exception("Accessibility API error")
        error_body = json.dumps({"error": str(e)}).encode()
        await send({"type": "http.response.start", "status": 500, "headers": [
            (b"content-type", b"application/json"),
            (b"content-length", str(len(error_body)).encode()),
        ]})
        await send({"type": "http.response.body", "body": error_body})
        return

    # CORS headers for Vercel frontend
    headers = [
        (b"content-type", b"application/json"),
        (b"content-length", str(len(result_body)).encode()),
        (b"access-control-allow-origin", b"*"),
        (b"access-control-allow-methods", b"POST, OPTIONS"),
        (b"access-control-allow-headers", b"Content-Type"),
    ]
    await send({"type": "http.response.start", "status": 200, "headers": headers})
    await send({"type": "http.response.body", "body": result_body})
