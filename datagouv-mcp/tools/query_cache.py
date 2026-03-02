import json
import logging

from mcp.server.fastmcp import FastMCP

from helpers import cache_manager

logger = logging.getLogger("datagouv_mcp")

MAX_ROWS = 500


def register_query_cache_tool(mcp: FastMCP) -> None:
    @mcp.tool()
    async def query_cache(
        resource_id: str,
        sql: str,
    ) -> str:
        """
        Execute a SQL SELECT query on a locally cached resource.

        The resource must have been downloaded first with download_dataset_to_cache().
        Supports: SELECT, WHERE, GROUP BY, ORDER BY, LIMIT, aggregate functions (SUM, AVG, COUNT...).
        For cross-resource JOINs, attach the second DB via: ATTACH DATABASE '<path>' AS db2;

        Table name is always: data
        Maximum 500 rows returned.

        Examples:
          -- Median price per arrondissement in Paris
          SELECT INSEE_COM, medprix_m2_apt FROM data WHERE INSEE_COM LIKE '75%' ORDER BY medprix_m2_apt DESC

          -- Aggregated age pyramid for Aveyron department
          SELECT tranche, SUM(femmes) AS f, SUM(hommes) AS h FROM data WHERE COM LIKE '12%' GROUP BY tranche ORDER BY tranche

          -- Top 10 oldest communes
          SELECT COM, NCOM, (pop_65plus * 100.0 / total) AS pct_65 FROM data ORDER BY pct_65 DESC LIMIT 10
        """
        try:
            if not cache_manager.is_cached(resource_id):
                return (
                    f"Resource '{resource_id}' is not in cache.\n"
                    f"Call download_dataset_to_cache(\"{resource_id}\") first."
                )

            if not sql.strip().upper().startswith("SELECT"):
                return "Error: Only SELECT queries are allowed."

            try:
                rows = cache_manager.run_query(resource_id, sql, max_rows=MAX_ROWS)
            except Exception as e:  # noqa: BLE001
                # Helpful error with schema hint
                info = cache_manager.get_cache_info(resource_id)
                cols_hint = ""
                if info:
                    cols = json.loads(info.get("columns", "[]"))
                    cols_hint = f"\nAvailable columns: {', '.join(cols)}"
                return (
                    f"SQL Error: {e}\n"
                    f"Table name: data{cols_hint}\n"
                    f"Tip: inspect with SELECT * FROM data LIMIT 1"
                )

            if not rows:
                return "Query returned 0 rows."

            columns = list(rows[0].keys())
            # Cap column display widths at 30
            col_widths = [
                min(30, max(len(str(c)), max((len(str(r.get(c, "") or "")) for r in rows), default=0)))
                for c in columns
            ]

            header = " | ".join(str(c).ljust(col_widths[i]) for i, c in enumerate(columns))
            separator = "-+-".join("-" * w for w in col_widths)

            limited = len(rows) == MAX_ROWS
            lines = [
                f"Results: {len(rows)} row(s)" + (" (limited to 500 — add LIMIT to your query)" if limited else ""),
                "",
                header,
                separator,
            ]
            for row in rows:
                cells = [str(row.get(col, "") or "")[:col_widths[i]].ljust(col_widths[i])
                         for i, col in enumerate(columns)]
                lines.append(" | ".join(cells))

            lines += [
                "",
                "JSON:",
                json.dumps(rows, ensure_ascii=False, separators=(",", ":")),
            ]

            return "\n".join(lines)

        except Exception as e:  # noqa: BLE001
            logger.exception("Unexpected error in query_cache")
            return f"Error: {e}"
