/**
 * Turns OpenStreetMap railways and roads under construction or proposed
 * into project candidates: one per line being built or planned, not one per
 * way.
 *
 * OSM splits a line into many ways (at every bridge, tunnel and junction),
 * often leaves pieces unnamed, names bridges and tunnels after themselves,
 * and maps double track and dual carriageways as two lines, often apart.
 * So: ways join along shared nodes; a joined network holding several
 * sizeable named lines splits between them; parallel tracks and pieces of
 * one named line across small gaps join again; and each candidate gets one
 * end-to-end alignment to start a project from, and lines to draw with
 * parallel tracks once. The alignment runs midway between parallel tracks
 * and carriageways, and keeps to one where they drift far apart.
 *
 * Pure and dependency-free, so tests can run it on fixtures. The server
 * runs it on Overpass responses; see server/osm-candidates.ts.
 */
import type { Point } from "./data";
import {
  coveredShare,
  distance,
  distanceToLine,
  pathLength,
  segmentDistance,
  type OsmCandidate,
  type OsmKind,
  type OsmMode,
  type OsmStatus,
  namelike,
  samples,
  simplify,
} from "./osm-candidates";

export type OverpassWay = {
  type: "way";
  id: number;
  nodes: number[];
  geometry: { lat: number; lon: number }[];
  tags?: Record<string, string>;
};

const modes: Record<OsmKind, Record<string, OsmMode>> = {
  rail: {
    rail: "rail",
    // A track without its kind given is ordinary railway.
    yes: "rail",
    narrow_gauge: "rail",
    subway: "subway",
    light_rail: "light_rail",
    tram: "tram",
  },
  // Through roads only: not ramps, streets or driveways.
  road: {
    motorway: "motorway",
    trunk: "trunk",
    primary: "primary",
    secondary: "secondary",
    tertiary: "tertiary",
  },
};
const kindKeys: [OsmKind, string][] = [
  ["rail", "railway"],
  ["road", "highway"],
];
// Bridges, tunnels and stations named after themselves, not the line.
// Norwegian compounds them: "Nidelv jernbanebru", "Ulrikstunnelen".
const structureName =
  /(bru|brua|bridge|tunnel|tunnelen|viadukt|viadukten|kulvert|stasjon|holdeplass)$/i;
// A connected network splits between named lines this long, and this big a
// share of it; shorter names (a station, a siding) belong to their line.
const splitLength = 1500;
const splitShare = 0.15;
// Pieces of one named line join across gaps this wide.
const gapJoin = 1500;
// A piece joins a line it runs alongside, this much of it this close: the
// other track, or the other carriageway. Two differently named lines need
// to share more of their way.
const parallelShare = 0.6;
const parallelNamedShare = 0.85;
const parallelDistance = 60;
// Drawn lines leave out tracks running this close beside a longer one.
const drawnTrackDistance = 35;
// Candidates shorter than this are switches, sidings and mapping debris.
const minimumLength = 300;
// Project alignments keep at most this many points.
const maxPathPoints = 250;

type Way = {
  id: number;
  kind: OsmKind;
  status: OsmStatus;
  mode: OsmMode;
  /** The line it is part of; empty when unnamed. */
  label: string;
  name: string;
  description: string;
  ref: string;
  nodes: number[];
  points: Point[];
  length: number;
  tags: Record<string, string>;
};

const round = ([lat, lng]: Point): Point => [
  Math.round(lat * 1e5) / 1e5,
  Math.round(lng * 1e5) / 1e5,
];

