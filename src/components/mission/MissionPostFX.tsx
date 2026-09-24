"use client";

import {
  Bloom,
  BrightnessContrast,
  EffectComposer,
  HueSaturation,
  N8AO,
  Vignette,
} from "@react-three/postprocessing";
import { useMissionQuality } from "./mission-quality";

export function MissionPostFX() {
  const { enableAo } = useMissionQuality();

  return (
    <EffectComposer multisampling={4}>
      {enableAo ? (
        <N8AO
          aoRadius={0.35}
          intensity={1.4}
          quality="low"
          halfRes
          depthAwareUpsampling
        />
      ) : null}
      <Bloom
        luminanceThreshold={0.94}
        luminanceSmoothing={0.45}
        intensity={0.22}
        mipmapBlur
      />
      <HueSaturation hue={0.02} saturation={0.08} />
      <BrightnessContrast brightness={0.02} contrast={0.06} />
      <Vignette offset={0.26} darkness={0.36} eskil={false} />
    </EffectComposer>
  );
}
