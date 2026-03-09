"""
DVF national files (2023+) — per-commune and full-national SQLite cache.

Two cache modes (used in priority order):
  1. Full DB  — one SQLite per year, ALL communes pre-loaded, indexed on code_commune.
               Built by preload_dvf_national.py. Commune lookup = instant SELECT.
  2. Per-commune DB — one small SQLite per (year, commune), built on first MCP request.
               Fallback when the full DB hasn't been pre-built yet.

Full DB paths : ~/.datagouv_cache/dvf_national_full_{resource_id}.db
Per-commune   : ~/.datagouv_cache/{resource_id}__{code_commune}.db
ZIP disk cache: ~/.datagouv_cache/dvf_national_{resource_id}.zip  (30-day TTL)
"""

import asyncio
import codecs
import csv
import io
import json
import logging
import sqlite3
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

import httpx

from helpers.cache_manager import CACHE_DIR, get_db_path

logger = logging.getLogger("datagouv_mcp")

# National DVF sources (2023+) — raw DGFiP format, not available via Tabular API
DVF_NATIONAL_SOURCES: dict[str, dict[str, str]] = {
    "2023": {
        "resource_id": "cc8a50e4-c8d1-4ac2-8de2-c1e4b3c44c86",
        "url": "https://static.data.gouv.fr/resources/demandes-de-valeurs-foncieres/20251018-234851/valeursfoncieres-2023.txt.zip",
    },
    "2024": {
        "resource_id": "af812b0e-a898-4226-8cc8-5a570b257326",
        "url": "https://static.data.gouv.fr/resources/demandes-de-valeurs-foncieres/20251018-234857/valeursfoncieres-2024.txt.zip",
    },
    "2025-S1": {
        "resource_id": "4d741143-8331-4b59-95c2-3b24a7bdbe3c",
        "url": "https://static.data.gouv.fr/resources/demandes-de-valeurs-foncieres/20251018-234902/valeursfoncieres-2025-s1.txt.zip",
    },
}

# Keep the old name as alias for any existing imports
_DVF_NATIONAL_SOURCES = DVF_NATIONAL_SOURCES

# Only residential types — matches the "logement=True" filter in DVF par département
_RESIDENTIAL_TYPES = {"Maison", "Appartement"}

# Normalized output schema — matches columns used by get_dvf_comparables filters
_OUTPUT_COLUMNS = [
    "date_mutation",
    "valeur_fonciere",
    "surface_reelle_bati",
    "type_local",
    "adresse_nom_voie",
    "adresse_numero",
    "logement",
    "code_commune",
    "nature_mutation",
]

# ZIP disk cache TTL (30 days — DVF data for past years is stable)
_ZIP_CACHE_TTL_SECONDS = 30 * 24 * 3600


# ---------------------------------------------------------------------------
# Helpers — shared parsing
# ---------------------------------------------------------------------------

def _norm_french_number(s: str) -> str:
    """Convert French decimal comma to dot. E.g. '250000,50' → '250000.50'."""
    return s.replace(",", ".").strip() if s else ""


def _parse_dvf_row(row: dict) -> tuple | None:
    """
    Parse one raw DGFiP row dict. Returns a normalized tuple or None if to skip.
    Does NOT filter by commune — caller decides.
    """
    type_local = (row.get("Type local") or "").strip()
    if type_local not in _RESIDENTIAL_TYPES:
        return None

    dept_raw = (row.get("Code departement") or "").strip()
    dept_padded = dept_raw.zfill(2) if dept_raw.isdigit() else dept_raw.upper()
    commune_raw = (row.get("Code commune") or "").strip().zfill(3)
    full_code = dept_padded + commune_raw

    date_raw = (row.get("Date mutation") or "").strip()
    if len(date_raw) == 10 and date_raw[2] == "/":
        parts = date_raw.split("/")
        date_raw = f"{parts[2]}-{parts[1]}-{parts[0]}"

    valeur_raw = _norm_french_number(row.get("Valeur fonciere") or "")
    surface_raw = _norm_french_number(row.get("Surface reelle bati") or "")

    if not valeur_raw or not surface_raw or surface_raw == "0":
        return None

    return (
        date_raw,
        valeur_raw,
        surface_raw,
        type_local,
        (row.get("Voie") or "").strip(),
        (row.get("No voie") or "").strip(),
        "True",
        full_code,
        (row.get("Nature mutation") or "").strip(),
    )


