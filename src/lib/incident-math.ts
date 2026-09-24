import {
  heightAt,
  lngLatToXZ,
} from "@/components/mission/terrain";
import {
  ACTIVE_DRONE_ID,
  INCIDENT_DURATION_SEC,
  LEVEL_TIMES,
  accessRoute,
  drones,
  fireFronts,
  sensors,
  type DroneRole,
  type LngLat,
} from "@/data/scenario";

const activeDrone = drones.find((d) => d.id === ACTIVE_DRONE_ID)!;
const droneHome = activeDrone.home;
const spotFire = fireFronts.find((f) => f.id === "fire-spot")!.center;

/** Downwind threat wedge. Length is degrees; opening matches the map kite. */
export const SPREAD_LENGTH_DEG = 0.035;
export const SPREAD_OPEN_DEG = 28;

export function clampElapsed(t: number): number {
  return Math.max(0, Math.min(INCIDENT_DURATION_SEC, t));
}

export function getCurrentLevel(elapsed: number): number {
  const t = clampElapsed(elapsed);
  if (t >= LEVEL_TIMES[5]) return 5;
  if (t >= LEVEL_TIMES[4]) return 4;
  if (t >= LEVEL_TIMES[3]) return 3;
  if (t >= LEVEL_TIMES[2]) return 2;
  return 1;
}

function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

function lerpLngLat(a: LngLat, b: LngLat, u: number): LngLat {
  return [lerp(a[0], b[0], u), lerp(a[1], b[1], u)];
}

function easeInOut(u: number): number {
  return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
}

/** Drone position on map at elapsed seconds */
export function getDronePosition(elapsed: number): LngLat {
  const t = clampElapsed(elapsed);
  if (t < LEVEL_TIMES[2]) return droneHome;

  if (t < LEVEL_TIMES[3]) {
    const u = easeInOut((t - LEVEL_TIMES[2]) / (LEVEL_TIMES[3] - LEVEL_TIMES[2]));
    return lerpLngLat(droneHome, spotFire, u);
  }

  if (t < LEVEL_TIMES[4]) {
    const phase = (t - LEVEL_TIMES[3]) / (LEVEL_TIMES[4] - LEVEL_TIMES[3]);
    return orbitSpot(phase * Math.PI * 2);
  }

  if (t < LEVEL_TIMES[5]) {
    return orbitSpot((t - LEVEL_TIMES[4]) * 0.28);
  }

  const orbitAtL5 = orbitSpot((LEVEL_TIMES[5] - LEVEL_TIMES[4]) * 0.28);
  const u = easeInOut(
    (t - LEVEL_TIMES[5]) / (INCIDENT_DURATION_SEC - LEVEL_TIMES[5]),
  );
  return lerpLngLat(orbitAtL5, droneHome, u);
}

function orbitSpot(angle: number): LngLat {
  const r = 0.004;
  return [
    spotFire[0] + Math.cos(angle) * r,
    spotFire[1] + Math.sin(angle) * r * 0.7,
  ];
}

export type FleetDroneStatus =
  | "en route"
  | "verifying"
  | "suppressing"
  | "patrol"
  | "standby"
  | "returning"
  | "staged"
  | "monitoring";

export type FleetDroneState = {
  id: string;
  name: string;
  role: DroneRole;
  position: LngLat;
  task: string;
  status: FleetDroneStatus;
};

function patrolOrbit(home: LngLat, elapsed: number, phaseOffset: number): LngLat {
  const t = clampElapsed(elapsed);
  const angle = t * 0.12 + phaseOffset;
  const r = 0.0035;
  return [
    home[0] + Math.cos(angle) * r,
    home[1] + Math.sin(angle) * r * 0.75,
  ];
}

function incidentDroneTaskAndStatus(
  elapsed: number,
): Pick<FleetDroneState, "task" | "status"> {
  const t = clampElapsed(elapsed);
  const level = getCurrentLevel(elapsed);
  if (level === 1) {
    return { task: "Awaiting dispatch", status: "standby" };
  }
  if (level === 2) {
    if (t < LEVEL_TIMES[2] + 4) {
      return { task: "En route to anomaly", status: "en route" };
    }
    return { task: "Verifying anomaly", status: "verifying" };
  }
  if (level === 3) {
    return { task: "Thermal survey · fire confirm", status: "verifying" };
  }
  if (level >= 5) {
    return { task: "Returning to base", status: "returning" };
  }
  if (level === 4) {
    if (spotFireContained(elapsed)) {
      return { task: "Overwatch · fire contained", status: "monitoring" };
    }
    return { task: "Spot suppression · 80 L payload", status: "suppressing" };
  }
  return { task: "Overwatch · fire contained", status: "monitoring" };
}

