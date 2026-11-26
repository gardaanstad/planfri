"use client";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { flushSync } from "react-dom";
import { ChevronDown } from "lucide-react";
import { cn } from "../lib/cn";
import { reducedMotion, sheetLeave } from "../lib/media";
import { useBackgroundPush } from "../lib/background-push";
import {
  SheetGrip,
  openedByKeyboard,
  sheetTitle,
  sheetTitleGap,
} from "./action-sheet";
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

/**
 * Which section is open, and the motion between them: each row moves from
 * where it was to where it is, the options fading in or out. `panel` holds
 * the rows, and its own move is undone first (a sheet resting on the bottom
 * edge grows upwards); `body` is the box inside it that clips them.
 */
function useFold(initial: string | null) {
  const panel = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string | null>(initial);
  // The options folding away, kept in view (out of the flow, at the height
  // they had) while the rows after them cover them.
  const [leaving, setLeaving] = useState<{ id: string; height: number } | null>(
    null,
  );

  function toggle(id: string) {
    const next = active === id ? null : id;
    const box = panel.current;
    const inner = body.current;
    if (!box || !inner || reducedMotion()) {
      setLeaving(null);
      setActive(next);
      return;
    }
    // Where everything is now, mid-move or not.
    const groups = [
      ...box.querySelectorAll<HTMLElement>("[data-filter-group]"),
    ];
    const boxBefore = box.getBoundingClientRect().top;
    const before = groups.map((group) => group.getBoundingClientRect().top);
    const options = active
      ? box.querySelector<HTMLElement>(
          `[data-filter-options="${CSS.escape(active)}"]`,
        )
      : null;
    const gone =
      active && active !== next && options
        ? { id: active, height: options.offsetHeight }
        : null;
    for (const animation of box.getAnimations({ subtree: true }))
      if (animation.id === "fold") animation.cancel();
    flushSync(() => {
      setActive(next);
      setLeaving(gone);
    });
    // Then each moves from where it was to where it is.
    const dy = boxBefore - box.getBoundingClientRect().top;
    const after = groups.map((group) => group.getBoundingClientRect().top);
    inner.style.overflow = "visible";
    const move = box.animate(
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
      ? box.querySelector<HTMLElement>(
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
        for (const animation of box.getAnimations({ subtree: true }))
          if (animation.id === "fold") animation.cancel();
        setLeaving(null);
      },
      // Cut short by the next move, which carries on from here.
      () => {},
    );
  }

  // Straight to `id`, without motion: as the menu opens.
  function reset(id: string | null) {
    setLeaving(null);
    setActive(id);
  }

  return { panel, body, active, leaving, toggle, reset };
}

/** The sections' rows, each opening onto its options under it. */
function FilterRows({
  sections,
  active,
  leaving,
  onToggle,
  scroller,
  compact = false,
}: {
  sections: FilterSection[];
  active: string | null;
  leaving: { id: string; height: number } | null;
  onToggle: (id: string) => void;
  /** Set to the open section's scrolling options. */
  scroller?: RefObject<HTMLDivElement | null>;
  /** Desktop: rows for a pointer, in the interface's text size. */
  compact?: boolean;
}) {
  return sections.map((section, index) => {
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
            // Clear of the line, so its tint doesn't touch it.
            "border-t border-border pt-1",
        )}
        data-filter-group={section.id}
        data-open={open || undefined}
      >
        <div className={cn("shrink-0", compact ? "px-1.5" : "px-2")}>
          {/* Hover and press tint at once, as the options do. */}
          <button
            type="button"
            data-filter-section={section.id}
            aria-expanded={open}
            data-press=""
            className={cn(
              "flex w-full items-center rounded-lg text-left -outline-offset-2 active:bg-surface-muted",
              compact
                ? // In line with the options' labels, inside their border.
                  "min-h-9 gap-2 px-2.75 hover:bg-surface-muted focus-visible:bg-surface-muted"
                : "min-h-13 gap-3 px-3",
            )}
            onClick={() => onToggle(section.id)}
          >
            <span
              className={
                compact ? "text-ui font-semibold" : "text-body font-semibold"
              }
            >
              {section.label}
            </span>
            <span className="ml-auto flex min-w-0 items-center gap-2 truncate text-ui text-muted">
              {section.summary}
            </span>
            <ChevronDown
              size={compact ? 14 : 18}
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
            "flex min-h-0 flex-col",
            going && "absolute inset-x-0 top-full",
          )}
          style={going ? { height: leaving.height } : undefined}
        >
          <div
            ref={(element) => {
              if (open && scroller) scroller.current = element;
            }}
            className={cn(
              "min-h-0 overflow-y-auto overscroll-contain",
              compact ? "pt-0.5 pb-1.5" : "pt-1.5",
            )}
          >
            {section.content}
          </div>
        </div>
      </div>
    );
  });
}

