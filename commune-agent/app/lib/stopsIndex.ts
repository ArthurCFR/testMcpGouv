/**
 * Local GTFS stops indices — zero external calls at query time.
 *
 * Two SQLite databases:
 *  - data/stops.db        : 637k consolidated stops (all modes, no lines)
 *                           → used here for train stations only (mode=train)
 *  - data/tram-metro.db   : tram & metro stops with line names
 *                           → built by scripts/ingest-tram-metro.ts
 *
 * Used for non-IDF locations (IDF is handled by PRIM/Navitia).
 */

import * as path from "path";
import * as fs from "fs";
import type { TransitType } from "@/app/types/accessibility";

const STOPS_DB_PATH      = path.join(process.cwd(), "data", "stops.db");
const TRAM_METRO_DB_PATH = path.join(process.cwd(), "data", "tram-metro.db");

// Lazy singletons
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _stopsDb: any | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _tramMetroDb: any | null = null;

import Database from "better-sqlite3";

function getStopsDb() {
  if (_stopsDb) return _stopsDb;
  if (!fs.existsSync(STOPS_DB_PATH)) return null;
  _stopsDb = new Database(STOPS_DB_PATH, { readonly: true });
  return _stopsDb;
}

function getTramMetroDb() {
  if (_tramMetroDb) return _tramMetroDb;
  if (!fs.existsSync(TRAM_METRO_DB_PATH)) return null;
  _tramMetroDb = new Database(TRAM_METRO_DB_PATH, { readonly: true });
  return _tramMetroDb;
}

// ── Haversine ─────────────────────────────────────────────────────────────────

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Bounding-box helpers ──────────────────────────────────────────────────────

function bbox(lat: number, lng: number, radiusKm: number) {
  const dLat = radiusKm / 111;
  const dLng = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
}

// ── Public types ──────────────────────────────────────────────────────────────

export interface NearbyStop {
  name: string;
  lat: number;
  lng: number;
  distKm: number;
  mode: TransitType;
  lines: string[];
}

// ── Nearest-neighbour ordering ────────────────────────────────────────────────

