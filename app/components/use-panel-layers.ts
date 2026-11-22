"use client";
import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { reducedMotion } from "../lib/media";
import { animatePanelBack, animatePanelOut } from "./sidebar-panel";

/** The explorer's panels, bottom to top. */
export type Layer =
  | "saved"
  | "suggestions"
  | "account"
  | "project"
  | "profile"
  | "editor";
const layerOrder: Layer[] = [
  "saved",
  "suggestions",
  "account",
  "project",
  "profile",
  "editor",
];

/**
 * The explorer's panel stack as it animates: the open panels (`live`), and
 * those still on their way out. Desktop panels slide or fade away in the
 * sidebar; on phones, drawers animate themselves.
 */
export function usePanelLayers({
  live,
  isMobile,
  maximized,
  panelRef,
  onClosedOverMaximized,
}: {
  live: Layer[];
  isMobile: boolean;
  maximized: boolean;
  /** The desktop sidebar the panels are in. */
  panelRef: RefObject<HTMLElement | null>;
  /** A panel opened beside the map closed while the sidebar is maximized. */
  onClosedOverMaximized: () => void;
}) {
  // Closed panels stay until they have animated away. A panel replaced by
  // another in the same step (Lagret for the profile, say) goes at once on
  // desktop; a phone holds its drawer under the new one until that is up.
  const [exitingState, setExiting] = useState<Layer[]>([]);
  let exiting = exitingState;
  const [heldState, setHeld] = useState<Layer[]>([]);
  let held = heldState;
  // Whether each panel opened over a maximized sidebar: it then fades in
  // where it is, and closing it keeps the sidebar maximized. One opened
  // beside the map takes the sidebar back there when it closes.
  const [openedMaximized, setOpenedMaximized] = useState<
    Partial<Record<Layer, boolean>>
  >(() => Object.fromEntries(live.map((layer) => [layer, maximized])));
  // Counts closings that take the sidebar back beside the map.
  const [restores, setRestores] = useState(0);
  const [previousLayers, setPreviousLayers] = useState(live);
  if (previousLayers.join() !== live.join()) {
    const added = live.filter((layer) => !previousLayers.includes(layer));
    const removed = previousLayers.filter((layer) => !live.includes(layer));
    setPreviousLayers(live);
    exiting = [
      ...exiting.filter((layer) => !live.includes(layer)),
      ...(added.length ? [] : removed),
    ];
    setExiting(exiting);
    held = isMobile && added.length ? removed : [];
    setHeld(held);
    const opened = { ...openedMaximized };
    for (const layer of added)
      opened[layer] =
        removed.length > 0 ? openedMaximized[removed[0]] : maximized;
    setOpenedMaximized(opened);
    if (
      !added.length &&
      maximized &&
      removed.some((layer) => openedMaximized[layer] === false)
    )
      setRestores((count) => count + 1);
  }
  const layers = layerOrder.filter(
    (layer) => live.includes(layer) || exiting.includes(layer),
  );
  const leaving = (layer: Layer) =>
    exiting.includes(layer) || held.includes(layer);

  const restore = useEffectEvent(onClosedOverMaximized);
  useLayoutEffect(() => {
    if (restores) restore();
  }, [restores]);

  // Closed panels animate away, then leave; opened again on the way, they
  // come back from where they got to.
  // Phones: drawers animate themselves, and report when they are gone.
  const exits = useRef(new Map<Layer, Animation>());
  useLayoutEffect(() => {
    if (isMobile) return;
    const aside = panelRef.current;
    const reduced = reducedMotion();
    for (const [layer, exit] of exits.current) {
      if (exiting.includes(layer)) continue;
      exits.current.delete(layer);
      const element = aside?.querySelector<HTMLElement>(
        `[data-sidebar-layer="${layer}"]`,
      );
      if (element && previousLayers.includes(layer) && !reduced)
        animatePanelBack(element, exit);
      else exit.cancel();
    }
    for (const layer of exiting) {
      if (exits.current.has(layer)) continue;
      const element = aside?.querySelector<HTMLElement>(
        `[data-sidebar-layer="${layer}"]`,
      );
      if (!element || reduced) {
        setExiting((current) => current.filter((item) => item !== layer));
        continue;
      }
      const exit = animatePanelOut(element, element.hasAttribute("data-full"));
      exits.current.set(layer, exit);
      exit.finished.then(
        () => {
          if (exits.current.get(layer) !== exit) return;
          exits.current.delete(layer);
          setExiting((current) => current.filter((item) => item !== layer));
        },
        () => {
          /* Opened again. */
        },
      );
    }
  }, [exiting, previousLayers, isMobile, panelRef]);

  // Closing a panel returns focus to what opened it (projects do their own).
  const layerTriggers = useRef(new Map<Layer, HTMLElement>());
  const shownLayers = useRef<Layer[]>([]);
  function rememberTrigger(layer: Layer) {
    if (document.activeElement instanceof HTMLElement)
      layerTriggers.current.set(layer, document.activeElement);
  }
  useEffect(() => {
    const gone = shownLayers.current.filter(
      (layer) => layer !== "project" && !live.includes(layer),
    );
    shownLayers.current = live;
    for (const layer of gone) {
      const trigger = layerTriggers.current.get(layer);
      layerTriggers.current.delete(layer);
      if (trigger?.isConnected)
        requestAnimationFrame(() => trigger.focus({ preventScroll: true }));
    }
  });

  return {
    /** Every panel shown, open or leaving, bottom to top. */
    layers,
    exiting,
    /** Phones: drawers held under the one replacing them until it is up. */
    held,
    setHeld,
    /** A phone's drawer has animated away. */
    exited: (layer: Layer) =>
      setExiting((current) => current.filter((item) => item !== layer)),
    leaving,
    openedMaximized,
    /** Notes what has focus, to return it there when the layer closes. */
    rememberTrigger,
  };
}
