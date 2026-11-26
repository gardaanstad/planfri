"use client";

import { Fragment, type ReactNode } from "react";
import { Menu } from "@base-ui/react/menu";
import { Ellipsis } from "lucide-react";
import { cn } from "../lib/cn";
import {
  countBadge,
  iconButton,
  menuItem as item,
  menuItemDanger,
  menuPopup,
  menuSeparator,
} from "../lib/ui";
import { SwitchTrack } from "./action-sheet";

export type OverflowAction = {
  id: string;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  /** Beside the label; the menu's button gets a dot. */
  count?: number;
  /** A setting, such as dark mode: a switch at the row's end. */
  checked?: boolean;
  /**
   * A state the action turns on and off, such as saving: its icon and
   * label say which, as on the phone's sheet.
   */
  pressed?: boolean;
  /** Destructive, such as deleting: in the danger colour. */
  danger?: boolean;
};

/** A header's "more" menu: a project's actions, say. */
export function OverflowMenu({ actions }: { actions: OverflowAction[] }) {
  const news = actions.some((action) => (action.count ?? 0) > 0);
  return (
    <Menu.Root>
      <Menu.Trigger
        className={cn(
          iconButton,
          "relative rounded-lg text-muted hover:text-ink data-popup-open:bg-ink/[0.05] data-popup-open:text-ink",
        )}
        aria-label="Flere valg"
        data-tooltip="Flere valg"
        data-overflow-menu=""
      >
        <Ellipsis size={20} aria-hidden="true" />
        {news && (
          <span
            aria-hidden="true"
            className="absolute top-2 right-2 size-2.5 rounded-full border-2 border-surface bg-accent"
          />
        )}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner
          side="bottom"
          align="end"
          sideOffset={4}
          className="z-[1000]"
        >
          <Menu.Popup className={menuPopup}>
            {actions.map((action, index) => {
              const end =
                (action.count ?? 0) > 0 ? (
                  <span className={cn(countBadge, "ml-auto")}>
                    {action.count! > 99 ? "99+" : action.count}
                  </span>
                ) : action.checked !== undefined ? (
                  <span className="ml-auto flex pl-3">
                    <SwitchTrack on={action.checked} />
                  </span>
                ) : null;
              const label =
                action.count && action.count > 0
                  ? `${action.label} (${action.count})`
                  : undefined;
              const separator = action.danger && index > 0 && (
                <Menu.Separator className={menuSeparator} />
              );
              const toggle = action.checked ?? action.pressed;
              return toggle === undefined ? (
                <Fragment key={action.id}>
                  {separator}
                <Menu.Item
                  key={action.id}
                  className={cn(
                    item,
                    action.danger && menuItemDanger,
                  )}
                  onClick={action.onSelect}
                  aria-label={label}
                  data-overflow-action={action.id}
                >
                  {action.icon}
                  {action.label}
                  {end}
                </Menu.Item>
                </Fragment>
              ) : (
                <Menu.CheckboxItem
                  key={action.id}
                  className={item}
                  checked={toggle}
                  closeOnClick
                  onCheckedChange={action.onSelect}
                  aria-label={label}
                  data-overflow-action={action.id}
                >
                  {action.icon}
                  {action.label}
                  {end}
                </Menu.CheckboxItem>
              );
            })}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
