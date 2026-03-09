import { NextRequest, NextResponse } from "next/server";
import type { TransitStop, Airport, AccessibilityData, TransitType, LineShape } from "@/app/types/accessibility";
import { getNearbyTramMetro, getNearbyTrainStations, getAllStopsForLine } from "@/app/lib/stopsIndex";

// French metropolitan airports (hardcoded, static list)
const AIRPORTS = [
  { iata: "CDG", name: "Charles de Gaulle", city: "Paris",           lat: 49.00971, lng:  2.54793 },
  { iata: "ORY", name: "Orly",              city: "Paris",           lat: 48.72333, lng:  2.37944 },
  { iata: "LYS", name: "Saint-Exupéry",    city: "Lyon",            lat: 45.72561, lng:  5.08111 },
  { iata: "NCE", name: "Côte d'Azur",      city: "Nice",            lat: 43.65829, lng:  7.21585 },
  { iata: "MRS", name: "Provence",         city: "Marseille",       lat: 43.43922, lng:  5.22147 },
  { iata: "BOD", name: "Mérignac",         city: "Bordeaux",        lat: 44.82826, lng: -0.71556 },
  { iata: "TLS", name: "Blagnac",          city: "Toulouse",        lat: 43.62933, lng:  1.36378 },
  { iata: "NTE", name: "Atlantique",       city: "Nantes",          lat: 47.15321, lng: -1.60811 },
  { iata: "SXB", name: "Entzheim",         city: "Strasbourg",      lat: 48.53834, lng:  7.62827 },
  { iata: "LIL", name: "Lesquin",          city: "Lille",           lat: 50.56272, lng:  3.08944 },
  { iata: "MPL", name: "Méditerranée",     city: "Montpellier",     lat: 43.57614, lng:  3.96302 },
  { iata: "LRH", name: "La Pallice",       city: "La Rochelle",     lat: 46.17972, lng: -1.19528 },
  { iata: "RNS", name: "Saint-Jacques",    city: "Rennes",          lat: 48.07000, lng: -1.73083 },
  { iata: "CFE", name: "Aulnat",           city: "Clermont-Ferrand",lat: 45.78611, lng:  3.16917 },
  { iata: "PGF", name: "Perpignan",        city: "Perpignan",       lat: 42.74028, lng:  2.87028 },
  { iata: "BIA", name: "Poretta",          city: "Bastia",          lat: 42.55278, lng:  9.48361 },
  { iata: "AJA", name: "Campo dell'Oro",   city: "Ajaccio",         lat: 41.92361, lng:  8.80222 },
];

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

// ── OSRM ─────────────────────────────────────────────────────────────────────
const OSRM_WALKING_ENDPOINTS = [
  "https://routing.openstreetmap.de/routed-foot/route/v1/foot",
  "https://router.project-osrm.org/route/v1/foot",
];
const OSRM_DRIVING_BASE = "https://router.project-osrm.org/route/v1/driving";

type OsrmResult = { durationSec: number; distanceM: number; coords: [number, number][] };

