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
import { ChevronDown, Search, X } from "lucide-react";
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
import { useDropdownShield } from "./dropdown";
import { unselectable } from "../lib/ui";

export type FilterSection = {
  id: string;
  label: string;
  /** What it is set to, on the right of its row. */
  summary: ReactNode;
  /** Its options, shown once its row is chosen. */
  content: ReactNode;
};

/** A search field over the sections (phones, where it has no room of its own). */
export type FilterSearch = {
  value: string;
  onChange: (value: string) => void;
  /** On Enter, once the sheet has closed. */
  onSubmit?: () => void;
  /** Focused as the sheet opens, rather than the sheet itself. */
  focus?: boolean;
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

/** The sheet's search field, in the drawers' pill. */
function SearchField({
  search,
  onSubmit,
}: {
  search: FilterSearch;
  onSubmit: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div
      className={cn(
        "flex h-11 items-center gap-2 rounded-full border border-border bg-surface pl-3.5 text-muted",
        "transition-[border-color,box-shadow] duration-150 focus-within:border-accent/50 focus-within:ring-3 focus-within:ring-accent/10 motion-reduce:transition-none",
        !search.value && "pr-3.5",
      )}
      data-search-field=""
    >
      <Search className="shrink-0" size={17} aria-hidden="true" />
      <input
        ref={input}
        className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-base text-ink outline-none shadow-none placeholder:truncate placeholder:text-sm placeholder:text-muted"
        id="project-search"
        enterKeyHint="search"
        autoComplete="off"
        value={search.value}
        onChange={(event) => search.onChange(event.target.value)}
        placeholder="Søk prosjekt eller sted"
        aria-label="Søk etter prosjekt eller sted"
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          onSubmit();
        }}
      />
      {search.value && (
        <button
          type="button"
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted [-webkit-tap-highlight-color:transparent]"
          aria-label="Tøm søk"
          data-press=""
          onClick={() => {
            search.onChange("");
            input.current?.focus({ preventScroll: true });
          }}
        >
          <X size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export default function FilterSheet({
  label,
  title,
  sections,
  search,
  onReset,
  onClose,
}: {
  label: string;
  /** Shown at its top, under the handle. */
  title: string;
  sections: FilterSection[];
  /** A search field between the title and the sections. */
  search?: FilterSearch;
  /** Undoes the search and filters: given while any is set. */
  onReset?: () => void;
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
  // Read once, as it opens.
  const [focusSearch] = useState(!!search?.focus);

  useLayoutEffect(() => {
    const dialog = ref.current;
    trigger.current = document.activeElement;
    dialog?.showModal();
    if (focusSearch)
      dialog
        ?.querySelector<HTMLElement>("#project-search")
        ?.focus({ preventScroll: true });
    else if (openedByKeyboard(trigger.current))
      dialog?.querySelector<HTMLElement>("[data-filter-section]")?.focus();
    else dialog?.focus();
    return () => dialog?.close();
  }, [focusSearch]);

  useSwipeDismiss({
    enabled: true,
    sheet,
    scroller,
    onDismiss: () => close(false),
  });

  function close(animate = true, after?: () => void) {
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
      after?.();
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
        unselectable,
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
            data-swipe-handle
            className="flex shrink-0 touch-none flex-col items-center px-4 pt-2 pb-2.5"
          >
            <SheetGrip />
            <div className={cn(sheetTitleGap, "flex items-center self-stretch")}>
              <span
                aria-hidden="true"
                data-slot="filter-title"
                className={cn(sheetTitle, "px-1")}
              >
                {title}
              </span>
              {/* At the title's end, while there is something to undo. */}
              {onReset && (
                <button
                  type="button"
                  className="-my-2.5 -mr-2 ml-auto inline-flex min-h-11 shrink-0 items-center rounded-xl px-3 text-ui font-medium text-muted active:bg-ink/[0.05]"
                  aria-label="Nullstill filtre"
                  data-press=""
                  onClick={() => {
                    // It goes as it acts; focus stays in the sheet.
                    ref.current?.focus({ preventScroll: true });
                    onReset();
                  }}
                >
                  Nullstill
                </button>
              )}
            </div>
          </div>
          {search && (
            <div className="shrink-0 px-4 pb-2">
              <SearchField
                search={search}
                onSubmit={() => close(true, search.onSubmit)}
              />
            </div>
          )}
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
  onReset,
  onOpenChange,
}: {
  id: string;
  /** Its name, also shown in its first line. */
  label: string;
  sections: FilterSection[];
  anchor: RefObject<HTMLElement | null>;
  /** Undoes the filters: given while any is set. */
  onReset?: () => void;
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
  const {
    shield,
    show: showShield,
    hide: hideShield,
  } = useDropdownShield(anchor, () => ref.current?.hidePopover());

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
    // The button opens it by hand, the layer first so it lands under it (a
    // popover can't be shown while another is showing). `popoverTarget`
    // stays for its tie to the button: a press there isn't a press outside.
    const button = anchor.current;
    const onPress = (event: MouseEvent) => {
      event.preventDefault();
      if (popover.matches(":popover-open")) return popover.hidePopover();
      showShield();
      popover.showPopover();
    };
    const onToggle = (event: Event) => {
      const open = (event as ToggleEvent).newState === "open";
      if (!open) hideShield();
      changed.current?.(open);
      if (open && openedByKeyboard(anchor.current))
        popover.querySelector<HTMLElement>("[data-filter-section]")?.focus();
    };
    popover.addEventListener("beforetoggle", onBeforeToggle);
    popover.addEventListener("toggle", onToggle);
    button?.addEventListener("click", onPress);
    window.addEventListener("resize", place);
    return () => {
      button?.removeEventListener("click", onPress);
      popover.removeEventListener("beforetoggle", onBeforeToggle);
      popover.removeEventListener("toggle", onToggle);
      window.removeEventListener("resize", place);
    };
  }, [anchor, ref, showShield, hideShield]);

  return (
    <>
      {shield}
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
          {/* It names itself, as the menus do, and offers the reset at the
              line's end while there is something to undo; the line stays,
              so nothing moves as it comes and goes. */}
          <div className="flex min-h-8 shrink-0 items-center px-1.5 pb-0.5">
            <span
              aria-hidden="true"
              data-slot="filter-title"
              className="px-2.75 text-body leading-5 font-semibold text-ink"
            >
              {label}
            </span>
            {onReset && (
              <button
                type="button"
                className="ml-auto inline-flex h-7 shrink-0 items-center rounded-lg px-2.75 text-ui font-medium text-muted -outline-offset-2 hover:bg-ink/[0.05] hover:text-ink"
                aria-label="Nullstill filtre"
                onClick={() => {
                  // It goes as it acts; focus stays in the popover.
                  ref.current
                    ?.querySelector<HTMLElement>("[data-filter-section]")
                    ?.focus({ preventScroll: true });
                  onReset();
                }}
              >
                Nullstill
              </button>
            )}
          </div>
          <FilterRows
            sections={sections}
            active={active}
            leaving={leaving}
            onToggle={toggle}
            compact
          />
        </div>
      </div>
    </>
  );
}
