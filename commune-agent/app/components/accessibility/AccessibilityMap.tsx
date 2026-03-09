"use client";

import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import type { AccessibilityData, Airport, TransitStop, TransitType, LineShape } from "@/app/types/accessibility";
import { getLineColor, getContrastText } from "@/app/lib/transitColors";

// Fix Leaflet default icon broken by webpack
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const STOP_COLORS: Record<TransitType, string> = {
  metro: "#003189",
  rer:   "#7B5EA7",
  tram:  "#3EA55D",
  bus:   "#E07A10",
  train: "#E05206",
};

const STOP_LETTER: Record<TransitType, string> = {
  metro: "M",
  rer:   "R",
  tram:  "T",
  bus:   "B",
  train: "G",
};

function stopIconColor(stop: TransitStop): string {
  return stop.lines[0] ? getLineColor(stop.type, stop.lines[0]) : STOP_COLORS[stop.type];
}

function makeAddressIcon() {
  return L.divIcon({
    className: "",
    iconSize: [40, 40],
    iconAnchor: [20, 40],
    html: `<div style="
      position:relative;width:40px;height:40px;
      display:flex;align-items:center;justify-content:center;
    ">
      <div style="
        width:20px;height:20px;
        background:var(--c21-gold,#d4af37);
        border-radius:50% 50% 50% 0;
        transform:rotate(-45deg);
        border:3px solid white;
        box-shadow:0 3px 10px rgba(0,0,0,0.35);
      "></div>
    </div>`,
  });
}

function makeAirportIcon() {
  return L.divIcon({
    className: "",
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    html: `<div style="
      width:34px;height:34px;
      background:#ef4444;
      border-radius:9px;
      border:2.5px solid white;
      box-shadow:0 2px 10px rgba(0,0,0,0.3);
      display:flex;align-items:center;justify-content:center;
      font-size:17px;
    ">✈</div>`,
  });
}

// ── Shape helpers ─────────────────────────────────────────────────────────────

function circleHtml(color: string, label: string, opacity = 1) {
  const textColor = getContrastText(color);
  const fs = label.length > 3 ? "6px" : label.length > 2 ? "7px" : label.length === 2 ? "8px" : "9px";
  return `<div style="width:26px;height:26px;background:${color};border-radius:50%;border:2.5px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.28);display:flex;align-items:center;justify-content:center;color:${textColor};font-size:${fs};font-weight:800;font-family:'Plus Jakarta Sans',sans-serif;letter-spacing:-0.5px;opacity:${opacity}">${label}</div>`;
}

function squareHtml(color: string, label: string, opacity = 1) {
  const textColor = getContrastText(color);
  const fs = label.length > 3 ? "6px" : label.length > 2 ? "7px" : label.length === 2 ? "8px" : "9px";
  return `<div style="width:26px;height:26px;background:${color};border-radius:5px;border:2.5px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.28);display:flex;align-items:center;justify-content:center;color:${textColor};font-size:${fs};font-weight:800;font-family:'Plus Jakarta Sans',sans-serif;letter-spacing:-0.5px;opacity:${opacity}">${label}</div>`;
}

function trainMarkerHtml() {
  return `<div style="width:32px;height:26px;background:#374151;border-radius:5px;border:2.5px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.28);display:flex;align-items:center;justify-content:center;">
    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="white" stroke-width="2">
      <rect x="4" y="3" width="16" height="14" rx="3" stroke-linejoin="round"/>
      <line x1="4" y1="11" x2="20" y2="11" stroke-linecap="round"/>
      <line x1="8" y1="3" x2="8" y2="11" stroke-linecap="round"/>
      <line x1="16" y1="3" x2="16" y2="11" stroke-linecap="round"/>
      <path d="M7 21l2-4h6l2 4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </div>`;
}

function shapeHtml(type: TransitType, color: string, label: string, opacity = 1) {
  if (type === "tram") return squareHtml(color, label, opacity);
  return circleHtml(color, label, opacity);
}

