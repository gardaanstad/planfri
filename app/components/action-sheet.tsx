"use client";
import {
  createContext,
  use,
  useLayoutEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { ChevronRight, LogIn } from "lucide-react";
import { Radio } from "./choice-mark";
import { cn } from "../lib/cn";
import { reducedMotion, sheetLeave } from "../lib/media";
import { useBackgroundPush } from "../lib/background-push";
import { keyboardFocused } from "../lib/ui";
import { useSwipeDismiss } from "./use-swipe-dismiss";

/** Whether a sheet's trigger was reached by keyboard rather than a tap. */
export const openedByKeyboard = (trigger: Element | null) =>
  trigger instanceof HTMLElement && keyboardFocused(trigger);

export type SheetAction = {
  id: string;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  /** Greyed out for guests; choosing it asks them to log in. */
  locked?: boolean;
  pressed?: boolean;
  /** One choice of several, such as a map layer: a radio on the right. */
  selected?: boolean;
  /** Destructive, such as deleting: in the danger colour. */
  danger?: boolean;
  /** Leaving, such as logging out: a danger wash only when pressed. */
  dangerPress?: boolean;
  /** Opens a page: a chevron after the label. */
  opens?: boolean;
  /** A switch: on or off, shown on the right. */
  checked?: boolean;
  /** A second line under the label. */
  detail?: string;
  /** On the right, such as a count. */
  trailing?: ReactNode;
  /** Starts a new group, divided from the actions above. */
  divided?: boolean;
  /** A square icon button beside the row, for a related action. */
  aside?: { id: string; label: string; icon: ReactNode; onSelect: () => void };
};

/**
 * The handle at the top of every sheet and drawer from a phone's bottom
 * edge. It darkens under a pointer over its strip (`group/handle`).
 */
export function SheetGrip() {
  return (
    <span
      aria-hidden="true"
      className="h-1 w-9 shrink-0 rounded-full bg-ink/15 transition-colors group-hover/handle:bg-ink/25 motion-reduce:transition-none"
    />
  );
}

/** A drawer's title, under its grip: what is being chosen or acted on. */
export const sheetTitle = "text-heading text-ink";
/**
 * From the grip down to a drawer's title: its capitals stand as far below
 * the drawer's top edge as they are in from its side.
 */
export const sheetTitleGap = "mt-0.5";

/** The track and knob of an on/off switch, for a row that is one. */
export function SwitchTrack({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        "flex h-5 w-8.5 shrink-0 items-center rounded-full p-0.5 transition-colors duration-150 motion-reduce:transition-none",
        on ? "bg-accent" : "bg-border-strong",
      )}
      aria-hidden="true"
    >
      <span
        className={cn(
          "size-4 rounded-full bg-surface shadow-xs transition-transform duration-150 motion-reduce:transition-none",
          on && "translate-x-3.5",
        )}
      />
    </span>
  );
}

const SheetCloseContext = createContext<(then?: () => void) => void>((then) =>
  then?.(),
);

/** Closes the `BottomSheet` this is in, then runs `then`. */
export function useSheetClose() {
  return use(SheetCloseContext);
}

/**
 * Phones: a modal sheet along the bottom edge, named by `label` for screen
 * readers, like the filter menus and the login prompt. It swipes down to
 * close; inside it, `useSheetClose` slides it away first and then runs what
 * it is given, so focus is back on the trigger by then.
 */
