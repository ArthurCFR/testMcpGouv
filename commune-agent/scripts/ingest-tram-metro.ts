#!/usr/bin/env tsx
/**
 * Downloads GTFS feeds for all French tram, metro & RER networks (incl. IDF),
 * extracts stops with their line names, and builds a SQLite index.
 *
 * Usage:    npm run ingest-tram-metro
 * Refresh:  re-run — skips feeds whose data is < 7 days old.
 *
 * route_type 0 (tram), 1 (metro), 2 (RER/rail), 5 (cable-car), 12 (monorail).
 * Bus lines (route_type 3) are ignored entirely.
 * IDF feeds are fetched dynamically from the IDFM OpenDataSoft API.
 */

import AdmZip from "adm-zip";
import Database from "better-sqlite3";
import * as https from "https";
import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import type { IncomingMessage } from "http";

// ── French tram & metro GTFS feeds ───────────────────────────────────────────
// Source: transport.data.gouv.fr — update URLs here when feeds change.
const FEEDS: { name: string; url: string }[] = [
  // ── Metro + Tram ─────────────────────────────────────────────────────────
  { name: "TCL Lyon",             url: "https://www.data.gouv.fr/api/1/datasets/r/abebedc6-28cf-4e2e-9c64-db57a40156f8" },
  { name: "Ilévia Lille",         url: "https://www.data.gouv.fr/api/1/datasets/r/c9e5dd3f-8eed-4ad7-aec2-915240599cf6" },
  { name: "Tisséo Toulouse",      url: "https://www.data.gouv.fr/api/1/datasets/r/64318177-f5b5-4144-a6be-2d0f22d26c77" },
  { name: "Star Rennes",          url: "https://www.data.gouv.fr/api/1/datasets/r/ff0dffab-3cf5-4c6b-b576-05bd462a1e33" },
  { name: "RTM Marseille",        url: "https://www.data.gouv.fr/api/1/datasets/r/10e025a1-9048-4c19-925a-466b2a79232f" },
  { name: "Astuce Rouen",         url: "https://www.data.gouv.fr/api/1/datasets/r/c0ebcf01-954a-4d24-b2d8-a00333ffe937" },
  // ── Tram ─────────────────────────────────────────────────────────────────
  { name: "TBM Bordeaux",         url: "https://www.data.gouv.fr/api/1/datasets/r/10b87ffe-e6bb-494d-93df-bb6019e223d9" },
  { name: "CTS Strasbourg",       url: "https://www.data.gouv.fr/api/1/datasets/r/eeea9e52-4f8a-459e-aef5-a093a3b05356" },
  { name: "TAG Grenoble",         url: "https://www.data.gouv.fr/api/1/datasets/r/b6ec7ba4-09bc-46df-b9a1-79a2c2668cf2" },
  { name: "Lignes d'Azur Nice",   url: "https://www.data.gouv.fr/api/1/datasets/r/f5678ab2-c863-4b48-ba1f-9021c7d97634" },
  { name: "TaM Montpellier",      url: "https://www.data.gouv.fr/api/1/datasets/r/350c3f75-226e-4570-960a-dec2144926b6" },
  { name: "Naolib Nantes",        url: "https://www.data.gouv.fr/api/1/datasets/r/a18d5977-ca80-4712-a9cf-1a555feb2621" },
  { name: "STAS Saint-Étienne",   url: "https://www.data.gouv.fr/api/1/datasets/r/fc66b270-658c-4678-9794-229a1a8a4938" },
  { name: "DiviaMobilités Dijon", url: "https://www.data.gouv.fr/api/1/datasets/r/e0dbd217-15cd-4e28-9459-211a27511a34" },
  { name: "Twisto Caen",          url: "https://www.data.gouv.fr/api/1/datasets/r/71728bd6-b9a4-48e3-93ee-ac566e42fe99" },
  { name: "T2C Clermont-Ferrand", url: "https://www.data.gouv.fr/api/1/datasets/r/4e237a58-cd14-4746-b729-1337a40a8a7b" },
  { name: "TAO Orléans",          url: "https://www.data.gouv.fr/api/1/datasets/r/b2dfbaa3-47e9-4749-b6a4-750bebd760e7" },
  { name: "Irigo Angers",         url: "https://www.data.gouv.fr/api/1/datasets/r/32f30b64-33f7-43bb-9b6f-34c21c2f83a3" },
  { name: "Fil Bleu Tours",       url: "https://www.data.gouv.fr/api/1/datasets/r/f48ed7c9-5ce0-4874-93dd-c95272530510" },
  { name: "Grand Reims Mobilités",url: "https://transport.data.gouv.fr/resources/80594/download" },
  { name: "Bibus Brest",          url: "https://www.data.gouv.fr/api/1/datasets/r/583d1419-058b-481b-b378-449cab744c82" },
  { name: "SETRAM Le Mans",       url: "https://www.data.gouv.fr/api/1/datasets/r/5339d96c-6d20-4a01-939a-40f7b56d6cc1" },
  { name: "Transvilles Valenciennes", url: "https://www.data.gouv.fr/api/1/datasets/r/15438966-8d3c-4dd9-8905-189379ea4c7d" },
  { name: "Soléa Mulhouse",       url: "https://www.data.gouv.fr/api/1/datasets/r/7db50c2d-3fe4-4d3d-9942-57ac37c93a8d" },
  { name: "Ginko Besançon",       url: "https://www.data.gouv.fr/api/1/datasets/r/e18e0aeb-8805-47fd-bcdb-c226d21c96fe" },
];

