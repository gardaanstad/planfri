"use client";

import {
  createContext,
  use,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { ArrowLeft, X } from "lucide-react";
import { cn } from "../lib/cn";
import { iconButton, panelTitle, panelTitleTop } from "../lib/ui";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerVirtualKeyboardProvider,
  sheetShadowClasses,
  type DrawerMotion,
  type DrawerSnapPoint,
} from "./drawer";
import {
  controlButton,
  MaximizeButton,
  SidebarPanel,
  usePanelEscape,
} from "./sidebar-panel";

/**
 * Panels are pages over the explorer: a project, a profile, Lagret, Forslag.
 * Their content is written once. On desktop each is a layer in the sidebar
 * stack (`SidebarPanel`); on phones each is a drawer of its own, stacked
 * over the explorer's drawer, which stays where it was (`PanelDrawer`).
 */

export const mobileDrawerClasses = [
  // Their shadow is cast by the layer they render into; see `SheetLayer`.
  "z-[800] rounded-t-sheet border-t border-border bg-surface text-ink",
  "[--drawer-content-height:100dvh] [--drawer-bleed-background:var(--color-surface)]",
  "motion-reduce:transition-none motion-reduce:[&_*]:transition-none motion-reduce:[&_*]:animate-none",
].join(" ");
// Panels sit a little lower than the explorer, so it shows behind them.
export const panelDrawerClasses = cn(
  mobileDrawerClasses,
  "[--drawer-content-max-height:calc(100dvh_-_22px_-_env(safe-area-inset-top))]!",
);
/** Holds a drawer's `ScrollFade` to the screen's bottom edge. */
export const visibleBottomClasses =
  "[--drawer-visible-bottom:calc(var(--drawer-snap-point-offset)+var(--drawer-swipe-movement-y))]";
export const panelDrawerInnerClasses =
  "flex min-h-0 flex-1 flex-col overflow-hidden pb-[env(safe-area-inset-bottom)]";

export function DrawerGrip() {
  return (
    <span className="h-[3px] w-[34px] rounded bg-border-strong transition-colors group-hover/handle:bg-muted/60 motion-reduce:transition-none" />
  );
}

const gripBar = (
  <div
    aria-hidden="true"
    className="flex h-5 w-full shrink-0 touch-none cursor-grab items-center justify-center active:cursor-grabbing"
  >
    <DrawerGrip />
  </div>
);

/**
 * Below its full height, a drawer runs past the screen's bottom edge; a fade
 * along that edge says there is more of it. It sits on the popup, held to
 * the screen edge against the drawer's offset and drag. Base UI's variables
 * don't inherit, so the popup copies them into one that does.
 */
export function ScrollFade({ shown }: { shown: boolean }) {
  return (
    <div
      data-scroll-fade={shown ? "" : undefined}
      className={cn(
        "pointer-events-none absolute inset-x-0 z-10 h-16 bg-linear-to-t from-surface to-transparent",
        "bottom-(--drawer-visible-bottom)",
        "transition-opacity duration-300 ease-out motion-reduce:transition-none",
        shown ? "opacity-100" : "opacity-0",
      )}
    />
  );
}

// Each panel drawer stacks above the one before it.
/**
 * Takes the panel's drawer to its full height when it rests lower, so
 * content that grows on request, like a project's "Les mer", has room.
 */
const PanelExpandContext = createContext<(() => void) | null>(null);

export function usePanelExpand() {
  return use(PanelExpandContext);
}

const stackLayers = ["z-[51]", "z-[52]", "z-[53]", "z-[54]", "z-[55]", "z-[56]"];

