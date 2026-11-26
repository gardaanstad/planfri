"use client";
import { X } from "lucide-react";
import {
  type CSSProperties,
  Fragment,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import {
  finishYear,
  formatPhaseDate,
  type Milestone,
  type Project,
  projectPhases,
  type Status,
} from "../lib/data";
import { cn } from "../lib/cn";
import {
  dateTime,
  phaseTrack,
  type TrackPlace,
  trackPlace,
  trackProgress,
} from "../lib/phase-track";
import { statusTone } from "../lib/ui";
import { useNow } from "./relative-time";

// The timeline's own words: short, so four fit side by side on a phone.
const phaseLabels: Record<Status, string> = {
  proposed: "Foreslått",
  planned: "Planstart",
  construction: "Byggestart",
  completed: "Ferdig",
};

/** When each phase began, or for "Ferdig" the year it's done or due. */
function phaseDate(project: Project, status: Status) {
  if (status === "completed") return finishYear(project);
  const date = project.phaseDates?.[status];
  return date ? formatPhaseDate(date) : "";
}

// What the fill of the stretch under way measures, for screen readers.
const progressWords: Partial<Record<Status, string>> = {
  proposed: "av tiden fram til planleggingen",
  planned: "av tiden fram til byggestart",
  construction: "av byggetiden",
};

/** The timeline as an editor: each part of it a control of its own. */
export type TimelineEditing = {
  idPrefix: string;
  /** A phase's date as typed; for Ferdig, its year. */
  value: (phase: Status) => string;
  /** No date to give: Ferdig while it's only a proposal. */
  undatable: (phase: Status) => boolean;
  invalid: (phase: Status) => boolean;
  setValue: (phase: Status, text: string) => void;
  setStatus: (phase: Status) => void;
  /** Takes a phase off the line; none for Under bygging. */
  remove: (phase: Status) => void;
  /** The draft's milestones, their dates as typed. */
  milestones: Milestone[];
  milestoneInvalid: (milestone: Milestone) => boolean;
  /**
   * The stored date a milestone is placed by: while its date is being typed,
   * the one it last read clearly as.
   */
  placedBy: (milestone: Milestone) => string | undefined;
  changeMilestone: (id: string, patch: Partial<Milestone>) => void;
  removeMilestone: (id: string) => void;
  /** Adds a milestone, dated as typed where the line was pressed, if it can be told. */
  addMilestone: (date?: string) => void;
  /** A milestone just added, to type its name into. */
  focus?: string;
};

// Labels hang from the line in rows: the phases' first, then milestones
// that don't fit beside them, each a row further down.
const labelTop = 16;
const rowHeight = 32;
const rowGap = 6;
const rowTop = (row: number) => labelTop + row * (rowHeight + rowGap);
// Least room between two labels side by side, in px.
const labelGap = 8;
// Below the dot on the line, where a leader to a lower label starts.
const leaderTop = 9;

type Layout = {
  /** Each milestone's row, and how far its label shifts to stay inside. */
  labels: Record<string, { row: number; shift: number }>;
  /** Placed by its milestone's dot, so it stays under it whatever the zoom. */
  leaders: { id: string; top: number; bottom: number }[];
};

/**
 * Sets each milestone's label in the first row where it fits beside the
 * others, kept within the line's ends. One that can't sit by its dot hangs
 * from it by a leader, broken where it passes behind a label.
 */
function measure(list: HTMLElement): Layout {
  const box = list.getBoundingClientRect();
  type Box = { left: number; right: number; top: number; bottom: number };
  const relative = (rect: DOMRect): Box => ({
    left: rect.left - box.left,
    right: rect.right - box.left,
    top: rect.top - box.top,
    bottom: rect.bottom - box.top,
  });
  const rows: Box[][] = [
    [...list.querySelectorAll("[data-step-label]")].map((element) =>
      relative(element.getBoundingClientRect()),
    ),
  ];
  const milestones = [
    ...list.querySelectorAll<HTMLElement>("[data-milestone-label]"),
  ].map((label) => {
    const id = label.dataset.milestoneLabel!;
    const dot = list
      .querySelector(`[data-milestone-dot="${CSS.escape(id)}"]`)!
      .getBoundingClientRect();
    return {
      id,
      x: (dot.left + dot.right) / 2 - box.left,
      width: label.offsetWidth,
    };
  });
  milestones.sort((a, b) => a.x - b.x);
  const layout: Layout = { labels: {}, leaders: [] };
  const hanging: { id: string; x: number; row: number }[] = [];
  for (const { id, x, width } of milestones) {
    const centred = x - width / 2;
    const left = Math.min(Math.max(centred, 0), Math.max(box.width - width, 0));
    const right = left + width;
    let row = 0;
    while (
      rows[row]?.some(
        (other) =>
          left < other.right + labelGap && right > other.left - labelGap,
      )
    )
      row++;
    const top = rowTop(row);
    (rows[row] ??= []).push({ left, right, top, bottom: top + rowHeight });
    layout.labels[id] = { row, shift: Math.round(left - centred) };
    if (row) hanging.push({ id, x, row });
  }
  // Once every label is placed, each leader runs down to its own, behind any
  // it passes, those placed after it too.
  for (const { id, x, row } of hanging) {
    const top = rowTop(row);
    const behind = rows
      .slice(0, row)
      .flat()
      .filter((other) => x > other.left - 3 && x < other.right + 3)
      .sort((a, b) => a.top - b.top);
    let from = leaderTop;
    for (const other of behind) {
      if (other.top - 2 > from)
        layout.leaders.push({ id, top: from, bottom: other.top - 2 });
      from = Math.max(from, other.bottom + 2);
    }
    if (top - 2 > from) layout.leaders.push({ id, top: from, bottom: top - 2 });
  }
  return layout;
}

const sameLayout = (a: Layout, b: Layout) =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * An inline field on the line: reads as its text until it's used. It keeps
 * the line's small type even on phones, so the editor lays out as it shows.
 */
const inlineInput = cn(
  "-mx-1 block rounded-sm bg-transparent px-1 tabular-nums outline-none",
  "placeholder:text-muted/70 hover:bg-ink/[0.05]",
  "focus:bg-surface focus:ring-2 focus:ring-accent/35",
  "aria-invalid:text-danger aria-invalid:underline aria-invalid:decoration-dotted",
);

/**
 * The phases a project passes through, on a line across the panel: those
 * behind it quiet, the one it's in marked in its status colour, those ahead
 * hollow. Each step carries its date when it has one, and milestones sit
 * where theirs fall between them.
 *
 * The stretches it has passed are drawn solid. Each step sits where its date
 * falls between its neighbours' (see `phaseTrack`). When the stretch it's in
 * has both ends dated (a start of building and a year it's due, say), it
 * fills in the phase's colour as far as time has come.
 *
 * With `edit`, the line is its own editor: dates are typed where they show,
 * a step's dot takes it off the line, and "Nå" above a step makes it the
 * phase the project is in.
 */
export default function PhaseTimeline({
  project,
  label = "Fase",
  className = "mt-3",
  edit,
}: {
  project: Project;
  label?: string;
  className?: string;
  edit?: TimelineEditing;
}) {
  const now = useNow();
  const phases = projectPhases(project);
  const current = phases.indexOf(project.status);
  const texts = phases.map((status) => ({
    label: phaseLabels[status],
    // Editing, a step keeps room for its field.
    date: edit
      ? edit.undatable(status)
        ? ""
        : edit.value(status).padEnd(5, "0")
      : phaseDate(project, status),
  }));
  const last = phases.length - 1;
  // Milestones, placed by their dates. While one's date is being typed it
  // stays where it last read clearly.
  const milestones = edit?.milestones ?? project.milestones ?? [];
  const times = milestones.map((milestone) => {
    const date = edit ? edit.placedBy(milestone) : milestone.date;
    return date ? dateTime(date) : (now ?? undefined);
  });
  const track = phaseTrack(
    project,
    texts,
    times.filter((time) => time !== undefined),
  );
  const stretches = track.open ? phases : phases.slice(0, last);
  // Unknown until the reader's clock is, so the fill grows in on hydration.
  const progress =
    track.active && now !== null ? trackProgress(track.active, now) : 0;
  const tone = statusTone[project.status];
  const places: (TrackPlace | undefined)[] = times.map((time) =>
    time === undefined ? undefined : trackPlace(track, time),
  );
  // Nothing dated to go by: they share the stretch under way, in order.
  const unplaced = places.flatMap((place, index) => (place ? [] : [index]));
  unplaced.forEach((index, order) => {
    places[index] = {
      index: Math.min(Math.max(current, 0), stretches.length - 1),
      fraction: (order + 1) / (unplaced.length + 1),
    };
  });

  const listRef = useRef<HTMLOListElement>(null);
  // The stretches on the line, so each is observed as it comes and goes.
  const steps = phases.join();
  const [layout, setLayout] = useState<Layout | null>(null);
  // Labels can only be fitted once they're laid out; until then they wait
  // unseen. Fitted as the line is first laid out and on resize, from the
  // observer, which reads layout the frame has done anyway; then again
  // whenever what it lays out changes, as typing changes their widths.
  const fit = useEffectEvent(() => {
    const list = listRef.current;
    if (!list) return;
    const next = measure(list);
    setLayout((layout) => (layout && sameLayout(layout, next) ? layout : next));
  });
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    // Before the frame paints, so labels show fitted from the first.
    // Its stretches too: their share of it can change while it doesn't.
    const observer = new ResizeObserver(() => flushSync(fit));
    observer.observe(list);
    for (const stretch of list.children) observer.observe(stretch);
    return () => observer.disconnect();
  }, [steps]);
  const shape = JSON.stringify([
    texts,
    milestones.map(({ id, label, date }) => [id, label, date]),
    places,
    track.weights,
    track.minimums,
    track.open,
    current,
    Boolean(edit),
  ]);
  const shaped = useRef(shape);
  useLayoutEffect(() => {
    if (shaped.current === shape) return;
    shaped.current = shape;
    fit();
  }, [shape]);
  const rows = Math.max(
    0,
    ...Object.values(layout?.labels ?? {}).map(({ row }) => row),
  );
  const dated = Boolean(
    edit || milestones.length || texts.some(({ date }) => date),
  );
  const height = rows ? rowTop(rows) + rowHeight : dated ? 48 : 32;

  const passedMilestone = (index: number) =>
    now !== null && times[index] !== undefined
      ? times[index]! <= now
      : places[index]!.index < current;

  // Events that have happened past the phase it's in: the line counts as
  // passed as far as the latest of them.
  const reach = milestones.reduce<TrackPlace | undefined>(
    (furthest, _, index) => {
      const place = places[index]!;
      if (place.index < current || !passedMilestone(index)) return furthest;
      return !furthest ||
        place.index > furthest.index ||
        (place.index === furthest.index && place.fraction > furthest.fraction)
        ? place
        : furthest;
    },
    undefined,
  );
  /** How much of a stretch from the phase it's in on is passed, from 0 to 1. */
  const reached = (index: number) =>
    !reach || index < current || index > reach.index
      ? 0
      : index < reach.index
        ? 1
        : Math.min(1, Math.max(0, reach.fraction));

  const dotStyle = (state: "current" | "passed" | "ahead") =>
    state === "current"
      ? ["size-2.5 ring-3", tone.dot, tone.ring]
      : state === "passed"
        ? "size-1.5 bg-ink-soft/70"
        : "size-1.5 border border-border-strong bg-surface";

  /**
   * A dot on the line, centred where `left` says. Editing, it takes its
   * point off the line, and shows a cross to say so.
   */
  const dot = (
    state: "current" | "passed" | "ahead",
    style: CSSProperties,
    remove?: { label: string; onClick: () => void },
    data?: Record<string, string>,
    layer = "z-1",
  ) => {
    const mark = (
      <i
        aria-hidden="true"
        className={cn(
          "block rounded-full",
          dotStyle(state),
          remove && "transition-opacity group-hover/dot:opacity-0",
        )}
      />
    );
    const place = cn("absolute top-1.25 -translate-1/2", layer);
    return remove ? (
      <button
        type="button"
        className={cn(
          place,
          "group/dot flex size-5 items-center justify-center rounded-full outline-none",
          "focus-visible:ring-2 focus-visible:ring-accent pointer-coarse:size-8",
        )}
        style={style}
        aria-label={remove.label}
        data-tooltip="Fjern fra tidslinjen"
        onClick={remove.onClick}
        {...data}
      >
        {mark}
        <span
          aria-hidden="true"
          className="absolute flex size-3.5 items-center justify-center rounded-full border border-border-strong bg-surface text-ink opacity-0 transition-opacity group-hover/dot:opacity-100"
        >
          <X size={9} strokeWidth={2.5} />
        </span>
      </button>
    ) : (
      <span className={place} style={style} {...data}>
        {mark}
      </span>
    );
  };

  const step = (status: Status, index: number) => {
    const edge =
      index === 0 ? "start" : index === last && !track.open ? "end" : "middle";
    const radius = index === current ? 5 : 3;
    const align =
      edge === "start"
        ? "left-0 text-left"
        : edge === "end"
          ? "right-0 text-right"
          : "left-0 -translate-x-1/2 text-center";
    const id = edit && `${edit.idPrefix}-${status}`;
    return (
      <>
        {edit && (
          <label
            className={cn(
              "group/now absolute -top-6 flex cursor-pointer",
              align,
            )}
            data-tooltip={
              index === current ? undefined : "Prosjektet er her nå"
            }
          >
            <input
              type="radio"
              // Over the whole pill, so a press anywhere on it lands here.
              className="peer absolute inset-0 z-1 m-0 cursor-pointer appearance-none opacity-0"
              name={`${edit.idPrefix}-status`}
              value={status}
              aria-label={statusNames[status]}
              checked={index === current}
              onChange={() => edit.setStatus(status)}
            />
            <span
              aria-hidden="true"
              className={cn(
                "rounded-full border px-1.5 text-2xs leading-4 font-semibold transition-opacity",
                "peer-focus-visible:opacity-100 peer-focus-visible:ring-2 peer-focus-visible:ring-accent",
                index === current
                  ? statusTone[status].badge
                  : [
                      "border-dashed border-border-strong text-muted opacity-0",
                      "group-hover/now:opacity-100 group-hover/stretch:opacity-100 pointer-coarse:opacity-45",
                    ],
              )}
            >
              Nå
            </span>
          </label>
        )}
        {dot(
          index === current ? "current" : index < current ? "passed" : "ahead",
          {
            left: edge === "start" ? radius : edge === "end" ? -radius : 0,
          },
          edit && status !== "construction"
            ? {
                label: `Fjern ${statusNames[status]} fra tidslinjen`,
                onClick: () => edit.remove(status),
              }
            : undefined,
        )}
        <span
          className={cn("absolute top-4 whitespace-nowrap", align)}
          data-step-label=""
        >
          <span
            className={cn(
              "block",
              index === current
                ? "font-medium text-ink"
                : index < current
                  ? "text-ink-soft"
                  : "text-muted",
            )}
          >
            {texts[index].label}
          </span>
          {edit
            ? !edit.undatable(status) && (
                <input
                  id={id || undefined}
                  className={cn(
                    inlineInput,
                    "text-muted",
                    edge === "start"
                      ? "text-left"
                      : edge === "end"
                        ? "ml-auto text-right"
                        : "mx-auto text-center",
                  )}
                  aria-label={dateNames[status]}
                  aria-invalid={edit.invalid(status) || undefined}
                  inputMode={status === "completed" ? "numeric" : "decimal"}
                  maxLength={status === "completed" ? 4 : 7}
                  size={Math.max(edit.value(status).length, 4)}
                  placeholder={status === "completed" ? "år" : "dato"}
                  autoComplete="off"
                  value={edit.value(status)}
                  onChange={(event) =>
                    edit.setValue(status, event.target.value)
                  }
                />
              )
            : texts[index].date && (
                <span className="block text-muted tabular-nums">
                  <span className="sr-only">, </span>
                  {texts[index].date}
                </span>
              )}
        </span>
      </>
    );
  };

  const milestone = (milestone: Milestone, index: number) => {
    const place = places[index]!;
    const fitted = layout?.labels[milestone.id];
    const passed = passedMilestone(index);
    const left = `${(place.fraction * 100).toFixed(2)}%`;
    return (
      <Fragment key={milestone.id}>
        {!edit && <span className="sr-only">. </span>}
        <span className="contents" data-milestone={milestone.id}>
          {layout?.leaders.map(
            ({ id, top, bottom }, order) =>
              id === milestone.id && (
                <span
                  key={order}
                  aria-hidden="true"
                  className="pointer-events-none absolute w-px -translate-x-1/2 bg-border-strong"
                  style={{ left, top, height: bottom - top }}
                  data-milestone-leader=""
                />
              ),
          )}
          {dot(
            passed ? "passed" : "ahead",
            { left },
            edit && {
              label: `Fjern ${milestone.label.trim() || "hendelsen"} fra tidslinjen`,
              onClick: () => edit.removeMilestone(milestone.id),
            },
            { "data-milestone-dot": milestone.id },
            // Over the phases' dots, should they meet.
            "z-2",
          )}
          <span
            className={cn(
              "absolute z-1 text-center whitespace-nowrap",
              // Unseen until it's been fitted in.
              !fitted && "opacity-0",
            )}
            style={{
              left,
              top: rowTop(fitted?.row ?? 0),
              transform: `translateX(calc(-50% + ${fitted?.shift ?? 0}px))`,
            }}
            data-milestone-label={milestone.id}
          >
            {edit ? (
              <>
                <input
                  className={cn(
                    inlineInput,
                    "mx-auto max-w-[16em] text-center",
                    passed ? "text-ink-soft" : "text-muted",
                  )}
                  aria-label="Hendelse"
                  placeholder="Hva skjer?"
                  maxLength={80}
                  size={Math.max(milestone.label.length, 9)}
                  autoComplete="off"
                  autoFocus={edit.focus === milestone.id}
                  value={milestone.label}
                  onChange={(event) =>
                    edit.changeMilestone(milestone.id, {
                      label: event.target.value,
                    })
                  }
                />
                <input
                  className={cn(inlineInput, "mx-auto text-center text-muted")}
                  aria-label={`Dato for ${milestone.label.trim() || "hendelsen"}`}
                  aria-invalid={edit.milestoneInvalid(milestone) || undefined}
                  inputMode="decimal"
                  maxLength={7}
                  size={Math.max(milestone.date.length, 4)}
                  placeholder="dato"
                  autoComplete="off"
                  value={milestone.date}
                  onChange={(event) =>
                    edit.changeMilestone(milestone.id, {
                      date: event.target.value,
                    })
                  }
                />
              </>
            ) : (
              <>
                <span
                  className={cn(
                    "block max-w-[16em] truncate",
                    passed ? "text-ink-soft" : "text-muted",
                  )}
                >
                  {milestone.label}
                </span>
                <span className="block text-muted tabular-nums">
                  <span className="sr-only">, </span>
                  {formatPhaseDate(milestone.date)}
                </span>
              </>
            )}
          </span>
        </span>
      </Fragment>
    );
  };

  const milestonesOn = (index: number) =>
    milestones.flatMap((item, order) =>
      places[order]!.index === index ? [milestone(item, order)] : [],
    );

  const strip = (
    <ol
      ref={listRef}
      className={cn("relative flex", edit && "mt-6")}
      style={{ height }}
      aria-label={label}
      data-phase-strip={project.status}
      data-phase-active={track.active ? project.status : undefined}
    >
      {stretches.map((status, index) => (
        <li
          key={status}
          className="group/stretch relative"
          style={{
            flex: `${track.weights[index]} 1 0`,
            minWidth: `min(${track.minimums[index].toFixed(2)}em, ${100 / track.weights.length}%)`,
          }}
          aria-current={index === current ? "step" : undefined}
          data-phase={status}
        >
          <span
            aria-hidden="true"
            className={cn(
              "absolute inset-x-0 top-1.25 h-0.5 -translate-y-1/2 overflow-hidden rounded-full",
              index === last && index === current
                ? tone.dot
                : index < current || reached(index) === 1
                  ? "bg-ink-soft/55"
                  : "bg-border",
              // Never done: the line runs on and fades out.
              index === last &&
                "rounded-r-none mask-[linear-gradient(to_right,black_15%,transparent)]",
            )}
            style={
              reached(index) > 0 &&
              reached(index) < 1 &&
              !(index === last && index === current)
                ? {
                    // Passed as far as its latest event, then still ahead.
                    background: `linear-gradient(to right, color-mix(in oklab, var(--color-ink-soft) 55%, transparent) ${(reached(index) * 100).toFixed(2)}%, var(--color-border) 0)`,
                  }
                : undefined
            }
            data-phase-tail={index === last ? "" : undefined}
            data-phase-reached={
              reached(index) > 0 ? reached(index).toFixed(3) : undefined
            }
          >
            {index === track.active?.index && (
              <span
                className={cn(
                  "absolute inset-y-0 left-0 rounded-full motion-safe:transition-[width] motion-safe:duration-700 motion-safe:ease-out",
                  tone.dot,
                )}
                style={{ width: `${progress * 100}%` }}
                data-phase-progress={progress.toFixed(3)}
              />
            )}
          </span>
          {edit && (
            // Pressing the line puts a milestone where it's pressed.
            <button
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              className="group/add absolute inset-x-0 top-0 h-3 cursor-pointer outline-none pointer-coarse:h-4"
              data-tooltip="Legg til hendelse her"
              data-add-milestone={status}
              onPointerMove={(event) => {
                const box = event.currentTarget.getBoundingClientRect();
                event.currentTarget.style.setProperty(
                  "--at",
                  `${event.clientX - box.left}px`,
                );
              }}
              onClick={(event) => {
                const box = event.currentTarget.getBoundingClientRect();
                const fraction = Math.min(
                  1,
                  Math.max(0, (event.clientX - box.left) / (box.width || 1)),
                );
                const span = track.spans[index];
                edit.addMilestone(
                  span &&
                    typedMonth(span.start + fraction * (span.end - span.start)),
                );
              }}
            >
              <i
                className="absolute top-1.25 left-(--at,50%) block size-1.5 -translate-1/2 rounded-full border border-border-strong bg-surface opacity-0 group-hover/add:opacity-100"
              />
            </button>
          )}
          {step(status, index)}
          {milestonesOn(index)}
        </li>
      ))}
      {!track.open && (
        <li
          className="absolute top-0 right-0 h-full"
          aria-current={current === last ? "step" : undefined}
          data-phase={phases[last]}
        >
          {step(phases[last], last)}
        </li>
      )}
    </ol>
  );

  return (
    <div className={cn("text-2xs leading-4", className)}>
      {edit ? (
        <div role="radiogroup" aria-label="Status">
          {strip}
        </div>
      ) : (
        strip
      )}
      {track.active && now !== null && progressWords[project.status] && (
        <p className="sr-only">
          Omtrent {Math.round(progress * 100)} % {progressWords[project.status]}{" "}
          har gått.
        </p>
      )}
    </div>
  );
}

/** A time in ms as a month is typed: `3.2026`. */
function typedMonth(time: number) {
  const date = new Date(time);
  return `${date.getUTCMonth() + 1}.${date.getUTCFullYear()}`;
}

/** Each phase as a status, as the editor's controls name it. */
const statusNames: Record<Status, string> = {
  proposed: "Foreslått",
  planned: "Planlagt",
  construction: "Under bygging",
  completed: "Ferdig",
};

/** Each date field's name, the same whatever phase the project is in. */
const dateNames: Record<Status, string> = {
  proposed: "Foreslått dato",
  planned: "Planstart",
  construction: "Byggestart",
  completed: "Ferdigår",
};