function makeTransitIcon(stop: TransitStop) {
  if (stop.type === "train") {
    return L.divIcon({
      className: "",
      iconSize: [32, 26],
      iconAnchor: [16, 13],
      html: trainMarkerHtml(),
    });
  }

  const lines = stop.lines.slice(0, 2);

  if (lines.length === 0) {
    return L.divIcon({
      className: "",
      iconSize: [26, 26],
      iconAnchor: [13, 13],
      html: shapeHtml(stop.type, STOP_COLORS[stop.type], STOP_LETTER[stop.type]),
    });
  }

  if (lines.length === 1) {
    const color = getLineColor(stop.type, lines[0]);
    return L.divIcon({
      className: "",
      iconSize: [26, 26],
      iconAnchor: [13, 13],
      html: shapeHtml(stop.type, color, lines[0]),
    });
  }

  const c0 = getLineColor(stop.type, lines[0]);
  const c1 = getLineColor(stop.type, lines[1]);
  return L.divIcon({
    className: "",
    iconSize: [36, 26],
    iconAnchor: [18, 13],
    html: `<div style="position:relative;width:36px;height:26px;">
      <div style="position:absolute;right:0;top:0;">${shapeHtml(stop.type, c0, lines[0], 0.75)}</div>
      <div style="position:absolute;left:0;top:0;">${shapeHtml(stop.type, c1, lines[1])}</div>
    </div>`,
  });
}

// ── Airport edge card icon ────────────────────────────────────────────────────

type EdgeDir = "n" | "s" | "e" | "w";

function makeAirportEdgeIcon(airport: Airport, edge: EdgeDir, dark: boolean): L.DivIcon {
  const bg        = dark ? "#1e1f23" : "white";
  const textClr   = dark ? "#f3f4f6" : "#111827";
  const subClr    = dark ? "#9ca3af" : "#6b7280";
  const borderClr = dark ? "#374151" : "#e5e7eb";
  const shadow    = dark
    ? "drop-shadow(0 4px 14px rgba(0,0,0,0.55))"
    : "drop-shadow(0 4px 14px rgba(0,0,0,0.18))";

  const CARD_W = 176;
  const CARD_H = 48;
  const A = 8;

  const name = `${airport.city} · ${airport.iata}`;
  const time = `${airport.drivingTime} min en voiture`;

  const cardHtml = `
    <div style="
      background:${bg};border-radius:10px;padding:7px 11px;
      display:flex;align-items:center;gap:8px;
      border:1.5px solid ${borderClr};
      width:${CARD_W}px;height:${CARD_H}px;box-sizing:border-box;
    ">
      <div style="width:24px;height:24px;background:#ef4444;border-radius:6px;
        display:flex;align-items:center;justify-content:center;
        font-size:13px;color:white;flex-shrink:0;">✈</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:11px;font-weight:700;color:${textClr};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${name}</div>
        <div style="font-size:10px;color:${subClr};white-space:nowrap;">${time}</div>
      </div>
    </div>`;

  const arrowN = `<div style="width:0;height:0;border-left:${A}px solid transparent;border-right:${A}px solid transparent;border-bottom:${A}px solid ${bg};margin:0 auto;"></div>`;
  const arrowS = `<div style="width:0;height:0;border-left:${A}px solid transparent;border-right:${A}px solid transparent;border-top:${A}px solid ${bg};margin:0 auto;"></div>`;
  const arrowE = `<div style="width:0;height:0;border-top:${A}px solid transparent;border-bottom:${A}px solid transparent;border-left:${A}px solid ${bg};flex-shrink:0;"></div>`;
  const arrowW = `<div style="width:0;height:0;border-top:${A}px solid transparent;border-bottom:${A}px solid transparent;border-right:${A}px solid ${bg};flex-shrink:0;"></div>`;

  // column-reverse: card first in HTML, arrow visually on top → arrow tip = iconAnchor top
  if (edge === "n") {
    return L.divIcon({
      className: "",
      iconSize: [CARD_W, CARD_H + A],
      iconAnchor: [CARD_W / 2, 0],
      html: `<div style="display:flex;flex-direction:column-reverse;align-items:center;filter:${shadow};">${cardHtml}${arrowN}</div>`,
    });
  }
  if (edge === "s") {
    return L.divIcon({
      className: "",
      iconSize: [CARD_W, CARD_H + A],
      iconAnchor: [CARD_W / 2, CARD_H + A],
      html: `<div style="display:flex;flex-direction:column;align-items:center;filter:${shadow};">${cardHtml}${arrowS}</div>`,
    });
  }
  if (edge === "e") {
    return L.divIcon({
      className: "",
      iconSize: [CARD_W + A, CARD_H],
      iconAnchor: [CARD_W + A, CARD_H / 2],
      html: `<div style="display:flex;flex-direction:row;align-items:center;filter:${shadow};">${cardHtml}${arrowE}</div>`,
    });
  }
  // west
  return L.divIcon({
    className: "",
    iconSize: [CARD_W + A, CARD_H],
    iconAnchor: [0, CARD_H / 2],
    html: `<div style="display:flex;flex-direction:row;align-items:center;filter:${shadow};">${arrowW}${cardHtml}</div>`,
  });
}

