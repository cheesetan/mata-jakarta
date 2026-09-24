"use client";

import { INCIDENT_DURATION_SEC, LEVEL_LABELS } from "@/data/scenario";
import { getCurrentLevel } from "@/lib/incident-math";
import { usePlayback } from "@/store/playback";
import Link from "next/link";

type Props = {
  showMissionLink?: boolean;
};

export function PlaybackControls({ showMissionLink = true }: Props) {
  const elapsed = usePlayback((s) => s.elapsed);
  const playing = usePlayback((s) => s.playing);
  const play = usePlayback((s) => s.play);
  const pause = usePlayback((s) => s.pause);
  const reset = usePlayback((s) => s.reset);
  const setElapsed = usePlayback((s) => s.setElapsed);
  const jumpToLevel = usePlayback((s) => s.jumpToLevel);

  const level = getCurrentLevel(elapsed);

  return (
    <div className="flex flex-col gap-3 border-t border-white/10 bg-black/40 px-4 py-3 backdrop-blur-md">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            if (playing) {
              pause();
              return;
            }
            if (elapsed >= INCIDENT_DURATION_SEC) reset();
            play();
          }}
          className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-black hover:bg-emerald-400"
        >
          {playing ? "Pause" : elapsed >= INCIDENT_DURATION_SEC ? "Replay" : "Play incident"}
        </button>
        <button
          type="button"
          onClick={() => {
            reset();
          }}
          className="rounded-md border border-white/20 px-3 py-2 text-sm text-white/80 hover:bg-white/5"
        >
          Reset
        </button>
        {showMissionLink && (
          <Link
            href="/mission"
            className="ml-auto rounded-md border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-sm font-medium text-cyan-200 hover:bg-cyan-500/20"
          >
            3D mission view
          </Link>
        )}
        {!showMissionLink && (
          <Link
            href="/"
            className="ml-auto rounded-md border border-white/20 px-3 py-2 text-sm text-white/80 hover:bg-white/5"
          >
            Command map
          </Link>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className="w-14 font-mono text-xs text-white/50">
          {elapsed.toFixed(0)}s
        </span>
        <input
          type="range"
          min={0}
          max={INCIDENT_DURATION_SEC}
          step={0.5}
          value={elapsed}
          onChange={(e) => setElapsed(Number(e.target.value))}
          className="h-1 flex-1 accent-emerald-500"
        />
        <span className="font-mono text-xs text-white/50">
          L{level} · {LEVEL_LABELS[level]}
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {([1, 2, 3, 4, 5] as const).map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => jumpToLevel(l)}
            className={`rounded px-2 py-1 text-xs ${
              level === l
                ? "bg-amber-500/30 text-amber-100"
                : "bg-white/5 text-white/60 hover:bg-white/10"
            }`}
          >
            L{l}
          </button>
        ))}
      </div>
    </div>
  );
}
