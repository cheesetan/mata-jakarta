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

export type TerrainTextureSet = {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
};

function prepTerrainTex(tex: THREE.Texture, repeat = 8) {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
}

export function createSplatTerrainMaterial(sets: {
  moss: TerrainTextureSet;
  mud: TerrainTextureSet;
  grass: TerrainTextureSet;
  scorch: TerrainTextureSet;
}): THREE.MeshStandardMaterial {
  for (const s of Object.values(sets)) {
    prepTerrainTex(s.map, 8);
    prepTerrainTex(s.normalMap, 8);
    prepTerrainTex(s.roughnessMap, 8);
  }

  const mat = new THREE.MeshStandardMaterial({
    map: sets.moss.map,
    vertexColors: false,
    roughness: 1,
    metalness: 0.02,
  });
  mat.customProgramCacheKey = () => "mission-splat-terrain-v4";

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uMossMap = { value: sets.moss.map };
    shader.uniforms.uMudMap = { value: sets.mud.map };
    shader.uniforms.uGrassMap = { value: sets.grass.map };
    shader.uniforms.uScorchMap = { value: sets.scorch.map };
    shader.uniforms.uMossNorm = { value: sets.moss.normalMap };
    shader.uniforms.uMudNorm = { value: sets.mud.normalMap };
    shader.uniforms.uGrassNorm = { value: sets.grass.normalMap };
    shader.uniforms.uScorchNorm = { value: sets.scorch.normalMap };
    shader.uniforms.uMossRough = { value: sets.moss.roughnessMap };
    shader.uniforms.uMudRough = { value: sets.mud.roughnessMap };
    shader.uniforms.uGrassRough = { value: sets.grass.roughnessMap };
    shader.uniforms.uScorchRough = { value: sets.scorch.roughnessMap };

    shader.vertexShader =
      `
attribute vec4 splat;
attribute float terrainAo;
varying vec4 vSplat;
varying vec3 vSplatWorldPos;
varying float vTerrainAo;
` + shader.vertexShader;

    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      vSplat = splat;
      vTerrainAo = terrainAo;
      vSplatWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
    );

    shader.fragmentShader =
      `
uniform sampler2D uMossMap;
uniform sampler2D uMudMap;
uniform sampler2D uGrassMap;
uniform sampler2D uScorchMap;
uniform sampler2D uMossNorm;
uniform sampler2D uMudNorm;
uniform sampler2D uGrassNorm;
uniform sampler2D uScorchNorm;
uniform sampler2D uMossRough;
uniform sampler2D uMudRough;
uniform sampler2D uGrassRough;
uniform sampler2D uScorchRough;
varying vec4 vSplat;
varying vec3 vSplatWorldPos;
varying float vTerrainAo;

vec4 splatWeights() {
  float wSum = vSplat.x + vSplat.y + vSplat.z + vSplat.w + 1e-5;
  return vSplat / wSum;
}

vec3 linearAlbedo(sampler2D tex, vec2 uv) {
  return sRGBTransferEOTF( texture2D( tex, uv ) ).rgb;
}

vec3 sampleAlbedo(vec2 uvMoss, vec2 uvMud, vec2 uvGrass, vec2 uvScorch, vec4 w) {
  return
    linearAlbedo(uMossMap, uvMoss) * w.x +
    linearAlbedo(uMudMap, uvMud) * w.y +
    linearAlbedo(uGrassMap, uvGrass) * w.z +
    linearAlbedo(uScorchMap, uvScorch) * w.w;
}

vec3 sampleNormalTS(vec2 uvMoss, vec2 uvMud, vec2 uvGrass, vec2 uvScorch, vec4 w) {
  vec3 n =
    (texture2D(uMossNorm, uvMoss).xyz * 2.0 - 1.0) * w.x +
    (texture2D(uMudNorm, uvMud).xyz * 2.0 - 1.0) * w.y +
    (texture2D(uGrassNorm, uvGrass).xyz * 2.0 - 1.0) * w.z +
    (texture2D(uScorchNorm, uvScorch).xyz * 2.0 - 1.0) * w.w;
  return normalize(n);
}

float sampleRough(vec2 uvMoss, vec2 uvMud, vec2 uvGrass, vec2 uvScorch, vec4 w) {
  return
    texture2D(uMossRough, uvMoss).r * w.x +
    texture2D(uMudRough, uvMud).r * w.y +
    texture2D(uGrassRough, uvGrass).r * w.z +
    texture2D(uScorchRough, uvScorch).r * w.w;
}
` + shader.fragmentShader;

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      vec4 w = splatWeights();
      vec2 xz = vSplatWorldPos.xz;
      vec2 uvMoss = xz * 0.095 + vec2(0.11, 0.07);
      vec2 uvMud = xz * 0.102 + vec2(-0.08, 0.14);
      vec2 uvGrass = xz * 0.088 + vec2(0.05, -0.09);
      vec2 uvScorch = xz * 0.11 + vec2(-0.12, -0.06);
      vec3 albedo = sampleAlbedo(uvMoss, uvMud, uvGrass, uvScorch, w);
      diffuseColor.rgb = albedo * mix(1.0, vTerrainAo, 0.55);
      float slope = 1.0 - abs(dot(normalize(vNormal), vec3(0.0, 1.0, 0.0)));
      diffuseColor.rgb *= 1.0 - slope * 0.11;
      `,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <roughnessmap_fragment>",
      `#include <roughnessmap_fragment>
      {
        vec4 w = splatWeights();
        vec2 xz = vSplatWorldPos.xz;
        vec2 uvMoss = xz * 0.095 + vec2(0.11, 0.07);
        vec2 uvMud = xz * 0.102 + vec2(-0.08, 0.14);
        vec2 uvGrass = xz * 0.088 + vec2(0.05, -0.09);
        vec2 uvScorch = xz * 0.11 + vec2(-0.12, -0.06);
        roughnessFactor = clamp(
          sampleRough(uvMoss, uvMud, uvGrass, uvScorch, w),
          0.52,
          1.0
        );
      }
      `,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#ifdef USE_MAP
      vec4 sampledDiffuseColor = texture2D( map, vMapUv );
      sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
      #endif`,
    );
  };

  return mat;
}

