"use client";
import { useLayoutEffect, useState, type RefObject } from "react";
import { flushSync } from "react-dom";
import { reducedMotion } from "../lib/media";
import {
  animateVisibleWidth,
  type SidebarMode,
  sidebarTiming,
} from "./sidebar-panel";

/** The width panels take beside the map: as resized, or a share of the window. */
export function panelWidth(aside: HTMLElement | null) {
  const set = parseFloat(aside?.style.getPropertyValue("--panel-width") || "");
  return set || Math.round(Math.min(Math.max(innerWidth * 0.36, 380), 540));
}

/**
 * Waits, briefly, for the photos newly in view to decode, so the picture a
 * view transition takes of the new layout has them.
 */
function imagesReady(container: HTMLElement) {
  const pending = Array.from(container.querySelectorAll("img")).filter(
    (image) => {
      const rect = image.getBoundingClientRect();
      return rect.width > 0 && rect.top < window.innerHeight && rect.bottom > 0;
    },
  );
  return Promise.race([
    Promise.all(
      pending.map((image) => {
        // Lazy ones would wait for a layout pass the transition holds back;
        // the file is usually cached from the layout before.
        image.loading = "eager";
        return image.decode().catch(() => {});
      }),
    ),
    new Promise((resolve) => setTimeout(resolve, 80)),
  ]);
}

/**
 * Desktop: animates the sidebar between its modes, one for the whole
 * sidebar whichever panel is on top. The map keeps its size throughout,
 * except when collapsing frees its left edge.
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
  /**
   * Maximizing or restoring lays the sidebar out once, at its new size, and
   * the browser morphs the layer in view from the old picture to the new: its
   * edge slides, its content crossfades, the logo and header controls glide
   * to their places. Nothing lays out per frame, and content never passes
   * through the sizes in between. Without view transitions, the clip and
   * width animate instead (see the layout effect below).
   */
  function changeMode(change: () => void, to: "maximize" | "restore") {
    const aside = panelRef.current;
    if (!aside || reducedMotion()) return change();
    if (!document.startViewTransition) {
      animateFrom();
      return change();
    }
    const layer = Array.from(
      aside.querySelectorAll<HTMLElement>(
        "[data-explorer-layer], [data-sidebar-layer]",
      ),
    ).findLast((element) => !element.hasAttribute("data-exiting"));
    const root = document.documentElement;
    root.dataset.sidebarTransition = to;
    layer?.setAttribute("data-sidebar-transition-layer", "");
    const transition = document.startViewTransition(async () => {
      flushSync(change);
      if (layer) await imagesReady(layer);
    });
    transition.finished.finally(() => {
      if (root.dataset.sidebarTransition === to)
        delete root.dataset.sidebarTransition;
      layer?.removeAttribute("data-sidebar-transition-layer");
    });
  }
  useLayoutEffect(() => {
    const aside = panelRef.current;
    if (!modeFrom || !aside) return;
    const sidebar = panelWidth(aside);
    const visible = (mode: SidebarMode, explorer: boolean) =>
      mode === "maximized"
        ? window.innerWidth
        : mode === "collapsed" && explorer
          ? 0
          : sidebar;
    const width = (mode: SidebarMode) =>
      mode === "maximized" ? window.innerWidth : sidebar;
    const elements = Array.from(
      aside.querySelectorAll<HTMLElement>(
        "[data-explorer-layer], [data-sidebar-layer]",
      ),
    );
    // Only the layer in view lays out along the way; maximizing or
    // restoring, its content moves with the edge instead of jumping after.
    const inView = elements.findLast(
      (element) => !element.hasAttribute("data-exiting"),
    );
    const resizes = modeFrom === "maximized" || sidebarMode === "maximized";
    const animations = elements.map((element) => {
      const explorer = element.hasAttribute("data-explorer-layer");
      return animateVisibleWidth(
        element,
        visible(modeFrom, explorer),
        visible(sidebarMode, explorer),
        resizes && element === inView
          ? [width(modeFrom), width(sidebarMode)]
          : undefined,
      );
    });
    // Collapsing or expanding, the toggle rides the list's edge, so it is
    // never left over the map, and waits in the corner tab. Keyframe offsets
    // are in eased progress, the same the edge moves by.
    const toggle = aside.querySelector<HTMLElement>("[data-explorer-toggle]");
    const rest = aside.querySelector<HTMLElement>("[data-toggle-rest]");
    const slot = aside.querySelector<HTMLElement>("[data-toggle-slot]");
    const modes = [modeFrom, sidebarMode];
    if (
      toggle &&
      rest &&
      slot &&
      modes.includes("collapsed") &&
      modes.includes("normal")
    ) {
      // Its place in the header, left of the maximize button.
      const slotLeft =
        slot.getBoundingClientRect().left - aside.getBoundingClientRect().left;
      const end = `${slotLeft}px`;
      const left = `${rest.offsetLeft}px`;
      const meet = Math.min(
        1,
        Math.max(0, (slotLeft - rest.offsetLeft) / sidebar),
      );
      // The slot is measured where it stands, so the toggle's own shift
      // beside the maximize button (`sidebar-toggle`) is held at none.
      const frames = (
        sidebarMode === "collapsed"
          ? [{ left: end }, { left, offset: meet }, { left }]
          : [{ left }, { left, offset: 1 - meet }, { left: end }]
      ).map((frame) => ({ ...frame, translate: "0px" }));
      animations.push(
        toggle.animate(frames, { ...sidebarTiming, fill: "forwards" }),
      );
    }
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
    changeMode,
    // While animating, the sidebar holds the larger of both layouts.
    wide: sidebarMode === "maximized" || modeFrom === "maximized",
    asideCollapsed: collapsed || modeFrom === "collapsed",
    explorerHidden: sidebarMode === "collapsed" && !modeFrom,
  };
}
