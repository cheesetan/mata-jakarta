export type LngLat = [number, number];

export type SensorNode = {
  id: string;
  name: string;
  position: LngLat;
  /** Incident sensor triggers at playback start */
  isIncident: boolean;
  /** Surface temperature °C. Jumps when a fire is burning. */
  heatC: number;
  /** Peat dryness index 0–100 */
  drynessIndex: number;
  /** Volumetric soil moisture, percent */
  soilMoisturePct: number;
  /** In-ground soil temperature °C */
  soilTempC: number;
  /** Relative humidity, percent — the dry-weather input */
  humidityPct: number;
};

export type DroneRole = "incident" | "patrol" | "standby";

export type DroneNode = {
  id: string;
  name: string;
  home: LngLat;
  role: DroneRole;
};

export type FireFront = {
  id: string;
  label: string;
  center: LngLat;
  radiusM: number;
  /** Can MATA suppress with one payload */
  withinCapacity: boolean;
};

export type Community = {
  name: string;
  type: "farm" | "village";
  position: LngLat;
};

export type SatelliteSource = "VIIRS" | "MODIS";

export type SatelliteHotspot = {
  id: string;
  source: SatelliteSource;
  position: LngLat;
  confidence: "nominal" | "high";
  /** Playback seconds when pass becomes visible */
  detectedAtSec: number;
};

export type RiskLevel = "high" | "elevated" | "moderate";

export type RiskZone = {
  id: string;
  level: RiskLevel;
  reason: string;
  /** Closed ring [lng, lat][] */
  ring: LngLat[];
};

export type HistoricalFire = {
  id: string;
  position: LngLat;
  year: number;
  month: number;
  areaHa: number;
  suspectedCause: string;
  parcelId: string;
};

export type LandParcelType =
  | "smallholder"
  | "plantation_concession"
  | "community_forest"
  | "state_land";

export type LandParcel = {
  id: string;
  owner: string;
  type: LandParcelType;
  ring: LngLat[];
};

export type RoadSegment = {
  id: string;
  label: string;
  coordinates: LngLat[];
};

export const weather = {
  airTempC: 32.4,
  humidityPct: 58,
  rainLast7DaysMm: 2.1,
  daysSinceRain: 11,
  outlook24h: "Dry · haze possible · wind steady NE",
};

export const INCIDENT_DURATION_SEC = 90;

export const LEVEL_TIMES = {
  1: 0,
  2: 12,
  3: 28,
  4: 48,
  5: 68,
} as const;

export const LEVEL_LABELS: Record<number, string> = {
  1: "Sensor anomaly",
  2: "Drone verification",
  3: "Fire confirmed",
  4: "Immediate suppression",
  5: "Contained",
};

/** Central Kalimantan pilot — near peat-forest edge */
export const PILOT_CENTER: LngLat = [113.92, -2.51];

/** SW / NE corners for nation-wide locator and fly-to */
export const INDONESIA_BOUNDS: [LngLat, LngLat] = [
  [95, -11],
  [141, 6],
];

/** Tactical sector around the peat pilot (fitBounds) */
export const INCIDENT_SECTOR_BOUNDS: [LngLat, LngLat] = [
  [113.835, -2.565],
  [113.975, -2.465],
];

export const WIND = {
  directionDeg: 45,
  speedKmh: 18,
  label: "NE",
};

export const ACTIVE_DRONE_ID = "mata-07";

export const sensors: SensorNode[] = [
  {
    id: "sns-kalteng-04",
    name: "Sensor 1",
    position: [113.881, -2.521],
    isIncident: true,
    heatC: 46.2,
    drynessIndex: 92,
    soilMoisturePct: 19,
    soilTempC: 36.4,
    humidityPct: 41,
  },
  {
    id: "sns-kalteng-11",
    name: "Sensor 2",
    position: [113.905, -2.498],
    isIncident: false,
    heatC: 31.8,
    drynessIndex: 61,
    soilMoisturePct: 46,
    soilTempC: 28.6,
    humidityPct: 64,
  },
  {
    id: "sns-kalteng-19",
    name: "Sensor 3",
    position: [113.948, -2.535],
    isIncident: false,
    heatC: 33.1,
    drynessIndex: 48,
    soilMoisturePct: 58,
    soilTempC: 27.2,
    humidityPct: 72,
  },
];

