#!/usr/bin/env tsx
/**
 * Integrates IDFM station data from the downloaded CSV
 * (emplacement-des-gares-idf.csv) into the existing tram-metro.db.
 *
 * Usage: npm run ingest-idfm-gares
 * Safe to re-run: deletes existing IDFM rows before inserting.
 */

import Database from "better-sqlite3";
import * as fs from "fs";
import * as path from "path";

const DATA_DIR = path.join(__dirname, "..", "data");
const DB_PATH  = path.join(DATA_DIR, "tram-metro.db");
const CSV_PATH = path.join(DATA_DIR, "emplacement-des-gares-idf.csv");

// Modes we keep (exclude TRAIN = Transilien/mainline)
const KEEP_MODES = new Set(["METRO", "TRAMWAY", "TRAM", "RER", "VAL", "CABLE"]);

function modeToInternal(m: string): "tram" | "metro" | "rer" {
  if (m === "METRO" || m === "VAL") return "metro";
  if (m === "RER") return "rer";
  return "tram"; // TRAMWAY, TRAM, CABLE
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === ";" && !inQ) {
      fields.push(cur.trim()); cur = "";
    } else {
      cur += c;
    }
  }
  fields.push(cur.trim());
  return fields;
}

if (!fs.existsSync(DB_PATH)) {
  console.error(`DB not found at ${DB_PATH} — run npm run ingest-tram-metro first.`);
  process.exit(1);
}

if (!fs.existsSync(CSV_PATH)) {
  console.error(`CSV not found at ${CSV_PATH}`);
  process.exit(1);
}

const text = fs.readFileSync(CSV_PATH, "utf-8").replace(/^\ufeff/, "");
const lines = text.split(/\r?\n/).filter(l => l.trim());
const headers = parseCsvLine(lines[0]);

const colIdx = (name: string) => {
  const i = headers.indexOf(name);
  if (i === -1) throw new Error(`Column not found: ${name}`);
  return i;
};

const iGeo      = colIdx("geo_point_2d");
const iName     = colIdx("nom_gares");
const iLine     = colIdx("indice_lig");
const iMode     = colIdx("mode");
const iId       = colIdx("id_gares");

// Group rows by station id → collect all lines + mode
interface StationAgg {
  name: string;
  lat: number;
  lon: number;
  lines: Set<string>;
  mode: "tram" | "metro" | "rer";
}

const stations = new Map<string, StationAgg>();

for (let i = 1; i < lines.length; i++) {
  const cols = parseCsvLine(lines[i]);
  const mode = cols[iMode]?.trim().toUpperCase();
  if (!KEEP_MODES.has(mode)) continue;

  const geoRaw = cols[iGeo]?.trim(); // "lat, lon"
  const [latStr, lonStr] = geoRaw.split(",").map(s => s.trim());
  const lat = parseFloat(latStr);
  const lon = parseFloat(lonStr);
  if (isNaN(lat) || isNaN(lon)) continue;

  const stationId = cols[iId]?.trim();
  const name = cols[iName]?.trim();
  const line = cols[iLine]?.trim();
  if (!stationId || !name || !line) continue;

  const internalMode = modeToInternal(mode);

  if (!stations.has(stationId)) {
    stations.set(stationId, { name, lat, lon, lines: new Set(), mode: internalMode });
  }
  const agg = stations.get(stationId)!;
  agg.lines.add(line);
  // Priority: metro > rer > tram
  if (internalMode === "metro") agg.mode = "metro";
  else if (internalMode === "rer" && agg.mode !== "metro") agg.mode = "rer";
}

const db = new Database(DB_PATH);

// Remove previous IDFM rows to allow safe re-run
const deleted = db.prepare("DELETE FROM stops WHERE network = 'IDFM'").run();
if (deleted.changes > 0) console.log(`Removed ${deleted.changes} existing IDFM rows.`);

const insert = db.prepare(
  "INSERT INTO stops (stop_name, stop_lat, stop_lon, mode, lines, network) VALUES (?,?,?,?,?,?)"
);

const insertAll = db.transaction((rows: StationAgg[]) => {
  for (const r of rows) {
    insert.run(r.name, r.lat, r.lon, r.mode, JSON.stringify(Array.from(r.lines).sort()), "IDFM");
  }
});

const rows = Array.from(stations.values());
insertAll(rows);

console.log(`Done — ${rows.length} IDFM stations inserted into ${DB_PATH}`);

// Quick breakdown
const modes = db.prepare("SELECT mode, COUNT(*) as c FROM stops WHERE network='IDFM' GROUP BY mode").all() as {mode:string,c:number}[];
console.log("  by mode:", modes);

db.close();
