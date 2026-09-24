"use client";

import { IndonesiaLocator } from "@/components/command/IndonesiaLocator";
import {
  INCIDENT_SECTOR_BOUNDS,
  INDONESIA_BOUNDS,
  PILOT_CENTER,
  WIND,
  accessRoute,
  communities,
  ACTIVE_DRONE_ID,
  fireFronts,
  sensors,
  drones,
  LEVEL_TIMES,
} from "@/data/scenario";
import {
  SPREAD_LENGTH_DEG,
  SPREAD_OPEN_DEG,
  buildSpreadCone,
  getCurrentLevel,
  getDroneTrail,
  getFleetState,
  getSpreadScale,
  spotFireContained,
} from "@/lib/incident-math";
import { SATELLITE_STYLE } from "@/lib/command-map-style";
import { usePlayback } from "@/store/playback";
import {
  GeoJSONSource,
  Map,
  Marker,
  NavigationControl,
  ScaleControl,
  setWorkerUrl,
  type Map as MapInstance,
} from "maplibre-gl";
import { useCallback, useEffect, useRef, useState } from "react";

setWorkerUrl("/maplibre-gl-worker.mjs");

const SECTOR_CAMERA = {
  center: PILOT_CENTER,
  zoom: 12,
  pitch: 45,
  bearing: -18,
} as const;

