import type { Point } from "./data";

/** South, west, north and east edges in degrees. */
export type Extent = [number, number, number, number];
export type Place = {
  name: string;
  kind: "county" | "city";
  extent: Extent;
  /** A city's county; none for Oslo, which is its own. */
  county?: string;
};

// Counties since 2024, framed by their outer corners. Oslo is both a county
// and a city, so it is listed once, as a city.
const counties: Record<string, Extent> = {
  Akershus: [59.45, 10.3, 60.55, 11.95],
  Østfold: [58.85, 10.55, 59.8, 11.85],
  Buskerud: [59.4, 7.45, 60.95, 10.65],
  Vestfold: [58.9, 9.75, 59.7, 10.65],
  Telemark: [58.75, 7.1, 60.2, 9.95],
  Agder: [57.95, 6.15, 59.7, 9.3],
  Rogaland: [58.3, 4.85, 59.85, 7.2],
  Vestland: [59.45, 4.5, 62.4, 8.35],
  "Møre og Romsdal": [61.95, 5.0, 63.6, 9.5],
  Trøndelag: [62.25, 8.3, 65.5, 14.35],
  Innlandet: [60.1, 7.3, 62.7, 12.9],
  Nordland: [64.95, 10.55, 69.35, 18.2],
  Troms: [68.35, 15.55, 70.3, 22.9],
  Finnmark: [68.55, 20.6, 71.2, 31.2],
};

// Cities by centre and the reach of their built-up area in kilometres.
const cities: [string, Point, number, string][] = [
  ["Oslo", [59.93, 10.75], 13, ""],
  ["Bergen", [60.37, 5.33], 13, "Vestland"],
  ["Trondheim", [63.41, 10.4], 10, "Trøndelag"],
  ["Stavanger", [58.95, 5.72], 7, "Rogaland"],
  ["Sandnes", [58.85, 5.74], 6, "Rogaland"],
  ["Kristiansand", [58.15, 8.0], 8, "Agder"],
  ["Arendal", [58.46, 8.77], 6, "Agder"],
  ["Drammen", [59.74, 10.2], 7, "Buskerud"],
  ["Kongsberg", [59.67, 9.65], 5, "Buskerud"],
  ["Bærum", [59.9, 10.53], 7, "Akershus"],
  ["Asker", [59.83, 10.43], 6, "Akershus"],
  ["Lillestrøm", [59.96, 11.05], 6, "Akershus"],
  ["Fredrikstad", [59.22, 10.94], 7, "Østfold"],
  ["Sarpsborg", [59.28, 11.11], 6, "Østfold"],
  ["Moss", [59.43, 10.66], 5, "Østfold"],
  ["Halden", [59.12, 11.39], 5, "Østfold"],
  ["Tønsberg", [59.27, 10.41], 5, "Vestfold"],
  ["Sandefjord", [59.13, 10.22], 5, "Vestfold"],
  ["Larvik", [59.05, 10.03], 5, "Vestfold"],
  ["Skien", [59.21, 9.6], 5, "Telemark"],
  ["Porsgrunn", [59.14, 9.66], 5, "Telemark"],
  ["Haugesund", [59.41, 5.27], 5, "Rogaland"],
  ["Ålesund", [62.47, 6.2], 7, "Møre og Romsdal"],
  ["Molde", [62.74, 7.16], 5, "Møre og Romsdal"],
  ["Kristiansund", [63.11, 7.73], 4, "Møre og Romsdal"],
  ["Hamar", [60.79, 11.07], 5, "Innlandet"],
  ["Lillehammer", [61.12, 10.47], 5, "Innlandet"],
  ["Gjøvik", [60.8, 10.69], 5, "Innlandet"],
  ["Steinkjer", [64.01, 11.5], 4, "Trøndelag"],
  ["Bodø", [67.28, 14.4], 6, "Nordland"],
  ["Mo i Rana", [66.31, 14.14], 5, "Nordland"],
  ["Narvik", [68.44, 17.43], 5, "Nordland"],
  ["Harstad", [68.8, 16.54], 5, "Troms"],
  ["Tromsø", [69.67, 18.95], 8, "Troms"],
  ["Alta", [69.97, 23.27], 6, "Finnmark"],
  ["Hammerfest", [70.66, 23.68], 4, "Finnmark"],
  ["Kirkenes", [69.73, 30.05], 4, "Finnmark"],
];

/** The cities first in the place menus, largest first; the rest follow A–Å. */
export const mainCities = [
  "Oslo",
  "Bergen",
  "Stavanger",
  "Sandnes",
  "Trondheim",
  "Drammen",
  "Fredrikstad",
  "Sarpsborg",
  "Porsgrunn",
  "Skien",
  "Kristiansand",
  "Tønsberg",
  "Ålesund",
];

function around([lat, lng]: Point, km: number): Extent {
  const dLat = km / 111;
  const dLng = km / (111 * Math.cos((lat * Math.PI) / 180));
  return [lat - dLat, lng - dLng, lat + dLat, lng + dLng];
}
const union = (a: Extent, b: Extent): Extent => [
  Math.min(a[0], b[0]),
  Math.min(a[1], b[1]),
  Math.max(a[2], b[2]),
  Math.max(a[3], b[3]),
];

