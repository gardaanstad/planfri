"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type RefObject,
} from "react";
import { Menu } from "@base-ui/react/menu";
import { cn } from "../lib/cn";
import { menuPopup } from "../lib/ui";

/*
 * Every desktop dropdown behaves one way:
 *
 * - It opens and closes as the mouse goes down, at once, with no motion.
 * - While it's open, a clear layer takes the pointer from everything but the
 *   dropdown and its trigger: nothing behind it hovers, and a press there
 *   only closes the dropdown, its click spent. The trigger stays in reach,
 *   so it hovers and a second press on it closes what the first opened.
 *
 * Menus of actions use Base UI's `Menu` with `DropdownPopup`. Hand-built
 * dropdowns in the top layer (`ChoiceSelect`, `FilterPopover`) take the
 * layer from `useDropdownShield`.
 */

/**
 * Above the panels, sheets and header, so the backdrop Base UI lays under a
 * menu covers them too; without a layer of its own it sits under anything
 * with a z-index, and a panel's rows go on hovering under an open menu.
 */
const menuLayer = "relative z-[1000]";

/**
 * A Base UI menu's popup, for `Menu.Root`: under its trigger, its right edge
 * lined up with the trigger's unless `align` says otherwise. Base UI's
 * backdrop (on by default, as `modal`) takes the pointer, cut out around the
 * trigger.
 */
export function DropdownPopup({
  side = "bottom",
  align = "end",
  sideOffset = 4,
  anchor,
  className,
  children,
  ...props
}: Omit<ComponentProps<typeof Menu.Popup>, "className"> & {
  className?: string;
} & Pick<
    ComponentProps<typeof Menu.Positioner>,
    "side" | "align" | "sideOffset" | "anchor"
  >) {
  return (
    <Menu.Portal className={menuLayer}>
      <Menu.Positioner
        side={side}
        align={align}
        sideOffset={sideOffset}
        anchor={anchor}
      >
        <Menu.Popup className={cn(menuPopup, className)} {...props}>
          {children}
        </Menu.Popup>
      </Menu.Positioner>
    </Menu.Portal>
  );
}

/**
 * The clear layer under a hand-built dropdown in the top layer. Render
 * `shield` beside the dropdown and call `show()` just before the dropdown
 * enters the top layer, so it lands under it, and `hide()` as it leaves. A
 * press on the layer calls `onDismiss`.
 */
export function useDropdownShield(
  trigger: RefObject<HTMLElement | null>,
  onDismiss: () => void,
) {
  const layer = useRef<HTMLDivElement>(null);
  const dismiss = useRef(onDismiss);
  useLayoutEffect(() => {
    dismiss.current = onDismiss;
  });
  // Undoes what `show` set up.
  const cleanup = useRef<(() => void) | null>(null);

  // Stable, so effects can list them.
  const [controls] = useState(() => ({
    show() {
      const element = layer.current;
      if (!element || cleanup.current) return;
      // A hole where the trigger is, kept on it as the page moves.
      const cut = () => {
        const rect = trigger.current?.getBoundingClientRect();
        element.style.clipPath = rect
          ? `polygon(0 0,100% 0,100% 100%,0 100%,0 0,${rect.left}px ${rect.top}px,${rect.left}px ${rect.bottom}px,${rect.right}px ${rect.bottom}px,${rect.right}px ${rect.top}px,${rect.left}px ${rect.top}px)`
          : "";
      };
      element.showPopover();
      cut();
      window.addEventListener("resize", cut);
      window.addEventListener("scroll", cut, true);
      cleanup.current = () => {
        window.removeEventListener("resize", cut);
        window.removeEventListener("scroll", cut, true);
        if (element.matches(":popover-open")) element.hidePopover();
      };
    },
    hide() {
      cleanup.current?.();
      cleanup.current = null;
    },
  }));
  useLayoutEffect(() => controls.hide, [controls]);

  const shield = (
    <div
      ref={layer}
      popover="manual"
      aria-hidden="true"
      data-dropdown-shield=""
      className="fixed inset-0 m-0 h-auto w-auto border-0 bg-transparent p-0"
      // Closes as the mouse goes down, like the dropdowns open, and the
      // release's click is spent; focus stays where it was.
      data-press=""
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => dismiss.current()}
      onContextMenu={(event) => {
        event.preventDefault();
        dismiss.current();
      }}
    />
  );
  return { shield, ...controls };
}
