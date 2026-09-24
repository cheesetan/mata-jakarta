export type LngLat = [number, number];

export type SensorNode = {
  id: string;
  name: string;
  position: LngLat;
  /** Incident sensor triggers at playback start */
  isIncident: boolean;
  /** Surface heat reading °C */
  heatC: number;
  /** Peat dryness index 0–100 */
  drynessIndex: number;
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
  },
  {
    id: "sns-kalteng-11",
    name: "Sensor 2",
    position: [113.905, -2.498],
    isIncident: false,
    heatC: 31.8,
    drynessIndex: 61,
  },
  {
    id: "sns-kalteng-19",
    name: "Sensor 3",
    position: [113.948, -2.535],
    isIncident: false,
    heatC: 33.1,
    drynessIndex: 48,
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

/** Dirt track from hamlet toward fire */
export const accessRoute: LngLat[] = [
  [113.902, -2.505],
  [113.896, -2.512],
  [113.889, -2.519],
  [113.884, -2.523],
];

export const briefing = {
  gps: "2°31′17″ S, 113°52′53″ E",
  sizeEstimate: "Spot ignition 0.4 ha",
  spreadDirection: "NE at 18 km/h toward farm margin",
  thermalCaption: "Spot ignition cooling under suppression",
  payloadLiters: 80,
  capacityThresholdHa: 1.2,
  analystNote:
    "MATA-07 suppressed the spot ignition within a single 80 L payload.",
  impactLine:
    "Farmer alert queued · Government cost-share (10%) noted for post-harvest reconciliation",
};

export const metricsBaseline = {
  openAnomalies: 1,
  responseTimeMin: 4.2,
  hectaresAtRisk: 3.2,
  contained: 0,
  escalated: 0,
};