// GTFS route_type values we care about (0=tram, 1=metro, 2=RER/rail, 5=cable-car, 12=monorail)
const TRAM_METRO_TYPES = new Set(["0", "1", "2", "5", "12"]);

function routeTypeToMode(t: string): "tram" | "metro" | "rer" {
  if (t === "0") return "tram";
  if (t === "2") return "rer";
  return "metro";
}

const DATA_DIR = path.join(__dirname, "..", "data");
const DB_PATH  = path.join(DATA_DIR, "tram-metro.db");
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// ── HTTP download ─────────────────────────────────────────────────────────────

function downloadToBuffer(url: string, extraHeaders: Record<string, string> = {}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(url, { headers: { "User-Agent": "CommuneAgent-Ingest/1.0", ...extraHeaders } }, (res: IncomingMessage) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        resolve(downloadToBuffer(res.headers.location!, extraHeaders));
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.setTimeout(180_000, () => { req.destroy(); reject(new Error("Download timeout")); });
  });
}

// ── CSV parsing ───────────────────────────────────────────────────────────────

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === "," && !inQ) {
      fields.push(cur.trim()); cur = "";
    } else {
      cur += c;
    }
  }
  fields.push(cur.trim());
  return fields;
}

/** Parse a GTFS CSV buffer to an array of row objects. */
function parseCsv(buf: Buffer): Record<string, string>[] {
  const text = buf.toString("utf-8").replace(/^\ufeff/, ""); // strip BOM
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const vals = parseCsvLine(line);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) row[headers[j]] = vals[j] ?? "";
    rows.push(row);
  }
  return rows;
}

// ── Find a GTFS entry regardless of path prefix ───────────────────────────────

function getEntry(zip: AdmZip, name: string): Buffer | null {
  const entries = zip.getEntries();
  const match = entries.find((e) => e.entryName === name || e.entryName.endsWith(`/${name}`));
  return match ? match.getData() : null;
}

// ── Process one GTFS zip ──────────────────────────────────────────────────────

interface StopRow {
  name: string;
  lat: number;
  lon: number;
  mode: "tram" | "metro" | "rer";
  lines: string[]; // sorted route short_names
  network: string;
}