/** @deprecated Use createSplatTerrainMaterial */
export function createTerrainMaterial(
  normalMap: THREE.Texture,
): THREE.MeshStandardMaterial {
  prepTerrainTex(normalMap, 18);
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.03,
    normalMap,
    normalScale: new THREE.Vector2(0.35, 0.35),
  });
  return mat;
}

function createWaterNormalTexture(seed = 0): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext("2d")!;
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n =
        Math.sin((x + seed) * 0.21 + y * 0.17) * 0.5 +
        Math.sin(x * 0.43 - (y + seed) * 0.31) * 0.35;
      const r = 128 + n * 55;
      const gch = 128 + Math.cos(x * 0.19 + y * 0.23 + seed) * 55;
      const i = (y * size + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = gch;
      img.data[i + 2] = 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2.5, 2.5);
  return tex;
}

export function createWaterMaterial(): THREE.ShaderMaterial {
  const normalA = createWaterNormalTexture(0);
  const normalB = createWaterNormalTexture(3.7);
  const sun = sunDirection();

  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color("#0b4fd4") },
      uShallow: { value: new THREE.Color("#5ec8ff") },
      uNormalA: { value: normalA },
      uNormalB: { value: normalB },
      uSunDir: { value: sun.clone() },
      uCameraPos: { value: new THREE.Vector3() },
    },
    vertexShader: `
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vViewDir;
      void main() {
        vUv = uv;
        vec3 pos = position;
        pos.y += sin(pos.x * 0.35 + uTime * 1.2) * 0.045;
        pos.y += cos(pos.z * 0.28 - uTime * 0.9) * 0.035;
        vec4 world = modelMatrix * vec4(pos, 1.0);
        vWorldPos = world.xyz;
        vViewDir = normalize(cameraPosition - world.xyz);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform sampler2D uNormalA;
      uniform sampler2D uNormalB;
      uniform vec3 uSunDir;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vViewDir;
      void main() {
        vec2 uv1 = vWorldPos.xz * 0.08 + vec2(uTime * 0.03, uTime * 0.02);
        vec2 uv2 = vWorldPos.xz * 0.11 - vec2(uTime * 0.02, uTime * 0.025);
        vec3 nA = texture2D(uNormalA, uv1).xyz * 2.0 - 1.0;
        vec3 nB = texture2D(uNormalB, uv2).xyz * 2.0 - 1.0;
        vec3 n = normalize(vec3(nA.x + nB.x, 1.6, nA.y + nB.y));
        float wave = sin(vWorldPos.x * 0.4 + uTime) * 0.5 + 0.5;
        vec3 col = mix(uDeep, uShallow, 0.42 + wave * 0.4 + vUv.y * 0.18);
        float fres = pow(1.0 - max(dot(n, normalize(vViewDir)), 0.0), 2.4);
        col = mix(col, vec3(0.55, 0.82, 1.0), fres * 0.32);
        vec3 h = normalize(uSunDir);
        float spec = pow(max(dot(reflect(-normalize(vViewDir), n), h), 0.0), 96.0);
        col += vec3(0.75, 0.9, 1.0) * spec * 0.28;
        float foam = smoothstep(0.72, 0.95, sin(vWorldPos.x * 1.2 + uTime * 2.0) * 0.5 + 0.5);
        col = mix(col, vec3(0.72, 0.9, 1.0), foam * 0.12 * (1.0 - vUv.y));
        gl_FragColor = vec4(col, 0.97);
      }
    `,
  });
}