function orderStopsAlongLine<T extends { lat: number; lng: number }>(stops: T[], maxStepKm = 4): T[][] {
  if (stops.length === 0) return [];
  if (stops.length <= 2) return [stops];

  const segments: T[][] = [];
  const unvisited = [...stops];

  while (unvisited.length > 0) {
    // Start each segment from the southernmost remaining stop
    let startIdx = 0;
    for (let i = 1; i < unvisited.length; i++) {
      if (unvisited[i].lat < unvisited[startIdx].lat) startIdx = i;
    }
    const segment: T[] = [unvisited[startIdx]];
    unvisited.splice(startIdx, 1);

    while (unvisited.length > 0) {
      const last = segment[segment.length - 1];
      let minIdx = 0;
      let minDist = Infinity;
      for (let i = 0; i < unvisited.length; i++) {
        const d = haversineKm(last.lat, last.lng, unvisited[i].lat, unvisited[i].lng);
        if (d < minDist) { minDist = d; minIdx = i; }
      }
      if (minDist > maxStepKm) break; // gap too large — end this segment
      segment.push(unvisited[minIdx]);
      unvisited.splice(minIdx, 1);
    }

    segments.push(segment);
  }

  return segments;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function isStopsIndexReady(): boolean    { return fs.existsSync(STOPS_DB_PATH); }
export function isTramMetroIndexReady(): boolean { return fs.existsSync(TRAM_METRO_DB_PATH); }

/**
 * Returns nearby tram & metro stops from the dedicated tram-metro index.
 * Each stop includes the list of lines served (e.g. ["A", "B"]).
 */
export function getNearbyTramMetro(lat: number, lng: number, radiusM: number): NearbyStop[] {
  const conn = getTramMetroDb();
  if (!conn) return [];

  const radiusKm = radiusM / 1000;
  const { minLat, maxLat, minLng, maxLng } = bbox(lat, lng, radiusKm);

  type Row = { stop_name: string; stop_lat: number; stop_lon: number; mode: string; lines: string };
  const rows: Row[] = conn
    .prepare(
      `SELECT stop_name, stop_lat, stop_lon, mode, lines
       FROM stops
       WHERE stop_lat BETWEEN ? AND ?
         AND stop_lon BETWEEN ? AND ?`
    )
    .all(minLat, maxLat, minLng, maxLng);

  // Exact filter + dedup by (mode, name) — keep closest when duplicate
  const seen = new Map<string, NearbyStop>();
  for (const row of rows) {
    const dist = haversineKm(lat, lng, row.stop_lat, row.stop_lon);
    if (dist > radiusKm) continue;
    const key = `${row.mode}::${row.stop_name.toLowerCase().trim()}`;
    const prev = seen.get(key);
    // Merge lines if same stop appears from multiple feeds
    if (prev) {
      const merged = Array.from(new Set([...prev.lines, ...(JSON.parse(row.lines) as string[])])).sort();
      seen.set(key, { ...prev, lines: merged, distKm: Math.min(prev.distKm, dist) });
    } else {
      seen.set(key, {
        name: row.stop_name,
        lat: row.stop_lat,
        lng: row.stop_lon,
        distKm: dist,
        mode: row.mode as TransitType,
        lines: JSON.parse(row.lines) as string[],
      });
    }
  }

  return Array.from(seen.values()).sort((a, b) => a.distKm - b.distKm);
}

/**
 * Returns ALL stops for a given line ref within a geographic radius (default 60 km),
 * ordered along the line via nearest-neighbour heuristic.
 * The radius prevents mixing same-named lines from different cities
 * (e.g. metro "B" in Toulouse vs Rennes).
 */
export function getAllStopsForLine(
  lineRef: string,
  nearLat: number,
  nearLng: number,
  radiusKm = 60,
  mode: string = "tram",
): Array<Array<{ name: string; lat: number; lng: number }>> {
  const conn = getTramMetroDb();
  if (!conn) return [];

  const { minLat, maxLat, minLng, maxLng } = bbox(nearLat, nearLng, radiusKm);

  type Row = { stop_name: string; stop_lat: number; stop_lon: number; lines: string };
  const rows: Row[] = conn
    .prepare(
      `SELECT stop_name, stop_lat, stop_lon, lines FROM stops
       WHERE stop_lat BETWEEN ? AND ? AND stop_lon BETWEEN ? AND ?`,
    )
    .all(minLat, maxLat, minLng, maxLng) as Row[];

  const seen = new Map<string, { name: string; lat: number; lng: number }>();
  for (const row of rows) {
    if (haversineKm(nearLat, nearLng, row.stop_lat, row.stop_lon) > radiusKm) continue;
    let lines: string[];
    try { lines = JSON.parse(row.lines) as string[]; } catch { continue; }
    if (!lines.includes(lineRef)) continue;
    const key = row.stop_name.toLowerCase().trim();
    if (!seen.has(key)) {
      seen.set(key, { name: row.stop_name, lat: row.stop_lat, lng: row.stop_lon });
    }
  }

  const maxStepKm = mode === "rer" ? 10 : 4;
  return orderStopsAlongLine(Array.from(seen.values()), maxStepKm); // returns T[][]
}

/**
 * Returns nearby train stations from the consolidated stops index.
 * Lines are not available in this source — callers receive lines: [].
 */
export function getNearbyTrainStations(lat: number, lng: number, radiusM: number): NearbyStop[] {
  const conn = getStopsDb();
  if (!conn) return [];

  const radiusKm = radiusM / 1000;
  const { minLat, maxLat, minLng, maxLng } = bbox(lat, lng, radiusKm);

  type Row = { stop_name: string; stop_lat: number; stop_lon: number };
  const rows: Row[] = conn
    .prepare(
      `SELECT stop_name, stop_lat, stop_lon
       FROM stops
       WHERE mode = 'train'
         AND stop_lat BETWEEN ? AND ?
         AND stop_lon BETWEEN ? AND ?`
    )
    .all(minLat, maxLat, minLng, maxLng);

  const seen = new Map<string, NearbyStop>();
  for (const row of rows) {
    const dist = haversineKm(lat, lng, row.stop_lat, row.stop_lon);
    if (dist > radiusKm) continue;
    const key = `train::${row.stop_name.toLowerCase().trim()}`;
    const prev = seen.get(key);
    if (!prev || dist < prev.distKm) {
      seen.set(key, { name: row.stop_name, lat: row.stop_lat, lng: row.stop_lon, distKm: dist, mode: "train", lines: [] });
    }
  }

  return Array.from(seen.values()).sort((a, b) => a.distKm - b.distKm);
}
