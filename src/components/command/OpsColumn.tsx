"use client";

import { WIND, briefing, fireFronts } from "@/data/scenario";
import {
  formatLngLatShort,
  getCurrentLevel,
  getFireSuppression,
  getFleetState,
  getSensorDisplayState,
  spotFireContained,
  type FleetDroneStatus,
} from "@/lib/incident-math";
import { usePlayback } from "@/store/playback";

export function OpsColumn() {
  return (
    <aside className="flex h-full min-h-0 w-full flex-col gap-3 overflow-y-auto border-r border-white/10 bg-[#0a0e16]/95 p-3 backdrop-blur-md lg:w-[280px] lg:shrink-0">
      <header className="border-b border-white/10 pb-2">
        <p className="text-[10px] uppercase tracking-widest text-cyan-400/80">
          Field ops
        </p>
        <h2 className="text-sm font-semibold text-white">Live telemetry</h2>
      </header>
      <SensorBoard />
      <FireConfirmation />
      <FleetBoard />
    </aside>
  );
}

function SensorBoard() {
  const elapsed = usePlayback((s) => s.elapsed);
  const rows = getSensorDisplayState(elapsed);

  return (
    <section className="space-y-2">
      <p className="text-[10px] uppercase tracking-wide text-white/45">Sensors</p>
      <ul className="space-y-1.5">
        {rows.map((s) => (
          <li
            key={s.id}
            className={`rounded-md border px-2.5 py-2 text-xs ${
              s.anomalyActive
                ? "border-orange-500/40 bg-orange-950/35"
                : "border-white/10 bg-white/[0.03]"
            }`}
          >
            <p className="font-medium text-white/90">{s.name}</p>
            <div className="mt-1 grid grid-cols-2 gap-x-2 font-mono text-[11px] text-white/70">
              <span>Heat {s.heatC.toFixed(1)}°C</span>
              <span>Dryness {s.drynessIndex}</span>
            </div>
            <p
              className={`mt-1 text-[10px] ${
                s.anomalyActive ? "text-orange-200/90" : "text-white/45"
              }`}
            >
              {s.statusLabel}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function FireConfirmation() {
  const elapsed = usePlayback((s) => s.elapsed);
  const level = getCurrentLevel(elapsed);
  const contained = spotFireContained(elapsed);
  const suppression = getFireSuppression(elapsed);
  const fire = fireFronts[0];

  return (
    <section className="space-y-2">
      <p className="text-[10px] uppercase tracking-wide text-white/45">
        Fire confirmation
      </p>
      <div className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-2 text-xs">
        {level < 2 && (
          <>
            <p className="font-medium text-white/80">Not confirmed</p>
            <p className="mt-1 text-white/45">Awaiting drone verification</p>
          </>
        )}
        {level === 2 && (
          <>
            <p className="font-medium text-amber-100/95">Verification in progress</p>
            <p className="mt-1 text-white/50">
              Drone 1 en route · anomaly at Sensor 1
            </p>
          </>
        )}
        {level >= 3 && (
          <>
            <p className="font-medium text-rose-200/95">Confirmed</p>
            <ul className="mt-2 space-y-1.5 text-white/75">
              <li>
                <span className="text-white/45">Spot · </span>
                {briefing.gps}
                <span className="text-white/45"> · </span>
                {contained ? "0.4 ha · contained" : "≈ 0.4 ha"}
              </li>
              <li>
                <span className="text-white/45">Downwind · </span>
                {contained
                  ? "spread collapsed"
                  : suppression > 0.05
                    ? `${WIND.label} · sector shrinking`
                    : `${WIND.label} · ${WIND.speedKmh} km/h`}
              </li>
            </ul>
            {fire && level >= 4 && !contained && (
              <p className="mt-1.5 text-[10px] text-orange-200/80">
                Active suppression on {fire.label}
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function FleetBoard() {
  const elapsed = usePlayback((s) => s.elapsed);
  const fleet = getFleetState(elapsed);

  return (
    <section className="space-y-2">
      <p className="text-[10px] uppercase tracking-wide text-white/45">
        Fleet ({fleet.length})
      </p>
      <ul className="max-h-[min(42vh,320px)] space-y-1 overflow-y-auto pr-0.5">
        {fleet.map((d) => (
          <li
            key={d.id}
            className="rounded-md border border-white/10 bg-black/25 px-2 py-1.5 text-[11px]"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono font-semibold text-cyan-100/95">
                {d.name}
              </span>
              <StatusChip status={d.status} />
            </div>
            <p className="mt-0.5 font-mono text-[10px] text-white/45">
              {formatLngLatShort(d.position)}
            </p>
            <p className="mt-0.5 text-white/65">{d.task}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StatusChip({ status }: { status: FleetDroneStatus }) {
  const tone =
    status === "suppressing" || status === "verifying" || status === "en route"
      ? "bg-cyan-500/20 text-cyan-100 ring-cyan-400/30"
      : status === "staged" || status === "monitoring"
        ? "bg-amber-500/20 text-amber-100 ring-amber-400/30"
        : status === "patrol"
          ? "bg-violet-500/20 text-violet-100 ring-violet-400/30"
          : "bg-slate-500/20 text-slate-200 ring-white/10";

  return (
    <span
      className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wide ring-1 ${tone}`}
    >
      {status}
    </span>
  );
}
