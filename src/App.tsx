import React, { useState, useEffect, useRef } from "react";
import L from "leaflet";
import { 
  Compass, 
  Map as MapIcon, 
  Download, 
  FileText, 
  Sparkles, 
  AlertTriangle, 
  RotateCcw, 
  MapPin, 
  Calculator, 
  Layers, 
  Info, 
  Sliders, 
  CheckCircle,
  HelpCircle,
  Activity,
  Maximize2
} from "lucide-react";
import { SurveyPlot, TraverseSegment, BearingQuadrant } from "./types";
import { SAMPLE_TITLES, PHILIPPINES_PLAZAS, CADASTRAL_TIPS, PlazaPreset, SampleTitle } from "./data/surveyData";
import { processSurveyPlot, getWgs84Coordinates, generateKmlContent, relativeMeterOffsetToWgs84 } from "./utils/surveyMath";

const resolveAutoGeodeticCoordinates = (text: string) => {
  const textLower = (text || "").toLowerCase();
  
  if (textLower.includes("antipolo") || textLower.includes("mambugan") || textLower.includes("mayamot") || textLower.includes("bagong nayon") || textLower.includes("inuman")) {
    return {
      lat: 14.5879,
      lng: 121.1758,
      name: "Antipolo Cathedral Plaza (Antipolo Cadastre BLLM No. 1)",
      station: "Antipolo City Cadastre"
    };
  }
  
  if (textLower.includes("dinalupihan") || textLower.includes("bataan") || textLower.includes("san pedro, municipality of dinalupihan") || textLower.includes("san pedro, dinalupihan")) {
    return {
      lat: 14.8725,
      lng: 120.4632,
      name: "Dinalupihan Municipal Hall (BLLM No. 1 Plaza)",
      station: "Dinalupihan Cadastre BLLM 1"
    };
  }

  if (textLower.includes("quezon city") || textLower.includes("qc") || textLower.includes("diliman") || textLower.includes("barangay central")) {
    return {
      lat: 14.6515,
      lng: 121.0496,
      name: "Quezon City Hall / Memorial Circle",
      station: "Quezon City Cadastre"
    };
  }

  if (textLower.includes("manila") || textLower.includes("binondo") || textLower.includes("intramuros") || textLower.includes("malate") || textLower.includes("sampaloc") || textLower.includes("rizal monument")) {
    return {
      lat: 14.5826,
      lng: 120.9787,
      name: "Manila (Kilometer Zero / Rizal Monument)",
      station: "Manila Cadastre"
    };
  }

  // Under geodetic rules and instructions of this system, Morong Rizal Cadastre (geographic center / township center) is our core anchor.
  // Latitude: 14.5100, Longitude: 121.2380
  return {
    lat: 14.5100,
    lng: 121.2380,
    name: "Morong Plaza (Morong Cadastre BLLM No. 1)",
    station: "Morong, Rizal Cadastre"
  };
};

