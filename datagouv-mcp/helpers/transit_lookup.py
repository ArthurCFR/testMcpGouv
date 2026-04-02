"""
Local GTFS transit lookup — Python port of commune-agent/app/lib/stopsIndex.ts.

Two SQLite databases (shipped in data/):
  - data/tram-metro.db : tram & metro stops with line names
  - data/stops.db      : 637k consolidated stops (train stations only used here)
"""

import json
import math
import os
import sqlite3
from pathlib import Path

_DATA_DIR = Path(os.getenv("TRANSIT_DATA_DIR", str(Path(__file__).parent.parent / "data")))
_TRAM_METRO_DB = _DATA_DIR / "tram-metro.db"
_STOPS_DB = _DATA_DIR / "stops.db"

# Lazy singletons
_tram_metro_conn: sqlite3.Connection | None = None
_stops_conn: sqlite3.Connection | None = None


def _get_tram_metro_db() -> sqlite3.Connection | None:
    global _tram_metro_conn
    if _tram_metro_conn:
        return _tram_metro_conn
    if not _TRAM_METRO_DB.exists():
        return None
    _tram_metro_conn = sqlite3.connect(str(_TRAM_METRO_DB))
    _tram_metro_conn.row_factory = sqlite3.Row
    return _tram_metro_conn


def _get_stops_db() -> sqlite3.Connection | None:
    global _stops_conn
    if _stops_conn:
        return _stops_conn
    if not _STOPS_DB.exists():
        return None
    _stops_conn = sqlite3.connect(str(_STOPS_DB))
    _stops_conn.row_factory = sqlite3.Row
    return _stops_conn


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


def _bbox(lat: float, lng: float, radius_km: float):
    d_lat = radius_km / 111.0
    d_lng = radius_km / (111.0 * math.cos(math.radians(lat)))
    return lat - d_lat, lat + d_lat, lng - d_lng, lng + d_lng


def is_ready() -> bool:
    """Check if at least the tram-metro DB is available."""
    return _TRAM_METRO_DB.exists()


def get_nearby_tram_metro(lat: float, lng: float, radius_m: float = 2000) -> list[dict]:
    """Returns nearby tram & metro stops with line names."""
    conn = _get_tram_metro_db()
    if not conn:
        return []

    radius_km = radius_m / 1000
    min_lat, max_lat, min_lng, max_lng = _bbox(lat, lng, radius_km)

    rows = conn.execute(
        """SELECT stop_name, stop_lat, stop_lon, mode, lines
           FROM stops
           WHERE stop_lat BETWEEN ? AND ?
             AND stop_lon BETWEEN ? AND ?""",
        (min_lat, max_lat, min_lng, max_lng),
    ).fetchall()

    seen: dict[str, dict] = {}
    for row in rows:
        dist = _haversine_km(lat, lng, row["stop_lat"], row["stop_lon"])
        if dist > radius_km:
            continue
        key = f"{row['mode']}::{row['stop_name'].lower().strip()}"
        try:
            lines = json.loads(row["lines"])
        except (json.JSONDecodeError, TypeError):
            lines = []

        prev = seen.get(key)
        if prev:
            merged = sorted(set(prev["lines"] + lines))
            seen[key] = {**prev, "lines": merged, "distKm": min(prev["distKm"], dist)}
        else:
            seen[key] = {
                "name": row["stop_name"],
                "lat": row["stop_lat"],
                "lng": row["stop_lon"],
                "distKm": dist,
                "mode": row["mode"],
                "lines": lines,
            }

    return sorted(seen.values(), key=lambda s: s["distKm"])


def get_nearby_train_stations(lat: float, lng: float, radius_m: float = 2000) -> list[dict]:
    """Returns nearby train stations from consolidated stops index."""
    conn = _get_stops_db()
    if not conn:
        return []

    radius_km = radius_m / 1000
    min_lat, max_lat, min_lng, max_lng = _bbox(lat, lng, radius_km)

    rows = conn.execute(
        """SELECT stop_name, stop_lat, stop_lon
           FROM stops
           WHERE mode = 'train'
             AND stop_lat BETWEEN ? AND ?
             AND stop_lon BETWEEN ? AND ?""",
        (min_lat, max_lat, min_lng, max_lng),
    ).fetchall()

    seen: dict[str, dict] = {}
    for row in rows:
        dist = _haversine_km(lat, lng, row["stop_lat"], row["stop_lon"])
        if dist > radius_km:
            continue
        key = f"train::{row['stop_name'].lower().strip()}"
        prev = seen.get(key)
        if not prev or dist < prev["distKm"]:
            seen[key] = {
                "name": row["stop_name"],
                "lat": row["stop_lat"],
                "lng": row["stop_lon"],
                "distKm": dist,
                "mode": "train",
                "lines": [],
            }

    return sorted(seen.values(), key=lambda s: s["distKm"])


def get_all_stops_for_line(
    line_ref: str, near_lat: float, near_lng: float, radius_km: float = 60, mode: str = "tram"
) -> list[list[dict]]:
    """Returns all stops for a line, ordered along the line via nearest-neighbour."""
    conn = _get_tram_metro_db()
    if not conn:
        return []

    min_lat, max_lat, min_lng, max_lng = _bbox(near_lat, near_lng, radius_km)

    rows = conn.execute(
        """SELECT stop_name, stop_lat, stop_lon, lines FROM stops
           WHERE stop_lat BETWEEN ? AND ? AND stop_lon BETWEEN ? AND ?""",
        (min_lat, max_lat, min_lng, max_lng),
    ).fetchall()

    seen: dict[str, dict] = {}
    for row in rows:
        if _haversine_km(near_lat, near_lng, row["stop_lat"], row["stop_lon"]) > radius_km:
            continue
        try:
            lines = json.loads(row["lines"])
        except (json.JSONDecodeError, TypeError):
            continue
        if line_ref not in lines:
            continue
        key = row["stop_name"].lower().strip()
        if key not in seen:
            seen[key] = {"name": row["stop_name"], "lat": row["stop_lat"], "lng": row["stop_lon"]}

    max_step_km = 10 if mode == "rer" else 4
    return _order_stops_along_line(list(seen.values()), max_step_km)


def _order_stops_along_line(stops: list[dict], max_step_km: float = 4) -> list[list[dict]]:
    """Nearest-neighbour ordering, splits into segments when gap > max_step_km."""
    if len(stops) <= 2:
        return [stops] if stops else []

    segments: list[list[dict]] = []
    unvisited = list(stops)

    while unvisited:
        start_idx = min(range(len(unvisited)), key=lambda i: unvisited[i]["lat"])
        segment = [unvisited.pop(start_idx)]

        while unvisited:
            last = segment[-1]
            dists = [_haversine_km(last["lat"], last["lng"], s["lat"], s["lng"]) for s in unvisited]
            min_idx = min(range(len(dists)), key=lambda i: dists[i])
            if dists[min_idx] > max_step_km:
                break
            segment.append(unvisited.pop(min_idx))

        segments.append(segment)

    return segments
