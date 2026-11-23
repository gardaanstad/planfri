"use client";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "maplibre-gl/dist/maplibre-gl.css";
import { maplibreGL } from "@maplibre/maplibre-gl-leaflet";
import type maplibregl from "maplibre-gl";
import "./project-map.css";
import { useTheme } from "./theme-toggle";
import {
  Building2,
  Info,
  Layers,
  Minus,
  Plus,
  X,
  Check,
} from "lucide-react";
import {
  categoryLabels,
  finishYear,
  cities,
  lineDotZoom,
  lineMidpoint,
  norwayBounds,
  type Point,
  type Project,
  type Status,
  statuses,
  transportMode,
  type ViewBounds,
} from "../lib/data";
import {
  type MapView,
  storedMapView,
  storeMapView,
} from "../lib/explore-state";
import {
  formatLength,
  formatRef,
  type OsmCandidate,
  osmColors,
  osmModeLabels,
  osmStatusLabels,
} from "../lib/osm-candidates";
import { cn } from "../lib/cn";
import { mobileQuery, reducedMotion, useMediaQuery } from "../lib/media";
import ActionSheet, { SwitchTrack, type SheetAction } from "./action-sheet";
import { mapIconButton } from "../lib/ui";

type MapLayer = "standard" | "streets" | "osm";

// Selected projects draw heavier; shared by the first render and selection.
// Not yet built: planned dashed, proposed dotted.
const dashes: Partial<Record<Status, { area: string; line: string }>> = {
  // Round caps add the stroke width to each dash: short dashes, wide gaps.
  proposed: { area: "3, 9", line: "3, 12" },
  planned: { area: "7, 5", line: "8, 6" },
};
const lineWeight = (selected: boolean) => (selected ? 5 : 3.5);
const shapeStyle = (line: boolean, selected: boolean) => ({
  weight: line ? lineWeight(selected) : selected ? 4 : 2.5,
  fillOpacity: selected ? 0.34 : 0.2,
});
const dotRadius = (selected: boolean) => (selected ? 8 : 6);
// Rail and road read as on OpenStreetMap. A road is a band in its status
// colour, white every other stretch inside a thin border; a railway is
// square dashes with nothing between them.
const roadWeight = (selected: boolean) => (selected ? 8.5 : 7);
const roadStripes = (selected: boolean) => ({
  weight: roadWeight(selected) - 2.5,
  dashArray: "9, 9",
});
const railWeight = (selected: boolean) => (selected ? 6.5 : 5);
const lineMode = (project: Project) =>
  project.geometryType === "line" ? transportMode(project.categories) : null;
const projectStyle = (project: Project, selected: boolean) => {
  const base = shapeStyle(project.geometryType === "line", selected);
  const mode = lineMode(project);
  if (mode === "road")
    return { ...base, weight: roadWeight(selected), dashArray: undefined };
  if (mode === "rail") {
    const weight = railWeight(selected);
    // Dashes as long as the line is wide, whatever its weight.
    return { ...base, weight, dashArray: `${weight}, ${weight}` };
  }
  return base;
};

type DotRenderer = L.SVG & {
  _layers: Record<string, L.CircleMarker & { _point: L.Point; _path: SVGElement }>;
  _reset(): void;
  _onZoom(): void;
  _onAnimZoom(event: L.ZoomAnimEvent): void;
};

type PanRenderer = L.Renderer & {
  _bounds?: L.Bounds;
  _zoom?: number;
  _update(): void;
};

/**
 * An SVG renderer for dots that keep their size while the map zooms, like
 * markers. Leaflet's own scales its drawing until the zoom ends, which blows
 * a dot up into a blurry disc while the map zooms in to a project.
 */
function dotSvg(map: L.Map) {
  const pane =
    map.getPane("projectDots") ??
    map.createPane("projectDots", map.getPane("overlayPane"));
  // Over the shapes, in the overlay pane so their styles still apply.
  pane.style.zIndex = "1";
  const renderer = L.svg({ pane: "projectDots" }) as DotRenderer;
  const dots = () => Object.values(renderer._layers);
  // Flying and pinching: redrawn at the new scale on every frame.
  renderer._onZoom = () => {
    renderer._reset();
    for (const dot of dots()) dot._path.style.transform = "";
  };
  // An animated zoom: each dot slides to where it lands, with the tiles.
  renderer._onAnimZoom = ({ center, zoom }) => {
    const internal = map as unknown as {
      _latLngToNewLayerPoint(at: L.LatLng, zoom: number, center: L.LatLng): L.Point;
    };
    for (const dot of dots()) {
      const offset = internal
        ._latLngToNewLayerPoint(dot.getLatLng(), zoom, center)
        .subtract(dot._point);
      dot._path.style.transform = `translate(${offset.x}px, ${offset.y}px)`;
    }
  };
  return renderer;
}
// Below this zoom areas collapse to dots and nearby projects group together.
const clusterZoom = 12;
// Screen distance within which projects join a group.
const clusterRadius = 44;
// Alignments only group once they're this short on screen.
const clusterLineExtent = 64;

function clusterIcon(count: number) {
  const size = count < 10 ? 32 : count < 50 ? 38 : 44;
  return L.divIcon({
    className: "project-cluster",
    iconSize: [size, size],
    html: `<span>${count}</span>`,
  });
}
// Sticky tooltips follow the pointer instead of pinning to the shape's centre.
const tooltipOptions: L.TooltipOptions = {
  sticky: true,
  direction: "top",
  offset: [0, -10],
  className: "project-tooltip",
};

function projectTooltip(project: Project) {
  const tooltip = document.createElement("div");
  const title = document.createElement("strong");
  title.className = "block text-ui font-semibold";
  title.textContent = project.title;
  const meta = document.createElement("span");
  meta.className = "mt-0.5 block text-xs text-muted";
  meta.textContent = [
    categoryLabels(project.categories).join(", "),
    statuses[project.status].label,
    finishYear(project),
  ]
    .filter(Boolean)
    .join(" · ");
  tooltip.append(title, meta);
  return tooltip;
}

const layerOptions: ReadonlyArray<{
  value: MapLayer;
  label: string;
  swatch: string;
}> = [
  {
    value: "standard",
    label: "Oversiktskart",
    swatch:
      "bg-[linear-gradient(32deg,#e0e9d4_0_35%,white_35%_45%,#e9e4d8_45%_65%,#d4e4e0_65%)] saturate-[0.3] dark:bg-[linear-gradient(32deg,#1d201e_0_35%,#3b3e3c_35%_45%,#252826_45%_65%,#161a1c_65%)]",
  },
  {
    value: "streets",
    label: "Gatekart",
    swatch:
      "bg-[repeating-linear-gradient(36deg,transparent_0_8px,#fff_8px_11px,transparent_11px_24px),repeating-linear-gradient(-38deg,#e3ebd9_0_12px,#fff_12px_16px,#e7e2d9_16px_27px)]",
  },
  {
    value: "osm",
    label: "OpenStreetMap",
    swatch:
      "bg-[repeating-linear-gradient(-38deg,transparent_0_9px,#f7fabf_9px_12px,transparent_12px_22px),repeating-linear-gradient(40deg,#f2efe9_0_10px,#e8a7a3_10px_13px,#cdebb0_13px_25px)]",
  },
];

// Rows as in the other menus: a tint on hover, the chosen one checked.
const layerOptionButton = cn(
  "flex min-h-11 w-full items-center gap-2.5 rounded-lg px-1.5 py-1 text-left text-ui text-ink -outline-offset-2",
  "transition-colors duration-150 motion-reduce:transition-none",
  "hover:bg-surface-muted focus-visible:bg-surface-muted aria-pressed:font-medium",
);
// A map layer's preview, or an overlay's icon in the same frame.
const layerThumb =
  "flex h-8 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-surface";

// The outline's colour follows the base map: `.draw-shape` in project-map.css.
const drawStroke = { className: "draw-shape", interactive: false };
// Hit areas are larger than the dots, so points are easy to grab on touch.
const vertexIcon = L.divIcon({
  className: "draw-vertex",
  iconSize: [26, 26],
});
// The end of a route that new points extend.
const vertexEndIcon = L.divIcon({
  className: "draw-vertex draw-vertex-end",
  iconSize: [26, 26],
});
const midpointIcon = L.divIcon({
  className: "draw-midpoint",
  iconSize: [22, 22],
});

/**
 * OpenStreetMap candidates, for moderators: drawn beneath the projects, so
 * a project over one still takes the click.
 */
