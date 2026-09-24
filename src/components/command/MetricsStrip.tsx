"use client";

import { getMetrics } from "@/lib/incident-math";
import { usePlayback } from "@/store/playback";

const cards = [
  { key: "openAnomalies", label: "Open anomalies" },
  { key: "responseTimeMin", label: "Response time (min)" },
  { key: "hectaresAtRisk", label: "Hectares at risk" },
  { key: "contained", label: "Contained" },
  { key: "escalated", label: "Escalated" },
] as const;

type Props = {
  overlay?: boolean;
};

export function MetricsStrip({ overlay = false }: Props) {
  const elapsed = usePlayback((s) => s.elapsed);
  const m = getMetrics(elapsed);

  return (
    <div
      className={
        overlay
          ? "grid grid-cols-2 gap-1.5 rounded-xl border border-white/10 bg-black/55 p-2 backdrop-blur-md sm:grid-cols-5"
          : "grid grid-cols-2 gap-2 sm:grid-cols-5"
      }
    >
      {cards.map(({ key, label }) => (
        <div
          key={key}
          className={
            overlay
              ? "rounded-md border border-white/5 bg-black/30 px-2 py-1.5"
              : "rounded-lg border border-white/10 bg-black/30 px-3 py-2"
          }
        >
          <p className="text-[10px] uppercase tracking-wide text-white/45">
            {label}
          </p>
          <p
            className={`font-mono font-semibold text-white ${overlay ? "text-base" : "text-lg"}`}
          >
            {m[key]}
          </p>
        </div>
      ))}
    </div>
  );
}
