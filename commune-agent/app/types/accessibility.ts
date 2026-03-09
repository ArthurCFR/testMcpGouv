export type TransitType = "metro" | "rer" | "tram" | "bus" | "train";

export interface TransitStop {
  id: string;
  name: string;
  type: TransitType;
  lat: number;
  lng: number;
  lines: string[];         // line refs from OSM route relations (e.g. "3", "3bis", "86")
  walkingTime: number;     // minutes
  walkingDistance: number; // meters
  routeCoords: [number, number][]; // [lat, lng] for Leaflet
}

export interface Airport {
  iata: string;
  name: string;
  city: string;
  lat: number;
  lng: number;
  drivingTime: number;     // minutes
  drivingDistance: number; // km
  routeCoords: [number, number][]; // [lat, lng] for Leaflet
}

export interface LineShapeStop {
  name: string;
  lat: number;
  lng: number;
  isTerminus: boolean;
}

export interface LineShape {
  type: TransitType;
  segments: LineShapeStop[][]; // each sub-array is a continuous chain; gaps > maxStepKm split into separate segments
}

export interface AccessibilityData {
  address: string;
  lat: number;
  lng: number;
  transitStops: TransitStop[];
  airports: Airport[];
  lineShapes?: Record<string, LineShape>; // line ref → full ordered stop list (non-IDF only)
}

export interface BanFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] }; // [lng, lat]
  properties: {
    label: string;
    score: number;
    housenumber?: string;
    street?: string;
    postcode: string;
    citycode: string;
    city: string;
    context: string;
    type: string;
    importance: number;
    name?: string;
  };
}
