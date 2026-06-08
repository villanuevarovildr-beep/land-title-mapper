import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;

// Setup body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Initialize Gemini Client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Prompt System Instruction for Parsing Philippine Land Titles
const SYSTEM_INSTRUCTION = `You are an expert land surveying engineer, cadastre data specialist, and GIS map assistant specializing in parsing Philippine land titles, specifically OCTs (Original Certificates of Title) and TCTs (Transfer Certificates of Title).

Your critical task is to parse unstructured technical descriptions of a property and convert them into a structured JSON representation.

Follow these strict parsing and geodetic rules:
1. Extract survey identifiers: Lot number, Survey number (e.g., Csd-123, Psd-456, Gss-789), Cadastre / Cad lot reference, Municipality, and Province.
2. Find the Reference Monument / Tie Point (Point of Reference): Common in PH plots are BLLM No. 1, MBM No. 2, BBM No. 4, PLS, etc. Extract this name precisely (e.g. "BLLM No. 1, Cad 264").
3. Extract the Tie Line, which describes the survey line from the Tie Point reference (BLLM) to the Point of Beginning (Corner 1) of the lot.
   - Example text: "Beginning at a point marked '1' on plan, being S. 89 deg. 51' W., 1045.20 m. from BLLM No. 1..."
   - Translate this direction exactly: S. 89 deg. 51' W., Distance: 1045.20 m.
   - For bearingQuadrant: choose 'NE', 'SE', 'SW', or 'NW'. (In this case, S ... W is SW).
   - If no tie line is mentioned, omit or return null.
4. Extract the Boundary Segments starting from Corner 1 to 2, 2 to 3, wrapping all the way back to Corner 1 (point of beginning).
   - Carefully isolate each line segement in the technical description.
   - A segment consists of:
     * fromCorner (integer, e.g. 1)
     * toCorner (integer, e.g. 2)
     * direction string (e.g. "S. 11 deg. 04' E.")
     * bearingQuadrant ('NE', 'SE', 'SW', 'NW', or Cardinal e.g. 'DUE_N', 'DUE_S', 'DUE_E', 'DUE_W')
     * bearingDegrees (integer)
     * bearingMinutes (integer)
     * bearingSeconds (integer or 0 if not provided)
     * distance in meters (number, e.g., 24.12)
   - Do NOT skip any boundary segment. Map out the entire text. It usually ends with "to the point of beginning" or "to corner 1". Make sure the last segment returns to 1! If the last segment is missing or implied, add it to close the traverse.
5. Extract the Stated Area:
   - Identify the area typically listed near the end of the technical description (e.g., "Containing an area of TWO HUNDRED AND FIFTY (250) SQUARE METERS, more or less."). Get the numeric value: 250.

Verify that:
- Bearings have valid values (Degrees: 0 to 90, Minutes: 0 to 59, Seconds: 0 to 59).
- Distances are parsed correctly in meters. Remove commas if written, e.g. "2,518.25" becomes 2518.25.`;

