"use client";

import { useEffect, useRef } from "react";
import { keyboardFocused } from "../lib/ui";

const showDelay = 200;
// Explanatory tooltips (`data-tooltip-delay="long"`) wait until the pointer
// rests, so they don't flash while moving across the content.
const longDelay = 600;
// Moving between tooltipped controls skips the delay for this long.
const warmWindow = 500;
// A tooltip opened by a tap (`data-tooltip-tap`) stays this long.
const tapHold = 2500;
const gap = 6;
const edge = 8;

/**
 * One shared tooltip for every element with `data-tooltip`. It renders in the
 * top layer, so scroll containers and dialogs never clip it. Touch input is
 * ignored, except a tap on `data-tooltip-tap`, which shows it for a moment;
 * keyboard focus shows it for focus-visible controls.
 */
export default function TooltipLayer() {
  const tipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tip = tipRef.current;
    if (!tip) return;
    let target: HTMLElement | null = null;
    let timer = 0;
    let hiddenAt = 0;
    let lastPointer = "";
    const isOpen = () => tip.matches(":popover-open");

    function place(element: HTMLElement) {
      const anchor = element.getBoundingClientRect();
      const box = tip!.getBoundingClientRect();
      const below =
        element.dataset.tooltipSide === "bottom" ||
        anchor.top - box.height - gap < edge;
      const top = below ? anchor.bottom + gap : anchor.top - box.height - gap;
      const left = Math.min(
        Math.max(anchor.left + anchor.width / 2 - box.width / 2, edge),
        window.innerWidth - box.width - edge,
      );
      tip!.style.translate = `${Math.round(left)}px ${Math.round(top)}px`;
      tip!.dataset.side = below ? "bottom" : "top";
    }

    function show(element: HTMLElement, tapped = false) {
      const text = element.dataset.tooltip;
      if (!text) return hide();
      // A name shown inside the control makes its tooltip redundant; once a
      // narrow layout hides that name, the tooltip stands in for it.
      const label = element.querySelector("[data-tooltip-label]");
      if (label?.checkVisibility({ visibilityProperty: true })) return hide();
      // Text that may be cut short shows whole in its tooltip, and only then.
      const clip = element.querySelector("[data-tooltip-clip]");
      if (
        clip &&
        clip.scrollHeight <= clip.clientHeight &&
        clip.scrollWidth <= clip.clientWidth
      )
        return hide();
      target = element;
      window.clearTimeout(timer);
      const warm = isOpen() || performance.now() - hiddenAt < warmWindow;
      timer = window.setTimeout(
        () => {
          if (target !== element || !element.isConnected) return;
          tip!.textContent = text;
          // Re-open so the tooltip stacks above any dialog opened since.
          if (isOpen()) tip!.hidePopover();
          tip!.showPopover();
          place(element);
          if (tapped) timer = window.setTimeout(hide, tapHold);
        },
        warm || tapped
          ? 0
          : element.dataset.tooltipDelay === "long"
            ? longDelay
            : showDelay,
      );
    }

    function hide() {
      window.clearTimeout(timer);
      target = null;
      if (isOpen()) {
        tip!.hidePopover();
        hiddenAt = performance.now();
      }
    }

    const tooltipped = (node: EventTarget | null) =>
      node instanceof Element
        ? node.closest<HTMLElement>("[data-tooltip]")
        : null;
    const over = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const element = tooltipped(event.target);
      if (element === target) return;
      if (element) show(element);
      else hide();
    };
    const focus = (event: FocusEvent) => {
      const element = tooltipped(event.target);
      if (element && keyboardFocused(element)) show(element);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") hide();
    };
    const down = (event: PointerEvent) => {
      lastPointer = event.pointerType;
      hide();
    };
    const tap = (event: MouseEvent) => {
      if (lastPointer !== "touch") return;
      const element = tooltipped(event.target);
      if (element?.hasAttribute("data-tooltip-tap")) show(element, true);
    };
    const leave = (event: PointerEvent) => {
      if (!event.relatedTarget) hide();
    };

    document.addEventListener("pointerover", over);
    document.addEventListener("pointerout", leave);
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("click", tap);
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", hide);
    document.addEventListener("keydown", key, true);
    document.addEventListener("scroll", hide, true);
    window.addEventListener("blur", hide);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerout", leave);
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("click", tap);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("keydown", key, true);
      document.removeEventListener("scroll", hide, true);
      window.removeEventListener("blur", hide);
    };
  }, []);

  return (
    <div
      ref={tipRef}
      popover="manual"
      role="tooltip"
      aria-hidden="true"
      className={[
        "pointer-events-none fixed inset-auto top-0 left-0 m-0 w-max max-w-60 rounded-md border-0 bg-inverse px-2 py-1.25",
        "text-xs leading-[1.35] font-medium text-on-inverse shadow-popover",
        "motion-safe:animate-tooltip-in motion-safe:data-[side=bottom]:animate-tooltip-in-below",
      ].join(" ")}
    />
  );
}
