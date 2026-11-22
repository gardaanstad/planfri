"use client";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
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

// Rows and options move in the sheets' own easing.
const fold = { duration: 300, easing: "cubic-bezier(0.22, 1, 0.36, 1)" };

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
  const body = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string | null>(null);
  // The options folding away, kept in view (out of the flow, at the height
  // they had) while the rows after them cover them.
  const [leaving, setLeaving] = useState<{ id: string; height: number } | null>(
    null,
  );

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

  function toggle(id: string) {
    const next = active === id ? null : id;
    const panel = sheet.current;
    const inner = body.current;
    if (!panel || !inner || reducedMotion()) {
      setLeaving(null);
      setActive(next);
      return;
    }
    // Where everything is now, mid-move or not.
    const groups = [
      ...panel.querySelectorAll<HTMLElement>("[data-filter-group]"),
    ];
    const sheetBefore = panel.getBoundingClientRect().top;
    const before = groups.map((group) => group.getBoundingClientRect().top);
    const options = active
      ? panel.querySelector<HTMLElement>(
          `[data-filter-options="${CSS.escape(active)}"]`,
        )
      : null;
    const gone =
      active && active !== next && options
        ? { id: active, height: options.offsetHeight }
        : null;
    for (const animation of panel.getAnimations({ subtree: true }))
      if (animation.id === "fold") animation.cancel();
    flushSync(() => {
      setActive(next);
      setLeaving(gone);
    });
    // Then each moves from where it was to where it is.
    const dy = sheetBefore - panel.getBoundingClientRect().top;
    const after = groups.map((group) => group.getBoundingClientRect().top);
    inner.style.overflow = "visible";
    const move = panel.animate(
      [{ transform: `translateY(${dy}px)` }, { transform: "none" }],
      { ...fold, id: "fold" },
    );
    groups.forEach((group, index) => {
      const offset = before[index] - after[index] - dy;
      if (Math.abs(offset) < 0.5) return;
      group.animate(
        [{ transform: `translateY(${offset}px)` }, { transform: "none" }],
        { ...fold, id: "fold" },
      );
    });
    const opened = next
      ? panel.querySelector<HTMLElement>(
          `[data-filter-options="${CSS.escape(next)}"]`,
        )
      : null;
    opened?.animate([{ opacity: 0 }, { opacity: 1 }], { ...fold, id: "fold" });
    if (gone && options)
      options.animate([{ opacity: 1 }, { opacity: 0 }], {
        ...fold,
        duration: 200,
        fill: "forwards",
        id: "fold",
      });
    move.finished.then(
      () => {
        inner.style.overflow = "";
        for (const animation of panel.getAnimations({ subtree: true }))
          if (animation.id === "fold") animation.cancel();
        setLeaving(null);
      },
      // Cut short by the next move, which carries on from here.
      () => {},
    );
  }

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
      {/* Moves as one with what it holds; the surface under it fills the
          gap below while it is shorter than it was. */}
      <div ref={sheet} className="relative isolate">
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-full -z-10 h-dvh bg-surface"
        />
        <div
          ref={body}
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
          {sections.map((section, index) => {
            const open = active === section.id;
            const going = leaving?.id === section.id;
            return (
              <div
                key={section.id}
                // Later rows cover the options folding away above them.
                className={cn(
                  "relative flex min-h-0 flex-col bg-surface",
                  open ? "shrink" : "shrink-0",
                  index > 0 &&
                    sections[index - 1].id === active &&
                    "border-t border-border",
                )}
                data-filter-group={section.id}
                data-open={open || undefined}
              >
                <div className="shrink-0 px-2">
                  <button
                    type="button"
                    data-filter-section={section.id}
                    aria-expanded={open}
                    className={cn(
                      "flex min-h-13 w-full items-center gap-3 rounded-lg px-3 text-left -outline-offset-2",
                      "transition-colors duration-150 active:bg-surface-muted motion-reduce:transition-none",
                    )}
                    onClick={() => toggle(section.id)}
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
                  data-filter-options={section.id}
                  hidden={!open && !going}
                  inert={!open}
                  className={cn(
                    "flex min-h-0 flex-col border-t border-border",
                    going && "absolute inset-x-0 top-full",
                  )}
                  style={going ? { height: leaving.height } : undefined}
                >
                  <div
                    ref={(element) => {
                      if (open) scroller.current = element;
                    }}
                    className="min-h-0 overflow-y-auto overscroll-contain pt-1.5"
                  >
                    {section.content}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </dialog>
  );
}
