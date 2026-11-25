"use client";
import { ChevronDown, EyeOff } from "lucide-react";
import {
  useEffect,
  useEffectEvent,
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

const duration = 250;
// Revealing the rows, the toggle stays this far below the list's top: clear
// of the fade there, with a row or so above it to show where it is.
const keep = 96;
/** Sent to the toggle (`data-off-map-toggle`) to open the rows and show them. */
export const showOffMapEvent = "off-map-show";
// The app's --ease-out-soft.
const easing = "cubic-bezier(0.22, 1, 0.36, 1)";

/** Those of `elements` in the list's flow, not pinned over it. */
function inFlow(elements: Iterable<Element>) {
  return [...elements].filter(
    (el): el is HTMLElement =>
      el instanceof HTMLElement &&
      !/sticky|fixed|absolute/.test(getComputedStyle(el).position),
  );
}

/** Below `from` in the list: what moves as the group opens and closes. */
function following(from: HTMLElement, scroller: HTMLElement) {
  const found: HTMLElement[] = [];
  for (let at = from; at.parentElement && at !== scroller; ) {
    for (let next = at.nextElementSibling; next; next = next.nextElementSibling)
      found.push(...inFlow([next]));
    at = at.parentElement;
  }
  return found;
}

/**
 * The list's projects out of the map's view, below a row that folds them
 * away. Open by default; folded, it stays so in this browser.
 *
 * Its own component, so a toggle renders only this, not the explorer, and
 * the rows stay mounted, only hidden: rendering them anew held up the frame.
 *
 * The fold changes no layout while it plays, and runs no script, which on
 * phones made it stutter: the list takes its new height and scroll at once,
 * and transforms ease it there from where it was. The rows slide out from
 * under the toggle, or back under it, with what follows them, and for the
 * scroll, so does the whole list.
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
  // Closing: the toggle shows it closed while the rows wipe away.
  const [shutting, setShutting] = useState(false);
  const open = !collapsed && !shutting;
  const toggle = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  // Ends the fold playing, if any, at its end.
  const settle = useRef<(() => void) | null>(null);

  /**
   * What scrolls the list. A drawer below full height holds its scroller
   * still (`data-drawer-scroll`) until it is scrolled, which a script can.
   */
  function scrollerOf() {
    let scroller = list.current!.parentElement;
    while (
      scroller &&
      !scroller.hasAttribute("data-drawer-scroll") &&
      !/auto|scroll/.test(getComputedStyle(scroller).overflowY)
    )
      scroller = scroller.parentElement;
    return scroller;
  }

  // Asked from elsewhere: open, taking the toggle up as far as it can go.
  const show = useEffectEvent(() => {
    if (!open) return fold(false, true);
    const scroller = scrollerOf();
    if (!scroller) return;
    scroller.scrollBy({
      top: reveal(scroller, false, true),
      behavior: reducedMotion() ? "instant" : "smooth",
    });
  });
  useEffect(() => {
    const element = toggle.current!;
    const listener = () => show();
    element.addEventListener(showOffMapEvent, listener);
    return () => element.removeEventListener(showOffMapEvent, listener);
  }, []);

  function fold(close: boolean, toToggle = false) {
    settle.current?.();
    const rows = list.current!;
    const scroller = scrollerOf();
    // Scrolled to the list's end, opening keeps it there.
    const atEnd =
      !!scroller &&
      scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 2;
    if (!scroller || reducedMotion()) {
      flushSync(() => storeOffMapCollapsed(close));
      if (!close && scroller)
        scroller.scrollTop += reveal(scroller, atEnd, toToggle);
      return;
    }
    const box = frame.current!;
    const moving = following(box, scroller);
    const tops = () => moving.map((el) => el.getBoundingClientRect().top);
    const start = scroller.scrollTop;
    let shifts: number[];
    let by: number;
    if (close) {
      // Where they'll end, folded, while the rows still show.
      const shown = tops();
      rows.hidden = true;
      // Folded, the browser may pull the scroll back to the shorter end,
      // moving everything by as much.
      const pulled = start - scroller.scrollTop;
      const folded = tops().map((top) => top - pulled);
      const end = scroller.scrollHeight - scroller.clientHeight;
      rows.hidden = false;
      scroller.scrollTop = start;
      flushSync(() => setShutting(true));
      shifts = folded.map((top, i) => top - shown[i]);
      // Past the folded list's end, it eases back with it.
      by = Math.min(0, end - start);
    } else {
      const folded = tops();
      flushSync(() => storeOffMapCollapsed(false));
      shifts = tops().map((top, i) => folded[i] - top);
      by = reveal(scroller, atEnd, toToggle);
    }
    const options = { duration, easing, fill: "both" } as const;
    // Clipped at the toggle, but not at the sides, past which the hover
    // wash and focus ring bleed.
    box.style.clipPath = "inset(0 -16px -100vh -16px)";
    const slide = (el: HTMLElement, by: number) =>
      el.animate(
        {
          transform: close
            ? ["none", `translateY(${by}px)`]
            : [`translateY(${by}px)`, "none"],
        },
        options,
      );
    const animations = [
      slide(rows, -rows.offsetHeight),
      ...moving.flatMap((el, i) => (shifts[i] ? [slide(el, shifts[i])] : [])),
    ];
    // Scrolled now, opening, and the list eased there from where it was;
    // closing, eased there, and scrolled at the end.
    if (!close) scroller.scrollTop = start + by;
    const scrolled = close ? by : scroller.scrollTop - start;
    if (scrolled)
      for (const el of inFlow(scroller.children))
        animations.push(slide(el, close ? -scrolled : scrolled));
    const done = () => {
      if (settle.current !== done) return;
      settle.current = null;
      if (close) {
        flushSync(() => {
          storeOffMapCollapsed(true);
          setShutting(false);
        });
        scroller.scrollTop = start + scrolled;
      }
      for (const animation of animations) animation.cancel();
      box.style.clipPath = "";
    };
    settle.current = done;
    animations[0].finished.then(done, () => {});
  }

  /**
   * How far to scroll for the opened rows, as far as taking the toggle near
   * the list's top (see `keep`); at the list's end, to its new end. Asked
   * `toToggle`, as far as it goes whatever the rows need. With a row and a
   * half of them, or all, already in sight, not at all.
   */
  function reveal(scroller: HTMLElement, atEnd: boolean, toToggle = false) {
    const view = scroller.getBoundingClientRect();
    const rows = list.current!;
    const shown =
      Math.min(view.bottom, window.innerHeight) -
      toggle.current!.getBoundingClientRect().bottom;
    const first = rows.firstElementChild?.getBoundingClientRect().height ?? 0;
    if (shown >= Math.min(first * 1.5, rows.offsetHeight)) return 0;
    const below =
      atEnd || toToggle
        ? scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight
        : rows.getBoundingClientRect().bottom -
          Math.min(view.bottom, window.innerHeight);
    const above =
      toggle.current!.getBoundingClientRect().top -
      Math.max(view.top, 0) -
      keep;
    return Math.max(0, Math.min(below, above));
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
          "before:absolute before:inset-x-[-12px] before:inset-y-1 before:-z-1 before:rounded-lg hover:before:bg-ink/[0.05] pointer-coarse:active:before:bg-ink/[0.05] dark:hover:before:bg-surface-muted/65 dark:pointer-coarse:active:before:bg-surface-muted/65 max-md:before:inset-x-[-8px]",
          "focus-visible:before:outline-2 focus-visible:before:outline-focus",
        )}
        aria-expanded={open}
        aria-controls={id}
        data-off-map-toggle=""
        onClick={() => fold(open)}
      >
        <EyeOff size={14} aria-hidden="true" className="shrink-0" />
        Ikke synlige på kartet
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={cn(
            "absolute right-0 shrink-0 transition-transform duration-200 ease-out-soft motion-reduce:transition-none",
            open && "rotate-180",
          )}
        />
      </button>
      {/* A list of their own, so a project coming into view is one row
          moving across rather than every row before it moving down. */}
      <div ref={frame}>
        <ol ref={list} id={id} aria-label={label} hidden={collapsed}>
          {children}
        </ol>
      </div>
    </>
  );
}
