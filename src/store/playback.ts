"use client";

import { INCIDENT_DURATION_SEC, LEVEL_TIMES } from "@/data/scenario";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type PlaybackState = {
  elapsed: number;
  playing: boolean;
  play: () => void;
  pause: () => void;
  reset: () => void;
  setElapsed: (t: number) => void;
  jumpToLevel: (level: 1 | 2 | 3 | 4 | 5) => void;
  tick: (dt: number) => void;
};

export const usePlayback = create<PlaybackState>()(
  persist(
    (set, get) => ({
      elapsed: 0,
      playing: false,
      play: () => set({ playing: true }),
      pause: () => set({ playing: false }),
      reset: () => set({ elapsed: 0, playing: false }),
      setElapsed: (t) =>
        set({
          elapsed: Math.max(0, Math.min(INCIDENT_DURATION_SEC, t)),
        }),
      jumpToLevel: (level) => {
        const time = LEVEL_TIMES[level];
        set({ elapsed: time });
      },
      tick: (dt) => {
        const { elapsed, playing } = get();
        if (!playing) return;
        const next = elapsed + dt;
        if (next >= INCIDENT_DURATION_SEC) {
          set({ elapsed: INCIDENT_DURATION_SEC, playing: false });
          return;
        }
        set({ elapsed: next });
      },
    }),
    {
      name: "mata-playback",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        elapsed: state.elapsed,
        playing: state.playing,
      }),
    },
  ),
);