export const drones: DroneNode[] = [
  {
    id: ACTIVE_DRONE_ID,
    name: "Drone 1",
    home: [113.852, -2.488],
    role: "incident",
  },
  {
    id: "mata-01",
    name: "Drone 2",
    home: [113.845, -2.545],
    role: "patrol",
  },
  {
    id: "mata-03",
    name: "Drone 3",
    home: [113.965, -2.472],
    role: "standby",
  },
];

export const fireFronts: FireFront[] = [
  {
    id: "fire-spot",
    label: "Spot ignition (0.4 ha)",
    center: [113.8825, -2.5215],
    radiusM: 45,
    withinCapacity: true,
  },
];

export const communities: Community[] = [
  {
    name: "Selock Home farm",
    type: "farm",
    position: [113.875, -2.518],
  },
  {
    name: "Sungai Kahayan hamlet",
    type: "village",
    position: [113.902, -2.505],
  },
];

/**
 * Ground access from Sungai Kahayan hamlet: village lane, peat-canal
 * embankment, then a logging spur that stages short of the spot.
 * Corners are canal junctions; the last leg weaves like a skid trail.
 */
export const accessRoute: LngLat[] = [
  [113.902, -2.505],
  [113.90155, -2.50615],
  [113.90085, -2.50725],
  [113.8997, -2.50805],
  [113.89815, -2.50755],
  [113.8964, -2.50835],
  [113.89455, -2.50785],
  [113.8927, -2.5087],
  [113.89085, -2.50815],
  [113.88895, -2.50905],
  [113.8872, -2.50855],
  [113.88585, -2.50945],
  [113.88515, -2.51085],
  [113.88555, -2.51255],
  [113.88465, -2.51415],
  [113.88525, -2.51565],
  [113.88415, -2.51685],
  [113.88295, -2.51755],
  [113.88345, -2.51855],
  [113.88235, -2.51945],
  [113.88285, -2.52035],
  [113.88295, -2.52085],
];

/** Estimated ignition relative to playback t=0 (sensor anomaly) */
export const IGNITION_ESTIMATE_SEC = -4;

export const briefing = {
  gps: "2°31′17″ S, 113°52′53″ E",
  sizeEstimate: "Spot ignition 0.4 ha",
  spreadDirection: "How far the fire will spread in the next hour",
  thermalCaption: "Spot ignition cooling under suppression",
  payloadLiters: 25,
  payloadLabel: "water & polymer hydrogel",
  capacityThresholdHa: 1.2,
  ignitionEstimateSec: IGNITION_ESTIMATE_SEC,
  analystNote:
    "MATA-07 suppressed the spot ignition with a single 25 L load of water and polymer hydrogel.",
  impactLine:
    "Farmer alert queued · Government cost-share (10%) noted for post-harvest reconciliation",
};

/** Spot origin for analysis — matches fire-spot center */
export const FIRE_ORIGIN: LngLat = [113.8825, -2.5215];

export const landParcels: LandParcel[] = [
  {
    id: "parcel-selock",
    owner: "Selock Home farm (smallholder)",
    type: "smallholder",
    ring: [
      [113.868, -2.528],
      [113.892, -2.528],
      [113.892, -2.512],
      [113.868, -2.512],
      [113.868, -2.528],
    ],
  },
  {
    id: "parcel-kahayan-concession",
    owner: "PT Kahayan Peat Agro",
    type: "plantation_concession",
    ring: [
      [113.888, -2.545],
      [113.958, -2.545],
      [113.958, -2.478],
      [113.888, -2.478],
      [113.888, -2.545],
    ],
  },
  {
    id: "parcel-community-forest",
    owner: "Desa Sungai Kahayan · community forest",
    type: "community_forest",
    ring: [
      [113.895, -2.512],
      [113.918, -2.512],
      [113.918, -2.498],
      [113.895, -2.498],
      [113.895, -2.512],
    ],
  },
  {
    id: "parcel-state-canal",
    owner: "Provincial canal corridor",
    type: "state_land",
    ring: [
      [113.848, -2.552],
      [113.872, -2.552],
      [113.872, -2.468],
      [113.848, -2.468],
      [113.848, -2.552],
    ],
  },
];

export const roads: RoadSegment[] = [
  {
    id: "road-hamlet-spur",
    label: "Hamlet logging spur",
    coordinates: accessRoute.slice(0, 18),
  },
  {
    id: "road-canal-dike",
    label: "Canal dike track",
    coordinates: [
      [113.848, -2.518],
      [113.865, -2.518],
      [113.882, -2.521],
      [113.902, -2.505],
    ],
  },
];

