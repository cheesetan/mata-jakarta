"use client";

import { briefing, communities } from "@/data/scenario";
import type { ReactNode } from "react";
import {
  getFleetState,
  getMetrics,
  getSensorDisplayState,
  type FleetDroneState,
  type SensorDisplayState,
} from "@/lib/incident-math";
import { usePlayback } from "@/store/playback";
import { droneActivity } from "./fleet-copy";

export function DataDesk() {
  const elapsed = usePlayback((s) => s.elapsed);
  const metrics = getMetrics(elapsed);
  const sensors = getSensorDisplayState(elapsed);
  const fleet = getFleetState(elapsed);
  const settled = metrics.contained > 0;
  const overCapacity = metrics.hectaresAtRisk > briefing.capacityThresholdHa;
  const watched = sensors.find((s) => s.isIncident);
  const farm = communities.find((c) => c.type === "farm");
  const lead = fleet.find((d) => d.role === "incident");
  const openAlerts = settled ? 0 : metrics.openAnomalies;
  const showHectares = metrics.hectaresAtRisk > 0 || settled;
  const riskTone =
    watched && watched.fireRisk >= 70 ? "alert" : watched && watched.fireRisk >= 45 ? "warn" : "good";

  return (
    <section
      aria-label="Live telemetry"
      className="shrink-0 border-t border-white/10 bg-[#060a11]/95 px-4 py-3"
    >
      <p className="text-sm font-medium leading-snug text-white">
        {situationSentence(watched, lead, settled, farm?.name ?? "the farm")}
      </p>

      <div className="mt-3 grid grid-cols-3 gap-x-4 gap-y-3 sm:grid-cols-6">
        <Metric
          value={watched ? String(watched.fireRisk) : "—"}
          label="Fire-risk"
          tone={watched ? riskTone : "quiet"}
        />
        <Metric
          value={String(openAlerts)}
          label={openAlerts === 1 ? "Open alert" : "Open alerts"}
          tone={openAlerts > 0 ? "alert" : "quiet"}
        />
        <Metric
          value={metrics.responseTimeMin > 0 ? metrics.responseTimeMin.toFixed(1) : "—"}
          unit={metrics.responseTimeMin > 0 ? "min" : undefined}
          label="Response time"
          tone={metrics.responseTimeMin > 0 ? "neutral" : "quiet"}
        />
        <Metric
          value={showHectares ? formatMeasure(metrics.hectaresAtRisk) : "—"}
          unit={showHectares ? "ha" : undefined}
          label="Land at risk"
          tone={overCapacity ? "warn" : settled ? "good" : showHectares ? "neutral" : "quiet"}
        />
        <Metric
          value={metrics.contained > 0 ? String(metrics.contained) : "No"}
          label="Contained"
          tone={metrics.contained > 0 ? "good" : "quiet"}
        />
        <Metric
          value={metrics.escalated > 0 ? String(metrics.escalated) : "No"}
          label="Escalated"
          tone={metrics.escalated > 0 ? "alert" : "quiet"}
        />
      </div>

      <div className="mt-3 overflow-x-auto rounded-lg bg-white/[0.03]">
        <table className="w-full min-w-[520px] text-left text-sm">
          <caption className="px-3 pt-2 text-left text-xs text-white/40">
            <span className="font-medium text-white/60">In-ground sensors</span>
            <span className="mx-1.5 text-white/20">·</span>
            Moisture down, warmer soil, drier air — fire-risk goes up.
          </caption>
          <thead>
            <tr className="text-[11px] text-white/45">
              <th className="px-3 py-1.5 font-medium">Sensor</th>
              <HeadCell icon={<DropIcon />} label="Moisture" className="text-sky-300" />
              <HeadCell icon={<ThermometerIcon />} label="Soil temp" className="text-amber-200" />
              <HeadCell icon={<CloudIcon />} label="Humidity" className="text-cyan-200" />
              <HeadCell icon={<FlameIcon />} label="Fire-risk" className="text-orange-200" />
              <th className="px-3 py-1.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {sensors.map((s) => (
              <SensorRow key={s.id} sensor={s} settled={settled} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Metric({
  value,
  unit,
  label,
  tone,
}: {
  value: string;
  unit?: string;
  label: string;
  tone: "alert" | "warn" | "good" | "quiet" | "neutral";
}) {
  const color = {
    alert: "text-orange-300",
    warn: "text-amber-200",
    good: "text-emerald-300",
    quiet: "text-white/50",
    neutral: "text-white",
  }[tone];

  return (
    <div className="min-w-0">
      <p className={`font-mono text-xl font-semibold leading-none tabular-nums ${color}`}>
        {value}
        {unit ? <span className="ml-1 text-xs font-medium text-white/45">{unit}</span> : null}
      </p>
      <p className="mt-1 truncate text-xs text-white/55">{label}</p>
    </div>
  );
}

function HeadCell({ icon, label, className }: { icon: ReactNode; label: string; className: string }) {
  return (
    <th className="px-3 py-1.5 font-medium">
      <span className="inline-flex items-center gap-1.5">
        <span className={`shrink-0 [&>svg]:h-3.5 [&>svg]:w-3.5 ${className}`} aria-hidden>
          {icon}
        </span>
        {label}
      </span>
    </th>
  );
}

function SensorRow({ sensor: s, settled }: { sensor: SensorDisplayState; settled: boolean }) {
  const containedHere = settled && s.isIncident;
  const trending = s.isIncident && !s.fireDetected && !containedHere;
  const recovering = containedHere && s.recovering;
  const riskClass =
    s.fireDetected
      ? "text-rose-200"
      : s.fireRisk >= 70
        ? "text-orange-200"
        : s.fireRisk >= 45
          ? "text-amber-200"
          : "text-emerald-300";

  const status = s.fireDetected ? (
    <span className="text-rose-200">
      Fire · {Math.round(s.heatC)}°C · smoke {s.smokePpm} · authorities alerted
    </span>
  ) : containedHere ? (
    <span className="text-emerald-300">
      {s.heatC >= 70 || s.smokePpm >= 40
        ? "Cooling · authorities were alerted"
        : recovering
          ? "Risk falling · authorities were alerted"
          : "Recovered · authorities were alerted"}
    </span>
  ) : trending ? (
    <span className="text-orange-200">Drying out</span>
  ) : (
    <span className="text-white/45">Normal</span>
  );

  return (
    <tr className={`border-t border-white/5 ${s.isIncident ? "bg-white/[0.03]" : ""}`}>
      <td className="px-3 py-1 font-medium text-white">{s.name}</td>
      <Value className="text-sky-300" value={String(Math.round(s.soilMoisturePct))} unit="%" trend={trending ? "↓" : recovering ? "↑" : undefined} />
      <Value className="text-amber-200" value={s.soilTempC.toFixed(1)} unit="°C" trend={trending ? "↑" : recovering ? "↓" : undefined} />
      <Value className="text-cyan-200" value={String(Math.round(s.humidityPct))} unit="%" trend={trending ? "↓" : recovering ? "↑" : undefined} />
      <Value className={riskClass} value={String(s.fireRisk)} trend={recovering ? "↓" : undefined} />
      <td className="px-3 py-1 text-xs">{status}</td>
    </tr>
  );
}

function Value({
  value,
  unit,
  trend,
  className,
}: {
  value: string;
  unit?: string;
  trend?: string;
  className: string;
}) {
  return (
    <td className={`px-3 py-1 font-mono text-sm font-semibold tabular-nums ${className}`}>
      {value}
      {unit ? <span className="ml-0.5 text-xs font-medium opacity-60">{unit}</span> : null}
      {trend ? <span className="ml-1 text-xs">{trend}</span> : null}
    </td>
  );
}

function DropIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z" />
    </svg>
  );
}

function ThermometerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z" />
    </svg>
  );
}

function CloudIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
    </svg>
  );
}

function FlameIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
    </svg>
  );
}

function situationSentence(
  watched: SensorDisplayState | undefined,
  lead: FleetDroneState | undefined,
  contained: boolean,
  farmName: string,
): string {
  const doing = lead ? uncap(droneActivity(lead.status, lead.task)) : null;
  const drone = lead && doing ? ` ${lead.name} is ${doing}.` : "";
  if (contained && watched) {
    const riskLine = watched.recovering
      ? `${watched.name} fire-risk is ${watched.fireRisk} and falling`
      : `${watched.name} fire-risk settled at ${watched.fireRisk}`;
    return `The fire is contained. ${riskLine}. Authorities were alerted.${drone}`;
  }
  if (watched?.fireDetected) {
    return `Temperature and smoke at ${watched.name} indicate a fire. Authorities alerted.${drone}`;
  }
  if (watched && watched.fireRisk >= 60) {
    return `${watched.name} fire-risk is ${watched.fireRisk} at ${farmName}. Soil moisture is low and the air is dry.${drone}`;
  }
  if (lead && doing) return `${lead.name} is ${doing}.`;
  return "All sensors are normal.";
}

function formatMeasure(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function uncap(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}