export function BottomSheet({
  label,
  title,
  scroller,
  className,
  children,
  onClose,
}: {
  label: string;
  /** Shown under the grip. */
  title?: ReactNode;
  /** Its scrolling content; a swipe in it waits until it is at its top. */
  scroller: RefObject<HTMLElement | null>;
  className?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const trigger = useRef<Element | null>(null);
  const closing = useRef(false);
  const releasePush = useBackgroundPush(true);

  useLayoutEffect(() => {
    const dialog = ref.current;
    trigger.current = document.activeElement;
    dialog?.showModal();
    // From the keyboard, focus goes to the first action; from a tap, to the
    // sheet itself, so no action looks chosen before one is.
    if (openedByKeyboard(trigger.current))
      dialog?.querySelector<HTMLElement>("[data-sheet-action]")?.focus();
    else dialog?.focus();
    return () => dialog?.close();
  }, []);

  // Swiped down, like the drawers; it has already slid away by then.
  useSwipeDismiss({
    enabled: true,
    sheet,
    scroller,
    onDismiss: () => close(undefined, false),
  });

  function close(then?: () => void, animate = true) {
    const dialog = ref.current;
    const panel = sheet.current;
    if (closing.current) return;
    closing.current = true;
    releasePush();
    const done = () => {
      dialog?.close();
      const target = trigger.current;
      if (target instanceof HTMLElement && target.isConnected)
        target.focus({ preventScroll: true });
      onClose();
      then?.();
    };
    if (!dialog || !panel || !animate || reducedMotion()) return done();
    const out = panel.animate(
      [{ transform: "none" }, { transform: "translateY(100%)" }],
      sheetLeave,
    );
    dialog.animate([{ opacity: 1 }, { opacity: 0 }], {
      ...sheetLeave,
      pseudoElement: "::backdrop",
    });
    out.finished.then(done, done);
  }

  return (
    <dialog
      ref={ref}
      aria-label={label}
      data-action-sheet=""
      // Its swipes are its own, not those of a drawer it opened from.
      data-base-ui-swipe-ignore=""
      tabIndex={-1}
      className={cn(
        "m-auto mb-0 w-full max-w-none overflow-visible border-0 bg-transparent p-0 text-ink outline-none",
        "backdrop:bg-scrim/25 motion-safe:backdrop:animate-backdrop-in",
      )}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={sheet}
        className={cn(
          "flex flex-col rounded-t-sheet border-t border-border bg-surface px-2 pb-[calc(10px+env(safe-area-inset-bottom))] shadow-bar motion-safe:animate-sheet-in",
          className,
        )}
      >
        <div className="flex shrink-0 flex-col items-center px-1 pt-2 pb-3">
          <SheetGrip />
          {title && (
            <h2 className={cn(sheetTitle, sheetTitleGap, "self-start px-2")}>{title}</h2>
          )}
        </div>
        <SheetCloseContext value={close}>{children}</SheetCloseContext>
      </div>
    </dialog>
  );
}

/** Phones: a modal list of actions in a `BottomSheet`. */
export default function ActionSheet({
  label,
  title,
  actions,
  onClose,
}: {
  label: string;
  /** Shown above the actions, as the filter sheets name theirs. */
  title?: string;
  actions: SheetAction[];
  onClose: () => void;
}) {
  const list = useRef<HTMLUListElement>(null);
  return (
    <BottomSheet label={label} title={title} scroller={list} onClose={onClose}>
      <SheetActions actions={actions} list={list} />
    </BottomSheet>
  );
}

function SheetActions({
  actions,
  list,
}: {
  actions: SheetAction[];
  list: RefObject<HTMLUListElement | null>;
}) {
  const close = useSheetClose();
  return (
    <ul ref={list} className="flex flex-col gap-0.5">
      {actions.map((action) => (
        <li
          key={action.id}
          className={cn(
            action.aside && "flex items-center gap-1",
            action.divided && "mt-1.5 border-t border-border pt-1.5",
          )}
        >
          <button
            type="button"
            data-sheet-action={action.id}
            data-locked={action.locked || undefined}
            aria-label={
              action.locked ? `${action.label}, krever innlogging` : undefined
            }
            aria-pressed={action.pressed ?? action.selected}
            role={action.checked !== undefined ? "switch" : undefined}
            aria-checked={action.checked}
            className={cn(
              "flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-body -outline-offset-2",
              "transition-colors duration-150 active:bg-surface-muted motion-reduce:transition-none",
              "[&>svg]:shrink-0 [&>svg]:text-muted",
              action.locked && "text-muted [&>svg]:text-muted/60",
              action.danger && "text-danger [&>svg]:text-danger",
              action.dangerPress &&
                "active:bg-danger-soft active:text-danger active:[&>svg]:text-danger",
              action.selected && "font-medium",
            )}
            onClick={() => close(action.onSelect)}
          >
            {action.icon}
            <span className="flex min-w-0 flex-1 flex-col">
              {action.opens ? (
                <span className="flex items-center gap-1">
                  {action.label}
                  <ChevronRight size={16} className="text-muted" aria-hidden="true" />
                </span>
              ) : (
                action.label
              )}
              {action.detail && (
                <span className="text-xs text-muted">{action.detail}</span>
              )}
            </span>
            {action.trailing}
            {action.checked !== undefined && (
              <SwitchTrack on={action.checked} />
            )}
            {action.selected !== undefined && (
              <Radio chosen={action.selected} large />
            )}
            {action.locked && <LogIn size={16} aria-hidden="true" />}
          </button>
          {action.aside && (
            <button
              type="button"
              data-sheet-action={action.aside.id}
              aria-label={action.aside.label}
              className={cn(
                "flex size-12 shrink-0 items-center justify-center rounded-lg text-muted -outline-offset-2",
                "transition-colors duration-150 active:bg-surface-muted motion-reduce:transition-none",
              )}
              onClick={() => close(action.aside!.onSelect)}
            >
              {action.aside.icon}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
