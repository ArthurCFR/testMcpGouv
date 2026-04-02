#!/usr/bin/env python3
"""
Pre-load DVF data for Ile-de-France departments + national DVF (2023+).
Runs at container startup; idempotent (skips already-cached data).

Departments: 75, 77, 78, 91, 92, 93, 94, 95
National: 2023, 2024, 2025-S1
"""

import asyncio
import importlib.util
import sys
import time
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))

import httpx

from helpers import cache_manager, datagouv_api_client

# IDF department resource IDs (from _DVF_DEP_RESOURCES)
IDF_DEPARTMENTS: dict[str, str] = {
    "75": "332eb6ef-fa7e-45dd-96b6-36d347113984",  # Paris
    "77": "e9bfc73d-99b0-421e-803b-b6979981c4f8",  # Seine-et-Marne
    "78": "a5b8aa7f-26b9-4329-9214-cc9b539e78b1",  # Yvelines
    "91": "8fc69940-02a0-4bee-ad41-5f168b1876dd",  # Essonne
    "92": "1bfafb0d-570b-45ef-ac48-ad413870848c",  # Hauts-de-Seine
    "93": "388a7d2d-034c-474e-964b-991185f166ee",  # Seine-Saint-Denis
    "94": "409623c3-da20-4041-bcee-2189f664bb93",  # Val-de-Marne
    "95": "8e00f2cb-323f-47fc-8308-26536f6a5260",  # Val-d'Oise
}

# Import dvf_national_cache for national preload
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


async def preload_dept(dept: str, resource_id: str) -> None:
    """Download and cache a single department's DVF CSV."""
    if cache_manager.is_cached(resource_id):
        print(f"  [dept {dept}] already cached — skipped")
        return

    print(f"  [dept {dept}] fetching resource metadata...", flush=True)
    resource_data = await datagouv_api_client.get_resource_details(resource_id)
    resource = resource_data.get("resource", {})
    resource_url = resource.get("url")
    if not resource_url:
        print(f"  [dept {dept}] ERROR: no download URL")
        return
    resource_title = resource.get("title") or resource.get("name") or resource_id

    print(f"  [dept {dept}] downloading {resource_url.split('/')[-1]}...", end=" ", flush=True)
    t0 = time.time()
    async with httpx.AsyncClient(follow_redirects=True, timeout=300.0) as client:
        resp = await client.get(resource_url)
        resp.raise_for_status()
        content = await resp.aread()
    elapsed = time.time() - t0
    size_mb = len(content) / (1024 * 1024)
    print(f"{size_mb:.0f} MB in {elapsed:.0f}s")

    filename = resource_url.split("/")[-1].split("?")[0].lower()
    is_gzipped = filename.endswith(".gz") or "gzip" in resp.headers.get("content-type", "")

    print(f"  [dept {dept}] ingesting to SQLite...", end=" ", flush=True)
    t0 = time.time()
    cache_manager.ingest_csv_to_cache(
        resource_id=resource_id,
        content=content,
        is_gzipped=is_gzipped,
        resource_url=resource_url,
        resource_title=resource_title,
    )
    print(f"done in {time.time() - t0:.0f}s")


async def preload_national_year(year_label: str, resource_id: str, url: str) -> None:
    """Download and cache a national DVF year."""
    if _is_full_db_ready(resource_id):
        print(f"  [national {year_label}] already cached — skipped")
        return

    # Get ZIP
    zip_bytes = _get_or_invalidate_zip_cache(resource_id)
    if zip_bytes is not None:
        print(f"  [national {year_label}] ZIP in cache ({len(zip_bytes) / 1e6:.0f} MB)")
    else:
        print(f"  [national {year_label}] downloading...", end=" ", flush=True)
        t0 = time.time()
        async with httpx.AsyncClient(follow_redirects=True, timeout=600.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            zip_bytes = resp.content
        print(f"{len(zip_bytes) / 1e6:.0f} MB in {time.time() - t0:.0f}s")
        _save_zip_cache(resource_id, zip_bytes)

    # Parse + store
    print(f"  [national {year_label}] parsing and storing...", flush=True)
    t0 = time.time()
    loop = asyncio.get_running_loop()
    count = await loop.run_in_executor(
        None, parse_and_store_full, resource_id, url, year_label, zip_bytes, None
    )
    print(f"  [national {year_label}] done — {count:,} rows in {time.time() - t0:.0f}s")


async def main() -> None:
    print("=" * 50)
    print("Pre-loading DVF cache (IDF + national)")
    print("=" * 50)
    t0 = time.time()

    # 1. IDF departments (2014-2022)
    print("\n-- IDF departments (2014-2022) --")
    for dept, resource_id in IDF_DEPARTMENTS.items():
        try:
            await preload_dept(dept, resource_id)
        except Exception as e:
            print(f"  [dept {dept}] ERROR: {e}")

    # 2. National DVF (2023+)
    print("\n-- National DVF (2023+) --")
    for year_label, source in DVF_NATIONAL_SOURCES.items():
        try:
            await preload_national_year(year_label, source["resource_id"], source["url"])
        except Exception as e:
            print(f"  [national {year_label}] ERROR: {e}")

    elapsed = time.time() - t0
    print(f"\n{'=' * 50}")
    print(f"Pre-load complete in {elapsed / 60:.1f} min")
    print(f"{'=' * 50}")


if __name__ == "__main__":
    asyncio.run(main())