export type OsmLine = {
  candidate: OsmCandidate;
  title: string;
  /** New, already covered by a project, or hidden by a moderator. */
  state: "new" | "exists" | "dismissed";
  /** The covering project's title. */
  match?: string;
};
export type OsmLayer = {
  lines: OsmLine[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
};
/** A switchable layer in the layer menu, such as the OSM mode. */
export type MapOverlay = {
  label: string;
  icon: ReactNode;
  on: boolean;
  onToggle: () => void;
};
const osmLineWeight = (selected: boolean) => (selected ? 6 : 3.5);
// Proposed lines dotted: round dots spaced evenly at every zoom.
const osmDots = "0.1 7";

function osmTooltip({ candidate, title, match }: OsmLine) {
  const tooltip = document.createElement("div");
  const heading = document.createElement("strong");
  heading.className = "block text-ui font-semibold";
  heading.textContent = title;
  const meta = document.createElement("span");
  meta.className = "mt-0.5 block text-xs text-muted";
  meta.textContent = [
    osmStatusLabels[candidate.status],
    osmModeLabels[candidate.mode],
    candidate.ref && formatRef(candidate.ref),
    formatLength(candidate.length),
  ]
    .filter(Boolean)
    .join(" · ");
  tooltip.append(heading, meta);
  if (match) {
    const exists = document.createElement("span");
    exists.className = "mt-0.5 block text-xs text-muted";
    exists.textContent = `Finnes: ${match}`;
    tooltip.append(exists);
  }
  return tooltip;
}

/** Moves the explorer map from outside, e.g. to frame an opened project. */
export type MapApi = {
  /**
   * Frames the points; `bottom` keeps room for a sheet over the map, `left`
   * for a panel over its left edge, `top` for a card over its top.
   */
  fit: (
    points: Point[],
    options?: {
      bottom?: number;
      left?: number;
      top?: number;
      maxZoom?: number;
    },
  ) => void;
  /**
   * Centers the points in the part of the map a sheet leaves open, at the
   * current zoom; zoomed far out, it zooms in to frame them.
   */
  center: (points: Point[], options?: { bottom?: number; maxZoom?: number }) => void;
  /**
   * Shows the view; with `area`, the middle of that area is centered above
   * a sheet that may have grown since, at the view's zoom.
   */
  show: (view: MapView, area?: ViewBounds) => void;
  showNorway: () => void;
  /** The view down to `inset` pixels above the map's bottom edge. */
  boundsAbove: (inset: number) => ViewBounds;
  /**
   * The map follows its container on its own, keeping the geography on
   * screen in place; `syncSize` does so at once. While the container is
   * resized by hand, views are reported once it ends.
   */
  beginResize: () => void;
  syncSize: () => void;
  endResize: () => void;
  /**
   * Draws the project like the selected one, e.g. while its list card is
   * hovered. Outside React, so hovering re-renders nothing.
   */
  highlight: (id: string | null) => void;
};
export type MapViewChange = MapView & {
  bounds: ViewBounds;
  /** Mid-pan or mid-zoom: the map hasn't settled on this view. */
  moving?: boolean;
};
// Vector maps from OpenFreeMap: free, without keys or limits, and drawn
// by the browser, so labels and lines are sharp at any pixel density and at
// half zoom steps. Positron is a quiet grey base for the projects, and Dark
// its counterpart in dark mode; Liberty is a street map, light in both.
// OpenStreetMap's own map is raster, but it draws what the vector styles
// leave out, such as lines under construction, so it's the default when
// drawing a project.
const osmAttribution =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>';
const osmStyle: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution: osmAttribution,
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};
const mapStyles: Record<MapLayer, string | maplibregl.StyleSpecification> = {
  standard: "https://tiles.openfreemap.org/styles/positron",
  streets: "https://tiles.openfreemap.org/styles/liberty",
  osm: osmStyle,
};
const darkStandardStyle = "https://tiles.openfreemap.org/styles/dark";
const norwegianName: maplibregl.ExpressionSpecification = [
  "coalesce",
  ["get", "name:no"],
  ["get", "name"],
];
/**
 * Norwegian place names, not the English ones the styles prefer. On the
 * overview map the labels step back behind the projects.
 */
function localize(
  style: maplibregl.StyleSpecification,
  standard: boolean,
): maplibregl.StyleSpecification {
  return {
    ...style,
    layers: style.layers.map((layer) => {
      if (layer.type !== "symbol") return layer;
      const named = JSON.stringify(layer.layout?.["text-field"] ?? "").includes("name");
      // Keys are only set when changed: MapLibre rejects an undefined `paint`.
      const next = { ...layer };
      if (named) next.layout = { ...layer.layout, "text-field": norwegianName };
      if (standard)
        next.paint = { ...layer.paint, "text-opacity": 0.8, "icon-opacity": 0.8 };
      return next;
    }),
  };
}
const mapAttribution =
  '<a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/" target="_blank" rel="noreferrer">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>';
// The parts of the MapLibre bridge that follow the map's size.
type GlLayerInternals = {
  _resize: () => void;
  _transitionEnd: () => void;
  _resizeContainer: () => void;
  _update: () => void;
  _zooming?: boolean;
};
/**
 * Playwright runs set NEXT_PUBLIC_BASEMAP=off: drawing vector tiles with
 * software WebGL is slow there and loads them over the network. A spec that
 * needs the base map opts in with `localStorage["varde:basemap"] = "on"`.
 */
function basemapEnabled() {
  if (process.env.NEXT_PUBLIC_BASEMAP !== "off") return true;
  try {
    return localStorage.getItem("varde:basemap") === "on";
  } catch {
    return false;
  }
}
// Stable defaults, so drawing maps don't rebuild their layers on each render.
/** The layers drawn for one project. */
type DrawnProject = {
  project: Project;
  shape: L.Polygon | L.Polyline;
  /** Alignments only: a casing under the line, and a wider band to hit. */
  casing?: L.Polyline;
  /** Roads only: the white stretches inside the band. */
  stripes?: L.Polyline;
  hit?: L.Polyline;
  dot: L.CircleMarker;
  /** An alignment's extent, which decides whether it can join a group. */
  bounds?: L.LatLngBounds;
  /** Where it groups, in zoom-0 pixels: distances at zoom z shrink by 2^z. */
  anchor: L.Point;
};

const noProjects: Project[] = [];
const noPoints: Point[] = [];
const noSelect = () => {};
const noOverlays: MapOverlay[] = [];