async function tryOsrmEndpoint(
  base: string,
  fromLng: number, fromLat: number,
  toLng: number, toLat: number,
): Promise<OsrmResult | null> {
  const url = `${base}/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "CommuneAgent/1.0 (accessibility tool)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json() as {
      code: string;
      routes?: Array<{ duration: number; distance: number; geometry: { coordinates: [number, number][] } }>;
    };
    if (data.code !== "Ok" || !data.routes?.length) return null;
    const route = data.routes[0];
    return {
      durationSec: route.duration,
      distanceM: route.distance,
      coords: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]), // GeoJSON → Leaflet
    };
  } catch {
    return null;
  }
}

async function fetchOsrmRoute(
  profile: "walking" | "driving",
  fromLat: number, fromLng: number,
  toLat: number, toLng: number,
): Promise<OsrmResult | null> {
  if (profile === "driving") {
    return tryOsrmEndpoint(OSRM_DRIVING_BASE, fromLng, fromLat, toLng, toLat);
  }
  for (const base of OSRM_WALKING_ENDPOINTS) {
    const result = await tryOsrmEndpoint(base, fromLng, fromLat, toLng, toLat);
    if (result) return result;
  }
  return null;
}

function walkingFallback(
  fromLat: number, fromLng: number,
  toLat: number, toLng: number,
): OsrmResult {
  const distM = haversineKm(fromLat, fromLng, toLat, toLng) * 1000 * 1.3;
  return {
    durationSec: (distM / 1000 / 5) * 3600,
    distanceM: distM,
    coords: [[fromLat, fromLng], [toLat, toLng]],
  };
}

// ── Candidate type & caps ─────────────────────────────────────────────────────
type Candidate = {
  id: string;
  name: string;
  type: TransitType;
  lat: number;
  lng: number;
  distKm: number;
  lines: string[];
};

const PRIORITY: Record<TransitType, number> = { metro: 0, rer: 1, tram: 2, train: 3, bus: 4 };
const TYPE_CAPS: Record<TransitType, number> = { metro: 20, rer: 10, tram: 20, train: 4, bus: 5 };

function applyCaps(candidateMap: Map<string, Candidate>): Candidate[] {
  const sorted = Array.from(candidateMap.values()).sort(
    (a, b) => PRIORITY[a.type] - PRIORITY[b.type] || a.distKm - b.distKm,
  );
  const typeCount: Partial<Record<TransitType, number>> = {};
  const result: Candidate[] = [];
  for (const c of sorted) {
    const count = typeCount[c.type] ?? 0;
    if (count < TYPE_CAPS[c.type]) {
      result.push(c);
      typeCount[c.type] = count + 1;
    }
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// STRATEGY A — PRIM (Île-de-France Mobilités) for IDF
// Free API, Navitia-based, official RATP/SNCF data.
// Lines are properties of stop_areas → included in the response.
// Requires PRIM_API_KEY (free on prim.iledefrance-mobilites.fr).
// ═══════════════════════════════════════════════════════════════════════════

type NavitiaLine = {
  id: string;
  name: string;
  code: string;
  commercial_mode?: { id: string; name: string };
};
type NavitiaStopArea = {
  id: string;
  name: string;
  coord: { lat: string; lon: string };
  lines?: NavitiaLine[];
};
type NavitiaPlace = {
  id: string;
  name: string;
  embedded_type: string;
  distance: string;
  stop_area?: NavitiaStopArea;
};

function navitiaToTransitType(modeId: string, modeName: string): TransitType | null {
  const s = (modeId + " " + modeName).toLowerCase();
  if (s.includes("metro")) return "metro";
  if (s.includes("rapidtransit") || s.includes("rer")) return "rer";
  if (s.includes("tram")) return "tram";
  if (s.includes("bus") || s.includes("coach")) return "bus";
  if (s.includes("train") || s.includes("rail") || s.includes("ter") || s.includes("intercit")) return "train";
  return null;
}

async function fetchCandidatesPrim(lat: number, lng: number): Promise<Map<string, Candidate>> {
  const candidateMap = new Map<string, Candidate>();
  const PRIM_KEY = process.env.PRIM_API_KEY ?? "";
  const url = `https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia/coverage/idfm/coords/${lng};${lat}/places_nearby?type[]=stop_area&distance=2000&depth=2&count=40`;

  try {
    const res = await fetch(url, {
      headers: { apikey: PRIM_KEY },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return candidateMap;

    const data = await res.json() as { places_nearby?: NavitiaPlace[] };
    for (const place of data.places_nearby ?? []) {
      if (place.embedded_type !== "stop_area" || !place.stop_area) continue;
      const sa = place.stop_area;
      const stopLat = parseFloat(sa.coord.lat);
      const stopLng = parseFloat(sa.coord.lon);
      const distKm = parseInt(place.distance, 10) / 1000;

      const linesByType = new Map<TransitType, Set<string>>();
      for (const line of sa.lines ?? []) {
        const type = navitiaToTransitType(
          line.commercial_mode?.id ?? "",
          line.commercial_mode?.name ?? "",
        );
        if (!type) continue;
        if (!linesByType.has(type)) linesByType.set(type, new Set());
        const ref = (line.code || line.name).trim();
        if (ref) linesByType.get(type)!.add(ref);
      }

      for (const [type, lineSet] of Array.from(linesByType.entries())) {
        const key = `${type}::${sa.name.toLowerCase().trim()}`;
        const existing = candidateMap.get(key);
        if (!existing || distKm < existing.distKm) {
          candidateMap.set(key, {
            id: sa.id,
            name: sa.name,
            type,
            lat: stopLat,
            lng: stopLng,
            distKm,
            lines: Array.from(lineSet).sort() as string[],
          });
        }
      }
    }
  } catch {
    // fall through — airports still work
  }

  return candidateMap;
}

// ═══════════════════════════════════════════════════════════════════════════
// STRATEGY B — Local GTFS indices for non-IDF France
//
// tram-metro.db : stops from individual GTFS feeds, with line names.
//                 Run `npm run ingest-tram-metro` to build (~25 networks).
// stops.db      : consolidated 637k stops, used here for train stations only.
//                 Run `npm run ingest-stops` to build (~416 MB download).
//
// Bus stops are intentionally excluded from non-IDF results.
// ═══════════════════════════════════════════════════════════════════════════

function fetchCandidatesLocal(lat: number, lng: number): Map<string, Candidate> {
  const candidateMap = new Map<string, Candidate>();

  // Tram & metro with line names (covers IDF via IDFM data)
  for (const s of getNearbyTramMetro(lat, lng, 2000)) {
    const key = `${s.mode}::${s.name.toLowerCase().trim()}`;
    candidateMap.set(key, {
      id: `gtfs::${s.name}`,
      name: s.name,
      type: s.mode,
      lat: s.lat,
      lng: s.lng,
      distKm: s.distKm,
      lines: s.lines,
    });
  }

  // Train stations from stops.db — skip IDF where SNCF bus stops pollute the 'train' mode
  const isIDF = lat > 48.1 && lat < 49.2 && lng > 1.4 && lng < 3.6;
  if (!isIDF) {
    for (const s of getNearbyTrainStations(lat, lng, 2000)) {
      const key = `train::${s.name.toLowerCase().trim()}`;
      if (!candidateMap.has(key)) {
        candidateMap.set(key, {
          id: `gtfs::${s.name}`,
          name: s.name,
          type: "train",
          lat: s.lat,
          lng: s.lng,
          distKm: s.distKm,
          lines: [],
        });
      }
    }
  }

  return candidateMap;
}

// ═══════════════════════════════════════════════════════════════════════════
// POST handler
// ═══════════════════════════════════════════════════════════════════════════

export async function POST(req: NextRequest) {
  const { lat, lng, address } = (await req.json()) as {
    lat: number;
    lng: number;
    address: string;
  };

  // ── 1. Fetch stop candidates ──────────────────────────────────────────────
  // IDF → PRIM (lines included in response).
  // Elsewhere → local GTFS indices: tram/metro with lines + train stations.
  const candidateMap = fetchCandidatesLocal(lat, lng);
  const candidates = applyCaps(candidateMap);

  // ── 2. Walking routes (parallel) ─────────────────────────────────────────
  const stopResults = await Promise.all(
    candidates.map(async (c): Promise<TransitStop | null> => {
      const routeResult = await fetchOsrmRoute("walking", lat, lng, c.lat, c.lng);
      const route = routeResult ?? walkingFallback(lat, lng, c.lat, c.lng);
      const walkingTime = Math.round(route.durationSec / 60);
      if (walkingTime > 20) return null;
      return {
        id: c.id,
        name: c.name,
        type: c.type,
        lat: c.lat,
        lng: c.lng,
        lines: c.lines,
        walkingTime,
        walkingDistance: Math.round(route.distanceM),
        routeCoords: route.coords,
      };
    }),
  );

  const transitStops = stopResults.filter((s): s is TransitStop => s !== null);

  // ── 3. Airports: filter ~130km radius, then driving time ─────────────────
  const nearbyAirports = AIRPORTS.filter(
    (a) => haversineKm(lat, lng, a.lat, a.lng) < 130,
  ).sort(
    (a, b) => haversineKm(lat, lng, a.lat, a.lng) - haversineKm(lat, lng, b.lat, b.lng),
  );

  const airportResults = await Promise.all(
    nearbyAirports.slice(0, 5).map(async (a): Promise<Airport | null> => {
      const route = await fetchOsrmRoute("driving", lat, lng, a.lat, a.lng);
      if (!route) return null;
      if (route.durationSec > 90 * 60) return null;
      return {
        iata: a.iata,
        name: a.name,
        city: a.city,
        lat: a.lat,
        lng: a.lng,
        drivingTime: Math.round(route.durationSec / 60),
        drivingDistance: Math.round(route.distanceM / 1000),
        routeCoords: route.coords,
      };
    }),
  );

  const airports = airportResults.filter((a): a is Airport => a !== null);

  // ── 4. Line shapes ────────────────────────────────────────────────────────
  // For each tram/metro/rer line in the results, fetch all stops along the line
  // so the map can draw a dotted trail with small stop dots.
  const lineShapes: Record<string, LineShape> = {};
  {
    const linesWithType = new Map<string, TransitType>();
    for (const stop of transitStops) {
      if (stop.type === "train" || stop.type === "bus") continue;
      for (const line of stop.lines) {
        if (!linesWithType.has(line)) linesWithType.set(line, stop.type);
      }
    }
    for (const [line, type] of Array.from(linesWithType.entries())) {
      const segments = getAllStopsForLine(line, lat, lng, 60, type);
      if (segments.length === 0) continue;
      lineShapes[line] = {
        type,
        segments: segments.map((seg) =>
          seg.map((s, i) => ({
            ...s,
            isTerminus: i === 0 || i === seg.length - 1,
          }))
        ),
      };
    }
  }

  const result: AccessibilityData = { address, lat, lng, transitStops, airports, lineShapes };
  return NextResponse.json(result);
}
