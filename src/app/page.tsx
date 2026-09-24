"use client";

import { CommandMap } from "@/components/command/CommandMap";
import { DataDesk } from "@/components/command/DataDesk";
import { SituationPanel } from "@/components/command/SituationPanel";
import { PlaybackControls } from "@/components/PlaybackControls";

export default function CommandPage() {
  return (
    <div className="flex h-dvh flex-col bg-[#070b12] text-white">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-2">
        <p className="text-sm text-white/90">
          <span className="font-semibold text-emerald-400">MATA</span>
          <span className="mx-2 text-white/25">·</span>
          <span>Central Kalimantan</span>
        </p>
        <span className="shrink-0 rounded-full border border-white/15 bg-white/5 px-3 py-0.5 text-[11px] text-white/55">
          Simulated pilot
        </span>
      </header>
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <div className="flex min-w-0 flex-col lg:min-h-0 lg:flex-1">
          <div className="flex h-[55vh] shrink-0 flex-col overflow-hidden lg:h-auto lg:min-h-0 lg:flex-1">
            <CommandMap />
          </div>
          <DataDesk />
        </div>
        <SituationPanel />
      </main>
      <PlaybackControls showMissionLink />
    </div>
  );
}
