"use client";

import { CommandMap } from "@/components/command/CommandMap";
import { OpsColumn } from "@/components/command/OpsColumn";
import { MetricsStrip } from "@/components/command/MetricsStrip";
import { PlaybackControls } from "@/components/PlaybackControls";
import { LEVEL_LABELS } from "@/data/scenario";
import { getCurrentLevel } from "@/lib/incident-math";
import { usePlayback } from "@/store/playback";

export default function CommandPage() {
  const elapsed = usePlayback((s) => s.elapsed);
  const level = getCurrentLevel(elapsed);

  return (
    <div className="flex h-dvh flex-col bg-[#070b12] text-white">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-2.5">
        <p className="text-sm text-white/90">
          <span className="font-semibold text-emerald-400">MATA</span>
          <span className="mx-2 text-white/25">·</span>
          <span>Central Kalimantan</span>
          <span className="mx-2 text-white/25">·</span>
          <span className="font-mono text-amber-200/95">
            L{level} {LEVEL_LABELS[level]}
          </span>
        </p>
        <span className="shrink-0 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] text-white/55">
          Simulated pilot
        </span>
      </header>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="order-1 min-h-0 max-h-[40vh] w-full lg:max-h-none lg:w-[280px] lg:shrink-0">
          <OpsColumn />
        </div>
        <div className="relative order-2 flex min-h-[50vh] flex-1 flex-col overflow-hidden lg:min-h-0">
          <CommandMap />
        </div>
      </div>
      <div className="shrink-0 border-t border-white/10 bg-black/40 px-4 py-2.5 backdrop-blur-md">
        <MetricsStrip />
      </div>
      <PlaybackControls showMissionLink />
    </div>
  );
}
