"use client";
import { useEffect, useRef, useState } from "react";

/** How long a closed block takes to fold shut, matching `foldAway`. */
export const foldAwayMs = 280;

/**
 * A grid block that folds shut and fades, then is gone: its one child clips
 * (`min-h-0 overflow-hidden`). With reduced motion it only fades.
 */
export const foldAway = {
  base: "grid transition-[grid-template-rows,opacity] duration-280 ease-out-soft motion-reduce:transition-opacity",
  open: "grid-rows-[1fr] opacity-100",
  closed: "grid-rows-[0fr] opacity-0",
};

/**
 * Closing a block that goes away for good: `closing` folds it, and `done`
 * runs once the fold has played.
 */
export function useFoldAway(done: () => void) {
  const [closing, setClosing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const close = () => {
    if (closing) return;
    setClosing(true);
    timer.current = setTimeout(done, foldAwayMs);
  };
  return [closing, close] as const;
}