function droneHoverAltitude(elapsed: number): number {
  const t = clampElapsed(elapsed);
  if (t < LEVEL_TIMES[2]) return 0;

  let damp = 1;
  if (t >= LEVEL_TIMES[5]) {
    const u = (t - LEVEL_TIMES[5]) / (INCIDENT_DURATION_SEC - LEVEL_TIMES[5]);
    damp = 1 - easeInOut(Math.min(1, u));
  }

  const base = t < LEVEL_TIMES[3] ? 12 : 18;
  const tri = 2 * Math.abs((t * 2.8) % 2 - 1) - 1;
  const bob =
    Math.sin(t * 4.5) * 2.8 + Math.sin(t * 7.3) * 1.6 + tri * 2.2;
  return Math.max(0, base + bob * damp);
}

export function getFleetState(elapsed: number): FleetDroneState[] {
  return drones.map((d, index) => {
    const phaseOffset = index * 1.7;
    if (d.id === ACTIVE_DRONE_ID) {
      const { task, status } = incidentDroneTaskAndStatus(elapsed);
      return {
        id: d.id,
        name: d.name,
        role: d.role,
        position: getDronePosition(elapsed),
        task,
        status,
      };
    }
    if (d.role === "patrol") {
      return {
        id: d.id,
        name: d.name,
        role: d.role,
        position: patrolOrbit(d.home, elapsed, phaseOffset),
        task: "Sector patrol",
        status: "patrol",
      };
    }
    return {
      id: d.id,
      name: d.name,
      role: d.role,
      position: d.home,
      task: "On station",
      status: "standby",
    };
  });
}

export function formatLngLatShort([lng, lat]: LngLat): string {
  return `${Math.abs(lat).toFixed(3)}°${lat < 0 ? "S" : "N"}, ${Math.abs(lng).toFixed(3)}°${lng < 0 ? "W" : "E"}`;
}

export function getSensorDisplayState(elapsed: number) {
  const level = getCurrentLevel(elapsed);
  return sensors.map((s) => {
    const anomalyActive = s.isIncident && level >= 1 && level < 5;
    return {
      ...s,
      anomalyActive,
      statusLabel: anomalyActive ? "Unusual heat / dryness" : "Nominal",
    };
  });
}

export function getDroneTrail(elapsed: number, step = 0.4): LngLat[] {
  const t = clampElapsed(elapsed);
  if (t < LEVEL_TIMES[2]) return [];
  const points: LngLat[] = [];
  for (let s = LEVEL_TIMES[2]; s <= t; s += step) {
    points.push(getDronePosition(s));
  }
  points.push(getDronePosition(t));
  return points;
}

export function getPayloadRemaining(elapsed: number): number {
  const t = clampElapsed(elapsed);
  if (t < LEVEL_TIMES[4] + 4) return 100;
  if (t < LEVEL_TIMES[4] + 10) {
    return 100 - ((t - LEVEL_TIMES[4] - 4) / 6) * 100;
  }
  return 0;
}

export function spotFireContained(elapsed: number): boolean {
  return clampElapsed(elapsed) >= LEVEL_TIMES[4] + 12;
}

/** 0 before the drop, easing to 1 across the spray window. */
export function getFireSuppression(elapsed: number): number {
  const t = clampElapsed(elapsed);
  const start = LEVEL_TIMES[4] + 2;
  const end = LEVEL_TIMES[4] + 14;
  if (t <= start) return 0;
  if (t >= end) return 1;
  return easeInOut((t - start) / (end - start));
}

export function isThermalMode(elapsed: number): boolean {
  return clampElapsed(elapsed) >= LEVEL_TIMES[3];
}

export type ThermalStatus = "STANDBY" | "HOT" | "COOLING" | "CONTAINED";

