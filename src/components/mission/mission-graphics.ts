import * as THREE from "three";
import { WIND_XZ } from "./terrain";

export const SUN_POSITION = new THREE.Vector3(80, 28, 60);

export function sunDirection(out = new THREE.Vector3()): THREE.Vector3 {
  return out.copy(SUN_POSITION).normalize();
}

export function createTerrainNormalMap(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext("2d")!;
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n =
        Math.sin(x * 0.31 + y * 0.17) * 0.5 +
        Math.sin(x * 0.71 - y * 0.53) * 0.35 +
        Math.sin((x + y) * 0.22) * 0.25;
      const bump = 128 + n * 28;
      const i = (y * size + x) * 4;
      img.data[i] = bump;
      img.data[i + 1] = bump;
      img.data[i + 2] = 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(18, 18);
  return tex;
}

const terrainPatchKey = "__mataTerrainPatched";

export function createTerrainMaterial(
  normalMap: THREE.Texture,
): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.03,
    normalMap,
    normalScale: new THREE.Vector2(0.35, 0.35),
  });
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      float blotch = sin(vViewPosition.x * 0.14 + vViewPosition.z * 0.11) * 0.5 + 0.5;
      blotch *= sin(vViewPosition.x * 0.07 - vViewPosition.z * 0.09 + 2.1) * 0.5 + 0.5;
      diffuseColor.rgb *= 0.94 + blotch * 0.12;
      float slope = 1.0 - abs(dot(normalize(vNormal), vec3(0.0, 1.0, 0.0)));
      diffuseColor.rgb *= 1.0 - slope * 0.18;
      `,
    );
  };
  (mat as THREE.Material & { userData: Record<string, boolean> }).userData[
    terrainPatchKey
  ] = true;
  return mat;
}

export function createWaterMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color("#0c3d4a") },
      uShallow: { value: new THREE.Color("#1a6b7a") },
    },
    vertexShader: `
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      void main() {
        vUv = uv;
        vec3 pos = position;
        pos.y += sin(pos.x * 0.35 + uTime * 1.2) * 0.04;
        pos.y += cos(pos.z * 0.28 - uTime * 0.9) * 0.03;
        vec4 world = modelMatrix * vec4(pos, 1.0);
        vWorldPos = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      void main() {
        float wave = sin(vWorldPos.x * 0.4 + uTime) * 0.5 + 0.5;
        vec3 col = mix(uDeep, uShallow, wave * 0.35 + vUv.y * 0.25);
        float fres = pow(1.0 - abs(dot(normalize(vec3(0.0, 1.0, 0.0)), vec3(0.0, 1.0, 0.0))), 1.0);
        col += vec3(0.15, 0.35, 0.42) * fres * 0.15;
        float spec = pow(sin(vWorldPos.x * 0.8 + uTime * 2.0) * 0.5 + 0.5, 8.0);
        col += vec3(0.7, 0.9, 1.0) * spec * 0.12;
        gl_FragColor = vec4(col, 0.88);
      }
    `,
  });
}

export function createFlameTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 256;
  const g = canvas.getContext("2d")!;
  g.clearRect(0, 0, 128, 256);

  const drawTeardrop = (
    cx: number,
    baseY: number,
    tipY: number,
    halfW: number,
    stops: [number, string][],
  ) => {
    const grad = g.createLinearGradient(cx, baseY, cx, tipY);
    for (const [pos, color] of stops) grad.addColorStop(pos, color);
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(cx, baseY);
    g.bezierCurveTo(cx + halfW * 1.15, baseY - (baseY - tipY) * 0.35, cx + halfW * 0.35, tipY + 18, cx, tipY);
    g.bezierCurveTo(cx - halfW * 0.35, tipY + 18, cx - halfW * 1.15, baseY - (baseY - tipY) * 0.35, cx, baseY);
    g.closePath();
    g.fill();
  };

  drawTeardrop(64, 248, 8, 52, [
    [0, "rgba(40,8,4,0)"],
    [0.12, "rgba(120,25,8,0.75)"],
    [0.38, "rgba(220,70,15,0.92)"],
    [0.62, "rgba(255,150,40,0.88)"],
    [0.82, "rgba(255,230,120,0.55)"],
    [1, "rgba(255,255,255,0)"],
  ]);

  for (let i = 0; i < 24; i++) {
    const cx = 28 + seededCanvas(i) * 72;
    const w = 6 + seededCanvas(i + 11) * 14;
    drawTeardrop(cx, 240 - seededCanvas(i + 5) * 30, 20 + seededCanvas(i + 2) * 40, w, [
      [0, "rgba(60,12,6,0)"],
      [0.2, "rgba(180,50,12,0.35)"],
      [0.55, "rgba(255,110,25,0.45)"],
      [1, "rgba(255,200,80,0)"],
    ]);
  }

  const core = g.createRadialGradient(64, 200, 4, 64, 190, 38);
  core.addColorStop(0, "rgba(255,255,240,0.85)");
  core.addColorStop(0.45, "rgba(255,200,80,0.35)");
  core.addColorStop(1, "rgba(255,120,20,0)");
  g.fillStyle = core;
  g.fillRect(36, 150, 56, 90);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function seededCanvas(seed: number): number {
  const x = Math.sin(seed * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

export function createSmokeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  grad.addColorStop(0, "rgba(40,40,40,0.55)");
  grad.addColorStop(0.5, "rgba(30,28,26,0.25)");
  grad.addColorStop(1, "rgba(20,18,16,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

export function createScorchTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 8, 64, 64, 64);
  grad.addColorStop(0, "#0a0604");
  grad.addColorStop(0.45, "#1a1008");
  grad.addColorStop(0.75, "#24160f");
  grad.addColorStop(1, "rgba(36,22,15,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

export function createRotorBlurTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext("2d")!;
  const cx = 64;
  const cy = 64;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    g.strokeStyle = `rgba(180,190,200,${0.04 + (i % 3) * 0.02})`;
    g.lineWidth = 2 + (i % 2);
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(a) * 58, cy + Math.sin(a) * 58);
    g.stroke();
  }
  g.fillStyle = "rgba(100,110,120,0.35)";
  g.beginPath();
  g.arc(cx, cy, 10, 0, Math.PI * 2);
  g.fill();
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

export function createPalmFrondTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext("2d")!;
  g.clearRect(0, 0, 128, 128);
  g.strokeStyle = "#166534";
  g.lineWidth = 3;
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i - 3) * 0.22;
    g.beginPath();
    g.moveTo(64, 64);
    g.quadraticCurveTo(
      64 + Math.cos(a - 0.2) * 40,
      64 + Math.sin(a - 0.2) * 40,
      64 + Math.cos(a) * 56,
      64 + Math.sin(a) * 56,
    );
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createGrassBladeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 64;
  const g = canvas.getContext("2d")!;
  const grad = g.createLinearGradient(0, 64, 0, 0);
  grad.addColorStop(0, "#1a3320");
  grad.addColorStop(0.5, "#2d5a32");
  grad.addColorStop(1, "#4ade80");
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(16, 64);
  g.quadraticCurveTo(22, 32, 16, 0);
  g.quadraticCurveTo(10, 32, 16, 64);
  g.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createBillboardMaterial(
  map: THREE.Texture,
  opts?: { emissive?: boolean; depthWrite?: boolean },
): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    map,
    transparent: true,
    depthWrite: opts?.depthWrite ?? false,
    blending: opts?.emissive ? THREE.AdditiveBlending : THREE.NormalBlending,
    side: THREE.DoubleSide,
  });
}

export function applyInstanceWind(material: THREE.MeshStandardMaterial) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uWindX = { value: WIND_XZ.x };
    shader.uniforms.uWindZ = { value: WIND_XZ.z };
    material.userData.windUniforms = shader.uniforms;

    shader.vertexShader =
      `uniform float uTime;
uniform float uWindX;
uniform float uWindZ;
` + shader.vertexShader;

    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      float phase = transformed.x * 0.07 + transformed.z * 0.05;
      float sway = sin(uTime * 1.15 + phase) * 0.11;
      transformed.x += sway * uWindX;
      transformed.z += sway * uWindZ * 0.55;
      `,
    );
  };
}

