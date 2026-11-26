import {
  datePeriod,
  dateTime,
  finishYear,
  type Project,
  projectPhases,
  type Status,
} from "./data";

/**
 * The timeline's shape: how much room each stretch between two phases gets,
 * and which one is under way with a known start and end, so its fill can
 * show how far along it is.
 *
 * A stretch with both ends dated is as long as the time between them, so a
 * step sits where its date falls between its neighbours': Byggestart moves
 * with both when planning began and when it's due to be done. A stretch
 * missing a date takes the dated ones' average, and with no dates at all
 * the steps stay evenly spread. Once others are dated, the stretch from
 * Foreslått is drawn short, unless milestones fall on it: a proposal often
 * lies years back, and those years would squeeze the steps that matter.
 * Every stretch keeps room for its labels.
 */
export type PhaseTrack = {
  /**
   * Flex weights of the stretches after each of the project's phases, first
   * first. Without Ferdig the last phase has one too, running off the end.
   */
  weights: number[];
  /** Least room per stretch, in em of the labels' type. */
  minimums: number[];
  /** The stretch under way, if both its ends are dated. */
  active?: { index: number; start: number; end: number };
  /** No Ferdig: the line runs on past the last phase. */
  open: boolean;
  /**
   * When each stretch runs, in ms, where that can be told: from its dates,
   * or estimated from its neighbours'. Milestones are placed by it.
   */
  spans: ({ start: number; end: number } | undefined)[];
};

/** A milestone's place: on which stretch, and how far along it. */
export type TrackPlace = { index: number; fraction: number };

// IBM Plex Sans at the timeline's size averages about half an em per character;
// medium-weight "Byggestart" and "mars" run widest.
const emPerCharacter = 0.58;
const gap = 1;
const year = 365.25 * 86_400_000;

/**
 * The stretch from one dated phase to the next: from the middle of the period
 * it began in to the middle of the one it's due in, or across both periods
 * when they're the same or overlap.
 */
function stretch(from: string, to: string) {
  const [startFrom, startTo] = datePeriod(from);
  const [endFrom, endTo] = datePeriod(to);
  const start = (startFrom + startTo) / 2;
  const end = (endFrom + endTo) / 2;
  if (end > start) return { start, end };
  return endTo > startFrom ? { start: startFrom, end: endTo } : undefined;
}

/** When a phase began, or for Ferdig the year it's done or due. */
export function phaseDate(project: Project, phase: Status | undefined) {
  if (!phase) return "";
  if (phase === "completed") return finishYear(project);
  return project.phaseDates?.[phase] ?? "";
}

export function phaseTrack(
  project: Project,
  /** Each of `projectPhases(project)`'s label and date, as shown under the line. */
  texts: { label: string; date: string }[],
  /** When its events fall, in ms. */
  milestones: number[] = [],
): PhaseTrack {
  const phases = projectPhases(project);
  const current = phases.indexOf(project.status);
  const last = phases.length - 1;
  const open = !phases.includes("completed");
  const stretches = open ? phases : phases.slice(0, last);
  // Each stretch's span in time, where both its ends are dated.
  const spans = stretches.map((phase, index) => {
    const from = phaseDate(project, phase);
    const to = phaseDate(project, phases[index + 1]);
    return from && to ? stretch(from, to) : undefined;
  });
  const span = spans[current];
  const active = span && { index: current, ...span };
  // When it was first proposed is often long before the rest, and would
  // squeeze the steps that matter; that stretch never sets the pace.
  const years = spans.map((span, index) =>
    span && stretches[index] !== "proposed"
      ? (span.end - span.start) / year
      : undefined,
  );
  const dated = years.filter((length) => length !== undefined);
  const average = dated.length
    ? dated.reduce((sum, length) => sum + length, 0) / dated.length
    : 1;
  const estimated = estimatedSpans(
    phases.map((phase) => {
      const date = phaseDate(project, phase);
      return date ? dateTime(date) : undefined;
    }),
    spans,
    // Estimates go by real time, the stretch from Foreslått included.
    years.map((length) => (length ?? average) * year),
    open,
  );
  // Short, unless milestones need the room.
  const short = (index: number) =>
    stretches[index] === "proposed" &&
    dated.length > 0 &&
    !milestones.some((time) => time < (estimated[index]?.end ?? Infinity));
  const weights = years.map(
    (length, index) => length ?? (short(index) ? average / 4 : average),
  );
  const width = texts.map(
    ({ label, date }) => Math.max(label.length, date.length) * emPerCharacter,
  );
  // The ends' labels sit inside the line; the middle ones centre on their
  // dots. Running off the end, the last phase is a middle one.
  const share = (index: number) =>
    index === 0 || (index === last && !open) ? width[index] : width[index] / 2;
  return {
    weights,
    minimums: stretches.map(
      (_, index) =>
        share(index) +
        (index < last ? share(index + 1) : width[index] / 2) +
        gap,
    ),
    active,
    open,
    spans: estimated,
  };
}