export function CommandMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const elapsed = usePlayback((s) => s.elapsed);
  const level = getCurrentLevel(elapsed);
  const [mapError, setMapError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"nation" | "sector">("sector");

  const flyToSector = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    setViewMode("sector");
    map.fitBounds(INCIDENT_SECTOR_BOUNDS, {
      padding: { top: 64, bottom: 64, left: 48, right: 48 },
      duration: 2200,
      pitch: SECTOR_CAMERA.pitch,
      bearing: SECTOR_CAMERA.bearing,
    });
  }, []);

  const flyToNation = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    setViewMode("nation");
    map.fitBounds(INDONESIA_BOUNDS, {
      padding: 48,
      duration: 2400,
      pitch: 0,
      bearing: 0,
    });
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new Map({
      container: containerRef.current,
      style: SATELLITE_STYLE,
      center: SECTOR_CAMERA.center,
      zoom: SECTOR_CAMERA.zoom,
      pitch: SECTOR_CAMERA.pitch,
      bearing: SECTOR_CAMERA.bearing,
      attributionControl: false,
    });

    map.addControl(new NavigationControl({ visualizePitch: false }), "top-right");
    map.addControl(
      new ScaleControl({ maxWidth: 100, unit: "metric" }),
      "bottom-right",
    );

    map.on("error", (e) => {
      const msg = e.error?.message ?? "Map tiles failed to load";
      // Playback can update paint before custom layers exist. That is recoverable
      // and must not cover a map that is already drawing.
      if (msg.includes("non-existing layer")) return;
      setMapError(msg);
    });

    const setupLayers = () => {
      map.addSource("trail", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: [] },
        },
      });
      map.addLayer({
        id: "trail-line",
        type: "line",
        source: "trail",
        paint: {
          "line-color": "#22d3ee",
          "line-width": 3,
          "line-opacity": 0.9,
        },
      });

      map.addSource("access", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: accessRoute },
        },
      });
      map.addLayer({
        id: "access-line",
        type: "line",
        source: "access",
        layout: { visibility: "none" },
        paint: {
          "line-color": "#a3e635",
          "line-width": 3,
          "line-dasharray": [2, 2],
          "line-opacity": 0.75,
        },
      });

      map.addSource("spread", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: buildSpreadCone(fireFronts[0].center, WIND.directionDeg),
        },
      });
      map.addLayer({
        id: "spread-fill",
        type: "fill",
        source: "spread",
        paint: {
          "fill-color": "#f97316",
          "fill-opacity": 0,
        },
      });
      map.addLayer({
        id: "spread-outline",
        type: "line",
        source: "spread",
        paint: {
          "line-color": "#fb923c",
          "line-width": 1.5,
          "line-opacity": 0,
        },
      });

      fireFronts.forEach((f) => {
        const id = `fire-${f.id}`;
        map.addSource(id, {
          type: "geojson",
          data: circleGeo(f.center, f.radiusM),
        });
        map.addLayer({
          id: `${id}-fill`,
          type: "fill",
          source: id,
          paint: {
            "fill-color": f.withinCapacity ? "#f97316" : "#ef4444",
            "fill-opacity": 0,
          },
        });
        map.addLayer({
          id: `${id}-outline`,
          type: "line",
          source: id,
          paint: {
            "line-color": f.withinCapacity ? "#fdba74" : "#f87171",
            "line-width": 2,
            "line-opacity": 0.5,
          },
        });
      });

      sensors.forEach((s) => {
        const el = document.createElement("div");
        el.className = "map-marker sensor-marker";
        el.dataset.id = s.id;
        el.innerHTML = `<span class="sensor-dot"></span><span class="map-marker-label">${s.name}</span>`;
        new Marker({ element: el, anchor: "bottom" }).setLngLat(s.position).addTo(map);
      });

      const droneMarkers: Record<string, Marker> = {};
      drones.forEach((d) => {
        const el = document.createElement("div");
        el.dataset.droneId = d.id;
        el.className = "map-marker drone-fleet-placeholder";
        const marker = new Marker({ element: el, anchor: "center" })
          .setLngLat(d.home)
          .addTo(map);
        droneMarkers[d.id] = marker;
      });
      (map as MapInstance & { _droneMarkers?: Record<string, Marker> })._droneMarkers =
        droneMarkers;

      communities.forEach((c) => {
        const el = document.createElement("div");
        el.className = `map-marker ${c.type === "farm" ? "community-marker-farm" : "community-marker-village"}`;
        el.innerHTML = `<span class="community-icon"></span><span class="map-marker-label">${c.name}</span>`;
        new Marker({ element: el, anchor: "top" }).setLngLat(c.position).addTo(map);
      });

      map.resize();
    };

    map.on("load", setupLayers);

    mapRef.current = map;

    const resize = () => {
      map.resize();
    };
    const ro = new ResizeObserver(resize);
    if (containerRef.current) ro.observe(containerRef.current);
    requestAnimationFrame(() => {
      requestAnimationFrame(resize);
    });

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      const trail = getDroneTrail(elapsed);
      const trailSource = map.getSource("trail") as GeoJSONSource | undefined;
      trailSource?.setData({
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: trail.length ? trail : [[0, 0]],
        },
      });

      const droneMarkers = (map as MapInstance & { _droneMarkers?: Record<string, Marker> })
        ._droneMarkers;
      const fleet = getFleetState(elapsed);
      fleet.forEach((d) => {
        const marker = droneMarkers?.[d.id];
        if (!marker) return;
        marker.setLngLat(d.position);
        const el = marker.getElement();
        applyDroneMarkerAppearance(el, d.id, d.role, level);
      });

      document.querySelectorAll(".sensor-marker").forEach((node) => {
        const el = node as HTMLElement;
        const id = el.dataset.id;
        const sensor = sensors.find((s) => s.id === id);
        const alert =
          sensor?.isIncident && elapsed >= LEVEL_TIMES[1] && level < 5;
        el.classList.toggle("sensor-alert", !!alert);
      });

      fireFronts.forEach((f) => {
        const src = map.getSource(`fire-${f.id}`) as GeoJSONSource | undefined;
        const fillId = `fire-${f.id}-fill`;
        if (!src || !map.getLayer(fillId)) return;
        let opacity = level >= 3 ? 0.35 : 0;
        if (f.withinCapacity && spotFireContained(elapsed)) opacity = 0.12;
        map.setPaintProperty(fillId, "fill-opacity", opacity);
      });

      const spreadScale = getSpreadScale(elapsed);
      const spreadSource = map.getSource("spread") as GeoJSONSource | undefined;
      if (spreadScale > 0.02) {
        spreadSource?.setData({
          type: "Feature",
          properties: {},
          geometry: buildSpreadCone(
            fireFronts[0].center,
            WIND.directionDeg,
            SPREAD_LENGTH_DEG,
            SPREAD_OPEN_DEG,
            spreadScale,
          ),
        });
      }
      if (map.getLayer("spread-fill")) {
        map.setPaintProperty("spread-fill", "fill-opacity", spreadScale > 0.02 ? 0.22 : 0);
      }
      if (map.getLayer("spread-outline")) {
        map.setPaintProperty(
          "spread-outline",
          "line-opacity",
          spreadScale > 0.02 ? 0.65 : 0,
        );
      }

      if (map.getLayer("access-line")) {
        map.setLayoutProperty(
          "access-line",
          "visibility",
          level >= 4 ? "visible" : "none",
        );
      }
    };

    // isStyleLoaded() is true before the load handler adds custom layers.
    // Styling them in that window emits "Cannot style non-existing layer".
    if (map.getLayer("access-line")) apply();
    else map.once("load", apply);

    return () => {
      map.off("load", apply);
    };
  }, [elapsed, level]);

  return (
    <div
      className="relative flex h-full min-h-0 w-full flex-1 flex-col"
      data-view={viewMode}
    >
      <div ref={containerRef} className="min-h-[280px] flex-1" />

      {mapError && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#0a1220]/90 p-6 text-center">
          <div>
            <p className="text-sm font-medium text-rose-200">Map unavailable</p>
            <p className="mt-1 max-w-xs text-xs text-white/50">{mapError}</p>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute left-4 top-4 z-10 flex flex-col gap-2">
        <div className="rounded-lg border border-white/10 bg-black/60 px-3 py-2 backdrop-blur-md">
          <p className="text-[10px] uppercase tracking-wide text-white/50">Wind</p>
          <p className="font-mono text-sm text-white">
            {WIND.label} · {WIND.speedKmh} km/h
          </p>
          <div
            className="mt-2 h-8 w-8 rounded-full border border-white/20"
            style={{
              background: `conic-gradient(from ${WIND.directionDeg - 90}deg, transparent 0deg, #fbbf24 40deg, transparent 80deg)`,
            }}
            aria-hidden
          />
        </div>
        <div className="pointer-events-auto flex gap-1">
          <ViewButton
            active={viewMode === "nation"}
            onClick={flyToNation}
            label="Nation"
          />
          <ViewButton
            active={viewMode === "sector"}
            onClick={flyToSector}
            label="Sector"
          />
        </div>
      </div>

      <IndonesiaLocator
        viewMode={viewMode}
        onSelectNation={flyToNation}
        onSelectSector={flyToSector}
      />

      <p className="pointer-events-none absolute bottom-3 right-3 z-10 max-w-[200px] rounded bg-black/50 px-2 py-1 text-[10px] text-white/40">
        Simulated pilot · Esri imagery
      </p>
    </div>
  );
}

function ViewButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-2.5 py-1 text-[11px] font-medium backdrop-blur-md ${
        active
          ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-100"
          : "border-white/15 bg-black/50 text-white/70 hover:bg-black/70"
      }`}
    >
      {label}
    </button>
  );
}

function applyDroneMarkerAppearance(
  el: HTMLElement,
  id: string,
  role: "incident" | "patrol" | "standby",
  level: number,
) {
  const drone = drones.find((d) => d.id === id);
  const name = drone?.name ?? id;
  if (id === ACTIVE_DRONE_ID && level >= 2) {
    el.className = "drone-active";
    el.innerHTML = "";
    el.dataset.droneId = id;
    return;
  }
  if (role === "incident") {
    el.className = "map-marker drone-marker-active";
    el.innerHTML = `<span class="drone-icon">▲</span><span class="map-marker-label">${name}</span>`;
  } else if (role === "patrol") {
    el.className = "map-marker drone-marker-patrol";
    el.innerHTML = `<span class="drone-icon">◆</span><span class="map-marker-label">${name}</span>`;
  } else {
    el.className = "map-marker drone-marker-standby";
    el.innerHTML = `<span class="drone-icon">◆</span><span class="map-marker-label">${name}</span>`;
  }
  el.dataset.droneId = id;
}

function circleGeo(center: [number, number], radiusM: number): GeoJSON.Feature {
  const points = 48;
  const coords: [number, number][] = [];
  const latRad = (center[1] * Math.PI) / 180;
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * Math.cos(latRad);
  for (let i = 0; i <= points; i++) {
    const a = (i / points) * Math.PI * 2;
    coords.push([
      center[0] + (Math.cos(a) * radiusM) / mPerDegLng,
      center[1] + (Math.sin(a) * radiusM) / mPerDegLat,
    ]);
  }
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [coords] },
  };
}