function classify(tags: Record<string, string>) {
  for (const [kind, key] of kindKeys) {
    const value = tags[key];
    let status: OsmStatus;
    let type: string | undefined;
    if (
      value === "construction" ||
      (tags[`construction:${key}`] && value !== "proposed")
    ) {
      status = "construction";
      type =
        (value === "construction" ? tags.construction : undefined) ??
        tags[`construction:${key}`] ??
        (kind === "rail" ? "yes" : undefined);
    } else if (value === "proposed" || tags[`proposed:${key}`]) {
      status = "proposed";
      type =
        (value === "proposed" ? tags.proposed : undefined) ??
        tags[`proposed:${key}`] ??
        (kind === "rail" ? "yes" : undefined);
    } else continue;
    const mode = type ? modes[kind][type] : undefined;
    // Platforms, buildings and switches between tracks aren't lines.
    const service = tags.service ?? tags[`${status}:service`];
    if (!mode || service === "crossover") return null;
    return { kind, status, mode };
  }
  return null;
}
function readWay(raw: OverpassWay): Way | null {
  const tags = raw.tags ?? {};
  const kind = classify(tags);
  if (!kind || raw.geometry.length < 2 || raw.nodes.length !== raw.geometry.length)
    return null;
  const rawName =
    tags.name ?? tags[`${kind.status}:name`] ?? tags["construction:name"] ?? "";
  const name = structureName.test(rawName.trim()) ? "" : rawName.trim();
  const description = (tags.description ?? "").trim();
  const ref = (tags.ref ?? tags[`${kind.status}:ref`] ?? "").trim();
  const points = raw.geometry.map((p): Point => [p.lat, p.lon]);
  return {
    id: raw.id,
    ...kind,
    // A description naming the stretch beats the line's name; one that
    // reads as a note ("Part of proposed …") doesn't.
    // Roads go by number when they have no name.
    label: namelike(description) ? description : name || ref,
    name,
    description,
    ref,
    nodes: raw.nodes,
    points,
    length: pathLength(points),
    tags,
  };
}

class UnionFind<T> {
  private parent = new Map<T, T>();
  find(x: T): T {
    let root = this.parent.get(x) ?? x;
    if (root === x) return x;
    root = this.find(root);
    this.parent.set(x, root);
    return root;
  }
  union(a: T, b: T) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(rb, ra);
  }
  groups(items: T[]) {
    const out = new Map<T, T[]>();
    for (const item of items) {
      const root = this.find(item);
      const list = out.get(root);
      if (list) list.push(item);
      else out.set(root, [item]);
    }
    return [...out.values()];
  }
}

/** Ways that share a node, of the same kind and status, keyed per way. */
function adjacency(ways: Way[]) {
  const byNode = new Map<string, Way[]>();
  for (const way of ways)
    for (const node of way.nodes) {
      const key = `${way.kind}:${way.status}:${node}`;
      const list = byNode.get(key);
      if (list) list.push(way);
      else byNode.set(key, [way]);
    }
  const neighbours = new Map<Way, Set<Way>>(ways.map((way) => [way, new Set()]));
  for (const list of byNode.values())
    for (const a of list) for (const b of list) if (a !== b) neighbours.get(a)!.add(b);
  return neighbours;
}

/**
 * Splits a connected network between its sizeable named lines. Every other
 * way goes to the line it is fewest ways away from.
 */
function splitByLabel(component: Way[], neighbours: Map<Way, Set<Way>>): Way[][] {
  const total = component.reduce((sum, way) => sum + way.length, 0);
  const lengths = new Map<string, number>();
  for (const way of component)
    if (way.label) lengths.set(way.label, (lengths.get(way.label) ?? 0) + way.length);
  const lines = [...lengths]
    .filter(([, length]) => length >= splitLength && length >= total * splitShare)
    .map(([label]) => label);
  if (lines.length < 2) return [component];
  const owner = new Map<Way, string>();
  let frontier = component.filter((way) => lines.includes(way.label));
  for (const way of frontier) owner.set(way, way.label);
  const members = new Set(component);
  while (frontier.length) {
    const next: Way[] = [];
    for (const way of frontier)
      for (const neighbour of neighbours.get(way)!)
        if (members.has(neighbour) && !owner.has(neighbour)) {
          owner.set(neighbour, owner.get(way)!);
          next.push(neighbour);
        }
    frontier = next;
  }
  return lines.map((label) => component.filter((way) => owner.get(way) === label));
}

