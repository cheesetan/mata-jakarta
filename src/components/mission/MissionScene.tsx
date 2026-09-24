"use client";

import { WIND, fireFronts, sensors } from "@/data/scenario";
import {
  getDroneMissionPosition,
  getDroneMissionTrail,
  getFireSuppression,
  isWaterDropActive,
  mapToMission3D,
} from "@/lib/incident-math";
import { usePlayback } from "@/store/playback";
import {
  Environment,
  Line,
  OrbitControls,
  PerspectiveCamera,
  Sky,
  Sparkles,
  useGLTF,
  useTexture,
} from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import * as THREE from "three";
import {
  createBillboardMaterial,
  createFlameFlipbookTexture,
  createLitSmokeMaterial,
  createScorchTexture,
  createSmokeTexture,
  createSplatTerrainMaterial,
  createWaterMaterial,
  SUN_POSITION,
  sunDirection,
  taperTubeInPlace,
} from "./mission-graphics";
import {
  configureTerrainTextureSet,
  MISSION_HDRI,
  MISSION_MODELS,
  MISSION_TEXTURES,
  preloadMissionAssets,
} from "./mission-assets";
import { MissionDroneModel } from "./mission-drone";
import { MissionPostFX } from "./MissionPostFX";
import { MissionForest, MissionGrassField } from "./mission-vegetation";
import {
  MissionPerformance,
  MissionQualityProvider,
  useMissionQuality,
} from "./mission-quality";
import {
  CANALS,
  CANAL_WATERLINE,
  CANAL_WATER_HALF_FACTOR,
  PAD_XZ,
  SPOT_XZ,
  TERRAIN_SEGMENTS,
  TERRAIN_SIZE,
  WIND_XZ,
  fireRadiusUnits,
  groundSplatAt,
  heightAt,
  lngLatToXZ,
  terrainAoAt,
} from "./terrain";

preloadMissionAssets();

/** Spherical phi on camera→target vector: 0 = up, π/2 = horizon, π = down. */
const MAP_LOOK_PITCH_MIN = 0.08;
const MAP_LOOK_PITCH_MAX = Math.PI - 0.08;
/** OrbitControls polar limits for offset (target → camera); inverse of look pitch. */
const MAP_ORBIT_POLAR_MIN = Math.PI - MAP_LOOK_PITCH_MAX;
const MAP_ORBIT_POLAR_MAX = Math.PI - MAP_LOOK_PITCH_MIN;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

const MISSION_VIEW = (() => {
  const [px, pz] = PAD_XZ;
  const [sx, sz] = SPOT_XZ;
  const tx = (sx + px) / 2;
  const tz = (sz + pz) / 2;
  const ty = heightAt(tx, tz) + 3;
  const dx = px - sx;
  const dz = pz - sz;
  const len = Math.hypot(dx, dz) || 1;
  const sideX = -dz / len;
  const sideZ = dx / len;
  const ground = Math.max(52, len * 0.72);
  const lift = Math.max(36, ground * 0.5);
  return {
    target: new THREE.Vector3(tx, ty, tz),
    position: [tx + sideX * ground, ty + lift, tz + sideZ * ground] as [
      number,
      number,
      number,
    ],
  };
})();

