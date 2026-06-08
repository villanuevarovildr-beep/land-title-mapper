export type BearingQuadrant = 'NE' | 'SE' | 'SW' | 'NW' | 'N' | 'S' | 'E' | 'W' | 'DUE_N' | 'DUE_S' | 'DUE_E' | 'DUE_W';

export interface TraverseSegment {
  id: string;
  fromCorner: number;
  toCorner: number;
  direction: string; // e.g. "S. 11 deg. 04' E."
  bearingQuadrant: BearingQuadrant;
  bearingDegrees: number;
  bearingMinutes: number;
  bearingSeconds: number;
  distance: number; // in meters
  // Calculated relative coordinates (departure = dX, latitude = dY)
  dep: number; // Easting component (X)
  lat: number; // Northing component (Y)
  // Adjusted values after compass rule balancing
  adjustedDep: number;
  adjustedLat: number;
  originalText?: string;
}

export interface TieLine {
  bearingQuadrant: BearingQuadrant;
  bearingDegrees: number;
  bearingMinutes: number;
  bearingSeconds: number;
  distance: number;
  dep: number;
  lat: number;
  originalText?: string;
}

export interface SurveyPlot {
  lotName: string;
  surveyNo: string;
  cadastreNo: string;
  municipality: string;
  province: string;
  tiePointName: string; // e.g., "BLLM No. 1"
  tiePointLat: number; // Anchorage WGS84 Latitude
  tiePointLng: number; // Anchorage WGS84 Longitude
  tieLine: TieLine | null;
  boundarySegments: TraverseSegment[];
  statedArea: number | null; // Stated area in title (sqm)
  calculatedAreaUnadjusted: number; // Calculated unadjusted area (sqm)
  calculatedAreaAdjusted: number; // Calculated adjusted area (sqm)
  closureErrorX: number; // Departure closure error
  closureErrorY: number; // Latitude closure error
  closureErrorTotal: number; // Linear error of closure
  precisionRatio: string; // e.g. "1:2,500" or "Perfect"
  isBalanced: boolean;
  rawText: string;
}

export interface ParseTitleRequest {
  text: string;
  model?: string;
}

export interface ParserResponse {
  success: boolean;
  error?: string;
  surveyData?: Partial<SurveyPlot>;
}
