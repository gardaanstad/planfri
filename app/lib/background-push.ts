"use client";
import { useCallback, useLayoutEffect, useRef } from "react";

/*
 * Phones: while a modal bottom sheet is open (a menu, the filters, a choice,
 * the login prompt), the page behind it eases back a little, as on iOS. The
 * look is in globals.css (`data-pushed`); this keeps count, so sheets opened
 * over one another push it once and it returns with the last.
 *
 * The persistent drawers (the list, a project) are part of the page and are
 * pushed with it, never pushing it themselves.
 */

let pushes = 0;

function apply() {
  const root = document.documentElement;
  // A page that scrolls would be scaled about its top, out of view. Read
  // from layout: `scrollHeight` counts the body's transform, so while it
  // eases back from the last push the page would look too tall.
  const fits =
    document.body.offsetHeight <= root.clientHeight + 1 && !window.scrollY;
  root.toggleAttribute("data-pushed", pushes > 0 && fits);
}

/**
 * Pushes the page back while `active`. The returned function lets it go
 * early, as a sheet starts to slide away, rather than once it is gone.
 */
export function useBackgroundPush(active: boolean) {
  const held = useRef(false);
  const release = useCallback(() => {
    if (!held.current) return;
    held.current = false;
    pushes--;
    apply();
  }, []);
  useLayoutEffect(() => {
    if (!active) return;
    held.current = true;
    pushes++;
    apply();
    return release;
  }, [active, release]);
  return release;
}

/**
 * Follows a sheet dragged down: `progress` from 0 (open) to 1 (gone), the
 * page coming forward with it. `transition` is a duration and easing, or
 * "none" to follow the finger. Only one sheet's drag moves it.
 */
export function followPush(progress: number | null, transition = "none") {
  const body = document.body;
  if (pushes !== 1 || progress === null) {
    body.style.removeProperty("--push-progress");
    body.style.removeProperty("transition");
    return;
  }
  body.style.transition =
    transition === "none"
      ? "none"
      : ["scale", "translate", "clip-path"]
          .map((property) => `${property} ${transition}`)
          .join(", ");
  body.style.setProperty("--push-progress", String(progress));
}
