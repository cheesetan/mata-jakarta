import { useGLTF } from "@react-three/drei";
import { useLayoutEffect } from "react";
import * as THREE from "three";

export const MISSION_HDRI = "/mission/hdri/kloppenheim_06_puresky_1k.hdr";

export const MISSION_TEXTURES = {
  moss: {
    map: "/mission/textures/moss_diff.jpg",
    normalMap: "/mission/textures/moss_nor_gl.jpg",
    roughnessMap: "/mission/textures/moss_rough.jpg",
  },
  mud: {
    map: "/mission/textures/mud_diff.jpg",
    normalMap: "/mission/textures/mud_nor_gl.jpg",
    roughnessMap: "/mission/textures/mud_rough.jpg",
  },
  grass: {
    map: "/mission/textures/grass_diff.jpg",
    normalMap: "/mission/textures/grass_nor_gl.jpg",
    roughnessMap: "/mission/textures/grass_rough.jpg",
  },
  scorch: {
    map: "/mission/textures/scorch_diff.jpg",
    normalMap: "/mission/textures/scorch_nor_gl.jpg",
    roughnessMap: "/mission/textures/scorch_rough.jpg",
  },
} as const;

export const MISSION_MODELS = {
  treeBroad: "/mission/models/tree_broad.glb",
  treePalm: "/mission/models/tree_palm.glb",
  shrub: "/mission/models/shrub.glb",
  drone: "/mission/models/drone_quad.glb",
  shelter: "/mission/models/shelter.glb",
} as const;

export function preloadMissionAssets() {
  useGLTF.preload(MISSION_MODELS.treeBroad);
  useGLTF.preload(MISSION_MODELS.treePalm);
  useGLTF.preload(MISSION_MODELS.shrub);
  useGLTF.preload(MISSION_MODELS.drone);
  useGLTF.preload(MISSION_MODELS.shelter);
}

export function configureMissionColorSpace(textures: THREE.Texture[]) {
  for (const tex of textures) {
    if (!tex) continue;
    if (tex.name?.includes("nor") || tex.name?.includes("rough")) {
      tex.colorSpace = THREE.NoColorSpace;
    } else {
      tex.colorSpace = THREE.SRGBColorSpace;
    }
  }
}

export type MissionTerrainTextureSet = {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
};

export function configureTerrainTextureSet(set: MissionTerrainTextureSet) {
  set.map.colorSpace = THREE.SRGBColorSpace;
  set.normalMap.colorSpace = THREE.NoColorSpace;
  set.roughnessMap.colorSpace = THREE.NoColorSpace;
}

/** Apply sRGB to color maps after useTexture load. */
export function useMissionTextureColorSpace(maps: THREE.Texture[]) {
  useLayoutEffect(() => {
    configureMissionColorSpace(maps);
  }, [maps]);
}
