import { briefing } from "@/data/scenario";
import type { FleetDroneStatus } from "@/lib/incident-math";

export const WIND_FROM: Record<string, string> = {
  N: "North",
  NE: "Northeast",
  E: "East",
  SE: "Southeast",
  S: "South",
  SW: "Southwest",
  W: "West",
  NW: "Northwest",
};

export function droneActivity(status: FleetDroneStatus, task: string): string {
  switch (status) {
    case "en route":
      return "Flying to the alert";
    case "verifying":
      return task.toLowerCase().includes("fire") ? "Confirming the fire" : "Checking the alert";
    case "suppressing":
      return "Putting out the fire";
    case "monitoring":
      return "Watching the fire";
    case "returning":
      return "Flying back to base";
    case "patrol":
      return "Patrolling the sector";
    case "standby":
      return "Waiting at base";
    case "staged":
      return "Ready to launch";
  }
}

export function fleetTone(status: FleetDroneStatus): string {
  switch (status) {
    case "en route":
    case "verifying":
    case "suppressing":
      return "text-cyan-200";
    case "monitoring":
    case "returning":
      return "text-emerald-300";
    default:
      return "text-white/55";
  }
}

export function tankLine(pct: number): string {
  const load = `${briefing.payloadLiters} L ${briefing.payloadLabel}`;
  if (pct >= 99) return `Full · ${load}`;
  if (pct <= 1) return "Empty";
  return `${Math.round(pct)}% left · ${load}`;
}
