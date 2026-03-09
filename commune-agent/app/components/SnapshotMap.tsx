"use client";

import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import type { AccessibilityData, Airport, TransitStop, TransitType } from "@/app/types/accessibility";
import { getLineColor, getContrastText } from "@/app/lib/transitColors";

// Fix Leaflet default icon broken by webpack
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// ── Constants ──────────────────────────────────────────────────────────────────

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

// 1km in each direction from center = 2km frame
const FRAME_KM = 1;

// ── Zoom calculation ────────────────────────────────────────────────────────────

/**
 * Compute Leaflet zoom so that MAP_SIZE_PX covers FRAME_KM*2 km of real-world width.
 */
function computeZoom(lat: number, mapSizePx: number, frameKm: number): number {
  const targetMeters = frameKm * 2 * 1000; // 2km
  const metersPerPixel = targetMeters / mapSizePx;
  const zoom = Math.log2(
    (156543.03392 * Math.cos((lat * Math.PI) / 180)) / metersPerPixel,
  );
  return Math.round(zoom);
}

// ── Bounds helpers ─────────────────────────────────────────────────────────────

function frameBounds(centerLat: number, centerLng: number, frameKm: number): {
  minLat: number; maxLat: number; minLng: number; maxLng: number;
} {
  const dLat = frameKm / 111.32;
  const dLng = frameKm / (111.32 * Math.cos((centerLat * Math.PI) / 180));
  return {
    minLat: centerLat - dLat,
    maxLat: centerLat + dLat,
    minLng: centerLng - dLng,
    maxLng: centerLng + dLng,
  };
}

function isInFrame(
  lat: number,
  lng: number,
  bounds: ReturnType<typeof frameBounds>,
): boolean {
  return (
    lat >= bounds.minLat &&
    lat <= bounds.maxLat &&
    lng >= bounds.minLng &&
    lng <= bounds.maxLng
  );
}

type EdgeDir = "n" | "s" | "e" | "w";

/**
 * Cardinal direction from center to target point.
 */
function cardinalDir(
  centerLat: number, centerLng: number,
  targetLat: number, targetLng: number,
  cosLat: number,
): EdgeDir {
  const dLat = targetLat - centerLat;
  const dLng = (targetLng - centerLng) * cosLat;
  if (Math.abs(dLat) >= Math.abs(dLng)) {
    return dLat >= 0 ? "n" : "s";
  }
  return dLng >= 0 ? "e" : "w";
}

/**
 * Clamp a lat/lng to the frame boundary on the given edge.
 */
function clampToBorder(
  lat: number, lng: number,
  bounds: ReturnType<typeof frameBounds>,
  edge: EdgeDir,
): [number, number] {
  switch (edge) {
    case "n": return [bounds.maxLat, Math.min(bounds.maxLng, Math.max(bounds.minLng, lng))];
    case "s": return [bounds.minLat, Math.min(bounds.maxLng, Math.max(bounds.minLng, lng))];
    case "e": return [Math.min(bounds.maxLat, Math.max(bounds.minLat, lat)), bounds.maxLng];
    case "w": return [Math.min(bounds.maxLat, Math.max(bounds.minLat, lat)), bounds.minLng];
  }
}

// ── Icon helpers ───────────────────────────────────────────────────────────────

function makeAddressIcon(): L.DivIcon {
  return L.divIcon({
    className: "",
    iconSize: [40, 40],
    iconAnchor: [20, 40],
    html: `<div style="position:relative;width:40px;height:40px;display:flex;align-items:center;justify-content:center;">
      <div style="width:20px;height:20px;background:var(--c21-gold,#d4af37);border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 3px 10px rgba(0,0,0,0.35);"></div>
    </div>`,
  });
}

