import { WIND, fireFronts, drones, ACTIVE_DRONE_ID } from "@/data/scenario";
import * as THREE from "three";

const droneHome = drones.find((d) => d.id === ACTIVE_DRONE_ID)!.home;
const spotFire = fireFronts.find((f) => f.id === "fire-spot")!.center;

/** Deterministic 0..1 */
export function seeded(seed: number): number {
  const x = Math.sin(seed * 127.1 + seed * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function hash2(x: number, z: number): number {
  return seeded(x * 17.13 + z * 91.7);
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function valueNoise(x: number, z: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = smoothstep(x - x0);
  const fz = smoothstep(z - z0);
  const a = hash2(x0, z0);
  const b = hash2(x0 + 1, z0);
  const c = hash2(x0, z0 + 1);
  const d = hash2(x0 + 1, z0 + 1);
  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(a, b, fx),
    THREE.MathUtils.lerp(c, d, fx),
    fz,
  );
}

function fbm(x: number, z: number): number {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  for (let o = 0; o < 4; o++) {
    sum += valueNoise(x * freq, z * freq) * amp;
    amp *= 0.52;
    freq *= 2.05;
  }
  return sum;
}

const anchors = [droneHome, spotFire];
const centerLng =
  anchors.reduce((s, p) => s + p[0], 0) / anchors.length;
const centerLat =
  anchors.reduce((s, p) => s + p[1], 0) / anchors.length;

let maxDeg = 0.001;
for (const [lng, lat] of anchors) {
  maxDeg = Math.max(
    maxDeg,
    Math.abs(lng - centerLng),
    Math.abs(lat - centerLat),
  );
}

/** Mission X/Z units per degree (scene ~180 units across the incident) */
export const MISSION_UNITS_PER_DEG = 90 / maxDeg;

export const MISSION_CENTER = { lng: centerLng, lat: centerLat };

function rawXZ(lng: number, lat: number): [number, number] {
  const x = (lng - centerLng) * MISSION_UNITS_PER_DEG;
  const z = -(lat - centerLat) * MISSION_UNITS_PER_DEG;
  return [x, z];
}

const DIORAMA_HALF = 104;

export function lngLatToXZ(lng: number, lat: number): [number, number] {
  const [x, z] = rawXZ(lng, lat);
  const span = Math.max(Math.abs(x), Math.abs(z));
  if (span <= DIORAMA_HALF || span < 1e-4) return [x, z];
  const scale = DIORAMA_HALF / span;
  return [x * scale, z * scale];
}

const activeHome = drones.find((d) => d.id === ACTIVE_DRONE_ID)!.home;
export const PAD_XZ = lngLatToXZ(activeHome[0], activeHome[1]);
export const SPOT_XZ = lngLatToXZ(spotFire[0], spotFire[1]);

export type CanalPath = {
  points: [number, number][];
  /** Half-width at each centerline sample. */
  halfW: number[];
};

function catmullRom(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  t: number,
): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

function organicWidth(
  base: number,
  x: number,
  z: number,
  fade: number,
): number {
  const n = valueNoise(x * 0.085 + 2.2, z * 0.085 - 1.4);
  return base * (1 + (n - 0.5) * 0.14 * fade);
}

function densifyCanal(
  controls: [number, number][],
  widthAt: (u: number, x: number, z: number) => number,
  samplesPerSeg = 10,
): CanalPath {
  const points: [number, number][] = [];
  const halfW: number[] = [];
  if (controls.length < 2) {
    for (const p of controls) {
      points.push(p);
      halfW.push(widthAt(0, p[0], p[1]));
    }
    return { points, halfW };
  }
  const nSeg = controls.length - 1;
  for (let i = 0; i < nSeg; i++) {
    const p0 = controls[Math.max(0, i - 1)];
    const p1 = controls[i];
    const p2 = controls[i + 1];
    const p3 = controls[Math.min(controls.length - 1, i + 2)];
    for (let s = 0; s < samplesPerSeg; s++) {
      const t = s / samplesPerSeg;
      const x = catmullRom(p0[0], p1[0], p2[0], p3[0], t);
      const z = catmullRom(p0[1], p1[1], p2[1], p3[1], t);
      points.push([x, z]);
      halfW.push(widthAt((i + t) / nSeg, x, z));
    }
  }
  const end = controls[controls.length - 1];
  points.push(end);
  halfW.push(widthAt(1, end[0], end[1]));
  return { points, halfW };
}

function normalAt(
  points: [number, number][],
  index: number,
): [number, number] {
  const prev = points[Math.max(0, index - 1)];
  const next = points[Math.min(points.length - 1, index + 1)];
  let tx = next[0] - prev[0];
  let tz = next[1] - prev[1];
  const len = Math.hypot(tx, tz) || 1;
  tx /= len;
  tz /= len;
  return [-tz, tx];
}

/**
 * Tributary eases onto the collector: it finishes the bend upstream,
 * runs just beside the main stem, then the gap between them closes.
 * The mouth sits on the collector centerline, so the channels unite
 * instead of cutting through each other.
 */
function buildTributary(collector: CanalPath): CanalPath {
  const approach = densifyCanal(
    [
      [-44, 102],
      [-28, 80],
      [-10, 60],
      [4, 44],
      [18, 32],
      [32, 25],
      [46, 21],
    ],
    (u, x, z) => organicWidth(1.32 + u * 0.2, x, z, 1),
  );

  const i0 = Math.max(
    0,
    collector.points.findIndex((p) => p[0] >= 46),
  );
  let i1 = collector.points.findIndex((p) => p[0] >= 64);
  if (i1 < i0) i1 = collector.points.length - 1;

  const start = approach.points[approach.points.length - 1];
  const [nx0, nz0] = normalAt(collector.points, i0);
  const origin = collector.points[i0];
  const side =
    (start[0] - origin[0]) * nx0 + (start[1] - origin[1]) * nz0;

  const points = approach.points.slice(0, -1);
  const halfW = approach.halfW.slice(0, -1);
  const span = Math.max(1, i1 - i0);

  for (let i = i0; i <= i1; i++) {
    const u = (i - i0) / span;
    // Close the gap promptly so the point of land is short and blunt,
    // not a long needle between two parallel cuts.
    const falloff = Math.pow(1 - u, 0.72);
    if (i > i0 && Math.abs(side * falloff) < 1.1) break;
    const [nx, nz] = normalAt(collector.points, i);
    const [cx, cz] = collector.points[i];
    const x = cx + nx * side * falloff;
    const z = cz + nz * side * falloff;
    const mouthW = collector.halfW[i];
    // Stay the narrower branch until the mouth, then match the collector
    // only once the centerline is already inside the main channel.
    const widen = smoothstep(Math.min(1, Math.max(0, (u - 0.72) / 0.28)));
    const base = THREE.MathUtils.lerp(1.48, mouthW, widen);
    const fadeT = Math.min(1, Math.max(0, (u - 0.55) / 0.45));
    const fade = 1 - smoothstep(fadeT);
    points.push([x, z]);
    halfW.push(organicWidth(base, x, z, fade));
  }

  return { points, halfW };
}

/**
 * Collector canal with a tributary that bends parallel and merges.
 * Downstream of the mouth the collector is wider, the way a real
 * channel grows after a confluence.
 */
const collectorCanal = densifyCanal(
  [
    [-112, -18],
    [-86, -30],
    [-58, -12],
    [-32, -10],
    [-6, 0],
    [18, 8],
    [40, 14],
    [64, 6],
    [90, 16],
    [116, 24],
  ],
  (u, x, z) => organicWidth(2.05 + u * 0.85, x, z, 0.85),
);

export const CANALS: CanalPath[] = [collectorCanal, buildTributary(collectorCanal)];

/** Flat canal bed height; water ribbons sit slightly above this. */
export const CANAL_WATERLINE = -0.42;
/** Distance beyond canal half-width where banks meet surrounding land. */
export const CANAL_BANK_EXT = 3.4;
/** Water mesh width factor relative to segment halfW. */
export const CANAL_WATER_HALF_FACTOR = 0.72;

type CanalSample = { dist: number; halfW: number };

function closestOnCanal(canal: CanalPath, x: number, z: number): CanalSample {
  let bestD = Infinity;
  let bestW = canal.halfW[0] ?? 2;
  const pts = canal.points;
  for (let i = 0; i < pts.length - 1; i++) {
    const x0 = pts[i][0];
    const z0 = pts[i][1];
    const x1 = pts[i + 1][0];
    const z1 = pts[i + 1][1];
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len2 = dx * dx + dz * dz;
    let t = 0;
    let d: number;
    if (len2 < 1e-6) {
      d = Math.hypot(x - x0, z - z0);
    } else {
      t = ((x - x0) * dx + (z - z0) * dz) / len2;
      t = Math.max(0, Math.min(1, t));
      d = Math.hypot(x - (x0 + t * dx), z - (z0 + t * dz));
    }
    if (d < bestD) {
      bestD = d;
      const w0 = canal.halfW[i];
      const w1 = canal.halfW[i + 1] ?? w0;
      bestW = w0 + (w1 - w0) * t;
    }
  }
  return { dist: bestD, halfW: bestW };
}

export function canalDistance(x: number, z: number): number {
  let min = Infinity;
  for (const c of CANALS) {
    min = Math.min(min, closestOnCanal(c, x, z).dist);
  }
  return min;
}

export function isCanal(x: number, z: number): boolean {
  const [px, pz] = PAD_XZ;
  if ((x - px) ** 2 + (z - pz) ** 2 < 36 ** 2) return false;
  for (const c of CANALS) {
    const hit = closestOnCanal(c, x, z);
    if (hit.dist < hit.halfW) return true;
  }
  return false;
}

export function fireRadiusUnits(radiusM: number): number {
  const deg = radiusM / 111_320;
  return deg * MISSION_UNITS_PER_DEG * 1.35;
}

export function isFireClearing(x: number, z: number): boolean {
  const spot = fireFronts.find((f) => f.id === "fire-spot");
  if (!spot) return false;
  const [fx, fz] = lngLatToXZ(spot.center[0], spot.center[1]);
  const r = fireRadiusUnits(spot.radiusM) * 2.4;
  return (x - fx) ** 2 + (z - fz) ** 2 < r * r;
}

export function isPadZone(x: number, z: number): boolean {
  const [px, pz] = PAD_XZ;
  return (x - px) ** 2 + (z - pz) ** 2 < 18 ** 2;
}

function rawLandHeight(x: number, z: number): number {
  const n = fbm(x * 0.55 + 12, z * 0.55 - 8);
  const detail = (valueNoise(x * 2.2, z * 2.2) - 0.5) * 0.28;
  let h = (n - 0.42) * 5.0 + detail;

  const [sx, sz] = SPOT_XZ;
  const peatBowl = Math.exp(-((x - sx) ** 2 + (z - sz) ** 2) / 2800) * -1.35;
  h += peatBowl;

  return h;
}

function smoothMin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

function channelHeight(dist: number, halfW: number, landH: number): number {
  const bankOuter = halfW + CANAL_BANK_EXT;
  if (dist >= bankOuter) return landH;
  const bedHalf = halfW * CANAL_WATER_HALF_FACTOR;
  if (dist <= bedHalf) return CANAL_WATERLINE;
  const t = (dist - bedHalf) / (bankOuter - bedHalf);
  return THREE.MathUtils.lerp(CANAL_WATERLINE, landH, smoothstep(t));
}

function carveCanalHeight(x: number, z: number, landH: number): number {
  const [px, pz] = PAD_XZ;
  if ((x - px) ** 2 + (z - pz) ** 2 < 36 ** 2) return landH;

  let carved = landH;
  for (const c of CANALS) {
    const hit = closestOnCanal(c, x, z);
    const h = channelHeight(hit.dist, hit.halfW, landH);
    carved = smoothMin(carved, h, 0.48);
  }
  return carved;
}

const PAD_FLATTEN_R = 20;
const [PAD_X, PAD_Z] = PAD_XZ;
const PAD_TARGET_H = (() => {
  let sum = 0;
  let n = 0;
  for (let a = 0; a < 16; a++) {
    const ang = (a / 16) * Math.PI * 2;
    const px = PAD_X + Math.cos(ang) * 8;
    const pz = PAD_Z + Math.sin(ang) * 8;
    sum += rawLandHeight(px, pz);
    n++;
  }
  return sum / n;
})();

export function heightAt(x: number, z: number): number {
  let h = rawLandHeight(x, z);

  const padD2 = (x - PAD_X) ** 2 + (z - PAD_Z) ** 2;
  if (padD2 < PAD_FLATTEN_R ** 2) {
    const t = 1 - Math.sqrt(padD2) / PAD_FLATTEN_R;
    const blend = t * t * (3 - 2 * t);
    h = THREE.MathUtils.lerp(h, PAD_TARGET_H, blend * 0.92);
  }

  return carveCanalHeight(x, z, h);
}

export type GroundSplat = {
  moss: number;
  mud: number;
  grass: number;
  scorch: number;
};

function splatSharp(v: number): number {
  return Math.pow(Math.max(v, 0), 1.45);
}

export function groundSplatAt(x: number, z: number): GroundSplat {
  const h = heightAt(x, z);
  const distCanal = canalDistance(x, z);
  const bankMud =
    distCanal < 6.5
      ? THREE.MathUtils.smoothstep(6.5, 2.4, distCanal)
      : 0;

  const [sx, sz] = SPOT_XZ;
  const burnInner = fireRadiusUnits(45) * 1.65;
  const burnOuter = fireRadiusUnits(45) * 2.75;
  const burnD = Math.hypot(x - sx, z - sz);
  const scorchRaw =
    burnD < burnOuter
      ? THREE.MathUtils.smoothstep(burnOuter, burnInner, burnD)
      : 0;

  const dry = THREE.MathUtils.clamp(
    valueNoise(x * 0.06 + 3, z * 0.06 - 1) * 0.55 +
      (h > 0.35 ? 0.22 : 0) +
      (h < -0.15 ? -0.12 : 0),
    0,
    1,
  );
  const dampPatch = valueNoise(x * 0.13 + 11, z * 0.12 - 4);
  const grassPatch = valueNoise(x * 0.19 + 2, z * 0.17 + 6);

  let moss = splatSharp((1 - dry) * (0.45 + dampPatch * 0.55) * (h > -0.35 ? 1 : 0.4));
  let mud = splatSharp(bankMud * 1.25 + (h < -0.05 ? 0.35 : 0.08) * (1 - dry * 0.4));
  let grass = splatSharp(dry * (0.55 + grassPatch * 0.65) * (h > 0.05 ? 1.05 : 0.55));
  let scorch = splatSharp(scorchRaw * (0.85 + valueNoise(x * 0.25, z * 0.25) * 0.15));

  moss *= 1 - scorch * 0.92;
  grass *= 1 - scorch * 0.88;
  mud *= 1 - scorch * 0.55;

  const sum = moss + mud + grass + scorch + 1e-4;
  return {
    moss: moss / sum,
    mud: mud / sum,
    grass: grass / sum,
    scorch: scorch / sum,
  };
}

/** Grayscale cavity AO from heightfield (for vertex attribute). */
export function terrainAoAt(x: number, z: number): number {
  const eps = 0.65;
  const h = heightAt(x, z);
  const avg =
    (heightAt(x - eps, z) +
      heightAt(x + eps, z) +
      heightAt(x, z - eps) +
      heightAt(x, z + eps)) *
    0.25;
  const concavity = avg - h;
  return THREE.MathUtils.clamp(1 - concavity * 1.85, 0.76, 1);
}

export function groundColorAt(x: number, z: number): THREE.Color {
  const splat = groundSplatAt(x, z);
  const moss = new THREE.Color("#1a3320");
  const mud = new THREE.Color("#3d2e1f");
  const dryGold = new THREE.Color("#5c4a28");
  const scorch = new THREE.Color("#1a1008");

  const base = moss.clone().multiplyScalar(splat.moss);
  base.add(mud.clone().multiplyScalar(splat.mud));
  base.add(dryGold.clone().multiplyScalar(splat.grass));
  base.add(scorch.clone().multiplyScalar(splat.scorch));

  const blotch = valueNoise(x * 0.35, z * 0.35);
  base.multiplyScalar(0.92 + blotch * 0.16);

  return base;
}

export type TreeKind = "broadleaf" | "palm" | "shrub";

export type TreeInstance = {
  x: number;
  z: number;
  y: number;
  scale: number;
  phase: number;
  kind: TreeKind;
  hue: number;
};

export function buildForestInstances(count = 420): TreeInstance[] {
  const trees: TreeInstance[] = [];
  const span = 105;
  let i = 0;
  let attempts = 0;
  while (trees.length < count && attempts < count * 8) {
    attempts++;
    const x = (seeded(i * 3.17 + 1) - 0.5) * span * 2;
    const z = (seeded(i * 7.91 + 2) - 0.5) * span * 2;
    i++;
    if (isCanal(x, z) || isPadZone(x, z) || isFireClearing(x, z)) continue;
    const y = heightAt(x, z);
    const r = seeded(i * 13.3);
    let kind: TreeKind = "broadleaf";
    if (r > 0.78) kind = "palm";
    else if (r < 0.22) kind = "shrub";
    trees.push({
      x,
      z,
      y,
      scale: 0.65 + seeded(i * 13.3) * 0.55,
      phase: seeded(i * 41.7) * Math.PI * 2,
      kind,
      hue: seeded(i * 19.2),
    });
  }
  return trees;
}

export type GrassInstance = {
  x: number;
  z: number;
  y: number;
  scale: number;
  phase: number;
  rotY: number;
};

export function buildGrassInstances(count = 380): GrassInstance[] {
  const blades: GrassInstance[] = [];
  const span = 102;
  let i = 0;
  let attempts = 0;
  while (blades.length < count && attempts < count * 10) {
    attempts++;
    const x = (seeded(i * 2.11 + 5) - 0.5) * span * 2;
    const z = (seeded(i * 5.43 + 9) - 0.5) * span * 2;
    i++;
    if (isCanal(x, z) || isPadZone(x, z) || isFireClearing(x, z)) continue;
    if (canalDistance(x, z) < 3.5) continue;
    blades.push({
      x,
      z,
      y: heightAt(x, z),
      scale: 0.35 + seeded(i * 8.1) * 0.55,
      phase: seeded(i * 33.2) * Math.PI * 2,
      rotY: seeded(i * 11.7) * Math.PI * 2,
    });
  }
  return blades;
}

export const WIND_XZ = (() => {
  const rad = (WIND.directionDeg * Math.PI) / 180;
  return { x: Math.sin(rad), z: -Math.cos(rad) };
})();

export const TERRAIN_SIZE = 240;
export const TERRAIN_SEGMENTS = 256;