/**
 * Every stretch's run in time, where any phase is dated: dated stretches as
 * they are, the rest worked out from the dated phases around them, shared
 * out by each stretch's usual length, or reaching past them by it.
 */
function estimatedSpans(
  times: (number | undefined)[],
  spans: ({ start: number; end: number } | undefined)[],
  lengths: number[],
  open: boolean,
) {
  const points = [...times];
  // Running off the end, the line's tail is as long as a stretch.
  if (open) points.push(undefined);
  const known = points.flatMap((time, index) =>
    time === undefined ? [] : [index],
  );
  if (!known.length) return spans.map(() => undefined);
  // Where each point would sit by the stretches' usual lengths alone.
  const offsets = [0];
  for (const length of lengths) offsets.push(offsets.at(-1)! + length);
  const at = (index: number) => {
    if (points[index] !== undefined) return points[index]!;
    const before = known.findLast((other) => other < index);
    const after = known.find((other) => other > index);
    if (before !== undefined && after !== undefined) {
      const share =
        (offsets[index] - offsets[before]) /
        (offsets[after] - offsets[before] || 1);
      return points[before]! + share * (points[after]! - points[before]!);
    }
    const anchor = before ?? after!;
    return points[anchor]! + offsets[index] - offsets[anchor];
  };
  return spans.map(
    (span, index) => span ?? { start: at(index), end: at(index + 1) },
  );
}

/**
 * When each of `projectPhases(project)` begins, or for Ferdig ends, in ms:
 * by its date, or where the line has it between those dated around it.
 * Unknown while none is dated.
 */
export function phaseTimes(project: Project): (number | undefined)[] {
  const phases = projectPhases(project);
  const { spans } = phaseTrack(
    project,
    phases.map(() => ({ label: "", date: "" })),
  );
  return phases.map((phase, index) => {
    const date = phaseDate(project, phase);
    return date
      ? dateTime(date)
      : (spans[index]?.start ?? spans[index - 1]?.end);
  });
}

/**
 * Where a milestone dated `time` falls on the line: along the stretch it's
 * within, or at the end nearest it before the first phase or after the last.
 */
export function trackPlace(
  track: PhaseTrack,
  time: number,
): TrackPlace | undefined {
  const spans = track.spans;
  if (!spans.some(Boolean)) return undefined;
  const index = spans.findIndex(
    (span) => span && time >= span.start && time < span.end,
  );
  if (index >= 0) {
    const { start, end } = spans[index]!;
    return { index, fraction: (time - start) / (end - start || 1) };
  }
  const first = spans.findIndex(Boolean);
  if (time < spans[first]!.start) return { index: first, fraction: 0 };
  const last = spans.findLastIndex(Boolean);
  if (time >= spans[last]!.end)
    return {
      index: last,
      fraction: track.open && last === spans.length - 1 ? 0.6 : 1,
    };
  // Dates out of order: the stretch whose start is nearest.
  let nearest = first;
  spans.forEach((span, other) => {
    if (
      span &&
      Math.abs(span.start - time) < Math.abs(spans[nearest]!.start - time)
    )
      nearest = other;
  });
  return { index: nearest, fraction: 0 };
}

/** How far along the stretch under way is at `now`, from 0 to 1. */
export function trackProgress(
  active: { start: number; end: number },
  now: number,
) {
  return Math.min(
    1,
    Math.max(0, (now - active.start) / (active.end - active.start)),
  );
}
