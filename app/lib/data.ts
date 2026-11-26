export type Status = "proposed" | "planned" | "construction" | "completed";
// Categories live in their own module; see there for adding or changing one.
export * from "./categories";
import type { Category } from "./categories";
export type Point = [number, number];
export type ProjectImage = {
  src: string;
  alt?: string;
  credit?: string;
};
/**
 * Something that happened on a project's way, or will: a plan approved, say.
 * Every one is a point on the project's timeline, by its date. Told in full
 * (a body, perhaps photos and a source) it's a post: what Oppdateringer
 * calls an update, written by a moderator or from a member's tip.
 */
export type ProjectUpdate = {
  id: string;
  title: string;
  /** What happened, in full. None for an event only named on the timeline. */
  body?: string;
  /**
   * A post's is the moment it was published; an event's, a year or a month
   * (`2027`, `2027-03`) like the phases' dates.
   */
  date: string;
  images?: ProjectImage[];
  origin?: boolean;
  sourceUrl?: string;
  /** Username of the member whose tip this was. Added on read, never stored. */
  via?: string;
};
/** The phases with a start date of their own; "Ferdig" has `year`. */
export const datedPhases = ["proposed", "planned", "construction"] as const;
export type DatedPhase = (typeof datedPhases)[number];
export type PhaseDates = Partial<Record<DatedPhase, string>>;
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
  /** When it's done, or due: a year. Foreslått projects have none. */
  year: string;
  /** When each phase began, as a year or a month (`2024`, `2024-03`). */
  phaseDates?: PhaseDates;
  /**
   * Phases the project never had, left off its timeline: never a proposal,
   * no planning of its own, or (as a joke, mostly) never done.
   */
  skippedPhases?: SkippablePhase[];
  updated: string;
  /** Set by the server when a moderator adds the project. */
  created?: string;
  comments: number;
  developer: string;
  /** Its events and posts, in no particular order. */
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
  /** Deleted by its author after others replied: kept, without author or text. */
  deleted?: boolean;
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
/** Told in full, rather than only named on the timeline. */
export const isPost = (update: ProjectUpdate) => Boolean(update.body);
/**
 * Every event on the project's timeline, posts included, oldest first;
 * historical "Om prosjektet" entries excluded.
 */
export function projectEvents(project: Project): ProjectUpdate[] {
  return project.updates
    .filter((update) => !isOriginUpdate(update, project.id))
    .sort((a, b) => dateTime(a.date) - dateTime(b.date));
}
/** The project's posts, newest first: its news, as cards and unread marks count it. */
export function projectPosts(project: Project): ProjectUpdate[] {
  return projectEvents(project).filter(isPost).reverse();
}
/**
 * The project's updates with its events, those only named on the timeline,
 * replaced by those among `updates`. Its posts stay as they are: editing
 * the timeline never changes one, and one published meanwhile is kept.
 */
