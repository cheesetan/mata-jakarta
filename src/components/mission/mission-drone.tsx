"use client";

import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { getDroneMissionPosition } from "@/lib/incident-math";
import { usePlayback } from "@/store/playback";
import { MISSION_MODELS } from "./mission-assets";
import { createRotorBlurTexture } from "./mission-graphics";

export function MissionDroneModel() {
  const group = useRef<THREE.Group>(null);
  const gltf = useGLTF(MISSION_MODELS.drone);
  const model = useMemo(() => gltf.scene.clone(true), [gltf.scene]);
  const rotors = useRef<THREE.Object3D[]>([]);
  const prev = useRef(new THREE.Vector3());
  const elapsed = usePlayback((s) => s.elapsed);
  const rotorBlur = useMemo(() => createRotorBlurTexture(), []);

  useLayoutEffect(() => {
    rotors.current = [];
    model.traverse((obj) => {
      if (obj.name === "Prop") rotors.current.push(obj);
      if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
  }, [model]);

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

    const speed = vel.length();
    const spin = delta * (28 + speed * 4);
    for (let i = 0; i < rotors.current.length; i++) {
      const prop = rotors.current[i];
      prop.rotation.set(prop.rotation.x, prop.rotation.y + spin, prop.rotation.z);
      if (prop instanceof THREE.Mesh) {
        const mat = prop.material as THREE.MeshStandardMaterial;
        mat.transparent = true;
        mat.opacity = THREE.MathUtils.clamp(0.25 + speed * 0.08, 0.25, 0.75);
        mat.map = rotorBlur;
      }
    }
  });

  return (
    <group ref={group} scale={0.95}>
      <primitive object={model} />
      <mesh position={[0.42, 0.12, 0.42]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshStandardMaterial color="#ef4444" emissive="#dc2626" emissiveIntensity={1.3} />
      </mesh>
      <mesh position={[-0.42, 0.12, 0.42]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshStandardMaterial color="#22c55e" emissive="#16a34a" emissiveIntensity={0.95} />
      </mesh>
    </group>
  );
}