# ---------------------------------------------------------------------------
# ZIP disk cache
# ---------------------------------------------------------------------------

def _zip_cache_path(resource_id: str) -> Path:
    return CACHE_DIR / f"dvf_national_{resource_id}.zip"


def _get_or_invalidate_zip_cache(resource_id: str) -> bytes | None:
    """Return cached ZIP bytes if fresh (< 30 days), else delete and return None."""
    path = _zip_cache_path(resource_id)
    if not path.exists():
        return None
    if time.time() - path.stat().st_mtime > _ZIP_CACHE_TTL_SECONDS:
        path.unlink(missing_ok=True)
        return None
    return path.read_bytes()


def _save_zip_cache(resource_id: str, zip_bytes: bytes) -> None:
    _zip_cache_path(resource_id).write_bytes(zip_bytes)


# ---------------------------------------------------------------------------
# Full DB (all communes for a given year) — used when pre-loaded by script
# ---------------------------------------------------------------------------

def _full_db_path(resource_id: str) -> Path:
    return CACHE_DIR / f"dvf_national_full_{resource_id}.db"


def _is_full_db_ready(resource_id: str) -> bool:
    """True only when the full DB was completely built (status='complete' in _meta)."""
    path = _full_db_path(resource_id)
    if not path.exists():
        return False
    try:
        conn = sqlite3.connect(str(path))
        cur = conn.execute("SELECT value FROM _meta WHERE key='status'")
        row = cur.fetchone()
        conn.close()
        return row is not None and row[0] == "complete"
    except Exception:
        return False


def _query_full_db(resource_id: str, code_commune: str) -> list[dict]:
    """Query the full DB for a specific commune. Instant due to code_commune index."""
    path = _full_db_path(resource_id)
    safe = "".join(c for c in code_commune if c.isalnum())
    try:
        conn = sqlite3.connect(str(path))
        conn.row_factory = sqlite3.Row
        cur = conn.execute(f"SELECT * FROM data WHERE code_commune = '{safe}'")
        rows = [dict(r) for r in cur.fetchall()]
        conn.close()
        return rows
    except Exception as e:
        logger.warning("DVF full DB query failed for %s: %s", code_commune, e)
        return []


