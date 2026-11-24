import {
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
 * Done stretches shrink to what their labels need; the stretch under way, when
 * both its ends are dated, takes the room that's left. Without both dates the
 * steps stay evenly spread.
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
};

// Geist at the timeline's size averages about half an em per character;
// medium-weight "Byggestart" and "mars" run widest.
const emPerCharacter = 0.58;
const gap = 1;
const activeWeight = 3;

/** A phase date's span in ms: a whole year, or a month. */
function period(date: string) {
  const [year, month] = date.split("-").map(Number);
  return month
    ? [Date.UTC(year, month - 1, 1), Date.UTC(year, month, 1)]
    : [Date.UTC(year, 0, 1), Date.UTC(year + 1, 0, 1)];
}

/**
 * The stretch from one dated phase to the next: from the middle of the period
 * it began in to the middle of the one it's due in, or across both periods
 * when they're the same or overlap.
 */
function stretch(from: string, to: string) {
  const [startFrom, startTo] = period(from);
  const [endFrom, endTo] = period(to);
  const start = (startFrom + startTo) / 2;
  const end = (endFrom + endTo) / 2;
  if (end > start) return { start, end };
  return endTo > startFrom ? { start: startFrom, end: endTo } : undefined;
}

/**
 * When the phase after `status` on the project's timeline begins, or for
 * Ferdig the year it's due.
 */
function nextDate(project: Project, phases: Status[], status: Status) {
  const next = phases[phases.indexOf(status) + 1];
  if (!next) return "";
  if (next === "completed") return finishYear(project);
  return project.phaseDates?.[next] ?? "";
}

export function phaseTrack(
  project: Project,
  /** Each of `projectPhases(project)`'s label and date, as shown under the line. */
  texts: { label: string; date: string }[],
): PhaseTrack {
  const phases = projectPhases(project);
  const current = phases.indexOf(project.status);
  const last = phases.length - 1;
  const from =
    project.status === "completed"
      ? ""
      : (project.phaseDates?.[project.status as Exclude<Status, "completed">] ??
        "");
  const to = nextDate(project, phases, project.status);
  const span = from && to ? stretch(from, to) : undefined;
  const active = span && { index: current, ...span };
  const width = texts.map(
    ({ label, date }) => Math.max(label.length, date.length) * emPerCharacter,
  );
  const open = !phases.includes("completed");
  // The ends' labels sit inside the line; the middle ones centre on their
  // dots. Running off the end, the last phase is a middle one.
  const share = (index: number) =>
    index === 0 || (index === last && !open) ? width[index] : width[index] / 2;
  const stretches = open ? phases : phases.slice(0, last);
  return {
    weights: stretches.map((_, index) =>
      index === active?.index ? activeWeight : 1,
    ),
    minimums: stretches.map(
      (_, index) =>
        share(index) + (index < last ? share(index + 1) : width[index] / 2) + gap,
    ),
    active,
    open,
  };
}

/** How far along the stretch under way is at `now`, from 0 to 1. */
export function trackProgress(active: { start: number; end: number }, now: number) {
  return Math.min(1, Math.max(0, (now - active.start) / (active.end - active.start)));
}
