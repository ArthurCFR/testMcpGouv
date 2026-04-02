FROM astral/uv:python3.14-trixie-slim@sha256:479708d509db76335f36d87b68ff8d781b6f7ef7b0495889eca96e1f5de7b1bb

# Install needed apt packages
RUN apt-get update -y && \
    apt-get install -y --no-install-recommends git && \
    rm -rf /var/lib/apt/lists/*

# Install dependencies
WORKDIR /app
COPY . /app/
# Railway uploads without .git — setuptools-scm needs a fallback version
ENV SETUPTOOLS_SCM_PRETEND_VERSION=0.1.0
RUN uv sync --frozen

# Expose port (default 8000, configurable via MCP_PORT env var)
EXPOSE 8000

# Run — preload IDF cache (idempotent) then start MCP server
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
ENTRYPOINT ["/app/entrypoint.sh"]
