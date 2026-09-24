"use client";

import { MissionHud } from "@/components/mission/MissionHud";
import { PlaybackControls } from "@/components/PlaybackControls";
import dynamic from "next/dynamic";

const MissionScene = dynamic(
  () =>
    import("@/components/mission/MissionScene").then((m) => m.MissionScene),
  { ssr: false },
);

export default function MissionPage() {
  return (
    <div className="relative flex h-dvh flex-col bg-[#050810]">
      <div className="relative min-h-0 flex-1">
        <MissionScene />
        <MissionHud />
      </div>
      <PlaybackControls showMissionLink={false} />
    </div>
  );
}
