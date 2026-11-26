"use client";
import { Plus } from "lucide-react";
import { useState } from "react";
import {
  type DatedPhase,
  type Milestone,
  type Project,
  projectPhases,
  skippablePhases,
  type SkippablePhase,
  type Status,
  statusOrder,
} from "../lib/data";
import { cn } from "../lib/cn";
import PhaseTimeline from "./phase-timeline";
import { finalize, storedDate, validDate } from "./project-edit";

const validYear = (year: string) => /^\d{4}$/.test(year);

/** A phase off the line, as its button to put it back names it. */
const phaseLabels: Record<SkippablePhase, string> = {
  proposed: "Foreslått",
  planned: "Planlagt",
  completed: "Ferdig",
};

/** The draft as its timeline would show once saved; unclear dates left out. */
function preview(draft: Project): Project {
  const saved = finalize(draft);
  return {
    ...saved,
    phaseDates: Object.fromEntries(
      Object.entries(saved.phaseDates ?? {}).filter(([, date]) =>
        validDate(date),
      ),
    ),
    year: validYear(saved.year) ? saved.year : "",
  };
}

/** This month, as typed: `11.2026`. */
function thisMonth() {
  const now = new Date();
  return `${now.getMonth() + 1}.${now.getFullYear()}`;
}

const chip = cn(
  "inline-flex min-h-7 items-center gap-1 rounded-full border border-dashed border-border-strong px-2.5 text-2xs font-medium text-muted",
  "transition-colors hover:border-ink-soft hover:text-ink motion-reduce:transition-none",
  "pointer-coarse:min-h-9",
);

/**
 * A project's phase and dates, edited on its timeline as it shows: dates
 * typed where they read, "Nå" above the step it's at, and a step's dot to
 * take it off the line. Milestones go on the line too, by their dates; what
 * was taken off waits below to be put back.
 */
export default function TimelineInput({
  draft,
  change,
  idPrefix,
  showErrors = true,
}: {
  draft: Project;
  change: (patch: Partial<Project>) => void;
  idPrefix: string;
  /** Mark unclear dates; a new project waits until saving is tried. */
  showErrors?: boolean;
}) {
  const [added, setAdded] = useState<string>();
  // Each milestone's last clear date, to hold it in place while it's retyped.
  const [held, setHeld] = useState<Record<string, string>>({});
  const phases = projectPhases(draft);
  const milestones = draft.milestones ?? [];

  const value = (phase: Status) =>
    phase === "completed"
      ? draft.year
      : (draft.phaseDates?.[phase as DatedPhase] ?? "");
  const unclear = (typed: string, year = false) =>
    showErrors &&
    Boolean(typed.trim()) &&
    !(year ? validYear(typed.trim()) : validDate(storedDate(typed)));

  const setSkipped = (phase: SkippablePhase, skip: boolean) => {
    const others = (draft.skippedPhases ?? []).filter(
      (other) => other !== phase,
    );
    const skipped = skip
      ? skippablePhases.filter(
          (other) => other === phase || others.includes(other),
        )
      : others;
    // Taking off the phase it's in moves it on to the next, or back from
    // the end.
    const left = phases.filter((other) => other !== phase || !skip);
    const position = statusOrder.indexOf(phase);
    const status =
      skip && phase === draft.status
        ? (left.find((other) => statusOrder.indexOf(other) > position) ??
          left.at(-1)!)
        : draft.status;
    change({ skippedPhases: skipped, status });
  };

  const setMilestones = (next: Milestone[]) =>
    change({ milestones: next.length ? next : undefined });
  const addMilestone = (date = thisMonth()) => {
    const id = `m-${crypto.randomUUID().slice(0, 8)}`;
    setAdded(id);
    setMilestones([...milestones, { id, label: "", date }]);
  };

  const skipped = skippablePhases.filter((phase) => !phases.includes(phase));
  return (
    <div className="rounded-xl border border-border-strong px-3.5 pt-2.5 pb-2.5">
      <PhaseTimeline
        project={preview(draft)}
        label="Tidslinje"
        className=""
        edit={{
          idPrefix,
          value,
          undatable: (phase) =>
            phase === "completed" && draft.status === "proposed",
          invalid: (phase) => unclear(value(phase), phase === "completed"),
          setValue: (phase, text) =>
            change(
              phase === "completed"
                ? { year: text }
                : { phaseDates: { ...draft.phaseDates, [phase]: text } },
            ),
          setStatus: (status) => change({ status }),
          remove: (phase) => setSkipped(phase as SkippablePhase, true),
          milestones,
          milestoneInvalid: (milestone) => unclear(milestone.date),
          placedBy: (milestone) => {
            const date = storedDate(milestone.date);
            return validDate(date) ? date : held[milestone.id];
          },
          changeMilestone: (id, patch) => {
            const before = milestones.find((milestone) => milestone.id === id);
            const date = before && storedDate(before.date);
            if (patch.date !== undefined && date && validDate(date))
              setHeld((held) => ({ ...held, [id]: date }));
            setMilestones(
              milestones.map((milestone) =>
                milestone.id === id ? { ...milestone, ...patch } : milestone,
              ),
            );
          },
          removeMilestone: (id) =>
            setMilestones(
              milestones.filter((milestone) => milestone.id !== id),
            ),
          addMilestone,
          focus: added,
        }}
      />
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          className={chip}
          aria-label="Legg til hendelse"
          onClick={() => addMilestone()}
        >
          <Plus size={12} aria-hidden="true" />
          Hendelse
        </button>
        {skipped.map((phase) => (
          <button
            key={phase}
            type="button"
            className={chip}
            aria-label={`Legg til ${phaseLabels[phase]}`}
            onClick={() => setSkipped(phase, false)}
          >
            <Plus size={12} aria-hidden="true" />
            {phaseLabels[phase]}
          </button>
        ))}
        <p className="ml-auto text-2xs leading-4 text-muted">
          År, eller måned og år som 3.2026
        </p>
      </div>
    </div>
  );
}
