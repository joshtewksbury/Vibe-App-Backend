export interface HeatMapVenue {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  capacity: number;
  currentOccupancy: number;
  rating?: number;
  currentEvents?: string[];
}

export interface TileRequest {
  z: number;
  x: number;
  y: number;
}

export interface GridCell {
  lat: number;
  lng: number;
  intensity: number;
}

export interface HeatMapBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Color {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface GridResponse {
  z: number;
  x: number;
  y: number;
  cells: GridCell[];
  timestamp: string;
}