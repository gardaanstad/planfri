"use client";

import {
  Fragment,
  memo,
  useEffectEvent,
  useLayoutEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "../lib/cn";
import { mobileQuery, reducedMotion, sheetLeave } from "../lib/media";
import { useBackgroundPush } from "../lib/background-push";
import { useSwipeDismiss } from "./use-swipe-dismiss";
import { SheetGrip, sheetTitle, sheetTitleGap } from "./action-sheet";
import { Radio } from "./choice-mark";
import { useDropdownShield } from "./dropdown";

type Option = {
  value: string;
  label: string;
  count?: number;
  /** Background class for a leading colour dot, such as a status tone. */
  dot?: string;
  icon?: ReactNode;
  /**
   * Narrower choices, shown under the option once it's chosen. Choosing the
   * option again clears them along with it.
   */
  children?: Option[];
  /** Kept under "Vis flere" until asked for, or while it's chosen. */
  more?: boolean;
  /** A line above it, setting it and those after apart from those before. */
  divider?: boolean;
  /** Offers a pin beside it, with `pins` set on the select. */
  pinnable?: boolean;
};

const flatten = (options: Option[]): Option[] =>
  options.flatMap((option) => [option, ...(option.children ?? [])]);

type ChoiceSelectBase = {
  label: string;
  options: Option[];
  icon?: ReactNode;
  className?: string;
  /** Classes merged onto the trigger, e.g. to match a form's fields. */
  triggerClassName?: string;
  triggerLabel?: string;
  /** A tooltip on the trigger, for pointers. */
  triggerTooltip?: string;
  /** A dot on the trigger's icon: a choice other than the usual one. */
  triggerDot?: boolean;
  /** Names the anchored menu above its options, as the phone sheet does. */
  menuTitle?: boolean;
  /**
   * Which of the trigger's edges the anchored menu lines up with: its
   * start, or its end, for a trigger at the end of a row.
   */
  menuAlign?: "start" | "end";
  /**
   * Grows and shrinks to a new label smoothly, so what sits beside it in a
   * row follows along rather than jumping.
   */
  smoothWidth?: boolean;
  /**
   * Just the options, in place and always shown, styled as on a phone's
   * sheet: for a sheet of filters holding several of them.
   */
  inline?: boolean;
  /**
   * Inline, with the anchored menu's rows, sized for a pointer: for a
   * desktop popover of filters.
   */
  compact?: boolean;
  /**
   * Options are places to go rather than a state to keep: none shows as
   * chosen, and the menu opens on its first.
   */
  goTo?: boolean;
  /**
   * Options kept at hand: a pinnable option shows a pin on hover, and stays
   * marked once pinned. Where pinned options sit is up to `options`.
   */
  pins?: {
    values: readonly string[];
    max: number;
    onChange: (values: string[]) => void;
    /**
     * Phones have no hover: there the pins show only once this, in a menu
     * beside the sheet's title, is on.
     */
    phoneToggle?: { label: string; on: boolean; onChange: (on: boolean) => void };
  };
};

type ChoiceSelectProps =
  | (ChoiceSelectBase & {
      multiple?: false;
      value: string;
      onChange: (value: string) => void;
    })
  | (ChoiceSelectBase & {
      multiple: true;
      value: string[];
      onChange: (value: string[]) => void;
    });

const widthMotion = "choice-width";

/**
 * On desktop, a row's hit area reaches halfway across the gap to each
 * neighbour, so no strip between rows is dead to the pointer. The reach is
 * transparent: rows and their hover tint look as they did. It sits above
 * the subcategory list, which would otherwise cover the parent's reach.
 */
const reach = "relative before:absolute before:z-1 before:inset-x-0";
// Rows with a border reach from inside it: 1px more, past it.
const reachBordered = cn(reach, "before:-inset-x-px before:-inset-y-[3px]");
// Below an open group: across the whole gap, as the group's last child
// can't reach past its clipping.
const reachPastGroup =
  "[[data-slot=choice-group][data-open=true]+&]:before:-top-[5px]";

/**
 * Memoized: a list or map beside it re-renders often, and a menu is costly
 * to redraw. Pass it stable options, icons and handlers.
 */
export default memo(function ChoiceSelect(props: ChoiceSelectProps) {
  const {
    label,
    options,
    icon,
    className = "",
    triggerClassName,
    triggerLabel,
    triggerTooltip,
    triggerDot = false,
    menuTitle = false,
    menuAlign = "start",
    smoothWidth = false,
    inline = false,
    compact = false,
    goTo = false,
    pins,
  } = props;
  const multiple = props.multiple === true;
  const selectedValues = new Set(
    props.multiple === true ? props.value : [props.value],
  );
  // What the menu marks as chosen: nothing, for places to go.
  const marked = goTo ? new Set<string>() : selectedValues;
  const selectedOptions = flatten(options).filter((option) =>
    selectedValues.has(option.value),
  );
  // A chosen option counts as its chosen children, or as one without any.
  const selectedCount = options
    .filter((option) => selectedValues.has(option.value))
    .reduce(
      (sum, option) =>
        sum +
        Math.max(
          1,
          option.children?.filter((child) => selectedValues.has(child.value))
            .length ?? 0,
        ),
      0,
    );
  const [open, setOpen] = useState(false);
  const primary = options.filter((option) => !option.more);
  const extra = options.filter((option) => option.more);
  const extraChosen = extra.some((option) => marked.has(option.value));
  // Opens expanded when something under it is chosen.
  const [expanded, setExpanded] = useState(inline && extraChosen);
  // Grouped menus get room for their subcategories to sit side by side.
  const grouped = options.some((option) => option.children?.length);
  const [sheet, setSheet] = useState(inline && !compact);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const {
    shield,
    show: showShield,
    hide: hideShield,
  } = useDropdownShield(trigger, () => close());
  // The width it last rested at, for `smoothWidth`.
  const restingWidth = useRef<number | null>(null);
  const menu = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const sheetPanel = useRef<HTMLDivElement>(null);
  const topFade = useRef<HTMLDivElement>(null);
  const bottomFade = useRef<HTMLDivElement>(null);
  // Touch browsers don't focus tapped buttons, so a press inside (the trigger,
  // the scrim) blurs to nothing first; let its click decide instead.
  const pressing = useRef(false);
  const id = useId();
  // Pinning reorders the rows, which can take focus with them; it's put
  // back where it was, and the menu doesn't take the loss for leaving.
  const refocus = useRef<{ slot: string; value: string } | null>(null);
  useLayoutEffect(() => {
    const target = refocus.current;
    if (!target) return;
    refocus.current = null;
    list.current
      ?.querySelector<HTMLElement>(
        `[data-slot="${target.slot}"][data-value="${CSS.escape(target.value)}"]`,
      )
      ?.focus({ preventScroll: true });
  });
  const selectedSummary = selectedOptions
    .map((option) => option.label)
    .join(", ");
  const shownLabel =
    props.multiple === true
      ? triggerLabel || label
      : triggerLabel || selectedSummary || props.value;

  const focusSelectedOption = useEffectEvent(() => {
    const focusIndex = Math.max(
      0,
      // In the order they're shown, the extras last.
      [...primary, ...extra].findIndex((option) => marked.has(option.value)),
    );
    list.current
      ?.querySelectorAll<HTMLButtonElement>('[data-slot="choice-option"]')
      [focusIndex]?.focus({ preventScroll: true });
  });

  useLayoutEffect(() => {
    const popup = menu.current;
    const listbox = list.current;
    if (!popup || !listbox || !open) return;
    // Phones get a bottom sheet instead of an anchored menu.
    const asSheet = window.matchMedia(mobileQuery).matches;
    setSheet(asSheet);
    // Under the anchored menu, the trigger aside (see `useDropdownShield`).
    if (!asSheet) showShield();
    // The top layer keeps menus clear of the drawer's clipped content.
    popup.showPopover();
    const positionMenu = () => {
      if (!root.current) return;
      if (asSheet) {
        Object.assign(popup.style, {
          inset: "0",
          width: "auto",
          maxHeight: "none",
        });
        return;
      }
      const rect = root.current.getBoundingClientRect();
      const gutter = 14;
      const gap = 8;
      const width = Math.min(
        Math.max(rect.width, grouped ? 320 : 230),
        window.innerWidth - gutter * 2,
      );
      popup.style.width = `${width}px`;
      const below = window.innerHeight - rect.bottom - gutter - gap;
      const above = rect.top - gutter - gap;
      const upward =
        below < Math.min(listbox.scrollHeight, 320) && above > below;
      popup.dataset.side = upward ? "top" : "bottom";
      popup.style.maxHeight = `${Math.min(grouped ? 480 : 380, Math.max(80, upward ? above : below))}px`;
      const start = menuAlign === "end" ? rect.right - width : rect.left;
      popup.style.left = `${Math.max(gutter, Math.min(start, window.innerWidth - width - gutter))}px`;
      // Anchored by the edge nearest the trigger, so the menu grows away
      // from it as choices open up underneath an option.
      if (upward) {
        popup.style.top = "auto";
        popup.style.bottom = `${window.innerHeight - rect.top + gap}px`;
      } else {
        popup.style.bottom = "auto";
        popup.style.top = `${rect.bottom + gap}px`;
      }
    };
    positionMenu();
    focusSelectedOption();
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);
    return () => {
      popup.hidePopover();
      hideShield();
      popup.removeAttribute("style");
      document.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
    };
  }, [open, grouped, menuAlign, showShield, hideShield]);

  /**
   * The sheet's fades show there is more past either end: whole while a
   * fade's height or more is left that way, gone at that end, and gone when
   * everything fits. Clamped, so a bounce past an end doesn't flash them.
   */
  function updateFade() {
    const scroller = list.current;
    if (!scroller) return;
    const below =
      scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop;
    for (const [overlay, left] of [
      [topFade.current, scroller.scrollTop],
      [bottomFade.current, below],
    ] as const) {
      if (!overlay) continue;
      const height =
        parseFloat(
          getComputedStyle(overlay).getPropertyValue("--fade-height"),
        ) || 40;
      overlay.style.opacity = String(Math.min(1, Math.max(0, left / height)));
    }
  }
  const refreshFade = useEffectEvent(updateFade);
  // Opening, resizing and groups opening underneath all change what's left.
  useLayoutEffect(() => {
    if (!open || !sheet) return;
    refreshFade();
    const observer = new ResizeObserver(() => refreshFade());
    if (list.current) observer.observe(list.current);
    if (content.current) observer.observe(content.current);
    return () => observer.disconnect();
  }, [open, sheet]);

  // A sheet sliding away; its animations are let go once it has closed.
  // Kept current while it rests, whatever resizes it.
  useLayoutEffect(() => {
    const element = root.current;
    if (!smoothWidth || !element) return;
    const observer = new ResizeObserver(() => {
      if (!element.getAnimations().some((a) => a.id === widthMotion))
        restingWidth.current = element.getBoundingClientRect().width;
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [smoothWidth]);
  // A new label: from where it was (or is, midway), to its new width.
  useLayoutEffect(() => {
    const element = root.current;
    if (!smoothWidth || !element) return;
    const running = element
      .getAnimations()
      .filter((animation) => animation.id === widthMotion);
    const from = running.length
      ? element.getBoundingClientRect().width
      : restingWidth.current;
    running.forEach((animation) => animation.cancel());
    delete element.dataset.growing;
    const to = element.getBoundingClientRect().width;
    restingWidth.current = to;
    if (from === null || Math.abs(from - to) < 1 || reducedMotion()) return;
    const motion = element.animate(
      [{ width: `${from}px` }, { width: `${to}px` }],
      { duration: 240, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
    motion.id = widthMotion;
    // Set off by a slow handler (a pan ending moves the list and the map),
    // it would take its start from that frame's clock, read before the
    // handler ran, and be mostly over when first drawn. It waits for a
    // fresh frame instead.
    motion.pause();
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        if (motion.playState === "paused") motion.play();
      });
    });
    const stop = () => cancelAnimationFrame(frame);
    if (to <= from) return stop;
    // Growing, the new words are laid out whole and the pill uncovers them
    // as it opens, rather than ending them in "…" until it has room.
    element.dataset.growing = "";
    const done = () => {
      if (!element.getAnimations().some((a) => a.id === widthMotion))
        delete element.dataset.growing;
    };
    motion.finished.then(done, done);
    return stop;
  }, [smoothWidth, shownLabel]);
  const leaving = useRef<Animation[] | null>(null);
  const releasePush = useBackgroundPush(open && sheet && !inline);
  function close(animate = true) {
    trigger.current?.focus({ preventScroll: true });
    releasePush();
    const panel = sheetPanel.current;
    const scrim = menu.current;
    if (leaving.current) return;
    if (!sheet || !animate || !panel || !scrim || reducedMotion()) {
      setOpen(false);
      return;
    }
    const out = panel.animate(
      [{ transform: "none" }, { transform: "translateY(100%)" }],
      sheetLeave,
    );
    const fade = scrim.animate(
      [{ "--sheet-progress": 0 }, { "--sheet-progress": 1 }],
      sheetLeave,
    );
    leaving.current = [out, fade];
    const done = () => {
      // Hidden first, in the same frame, so letting go of the slide can't
      // show it back at rest; it opens again from there.
      flushSync(() => setOpen(false));
      leaving.current?.forEach((animation) => animation.cancel());
      leaving.current = null;
    };
    out.finished.then(done, done);
  }
  // Dragged down like the drawers, from its handle or a list at its top;
  // it has already slid away by then.
  useSwipeDismiss({
    enabled: open && sheet,
    sheet: sheetPanel,
    scroller: list,
    backdrop: menu,
    // Hidden before the swipe lets go of it the next frame, or it could be
    // drawn once more back at rest over the page.
    onDismiss: () => flushSync(() => close(false)),
  });

  /** A parent narrowed to some of its children, rather than all of it. */
  const narrowed = (option: Option) =>
    option.children?.some((child) => marked.has(child.value)) ?? false;

  /**
   * Multiple choice. A parent stands for all of it and opens its children;
   * choosing children narrows it instead, and unchoosing the last of them
   * widens it back to all. Choosing a narrowed parent widens it too, and
   * choosing it once more clears the group.
   */
  function toggle(value: string) {
    if (props.multiple !== true) return;
    const parent = options.find((option) => option.value === value);
    if (!props.value.includes(value)) {
      props.onChange([...props.value, value]);
      return;
    }
    const children = new Set(
      (parent?.children ?? []).map((child) => child.value),
    );
    if (parent && narrowed(parent)) {
      props.onChange(props.value.filter((item) => !children.has(item)));
      return;
    }
    props.onChange(
      props.value.filter((item) => item !== value && !children.has(item)),
    );
  }

  const radio = (chosen: boolean, alone: boolean) => (
    <Radio chosen={chosen} large={sheet} className={cn(alone && "ml-auto")} />
  );

  /** Checks a chosen row where several can be chosen. */
  const check = (chosen: boolean, size: number, alone: boolean) => (
    <Check
      size={size}
      strokeWidth={2.25}
      aria-hidden="true"
      className={cn(
        "shrink-0 transition-opacity duration-150 motion-reduce:transition-none",
        alone && "ml-auto",
        !chosen && "opacity-0",
      )}
    />
  );

  const pinsShown = !sheet || !pins?.phoneToggle || pins.phoneToggle.on;

  function togglePin(value: string, keyboard: boolean) {
    if (!pins) return;
    const pinned = pins.values.includes(value);
    if (!pinned && pins.values.length >= pins.max) return;
    const active = document.activeElement;
    refocus.current = keyboard
      ? { slot: "choice-pin", value }
      : active instanceof HTMLElement &&
          list.current?.contains(active) &&
          active.dataset.slot &&
          active.dataset.value !== undefined
        ? { slot: active.dataset.slot, value: active.dataset.value }
        : null;
    pins.onChange(
      pinned
        ? pins.values.filter((item) => item !== value)
        : [...pins.values, value],
    );
  }

  /**
   * The pin beside a pinnable option, shown on hover or focus, at once;
   * filled once pinned. On phones it shows whenever pins are turned on.
   */
  function renderPin(option: Option) {
    const pinned = pins!.values.includes(option.value);
    const full = !pinned && pins!.values.length >= pins!.max;
    return (
      <button
        type="button"
        data-slot="choice-pin"
        data-value={option.value}
        tabIndex={-1}
        aria-label={`Fest ${option.label}`}
        aria-pressed={pinned}
        aria-disabled={full || undefined}
        className={cn(
          // Above the rows' reach into the gaps around them.
          "absolute inset-y-0 z-2 my-auto flex items-center justify-center rounded-md -outline-offset-2",
          sheet ? "right-1 size-10" : "right-1 size-7",
          pinned ? "text-ink" : "text-muted",
          // At the most pinned, an unpinned one shows faint, as it can't be.
          full ? "cursor-default" : !pinned && "hover:text-ink",
          sheet
            ? full && "opacity-40"
            : [
                "opacity-0",
                full
                  ? "group-hover/row:opacity-40 group-focus-within/row:opacity-40"
                  : "group-hover/row:opacity-100 group-focus-within/row:opacity-100",
              ],
        )}
        // Kept off the button, so focus stays in the list as rows move.
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => togglePin(option.value, event.detail === 0)}
      >
        <PinIcon size={sheet ? 18 : 16} filled={pinned} />
      </button>
    );
  }

  function renderOption(option: Option) {
    const pinnable = !!pins && !!option.pinnable && pinsShown;
    const button = renderOptionButton(option, pinnable);
    if (!pinnable) return button;
    return (
      <div
        key={option.value}
        role="none"
        data-slot="choice-row"
        data-label={option.label}
        className="group/row relative flex shrink-0"
      >
        {button}
        {renderPin(option)}
      </div>
    );
  }

  function renderOptionButton(option: Option, pinnable: boolean) {
    // A narrowed parent isn't chosen itself; its open group shows the picks.
    const open = marked.has(option.value);
    const chosen = open && !narrowed(option);
    return (
      <button
        key={option.value}
        type="button"
        data-slot="choice-option"
        data-value={option.value}
        data-label={option.label}
        role="option"
        aria-selected={chosen}
        // Inline, the first option is where Tab lands; arrows do the rest.
        tabIndex={inline && option.value === primary[0]?.value ? 0 : -1}
        className={cn(
          "flex w-full shrink-0 items-center rounded-lg border border-transparent text-left -outline-offset-2",
          // Hover and focus tint at once; only colour changes ease.
          "transition-[color,border-color] duration-150 motion-reduce:transition-none",
          // Chosen reads in medium weight; hover tints every row alike.
          "focus-visible:bg-surface-muted aria-selected:font-medium",
          sheet
            ? "min-h-12! gap-3 px-3 text-body active:bg-surface-muted"
            : [
                "min-h-9 gap-2 px-2.5 py-1.5 text-ui hover:bg-surface-muted",
                reachBordered,
                option.children?.length
                  ? "[[data-slot=choice-group][data-open=true]+[data-slot=choice-group]>&]:before:-top-[5px]"
                  : reachPastGroup,
                // Over its pin, the row still reads as hovered.
                pinnable && "group-hover/row:bg-surface-muted",
              ],
          // Clear of the pin at its end.
          pinnable && (sheet ? "pr-12" : "pr-9"),
          // Grouped: an open main reads as chosen, narrowed or not.
          grouped && open && "font-medium",
        )}
        onClick={() => {
          if (props.multiple) {
            toggle(option.value);
            return;
          }
          props.onChange(option.value);
          close();
        }}
      >
        {option.dot && (
          <i className={cn("size-2 shrink-0 rounded-full", option.dot)} />
        )}
        {option.icon && (
          <span
            className="flex shrink-0 text-muted"
          >
            {option.icon}
          </span>
        )}
        <span>{option.label}</span>
        {option.count !== undefined && (
          <span className="ml-auto text-xs text-muted tabular-nums">
            {option.count}
          </span>
        )}
        {!goTo &&
          (grouped || multiple
            ? check(chosen, sheet ? 18 : 15, option.count === undefined)
            : radio(chosen, option.count === undefined))}
      </button>
    );
  }

  /**
   * A child: a row indented under its parent, right of a guide line, its
   * label in line with the parent's and its count and check too.
   */
  function renderSuboption(option: Option) {
    const chosen = marked.has(option.value);
    return (
      <button
        key={option.value}
        type="button"
        data-slot="choice-suboption"
        data-label={option.label}
        role="option"
        aria-selected={chosen}
        tabIndex={-1}
        className={cn(
          "flex w-full shrink-0 items-center rounded-lg text-left text-ink -outline-offset-2",
          "transition-[color] duration-150 motion-reduce:transition-none",
          "focus-visible:bg-surface-muted",
          "aria-selected:font-medium",
          sheet
            ? "ml-6 min-h-11 w-auto gap-3 pr-2 pl-3.25 text-ui active:bg-surface-muted"
            : [
                "ml-5.5 min-h-8 w-auto gap-2 pr-1.75 pl-2.25 text-ui hover:bg-surface-muted",
                // Across the rows' gaps, and the list's padding at its ends.
                reach,
                "before:-inset-y-px first:before:-top-0.5 last:before:-bottom-1",
              ],
        )}
        onClick={() => toggle(option.value)}
      >
        <span>{option.label}</span>
        {option.count !== undefined && (
          <span className="ml-auto text-xs font-normal text-muted tabular-nums">
            {option.count}
          </span>
        )}
        {check(chosen, sheet ? 17 : 14, option.count === undefined)}
      </button>
    );
  }

  /** An option, or a group holding its children underneath it. */
  function renderEntry(option: Option) {
    // Always a keyed fragment, a line or not first, so a row that moves
    // past the line keeps its elements.
    return (
      <Fragment key={option.value}>
        {option.divider && (
          <div
            role="separator"
            data-slot="choice-divider"
            className={cn("mx-2.5 shrink-0 border-t border-border", sheet ? "my-1.5" : "my-1")}
          />
        )}
        {renderEntryBody(option)}
      </Fragment>
    );
  }

  function renderEntryBody(option: Option) {
    const open = marked.has(option.value);
    if (!option.children?.length) return renderOption(option);
    return (
      <div
        key={option.value}
        role="group"
        aria-label={option.label}
        data-slot="choice-group"
        data-open={open}
        className="relative shrink-0"
      >
        {renderOption(option)}
        {/* Rows ease from 0fr to 1fr, so the group opens smoothly. */}
        <div
          className={cn(
            "grid transition-[grid-template-rows,opacity,visibility] duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
            open
              ? "grid-rows-[1fr] opacity-100"
              : "invisible grid-rows-[0fr] opacity-0",
          )}
          inert={!open}
        >
          <div className="min-h-0 overflow-hidden">
            <div
              className={cn(
                // A plain guide under the parent's icon.
                "relative flex flex-col gap-0.5 px-1 pt-1 pb-1",
                "before:absolute before:top-1 before:bottom-1 before:border-l-[1.5px] before:border-border",
                // Centred under the parent's icon; rows start right of it.
                sheet ? "before:left-[20.25px]" : "before:left-[18.25px]",
              )}
            >
              {option.children.map(renderSuboption)}
            </div>
          </div>
        </div>
        <GroupOutline runs={chosenRuns(option.children, marked)} />
      </div>
    );
  }

  /** Arrows, Home, End and type-ahead move between the options shown. */
  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    // Options under a closed group are out of reach.
    const items = [
      ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
        '[role="option"], [data-slot="choice-more"]',
      ),
    ].filter((item) => !item.closest("[inert]"));
    const active = document.activeElement as HTMLElement | null;
    // Across a row, to its pin and back.
    const row = active?.closest('[data-slot="choice-row"]');
    const pin = row?.querySelector<HTMLElement>('[data-slot="choice-pin"]');
    const rowOption = row?.querySelector<HTMLElement>(
      '[data-slot="choice-option"]',
    );
    if (event.key === "ArrowRight" && pin && active !== pin) {
      event.preventDefault();
      pin.focus();
      return;
    }
    if (event.key === "ArrowLeft" && rowOption && active === pin) {
      event.preventDefault();
      rowOption.focus();
      return;
    }
    const current = items.indexOf(
      (active === pin ? rowOption : active) as HTMLButtonElement,
    );
    let next = current;
    if (event.key === "ArrowDown")
      next = (current + 1) % items.length;
    else if (event.key === "ArrowUp")
      next = (current - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else if (event.key.length === 1 && event.key !== " ") {
      // Type-ahead: the next option starting with the key, wrapping around.
      const key = event.key.toLocaleLowerCase("nb");
      const starts = (item: HTMLButtonElement) =>
        (item.dataset.label ?? "")
          .toLocaleLowerCase("nb")
          .startsWith(key);
      const match = items.findIndex(
        (item, i) => i > current && starts(item),
      );
      next = match < 0 ? items.findIndex(starts) : match;
    } else return;
    event.preventDefault();
    items[next]?.focus();
  }

  const optionList = (
    <div
      ref={content}
      className={cn("flex flex-col", sheet ? "gap-0.5" : "gap-1")}
    >
      {primary.map(renderEntry)}
      {extra.length > 0 && (
        <>
          <button
            type="button"
            data-slot="choice-more"
            tabIndex={-1}
            aria-expanded={expanded}
            className={cn(
              "flex w-full shrink-0 items-center rounded-lg border border-transparent text-left text-muted -outline-offset-2",
              "hover:text-ink focus-visible:bg-surface-muted focus-visible:text-ink",
              sheet
                ? "min-h-12 gap-3 px-3 text-body active:bg-surface-muted"
                : [
                    "min-h-9 gap-2 px-2.5 py-1.5 text-ui hover:bg-surface-muted",
                    // Open, across the whole gap: the extra rows are clipped.
                    reachBordered,
                    reachPastGroup,
                    "aria-expanded:before:-bottom-[5px]",
                  ],
            )}
            onClick={() => setExpanded(!expanded)}
          >
            <ChevronDown
              size={16}
              aria-hidden="true"
              className={cn(
                "shrink-0 transition-transform duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
                expanded && "rotate-180",
              )}
            />
            <span>{expanded ? "Vis færre" : "Vis flere"}</span>
          </button>
          {/* Eases open like a group's subcategories. */}
          <div
            data-slot="choice-extra"
            className={cn(
              "grid transition-[grid-template-rows,opacity,visibility] duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
              expanded
                ? "grid-rows-[1fr] opacity-100"
                : "invisible grid-rows-[0fr] opacity-0",
            )}
            inert={!expanded}
          >
            <div className="min-h-0 overflow-hidden">
              <div
                className={cn(
                  "flex flex-col",
                  sheet ? "gap-0.5" : "gap-1",
                )}
              >
                {extra.map(renderEntry)}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );

  if (inline)
    return (
      <div
        ref={list}
        id={id}
        role="listbox"
        aria-multiselectable={multiple || undefined}
        aria-label={label}
        data-slot="choice-list"
        className={cn("flex flex-col", sheet ? "px-2" : "px-1.5", className)}
        onKeyDown={navigate}
      >
        {optionList}
      </div>
    );

  return (
    <div
      ref={root}
      data-slot="choice-select"
      className={cn("group/choice relative min-w-0 shrink-0", className)}
      onPointerDown={() => {
        pressing.current = true;
        const release = () => (pressing.current = false);
        window.addEventListener("pointerup", release, { once: true });
        window.addEventListener("pointercancel", release, { once: true });
      }}
      onBlur={(event) => {
        if (pressing.current || refocus.current) return;
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        // Escape in the sheet's own menu closes just that.
        const inMenu = (event.target as Element).closest?.(
          '[data-slot="choice-sheet-menu"]',
        );
        if (event.key === "Escape" && open && !inMenu) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        data-slot="choice-trigger"
        className={cn(
          "group/trigger flex min-h-11 w-full items-center gap-2.5 whitespace-nowrap rounded-xl border border-border bg-surface px-3.25 text-left text-ui text-ink",
          "transition-[color,border-color,background-color,box-shadow] duration-150 motion-reduce:transition-none",
          // Phones open a sheet over it, so the trigger keeps still: no
          // hover, press or open states, and no turning chevron.
          "[-webkit-tap-highlight-color:transparent]",
          "md:hover:border-border-strong md:hover:bg-surface-muted",
          "md:aria-expanded:border-border-strong",
          triggerClassName,
        )}
        aria-label={
          selectedSummary && selectedSummary !== label
            ? `${label}: ${selectedSummary}`
            : label
        }
        aria-haspopup="listbox"
        data-press=""
        data-tooltip={triggerTooltip}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          if (!open) setExpanded(extraChosen);
          setOpen(!open);
        }}
        onKeyDown={(event) => {
          if (["ArrowDown", "ArrowUp"].includes(event.key)) {
            event.preventDefault();
            if (!open) setExpanded(extraChosen);
            setOpen(true);
          }
        }}
      >
        {triggerDot ? (
          // Not a span: the triggers' classes fold their label spans.
          <i className="relative flex shrink-0 not-italic">
            {icon}
            <span
              aria-hidden="true"
              data-slot="choice-dot"
              className="absolute -top-1 -right-1 size-2 rounded-full border-[1.5px] border-surface bg-accent box-content"
            />
          </i>
        ) : (
          icon
        )}
        <span
          className="min-w-0 overflow-hidden text-ellipsis group-data-growing/choice:text-clip"
        >
          {shownLabel}
        </span>
        {multiple && selectedCount > 0 && (
          <span className="text-2xs font-semibold tabular-nums">
            {selectedCount}
          </span>
        )}
        <ChevronDown
          size={14}
          className="ml-auto shrink-0 transition-transform duration-150 motion-reduce:transition-none max-md:transition-none md:group-aria-expanded/trigger:rotate-180"
        />
      </button>
      {shield}
      {/* Anchored menu; on phones, a scrim holding a bottom sheet. */}
      <div
        ref={menu}
        popover="manual"
        data-base-ui-swipe-ignore
        data-slot="choice-menu"
        className={cn(
          "pointer-events-none invisible fixed inset-auto z-900 m-0 flex h-auto min-w-0 flex-col overflow-visible border-0 bg-transparent p-0 text-ink",
          "data-[open=true]:pointer-events-auto data-[open=true]:visible",
          sheet
            ? "justify-end overscroll-contain bg-[color-mix(in_srgb,var(--color-scrim)_calc(25%*(1-var(--sheet-progress))),transparent)] motion-safe:animate-scrim-in"
            : [
                "max-w-[calc(100vw-28px)] origin-top -translate-y-1.25 scale-[0.98] opacity-0 transition-[opacity,transform,visibility] duration-200 ease-out motion-reduce:transition-none",
                "data-[open=true]:translate-y-0 data-[open=true]:scale-100 data-[open=true]:opacity-100 data-[side=top]:origin-bottom",
              ],
        )}
        data-open={open}
        data-sheet={sheet}
        inert={!open}
        aria-hidden={!open}
        // A tap on the scrim would hand focus to the drawer behind it, after
        // the press, closing the sheet at once; its click closes it instead.
        onMouseDown={(event) => {
          if (sheet && event.target === event.currentTarget)
            event.preventDefault();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        <div
          ref={sheetPanel}
          className={cn(
            "relative flex min-h-0 flex-col",
            sheet && [
              "max-h-[40dvh] overflow-hidden rounded-t-sheet border-t border-border bg-surface shadow-bar",
              "motion-safe:animate-sheet-in",
            ],
          )}
        >
          <div
            ref={list}
            id={id}
            role="listbox"
            aria-multiselectable={multiple || undefined}
            aria-label={label}
            className={cn(
              "flex min-h-0 flex-col overflow-y-auto",
              sheet ? "overscroll-none" : "overscroll-contain",
              sheet
                ? "flex-1 gap-0.5 px-2 pb-[calc(10px+env(safe-area-inset-bottom))]"
                : "gap-1 rounded-xl border border-border bg-surface p-1.5 shadow-[0_12px_40px_rgb(20_28_24/0.14),0_2px_6px_rgb(20_28_24/0.04)]",
            )}
            onScroll={sheet ? updateFade : undefined}
            onKeyDown={navigate}
          >
            {sheet && (
              <div
                data-swipe-handle
                className="sticky top-0 z-1 -mx-2 flex shrink-0 touch-none flex-col items-center bg-surface px-4 pt-2 pb-2.5"
              >
                {/* Under the title: more above, once scrolled. */}
                <div
                  ref={topFade}
                  data-slot="choice-fade"
                  data-edge="top"
                  className="pointer-events-none absolute inset-x-0 top-full h-(--fade-height) bg-[linear-gradient(to_top,transparent,var(--color-surface))] opacity-0 [--fade-height:40px]"
                />
                <SheetGrip />
                <div className={cn(sheetTitleGap, "flex items-center self-stretch")}>
                  {/* Above the options' 15px: larger, heavier and in full ink. */}
                  <span
                    aria-hidden="true"
                    data-slot="choice-title"
                    className={cn(sheetTitle, "px-1")}
                  >
                    {label}
                  </span>
                  {pins?.phoneToggle && (
                    <PinToggle toggle={pins.phoneToggle} />
                  )}
                </div>
              </div>
            )}
            {!sheet && menuTitle && (
              <span
                aria-hidden="true"
                data-slot="choice-title"
                className="px-2.5 pt-1.5 pb-0.5 text-body leading-5 font-semibold text-ink"
              >
                {label}
              </span>
            )}
            {optionList}
          </div>
          {sheet && (
            // More below: fades out over the last stretch of scrolling. Over
            // the bottom padding it is solid, so options pass under it there.
            <div
              ref={bottomFade}
              aria-hidden="true"
              data-slot="choice-fade"
              data-edge="bottom"
              className="pointer-events-none absolute inset-x-0 bottom-0 z-2 h-[calc(var(--fade-height)+10px+env(safe-area-inset-bottom))] bg-[linear-gradient(to_bottom,transparent,var(--color-surface)_var(--fade-height))] opacity-0 [--fade-height:40px]"
            />
          )}
        </div>
      </div>
    </div>
  );
});

/** A run of neighbouring children, by index, first to last. */
type Run = readonly [number, number];

/** The chosen children, as runs of neighbours. */
function chosenRuns(children: Option[], selected: Set<string>): Run[] {
  const runs: [number, number][] = [];
  children.forEach((child, index) => {
    if (!selected.has(child.value)) return;
    const last = runs.at(-1);
    if (last && last[1] === index - 1) last[1] = index;
    else runs.push([index, index]);
  });
  return runs;
}

const overlaps = (a: Run, b: Run) => a[0] <= b[1] && b[0] <= a[1];

type Frame = Pick<CSSStyleDeclaration, "top" | "left" | "width" | "height">;

const moveMs = 250;
const fadeMs = 200;
const ease = "cubic-bezier(0.22, 1, 0.36, 1)";
const transition = [
  ...["top", "left", "width", "height"].map(
    (property) => `${property} ${moveMs}ms ${ease}`,
  ),
  `opacity ${fadeMs}ms ease-out`,
].join(", ");

/** An element's offset from an ancestor's padding edge, untouched by transforms. */
function offsetWithin(element: HTMLElement, ancestor: HTMLElement) {
  let top = 0;
  let left = 0;
  let node: HTMLElement | null = element;
  while (node && node !== ancestor) {
    top += node.offsetTop;
    left += node.offsetLeft;
    node = node.offsetParent as HTMLElement | null;
  }
  return { top, left };
}

/** Where a run's outline sits in its group. */
function frameOf(group: HTMLElement, run: Run): Frame {
  const rows = group.querySelectorAll<HTMLElement>(
    '[data-slot="choice-suboption"]',
  );
  const first = rows[run[0]];
  const last = rows[run[1]];
  const start = offsetWithin(first, group);
  const end = offsetWithin(last, group);
  return {
    top: `${start.top}px`,
    left: `${start.left}px`,
    width: `${first.offsetWidth}px`,
    height: `${end.top + last.offsetHeight - start.top}px`,
  };
}

const sameFrame = (element: HTMLElement, frame: Frame) =>
  (Object.keys(frame) as (keyof Frame)[]).every(
    (key) => element.style[key] === frame[key],
  );

/** Places an outline at once, cutting short whatever it was easing to. */
function jump(element: HTMLElement, frame: Frame, opacity = "1") {
  element.style.transition = "none";
  Object.assign(element.style, frame, { opacity });
  void element.offsetWidth;
  element.style.transition = transition;
}

/**
 * The outline around each run of chosen children in a group. Outlines glide
 * between choices: out over a neighbour, apart when a run is broken and
 * together when runs join; one around a child on its own fades in.
 */
function GroupOutline({ runs }: { runs: Run[] }) {
  const layer = useRef<HTMLDivElement>(null);
  const boxes = useRef<{ element: HTMLDivElement; run: Run }[]>([]);
  const placed = useRef(false);
  const key = runs.map((run) => run.join(":")).join(",");
  const currentRuns = useEffectEvent(() => runs);

  useLayoutEffect(() => {
    const group = layer.current?.parentElement;
    if (!layer.current || !group) return;
    const next = currentRuns();
    const animate =
      placed.current &&
      !reducedMotion() &&
      !group.closest('[data-slot="choice-menu"][data-open="false"]');
    placed.current = true;
    const old = boxes.current;
    // Where each outline is right now, mid-glide or not.
    const now = new Map(
      old.map(({ element }) => {
        const style = getComputedStyle(element);
        return [
          element,
          {
            top: style.top,
            left: style.left,
            width: style.width,
            height: style.height,
          },
        ];
      }),
    );
    const kept = new Set<HTMLDivElement>();
    boxes.current = next.map((run) => {
      const hits = old.filter((box) => overlaps(box.run, run));
      const reused = hits.find((box) => !kept.has(box.element));
      const frame = frameOf(group, run);
      if (reused) {
        kept.add(reused.element);
        if (animate) Object.assign(reused.element.style, frame);
        else jump(reused.element, frame);
        return { element: reused.element, run };
      }
      const element = document.createElement("div");
      element.style.cssText =
        "position:absolute;box-sizing:border-box;pointer-events:none;border:1px solid var(--color-border-strong);border-radius:8px";
      layer.current!.append(element);
      if (!animate) jump(element, frame);
      else {
        // Split off from the outline it was part of, or faded in.
        const from = hits[0] && now.get(hits[0].element);
        jump(element, from ?? frame, from ? "1" : "0");
        Object.assign(element.style, frame, { opacity: "1" });
      }
      return { element, run };
    });
    for (const box of old) {
      if (kept.has(box.element)) continue;
      if (!animate) {
        box.element.remove();
        continue;
      }
      // Joining a run: glide into it, then give way to the one that stays.
      const into = next.find((run) => overlaps(box.run, run));
      if (into) Object.assign(box.element.style, frameOf(group, into));
      else box.element.style.opacity = "0";
      setTimeout(() => box.element.remove(), into ? moveMs : fadeMs);
    }
  }, [key]);

  // Rows change size with the layout (a sheet on phones); keep up at once.
  useLayoutEffect(() => {
    const group = layer.current?.parentElement;
    if (!group) return;
    const observer = new ResizeObserver(() => {
      for (const { element, run } of boxes.current) {
        const frame = frameOf(group, run);
        if (!sameFrame(element, frame)) jump(element, frame);
      }
    });
    observer.observe(group);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={layer}
      aria-hidden="true"
      data-slot="choice-outline"
      className="pointer-events-none absolute inset-0"
    />
  );
}

/**
 * A pushpin, upright and symmetrical: a straight body flaring to its
 * foot and a needle. Filled, it marks what's pinned.
 */
function PinIcon({ size, filled }: { size: number; filled: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        d="M9 3.5h6V10l2.5 3.5h-11L9 10z"
        fill={filled ? "currentColor" : "none"}
      />
      <path d="M12 13.5V21" />
    </svg>
  );
}

/**
 * The phone sheet's switch for pinning, beside its title, named for what
 * it does: "Fest" shows the pins beside the options, "Ferdig" hides them.
 */
function PinToggle({
  toggle,
}: {
  toggle: { label: string; on: boolean; onChange: (on: boolean) => void };
}) {
  return (
    <button
      type="button"
      className="-my-2.5 -mr-2 ml-auto inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-3 text-ui font-medium text-muted active:bg-ink/[0.05] aria-pressed:text-ink"
      aria-label={toggle.label}
      aria-pressed={toggle.on}
      data-pin-toggle=""
      onClick={() => toggle.onChange(!toggle.on)}
    >
      {toggle.on ? (
        "Ferdig"
      ) : (
        <>
          <PinIcon size={16} filled={false} />
          Fest
        </>
      )}
    </button>
  );
}