def parse_and_store_full(
    resource_id: str,
    url: str,
    year_label: str,
    zip_bytes: bytes,
    progress_cb: Callable[[int], None] | None = None,
) -> int:
    """
    Parse national DVF ZIP and store ALL communes' residential rows in one SQLite DB.
    Called by preload_dvf_national.py (runs in a background thread or subprocess).

    progress_cb(n): called every 100k raw rows parsed, with cumulative count.
    Returns total residential rows stored.
    """
    db_path = _full_db_path(resource_id)

    # Build into a temp path then rename to avoid half-built DBs on interrupt
    tmp_path = db_path.with_suffix(".db.tmp")
    tmp_path.unlink(missing_ok=True)

    conn = sqlite3.connect(str(tmp_path))
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.execute("CREATE TABLE _meta (key TEXT PRIMARY KEY, value TEXT)")
        col_defs = ", ".join(f'"{c}" TEXT' for c in _OUTPUT_COLUMNS)
        conn.execute(f"CREATE TABLE data ({col_defs})")

        now = datetime.now(timezone.utc).isoformat()
        conn.executemany("INSERT INTO _meta VALUES (?, ?)", [
            ("status", "in_progress"),
            ("year_label", year_label),
            ("resource_url", url),
            ("started_at", now),
            ("columns", json.dumps(_OUTPUT_COLUMNS)),
        ])
        conn.commit()

        placeholders = ", ".join("?" for _ in _OUTPUT_COLUMNS)
        insert_sql = f"INSERT INTO data VALUES ({placeholders})"

        zf = zipfile.ZipFile(io.BytesIO(zip_bytes))
        txt_name = zf.namelist()[0]

        batch: list[tuple] = []
        row_count = 0
        residential_count = 0
        BATCH_SIZE = 5_000

        with zf.open(txt_name) as raw_file:
            reader = csv.DictReader(codecs.getreader("windows-1252")(raw_file), delimiter="|")
            for raw_row in reader:
                row_count += 1
                parsed = _parse_dvf_row(raw_row)
                if parsed is not None:
                    batch.append(parsed)
                    residential_count += 1
                if len(batch) >= BATCH_SIZE:
                    conn.executemany(insert_sql, batch)
                    conn.commit()
                    batch = []
                if progress_cb and row_count % 100_000 == 0:
                    progress_cb(row_count)

        if batch:
            conn.executemany(insert_sql, batch)
            conn.commit()

        # Index on code_commune for fast lookups
        conn.execute('CREATE INDEX idx_code_commune ON data (code_commune)')
        conn.commit()

        # Mark complete
        conn.execute("INSERT OR REPLACE INTO _meta VALUES ('status', 'complete')")
        conn.execute("INSERT OR REPLACE INTO _meta VALUES ('row_count', ?)", (str(residential_count),))
        conn.execute("INSERT OR REPLACE INTO _meta VALUES ('raw_row_count', ?)", (str(row_count),))
        conn.execute("INSERT OR REPLACE INTO _meta VALUES ('completed_at', ?)",
                     (datetime.now(timezone.utc).isoformat(),))
        conn.commit()
    finally:
        conn.close()

    # Atomic rename
    tmp_path.rename(db_path)

    logger.info("DVF full DB %s: stored %d residential rows (%d raw)", year_label, residential_count, row_count)
    return residential_count


# ---------------------------------------------------------------------------
# Per-commune DB (on-demand fallback)
# ---------------------------------------------------------------------------

def _commune_cache_key(resource_id: str, code_commune: str) -> str:
    return f"{resource_id}__{code_commune}"


def _is_commune_cached(resource_id: str, code_commune: str) -> bool:
    key = _commune_cache_key(resource_id, code_commune)
    db_path = get_db_path(key)
    if not db_path.exists():
        return False
    try:
        conn = sqlite3.connect(str(db_path))
        cur = conn.execute("SELECT value FROM _meta WHERE key='row_count'")
        row = cur.fetchone()
        conn.close()
        return row is not None
    except Exception:
        return False


def _parse_and_store_commune(
    resource_id: str,
    url: str,
    year_label: str,
    code_commune: str,
    zip_bytes: bytes,
) -> int:
    """Parse national DVF ZIP, filter for one commune, store in per-commune SQLite."""
    rows_to_insert: list[tuple] = []
    zf = zipfile.ZipFile(io.BytesIO(zip_bytes))
    txt_name = zf.namelist()[0]

    logger.info("DVF national %s: parsing for commune %s...", year_label, code_commune)

    with zf.open(txt_name) as raw_file:
        reader = csv.DictReader(codecs.getreader("windows-1252")(raw_file), delimiter="|")
        for raw_row in reader:
            parsed = _parse_dvf_row(raw_row)
            if parsed is None:
                continue
            # parsed[7] is code_commune
            if parsed[7].upper() != code_commune.upper():
                continue
            rows_to_insert.append(parsed)

    cache_key = _commune_cache_key(resource_id, code_commune)
    db_path = get_db_path(cache_key)

    conn = sqlite3.connect(str(db_path))
    try:
        conn.execute("DROP TABLE IF EXISTS data")
        conn.execute("DROP TABLE IF EXISTS _meta")
        conn.execute("CREATE TABLE _meta (key TEXT PRIMARY KEY, value TEXT)")
        col_defs = ", ".join(f'"{c}" TEXT' for c in _OUTPUT_COLUMNS)
        conn.execute(f"CREATE TABLE data ({col_defs})")
        placeholders = ", ".join("?" for _ in _OUTPUT_COLUMNS)
        if rows_to_insert:
            conn.executemany(f"INSERT INTO data VALUES ({placeholders})", rows_to_insert)
        conn.commit()

        now = datetime.now(timezone.utc).isoformat()
        conn.executemany("INSERT INTO _meta VALUES (?, ?)", [
            ("row_count", str(len(rows_to_insert))),
            ("columns", json.dumps(_OUTPUT_COLUMNS)),
            ("cached_at", now),
            ("resource_url", url),
            ("resource_title", f"DVF national {year_label} — commune {code_commune}"),
            ("code_commune", code_commune),
            ("year_label", year_label),
        ])
        conn.commit()
    finally:
        conn.close()

    logger.info("DVF national %s: cached %d rows for commune %s", year_label, len(rows_to_insert), code_commune)
    return len(rows_to_insert)