/** Phones: a panel's drawer. It keeps its content while it slides away. */
export function PanelDrawer({
  name,
  title,
  open,
  active,
  index,
  ready,
  onReady,
  onDismiss,
  onOpened,
  onClosed,
  onEnter,
  snap,
  edge,
  onMotion,
  children,
}: {
  name: string;
  /** For screen readers; the panel shows its own heading. */
  title: string;
  open: boolean;
  /** On top of the stack; those under it are inert. */
  active: boolean;
  /** Its place in the stack, from the bottom. */
  index: number;
  /** Whether the content renders; until then a static copy stands in. */
  ready: boolean;
  onReady: () => void;
  /** Swiped down. */
  onDismiss: () => void;
  onOpened?: () => void;
  onClosed: () => void;
  /**
   * The render it is let go to slide up in, or stands in place in. Base UI
   * starts the slide a few frames on, about as long as another drawer takes
   * to start moving when told to in it.
   */
  onEnter?: () => void;
  /**
   * Heights it rests at, as on the explorer's drawer; without them it opens
   * at full height. Below the full height, a swipe on the content moves the
   * drawer instead of scrolling it, unless the content is scrolled already.
   */
  snap?: {
    points: DrawerSnapPoint[];
    point: DrawerSnapPoint;
    onChange: (point: DrawerSnapPoint) => void;
  };
  /** Rides the drawer's top edge; see `DrawerContent`. */
  edge?: ReactNode;
  onMotion?: (motion: DrawerMotion) => void;
  children: ReactNode;
}) {
  // Mounted open, Base UI shows a drawer in place. One opened after the page
  // has loaded mounts closed and opens on the next frame, so it slides up;
  // one the page was opened on stands where its static copy was.
  const [entered, setEntered] = useState(!ready);
  useEffect(() => {
    if (entered) return;
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, [entered]);
  const enter = useEffectEvent(() => onEnter?.());
  useLayoutEffect(() => {
    if (open && entered) enter();
  }, [open, entered]);
  return (
    <Drawer
      open={open && entered}
      modal={false}
      disablePointerDismissal
      snapPoints={snap?.points}
      snapToSequentialPoints={snap ? true : undefined}
      snapPoint={snap?.point}
      onSnapPointChange={(point) => {
        // Below the lowest point it closes, through onOpenChange.
        if (point !== null) snap?.onChange(point);
      }}
      onOpenChange={(next, details) => {
        if (next) return;
        // Escape belongs to the panel on top (see `Panel`).
        if (details.reason === "escape-key") return details.cancel();
        onDismiss();
      }}
      onOpenChangeComplete={(next) => (next ? onOpened?.() : onClosed())}
    >
      <DrawerVirtualKeyboardProvider>
        <DrawerContent
          ref={(node) => {
            if (node) onReady();
          }}
          data-panel-drawer={name}
          data-project-drawer={name === "project" ? "" : undefined}
          data-snap={snap && snap.point !== 1 ? "partial" : undefined}
          floating={snap ? snap.point !== 1 : undefined}
          className={cn(
            panelDrawerClasses,
            snap && visibleBottomClasses,
            snap &&
              snap.point !== 1 &&
              "[&_[data-drawer-scroll]:not([data-scrolled])]:overflow-y-hidden",
          )}
          onWheel={(event) => {
            if (
              !snap ||
              snap.point === 1 ||
              event.ctrlKey ||
              event.deltaY <= 4 ||
              Math.abs(event.deltaX) > Math.abs(event.deltaY) ||
              (event.target instanceof Element &&
                event.target.closest("[popover], dialog"))
            )
              return;
            snap.onChange(1);
          }}
          viewportClassName={stackLayers[Math.min(index, stackLayers.length - 1)]}
          contentClassName={panelDrawerInnerClasses}
          initialFocus={false}
          finalFocus={false}
          handle={gripBar}
          edge={
            <>
              {edge}
              {snap && <ScrollFade shown={snap.point !== 1} />}
            </>
          }
          onMotion={onMotion}
        >
          <DrawerTitle className="sr-only">{title}</DrawerTitle>
          {ready && (
            <div className="contents" inert={!active}>
              <PanelExpandContext
                value={
                  snap && snap.point !== 1 ? () => snap.onChange(1) : null
                }
              >
                {children}
              </PanelExpandContext>
            </div>
          )}
        </DrawerContent>
      </DrawerVirtualKeyboardProvider>
    </Drawer>
  );
}

/**
 * Before the drawers mount in the browser, a static copy of the panel on
 * top stands where its drawer will be, so a page opened on a panel shows it
 * from the first paint.
 */
export function PanelShell({ children }: { children: ReactNode }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        panelDrawerClasses,
        sheetShadowClasses,
        "fixed inset-x-0 bottom-0 z-[900] flex h-[calc(100dvh-22px-env(safe-area-inset-top))] flex-col",
      )}
    >
      {gripBar}
      <div data-slot="drawer-content" className={panelDrawerInnerClasses}>
        {children}
      </div>
    </div>
  );
}

const mobileControl = cn(iconButton, "rounded-lg");

type PanelFrame = {
  mobile: boolean;
  maximized: boolean;
  onToggleMaximized: () => void;
  onClose: () => void;
  onBack?: () => void;
  closeLabel: string;
  /** The content has scrolled under the header. */
  scrolled: boolean;
};
const PanelFrameContext = createContext<PanelFrame | null>(null);

/**
 * The header of a panel whose content names itself (Lagret, Forslag, a new
 * project): back, the title, and the panel's controls on one row, laid out
 * like a project's header. Render it above the content's scroller.
 */