export function withEvents(
  project: Pick<Project, "updates">,
  updates: ProjectUpdate[],
): ProjectUpdate[] {
  return [
    ...project.updates.filter(isPost),
    ...updates.filter((update) => !isPost(update)),
  ];
}
/** The project's own photos first, then every distinct photo from its updates. */
export function projectPhotos(project: Project): ProjectImage[] {
  const photos: ProjectImage[] = hasPhoto(project)
    ? [{ src: project.image, alt: project.title, credit: project.imageCredit }]
    : [];
  const more = [
    ...(project.images ?? []),
    ...projectPosts(project).flatMap((update) => update.images ?? []),
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
/** Older projects predate `created`; their first post stands in. */
export function projectAddedAt(project: Project) {
  return (
    project.created ??
    project.updates
      .filter(isPost)
      .reduce(
        (first, update) => (update.date < first ? update.date : first),
        project.updated,
      )
  );
}
// Map colours; Leaflet can't read CSS variables. Keep in sync with --color-status-*.
export const statuses: Record<Status, { label: string; color: string }> = {
  proposed: { label: "Foreslått", color: "#9ca39f" },
  planned: { label: "Planlagt", color: "#7383ba" },
  construction: { label: "Under bygging", color: "#d59a42" },
  completed: { label: "Ferdigstilt", color: "#4f9279" },
};
export const statusOrder = Object.keys(statuses) as Status[];
/** The phases a project's timeline can do without; never Under bygging. */
export const skippablePhases = ["proposed", "planned", "completed"] as const;
export type SkippablePhase = (typeof skippablePhases)[number];
/** The phases on a project's timeline: all four but those it skipped. */
export function projectPhases(
  project: Pick<Project, "status" | "skippedPhases">,
): Status[] {
  return statusOrder.filter(
    (phase) =>
      phase === project.status ||
      !project.skippedPhases?.includes(phase as SkippablePhase),
  );
}
/** Preset views for drawing maps, suggested when entering a project's place. */
export const cities: Record<string, { center: Point; zoom: number }> = {
  Oslo: { center: [59.912, 10.747], zoom: 13 },
  Bergen: { center: [60.391, 5.323], zoom: 13 },
  Trondheim: { center: [63.432, 10.401], zoom: 13 },
  Stavanger: { center: [58.969, 5.738], zoom: 13 },
};
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
const lineDotZoom = 8;
// Below this zoom areas collapse to a dot on their centre.
const areaDotZoom = 12;
// Smaller projects collapse sooner, once they'd be shorter or narrower than
// this on screen, in pixels: a line along its length, an area across.
const lineDotLength = 40;
const areaDotExtent = 24;
// However small, a project shows as its shape zoomed in this far.
const maxDotZoom = 16;
/**
 * Below this zoom the project shows as its dot: at the latest where every
 * alignment or area does, sooner when it's small enough to be a scribble.
 */
export function dotZoomOf(project: Project) {
  const line = project.geometryType === "line";
  const { size } = projectedShape(project);
  // Zoom 0 draws the world 256 pixels wide, each zoom step twice that.
  const pixels = (size * 256) / (2 * Math.PI);
  const fits = pixels > 0
    ? Math.log2((line ? lineDotLength : areaDotExtent) / pixels)
    : maxDotZoom;
  return Math.min(Math.max(line ? lineDotZoom : areaDotZoom, fits), maxDotZoom);
}
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
// Projected once per project: the list checks every project on each frame
// the map moves.
const projected = new WeakMap<
  Project,
  {
    points: Point[];
    min: Point;
    max: Point;
    dot: Point;
    center: Point;
    /** A line's length or an area's widest side, in Mercator radians. */
    size: number;
  }
>();
function projectedShape(project: Project) {
  let shape = projected.get(project);
  if (shape) return shape;
  const points = project.geometry.map(mercator);
  const min: Point = [Infinity, Infinity];
  const max: Point = [-Infinity, -Infinity];
  for (const [x, y] of points) {
    min[0] = Math.min(min[0], x);
    min[1] = Math.min(min[1], y);
    max[0] = Math.max(max[0], x);
    max[1] = Math.max(max[1], y);
  }
  // Mercator x here is in degrees, y in radians.
  const radians = Math.PI / 180;
  const size =
    project.geometryType === "line"
      ? points
          .slice(1)
          .reduce(
            (sum, [x, y], index) =>
              sum +
              Math.hypot((x - points[index][0]) * radians, y - points[index][1]),
            0,
          )
      : points.length
        ? Math.max((max[0] - min[0]) * radians, max[1] - min[1])
        : 0;
  shape = {
    points,
    min,
    max,
    dot: mercator(
      project.geometry.length ? lineMidpoint(project.geometry) : project.center,
    ),
    center: mercator(project.center),
    size,
  };
  projected.set(project, shape);
  return shape;
}
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
  const dotted =
    line && bounds.zoom !== undefined && bounds.zoom < dotZoomOf(project);
  const shape = projectedShape(project);
  if (!project.geometry.length || dotted) return inside(shape.dot);
  // Zoomed out, an area's dot sits on its centre.
  if (!line && inside(shape.center)) return true;
  const { points, min, max } = shape;
  // Nowhere near the view, or all of it inside: no need to look closer.
  if (min[0] > east || max[0] < west || min[1] > north || max[1] < south)
    return false;
  if (min[0] >= west && max[0] <= east && min[1] >= south && max[1] <= north)
    return true;
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
/**
 * When a date runs, in ms: a whole year, a month, or, for a moment, just
 * that moment.
 */
export function datePeriod(date: string): [number, number] {
  if (date.length > 7) {
    const time = Date.parse(date);
    return [time, time];
  }
  const [year, month] = date.split("-").map(Number);
  return month
    ? [Date.UTC(year, month - 1, 1), Date.UTC(year, month, 1)]
    : [Date.UTC(year, 0, 1), Date.UTC(year + 1, 0, 1)];
}
/** The middle of a date's period, in ms. */
export function dateTime(date: string) {
  const [from, to] = datePeriod(date);
  return (from + to) / 2;
}
/** An event's date: a post's day, or an event's month or year. */
export function formatEventDate(date: string) {
  return date.length > 7 ? formatDateYear(date) : formatPhaseDate(date);
}
/** A phase date: `2024`, or `2024-03` as "mars 2024". */
export function formatPhaseDate(date: string) {
  const [year, month] = date.split("-");
  return month ? `${nbMonthsShort[Number(month) - 1]} ${year}` : year;
}
/** The year a project is done or due; none while it's only proposed. */
export function finishYear(project: Pick<Project, "status" | "year">) {
  return project.status === "proposed" ? "" : project.year;
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
