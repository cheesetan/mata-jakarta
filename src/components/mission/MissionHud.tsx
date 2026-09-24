"use client";

import { LEVEL_LABELS, briefing } from "@/data/scenario";
import {
  getCurrentLevel,
  getPayloadRemaining,
  getThermalReading,
  spotFireContained,
} from "@/lib/incident-math";
import { usePlayback } from "@/store/playback";

function ThermalFeed() {
  const elapsed = usePlayback((s) => s.elapsed);
  const reading = getThermalReading(elapsed);
  const hotspot = 28 + (1 - reading.suppression) * 62;
  const core =
    reading.suppression > 0.75
      ? "#fb923c"
      : reading.suppression > 0.35
        ? "#fde047"
        : "#fff7ed";

  return (
    <div className="w-[210px] overflow-hidden rounded-lg border border-orange-400/40 bg-black/75 font-mono backdrop-blur-md">
      <div className="flex items-center justify-between px-2.5 py-1.5">
        <p className="text-[10px] uppercase tracking-wide text-orange-200/80">
          MATA-07 · Thermal
        </p>
        <p
          className={`text-[10px] ${
            reading.status === "CONTAINED"
              ? "text-emerald-300"
              : reading.status === "COOLING"
                ? "text-amber-200"
                : reading.status === "HOT"
                  ? "text-orange-300"
                  : "text-white/40"
          }`}
        >
          {reading.status}
        </p>
      </div>
      <div className="relative mx-2 h-[112px] overflow-hidden rounded border border-orange-500/20 bg-[#1a0a06]">
        <div
          className="absolute inset-0"
          style={{
            background: reading.live
              ? "radial-gradient(circle at 50% 58%, rgba(80,20,8,0.2), #140804 70%)"
              : "repeating-linear-gradient(0deg, #120806 0px, #120806 2px, #1a0c08 3px)",
          }}
        />
        {reading.live && (
          <div
            className="absolute rounded-full"
            style={{
              left: "50%",
              top: "56%",
              width: `${hotspot}%`,
              height: `${hotspot * 0.82}%`,
              transform: "translate(-50%, -50%)",
              background: `radial-gradient(circle, ${core} 0%, #ff7a18 26%, #e11d48 52%, rgba(80,10,10,0.2) 74%, transparent 78%)`,
              filter: "blur(0.6px)",
            }}
          />
        )}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-0 h-full w-px bg-orange-100/25" />
          <div className="absolute top-1/2 left-0 h-px w-full bg-orange-100/25" />
        </div>
        <div className="absolute top-1 right-1 flex h-[92px] w-2 flex-col overflow-hidden rounded-sm">
          <div className="flex-1 bg-white" />
          <div className="flex-1 bg-yellow-300" />
          <div className="flex-1 bg-orange-500" />
          <div className="flex-1 bg-red-600" />
          <div className="flex-1 bg-purple-900" />
        </div>
        <p className="absolute bottom-1 left-1.5 text-[10px] text-orange-50">
          {reading.live ? `${reading.peakC}°C` : "NO LOCK"}
        </p>
      </div>
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 px-2.5 py-1.5 text-[10px]">
        <span className="text-white/40">PEAK</span>
        <span className="text-orange-100">
          {reading.live ? `${reading.peakC}°C` : "—"}
        </span>
        <span className="text-white/40">AREA</span>
        <span className="text-orange-100">
          {reading.live ? `${reading.areaHa.toFixed(2)} ha` : "—"}
        </span>
        <span className="text-white/40">BAND</span>
        <span className="text-orange-100">8–14 µm</span>
      </div>
    </div>
  );
}

export function MissionHud() {
  const elapsed = usePlayback((s) => s.elapsed);
  const level = getCurrentLevel(elapsed);
  const payload = getPayloadRemaining(elapsed);
  const contained = spotFireContained(elapsed);

  let decision = "Standby at base";
  if (level >= 3 && level < 4) decision = "Orbit · thermal verify";
  if (level >= 4 && !contained) decision = "Suppress fire (in capacity)";
  if (level >= 5) decision = "Returning to base";
  else if (contained) decision = "Fire contained · hold on station";

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="rounded-lg border border-cyan-500/30 bg-black/70 px-4 py-2 backdrop-blur-md">
            <p className="text-[10px] uppercase tracking-wide text-cyan-300/70">
              MATA-07 · Mission HUD
            </p>
            <p className="font-mono text-lg text-white">
              L{level} · {LEVEL_LABELS[level]}
            </p>
          </div>
          <div className="flex items-start gap-2">
            <ThermalFeed />
            <div className="rounded-lg border border-white/10 bg-black/70 px-4 py-2 font-mono text-sm backdrop-blur-md">
              <p className="text-white/50">Payload</p>
              <p className="text-xl text-emerald-300">{payload.toFixed(0)}%</p>
              <p className="text-xs text-white/40">{briefing.payloadLiters} L max</p>
            </div>
          </div>
        </div>
        <div
          className={`max-w-md rounded-lg border px-4 py-2 text-sm backdrop-blur-md ${
            contained
              ? "border-emerald-500/40 bg-emerald-950/70 text-emerald-100"
              : "border-amber-500/30 bg-black/70 text-amber-100"
          }`}
        >
          <span className="text-[10px] uppercase tracking-wide opacity-70">
            Decision
          </span>
          <p className="font-medium">{decision}</p>
        </div>
      </div>
      <p className="w-fit rounded-md border border-white/10 bg-black/60 px-3 py-1.5 font-mono text-[11px] text-white/70 backdrop-blur-md">
        WASD move · Q/E turn · Space up · Shift down · Ctrl faster
      </p>
    </div>
  );
}
