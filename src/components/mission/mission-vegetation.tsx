"use client";

import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { MISSION_MODELS } from "./mission-assets";
import {
  applyInstanceWind,
  createGrassBladeTexture,
  createGrassWindMaterial,
  updateWindUniforms,
} from "./mission-graphics";
import { useMissionQuality } from "./mission-quality";
import {
  buildForestInstances,
  buildGrassInstances,
  heightAt,
  type TreeInstance,
} from "./terrain";

type GltfPart = {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  name: string;
};

function extractMeshParts(scene: THREE.Object3D): GltfPart[] {
  const parts: GltfPart[] = [];
  scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
      parts.push({
        geometry: obj.geometry,
        material: mat.clone(),
        name: obj.name || "Mesh",
      });
    }
  });
  return parts;
}

function tuneLeafMaterial(mat: THREE.Material) {
  if (!(mat instanceof THREE.MeshStandardMaterial)) return;
  mat.alphaTest = 0.45;
  mat.transparent = false;
  mat.side = THREE.DoubleSide;
  mat.roughness = Math.min(mat.roughness, 0.92);
}

function InstancedGltfForest({
  url,
  instances,
  scaleMul = 1,
}: {
  url: string;
  instances: TreeInstance[];
  scaleMul?: number;
}) {
  const { scene } = useGLTF(url);
  const parts = useMemo(() => extractMeshParts(scene), [scene]);
  const refs = useRef<(THREE.InstancedMesh | null)[]>([]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const { treeLodDistance } = useMissionQuality();
  const camPos = useRef(new THREE.Vector3());

  const windMaterials = useMemo(() => {
    return parts
      .map((p) => p.material)
      .filter((m): m is THREE.MeshStandardMaterial => m instanceof THREE.MeshStandardMaterial);
  }, [parts]);

  useLayoutEffect(() => {
    parts.forEach((part, pi) => {
      const mesh = refs.current[pi];
      if (!mesh) return;
      if (part.name.toLowerCase().includes("frond") || part.name.toLowerCase().includes("canopy")) {
        tuneLeafMaterial(part.material);
        if (part.material instanceof THREE.MeshStandardMaterial) {
          applyInstanceWind(part.material);
        }
      }
      let idx = 0;
      for (const t of instances) {
        const dist = Math.hypot(t.x - camPos.current.x, t.z - camPos.current.z);
        if (dist > treeLodDistance && part.name.toLowerCase().includes("canopy")) {
          dummy.scale.setScalar(0.001);
        } else {
          dummy.position.set(t.x, t.y, t.z);
          dummy.rotation.set(0, t.phase, 0);
          dummy.scale.setScalar(t.scale * scaleMul);
          if (part.name.toLowerCase().includes("trunk")) {
            dummy.scale.y *= 1.05;
          }
        }
        dummy.updateMatrix();
        mesh.setMatrixAt(idx, dummy.matrix);
        if (mesh.instanceColor) {
          const green = new THREE.Color().setHSL(
            0.32 + t.hue * 0.06,
            0.52,
            0.24 + t.hue * 0.1,
          );
          mesh.setColorAt(idx, green);
        }
        idx++;
      }
      mesh.count = instances.length;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
  }, [instances, parts, dummy, scaleMul, treeLodDistance]);

  useFrame(({ clock, camera }) => {
    camPos.current.copy(camera.position);
    updateWindUniforms(windMaterials, clock.elapsedTime);
  });

  return (
    <>
      {parts.map((part, i) => (
        <instancedMesh
          key={`${url}-${part.name}-${i}`}
          ref={(el) => {
            refs.current[i] = el;
          }}
          args={[part.geometry, part.material, instances.length]}
          castShadow
          receiveShadow
        />
      ))}
    </>
  );
}

export function MissionForest() {
  const trees = useMemo(() => buildForestInstances(), []);
  const broad = useMemo(() => trees.filter((t) => t.kind === "broadleaf"), [trees]);
  const palms = useMemo(() => trees.filter((t) => t.kind === "palm"), [trees]);
  const shrubs = useMemo(() => trees.filter((t) => t.kind === "shrub"), [trees]);

  return (
    <group>
      <InstancedGltfForest url={MISSION_MODELS.treeBroad} instances={broad} />
      <InstancedGltfForest url={MISSION_MODELS.treePalm} instances={palms} scaleMul={1.05} />
      <InstancedGltfForest url={MISSION_MODELS.shrub} instances={shrubs} scaleMul={0.9} />
    </group>
  );
}

export function MissionGrassField() {
  const { grassCount } = useMissionQuality();
  const blades = useMemo(() => buildGrassInstances(grassCount), [grassCount]);
  const meshA = useRef<THREE.InstancedMesh>(null);
  const meshB = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const grassMap = useMemo(() => createGrassBladeTexture(), []);
  const mat = useMemo(() => {
    const m = createGrassWindMaterial(grassMap);
    m.vertexColors = true;
    return m;
  }, [grassMap]);
  const windMats = useMemo(() => [mat], [mat]);

  useLayoutEffect(() => {
    const bladeColor = new THREE.Color();
    blades.forEach((b, i) => {
      const h = 0.42 * b.scale;
      dummy.position.set(b.x, b.y + h * 0.42, b.z);
      dummy.rotation.set(0, b.rotY, 0);
      dummy.scale.set(0.28 * b.scale, h, 1);
      dummy.updateMatrix();
      meshA.current!.setMatrixAt(i, dummy.matrix);
      dummy.rotation.set(0, b.rotY + Math.PI / 2, 0);
      dummy.updateMatrix();
      meshB.current!.setMatrixAt(i, dummy.matrix);
      bladeColor.setHSL(0.22 + b.phase * 0.02, 0.42, 0.28 + (b.scale % 1) * 0.08);
      meshA.current!.setColorAt(i, bladeColor);
      meshB.current!.setColorAt(i, bladeColor);
    });
    meshA.current!.instanceMatrix.needsUpdate = true;
    meshB.current!.instanceMatrix.needsUpdate = true;
    if (meshA.current!.instanceColor) {
      meshA.current!.instanceColor.needsUpdate = true;
      meshB.current!.instanceColor!.needsUpdate = true;
    }
  }, [blades, dummy]);

  useFrame(({ clock }) => {
    updateWindUniforms(windMats, clock.elapsedTime);
  });

  return (
    <group>
      <instancedMesh
        ref={meshA}
        args={[undefined, undefined, blades.length]}
        material={mat}
        castShadow
      >
        <planeGeometry args={[1, 1, 1, 4]} />
      </instancedMesh>
      <instancedMesh
        ref={meshB}
        args={[undefined, undefined, blades.length]}
        material={mat}
        castShadow
      >
        <planeGeometry args={[1, 1, 1, 4]} />
      </instancedMesh>
    </group>
  );
}

export function GroundCoverDecals() {
  const ferns = useMemo(() => {
    const out: { x: number; z: number; rot: number; s: number }[] = [];
    for (let i = 0; i < 48; i++) {
      const x = (Math.sin(i * 12.7) * 0.5 + 0.5) * 160 - 80;
      const z = (Math.cos(i * 9.3) * 0.5 + 0.5) * 160 - 80;
      out.push({ x, z, rot: i * 0.7, s: 0.6 + (i % 5) * 0.08 });
    }
    return out;
  }, []);

  return (
    <group>
      {ferns.map((f, i) => (
        <mesh
          key={i}
          position={[f.x, heightAt(f.x, f.z) + 0.05, f.z]}
          rotation={[-Math.PI / 2, f.rot, 0]}
          scale={[f.s, f.s, 1]}
        >
          <circleGeometry args={[0.55, 6]} />
          <meshStandardMaterial
            color="#1f4d2a"
            roughness={0.95}
            transparent
            opacity={0.55}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}