/** The label covering most of a group's length. */
function leading<T extends string>(ways: Way[], value: (way: Way) => T | "") {
  const lengths = new Map<T, number>();
  for (const way of ways) {
    const v = value(way);
    if (v) lengths.set(v, (lengths.get(v) ?? 0) + way.length);
  }
  return [...lengths].sort((a, b) => b[1] - a[1])[0]?.[0];
}

function minimumDistance(a: Way[], b: Way[]) {
  let best = Infinity;
  // Coarse first: a line's points against the other's segments.
  for (const wa of a)
    for (const wb of b) {
      for (const p of samples(wa.points, 200))
        best = Math.min(best, distanceToLine(p, wb.points));
      if (best === 0) return 0;
    }
  return best;
}

/** Shortest paths over a node graph, from one node. */
function dijkstra(edges: Map<number, [number, number][]>, start: number) {
  const dist = new Map<number, number>([[start, 0]]);
  const previous = new Map<number, number>();
  // A binary heap of [distance, node].
  const heap: [number, number][] = [[0, start]];
  const push = (item: [number, number]) => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heap[parent][0] <= heap[i][0]) break;
      [heap[parent], heap[i]] = [heap[i], heap[parent]];
      i = parent;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  while (heap.length) {
    const [d, node] = pop();
    if (d > (dist.get(node) ?? Infinity)) continue;
    for (const [next, length] of edges.get(node) ?? []) {
      const nd = d + length;
      if (nd < (dist.get(next) ?? Infinity)) {
        dist.set(next, nd);
        previous.set(next, node);
        push([nd, next]);
      }
    }
  }
  return { dist, previous };
}

/**
 * The route through a group: per connected part, the route between its
 * ends (so double track and loops are travelled once), then
 * the parts chained end to end where they carry the line on. A part running
 * beside the route, the other track or carriageway mapped apart, adds only
 * what reaches past it, if that goes on from one of its ends; branches are
 * left out.
 */
function spine(ways: Way[]): Point[] {
  const edges = new Map<number, [number, number][]>();
  const at = new Map<number, Point>();
  const link = (a: number, b: number, length: number) => {
    const list = edges.get(a);
    if (list) list.push([b, length]);
    else edges.set(a, [[b, length]]);
  };
  for (const way of ways)
    for (let i = 0; i < way.nodes.length; i++) {
      at.set(way.nodes[i], way.points[i]);
      if (i) {
        const length = distance(way.points[i - 1], way.points[i]);
        link(way.nodes[i - 1], way.nodes[i], length);
        link(way.nodes[i], way.nodes[i - 1], length);
      }
    }
  const parts: Point[][] = [];
  const seen = new Set<number>();
  for (const start of at.keys()) {
    if (seen.has(start)) continue;
    const nodes = [...dijkstra(edges, start).dist.keys()];
    for (const node of nodes) seen.add(node);
    const route = throughRoute(nodes, edges, at);
    if (route.length > 1) parts.push(route);
  }
  parts.sort((x, y) => pathLength(y) - pathLength(x));
  let path = parts[0] ?? [];
  for (const part of parts.slice(1)) {
    const run = beyond(part, path);
    if (!run) continue;
    // [gap, path ending where it joins, run starting there, joined]
    const reversed = path.toReversed();
    const ends: [number, Point[], Point[], () => Point[]][] = [
      [distance(path.at(-1)!, run[0]), path, run, () => [...path, ...run]],
      [distance(path.at(-1)!, run.at(-1)!), path, run.toReversed(), () => [...path, ...run.toReversed()]],
      [distance(path[0], run.at(-1)!), reversed, run.toReversed(), () => [...run, ...path]],
      [distance(path[0], run[0]), reversed, run, () => [...run.toReversed(), ...path]],
    ];
    const [gap, line, on, joined] = ends.sort((x, y) => x[0] - y[0])[0];
    // Only pieces that carry the line on from one of its ends, onwards
    // rather than back alongside it.
    if (gap <= gapJoin * 1.5 && onwards(line, on)) path = joined();
  }
  return trimHooks(path);
}

