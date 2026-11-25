"use client";
import { Menu } from "@base-ui/react/menu";
import { Plus } from "lucide-react";
import { cn } from "../lib/cn";
import { menuItem, menuPopup } from "../lib/ui";

/**
 * The desktop map's right-click menu, opened at the pointer: starts a
 * project on the spot, added by moderators and suggested by members.
 */
export default function MapContextMenu({
  at,
  canModerate,
  onClose,
  onCreate,
}: {
  /** Where on screen it opens; closed when null. */
  at: { x: number; y: number } | null;
  canModerate: boolean;
  onClose: () => void;
  onCreate: () => void;
}) {
  const anchor = at && {
    getBoundingClientRect: () => DOMRect.fromRect({ x: at.x, y: at.y, width: 0, height: 0 }),
  };
  return (
    <Menu.Root
      open={at !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Menu.Portal>
        <Menu.Positioner
          anchor={anchor}
          side="bottom"
          align="start"
          sideOffset={2}
          className="z-[1000]"
        >
          <Menu.Popup
            aria-label="Valg for stedet i kartet"
            data-map-menu=""
            // At the pointer, at once, as the system's own menu would.
            className={cn(menuPopup, "motion-safe:animate-none")}
          >
            <Menu.Item
              className={menuItem}
              onClick={onCreate}
            >
              <Plus size={16} aria-hidden="true" />
              {canModerate ? "Legg til prosjekt her" : "Foreslå prosjekt her"}
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
