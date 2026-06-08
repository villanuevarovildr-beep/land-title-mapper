export interface SampleTitle {
  title: string;
  description: string;
  defaultLat: number;
  defaultLng: number;
  model: string;
  text: string;
}

export const SAMPLE_TITLES: SampleTitle[] = [
  {
    title: "Sample 1: Property Lot (Morong, Rizal Cadastre)",
    description: "Standard residential plot in Morong, Rizal with a blurred/missing tie-line. Automatically anchors to Morong Township Reference Center.",
    defaultLat: 14.5100,
    defaultLng: 121.2380,
    model: "gemini-3.5-flash",
    text: `A parcel of land situated in the Barangay of San Pedro, Municipality of Morong, Province of Rizal. Bounded on the NE., along line 1-2 by Lot 124-A; on the SE., along line 2-3 by Quezon Street; on the SW., along line 3-4 by Lot 124-C; and on the NW., along line 4-1 by Lot 125. Beginning at a point marked '1' on plan, [TIE-LINE BLURRED OR MISSING IN ORIGINAL LAND TITLE RECORDS].
thence S. 15 deg. 30' E., 25.00 m. to point 2;
thence S. 74 deg. 30' W., 12.00 m. to point 3;
thence N. 15 deg. 30' W., 25.00 m. to point 4;
thence N. 74 deg. 30' E., 12.00 m. to the point of beginning.
Containing an area of THREE HUNDRED (300) SQUARE METERS, more or less.`
  },
  {
    title: "Sample 2: Homestead Farmland (Balanga, Bataan)",
    description: "Approximately 1-hectare irregular boundary lot situated NNE of Balanga plaza with 5 segments and high mathematical closure density.",
    defaultLat: 14.6781,
    defaultLng: 120.5401,
    model: "gemini-3.5-flash",
    text: `A parcel of land (Lot 4521, Cad. 264), situated in the Barrio of San Juan, Municipality of Balanga, Province of Bataan. Bounded on the N. by Lot 4520; on the E. by River; on the S. by Lot 4522; and on the W. by Road. Beginning at a point marked '1' on plan, being N. 12 deg. 34' E., 2341.20 m. from BLLM No. 1, Balanga Cadastre.
thence N. 15 deg. 20' E., 120.45 m. to point 2;
thence S. 85 deg. 10' E., 75.30 m. to point 3;
thence S. 05 deg. 15' W., 112.50 m. to point 4;
thence N. 88 deg. 45' W., 95.80 m. to point 5;
thence N. 45 deg. 00' W., 22.10 m. to the point of beginning.
Containing an area of TEN THOUSAND TWO HUNDRED (10200) SQUARE METERS, more or less.`
  },
  {
    title: "Sample 3: Irregular Subdivision Plot (Quezon City)",
    description: "Standard sub-lot with high-resolution coordinates situated around Quezon Memorial Circle.",
    defaultLat: 14.6515,
    defaultLng: 121.0496,
    model: "gemini-3.5-flash",
    text: `A parcel of land (Lot 12 of the consolidation subdivision plan Pcs-13-000452, situated in Diliman, Quezon City, Metro Manila. Bounded on the North by Lot 11; on the East by Block 124 Road; on the South by Lot 13; and on the West by Lot 10. Beginning at a point marked '1' on plan, being N. 45 deg. 15' W., 850.30 m. from BLLM No. 1, Diliman Cadastre.
thence N. 12 deg. 30' E., 18.50 m. to point 2;
thence S. 77 deg. 30' E., 30.00 m. to point 3;
thence S. 12 deg. 30' W., 18.50 m. to point 4;
thence N. 77 deg. 30' W., 30.00 m. to point of beginning.
Containing an area of FIVE HUNDRED AND FIFTY FIVE (555) SQUARE METERS.`
  }
];

export interface PlazaPreset {
  name: string;
  province: string;
  lat: number;
  lng: number;
}

export const PHILIPPINES_PLAZAS: PlazaPreset[] = [
  { name: "[Blank] Custom Starting Ref Point", province: "Not Specified", lat: 14.5100, lng: 121.2380 },
  { name: "Morong Plaza (Morong Cadastre BLLM No. 1)", province: "Rizal", lat: 14.5100, lng: 121.2380 },
  { name: "Antipolo Cathedral Plaza (Antipolo Cadastre BLLM No. 1)", province: "Rizal", lat: 14.5879, lng: 121.1758 },
  { name: "Manila (Kilometer Zero / Rizal Monument)", province: "Metro Manila", lat: 14.5826, lng: 120.9787 },
  { name: "Quezon City Hall / Memorial Circle", province: "Metro Manila", lat: 14.6515, lng: 121.0496 },
  { name: "Dinalupihan Municipal Hall (BLLM No. 1 Plaza)", province: "Bataan", lat: 14.8725, lng: 120.4632 },
  { name: "Balanga Plaza (BLLM No. 1)", province: "Bataan", lat: 14.6781, lng: 120.5401 },
  { name: "San Fernando Cathedral Plaza (BLLM No. 1)", province: "Pampanga", lat: 15.0298, lng: 120.6934 },
  { name: "Malolos Plaza (Basilica Minore)", province: "Bulacan", lat: 14.8427, lng: 120.8119 },
  { name: "Tagaytay City Plaza", province: "Cavite", lat: 14.1153, lng: 120.9621 },
  { name: "Cebu Provincial Capitol Plaza (Km 0)", province: "Cebu", lat: 10.3164, lng: 123.8907 },
  { name: "Davao City Hall Plaza (BLLM No. 1)", province: "Davao del Sur", lat: 7.0648, lng: 125.6079 },
  { name: "Iloilo City Hall (Plaza Libertad)", province: "Iloilo", lat: 10.6933, lng: 122.5714 },
  { name: "Naga Plaza Quince Martires (BLLM No. 1)", province: "Camarines Sur", lat: 13.6218, lng: 123.1849 },
  { name: "Cagayan de Oro Plaza Divisoria", province: "Misamis Oriental", lat: 8.4772, lng: 124.6437 }
];

export const CADASTRAL_TIPS = [
  {
    title: "Understanding 'Pre-PRS92' vs 'PRS92'",
    content: "Older Philippine titles use local reference datums (e.g., L.D. Luzon 1911). NAMRIA established the Philippine Reference System of 1992 (PRS92) to standardize coordinates. Because of grid deformation, plots using older references can be shifted by 50 to 100+ meters in consumer GPS apps like Google Earth. Use the 'Grid Shift controls' in the sidebar to manually translate standard WGS84 mapping coordinates and match visible landmarks."
  },
  {
    title: "What is BLLM No. 1?",
    content: "In the Philippines, survey lots are tied to a monument marker termed 'BLLM' (Bureau of Lands Location Monument). No. 1 is typically situated at the historical municipal plaza, municipal town hall, or near the church. If your title says 'from BLLM No. 1, Dinalupihan Cadastre', the coordinate anchor is located at the center of Dinalupihan municipal plaza."
  },
  {
    title: "Google Earth Pro Elevation & Overlays",
    content: "Our system exports custom KML coordinates directly compatible with Google Earth Pro (Desktop or Mobile). Google Earth is highly recommended because it includes official historical satellite overlays, terrain elevation heights, and lets you import DENR/NAMRIA land classification vectors to screen for private land overlap on protected forestry domains!"
  }
];
