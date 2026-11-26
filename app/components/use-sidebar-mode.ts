"use client";
import { useLayoutEffect, useState, type RefObject } from "react";
import { reducedMotion } from "../lib/media";
import { animateVisibleWidth, type SidebarMode } from "./sidebar-panel";

/** The width panels take beside the map: as resized, or a share of the window. */
export function panelWidth(aside: HTMLElement | null) {
  const set = parseFloat(aside?.style.getPropertyValue("--panel-width") || "");
  return set || Math.round(Math.min(Math.max(innerWidth * 0.36, 380), 540));
}

/**
 * Desktop: animates the sidebar as it collapses or expands, one for the
 * whole sidebar whichever panel is on top.
 */
export function useSidebarMode({
  panelRef,
  sidebarMode,
  collapsed,
}: {
  panelRef: RefObject<HTMLElement | null>;
  sidebarMode: SidebarMode;
  collapsed: boolean;
}) {
  // The mode a change is animating from; the layout holds both until then.
  const [modeFrom, setModeFrom] = useState<SidebarMode | null>(null);
  /** The next change of mode animates, unless motion is reduced. */
  function animateFrom() {
    if (!reducedMotion()) setModeFrom(sidebarMode);
  }
  useLayoutEffect(() => {
    const aside = panelRef.current;
    if (!modeFrom || !aside) return;
    const sidebar = panelWidth(aside);
    const visible = (mode: SidebarMode, explorer: boolean) =>
      mode === "collapsed" && explorer ? 0 : sidebar;
    const elements = Array.from(
      aside.querySelectorAll<HTMLElement>(
        "[data-explorer-layer], [data-sidebar-layer]",
      ),
    );
    const animations = elements.map((element) => {
      const explorer = element.hasAttribute("data-explorer-layer");
      return animateVisibleWidth(
        element,
        visible(modeFrom, explorer),
        visible(sidebarMode, explorer),
      );
    });
    Promise.all(animations.map((animation) => animation.finished)).then(
      () => setModeFrom(null),
      () => {
        /* Replaced by the next change. */
      },
    );
    return () => animations.forEach((animation) => animation.cancel());
  }, [modeFrom, sidebarMode, panelRef]);
  return {
    modeFrom,
    animateFrom,
    asideCollapsed: collapsed || modeFrom === "collapsed",
    explorerHidden: sidebarMode === "collapsed" && !modeFrom,
  };
}
