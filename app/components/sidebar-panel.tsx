"use client";

import { useEffect, useEffectEvent, type ReactNode } from "react";
import { ArrowLeft, X } from "lucide-react";
import { cn } from "../lib/cn";
import { iconButton } from "../lib/ui";

/**
 * Desktop: how the sidebar sits beside the map. The explorer list is its
 * base layer; panels (a project, Lagret, Forslag, a profile) stack on top
 * and share the mode. A collapsed sidebar still shows panels at normal width.
 */
export type SidebarMode = "collapsed" | "normal";

/**
 * Every sidebar change of size shares one transition: the timing of the
 * panels' slide (`--animate-panel-in`). Layers are clipped from the visible
 * width before to the one after. The layer in view also changes its width
 * when given `widths`, so its content moves along with the edge.
 */
export const sidebarTiming = {
  duration: 320,
  easing: "cubic-bezier(0.22, 1, 0.36, 1)",
};
export function animateVisibleWidth(
  element: HTMLElement,
  from: number,
  to: number,
  widths?: [from: number, to: number],
) {
  const frame = (visible: number, width?: number) => ({
    clipPath: `inset(0 ${Math.max(0, (width ?? element.offsetWidth) - visible)}px 0 0)`,
    ...(width !== undefined && { width: `${width}px` }),
  });
  // Held at the end until the layout settles, so the clip never lifts early.
  return element.animate([frame(from, widths?.[0]), frame(to, widths?.[1])], {
    ...sidebarTiming,
    fill: "forwards",
  });
}

/**
 * How a closing panel leaves: sliding back out, the opening motion in
 * reverse on the same timing (`--animate-panel-in`), so it gets going just
 * as quickly.
 */
export function animatePanelOut(element: HTMLElement) {
  const { transform } = getComputedStyle(element);
  return element.animate(
    [{ transform }, { transform: "translateX(-100%)" }],
    { ...sidebarTiming, fill: "forwards" },
  );
}

/** A panel opened again while closing returns from where it got to. */
export function animatePanelBack(element: HTMLElement, exit: Animation) {
  const { transform } = getComputedStyle(element);
  exit.cancel();
  return element.animate(
    [{ transform }, { transform: "none" }],
    sidebarTiming,
  );
}

export const controlButton = cn(
  iconButton,
  "rounded-lg active:scale-100 pointer-fine:active:scale-[0.97]",
);

/**
 * Escape on the panel on top of the stack. Menus and dialogs over it take
 * Escape first.
 */
export function usePanelEscape(active: boolean, onEscape: () => void) {
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (
      event.key !== "Escape" ||
      event.defaultPrevented ||
      document.querySelector("dialog[open], [data-slot=choice-menu][data-open=true]")
    )
      return;
    event.preventDefault();
    onEscape();
  });
  useEffect(() => {
    if (!active) return;
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);
}

/**
 * Desktop: a panel in the sidebar stack, a bar with the close control over
 * scrolling content. See `Panel`, which also handles Escape.
 */
export function SidebarPanel({
  name,
  onClose,
  onBack,
  closeLabel = "Lukk",
  bar = true,
  children,
}: {
  /** Names the panel for tests and styling (`data-sidebar-panel`). */
  name: string;
  onClose: () => void;
  /** Back to the panel this one was opened from. */
  onBack?: () => void;
  closeLabel?: string;
  /** False when the content brings its own header (see `PanelHeader`). */
  bar?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className="flex h-full min-h-0 flex-col bg-surface"
      data-sidebar-panel={name}
    >
      {bar && (
      <div
        // The list's header height, so controls stay put as panels open.
        className="flex h-16 shrink-0 items-center gap-0.5 px-3"
      >
        {onBack && (
          <button
            type="button"
            className={cn(controlButton, "text-muted")}
            onClick={onBack}
            aria-label="Tilbake"
            data-tooltip="Tilbake"
          >
            <ArrowLeft size={20} />
          </button>
        )}
        <div className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            className={controlButton}
            onClick={onClose}
            aria-label={closeLabel}
            data-sidebar-close=""
          >
            <X size={20} />
          </button>
        </div>
      </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col">
        {children}
      </div>
    </div>
  );
}
