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

export type CanalSegment = {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  halfW: number;
};

export const CANALS: CanalSegment[] = [
  { x0: -95, z0: -70, x1: 85, z1: 55, halfW: 2.8 },
  { x0: -80, z0: 75, x1: 90, z1: -40, halfW: 2.2 },
];

function distToSegment(
  px: number,
  pz: number,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
): number {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len2 = dx * dx + dz * dz;
  if (len2 < 1e-6) return Math.hypot(px - x0, pz - z0);
  let t = ((px - x0) * dx + (pz - z0) * dz) / len2;
  t = Math.max(0, Math.min(1, t));
  const qx = x0 + t * dx;
  const qz = z0 + t * dz;
  return Math.hypot(px - qx, pz - qz);
}

export function canalDistance(x: number, z: number): number {
  let min = Infinity;
  for (const c of CANALS) {
    min = Math.min(
      min,
      distToSegment(x, z, c.x0, c.z0, c.x1, c.z1),
    );
  }
  return min;
}

export function isCanal(x: number, z: number): boolean {
  const [px, pz] = PAD_XZ;
  if ((x - px) ** 2 + (z - pz) ** 2 < 36 ** 2) return false;
  for (const c of CANALS) {
    if (distToSegment(x, z, c.x0, c.z0, c.x1, c.z1) < c.halfW) return true;
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
  const ridge = Math.sin(x * 0.018 + z * 0.014) * 1.1;
  const detail = (valueNoise(x * 2.2, z * 2.2) - 0.5) * 0.45;
  let h = (n - 0.42) * 5.2 + ridge + detail;

  const [sx, sz] = SPOT_XZ;
  const peatBowl = Math.exp(-((x - sx) ** 2 + (z - sz) ** 2) / 2800) * -1.35;
  h += peatBowl;

  return h;
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
  for (const c of CANALS) {
    const d = distToSegment(x, z, c.x0, c.z0, c.x1, c.z1);
    if (d < c.halfW) {
      const [px, pz] = PAD_XZ;
      if ((x - px) ** 2 + (z - pz) ** 2 < 36 ** 2) continue;
      return -0.38 + (d / c.halfW) * 0.08;
    }
  }

  let h = rawLandHeight(x, z);

  const padD2 = (x - PAD_X) ** 2 + (z - PAD_Z) ** 2;
  if (padD2 < PAD_FLATTEN_R ** 2) {
    const t = 1 - Math.sqrt(padD2) / PAD_FLATTEN_R;
    const blend = t * t * (3 - 2 * t);
    h = THREE.MathUtils.lerp(h, PAD_TARGET_H, blend * 0.92);
  }

  return h;
}

export function groundColorAt(x: number, z: number): THREE.Color {
  const h = heightAt(x, z);
  const distCanal = canalDistance(x, z);
  const bank =
    distCanal < 5 ? THREE.MathUtils.smoothstep(5, 2.8, distCanal) : 0;

  const [sx, sz] = SPOT_XZ;
  const burnR = fireRadiusUnits(45) * 2.8;
  const burnD = Math.hypot(x - sx, z - sz);
  const burn = burnD < burnR ? 1 - burnD / burnR : 0;

  const dry = THREE.MathUtils.clamp(
    valueNoise(x * 0.08 + 3, z * 0.08 - 1) * 0.6 +
      (h < 0 ? 0.25 : 0),
    0,
    1,
  );

  const moss = new THREE.Color("#1a3320");
  const peat = new THREE.Color("#4a3a22");
  const mud = new THREE.Color("#3d2e1f");
  const dryGold = new THREE.Color("#5c4a28");
  const bankMud = new THREE.Color("#2a4038");
  const scorch = new THREE.Color("#1a1008");

  const base = moss.clone();
  if (h < -0.15) base.lerp(mud, 0.55);
  else if (h < 0.6) base.lerp(peat, 0.35 + dry * 0.4);
  else base.lerp(dryGold, dry * 0.45);

  base.lerp(bankMud, bank * 0.65);
  base.lerp(scorch, burn * (0.55 + dry * 0.25));

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
export const TERRAIN_SEGMENTS = 128;
