export type Status = "planned" | "construction" | "completed";
/**
 * Main categories and their subcategories. A project holds a main category
 * on its own, or narrowed to one or more of its subcategories; names are
 * unique across the tree, so a name alone says where it belongs.
 */
export const categoryTree = [
  {
    name: "Samferdsel",
    subcategories: [
      "Vei",
      "Jernbane",
      "Kollektiv",
      "Sykkel og gange",
      "Havn",
      "Luftfart",
    ],
  },
  {
    name: "Energi",
    subcategories: ["Kraftproduksjon", "Strømnett", "Fjernvarme", "CO₂-lagring"],
  },
  {
    name: "Vann og avløp",
    subcategories: ["Drikkevann", "Avløp", "Overvann"],
  },
  {
    name: "Offentlige bygg",
    subcategories: ["Helse", "Skole", "Kultur og idrett", "Forvaltning"],
  },
  {
    name: "Byutvikling",
    subcategories: ["Bolig", "Næring", "Byrom og park"],
  },
] as const;
type CategoryNode = (typeof categoryTree)[number];
export type MainCategory = CategoryNode["name"];
export type Subcategory = CategoryNode["subcategories"][number];
export type Category = MainCategory | Subcategory;
export const mainCategories: MainCategory[] = categoryTree.map(
  (node) => node.name,
);
/** Every category in display order: each main followed by its subcategories. */
export const categories: Category[] = categoryTree.flatMap((node) => [
  node.name,
  ...node.subcategories,
]);
const parents = new Map<string, MainCategory>(
  categoryTree.flatMap((node) => [
    [node.name, node.name] as const,
    ...node.subcategories.map((sub) => [sub, node.name] as const),
  ]),
);
export const isCategory = (value: string): value is Category =>
  parents.has(value);
/** The main category a category belongs to; a main is its own. */
export const mainCategoryOf = (category: Category) => parents.get(category)!;
export const isMainCategory = (category: string): category is MainCategory =>
  parents.get(category) === category;
/** Known categories, each with its main, deduplicated, in tree order. */
export function normalizeCategories(values: readonly string[]): Category[] {
  const known = values.filter(isCategory);
  const kept = new Set<string>([...known, ...known.map(mainCategoryOf)]);
  return categories.filter((category) => kept.has(category));
}
/**
 * What a set of categories reads as: per main, its chosen subcategories, or
 * the main itself when none is chosen.
 */
export function categoryLabels(values: readonly string[]): Category[] {
  const kept = normalizeCategories(values);
  return categoryTree.flatMap((node) => {
    if (!kept.includes(node.name)) return [];
    const subs = node.subcategories.filter((sub) => kept.includes(sub));
    return subs.length ? subs : [node.name];
  });
}
/**
 * Whether a project's categories meet a filter: any chosen main, narrowed to
 * its chosen subcategories when it has some. No filter matches everything.
 */
export function matchesCategories(
  project: readonly Category[],
  filter: readonly string[],
) {
  const chosen = normalizeCategories(filter);
  if (!chosen.length) return true;
  return categoryTree.some((node) => {
    if (!chosen.includes(node.name)) return false;
    const subs = node.subcategories.filter((sub) => chosen.includes(sub));
    return subs.length
      ? subs.some((sub) => project.includes(sub))
      : project.some((category) => mainCategoryOf(category) === node.name);
  });
}
export type Point = [number, number];
export type ProjectImage = {
  src: string;
  alt?: string;
  credit?: string;
};
export type ProjectUpdate = {
  id: string;
  title: string;
  body: string;
  date: string;
  images?: ProjectImage[];
  origin?: boolean;
  sourceUrl?: string;
  /** Username of the member whose tip this was. Added on read, never stored. */
  via?: string;
};
export type Project = {
  id: string;
  title: string;
  district: string;
  city: string;
  /** Main categories, each optionally with subcategories; see categoryTree. */
  categories: Category[];
  status: Status;
  /** Cover photo; empty when the project has none. */
  image: string;
  /** Further photos added with the project, after the cover. */
  images?: ProjectImage[];
  imageCredit?: string;
  imageSource?: string;
  description: string;
  website?: string;
  example?: boolean;
  center: Point;
  geometry: Point[];
  geometryType: "area" | "line";
  year: string;
  updated: string;
  /** Set by the server when a moderator adds the project. */
  created?: string;
  comments: number;
  developer: string;
  updates: ProjectUpdate[];
  /**
   * Usernames of members whose approved suggestions created or corrected
   * the project. Added on read from approved suggestions, never stored.
   */
  contributors?: string[];
};
export type Comment = {
  id: string;
  projectId: string;
  /** Optional reference; every comment belongs to the project discussion. */
  updateId?: string;
  author: string;
  text: string;
  date: string;
  votes: number;
  parentId?: string;
};
/** Empty, or an old category tile: the project has no photo of its own. */
export function hasPhoto(project: Pick<Project, "image">) {
  return (
    Boolean(project.image) && !project.image.startsWith("/images/kategori-")
  );
}
function isOriginUpdate(update: ProjectUpdate, projectId: string) {
  return update.origin === true || update.id === `${projectId}-origin`;
}
/** Timeline entries, newest first; historical "Om prosjektet" entries excluded. */
export function getProjectUpdates(project: Project): ProjectUpdate[] {
  return project.updates
    .filter((update) => !isOriginUpdate(update, project.id))
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
}
/** The project's own photos first, then every distinct photo from its updates. */
export function projectPhotos(project: Project): ProjectImage[] {
  const photos: ProjectImage[] = hasPhoto(project)
    ? [{ src: project.image, alt: project.title, credit: project.imageCredit }]
    : [];
  const more = [
    ...(project.images ?? []),
    ...getProjectUpdates(project).flatMap((update) => update.images ?? []),
  ];
  for (const image of more)
    if (!photos.some((photo) => photo.src === image.src)) photos.push(image);
  return photos;
}
/** The project's own photos, cover first; update photos are left out. */
export function ownPhotos(project: Project): ProjectImage[] {
  return [
    ...(hasPhoto(project)
      ? [{ src: project.image, alt: project.title, credit: project.imageCredit }]
      : []),
    ...(project.images ?? []),
  ];
}
/**
 * The cover and further photos for `srcs` in order, reusing what `project`
 * already knows about each photo. New ones get `credit`.
 */
