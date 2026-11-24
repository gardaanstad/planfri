"use client";
import { ChevronDown, EyeOff } from "lucide-react";
import {
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { cn } from "../lib/cn";
import { reducedMotion } from "../lib/media";
import {
  storedOffMapCollapsed,
  storeOffMapCollapsed,
  subscribeOffMapCollapsed,
} from "../lib/explore-state";

/**
 * The list's projects out of the map's view, below a row that folds them
 * away. Open by default; folded, it stays so in this browser.
 *
 * Its own component, so a toggle renders only this, not the explorer, and
 * the rows stay mounted, only folded: rendering them anew held up the frame.
 */
export default function OffMapGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const id = useId();
  const collapsed = useSyncExternalStore(
    subscribeOffMapCollapsed,
    storedOffMapCollapsed,
    () => false,
  );
  // Clipped only folded or folding: open, the cards' focus ring bleeds past
  // the list.
  const [folding, setFolding] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const group = useRef<HTMLDivElement>(null);
  function unfold() {
    const still = reducedMotion();
    const button = toggle.current!;
    let scroller = button.parentElement;
    while (scroller && !/auto|scroll/.test(getComputedStyle(scroller).overflowY))
      scroller = scroller.parentElement;
    // Scrolled to the list's end, it stays there as they grow.
    const atEnd =
      !!scroller &&
      scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 2;
    // Reduced, there is no transition to end it.
    flushSync(() => {
      setFolding(!still);
      storeOffMapCollapsed(false);
    });
    if (!scroller) return;
    // Brings the rows into view as they grow, as far as taking the toggle
    // to the list's top.
    const follow = () => {
      const top = scroller.getBoundingClientRect();
      const below = atEnd
        ? scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight
        : group.current!.getBoundingClientRect().bottom -
          Math.min(top.bottom, window.innerHeight);
      const above = button.getBoundingClientRect().top - top.top;
      const by = Math.min(below, above);
      if (by > 0) scroller.scrollTop += by;
    };
    // Following on past the fold too, while the rows' real heights replace
    // their estimates.
    follow();
    const start = performance.now();
    const frame = () => {
      follow();
      if (performance.now() - start < 300) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
  return (
    <>
      {/* Between the rows in view and the rest, which keep their own
          dividers above and below it. */}
      <button
        ref={toggle}
        type="button"
        className={cn(
          "relative isolate flex w-full items-center justify-center gap-1.5 border-b border-border py-2.5 text-xs leading-4.5 font-medium text-muted outline-none",
          "transition-colors duration-120 hover:text-ink motion-reduce:transition-none",
          // The cards' hover wash and focus ring, bleeding past the text.
          "before:absolute before:inset-x-[-12px] before:inset-y-1 before:-z-1 before:rounded-lg hover:before:bg-surface-muted/65 max-md:before:inset-x-[-8px]",
          "focus-visible:before:outline-2 focus-visible:before:outline-focus",
        )}
        aria-expanded={!collapsed}
        aria-controls={id}
        data-off-map-toggle=""
        onClick={() => {
          if (collapsed) return unfold();
          setFolding(!reducedMotion());
          storeOffMapCollapsed(true);
        }}
      >
        <EyeOff size={13} aria-hidden="true" className="shrink-0" />
        Ikke synlige på kartet
        <ChevronDown
          size={15}
          aria-hidden="true"
          className={cn(
            "absolute right-0 shrink-0 transition-transform duration-200 ease-out-soft motion-reduce:transition-none",
            !collapsed && "rotate-180",
          )}
        />
      </button>
      {/* A list of their own, so a project coming into view is one row
          moving across rather than every row before it moving down. Its
          height eases, as the app's other folds do. */}
      <div
        ref={group}
        className={cn(
          "grid transition-[grid-template-rows,opacity,visibility] duration-250 ease-out-soft motion-reduce:transition-none",
          collapsed
            ? "invisible grid-rows-[0fr] opacity-0"
            : "visible grid-rows-[1fr] opacity-100",
        )}
        onTransitionEnd={(event) => {
          if (
            event.target === event.currentTarget &&
            event.propertyName === "grid-template-rows"
          )
            setFolding(false);
        }}
      >
        <ol
          id={id}
          aria-label={label}
          className={cn(
            // Room at the sides for the cards' hover wash, clipped or not.
            "-mx-3 min-h-0 px-3 max-md:-mx-2 max-md:px-2",
            (collapsed || folding) && "overflow-hidden",
          )}
        >
          {children}
        </ol>
      </div>
    </>
  );
}
