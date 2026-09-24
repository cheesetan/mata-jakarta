import {
  heightAt,
  lngLatToXZ,
  PAD_XZ,
} from "@/components/mission/terrain";
import {
  ACTIVE_DRONE_ID,
  FIRE_ORIGIN,
  INCIDENT_DURATION_SEC,
  LEVEL_TIMES,
  accessRoute,
  briefing,
  drones,
  fireFronts,
  historicalFires,
  landParcels,
  roads,
  satelliteHotspots,
  sensors,
  type DroneRole,
  type HistoricalFire,
  type LandParcel,
  type LngLat,
  type SatelliteHotspot,
  type SensorNode,
} from "@/data/scenario";

const activeDrone = drones.find((d) => d.id === ACTIVE_DRONE_ID)!;
const droneHome = activeDrone.home;
const spotFire = fireFronts.find((f) => f.id === "fire-spot")!.center;

/** Downwind threat wedge for the next hour. Length is degrees; opening matches the map kite. */
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

function easeOut(u: number): number {
  return 1 - (1 - u) * (1 - u);
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
    return {
      task: `Spot suppression · ${briefing.payloadLiters} L ${briefing.payloadLabel}`,
      status: "suppressing",
    };
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
  const bob = Math.sin(t * 1.15) * 0.22;
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

function clamp100(n: number): number {
  return Math.max(0, Math.min(100, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Fire-risk climbs when soil moisture falls, soil temperature rises,
 * and humidity shows dry weather. Each driver is 0–100.
 */
export function computeFireRisk(readings: {
  soilMoisturePct: number;
  soilTempC: number;
  humidityPct: number;
}): number {
  const moisture = clamp100(((68 - readings.soilMoisturePct) / 52) * 100);
  const temperature = clamp100(((readings.soilTempC - 25) / 24) * 100);
  const dryWeather = clamp100(((78 - readings.humidityPct) / 48) * 100);
  return Math.round(moisture * 0.42 + temperature * 0.33 + dryWeather * 0.25);
}

/** Surface temperature and smoke together mean a fire, not just dry ground. */
const FIRE_TEMP_C = 70;
const FIRE_SMOKE_PPM = 40;

export type SensorDisplayState = SensorNode & {
  anomalyActive: boolean;
  statusLabel: string;
  smokePpm: number;
  fireRisk: number;
  fireDetected: boolean;
  /** Latches once temperature and smoke have indicated a fire. */
  authoritiesAlerted: boolean;
  /** Incident probe is still wetting and cooling after containment. */
  recovering: boolean;
};

function liveInGround(sensor: SensorNode, elapsed: number) {
  if (!sensor.isIncident) {
    return {
      soilMoisturePct: sensor.soilMoisturePct,
      soilTempC: sensor.soilTempC,
      humidityPct: sensor.humidityPct,
      heatC: sensor.heatC,
      smokePpm: 0,
    };
  }

  const t = clampElapsed(elapsed);
  const preventU = Math.min(1, t / LEVEL_TIMES[3]);
  let soilMoisturePct = lerp(sensor.soilMoisturePct, sensor.soilMoisturePct - 6, preventU);
  let soilTempC = lerp(sensor.soilTempC, sensor.soilTempC + 4.5, preventU);
  let humidityPct = lerp(sensor.humidityPct, sensor.humidityPct - 8, preventU);
  let heatC = sensor.heatC + preventU * 3;
  let smokePpm = 0;

  if (t >= LEVEL_TIMES[3]) {
    const peakMoisture = Math.max(8, sensor.soilMoisturePct - 8);
    const peakTemp = 52;
    const peakHumidity = sensor.humidityPct - 8;

    if (!spotFireContained(elapsed)) {
      const u = easeInOut(Math.min(1, (t - LEVEL_TIMES[3]) / 6));
      heatC = lerp(78, 124, u);
      smokePpm = lerp(64, 186, u);
      soilTempC = lerp(soilTempC, peakTemp, u);
      soilMoisturePct = Math.max(8, soilMoisturePct - u * 2);
    } else {
      // Water and hydrogel soak the probe: moisture and humidity rise,
      // soil cools, and fire-risk falls with them through the return flight.
      const recoverStart = LEVEL_TIMES[4] + 12;
      const u = easeOut(Math.min(1, (t - recoverStart) / 22));
      heatC = lerp(124, 31, u);
      smokePpm = lerp(186, 0, u);
      soilTempC = lerp(peakTemp, 28, u);
      soilMoisturePct = lerp(peakMoisture, 54, u);
      humidityPct = lerp(peakHumidity, 70, u);
    }
  }

  return {
    soilMoisturePct: round1(soilMoisturePct),
    soilTempC: round1(soilTempC),
    humidityPct: Math.round(humidityPct),
    heatC: round1(heatC),
    smokePpm: Math.round(smokePpm),
  };
}

export function getSensorDisplayState(elapsed: number): SensorDisplayState[] {
  const level = getCurrentLevel(elapsed);
  const authoritiesAlerted = level >= 3;
  return sensors.map((s) => {
    const live = liveInGround(s, elapsed);
    const anomalyActive = s.isIncident && level >= 1 && level < 5;
    const fireDetected =
      s.isIncident &&
      !spotFireContained(elapsed) &&
      live.heatC >= FIRE_TEMP_C &&
      live.smokePpm >= FIRE_SMOKE_PPM;
    const fireRisk = computeFireRisk(live);
    const contained = s.isIncident && spotFireContained(elapsed);
    const recovering = contained && clampElapsed(elapsed) < LEVEL_TIMES[4] + 34;
    return {
      ...s,
      ...live,
      anomalyActive,
      fireRisk,
      fireDetected,
      authoritiesAlerted: s.isIncident && authoritiesAlerted,
      recovering,
      statusLabel: fireDetected
        ? "Fire · authorities alerted"
        : anomalyActive
          ? "Fire-risk rising"
          : "Nominal",
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
  return t >= LEVEL_TIMES[4] + 2 && getPayloadRemaining(t) > 0;
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

/** Interior point for the next-hour label, in the open part of the wedge. */
export function getSpreadLabelPosition(
  origin: LngLat,
  directionDeg: number,
  scale = 1,
): LngLat {
  const ring = buildSpreadCone(
    origin,
    directionDeg,
    SPREAD_LENGTH_DEG,
    SPREAD_OPEN_DEG,
    scale,
  ).coordinates[0];
  const left = ring[1];
  const tip = ring[2];
  const right = ring[3];
  // Bias into the southern flank, clear of the hamlet and parcel labels.
  return [
    left[0] * 0.72 + tip[0] * 0.12 + right[0] * 0.16,
    left[1] * 0.72 + tip[1] * 0.12 + right[1] * 0.16,
  ];
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
  const [padX, padZ] = PAD_XZ;
  const hover = droneHoverAltitude(elapsed);
  const cruiseY = heightAt(padX, padZ) + hover;
  const minY = heightAt(x, z) + 4;
  const y = Math.max(cruiseY, minY);
  return [x, y, z];
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

/** Dirt-track speed assumption for ground crew ETA along accessRoute */
export const RESPONDER_ROUTE_SPEED_KMH = 25;

function segmentLengthKm(a: LngLat, b: LngLat): number {
  const latRad = (a[1] * Math.PI) / 180;
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * Math.cos(latRad);
  const dx = (b[0] - a[0]) * mPerDegLng;
  const dy = (b[1] - a[1]) * mPerDegLat;
  return Math.sqrt(dx * dx + dy * dy) / 1000;
}

function catmullRom(p0: LngLat, p1: LngLat, p2: LngLat, p3: LngLat, t: number): LngLat {
  const t2 = t * t;
  const t3 = t2 * t;
  return [0, 1].map((axis) => {
    const v0 = p0[axis];
    const v1 = p1[axis];
    const v2 = p2[axis];
    const v3 = p3[axis];
    return (
      0.5 *
      (2 * v1 +
        (-v0 + v2) * t +
        (2 * v0 - 5 * v1 + 4 * v2 - v3) * t2 +
        (-v0 + 3 * v1 - 3 * v2 + v3) * t3)
    );
  }) as LngLat;
}

/** GPS-dense dirt track used on the map and for ETA. */
export function getAccessRouteLine(): LngLat[] {
  const pts = accessRoute;
  if (pts.length < 2) return pts;
  const steps = 6;
  const out: LngLat[] = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let s = 1; s <= steps; s++) {
      out.push(catmullRom(p0, p1, p2, p3, s / steps));
    }
  }
  return out;
}

export function getAccessRouteStats(): { lengthKm: number; etaMin: number } {
  const line = getAccessRouteLine();
  let lengthKm = 0;
  for (let i = 1; i < line.length; i++) {
    lengthKm += segmentLengthKm(line[i - 1], line[i]);
  }
  const etaMin = (lengthKm / RESPONDER_ROUTE_SPEED_KMH) * 60;
  return {
    lengthKm: Number(lengthKm.toFixed(1)),
    etaMin: Math.max(1, Math.ceil(etaMin)),
  };
}

/** Point ~40% along the canal stretch, for the map label. */
export function getAccessRouteMidpoint(): LngLat {
  const line = getAccessRouteLine();
  if (line.length === 0) return accessRoute[0];
  let total = 0;
  const seg: number[] = [0];
  for (let i = 1; i < line.length; i++) {
    total += segmentLengthKm(line[i - 1], line[i]);
    seg.push(total);
  }
  const target = total * 0.38;
  for (let i = 1; i < seg.length; i++) {
    if (seg[i] >= target) return line[i];
  }
  return line[Math.floor(line.length / 2)];
}

/** Local time at playback t=0 (sensor anomaly) */
export const SCENARIO_CLOCK_START_MIN = 14 * 60 + 32;

export function formatScenarioClock(elapsedSec: number): string {
  const totalMin = SCENARIO_CLOCK_START_MIN + elapsedSec / 60;
  const h = Math.floor(totalMin / 60) % 24;
  const m = Math.floor(totalMin % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function getVisibleHotspots(elapsed: number): SatelliteHotspot[] {
  const t = clampElapsed(elapsed);
  return satelliteHotspots.filter((h) => h.detectedAtSec <= t);
}

export function getIncidentViirsHotspot(): SatelliteHotspot | undefined {
  return satelliteHotspots.find((h) => h.id === "sat-incident-viirs");
}

/** Minutes after MATA fire confirmation (L3) when VIIRS pass appears */
export function getSatelliteLagAfterMataMin(elapsed: number): number | null {
  const hotspot = getIncidentViirsHotspot();
  if (!hotspot || elapsed < hotspot.detectedAtSec) return null;
  const lagSec = hotspot.detectedAtSec - LEVEL_TIMES[3];
  return Number((lagSec / 60).toFixed(1));
}

function pointInRing(point: LngLat, ring: LngLat[]): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const denom = yj - yi;
    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (denom === 0 ? 1e-12 : denom) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function findParcelAt(point: LngLat): LandParcel | undefined {
  return landParcels.find((p) => pointInRing(point, p.ring));
}

function pointToSegmentDistanceM(p: LngLat, a: LngLat, b: LngLat): number {
  const latRad = (p[1] * Math.PI) / 180;
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * Math.cos(latRad);
  const ax = a[0] * mPerDegLng;
  const ay = a[1] * mPerDegLat;
  const bx = b[0] * mPerDegLng;
  const by = b[1] * mPerDegLat;
  const px = p[0] * mPerDegLng;
  const py = p[1] * mPerDegLat;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

export function nearestRoadDistanceM(origin: LngLat): { label: string; distanceM: number } {
  let bestLabel = roads[0]?.label ?? "Road";
  let best = Infinity;
  for (const road of roads) {
    const coords = road.coordinates;
    for (let i = 1; i < coords.length; i++) {
      const d = pointToSegmentDistanceM(origin, coords[i - 1], coords[i]);
      if (d < best) {
        best = d;
        bestLabel = road.label;
      }
    }
  }
  return { label: bestLabel, distanceM: Math.round(best) };
}

function distanceBetweenM(a: LngLat, b: LngLat): number {
  return segmentLengthKm(a, b) * 1000;
}

export function countHistoricalFiresNear(origin: LngLat, radiusM: number): number {
  return historicalFires.filter(
    (f) => distanceBetweenM(origin, f.position) <= radiusM,
  ).length;
}

export type OriginAnalysis = {
  ignitionClock: string;
  spreadSpeedMPerMin: number;
  parcel: LandParcel;
  roadLabel: string;
  roadDistanceM: number;
  priorFiresWithin2km: number;
};

export function getOriginAnalysis(elapsed: number): OriginAnalysis | null {
  if (getCurrentLevel(elapsed) < 3) return null;
  const parcel = findParcelAt(FIRE_ORIGIN);
  if (!parcel) return null;
  const ignitionElapsed = briefing.ignitionEstimateSec;
  const ignitionClock = formatScenarioClock(ignitionElapsed);
  const t = clampElapsed(elapsed);
  const burnSec = Math.max(1, t - ignitionElapsed);
  const latRad = (FIRE_ORIGIN[1] * Math.PI) / 180;
  const mPerDeg = 111320 * Math.cos(latRad);
  const wedgeM = SPREAD_LENGTH_DEG * mPerDeg * getSpreadScale(elapsed);
  const spreadSpeedMPerMin = Number(((wedgeM / burnSec) * 60).toFixed(1));
  const road = nearestRoadDistanceM(FIRE_ORIGIN);
  return {
    ignitionClock,
    spreadSpeedMPerMin,
    parcel,
    roadLabel: road.label,
    roadDistanceM: road.distanceM,
    priorFiresWithin2km: countHistoricalFiresNear(FIRE_ORIGIN, 2000),
  };
}

export type RecurrenceFlag = {
  parcelId: string;
  owner: string;
  years: number[];
  totalAreaHa: number;
  fireCount: number;
};

export function getRecurrence(): RecurrenceFlag | null {
  const windowStartYear = 2019;
  const byParcel = new Map<string, HistoricalFire[]>();
  for (const f of historicalFires) {
    if (f.year < windowStartYear) continue;
    const list = byParcel.get(f.parcelId) ?? [];
    list.push(f);
    byParcel.set(f.parcelId, list);
  }
  let best: RecurrenceFlag | null = null;
  for (const [parcelId, fires] of byParcel) {
    if (fires.length < 3) continue;
    const parcel = landParcels.find((p) => p.id === parcelId);
    const years = [...new Set(fires.map((f) => f.year))].sort((a, b) => a - b);
    const totalAreaHa = Number(
      fires.reduce((sum, f) => sum + f.areaHa, 0).toFixed(1),
    );
    const candidate: RecurrenceFlag = {
      parcelId,
      owner: parcel?.owner ?? parcelId,
      years,
      totalAreaHa,
      fireCount: fires.length,
    };
    if (!best || candidate.fireCount > best.fireCount) best = candidate;
  }
  return best;
}

export { accessRoute, droneHome, spotFire };
