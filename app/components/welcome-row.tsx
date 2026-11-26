"use client";
import { useSyncExternalStore } from "react";
import { X } from "lucide-react";
import {
  dismissWelcome,
  storedWelcomeDismissed,
  subscribeWelcome,
} from "../lib/explore-state";
import { cn } from "../lib/cn";

/**
 * The first visit's welcome, at the top of the list, laid out like a
 * project's row: a title and a few words. Its wash is a row's
 * hover, in the accent's soft tint, and it stays until closed. Shown once
 * the browser says it hasn't been closed, unfolding into place.
 */
export default function WelcomeRow() {
  const dismissed = useSyncExternalStore(
    subscribeWelcome,
    storedWelcomeDismissed,
    () => true,
  );
  if (dismissed) return null;
  return (
    <div
      className={cn(
        "grid grid-rows-[1fr] opacity-100 transition-[grid-template-rows,opacity] duration-320 ease-out-soft",
        "starting:grid-rows-[0fr] starting:opacity-0 motion-reduce:transition-none",
      )}
      data-welcome=""
    >
      <section
        className={cn(
          // Folds without clipping the wash, which reaches past the row.
          "relative isolate min-h-0 overflow-clip border-b border-border py-4 [overflow-clip-margin:12px] max-md:py-3.5",
          // A project row's hover wash, kept.
          "before:absolute before:inset-x-[-12px] before:inset-y-2 before:-z-1 before:rounded-xl before:bg-accent-soft max-md:before:inset-x-[-8px] max-md:before:inset-y-1.5",
        )}
        aria-labelledby="welcome-title"
      >
        <h2
          id="welcome-title"
          className="pr-8 text-item leading-5.5 text-pretty text-ink"
        >
          Velkommen til Planfri
        </h2>
        <p className="mt-1 text-sm leading-5 text-pretty text-ink-soft">
          Følg byggeprosjekter i hele Norge. Listen viser det som er på
          kartet.
        </p>
        <button
          type="button"
          className={cn(
            "absolute top-3 -right-1.5 inline-flex size-8 items-center justify-center rounded-lg text-muted",
            "hover:bg-ink/[0.06] hover:text-ink max-md:top-2.5",
          )}
          aria-label="Lukk velkomsten"
          data-tooltip="Lukk"
          data-press=""
          onClick={dismissWelcome}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </section>
    </div>
  );
}
