"use client";
import { EyeOff } from "lucide-react";
import { useEffect, useEffectEvent, useRef, type ReactNode } from "react";
import { reducedMotion } from "../lib/media";

// Shown, the heading stays this far below the list's top: clear of the fade
// there, with a row or so above it to show where it is.
const keep = 96;
/** Sent to the heading (`data-off-map-heading`) to scroll the rows in. */
export const showOffMapEvent = "off-map-show";

/**
 * The list's projects out of the map's view, below a heading that sets them
 * apart from those in it.
 */
export default function OffMapGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const heading = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLOListElement>(null);

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

  /**
   * Asked from elsewhere: scrolls the heading as near the list's top as it
   * goes (see `keep`). With a row and a half of the rows, or all, already in
   * sight, not at all.
   */
  const show = useEffectEvent(() => {
    const scroller = scrollerOf();
    if (!scroller) return;
    const view = scroller.getBoundingClientRect();
    const rows = list.current!;
    const top = heading.current!.getBoundingClientRect();
    const shown = Math.min(view.bottom, window.innerHeight) - top.bottom;
    const first = rows.firstElementChild?.getBoundingClientRect().height ?? 0;
    if (shown >= Math.min(first * 1.5, rows.offsetHeight)) return;
    const below =
      scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    const above = top.top - Math.max(view.top, 0) - keep;
    scroller.scrollBy({
      top: Math.max(0, Math.min(below, above)),
      behavior: reducedMotion() ? "instant" : "smooth",
    });
  });
  useEffect(() => {
    const element = heading.current!;
    const listener = () => show();
    element.addEventListener(showOffMapEvent, listener);
    return () => element.removeEventListener(showOffMapEvent, listener);
  }, []);

  return (
    <>
      {/* Between the rows in view and the rest, which keep their own
          dividers above and below it. */}
      <div
        ref={heading}
        className="flex w-full items-center justify-center gap-1.5 border-b border-border py-2.5 text-xs leading-4.5 font-medium text-muted"
        data-off-map-heading=""
      >
        <EyeOff size={14} aria-hidden="true" className="shrink-0" />
        Ikke synlige på kartet
      </div>
      {/* A list of their own, so a project coming into view is one row
          moving across rather than every row before it moving down. */}
      <ol ref={list} aria-label={label}>
        {children}
      </ol>
    </>
  );
}