function processGtfsZip(buf: Buffer, networkName: string): StopRow[] {
  const zip = new AdmZip(buf);

  // 1. routes.txt → filter to tram/metro
  const routesBuf = getEntry(zip, "routes.txt");
  if (!routesBuf) return [];
  const routesRows = parseCsv(routesBuf);
  // route_id → { short_name, mode }
  const targetRoutes = new Map<string, { shortName: string; mode: "tram" | "metro" | "rer" }>();
  for (const r of routesRows) {
    if (TRAM_METRO_TYPES.has(r.route_type)) {
      const shortName = (r.route_short_name || r.route_long_name || r.route_id).trim();
      targetRoutes.set(r.route_id, { shortName, mode: routeTypeToMode(r.route_type) });
    }
  }
  if (targetRoutes.size === 0) return []; // bus-only feed — skip

  // 2. trips.txt → trip_id → route_id (only for target routes)
  const tripsBuf = getEntry(zip, "trips.txt");
  if (!tripsBuf) return [];
  const tripsRows = parseCsv(tripsBuf);
  const targetTrips = new Map<string, string>(); // trip_id → route_id
  for (const t of tripsRows) {
    if (targetRoutes.has(t.route_id)) targetTrips.set(t.trip_id, t.route_id);
  }

  // 3. stop_times.txt → stop_id → Set of route_ids
  const stopTimesBuf = getEntry(zip, "stop_times.txt");
  if (!stopTimesBuf) return [];
  const stopRoutes = new Map<string, Set<string>>(); // stop_id → Set<route_id>
  const stopTimesText = stopTimesBuf.toString("utf-8").replace(/^\ufeff/, "");
  const stLines = stopTimesText.split(/\r?\n/);
  const stHeaders = parseCsvLine(stLines[0]);
  const tripCol = stHeaders.indexOf("trip_id");
  const stopCol = stHeaders.indexOf("stop_id");
  for (let i = 1; i < stLines.length; i++) {
    const raw = stLines[i].trim();
    if (!raw) continue;
    // stop_times rarely has quoted fields — fast comma split
    const cols = raw.split(",");
    const tripId = cols[tripCol]?.trim();
    const stopId = cols[stopCol]?.trim();
    if (!tripId || !stopId) continue;
    const routeId = targetTrips.get(tripId);
    if (!routeId) continue;
    if (!stopRoutes.has(stopId)) stopRoutes.set(stopId, new Set());
    stopRoutes.get(stopId)!.add(routeId);
  }

  // 4. stops.txt → name, lat, lon for our stop IDs
  const stopsBuf = getEntry(zip, "stops.txt");
  if (!stopsBuf) return [];
  const stopsRows = parseCsv(stopsBuf);

  const result: StopRow[] = [];
  for (const s of stopsRows) {
    const routeIds = stopRoutes.get(s.stop_id);
    if (!routeIds) continue;
    const lat = parseFloat(s.stop_lat);
    const lon = parseFloat(s.stop_lon);
    if (isNaN(lat) || isNaN(lon)) continue;

    // Collect all short names and modes served at this stop
    // Priority: metro > rer > tram
    const lineNamesArr: string[] = [];
    let primaryMode: "tram" | "metro" | "rer" = "tram";
    routeIds.forEach((rid) => {
      const route = targetRoutes.get(rid)!;
      lineNamesArr.push(route.shortName);
      if (route.mode === "metro") primaryMode = "metro";
      else if (route.mode === "rer" && primaryMode !== "metro") primaryMode = "rer";
    });

    result.push({
      name: s.stop_name.trim(),
      lat,
      lon,
      mode: primaryMode,
      lines: Array.from(new Set(lineNamesArr)).sort(),
      network: networkName,
    });
  }

  return result;
}

// ── IDFM feed discovery ───────────────────────────────────────────────────────

interface IdfmRecord {
  fields: Record<string, unknown>;
}

