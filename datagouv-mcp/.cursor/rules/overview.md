# data.gouv.fr MCP Server — Overview

This document captures the key concepts behind the data.gouv.fr MCP server implementation.

## Goals

- Provide a Model Context Protocol (MCP) server that exposes data.gouv.fr datasets and resources to LLM clients such as Cursor, Windsurf, Claude Desktop, Gemini CLI, etc.
- Offer a comprehensive set of read-only tools that allow chatbots to discover datasets, explore resources, query data, and retrieve metrics.
- Rely either on the **demo** environment or the **prod** environment: the base URL automatically switches between `https://demo.data.gouv.fr/api/` and `https://www.data.gouv.fr/api/` using the `DATAGOUV_ENV` environment variable (defaults to **prod**).

## Architecture

### FastMCP server

- The server lives in `main.py` and instantiates a single `FastMCP` app.
- Transport: **Streamable HTTP** only. The server is launched with `uvicorn`.
- There is **no** STDIO or SSE mode.
- `MCP_PORT` environment variable defaults to 8000 if not set.
- `MCP_HOST` environment variable defaults to `0.0.0.0` if not set.
- The server includes a `/health` HTTP endpoint (separate from MCP protocol) that returns `{"status":"ok","timestamp":"..."}` for health checks and CI testing.

### Tools

The server provides 7 read-only tools, each defined in its own module under `tools/`:

| Tool | Purpose | Data source |
| --- | --- | --- |
| `search_datasets` | Keyword search across datasets (title/description/tags). Returns a formatted text summary with metadata and resource counts. | data.gouv.fr API v1 – `GET /1/datasets/` |
| `get_dataset_info` | Get detailed information about a specific dataset (metadata, organization, tags, dates, license, etc.). | data.gouv.fr API v1 – `GET /1/datasets/{id}/` |
| `list_dataset_resources` | List all resources (files) in a dataset with their metadata (format, size, type, URL). | data.gouv.fr API v1/v2 |
| `get_resource_info` | Get detailed information about a specific resource (format, size, MIME type, URL, dataset association, Tabular API availability). | data.gouv.fr API v2 – `GET /2/datasets/resources/{id}/` |
| `query_resource_data` | Query data from a resource via the Tabular API. Fetches rows from a specific resource to answer questions. | Tabular API |
| `download_and_parse_resource` | Download and parse a resource that is not accessible via Tabular API (files too large, formats not supported, external URLs). Supports CSV, CSV.GZ, JSON, JSONL. | Direct file download |
| `get_metrics` | Get metrics (visits, downloads) for a dataset and/or a resource. Returns monthly statistics. **Note:** Only works with `DATAGOUV_ENV=prod`. | Metrics API |

Implementation details:
- All tools are annotated with `@mcp.tool()` and return plain strings (LLMs handle free-form text better in this case).
- Tools are organized in individual files under `tools/` and registered via `tools/__init__.py`.
- HTTP errors are caught and rendered as readable text for the LLM.
- The server is read-only: no authentication is required for any operations.

### HTTP client layer

- `helpers/datagouv_api_client.py` wraps all calls to data.gouv.fr API (demo or prod).
- `helpers/tabular_api_client.py` handles Tabular API requests for querying resource data.
- `helpers/metrics_api_client.py` handles Metrics API requests for dataset/resource statistics.
- `helpers/env_config.py` manages environment configuration and base URL derivation.
- Dataset search + metadata rely on API **v1**; resource metadata relies on API **v2**.
- Sessions are created ad hoc if not provided, and always closed in `finally` blocks to avoid unclosed connector warnings.
- All helpers use `httpx` for async HTTP requests.
- `DATAGOUV_ENV` picks between the demo/prod hosts.

## Running locally

```bash
# Install project deps (uv preferred)
uv sync --group dev

# Start MCP server (MCP_PORT defaults to 8000)
uv run python main.py

# Or with custom port
MCP_PORT=8007 uv run python main.py

# Test health endpoint
curl http://127.0.0.1:8000/health
```

The server logs at DEBUG level by default. All tool calls are logged via the shared logger instance.

## MCP client expectations

- Clients must send requests via the Streamable HTTP transport (`POST /mcp`).
- The server is read-only: no API keys or authentication are required.
- All tools work with public data from data.gouv.fr APIs.
- The `/health` endpoint is available for health checks outside the MCP protocol.

## Adding new capabilities

1. **New Tool**:
   - Create a new file under `tools/` (e.g., `tools/your_tool.py`)
   - Define a `register_your_tool_tool(mcp: FastMCP) -> None` function
   - Inside, use `@mcp.tool()` to decorate your async tool function
   - Leverage helpers in `datagouv_api_client`, `tabular_api_client`, or `metrics_api_client`
   - Keep output textual unless structured data is absolutely needed
   - Register the tool in `tools/__init__.py`
2. **HTTP helper**: extend the appropriate helper module (`datagouv_api_client`, `tabular_api_client`, or `metrics_api_client`) with additional endpoints. Always close sessions, and raise informative errors (e.g., include response body for 4xx).

## Deployment checklist

- Ensure `DATAGOUV_ENV` is set correctly for the environment you deploy to so dataset links keep pointing to the right public site.
- Expose `MCP_PORT` (defaults to 8000) via the surrounding process manager; the FastMCP app itself is stateless.
- Front the service with HTTPS if exposed publicly. Clients such as Cursor expect HTTPS in production.
- The `/health` endpoint can be used for health checks and monitoring.
- CI/CD: The project uses CircleCI for automated testing (see `.circleci/config.yml`). Tests cover helper modules; the MCP server wiring is best exercised via the MCP Inspector.
