import type { StyleSpecification } from "maplibre-gl";

/** Inline satellite basemap — no API key, readable under incident overlays. */
export const SATELLITE_STYLE: StyleSpecification = {
  version: 8,
  name: "MATA Satellite",
  sources: {
    esri: {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution:
        "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, USDA, USGS, AeroGRID, IGN, IGP",
    },
  },
  layers: [
    {
      id: "background",
      type: "background",
      paint: { "background-color": "#0c1810" },
    },
    {
      id: "esri-imagery",
      type: "raster",
      source: "esri",
      paint: {
        "raster-saturation": -0.18,
        "raster-contrast": 0.14,
        "raster-brightness-min": 0.04,
        "raster-brightness-max": 0.92,
      },
    },
  ],
};