export const places: Place[] = [
  ...Object.entries(counties).map(
    ([name, extent]): Place => ({ name, kind: "county", extent }),
  ),
  ...cities.map(
    ([name, center, km, county]): Place => ({
      name,
      kind: "city",
      extent: around(center, km),
      ...(county && { county }),
    }),
  ),
];
const byName = new Map(places.map((place) => [place.name, place]));
/** A place by name. */
export const findPlace = (name: string) => byName.get(name);

/**
 * Two places a view shows at once, named together. Its parts, as places;
 * a place's own name, which may hold "og" itself, is one part.
 */
export const bothPlaces = (a: string, b: string) => `${a} og ${b}`;
export function placeParts(name: string): Place[] {
  const whole = byName.get(name);
  if (whole) return [whole];
  const words = name.split(" og ");
  for (let i = 1; i < words.length; i++) {
    const a = byName.get(words.slice(0, i).join(" og "));
    const b = byName.get(words.slice(i).join(" og "));
    if (a && b) return [a, b];
  }
  return [];
}
/** Whether a project in `names` (see `projectPlaces`) is in the place. */
export const inPlace = (names: string[] | undefined, name: string) =>
  placeParts(name).some((part) => names?.includes(part.name) ?? false);
/** A place's framing: for two, both together. */
export function placeExtent(name: string): Extent | undefined {
  const parts = placeParts(name);
  return parts.length ? parts.map((part) => part.extent).reduce(union) : undefined;
}

export function extentPoints([south, west, north, east]: Extent): Point[] {
  return [
    [south, west],
    [north, east],
  ];
}

const contains = ([south, west, north, east]: Extent, [lat, lng]: Point) =>
  lat >= south && lat <= north && lng >= west && lng <= east;

/** Whether a point lies within the named place. */
export function placeContains(name: string, point: Point) {
  return placeParts(name).some((place) => contains(place.extent, point));
}

// Areas are compared as drawn on the map (Web Mercator), not on the globe.
const mercatorY = (lat: number) =>
  Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
function area([south, west, north, east]: Extent) {
  return Math.max(0, east - west) * Math.max(0, mercatorY(north) - mercatorY(south)) * (180 / Math.PI);
}
const size = new Map(places.map((place) => [place, area(place.extent)]));

/**
 * The places a project belongs to: the city it names and that city's county,
 * or a county it names. Other names fall back to where the project lies: a
 * city around it, and the smallest county framing it.
 */
export function projectPlaces(city: string, center: Point): string[] {
  const named = findPlace(city);
  if (named) return named.county ? [named.name, named.county] : [named.name];
  const near = places.find(
    (place) => place.kind === "city" && contains(place.extent, center),
  );
  if (near) return near.county ? [near.name, near.county] : [near.name];
  const county = places
    .filter((place) => place.kind === "county" && contains(place.extent, center))
    .sort((a, b) => size.get(a)! - size.get(b)!)[0];
  return county ? [county.name] : [];
}

// Below this zoom the view is too wide to name a place it shows.
const placeZoom = 11;

/**
 * The place a map view shows, if one: the smallest place most of the
 * projects in view belong to, so zooming into Bergen shows Bergen and not
 * Vestland. Only close views gain a place. The current one, picked or
 * gained, stays while most projects in view are still in it, so views don't
 * flicker; a wide view keeps it only until it zooms out, so a picked county
 * survives panning its framing but zooming out of it clears it.
 *
 * A view with no projects in it is in the place around its `center`: the
 * current one while it lies there, or else the smallest of `withProjects`.
 */
export function placeInView(
  inView: string[][],
  zoom: number,
  current = "",
  previousZoom = zoom,
  around?: { center: Point; withProjects: ReadonlySet<string> },
): string {
  if (zoom < placeZoom && zoom < previousZoom) return "";
  if (!inView.length) {
    if (!around) return "";
    if (current && placeContains(current, around.center)) return current;
    if (zoom < placeZoom) return "";
    let best: Place | null = null;
    for (const place of places)
      if (
        around.withProjects.has(place.name) &&
        contains(place.extent, around.center) &&
        (!best || size.get(place)! < size.get(best)!)
      )
        best = place;
    return best?.name ?? "";
  }
  const counts = new Map<string, number>();
  for (const names of inView)
    for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  let best: Place | null = null;
  for (const [name, count] of counts) {
    const place = byName.get(name);
    if (!place || count * 2 <= inView.length) continue;
    if (name !== current && zoom < placeZoom) continue;
    if (!best || size.get(place)! < size.get(best)!) best = place;
  }
  // Projects from just two places, one not inside the other, name both
  // rather than the one with more of them.
  const both = twoPlaces(inView);
  if (both && (zoom >= placeZoom || both === current)) return both;
  return best?.name ?? "";
}

/** The two places the projects lie in, if two: each project's smallest. */
function twoPlaces(inView: string[][]): string {
  const counts = new Map<string, number>();
  for (const names of inView) {
    if (!names.length) return "";
    counts.set(names[0], (counts.get(names[0]) ?? 0) + 1);
  }
  if (counts.size !== 2) return "";
  const rank = (name: string) => {
    const main = mainCities.indexOf(name);
    return main < 0 ? mainCities.length : main;
  };
  const [a, b] = [...counts.keys()].sort(
    (a, b) =>
      counts.get(b)! - counts.get(a)! ||
      rank(a) - rank(b) ||
      a.localeCompare(b, "nb"),
  );
  if (byName.get(a)?.county === b || byName.get(b)?.county === a) return "";
  return bothPlaces(a, b);
}
