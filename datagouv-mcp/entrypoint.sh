#!/bin/bash
set -e

echo "Starting pre-load (skips already cached data)..."
uv run python preload_idf.py

echo "Starting MCP server..."
exec uv run python main.py