// ── Route exit-point helpers ──────────────────────────────────────────────────

/** Compute where segment [p1→p2] (p1 inside, p2 outside) exits bounds. */
function segmentBoundsExit(
  p1: [number, number],
  p2: [number, number],
  bounds: L.LatLngBounds,
): { point: [number, number]; edge: EdgeDir } | null {
  const [lat1, lng1] = p1;
  const [lat2, lng2] = p2;
  const dlat = lat2 - lat1;
  const dlng = lng2 - lng1;

  const n = bounds.getNorth();
  const s = bounds.getSouth();
  const e = bounds.getEast();
  const w = bounds.getWest();

  type C = { t: number; edge: EdgeDir };
  const candidates: C[] = [];

  if (Math.abs(dlat) > 1e-10) {
    const tn = (n - lat1) / dlat;
    if (tn > 0 && tn <= 1) candidates.push({ t: tn, edge: "n" });
    const ts = (s - lat1) / dlat;
    if (ts > 0 && ts <= 1) candidates.push({ t: ts, edge: "s" });
  }
  if (Math.abs(dlng) > 1e-10) {
    const te = (e - lng1) / dlng;
    if (te > 0 && te <= 1) candidates.push({ t: te, edge: "e" });
    const tw = (w - lng1) / dlng;
    if (tw > 0 && tw <= 1) candidates.push({ t: tw, edge: "w" });
  }

  const best = candidates.sort((a, b) => a.t - b.t)[0];
  if (!best) return null;
  return { point: [lat1 + best.t * dlat, lng1 + best.t * dlng], edge: best.edge };
}

/**
 * Walk the route from the address end and find the LAST segment that crosses
 * from inside to outside the current map bounds.
 * Returns null if the entire route is inside (airport is visible).
 */
function findRouteExitPoint(
  routeCoords: [number, number][],
  bounds: L.LatLngBounds,
): { point: [number, number]; edge: EdgeDir } | null {
  let lastExit: { point: [number, number]; edge: EdgeDir } | null = null;

  for (let i = 0; i < routeCoords.length - 1; i++) {
    const p1 = routeCoords[i];
    const p2 = routeCoords[i + 1];
    if (
      bounds.contains(L.latLng(p1[0], p1[1])) &&
      !bounds.contains(L.latLng(p2[0], p2[1]))
    ) {
      const exit = segmentBoundsExit(p1, p2, bounds);
      if (exit) lastExit = exit;
    }
  }

  return lastExit;
}

