import {
  dateTime,
  isPost,
  type Project,
  projectEvents,
  projectPhases,
  type ProjectUpdate,
  type Status,
} from "./data";
import { phaseDate, phaseTimes } from "./phase-track";

/** Each phase's step on the timeline, and its entry in Oppdateringer. */
export const phaseLabels: Record<Status, string> = {
  proposed: "Foreslått",
  planned: "Planstart",
  construction: "Byggestart",
  completed: "Ferdig",
};

/**
 * One point of a project's timeline as Oppdateringer tells it: a phase it
 * reached, or an event on the way, posts among them.
 */
export type TimelineEntry = {
  /** A stored event's own id; a phase's from `phaseEntryId`. */
  id: string;
  /** When it fell, or falls, in ms; unknown for a phase nothing dates. */
  time?: number;
  /** Still to come: the next thing to happen. */
  upcoming: boolean;
} & (
  | {
      kind: "phase";
      phase: Status;
      /** A year or a month, or none. */
      date: string;
    }
  | { kind: "event"; event: ProjectUpdate }
);

export const phaseEntryId = (phase: Status) => `phase-${phase}`;

/**
 * What Oppdateringer lists: the phases the project has reached and the
 * events that have happened, newest first, after the next thing to happen
 * if it has a date. Posts are never still to come.
 *
 * Without the reader's clock (`now` null, as on the server), only posts
 * among the events can be told to have happened, and nothing is next.
 */
export function timelineEntries(
  project: Project,
  now: number | null,
): TimelineEntry[] {
  const phases = projectPhases(project);
  const current = phases.indexOf(project.status);
  const times = phaseTimes(project);
  const happened: TimelineEntry[] = [];
  const ahead: TimelineEntry[] = [];
  phases.forEach((phase, index) => {
    const date = phaseDate(project, phase);
    const entry = {
      kind: "phase" as const,
      id: phaseEntryId(phase),
      phase,
      date,
      time: times[index],
      upcoming: false,
    };
    if (index <= current) happened.push(entry);
    else if (date) ahead.push(entry);
  });
  for (const event of projectEvents(project)) {
    const time = dateTime(event.date);
    const entry = {
      kind: "event" as const,
      id: event.id,
      event,
      time,
      upcoming: false,
    };
    if (isPost(event) || (now !== null && time <= now)) happened.push(entry);
    else if (now !== null) ahead.push(entry);
  }
  // A phase nothing dates sits below those that are, in its order.
  const newest = happened
    .map((entry, order) => ({ entry, order }))
    .sort(
      (a, b) =>
        (b.entry.time ?? -Infinity) - (a.entry.time ?? -Infinity) ||
        b.order - a.order,
    )
    .map(({ entry }) => entry);
  const next = ahead.reduce<TimelineEntry | undefined>(
    (soonest, entry) =>
      !soonest || entry.time! < soonest.time! ? entry : soonest,
    undefined,
  );
  return next ? [{ ...next, upcoming: true }, ...newest] : newest;
}
