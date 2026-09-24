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
  Line,
  OrbitControls,
  PerspectiveCamera,
  Sky,
  Sparkles,
} from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import {
  applyInstanceWind,
  createBillboardMaterial,
  createFlameTexture,
  createGrassBladeTexture,
  createPalmFrondTexture,
  createRotorBlurTexture,
  createScorchTexture,
  createSmokeTexture,
  createTerrainMaterial,
  createTerrainNormalMap,
  createWaterMaterial,
  SUN_POSITION,
  sunDirection,
  taperTubeInPlace,
  updateWindUniforms,
} from "./mission-graphics";
import { MissionPostFX } from "./MissionPostFX";
import {
  CANALS,
  PAD_XZ,
  SPOT_XZ,
  TERRAIN_SEGMENTS,
  TERRAIN_SIZE,
  WIND_XZ,
  buildForestInstances,
  buildGrassInstances,
  fireRadiusUnits,
  groundColorAt,
  heightAt,
  lngLatToXZ,
  MISSION_UNITS_PER_DEG,
} from "./terrain";

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
  const { geom, material } = useMemo(() => {
    const g = new THREE.PlaneGeometry(
      TERRAIN_SIZE,
      TERRAIN_SIZE,
      TERRAIN_SEGMENTS,
      TERRAIN_SEGMENTS,
    );
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    const colors: number[] = [];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = heightAt(x, z);
      pos.setY(i, y);
      const c = groundColorAt(x, z);
      colors.push(c.r, c.g, c.b);
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    g.computeVertexNormals();
    const normalMap = createTerrainNormalMap();
    return { geom: g, material: createTerrainMaterial(normalMap) };
  }, []);

  return (
    <mesh geometry={geom} receiveShadow castShadow material={material} />
  );
}

function buildCanalRibbonGeometry(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  halfW: number,
  segments = 56,
): THREE.BufferGeometry {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len;
  const uz = dz / len;
  const px = -uz;
  const pz = ux;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const w = halfW * 0.92;

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const cx = x0 + dx * t;
    const cz = z0 + dz * t;
    const y = heightAt(cx, cz) + 0.04;
    positions.push(cx + px * w, y, cz + pz * w);
    positions.push(cx - px * w, y, cz - pz * w);
    uvs.push(t, 0, t, 1);
    if (i < segments) {
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
    () =>
      CANALS.map((c) =>
        buildCanalRibbonGeometry(c.x0, c.z0, c.x1, c.z1, c.halfW),
      ),
    [],
  );
  const material = useMemo(() => createWaterMaterial(), []);

  useFrame(({ clock }) => {
    material.uniforms.uTime.value = clock.elapsedTime;
  });

  return (
    <group>
      {geoms.map((geom, i) => (
        <mesh key={i} geometry={geom} material={material} receiveShadow />
      ))}
    </group>
  );
}

