"use client";
import { Menu } from "@base-ui/react/menu";
import { ExternalLink, Plus } from "lucide-react";
import type { Point } from "../lib/data";
import { cn } from "../lib/cn";
import { menuItem, menuPopup } from "../lib/ui";

/**
 * The desktop map's right-click menu, opened at the pointer: starts a
 * project on the spot, added by moderators and suggested by members, or
 * opens Google Maps at the same place and zoom.
 */
export default function MapContextMenu({
  at,
  canModerate,
  onClose,
  onCreate,
}: {
  /** Where on screen it opens; closed when null. */
  at: { point: Point; zoom: number; x: number; y: number } | null;
  canModerate: boolean;
  onClose: () => void;
  onCreate: () => void;
}) {
  const anchor = at && {
    getBoundingClientRect: () => DOMRect.fromRect({ x: at.x, y: at.y, width: 0, height: 0 }),
  };
  const googleMaps =
    at &&
    `https://www.google.com/maps/@?api=1&map_action=map&center=${at.point[0].toFixed(6)},${at.point[1].toFixed(6)}&zoom=${Math.min(Math.max(Math.round(at.zoom), 0), 21)}`;
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
            {googleMaps && (
              <Menu.LinkItem
                className={menuItem}
                href={googleMaps}
                target="_blank"
                rel="noreferrer"
                closeOnClick
              >
                <ExternalLink size={16} aria-hidden="true" />
                Åpne Google Maps her
              </Menu.LinkItem>
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
