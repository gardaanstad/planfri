"use client";
import { Plus, X } from "lucide-react";
import {
  type DatedPhase,
  type Project,
  projectPhases,
  skippablePhases,
  type SkippablePhase,
  type Status,
  statusOrder,
} from "../lib/data";
import { cn } from "../lib/cn";
import { fieldControl, statusTone } from "../lib/ui";
import PhaseTimeline from "./phase-timeline";
import { finalize, storedDate } from "./project-edit";

const validDate = (date: string) => /^\d{4}(-(0[1-9]|1[0-2]))?$/.test(date);
const validYear = (year: string) => /^\d{4}$/.test(year);

/** Each phase as a step on the line; "Ferdig" whether it's done or due. */
const phaseLabels: Record<Status, string> = {
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

/** What a phase's date means: begun, or still ahead and expected. */
function dateHint(phase: Status, status: Status) {
  const ahead = statusOrder.indexOf(phase) > statusOrder.indexOf(status);
  switch (phase) {
    case "proposed":
      return "Når det ble foreslått";
    case "planned":
      return ahead ? "Ventet planstart" : "Planstart";
    case "construction":
      return ahead ? "Ventet byggestart" : "Byggestart";
    case "completed":
      return status === "completed"
        ? "Året det sto ferdig"
        : status === "proposed"
          ? "Får et år når det er planlagt"
          : "Året det ventes ferdig";
  }
}

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

const dateInput = cn(
  fieldControl,
  "min-h-9 w-24 rounded-lg px-2.5 text-ui tabular-nums",
  "pointer-coarse:min-h-11 max-sm:text-base",
  "aria-invalid:border-danger aria-invalid:focus:border-danger aria-invalid:focus:ring-danger/12",
);
const sideButton = cn(
  "inline-flex size-8 items-center justify-center rounded-md text-muted",
  "transition-colors hover:bg-ink/[0.06] hover:text-ink motion-reduce:transition-none",
  "pointer-coarse:size-10",
);

/** Why a phase might come off the line, as its remove button's tooltip. */
const skipReasons: Record<SkippablePhase, string> = {
  proposed: "Aldri foreslått: fjern fra tidslinjen",
  planned: "Ingen egen planfase: fjern fra tidslinjen",
  completed: "Blir aldri ferdig: fjern fra tidslinjen",
};

const lineDone = "bg-ink-soft/55";
const lineAhead = "bg-border";
// Without Ferdig the line runs on below the last phase and fades out.
const lineFade = "mask-[linear-gradient(to_bottom,black,transparent)]";

/**
 * A project's phase and dates in one: its phases top to bottom on a line,
 * each with its date beside it. Picking a phase's dot makes it the current
 * one; the dates around it read as begun or expected accordingly. Every
 * phase but Under bygging can come off the line, and waits in its place to
 * be put back. Below, the timeline as the project will show it.
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
  const phases = projectPhases(draft);
  const current = statusOrder.indexOf(draft.status);
  const shown = (position: number) => phases.includes(statusOrder[position]);
  const shownPositions = statusOrder
    .map((_, position) => position)
    .filter(shown);
  const first = shownPositions[0];
  const lastShown = shownPositions.at(-1)!;
  const open = !phases.includes("completed");
  /** The first phase on the line at or after `position`. */
  const nextShown = (position: number) =>
    shownPositions.find((other) => other >= position);

  const value = (phase: Status) =>
    phase === "completed"
      ? draft.year
      : (draft.phaseDates?.[phase as DatedPhase] ?? "");
  const invalid = (phase: Status) => {
    const typed = value(phase).trim();
    if (!showErrors || !typed) return false;
    return phase === "completed"
      ? !validYear(typed)
      : !validDate(storedDate(typed));
  };
  const setValue = (phase: Status, text: string) =>
    change(
      phase === "completed"
        ? { year: text }
        : { phaseDates: { ...draft.phaseDates, [phase]: text } },
    );
  const setSkipped = (phase: SkippablePhase, skip: boolean) => {
    const others = (draft.skippedPhases ?? []).filter(
      (other) => other !== phase,
    );
    change({
      skippedPhases: skip
        ? skippablePhases.filter(
            (other) => other === phase || others.includes(other),
          )
        : others,
    });
  };

  /**
   * The line through a row's dot, in two halves: solid where the project
   * has been, and only between phases on the line. Below the last one, with
   * no Ferdig, it runs on and fades.
   */
  const line = (position: number) => {
    const stroke = "absolute left-[21px] w-0.5";
    // The tail, under the last phase: the whole row, fading.
    if (position > lastShown)
      return (
        <span
          aria-hidden="true"
          className={cn(stroke, "inset-y-0", lineAhead, lineFade)}
        />
      );
    // Each half belongs to the stretch it's on, named by the phase it ends at.
    const done = (end: number | undefined) =>
      end !== undefined && end <= current ? lineDone : lineAhead;
    const top = position > first && done(nextShown(position));
    const bottom =
      position >= first &&
      (position < lastShown || open) &&
      (position < lastShown ? done(nextShown(position + 1)) : lineAhead);
    return (
      <>
        {top && (
          <span
            aria-hidden="true"
            className={cn(stroke, "top-0 bottom-1/2", top)}
          />
        )}
        {bottom && (
          <span
            aria-hidden="true"
            className={cn(stroke, "top-1/2 -bottom-px", bottom)}
          />
        )}
      </>
    );
  };

  // A row's hover wash, like the project list's.
  const row = cn(
    "relative isolate px-3",
    "before:absolute before:inset-x-1.5 before:inset-y-0 before:-z-1 before:rounded-lg",
    "hover:before:bg-surface-muted/65",
  );

  return (
    <div className="rounded-xl border border-border-strong">
      <div className="pt-1.5 pb-1">
        <div role="radiogroup" aria-label="Status">
          {statusOrder.map((phase, position) => {
            if (!shown(position)) {
              const skippable = phase as SkippablePhase;
              return (
                <div
                  key={phase}
                  className={row}
                  data-phase-row={phase}
                  data-skipped=""
                >
                  {line(position)}
                  <button
                    type="button"
                    className="group/add relative -mx-1 inline-flex min-h-9 items-center gap-3 rounded-md px-1 text-xs font-medium text-muted hover:text-ink pointer-coarse:min-h-11"
                    onClick={() => setSkipped(skippable, false)}
                  >
                    <span
                      aria-hidden="true"
                      className="relative z-1 flex size-5 items-center justify-center rounded-full border border-dashed border-border-strong bg-surface group-hover/add:border-ink-soft"
                    >
                      <Plus size={12} />
                    </span>
                    Legg til {phaseLabels[phase]}
                  </button>
                </div>
              );
            }
            const id = `${idPrefix}-${phase}`;
            const tone = statusTone[phase];
            const typed = value(phase);
            const noYear = phase === "completed" && draft.status === "proposed";
            return (
              <div
                key={phase}
                className={cn(
                  row,
                  "grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-1.5 py-1",
                )}
                data-phase-row={phase}
              >
                {line(position)}
                <label className="relative flex min-h-10 min-w-0 cursor-pointer items-center gap-3 pointer-coarse:min-h-12">
                  <input
                    type="radio"
                    // Over the whole label, so a press anywhere on it lands here.
                    className="peer absolute inset-0 z-2 m-0 cursor-pointer appearance-none opacity-0"
                    name={`${idPrefix}-status`}
                    value={phase}
                    aria-label={phaseLabels[phase]}
                    aria-describedby={`${id}-hint`}
                    checked={draft.status === phase}
                    onChange={() => change({ status: phase })}
                  />
                  <span
                    aria-hidden="true"
                    className="relative z-1 flex size-5 shrink-0 items-center justify-center rounded-full peer-focus-visible:ring-2 peer-focus-visible:ring-accent"
                  >
                    <i
                      className={cn(
                        "block rounded-full transition-[width,height] duration-150 motion-reduce:transition-none",
                        position === current
                          ? ["size-3 ring-4", tone.dot, tone.ring]
                          : position < current
                            ? "size-2 bg-ink-soft/70"
                            : "size-2.5 border border-border-strong bg-surface",
                      )}
                    />
                  </span>
                  <span className="min-w-0">
                    <span
                      className={cn(
                        "flex items-center gap-1.5 text-ui leading-snug",
                        position === current
                          ? "font-medium text-ink"
                          : "text-ink-soft",
                      )}
                    >
                      {phaseLabels[phase]}
                      {position === current && (
                        <span className="rounded-full bg-ink/[0.06] px-1.5 text-2xs leading-4 font-semibold text-muted">
                          Nå
                        </span>
                      )}
                    </span>
                    <span
                      id={`${id}-hint`}
                      className="block truncate text-2xs leading-4 text-muted"
                    >
                      {dateHint(phase, draft.status)}
                    </span>
                  </span>
                </label>
                {noYear ? (
                  <span />
                ) : (
                  <input
                    id={id}
                    className={dateInput}
                    aria-label={dateNames[phase]}
                    aria-describedby={`${id}-hint`}
                    aria-invalid={invalid(phase) || undefined}
                    inputMode={phase === "completed" ? "numeric" : "decimal"}
                    maxLength={phase === "completed" ? 4 : 7}
                    placeholder="åååå"
                    autoComplete="off"
                    value={typed}
                    onChange={(event) => setValue(phase, event.target.value)}
                  />
                )}
                {phase !== "construction" && phase !== draft.status ? (
                  <button
                    type="button"
                    className={sideButton}
                    aria-label={`Fjern ${phaseLabels[phase]} fra tidslinjen`}
                    data-tooltip={skipReasons[phase as SkippablePhase]}
                    onClick={() => setSkipped(phase as SkippablePhase, true)}
                  >
                    <X size={15} aria-hidden="true" />
                  </button>
                ) : (
                  <span className="w-8 pointer-coarse:w-10" />
                )}
              </div>
            );
          })}
        </div>
        <p className="px-3 pt-1 pb-1.5 text-2xs leading-4 text-muted">
          Skriv år, eller måned og år som 3.2026. Datoene er valgfrie.
        </p>
      </div>
      <div className="rounded-b-xl border-t border-border bg-surface-muted/40 px-3 py-3">
        <PhaseTimeline
          project={preview(draft)}
          label="Forhåndsvisning av fase"
          className=""
        />
      </div>
    </div>
  );
}
