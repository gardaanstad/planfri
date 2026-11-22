"use client";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "../lib/cn";
import { reducedMotion, sheetLeave } from "../lib/media";
import { openedByKeyboard } from "./action-sheet";
import { useSwipeDismiss } from "./use-swipe-dismiss";

export type FilterSection = {
  id: string;
  label: string;
  /** What it is set to, on the right of its row. */
  summary: ReactNode;
  /** Its options, shown once its row is chosen. */
  content: ReactNode;
};

// Rows and options open and fold together, in the sheets' own easing.
const fold =
  "grid transition-[grid-template-rows,opacity,visibility] duration-300 ease-out-soft motion-reduce:transition-none";

/**
 * Phones: the filters in one bottom sheet, a row each. Choosing a row opens
 * its options under it as the other rows fold away, the sheet growing to
 * hold them; choosing it again folds back to the rows.
 */
export default function FilterSheet({
  label,
  sections,
  onClose,
}: {
  label: string;
  sections: FilterSection[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  // The open section's options, which scroll; a drag waits for their top.
  const scroller = useRef<HTMLDivElement | null>(null);
  const trigger = useRef<Element | null>(null);
  const closing = useRef(false);
  const [active, setActive] = useState<string | null>(null);

  useLayoutEffect(() => {
    const dialog = ref.current;
    trigger.current = document.activeElement;
    dialog?.showModal();
    if (openedByKeyboard(trigger.current))
      dialog?.querySelector<HTMLElement>("[data-filter-section]")?.focus();
    else dialog?.focus();
    return () => dialog?.close();
  }, []);

  useSwipeDismiss({
    enabled: true,
    sheet,
    scroller,
    onDismiss: () => close(false),
  });

  function close(animate = true) {
    const dialog = ref.current;
    const panel = sheet.current;
    if (closing.current) return;
    closing.current = true;
    const done = () => {
      dialog?.close();
      const target = trigger.current;
      if (target instanceof HTMLElement && target.isConnected)
        target.focus({ preventScroll: true });
      onClose();
    };
    if (!dialog || !panel || !animate || reducedMotion()) return done();
    const out = panel.animate(
      [{ transform: "none" }, { transform: "translateY(100%)" }],
      sheetLeave,
    );
    dialog.animate([{ opacity: 1 }, { opacity: 0 }], {
      ...sheetLeave,
      pseudoElement: "::backdrop",
    });
    out.finished.then(done, done);
  }

  return (
    <dialog
      ref={ref}
      aria-label={label}
      data-filter-sheet=""
      // Its swipes are its own, not those of the drawer it opened from.
      data-base-ui-swipe-ignore=""
      tabIndex={-1}
      className={cn(
        "m-auto mb-0 w-full max-w-none overflow-visible border-0 bg-transparent p-0 text-ink outline-none",
        "backdrop:bg-scrim/25 motion-safe:backdrop:animate-backdrop-in",
      )}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={sheet}
        className={cn(
          "flex max-h-[min(85dvh,640px)] flex-col overflow-hidden rounded-t-sheet border-t border-border bg-surface shadow-bar",
          "pb-[calc(10px+env(safe-area-inset-bottom))] motion-safe:animate-sheet-in",
        )}
      >
        <div
          aria-hidden="true"
          data-swipe-handle
          className="flex shrink-0 touch-none justify-center pt-2 pb-3"
        >
          <span className="h-1 w-9 rounded-full bg-ink/15" />
        </div>
        {sections.map((section) => {
          const open = active === section.id;
          const folded = active !== null && !open;
          return (
            <div
              key={section.id}
              className={cn(
                fold,
                "min-h-0 shrink",
                folded
                  ? "invisible grid-rows-[0fr] opacity-0"
                  : "grid-rows-[1fr] opacity-100",
              )}
              inert={folded}
              data-filter-group={section.id}
              data-open={open || undefined}
            >
              <div className="flex min-h-0 flex-col overflow-hidden">
                <div className="shrink-0 px-2">
                  <button
                    type="button"
                    data-filter-section={section.id}
                    aria-expanded={open}
                    className={cn(
                      "flex min-h-13 w-full items-center gap-3 rounded-lg px-3 text-left -outline-offset-2",
                      "transition-colors duration-150 active:bg-surface-muted motion-reduce:transition-none",
                    )}
                    onClick={() => setActive(open ? null : section.id)}
                  >
                    <span className="text-body font-semibold">
                      {section.label}
                    </span>
                    <span className="ml-auto flex min-w-0 items-center gap-2 truncate text-ui text-muted">
                      {section.summary}
                    </span>
                    <ChevronDown
                      size={18}
                      aria-hidden="true"
                      className={cn(
                        "shrink-0 text-muted transition-transform duration-300 ease-out-soft motion-reduce:transition-none",
                        open && "rotate-180",
                      )}
                    />
                  </button>
                </div>
                <div
                  className={cn(
                    fold,
                    "min-h-0",
                    open
                      ? "grid-rows-[1fr] opacity-100"
                      : "invisible grid-rows-[0fr] opacity-0",
                  )}
                  inert={!open}
                >
                  <div
                    ref={(element) => {
                      if (open) scroller.current = element;
                    }}
                    className="min-h-0 overflow-y-auto overscroll-contain border-t border-border pt-1.5"
                  >
                    {section.content}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </dialog>
  );
}
