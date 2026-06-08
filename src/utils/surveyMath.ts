import { TraverseSegment, TieLine, SurveyPlot, BearingQuadrant } from "../types";

// Convert Bearings to Lat/Dep (Y/X) in meters
export function calculateSegmentXY(
  quadrant: BearingQuadrant,
  degrees: number,
  minutes: number,
  seconds: number,
  distance: number
): { dep: number; lat: number } {
  // Convert DMS to decimal degrees
  const decimalDegrees = degrees + minutes / 60 + seconds / 3600;
  const rad = (decimalDegrees * Math.PI) / 180;

  let lat = 0; // Northing (Y)
  let dep = 0; // Easting (X)

  switch (quadrant) {
    case "NE":
      lat = distance * Math.cos(rad);
      dep = distance * Math.sin(rad);
      break;
    case "SE":
      lat = -distance * Math.cos(rad);
      dep = distance * Math.sin(rad);
      break;
    case "SW":
      lat = -distance * Math.cos(rad);
      dep = -distance * Math.sin(rad);
      break;
    case "NW":
      lat = distance * Math.cos(rad);
      dep = -distance * Math.sin(rad);
      break;
    case "N":
    case "DUE_N":
      lat = distance;
      dep = 0;
      break;
    case "S":
    case "DUE_S":
      lat = -distance;
      dep = 0;
      break;
    case "E":
    case "DUE_E":
      lat = 0;
      dep = distance;
      break;
    case "W":
    case "DUE_W":
      lat = 0;
      dep = -distance;
      break;
    default:
      // Fallback
      lat = 0;
      dep = 0;
  }

  // Round to 4 decimal places for millimetric precision
  return {
    dep: Math.round(dep * 10000) / 10000,
    lat: Math.round(lat * 10000) / 10000,
  };
}

// Compute Area using the Shoelace Formula (Gauss's Area Formula)
export function calculatePolygonArea(coords: { x: number; y: number }[]): number {
  if (coords.length < 3) return 0;
  let area = 0;
  const n = coords.length;
  for (let i = 0; i < n; i++) {
    const current = coords[i];
    const next = coords[(i + 1) % n];
    area += current.x * next.y - next.x * current.y;
  }
  return Math.abs(area) / 2;
}

// Recalculates coordinates, error of closure, adjusts using Compass Rule, and computes areas
export function processSurveyPlot(
  payload: Partial<SurveyPlot>,
  userTiePointLat: number = 14.5995, // Default Manila Lat
  userTiePointLng: number = 120.9842 // Default Manila Lng
): SurveyPlot {
  const lotName = payload.lotName || "Lot 1";
  const surveyNo = payload.surveyNo || "";
  const cadastreNo = payload.cadastreNo || "";
  const municipality = payload.municipality || "";
  const province = payload.province || "";
  const tiePointName = payload.tiePointName || "Tie Point (BLLM No. 1)";
  const statedArea = payload.statedArea || null;
  const rawText = payload.rawText || "";

  // 1. Process Tie Line first
  let tieLine: TieLine | null = null;
  if (payload.tieLine) {
    const { dep, lat } = calculateSegmentXY(
      payload.tieLine.bearingQuadrant,
      payload.tieLine.bearingDegrees || 0,
      payload.tieLine.bearingMinutes || 0,
      payload.tieLine.bearingSeconds || 0,
      payload.tieLine.distance || 0
    );
    tieLine = {
      ...payload.tieLine,
      dep,
      lat,
    };
  }

  // 2. Compute initial unadjusted departures (X) and latitudes (Y) for boundary segments
  let boundarySegments: TraverseSegment[] = (payload.boundarySegments || []).map((seg, index) => {
    const { dep, lat } = calculateSegmentXY(
      seg.bearingQuadrant,
      seg.bearingDegrees || 0,
      seg.bearingMinutes || 0,
      seg.bearingSeconds || 0,
      seg.distance || 0
    );
    return {
      ...seg,
      id: seg.id || `seg-${index}`,
      dep,
      lat,
      adjustedDep: dep,
      adjustedLat: lat,
    };
  });

  // 3. Compute closure error
  let sumDep = 0;
  let sumLat = 0;
  let totalPerimeter = 0;

  boundarySegments.forEach((seg) => {
    sumDep += seg.dep;
    sumLat += seg.lat;
    totalPerimeter += seg.distance;
  });

  const closureErrorX = sumDep;
  const closureErrorY = sumLat;
  const closureErrorTotal = Math.sqrt(closureErrorX * closureErrorX + closureErrorY * closureErrorY);

  // Precision Ratio: e.g. 1:5,000
  let precisionRatio = "Perfect";
  if (totalPerimeter > 0 && closureErrorTotal > 0.0001) {
    const ratio = Math.round(totalPerimeter / closureErrorTotal);
    precisionRatio = `1:${ratio.toLocaleString()}`;
  }

  // 4. Calculate unadjusted coordinates (cumulative starting from Corner 1 at [0,0])
  let currentX = 0;
  let currentY = 0;
  const unadjustedCoords = [{ x: 0, y: 0 }];
  for (let i = 0; i < boundarySegments.length - 1; i++) {
    currentX += boundarySegments[i].dep;
    currentY += boundarySegments[i].lat;
    unadjustedCoords.push({ x: currentX, y: currentY });
  }
  const calculatedAreaUnadjusted = calculatePolygonArea(unadjustedCoords);

  // 5. Balance using Compass (Bowditch) Rule and calculate adjusted coordinates
  let calculatedAreaAdjusted = calculatedAreaUnadjusted;
  let isBalanced = false;

  if (totalPerimeter > 0 && closureErrorTotal > 0.001) {
    let balancedX = 0;
    let balancedY = 0;
    const adjustedCoords = [{ x: 0, y: 0 }];

    boundarySegments = boundarySegments.map((seg) => {
      // Adjustment proportional to length
      const correctionDep = -closureErrorX * (seg.distance / totalPerimeter);
      const correctionLat = -closureErrorY * (seg.distance / totalPerimeter);

      const adjustedDep = Math.round((seg.dep + correctionDep) * 10000) / 10000;
      const adjustedLat = Math.round((seg.lat + correctionLat) * 10000) / 10000;

      return {
        ...seg,
        adjustedDep,
        adjustedLat,
      };
    });

    // Compute adjusted coordinates
    for (let i = 0; i < boundarySegments.length - 1; i++) {
      balancedX += boundarySegments[i].adjustedDep;
      balancedY += boundarySegments[i].adjustedLat;
      adjustedCoords.push({ x: balancedX, y: balancedY });
    }
    calculatedAreaAdjusted = calculatePolygonArea(adjustedCoords);
    isBalanced = true;
  } else {
    // If error is negligible, adjusted is same as unadjusted
    boundarySegments = boundarySegments.map((seg) => ({
      ...seg,
      adjustedDep: seg.dep,
      adjustedLat: seg.lat,
    }));
    isBalanced = true;
  }

  return {
    lotName,
    surveyNo,
    cadastreNo,
    municipality,
    province,
    tiePointName,
    tiePointLat: userTiePointLat,
    tiePointLng: userTiePointLng,
    tieLine,
    boundarySegments,
    statedArea,
    calculatedAreaUnadjusted: Math.round(calculatedAreaUnadjusted * 100) / 100,
    calculatedAreaAdjusted: Math.round(calculatedAreaAdjusted * 100) / 100,
    closureErrorX: Math.round(closureErrorX * 1000) / 1000,
    closureErrorY: Math.round(closureErrorY * 1000) / 1000,
    closureErrorTotal: Math.round(closureErrorTotal * 1000) / 1000,
    precisionRatio,
    isBalanced,
    rawText,
  };
}