/** A vector in metres, for directions. */
function towards(a: Point, b: Point): [number, number] {
  const scale = Math.cos(((a[0] + b[0]) / 2) * (Math.PI / 180));
  return [(b[1] - a[1]) * scale * 111_195, (b[0] - a[0]) * 111_195];
}
/** The point this far back from a line's end. */
function back(line: Point[], metres: number): Point {
  let left = metres;
  for (let i = line.length - 1; i > 0; i--) {
    const length = distance(line[i - 1], line[i]);
    if (length >= left) {
      const t = left / length;
      return [
        line[i][0] + (line[i - 1][0] - line[i][0]) * t,
        line[i][1] + (line[i - 1][1] - line[i][1]) * t,
      ];
    }
    left -= length;
  }
  return line[0];
}
/** Whether `run` heads on from where `line` ends, within 75° of its way. */
function onwards(line: Point[], run: Point[]) {
  const end = line.at(-1)!;
  const [hx, hy] = towards(back(line, 300), end);
  const [rx, ry] = towards(end, back(run.toReversed(), 300));
  const lengths = Math.hypot(hx, hy) * Math.hypot(rx, ry);
  return !lengths || hx * rx + hy * ry >= lengths * Math.cos((75 * Math.PI) / 180);
}
/** The line without hooks at either end. */
function trimHooks(line: Point[]) {
  return trimHook(trimHook(line).toReversed()).toReversed();
}
/**
 * The line without a hook at its end: an end running back alongside the
 * line, as a route out around a terminal loop and back along a station
 * track can.
 */
function trimHook(line: Point[]): Point[] {
  const points = samples(line, centreStep);
  const along = [0];
  for (let i = 1; i < points.length; i++)
    along.push(along[i - 1] + distance(points[i - 1], points[i]));
  let end = points.length;
  while (end > 1) {
    const p = points[end - 1];
    let near = false;
    for (let j = 1; j < end && along[j] < along[end - 1] - centreFull * 2; j++)
      if (segmentDistance(p, points[j - 1], points[j]) <= centreFull) {
        near = true;
        break;
      }
    if (!near) break;
    end--;
  }
  if (end === points.length) return line;
  // Cut where the hook began, keeping the line's own points before it.
  const cut = along[end - 1];
  const out: Point[] = [line[0]];
  let walked = 0;
  for (let i = 1; i < line.length; i++) {
    walked += distance(line[i - 1], line[i]);
    if (walked >= cut) break;
    out.push(line[i]);
  }
  out.push(points[end - 1]);
  return out;
}

/**
 * The route through one connected part: the longest between two of its
 * ends (dead ends, junctions and its outermost points) that lie nearly as
 * far apart on the map as any, once any end running back alongside the
 * rest is cut off. The longest alone can lie on two tracks joined at one or
 * both ends: out along one and back along the other.
 */
function throughRoute(
  nodes: number[],
  edges: Map<number, [number, number][]>,
  at: Map<number, Point>,
): Point[] {
  const degree = (node: number) =>
    new Set((edges.get(node) ?? []).map(([next]) => next)).size;
  // Its two points farthest apart on the map are ends too: where a loop
  // closes, or where two tracks join with both other ends side by side.
  const farFrom = (node: number) =>
    nodes.reduce((best, other) =>
      distance(at.get(other)!, at.get(node)!) > distance(at.get(best)!, at.get(node)!)
        ? other
        : best,
    );
  const extreme = farFrom(nodes[0]);
  let ends = [
    ...new Set([
      extreme,
      farFrom(extreme),
      ...nodes.filter((node) => degree(node) !== 2),
    ]),
  ];
  // Big junctions of sidings: the ends farthest out from the middle.
  if (ends.length > 60) {
    const middle: Point = [0, 0];
    for (const node of ends) {
      middle[0] += at.get(node)![0] / ends.length;
      middle[1] += at.get(node)![1] / ends.length;
    }
    ends = ends
      .map((node) => [node, distance(at.get(node)!, middle)] as const)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 60)
      .map(([node]) => node);
  }
  let widest = 0;
  for (let i = 0; i < ends.length; i++)
    for (let j = i + 1; j < ends.length; j++)
      widest = Math.max(widest, distance(at.get(ends[i])!, at.get(ends[j])!));
  const pairs: { length: number; to: number; previous: Map<number, number> }[] = [];
  for (let i = 0; i < ends.length; i++) {
    const { dist, previous } = dijkstra(edges, ends[i]);
    for (let j = i + 1; j < ends.length; j++)
      if (distance(at.get(ends[i])!, at.get(ends[j])!) >= widest * 0.5)
        pairs.push({ length: dist.get(ends[j]) ?? 0, to: ends[j], previous });
  }
  pairs.sort((x, y) => y.length - x.length);
  // Longest first, without any end running back alongside the rest, until
  // no longer route is left to find.
  let best: Point[] = [];
  let bestLength = 0;
  for (const { length, to, previous } of pairs.slice(0, 50)) {
    if (length <= bestLength) break;
    const route: Point[] = [];
    for (let node: number | undefined = to; node !== undefined; node = previous.get(node))
      route.push(at.get(node)!);
    const trimmed = trimHooks(route.reverse());
    const trimmedLength = pathLength(trimmed);
    if (trimmedLength > bestLength) {
      best = trimmed;
      bestLength = trimmedLength;
    }
  }
  return best;
}