function Forest() {
  const trees = useMemo(() => buildForestInstances(), []);
  const broadLower = useRef<THREE.InstancedMesh>(null);
  const broadUpper = useRef<THREE.InstancedMesh>(null);
  const broadTrunk = useRef<THREE.InstancedMesh>(null);
  const shrubs = useRef<THREE.InstancedMesh>(null);
  const palmTrunk = useRef<THREE.InstancedMesh>(null);
  const palmFrond = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const broad = useMemo(() => trees.filter((t) => t.kind === "broadleaf"), [trees]);
  const shrubList = useMemo(() => trees.filter((t) => t.kind === "shrub"), [trees]);
  const palmList = useMemo(() => trees.filter((t) => t.kind === "palm"), [trees]);

  const canopyMat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ roughness: 0.88, vertexColors: true });
    applyInstanceWind(m);
    return m;
  }, []);
  const shrubMat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ roughness: 0.9, vertexColors: true });
    applyInstanceWind(m);
    return m;
  }, []);
  const palmFrondMat = useMemo(() => {
    const map = createPalmFrondTexture();
    return new THREE.MeshStandardMaterial({
      map,
      alphaMap: map,
      transparent: true,
      color: "#15803d",
      roughness: 0.95,
      side: THREE.DoubleSide,
    });
  }, []);

  const windMaterials = useMemo(
    () => [canopyMat, shrubMat],
    [canopyMat, shrubMat],
  );

  useLayoutEffect(() => {
    broad.forEach((t, i) => {
      const green = new THREE.Color().setHSL(0.32 + t.hue * 0.06, 0.55, 0.22 + t.hue * 0.08);
      dummy.position.set(t.x, t.y + 0.9 * t.scale, t.z);
      dummy.scale.set(t.scale * 1.05, t.scale * 1.1, t.scale * 1.05);
      dummy.updateMatrix();
      broadLower.current!.setMatrixAt(i, dummy.matrix);
      broadLower.current!.setColorAt(i, green);

      dummy.position.set(t.x, t.y + 1.65 * t.scale, t.z);
      dummy.scale.set(t.scale * 0.82, t.scale * 1.05, t.scale * 0.82);
      dummy.updateMatrix();
      broadUpper.current!.setMatrixAt(i, dummy.matrix);
      broadUpper.current!.setColorAt(i, green.clone().offsetHSL(0, 0, 0.06));

      dummy.position.set(t.x, t.y + 0.35 * t.scale, t.z);
      dummy.scale.set(0.22 * t.scale, 0.75 * t.scale, 0.22 * t.scale);
      dummy.updateMatrix();
      broadTrunk.current!.setMatrixAt(i, dummy.matrix);
    });
    if (broadLower.current) {
      broadLower.current.instanceMatrix.needsUpdate = true;
      if (broadLower.current.instanceColor) broadLower.current.instanceColor.needsUpdate = true;
    }
    if (broadUpper.current) {
      broadUpper.current.instanceMatrix.needsUpdate = true;
      if (broadUpper.current.instanceColor) broadUpper.current.instanceColor.needsUpdate = true;
    }
    if (broadTrunk.current) broadTrunk.current.instanceMatrix.needsUpdate = true;

    shrubList.forEach((t, i) => {
      const green = new THREE.Color().setHSL(0.34 + t.hue * 0.04, 0.5, 0.18);
      dummy.position.set(t.x, t.y + 0.35 * t.scale, t.z);
      dummy.scale.setScalar(t.scale * 0.55);
      dummy.updateMatrix();
      shrubs.current!.setMatrixAt(i, dummy.matrix);
      shrubs.current!.setColorAt(i, green);
    });
    if (shrubs.current) {
      shrubs.current.instanceMatrix.needsUpdate = true;
      if (shrubs.current.instanceColor) shrubs.current.instanceColor.needsUpdate = true;
    }

    palmList.forEach((t, i) => {
      dummy.position.set(t.x, t.y + 1.1 * t.scale, t.z);
      dummy.scale.set(0.18 * t.scale, 2.2 * t.scale, 0.18 * t.scale);
      dummy.updateMatrix();
      palmTrunk.current!.setMatrixAt(i, dummy.matrix);

      dummy.position.set(t.x, t.y + 2.35 * t.scale, t.z);
      dummy.rotation.set(-0.35, t.phase, 0);
      dummy.scale.set(t.scale * 1.8, t.scale * 1.8, 1);
      dummy.updateMatrix();
      palmFrond.current!.setMatrixAt(i, dummy.matrix);
      dummy.rotation.set(0, 0, 0);
    });
    if (palmTrunk.current) palmTrunk.current.instanceMatrix.needsUpdate = true;
    if (palmFrond.current) palmFrond.current.instanceMatrix.needsUpdate = true;
  }, [broad, shrubList, palmList, dummy]);

  useFrame(({ clock }) => {
    updateWindUniforms(windMaterials, clock.elapsedTime);
  });

  return (
    <group>
      <instancedMesh
        ref={broadLower}
        args={[undefined, undefined, broad.length]}
        castShadow
        receiveShadow
        material={canopyMat}
      >
        <coneGeometry args={[1, 1.4, 6]} />
      </instancedMesh>
      <instancedMesh
        ref={broadUpper}
        args={[undefined, undefined, broad.length]}
        castShadow
        receiveShadow
        material={canopyMat}
      >
        <coneGeometry args={[1, 1.2, 6]} />
      </instancedMesh>
      <instancedMesh
        ref={broadTrunk}
        args={[undefined, undefined, broad.length]}
        castShadow
      >
        <cylinderGeometry args={[1, 1.15, 1, 6]} />
        <meshStandardMaterial color="#422006" roughness={1} />
      </instancedMesh>
      <instancedMesh
        ref={shrubs}
        args={[undefined, undefined, shrubList.length]}
        castShadow
        receiveShadow
        material={shrubMat}
      >
        <icosahedronGeometry args={[1, 0]} />
      </instancedMesh>
      <instancedMesh ref={palmTrunk} args={[undefined, undefined, palmList.length]} castShadow>
        <cylinderGeometry args={[1, 1.3, 1, 6]} />
        <meshStandardMaterial color="#57534e" roughness={0.95} />
      </instancedMesh>
      <instancedMesh
        ref={palmFrond}
        args={[undefined, undefined, palmList.length]}
        castShadow
        material={palmFrondMat}
      >
        <planeGeometry args={[1.6, 1.6]} />
      </instancedMesh>
    </group>
  );
}