// Convert relative coordinates (dX, dY in meters) to WGS84 decimal Lat/Long
// Based on local Mercator approximation
export function relativeMeterOffsetToWgs84(
  refLat: number,
  refLng: number,
  offsetX: number, // Easting in m
  offsetY: number  // Northing in m
): { lat: number; lng: number } {
  const metersPerDegreeLat = 111132.954; // approximately
  const metersPerDegreeLng = 111132.954 * Math.cos((refLat * Math.PI) / 180);

  const deltaLat = offsetY / metersPerDegreeLat;
  const deltaLng = offsetX / metersPerDegreeLng;

  return {
    lat: refLat + deltaLat,
    lng: refLng + deltaLng,
  };
}

// Computes the absolute WGS84 path coordinates of the lot polygon starting from the anchor
export function getWgs84Coordinates(plot: SurveyPlot): {
  tiePoint: [number, number];
  corner1: [number, number];
  corners: [number, number][]; // Polygons closed by returning to corner 1
  cornersWithLabels: { label: string; coords: [number, number] }[];
} {
  const tiePointLat = plot.tiePointLat;
  const tiePointLng = plot.tiePointLng;

  // 1. Position of Corner 1
  let corner1Lat = tiePointLat;
  let corner1Lng = tiePointLng;

  if (plot.tieLine) {
    const c1 = relativeMeterOffsetToWgs84(
      tiePointLat,
      tiePointLng,
      plot.tieLine.dep,
      plot.tieLine.lat
    );
    corner1Lat = c1.lat;
    corner1Lng = c1.lng;
  }

  // 2. Corner paths (adjusted coordinates)
  let currentOffsetX = 0;
  let currentOffsetY = 0;

  const corners: [number, number][] = [[corner1Lat, corner1Lng]];
  const cornersWithLabels = [{ label: "Corner 1", coords: [corner1Lat, corner1Lng] as [number, number] }];

  plot.boundarySegments.forEach((seg, idx) => {
    currentOffsetX += seg.adjustedDep;
    currentOffsetY += seg.adjustedLat;

    const cornerPos = relativeMeterOffsetToWgs84(
      corner1Lat,
      corner1Lng,
      currentOffsetX,
      currentOffsetY
    );

    // We collect intermediate corners.
    // If it's the last segment, it is supposed to close back to Corner 1,
    // so we can append corner 1 at the end to close the visual polygon, or just skip duplicating its label
    const isLastSegment = idx === plot.boundarySegments.length - 1;
    if (!isLastSegment) {
      const cornerNumber = idx + 2;
      corners.push([cornerPos.lat, cornerPos.lng]);
      cornersWithLabels.push({
        label: `Corner ${cornerNumber}`,
        coords: [cornerPos.lat, cornerPos.lng],
      });
    }
  });

  // Ensure it's closed
  corners.push([corner1Lat, corner1Lng]);

  return {
    tiePoint: [tiePointLat, tiePointLng],
    corner1: [corner1Lat, corner1Lng],
    corners,
    cornersWithLabels,
  };
}