export function PanelHeader({
  title,
  id,
  icon,
  actions,
}: {
  title: ReactNode;
  /** Before the title, such as a profile's avatar. */
  icon?: ReactNode;
  /** The heading's id, for `aria-labelledby`. */
  id?: string;
  /** Before the panel's own controls, such as a sort menu. */
  actions?: ReactNode;
}) {
  const frame = use(PanelFrameContext);
  if (!frame) throw new Error("PanelHeader must be used within a Panel.");
  const { mobile, maximized, onToggleMaximized, onClose, onBack, closeLabel } =
    frame;
  const control = mobile
    ? cn(mobileControl, "size-10 active:scale-100")
    : controlButton;
  return (
    <header
      className={cn(
        "z-20 flex shrink-0 items-start gap-2 border-b bg-surface",
        "transition-[border-color] duration-200 motion-reduce:transition-none",
        frame.scrolled ? "border-border" : "border-transparent",
        mobile ? "px-4.5 pt-0 pb-1" : "pt-2.5 pr-3 pb-1 pl-6",
      )}
      data-panel-header=""
    >
      {onBack && (
        <button
          type="button"
          // The arrow's glyph, not its hit area, on the content's edge.
          className={cn(control, "-mr-1.5 text-muted", mobile ? "-ml-2.5" : "-ml-3")}
          onClick={onBack}
          aria-label="Tilbake"
          data-tooltip={mobile ? undefined : "Tilbake"}
        >
          <ArrowLeft size={mobile ? 20 : 19} />
        </button>
      )}
      <div
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2.5",
          mobile ? panelTitleTop.mobile : panelTitleTop.desktop,
        )}
      >
        {icon}
        <h1
          id={id}
          className={cn("m-0 min-w-0 truncate text-ink", panelTitle)}
        >
          {title}
        </h1>
      </div>
      {/* The close glyph sits a little inside the content edge, clear of the corner. */}
      <div
        className={cn(
          "flex shrink-0 items-center",
          mobile ? "-mr-3" : "gap-0.5",
        )}
      >
        {actions && (
          <div className={cn("flex items-center", mobile ? "mr-1" : "mr-1.5")}>
            {actions}
          </div>
        )}
        {!mobile && (
          <MaximizeButton maximized={maximized} onToggle={onToggleMaximized} />
        )}
        <button
          type="button"
          className={control}
          onClick={onClose}
          aria-label={closeLabel}
          data-sidebar-close=""
        >
          <X size={20} />
        </button>
      </div>
    </header>
  );
}

/** A button among a `PanelHeader`'s actions, sized like its controls. */
export function PanelHeaderButton({
  className,
  ...props
}: ComponentProps<"button">) {
  const frame = use(PanelFrameContext);
  return (
    <button
      type="button"
      className={cn(
        frame?.mobile
          ? cn(mobileControl, "size-10 active:scale-100")
          : controlButton,
        className,
      )}
      {...props}
    />
  );
}

/**
 * A panel's frame: back and close over its scrolling content, plus the
 * sidebar's mode control on desktop. Escape closes the panel on top.
 */
export function Panel({
  mobile,
  name,
  active,
  maximized,
  onToggleMaximized,
  onClose,
  onBack,
  closeLabel = "Lukk",
  titled = false,
  children,
}: {
  mobile: boolean;
  /** Names the panel for tests and styling (`data-sidebar-panel`). */
  name: string;
  /** The top of the stack: the one Escape acts on. */
  active: boolean;
  maximized: boolean;
  onToggleMaximized: () => void;
  onClose: () => void;
  /** Back to the panel this one was opened from. */
  onBack?: () => void;
  closeLabel?: string;
  /**
   * The content renders a `PanelHeader`, which carries the controls beside
   * its title, instead of a bar of controls above it.
   */
  titled?: boolean;
  children: ReactNode;
}) {
  // Escape steps down from a maximized panel before closing it.
  usePanelEscape(
    active,
    maximized && !mobile ? onToggleMaximized : onClose,
  );
  const [scrolled, setScrolled] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = body.current;
    if (!titled || !root) return;
    // Scroll doesn't bubble, but it does pass ancestors on the way down.
    // Only the content's own scroller counts, not menus inside it.
    const onScroll = (event: Event) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.hasAttribute("data-drawer-scroll"))
        setScrolled(target.scrollTop > 0);
    };
    root.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () =>
      root.removeEventListener("scroll", onScroll, { capture: true });
  }, [titled]);
  const frame: PanelFrame = {
    mobile,
    maximized,
    onToggleMaximized,
    onClose,
    onBack,
    closeLabel,
    scrolled,
  };
  if (titled) {
    const content = (
      <PanelFrameContext value={frame}>
        <div
          ref={body}
          className="flex min-h-0 flex-1 flex-col"
          data-panel-body=""
        >
          {children}
        </div>
      </PanelFrameContext>
    );
    if (!mobile)
      return (
        <SidebarPanel
          name={name}
          maximized={maximized}
          onToggleMaximized={onToggleMaximized}
          onClose={onClose}
          bar={false}
        >
          {content}
        </SidebarPanel>
      );
    return (
      <div
        className="flex h-full min-h-0 flex-1 flex-col bg-surface"
        data-sidebar-panel={name}
      >
        {content}
      </div>
    );
  }
  if (!mobile)
    return (
      <SidebarPanel
        name={name}
        maximized={maximized}
        onToggleMaximized={onToggleMaximized}
        onClose={onClose}
        onBack={onBack}
        closeLabel={closeLabel}
      >
        {children}
      </SidebarPanel>
    );
  return (
    <div
      className="flex h-full min-h-0 flex-1 flex-col bg-surface"
      data-sidebar-panel={name}
    >
      <div className="-mt-1 flex h-11 shrink-0 items-center px-1.5">
        {onBack && (
          <button
            type="button"
            className={cn(mobileControl, "text-muted")}
            onClick={onBack}
            aria-label="Tilbake"
          >
            <ArrowLeft size={20} />
          </button>
        )}
        <button
          type="button"
          className={cn(mobileControl, "ml-auto")}
          onClick={onClose}
          aria-label={closeLabel}
          data-sidebar-close=""
        >
          <X size={20} />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
