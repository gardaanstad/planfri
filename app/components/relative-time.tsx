"use client";

import { useSyncExternalStore } from "react";
import { cn } from "../lib/cn";
import {
  formatDate,
  formatDateYear,
  formatRelative,
  relativeTimeLimit,
} from "../lib/data";

const minute = 60_000;
const listeners = new Set<() => void>();
let timer = 0;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1)
    timer = window.setInterval(
      () => listeners.forEach((notify) => notify()),
      minute,
    );
  return () => {
    listeners.delete(listener);
    if (!listeners.size) window.clearInterval(timer);
  };
}
// Rounded so repeated reads within a render agree.
const getNow = () => Math.floor(Date.now() / minute) * minute;
// The server can't know the reader's clock; render the plain date there.
const getServerNow = () => null;

/** Current time, ticking each minute; null during SSR and hydration. */
export function useNow() {
  return useSyncExternalStore(subscribe, getNow, getServerNow);
}

type Mode = "auto" | "relative";

/**
 * `auto`: relative while recent, else the date. `relative`: always relative.
 * A relative time has the date as its tooltip.
 */
export default function RelativeTime({
  date,
  mode = "auto",
  withYear = false,
  className,
}: {
  date: string;
  mode?: Mode;
  withYear?: boolean;
  className?: string;
}) {
  const now = useNow();
  const absolute = withYear ? formatDateYear(date) : formatDate(date);
  const recent = now !== null && now - Date.parse(date) < relativeTimeLimit;
  const relative = now === null ? null : formatRelative(date, now);
  let text = absolute;
  if (relative && (mode === "relative" || recent)) text = relative;
  return (
    <time
      dateTime={date}
      // A relative time reads as a label, its date in the tooltip.
      className={cn(className, text === relative && "select-none")}
      data-tooltip={text === relative ? formatDateYear(date) : undefined}
    >
      {text}
    </time>
  );
}