async function fetchIdfmFeeds(): Promise<{ name: string; url: string }[]> {
  const apiKey = process.env.IDFM_API_KEY;
  const headers: Record<string, string> = apiKey ? { "X-Api-Key": apiKey } : {};
  // OpenDataSoft v2.1 API
  const apiUrl =
    "https://data.iledefrance-mobilites.fr/api/explore/v2.1/catalog/datasets/" +
    "offre-horaires-tc-gtfs-idfm/records?limit=100&order_by=filename";
  const buf = await downloadToBuffer(apiUrl, headers);
  const json = JSON.parse(buf.toString("utf-8")) as {
    results?: Record<string, unknown>[];
  };

  const feeds: { name: string; url: string }[] = [];
  for (const record of json.results ?? []) {
    // In v2.1, fields are directly on the record object
    const filename =
      (record["filename"] as string | undefined) ??
      (record["nom_du_fichier"] as string | undefined) ??
      "";
    // File attachment field: may be an object with url, or a direct string
    const fileField = record["url"] ?? record["fichier"] ?? record["file"] ?? record["lien_vers_fichier"];
    const fileUrl =
      typeof fileField === "string"
        ? fileField
        : typeof fileField === "object" && fileField !== null
          ? ((fileField as Record<string, unknown>)["url"] as string | undefined) ?? ""
          : "";

    if (!filename || !fileUrl) continue;

    // Skip bus-only files (large, no useful route_types after our filter)
    const lower = filename.toLowerCase();
    if (
      lower.includes("bus") &&
      !lower.includes("metro") &&
      !lower.includes("tram") &&
      !lower.includes("rer")
    ) {
      continue;
    }

    feeds.push({
      name: `IDFM ${filename.replace(/\.zip$/i, "").replace(/_/g, " ")}`,
      url: fileUrl,
    });
  }
  return feeds;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (fs.existsSync(DB_PATH)) {
    const ageMs = Date.now() - fs.statSync(DB_PATH).mtimeMs;
    if (ageMs < MAX_AGE_MS) {
      console.log(`Tram-metro index is ${Math.round(ageMs / 3_600_000)}h old — skipping (threshold: 7 days).`);
      return;
    }
    console.log("Index stale — rebuilding...");
    fs.unlinkSync(DB_PATH);
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = OFF");
  db.exec(`
    CREATE TABLE stops (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      stop_name TEXT NOT NULL,
      stop_lat  REAL NOT NULL,
      stop_lon  REAL NOT NULL,
      mode      TEXT NOT NULL,
      lines     TEXT NOT NULL,
      network   TEXT
    );
  `);

  const insert = db.prepare(
    "INSERT INTO stops (stop_name, stop_lat, stop_lon, mode, lines, network) VALUES (?,?,?,?,?,?)"
  );
  const insertBatch = db.transaction((rows: StopRow[]) => {
    for (const r of rows) insert.run(r.name, r.lat, r.lon, r.mode, JSON.stringify(r.lines), r.network);
  });

  let totalStops = 0;

  // Fetch IDFM feeds dynamically (metro, tram, RER for Île-de-France)
  let idfmFeeds: { name: string; url: string }[] = [];
  try {
    idfmFeeds = await fetchIdfmFeeds();
    console.log(`IDFM: ${idfmFeeds.length} feeds found`);
  } catch (err) {
    console.warn(`IDFM feed discovery failed: ${(err as Error).message} — skipping IDF`);
  }

  for (const feed of [...idfmFeeds, ...FEEDS]) {
    process.stdout.write(`  ${feed.name}...`);
    try {
      const buf = await downloadToBuffer(feed.url);
      const rows = processGtfsZip(buf, feed.name);
      if (rows.length === 0) {
        process.stdout.write(` (no tram/metro routes)\n`);
        continue;
      }
      insertBatch(rows);
      totalStops += rows.length;
      process.stdout.write(` ${rows.length} stops\n`);
    } catch (err) {
      process.stdout.write(` ERROR: ${(err as Error).message}\n`);
    }
  }

  console.log(`\nBuilding spatial index...`);
  db.exec("CREATE INDEX idx_geo ON stops(stop_lat, stop_lon);");
  db.close();

  console.log(`Done — ${totalStops.toLocaleString()} tram/metro stops indexed in ${DB_PATH}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