function GrassField() {
  const blades = useMemo(() => buildGrassInstances(), []);
  const meshA = useRef<THREE.InstancedMesh>(null);
  const meshB = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const grassMap = useMemo(() => createGrassBladeTexture(), []);

  useLayoutEffect(() => {
    blades.forEach((b, i) => {
      const h = 0.9 * b.scale;
      dummy.position.set(b.x, b.y + h * 0.45, b.z);
      dummy.rotation.set(0, b.rotY, 0);
      dummy.scale.set(0.35 * b.scale, h, 1);
      dummy.updateMatrix();
      meshA.current!.setMatrixAt(i, dummy.matrix);
      dummy.rotation.set(0, b.rotY + Math.PI / 2, 0);
      dummy.updateMatrix();
      meshB.current!.setMatrixAt(i, dummy.matrix);
    });
    meshA.current!.instanceMatrix.needsUpdate = true;
    meshB.current!.instanceMatrix.needsUpdate = true;
  }, [blades, dummy]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    blades.forEach((b, i) => {
      const sway =
        Math.sin(t * 1.35 + b.phase) * 0.1 * (WIND_XZ.x + WIND_XZ.z);
      const h = 0.9 * b.scale;
      dummy.position.set(b.x + sway, b.y + h * 0.45, b.z + sway * 0.4);
      dummy.rotation.set(0, b.rotY, sway * 0.15);
      dummy.scale.set(0.35 * b.scale, h, 1);
      dummy.updateMatrix();
      meshA.current!.setMatrixAt(i, dummy.matrix);
      dummy.rotation.set(0, b.rotY + Math.PI / 2, sway * 0.12);
      dummy.updateMatrix();
      meshB.current!.setMatrixAt(i, dummy.matrix);
    });
    meshA.current!.instanceMatrix.needsUpdate = true;
    meshB.current!.instanceMatrix.needsUpdate = true;
  });

  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: grassMap,
        alphaMap: grassMap,
        transparent: true,
        roughness: 1,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    [grassMap],
  );

  return (
    <group>
      <instancedMesh ref={meshA} args={[undefined, undefined, blades.length]} material={mat}>
        <planeGeometry args={[1, 1]} />
      </instancedMesh>
      <instancedMesh ref={meshB} args={[undefined, undefined, blades.length]} material={mat}>
        <planeGeometry args={[1, 1]} />
      </instancedMesh>
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
        <meshStandardMaterial color="#4b5563" roughness={0.92} />
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
      <mesh position={[6.6, 1.2, 3.6]} castShadow>
        <boxGeometry args={[4.4, 2.4, 3]} />
        <meshStandardMaterial color="#0f172a" metalness={0.4} roughness={0.5} />
      </mesh>
      <mesh position={[6.6, 2.5, 3.6]}>
        <boxGeometry args={[4.6, 0.22, 3.2]} />
        <meshStandardMaterial color="#0f766e" emissive="#115e59" emissiveIntensity={0.25} />
      </mesh>
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

  const flameTex = useMemo(() => createFlameTexture(), []);
  const smokeTex = useMemo(() => createSmokeTexture(), []);
  const scorchTex = useMemo(() => createScorchTexture(), []);
  const flameMat = useMemo(
    () => createBillboardMaterial(flameTex, { emissive: true }),
    [flameTex],
  );
  const smokeMat = useMemo(
    () => createBillboardMaterial(smokeTex),
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
        };
      }),
    [radius],
  );

  useFrame(({ clock }) => {
    const suppression = getFireSuppression(usePlayback.getState().elapsed);
    const contained = 1 - suppression * 0.68;
    const cooling = suppression > 0.35;
    const time = clock.elapsedTime;

    if (flames.current) {
      flames.current.scale.set(contained, 0.45 + contained * 0.55, contained);
      const alive = Math.max(3, Math.round(14 * (0.28 + contained * 0.72)));
      flames.current.children.forEach((child, i) => {
        const slot = child as THREE.Group;
        slot.visible = i < alive;
        if (!slot.visible) return;
        const mesh = slot.children[0]?.children[0] as THREE.Mesh | undefined;
        if (!mesh) return;
        const flicker = 1 + Math.sin(time * (7 - suppression * 2.5) + i) * 0.14;
        const stretch = 1 + Math.sin(time * 9 + i * 1.7) * 0.2;
        mesh.scale.set(
          flameSlots[i].w * flicker,
          flameSlots[i].h * flicker * stretch,
          1,
        );
        const mat = mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = (cooling ? 0.45 : 0.92) * (0.4 + contained * 0.6);
      });
    }
    if (smoke.current) {
      smoke.current.visible = suppression > 0.05 || cooling;
      smoke.current.children.forEach((child, i) => {
        const billboard = child as THREE.Group;
        const mesh = billboard.children[0] as THREE.Mesh | undefined;
        if (!mesh) return;
        const mat = mesh.material as THREE.MeshBasicMaterial;
        const rise = (time * 0.35 + i * 0.2) % 1;
        billboard.position.set(
          WIND_XZ.x * rise * 4 + Math.sin(i + time * 0.5) * 0.6,
          1.5 + rise * 5 + i * 0.3,
          WIND_XZ.z * rise * 4 + Math.cos(i + time * 0.4) * 0.6,
        );
        mesh.scale.setScalar(1.2 + rise * 2.2);
        mat.opacity =
          (cooling ? 0.35 : 0.18) * (1 - rise) * (0.35 + contained * 0.65);
      });
    }
    if (scorch.current) {
      const sc = 0.58 + 0.42 * contained;
      scorch.current.scale.set(sc, sc, 1);
    }
    if (embers.current) embers.current.scale.setScalar(0.4 + contained * 0.75);
    if (steam.current) steam.current.visible = suppression > 0.08;
    if (light.current) {
      light.current.intensity = (cooling ? 1.4 : 4.2) * contained;
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
          emissive="#3d1a08"
          emissiveIntensity={0.35}
          roughness={1}
          transparent
          opacity={0.95}
        />
      </mesh>
      <group ref={flames}>
        {flameSlots.map((slot, i) => (
          <group key={i} position={[slot.x, slot.h * 0.35, slot.z]}>
            <CameraBillboard>
              <mesh material={flameMat} renderOrder={5}>
                <planeGeometry args={[slot.w, slot.h]} />
              </mesh>
            </CameraBillboard>
          </group>
        ))}
      </group>
      <group ref={smoke}>
        {Array.from({ length: 8 }).map((_, i) => (
          <CameraBillboard key={i}>
            <mesh material={smokeMat}>
              <planeGeometry args={[2.4, 2.4]} />
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
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const nozzle = useMemo(() => new THREE.Vector3(), []);
  const impact = useMemo(() => new THREE.Vector3(), []);
  const ctrl = useMemo(() => new THREE.Vector3(), []);
  const side = useMemo(() => new THREE.Vector3(), []);
  const chord = useMemo(() => new THREE.Vector3(), []);
  const samples = useMemo(
    () => Array.from({ length: JET_SAMPLES + 1 }, () => new THREE.Vector3()),
    [],
  );
  const point = useMemo(() => new THREE.Vector3(), []);
  const ahead = useMemo(() => new THREE.Vector3(), []);
  const tangent = useMemo(() => new THREE.Vector3(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
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
      .addScaledVector(nozzle, omt * omt)
      .addScaledVector(ctrl, 2 * omt * u)
      .addScaledVector(impact, u * u);
    const wobble = Math.sin(u * 20 + time * 9) * (0.04 + u * 0.28);
    const flutter = Math.sin(u * 11 - time * 7) * u * 0.16;
    out.addScaledVector(side, wobble);
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
    nozzle.set(dx, dy - 0.62, dz);
    impact.set(spot[0], heightAt(spot[0], spot[2]) + 0.2, spot[2]);
    ctrl.copy(nozzle).lerp(impact, 0.36);
    const span = nozzle.distanceTo(impact);
    ctrl.y -= Math.min(7, 1.4 + span * 0.11);
    ctrl.x += WIND_XZ.x * 2.8;
    ctrl.z += WIND_XZ.z * 2.8;

    side.crossVectors(chord.copy(impact).sub(nozzle), up);
    if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
    side.normalize();

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
    jetMap.offset.x = -(time * 1.6) % 1;

    for (let i = 0; i < SPRAY_DROPS; i++) {
      const u = ((i + 0.37) / SPRAY_DROPS + time * 0.7) % 1;
      sampleJet(Math.min(0.97, u), time, point);
      sampleJet(Math.min(0.99, u + 0.025), time, ahead);
      tangent.copy(ahead).sub(point);
      if (tangent.lengthSq() < 1e-6) tangent.set(0, -1, 0);
      tangent.normalize();
      const spray = Math.pow(u, 1.35);
      const ang = i * 2.399963 + time * 1.6;
      const rad = (u < 0.4 ? 0.015 : 0.04) + spray * (0.16 + (i % 5) * 0.06);
      point.x += Math.cos(ang) * rad;
      point.y += Math.sin(ang * 1.7) * rad * 0.35;
      point.z += Math.sin(ang) * rad;
      dummy.position.copy(point);
      dummy.quaternion.setFromUnitVectors(up, tangent);
      const bead = 0.09 + (i % 4) * 0.03 + spray * 0.04;
      const along = 0.55 + spray * 1.8;
      dummy.scale.set(bead, bead * along, bead * 0.85);
      dummy.updateMatrix();
      dropMesh.setMatrixAt(i, dummy.matrix);
    }
    dropMesh.instanceMatrix.needsUpdate = true;

    if (splash.current) {
      splash.current.position.copy(impact);
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
      <mesh ref={outer} visible={false} renderOrder={2} geometry={outerGeom}>
        <meshStandardMaterial
          map={jetMap}
          color="#7dd3fc"
          transparent
          opacity={0.34}
          roughness={0.08}
          metalness={0.02}
          emissive="#38bdf8"
          emissiveIntensity={0.12}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh ref={inner} visible={false} renderOrder={3} geometry={innerGeom}>
        <meshStandardMaterial
          color="#f8fdff"
          transparent
          opacity={0.42}
          roughness={0.04}
          emissive="#e0f2fe"
          emissiveIntensity={0.2}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
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
          <sphereGeometry args={[1.15, 12, 12]} />
          <meshBasicMaterial color="#bae6fd" transparent opacity={0.12} depthWrite={false} />
        </mesh>
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

function Drone() {
  const group = useRef<THREE.Group>(null);
  const rotors = useRef<THREE.Group>(null);
  const elapsed = usePlayback((s) => s.elapsed);
  const prev = useRef(new THREE.Vector3());
  const rotorBlur = useMemo(() => createRotorBlurTexture(), []);
  const bodyMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#1e293b",
        metalness: 0.55,
        roughness: 0.35,
      }),
    [],
  );
  const armMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#334155",
        metalness: 0.45,
        roughness: 0.4,
      }),
    [],
  );
  const rotorMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: rotorBlur,
        transparent: true,
        opacity: 0.82,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [rotorBlur],
  );

  useFrame((_, delta) => {
    if (!group.current) return;
    const [x, y, z] = getDroneMissionPosition(elapsed);
    const next = new THREE.Vector3(x, y, z);
    group.current.position.copy(next);

    const vel = next.clone().sub(prev.current);
    if (vel.lengthSq() > 0.0001) {
      const yaw = Math.atan2(vel.x, vel.z);
      group.current.rotation.y = THREE.MathUtils.lerp(
        group.current.rotation.y,
        yaw,
        0.12,
      );
      const bank = THREE.MathUtils.clamp(-vel.x * 0.04, -0.35, 0.35);
      group.current.rotation.z = THREE.MathUtils.lerp(
        group.current.rotation.z,
        bank,
        0.1,
      );
    }
    const pitch = THREE.MathUtils.clamp(-vel.y * 0.08, -0.42, 0.42);
    group.current.rotation.x = THREE.MathUtils.lerp(
      group.current.rotation.x,
      pitch,
      0.14,
    );
    prev.current.copy(next);

    if (rotors.current) rotors.current.rotation.y += delta * 32;
  });

  const arm = 1.22;
  const rotorPositions: [number, number, number][] = [
    [arm, 0.12, arm],
    [-arm, 0.12, arm],
    [arm, 0.12, -arm],
    [-arm, 0.12, -arm],
  ];

  return (
    <group ref={group}>
      <mesh castShadow position={[0, 0.05, 0]}>
        <boxGeometry args={[0.95, 0.22, 0.95]} />
        <primitive object={bodyMat} attach="material" />
      </mesh>
      <mesh castShadow position={[0, 0.18, 0]}>
        <boxGeometry args={[0.55, 0.12, 0.55]} />
        <meshStandardMaterial color="#0f172a" metalness={0.6} roughness={0.3} />
      </mesh>
      {rotorPositions.map(([rx, ry, rz], i) => (
        <group key={i}>
          <mesh position={[rx * 0.52, ry, rz * 0.52]} castShadow>
            <boxGeometry args={[arm * 0.95, 0.06, 0.1]} />
            <primitive object={armMat} attach="material" />
          </mesh>
          <mesh position={[rx, ry - 0.02, rz]}>
            <cylinderGeometry args={[0.12, 0.14, 0.18, 8]} />
            <meshStandardMaterial color="#475569" metalness={0.65} roughness={0.35} />
          </mesh>
        </group>
      ))}
      <group ref={rotors}>
        {rotorPositions.map(([rx, ry, rz], i) => (
          <mesh key={i} position={[rx, ry + 0.14, rz]} rotation={[Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.62, 16]} />
            <primitive object={rotorMat} attach="material" />
          </mesh>
        ))}
      </group>
      <mesh position={[0.42, 0.08, 0.42]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshStandardMaterial color="#ef4444" emissive="#dc2626" emissiveIntensity={1.2} />
      </mesh>
      <mesh position={[-0.42, 0.08, 0.42]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshStandardMaterial color="#22c55e" emissive="#16a34a" emissiveIntensity={0.9} />
      </mesh>
      <mesh position={[0, -0.12, 0.15]} rotation={[0.35, 0, 0]} castShadow>
        <sphereGeometry args={[0.16, 12, 12]} />
        <meshStandardMaterial
          color="#0ea5e9"
          emissive="#0284c7"
          emissiveIntensity={0.45}
          metalness={0.3}
          roughness={0.25}
        />
      </mesh>
      <mesh position={[-0.38, -0.28, 0]} castShadow>
        <boxGeometry args={[0.08, 0.04, 0.55]} />
        <meshStandardMaterial color="#64748b" metalness={0.5} roughness={0.45} />
      </mesh>
      <mesh position={[0.38, -0.28, 0]} castShadow>
        <boxGeometry args={[0.08, 0.04, 0.55]} />
        <meshStandardMaterial color="#64748b" metalness={0.5} roughness={0.45} />
      </mesh>
    </group>
  );
}

function WindIndicator() {
  const rad = (WIND.directionDeg * Math.PI) / 180;
  const [px, pz] = PAD_XZ;
  const x = px + 12;
  const z = pz + 10;
  const y = heightAt(x, z);
  return (
    <group position={[x, y, z]} rotation={[0, -rad, 0]}>
      <mesh position={[0, 3.2, 0]}>
        <cylinderGeometry args={[0.08, 0.1, 6.4, 6]} />
        <meshStandardMaterial color="#78716c" />
      </mesh>
      <mesh position={[0, 6.6, 0.8]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.7, 2.4, 5]} />
        <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={0.45} />
      </mesh>
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
    q: false,
    e: false,
    shift: false,
    space: false,
    ctrl: false,
  });
  const forward = useMemo(() => new THREE.Vector3(), []);
  const right = useMemo(() => new THREE.Vector3(), []);
  const delta = useMemo(() => new THREE.Vector3(), []);
  const look = useMemo(() => new THREE.Vector3(), []);

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
      else if (e.code === "KeyQ") keys.current.q = true;
      else if (e.code === "KeyE") keys.current.e = true;
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
      else if (e.code === "KeyQ") keys.current.q = false;
      else if (e.code === "KeyE") keys.current.e = false;
      else if (e.code === "ShiftLeft" || e.code === "ShiftRight") keys.current.shift = false;
      else if (e.code === "Space") keys.current.space = false;
      else if (e.code === "ControlLeft" || e.code === "ControlRight") keys.current.ctrl = false;
    };
    const clear = () => {
      keys.current.w = false;
      keys.current.a = false;
      keys.current.s = false;
      keys.current.d = false;
      keys.current.q = false;
      keys.current.e = false;
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
    const { w, a, s, d, q, e, shift, space, ctrl } = keys.current;
    const turning = q !== e;
    if (!w && !a && !s && !d && !shift && !space && !turning) return;

    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 0.04) {
      forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
      forward.y = 0;
    }
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
    forward.normalize();

    right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    right.y = 0;
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    right.normalize();

    delta.set(0, 0, 0);
    if (w) delta.add(forward);
    if (s) delta.sub(forward);
    if (d) delta.add(right);
    if (a) delta.sub(right);

    const speed = (ctrl ? 78 : 36) * dt;
    if (delta.lengthSq() > 1e-8) delta.normalize().multiplyScalar(speed);
    if (space) delta.y += speed;
    if (shift) delta.y -= speed;

    const limit = TERRAIN_SIZE / 2 - 6;
    const nextX = THREE.MathUtils.clamp(camera.position.x + delta.x, -limit, limit);
    const nextZ = THREE.MathUtils.clamp(camera.position.z + delta.z, -limit, limit);
    const ground = heightAt(nextX, nextZ) + 2;
    const nextY = THREE.MathUtils.clamp(camera.position.y + delta.y, ground, 180);
    const appliedX = nextX - camera.position.x;
    const appliedZ = nextZ - camera.position.z;
    const appliedY = nextY - camera.position.y;
    camera.position.set(nextX, nextY, nextZ);
    target.x += appliedX;
    target.y += appliedY;
    target.z += appliedZ;

    if (turning) {
      const yaw = (q ? 1 : -1) * 1.55 * dt;
      look.subVectors(target, camera.position);
      look.applyAxisAngle(Y_AXIS, yaw);
      target.copy(camera.position).add(look);
    }
  });

  return null;
}

