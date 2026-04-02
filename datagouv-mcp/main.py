import asyncio
import json
import logging
import os
import sys
from datetime import datetime, timezone
from importlib.metadata import PackageNotFoundError, version
from typing import Awaitable, Callable

import uvicorn
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings

from helpers.accessibility_api import handle_accessibility_request
from helpers.http import patch_httpx_ipv4
from helpers.matomo import track_matomo
from tools import register_tools

# Force IPv4 for all httpx clients — some gov APIs are IPv4-only and
# Python 3.14 Happy Eyeballs on Railway may try IPv6 first and fail.
patch_httpx_ipv4()

# Configure logging
LOGGER_NAME = "datagouv_mcp"
_log_level = logging.DEBUG if os.getenv("DATAGOUV_ENV") != "prod" else logging.INFO
logging.basicConfig(
    level=_log_level,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(LOGGER_NAME)
logger.setLevel(_log_level)
# Silence verbose HTTP debug logs in prod
if _log_level >= logging.INFO:
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)

# Configure transport security for DNS rebinding protection (mcp >= 1.23)
# Per MCP spec: MUST validate Origin header, SHOULD bind to localhost when running locally
# EXTRA_ALLOWED_ORIGINS: comma-separated list of additional origins (e.g. Vercel frontend)
# RAILWAY_PUBLIC_DOMAIN: auto-set by Railway (e.g. immoagent-production.up.railway.app)
_extra_origins = [
    o.strip() for o in os.getenv("EXTRA_ALLOWED_ORIGINS", "").split(",") if o.strip()
]
_extra_hosts = [
    o.replace("https://", "").replace("http://", "").split(":")[0]
    for o in _extra_origins
]
_railway_host = os.getenv("RAILWAY_PUBLIC_DOMAIN", "")

transport_security = TransportSecuritySettings(
    enable_dns_rebinding_protection=bool(_extra_origins),  # enable in prod, disable in local dev
    allowed_hosts=[
        "mcp.data.gouv.fr",
        "mcp.preprod.data.gouv.fr",
        "localhost",
        "127.0.0.1",
        *_extra_hosts,
        *([_railway_host] if _railway_host else []),
    ],
    # Validate Origin header to prevent DNS rebinding attacks (MCP spec requirement)
    allowed_origins=[
        "https://mcp.data.gouv.fr",
        "https://mcp.preprod.data.gouv.fr",
        "http://localhost:*",
        "http://127.0.0.1:*",
        *_extra_origins,
    ],
)

mcp = FastMCP("data.gouv.fr MCP server", transport_security=transport_security)
register_tools(mcp)


def with_monitoring(
    inner_app: Callable[[dict, Callable, Callable], Awaitable[None]],
):
    async def app(scope, receive, send):
        # We only track HTTP requests (The /mcp endpoint and others)
        if scope["type"] == "http":
            path: str = scope.get("path", "")
            method: str = scope.get("method", "")

            # GET /mcp: SDK clients expect 405 to gracefully skip SSE notifications.
            # FastMCP returns 406 which the MCP SDK treats as a hard error.
            if method == "GET" and path == "/mcp":
                await send({"type": "http.response.start", "status": 405, "headers": [(b"content-length", b"0"), (b"allow", b"POST")]})
                await send({"type": "http.response.body", "body": b""})
                return

            # Handle /api/accessibility endpoint (CORS preflight + POST)
            if path == "/api/accessibility":
                if method == "OPTIONS":
                    await send({"type": "http.response.start", "status": 204, "headers": [
                        (b"access-control-allow-origin", b"*"),
                        (b"access-control-allow-methods", b"POST, OPTIONS"),
                        (b"access-control-allow-headers", b"Content-Type"),
                        (b"access-control-max-age", b"86400"),
                        (b"content-length", b"0"),
                    ]})
                    await send({"type": "http.response.body", "body": b""})
                    return
                if method == "POST":
                    await handle_accessibility_request(scope, receive, send)
                    return

            # Handle /health endpoint (no tracking)
            if path == "/health":
                timestamp = datetime.now(timezone.utc).isoformat()
                # Get version from package metadata (managed by setuptools-scm)
                try:
                    app_version = version("datagouv-mcp")
                except PackageNotFoundError:
                    app_version = "unknown"

                body = json.dumps(
                    {"status": "ok", "timestamp": timestamp, "version": app_version}
                ).encode("utf-8")
                headers = [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode("utf-8")),
                ]
                await send(
                    {"type": "http.response.start", "status": 200, "headers": headers}
                )
                await send({"type": "http.response.body", "body": body})
                return

            # Matomo Tracking for /mcp requests
            # Convert ASGI headers list to a dictionary for the helper
            headers_dict: dict[str, str] = {
                k.decode("utf-8"): v.decode("utf-8")
                for k, v in scope.get("headers", [])
            }

            # Construct the full URL
            host: str = headers_dict.get("host", "localhost")
            full_url: str = f"https://{host}{path}"

            # Fire the tracking task in the background
            # Since path is always /mcp, the helper will log "MCP Request: /mcp"
            asyncio.create_task(
                track_matomo(url=full_url, path=path, headers=headers_dict)
            )

        # Continue the MCP server logic
        await inner_app(scope, receive, send)

    return app


asgi_app = with_monitoring(mcp.streamable_http_app())


# Run with streamable HTTP transport
if __name__ == "__main__":
    port_str = os.getenv("PORT", os.getenv("MCP_PORT", "8000"))
    try:
        port = int(port_str)
    except ValueError:
        print(
            f"Error: Invalid MCP_PORT environment variable: {port_str}",
            file=sys.stderr,
        )
        sys.exit(1)

    # Per MCP spec: SHOULD bind to localhost when running locally
    # Default to 0.0.0.0 for production (no breaking change)
    # Set MCP_HOST=127.0.0.1 for local development to follow MCP security best practices
    host = os.getenv("MCP_HOST", "0.0.0.0")
    uvicorn.run(asgi_app, host=host, port=port, log_level="info")