// Helper function to sleep
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Local technical description parser fallback when AI models are unavailable (e.g. 503 errors)
function parseLocalFallback(text: string): any {
  console.log("Using Local Land Engine regex parser fallback...");
  
  const lotNameMatch = text.match(/(Lot\s+[A-Za-z0-9-]+)/i) || text.match(/(Lot\s+\d+)/i);
  const surveyNoMatch = text.match(/((?:Psd|Pcs|Csd|Gss|Psu|Cad)-\d+-\d+)/i) || text.match(/((?:Psd|Pcs|Csd|Gss|Psu|Cad)\s+\d+)/i);
  
  let municipality = "";
  const municipalityMatch = text.match(/Municipality\s+of\s+([A-Za-z\s]+?)(?:,|\s+Province|$)/i) || 
                            text.match(/situated\s+in\s+([A-Za-z\s]+?)(?:,|\s+Province|$)/i) || 
                            text.match(/Barangay\s+of\s+([A-Za-z\s]+?)(?:,|\s+Municipality)/i);
  if (municipalityMatch) {
    municipality = municipalityMatch[1].trim();
  }

  let province = "";
  const provinceMatch = text.match(/Province\s+of\s+([A-Za-z\s]+?)(?:[.;,]|$)/i);
  if (provinceMatch) {
    province = provinceMatch[1].trim();
  }

  // Stated area extraction
  let statedArea: number | null = null;
  const areaMatch = text.match(/Containing\s+an\s+area\s+of\s+[^()]*\(\s*([\d,]+(?:\.\d+)?)\s*\)\s*SQUARE\s+METERS/i) || 
                    text.match(/Containing\s+an\s+area\s+of\s+([\d,]+(?:\.\d+)?)\s*square\s+meters/i) ||
                    text.match(/area\s+of\s+([A-Z\s-]+)\s*(?:\(\s*([\d,.]+)\s*\))?\s*square\s+meters/i);
  if (areaMatch) {
    const numStr = areaMatch[1] ? areaMatch[1] : areaMatch[2];
    if (numStr) {
      statedArea = parseFloat(numStr.replace(/,/g, ''));
    }
  }

  // Find tie point name
  let tiePointName = "BLLM No. 1";
  const tiePointMatch = text.match(/(BLLM\s+(?:No\.)?\s*\d+(?:,\s*Cad\s*\d+)?)/i) || 
                        text.match(/(MBM\s+(?:No\.)?\s*\d+)/i) ||
                        text.match(/(BBM\s+(?:No\.)?\s*\d+)/i);
  if (tiePointMatch) {
    tiePointName = tiePointMatch[1].trim();
  }

  // Find Tie Line (bearing direction & distance from BLLM to Corner 1)
  let tieLine = null;
  const tieLineRegex = /being\s+([NnSs])\.?\s*(\d+)\s*(?:deg(?:rees|\.)?|°)\s*(\d+)?\s*['’]?\s*(?:(\d+)\s*["”])?\s*([EeWw])\.?,\s*([\d,.]+)\s*(?:m|meter|meters|m\.)\s+from/i;
  const tieLineMatch = text.match(tieLineRegex);
  if (tieLineMatch) {
    const quadrant = (tieLineMatch[1].toUpperCase() + tieLineMatch[5].toUpperCase());
    tieLine = {
      bearingQuadrant: quadrant,
      bearingDegrees: parseInt(tieLineMatch[2], 10),
      bearingMinutes: tieLineMatch[3] ? parseInt(tieLineMatch[3], 10) : 0,
      bearingSeconds: tieLineMatch[4] ? parseInt(tieLineMatch[4], 10) : 0,
      distance: parseFloat(tieLineMatch[6].replace(/,/g, ''))
    };
  }

  // Parse boundary segments using global regex
  const boundarySegments: any[] = [];
  const segmentRegex = /(?:thence\s+)?([NnSs])\.?\s*(\d+)\s*(?:deg(?:rees|\.)?|°)\s*(\d+)?\s*['’]?\s*(?:(\d+)\s*["”])?\s*([EeWw])\.?,\s*([\d,.]+)\s*(?:m|meter|meters|m\.)\s*(?:to\s+(?:point|corner)\s*(\d+|of\s+beginning))?/gi;
  
  let match;
  let counter = 1;
  while ((match = segmentRegex.exec(text)) !== null) {
    const distanceVal = parseFloat(match[6].replace(/,/g, ''));
    // If it duplicates the tie line coordinates, skip it
    if (tieLine && Math.abs(tieLine.distance - distanceVal) < 0.1 && tieLine.bearingDegrees === parseInt(match[2], 10)) {
      continue;
    }

    const quadrant = (match[1].toUpperCase() + match[5].toUpperCase());
    
    boundarySegments.push({
      id: `fallback-seg-${counter}`,
      fromCorner: counter,
      toCorner: counter + 1,
      direction: `${match[1].toUpperCase()}. ${match[2]} deg. ${match[3] || '00'}' ${match[5].toUpperCase()}.`,
      bearingQuadrant: quadrant,
      bearingDegrees: parseInt(match[2], 10),
      bearingMinutes: match[3] ? parseInt(match[3], 10) : 0,
      bearingSeconds: match[4] ? parseInt(match[4], 10) : 0,
      distance: distanceVal,
      dep: 0,
      lat: 0,
      adjustedDep: 0,
      adjustedLat: 0
    });
    counter++;
  }

  // Adjust standard sequential loop closures
  if (boundarySegments.length > 0) {
    boundarySegments[boundarySegments.length - 1].toCorner = 1;
    for (let i = 0; i < boundarySegments.length; i++) {
      boundarySegments[i].fromCorner = i + 1;
      boundarySegments[i].toCorner = i === boundarySegments.length - 1 ? 1 : i + 2;
    }
  }

  return {
    lotName: lotNameMatch ? lotNameMatch[1].trim() : "Lot 1",
    surveyNo: surveyNoMatch ? surveyNoMatch[1].trim() : "",
    municipality: municipality || "Unknown Municipality",
    province: province || "Unknown Province",
    tiePointName,
    tieLine,
    boundarySegments,
    statedArea,
    rawText: text
  };
}

// Endpoint to Parse Land Title Text
app.post("/api/parse-title", async (req, res) => {
  const { text, model = "gemini-3.5-flash" } = req.body;

  if (!text || text.trim() === "") {
    return res.status(400).json({ success: false, error: "Please provide the text of the land title." });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ 
      success: false, 
      error: "GEMINI_API_KEY is not configured on the server. Please add it in Settings > Secrets." 
    });
  }

  const modelQueue = [model, "gemini-3.1-flash-lite"];
  let lastError: any = null;

  for (const currentModel of modelQueue) {
    let attempts = 0;
    while (attempts < 2) {
      try {
        console.log(`Attempting parse using model: ${currentModel} (attempt ${attempts + 1}/2)`);
        
        const response = await ai.models.generateContent({
          model: currentModel,
          contents: `Parse the following land title technical description:\n\n${text}`,
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                lotName: { type: Type.STRING, description: "Lot name or designation, e.g. Lot 1-A or Lot 25" },
                surveyNo: { type: Type.STRING, description: "Survey Number, e.g. Psd-03-020512" },
                cadastreNo: { type: Type.STRING, description: "Cadastre survey number or Cad lot number if any" },
                municipality: { type: Type.STRING, description: "Municipality or City" },
                province: { type: Type.STRING, description: "Province in the Philippines" },
                tiePointName: { type: Type.STRING, description: "Full name of the location reference tie point e.g., BLLM No. 1, Cad. 264" },
                tieLine: {
                  type: Type.OBJECT,
                  properties: {
                    bearingQuadrant: { type: Type.STRING, description: "NE, SE, SW, NW, N, S, E, W, DUE_N, DUE_S, DUE_E, DUE_W" },
                    bearingDegrees: { type: Type.INTEGER },
                    bearingMinutes: { type: Type.INTEGER },
                    bearingSeconds: { type: Type.INTEGER },
                    distance: { type: Type.NUMBER, description: "Distance in meters from the Tie Point to Corner 1" }
                  },
                  required: ["bearingQuadrant", "bearingDegrees", "bearingMinutes", "distance"]
                },
                boundarySegments: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      fromCorner: { type: Type.INTEGER },
                      toCorner: { type: Type.INTEGER },
                      direction: { type: Type.STRING, description: "Original string e.g. S. 11 deg. 04' E." },
                      bearingQuadrant: { type: Type.STRING, description: "NE, SE, SW, NW, N, S, E, W, DUE_N, DUE_S, DUE_E, DUE_W" },
                      bearingDegrees: { type: Type.INTEGER },
                      bearingMinutes: { type: Type.INTEGER },
                      bearingSeconds: { type: Type.INTEGER },
                      distance: { type: Type.NUMBER, description: "Segment distance in meters" }
                    },
                    required: ["fromCorner", "toCorner", "bearingQuadrant", "bearingDegrees", "bearingMinutes", "distance"]
                  }
                },
                statedArea: { type: Type.NUMBER, description: "Stated area of the parcel in square meters" }
              },
              required: ["boundarySegments"]
            }
          }
        });

        const resultText = response.text;
        if (!resultText) {
          throw new Error("Empty response received from Gemini.");
        }

        const parsedData = JSON.parse(resultText);
        console.log(`Successfully parsed land title using ${currentModel}!`);
        return res.json({ success: true, surveyData: parsedData, source: "gemini", modelUsed: currentModel });

      } catch (error: any) {
        lastError = error;
        const errMsg = error.message || "";
        
        const isQuota = errMsg.includes("429") || errMsg.includes("RESOURCE_EXHAUSTED") || errMsg.includes("quota") || errMsg.includes("limit");
        const isBusy = errMsg.includes("503") || errMsg.includes("UNAVAILABLE") || errMsg.includes("demand");

        if (isQuota) {
          console.log(`[Gemini Service Status] Model ${currentModel} is rate-limited / quota exhausted. Switching to fallback.`);
        } else if (isBusy) {
          console.log(`[Gemini Service Status] Model ${currentModel} is experiencing high traffic. Retrying / switching to fallback.`);
        } else {
          const cleanMsg = errMsg.substring(0, 120).replace(/["'{}]/g, "");
          console.log(`[Gemini Service Status] Model ${currentModel} status: ${cleanMsg}`);
        }
        
        // If it's a rate limit or quota exceeded (429/RESOURCE_EXHAUSTED), do NOT wait 48+ seconds!
        // Immediately skip retrying this model to keep response responsive and switch to fallback/alternative model.
        if (isQuota) {
          break; // Break the attempt loop to try the next model or go to local regex parser fallback immediately
        }

        // If it's a 503 or transient demand issue, retry shortly
        if (isBusy) {
          attempts++;
          if (attempts < 2) {
            await delay(800 * attempts);
          }
        } else {
          break; // Break to try fallback model list
        }
      }
    }
  }

  // If both models in queue fail due to rate limit/503/errors, fall back to our high-accuracy local regex parsing engine!
  console.log("All Gemini API models failed or returned 503 Service Unavailable. Invoking local geodetic technical parser fallback...");
  try {
    const fallbackData = parseLocalFallback(text);
    if (fallbackData && fallbackData.boundarySegments && fallbackData.boundarySegments.length > 0) {
      return res.json({ 
        success: true, 
        surveyData: fallbackData, 
        source: "local-fallback", 
        warning: "Gemini server is experiencing high demand. This plot was rendered successfully using our local geodetic engine."
      });
    }
  } catch (fallbackErr: any) {
    console.error("Local Technical Parser also failed:", fallbackErr);
  }

  // Return formatted error representation
  res.status(500).json({ 
    success: false, 
    error: `Gemini API is currently experiencing high demand. Please try again or simplify description text. (Detail: ${lastError?.message || lastError})` 
  });
});

// Configure Vite or HTML asset serving
async function configureAssets() {
  if (process.env.NODE_ENV !== "production") {
    // Dev Mode uses Vite Dev Server as middleware
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Serving application in Vite Dev mode via Express");
  } else {
    // Production Mode serving static files
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log(`Serving static files from ${distPath}`);
  }
}

// Start Server
configureAssets().then(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running internally on port ${PORT}`);
  });
}).catch(err => {
  console.error("Vite server initialization failed:", err);
});