export const riskZones: RiskZone[] = [
  {
    id: "risk-peat-edge",
    level: "high",
    reason: "Drained peat, canal edge",
    ring: [
      [113.872, -2.538],
      [113.898, -2.538],
      [113.898, -2.508],
      [113.872, -2.508],
      [113.872, -2.538],
    ],
  },
  {
    id: "risk-concession-margin",
    level: "elevated",
    reason: "Recent clearing · dry litter",
    ring: [
      [113.918, -2.532],
      [113.952, -2.532],
      [113.952, -2.488],
      [113.918, -2.488],
      [113.918, -2.532],
    ],
  },
  {
    id: "risk-farm-buffer",
    level: "moderate",
    reason: "Farm buffer · irrigation off",
    ring: [
      [113.862, -2.526],
      [113.888, -2.526],
      [113.888, -2.508],
      [113.862, -2.508],
      [113.862, -2.526],
    ],
  },
  {
    id: "risk-hamlet-perimeter",
    level: "moderate",
    reason: "Settlement perimeter · waste burn season",
    ring: [
      [113.896, -2.508],
      [113.912, -2.508],
      [113.912, -2.498],
      [113.896, -2.498],
      [113.896, -2.508],
    ],
  },
];

export const historicalFires: HistoricalFire[] = [
  {
    id: "hist-2019-1",
    position: [113.884, -2.523],
    year: 2019,
    month: 9,
    areaHa: 1.8,
    suspectedCause: "Land clearing",
    parcelId: "parcel-kahayan-concession",
  },
  {
    id: "hist-2021-1",
    position: [113.886, -2.519],
    year: 2021,
    month: 8,
    areaHa: 0.6,
    suspectedCause: "Peat rekindle",
    parcelId: "parcel-kahayan-concession",
  },
  {
    id: "hist-2021-2",
    position: [113.932, -2.512],
    year: 2021,
    month: 10,
    areaHa: 12.4,
    suspectedCause: "Plantation burn-off",
    parcelId: "parcel-kahayan-concession",
  },
  {
    id: "hist-2023-1",
    position: [113.881, -2.525],
    year: 2023,
    month: 7,
    areaHa: 2.1,
    suspectedCause: "Canal edge ignition",
    parcelId: "parcel-kahayan-concession",
  },
  {
    id: "hist-2023-2",
    position: [113.906, -2.502],
    year: 2023,
    month: 9,
    areaHa: 0.3,
    suspectedCause: "Household waste burn",
    parcelId: "parcel-community-forest",
  },
  {
    id: "hist-2024-1",
    position: [113.855, -2.535],
    year: 2024,
    month: 6,
    areaHa: 0.9,
    suspectedCause: "Unknown",
    parcelId: "parcel-state-canal",
  },
  {
    id: "hist-2025-1",
    position: [113.888, -2.517],
    year: 2025,
    month: 3,
    areaHa: 0.4,
    suspectedCause: "Spot fire · contained",
    parcelId: "parcel-kahayan-concession",
  },
  {
    id: "hist-2020-1",
    position: [113.942, -2.528],
    year: 2020,
    month: 11,
    areaHa: 4.2,
    suspectedCause: "Escalated peat fire",
    parcelId: "parcel-kahayan-concession",
  },
  {
    id: "hist-2022-1",
    position: [113.874, -2.515],
    year: 2022,
    month: 8,
    areaHa: 0.2,
    suspectedCause: "Farm margin burn",
    parcelId: "parcel-selock",
  },
];

/** VIIRS pass after drone confirms fire (L3); background MODIS points always visible */
export const satelliteHotspots: SatelliteHotspot[] = [
  {
    id: "sat-incident-viirs",
    source: "VIIRS",
    position: [113.883, -2.522],
    confidence: "high",
    detectedAtSec: 34,
  },
  {
    id: "sat-bg-modis-1",
    source: "MODIS",
    position: [113.938, -2.505],
    confidence: "nominal",
    detectedAtSec: 0,
  },
  {
    id: "sat-bg-modis-2",
    source: "MODIS",
    position: [113.862, -2.548],
    confidence: "nominal",
    detectedAtSec: 0,
  },
];

export const metricsBaseline = {
  openAnomalies: 1,
  responseTimeMin: 4.2,
  hectaresAtRisk: 3.2,
  contained: 0,
  escalated: 0,
};