function SceneContent() {
  const spot3 = mapToMission3D(fireFronts[0].center);
  const fireRadius = fireRadiusUnits(fireFronts[0].radiusM) * 3.1;
  const sunPos = useMemo(() => sunDirection().multiplyScalar(140), []);

  return (
    <>
      <color attach="background" args={["#7a9cb8"]} />
      <fog attach="fog" args={["#9eb8cc", 160, 440]} />
      <Sky
        distance={450000}
        sunPosition={SUN_POSITION.toArray()}
        inclination={0.52}
        azimuth={0.22}
        turbidity={5}
        rayleigh={1.35}
        mieCoefficient={0.012}
      />
      <hemisphereLight args={["#c8e4f4", "#243828", 0.52]} />
      <ambientLight intensity={0.28} />
      <directionalLight
        castShadow
        position={sunPos.toArray()}
        intensity={1.35}
        color="#fff0dc"
        shadow-mapSize={[2048, 2048]}
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
      <GrassField />
      <Forest />
      <LandingPad />
      <SoilSensors />
      <FireFront center={spot3} radius={fireRadius} />
      <WindIndicator />
      <FlightRibbon />
      <Drone />
      <WaterStream />
      <OrbitControls
        makeDefault
        enableRotate={false}
        enablePan={false}
        enableZoom={false}
        enableDamping
        dampingFactor={0.08}
        maxPolarAngle={Math.PI / 2.08}
        target={MISSION_VIEW.target}
        maxDistance={280}
        minDistance={8}
      />
      <MapWalk />
      <MissionPostFX />
    </>
  );
}

export function MissionScene() {
  return (
    <Canvas
      shadows={{ type: THREE.PCFSoftShadowMap }}
      className="absolute inset-0 overflow-hidden"
      gl={{
        antialias: true,
        toneMapping: THREE.NoToneMapping,
      }}
      dpr={[1, 1.75]}
    >
      <PerspectiveCamera makeDefault position={MISSION_VIEW.position} fov={50} />
      <SceneContent />
    </Canvas>
  );
}
