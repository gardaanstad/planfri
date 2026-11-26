import { normalizeCategories, type Point, statusOrder } from "./data";

/** A map position: centre and zoom level. */
export type MapView = { center: Point; zoom: number };

export type ExploreState = {
  query: string;
  status: string[];
  category: string[];
  sort: string;
  view: MapView | null;
  /** A place a link frames the map on (`sted`), read but never written. */
  place?: string;
};

// Every status shows until filtered.
export const defaultStatus: string[] = [...statusOrder];
export const sortOptions = [
  { value: "current", label: "Aktuelt" },
  { value: "added", label: "Nyeste" },
  { value: "title", label: "Alfabetisk" },
];
export const defaultSort = "current";
/** Every status, as older links write it. */
const anyStatus = "alle";

const list = (value: string | null) =>
  value ? value.split(",").filter(Boolean) : [];

export function sameValues(a: string[], b: string[]) {
  return a.length === b.length && a.every((value) => b.includes(value));
}

function parseView(value: string | null): MapView | null {
  const [lat, lng, zoom] = list(value).map(Number);
  if (
    ![lat, lng, zoom].every(Number.isFinite) ||
    Math.abs(lat) > 85 ||
    Math.abs(lng) > 180 ||
    zoom < 0 ||
    zoom > 19
  )
    return null;
  return { center: [lat, lng], zoom };
}

/** Filters and map position from the explorer's query string. */
export function parseExploreState(
  params: Pick<URLSearchParams, "get">,
): ExploreState {
  const status = params.get("status");
  return {
    query: params.get("q") ?? "",
    status:
      status === null
        ? defaultStatus
        : status === anyStatus
          ? [...statusOrder]
          : list(status).filter((value) =>
              (statusOrder as string[]).includes(value),
            ),
    // A subcategory brings its main category along.
    category: normalizeCategories(list(params.get("kategori"))),
    sort: sortOptions.some(({ value }) => value === params.get("sorter"))
      ? params.get("sorter")!
      : defaultSort,
    view: parseView(params.get("kart")),
    place: params.get("sted") ?? "",
  };
}

/** The query string ("?…", or "" when everything is default) for a state. */
export function exploreSearch(state: ExploreState) {
  const params = new URLSearchParams();
  if (state.query.trim()) params.set("q", state.query.trim());
  // Every status, or none chosen, is no filter.
  if (state.status.length && !sameValues(state.status, defaultStatus))
    params.set(
      "status",
      statusOrder.filter((value) => state.status.includes(value)).join(","),
    );
  if (state.category.length)
    params.set("kategori", normalizeCategories(state.category).join(","));
  if (state.sort !== defaultSort) params.set("sorter", state.sort);
  if (state.view) {
    const [lat, lng] = state.view.center;
    params.set(
      "kart",
      `${lat.toFixed(4)},${lng.toFixed(4)},${Math.round(state.view.zoom * 100) / 100}`,
    );
  }
  const search = params.toString().replaceAll("%2C", ",");
  return search ? `?${search}` : "";
}

const storageKey = "planfri-map-view";

/** The last map position in this browser, for visits without one in the URL. */
export function storedMapView() {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || "null");
    return stored ? parseView(`${stored.center},${stored.zoom}`) : null;
  } catch {
    return null;
  }
}

export function storeMapView(view: MapView) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(view));
  } catch {
    /* The map still works without browser storage. */
  }
}

const welcomeKey = "planfri-welcome-dismissed";
const welcomeEvent = "planfri-welcome-dismissed";
let welcomeFallback = false;

/** Whether the first visit's welcome has been closed in this browser. */
export function storedWelcomeDismissed() {
  try {
    return localStorage.getItem(welcomeKey) === "1";
  } catch {
    return welcomeFallback;
  }
}

export function dismissWelcome() {
  welcomeFallback = true;
  try {
    localStorage.setItem(welcomeKey, "1");
  } catch {
    /* The fallback above holds it for this visit. */
  }
  window.dispatchEvent(new Event(welcomeEvent));
}

export function subscribeWelcome(callback: () => void) {
  window.addEventListener(welcomeEvent, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(welcomeEvent, callback);
    window.removeEventListener("storage", callback);
  };
}

const suggestHintKey = "planfri-suggest-hint-dismissed";
const suggestHintEvent = "planfri-suggest-hint-dismissed";
const noProjectIds: string[] = [];
let suggestHintFallback = noProjectIds;
let suggestHintCache: { raw: string | null; ids: string[] } = {
  raw: null,
  ids: noProjectIds,
};

/** Projects whose "Foreslå endring" hint has been closed in this browser. */
export function storedSuggestHintDismissed(): string[] {
  try {
    const raw = localStorage.getItem(suggestHintKey);
    if (raw !== suggestHintCache.raw) {
      const parsed = JSON.parse(raw || "[]");
      suggestHintCache = {
        raw,
        ids: Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [],
      };
    }
    return suggestHintCache.ids;
  } catch {
    return suggestHintFallback;
  }
}

export function dismissSuggestHint(projectId: string) {
  const ids = [...storedSuggestHintDismissed().filter((id) => id !== projectId), projectId];
  suggestHintFallback = ids;
  try {
    localStorage.setItem(suggestHintKey, JSON.stringify(ids.slice(-500)));
  } catch {
    /* The fallback above holds it for this visit. */
  }
  window.dispatchEvent(new Event(suggestHintEvent));
}

export function subscribeSuggestHint(callback: () => void) {
  window.addEventListener(suggestHintEvent, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(suggestHintEvent, callback);
    window.removeEventListener("storage", callback);
  };
}