export default function FilterSheet({
  label,
  title,
  sections,
  onClose,
}: {
  label: string;
  /** Shown at its top, under the handle. */
  title: string;
  sections: FilterSection[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // It opens on its first section.
  const {
    panel: sheet,
    body,
    active,
    leaving,
    toggle,
  } = useFold(sections[0]?.id ?? null);
  // The open section's options, which scroll; a drag waits for their top.
  const scroller = useRef<HTMLDivElement | null>(null);
  const trigger = useRef<Element | null>(null);
  const closing = useRef(false);
  const releasePush = useBackgroundPush(true);

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
    releasePush();
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
          {/* The handle and title, as the choice sheets have them. */}
          <div
            aria-hidden="true"
            data-swipe-handle
            className="flex shrink-0 touch-none flex-col items-center px-4 pt-2 pb-2.5"
          >
            <SheetGrip />
            <span
              data-slot="filter-title"
              className={cn(sheetTitle, sheetTitleGap, "self-stretch px-1")}
            >
              {title}
            </span>
          </div>
          <FilterRows
            sections={sections}
            active={active}
            leaving={leaving}
            onToggle={toggle}
            scroller={scroller}
          />
        </div>
      </div>
    </dialog>
  );
}

// Between the popover and the window's edges.
const edge = 8;

/**
 * Desktop: the same sections in a popover under `anchor`, the button with
 * `popoverTarget={id}` that opens and closes it. A press outside it, or
 * Escape, closes it too.
 */
export function FilterPopover({
  id,
  label,
  sections,
  anchor,
  onOpenChange,
}: {
  id: string;
  label: string;
  sections: FilterSection[];
  anchor: RefObject<HTMLElement | null>;
  onOpenChange?: (open: boolean) => void;
}) {
  const first = sections[0]?.id ?? null;
  const { panel: ref, body, active, leaving, toggle, reset } = useFold(first);
  // Each time it opens, it opens on its first section.
  const opening = useRef(() => reset(first));
  useLayoutEffect(() => {
    opening.current = () => reset(first);
  });
  const changed = useRef(onOpenChange);
  useLayoutEffect(() => {
    changed.current = onOpenChange;
  });

  useEffect(() => {
    const popover = ref.current;
    if (!popover) return;
    // Under its button, their right edges lined up, inside the window.
    const place = () => {
      const button = anchor.current?.getBoundingClientRect();
      if (!button) return;
      // Read before it shows, so from its style, not its box.
      const width = parseFloat(getComputedStyle(popover).width);
      const left = Math.min(
        Math.max(button.right - width, edge),
        window.innerWidth - width - edge,
      );
      const top = button.bottom + 4;
      popover.style.translate = `${Math.round(left)}px ${Math.round(top)}px`;
      popover.style.maxHeight = `${Math.round(window.innerHeight - top - edge)}px`;
    };
    const onBeforeToggle = (event: Event) => {
      if ((event as ToggleEvent).newState !== "open") return;
      flushSync(() => opening.current());
      place();
    };
    const onToggle = (event: Event) => {
      const open = (event as ToggleEvent).newState === "open";
      changed.current?.(open);
      if (open && openedByKeyboard(anchor.current))
        popover.querySelector<HTMLElement>("[data-filter-section]")?.focus();
    };
    popover.addEventListener("beforetoggle", onBeforeToggle);
    popover.addEventListener("toggle", onToggle);
    window.addEventListener("resize", place);
    return () => {
      popover.removeEventListener("beforetoggle", onBeforeToggle);
      popover.removeEventListener("toggle", onToggle);
      window.removeEventListener("resize", place);
    };
  }, [anchor, ref]);

  return (
    <div
      ref={ref}
      id={id}
      popover="auto"
      role="dialog"
      aria-label={label}
      data-filter-popover=""
      className={cn(
        // Shows at once, as the other menus do.
        "fixed inset-auto top-0 left-0 m-0 w-80 flex-col overflow-visible border-0 bg-transparent p-0 text-ink open:flex",
      )}
    >
      <div
        ref={body}
        className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-surface py-1.5 shadow-[0_12px_40px_rgb(20_28_24/0.14),0_2px_6px_rgb(20_28_24/0.04)]"
      >
        <FilterRows
          sections={sections}
          active={active}
          leaving={leaving}
          onToggle={toggle}
          compact
        />
      </div>
    </div>
  );
}
