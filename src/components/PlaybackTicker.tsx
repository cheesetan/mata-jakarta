"use client";

import { usePlayback } from "@/store/playback";
import { useEffect } from "react";

/** Advances the shared incident clock while playing */
export function PlaybackTicker() {
  const tick = usePlayback((s) => s.tick);
  const playing = usePlayback((s) => s.playing);

  useEffect(() => {
    if (!playing) return;
    let frame: number;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      tick(dt);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [playing, tick]);

  return null;
}
