import type { TransitStop, Airport } from "./accessibility";

export interface SnapshotData {
  address: string;
  imageDataUrl: string;
  selectedTransit: TransitStop[];
  selectedAirports: Airport[];
}
