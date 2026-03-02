import logging

import httpx
from mcp.server.fastmcp import FastMCP

from helpers import cache_manager, datagouv_api_client

logger = logging.getLogger("datagouv_mcp")

MAX_SIZE_MB = 500


def register_download_dataset_to_cache_tool(mcp: FastMCP) -> None:
    @mcp.tool()
    async def download_dataset_to_cache(
        resource_id: str,
        force_refresh: bool = False,
    ) -> str:
        """
        Download a CSV resource from data.gouv.fr and index it in a local SQLite cache.

        This is the FIRST STEP for aggregative queries (department, region, cross-datasets).
        The download happens only once; subsequent calls return immediately if already cached.

        Workflow:
          1. download_dataset_to_cache(resource_id) — download & index (idempotent)
          2. query_cache(resource_id, sql)           — run any SELECT query

        Supports: CSV, CSV.GZ
        Returns: number of rows indexed and available column names.

        Typical workflow for a department:
          download_dataset_to_cache("1b85be7c-17ce-42dc-b191-3b8f3c469087")
          query_cache("1b85be7c-...", "SELECT INSEE_COM, medprix_m2_apt FROM data WHERE INSEE_COM LIKE '75%'")
        """
        try:
            # Return immediately if already cached
            if not force_refresh and cache_manager.is_cached(resource_id):
                info = cache_manager.get_cache_info(resource_id)
                if info:
                    import json
                    cols = json.loads(info.get("columns", "[]"))
                    return (
                        f"Already cached (skipping download).\n"
                        f"Resource: {info.get('resource_title', resource_id)}\n"
                        f"Rows: {info.get('row_count', '?')}\n"
                        f"Cached at: {info.get('cached_at', '?')}\n"
                        f"Columns: {', '.join(cols)}\n\n"
                        f"Table name: data\n"
                        f"Use query_cache(\"{resource_id}\", \"SELECT ...\") to query."
                    )

            # Fetch resource metadata to get download URL
            resource_data = await datagouv_api_client.get_resource_details(resource_id)
            resource = resource_data.get("resource", {})
            if not resource.get("id"):
                return f"Error: Resource with ID '{resource_id}' not found."

            resource_url = resource.get("url")
            if not resource_url:
                return f"Error: Resource {resource_id} has no download URL."

            resource_title = resource.get("title") or resource.get("name") or resource_id

            # Quick format check (non-blocking — some CSVs have no extension in URL)
            filename = resource_url.split("/")[-1].split("?")[0].lower()
            fmt = (resource.get("format") or "").lower()
            is_csv_like = (
                filename.endswith(".csv")
                or filename.endswith(".csv.gz")
                or filename.endswith(".gz")
                or fmt in ("csv", "csv.gz", "text/csv")
            )
            if not is_csv_like:
                return (
                    f"Warning: Resource '{resource_title}' does not appear to be a CSV "
                    f"(filename: {filename}, format: {fmt}). "
                    "Only CSV and CSV.GZ are supported for caching.\n"
                    "Use download_and_parse_resource for other formats."
                )

            # Download
            max_size = MAX_SIZE_MB * 1024 * 1024
            try:
                async with httpx.AsyncClient(follow_redirects=True) as session:
                    resp = await session.get(resource_url, timeout=300.0)
                    resp.raise_for_status()

                    content = b""
                    async for chunk in resp.aiter_bytes(chunk_size=65536):
                        content += chunk
                        if len(content) > max_size:
                            return f"Error: File too large (> {MAX_SIZE_MB} MB). Aborting."

                    content_type = resp.headers.get("Content-Type", "")
                    actual_filename = resource_url.split("/")[-1].split("?")[0]

            except httpx.HTTPStatusError as e:
                return f"Error downloading: HTTP {e.response.status_code} — {e}"
            except Exception as e:  # noqa: BLE001
                return f"Error downloading: {e}"

            file_size_mb = len(content) / (1024 * 1024)

            is_gzipped = (
                actual_filename.lower().endswith(".gz")
                or "gzip" in content_type
            )

            # Ingest into SQLite
            try:
                result = cache_manager.ingest_csv_to_cache(
                    resource_id=resource_id,
                    content=content,
                    is_gzipped=is_gzipped,
                    resource_url=resource_url,
                    resource_title=resource_title,
                )
            except Exception as e:  # noqa: BLE001
                return f"Error indexing data into SQLite: {e}"

            row_count = result["row_count"]
            columns: list[str] = result["columns"]
            indexed: list[str] = result["indexed_columns"]

            lines = [
                f"Downloaded and cached: {resource_title}",
                f"File size: {file_size_mb:.1f} MB",
                f"Rows indexed: {row_count:,}",
                f"Columns ({len(columns)}): {', '.join(columns)}",
            ]
            if indexed:
                lines.append(f"Auto-indexed geo columns: {', '.join(indexed)}")
            lines += [
                "",
                f"Table name: data",
                f"Use query_cache(\"{resource_id}\", \"SELECT ...\") to query.",
            ]
            return "\n".join(lines)

        except Exception as e:  # noqa: BLE001
            logger.exception("Unexpected error in download_dataset_to_cache")
            return f"Error: {e}"
