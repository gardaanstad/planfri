"use client";
import {
  finishYear,
  formatPhaseDate,
  type Project,
  projectPhases,
  type Status,
} from "../lib/data";
import { cn } from "../lib/cn";
import { phaseTrack, trackProgress } from "../lib/phase-track";
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

/**
 * The phases a project passes through, on a line across the panel: those
 * behind it quiet, the one it's in marked in its status colour, those ahead
 * hollow. Each step carries its date when it has one.
 *
 * The stretches it has passed are drawn solid. When the stretch it's in has
 * both ends dated (a start of building and a year it's due, say), the steps
 * behind move aside to give it room, and it fills in the phase's colour as
 * far as time has come.
 */
export default function PhaseTimeline({
  project,
  label = "Fase",
  className = "mt-3",
}: {
  project: Project;
  label?: string;
  className?: string;
}) {
  const now = useNow();
  const phases = projectPhases(project);
  const current = phases.indexOf(project.status);
  const texts = phases.map((status) => ({
    label: phaseLabels[status],
    date: phaseDate(project, status),
  }));
  const dated = texts.some(({ date }) => date);
  const last = phases.length - 1;
  const track = phaseTrack(project, texts);
  // Unknown until the reader's clock is, so the fill grows in on hydration.
  const progress =
    track.active && now !== null ? trackProgress(track.active, now) : 0;
  const tone = statusTone[project.status];
  const step = (status: Status, index: number) => {
    const edge =
      index === 0
        ? "start"
        : index === last && !track.open
          ? "end"
          : "middle";
    return (
      <>
        <i
          aria-hidden="true"
          className={cn(
            "absolute top-1.25 z-1 -translate-y-1/2 rounded-full",
            edge === "start"
              ? "left-0"
              : edge === "end"
                ? "right-0"
                : "left-0 -translate-x-1/2",
            index === current
              ? ["size-2.5 ring-3", tone.dot, tone.ring]
              : index < current
                ? "size-1.5 bg-ink-soft/70"
                : "size-1.5 border border-border-strong bg-surface",
          )}
        />
        <span
          className={cn(
            "absolute top-4 whitespace-nowrap",
            edge === "start"
              ? "left-0 text-left"
              : edge === "end"
                ? "right-0 text-right"
                : "left-0 -translate-x-1/2 text-center",
          )}
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
          {texts[index].date && (
            <span className="block text-muted tabular-nums">
              <span className="sr-only">, </span>
              {texts[index].date}
            </span>
          )}
        </span>
      </>
    );
  };
  return (
    <div className={cn("text-2xs leading-4", className)}>
      <ol
        className={cn("relative flex", dated ? "h-12" : "h-8")}
        aria-label={label}
        data-phase-strip={project.status}
        data-phase-active={track.active ? project.status : undefined}
      >
        {(track.open ? phases : phases.slice(0, last)).map((status, index) => (
          <li
            key={status}
            className="relative"
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
                index < current
                  ? "bg-ink-soft/55"
                  : index === last && index === current
                    ? tone.dot
                    : "bg-border",
                // Never done: the line runs on and fades out.
                index === last &&
                  "rounded-r-none mask-[linear-gradient(to_right,black_15%,transparent)]",
              )}
              data-phase-tail={index === last ? "" : undefined}
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
            {step(status, index)}
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
      {track.active && now !== null && progressWords[project.status] && (
        <p className="sr-only">
          Omtrent {Math.round(progress * 100)} % {progressWords[project.status]}{" "}
          har gått.
        </p>
      )}
    </div>
  );
}

