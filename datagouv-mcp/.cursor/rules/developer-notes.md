# Developer Notes

This file contains implementation details that future contributors (human or LLM) should keep in mind when evolving the MCP server.

## Repository layout

```
├─ main.py                # FastMCP entry point, registers all tools, adds /health endpoint
├─ tools/                 # Individual MCP tool modules
│  ├─ __init__.py        # Tool registration orchestration
│  ├─ search_datasets.py
│  ├─ get_dataset_info.py
│  ├─ list_dataset_resources.py
│  ├─ get_resource_info.py
│  ├─ query_resource_data.py
│  ├─ download_and_parse_resource.py
│  └─ get_metrics.py
└─ helpers/              # API client helpers
   ├─ datagouv_api_client.py   # HTTP client for data.gouv.fr API (v1/v2)
   ├─ tabular_api_client.py   # HTTP client for Tabular API
   ├─ metrics_api_client.py    # HTTP client for Metrics API
   └─ env_config.py            # Environment configuration (base URLs)
```

`.cursor/rules/` (this folder) should stay with the code when migrating to a dedicated repo.

## Configuration

- `DATAGOUV_ENV` selects the target platform (`prod` by default; set to `demo` only when testing against the staging APIs). The helpers derive both API and public-site URLs from this variable.
- `MCP_PORT` defaults to 8000 if not set. Example: `MCP_PORT=8007 uv run python main.py` to use a custom port.
- `MCP_HOST` defaults to `0.0.0.0` if not set. Set to `127.0.0.1` for local development.
- The `CHANGELOG.md` file is generated automatically by `tag_version.sh` when creating a release tag—do not edit it manually between releases.

## datagouv_api_client helpers

| Function | Endpoint | Notes |
| --- | --- | --- |
| `search_datasets` | `GET /1/datasets/` | Handles tags returned as strings or `{name: ...}` objects. |
| `get_dataset_metadata` | `GET /1/datasets/{id}/` | Returns title + descriptions. |
| `get_dataset_details` | `GET /1/datasets/{id}/` | Returns full dataset payload from API v1. |
| `get_resource_metadata` | `GET /2/datasets/resources/{id}/` | Uses API v2 because it exposes richer resource info. |
| `get_resource_details` | `GET /2/datasets/resources/{id}/` | Returns full resource payload from API v2. |
| `get_resources_for_dataset` | `GET /1/datasets/{id}/` | Returns dataset metadata plus `(id, title)` tuple list for resources. |
| `get_resource_and_dataset_metadata` | Combines v1 + v2 | Fetches resource first, then dataset if available. |

Implementation tips:
- The helper functions accept an optional `httpx.AsyncClient` session. They create/close their own session when `session is None`, avoiding "Unclosed client session" warnings.
- All requests use `httpx` (not `aiohttp`). Keep timeouts conservative (current default: 15s for GET requests).

## Adding tools

1. **Define your helper** in the appropriate helper module (`datagouv_api_client.py`, `tabular_api_client.py`, or `metrics_api_client.py`) with tests if possible.
2. **Create the MCP tool** in a new file under `tools/`:
   - Create a new file like `tools/your_tool.py`
   - Define a `register_your_tool_tool(mcp: FastMCP) -> None` function
   - Inside, use `@mcp.tool()` to decorate your async tool function
   - Tools should return strings. Format them for readability (headings, bullet points).
3. **Register the tool** in `tools/__init__.py` by importing and calling your `register_*` function in `register_tools()`.
4. **Update docs** (this folder and README.md) with any new expectations or workflows.

## Error handling patterns

- Tool failures should return a human-readable string, not an exception. This keeps MCP Inspector / clients friendly.
- Include HTTP status and server messages when available.

## Logging / Debugging

- All modules use the shared logger instance ()`logging.getLogger("datagouv_mcp")`  defined in `main.py` for consistent logging.
- The server logs at DEBUG level by default. Helper modules log API requests and errors.
- The server already logs every MCP request type (thanks to FastMCP). Additional logging should be lightweight and contextual.

## Known constraints

- Streamable HTTP is the only supported transport today. If you need STDIO, you must wrap `FastMCP` differently.
- The server includes a `/health` HTTP endpoint (separate from MCP protocol) for health checks and CI testing.
- The server is read-only: all tools only read public data from data.gouv.fr APIs. No authentication is required.