function SceneLabel({
  text,
  position,
  distanceFactor,
  color,
  border,
  fontSize,
  padding,
  background,
  letterSpacing = "0",
}: {
  text: string;
  position: [number, number, number];
  distanceFactor: number;
  color: string;
  border: string;
  fontSize: string;
  padding: string;
  background: string;
  letterSpacing?: string;
}) {
  const group = useRef<THREE.Group>(null);
  const elRef = useRef<HTMLDivElement | null>(null);
  const world = useMemo(() => new THREE.Vector3(), []);
  const projected = useMemo(() => new THREE.Vector3(), []);
  const { camera, gl, size } = useThree();

  useLayoutEffect(() => {
    const parent = gl.domElement.parentElement;
    if (!parent) return;
    const el = document.createElement("div");
    el.textContent = text;
    el.style.position = "absolute";
    el.style.top = "0";
    el.style.left = "0";
    el.style.pointerEvents = "none";
    el.style.userSelect = "none";
    el.style.whiteSpace = "nowrap";
    el.style.fontFamily = "ui-monospace, monospace";
    el.style.fontSize = fontSize;
    el.style.letterSpacing = letterSpacing;
    el.style.color = color;
    el.style.textShadow = "0 0 6px #000, 0 1px 2px #000";
    el.style.padding = padding;
    el.style.borderRadius = "4px";
    el.style.background = background;
    el.style.border = `1px solid ${border}`;
    el.style.transformOrigin = "0 0";
    parent.appendChild(el);
    elRef.current = el;
    return () => {
      el.remove();
      elRef.current = null;
    };
  }, [gl, text, color, border, fontSize, padding, background, letterSpacing]);

  useFrame(() => {
    const anchor = group.current;
    const el = elRef.current;
    if (!anchor || !el) return;
    anchor.updateWorldMatrix(true, false);
    world.setFromMatrixPosition(anchor.matrixWorld);
    const distance = world.distanceTo(camera.position);
    projected.copy(world).project(camera);
    if (projected.z > 1) {
      el.style.display = "none";
      return;
    }
    el.style.display = "block";
    const x = (projected.x * 0.5 + 0.5) * size.width;
    const y = (-projected.y * 0.5 + 0.5) * size.height;
    const persp = camera as THREE.PerspectiveCamera;
    const vFov = ((persp.fov || 50) * Math.PI) / 180;
    const scale =
      (1 / (2 * Math.tan(vFov / 2) * Math.max(distance, 0.001))) *
      distanceFactor;
    el.style.zIndex = String(Math.round((1 - projected.z) * 1000));
    el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) scale(${scale})`;
  });

  return <group ref={group} position={position} />;
}

function Terrain() {
  const { gl } = useThree();
  const [
    mossMap,
    mossNor,
    mossRough,
    mudMap,
    mudNor,
    mudRough,
    grassMap,
    grassNor,
    grassRough,
    scorchMap,
    scorchNor,
    scorchRough,
  ] = useTexture([
    MISSION_TEXTURES.moss.map,
    MISSION_TEXTURES.moss.normalMap,
    MISSION_TEXTURES.moss.roughnessMap,
    MISSION_TEXTURES.mud.map,
    MISSION_TEXTURES.mud.normalMap,
    MISSION_TEXTURES.mud.roughnessMap,
    MISSION_TEXTURES.grass.map,
    MISSION_TEXTURES.grass.normalMap,
    MISSION_TEXTURES.grass.roughnessMap,
    MISSION_TEXTURES.scorch.map,
    MISSION_TEXTURES.scorch.normalMap,
    MISSION_TEXTURES.scorch.roughnessMap,
  ]);

  useLayoutEffect(() => {
    const maxAniso = Math.min(8, gl.capabilities.getMaxAnisotropy());
    for (const tex of [
      mossMap,
      mossNor,
      mossRough,
      mudMap,
      mudNor,
      mudRough,
      grassMap,
      grassNor,
      grassRough,
      scorchMap,
      scorchNor,
      scorchRough,
    ]) {
      tex.anisotropy = maxAniso;
    }
  }, [
    gl,
    mossMap,
    mossNor,
    mossRough,
    mudMap,
    mudNor,
    mudRough,
    grassMap,
    grassNor,
    grassRough,
    scorchMap,
    scorchNor,
    scorchRough,
  ]);

  const material = useMemo(() => {
    configureTerrainTextureSet({
      map: mossMap,
      normalMap: mossNor,
      roughnessMap: mossRough,
    });
    configureTerrainTextureSet({
      map: mudMap,
      normalMap: mudNor,
      roughnessMap: mudRough,
    });
    configureTerrainTextureSet({
      map: grassMap,
      normalMap: grassNor,
      roughnessMap: grassRough,
    });
    configureTerrainTextureSet({
      map: scorchMap,
      normalMap: scorchNor,
      roughnessMap: scorchRough,
    });
    return createSplatTerrainMaterial({
      moss: { map: mossMap, normalMap: mossNor, roughnessMap: mossRough },
      mud: { map: mudMap, normalMap: mudNor, roughnessMap: mudRough },
      grass: { map: grassMap, normalMap: grassNor, roughnessMap: grassRough },
      scorch: {
        map: scorchMap,
        normalMap: scorchNor,
        roughnessMap: scorchRough,
      },
    });
  }, [
    mossMap,
    mossNor,
    mossRough,
    mudMap,
    mudNor,
    mudRough,
    grassMap,
    grassNor,
    grassRough,
    scorchMap,
    scorchNor,
    scorchRough,
  ]);

  const geom = useMemo(() => {
    const g = new THREE.PlaneGeometry(
      TERRAIN_SIZE,
      TERRAIN_SIZE,
      TERRAIN_SEGMENTS,
      TERRAIN_SEGMENTS,
    );
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    const splats: number[] = [];
    const aos: number[] = [];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, heightAt(x, z));

      const splat = groundSplatAt(x, z);
      splats.push(splat.moss, splat.mud, splat.grass, splat.scorch);
      aos.push(terrainAoAt(x, z));
    }

    g.setAttribute("splat", new THREE.Float32BufferAttribute(splats, 4));
    g.setAttribute("terrainAo", new THREE.Float32BufferAttribute(aos, 1));
    g.computeVertexNormals();
    g.computeTangents();
    return g;
  }, []);

  return (
    <mesh geometry={geom} receiveShadow castShadow material={material} />
  );
}

function buildCanalRibbonGeometry(
  points: [number, number][],
  halfW: number[],
): THREE.BufferGeometry {
  const y = CANAL_WATERLINE + 0.05;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let dist = 0;

  for (let i = 0; i < points.length; i++) {
    const [cx, cz] = points[i];
    const w = (halfW[i] ?? halfW[halfW.length - 1] ?? 2) * CANAL_WATER_HALF_FACTOR;
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    let tx = next[0] - prev[0];
    let tz = next[1] - prev[1];
    const tlen = Math.hypot(tx, tz) || 1;
    tx /= tlen;
    tz /= tlen;
    const px = -tz;
    const pz = tx;

    if (i > 0) {
      dist += Math.hypot(cx - points[i - 1][0], cz - points[i - 1][1]);
    }

    positions.push(cx + px * w, y, cz + pz * w);
    positions.push(cx - px * w, y, cz - pz * w);
    const u = dist * 0.04;
    uvs.push(u, 0, u, 1);

    if (i < points.length - 1) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

function CanalWater() {
  const geoms = useMemo(
    () => CANALS.map((c) => buildCanalRibbonGeometry(c.points, c.halfW)),
    [],
  );
  const material = useMemo(() => createWaterMaterial(), []);
  const materialRef = useRef(material);
  useLayoutEffect(() => {
    materialRef.current = material;
  }, [material]);

  useFrame(({ clock }) => {
    materialRef.current.uniforms.uTime.value = clock.elapsedTime;
  });

  return (
    <group>
      {geoms.map((geom, i) => (
        <mesh key={i} geometry={geom} material={material} receiveShadow />
      ))}
    </group>
  );
}

function CameraBillboard({ children }: { children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  const { camera } = useThree();
  useFrame(() => {
    if (ref.current) ref.current.quaternion.copy(camera.quaternion);
  });
  return <group ref={ref}>{children}</group>;
}

function LandingPad() {
  const [px, pz] = PAD_XZ;
  const y = heightAt(px, pz) + 0.12;
  const beacon = useRef<THREE.Mesh>(null);
  const [concreteMap] = useTexture([MISSION_TEXTURES.mud.map]);
  const padConcrete = useMemo(() => {
    const t = concreteMap.clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(3, 3);
    return t;
  }, [concreteMap]);
  const shelter = useGLTF(MISSION_MODELS.shelter);
  const shelterScene = useMemo(() => shelter.scene.clone(true), [shelter.scene]);

  useFrame(({ clock }) => {
    if (!beacon.current) return;
    const pulse = 0.55 + Math.sin(clock.elapsedTime * 3.2) * 0.45;
    const mat = beacon.current.material as THREE.MeshStandardMaterial;
    mat.emissiveIntensity = 1.1 + pulse * 2.4;
    beacon.current.scale.setScalar(0.85 + pulse * 0.3);
  });

  const corners: [number, number][] = [
    [6.4, 6.4],
    [-6.4, 6.4],
    [6.4, -6.4],
    [-6.4, -6.4],
  ];

  return (
    <group position={[px, y, pz]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[14, 48]} />
        <meshStandardMaterial map={padConcrete} roughness={0.88} metalness={0.08} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]} receiveShadow>
        <circleGeometry args={[8.2, 48]} />
        <meshStandardMaterial color="#1e293b" roughness={0.55} metalness={0.25} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
        <ringGeometry args={[6.3, 7.1, 48]} />
        <meshStandardMaterial
          color="#22d3ee"
          emissive="#06b6d4"
          emissiveIntensity={0.85}
        />
      </mesh>
      <group position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <mesh position={[-1.15, 0, 0]}>
          <planeGeometry args={[0.38, 2.8]} />
          <meshStandardMaterial color="#e0f2fe" emissive="#67e8f9" emissiveIntensity={0.4} />
        </mesh>
        <mesh position={[1.15, 0, 0]}>
          <planeGeometry args={[0.38, 2.8]} />
          <meshStandardMaterial color="#e0f2fe" emissive="#67e8f9" emissiveIntensity={0.4} />
        </mesh>
        <mesh>
          <planeGeometry args={[2.3, 0.38]} />
          <meshStandardMaterial color="#e0f2fe" emissive="#67e8f9" emissiveIntensity={0.4} />
        </mesh>
      </group>
      {corners.map(([cx, cz], i) => (
        <mesh key={i} position={[cx, 0.35, cz]}>
          <cylinderGeometry args={[0.12, 0.16, 0.7, 8]} />
          <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={0.9} />
        </mesh>
      ))}
      <group position={[6.6, 0, 3.6]} scale={1.05}>
        <primitive object={shelterScene} />
      </group>
      <mesh position={[-6.2, 5.6, -4.4]} castShadow>
        <cylinderGeometry args={[0.1, 0.16, 11.2, 8]} />
        <meshStandardMaterial color="#334155" metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh ref={beacon} position={[-6.2, 11.4, -4.4]}>
        <sphereGeometry args={[0.42, 16, 16]} />
        <meshStandardMaterial color="#67e8f9" emissive="#22d3ee" emissiveIntensity={2} />
      </mesh>
      <pointLight
        color="#22d3ee"
        intensity={18}
        distance={36}
        decay={2}
        position={[-6.2, 11.4, -4.4]}
      />
      <SceneLabel
        text="MATA-07 BASE"
        position={[0, 13.2, 0]}
        distanceFactor={30}
        color="#cffafe"
        border="rgba(34, 211, 238, 0.55)"
        fontSize="12px"
        padding="3px 8px"
        background="rgba(8, 20, 32, 0.78)"
        letterSpacing="0.08em"
      />
    </group>
  );
}

function SoilSensorProbe({
  x,
  z,
  name,
  alert,
}: {
  x: number;
  z: number;
  name: string;
  alert: boolean;
}) {
  const cap = useRef<THREE.Mesh>(null);
  const groundY = heightAt(x, z);

  useFrame(({ clock }) => {
    if (!cap.current || !alert) return;
    const pulse = 0.85 + Math.sin(clock.elapsedTime * 5) * 0.15;
    cap.current.scale.setScalar(pulse);
  });

  const capColor = alert ? "#f97316" : "#22d3ee";
  const capEmissive = alert ? "#ea580c" : "#0891b2";
  const capIntensity = alert ? 1.1 : 0.45;

  return (
    <group position={[x, groundY, z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[0.35, 0.55, 24]} />
        <meshStandardMaterial
          color={alert ? "#fdba74" : "#64748b"}
          emissive={alert ? "#f97316" : "#334155"}
          emissiveIntensity={alert ? 0.35 : 0.1}
        />
      </mesh>
      <mesh position={[0, 0.35, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.08, 0.7, 8]} />
        <meshStandardMaterial color="#475569" roughness={0.7} />
      </mesh>
      <mesh ref={cap} position={[0, 0.78, 0]}>
        <sphereGeometry args={[0.14, 12, 12]} />
        <meshStandardMaterial
          color={capColor}
          emissive={capEmissive}
          emissiveIntensity={capIntensity}
        />
      </mesh>
      <SceneLabel
        text={name}
        position={[0, 1.35, 0]}
        distanceFactor={42}
        color={alert ? "#fdba74" : "#a5f3fc"}
        border={alert ? "rgba(249,115,22,0.45)" : "rgba(34,211,238,0.25)"}
        fontSize="10px"
        padding="2px 6px"
        background="rgba(0,0,0,0.55)"
      />
    </group>
  );
}

function SoilSensors() {
  return (
    <>
      {sensors.map((s) => {
        const [x, z] = lngLatToXZ(s.position[0], s.position[1]);
        return (
          <SoilSensorProbe
            key={s.id}
            x={x}
            z={z}
            name={s.name}
            alert={s.isIncident}
          />
        );
      })}
    </>
  );
}

function FireFront({
  center,
  radius,
}: {
  center: [number, number, number];
  radius: number;
}) {
  const flames = useRef<THREE.Group>(null);
  const smoke = useRef<THREE.Group>(null);
  const scorch = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.PointLight>(null);
  const embers = useRef<THREE.Group>(null);
  const steam = useRef<THREE.Group>(null);
  const groundY = heightAt(center[0], center[2]) + 0.08;

  const flameTex = useMemo(() => createFlameFlipbookTexture(8), []);
  const flameTexRef = useRef(flameTex);
  useLayoutEffect(() => {
    flameTexRef.current = flameTex;
  }, [flameTex]);
  const smokeTex = useMemo(() => createSmokeTexture(), []);
  const scorchTex = useMemo(() => createScorchTexture(), []);
  const flameFrames =
    (flameTex as THREE.Texture & { userData?: { frames?: number } }).userData
      ?.frames ?? 8;
  const flameMatOuter = useMemo(
    () => createBillboardMaterial(flameTex, { emissive: false }),
    [flameTex],
  );
  const flameMatCore = useMemo(
    () => createBillboardMaterial(flameTex, { emissive: true }),
    [flameTex],
  );
  const smokeMat = useMemo(
    () => createLitSmokeMaterial(smokeTex),
    [smokeTex],
  );

  const flameSlots = useMemo(
    () =>
      Array.from({ length: 14 }).map((_, i) => {
        const a = (i / 14) * Math.PI * 2 + 0.15;
        const r = radius * (0.1 + (i % 5) * 0.12);
        return {
          x: Math.cos(a) * r,
          z: Math.sin(a) * r,
          h: 2.2 + (i % 4) * 0.65 + radius * 0.14,
          w: 0.9 + (i % 3) * 0.35,
          phase: i * 1.37,
        };
      }),
    [radius],
  );

  useFrame(({ clock }) => {
    const suppression = getFireSuppression(usePlayback.getState().elapsed);
    const contained = 1 - suppression * 0.68;
    const cooling = suppression > 0.35;
    const time = clock.elapsedTime;
    const frame = Math.floor(time * 14) % flameFrames;
    flameTexRef.current.offset.x = frame / flameFrames;

    if (flames.current) {
      flames.current.scale.set(contained, 0.45 + contained * 0.55, contained);
      const alive = Math.max(3, Math.round(14 * (0.28 + contained * 0.72)));
      flames.current.children.forEach((child, i) => {
        const slot = child as THREE.Group;
        slot.visible = i < alive;
        if (!slot.visible) return;
        const ph = flameSlots[i].phase;
        const flicker = 1 + Math.sin(time * (7 - suppression * 2.5) + ph) * 0.18;
        const stretch = 1 + Math.sin(time * 9 + ph * 1.7) * 0.24;
        const lift = Math.sin(time * 5.5 + ph) * 0.12;
        const sway = Math.sin(time * 2.2 + ph) * 0.22;
        slot.position.set(
          flameSlots[i].x + WIND_XZ.x * sway * 0.35,
          flameSlots[i].h * 0.35 + lift,
          flameSlots[i].z + WIND_XZ.z * sway * 0.35,
        );
        const outer = slot.children[0]?.children[0] as THREE.Mesh | undefined;
        const core = slot.children[0]?.children[1] as THREE.Mesh | undefined;
        if (outer) {
          outer.scale.set(
            flameSlots[i].w * flicker,
            flameSlots[i].h * flicker * stretch,
            1,
          );
          const mat = outer.material as THREE.MeshBasicMaterial;
          mat.opacity = (cooling ? 0.5 : 0.88) * (0.45 + contained * 0.55);
        }
        if (core) {
          core.scale.set(
            flameSlots[i].w * flicker * 0.48,
            flameSlots[i].h * flicker * stretch * 0.55,
            1,
          );
          const mat = core.material as THREE.MeshBasicMaterial;
          mat.opacity = (cooling ? 0.35 : 0.75) * (0.4 + contained * 0.6);
        }
      });
    }
    if (smoke.current) {
      smoke.current.visible = contained > 0.08;
      smoke.current.children.forEach((child, i) => {
        const billboard = child as THREE.Group;
        const mesh = billboard.children[0] as THREE.Mesh | undefined;
        if (!mesh) return;
        const mat = mesh.material as THREE.ShaderMaterial;
        const rise = (time * 0.22 + i * 0.13) % 1;
        const drift = rise * (8 + suppression * 3);
        billboard.position.set(
          WIND_XZ.x * drift + Math.sin(i + time * 0.5) * 1.2,
          1.4 + rise * 34 + i * 0.55,
          WIND_XZ.z * drift + Math.cos(i + time * 0.4) * 1.2,
        );
        mesh.scale.setScalar(2.2 + rise * 4.8);
        const smokeBase = cooling ? 0.48 : 0.34;
        if (mat.uniforms?.uOpacity) {
          mat.uniforms.uOpacity.value =
            smokeBase *
            (1 - rise * 0.88) *
            (0.32 + contained * 0.68) *
            (1 - suppression * 0.35);
        }
      });
    }
    if (scorch.current) {
      const sc = 0.58 + 0.42 * contained;
      scorch.current.scale.set(sc, sc, 1);
    }
    if (embers.current) embers.current.scale.setScalar(0.4 + contained * 0.75);
    if (steam.current) steam.current.visible = suppression > 0.08;
    if (light.current) {
      const flicker = 0.82 + Math.sin(time * 11.5) * 0.12 + Math.sin(time * 17.3) * 0.06;
      light.current.intensity = (cooling ? 1.4 : 4.2) * contained * flicker;
      light.current.color.set(cooling ? "#ea580c" : "#ff6600");
    }
  });

  return (
    <group position={[center[0], groundY, center[2]]}>
      <mesh ref={scorch} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[radius * 1.35, 48]} />
        <meshStandardMaterial
          map={scorchTex}
          color="#ffffff"
          emissive="#5c2a0c"
          emissiveIntensity={0.55}
          roughness={1}
          transparent
          opacity={0.96}
        />
      </mesh>
      <group ref={flames}>
        {flameSlots.map((slot, i) => (
          <group key={i} position={[slot.x, slot.h * 0.35, slot.z]}>
            <CameraBillboard>
              <mesh material={flameMatOuter} renderOrder={4}>
                <planeGeometry args={[slot.w, slot.h]} />
              </mesh>
              <mesh material={flameMatCore} renderOrder={6}>
                <planeGeometry args={[slot.w * 0.48, slot.h * 0.55]} />
              </mesh>
            </CameraBillboard>
          </group>
        ))}
      </group>
      <group ref={smoke}>
        {Array.from({ length: 14 }).map((_, i) => (
          <CameraBillboard key={i}>
            <mesh material={smokeMat}>
              <planeGeometry args={[3.6, 3.6]} />
            </mesh>
          </CameraBillboard>
        ))}
      </group>
      <group ref={embers}>
        <Sparkles
          count={56}
          scale={[radius * 2.4, 9, radius * 2.4]}
          size={2.8}
          speed={0.5}
          opacity={0.68}
          color="#ff6a00"
          position={[0, 3.8, 0]}
        />
      </group>
      <group ref={steam} visible={false}>
        <Sparkles
          count={32}
          scale={[radius * 1.7, 6.5, radius * 1.7]}
          size={3.4}
          speed={0.85}
          opacity={0.35}
          color="#e2e8f0"
          position={[0, 3.2, 0]}
        />
      </group>
      <pointLight
        ref={light}
        color="#ff6600"
        distance={radius * 8}
        decay={2}
        intensity={4.2}
      />
    </group>
  );
}

const JET_SAMPLES = 22;
const SPRAY_DROPS = 64;

function createJetTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 64;
  const g = canvas.getContext("2d");
  if (!g) {
    const tex = new THREE.CanvasTexture(canvas);
    return tex;
  }
  g.fillStyle = "rgba(186, 230, 253, 0.2)";
  g.fillRect(0, 0, 128, 64);
  for (let i = 0; i < 16; i++) {
    const x = (i / 16) * 128;
    g.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.9)" : "rgba(125,211,252,0.55)";
    g.fillRect(x, 0, i % 3 === 0 ? 2 : 5, 64);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(5, 1);
  return tex;
}

function WaterStream() {
  const outer = useRef<THREE.Mesh>(null);
  const inner = useRef<THREE.Mesh>(null);
  const drops = useRef<THREE.InstancedMesh>(null);
  const splash = useRef<THREE.Group>(null);
  const jetMap = useMemo(() => createJetTexture(), []);
  const jetMapRef = useRef(jetMap);
  useLayoutEffect(() => {
    jetMapRef.current = jetMap;
  }, [jetMap]);
  const outerJetMat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        map: jetMap,
        color: "#7dd3fc",
        transparent: true,
        opacity: 0.42,
        transmission: 0.62,
        thickness: 0.35,
        roughness: 0.06,
        ior: 1.33,
        emissive: "#38bdf8",
        emissiveIntensity: 0.1,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [jetMap],
  );
  const innerJetMat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: "#f8fdff",
        transparent: true,
        opacity: 0.48,
        transmission: 0.78,
        thickness: 0.22,
        roughness: 0.03,
        emissive: "#e0f2fe",
        emissiveIntensity: 0.22,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [],
  );
  const dummy = useRef(new THREE.Object3D());
  const nozzle = useRef(new THREE.Vector3());
  const impact = useRef(new THREE.Vector3());
  const ctrl = useRef(new THREE.Vector3());
  const side = useRef(new THREE.Vector3());
  const chord = useRef(new THREE.Vector3());
  const samples = useMemo(
    () => Array.from({ length: JET_SAMPLES + 1 }, () => new THREE.Vector3()),
    [],
  );
  const point = useRef(new THREE.Vector3());
  const ahead = useRef(new THREE.Vector3());
  const tangent = useRef(new THREE.Vector3());
  const up = useRef(new THREE.Vector3(0, 1, 0));
  const spot = mapToMission3D(fireFronts[0].center);
  const curve = useMemo(() => {
    const pts = Array.from(
      { length: JET_SAMPLES + 1 },
      (_, i) => new THREE.Vector3(0, i * 0.2, 0),
    );
    return new THREE.CatmullRomCurve3(pts);
  }, []);
  const taperFn = useMemo(
    () => (u: number, flare: number) => {
      const column = (u < 0.68 ? 0.1 : 0.045) * (0.55 + flare);
      const spray =
        u > 0.68 ? Math.pow((u - 0.68) / 0.32, 1.1) * flare * 0.32 : 0;
      return Math.max(0.025, column * (1 - u * 0.2) + spray);
    },
    [],
  );
  const outerGeom = useMemo(
    () => new THREE.TubeGeometry(curve, JET_SAMPLES, 0.12, 6, false),
    [curve],
  );
  const innerGeom = useMemo(
    () => new THREE.TubeGeometry(curve, JET_SAMPLES, 0.12, 6, false),
    [curve],
  );

  const sampleJet = (u: number, time: number, out: THREE.Vector3) => {
    const omt = 1 - u;
    out
      .set(0, 0, 0)
      .addScaledVector(nozzle.current, omt * omt)
      .addScaledVector(ctrl.current, 2 * omt * u)
      .addScaledVector(impact.current, u * u);
    const wobble = Math.sin(u * 20 + time * 9) * (0.04 + u * 0.28);
    const flutter = Math.sin(u * 11 - time * 7) * u * 0.16;
    out.addScaledVector(side.current, wobble);
    out.y += flutter;
  };

  useFrame(({ clock }) => {
    const outerMesh = outer.current;
    const innerMesh = inner.current;
    const dropMesh = drops.current;
    if (!outerMesh || !innerMesh || !dropMesh) return;

    const elapsed = usePlayback.getState().elapsed;
    const active = isWaterDropActive(elapsed);
    outerMesh.visible = active;
    innerMesh.visible = active;
    dropMesh.visible = active;
    if (splash.current) splash.current.visible = active;
    if (!active) return;

    const [dx, dy, dz] = getDroneMissionPosition(elapsed);
    nozzle.current.set(dx, dy - 0.48, dz);
    impact.current.set(spot[0], heightAt(spot[0], spot[2]) + 0.2, spot[2]);
    ctrl.current.copy(nozzle.current).lerp(impact.current, 0.36);
    const span = nozzle.current.distanceTo(impact.current);
    ctrl.current.y -= Math.min(7, 1.4 + span * 0.11);
    ctrl.current.x += WIND_XZ.x * 2.8;
    ctrl.current.z += WIND_XZ.z * 2.8;

    side.current.crossVectors(
      chord.current.copy(impact.current).sub(nozzle.current),
      up.current,
    );
    if (side.current.lengthSq() < 1e-4) side.current.set(1, 0, 0);
    side.current.normalize();

    const time = clock.elapsedTime;
    for (let i = 0; i <= JET_SAMPLES; i++) {
      sampleJet(i / JET_SAMPLES, time, samples[i]);
    }
    for (let i = 0; i <= JET_SAMPLES; i++) {
      curve.points[i].copy(samples[i]);
    }
    taperTubeInPlace(outerGeom, curve, JET_SAMPLES, 0.12, (u) => taperFn(u, 1));
    taperTubeInPlace(innerGeom, curve, JET_SAMPLES, 0.12, (u) =>
      taperFn(u, 0.35),
    );
    outerMesh.geometry = outerGeom;
    innerMesh.geometry = innerGeom;
    jetMapRef.current.offset.x = -(time * 1.6) % 1;

    for (let i = 0; i < SPRAY_DROPS; i++) {
      const u = ((i + 0.37) / SPRAY_DROPS + time * 0.7) % 1;
      sampleJet(Math.min(0.97, u), time, point.current);
      sampleJet(Math.min(0.99, u + 0.025), time, ahead.current);
      tangent.current.copy(ahead.current).sub(point.current);
      if (tangent.current.lengthSq() < 1e-6) tangent.current.set(0, -1, 0);
      tangent.current.normalize();
      const spray = Math.pow(u, 1.35);
      const ang = i * 2.399963 + time * 1.6;
      const rad = (u < 0.4 ? 0.015 : 0.04) + spray * (0.16 + (i % 5) * 0.06);
      point.current.x += Math.cos(ang) * rad;
      point.current.y += Math.sin(ang * 1.7) * rad * 0.35;
      point.current.z += Math.sin(ang) * rad;
      dummy.current.position.copy(point.current);
      dummy.current.quaternion.setFromUnitVectors(up.current, tangent.current);
      const bead = 0.09 + (i % 4) * 0.03 + spray * 0.04;
      const along = 0.55 + spray * 1.8;
      dummy.current.scale.set(bead, bead * along, bead * 0.85);
      dummy.current.updateMatrix();
      dropMesh.setMatrixAt(i, dummy.current.matrix);
    }
    dropMesh.instanceMatrix.needsUpdate = true;

    if (splash.current) {
      splash.current.position.copy(impact.current);
      splash.current.children.forEach((child, i) => {
        if (child.name === "ring") {
          const mesh = child as THREE.Mesh;
          const phase = (time * 0.9 + i * 0.33) % 1;
          mesh.scale.setScalar(0.45 + phase * 2.4);
          const mat = mesh.material as THREE.MeshBasicMaterial;
          mat.opacity = (1 - phase) * 0.5;
        } else if (child.name === "crown") {
          const mesh = child as THREE.Mesh;
          const phase = (time * 1.4 + i * 0.17) % 1;
          const ang = i * 0.9;
          const rad = 0.4 + phase * 1.8;
          mesh.position.set(Math.cos(ang) * rad, phase * 1.6 * (1 - phase), Math.sin(ang) * rad);
          const mat = mesh.material as THREE.MeshStandardMaterial;
          mat.opacity = 0.15 + (1 - phase) * 0.65;
        } else if (child.name === "mist") {
          const mesh = child as THREE.Mesh;
          const pulse = 0.85 + Math.sin(time * 7) * 0.12;
          mesh.scale.setScalar(pulse + Math.sin(time * 3) * 0.08);
        }
      });
    }
  });

  return (
    <group>
      <mesh
        ref={outer}
        visible={false}
        renderOrder={2}
        geometry={outerGeom}
        material={outerJetMat}
      />
      <mesh
        ref={inner}
        visible={false}
        renderOrder={3}
        geometry={innerGeom}
        material={innerJetMat}
      />
      <instancedMesh ref={drops} args={[undefined, undefined, SPRAY_DROPS]} visible={false}>
        <capsuleGeometry args={[0.35, 1, 4, 6]} />
        <meshStandardMaterial
          color="#e0f2fe"
          transparent
          opacity={0.72}
          roughness={0.15}
          emissive="#38bdf8"
          emissiveIntensity={0.2}
          depthWrite={false}
        />
      </instancedMesh>
      <group ref={splash} visible={false}>
        {Array.from({ length: 3 }).map((_, i) => (
          <mesh
            key={`ring-${i}`}
            name="ring"
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, 0.05, 0]}
          >
            <ringGeometry args={[1.1, 1.45, 28]} />
            <meshBasicMaterial color="#bae6fd" transparent opacity={0.4} depthWrite={false} />
          </mesh>
        ))}
        {Array.from({ length: 10 }).map((_, i) => (
          <mesh key={`crown-${i}`} name="crown">
            <sphereGeometry args={[0.12 + (i % 3) * 0.04, 6, 6]} />
            <meshStandardMaterial
              color="#f0f9ff"
              transparent
              opacity={0.7}
              emissive="#7dd3fc"
              emissiveIntensity={0.25}
              depthWrite={false}
            />
          </mesh>
        ))}
        <mesh name="mist" position={[0, 0.7, 0]}>
          <sphereGeometry args={[1.65, 12, 12]} />
          <meshStandardMaterial
            color="#bae6fd"
            transparent
            opacity={0.18}
            emissive="#7dd3fc"
            emissiveIntensity={0.15}
            depthWrite={false}
          />
        </mesh>
        <Sparkles
          count={24}
          scale={[2.4, 2.2, 2.4]}
          size={2.2}
          speed={0.65}
          opacity={0.35}
          color="#e0f2fe"
        />
      </group>
    </group>
  );
}

function FlightRibbon() {
  const elapsed = usePlayback((s) => s.elapsed);
  const { points, colors } = useMemo(() => {
    const trail = getDroneMissionTrail(elapsed);
    const n = trail.length;
    const fresh = new THREE.Color("#67e8f9");
    const aged = new THREE.Color("#0c4a6e");
    return {
      points: trail.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
      colors: trail.map((_, i) => {
        const t = n <= 1 ? 1 : i / (n - 1);
        return fresh.clone().lerp(aged, 1 - t);
      }),
    };
  }, [elapsed]);

  if (points.length < 2) return null;

  return (
    <Line
      points={points}
      vertexColors={colors}
      lineWidth={2}
      transparent
      opacity={0.72}
    />
  );
}

function WindIndicator() {
  const rad = (WIND.directionDeg * Math.PI) / 180;
  const [px, pz] = PAD_XZ;
  const x = px + 12;
  const z = pz + 10;
  const y = heightAt(x, z);
  const sock = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!sock.current) return;
    const t = clock.elapsedTime;
    sock.current.rotation.z = Math.sin(t * 2.4) * 0.35 + WIND_XZ.x * 0.2;
    sock.current.rotation.x = Math.sin(t * 1.7 + 1) * 0.12;
  });

  return (
    <group position={[x, y, z]} rotation={[0, -rad, 0]}>
      <mesh position={[0, 3.2, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.1, 6.4, 8]} />
        <meshStandardMaterial color="#78716c" metalness={0.35} roughness={0.55} />
      </mesh>
      <group position={[0, 6.55, 0]}>
        <mesh position={[0, -0.35, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 0.7, 6]} />
          <meshStandardMaterial color="#57534e" />
        </mesh>
        <mesh ref={sock} position={[0, -0.75, 0.35]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.32, 1.35, 12, 1, true]} />
          <meshStandardMaterial
            color="#ef4444"
            emissive="#b91c1c"
            emissiveIntensity={0.25}
            roughness={0.85}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>
    </group>
  );
}

function MapWalk() {
  const camera = useThree((s) => s.camera);
  const get = useThree((s) => s.get);
  const keys = useRef({
    w: false,
    a: false,
    s: false,
    d: false,
    arrowUp: false,
    arrowDown: false,
    arrowLeft: false,
    arrowRight: false,
    shift: false,
    space: false,
    ctrl: false,
  });
  const forward = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());
  const delta = useRef(new THREE.Vector3());
  const look = useRef(new THREE.Vector3());
  const lookSpherical = useRef(new THREE.Spherical());
  const pitchAxis = useRef(new THREE.Vector3());

  useEffect(() => {
    const typing = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable);

    const down = (e: KeyboardEvent) => {
      if (typing(e.target)) return;
      if (e.code === "KeyW") keys.current.w = true;
      else if (e.code === "KeyA") keys.current.a = true;
      else if (e.code === "KeyS") keys.current.s = true;
      else if (e.code === "KeyD") keys.current.d = true;
      else if (e.code === "ArrowUp") keys.current.arrowUp = true;
      else if (e.code === "ArrowDown") keys.current.arrowDown = true;
      else if (e.code === "ArrowLeft") keys.current.arrowLeft = true;
      else if (e.code === "ArrowRight") keys.current.arrowRight = true;
      else if (e.code === "ShiftLeft" || e.code === "ShiftRight") keys.current.shift = true;
      else if (e.code === "Space") keys.current.space = true;
      else if (e.code === "ControlLeft" || e.code === "ControlRight") keys.current.ctrl = true;
      else return;
      e.preventDefault();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "KeyW") keys.current.w = false;
      else if (e.code === "KeyA") keys.current.a = false;
      else if (e.code === "KeyS") keys.current.s = false;
      else if (e.code === "KeyD") keys.current.d = false;
      else if (e.code === "ArrowUp") keys.current.arrowUp = false;
      else if (e.code === "ArrowDown") keys.current.arrowDown = false;
      else if (e.code === "ArrowLeft") keys.current.arrowLeft = false;
      else if (e.code === "ArrowRight") keys.current.arrowRight = false;
      else if (e.code === "ShiftLeft" || e.code === "ShiftRight") keys.current.shift = false;
      else if (e.code === "Space") keys.current.space = false;
      else if (e.code === "ControlLeft" || e.code === "ControlRight") keys.current.ctrl = false;
    };
    const clear = () => {
      keys.current.w = false;
      keys.current.a = false;
      keys.current.s = false;
      keys.current.d = false;
      keys.current.arrowUp = false;
      keys.current.arrowDown = false;
      keys.current.arrowLeft = false;
      keys.current.arrowRight = false;
      keys.current.shift = false;
      keys.current.space = false;
      keys.current.ctrl = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
    };
  }, []);

  useFrame((_, dt) => {
    const controls = get().controls as { target?: THREE.Vector3 } | null;
    const target = controls?.target;
    if (!target) return;
    const {
      w,
      a,
      s,
      d,
      arrowUp,
      arrowDown,
      arrowLeft,
      arrowRight,
      shift,
      space,
      ctrl,
    } = keys.current;
    const adjustingLook =
      arrowLeft !== arrowRight || arrowUp !== arrowDown;
    if (!w && !a && !s && !d && !shift && !space && !adjustingLook) return;

    camera.getWorldDirection(forward.current);
    forward.current.y = 0;
    if (forward.current.lengthSq() < 0.04) {
      forward.current.set(0, 0, -1).applyQuaternion(camera.quaternion);
      forward.current.y = 0;
    }
    if (forward.current.lengthSq() < 1e-6) forward.current.set(0, 0, -1);
    forward.current.normalize();

    right.current.set(1, 0, 0).applyQuaternion(camera.quaternion);
    right.current.y = 0;
    if (right.current.lengthSq() < 1e-6) right.current.set(1, 0, 0);
    right.current.normalize();

    delta.current.set(0, 0, 0);
    if (w) delta.current.add(forward.current);
    if (s) delta.current.sub(forward.current);
    if (d) delta.current.add(right.current);
    if (a) delta.current.sub(right.current);

    const speed = (ctrl ? 78 : 36) * dt;
    if (delta.current.lengthSq() > 1e-8) {
      delta.current.normalize().multiplyScalar(speed);
    }
    if (space) delta.current.y += speed;
    if (shift) delta.current.y -= speed;

    const limit = TERRAIN_SIZE / 2 - 6;
    const nextX = THREE.MathUtils.clamp(
      camera.position.x + delta.current.x,
      -limit,
      limit,
    );
    const nextZ = THREE.MathUtils.clamp(
      camera.position.z + delta.current.z,
      -limit,
      limit,
    );
    const ground = heightAt(nextX, nextZ) + 2;
    const nextY = THREE.MathUtils.clamp(
      camera.position.y + delta.current.y,
      ground,
      180,
    );
    const appliedX = nextX - camera.position.x;
    const appliedZ = nextZ - camera.position.z;
    const appliedY = nextY - camera.position.y;
    camera.position.set(nextX, nextY, nextZ);
    target.x += appliedX;
    target.y += appliedY;
    target.z += appliedZ;

    if (adjustingLook) {
      const turn = 1.55 * dt;
      look.current.subVectors(target, camera.position);
      if (look.current.lengthSq() < 1e-8) {
        look.current.set(0, 0, -10);
      }

      if (arrowLeft !== arrowRight) {
        const yaw = (arrowLeft ? 1 : -1) * turn;
        look.current.applyAxisAngle(Y_AXIS, yaw);
      }

      if (arrowUp !== arrowDown) {
        pitchAxis.current.crossVectors(look.current, Y_AXIS);
        if (pitchAxis.current.lengthSq() < 1e-8) {
          pitchAxis.current.set(1, 0, 0);
        } else {
          pitchAxis.current.normalize();
        }
        const pitch = (arrowUp ? 1 : -1) * turn;
        look.current.applyAxisAngle(pitchAxis.current, pitch);
      }

      lookSpherical.current.setFromVector3(look.current);
      const radius = lookSpherical.current.radius;
      lookSpherical.current.phi = THREE.MathUtils.clamp(
        lookSpherical.current.phi,
        MAP_LOOK_PITCH_MIN,
        MAP_LOOK_PITCH_MAX,
      );
      lookSpherical.current.radius = radius;
      look.current.setFromSpherical(lookSpherical.current);
      target.copy(camera.position).add(look.current);
    }
  });

  return null;
}

function SceneContent() {
  const spot3 = mapToMission3D(fireFronts[0].center);
  const fireRadius = fireRadiusUnits(fireFronts[0].radiusM) * 3.1;
  const sunPos = useMemo(() => sunDirection().multiplyScalar(140), []);
  const { shadowMapSize } = useMissionQuality();

  return (
    <>
      <color attach="background" args={["#7a9cb8"]} />
      <fog attach="fog" args={["#9eb8cc", 140, 420]} />
      <Environment
        files={MISSION_HDRI}
        background={false}
        environmentIntensity={0.45}
      />
      <Sky
        distance={450000}
        sunPosition={SUN_POSITION.toArray()}
        inclination={0.52}
        azimuth={0.22}
        turbidity={5}
        rayleigh={1.35}
        mieCoefficient={0.012}
      />
      <ambientLight intensity={0.18} />
      <directionalLight
        castShadow
        position={sunPos.toArray()}
        intensity={1.45}
        color="#fff0dc"
        shadow-mapSize={[shadowMapSize, shadowMapSize]}
        shadow-bias={-0.00015}
        shadow-normalBias={0.02}
        shadow-camera-far={360}
        shadow-camera-left={-130}
        shadow-camera-right={130}
        shadow-camera-top={130}
        shadow-camera-bottom={-130}
      />
      <Terrain />
      <CanalWater />
      <MissionGrassField />
      <MissionForest />
      <LandingPad />
      <SoilSensors />
      <FireFront center={spot3} radius={fireRadius} />
      <WindIndicator />
      <FlightRibbon />
      <MissionDroneModel />
      <WaterStream />
      <OrbitControls
        makeDefault
        enableRotate={false}
        enablePan={false}
        enableZoom={false}
        enableDamping={false}
        minPolarAngle={MAP_ORBIT_POLAR_MIN}
        maxPolarAngle={MAP_ORBIT_POLAR_MAX}
        target={MISSION_VIEW.target}
        maxDistance={280}
        minDistance={8}
      />
      <MapWalk />
      <MissionPostFX />
    </>
  );
}

function MissionSceneLoader() {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#050810]/40">
      <p className="font-mono text-xs tracking-widest text-cyan-200/80">
        LOADING TERRAIN…
      </p>
    </div>
  );
}

export function MissionScene() {
  return (
    <MissionQualityProvider>
      <Suspense fallback={<MissionSceneLoader />}>
        <Canvas
          shadows={{ type: THREE.PCFSoftShadowMap }}
          className="absolute inset-0 overflow-hidden"
          gl={{
            antialias: true,
            toneMapping: THREE.ACESFilmicToneMapping,
            outputColorSpace: THREE.SRGBColorSpace,
          }}
          dpr={[1, 1.75]}
        >
          <MissionPerformance>
            <PerspectiveCamera makeDefault position={MISSION_VIEW.position} fov={50} />
            <SceneContent />
          </MissionPerformance>
        </Canvas>
      </Suspense>
    </MissionQualityProvider>
  );
}