// Generate KML file content client-side
export function generateKmlContent(plot: SurveyPlot): string {
  const { tiePoint, corner1, corners, cornersWithLabels } = getWgs84Coordinates(plot);

  const lotName = plot.lotName || "Lot";
  const surveyNo = plot.surveyNo ? `Survey No: ${plot.surveyNo}` : "";
  const location = `${plot.municipality || "Unknown"}, ${plot.province || "Unknown"}`;

  // Assemble boundary coords string in KML format "lng,lat,alt"
  // Note: KML uses longitude,latitude,altitude ordering
  const boundaryCoordsKml = corners
    .map((c) => `${c[1]},${c[0]},0`)
    .join("\r\n            ");

  // Assemble corners placemarks
  const cornersPlacemarksKml = cornersWithLabels
    .map(
      (c, idx) => `    <Placemark>
      <name>${c.label}</name>
      <description>Latitude: ${c.coords[0].toFixed(6)}, Longitude: ${c.coords[1].toFixed(6)}</description>
      <styleUrl>#cornerStyle</styleUrl>
      <Point>
        <coordinates>${c.coords[1]},${c.coords[0]},0</coordinates>
      </Point>
    </Placemark>`
    )
    .join("\n");

  const tieLinePlacemarkKml = plot.tieLine
    ? `    <!-- Tie Line -->
    <Placemark>
      <name>Tie Line</name>
      <description>From Reference point to Corner 1\nBearing: ${plot.tieLine.bearingQuadrant} ${plot.tieLine.bearingDegrees}° ${plot.tieLine.bearingMinutes}'\nDistance: ${plot.tieLine.distance} m</description>
      <styleUrl>#tieLineStyle</styleUrl>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>
          ${tiePoint[1]},${tiePoint[0]},0
          ${corner1[1]},${corner1[0]},0
        </coordinates>
      </LineString>
    </Placemark>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${lotName} Plot Map</name>
    <description>Calculated property boundary parcel in ${location}\n${surveyNo}\nCalculated Area: ${plot.calculatedAreaAdjusted} sqm (Stated: ${plot.statedArea || "N/A"})\nPrecision: ${plot.precisionRatio}</description>
    
    <!-- Styles -->
    <Style id="tiePointStyle">
      <IconStyle>
        <color>ff0000ff</color> <!-- Red marker icon -->
        <scale>1.2</scale>
        <Icon>
          <href>https://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href>
        </Icon>
      </IconStyle>
      <LabelStyle>
        <scale>1.0</scale>
      </LabelStyle>
    </Style>
    
    <Style id="cornerStyle">
      <IconStyle>
        <color>ff00ff00</color> <!-- Green marker icon -->
        <scale>0.8</scale>
        <Icon>
          <href>https://maps.google.com/mapfiles/kml/shapes/target.png</href>
        </Icon>
      </IconStyle>
      <LabelStyle>
        <scale>0.8</scale>
      </LabelStyle>
    </Style>
    
    <Style id="tieLineStyle">
      <LineStyle>
        <color>ff0000ff</color> <!-- Red line -->
        <width>2.5</width>
      </LineStyle>
    </Style>
    
    <Style id="boundaryStyle">
      <LineStyle>
        <color>ff00ff00</color> <!-- Bright green line -->
        <width>3.5</width>
      </LineStyle>
      <PolyStyle>
        <color>5000ff00</color> <!-- ~30% semi-transparent solid green fill -->
      </PolyStyle>
    </Style>

    <!-- Reference Monument / Tie Point -->
    <Placemark>
      <name>Tie Point: ${plot.tiePointName || "Anchor"}</name>
      <description>Latitude: ${tiePoint[0].toFixed(6)}, Longitude: ${tiePoint[1].toFixed(6)}</description>
      <styleUrl>#tiePointStyle</styleUrl>
      <Point>
        <coordinates>${tiePoint[1]},${tiePoint[0]},0</coordinates>
      </Point>
    </Placemark>

${tieLinePlacemarkKml}

    <!-- Closed Property Polygon -->
    <Placemark>
      <name>${lotName} Area Boundary</name>
      <description>Calculated Area: ${plot.calculatedAreaAdjusted} sqm (Stated: ${plot.statedArea || "N/A"} sqm)\nPrecision: ${plot.precisionRatio}</description>
      <styleUrl>#boundaryStyle</styleUrl>
      <Polygon>
        <extrude>1</extrude>
        <altitudeMode>relativeToGround</altitudeMode>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>
              ${boundaryCoordsKml}
            </coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>

${cornersPlacemarksKml}

  </Document>
</kml>
`;
}