export function arrangePhotos(
  project: Project,
  srcs: string[],
  credit?: string,
): Pick<Project, "image" | "images"> {
  const known = new Map(projectPhotos(project).map((photo) => [photo.src, photo]));
  const stored = new Map((project.images ?? []).map((photo) => [photo.src, photo]));
  const [cover, ...more] = srcs;
  const images = more.map(
    (src) =>
      stored.get(src) ?? {
        src,
        alt: known.get(src)?.alt ?? project.title,
        credit: known.get(src) ? known.get(src)?.credit : credit,
      },
  );
  return {
    // A project without photos keeps its old category tile, if it had one.
    image: cover ?? (hasPhoto(project) ? "" : project.image),
    images: images.length ? images : undefined,
  };
}
export function projectHref(id: string) {
  return `/prosjekt/${encodeURIComponent(id)}`;
}
/** "District, City", or just the city when there is no separate district. */
export function projectPlace(project: Pick<Project, "district" | "city">) {
  return project.district && project.district !== project.city
    ? `${project.district}, ${project.city}`
    : project.city;
}
/** Stored when a project has no known developer; shown as empty. */
export const unknownDeveloper = "Ikke oppgitt";
export function centroid(points: Point[]): Point {
  return [
    points.reduce((sum, point) => sum + point[0], 0) / points.length,
    points.reduce((sum, point) => sum + point[1], 0) / points.length,
  ];
}
/** Older projects predate `created`; their first entry stands in. */
export function projectAddedAt(project: Project) {
  return (
    project.created ??
    project.updates.reduce(
      (first, update) => (update.date < first ? update.date : first),
      project.updated,
    )
  );
}
// Map colours; Leaflet can't read CSS variables. Keep in sync with --color-status-*.
export const statuses: Record<Status, { label: string; color: string }> = {
  planned: { label: "Planlagt", color: "#7383ba" },
  construction: { label: "Under bygging", color: "#d59a42" },
  completed: { label: "Ferdigstilt", color: "#4f9279" },
};
export const statusOrder = Object.keys(statuses) as Status[];
/** Preset views for drawing maps, suggested when entering a project's place. */
export const cities: Record<string, { center: Point; zoom: number }> = {
  Oslo: { center: [59.912, 10.747], zoom: 13 },
  Bergen: { center: [60.391, 5.323], zoom: 13 },
  Trondheim: { center: [63.432, 10.401], zoom: 13 },
  Stavanger: { center: [58.969, 5.738], zoom: 13 },
};
export const presetPlaces = Object.keys(cities);
/** Mainland Norway, south-west and north-east corners. */
export const norwayBounds: [Point, Point] = [
  [57.9, 4.4],
  [71.2, 31.2],
];
export type Bounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};
/** The map's view; `zoom` decides whether alignments show as their dot. */
export type ViewBounds = Bounds & { zoom?: number };
// Below this zoom alignments collapse to a dot halfway along them: wider
// than a county, even long lines are short scribbles.
export const lineDotZoom = 8;
/** The point halfway along a line, so its dot sits on the alignment. */
export function lineMidpoint(points: Point[]): Point {
  if (points.length < 2) return points[0];
  // Longitude shrinks with latitude; this keeps lengths roughly true.
  const scale = Math.cos((points[0][0] * Math.PI) / 180);
  const lengths = points
    .slice(1)
    .map(([lat, lng], index) =>
      Math.hypot(lat - points[index][0], (lng - points[index][1]) * scale),
    );
  let remaining = lengths.reduce((sum, length) => sum + length, 0) / 2;
  for (const [index, length] of lengths.entries()) {
    if (remaining <= length && length > 0) {
      const [lat, lng] = points[index];
      const [nextLat, nextLng] = points[index + 1];
      const t = remaining / length;
      return [lat + (nextLat - lat) * t, lng + (nextLng - lng) * t];
    }
    remaining -= length;
  }
  return points[points.length - 1];
}
// Web Mercator, where the map draws its shapes' sides as straight lines.
const mercator = ([lat, lng]: Point): Point => [
  lng,
  Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)),
];
/**
 * Whether any part of the project as drawn lies inside `bounds`: a corner,
 * a side crossing it, or an area around all of it. Not its bounding box, so
 * a bend or a slanted alignment passing outside doesn't count. Zoomed out,
 * an alignment is its dot.
 */
