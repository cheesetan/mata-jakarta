"use client";

import { IndonesiaLocator } from "@/components/command/IndonesiaLocator";
import {
  INCIDENT_SECTOR_BOUNDS,
  INDONESIA_BOUNDS,
  PILOT_CENTER,
  WIND,
  briefing,
  communities,
  ACTIVE_DRONE_ID,
  fireFronts,
  historicalFires,
  landParcels,
  riskZones,
  roads,
  satelliteHotspots,
  sensors,
  drones,
  type LngLat,
} from "@/data/scenario";
import {
  SPREAD_LENGTH_DEG,
  SPREAD_OPEN_DEG,
  buildSpreadCone,
  getAccessRouteLine,
  getAccessRouteMidpoint,
  getCurrentLevel,
  getDroneTrail,
  getFleetState,
  getRecurrence,
  getSensorDisplayState,
  getSpreadLabelPosition,
  getSpreadScale,
  getVisibleHotspots,
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

type LayerKey =
  | "sensors"
  | "drones"
  | "satellite"
  | "riskZones"
  | "trajectory"
  | "history"
  | "parcels"
  | "roads";

const DEFAULT_LAYERS: Record<LayerKey, boolean> = {
  sensors: true,
  drones: true,
  satellite: true,
  riskZones: true,
  trajectory: true,
  history: false,
  parcels: false,
  roads: true,
};

const LAYER_LABELS: Record<LayerKey, string> = {
  sensors: "Sensors",
  drones: "Drones",
  satellite: "Satellite hotspots",
  riskZones: "Risk zones",
  trajectory: "Trajectory",
  history: "History",
  parcels: "Land parcels",
  roads: "Roads",
};

type MapExtras = MapInstance & {
  _droneMarkers?: Record<string, Marker>;
  _routeLabelMarker?: Marker;
  _hotspotMarkers?: Record<string, Marker>;
  _parcelLabelMarkers?: Marker[];
};

export function CommandMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const elapsed = usePlayback((s) => s.elapsed);
  const level = getCurrentLevel(elapsed);
  const [mapError, setMapError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"nation" | "sector">("sector");
  const [layers, setLayers] = useState(DEFAULT_LAYERS);
  const autoContextRef = useRef(false);

  useEffect(() => {
    if (level < 3 || !getRecurrence() || autoContextRef.current) return;
    autoContextRef.current = true;
    setLayers((prev) => ({
      ...prev,
      history: true,
      parcels: true,
    }));
  }, [level]);

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
      map.addSource("risk-zones", {
        type: "geojson",
        data: riskZonesFeatureCollection(),
      });
      map.addLayer({
        id: "risk-zones-fill",
        type: "fill",
        source: "risk-zones",
        paint: {
          "fill-color": [
            "match",
            ["get", "level"],
            "high",
            "#ef4444",
            "elevated",
            "#f59e0b",
            "#eab308",
          ],
          "fill-opacity": 0.12,
        },
      });
      map.addLayer({
        id: "risk-zones-outline",
        type: "line",
        source: "risk-zones",
        paint: {
          "line-color": [
            "match",
            ["get", "level"],
            "high",
            "#f87171",
            "elevated",
            "#fbbf24",
            "#fde047",
          ],
          "line-width": 1,
          "line-opacity": 0.55,
        },
      });

      map.addSource("parcels", {
        type: "geojson",
        data: parcelsFeatureCollection(),
      });
      map.addLayer({
        id: "parcels-outline",
        type: "line",
        source: "parcels",
        layout: { visibility: "none" },
        paint: {
          "line-color": "#a78bfa",
          "line-width": 1.5,
          "line-opacity": 0.75,
          "line-dasharray": [2, 1.5],
        },
      });

      map.addSource("sector-roads", {
        type: "geojson",
        data: roadsFeatureCollection(),
      });
      map.addLayer({
        id: "sector-roads-line",
        type: "line",
        source: "sector-roads",
        paint: {
          "line-color": "#94a3b8",
          "line-width": 2,
          "line-opacity": 0.65,
        },
      });

      map.addSource("fire-history", {
        type: "geojson",
        data: historyFeatureCollection(),
      });
      map.addLayer({
        id: "fire-history-circle",
        type: "circle",
        source: "fire-history",
        layout: { visibility: "none" },
        paint: {
          "circle-radius": 5,
          "circle-color": "#64748b",
          "circle-stroke-width": 1,
          "circle-stroke-color": "#cbd5e1",
          "circle-opacity": 0.85,
        },
      });
      map.addLayer({
        id: "fire-history-label",
        type: "symbol",
        source: "fire-history",
        layout: {
          visibility: "none",
          "text-field": ["to-string", ["get", "year"]],
          "text-size": 10,
          "text-offset": [0, 1.2],
          "text-anchor": "top",
        },
        paint: {
          "text-color": "#cbd5e1",
          "text-halo-color": "#0f172a",
          "text-halo-width": 1,
        },
      });

      const parcelLabelMarkers: Marker[] = [];
      landParcels.forEach((p) => {
        const el = document.createElement("div");
        el.className = "map-marker parcel-marker";
        el.style.display = "none";
        el.innerHTML = `<span class="parcel-swatch"></span><span class="map-marker-label">${p.owner.split("·")[0]?.trim() ?? p.owner}</span>`;
        const marker = new Marker({ element: el, anchor: "center" })
          .setLngLat(ringCentroid(p.ring))
          .addTo(map);
        parcelLabelMarkers.push(marker);
      });
      (map as MapExtras)._parcelLabelMarkers = parcelLabelMarkers;

      const hotspotMarkers: Record<string, Marker> = {};
      satelliteHotspots.forEach((h) => {
        const el = document.createElement("div");
        el.className = "map-marker satellite-marker";
        el.dataset.hotspotId = h.id;
        el.style.display = "none";
        el.innerHTML = `<span class="satellite-dot"></span><span class="map-marker-label">${h.source}</span>`;
        hotspotMarkers[h.id] = new Marker({ element: el, anchor: "bottom" })
          .setLngLat(h.position)
          .addTo(map);
      });
      (map as MapExtras)._hotspotMarkers = hotspotMarkers;

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
          geometry: { type: "LineString", coordinates: getAccessRouteLine() },
        },
      });
      const routeLayout = {
        visibility: "none" as const,
        "line-cap": "round" as const,
        "line-join": "round" as const,
      };
      map.addLayer({
        id: "access-casing",
        type: "line",
        source: "access",
        layout: routeLayout,
        paint: {
          "line-color": "#0f172a",
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            5,
            12,
            8,
            14,
            11,
          ],
          "line-opacity": 0.88,
        },
      });
      map.addLayer({
        id: "access-line",
        type: "line",
        source: "access",
        layout: routeLayout,
        paint: {
          "line-color": "#bef264",
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            3,
            12,
            5,
            14,
            7,
          ],
          "line-opacity": 0.98,
        },
      });

      const routeLabelEl = document.createElement("div");
      routeLabelEl.className = "map-marker route-marker";
      routeLabelEl.style.display = "none";
      routeLabelEl.innerHTML =
        '<span class="route-line-swatch" aria-hidden="true"></span><span class="map-marker-label route-marker-label">Responder route</span>';
      const routeLabelMarker = new Marker({
        element: routeLabelEl,
        anchor: "bottom",
        offset: [0, -10],
      })
        .setLngLat(getAccessRouteMidpoint())
        .addTo(map);
      (map as MapExtras)._routeLabelMarker = routeLabelMarker;

      const spreadLabelEl = document.createElement("div");
      spreadLabelEl.className = "map-marker spread-marker";
      spreadLabelEl.style.display = "none";
      spreadLabelEl.innerHTML = `<span class="spread-swatch" aria-hidden="true"></span><span class="map-marker-label spread-marker-label">${briefing.spreadDirection}</span>`;
      const spreadLabelMarker = new Marker({
        element: spreadLabelEl,
        anchor: "center",
      })
        .setLngLat(
          getSpreadLabelPosition(fireFronts[0].center, WIND.directionDeg),
        )
        .addTo(map);
      (
        map as MapInstance & { _spreadLabelMarker?: Marker }
      )._spreadLabelMarker = spreadLabelMarker;

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
      (map as MapExtras)._droneMarkers = droneMarkers;

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

      const extras = map as MapExtras;
      const droneMarkers = extras._droneMarkers;
      const fleet = getFleetState(elapsed);
      fleet.forEach((d) => {
        const marker = droneMarkers?.[d.id];
        if (!marker) return;
        marker.setLngLat(d.position);
        const el = marker.getElement();
        applyDroneMarkerAppearance(el, d.id, d.role, level);
      });

      const liveSensors = getSensorDisplayState(elapsed);
      document.querySelectorAll(".sensor-marker").forEach((node) => {
        const el = node as HTMLElement;
        const id = el.dataset.id;
        const sensor = liveSensors.find((s) => s.id === id);
        el.classList.toggle("sensor-fire", !!sensor?.fireDetected);
        el.classList.toggle(
          "sensor-alert",
          !!sensor && sensor.anomalyActive && !sensor.fireDetected && sensor.fireRisk >= 60,
        );
        const label = el.querySelector(".map-marker-label");
        if (label && sensor) {
          label.textContent = sensor.fireDetected
            ? `${sensor.name} · fire`
            : `${sensor.name} · risk ${sensor.fireRisk}`;
        }
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
      const spreadLabelMarker = (
        map as MapInstance & { _spreadLabelMarker?: Marker }
      )._spreadLabelMarker;
      if (spreadLabelMarker) {
        const showForecast = spreadScale > 0.85;
        spreadLabelMarker.getElement().style.display = showForecast ? "" : "none";
        if (showForecast) {
          spreadLabelMarker.setLngLat(
            getSpreadLabelPosition(
              fireFronts[0].center,
              WIND.directionDeg,
              spreadScale,
            ),
          );
        }
      }

      const showRoute = spotFireContained(elapsed);
      for (const layerId of ["access-casing", "access-line"]) {
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(
            layerId,
            "visibility",
            showRoute ? "visible" : "none",
          );
        }
      }
      const routeLabelMarker = extras._routeLabelMarker;
      if (routeLabelMarker) {
        routeLabelMarker.getElement().style.display = showRoute ? "" : "none";
      }

      applyLayerVisibility(map, layers, elapsed);
    };

    // isStyleLoaded() is true before the load handler adds custom layers.
    // Styling them in that window emits "Cannot style non-existing layer".
    if (map.getLayer("access-line")) apply();
    else map.once("load", apply);

    return () => {
      map.off("load", apply);
    };
  }, [elapsed, level, layers]);

  return (
    <div
      className="relative flex h-full min-h-0 w-full flex-1 flex-col"
      data-view={viewMode}
    >
      <div ref={containerRef} className="min-h-[220px] flex-1" />

      {mapError && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#0a1220]/90 p-6 text-center">
          <div>
            <p className="text-sm font-medium text-rose-200">Map unavailable</p>
            <p className="mt-1 max-w-xs text-xs text-white/50">{mapError}</p>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute left-4 top-4 z-10 flex flex-col gap-2">
        <div className="flex items-center gap-2.5 self-start rounded-lg border border-white/10 bg-black/60 px-2.5 py-1.5 backdrop-blur-md">
          <div
            className="h-6 w-6 shrink-0 rounded-full border border-white/20"
            style={{
              background: `conic-gradient(from ${WIND.directionDeg - 20}deg, transparent 0deg, #fbbf24 20deg, transparent 40deg)`,
            }}
            aria-hidden
          />
          <div>
            <p className="text-[10px] uppercase leading-none tracking-wide text-white/50">Wind</p>
            <p className="mt-0.5 font-mono text-xs text-white">
              {WIND.label} · {WIND.speedKmh} km/h
            </p>
          </div>
        </div>
        <div className="pointer-events-auto max-h-[min(42vh,280px)] overflow-y-auto rounded-lg border border-white/10 bg-black/60 px-2.5 py-2 backdrop-blur-md">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-white/50">
            Layers
          </p>
          <ul className="mt-1.5 space-y-1">
            {(Object.keys(LAYER_LABELS) as LayerKey[]).map((key) => (
              <li key={key}>
                <label className="flex cursor-pointer items-center gap-2 text-[11px] text-white/80">
                  <input
                    type="checkbox"
                    checked={layers[key]}
                    onChange={() =>
                      setLayers((prev) => ({ ...prev, [key]: !prev[key] }))
                    }
                    className="h-3 w-3 rounded border-white/30 bg-black/40 accent-emerald-500"
                  />
                  {LAYER_LABELS[key]}
                </label>
              </li>
            ))}
          </ul>
        </div>
        {spotFireContained(elapsed) && (
          <div className="rounded-lg border border-lime-400/45 bg-lime-950/55 px-3 py-2 shadow-[0_0_24px_rgba(190,242,100,0.12)] backdrop-blur-md">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-lime-200/90">
              Responder route
            </p>
            <p className="mt-0.5 font-mono text-xs text-lime-50">
              Sungai Kahayan → spot
            </p>
            <div className="mt-2 h-1.5 w-full rounded-full bg-lime-400/90 ring-2 ring-black/40" />
          </div>
        )}
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

function applyLayerVisibility(
  map: MapInstance,
  layers: Record<LayerKey, boolean>,
  elapsed: number,
) {
  const vis = (on: boolean) => (on ? "visible" : "none") as "visible" | "none";
  if (map.getLayer("risk-zones-fill")) {
    map.setLayoutProperty("risk-zones-fill", "visibility", vis(layers.riskZones));
    map.setLayoutProperty("risk-zones-outline", "visibility", vis(layers.riskZones));
  }
  if (map.getLayer("parcels-outline")) {
    map.setLayoutProperty("parcels-outline", "visibility", vis(layers.parcels));
  }
  if (map.getLayer("sector-roads-line")) {
    map.setLayoutProperty("sector-roads-line", "visibility", vis(layers.roads));
  }
  if (map.getLayer("fire-history-circle")) {
    map.setLayoutProperty("fire-history-circle", "visibility", vis(layers.history));
    map.setLayoutProperty("fire-history-label", "visibility", vis(layers.history));
  }
  if (map.getLayer("spread-fill") && !layers.trajectory) {
    map.setPaintProperty("spread-fill", "fill-opacity", 0);
    map.setPaintProperty("spread-outline", "line-opacity", 0);
  }

  document.querySelectorAll(".sensor-marker").forEach((node) => {
    (node as HTMLElement).style.display = layers.sensors ? "" : "none";
  });
  document.querySelectorAll(".community-marker-farm, .community-marker-village").forEach(
    (node) => {
      (node as HTMLElement).style.display = layers.sensors ? "" : "none";
    },
  );

  const extras = map as MapExtras;
  const visibleHotspots = getVisibleHotspots(elapsed);
  const visibleIds = new Set(visibleHotspots.map((h) => h.id));
  Object.entries(extras._hotspotMarkers ?? {}).forEach(([id, marker]) => {
    const show = layers.satellite && visibleIds.has(id);
    marker.getElement().style.display = show ? "" : "none";
  });

  Object.values(extras._droneMarkers ?? {}).forEach((marker) => {
    marker.getElement().style.display = layers.drones ? "" : "none";
  });
  if (map.getLayer("trail-line")) {
    map.setLayoutProperty("trail-line", "visibility", vis(layers.drones));
  }
  document.querySelectorAll(".drone-active").forEach((node) => {
    (node as HTMLElement).style.display = layers.drones ? "" : "none";
  });

  extras._parcelLabelMarkers?.forEach((marker) => {
    marker.getElement().style.display = layers.parcels ? "" : "none";
  });
}

function riskZonesFeatureCollection(): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: riskZones.map((z) => ({
      type: "Feature",
      properties: { id: z.id, level: z.level, reason: z.reason },
      geometry: { type: "Polygon", coordinates: [z.ring] },
    })),
  };
}

function parcelsFeatureCollection(): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: landParcels.map((p) => ({
      type: "Feature",
      properties: { id: p.id, owner: p.owner, parcelType: p.type },
      geometry: { type: "Polygon", coordinates: [p.ring] },
    })),
  };
}

function roadsFeatureCollection(): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: roads.map((r) => ({
      type: "Feature",
      properties: { id: r.id, label: r.label },
      geometry: { type: "LineString", coordinates: r.coordinates },
    })),
  };
}

function historyFeatureCollection(): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: historicalFires.map((f) => ({
      type: "Feature",
      properties: { id: f.id, year: f.year },
      geometry: { type: "Point", coordinates: f.position },
    })),
  };
}

function ringCentroid(ring: LngLat[]): LngLat {
  const pts = ring.length > 1 ? ring.slice(0, -1) : ring;
  let lng = 0;
  let lat = 0;
  for (const p of pts) {
    lng += p[0];
    lat += p[1];
  }
  return [lng / pts.length, lat / pts.length];
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