type Props = {
  projects?: Project[];
  /** Drawing maps open on this place's preset view. */
  city?: string;
  /** Explorer: where to open; otherwise the last view here, or all of Norway. */
  initialView?: MapView | null;
  onViewChange?: (view: MapViewChange) => void;
  onReady?: (api: MapApi) => void;
  /** The user starts panning or zooming the map by hand: a drag, a pinch or a double tap. */
  onGestureStart?: () => void;
  /**
   * The user moves the map by hand in any way: a drag, a pinch, the wheel,
   * a double tap, the keyboard or the zoom buttons.
   */
  onUserMove?: () => void;
  /**
   * Pixels along the bottom that a sheet covers, such as the mobile drawer.
   * Reported bounds leave them out, and framing keeps clear of them.
   */
  bottomInset?: () => number;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  draw?: boolean;
  /** Small inline map: no layer menu. */
  compact?: boolean;
  /** A preview framed on its projects; the explorer's view is left alone. */
  frame?: boolean;
  points?: Point[];
  geometryType?: "area" | "line";
  /** Every drawing edit: added, moved, inserted or removed points. */
  onPointsChange?: (points: Point[]) => void;
  /** A route grows from its first point instead of its last. */
  extendFromStart?: boolean;
  /**
   * Where the zoom and layer controls go instead of over the map, such as a
   * slot on the mobile drawer so they move with it. `null` holds them back
   * until that slot exists.
   */
  controlsContainer?: HTMLElement | null;
  /** Moderators' OpenStreetMap mode. */
  osm?: OsmLayer;
  /** Switchable layers in the layer menu; the button shows when one is on. */
  overlays?: MapOverlay[];
};
export default function ProjectMap({
  projects = noProjects,
  city,
  initialView = null,
  onViewChange,
  onReady,
  onGestureStart,
  onUserMove,
  bottomInset,
  selectedId = null,
  onSelect = noSelect,
  draw = false,
  compact = false,
  frame = false,
  points = noPoints,
  geometryType = "area",
  onPointsChange,
  extendFromStart = false,
  controlsContainer,
  osm,
  overlays = noOverlays,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  // Each project's layers, in drawing order, kept while the project is
  // unchanged so filtering touches only the projects that come and go.
  const drawnRef = useRef(new Map<string, DrawnProject>());
  const drawProjectsRef = useRef<(projects: Project[]) => void>(() => {});
  // Regroups projects, e.g. so the selected one leaves its group.
  const clusterRef = useRef(() => {});
  // The group each grouped project is drawn in, as of the last grouping.
  const groupOfRef = useRef(new Map<string, L.Marker>());
  // Restyles one project for the current selection and highlight.
  const styleRef = useRef<(id: string | null) => void>(() => {});
  const projectsRef = useRef(projects);
  // Editing an existing shape opens framed on it.
  const initialPoints = useRef(points);
  const startView = useRef(initialView);
  const selectedRef = useRef(selectedId);
  const highlightedRef = useRef<string | null>(null);
  const handlers = useRef<{
    onSelect: (id: string | null) => void;
      onViewChange?: (view: MapViewChange) => void;
    onReady?: (api: MapApi) => void;
    onGestureStart?: () => void;
    onUserMove?: () => void;
    bottomInset?: () => number;
    draw: boolean;
    commit: (next: Point[]) => void;
  }>({ onSelect, onViewChange, onReady, draw, commit: () => {} });
  const resizing = useRef(false);
  // Set while the map catches up with its container's new size and place.
  const syncing = useRef(false);
  const syncRef = useRef(() => {});
  // Resizes, places and draws the base map at once.
  const refreshBase = useRef<() => boolean>(() => false);
  // The base map, and the style it was last given.
  const glRef = useRef<maplibregl.Map | null>(null);
  const glStyle = useRef<string | maplibregl.StyleSpecification | null>(null);
  const osmSelect = useRef(osm?.onSelect);
  const osmSelected = useRef(osm?.selectedId ?? null);
  // Restyles one candidate for the current selection.
  const osmStyle = useRef<(id: string | null) => void>(() => {});
  const [ready, setReady] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [layer, setLayer] = useState<MapLayer>(draw ? "osm" : "standard");
  const [mapMessage, setMapMessage] = useState("");
  // On a drawer the map's credits ride with the controls, folded behind a
  // button once the map is moved. They show in full until then.
  const docked = controlsContainer !== undefined;
  const [creditsOpen, setCreditsOpen] = useState(true);
  // Shapes outlined to stand out from the base map; see project-map.css.
  const darkBase = useTheme() === "dark" && layer === "standard";
  const baseStyle = darkBase ? darkStandardStyle : mapStyles[layer];
  const layerMenu = useRef<HTMLDivElement>(null);
  const layerButton = useRef<HTMLButtonElement>(null);
  // Phones choose a layer from a sheet; the sheet minds its own focus.
  const mobile = useMediaQuery(mobileQuery);
  useEffect(() => {
    if (!layersOpen || mobile) return;
    layerMenu.current
      ?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')
      ?.focus();
    const dismiss = (event: PointerEvent) => {
      if (
        !layerMenu.current?.contains(event.target as Node) &&
        !layerButton.current?.contains(event.target as Node)
      )
        setLayersOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        setLayersOpen(false);
        layerButton.current?.focus();
      }
    };
    document.addEventListener("pointerdown", dismiss);
    window.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("keydown", escape, true);
    };
  }, [layersOpen, mobile]);
  useEffect(() => {
    handlers.current = {
      onSelect,
      onViewChange,
      onReady,
      onGestureStart,
      onUserMove,
      bottomInset,
      draw,
      commit(next) {
        onPointsChange?.(next);
      },
    };
  }, [
    onSelect,
    onViewChange,
    onReady,
    onGestureStart,
    onUserMove,
    bottomInset,
    draw,
    onPointsChange,
  ]);
  useEffect(() => {
    if (!container.current) return;
    const map = L.map(container.current, {
      zoomControl: false,
      attributionControl: false,
      // Explorer: half steps, so all of Norway fits snugly above the mobile
      // drawer as well as beside the desktop list.
      minZoom: draw ? 4 : 3,
      zoomSnap: draw ? 1 : 0.5,
      maxZoom: 19,
      doubleClickZoom: !draw,
      // The container is watched instead (below), which also sees panels.
      trackResize: false,
    }).setView(cities.Oslo.center, 13);
    L.control
      .attribution({ position: "bottomright", prefix: false })
      .addTo(map);
    // Previews are too small for a scale bar; it would cover place labels.
    if (!frame)
      L.control
        .scale({ imperial: false, position: "bottomleft", maxWidth: 80 })
        .addTo(map);
    mapRef.current = map;
    map.on("click", () => {
      if (!handlers.current.draw) handlers.current.onSelect(null);
    });
    map.on("dragstart", () => {
      setCreditsOpen(false);
      handlers.current.onUserMove?.();
      handlers.current.onGestureStart?.();
    });
    // The container grows and shrinks as panels beside it open, close and
    // resize. The geography on screen stays where it is: the edge that moves
    // uncovers or covers map, it doesn't drag it along. Run before paint, so
    // there's no frame where the map has jumped.
    const element = container.current;
    let edge = element.getBoundingClientRect();
    const pane = map.getPane("mapPane")!;
    syncRef.current = () => {
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const offset = L.point(rect.left - edge.left, rect.top - edge.top);
      const resized =
        rect.width !== edge.width || rect.height !== edge.height;
      edge = rect;
      if (!resized && !offset.x && !offset.y) return;
      syncing.current = true;
      // Keeps the top-left corner's geography; the offset covers the rest.
      map.invalidateSize({ pan: false });
      if (offset.x || offset.y)
        L.DomUtil.setPosition(
          pane,
          L.DomUtil.getPosition(pane).subtract(offset),
        );
      syncing.current = false;
      refreshBase.current();
      // Panning without a view reset, so tiles stay instead of reloading.
      map.fire("move").fire("moveend");
    };
    const sync = () => syncRef.current();
    const resize = new ResizeObserver(sync);
    resize.observe(element);
    // The container can also move without resizing.
    window.addEventListener("resize", sync);
    // Browsers with swipe navigation anywhere on the page (Arc Search) take
    // a sideways drag as back or forward unless the page cancels its first
    // move. Leaflet only cancels moves past its click tolerance, so every
    // move on the map is cancelled here. Touchstart isn't, so taps still click.
    const claimTouch = (event: TouchEvent) => {
      if (event.cancelable && map.dragging.enabled()) event.preventDefault();
    };
    element.addEventListener("touchmove", claimTouch, { passive: false });
    // Shapes are drawn and clipped to the view plus a margin, and Leaflet
    // only redraws them once the map settles, so a long pan cut lines off at
    // the old edge. Redraw while panning, but only on the frames where the
    // view has left the drawn area, not on every one.
    const renderers = new Set<PanRenderer>();
    map.on("layeradd", ({ layer }) => {
      if (layer instanceof L.Renderer) renderers.add(layer as PanRenderer);
    });
    map.on("layerremove", ({ layer }) => {
      renderers.delete(layer as PanRenderer);
    });
    map.on("move", () => {
      if (!renderers.size) return;
      const size = map.getSize();
      const view = L.bounds(
        map.containerPointToLayerPoint([0, 0]),
        map.containerPointToLayerPoint(size),
      );
      const zoom = map.getZoom();
      for (const renderer of renderers) {
        // Zooming scales the drawing instead; shapes are reprojected after.
        if (renderer._zoom !== zoom || !renderer._bounds) continue;
        if (!renderer._bounds.contains(view)) renderer._update();
      }
    });
    // Moves by hand other than a drag; the map's own framing moves it too,
    // so its events can't tell them apart.
    const userMove = () => {
      setCreditsOpen(false);
      handlers.current.onUserMove?.();
    };
    const gesture = () => {
      userMove();
      handlers.current.onGestureStart?.();
    };
    const pinch = (event: TouchEvent) => {
      if (event.touches.length > 1) gesture();
    };
    const keyMove = (event: KeyboardEvent) => {
      if (/^(Arrow\w+|\+|-|=)$/.test(event.key)) userMove();
    };
    element.addEventListener("wheel", userMove, { passive: true });
    element.addEventListener("touchstart", pinch, { passive: true });
    element.addEventListener("dblclick", gesture);
    element.addEventListener("keydown", keyMove);
    setReady(true);
    return () => {
      resize.disconnect();
      window.removeEventListener("resize", sync);
      element.removeEventListener("touchmove", claimTouch);
      element.removeEventListener("wheel", userMove);
      element.removeEventListener("touchstart", pinch);
      element.removeEventListener("dblclick", gesture);
      element.removeEventListener("keydown", keyMove);
      syncRef.current = () => {};
      mapRef.current = null;
      map.stop();
      map.remove();
    };
  }, [draw, frame]);
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    // Whether the base map has drawn everything for the view; for tests.
    const root = mapRef.current.getContainer().parentElement;
    const idle = (value: boolean) =>
      root?.setAttribute("data-basemap", value ? "idle" : "loading");
    if (!basemapEnabled()) {
      idle(true);
      return;
    }
    // The style follows below, so a theme change restyles this map in place.
    const base = maplibreGL({
      attributionControl: { customAttribution: mapAttribution },
      // Draws a margin around the view, so panning shows map, not blank.
      padding: 0.15,
    } as L.LeafletMaplibreGLOptions) as L.MaplibreGL & GlLayerInternals;
    // The bridge follows a resize a frame later and lets MapLibre redraw
    // after another: for a frame or two the base map sat in the wrong place
    // or blank, a flicker whenever a panel resized the map. Instead its
    // canvas is resized, placed and drawn at once, before the next paint.
    const transitionEnd = base._transitionEnd;
    const refresh = () => {
      const glMap = base.getMaplibreMap();
      if (!glMap || base._zooming) return false;
      base._resizeContainer();
      base._update();
      glMap.resize();
      glMap.redraw();
      return true;
    };
    base._resize = function () {
      // The container sync places and draws it once it's done.
      if (syncing.current) return;
      if (!refresh()) transitionEnd.call(base);
    };
    refreshBase.current = refresh;
    base.addTo(mapRef.current);
    let failures = 0;
    const gl = base.getMaplibreMap();
    glRef.current = gl;
    glStyle.current = null;
    gl.on("error", () => {
      if (++failures > 4)
        setMapMessage("Kartet kunne ikke lastes. Prøv et annet kartlag.");
    });
    idle(false);
    gl.on("dataloading", () => idle(false));
    gl.on("movestart", () => idle(false));
    gl.on("idle", () => idle(true));
    // Only after failures, so loading tiles doesn't touch React state.
    gl.on("data", () => {
      if (!failures) return;
      failures = 0;
      setMapMessage("");
    });
    return () => {
      refreshBase.current = () => false;
      glRef.current = null;
      base.remove();
    };
  }, [ready, layer]);
  // Overview and dark overview share their tiles, so switching between them
  // only repaints: the map changes colour with the page, without reloading.
  useEffect(() => {
    const gl = glRef.current;
    if (!ready || !gl || glStyle.current === baseStyle) return;
    const standard = layer === "standard";
    gl.setStyle(baseStyle, {
      diff: glStyle.current !== null,
      transformStyle: (_, next) => localize(next, standard),
    });
    glStyle.current = baseStyle;
  }, [ready, layer, baseStyle]);
  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);
  // Drawing maps frame the shape being edited, or the place's preset view.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    // Previews frame their projects; the explorer's view is left alone.
    if (frame) {
      const shown = projectsRef.current.flatMap((project) => project.geometry);
      if (shown.length)
        map.fitBounds(L.latLngBounds(shown), { padding: [32, 32], maxZoom: 15 });
      return;
    }
    if (!draw) return;
    const place = city ? cities[city] : undefined;
    if (initialPoints.current.length)
      map.fitBounds(L.latLngBounds(initialPoints.current), {
        padding: [40, 40],
        maxZoom: 17,
      });
    else if (place) map.setView(place.center, place.zoom);
    else map.fitBounds(norwayBounds);
  }, [city, ready, draw, frame]);
  // The explorer reports every view, which filters the list and fills the URL.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || draw) return;
    const inset = () => handlers.current.bottomInset?.() ?? 0;
    const showNorway = (animate: boolean) =>
      map.fitBounds(norwayBounds, {
        paddingTopLeft: [16, 16],
        paddingBottomRight: [16, 16 + inset()],
        animate,
      });
    const start = startView.current ?? storedMapView();
    if (start) map.setView(start.center, start.zoom, { animate: false });
    else showNorway(false);
    const boundsAbove = (bottom: number): ViewBounds => {
      const size = map.getSize();
      const bounds = L.latLngBounds(
        map.containerPointToLatLng([0, 0]),
        map.containerPointToLatLng([size.x, Math.max(1, size.y - bottom)]),
      );
      return {
        south: bounds.getSouth(),
        west: bounds.getWest(),
        north: bounds.getNorth(),
        east: bounds.getEast(),
        zoom: map.getZoom(),
      };
    };
    const report = (moving = false) => {
      if (resizing.current || syncing.current) return;
      const center = map.getCenter();
      const view: MapView = {
        center: [center.lat, center.lng],
        zoom: map.getZoom(),
      };
      if (!moving) storeMapView(view);
      handlers.current.onViewChange?.({
        ...view,
        bounds: boundsAbove(inset()),
        moving,
      });
    };
    const settle = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      report();
    };
    // While it moves too, so the list follows the map, at most once a frame.
    let frame = 0;
    const move = () => {
      frame ||= requestAnimationFrame(() => {
        frame = 0;
        report(true);
      });
    };
    report();
    map.on("moveend", settle);
    map.on("move", move);
    const syncSize = () => syncRef.current();
    // Leaflet drops new views while a zoom animates, so they wait for its end.
    const settled = (move: () => void) => {
      map.off("zoomend", pending);
      pending = () => {
        map.off("zoomend", pending);
        move();
      };
      if ((map as unknown as { _animatingZoom?: boolean })._animatingZoom)
        map.on("zoomend", pending);
      else pending();
    };
    let pending = () => {};
    handlers.current.onReady?.({
      fit(points, { bottom = inset(), left = 0, top = 0, maxZoom = 15 } = {}) {
        if (!points.length) return;
        settled(() => {
          const bounds = L.latLngBounds(points);
          const options = {
            paddingTopLeft: L.point(64 + left, 64 + top),
            paddingBottomRight: L.point(80, 64 + bottom),
            maxZoom,
          };
          if (reducedMotion())
            map.fitBounds(bounds, { ...options, animate: false });
          // fitBounds jumps instead when the zoom changes by more than four
          // levels or the place is over a screen away, so it flies there.
          else map.flyToBounds(bounds, { ...options, duration: 0.8 });
        });
      },
      center(points, { bottom = inset(), maxZoom = 14 } = {}) {
        if (!points.length) return;
        settled(() => {
          const bounds = L.latLngBounds(points);
          const padding = L.point(128, 128 + bottom);
          const framing = Math.min(
            map.getBoundsZoom(bounds, false, padding),
            maxZoom,
          );
          const current = map.getZoom();
          // Far enough out that the project is a speck: frame it instead.
          const zoom = current < framing - 4 ? framing : current;
          const target = map.unproject(
            map
              .project(bounds.getSouthWest(), zoom)
              .add(map.project(bounds.getNorthEast(), zoom))
              .divideBy(2)
              .add([0, bottom / 2]),
            zoom,
          );
          if (reducedMotion()) map.setView(target, zoom, { animate: false });
          else if (zoom !== current) map.flyTo(target, zoom, { duration: 0.8 });
          // In step with the drawer sliding up (450ms, easing out).
          else map.panTo(target, { duration: 0.45, easeLinearity: 0.2 });
        });
      },
      show(view, area) {
        settled(() => {
          // At the zoom it had, the middle of that area centered in the part
          // of the map the sheet now leaves open.
          const bottom = inset();
          const center = area
            ? map.unproject(
                map
                  .project([area.south, area.west], view.zoom)
                  .add(map.project([area.north, area.east], view.zoom))
                  .divideBy(2)
                  .add([0, bottom / 2]),
                view.zoom,
              )
            : view.center;
          map.setView(center, view.zoom, { animate: !reducedMotion() });
        });
      },
      showNorway: () => settled(() => showNorway(!reducedMotion())),
      boundsAbove,
      beginResize() {
        resizing.current = true;
      },
      syncSize,
      endResize() {
        syncSize();
        resizing.current = false;
        report();
      },
      highlight(id) {
        const previous = highlightedRef.current;
        highlightedRef.current = id;
        if (previous === id) return;
        styleRef.current(previous);
        styleRef.current(id);
      },
    });
    return () => {
      cancelAnimationFrame(frame);
      map.off("moveend", settle);
      map.off("move", move);
      map.off("zoomend", pending);
    };
  }, [ready, draw]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const group = L.layerGroup().addTo(map);
    const dots = L.layerGroup().addTo(map);
    const dotRenderer = dotSvg(map);
    const clusters = L.layerGroup().addTo(map);
    const drawn = drawnRef.current;
    // Thin and dashed alignments get an invisible, wider band to hit: a
    // finger lands within 24px of the line either side.
    const hitWeight = window.matchMedia("(pointer: coarse)").matches ? 48 : 18;
    const select = (project: Project, shape: L.Path) => {
      const element = shape.getElement();
      // Focus comes back here when the project closes; a pointer shows no ring.
      if (element instanceof SVGElement)
        element.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
      handlers.current.onSelect(project.id);
    };
    const add = (project: Project): DrawnProject => {
      const color = statuses[project.status].color;
      const selected = project.id === selectedRef.current;
      const line = project.geometryType === "line";
      const mode = lineMode(project);
      const options = {
        color,
        bubblingMouseEvents: false,
        fillColor: color,
        dashArray: dashes[project.status]?.area,
        ...projectStyle(project, selected),
      };
      // A casing in the base map's tone keeps thin alignments crisp. Rails
      // go without, so the map shows between their dashes.
      const casing =
        line && mode !== "rail"
        ? L.polyline(project.geometry, {
            className: "project-casing",
            weight: options.weight + 4,
            opacity: 0.95,
            lineCap: "round",
            lineJoin: "round",
            interactive: false,
          }).addTo(group)
        : undefined;
      const shape = line
        ? L.polyline(project.geometry, {
            ...options,
            lineCap:
              project.status === "planned" || mode === "rail" ? "butt" : "round",
            lineJoin: "round",
            // Rail and road keep their pattern; colour tells the status.
            dashArray: mode ? options.dashArray : dashes[project.status]?.line,
          })
        : L.polygon(project.geometry, options);
      shape.addTo(group);
      const stripes =
        mode === "road"
          ? L.polyline(project.geometry, {
              className: "project-stripes",
              color: "#fff",
              opacity: 1,
              lineCap: "butt",
              lineJoin: "round",
              interactive: false,
              ...roadStripes(selected),
            }).addTo(group)
          : undefined;
      shape.on("click", (event) => {
        L.DomEvent.stopPropagation(event);
        select(project, shape);
      });
      const element = shape.getElement();
      let hit: L.Polyline | undefined;
      if (line && element instanceof SVGElement) {
        // The band takes the pointer; the drawn line keeps focus and styling.
        element.style.pointerEvents = "none";
        hit = L.polyline(project.geometry, {
          className: "project-hit",
          opacity: 0,
          weight: hitWeight,
          lineCap: "round",
          lineJoin: "round",
          bubblingMouseEvents: false,
        })
          .addTo(group)
          .on("click", (event) => {
            L.DomEvent.stopPropagation(event);
            select(project, shape);
          })
          .on("mouseover", () => element.classList.add("is-hovered"))
          .on("mouseout", () => element.classList.remove("is-hovered"))
          .bindTooltip(projectTooltip(project), tooltipOptions);
      }
      if (element && !draw) {
        element.setAttribute("tabindex", "0");
        element.setAttribute("role", "button");
        element.setAttribute(
          "aria-label",
          `${project.title}, ${statuses[project.status].label}`,
        );
        element.setAttribute("data-project-id", project.id);
        element.addEventListener("keydown", (event) => {
          if (!(event instanceof KeyboardEvent)) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            handlers.current.onSelect(project.id);
          }
        });
      }
      if (!line) shape.bindTooltip(projectTooltip(project), tooltipOptions);
      // Zoomed out, areas are a few pixels wide and alignments a scribble.
      const dot = L.circleMarker(
        line ? lineMidpoint(project.geometry) : project.center,
        {
          // Slides along with the tiles while the map zooms; see dotSvg.
          className: "project-dot leaflet-zoom-animated",
          renderer: dotRenderer,
          radius: dotRadius(selected),
          weight: 2,
          fillColor: color,
          fillOpacity: 1,
          bubblingMouseEvents: false,
        },
      )
        .on("click", (event) => {
          L.DomEvent.stopPropagation(event);
          handlers.current.onSelect(project.id);
        })
        .bindTooltip(projectTooltip(project), tooltipOptions);
      // Each add draws a new element, which picks up the current selection.
      dot.on("add", () => {
        const element = dot.getElement();
        if (!(element instanceof SVGElement)) return;
        element.classList.toggle(
          "is-selected",
          project.id === selectedRef.current,
        );
        // An alignment's line is hidden while it's a dot, so the dot takes focus.
        if (line && !draw) {
          element.setAttribute("tabindex", "0");
          element.setAttribute("role", "button");
          element.setAttribute(
            "aria-label",
            `${project.title}, ${statuses[project.status].label}`,
          );
          element.setAttribute("data-project-dot", project.id);
          element.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              event.stopPropagation();
              handlers.current.onSelect(project.id);
            }
          });
        }
      });
      return {
        project,
        shape,
        casing,
        stripes,
        hit,
        dot,
        bounds: line ? L.latLngBounds(project.geometry) : undefined,
        anchor: map.project(line ? dot.getLatLng() : project.center, 0),
      };
    };
    const remove = ({ shape, casing, stripes, hit, dot }: DrawnProject) => {
      for (const layer of [casing, shape, stripes, hit])
        if (layer) group.removeLayer(layer);
      dots.removeLayer(dot);
    };
    const eligible = ({ project, bounds }: DrawnProject, zoom: number) => {
      // The open project stands on its own; a hovered one lights up its
      // group instead.
      if (project.id === selectedRef.current) return false;
      return !(
        bounds &&
        zoom >= lineDotZoom &&
        map
          .project(bounds.getNorthWest(), zoom)
          .distanceTo(map.project(bounds.getSouthEast(), zoom)) >
          clusterLineExtent
      );
    };
    // Groups are built zoom step by zoom step from the first grouped level
    // down, each level merging the groups of the one above. Zooming out only
    // merges groups and zooming in only splits them, and a group sits at
    // the mean of its members, so the same group is always in the same place.
    const groupsAt = (zoom: number) => {
      const step = map.options.zoomSnap || 1;
      const levels: number[] = [];
      for (let level = clusterZoom - step; level > zoom; level -= step)
        levels.push(level);
      levels.push(zoom);
      type Node = { members: DrawnProject[]; at: L.Point };
      let nodes: Node[] = [];
      const placed = new Set<string>();
      for (const level of levels) {
        for (const entry of drawn.values())
          if (!placed.has(entry.project.id) && eligible(entry, level)) {
            placed.add(entry.project.id);
            nodes.push({ members: [entry], at: entry.anchor });
          }
        const radius = clusterRadius / map.getZoomScale(level, 0);
        const used = new Set<Node>();
        const merged: Node[] = [];
        for (const seed of nodes) {
          if (used.has(seed)) continue;
          const near = nodes.filter(
            (node) => !used.has(node) && node.at.distanceTo(seed.at) <= radius,
          );
          for (const node of near) used.add(node);
          const members = near.flatMap((node) => node.members);
          merged.push({
            members,
            at: members
              .reduce((sum, entry) => sum.add(entry.anchor), L.point(0, 0))
              .divideBy(members.length),
          });
        }
        nodes = merged;
      }
      return nodes.filter((node) => node.members.length > 1);
    };
    // Group markers by their members; an unchanged group keeps its marker.
    const groupMarkers = new Map<string, L.Marker>();
    const groupOf = groupOfRef.current;
    const cluster = () => {
      groupOf.clear();
      const zoom = map.getZoom();
      const grouped = new Set<string>();
      const kept = new Set<string>();
      if (zoom < clusterZoom)
        for (const { members, at } of groupsAt(zoom)) {
          const list = members.map((entry) => entry.project);
          const key = list
            .map((project) => project.id)
            .sort()
            .join(" ");
          kept.add(key);
          for (const project of list) grouped.add(project.id);
          let marker = groupMarkers.get(key);
          if (!marker) {
            marker = L.marker(map.unproject(at, 0), {
              icon: clusterIcon(list.length),
              keyboard: true,
              bubblingMouseEvents: false,
            })
              .addTo(clusters)
              .on("click", (event) => {
                L.DomEvent.stopPropagation(event);
                zoomToGroup(list);
              });
            const element = marker.getElement();
            element?.setAttribute("aria-label", `${list.length} prosjekter`);
            element?.setAttribute("data-cluster", key);
            groupMarkers.set(key, marker);
          }
          for (const project of list) groupOf.set(project.id, marker);
          marker
            .getElement()
            ?.classList.toggle(
              "is-highlighted",
              list.some((project) => project.id === highlightedRef.current),
            );
        }
      for (const [key, marker] of groupMarkers)
        if (!kept.has(key)) {
          clusters.removeLayer(marker);
          groupMarkers.delete(key);
        }
      for (const { project, shape, casing, stripes, hit, dot } of drawn.values()) {
        const line = project.geometryType === "line";
        const ungrouped = !grouped.has(project.id);
        const dotted = zoom < (line ? lineDotZoom : clusterZoom);
        // Areas keep their outline under the dot; alignments give way to it.
        const shown = ungrouped && !(line && dotted);
        for (const layer of [shape, casing, stripes, hit]) {
          const element = layer?.getElement();
          if (element instanceof SVGElement)
            element.style.display = shown ? "" : "none";
          if (!shown) layer?.closeTooltip();
        }
        if (ungrouped && dotted) dots.addLayer(dot);
        else dots.removeLayer(dot);
      }
    };
    // Zooms in far enough to frame the group, at least one step, in the
    // part of the map no sheet covers.
    const zoomToGroup = (list: Project[]) => {
      const bounds = L.latLngBounds(list.flatMap((project) => project.geometry));
      const topLeft = L.point(48, 48);
      const bottomRight = L.point(48, 48 + (handlers.current.bottomInset?.() ?? 0));
      const zoom = Math.min(
        Math.max(
          map.getBoundsZoom(bounds, false, topLeft.add(bottomRight)),
          map.getZoom() + 1,
        ),
        map.getMaxZoom(),
      );
      const center = map.unproject(
        map
          .project(bounds.getSouthWest(), zoom)
          .add(map.project(bounds.getNorthEast(), zoom))
          .divideBy(2)
          .add(bottomRight.subtract(topLeft).divideBy(2)),
        zoom,
      );
      if (reducedMotion()) map.setView(center, zoom, { animate: false });
      else map.flyTo(center, zoom, { duration: 0.6 });
    };
    const style = (id: string | null) => {
      const entry = id ? drawn.get(id) : undefined;
      if (!id || !entry) return;
      const { project, shape, casing, stripes, hit, dot } = entry;
      const isSelected = id === selectedRef.current;
      const emphasized = isSelected || id === highlightedRef.current;
      // The open project stays at full strength; the rest step back.
      for (const layer of [shape, casing, stripes, dot])
        layer?.getElement()?.classList.toggle("is-selected", isSelected);
      const shapeOptions = projectStyle(project, emphasized);
      shape.setStyle(shapeOptions);
      casing?.setStyle({ weight: shapeOptions.weight + 4 });
      stripes?.setStyle(roadStripes(emphasized));
      dot.setRadius(dotRadius(emphasized));
      const group = groupOf.get(id);
      // Inside a group, the group lights up in its place.
      group
        ?.getElement()
        ?.classList.toggle(
          "is-highlighted",
          groupOf.get(highlightedRef.current ?? "") === group,
        );
      if (!emphasized || group) return;
      const element = shape.getElement();
      const wasFocused = element === document.activeElement;
      casing?.bringToFront();
      shape.bringToFront();
      stripes?.bringToFront();
      hit?.bringToFront();
      if (wasFocused && element instanceof SVGElement)
        element.focus({ preventScroll: true });
      shape.closeTooltip();
    };
    // A hovered card's project shows its tooltip centred over it: over the
    // group it sits in, its dot, the midpoint of its line or the top of its
    // area, kept on the map for an area larger than the view.
    const hint = L.tooltip({
      ...tooltipOptions,
      sticky: false,
      interactive: false,
    });
    let hintId: string | null = null;
    const placeHint = () => {
      const id = highlightedRef.current;
      const entry = id ? drawn.get(id) : undefined;
      if (!id || !entry || id === selectedRef.current) {
        hint.remove();
        hintId = null;
        return;
      }
      const { project, shape, dot } = entry;
      const group = groupOf.get(id);
      const line = project.geometryType === "line";
      const area = !group && !line && !dots.hasLayer(dot);
      const bounds = area ? shape.getBounds() : undefined;
      const at = group
        ? group.getLatLng()
        : bounds
          ? L.latLng(
              Math.min(bounds.getNorth(), map.getBounds().getNorth()),
              bounds.getCenter().lng,
            )
          : dot.getLatLng();
      // Clear of the marker or line the tooltip points at.
      const lift = group
        ? (group.getElement()?.offsetHeight ?? 32) / 2
        : dots.hasLayer(dot)
          ? dotRadius(true) + 1
          : line
            ? lineWeight(true) / 2
            : 2;
      hint.options.offset = [0, -(lift + 4)];
      if (hintId !== id) hint.setContent(projectTooltip(project));
      hintId = id;
      hint.setLatLng(at);
      if (!map.hasLayer(hint)) hint.addTo(map);
    };
    // Projects that stay keep their layers; changed ones are drawn afresh.
    const drawProjects = (projects: Project[]) => {
      const wanted = new Map(projects.map((project) => [project.id, project]));
      let changed = false;
      for (const [id, entry] of drawn)
        if (wanted.get(id) !== entry.project) {
          remove(entry);
          drawn.delete(id);
          changed = true;
        }
      const kept = drawn.size;
      const order = [...wanted.values()].map(
        (project) => drawn.get(project.id) ?? add(project),
      );
      const added = order.length > kept;
      changed ||= added;
      // Grouping and stacking follow the order the projects come in.
      const before = [...drawn.keys()].join();
      drawn.clear();
      for (const entry of order) drawn.set(entry.project.id, entry);
      if (!changed && before === [...drawn.keys()].join()) return;
      // New shapes land on top; the rest move to stack as if drawn afresh.
      if (added && kept) {
        const focused = document.activeElement;
        for (const { casing, shape, stripes, hit } of order) {
          casing?.bringToFront();
          shape.bringToFront();
          stripes?.bringToFront();
          hit?.bringToFront();
        }
        if (focused instanceof SVGElement && focused !== document.activeElement)
          focused.focus({ preventScroll: true });
      }
      cluster();
      style(highlightedRef.current);
      placeHint();
    };
    styleRef.current = (id) => {
      style(id);
      placeHint();
    };
    clusterRef.current = () => {
      cluster();
      placeHint();
    };
    drawProjectsRef.current = drawProjects;
    const regroup = clusterRef.current;
    map.on("zoomend", regroup);
    return () => {
      map.off("zoomend", regroup);
      hint.remove();
      clusterRef.current = () => {};
      styleRef.current = () => {};
      drawProjectsRef.current = () => {};
      groupOf.clear();
      group.remove();
      dots.remove();
      dotRenderer.remove();
      clusters.remove();
      drawn.clear();
    };
  }, [ready, draw]);
  useEffect(() => {
    drawProjectsRef.current(projects);
  }, [projects, ready, draw]);
  // Only the projects whose state changed are touched.
  useEffect(() => {
    const previous = selectedRef.current;
    selectedRef.current = selectedId;
    if (previous === selectedId) return;
    // The open project leaves its group, and a closed one may rejoin it.
    clusterRef.current();
    styleRef.current(previous);
    styleRef.current(selectedId);
  }, [selectedId]);
  useEffect(() => {
    osmSelect.current = osm?.onSelect;
  });
  const osmLines = osm?.lines;
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || draw || !osmLines?.length) return;
    // Just under the overlay pane, which holds the projects.
    if (!map.getPane("osm")) map.createPane("osm").style.zIndex = "390";
    const group = L.layerGroup().addTo(map);
    const hitWeight = window.matchMedia("(pointer: coarse)").matches ? 26 : 16;
    const drawn = new Map<
      string,
      { item: OsmLine; casing: L.Polyline; line: L.Polyline; hit?: L.Polyline }
    >();
    // Casings first, so no candidate's halo cuts through another's line.
    const casings = osmLines.map((item) =>
      L.polyline(item.candidate.lines, {
        pane: "osm",
        className: "project-casing",
        weight: osmLineWeight(false) + 4,
        opacity: item.state === "dismissed" ? 0.4 : 0.9,
        lineCap: "round",
        lineJoin: "round",
        interactive: false,
      }).addTo(group),
    );
    osmLines.forEach((item, index) => {
      const { candidate, state } = item;
      const line = L.polyline(candidate.lines, {
        pane: "osm",
        className: "osm-line",
        color: osmColors[candidate.kind],
        weight: osmLineWeight(false),
        opacity: state === "dismissed" ? 0.45 : 1,
        dashArray: candidate.status === "proposed" ? osmDots : undefined,
        lineCap: "round",
        lineJoin: "round",
        interactive: false,
      }).addTo(group);
      const element = line.getElement();
      element?.setAttribute("data-osm-id", candidate.id);
      element?.setAttribute("data-osm-state", state);
      drawn.set(candidate.id, { item, casing: casings[index], line });
    });
    for (const [id, entry] of drawn) {
      entry.hit = L.polyline(entry.item.candidate.lines, {
        pane: "osm",
        className: "project-hit",
        opacity: 0,
        weight: hitWeight,
        lineCap: "round",
        lineJoin: "round",
        bubblingMouseEvents: false,
      })
        .addTo(group)
        .on("click", (event) => {
          L.DomEvent.stopPropagation(event);
          osmSelect.current?.(id);
        })
        .on("mouseover", () =>
          entry.line.getElement()?.classList.add("is-hovered"),
        )
        .on("mouseout", () =>
          entry.line.getElement()?.classList.remove("is-hovered"),
        )
        .bindTooltip(osmTooltip(entry.item), tooltipOptions);
      entry.hit.getElement()?.setAttribute("data-osm-hit", id);
    }
    const style = (id: string | null) => {
      const entry = id && drawn.get(id);
      if (!entry) return;
      const selected = id === osmSelected.current;
      const weight = osmLineWeight(selected);
      entry.line.setStyle({ weight });
      entry.casing.setStyle({ weight: weight + 4 });
      for (const layer of [entry.line, entry.casing])
        layer.getElement()?.classList.toggle("is-selected", selected);
      if (!selected) return;
      entry.casing.bringToFront();
      entry.line.bringToFront();
      entry.hit?.bringToFront();
      entry.hit?.closeTooltip();
    };
    osmStyle.current = style;
    style(osmSelected.current);
    const deselect = () => osmSelect.current?.(null);
    map.on("click", deselect);
    return () => {
      map.off("click", deselect);
      osmStyle.current = () => {};
      group.remove();
    };
  }, [ready, draw, osmLines]);
  const osmSelectedId = osm?.selectedId ?? null;
  useEffect(() => {
    const previous = osmSelected.current;
    osmSelected.current = osmSelectedId;
    if (previous === osmSelectedId) return;
    osmStyle.current(previous);
    osmStyle.current(osmSelectedId);
  }, [osmSelectedId]);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !draw) return;
    const group = L.layerGroup().addTo(map);
    const area = geometryType === "area";
    const commit = (next: Point[]) => handlers.current.commit(next);
    const toPoint = (latlng: L.LatLng): Point => [latlng.lat, latlng.lng];
    // A route with two or more points grows from one of its ends.
    const route = !area && points.length > 1;
    const fromStart = route && extendFromStart;
    const end = fromStart ? 0 : points.length - 1;
    const extended = (point: Point) =>
      fromStart ? [point, ...points] : [...points, point];
    const outline = (list: Point[]) =>
      area && list.length > 2
        ? L.polygon(list, { ...drawStroke, fillOpacity: 0.18, weight: 2.5 })
        : L.polyline(list, { ...drawStroke, weight: 3 });
    let shape = outline(points).addTo(group);
    // While a handle moves, the outline follows it without a re-render.
    const reshape = (list: Point[]) => {
      if ((area && list.length > 2) !== shape instanceof L.Polygon) {
        shape.remove();
        shape = outline(list).addTo(group);
      } else shape.setLatLngs(list);
    };
    // Fine pointers see where the next point lands before placing it.
    const preview = L.polyline([], {
      ...drawStroke,
      weight: 2,
      opacity: 0.7,
      dashArray: "4 6",
    }).addTo(group);
    const midpoints = L.layerGroup().addTo(group);
    const hover = window.matchMedia("(hover: hover)").matches;
    // Set while a handle is dragged, so the preview stays out of the way.
    let editing = false;
    const startEditing = () => {
      editing = true;
      preview.setLatLngs([]);
      midpoints.remove();
    };
    points.forEach((point, index) => {
      const vertex = L.marker(point, {
        icon: route && index === end ? vertexEndIcon : vertexIcon,
        draggable: true,
        autoPan: true,
        keyboard: false,
        zIndexOffset: 1000,
      }).addTo(group);
      if (hover)
        vertex.bindTooltip("Dra for å flytte · klikk for å fjerne", {
          direction: "top",
          offset: [0, -10],
          className: "project-tooltip",
        });
      const moved = () => {
        const next = [...points];
        next[index] = toPoint(vertex.getLatLng());
        return next;
      };
      vertex
        .on("dragstart", () => {
          startEditing();
          ghost.remove();
          vertex.closeTooltip();
        })
        .on("drag", () => reshape(moved()))
        .on("dragend", () => commit(moved()))
        .on("click", () => commit(points.filter((_, i) => i !== index)));
    });
    const sides =
      points.length > 1
        ? area && points.length > 2
          ? points.length
          : points.length - 1
        : 0;
    const inserted = (side: number, point: Point) => [
      ...points.slice(0, side + 1),
      point,
      ...points.slice(side + 1),
    ];
    // The closest spot on a side within reach of the pointer, away from corners.
    const reach = hover ? 10 : 18;
    const near = (cursor: L.Point) => {
      let best: { side: number; spot: L.Point; distance: number } | null = null;
      for (let side = 0; side < sides; side++) {
        const a = map.latLngToContainerPoint(points[side]);
        const b = map.latLngToContainerPoint(
          points[(side + 1) % points.length],
        );
        const spot = L.LineUtil.closestPointOnSegment(cursor, a, b);
        const distance = cursor.distanceTo(spot);
        if (
          distance <= reach &&
          spot.distanceTo(a) > 12 &&
          spot.distanceTo(b) > 12 &&
          (!best || distance < best.distance)
        )
          best = { side, spot, distance };
      }
      return (
        best && {
          side: best.side,
          latlng: map.containerPointToLatLng(best.spot),
        }
      );
    };
    // Fine pointers get a handle that slides along the outline under the
    // cursor: click to add a point there, or drag it into place.
    let ghostSide = 0;
    const ghost = L.marker([0, 0], {
      icon: midpointIcon,
      draggable: true,
      autoPan: true,
      keyboard: false,
    });
    const ghostInserted = () => inserted(ghostSide, toPoint(ghost.getLatLng()));
    ghost
      .on("dragstart", startEditing)
      .on("drag", () => reshape(ghostInserted()))
      .on("dragend", () => commit(ghostInserted()))
      .on("click", () => commit(ghostInserted()));
    // Touch has no hover, so each side gets a fixed handle at its middle.
    if (!hover)
      for (let side = 0; side < sides; side++) {
        const a = points[side];
        const b = points[(side + 1) % points.length];
        const handle = L.marker([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], {
          icon: midpointIcon,
          draggable: true,
          autoPan: true,
          keyboard: false,
        }).addTo(midpoints);
        const placed = () => inserted(side, toPoint(handle.getLatLng()));
        handle
          .on("dragstart", startEditing)
          .on("drag", () => reshape(placed()))
          .on("dragend", () => commit(placed()))
          .on("click", () => commit(placed()));
      }
    // A tap on a side adds a point there; anywhere else extends the outline.
    const add = (event: L.LeafletMouseEvent) => {
      const spot = near(event.containerPoint);
      commit(
        spot
          ? inserted(spot.side, toPoint(spot.latlng))
          : extended(toPoint(event.latlng)),
      );
    };
    const element = map.getContainer();
    const track = (event: MouseEvent) => {
      if (editing) return;
      const cursor = map.mouseEventToContainerPoint(event);
      const onVertex =
        event.target instanceof Element && event.target.closest(".draw-vertex");
      const spot = hover && !onVertex ? near(cursor) : null;
      if (spot) {
        ghostSide = spot.side;
        ghost.setLatLng(spot.latlng).addTo(group);
      } else ghost.remove();
      const last = points.at(fromStart ? 0 : -1);
      const latlng = map.containerPointToLatLng(cursor);
      preview.setLatLngs(
        onVertex || spot || !last
          ? []
          : area && points.length > 1
            ? [last, latlng, points[0]]
            : [last, latlng],
      );
    };
    const leave = () => {
      if (editing) return;
      preview.setLatLngs([]);
      ghost.remove();
    };
    map.on("click", add);
    element.addEventListener("mousemove", track);
    element.addEventListener("mouseleave", leave);
    return () => {
      map.off("click", add);
      element.removeEventListener("mousemove", track);
      element.removeEventListener("mouseleave", leave);
      group.remove();
    };
  }, [points, ready, draw, geometryType, extendFromStart]);
  const layerActions: SheetAction[] = [
    ...layerOptions.map(({ value, label, swatch }) => ({
      id: value,
      label,
      icon: <span className={cn(layerThumb, swatch)} />,
      selected: layer === value,
      onSelect: () => setLayer(value),
    })),
    ...overlays.map((overlay, index) => ({
      id: `overlay-${index}`,
      label: overlay.label,
      icon: (
        <span className={cn(layerThumb, "bg-surface-muted")}>
          {overlay.icon}
        </span>
      ),
      checked: overlay.on,
      onSelect: overlay.onToggle,
      divided: index === 0,
    })),
  ];
  const controls = (
    <div
      data-map-controls=""
      // On a drawer, a press here is not a swipe of it.
      data-base-ui-swipe-ignore=""
      className={cn(
        "absolute right-4.5 z-600 flex flex-col items-end gap-2 max-lg:right-3.75 max-sm:right-3 max-sm:gap-1.5",
        compact || draw
          ? "right-2 bottom-6 max-lg:right-2 max-sm:right-2 max-sm:bottom-6"
          : "bottom-10 max-sm:bottom-8",
      )}
    >
      {layersOpen && !compact && !mobile && (
        <div
          className="flex w-60 flex-col gap-0.5 rounded-xl border border-border bg-surface p-1.5 text-ui shadow-popover"
          ref={layerMenu}
          id="map-layer-options"
          role="group"
          aria-label="Kartlag"
          onBlur={(event) => {
            // Safari moves focus nowhere on a press, not to the pressed
            // option; presses outside close the menu in `dismiss`.
            if (
              event.relatedTarget &&
              !event.currentTarget.contains(event.relatedTarget) &&
              event.relatedTarget !== layerButton.current
            )
              setLayersOpen(false);
          }}
        >
          <span
            aria-hidden="true"
            className="px-2.5 pt-1.5 pb-1 text-body leading-5 font-semibold text-ink"
          >
            Kartlag
          </span>
          {layerOptions.map(({ value, label, swatch }) => (
            <button
              type="button"
              key={value}
              className={layerOptionButton}
              aria-pressed={layer === value}
              onClick={() => {
                setLayer(value);
                setLayersOpen(false);
                layerButton.current?.focus();
              }}
            >
              <span className={cn(layerThumb, swatch)} aria-hidden="true" />
              {label}
              {layer === value && (
                <Check
                  className="mr-1 ml-auto shrink-0"
                  size={15}
                  strokeWidth={2.25}
                  aria-hidden="true"
                />
              )}
            </button>
          ))}
          {overlays.length > 0 && (
            <>
              <hr className="mx-1 my-1 border-border" />
              {overlays.map((overlay) => (
                <button
                  type="button"
                  key={overlay.label}
                  role="switch"
                  aria-checked={overlay.on}
                  className={layerOptionButton}
                  onClick={overlay.onToggle}
                >
                  <span className={cn(layerThumb, "bg-surface-muted")} aria-hidden="true">
                    {overlay.icon}
                  </span>
                  {overlay.label}
                  <span className="mr-1 ml-auto">
                    <SwitchTrack on={overlay.on} />
                  </span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
      {layersOpen && !compact && mobile && (
        <ActionSheet
          label="Kartlag"
          title="Kartlag"
          actions={layerActions}
          onClose={() => setLayersOpen(false)}
        />
      )}
      <button
        ref={layerButton}
        type="button"
        hidden={compact}
        // No press effect: the menu opening is the response.
        className={cn(
          mapIconButton,
          "relative active:scale-100 aria-expanded:bg-surface-muted",
        )}
        aria-label="Kartlag"
        aria-haspopup={mobile ? "dialog" : undefined}
        aria-expanded={layersOpen}
        aria-controls={layersOpen && !mobile ? "map-layer-options" : undefined}
        data-tooltip="Kartlag"
        onClick={() => setLayersOpen(!layersOpen)}
      >
        <Layers size={19} aria-hidden="true" />
        {overlays.some((overlay) => overlay.on) && (
          <span
            className="absolute top-1.5 right-1.5 size-2.5 rounded-full border-2 border-surface bg-ink"
            data-overlay-on=""
            aria-hidden="true"
          />
        )}
      </button>
      <div className="flex flex-col divide-y divide-border overflow-hidden rounded-[6px] border border-border bg-surface shadow-control">
        <button
          type="button"
          className={cn(
            mapIconButton,
            "rounded-none border-0 shadow-none hover:bg-surface-muted",
          )}
          aria-label="Zoom inn"
          data-tooltip="Zoom inn"
          onClick={() => {
            handlers.current.onUserMove?.();
            mapRef.current?.zoomIn();
          }}
        >
          <Plus size={20} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={cn(
            mapIconButton,
            "rounded-none border-0 shadow-none hover:bg-surface-muted",
          )}
          aria-label="Zoom ut"
          data-tooltip="Zoom ut"
          onClick={() => {
            handlers.current.onUserMove?.();
            mapRef.current?.zoomOut();
          }}
        >
          <Minus size={20} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
  // Opposite the controls, just above the drawer: in line with them at the
  // side, 8px clear of the drawer.
  const credits = (
    <div
      className="absolute bottom-0 left-1 z-600"
      data-map-credits=""
      // On a drawer, a press here is not a swipe of it.
      data-base-ui-swipe-ignore=""
    >
      <button
        type="button"
        className="grid size-10 place-items-center text-muted hover:text-ink"
        aria-label="Kartkilder"
        aria-expanded={creditsOpen}
        aria-controls={creditsOpen ? "map-credits" : undefined}
        onClick={() => setCreditsOpen(!creditsOpen)}
      >
        <span className="grid size-6 place-items-center rounded-full bg-surface/80">
          <Info size={15} aria-hidden="true" />
        </span>
      </button>
      {creditsOpen && (
        <p
          id="map-credits"
          // Short of the controls; narrow phones wrap it.
          className="absolute top-1/2 left-full -translate-y-1/2 rounded-[4px] bg-surface/80 px-1.5 py-0.5 text-[9px] leading-tight w-max max-w-[calc(100vw-7.5rem)] text-muted [&_a]:text-muted"
          dangerouslySetInnerHTML={{
            __html: layer === "osm" ? osmAttribution : mapAttribution,
          }}
        />
      )}
    </div>
  );
  return (
    <div
      // Leaflet's pane z-indices stay inside, below the page's own layers.
      className="relative isolate h-full w-full overflow-hidden bg-surface-muted"
      data-project-map=""
      data-selection={!draw && selectedId ? "" : undefined}
      data-osm-selection={!draw && osm?.selectedId ? "" : undefined}
      data-drawing={draw ? "true" : undefined}
      data-map-style={layer}
      data-credits={docked ? "docked" : undefined}
      data-base-tone={darkBase ? "dark" : "light"}
    >
      <div
        ref={container}
        className={cn(
          "absolute inset-0 h-full w-full bg-surface-muted! font-sans!",
          draw && "cursor-crosshair!",
        )}
        role="region"
        aria-label={draw ? "Tegn prosjektområdet på kartet" : "Prosjektkart"}
      />
      {controlsContainer === undefined
        ? controls
        : controlsContainer &&
          createPortal(
            <>
              {controls}
              {credits}
            </>,
            controlsContainer,
          )}
      {mapMessage && (
        <div
          className="absolute top-18.75 left-1/2 z-650 flex w-max max-w-[85%] -translate-x-1/2 items-center gap-2.5 rounded-[7px] border border-border bg-surface px-3.5 py-3 text-2xs shadow-[0_4px_15px_rgb(20_28_24/0.10)] max-sm:top-16 max-sm:max-w-[calc(100%-28px)] max-sm:text-xs"
          role="status"
        >
          {mapMessage}
          <button
            type="button"
            className={cn(mapIconButton, "-mr-2 size-11 shadow-none")}
            aria-label="Lukk kartmelding"
            onClick={() => setMapMessage("")}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}
      {!ready && (
        <div
          className="absolute inset-0 z-700 flex flex-col items-center justify-center gap-3.75 bg-surface-muted text-xs text-ink"
          role="status"
          aria-live="polite"
        >
          <Building2
            className="animate-pulse motion-reduce:animate-none"
            size={24}
            aria-hidden="true"
          />
          <span>Laster kartet …</span>
        </div>
      )}
    </div>
  );
}