function circleHtml(color: string, label: string): string {
  const textColor = getContrastText(color);
  const fs = label.length > 3 ? "6px" : label.length > 2 ? "7px" : label.length === 2 ? "8px" : "9px";
  return `<div style="width:26px;height:26px;background:${color};border-radius:50%;border:2.5px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.28);display:flex;align-items:center;justify-content:center;color:${textColor};font-size:${fs};font-weight:800;font-family:'Plus Jakarta Sans',sans-serif;letter-spacing:-0.5px;">${label}</div>`;
}

function squareHtml(color: string, label: string): string {
  const textColor = getContrastText(color);
  const fs = label.length > 3 ? "6px" : label.length > 2 ? "7px" : label.length === 2 ? "8px" : "9px";
  return `<div style="width:26px;height:26px;background:${color};border-radius:5px;border:2.5px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.28);display:flex;align-items:center;justify-content:center;color:${textColor};font-size:${fs};font-weight:800;font-family:'Plus Jakarta Sans',sans-serif;letter-spacing:-0.5px;">${label}</div>`;
}

function trainBadgeHtml(): string {
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

function stopBadgeHtml(stop: TransitStop): string {
  if (stop.type === "train") return trainBadgeHtml();
  const lines = stop.lines.slice(0, 1);
  if (lines.length === 0) {
    return stop.type === "tram"
      ? squareHtml(STOP_COLORS[stop.type], STOP_LETTER[stop.type])
      : circleHtml(STOP_COLORS[stop.type], STOP_LETTER[stop.type]);
  }
  const color = getLineColor(stop.type, lines[0]);
  return stop.type === "tram"
    ? squareHtml(color, lines[0])
    : circleHtml(color, lines[0]);
}

/**
 * Composite icon: label card above + badge below.
 * The iconAnchor is set so the badge center is at the geographic coordinate.
 */
function makeTransitLabelIcon(stop: TransitStop): L.DivIcon {
  const name = stop.name.length > 20 ? stop.name.slice(0, 18) + "…" : stop.name;
  const timeLabel = `${stop.walkingTime} min à pied`;
  const badge = stopBadgeHtml(stop);
  const badgeH = stop.type === "train" ? 26 : 26;
  const CARD_H = 38;
  const GAP = 5;
  const totalH = CARD_H + GAP + badgeH;
  const W = 140;

  return L.divIcon({
    className: "",
    iconSize: [W, totalH],
    iconAnchor: [W / 2, CARD_H + GAP + badgeH / 2],
    html: `<div style="position:relative;width:${W}px;height:${totalH}px;">
      <!-- label card -->
      <div style="position:absolute;top:0;left:0;right:0;height:${CARD_H}px;
        background:white;border-radius:7px;padding:4px 8px;box-sizing:border-box;
        border:1px solid #e5e7eb;box-shadow:0 2px 8px rgba(0,0,0,0.15);
        font-family:system-ui,sans-serif;text-align:center;">
        <div style="font-size:9.5px;font-weight:700;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.2;">${name}</div>
        <div style="font-size:8.5px;color:#6b7280;margin-top:2px;line-height:1.2;">${timeLabel}</div>
      </div>
      <!-- connector -->
      <div style="position:absolute;top:${CARD_H}px;left:50%;transform:translateX(-50%);
        width:0;height:0;
        border-left:4px solid transparent;border-right:4px solid transparent;
        border-top:${GAP}px solid white;"></div>
      <!-- badge centered at bottom -->
      <div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);">
        ${badge}
      </div>
    </div>`,
  });
}

// ── Edge cards ─────────────────────────────────────────────────────────────────

function makeTransitEdgeIcon(stop: TransitStop, edge: EdgeDir): L.DivIcon {
  const CARD_W = 148;
  const CARD_H = 46;
  const A = 7;
  const name = stop.name.length > 18 ? stop.name.slice(0, 16) + "…" : stop.name;
  const badge = stopBadgeHtml(stop);

  const cardHtml = `
    <div style="
      background:white;border-radius:9px;padding:6px 9px;
      display:flex;align-items:center;gap:7px;
      border:1.5px solid #e5e7eb;
      width:${CARD_W}px;height:${CARD_H}px;box-sizing:border-box;
    ">
      ${badge}
      <div style="flex:1;min-width:0;">
        <div style="font-size:10px;font-weight:700;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${name}</div>
        <div style="font-size:9px;color:#6b7280;white-space:nowrap;">${stop.walkingTime} min à pied</div>
      </div>
    </div>`;

  const arrowN = `<div style="width:0;height:0;border-left:${A}px solid transparent;border-right:${A}px solid transparent;border-bottom:${A}px solid white;margin:0 auto;"></div>`;
  const arrowS = `<div style="width:0;height:0;border-left:${A}px solid transparent;border-right:${A}px solid transparent;border-top:${A}px solid white;margin:0 auto;"></div>`;
  const arrowE = `<div style="width:0;height:0;border-top:${A}px solid transparent;border-bottom:${A}px solid transparent;border-left:${A}px solid white;flex-shrink:0;"></div>`;
  const arrowW = `<div style="width:0;height:0;border-top:${A}px solid transparent;border-bottom:${A}px solid transparent;border-right:${A}px solid white;flex-shrink:0;"></div>`;
  const shadow = "drop-shadow(0 4px 12px rgba(0,0,0,0.18))";

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
  return L.divIcon({
    className: "",
    iconSize: [CARD_W + A, CARD_H],
    iconAnchor: [0, CARD_H / 2],
    html: `<div style="display:flex;flex-direction:row;align-items:center;filter:${shadow};">${arrowW}${cardHtml}</div>`,
  });
}

function makeAirportEdgeIcon(airport: Airport, edge: EdgeDir): L.DivIcon {
  const CARD_W = 176;
  const CARD_H = 48;
  const A = 8;
  const name = `${airport.city} · ${airport.iata}`;
  const time = `${airport.drivingTime} min en voiture`;
  const shadow = "drop-shadow(0 4px 14px rgba(0,0,0,0.18))";

  const cardHtml = `
    <div style="
      background:white;border-radius:10px;padding:7px 11px;
      display:flex;align-items:center;gap:8px;
      border:1.5px solid #e5e7eb;
      width:${CARD_W}px;height:${CARD_H}px;box-sizing:border-box;
    ">
      <div style="width:24px;height:24px;background:#ef4444;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:13px;color:white;flex-shrink:0;">✈</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:11px;font-weight:700;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${name}</div>
        <div style="font-size:10px;color:#6b7280;white-space:nowrap;">${time}</div>
      </div>
    </div>`;

  const arrowN = `<div style="width:0;height:0;border-left:${A}px solid transparent;border-right:${A}px solid transparent;border-bottom:${A}px solid white;margin:0 auto;"></div>`;
  const arrowS = `<div style="width:0;height:0;border-left:${A}px solid transparent;border-right:${A}px solid transparent;border-top:${A}px solid white;margin:0 auto;"></div>`;
  const arrowE = `<div style="width:0;height:0;border-top:${A}px solid transparent;border-bottom:${A}px solid transparent;border-left:${A}px solid white;flex-shrink:0;"></div>`;
  const arrowW = `<div style="width:0;height:0;border-top:${A}px solid transparent;border-bottom:${A}px solid transparent;border-right:${A}px solid white;flex-shrink:0;"></div>`;

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
  return L.divIcon({
    className: "",
    iconSize: [CARD_W + A, CARD_H],
    iconAnchor: [0, CARD_H / 2],
    html: `<div style="display:flex;flex-direction:row;align-items:center;filter:${shadow};">${arrowW}${cardHtml}</div>`,
  });
}

// ── Map content component (runs inside MapContainer) ──────────────────────────

interface MapContentProps {
  data: AccessibilityData;
  onReady: () => void;
}

function MapContent({ data, onReady }: MapContentProps) {
  const map = useMap();
  const layersRef = useRef<L.Layer[]>([]);

  useEffect(() => {
    const { lat, lng, transitStops, airports } = data;
    const cosLat = Math.cos((lat * Math.PI) / 180);

    // Use actual Leaflet viewport bounds (avoids zoom-rounding mismatch with frameBounds)
    const mb = map.getBounds();
    const bounds = {
      minLat: mb.getSouth(),
      maxLat: mb.getNorth(),
      minLng: mb.getWest(),
      maxLng: mb.getEast(),
    };

    // Clear previous layers
    layersRef.current.forEach((l) => l.remove());
    layersRef.current = [];

    function addLayer(l: L.Layer) {
      l.addTo(map);
      layersRef.current.push(l);
    }

    // ── Collision detection in screen space ──────────────────────────────────
    type Box = { x1: number; y1: number; x2: number; y2: number };
    const placed: Box[] = [];
    const MARGIN = 10; // px safety gap between cards

    function fits(box: Box): boolean {
      return !placed.some(
        (b) =>
          box.x1 < b.x2 + MARGIN &&
          box.x2 > b.x1 - MARGIN &&
          box.y1 < b.y2 + MARGIN &&
          box.y2 > b.y1 - MARGIN,
      );
    }

    function screenPt(slat: number, slng: number): L.Point {
      return map.latLngToContainerPoint([slat, slng]);
    }

    // ── Address marker (always) ──────────────────────────────────────────────
    addLayer(L.marker([lat, lng], { icon: makeAddressIcon(), zIndexOffset: 1000 }));
    const addrPt = screenPt(lat, lng);
    placed.push({ x1: addrPt.x - 20, y1: addrPt.y - 40, x2: addrPt.x + 20, y2: addrPt.y });

    // ── Limit: max 2 stops per transit line ─────────────────────────────────
    const lineCount = new Map<string, number>();
    const stopsFiltered = [...transitStops]
      .sort((a, b) => a.walkingTime - b.walkingTime)
      .filter((stop) => {
        const keys =
          stop.lines.length > 0
            ? stop.lines.map((l) => `${stop.type}::${l}`)
            : [`${stop.type}::__unknown__`];
        const ok = keys.some((k) => (lineCount.get(k) ?? 0) < 2);
        if (ok) keys.forEach((k) => lineCount.set(k, (lineCount.get(k) ?? 0) + 1));
        return ok;
      });

    const inFrame = stopsFiltered.filter((s) => isInFrame(s.lat, s.lng, bounds));
    const outFrame = stopsFiltered.filter((s) => !isInFrame(s.lat, s.lng, bounds));

    // ── Airport edge cards (priority placement) ──────────────────────────────
    // CARD_W=176, CARD_H=48, A=8 → total edge size: N/S=[176,56], E/W=[184,48]
    for (const airport of airports) {
      const edge = cardinalDir(lat, lng, airport.lat, airport.lng, cosLat);
      const [borderLat, borderLng] = clampToBorder(airport.lat, airport.lng, bounds, edge);
      const p = screenPt(borderLat, borderLng);
      let box: Box;
      if (edge === "n")      box = { x1: p.x - 88, y1: p.y,      x2: p.x + 88, y2: p.y + 56 };
      else if (edge === "s") box = { x1: p.x - 88, y1: p.y - 56, x2: p.x + 88, y2: p.y      };
      else if (edge === "e") box = { x1: p.x - 184, y1: p.y - 24, x2: p.x,      y2: p.y + 24 };
      else                   box = { x1: p.x,       y1: p.y - 24, x2: p.x + 184, y2: p.y + 24 };
      if (!fits(box)) continue;
      placed.push(box);
      addLayer(
        L.marker([borderLat, borderLng], {
          icon: makeAirportEdgeIcon(airport, edge),
          zIndexOffset: 900,
        }),
      );
    }

    // ── In-frame transit stops ───────────────────────────────────────────────
    // Label card: W=140, totalH=69, iconAnchor=[70,56]
    for (const stop of inFrame) {
      const p = screenPt(stop.lat, stop.lng);
      const box: Box = { x1: p.x - 70, y1: p.y - 56, x2: p.x + 70, y2: p.y + 13 };
      if (!fits(box)) continue;
      placed.push(box);

      if (stop.routeCoords && stop.routeCoords.length > 1) {
        const color = stop.lines[0]
          ? getLineColor(stop.type, stop.lines[0])
          : STOP_COLORS[stop.type];
        addLayer(
          L.polyline(stop.routeCoords, { color, weight: 3, opacity: 0.7, dashArray: "6 4" }),
        );
      }
      addLayer(
        L.marker([stop.lat, stop.lng], { icon: makeTransitLabelIcon(stop), zIndexOffset: 500 }),
      );
    }

    // ── Out-of-frame transit edge cards ─────────────────────────────────────
    // Edge card: CARD_W=148, CARD_H=46, A=7 → N/S=[148,53], E/W=[155,46]
    for (const stop of outFrame) {
      const edge = cardinalDir(lat, lng, stop.lat, stop.lng, cosLat);
      const [borderLat, borderLng] = clampToBorder(stop.lat, stop.lng, bounds, edge);
      const p = screenPt(borderLat, borderLng);
      let box: Box;
      if (edge === "n")      box = { x1: p.x - 74, y1: p.y,      x2: p.x + 74, y2: p.y + 53 };
      else if (edge === "s") box = { x1: p.x - 74, y1: p.y - 53, x2: p.x + 74, y2: p.y      };
      else if (edge === "e") box = { x1: p.x - 155, y1: p.y - 23, x2: p.x,      y2: p.y + 23 };
      else                   box = { x1: p.x,        y1: p.y - 23, x2: p.x + 155, y2: p.y + 23 };
      if (!fits(box)) continue;
      placed.push(box);
      addLayer(
        L.marker([borderLat, borderLng], {
          icon: makeTransitEdgeIcon(stop, edge),
          zIndexOffset: 800,
        }),
      );
    }

    // Wait for tiles to load then signal ready
    map.whenReady(() => {
      setTimeout(onReady, 600);
    });

    return () => {
      layersRef.current.forEach((l) => l.remove());
      layersRef.current = [];
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  return null;
}

// ── Public API ─────────────────────────────────────────────────────────────────

export interface SnapshotMapHandle {
  capture: () => Promise<string>;
}

interface Props {
  data: AccessibilityData;
  size?: number;
  onReady?: () => void;
}

const SnapshotMap = forwardRef<SnapshotMapHandle, Props>(function SnapshotMap(
  { data, size = 600, onReady },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const zoom = computeZoom(data.lat, size, FRAME_KM);

  useImperativeHandle(ref, () => ({
    async capture(): Promise<string> {
      const el = containerRef.current;
      if (!el) return "";
      const { default: html2canvas } = await import("html2canvas");
      const canvas = await html2canvas(el, {
        useCORS: true,
        allowTaint: false,
        backgroundColor: "#f0f0f0",
        scale: 2,
      });
      return canvas.toDataURL("image/png");
    },
  }));

  return (
    <div
      ref={containerRef}
      style={{ width: size, height: size, flexShrink: 0, borderRadius: 8, overflow: "hidden" }}
    >
      <MapContainer
        center={[data.lat, data.lng]}
        zoom={zoom}
        zoomControl={false}
        scrollWheelZoom={false}
        dragging={false}
        doubleClickZoom={false}
        touchZoom={false}
        keyboard={false}
        attributionControl={false}
        style={{ width: "100%", height: "100%" }}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          crossOrigin="anonymous"
        />
        <MapContent data={data} onReady={onReady ?? (() => {})} />
      </MapContainer>
    </div>
  );
});

export default SnapshotMap;