export function getThermalReading(elapsed: number): {
  live: boolean;
  peakC: number;
  areaHa: number;
  suppression: number;
  status: ThermalStatus;
} {
  const live = isThermalMode(elapsed);
  const suppression = getFireSuppression(elapsed);
  const contained = spotFireContained(elapsed);
  let status: ThermalStatus = "STANDBY";
  if (live && (contained || suppression > 0.92)) status = "CONTAINED";
  else if (live && suppression > 0.05) status = "COOLING";
  else if (live) status = "HOT";
  return {
    live,
    peakC: live ? Math.round(660 - suppression * 515) : 0,
    areaHa: live ? 0.4 * (1 - suppression * 0.7) : 0,
    suppression,
    status,
  };
}

export function isWaterDropActive(elapsed: number): boolean {
  const t = clampElapsed(elapsed);
  return t >= LEVEL_TIMES[4] + 2 && t <= LEVEL_TIMES[4] + 14;
}

/** 1 while the downwind sector is fully open, 0 once the fire is out. */
export function getSpreadScale(elapsed: number): number {
  if (getCurrentLevel(elapsed) < 3) return 0;
  return 1 - getFireSuppression(elapsed);
}

/** Wedge polygon for the downwind spread sector. `scale` shrinks it toward the ignition. */
export function buildSpreadCone(
  origin: LngLat,
  directionDeg: number,
  lengthDeg = SPREAD_LENGTH_DEG,
  spreadDeg = SPREAD_OPEN_DEG,
  scale = 1,
): GeoJSON.Polygon {
  const length = lengthDeg * Math.max(0, scale);
  const rad = (directionDeg * Math.PI) / 180;
  const left = rad + ((90 - spreadDeg) * Math.PI) / 180;
  const right = rad - ((90 - spreadDeg) * Math.PI) / 180;
  const tip: LngLat = [
    origin[0] + Math.sin(rad) * length,
    origin[1] + Math.cos(rad) * length,
  ];
  const leftPt: LngLat = [
    origin[0] + Math.sin(left) * length * 0.85,
    origin[1] + Math.cos(left) * length * 0.85,
  ];
  const rightPt: LngLat = [
    origin[0] + Math.sin(right) * length * 0.85,
    origin[1] + Math.cos(right) * length * 0.85,
  ];
  return {
    type: "Polygon",
    coordinates: [[origin, leftPt, tip, rightPt, origin]],
  };
}

export function getMetrics(elapsed: number) {
  const level = getCurrentLevel(elapsed);
  const t = clampElapsed(elapsed);
  let responseTimeMin = 0;
  if (t >= LEVEL_TIMES[2]) {
    responseTimeMin = 4.2 * easeInOut(Math.min(1, (t - LEVEL_TIMES[2]) / 8));
  }
  return {
    openAnomalies: level >= 1 ? 1 : 0,
    responseTimeMin: Number(responseTimeMin.toFixed(1)),
    hectaresAtRisk:
      level >= 3
        ? Number((3.2 * getSpreadScale(elapsed) ** 2).toFixed(1))
        : level >= 1
          ? 0.6
          : 0,
    contained: spotFireContained(elapsed) ? 1 : 0,
    escalated: 0,
  };
}

/** Normalized 3D coords for mission view (x,z ground, y up) */
export function mapToMission3D(lngLat: LngLat): [number, number, number] {
  const [lng, lat] = lngLat;
  const [x, z] = lngLatToXZ(lng, lat);
  const y = heightAt(x, z);
  return [x, y, z];
}

export function getDroneMissionPosition(elapsed: number): [number, number, number] {
  const lngLat = getDronePosition(elapsed);
  const [x, , z] = mapToMission3D(lngLat);
  const groundY = heightAt(x, z);
  return [x, groundY + droneHoverAltitude(elapsed), z];
}

/** Mission-space trail for flight ribbon (last N seconds) */
export function getDroneMissionTrail(
  elapsed: number,
  windowSec = 14,
  step = 0.35,
): [number, number, number][] {
  const t = clampElapsed(elapsed);
  const start = Math.max(LEVEL_TIMES[2], t - windowSec);
  const points: [number, number, number][] = [];
  for (let s = start; s <= t; s += step) {
    points.push(getDroneMissionPosition(s));
  }
  points.push(getDroneMissionPosition(t));
  return points;
}

export { accessRoute, droneHome, spotFire };
