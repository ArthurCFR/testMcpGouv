/**
 * Explore column names for key datasets via the local MCP server.
 * Usage: npx tsx scripts/explore-datasets.ts
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const MCP_URL = process.env.MCP_SERVER_URL ?? "http://localhost:8000/mcp";

const RESOURCES = [
  { id: "851d342f-9c96-41c1-924a-11a7a7aae8a6", label: "DVF" },
  { id: "8cb92c8f-26e2-4705-b9bf-a76aba8c0450", label: "Population légale" },
  { id: "b0d30277-3a14-4673-a988-2fa6c11e030c", label: "Logements sociaux" },
];

async function main() {
  const client = new Client({ name: "explore-datasets", version: "1.0.0" });
  process.stderr.write(`Connecting to MCP at ${MCP_URL}…\n`);

  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    requestInit: { headers: { Host: "localhost" } },
  });

  await client.connect(transport);
  process.stderr.write("Connected.\n\n");

  // Dump tool schemas first
  const { tools } = await client.listTools();
  const qrd = tools.find((t) => t.name === "query_resource_data");
  if (qrd) {
    process.stderr.write(`query_resource_data schema:\n${JSON.stringify(qrd.inputSchema, null, 2)}\n\n`);
  }

  const output: Record<string, { label: string; columns: string[]; sample: unknown[] }> = {};

  for (const { id, label } of RESOURCES) {
    process.stderr.write(`→ ${label} (${id})\n`);

    let raw: CallToolResult;
    try {
      raw = (await client.callTool(
        {
          name: "query_resource_data",
          arguments: { resource_id: id, page_size: 3, question: "liste les colonnes disponibles" },
        },
        undefined,
        { timeout: 60_000 }
      )) as CallToolResult;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`  ✗ Error: ${msg}\n`);
      output[id] = { label, columns: [], sample: [`ERROR: ${msg}`] };
      continue;
    }

    const text = raw.content
      .filter((c) => c.type === "text")
      .map((c) => (c as { type: "text"; text: string }).text)
      .join("\n");

    process.stderr.write(`  Raw response:\n${text}\n`);

    // Parse the JSON result — query_resource_data returns JSON with rows
    let rows: Record<string, unknown>[] = [];
    try {
      const parsed: unknown = JSON.parse(text);
      if (Array.isArray(parsed)) {
        rows = parsed as Record<string, unknown>[];
      } else if (parsed && typeof parsed === "object") {
        // Some tools wrap in { data: [...] } or { results: [...] }
        const p = parsed as Record<string, unknown>;
        const inner = p["data"] ?? p["results"] ?? p["rows"] ?? [];
        if (Array.isArray(inner)) rows = inner as Record<string, unknown>[];
      }
    } catch {
      // Not JSON — try to extract column names from text
      process.stderr.write(`  ⚠ Response is not JSON, storing raw.\n`);
      output[id] = { label, columns: [], sample: [text] };
      continue;
    }

    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    process.stderr.write(`  ✓ ${rows.length} row(s), ${columns.length} column(s)\n`);

    output[id] = { label, columns, sample: rows };
  }

  await client.close();

  // Final JSON to stdout
  process.stdout.write(JSON.stringify(output, null, 2) + "\n");
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
