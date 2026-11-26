"use client";
import {
  startTransition,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

const exitMs = 120;
const moveMs = 320;
const enterMs = 220;
const easeOutSoft = "cubic-bezier(0.22, 1, 0.36, 1)";
// Each kind of motion on its own property, so they combine when interrupted.
const moveId = "list-move";
const enterId = "list-enter";

/**
 * The rows' running animations, by row. Asked of the document once, as
 * asking each row flushes style for every one.
 */
function animationsOf(rows: Iterable<Element>, ids?: string[]) {
  const wanted = new Set(rows);
  const found = new Map<Element, Animation[]>();
  for (const animation of document.getAnimations()) {
    const target = (animation.effect as KeyframeEffect | null)?.target;
    if (!target || !wanted.has(target)) continue;
    if (ids && !ids.includes(animation.id)) continue;
    const list = found.get(target);
    if (list) list.push(animation);
    else found.set(target, [animation]);
  }
  return found;
}

type Sight = { top: number; bottom: number; height: number };

/** The part of the scroll container that is on screen. */
function sightOf(element: HTMLElement | null): Sight | null {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  const top = Math.max(rect.top, 0);
  const bottom = Math.min(rect.bottom, window.innerHeight);
  return { top, bottom, height: Math.max(bottom - top, 0) };
}

function overlaps(rect: DOMRect, view: Sight) {
  return rect.height > 0 && rect.bottom > view.top && rect.top < view.bottom;
}

/** A copy of a row that left the list, fading where the row was. */
type Ghost = { node: HTMLElement; rect: DOMRect; opacity: number };

/** A copy of `row` to fade, without what finds it as a row or by id. */
function copyOf(row: HTMLElement, attribute: string) {
  const node = row.cloneNode(true) as HTMLElement;
  node.removeAttribute(attribute);
  node.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
  return node;
}

/**
 * Lifts a leaving row's copy into `list`, whose box is `origin`, over where
 * the row was.
 */
function place(
  node: HTMLElement,
  rect: DOMRect,
  list: HTMLElement,
  origin: DOMRect,
) {
  Object.assign(node.style, {
    position: "absolute",
    top: `${rect.top - origin.top}px`,
    left: `${rect.left - origin.left}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: "0",
    pointerEvents: "none",
  });
  node.inert = true;
  node.setAttribute("aria-hidden", "true");
  // First in the list, so the rows gliding in pass over it.
  list.prepend(node);
}

/**
 * Moves a list from one set of items to the next at once: rows that drop out
 * fade where they were, lifted out of the flow, while the rows that stay
 * glide into the room they leave and new rows fade in at their places. Only
 * rows in sight move; a change midway carries on from where every row is.
 * With reduced motion, or the list out of sight, it swaps without motion.
 *
 * Rows are found by `attribute` inside `scroller`, and leaving rows fade in
 * their list element, marked `data-list-motion`, which must be positioned
 * (`relative`).
 */
export function useListMotion<T>(
  items: T[],
  keyOf: (item: T) => string,
  scroller: RefObject<HTMLElement | null>,
  attribute: string,
): T[] {
  const [shown, setShown] = useState(items);
  const prev = useRef(items);
  /** Where each row was in sight before the swap, for the glide after it. */
  const from = useRef<Map<string, DOMRect> | null>(null);
  const ghosts = useRef<Ghost[]>([]);
  const fading = useRef(new Set<HTMLElement>());
  const keyRef = useRef(keyOf);
  useLayoutEffect(() => {
    keyRef.current = keyOf;
  });

  useLayoutEffect(() => {
    const live = fading.current;
    return () => live.forEach((node) => node.remove());
  }, []);

  // The glide comes first: a commit can bring both the swap and the next
  // change, as a pan does, and the change measures the rows where the swap
  // has put them, which the glide would take for where they were.
  useLayoutEffect(() => {
    const rects = from.current;
    const left = ghosts.current;
    from.current = null;
    ghosts.current = [];
    const container = scroller.current;
    if (!container || !rects) return;
    const view = sightOf(container)!;
    const rows = container.querySelectorAll<HTMLElement>(`[${attribute}]`);
    const list = container.querySelector<HTMLElement>("[data-list-motion]");

    // Where every row landed, read before any of them starts to move, and
    // without the glides still under way: each starts anew from where it was.
    for (const running of animationsOf(rows, [moveId]).values())
      running.forEach((animation) => animation.cancel());
    const landed = Array.from(rows, (row) => row.getBoundingClientRect());
    const entering = animationsOf(rows, [enterId]);
    const origin = list?.getBoundingClientRect();
    const fadeOut = ({ node, rect, opacity }: Ghost) => {
      if (!list || !origin) return;
      place(node, rect, list, origin);
      fading.current.add(node);
      const fade = node.animate(
        { opacity: [opacity, 0], scale: [1, 0.985] },
        { duration: exitMs, easing: "ease-out", fill: "forwards" },
      );
      fade.onfinish = fade.oncancel = () => {
        node.remove();
        fading.current.delete(node);
      };
    };
    left.forEach(fadeOut);

    let moved = false;
    /** Rows coming in, and whether they wait for the room to open. */
    const arrivals: [HTMLElement, boolean][] = [];
    for (const [index, row] of rows.entries()) {
      const to = landed[index];
      const was = rects.get(row.getAttribute(attribute)!);
      const inSight = overlaps(to, view);
      // A row folded away with the rows off the map was nowhere: its box
      // reads as the screen's corner, and it would glide down from the
      // list's top over the tabs. It fades in at its place, at once, as
      // soon as it would have started gliding.
      if (!was || was.height === 0) {
        if (inSight) arrivals.push([row, !was]);
        continue;
      }
      const wasInSight = overlaps(was, view);
      // Folded away in turn, it fades where it was, as a row leaving does.
      if (to.height === 0) {
        if (wasInSight)
          fadeOut({ node: copyOf(row, attribute), rect: was, opacity: 1 });
        continue;
      }
      const dx = was.left - to.left;
      let dy = was.top - to.top;
      if (
        (!inSight && !wasInSight) ||
        (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5)
      )
        continue;
      // From far out of sight, it glides in from the edge it comes from,
      // at the pace of the rest.
      if (!wasInSight)
        dy =
          dy > 0
            ? Math.min(dy, view.bottom - to.top)
            : Math.max(dy, view.top - to.bottom);
      moved = true;
      row.animate(
        { transform: [`translate(${dx}px, ${dy}px)`, "none"] },
        { duration: moveMs, easing: easeOutSoft, id: moveId },
      );
    }
    // New rows follow the glide a beat behind, so the room opens first.
    for (const [row, waits] of arrivals) {
      entering.get(row)?.forEach((animation) => animation.cancel());
      row.animate(
        { opacity: [0, 1], translate: ["0 6px", "0 0"] },
        {
          duration: enterMs,
          delay: moved && waits ? 60 : 0,
          easing: "ease-out",
          fill: "backwards",
          id: enterId,
        },
      );
    }
  }, [attribute, scroller, shown]);

  useLayoutEffect(() => {
    if (prev.current === items) return;
    prev.current = items;
    const view = sightOf(scroller.current);
    const rows =
      scroller.current?.querySelectorAll<HTMLElement>(`[${attribute}]`) ?? [];
    const still =
      !view ||
      view.height === 0 ||
      document.hidden ||
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (still) {
      from.current = null;
      for (const list of animationsOf(rows).values())
        list.forEach((animation) => animation.cancel());
    } else {
      const rects = new Map<string, DOMRect>();
      const left: Ghost[] = [];
      const staying = new Set(items.map(keyRef.current));
      // Every read before any write, so the list is laid out once, not once
      // a row.
      for (const row of rows) {
        const id = row.getAttribute(attribute)!;
        // Mid-glide, from where the row is now, not where it is headed.
        const rect = row.getBoundingClientRect();
        rects.set(id, rect);
        if (!staying.has(id) && overlaps(rect, view))
          left.push({
            node: row,
            rect,
            opacity: Number(getComputedStyle(row).opacity),
          });
      }
      for (const ghost of left) ghost.node = copyOf(ghost.node, attribute);
      // The rows glide on until the swap: cancelled here, a row coming in
      // stood at its place, unmoved, until the swap set it going again.
      from.current = rects;
      ghosts.current = left;
    }
    // The swap waits on the rows as they were, so it follows their commit.
    // Set here, in a layout effect, it would render at once, holding up the
    // frame however the change came: a pan bringing many rows in stuttered.
    startTransition(() => setShown(items));
  }, [attribute, items, scroller]);

  return shown;
}
