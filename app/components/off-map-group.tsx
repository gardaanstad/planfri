"use client";
import { ChevronDown, EyeOff } from "lucide-react";
import { useId, useSyncExternalStore, type ReactNode } from "react";
import { cn } from "../lib/cn";
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
 * the rows stay mounted, only hidden: rendering them anew held up the frame.
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
  return (
    <>
      {/* Between the rows in view and the rest, which keep their own
          dividers above and below it; folded, only the one above. */}
      <button
        type="button"
        className={cn(
          // The border's colour is set folded too, or unfolding fades it
          // in from the text's colour.
          "relative isolate flex w-full items-center gap-1.5 border-border py-2.5 text-left text-xs leading-4.5 font-medium text-muted outline-none",
          "transition-colors duration-120 hover:text-ink motion-reduce:transition-none",
          // The cards' hover wash and focus ring, bleeding past the text.
          "before:absolute before:inset-x-[-12px] before:inset-y-1 before:-z-1 before:rounded-lg hover:before:bg-surface-muted/65 max-md:before:inset-x-[-8px]",
          "focus-visible:before:outline-2 focus-visible:before:outline-focus",
          !collapsed && "border-b",
        )}
        aria-expanded={!collapsed}
        aria-controls={id}
        data-off-map-toggle=""
        onClick={() => storeOffMapCollapsed(!collapsed)}
      >
        <EyeOff size={13} aria-hidden="true" className="shrink-0" />
        Ikke synlige på kartet
        <ChevronDown
          size={15}
          aria-hidden="true"
          className={cn(
            "ml-auto shrink-0 transition-transform duration-200 ease-out-soft motion-reduce:transition-none",
            !collapsed && "rotate-180",
          )}
        />
      </button>
      {/* A list of their own, so a project coming into view is one row
          moving across rather than every row before it moving down. */}
      <ol id={id} aria-label={label} hidden={collapsed}>
        {children}
      </ol>
    </>
  );
}