export default function App() {
  // Parsing states
  const [inputText, setInputText] = useState<string>(SAMPLE_TITLES[0].text);
  const [model, setModel] = useState<string>("gemini-3.5-flash");
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parseWarning, setParseWarning] = useState<string | null>(null);

  // Active survey data (Pre-calculated state)
  const [rawPlot, setRawPlot] = useState<Partial<SurveyPlot> | null>(null);
  const [activePlot, setActivePlot] = useState<SurveyPlot | null>(null);

  // Geo Anchorage & offset states
  const [anchorLat, setAnchorLat] = useState<number>(14.5100);
  const [anchorLng, setAnchorLng] = useState<number>(121.2380);
  const [selectedPlazaName, setSelectedPlazaName] = useState<string>("[Blank] Custom Starting Ref Point");
  const [customStationName, setCustomStationName] = useState<string>("Morong, Rizal Cadastre");
  const [selectedPresetIndex, setSelectedPresetIndex] = useState<number>(0);
  const [autoGeodetic, setAutoGeodetic] = useState<boolean>(true);

  // Offset tuning states (Manual offset compared to satellites)
  const [offsetX, setOffsetX] = useState<number>(0); // Easting offset in meters
  const [offsetY, setOffsetY] = useState<number>(0); // Northing offset in meters

  // Calculations states
  const [applyCompassRule, setApplyCompassRule] = useState<boolean>(true);
  const [mapType, setMapType] = useState<"streets" | "satellite">("satellite");

  // Map references
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerGroupRef = useRef<L.FeatureGroup | null>(null);
  const streetsLayerRef = useRef<L.TileLayer | null>(null);
  const satelliteLayerRef = useRef<L.TileLayer | null>(null);

  // Initialize Sample 1 on load
  useEffect(() => {
    handleLoadPreset(0);
  }, []);

  // Automatic geodetic anchor point resolution based on parsed title text
  useEffect(() => {
    if (!autoGeodetic) return;
    const resolved = resolveAutoGeodeticCoordinates(inputText);
    setAnchorLat(resolved.lat);
    setAnchorLng(resolved.lng);
    setSelectedPlazaName(resolved.name);
    setCustomStationName(resolved.station);
  }, [inputText, autoGeodetic]);

  // Sync / Calculate plots whenever components change
  useEffect(() => {
    if (!rawPlot) return;

    // Apply manual geodetic offset to the reference anchor coordinates
    // Convert offsets (meters) to Lat/Lng shifts
    const metersPerDegreeLat = 111132.954;
    const metersPerDegreeLng = 111132.954 * Math.cos((anchorLat * Math.PI) / 180);

    const adjustedAnchorLat = anchorLat + offsetY / metersPerDegreeLat;
    const adjustedAnchorLng = anchorLng + offsetX / metersPerDegreeLng;

    const plot = processSurveyPlot(
      {
        ...rawPlot,
        rawText: rawPlot.rawText || inputText,
        tiePointName: customStationName || "Reference Anchor",
      },
      adjustedAnchorLat,
      adjustedAnchorLng
    );

    setActivePlot(plot);
  }, [rawPlot, anchorLat, anchorLng, offsetX, offsetY, applyCompassRule, customStationName]);

  // Leaflet map renderer & reactive updates
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Initialize map if not yet created
    if (!mapRef.current) {
      mapRef.current = L.map(mapContainerRef.current, {
        center: [anchorLat, anchorLng],
        zoom: 18,
        zoomControl: false,
      });

      L.control.zoom({ position: "topright" }).addTo(mapRef.current);

      // Map tile definitions
      streetsLayerRef.current = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      });

      satelliteLayerRef.current = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
          attribution: "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
        }
      );

      // Default to satellite view as it is crucial for comparing NAMRIA/physical landmarks
      satelliteLayerRef.current.addTo(mapRef.current);
      markerGroupRef.current = L.featureGroup().addTo(mapRef.current);
    }

    // React to mapType changes
    if (mapRef.current && streetsLayerRef.current && satelliteLayerRef.current) {
      if (mapType === "streets") {
        mapRef.current.removeLayer(satelliteLayerRef.current);
        streetsLayerRef.current.addTo(mapRef.current);
      } else {
        mapRef.current.removeLayer(streetsLayerRef.current);
        satelliteLayerRef.current.addTo(mapRef.current);
      }
    }

    return () => {
      // Clean up is handled inside the app lifecycle but map is persisted across mounts
    };
  }, [mapType]);

  // Clear and Redraw elements on the Map whenever the active plot modifications happen
  useEffect(() => {
    if (!mapRef.current || !markerGroupRef.current || !activePlot) return;

    const markerGroup = markerGroupRef.current;
    markerGroup.clearLayers();

    // 1. Get WGS84 coordinates of survey
    const { tiePoint, corner1, corners, cornersWithLabels } = getWgs84Coordinates(activePlot);

    // 2. Add Draggable Monument/Anchor Marker
    const monumentIcon = L.divIcon({
      html: `
        <div class="relative flex items-center justify-center">
          <div class="absolute w-8 h-8 bg-red-500/30 rounded-full animate-ping"></div>
          <div class="relative w-8 h-8 flex items-center justify-center bg-red-600 rounded-full border-2 border-white shadow-lg text-white font-mono font-bold text-xs" title="Tie Point reference target">B</div>
        </div>
      `,
      className: "",
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });

    const monumentMarker = L.marker([tiePoint[0], tiePoint[1]], {
      icon: monumentIcon,
      draggable: true,
    }).addTo(markerGroup);

    // Bind dragging feedback
    monumentMarker.on("dragend", (event: any) => {
      const marker = event.target;
      const position = marker.getLatLng();
      setAnchorLat(position.lat);
      setAnchorLng(position.lng);
      setSelectedPlazaName("Custom Drag Position");
      setCustomStationName("Custom Dragged Reference");
      setAutoGeodetic(false);
    });

    monumentMarker.bindTooltip(
      `<b>${activePlot.tiePointName || "Reference Anchor"}</b><br/>Lat: ${tiePoint[0].toFixed(6)}<br/>Lng: ${tiePoint[1].toFixed(6)}<br/><span class="text-xs text-red-400">Drag to instantly shift map alignment!</span>`,
      { permanent: false, direction: "top" }
    );

    // 3. Add Tie Line (Dashed red line from reference monument to corner 1)
    if (activePlot.tieLine) {
      const tieLinePath = L.polyline([tiePoint, corner1], {
        color: "#ef4444",
        weight: 2,
        dashArray: "6, 6",
        opacity: 0.8,
      }).addTo(markerGroup);

      tieLinePath.bindTooltip(
        `<b>Tie Line to Corner 1</b><br/>Bearing: ${activePlot.tieLine.bearingQuadrant} ${activePlot.tieLine.bearingDegrees}° ${activePlot.tieLine.bearingMinutes}'<br/>Dist: ${activePlot.tieLine.distance} m`,
        { sticky: true }
      );
    }

    // 4. Add Property Lot Boundary Polygon
    const polygonStyle = {
      color: "#10b981", // bright emerald green
      weight: 3.5,
      fillColor: "#10b981",
      fillOpacity: 0.35,
    };

    const boundaryPolygon = L.polygon(corners, polygonStyle).addTo(markerGroup);

    boundaryPolygon.bindTooltip(
      `<b>${activePlot.lotName || "Lot"}</b><br/>Calculated Area: ${activePlot.calculatedAreaAdjusted.toLocaleString()} sqm<br/>Precision: ${activePlot.precisionRatio}`,
      { sticky: true }
    );

    // 5. Add Custom Marker Pins on all Corners
    cornersWithLabels.forEach((c) => {
      const labelNumber = c.label.replace("Corner ", "");
      const isCorner1 = labelNumber === "1";

      const cornerIcon = L.divIcon({
        html: `
          <div class="w-6 h-6 flex items-center justify-center ${isCorner1 ? 'bg-amber-500' : 'bg-emerald-500'} rounded-full border border-white shadow-md text-white font-mono font-bold text-[10px]">
            ${labelNumber}
          </div>
        `,
        className: "",
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      const cornerMarker = L.marker([c.coords[0], c.coords[1]], { icon: cornerIcon }).addTo(markerGroup);
      cornerMarker.bindTooltip(
        `<b>${c.label}</b><br/>Lat: ${c.coords[0].toFixed(7)}<br/>Lng: ${c.coords[1].toFixed(7)}`,
        { permanent: false, direction: "bottom" }
      );
    });

    // 6. Center map on polygon bounds or tie point
    try {
      const bounds = boundaryPolygon.getBounds();
      if (bounds.isValid()) {
        mapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 19 });
      } else {
        mapRef.current.setView([tiePoint[0], tiePoint[1]], 17);
      }
    } catch (e) {
      mapRef.current.setView([tiePoint[0], tiePoint[1]], 17);
    }

  }, [activePlot]);

  // Load a specified pre-configured dummy land title
  const handleLoadPreset = (idx: number) => {
    setSelectedPresetIndex(idx);
    const preset = SAMPLE_TITLES[idx];
    setInputText(preset.text);
    setAnchorLat(preset.defaultLat);
    setAnchorLng(preset.defaultLng);
    setOffsetX(0);
    setOffsetY(0);

    // Match plaza name
    const matchingPlaza = PHILIPPINES_PLAZAS.find(p => p.lat === preset.defaultLat && p.lng === preset.defaultLng);
    if (matchingPlaza) {
      setSelectedPlazaName(matchingPlaza.name);
      setCustomStationName(matchingPlaza.name);
    } else {
      setSelectedPlazaName("[Blank] Custom Starting Ref Point");
      setCustomStationName("Custom Reference Anchorage");
    }

    // Reset errors and execute initial processing of the hardcoded preset structured object
    // For convenience on startup, we quickly simulate standard parse internally so it works out-of-the-box
    setIsParsing(true);
    setParseError(null);
    setParseWarning(null);

    // Call parser locally or fetch from server. Let's fetch server-side via the Gemini parse route for this preset payload to showcase full-stack integration!
    fetchSurveyParse(preset.text, preset.model, preset.defaultLat, preset.defaultLng);
  };

  // Select reference plaza from list
  const handleSelectPlaza = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const name = e.target.value;
    setSelectedPlazaName(name);
    setAutoGeodetic(false);
    const plaza = PHILIPPINES_PLAZAS.find(p => p.name === name);
    if (plaza) {
      setAnchorLat(plaza.lat);
      setAnchorLng(plaza.lng);
      setCustomStationName(plaza.name);
      setOffsetX(0);
      setOffsetY(0);
    }
  };

  // Submit Text to Gemini API Server Route
  const handleParseText = async () => {
    if (!inputText.trim()) {
      setParseError("Please provide land title description text.");
      return;
    }
    setIsParsing(true);
    setParseError(null);
    setParseWarning(null);

    await fetchSurveyParse(inputText, model, anchorLat, anchorLng);
  };

  const fetchSurveyParse = async (text: string, modelName: string, activeLat: number, activeLng: number) => {
    try {
      const response = await fetch("/api/parse-title", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, model: modelName }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to parse title. Please check your template or backend.");
      }

      // Check if title has location references to override coordinates
      const textLower = text.toLowerCase();
      const hasMorongOrRizal = textLower.includes("morong") || textLower.includes("rizal");
      const hasAntipolo = textLower.includes("antipolo");

      let finalSurveyData = { ...data.surveyData };

      if (hasMorongOrRizal) {
        setAnchorLat(14.5100);
        setAnchorLng(121.2380);
        setSelectedPlazaName("Morong Plaza (Morong Cadastre BLLM No. 1)");
        setCustomStationName("Morong, Rizal Cadastre");
        
        // Synchronize dynamic plot positions
        finalSurveyData.tiePointLat = 14.5100;
        finalSurveyData.tiePointLng = 121.2380;
        finalSurveyData.municipality = "Morong";
        finalSurveyData.province = "Rizal";
        if (!finalSurveyData.tieLine || !finalSurveyData.tieLine.distance) {
          finalSurveyData.tiePointName = "Morong Municipal Hall Reference Anchor";
        }
      } else if (hasAntipolo) {
        setAnchorLat(14.5879);
        setAnchorLng(121.1758);
        setSelectedPlazaName("Antipolo Cathedral Plaza (Antipolo Cadastre BLLM No. 1)");
        setCustomStationName("Antipolo City Cadastre");
        
        finalSurveyData.tiePointLat = 14.5879;
        finalSurveyData.tiePointLng = 121.1758;
        finalSurveyData.municipality = "Antipolo";
        finalSurveyData.province = "Rizal";
      }

      setRawPlot(finalSurveyData);
      setParseWarning(data.warning || null);
    } catch (err: any) {
      console.error(err);
      setParseError(err.message || "Network error. Make sure your server is running and the Gemini API key is configured.");
    } finally {
      setIsParsing(false);
    }
  };

  // Reset Sliders & Geodetic ground alignments
  const handleResetOffsets = () => {
    setOffsetX(0);
    setOffsetY(0);
  };

  // Export custom KML to Local computer for Google Earth Desktop or Mobile
  const handleDownloadKml = () => {
    if (!activePlot) return;
    const kmlString = generateKmlContent(activePlot);
    const blob = new Blob([kmlString], { type: "application/vnd.google-earth.kml+xml" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${activePlot.lotName.replace(/\s+/g, "_")}_boundaries.kml`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Export standard CSV raw survey calculations table
  const handleDownloadCsv = () => {
    if (!activePlot) return;
    const headers = [
      "Segment",
      "From Corner",
      "To Corner",
      "Bearing Direction",
      "Quadrant",
      "Bearing DMS",
      "Distance (m)",
      "Unadjusted Latitude (dY)",
      "Unadjusted Departure (dX)",
      "Adjusted Latitude (dY)",
      "Adjusted Departure (dX)"
    ];

    const rows = activePlot.boundarySegments.map((s, idx) => [
      idx + 1,
      s.fromCorner,
      s.toCorner,
      s.direction || "",
      s.bearingQuadrant,
      `${s.bearingDegrees}° ${s.bearingMinutes}' ${s.bearingSeconds}"`,
      s.distance,
      s.lat,
      s.dep,
      s.adjustedLat,
      s.adjustedDep
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(r => r.map(val => `"${val}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${activePlot.lotName.replace(/\s+/g, "_")}_survey_report.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Quick helper to evaluate map centering
  const handleFitBoundsManual = () => {
    if (!mapRef.current || !markerGroupRef.current) return;
    try {
      const bounds = markerGroupRef.current.getBounds();
      if (bounds.isValid()) {
        mapRef.current.fitBounds(bounds, { padding: [40, 40] });
      }
    } catch (_) {}
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 font-sans antialiased selection:bg-teal-500 selection:text-slate-950">
      
      {/* 🚀 Tech Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-tr from-teal-500 to-emerald-400 p-2 rounded-xl text-slate-950 shadow-md">
            <Compass className="w-6 h-6 animate-spin-slow" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-teal-300 via-emerald-200 to-white bg-clip-text text-transparent">
              Philippine Land Title Mapper
            </h1>
            <p className="text-xs text-slate-400 font-mono">
              AI Parser • Geodetic Loop Adjustment • Google Earth Pro KML Synthesizer
            </p>
          </div>
        </div>

        {/* Top Controls / Model Config */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-mono text-slate-400 bg-slate-850 px-2 py-1 rounded border border-slate-800">
            Engine:
          </span>
          <select 
            value={model} 
            onChange={(e) => setModel(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-slate-200 rounded px-2 py-1 text-xs font-mono outline-none focus:border-teal-500 hover:bg-slate-750 transition"
          >
            <option value="gemini-3.5-flash">Gemini 3.5 Flash (Default)</option>
            <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro (Heavy Reasoning)</option>
          </select>

          <a 
            href="#standards" 
            className="text-xs text-teal-400 hover:text-teal-300 flex items-center gap-1 bg-teal-500/10 px-3 py-1.5 rounded-lg border border-teal-500/20 transition ml-2"
          >
            <Info className="w-3.5 h-3.5" />
            DENR / NAMRIA Help
          </a>
        </div>
      </header>

      {/* 🛠️ Main Workspace */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 p-5 max-w-[1700px] w-full mx-auto">
        
        {/* ================= LEFT SIDE PANEL (GIS INPUTS) ================= */}
        <div className="lg:col-span-5 flex flex-col gap-5 overflow-visible">
          
          {/* Preset Picker Cards */}
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl">
            <h2 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2 font-mono">
              <Sparkles className="w-4 h-4 text-amber-400" />
              SELECT AN INSTANT SAMPLE PLOT
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {SAMPLE_TITLES.map((st, idx) => (
                <button
                  key={idx}
                  onClick={() => handleLoadPreset(idx)}
                  className={`text-left p-3 rounded-xl border transition duration-200 active:scale-95 ${
                    selectedPresetIndex === idx 
                      ? "bg-gradient-to-br from-teal-950/40 to-slate-900 border-teal-500 shadow-lg shadow-teal-950/20" 
                      : "bg-slate-950/50 border-slate-800/80 hover:bg-slate-800/40 hover:border-slate-700"
                  }`}
                >
                  <p className="font-semibold text-xs text-slate-100 truncate">{st.title.split(":")[0]}</p>
                  <p className="text-[10px] text-slate-400 line-clamp-2 mt-1 leading-relaxed">
                    {st.description}
                  </p>
                </button>
              ))}
            </div>
          </section>

          {/* Core Unstructured Text Input */}
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex-1 flex flex-col min-h-[450px]">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2 font-mono">
                <FileText className="w-4 h-4 text-teal-400" />
                TECHNICAL DESCRIPTION (PASTE HERE)
              </h2>
              <span className="text-[10px] text-slate-500 font-mono">OCT/TCT Format</span>
            </div>

            <div className="relative flex-1 flex flex-col">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Paste the boundary survey details here. E.g., 'Beginning at a point marked '1' being S. 85 deg. 12' W., thence S. 11 deg. 04' E., 24.12 m...'"
                className="w-full flex-1 min-h-[300px] bg-slate-950 hover:bg-slate-950/90 border border-slate-800 hover:border-slate-700 focus:border-teal-500 rounded-xl p-4 font-mono text-xs text-slate-200 leading-relaxed outline-none resize-none transition duration-150"
              />
            </div>

            {parseError && (
              <div className="mt-4 p-3 bg-red-950/40 border border-red-500/30 rounded-xl flex items-start gap-2.5 text-xs text-red-300">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">Parsing Error:</span> {parseError}
                </div>
              </div>
            )}

            {parseWarning && (
              <div className="mt-4 p-3 bg-amber-950/40 border border-amber-500/30 rounded-xl flex items-start gap-2.5 text-xs text-amber-300 font-sans">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">Local Fallback Active:</span> {parseWarning}
                </div>
              </div>
            )}

            <button
              onClick={handleParseText}
              disabled={isParsing || !inputText.trim()}
              className="mt-4 w-full bg-gradient-to-r from-teal-500 to-emerald-500 text-slate-950 hover:from-teal-400 hover:to-emerald-400 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 font-bold text-sm py-3 px-4 rounded-xl shadow-lg hover:shadow-teal-500/10 active:scale-[0.98] transition duration-150 flex items-center justify-center gap-2"
            >
              {isParsing ? (
                <>
                  <Activity className="w-4 h-4 animate-spin" />
                  <span>Gemini AI is parsing survey points...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Compile & Parse Technical Description</span>
                </>
              )}
            </button>
          </section>

          {/* Reference Monument Anchorage Configurator */}
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3.5 mb-4">
              <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2 font-mono">
                <MapPin className="w-4 h-4 text-amber-500" />
                REFERENCE POINT (BLLM ANCHORAGE)
              </h2>
              
              {/* Geodetic Auto Switch */}
              <label className="inline-flex items-center gap-2 cursor-pointer bg-teal-500/10 border border-teal-500/30 px-3 py-1.5 rounded-xl hover:bg-teal-500/20 transition-all">
                <input
                  type="checkbox"
                  checked={autoGeodetic}
                  onChange={(e) => setAutoGeodetic(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-slate-800 text-teal-400 focus:ring-teal-500/40 bg-slate-950 focus:ring-offset-0 focus:ring-2 accent-teal-400"
                />
                <span className="text-[10px] font-bold text-teal-300 uppercase tracking-wider font-mono select-none">
                  {autoGeodetic ? "⚡ AUTO-GEODETIC ACTIVE" : "⚙️ MANUAL REFERENCE"}
                </span>
              </label>
            </div>

            <p className="text-[11px] text-slate-400 mb-4 leading-relaxed">
              Define the coordinate origin of your survey lot.
              {autoGeodetic ? (
                <span className="text-teal-300 block mt-1 font-semibold">
                  ⚡ <b>Geodetic Auto-Resolve Standard:</b> Coordinates automatically snuffed from deed text and centered to Morong (Lat: 14.5100, Lng: 121.2380) or nearest cadastre system.
                </span>
              ) : (
                <span className="text-amber-400 block mt-1 font-semibold">
                  ⚙️ <b>Manual Override Active:</b> Geodetic autosave disabled. You are manually anchoring coordinates.
                </span>
              )}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1.5 uppercase tracking-wide font-mono">
                  Anchor Town Plaza Preset
                </label>
                <select
                  value={selectedPlazaName}
                  onChange={handleSelectPlaza}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-teal-500 transition"
                >
                  <option value="Custom Drag Position" disabled>Custom Drag Position</option>
                  {PHILIPPINES_PLAZAS.map((p, idx) => (
                    <option key={idx} value={p.name}>
                      {p.name} {p.province !== "Not Specified" ? `(${p.province})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1.5 uppercase tracking-wide font-mono">
                  Custom Location / Cadastre Name
                </label>
                <input
                  type="text"
                  value={customStationName}
                  onChange={(e) => {
                    setCustomStationName(e.target.value);
                    if (selectedPlazaName !== "[Blank] Custom Starting Ref Point") {
                      setSelectedPlazaName("[Blank] Custom Starting Ref Point");
                    }
                    setAutoGeodetic(false);
                  }}
                  placeholder="e.g. Morong Rizal Cadastre, BLLM 1"
                  className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-teal-500 transition font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div className="grid grid-cols-2 gap-2 col-span-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1.5 uppercase tracking-wide font-mono">
                    Latitude (WGS84 Reference Point)
                  </label>
                  <input
                    type="number"
                    step="0.000001"
                    value={anchorLat}
                    onChange={(e) => {
                      setAnchorLat(parseFloat(e.target.value) || 0);
                      setSelectedPlazaName("[Blank] Custom Starting Ref Point");
                      setAutoGeodetic(false);
                    }}
                    className="w-full bg-slate-950 border border-slate-800 hover:border-slate-705 text-slate-200 rounded-xl px-3 py-2 text-xs font-mono outline-none focus:border-teal-500 transition"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1.5 uppercase tracking-wide font-mono">
                    Longitude (WGS84 Reference Point)
                  </label>
                  <input
                    type="number"
                    step="0.000001"
                    value={anchorLng}
                    onChange={(e) => {
                      setAnchorLng(parseFloat(e.target.value) || 0);
                      setSelectedPlazaName("[Blank] Custom Starting Ref Point");
                      setAutoGeodetic(false);
                    }}
                    className="w-full bg-slate-950 border border-slate-800 hover:border-slate-705 text-slate-200 rounded-xl px-3 py-2 text-xs font-mono outline-none focus:border-teal-500 transition"
                  />
                </div>
              </div>
            </div>

            {/* Quick Presets Shortcut Chips for Morong, Rizal & Antipolo */}
            <div className="mt-4 pt-3.5 border-t border-slate-800/60">
              <span className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider font-mono mb-2">
                Quick Locator Convenience Shortcuts
              </span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAnchorLat(14.5100);
                    setAnchorLng(121.2380);
                    setSelectedPlazaName("Morong Plaza (Morong Cadastre BLLM No. 1)");
                    setCustomStationName("Morong, Rizal Cadastre");
                    setOffsetX(0);
                    setOffsetY(0);
                    setAutoGeodetic(false);
                  }}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition flex items-center gap-1.5 ${
                    Math.abs(anchorLat - 14.5100) < 0.001 && Math.abs(anchorLng - 121.2380) < 0.001
                      ? "bg-teal-500/10 border border-teal-500 text-teal-300"
                      : "bg-slate-950/80 border border-slate-800 hover:border-slate-700 text-slate-300"
                  }`}
                >
                  📍 Morong, Rizal (121.238° E)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAnchorLat(14.5879);
                    setAnchorLng(121.1758);
                    setSelectedPlazaName("Antipolo Cathedral Plaza (Antipolo Cadastre BLLM No. 1)");
                    setCustomStationName("Antipolo City Cadastre");
                    setOffsetX(0);
                    setOffsetY(0);
                    setAutoGeodetic(false);
                  }}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition flex items-center gap-1.5 ${
                    Math.abs(anchorLat - 14.5879) < 0.001 && Math.abs(anchorLng - 121.1758) < 0.001
                      ? "bg-teal-500/10 border border-teal-500 text-teal-300"
                      : "bg-slate-950/80 border border-slate-800 hover:border-slate-700 text-slate-300"
                  }`}
                >
                  📍 Antipolo City (121.175° E)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAnchorLat(14.8725);
                    setAnchorLng(120.4632);
                    setSelectedPlazaName("Dinalupihan Municipal Hall (BLLM No. 1 Plaza)");
                    setCustomStationName("Dinalupihan Cadastre BLLM 1");
                    setOffsetX(0);
                    setOffsetY(0);
                    setAutoGeodetic(false);
                  }}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition flex items-center gap-1.5 ${
                    Math.abs(anchorLat - 14.8725) < 0.001 && Math.abs(anchorLng - 120.4632) < 0.001
                      ? "bg-teal-500/10 border border-teal-500 text-teal-300"
                      : "bg-slate-950/80 border border-slate-800 hover:border-slate-700 text-slate-300"
                  }`}
                >
                  📍 Dinalupihan, Bataan
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAnchorLat(14.6515);
                    setAnchorLng(121.0496);
                    setSelectedPlazaName("Quezon City Hall / Memorial Circle");
                    setCustomStationName("Quezon City Cadastre");
                    setOffsetX(0);
                    setOffsetY(0);
                    setAutoGeodetic(false);
                  }}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition flex items-center gap-1.5 ${
                    Math.abs(anchorLat - 14.6515) < 0.001 && Math.abs(anchorLng - 121.0496) < 0.001
                      ? "bg-teal-500/10 border border-teal-500 text-teal-300"
                      : "bg-slate-950/80 border border-slate-800 hover:border-slate-700 text-slate-300"
                  }`}
                >
                  📍 Quezon City
                </button>
              </div>
            </div>

            <div className="mt-3 flex items-start gap-1.5 bg-slate-950/60 p-2.5 rounded-xl border border-slate-850 text-[11px] text-amber-300">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-400" />
              <span>
                <b>Pro Tip:</b> Drag the Red anchor pin <b>"B"</b> on the map directly! This instantly shifts your custom coordinates and aligns your land plot precisely.
              </span>
            </div>
          </section>

          {/* geodetic ground fine-tuning alignment sliders */}
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2 font-mono">
                <Sliders className="w-4 h-4 text-teal-400" />
                SATELLITE GROUND ALIGNMENT
              </h2>
              {(offsetX !== 0 || offsetY !== 0) && (
                <button
                  onClick={handleResetOffsets}
                  className="text-[10px] text-teal-400 hover:text-teal-300 flex items-center gap-1 font-mono transition"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset Shifts
                </button>
              )}
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed mb-4">
              Old land deeds use grid systems (Grid ground deformation) that can be offset from consumer WGS84 GPS satellites. Use these sliders to translate the overlay to match boundary indicators like roads or fences.
            </p>

            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs font-mono mb-1">
                  <span className="text-slate-400">Shift East / West (dX)</span>
                  <span className={offsetX === 0 ? "text-slate-500" : "text-teal-300"}>
                    {offsetX > 0 ? `+${offsetX}` : offsetX} meters
                  </span>
                </div>
                <input
                  type="range"
                  min="-150"
                  max="150"
                  step="1"
                  value={offsetX}
                  onChange={(e) => setOffsetX(parseInt(e.target.value))}
                  className="w-full accent-teal-400 bg-slate-950 rounded-lg h-1.5 outline-none cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-mono mb-1">
                  <span className="text-slate-400">Shift North / South (dY)</span>
                  <span className={offsetY === 0 ? "text-slate-500" : "text-teal-300"}>
                    {offsetY > 0 ? `+${offsetY}` : offsetY} meters
                  </span>
                </div>
                <input
                  type="range"
                  min="-150"
                  max="150"
                  step="1"
                  value={offsetY}
                  onChange={(e) => setOffsetY(parseInt(e.target.value))}
                  className="w-full accent-teal-400 bg-slate-950 rounded-lg h-1.5 outline-none cursor-pointer"
                />
              </div>
            </div>
          </section>

        </div>

        {/* ================= RIGHT SIDE PANEL (MAP & MATHS) ================= */}
        <div className="lg:col-span-7 flex flex-col gap-5">
          
          {/* Leaflet Interactive Map Card */}
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-2.5 shadow-xl flex flex-col h-[520px] relative overflow-hidden group">
            
            {/* Top Floating Controls inside map */}
            <div className="absolute top-4 left-4 z-10 flex items-center gap-1.5 bg-slate-900/90 backdrop-blur border border-slate-700/60 p-1.5 rounded-xl shadow-lg">
              <button
                onClick={() => setMapType("satellite")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono transition duration-150 ${
                  mapType === "satellite" 
                    ? "bg-teal-500 text-slate-950 shadow" 
                    : "text-slate-300 hover:bg-slate-800"
                }`}
              >
                Satellite (ESRI)
              </button>
              <button
                onClick={() => setMapType("streets")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono transition duration-150 ${
                  mapType === "streets" 
                    ? "bg-teal-500 text-slate-950 shadow" 
                    : "text-slate-300 hover:bg-slate-800"
                }`}
              >
                Streets (OSM)
              </button>
            </div>

            {/* Quick action buttons floating on right */}
            <div className="absolute top-4 right-14 z-10 flex flex-col gap-1.5">
              <button
                onClick={handleFitBoundsManual}
                title="Fit to Polygon Boundary"
                className="p-2 bg-slate-900/90 backdrop-blur border border-slate-700/60 hover:border-slate-500 rounded-lg text-slate-200 transition duration-150 shadow-md hover:scale-105 active:scale-95"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>

            {/* Empty state map instruction */}
            <div className="absolute bottom-4 left-4 z-10 bg-slate-950/90 backdrop-blur border border-slate-800 px-3 py-2 rounded-lg text-[10px] font-mono text-slate-300 flex items-center gap-2 max-w-[280px]">
              <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full"></div>
              <span>Green Polygon: Property Lot boundary</span>
              <div className="w-2.5 h-2.5 bg-red-500 rounded-full ml-1"></div>
              <span>Red Dash: Tie line</span>
            </div>

            {/* The Map Div */}
            <div 
              ref={mapContainerRef} 
              className="w-full flex-1 bg-slate-950" 
              style={{ zIndex: 0 }}
              id="map-viewport"
            />
          </section>

          {/* Calculations Summary Dashboard */}
          {activePlot ? (
            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
              
              <div className="border-b border-slate-800 pb-4 mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <span className="text-[10px] bg-teal-500/10 border border-teal-500/30 text-teal-300 px-2.5 py-1 rounded-full font-bold font-mono uppercase">
                    Plot Identity
                  </span>
                  <h3 className="text-lg font-bold text-slate-100 mt-1.5 flex items-center gap-2">
                    {activePlot.lotName}
                    <span className="text-xs font-mono font-medium text-slate-400">
                      ({activePlot.surveyNo || "Unspecified Survey"})
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Located in {activePlot.municipality || "Unknown Municipality"}, {activePlot.province || "Unknown Province"}, Philippines
                  </p>
                </div>

                {/* Compass rule manual toggle */}
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-2 flex items-center gap-3">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-mono font-bold text-slate-400">MATH LOOP BALANCING</span>
                    <span className="text-[9px] text-slate-500">Bowditch Compass Adjustment</span>
                  </div>
                  <button
                    onClick={() => setApplyCompassRule(!applyCompassRule)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold font-mono transition ${
                      applyCompassRule 
                        ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400" 
                        : "bg-slate-800 border border-slate-700 text-slate-400"
                    }`}
                  >
                    {applyCompassRule ? "BALANCED (Compass Rule ON)" : "UNBALANCED"}
                  </button>
                </div>
              </div>

              {/* Bento Grid containing Mathematical Calculations */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
                
                {/* Closure error widget */}
                <div className="bg-slate-950/60 border border-slate-850 p-4 rounded-xl flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Linear Error of Closure</span>
                    <span className="text-2xl font-black font-mono text-teal-300 block mt-1">
                      {activePlot.closureErrorTotal} <span className="text-xs font-medium text-slate-400">m</span>
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[10px] font-mono">
                    <span className="text-slate-500">Easting: {activePlot.closureErrorX}m</span>
                    <span className="text-slate-500">Northing: {activePlot.closureErrorY}m</span>
                  </div>
                </div>

                {/* Survey precision ratio */}
                <div className="bg-slate-950/60 border border-slate-850 p-4 rounded-xl flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Precision / Relative Error</span>
                    <span className="text-2xl font-black font-mono text-emerald-300 block mt-1">
                      {activePlot.precisionRatio}
                    </span>
                  </div>
                  <div className="mt-3 text-[10px]">
                    {parseFloat(activePlot.closureErrorTotal.toString()) < 0.2 ? (
                      <span className="text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded font-mono">
                        SURPASSES DENR STANDARDS
                      </span>
                    ) : (
                      <span className="text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded font-mono">
                        MARGINAL DENR TOLERANCE
                      </span>
                    )}
                  </div>
                </div>

                {/* Stated vs calculated Area */}
                <div className="bg-slate-950/60 border border-slate-850 p-4 rounded-xl flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Boundary Area Difference</span>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="text-xl font-bold font-mono text-amber-300">
                        {activePlot.calculatedAreaAdjusted.toLocaleString()}
                      </span>
                      <span className="text-[10px] text-slate-400">sqm</span>
                    </div>
                  </div>
                  <div className="border-t border-slate-850/80 pt-2 mt-2 flex justify-between items-center text-[10px] font-mono">
                    <span className="text-slate-500">Title Stated:</span>
                    <span className="text-slate-300 font-bold">{activePlot.statedArea ? `${activePlot.statedArea.toLocaleString()} sqm` : "N/A"}</span>
                  </div>
                </div>

              </div>

              {/* segment table */}
              <div className="border border-slate-800 rounded-xl overflow-hidden mb-5">
                <div className="bg-slate-950 px-4 py-2 text-[10px] font-semibold text-slate-400 font-mono flex items-center justify-between">
                  <span>LOT BOUNDARY COORD GRID (SEGMENT RESOLUTION)</span>
                  <span className="text-[9px] text-teal-400 underline">Compass balanced values shown</span>
                </div>
                
                <div className="overflow-x-auto max-h-[220px] overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 font-mono text-[10px]">
                        <th className="p-3">Line</th>
                        <th className="p-3">Bearing Direction</th>
                        <th className="p-3">Distance (m)</th>
                        <th className="p-3">Latitude Y (m)</th>
                        <th className="p-3">Departure X (m)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {activePlot.boundarySegments.map((s, idx) => (
                        <tr key={idx} className="hover:bg-slate-850/30 text-[11px]">
                          <td className="p-2 px-3 text-slate-400 font-bold border-r border-slate-800/40">
                            {s.fromCorner} to {s.toCorner}
                          </td>
                          <td className="p-2 text-slate-200">
                            {s.direction || `${s.bearingQuadrant} ${s.bearingDegrees}° ${s.bearingMinutes}'`}
                          </td>
                          <td className="p-2 text-slate-300 font-semibold">{s.distance.toFixed(2)} m</td>
                          <td className="p-2 text-rose-300/80">
                            {s.adjustedLat > 0 ? `+${s.adjustedLat.toFixed(2)}` : s.adjustedLat.toFixed(2)}
                          </td>
                          <td className="p-2 text-sky-300/80">
                            {s.adjustedDep > 0 ? `+${s.adjustedDep.toFixed(2)}` : s.adjustedDep.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Tool bar with full exports */}
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <button
                  onClick={handleDownloadKml}
                  className="w-full sm:flex-1 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs py-3 px-4 rounded-xl shadow-md transition hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Export styled KML for Google Earth Pro
                </button>
                <button
                  onClick={handleDownloadCsv}
                  className="w-full sm:w-auto bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 font-mono text-xs py-3 px-4 rounded-xl transition flex items-center justify-center gap-2"
                >
                  <FileText className="w-4 h-4 text-emerald-400" />
                  Export CSV Report Table
                </button>
              </div>

            </section>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 shadow-xl flex-1 flex flex-col items-center justify-center text-center">
              <Calculator className="w-16 h-16 text-slate-600 mb-4 animate-bounce" />
              <h3 className="text-lg font-bold text-slate-300">Coordinate Plot is Empty</h3>
              <p className="text-xs text-slate-500 max-w-sm mt-1.5 leading-relaxed">
                Paste the land title deed description into the parser panel and hit Compile. Gemini AI will restructure the coordinates and render the boundary polygon overlays immediately.
              </p>
            </div>
          )}

        </div>

      </main>

      {/* ================= SECTION: CADASTRAL STANDARDS IN THE PHILIPPINES ================= */}
      <section id="standards" className="bg-slate-900 border-t border-slate-800 px-6 py-12 mt-12">
        <div className="max-w-[1200px] mx-auto">
          
          <div className="text-center mb-10">
            <span className="text-xs bg-teal-500/10 border border-teal-500/20 text-teal-400 px-3 py-1 rounded-full font-bold font-mono">
              DUCATION CENTER
            </span>
            <h2 className="text-2xl font-bold mt-3 bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
              Philippine Cadastral & Survey Standards
            </h2>
            <p className="text-sm text-slate-400 mt-1.5 max-w-xl mx-auto">
              How boundary descriptions in OCT/TCT deeds convert to coordinates under NAMRIA, Bureau of Lands, and DENR systems.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {CADASTRAL_TIPS.map((tip, idx) => (
              <div 
                key={idx}
                className="bg-slate-950/60 border border-slate-800 p-5 rounded-2xl hover:border-slate-700 duration-150"
              >
                <div className="bg-teal-500/10 w-fit p-2 rounded-lg text-teal-400 mb-3.5">
                  <CheckCircle className="w-4 h-4" />
                </div>
                <h4 className="font-bold text-sm text-slate-100 mb-2">{tip.title}</h4>
                <p className="text-xs text-slate-400 leading-relaxed">{tip.content}</p>
              </div>
            ))}
          </div>

          {/* Quick instructions on geodetic alignment and Google Earth Pro */}
          <div className="mt-10 bg-slate-950 p-6 rounded-2xl border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="max-w-xl">
              <h4 className="font-mono text-xs font-bold text-amber-400 uppercase tracking-widest">
                Importing vectors into Google Earth Pro (Desktop)
              </h4>
              <p className="text-xs text-slate-400 leading-relaxed mt-1.5">
                Once you click <b>"Export styled KML"</b>, open your desktop Google Earth client or visit <span className="text-slate-200">earth.google.com</span>. Click <i>Projects &gt; New &gt; Import KML file</i>, select your downloaded file, and the application will instantly fly you directly to the lot. You can compare the parsed map alongside DENR forest domains and view elevations natively!
              </p>
            </div>
            <button
              onClick={() => {
                if(activePlot) handleDownloadKml();
              }}
              disabled={!activePlot}
              className="px-5 py-2.5 bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-200 rounded-xl text-xs font-mono font-bold transition disabled:text-slate-600 disabled:border-slate-800"
            >
              Test Download KML
            </button>
          </div>

        </div>
      </section>

      {/* Footer credits and information */}
      <footer className="border-t border-slate-800 bg-slate-950 py-6 px-6 text-center text-xs text-slate-500 font-mono">
        <p>Land Title Boundary Mapper - Built for Philippine Surveying & CAD Auditing</p>
        <p className="text-[10px] text-slate-600 mt-1">Utilizes local geodetic Mercator projections and Bowditch Linear Loop traverse closure correction.</p>
      </footer>

    </div>
  );
}