export function projectInBounds(project: Project, bounds: ViewBounds) {
  const [west, south] = mercator([bounds.south, bounds.west]);
  const [east, north] = mercator([bounds.north, bounds.east]);
  const inside = ([x, y]: Point) =>
    x >= west && x <= east && y >= south && y <= north;
  const line = project.geometryType === "line";
  const dotted = line && bounds.zoom !== undefined && bounds.zoom < lineDotZoom;
  if (!project.geometry.length || dotted)
    return inside(
      mercator(
        project.geometry.length ? lineMidpoint(project.geometry) : project.center,
      ),
    );
  // Zoomed out, an area's dot sits on its centre.
  if (!line && inside(mercator(project.center))) return true;
  const points = project.geometry.map(mercator);
  if (points.some(inside)) return true;
  // Liang–Barsky: whether the side from a to b crosses the view.
  const crosses = ([ax, ay]: Point, [bx, by]: Point) => {
    let from = 0;
    let to = 1;
    const dx = bx - ax;
    const dy = by - ay;
    for (const [p, q] of [
      [-dx, ax - west],
      [dx, east - ax],
      [-dy, ay - south],
      [dy, north - ay],
    ]) {
      if (p === 0) {
        if (q < 0) return false;
      } else if (p < 0) from = Math.max(from, q / p);
      else to = Math.min(to, q / p);
      if (from > to) return false;
    }
    return true;
  };
  const sides = line ? points.length - 1 : points.length;
  for (let side = 0; side < sides; side++)
    if (crosses(points[side], points[(side + 1) % points.length])) return true;
  if (line || points.length < 3) return false;
  // No corner or side in view: either the area holds all of it, or none.
  const [x, y] = [(west + east) / 2, (south + north) / 2];
  let within = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      within = !within;
  }
  return within;
}
const nbMonthsShort = [
  "jan.",
  "feb.",
  "mars",
  "apr.",
  "mai",
  "juni",
  "juli",
  "aug.",
  "sep.",
  "okt.",
  "nov.",
  "des.",
];
function dateParts(date: string) {
  const [year, month, day] = date.slice(0, 10).split("-").map(Number);
  return { year, month, day };
}
export function formatDate(date: string) {
  const { month, day } = dateParts(date);
  return `${day}. ${nbMonthsShort[month - 1]}`;
}
export function formatDateYear(date: string) {
  const { year, month, day } = dateParts(date);
  return `${day}. ${nbMonthsShort[month - 1]} ${year}`;
}

const relativeUnits = [
  { seconds: 31_557_600, one: "år", many: "år" },
  { seconds: 2_629_800, one: "måned", many: "måneder" },
  { seconds: 604_800, one: "uke", many: "uker" },
  { seconds: 86_400, one: "dag", many: "dager" },
  { seconds: 3_600, one: "time", many: "timer" },
  { seconds: 60, one: "minutt", many: "minutter" },
];
export function formatRelative(date: string, now: number) {
  const elapsed = Math.max(0, (now - Date.parse(date)) / 1000);
  for (const unit of relativeUnits) {
    const count = Math.floor(elapsed / unit.seconds);
    if (count < 1) continue;
    if (unit.one === "dag" && count === 1) return "i går";
    return `for ${count} ${count === 1 ? unit.one : unit.many} siden`;
  }
  return "nå nettopp";
}
// Relative times read best while recent; past this, a date is clearer.
export const relativeTimeLimit = 30 * 86_400_000;