// ── Animation helpers ─────────────────────────────────────────────────────────

function flyToAndWait(
  map: L.Map,
  center: L.LatLngExpression,
  zoom: number,
  opts?: L.ZoomPanOptions,
): Promise<void> {
  return new Promise((resolve) => {
    map.once("moveend", () => resolve());
    map.flyTo(center, zoom, opts);
  });
}

function animatePolyline(
  map: L.Map,
  coords: [number, number][],
  color: string,
  durationMs: number,
  cancelled: () => boolean,
  dashArray?: string,
  opacity = 0.88,
): Promise<L.Polyline> {
  return new Promise((resolve) => {
    const polyline = L.polyline([], {
      color,
      weight: 3.5,
      opacity,
      dashArray,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any).addTo(map);

    if (coords.length === 0) { resolve(polyline); return; }

    const start = performance.now();
    const tick = (now: number) => {
      if (cancelled()) { resolve(polyline); return; }
      const t = Math.min((now - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const count = Math.max(1, Math.floor(eased * coords.length));
      polyline.setLatLngs(coords.slice(0, count));
      if (t < 1) requestAnimationFrame(tick);
      else { polyline.setLatLngs(coords); resolve(polyline); }
    };
    requestAnimationFrame(tick);
  });
}

// ── 2-per-line cap ────────────────────────────────────────────────────────────

function buildLineSections(stops: TransitStop[]): Array<{ line: string; type: TransitType; stops: TransitStop[] }> {
  const seen = new Map<string, { type: TransitType; stops: TransitStop[] }>();
  for (const stop of stops) {
    for (const line of stop.lines) {
      const existing = seen.get(line);
      if (!existing) {
        seen.set(line, { type: stop.type, stops: [stop] });
      } else if (existing.stops.length < 2 && !existing.stops.includes(stop)) {
        existing.stops.push(stop);
      }
    }
  }
  return Array.from(seen.entries()).map(([line, val]) => ({ line, type: val.type, stops: val.stops }));
}

function getFeaturedStops(data: AccessibilityData): TransitStop[] {
  const linedStops = data.transitStops.filter(
    (s) => (s.type === "metro" || s.type === "tram" || s.type === "rer") && s.lines.length > 0,
  );
  const sections = buildLineSections(linedStops);
  const featured: TransitStop[] = [];
  const seenIds = new Set<string>();
  for (const { stops } of sections) {
    for (const stop of stops) {
      if (!seenIds.has(stop.id)) { seenIds.add(stop.id); featured.push(stop); }
    }
  }
  for (const stop of data.transitStops) {
    if ((stop.type === "train" || stop.type === "bus") && !seenIds.has(stop.id)) {
      seenIds.add(stop.id); featured.push(stop);
    }
  }
  return featured;
}

// ── Line-shape drawing ────────────────────────────────────────────────────────

interface ShapeStop {
  lat: number; lng: number;
  color: string;
  isTerminus: boolean;
  name: string;
}

/** Collect all stops from all line shapes, then draw with offsets for co-located dots. */
function drawAllLineShapes(
  map: L.Map,
  lineShapes: Record<string, LineShape>,
  featuredLatLngs: Set<string>,
): L.Layer[] {
  // Pass 1: collect stops per location key
  // Precision ~11m — stops closer than that are considered co-located
  const byLocation = new Map<string, ShapeStop[]>();

  for (const [lineRef, shape] of Object.entries(lineShapes)) {
    const color = getLineColor(shape.type, lineRef);
    for (const seg of (shape.segments ?? [])) {
      for (const s of seg) {
        if (!isFinite(s.lat) || !isFinite(s.lng)) continue;
        if (featuredLatLngs.has(`${s.lat},${s.lng}`)) continue;
        const key = `${s.lat.toFixed(4)},${s.lng.toFixed(4)}`;
        if (!byLocation.has(key)) byLocation.set(key, []);
        byLocation.get(key)!.push({ lat: s.lat, lng: s.lng, color, isTerminus: s.isTerminus, name: s.name });
      }
    }
  }

  // Pass 2: draw dots with radial offset when N > 1 lines share a location.
  // Offset radius = 20m → ~4px at zoom 15, guarantees < 20% overlap for r=4px dots.
  const OFFSET_M = 20;
  const LAT_PER_M  = 1 / 111_000;
  const LNG_PER_M  = 1 / (111_000 * Math.cos(46.5 * Math.PI / 180)); // France centroid

  const layers: L.Layer[] = [];
  for (const stops of Array.from(byLocation.values())) {
    const n = stops.length;
    stops.forEach((s: ShapeStop, i: number) => {
      let lat = s.lat;
      let lng = s.lng;
      if (n > 1) {
        const angle = (2 * Math.PI * i) / n - Math.PI / 2;
        lat += Math.cos(angle) * OFFSET_M * LAT_PER_M;
        lng += Math.sin(angle) * OFFSET_M * LNG_PER_M;
      }
      const r = s.isTerminus ? 6 : 4;
      const dot = L.circleMarker([lat, lng], {
        radius: r, color: "white", weight: 1.5,
        fillColor: s.color, fillOpacity: s.isTerminus ? 0.9 : 0.65,
      }).addTo(map);
      if (s.isTerminus) {
        dot.bindTooltip(`<strong>${s.name}</strong>`, {
          permanent: false, direction: "right", className: "acc-tooltip", offset: [8, 0],
        });
      }
      layers.push(dot);
    });
  }
  return layers;
}

function delay(ms: number, cancelled: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    setTimeout(() => { if (cancelled()) { clearTimeout(t); resolve(); } }, 50);
  });
}

// ── Inner component that has access to the map instance ──────────────────────

interface AnimatorProps {
  data: AccessibilityData | null;
  dark: boolean;
  onPhaseChange: (phase: "idle" | "l1" | "l2" | "done") => void;
}

function MapAnimator({ data, dark, onPhaseChange }: AnimatorProps) {
  const map = useMap();
  const cancelRef = useRef(false);

  useEffect(() => {
    // Cancel any in-flight animation from the previous run
    cancelRef.current = true;

    if (!data) {
      onPhaseChange("idle");
      return;
    }

    // Local state for this effect run — cleaned up via the returned function
    cancelRef.current = false;
    const cancelled = () => cancelRef.current;
    const layers: L.Layer[] = [];
    const addLayer = (l: L.Layer) => { layers.push(l); return l; };
    const removeListeners: Array<() => void> = [];

    const run = async () => {
      // ── Phase 1: Fly to address ─────────────────────────────────────────
      onPhaseChange("l1");
      await flyToAndWait(map, [data.lat, data.lng], 15, { duration: 1.5 });
      if (cancelled()) return;

      addLayer(L.marker([data.lat, data.lng], { icon: makeAddressIcon(), zIndexOffset: 1000 }).addTo(map));

      // ── Phase 2a: Line shapes (dashed trails + stop dots) ───────────────
      const featuredStops = getFeaturedStops(data);
      const featuredLatLngs = new Set(featuredStops.map((s) => `${s.lat},${s.lng}`));

      if (data.lineShapes) {
        for (const l of drawAllLineShapes(map, data.lineShapes, featuredLatLngs)) addLayer(l);
      }

      // ── Phase 2b: Animate walking routes to featured stops (staggered) ──
      await Promise.all(
        featuredStops.map((stop, i) =>
          delay(i * 350, cancelled).then(async () => {
            if (cancelled()) return;
            addLayer(await animatePolyline(map, stop.routeCoords, stopIconColor(stop), 700, cancelled));
            if (cancelled()) return;
            const marker = addLayer(
              L.marker([stop.lat, stop.lng], { icon: makeTransitIcon(stop), zIndexOffset: 500 }).addTo(map)
            ) as L.Marker;
            const dist = stop.walkingDistance < 1000
              ? `${stop.walkingDistance} m`
              : `${(stop.walkingDistance / 1000).toFixed(1)} km`;
            marker.bindTooltip(
              `<strong>${stop.name}</strong><br>${stop.walkingTime} min · ${dist}`,
              { permanent: false, direction: "right", className: "acc-tooltip", offset: [10, 0] },
            );
          })
        )
      );
      if (cancelled()) return;
      await delay(800, cancelled);
      if (cancelled()) return;

      // ── Phase 3: Airport routes + dynamic edge cards ────────────────────
      if (data.airports.length === 0) { onPhaseChange("done"); return; }
      onPhaseChange("l2");

      await Promise.all(
        data.airports.map((airport, i) =>
          delay(i * 450, cancelled).then(async () => {
            if (cancelled()) return;

            // Full animated driving route (solid line)
            addLayer(await animatePolyline(map, airport.routeCoords, "#ef4444", 1100, cancelled, undefined, 0.18));
            if (cancelled()) return;

            // Small marker at actual airport location (visible when zoomed out)
            const airportMarker = addLayer(
              L.marker([airport.lat, airport.lng], { icon: makeAirportIcon(), zIndexOffset: 800 }).addTo(map)
            ) as L.Marker;
            airportMarker.bindTooltip(
              `<strong>${airport.city} ${airport.iata}</strong><br>${airport.drivingTime} min · ${airport.drivingDistance} km`,
              { permanent: false, direction: "right", className: "acc-tooltip", offset: [12, 0] },
            );
            if (cancelled()) return;

            // Dynamic edge card — repositions on every map move/zoom
            let edgeMarker: L.Marker | null = null;

            const updateEdgeCard = () => {
              const bounds = map.getBounds();

              // Airport entered the viewport → hide edge card
              if (bounds.contains(L.latLng(airport.lat, airport.lng))) {
                if (edgeMarker) edgeMarker.setOpacity(0);
                return;
              }

              const exit = findRouteExitPoint(airport.routeCoords, bounds);
              if (!exit) { if (edgeMarker) edgeMarker.setOpacity(0); return; }

              const icon = makeAirportEdgeIcon(airport, exit.edge, dark);
              if (!edgeMarker) {
                edgeMarker = L.marker(exit.point, { icon, zIndexOffset: 900, interactive: false }).addTo(map);
                layers.push(edgeMarker); // register for cleanup
              } else {
                edgeMarker.setLatLng(exit.point);
                edgeMarker.setIcon(icon);
                edgeMarker.setOpacity(1);
              }
            };

            map.on("moveend zoomend", updateEdgeCard);
            removeListeners.push(() => map.off("moveend zoomend", updateEdgeCard));
            updateEdgeCard(); // initial placement at current zoom
          })
        )
      );
      if (cancelled()) return;

      onPhaseChange("done");
    };

    run();

    return () => {
      cancelRef.current = true;
      removeListeners.forEach((fn) => fn());
      layers.forEach((l) => { try { map.removeLayer(l); } catch { /* layer already gone */ } });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  void dark;
  return null;
}

// ── Public component ──────────────────────────────────────────────────────────

interface Props {
  data: AccessibilityData | null;
  dark: boolean;
  onPhaseChange: (phase: "idle" | "l1" | "l2" | "done") => void;
}

export default function AccessibilityMap({ data, dark, onPhaseChange }: Props) {
  return (
    <MapContainer
      center={[46.5, 2.5]}
      zoom={5}
      style={{ height: "100%", width: "100%" }}
      scrollWheelZoom
      zoomControl
    >
      <TileLayer
        key={dark ? "dark" : "light"}
        url={
          dark
            ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        }
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        maxZoom={19}
      />
      <MapAnimator data={data} dark={dark} onPhaseChange={onPhaseChange} />
    </MapContainer>
  );
}