async def _get_zip_bytes(resource_id: str, url: str, year_label: str) -> bytes:
    """Return ZIP bytes from disk cache or download, saving to disk if needed."""
    zip_bytes = _get_or_invalidate_zip_cache(resource_id)
    if zip_bytes is not None:
        logger.info("DVF national %s: ZIP from disk cache (%.1f MB)", year_label, len(zip_bytes) / 1e6)
        return zip_bytes
    logger.info("DVF national %s: downloading %s (~60-70 MB)...", year_label, url)
    async with httpx.AsyncClient(follow_redirects=True, timeout=300.0) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        zip_bytes = resp.content
    logger.info("DVF national %s: downloaded %.1f MB", year_label, len(zip_bytes) / 1e6)
    _save_zip_cache(resource_id, zip_bytes)
    return zip_bytes


async def _download_and_cache_commune(
    resource_id: str, url: str, year_label: str, code_commune: str,
) -> int:
    zip_bytes = await _get_zip_bytes(resource_id, url, year_label)
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        None, _parse_and_store_commune, resource_id, url, year_label, code_commune, zip_bytes,
    )


# ---------------------------------------------------------------------------
# Public API used by get_dvf_comparables
# ---------------------------------------------------------------------------

async def ensure_national_dvf_cached(code_commune: str) -> dict[str, int]:
    """
    Ensure national DVF data (2023, 2024, 2025-S1) is available for a commune.
    Priority: full DB (pre-built) > per-commune DB > download+parse on demand.
    Returns {year_label: row_count}.
    """
    results: dict[str, int] = {}
    for year_label, source in DVF_NATIONAL_SOURCES.items():
        resource_id = source["resource_id"]
        url = source["url"]

        if _is_full_db_ready(resource_id):
            # Full DB pre-built — no work needed, lookup will be instant
            logger.info("DVF national %s: full DB ready, skipping per-commune cache", year_label)
            results[year_label] = -1  # sentinel: "available via full DB"
        elif _is_commune_cached(resource_id, code_commune):
            logger.info("DVF national %s: commune %s already cached", year_label, code_commune)
            results[year_label] = 0  # actual count not needed
        else:
            try:
                count = await _download_and_cache_commune(resource_id, url, year_label, code_commune)
                results[year_label] = count
            except Exception:
                logger.exception("DVF national %s: failed for commune %s", year_label, code_commune)
                results[year_label] = 0

    return results


def fetch_national_rows_for_commune(code_commune: str) -> list[dict]:
    """
    Read all national DVF rows (2023, 2024, 2025-S1) for a commune.
    Uses full DB if pre-built, otherwise per-commune DB.
    Call ensure_national_dvf_cached first.
    """
    all_rows: list[dict] = []
    for year_label, source in DVF_NATIONAL_SOURCES.items():
        resource_id = source["resource_id"]

        if _is_full_db_ready(resource_id):
            rows = _query_full_db(resource_id, code_commune)
        else:
            cache_key = _commune_cache_key(resource_id, code_commune)
            db_path = get_db_path(cache_key)
            if not db_path.exists():
                continue
            try:
                conn = sqlite3.connect(str(db_path))
                conn.row_factory = sqlite3.Row
                rows = [dict(r) for r in conn.execute("SELECT * FROM data").fetchall()]
                conn.close()
            except Exception as e:
                logger.warning("DVF per-commune cache read failed (%s, %s): %s", year_label, code_commune, e)
                rows = []

        all_rows.extend(rows)

    return all_rows