export function updateWindUniforms(
  materials: THREE.MeshStandardMaterial[],
  time: number,
) {
  for (const m of materials) {
    const u = m.userData.windUniforms as { uTime?: { value: number } } | undefined;
    if (u?.uTime) u.uTime.value = time;
  }
}

export function taperTubeInPlace(
  geom: THREE.TubeGeometry,
  curve: THREE.Curve<THREE.Vector3>,
  tubularSegments: number,
  baseRadius: number,
  taper: (u: number) => number,
) {
  const radial = geom.parameters.radialSegments;
  const ring = radial + 1;
  const pos = geom.attributes.position;
  const frames = curve.computeFrenetFrames(tubularSegments, false);
  for (let i = 0; i <= tubularSegments; i++) {
    const u = i / tubularSegments;
    const center = curve.getPointAt(u);
    const r = taper(u);
    const N = frames.normals[i];
    const B = frames.binormals[i];
    for (let j = 0; j <= radial; j++) {
      const v = (j / radial) * Math.PI * 2;
      const cx = Math.cos(v) * r;
      const cy = Math.sin(v) * r;
      const idx = i * ring + j;
      pos.setXYZ(
        idx,
        center.x + cx * N.x + cy * B.x,
        center.y + cx * N.y + cy * B.y,
        center.z + cx * N.z + cy * B.z,
      );
    }
  }
  pos.needsUpdate = true;
  geom.computeVertexNormals();
}