/**
 * The longest stretch of `part` lying farther than tracks are ever averaged
 * from `path`, or nothing worth adding.
 */
function beyond(part: Point[], path: Point[]): Point[] | null {
  const points = samples(part, centreStep);
  let best: Point[] = [];
  let run: Point[] = [];
  for (const p of points) {
    if (distanceToLine(p, path) > centreSpread) run.push(p);
    else run = [];
    if (run.length > best.length) best = run;
  }
  return best.length > 1 && pathLength(best) >= minimumLength ? best : null;
}

// The alignment runs midway between parallel tracks or carriageways:
// measured every `centreStep` metres along the route, against tracks beside
// it running the same way (within 30°) for at least `centreRun` metres.
// Tracks up to `centreFull` apart are averaged in full; farther apart, less
// and less, until at `centreSpread` the route follows its own track, so
// tracks or tunnel tubes drifting apart don't pull it off both of them.
const centreStep = 25;
const centreFull = 80;
const centreSpread = 200;
const centreAngle = Math.cos(Math.PI / 6);
const centreRun = 300;
// Shifts are smoothed over this far each way, so the alignment eases in and
// out where a second track begins and ends.
const centreSmooth = 150;

type Segment = { ax: number; ay: number; bx: number; by: number; track: number };

/**
 * The route moved to the middle of the tracks it runs beside: the average
 * of parallel lines, not one of them, nor both.
 */
