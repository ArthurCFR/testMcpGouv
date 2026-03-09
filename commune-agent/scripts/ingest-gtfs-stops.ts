#!/usr/bin/env tsx
/**
 * Downloads the consolidated GTFS stops CSV from transport.data.gouv.fr
 * and builds a SQLite index for fast proximity queries.
 *
 * Usage:    npm run ingest-stops
 * Refresh:  re-run whenever needed — skips download if index is < 7 days old.
 */

import * as https from "https";
import * as http from "http";
import * as readline from "readline";
import * as fs from "fs";
import * as path from "path";
import Database from "better-sqlite3";
import type { IncomingMessage } from "http";

const CSV_URL =
  "https://static.data.gouv.fr/resources/arrets-de-transport-en-france/20260113-104155/gtfs-stops-france-export-2026-01-13.csv";
const DATA_DIR = path.join(__dirname, "..", "data");
const DB_PATH = path.join(DATA_DIR, "stops.db");
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// ── Mode inference from agency name ──────────────────────────────────────────

function inferMode(agencyName: string): string {
  const s = agencyName.toLowerCase();
  if (s.includes("métro") || s.includes("metro") || s.includes("subway")) return "metro";
  if (s.includes("tram")) return "tram";
  if (
    s.includes("sncf") ||
    /\bter\b/.test(s) ||
    s.includes("intercit") ||
    s.includes("transilien") ||
    /\btrain\b/.test(s)
  )
    return "train";
  return "bus";
}

// ── Quote-aware CSV line parser ───────────────────────────────────────────────

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQ = !inQ;
      }
    } else if (c === "," && !inQ) {
      fields.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  fields.push(cur);
  return fields;
}

// ── Streaming download ────────────────────────────────────────────────────────

function streamGet(url: string): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(url, { headers: { "User-Agent": "CommuneAgent-Ingest/1.0" } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        resolve(streamGet(res.headers.location!));
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      resolve(res);
    });
    req.on("error", reject);
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Skip if index is fresh
  if (fs.existsSync(DB_PATH)) {
    const ageMs = Date.now() - fs.statSync(DB_PATH).mtimeMs;
    if (ageMs < MAX_AGE_MS) {
      const ageH = Math.round(ageMs / 3_600_000);
      console.log(`Index is ${ageH}h old — skipping re-download (threshold: 7 days).`);
      return;
    }
    console.log("Index is stale — rebuilding...");
    fs.unlinkSync(DB_PATH);
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });

  // Set up SQLite
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = OFF");

  db.exec(`
    CREATE TABLE stops (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      stop_name  TEXT NOT NULL,
      stop_lat   REAL NOT NULL,
      stop_lon   REAL NOT NULL,
      mode       TEXT NOT NULL,
      agency     TEXT
    );
  `);

  const insert = db.prepare(
    "INSERT INTO stops (stop_name, stop_lat, stop_lon, mode, agency) VALUES (?,?,?,?,?)"
  );
  const insertBatch = db.transaction(
    (rows: [string, number, number, string, string][]) => {
      for (const r of rows) insert.run(r[0], r[1], r[2], r[3], r[4]);
    }
  );

  // Stream download → parse → insert
  console.log("Downloading CSV...");
  const response = await streamGet(CSV_URL);

  let count = 0;
  let batch: [string, number, number, string, string][] = [];
  let colStopName = 9;
  let colStopLat = 10;
  let colStopLon = 11;
  let colAgency = 14;
  let isHeader = true;

  await new Promise<void>((resolve, reject) => {
    const rl = readline.createInterface({ input: response, crlfDelay: Infinity });

    rl.on("line", (line) => {
      if (!line.trim()) return;

      if (isHeader) {
        // Resolve column indices dynamically from the header row
        const headers = parseCsvLine(line);
        colStopName = headers.indexOf("stop_name");
        colStopLat = headers.indexOf("stop_lat");
        colStopLon = headers.indexOf("stop_lon");
        colAgency = headers.indexOf("agency_name");
        isHeader = false;
        return;
      }

      const f = parseCsvLine(line);
      const name = f[colStopName]?.trim();
      const lat = parseFloat(f[colStopLat]);
      const lon = parseFloat(f[colStopLon]);
      const agency = f[colAgency]?.trim() ?? "";

      if (!name || isNaN(lat) || isNaN(lon)) return;

      batch.push([name, lat, lon, inferMode(agency), agency]);

      if (batch.length >= 5_000) {
        insertBatch(batch);
        count += batch.length;
        batch = [];
        if (count % 100_000 === 0) {
          process.stdout.write(`\r  ${count.toLocaleString()} stops ingested...`);
        }
      }
    });

    rl.on("close", () => {
      if (batch.length > 0) {
        insertBatch(batch);
        count += batch.length;
      }
      resolve();
    });

    rl.on("error", reject);
    response.on("error", reject);
  });

  process.stdout.write("\n");
  console.log(`Building spatial index on ${count.toLocaleString()} stops...`);
  db.exec("CREATE INDEX idx_geo ON stops(stop_lat, stop_lon);");
  db.close();

  console.log(`Done — index written to ${DB_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
