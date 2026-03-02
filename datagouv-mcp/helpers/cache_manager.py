import csv
import gzip
import io
import json
import logging
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger("datagouv_mcp")

# Geo columns that get automatic SQLite indexes
_GEO_INDEX_COLUMNS = {
    "com", "dep", "reg", "insee_com", "codgeo", "code_commune",
    "code_geo", "code_insee", "inseecom", "commune",
}

CACHE_DIR = Path(os.getenv("DATAGOUV_CACHE_DIR", str(Path.home() / ".datagouv_cache")))


def get_db_path(resource_id: str) -> Path:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    return CACHE_DIR / f"{resource_id}.db"


def is_cached(resource_id: str) -> bool:
    db_path = get_db_path(resource_id)
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


def get_cache_info(resource_id: str) -> dict[str, Any] | None:
    db_path = get_db_path(resource_id)
    if not db_path.exists():
        return None
    try:
        conn = sqlite3.connect(str(db_path))
        cur = conn.execute("SELECT key, value FROM _meta")
        info = dict(cur.fetchall())
        conn.close()
        return info
    except Exception:
        return None


def _sanitize_column(name: str) -> str:
    """Sanitize a column name to be a valid SQLite identifier."""
    sanitized = "".join(c if c.isalnum() or c == "_" else "_" for c in name)
    if sanitized and sanitized[0].isdigit():
        sanitized = "col_" + sanitized
    return sanitized or "col"


def ingest_csv_to_cache(
    resource_id: str,
    content: bytes,
    is_gzipped: bool,
    resource_url: str,
    resource_title: str,
) -> dict[str, Any]:
    """
    Parse CSV bytes and store all rows in a local SQLite database.

    Returns dict with row_count, columns, indexed_columns.
    """
    if is_gzipped:
        content = gzip.decompress(content)

    text = content.decode("utf-8-sig")  # Handle BOM

    # Auto-detect delimiter
    sample_text = "\n".join(text.split("\n")[:5])
    delimiter = ","
    try:
        delimiter = csv.Sniffer().sniff(sample_text, delimiters=",;\t|").delimiter
    except (csv.Error, AttributeError):
        counts = {",": sample_text.count(","), ";": sample_text.count(";"),
                  "\t": sample_text.count("\t"), "|": sample_text.count("|")}
        best = max(counts.items(), key=lambda x: x[1])
        if best[1] >= 2:
            delimiter = best[0]

    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
    if reader.fieldnames is None:
        raise ValueError("CSV has no headers")

    raw_columns = list(reader.fieldnames)
    columns = [_sanitize_column(c) for c in raw_columns]

    db_path = get_db_path(resource_id)
    conn = sqlite3.connect(str(db_path))
    try:
        conn.execute("DROP TABLE IF EXISTS data")
        conn.execute("DROP TABLE IF EXISTS _meta")
        conn.execute("CREATE TABLE _meta (key TEXT PRIMARY KEY, value TEXT)")

        col_defs = ", ".join(f'"{c}" TEXT' for c in columns)
        conn.execute(f"CREATE TABLE data ({col_defs})")

        placeholders = ", ".join("?" for _ in columns)
        insert_sql = f"INSERT INTO data VALUES ({placeholders})"

        batch: list[tuple[str, ...]] = []
        row_count = 0
        BATCH_SIZE = 1000

        for raw_row in reader:
            row_tuple = tuple(raw_row.get(orig, "") or "" for orig in raw_columns)
            batch.append(row_tuple)
            if len(batch) >= BATCH_SIZE:
                conn.executemany(insert_sql, batch)
                conn.commit()
                row_count += len(batch)
                batch = []

        if batch:
            conn.executemany(insert_sql, batch)
            conn.commit()
            row_count += len(batch)

        # Auto-index known geo columns
        indexed_cols = []
        for col in columns:
            if col.lower() in _GEO_INDEX_COLUMNS:
                conn.execute(f'CREATE INDEX IF NOT EXISTS "idx_{col}" ON data ("{col}")')
                indexed_cols.append(col)
        conn.commit()

        now = datetime.now(timezone.utc).isoformat()
        meta = [
            ("row_count", str(row_count)),
            ("columns", json.dumps(columns)),
            ("raw_columns", json.dumps(raw_columns)),
            ("cached_at", now),
            ("resource_url", resource_url),
            ("resource_title", resource_title),
            ("indexed_columns", json.dumps(indexed_cols)),
        ]
        conn.executemany("INSERT INTO _meta VALUES (?, ?)", meta)
        conn.commit()

        return {"row_count": row_count, "columns": columns, "indexed_columns": indexed_cols}
    finally:
        conn.close()


def run_query(
    resource_id: str,
    sql: str,
    max_rows: int = 500,
) -> list[dict[str, Any]]:
    """
    Execute a SELECT query on a cached resource.

    Raises FileNotFoundError if resource is not cached.
    Raises ValueError if SQL is not a SELECT statement.
    """
    db_path = get_db_path(resource_id)
    if not db_path.exists():
        raise FileNotFoundError(f"Resource {resource_id} is not cached.")

    if not sql.strip().upper().startswith("SELECT"):
        raise ValueError("Only SELECT queries are allowed.")

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    try:
        cur = conn.execute(sql)
        rows = cur.fetchmany(max_rows)
        return [dict(row) for row in rows]
    finally:
        conn.close()