function centreline(route: Point[], tracks: Point[][]): Point[] {
  if (route.length < 2) return route;
  // A local flat projection in metres.
  const lat0 = route[0][0];
  const kx = Math.cos(lat0 * (Math.PI / 180)) * 111_195;
  const ky = 111_195;
  const spine = samples(route, centreStep).map(([lat, lng]) => [lng * kx, lat * ky]);
  const n = spine.length;
  if (n < 3) return route;

  // Track segments in a grid of cells as wide as the farthest reach.
  const grid = new Map<string, Segment[]>();
  const cellOf = (v: number) => Math.floor(v / centreSpread);
  tracks.forEach((track, index) => {
    for (let i = 1; i < track.length; i++) {
      const seg: Segment = {
        ax: track[i - 1][1] * kx,
        ay: track[i - 1][0] * ky,
        bx: track[i][1] * kx,
        by: track[i][0] * ky,
        track: index,
      };
      for (let cx = cellOf(Math.min(seg.ax, seg.bx)); cx <= cellOf(Math.max(seg.ax, seg.bx)); cx++)
        for (let cy = cellOf(Math.min(seg.ay, seg.by)); cy <= cellOf(Math.max(seg.ay, seg.by)); cy++) {
          const key = `${cx}:${cy}`;
          const list = grid.get(key);
          if (list) list.push(seg);
          else grid.set(key, [seg]);
        }
    }
  });
  // The route's own segments, by index, to tell which stretch of it a
  // track lies beside.
  const routeGrid = new Map<string, number[]>();
  for (let i = 1; i < n; i++) {
    const key = `${cellOf((spine[i - 1][0] + spine[i][0]) / 2)}:${cellOf((spine[i - 1][1] + spine[i][1]) / 2)}`;
    const list = routeGrid.get(key);
    if (list) list.push(i);
    else routeGrid.set(key, [i]);
  }
  const nearest = (px: number, py: number, seg: Segment) => {
    const dx = seg.bx - seg.ax;
    const dy = seg.by - seg.ay;
    const t =
      dx || dy
        ? Math.max(0, Math.min(1, ((px - seg.ax) * dx + (py - seg.ay) * dy) / (dx * dx + dy * dy)))
        : 0;
    const qx = seg.ax + t * dx;
    const qy = seg.ay + t * dy;
    return { qx, qy, d: Math.hypot(px - qx, py - qy) };
  };
  // Whether a track's point lies beside the route at sample `i`: off the
  // route, and nearest to this stretch of it rather than another, where the
  // line comes back past itself.
  const besideHere = (x: number, y: number, i: number) => {
    const cx = cellOf(x);
    const cy = cellOf(y);
    let best = Infinity;
    let at = i;
    for (let a = cx - 1; a <= cx + 1; a++)
      for (let b = cy - 1; b <= cy + 1; b++)
        for (const j of routeGrid.get(`${a}:${b}`) ?? []) {
          const [ax, ay] = spine[j - 1];
          const [bx, by] = spine[j];
          const { d } = nearest(x, y, { ax, ay, bx, by, track: -1 });
          if (d < best) {
            best = d;
            at = j;
          }
        }
    return best >= 2 && Math.abs(at - i) * centreStep <= best * 1.5 + centreStep * 2;
  };

  // Per point along the route, the sideways offset of each track beside it.
  const normals: [number, number][] = [];
  const offsets: Map<number, number>[] = [];
  for (let i = 0; i < n; i++) {
    const [px, py] = spine[i];
    const [ax, ay] = spine[Math.max(0, i - 1)];
    const [bx, by] = spine[Math.min(n - 1, i + 1)];
    const length = Math.hypot(bx - ax, by - ay) || 1;
    const dx = (bx - ax) / length;
    const dy = (by - ay) / length;
    normals.push([-dy, dx]);
    // Per track and side, the nearest point beside the route. A track can
    // lie on both sides: two tubes joined at a portal are one chain.
    const here = new Map<number, number>();
    const nearestAt = new Map<number, number>();
    const cx = cellOf(px);
    const cy = cellOf(py);
    for (let a = cx - 1; a <= cx + 1; a++)
      for (let b = cy - 1; b <= cy + 1; b++)
        for (const seg of grid.get(`${a}:${b}`) ?? []) {
          const { d, qx, qy } = nearest(px, py, seg);
          if (d < 2 || d > centreSpread) continue;
          const sl = Math.hypot(seg.bx - seg.ax, seg.by - seg.ay) || 1;
          const cos = Math.abs(((seg.bx - seg.ax) * dx + (seg.by - seg.ay) * dy) / sl);
          if (cos < centreAngle) continue;
          // Straight beside the route, not ahead of it where a track ends.
          const along = (qx - px) * dx + (qy - py) * dy;
          if (Math.abs(along) > d * 0.5 + 5) continue;
          const offset = (qx - px) * -dy + (qy - py) * dx;
          const key = seg.track * 2 + (offset > 0 ? 1 : 0);
          if (d >= (nearestAt.get(key) ?? Infinity) || !besideHere(qx, qy, i)) continue;
          nearestAt.set(key, d);
          here.set(key, offset);
        }
    offsets.push(here);
  }

  // Only tracks keeping beside it for long enough: not lines crossing it.
  const minimumRun = Math.ceil(centreRun / centreStep);
  for (let key = 0; key < tracks.length * 2; key++) {
    let start = 0;
    for (let i = 0; i <= n; i++) {
      if (i < n && offsets[i].has(key)) continue;
      if (i - start < minimumRun)
        for (let j = start; j < i; j++) offsets[j].delete(key);
      start = i + 1;
    }
  }

  const weight = (d: number) =>
    Math.max(0, Math.min(1, (centreSpread - d) / (centreSpread - centreFull)));
  const shifts = offsets.map((here) => {
    let lo = 0;
    let hi = 0;
    for (const o of here.values()) {
      const effective = o * weight(Math.abs(o));
      lo = Math.min(lo, effective);
      hi = Math.max(hi, effective);
    }
    return (lo + hi) / 2;
  });
  const radius = Math.round(centreSmooth / centreStep);
  const prefix = [0];
  for (const shift of shifts) prefix.push(prefix.at(-1)! + shift);
  return spine.map(([x, y], i): Point => {
    const from = Math.max(0, i - radius);
    const to = Math.min(n, i + radius + 1);
    const shift = (prefix[to] - prefix[from]) / (to - from);
    return [(y + normals[i][1] * shift) / ky, (x + normals[i][0] * shift) / kx];
  });
}

