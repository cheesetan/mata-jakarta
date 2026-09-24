"use client";

import { INDONESIA_BOUNDS, PILOT_CENTER } from "@/data/scenario";

type Props = {
  viewMode: "nation" | "sector";
  onSelectNation: () => void;
  onSelectSector: () => void;
};

const [west, south, east, north] = [
  INDONESIA_BOUNDS[0][0],
  INDONESIA_BOUNDS[0][1],
  INDONESIA_BOUNDS[1][0],
  INDONESIA_BOUNDS[1][1],
];

/** Static Esri export — avoids a second WebGL map (which blanked the main map). */
const LOCATOR_IMAGE = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=${west},${south},${east},${north}&bboxSR=4326&size=400,240&format=jpg&f=image`;

function pilotDotPercent(): { left: string; top: string } {
  const lng = PILOT_CENTER[0];
  const lat = PILOT_CENTER[1];
  const x = ((lng - west) / (east - west)) * 100;
  const y = ((north - lat) / (north - south)) * 100;
  return { left: `${x}%`, top: `${y}%` };
}

export function IndonesiaLocator({
  viewMode,
  onSelectNation,
  onSelectSector,
}: Props) {
  const dot = pilotDotPercent();

  return (
    <div className="pointer-events-auto absolute bottom-3 left-3 z-10 w-[120px] overflow-hidden rounded-lg border border-white/20 bg-black/70 shadow-lg backdrop-blur-md">
      <button
        type="button"
        onClick={viewMode === "sector" ? onSelectNation : onSelectSector}
        className="group block w-full text-left"
        title={
          viewMode === "sector"
            ? "Show full Indonesia"
            : "Zoom to Kalimantan sector"
        }
      >
        <div className="relative h-[64px] w-full overflow-hidden bg-[#0a1628]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={LOCATOR_IMAGE}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
          <span
            className="locator-pilot-dot absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: dot.left, top: dot.top }}
            aria-hidden
          />
        </div>
        <div className="border-t border-white/10 px-2 py-1">
          <p className="text-[10px] text-emerald-400/90 group-hover:text-emerald-300">
            {viewMode === "sector" ? "Show all Indonesia →" : "Back to sector →"}
          </p>
        </div>
      </button>
    </div>
  );
}
