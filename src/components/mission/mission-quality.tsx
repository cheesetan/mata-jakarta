"use client";

import { AdaptiveDpr, PerformanceMonitor } from "@react-three/drei";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type MissionQuality = "low" | "high";

type MissionQualityContextValue = {
  quality: MissionQuality;
  setQuality: (q: MissionQuality) => void;
  grassCount: number;
  shadowMapSize: number;
  enableAo: boolean;
  treeLodDistance: number;
};

const MissionQualityContext = createContext<MissionQualityContextValue | null>(
  null,
);

function tier(quality: MissionQuality): Omit<
  MissionQualityContextValue,
  "quality" | "setQuality"
> {
  if (quality === "high") {
    return {
      grassCount: 6_500,
      shadowMapSize: 2048,
      enableAo: true,
      treeLodDistance: 150,
    };
  }
  return {
    grassCount: 900,
    shadowMapSize: 1024,
    enableAo: false,
    treeLodDistance: 95,
  };
}

export function MissionQualityProvider({ children }: { children: ReactNode }) {
  const [quality, setQuality] = useState<MissionQuality>("low");
  const value = useMemo(
    () => ({
      quality,
      setQuality,
      ...tier(quality),
    }),
    [quality],
  );
  return (
    <MissionQualityContext.Provider value={value}>
      {children}
    </MissionQualityContext.Provider>
  );
}

export function useMissionQuality() {
  const ctx = useContext(MissionQualityContext);
  if (!ctx) {
    throw new Error("useMissionQuality must be used within MissionQualityProvider");
  }
  return ctx;
}

export function MissionPerformance({ children }: { children: ReactNode }) {
  const { setQuality } = useMissionQuality();
  const onDecline = useCallback(() => setQuality("low"), [setQuality]);
  const onIncline = useCallback(() => setQuality("high"), [setQuality]);

  return (
    <PerformanceMonitor
      onDecline={onDecline}
      onIncline={onIncline}
      flipflops={4}
      threshold={0.72}
    >
      <AdaptiveDpr pixelated />
      {children}
    </PerformanceMonitor>
  );
}
