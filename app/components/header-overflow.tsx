"use client";

import {
  Fragment,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { flushSync } from "react-dom";
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

// The menu's button before it has been measured: an icon button and a gap.
const fallbackItem = 46;

/**
 * A header row whose actions give way to a "more" menu as it narrows. The
 * header holds a brand, then `nav`; the nav's overflowing items carry
 * `data-overflow-item={id}` and leave in `order`, first to last. Returns
 * the ids in the menu, and the header width the nav needs with every item
 * in place (`all`) or none. Where the element before the nav grows to fill
 * the row, such as a title, `reserve` is the width it keeps instead.
 */
export function useHeaderOverflow(
  nav: RefObject<HTMLElement | null>,
  order: string[],
  reserve?: number,
  /** The menu stays for actions of its own, so it's part of the fixed width. */
  menuAlways = false,
) {
  const [hidden, setHidden] = useState(0);
  // The reserve the items were last fitted to; `ready` once it's the current one.
  const [fitted, setFitted] = useState<number | null | undefined>(null);
  const widths = useRef(new Map<string, number>());
  const trigger = useRef(fallbackItem);
  const shown = useRef(0);

  // The nav without its overflowing items, and the room around it.
  function layout() {
    const element = nav.current;
    const header = element?.parentElement;
    if (!element || !header) return null;
    const gap = parseFloat(getComputedStyle(element).columnGap) || 0;
    let inline = 0;
    for (const item of element.querySelectorAll<HTMLElement>(
      "[data-overflow-item]",
    )) {
      const width = item.offsetWidth + gap;
      widths.current.set(item.dataset.overflowItem!, width);
      inline += width;
    }
    const menu = element.querySelector<HTMLElement>("[data-overflow-menu]");
    if (menu) trigger.current = menu.offsetWidth + gap;
    const style = getComputedStyle(header);
    const brand = element.previousElementSibling as HTMLElement | null;
    return {
      fixed:
        element.offsetWidth - inline - (menu && !menuAlways ? trigger.current : 0),
      around:
        parseFloat(style.paddingLeft) +
        parseFloat(style.paddingRight) +
        (reserve ?? brand?.offsetWidth ?? 0) +
        (parseFloat(style.columnGap) || 0),
      header: header.clientWidth,
    };
  }

  /** The nav's width with the items from `from` on in place. */
  function width(from: number) {
    return (
      order
        .slice(from)
        .reduce((sum, id) => sum + (widths.current.get(id) ?? fallbackItem), 0) +
      (from > 0 && !menuAlways ? trigger.current : 0)
    );
  }

  // Rendered before the next paint, so the header never shows overflowing.
  const fit = useEffectEvent(() => {
    const measured = layout();
    if (!measured) return;
    const room = measured.header - measured.around - measured.fixed;
    let count = 0;
    while (count < order.length && width(count) > room + 0.5) count++;
    if (count === shown.current) {
      setFitted(reserve);
      return;
    }
    shown.current = count;
    flushSync(() => {
      setHidden(count);
      setFitted(reserve);
    });
  });

  // The header resizing, and items coming or going, change what fits. An
  // observer also reports once as it starts.
  const key = order.join(" ");
  useEffect(() => {
    const element = nav.current;
    const header = element?.parentElement;
    if (!element || !header) return;
    const observer = new ResizeObserver(() => fit());
    observer.observe(header);
    observer.observe(element);
    return () => observer.disconnect();
  }, [nav, key, reserve, menuAlways]);

  /** The header's width with every item in the nav, or in the menu. */
  const needed = (all: boolean) => {
    const measured = layout();
    if (!measured) return 0;
    return measured.around + measured.fixed + width(all ? 0 : order.length);
  };

  return {
    hidden: new Set(order.slice(0, Math.min(hidden, order.length))),
    /** Fitted since it last changed: what's shown in the bar stays. */
    ready: fitted === reserve,
    needed,
  };
}

/** The header's "more" menu: the actions that no longer fit beside it. */
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
