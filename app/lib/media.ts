"use client";
import { useCallback, useSyncExternalStore } from "react";

/** Tailwind's `max-md`: drawers, sheets and top toasts below 768px. */
export const mobileQuery = "(width < 48rem)";

export const reducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Whether `query` matches, following changes; `serverValue` before hydration. */
export function useMediaQuery(query: string, serverValue = false) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

/** Bottom sheets leave quicker than they arrive: a short slide down. */
export const sheetLeave = {
  duration: 120,
  easing: "cubic-bezier(0.4, 0, 1, 1)",
  fill: "forwards",
} as const;
