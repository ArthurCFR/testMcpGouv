import type { TransitStop, Airport } from "@/app/types/accessibility";

/**
 * Select up to maxN transit stops, one per unique line, sorted by walking time.
 * This ensures diversity of lines (no two stops from the same line).
 */
export function selectTransitDestinations(
  stops: TransitStop[],
  maxN = 3,
): TransitStop[] {
  // Map: lineKey → best stop (lowest walkingTime)
  const byLine = new Map<string, TransitStop>();

  for (const stop of stops) {
    const lines = stop.lines.length > 0 ? stop.lines : ["__unknown__"];
    for (const line of lines) {
      const key = `${stop.type}::${line}`;
      const existing = byLine.get(key);
      if (!existing || stop.walkingTime < existing.walkingTime) {
        byLine.set(key, stop);
      }
    }
  }

  // Deduplicate: a stop can appear for multiple lines — keep the best entry per stop id
  const seenIds = new Set<string>();
  const unique: TransitStop[] = [];
  for (const stop of Array.from(byLine.values()).sort(
    (a, b) => a.walkingTime - b.walkingTime,
  )) {
    if (!seenIds.has(stop.id)) {
      seenIds.add(stop.id);
      unique.push(stop);
    }
    if (unique.length >= maxN) break;
  }

  return unique;
}

/**
 * Select up to maxN airports (already sorted by driving time from the API).
 */
export function selectAirportDestinations(
  airports: Airport[],
  maxN = 2,
): Airport[] {
  return airports.slice(0, maxN);
}
