import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import fs from "fs";

globalThis.FileReader = class FileReader {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = buf;
      this.onloadend?.({});
    });
  }
};
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "../public/mission/models");
fs.mkdirSync(outDir, { recursive: true });

const exporter = new GLTFExporter();

function saveGlb(name, object) {
  return exporter.parseAsync(object, { binary: true }).then((result) => {
    const buf = Buffer.from(result);
    fs.writeFileSync(path.join(outDir, name), buf);
    console.log("wrote", name, buf.length);
  });
}

function makeBroadleaf() {
  const root = new THREE.Group();
  root.name = "TreeBroadleaf";
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.26, 1.4, 8),
    new THREE.MeshStandardMaterial({ color: "#3d2817", roughness: 0.95 }),
  );
  trunk.position.y = 0.7;
  trunk.name = "Trunk";
  const lower = new THREE.Mesh(
    new THREE.ConeGeometry(1.05, 1.35, 8),
    new THREE.MeshStandardMaterial({ color: "#1f5c2e", roughness: 0.88 }),
  );
  lower.position.y = 1.65;
  lower.name = "CanopyLower";
  const upper = new THREE.Mesh(
    new THREE.ConeGeometry(0.82, 1.15, 8),
    new THREE.MeshStandardMaterial({ color: "#2d7a3d", roughness: 0.85 }),
  );
  upper.position.y = 2.35;
  upper.name = "CanopyUpper";
  root.add(trunk, lower, upper);
  return root;
}

function makePalm() {
  const root = new THREE.Group();
  root.name = "TreePalm";
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.22, 2.4, 7),
    new THREE.MeshStandardMaterial({ color: "#57534e", roughness: 0.92 }),
  );
  trunk.position.y = 1.2;
  trunk.name = "Trunk";
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const frond = new THREE.Mesh(
      new THREE.PlaneGeometry(1.8, 0.55),
      new THREE.MeshStandardMaterial({
        color: "#15803d",
        roughness: 0.9,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.95,
      }),
    );
    frond.position.set(Math.cos(a) * 0.35, 2.45, Math.sin(a) * 0.35);
    frond.rotation.set(-0.55, a, 0);
    frond.name = `Frond_${i}`;
    root.add(frond);
  }
  root.add(trunk);
  return root;
}

function makeShrub() {
  const root = new THREE.Group();
  root.name = "Shrub";
  const bush = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.55, 1),
    new THREE.MeshStandardMaterial({ color: "#2f6b3a", roughness: 0.9 }),
  );
  bush.position.y = 0.35;
  bush.name = "Bush";
  root.add(bush);
  return root;
}

function makeDrone() {
  const root = new THREE.Group();
  root.name = "Drone";
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.14, 0.55),
    new THREE.MeshStandardMaterial({ color: "#1e293b", metalness: 0.55, roughness: 0.35 }),
  );
  body.position.y = 0.05;
  body.name = "Body";
  const dome = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.1, 0.32),
    new THREE.MeshStandardMaterial({ color: "#0f172a", metalness: 0.6, roughness: 0.3 }),
  );
  dome.position.y = 0.16;
  dome.name = "Dome";
  const arm = 0.95;
  const positions = [
    [arm, 0.02, arm],
    [-arm, 0.02, arm],
    [arm, 0.02, -arm],
    [-arm, 0.02, -arm],
  ];
  positions.forEach(([x, y, z], i) => {
    const g = new THREE.Group();
    g.name = `Arm_${i}`;
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(arm * 0.92, 0.05, 0.08),
      new THREE.MeshStandardMaterial({ color: "#334155", metalness: 0.45, roughness: 0.4 }),
    );
    beam.rotation.y = Math.atan2(x, z);
    const motor = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.12, 0.14, 8),
      new THREE.MeshStandardMaterial({ color: "#475569", metalness: 0.65, roughness: 0.35 }),
    );
    motor.position.set(x * 0.52, y, z * 0.52);
    const prop = new THREE.Mesh(
      new THREE.CylinderGeometry(0.58, 0.58, 0.02, 16),
      new THREE.MeshStandardMaterial({
        color: "#cbd5e1",
        transparent: true,
        opacity: 0.35,
      }),
    );
    prop.name = "Prop";
    prop.position.set(x, y + 0.1, z);
    prop.rotation.x = Math.PI / 2;
    g.add(beam, motor, prop);
    root.add(g);
  });
  const tank = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.22, 0.3, 20),
    new THREE.MeshPhysicalMaterial({
      color: "#67e8f9",
      transparent: true,
      opacity: 0.82,
      roughness: 0.16,
      metalness: 0.02,
      transmission: 0.35,
      thickness: 0.35,
      emissive: "#0e7490",
      emissiveIntensity: 0.12,
    }),
  );
  tank.position.set(0, -0.2, 0);
  tank.name = "PayloadTank";
  const nozzle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.05, 0.12, 8),
    new THREE.MeshStandardMaterial({ color: "#334155", metalness: 0.55, roughness: 0.4 }),
  );
  nozzle.position.set(0, -0.4, 0);
  nozzle.name = "Nozzle";
  root.add(body, dome, tank, nozzle);
  return root;
}

function makeShelter() {
  const root = new THREE.Group();
  root.name = "Shelter";
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(4.2, 2.2, 2.8),
    new THREE.MeshStandardMaterial({ color: "#0f172a", metalness: 0.4, roughness: 0.5 }),
  );
  base.position.y = 1.1;
  base.name = "Base";
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(4.4, 0.18, 3),
    new THREE.MeshStandardMaterial({
      color: "#0f766e",
      emissive: "#115e59",
      emissiveIntensity: 0.2,
      roughness: 0.6,
    }),
  );
  roof.position.y = 2.25;
  roof.name = "Roof";
  root.add(base, roof);
  return root;
}

async function main() {
  const only = process.argv.slice(2);
  const jobs = [
    ["tree_broad.glb", makeBroadleaf],
    ["tree_palm.glb", makePalm],
    ["shrub.glb", makeShrub],
    ["drone_quad.glb", makeDrone],
    ["shelter.glb", makeShelter],
  ];
  for (const [name, build] of jobs) {
    if (only.length && !only.includes(name)) continue;
    await saveGlb(name, build());
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
