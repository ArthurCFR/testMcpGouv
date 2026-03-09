#!/usr/bin/env python3
"""
Pre-load DVF national data (2023, 2024, 2025-S1) for ALL communes into SQLite.

Run this once before using the MCP server for the first time (or when data is stale).
After completion, get_dvf_comparables will answer any commune instantly via a simple
SQLite SELECT, instead of downloading and parsing ZIPs on demand.

Usage:
    cd datagouv-mcp
    python preload_dvf_national.py

Storage: ~300-600 MB per year in ~/.datagouv_cache/
Time:    ~5-15 min per year (parse 5-10M rows each), done once
"""

import asyncio
import importlib.util
import sys
import time
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))

import httpx

# Import dvf_national_cache directly (bypasses tools/__init__.py which requires mcp)
_spec = importlib.util.spec_from_file_location(
    "dvf_national_cache", HERE / "tools" / "dvf_national_cache.py"
)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

DVF_NATIONAL_SOURCES = _mod.DVF_NATIONAL_SOURCES
_get_or_invalidate_zip_cache = _mod._get_or_invalidate_zip_cache
_is_full_db_ready = _mod._is_full_db_ready
_save_zip_cache = _mod._save_zip_cache
parse_and_store_full = _mod.parse_and_store_full


def _bar(done: int, total: int, width: int = 30) -> str:
    filled = int(width * done / total) if total else 0
    return f"[{'█' * filled}{'░' * (width - filled)}] {done / total * 100:.0f}%" if total else ""


async def _get_zip(resource_id: str, url: str, year_label: str) -> bytes:
    zip_bytes = _get_or_invalidate_zip_cache(resource_id)
    if zip_bytes is not None:
        print(f"  ZIP déjà en cache local ({len(zip_bytes) / 1e6:.0f} MB)")
        return zip_bytes

    print(f"  Téléchargement {url.split('/')[-1]}...", end=" ", flush=True)
    t0 = time.time()
    async with httpx.AsyncClient(follow_redirects=True, timeout=600.0) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        zip_bytes = resp.content
    elapsed = time.time() - t0
    print(f"{len(zip_bytes) / 1e6:.0f} MB en {elapsed:.0f}s")
    _save_zip_cache(resource_id, zip_bytes)
    return zip_bytes


def _process_year(resource_id: str, url: str, year_label: str, zip_bytes: bytes) -> int:
    """Parse full ZIP with progress display. Runs in main thread (called from executor)."""
    # Approximate total rows for progress bar (5M is a rough estimate per year)
    APPROX_TOTAL = 5_000_000

    last_print = [0.0]
    t0 = time.time()

    def progress(rows_parsed: int) -> None:
        now = time.time()
        if now - last_print[0] < 1.0:
            return
        last_print[0] = now
        bar = _bar(rows_parsed, APPROX_TOTAL)
        elapsed = now - t0
        rate = rows_parsed / elapsed if elapsed > 0 else 0
        eta = (APPROX_TOTAL - rows_parsed) / rate if rate > 0 else 0
        print(
            f"\r  {bar}  {rows_parsed / 1e6:.1f}M lignes  "
            f"{rate / 1000:.0f}k/s  ETA {eta:.0f}s   ",
            end="",
            flush=True,
        )

    count = parse_and_store_full(resource_id, url, year_label, zip_bytes, progress_cb=progress)
    elapsed = time.time() - t0
    print(f"\r  ✓ {count:,} lignes résidentielles stockées en {elapsed:.0f}s" + " " * 30)
    return count


async def main() -> None:
    print("=" * 60)
    print("DVF national — pré-chargement du cache SQLite")
    print("=" * 60)
    print()

    total_start = time.time()
    grand_total = 0

    for year_label, source in DVF_NATIONAL_SOURCES.items():
        resource_id = source["resource_id"]
        url = source["url"]

        print(f"── {year_label} ──────────────────────────────")

        if _is_full_db_ready(resource_id):
            print(f"  ✓ Déjà en cache — ignoré\n")
            continue

        # Step 1 — get ZIP
        zip_bytes = await _get_zip(resource_id, url, year_label)

        # Step 2 — parse + store (CPU-bound, run in executor)
        print(f"  Parsing {len(zip_bytes) / 1e6:.0f} MB compressé → toutes communes...")
        loop = asyncio.get_running_loop()
        count = await loop.run_in_executor(
            None, _process_year, resource_id, url, year_label, zip_bytes
        )
        grand_total += count
        print()

    total_elapsed = time.time() - total_start
    print("=" * 60)
    print(f"✓ Terminé en {total_elapsed / 60:.1f} min — {grand_total:,} lignes au total")
    print()
    print("Le serveur MCP peut maintenant répondre en < 1s pour toute commune.")


if __name__ == "__main__":
    asyncio.run(main())
