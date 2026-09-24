"use client";

import {
  LEVEL_LABELS,
  WIND,
  briefing,
  communities,
  fireFronts,
  weather,
} from "@/data/scenario";
import {
  formatScenarioClock,
  getAccessRouteStats,
  getCurrentLevel,
  getFireSuppression,
  getFleetState,
  getIncidentViirsHotspot,
  getMetrics,
  getOriginAnalysis,
  getPayloadRemaining,
  getRecurrence,
  getSatelliteLagAfterMataMin,
  getSensorDisplayState,
  getThermalReading,
  getVisibleHotspots,
  spotFireContained,
} from "@/lib/incident-math";
import { usePlayback } from "@/store/playback";
import { WIND_FROM, droneActivity, fleetTone, tankLine } from "./fleet-copy";

const PHASE_LEVELS = [1, 2, 3, 4, 5] as const;

export function SituationPanel() {
  const elapsed = usePlayback((s) => s.elapsed);
  const level = getCurrentLevel(elapsed);
  const contained = spotFireContained(elapsed);
  const suppression = getFireSuppression(elapsed);
  const thermal = getThermalReading(elapsed);
  const incidentSensor = getSensorDisplayState(elapsed).find((s) => s.isIncident);
  const route = getAccessRouteStats();
  const farm = communities.find((c) => c.type === "farm");
  const hamlet = communities.find((c) => c.type === "village");
  const fire = fireFronts[0];
  const fleet = getFleetState(elapsed);
  const payloadPct = getPayloadRemaining(elapsed);
  const overCapacity = getMetrics(elapsed).hectaresAtRisk > briefing.capacityThresholdHa;
  const origin = getOriginAnalysis(elapsed);
  const recurrence = getRecurrence();
  const viirs = getIncidentViirsHotspot();
  const viirsVisible = viirs && getVisibleHotspots(elapsed).some((h) => h.id === viirs.id);
  const satelliteLagMin = getSatelliteLagAfterMataMin(elapsed);

  const parcelTypeLabel: Record<string, string> = {
    smallholder: "Smallholder",
    plantation_concession: "Plantation concession",
    community_forest: "Community forest",
    state_land: "State land",
  };

  const spreadLine = contained
    ? "Collapsed"
    : suppression > 0.05
      ? `${WIND.label} · sector shrinking`
      : briefing.spreadDirection;

  const thermalLine =
    thermal.status === "CONTAINED" || thermal.status === "COOLING"
      ? `${thermal.status} · ${thermal.peakC}°C peak`
      : `Thermal lock · ${thermal.peakC}°C · ${thermal.status}`;

  const farmName = farm?.name ?? "the farm";
  const nowLine =
    level === 1
      ? `Watch ${farmName}. Fire-risk is ${incidentSensor?.fireRisk ?? "—"}; soil is dry. No fire yet.`
      : level === 2
        ? "Fire-risk is still climbing. Hold for Drone 1 before dispatch."
        : level === 3
          ? "Temperature and smoke show a fire. Authorities alerted."
          : level === 4 && !contained
            ? "Execute immediate suppression. Authorities are alerted."
            : "Incident contained. Authorities were alerted. Keep the farm on watch.";

  return (
    <aside className="flex w-full flex-col gap-4 border-t border-white/10 bg-[#0a0e16]/95 p-4 lg:h-full lg:min-h-0 lg:w-[360px] lg:shrink-0 lg:overflow-y-auto lg:border-l lg:border-t-0">
      <header>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-base font-semibold text-white">Incident picture</h2>
          <p className="font-mono text-xs text-amber-200/95">
            L{level} · {LEVEL_LABELS[level]}
          </p>
        </div>
        <PhaseRail current={level} />
      </header>

      <section className="rounded-lg border border-cyan-500/25 bg-cyan-950/20 px-3 py-2.5">
        <p className="text-[10px] uppercase tracking-wide text-cyan-300/80">Now</p>
        <p className="mt-1 text-sm leading-snug text-cyan-50/90">{nowLine}</p>
      </section>

      <section className="space-y-2">
        <p className="text-[10px] uppercase tracking-wide text-white/45">
          Active incident
        </p>
        <div
          className={`rounded-lg border px-3 py-2.5 text-xs ${
            level >= 3
              ? "border-rose-500/35 bg-rose-950/25"
              : level === 2
                ? "border-amber-500/35 bg-amber-950/20"
                : "border-orange-500/30 bg-orange-950/20"
          }`}
        >
          {level < 2 && (
            <>
              <p className="font-semibold text-orange-100/95">Sensor anomaly</p>
              <p className="mt-1.5 text-white/70">
                {incidentSensor?.name ?? "Sensor 1"} · fire-risk{" "}
                {incidentSensor?.fireRisk ?? "—"} · {farmName}
              </p>
              <p className="mt-1 text-white/45">Fire not confirmed · authorities not alerted</p>
            </>
          )}
          {level === 2 && (
            <>
              <p className="font-semibold text-amber-100/95">Verification in progress</p>
              <p className="mt-1.5 text-white/70">
                Drone 1 en route · anomaly at {incidentSensor?.name ?? "Sensor 1"}
              </p>
            </>
          )}
          {level >= 3 && (
            <>
              <p className="font-semibold text-rose-100/95">
                {contained ? "Spot contained" : "Fire confirmed"}
              </p>
              <ul className="mt-2 space-y-1.5 text-[11px] leading-snug text-white/78">
                <li>
                  <span className="text-white/45">Spot · </span>
                  {briefing.gps}
                  <span className="text-white/45"> · </span>
                  {contained ? "0.4 ha · contained" : briefing.sizeEstimate}
                </li>
                <li>
                  <span className="text-white/45">Thermal · </span>
                  {thermalLine}
                </li>
                <li>
                  <span className="text-white/45">Fuel · </span>
                  Peat · dryness {incidentSensor?.drynessIndex ?? 92} at Sensor 1
                </li>
                <li>
                  <span className="text-white/45">Detection · </span>
                  {incidentSensor?.fireDetected
                    ? `${Math.round(incidentSensor.heatC)}°C · smoke ${incidentSensor.smokePpm} ppm · authorities alerted`
                    : incidentSensor &&
                        (incidentSensor.heatC >= 70 || incidentSensor.smokePpm >= 40)
                      ? `${Math.round(incidentSensor.heatC)}°C · smoke ${incidentSensor.smokePpm} ppm · cooling · authorities were alerted`
                      : "Cleared on the sensors · authorities were alerted"}
                </li>
                <li>
                  {contained || suppression > 0.05 ? (
                    <>
                      <span className="text-white/45">Spread · </span>
                      {spreadLine}
                    </>
                  ) : (
                    spreadLine
                  )}
                </li>
                <li>
                  <span className="text-white/45">Satellite · </span>
                  {viirsVisible && viirs
                    ? `${viirs.source} hotspot at ${formatScenarioClock(viirs.detectedAtSec)}${
                        satelliteLagMin != null
                          ? satelliteLagMin < 1
                            ? ` · ${Math.round(satelliteLagMin * 60)} s after MATA confirmation`
                            : ` · ${satelliteLagMin} min after MATA confirmation`
                          : ""
                      }`
                    : level >= 3
                      ? "No satellite pass yet"
                      : "Awaiting fire confirmation"}
                </li>
                <li>
                  <span className="text-white/45">Resource · </span>
                  Within {briefing.capacityThresholdHa} ha / {briefing.payloadLiters} L{" "}
                  {briefing.payloadLabel} · ground crew requested (peat rekindle risk)
                </li>
              </ul>
              {fire && level >= 4 && !contained && (
                <p className="mt-2 text-[10px] text-orange-200/85">
                  Active suppression on {fire.label}
                </p>
              )}
            </>
          )}
        </div>
      </section>

      <section className="space-y-2">
        <p className="text-[10px] uppercase tracking-wide text-white/45">
          Assets at risk
        </p>
        <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs text-white/75">
          <ul className="space-y-1.5">
            <li>
              <span className="text-white/45">Downwind · </span>
              {farm?.name ?? "Farm margin"}
            </li>
            <li>
              <span className="text-white/45">Staging · </span>
              {hamlet?.name ?? "Hamlet"}
            </li>
          </ul>
          {contained && (
            <p className="mt-2 rounded border border-lime-400/35 bg-lime-950/25 px-2 py-1.5 text-[11px] text-lime-100/95">
              <span className="font-medium text-lime-200">Responder route · </span>
              {hamlet?.name ?? "Hamlet"} → spot · {route.lengthKm} km · ~{route.etaMin}{" "}
              min (dirt)
            </p>
          )}
        </div>
      </section>

      {origin && (
        <section className="space-y-2">
          <p className="text-[10px] uppercase tracking-wide text-white/45">
            Origin &amp; pattern
          </p>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs text-white/75">
            <ul className="space-y-1.5">
              <li>
                <span className="text-white/45">Ignition · </span>
                ~{origin.ignitionClock} local (estimated)
              </li>
              <li>
                <span className="text-white/45">Spread speed · </span>
                {origin.spreadSpeedMPerMin} m/min (downwind sector)
              </li>
              <li>
                <span className="text-white/45">Land · </span>
                {origin.parcel.owner} ·{" "}
                {parcelTypeLabel[origin.parcel.type] ?? origin.parcel.type}
              </li>
              <li>
                <span className="text-white/45">Road · </span>
                {origin.roadDistanceM} m to {origin.roadLabel}
              </li>
              <li>
                <span className="text-white/45">History · </span>
                {origin.priorFiresWithin2km} prior fire
                {origin.priorFiresWithin2km === 1 ? "" : "s"} within 2 km
              </li>
            </ul>
            {recurrence && (
              <p className="mt-2 rounded border border-amber-500/40 bg-amber-950/30 px-2 py-1.5 text-[11px] leading-snug text-amber-100/95">
                <span className="font-medium text-amber-200">Recurring pattern · </span>
                {recurrence.owner}: {recurrence.fireCount} fires since 2019 (
                {recurrence.years.join(", ")}) · {recurrence.totalAreaHa} ha cumulative ·
                flag for accountability review
              </p>
            )}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <p className="text-[10px] uppercase tracking-wide text-white/45">Drones</p>
        <ul className="space-y-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs">
          {fleet.map((d) => (
            <li key={d.id} className="grid grid-cols-[4.5rem_1fr] items-baseline gap-2">
              <span className="font-medium text-white">{d.name}</span>
              <span className={fleetTone(d.status)}>{droneActivity(d.status, d.task)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <p className="text-[10px] uppercase tracking-wide text-white/45">Weather</p>
        <ul className="space-y-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs">
          <li className="grid grid-cols-[5.5rem_1fr] items-baseline gap-2">
            <span className="font-medium text-white">Wind</span>
            <span className="text-white/75">
              {WIND_FROM[WIND.label] ?? WIND.label}, {WIND.speedKmh} km/h
            </span>
          </li>
          <li className="grid grid-cols-[5.5rem_1fr] items-baseline gap-2">
            <span className="font-medium text-white">Air temp</span>
            <span className="text-white/75">{weather.airTempC}°C</span>
          </li>
          <li className="grid grid-cols-[5.5rem_1fr] items-baseline gap-2">
            <span className="font-medium text-white">Humidity</span>
            <span className="text-white/75">{weather.humidityPct}%</span>
          </li>
          <li className="grid grid-cols-[5.5rem_1fr] items-baseline gap-2">
            <span className="font-medium text-white">Rain 7 d</span>
            <span className="text-white/75">{weather.rainLast7DaysMm} mm</span>
          </li>
          <li className="grid grid-cols-[5.5rem_1fr] items-baseline gap-2">
            <span className="font-medium text-white">Dry spell</span>
            <span className="text-white/75">{weather.daysSinceRain} days since rain</span>
          </li>
          <li className="grid grid-cols-[5.5rem_1fr] items-baseline gap-2">
            <span className="font-medium text-white">Outlook</span>
            <span className="text-white/75">{weather.outlook24h}</span>
          </li>
          <li className="grid grid-cols-[5.5rem_1fr] items-baseline gap-2">
            <span className="font-medium text-white">Tank</span>
            <span className="text-white/75">{tankLine(payloadPct)}</span>
          </li>
          <li className="grid grid-cols-[5.5rem_1fr] items-baseline gap-2">
            <span className="font-medium text-white">One load</span>
            <span className={overCapacity ? "text-amber-200" : "text-white/75"}>
              {overCapacity
                ? `Covers ${briefing.capacityThresholdHa} ha, fire is larger`
                : `Covers up to ${briefing.capacityThresholdHa} ha`}
            </span>
          </li>
        </ul>
      </section>
    </aside>
  );
}

function PhaseRail({ current }: { current: number }) {
  return (
    <ol aria-label="Incident phase" className="mt-2 grid grid-cols-5 gap-1">
      {PHASE_LEVELS.map((l) => {
        const done = current > l;
        const active = current === l;
        return (
          <li
            key={l}
            title={`L${l} · ${LEVEL_LABELS[l]}`}
            aria-current={active ? "step" : undefined}
            className={`h-1.5 rounded-full ${
              active ? "bg-amber-400" : done ? "bg-emerald-500/60" : "bg-white/10"
            }`}
          >
            <span className="sr-only">
              L{l} · {LEVEL_LABELS[l]}
              {done ? " (done)" : ""}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
