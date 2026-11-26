import { cn } from "./cn";

export const controlBase = [
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4",
  "text-sm font-medium transition-[color,border-color,background-color,box-shadow,opacity,transform] duration-150",
  "disabled:pointer-events-none disabled:opacity-45",
  "active:translate-y-px motion-reduce:transition-none motion-reduce:active:translate-y-0",
].join(" ");

/**
 * An outlined pill with a label: a project's actions. Beside the filter
 * pills, so the same height and type.
 */
export const pillButton = [
  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border-strong px-3.5 text-ui font-medium text-ink",
  "transition-[color,background-color,border-color,transform] duration-150 hover:bg-surface-muted motion-reduce:transition-none",
  "[&>svg]:shrink-0",
].join(" ");

/**
 * The sort menu at the end of a count row (projects, comments, saved):
 * muted text, its chevron on the content's edge.
 */
export const sortChoice = [
  "-mr-2 w-auto shrink-0",
  "[&_[data-slot=choice-trigger]]:min-h-9 [&_[data-slot=choice-trigger]]:gap-1.5 [&_[data-slot=choice-trigger]]:border-transparent [&_[data-slot=choice-trigger]]:bg-transparent! [&_[data-slot=choice-trigger]]:px-2 [&_[data-slot=choice-trigger]]:text-ui [&_[data-slot=choice-trigger]]:text-muted",
  "md:[&_[data-slot=choice-trigger]]:hover:bg-ink/[0.05]! md:[&_[data-slot=choice-trigger]]:hover:text-ink",
  // Hover tints and colours at once.
  "[&_[data-slot=choice-trigger]]:transition-none",
  "[&_[data-slot=choice-menu]]:right-0 [&_[data-slot=choice-menu]]:left-auto [&_[data-slot=choice-menu]]:min-w-[205px] [&_[data-slot=choice-menu][data-open=false]]:hidden",
].join(" ");

/**
 * A phone's sheets and drawers of controls: a long press there means the
 * row, not its words, so they don't select. Fields still do.
 */
export const unselectable =
  "select-none [&_:is(input,textarea,[contenteditable=true])]:select-text";

/**
 * A desktop dropdown (Base UI `Menu.Popup`): actions or settings. Menus
 * with long rows or switches widen it with `min-w-60`.
 */
export const menuPopup =
  "min-w-52 rounded-xl border border-border bg-surface p-1.5 text-ui shadow-popover outline-none motion-safe:animate-menu-enter";

/** A row in `menuPopup`: the same wash for hover and the keyboard. */
export const menuItem = cn(
  "flex min-h-9 items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-ink outline-none select-none",
  "pointer-fine:data-highlighted:bg-surface-muted focus-visible:bg-surface-muted pointer-coarse:min-h-11",
  "[&>svg:first-child]:shrink-0 [&>svg:first-child]:text-muted",
);

/** Destructive, in a menu or on its own: the row and its icon in danger. */
export const menuItemDanger = "text-danger [&>svg:first-child]:text-danger";

/** Destructive only on second look: a danger wash under the pointer. */
export const menuItemDangerHover =
  "pointer-fine:data-highlighted:bg-danger-soft pointer-fine:data-highlighted:text-danger pointer-fine:data-highlighted:[&>svg:first-child]:text-danger";

/**
 * A hairline between groups in `menuPopup`, out to its edges. A border
 * rather than a 1px fill, since browsers snap a border to whole device
 * pixels: a fill on a fractional scale (125%) smears over two.
 */
export const menuSeparator = "-mx-1.5 my-1.5 h-0 border-t border-border";

/** A count on an accent pill, such as unseen suggestions. */
export const countBadge =
  "inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-accent px-1.25 text-2xs leading-none font-semibold text-on-accent tabular-nums";

export const primaryButton = [
  controlBase,
  "border border-accent bg-accent text-on-accent shadow-xs",
  "hover:border-accent-strong hover:bg-accent-strong",
].join(" ");

export const secondaryButton = [
  controlBase,
  "border border-border-strong bg-transparent text-ink",
  "hover:bg-surface-muted",
].join(" ");

/** The rounded comment and update composer; its border carries focus. */
export const composer = cn(
  "flex items-end gap-1.5 rounded-[20px] border border-border-strong bg-surface p-1",
  "transition-[border-color,box-shadow] duration-150 motion-reduce:transition-none",
  "focus-within:border-ink/35 focus-within:shadow-[0_1px_2px_rgb(20_28_24/0.06)]",
);

/** A borderless field inside the composer; 16px on mobile so iOS won't zoom. */
export const composerField = cn(
  "min-h-8 min-w-0 flex-1 py-1.25 pr-1 pl-3 text-sm leading-normal outline-none",
  "placeholder:text-muted max-md:text-base",
);

/** Round send button at the end of a comment or update composer. */
export const composerSend = cn(
  primaryButton,
  "size-8 min-h-0 shrink-0 rounded-full p-0 shadow-none",
  "disabled:border-transparent disabled:bg-ink/[0.08] disabled:text-muted disabled:opacity-100",
);