export function patchHeightFog(material: THREE.ShaderMaterial) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFogHeight = { value: 18 };
    shader.uniforms.uFogDensity = { value: 0.0018 };
    shader.fragmentShader =
      `
uniform float uFogHeight;
uniform float uFogDensity;
` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <fog_fragment>",
      `#include <fog_fragment>
      float hFactor = exp(-max(vWorldPosition.y, 0.0) / uFogHeight);
      gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor * (0.55 + hFactor * 0.45));
      `,
    );
  };
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
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext("2d")!;
  g.clearRect(0, 0, 128, 128);
  for (let i = 0; i < 5; i++) {
    const cx = 40 + seededCanvas(i * 3) * 48;
    const cy = 36 + seededCanvas(i * 5) * 52;
    const r = 18 + seededCanvas(i * 7) * 28;
    const grad = g.createRadialGradient(cx, cy, 2, cx, cy, r);
    grad.addColorStop(0, "rgba(55,52,48,0.62)");
    grad.addColorStop(0.45, "rgba(35,32,28,0.28)");
    grad.addColorStop(1, "rgba(18,16,14,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createFlameFlipbookTexture(frames = 8): THREE.CanvasTexture {
  const fw = 128;
  const fh = 256;
  const canvas = document.createElement("canvas");
  canvas.width = fw * frames;
  canvas.height = fh;
  const g = canvas.getContext("2d")!;
  for (let f = 0; f < frames; f++) {
    const ox = f * fw;
    g.clearRect(ox, 0, fw, fh);
    const wobble = seededCanvas(f * 9) * 10 - 5;
    drawFlameFrame(g, ox + 64 + wobble * 0.3, fh - 8, 8 + f * 0.4, 52 + wobble);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.repeat.set(1 / frames, 1);
  tex.userData.frames = frames;
  return tex;
}

function drawFlameFrame(
  g: CanvasRenderingContext2D,
  cx: number,
  baseY: number,
  tipY: number,
  halfW: number,
) {
  const grad = g.createLinearGradient(cx, baseY, cx, tipY);
  grad.addColorStop(0, "rgba(40,8,4,0)");
  grad.addColorStop(0.14, "rgba(120,25,8,0.82)");
  grad.addColorStop(0.42, "rgba(230,75,18,0.95)");
  grad.addColorStop(0.68, "rgba(255,155,45,0.88)");
  grad.addColorStop(0.88, "rgba(255,235,130,0.45)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(cx, baseY);
  g.bezierCurveTo(
    cx + halfW * 1.1,
    baseY - (baseY - tipY) * 0.35,
    cx + halfW * 0.32,
    tipY + 16,
    cx,
    tipY,
  );
  g.bezierCurveTo(
    cx - halfW * 0.32,
    tipY + 16,
    cx - halfW * 1.1,
    baseY - (baseY - tipY) * 0.35,
    cx,
    baseY,
  );
  g.closePath();
  g.fill();
}

export function createLitSmokeMaterial(map: THREE.Texture): THREE.ShaderMaterial {
  const sun = sunDirection();
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uMap: { value: map },
      uSunDir: { value: sun.clone() },
      uOpacity: { value: 0.55 },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormalW;
      void main() {
        vUv = uv;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vNormalW = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: `
      uniform sampler2D uMap;
      uniform vec3 uSunDir;
      uniform float uOpacity;
      varying vec2 vUv;
      varying vec3 vNormalW;
      void main() {
        vec4 tex = texture2D(uMap, vUv);
        float rim = pow(1.0 - abs(dot(normalize(vNormalW), normalize(uSunDir))), 2.0);
        vec3 col = mix(vec3(0.12, 0.11, 0.1), vec3(0.45, 0.42, 0.38), rim * 0.65);
        gl_FragColor = vec4(col, tex.a * uOpacity);
      }
    `,
  });
}

export function createGrassWindMaterial(map: THREE.Texture): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    map,
    alphaMap: map,
    alphaTest: 0.42,
    transparent: false,
    roughness: 1,
    side: THREE.DoubleSide,
  });
  applyInstanceWind(mat);
  return mat;
}

export function createScorchTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const g = canvas.getContext("2d")!;
  const grad = g.createRadialGradient(128, 128, 12, 128, 128, 128);
  grad.addColorStop(0, "#050302");
  grad.addColorStop(0.35, "#120a06");
  grad.addColorStop(0.62, "#24160f");
  grad.addColorStop(0.85, "#2a1a12");
  grad.addColorStop(1, "rgba(36,22,15,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 120; i++) {
    const x = seededCanvas(i) * 256;
    const y = seededCanvas(i + 40) * 256;
    const r = 1 + seededCanvas(i + 80) * 2.5;
    g.fillStyle = `rgba(255,${80 + seededCanvas(i) * 60},20,${0.08 + seededCanvas(i + 2) * 0.12})`;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
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
  grad.addColorStop(0, "#243318");
  grad.addColorStop(0.45, "#3d4a28");
  grad.addColorStop(0.78, "#5c4a28");
  grad.addColorStop(1, "#6b5a32");
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