const legendKey = "planfri-map-legend";
const legendEvent = "planfri-map-legend";
let legendFallback = false;

/** Whether the map's legend is shown, kept in this browser; hidden at first. */
export function storedLegend() {
  try {
    return localStorage.getItem(legendKey) === "1";
  } catch {
    return legendFallback;
  }
}

export function storeLegend(shown: boolean) {
  legendFallback = shown;
  try {
    if (shown) localStorage.setItem(legendKey, "1");
    else localStorage.removeItem(legendKey);
  } catch {
    /* The fallback above holds it. */
  }
  window.dispatchEvent(new Event(legendEvent));
}

export function subscribeLegend(callback: () => void) {
  window.addEventListener(legendEvent, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(legendEvent, callback);
    window.removeEventListener("storage", callback);
  };
}

const collapsedKey = "planfri-sidebar-collapsed";
const collapsedEvent = "planfri-sidebar-collapsed";
// Without browser storage, collapsing still lasts for this visit.
let collapsedFallback = false;

/** Desktop: whether the explorer sidebar is collapsed, kept in this browser. */
export function storedCollapsed() {
  try {
    return localStorage.getItem(collapsedKey) === "1";
  } catch {
    return collapsedFallback;
  }
}

export function storeCollapsed(collapsed: boolean) {
  collapsedFallback = collapsed;
  try {
    if (collapsed) localStorage.setItem(collapsedKey, "1");
    else localStorage.removeItem(collapsedKey);
  } catch {
    /* The fallback above holds it. */
  }
  window.dispatchEvent(new Event(collapsedEvent));
}

export function subscribeCollapsed(callback: () => void) {
  window.addEventListener(collapsedEvent, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(collapsedEvent, callback);
    window.removeEventListener("storage", callback);
  };
}

/** The project list's layout: rows, or cards with photos. */
export type ListDensity = "compact" | "expanded";
/** A project card's layout. */
export type CardDensity = ListDensity;
export const defaultDensity: ListDensity = "compact";
const densityKey = "planfri-list-density";
const densityEvent = "planfri-list-density";
let densityFallback: ListDensity = defaultDensity;
const isDensity = (value: string | null): value is ListDensity =>
  value === "compact" || value === "expanded";

/** The project list's layout, kept in this browser. */
export function storedDensity(): ListDensity {
  try {
    const stored = localStorage.getItem(densityKey);
    return isDensity(stored) ? stored : defaultDensity;
  } catch {
    return densityFallback;
  }
}

export function storeDensity(density: ListDensity) {
  densityFallback = density;
  try {
    if (density !== defaultDensity) localStorage.setItem(densityKey, density);
    else localStorage.removeItem(densityKey);
  } catch {
    /* The fallback above holds it. */
  }
  window.dispatchEvent(new Event(densityEvent));
}

export function subscribeDensity(callback: () => void) {
  window.addEventListener(densityEvent, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(densityEvent, callback);
    window.removeEventListener("storage", callback);
  };
}

/** The most places "Sted" keeps pinned at its top. */
export const maxPinnedPlaces = 3;
const pinnedKey = "planfri-pinned-places";
const pinnedEvent = "planfri-pinned-places";
export const noPinnedPlaces: readonly string[] = [];
let pinnedFallback = noPinnedPlaces;
// The last read, so an unchanged list keeps its identity between reads.
let pinnedRead: { raw: string | null; places: readonly string[] } = {
  raw: null,
  places: noPinnedPlaces,
};

/** Places pinned to the top of "Sted", first pinned first, in this browser. */
export function storedPinnedPlaces(): readonly string[] {
  try {
    const raw = localStorage.getItem(pinnedKey);
    if (raw === pinnedRead.raw) return pinnedRead.places;
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const places = Array.isArray(parsed)
      ? parsed
          .filter((name): name is string => typeof name === "string")
          .slice(0, maxPinnedPlaces)
      : noPinnedPlaces;
    pinnedRead = { raw, places };
    return places;
  } catch {
    return pinnedFallback;
  }
}

export function storePinnedPlaces(places: readonly string[]) {
  pinnedFallback = places.slice(0, maxPinnedPlaces);
  try {
    if (pinnedFallback.length)
      localStorage.setItem(pinnedKey, JSON.stringify(pinnedFallback));
    else localStorage.removeItem(pinnedKey);
  } catch {
    /* The fallback above holds it. */
  }
  window.dispatchEvent(new Event(pinnedEvent));
}

export function subscribePinnedPlaces(callback: () => void) {
  window.addEventListener(pinnedEvent, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(pinnedEvent, callback);
    window.removeEventListener("storage", callback);
  };
}

const phonePinsKey = "planfri-place-pins-shown";
const phonePinsEvent = "planfri-place-pins-shown";
let phonePinsFallback = false;

/** Whether phones show the pins in "Sted"; hover shows them elsewhere. */
export function storedPhonePins() {
  try {
    return localStorage.getItem(phonePinsKey) === "1";
  } catch {
    return phonePinsFallback;
  }
}

export function storePhonePins(shown: boolean) {
  phonePinsFallback = shown;
  try {
    if (shown) localStorage.setItem(phonePinsKey, "1");
    else localStorage.removeItem(phonePinsKey);
  } catch {
    /* The fallback above holds it. */
  }
  window.dispatchEvent(new Event(phonePinsEvent));
}

export function subscribePhonePins(callback: () => void) {
  window.addEventListener(phonePinsEvent, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(phonePinsEvent, callback);
    window.removeEventListener("storage", callback);
  };
}