/**
 * Ways stitched end to end where nothing branches, longest first: each
 * track or carriageway as one line.
 */
function chains(ways: Way[]): Point[][] {
  // Per node, how many way ends meet there (an inner node counts twice).
  const degree = new Map<number, number>();
  for (const way of ways)
    way.nodes.forEach((node, i) => {
      const end = i === 0 || i === way.nodes.length - 1;
      degree.set(node, (degree.get(node) ?? 0) + (end ? 1 : 2));
    });
  const byEnd = new Map<number, Way[]>();
  for (const way of ways)
    for (const node of [way.nodes[0], way.nodes.at(-1)!]) {
      const list = byEnd.get(node);
      if (list) list.push(way);
      else byEnd.set(node, [way]);
    }
  const used = new Set<Way>();
  // Follows the line on from `node`, appending oriented points.
  const extend = (node: number, out: Point[]) => {
    for (;;) {
      if (degree.get(node) !== 2) return;
      const next = byEnd.get(node)?.find((way) => !used.has(way));
      if (!next) return;
      used.add(next);
      const forward = next.nodes[0] === node;
      const points = forward ? next.points : next.points.toReversed();
      out.push(...points.slice(1));
      node = forward ? next.nodes.at(-1)! : next.nodes[0];
    }
  };
  const out: Point[][] = [];
  for (const way of ways) {
    if (used.has(way)) continue;
    used.add(way);
    const after: Point[] = [];
    extend(way.nodes.at(-1)!, after);
    const before: Point[] = [];
    extend(way.nodes[0], before);
    out.push([...before.toReversed(), ...way.points, ...after]);
  }
  return out.sort((a, b) => pathLength(b) - pathLength(a));
}

/**
 * The lines to draw: chains, so a dotted line keeps its rhythm instead of
 * restarting at every way, with tracks running right beside a longer one
 * left out, so double track doesn't draw as two dot patterns drifting over
 * each other.
 */
function drawnLines(tracks: Point[][]): Point[][] {
  const kept: Point[][] = [];
  for (const chain of tracks)
    if (!kept.length || coveredShare(chain, kept, drawnTrackDistance) < 0.75)
      kept.push(chain);
  return kept;
}

function wikipediaUrl(value: string | undefined) {
  const match = value?.match(/^([a-z-]{2,12}):(.+)$/);
  if (!match) return undefined;
  return `https://${match[1]}.wikipedia.org/wiki/${encodeURIComponent(match[2].replaceAll(" ", "_"))}`;
}

