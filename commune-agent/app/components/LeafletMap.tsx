"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import L from "leaflet";

function useDark(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const check = () => setDark(document.documentElement.classList.contains("dark"));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

// Fix Leaflet default icon broken by webpack module resolution
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

/** Auto-fit map viewport to the GeoJSON bounds after data loads */
function FitBounds({ geojson }: { geojson: GeoJSON.GeoJsonObject }) {
  const map = useMap();
  useEffect(() => {
    const layer = L.geoJSON(geojson);
    const bounds = layer.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [24, 24] });
    }
  }, [map, geojson]);
  return null;
}

export default function LeafletMap({
  code_insee,
}: {
  code_insee: string;
  nom: string;
}) {
  const dark = useDark();
  const [geojson, setGeojson] = useState<GeoJSON.GeoJsonObject | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setGeojson(null);
    setError(null);
    fetch(
      `https://geo.api.gouv.fr/communes/${code_insee}?geometry=contour&format=geojson`
    )
      .then((r) => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(setGeojson)
      .catch(() => setError("Impossible de charger le contour de la commune."));
  }, [code_insee]);

  if (error) {
    return (
      <div
        style={{ height: 280 }}
        className="flex items-center justify-center text-zinc-600 text-sm"
      >
        {error}
      </div>
    );
  }

  if (!geojson) {
    return (
      <div
        style={{ height: 280 }}
        className="flex items-center justify-center text-zinc-600 text-sm animate-pulse"
      >
        Chargement…
      </div>
    );
  }

  return (
    <MapContainer
      center={[46.5, 2.5]}
      zoom={10}
      style={{ height: 280 }}
      scrollWheelZoom={false}
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
      <GeoJSON
        key={code_insee}
        data={geojson}
        style={{
          color: "#3b82f6",
          weight: 2,
          fillColor: "#3b82f6",
          fillOpacity: 0.18,
        }}
      />
      <FitBounds geojson={geojson} />
    </MapContainer>
  );
}