export const dangerButton = [
  controlBase,
  "border border-danger bg-danger text-on-danger shadow-xs",
  "hover:border-danger-strong hover:bg-danger-strong",
].join(" ");

/** A destructive action that asks before it acts: outlined, not filled. */
export const dangerOutlineButton = [
  controlBase,
  "border border-danger/35 bg-transparent text-danger",
  "hover:border-danger/60 hover:bg-danger-soft hover:text-danger-strong",
].join(" ");

export const textButton = [
  controlBase,
  "min-h-10 rounded-lg border border-transparent px-2 text-accent",
  "hover:text-accent-strong hover:underline hover:underline-offset-4",
].join(" ");

/** Inline link text: a faint underline that darkens on hover. */
export const textLink =
  "underline decoration-ink/35 underline-offset-3 transition-[text-decoration-color] duration-150 hover:decoration-current motion-reduce:transition-none";

export const accountView =
  "motion-safe:animate-preview-in";

/** A square control over the map: zoom, layers, modes. */
export const mapIconButton = [
  "inline-flex size-11 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-ink shadow-control",
  "transition-[color,background-color,opacity,transform] duration-150",
  "hover:bg-surface-muted hover:text-ink aria-pressed:bg-surface-muted aria-pressed:text-ink",
  "disabled:pointer-events-none disabled:opacity-45 active:scale-[0.97]",
  "motion-reduce:transition-none motion-reduce:active:scale-100",
].join(" ");

export const iconButton = [
  "inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-transparent text-muted",
  "transition-[color,background-color,opacity,transform] duration-150",
  "hover:bg-ink/[0.05] hover:text-ink",
  "aria-pressed:text-accent",
  "disabled:pointer-events-none disabled:opacity-45 active:scale-[0.97]",
  "motion-reduce:transition-none motion-reduce:active:scale-100",
].join(" ");

export const fieldControl = [
  "min-h-11 w-full rounded-xl border border-border-strong bg-surface px-3 text-base text-ink outline-none",
  "placeholder:text-muted/80",
  "focus:border-accent/55 focus:ring-3 focus:ring-accent/12",
  "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted disabled:opacity-70",
].join(" ");

export const avatarTone = {
  sage: "bg-avatar-sage text-avatar-sage-ink",
  clay: "bg-avatar-clay text-avatar-clay-ink",
  blue: "bg-avatar-blue text-avatar-blue-ink",
} as const;

export const statusTone = {
  proposed: {
    dot: "bg-status-proposed",
    fill: "fill-status-proposed",
    ring: "ring-status-proposed/25",
    badge: "border-status-proposed/30 text-status-proposed-ink",
  },
  planned: {
    dot: "bg-status-planned",
    fill: "fill-status-planned",
    ring: "ring-status-planned/20",
    badge: "border-status-planned/25 text-status-planned-ink",
  },
  construction: {
    dot: "bg-status-construction",
    fill: "fill-status-construction",
    ring: "ring-status-construction/20",
    badge: "border-status-construction/30 text-status-construction-ink",
  },
  completed: {
    dot: "bg-status-completed",
    fill: "fill-status-completed",
    ring: "ring-status-completed/20",
    badge: "border-status-completed/25 text-status-completed-ink",
  },
} as const;

/**
 * A panel's title (a project, Lagret, Forslag): the largest type in the
 * sidebar, set beside the panel's controls.
 */
export const panelTitle = "text-display max-md:text-[1.5rem]";

/**
 * A title that may run to several lines: breaks between words, never
 * clipped; hyphenates only long compounds ("Jernbaneutbyggingen"), and breaks
 * a word too long for its line anywhere, as a last resort. `anywhere` rather
 * than `break-word`, so such a word also narrows the box it sits in (a
 * button, a flex item) instead of pushing it wider. Pair it with
 * `text-balance` or `text-pretty`, and a line clamp where the room is fixed.
 */
export const wrapTitle =
  "wrap-anywhere hyphens-auto [hyphenate-limit-chars:10_4_4]";

/**
 * How far a panel title's line sits below the top of its controls. On
 * desktop its capitals start as far below the panel's top as its first
 * letter is in from the side, within the 44px buttons' height; on phones,
 * under the grip, the line is centred on the 40px buttons.
 */
export const panelTitleTop = { desktop: "pt-2.5", mobile: "pt-1.5" };

/**
 * The room below a panel title's line that the buttons beside it leave on
 * one line, kept when the title wraps past them.
 */
export const panelTitleBottom = { desktop: "mb-1", mobile: "mb-1.5" };

/**
 * Whether an element's focus came from the keyboard: visible to the browser,
 * and not just after a press (`data-pointer`, see layout.tsx).
 */
export const keyboardFocused = (element: Element | null) =>
  !!element?.matches(":focus-visible:not(:root[data-pointer] *)");