export function buildOsmCandidates(elements: OverpassWay[]): OsmCandidate[] {
  const ways = elements
    .filter((element) => element.type === "way")
    .map(readWay)
    .filter((way): way is Way => way !== null);
  const neighbours = adjacency(ways);

  // 1. Networks of connected ways, split between their named lines.
  const connected = new UnionFind<Way>();
  for (const [way, list] of neighbours) for (const other of list) connected.union(way, other);
  const pieces = connected
    .groups(ways)
    .flatMap((component) => splitByLabel(component, neighbours));

  // 2. Pieces of one line join: across small gaps when they share a name,
  // and tracks or carriageways running beside each other.
  const pieceLength = (piece: Way[]) =>
    piece.reduce((sum, way) => sum + way.length, 0);
  const joined = new UnionFind<Way[]>();
  const label = new Map(pieces.map((piece) => [piece, leading(piece, (w) => w.label) ?? ""]));
  const bounds = new Map(
    pieces.map((piece) => {
      const all = piece.flatMap((way) => way.points);
      return [
        piece,
        [
          Math.min(...all.map((p) => p[0])),
          Math.min(...all.map((p) => p[1])),
          Math.max(...all.map((p) => p[0])),
          Math.max(...all.map((p) => p[1])),
        ],
      ] as const;
    }),
  );
  // ~gapJoin in degrees (111 km each), generous in longitude for the far north.
  const margin = gapJoin / 111_195;
  const nearby = (a: Way[], b: Way[]) => {
    const [as, aw, an, ae] = bounds.get(a)!;
    const [bs, bw, bn, be] = bounds.get(b)!;
    return (
      as - margin <= bn && bs - margin <= an && aw - margin * 4 <= be && bw - margin * 4 <= ae
    );
  };
  for (let i = 0; i < pieces.length; i++)
    for (let j = i + 1; j < pieces.length; j++) {
      const a = pieces[i];
      const b = pieces[j];
      if (
        a[0].status !== b[0].status ||
        a[0].kind !== b[0].kind ||
        !nearby(a, b)
      )
        continue;
      const la = label.get(a)!;
      const lb = label.get(b)!;
      if (la && la === lb && minimumDistance(a, b) <= gapJoin) {
        joined.union(a, b);
        continue;
      }
      // The shorter piece, measured along the longer one.
      const [short, long] =
        pieceLength(a) <= pieceLength(b) ? [a, b] : [b, a];
      const others = long.map((way) => way.points);
      const share =
        short.reduce(
          (sum, way) =>
            sum + way.length * coveredShare(way.points, others, parallelDistance),
          0,
        ) / pieceLength(short);
      if (share >= (la && lb ? parallelNamedShare : parallelShare))
        joined.union(a, b);
    }

  // 3. A candidate per line.
  const candidates: OsmCandidate[] = [];
  for (const group of joined.groups(pieces)) {
    const members = group.flat();
    const tracks = chains(members);
    const path = centreline(spine(members), tracks);
    const length = pathLength(path);
    if (length < minimumLength) continue;
    let tolerance = 4;
    let simplified = simplify(path, tolerance);
    while (simplified.length > maxPathPoints) simplified = simplify(path, (tolerance *= 1.5));
    const { kind, status } = members[0];
    const tag = (key: string) =>
      leading(members, (way) => way.tags[key] ?? way.tags[`${status}:${key}`] ?? "");
    const description = leading(members, (way) => way.description);
    const website = tag("website");
    candidates.push({
      id: `${status === "construction" ? "c" : "p"}${Math.min(...members.map((way) => way.id))}`,
      kind,
      status,
      mode: leading(members, (way) => way.mode) ?? (kind === "rail" ? "rail" : "primary"),
      name: leading(members, (way) => way.name) ?? "",
      ...(leading(members, (way) => way.ref) && {
        ref: leading(members, (way) => way.ref),
      }),
      ...(description && { description }),
      ...(tag("operator") && { operator: tag("operator") }),
      ...(tag("opening_date") && { opening: tag("opening_date") }),
      ...(website?.startsWith("https://")
        ? { website }
        : wikipediaUrl(tag("wikipedia")) && { website: wikipediaUrl(tag("wikipedia")) }),
      length: Math.round(length),
      path: simplified.map(round),
      lines: drawnLines(tracks).map((line) => simplify(line, 1.5).map(round)),
      ways: members.map((way) => way.id).sort((a, b) => a - b),
    });
  }
  return candidates.sort((a, b) => b.length - a.length);
}
