"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer";

import { cn } from "@/app/lib/cn";

type DrawerSnapPoint = DrawerPrimitive.Root.SnapPoint;

type DrawerContextProps = {
  hasSnapPoints: boolean;
  modal: DrawerPrimitive.Root.Props["modal"];
  showSwipeHandle: boolean;
  swipeDirection: NonNullable<DrawerPrimitive.Root.Props["swipeDirection"]>;
};

const DrawerContext = React.createContext<DrawerContextProps | null>(null);

/** Where a drawer is, read from the variables Base UI moves it with. */
type DrawerMotion = {
  /** Pixels of the popup that show above the screen's bottom edge. */
  visible: number;
  /** True while a finger or pointer drags it; otherwise it eases to a stop. */
  swiping: boolean;
};

/**
 * The sheets' shadow, on each sheet. A box shadow is drawn once with the
 * sheet and moves with it; a drop shadow on the layer holding them all was
 * blurred anew on every frame the map moved under it, halving the frame
 * rate of a pan on phones. It falls above the sheet as the drop shadow did,
 * but drawn in from the sides by its spread, so it fades out before the clip
 * that gives a floating sheet its gap would cut it off.
 */
const sheetShadowClasses =
  "shadow-[0_-4px_6px_-3px_rgb(20_28_24/0.05),0_-22px_28px_-16px_rgb(20_28_24/0.09)]";
const SheetLayerContext = React.createContext<HTMLElement | null>(null);

const subscribeNever = () => () => {};

/** Phones: renders its drawers into one layer, where they cast a shadow. */
function SheetLayer({ children }: { children: React.ReactNode }) {
  const [layer, setLayer] = React.useState<HTMLDivElement | null>(null);
  const mounted = React.useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
  if (!mounted) return null;
  return (
    <>
      {createPortal(
        <div
          ref={setLayer}
          data-sheet-layer=""
          className="pointer-events-none fixed inset-0 z-50"
        />,
        document.body,
      )}
      {layer && (
        <SheetLayerContext.Provider value={layer}>
          {children}
        </SheetLayerContext.Provider>
      )}
    </>
  );
}

// The popup's own transition time.
const drawerDuration = 450;

/**
 * Follows a drawer's popup without touching layout while it moves. Base UI
 * writes the snap offset and drag movement straight onto the popup's style,
 * and a MutationObserver hears each write. `onMotion` reports where it is
 * headed; to move in step with it, put things on the popup via `edge`.
 *
 * With `restOffset`, the content is sized to the settled snap point through
 * `--drawer-rest-offset` (so its end can be scrolled to), rather than to every
 * frame of a drag: full height while dragged or growing, and shrunk only once
 * the drawer has come to rest.
 */
function useDrawerMotion(
  content: HTMLElement | null,
  restOffset: boolean,
  onMotion?: (motion: DrawerMotion) => void,
) {
  const report = React.useEffectEvent((motion: DrawerMotion) =>
    onMotion?.(motion),
  );
  const tracking = restOffset || Boolean(onMotion);
  React.useEffect(() => {
    const popup = content?.closest<HTMLElement>("[data-slot=drawer-popup]");
    if (!content || !popup || !tracking) return;
    let height = popup.offsetHeight;
    let rest = -1;
    let pending = -1;
    let timer = 0;
    const settle = (offset: number) => {
      window.clearTimeout(timer);
      pending = -1;
      if (offset === rest) return;
      rest = offset;
      content.style.setProperty("--drawer-rest-offset", `${offset}px`);
    };
    const read = () => {
      const style = popup.style;
      const offset =
        Number.parseFloat(style.getPropertyValue("--drawer-snap-point-offset")) ||
        0;
      const movement =
        Number.parseFloat(style.getPropertyValue("--drawer-swipe-movement-y")) ||
        0;
      const swiping = popup.hasAttribute("data-swiping");
      report({ visible: height - offset - movement, swiping });
      if (!restOffset) return;
      const target = swiping ? 0 : Math.max(0, offset);
      if (rest < 0 || target <= rest) settle(target);
      else if (target !== pending) {
        // Shrinking early would bare the drawer below the content as it slides.
        window.clearTimeout(timer);
        pending = target;
        timer = window.setTimeout(() => settle(target), drawerDuration + 30);
      }
    };
    const mutations = new MutationObserver(read);
    mutations.observe(popup, {
      attributes: true,
      attributeFilter: ["style", "data-swiping"],
    });
    const resize = new ResizeObserver(() => {
      height = popup.offsetHeight;
      read();
    });
    resize.observe(popup);
    read();
    return () => {
      mutations.disconnect();
      resize.disconnect();
      window.clearTimeout(timer);
    };
  }, [content, tracking, restOffset]);
}

/**
 * A floating drawer stands clear of the screen's edges by `--sheet-gap`. While
 * it is dragged, the gap follows it: whole at the height it rested at, none
 * at full height, in step in between. Let go, the gap eases on to its rest.
 */
function useFloatingGap(content: HTMLElement | null, floating?: boolean) {
  const floatingRef = React.useRef(floating);
  React.useLayoutEffect(() => {
    floatingRef.current = floating;
  });
  const tracking = floating !== undefined;
  React.useEffect(() => {
    const popup = content?.closest<HTMLElement>("[data-slot=drawer-popup]");
    const viewport = popup?.parentElement;
    if (!content || !popup || !viewport || !tracking) return;
    // Its height, kept from its last resize. Asked on each write to its
    // style, it laid the page out mid-frame: the fold a pan starts held up
    // the pan's first frame.
    let height = popup.offsetHeight;
    // What of it showed when it last rested floating.
    let rest = -1;
    let dragging = false;
    let frame = 0;
    let timer = 0;
    const release = () => {
      viewport.style.removeProperty("--sheet-gap");
      viewport.style.removeProperty("--sheet-radius");
      viewport.removeAttribute("data-sheet-dragging");
    };
    const read = () => {
      const style = popup.style;
      const offset =
        Number.parseFloat(style.getPropertyValue("--drawer-snap-point-offset")) ||
        0;
      const movement =
        Number.parseFloat(style.getPropertyValue("--drawer-swipe-movement-y")) ||
        0;
      if (!popup.hasAttribute("data-swiping")) {
        if (floatingRef.current) rest = height - offset;
        if (dragging) {
          dragging = false;
          // Held until the drawer has re-rendered at the point it snaps to,
          // so the gap eases from here to there and not by way of the old.
          cancelAnimationFrame(frame);
          frame = requestAnimationFrame(() => {
            frame = requestAnimationFrame(release);
          });
          // Let go floating, it frees what the drag pinned.
          window.clearTimeout(timer);
          timer = window.setTimeout(() => {
            if (floatingRef.current) unpinLines(content);
          }, drawerDuration + 30);
        }
        return;
      }
      if (!dragging) {
        dragging = true;
        cancelAnimationFrame(frame);
        if (floatingRef.current) pinLines(content, viewport);
        viewport.setAttribute("data-sheet-dragging", "");
      }
      // Opened at full height, it has not rested floating yet.
      const from = rest > 0 && rest < height ? rest : height * 0.42;
      const share = Math.min(
        1,
        Math.max(0, (offset + movement) / (height - from)),
      );
      viewport.style.setProperty("--sheet-gap", `${8 * share}px`);
      viewport.style.setProperty(
        "--sheet-radius",
        `calc(var(--radius-sheet) * ${share})`,
      );
    };
    const mutations = new MutationObserver(read);
    mutations.observe(popup, {
      attributes: true,
      attributeFilter: ["style", "data-swiping"],
    });
    const resize = new ResizeObserver(() => {
      height = popup.offsetHeight;
    });
    resize.observe(popup);
    read();
    return () => {
      mutations.disconnect();
      resize.disconnect();
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      release();
    };
  }, [content, tracking]);
}

/** The width a floating drawer's text wraps to, pinned while it grows. */
const pinnedWidth = "--sheet-pinned-width";

/**
 * The nearest box an inline run of text wraps within. `boxes` keeps each
 * element's answer for the walk, since sibling runs share their ancestors.
 */
function wrappingBox(node: Node, boxes: Map<Element, HTMLElement | null>) {
  const passed: Element[] = [];
  let element = node.parentElement;
  let box: HTMLElement | null = null;
  while (element) {
    const known = boxes.get(element);
    if (known !== undefined) {
      box = known;
      break;
    }
    passed.push(element);
    const display = getComputedStyle(element).display;
    if (display !== "inline" && display !== "contents") {
      box = element;
      break;
    }
    element = element.parentElement;
  }
  for (const element of passed) boxes.set(element, box);
  return box;
}

/**
 * Pins every paragraph of a floating drawer's content that wraps to the
 * width it has floating, so that as the drawer grows into the screen's
 * sides its lines break where they did: the drawer, its edges and its
 * pictures widen, its text doesn't reflow. Text on one line can't rewrap
 * wider, so it is left free. Measured with the gap whole whatever the drawer
 * is doing, so a jump to full height, unanimated, pins it as it was.
 */
function pinLines(content: HTMLElement, viewport: HTMLElement) {
  const held = viewport.style.getPropertyValue("--sheet-gap");
  viewport.style.setProperty("--sheet-gap", "8px");
  const runs = new Map<HTMLElement, Text[]>();
  const boxes = new Map<Element, HTMLElement | null>();
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.nodeValue?.trim()) continue;
    const box = wrappingBox(node, boxes);
    if (!box || box.hasAttribute("data-sheet-pinned")) continue;
    const texts = runs.get(box);
    if (texts) texts.push(node as Text);
    else runs.set(box, [node as Text]);
  }
  const range = document.createRange();
  const pins: [HTMLElement, number, string][] = [];
  for (const [box, texts] of runs) {
    // Lines are told apart by where their text sits; wrapped, it sits on two.
    let top: number | undefined;
    const wraps = texts.some((text) => {
      range.selectNodeContents(text);
      return [...range.getClientRects()].some((rect) => {
        if (!rect.width) return false;
        top ??= rect.top;
        return Math.abs(rect.top - top) > rect.height / 2;
      });
    });
    if (wraps)
      pins.push([
        box,
        box.getBoundingClientRect().width,
        getComputedStyle(box).textAlign,
      ]);
  }
  // Written after every read, so the content lays out once.
  for (const [box, width, align] of pins) {
    box.setAttribute("data-sheet-pinned", align);
    box.style.setProperty(pinnedWidth, `${width}px`);
  }
  if (held) viewport.style.setProperty("--sheet-gap", held);
  else viewport.style.removeProperty("--sheet-gap");
}

function unpinLines(content: HTMLElement) {
  for (const box of content.querySelectorAll<HTMLElement>(
    "[data-sheet-pinned]",
  )) {
    box.removeAttribute("data-sheet-pinned");
    box.style.removeProperty(pinnedWidth);
  }
}

/**
 * Keeps a floating drawer's text from reflowing as it grows to full height
 * (see `pinLines`), whether dragged there (pinned in `useFloatingGap`) or
 * sent; it is freed once the drawer rests floating again.
 */
function usePinnedLines(content: HTMLElement | null, floating?: boolean) {
  const floated = React.useRef(floating);
  React.useLayoutEffect(() => {
    const was = floated.current;
    floated.current = floating;
    const viewport = content?.closest<HTMLElement>(
      "[data-slot=drawer-popup]",
    )?.parentElement;
    if (!content || !viewport) return;
    if (floating === false && was === true) pinLines(content, viewport);
    if (!floating) return;
    // Shrinking, it stays pinned until its sides have come back in.
    const timer = window.setTimeout(
      () => unpinLines(content),
      drawerDuration + 30,
    );
    return () => window.clearTimeout(timer);
  }, [content, floating]);
}

/**
 * Marks each of the content's scrollers (`data-drawer-scroll`) that is
 * scrolled away from its top with `data-scrolled`. Below full height a
 * drawer's scroller doesn't scroll, so a swipe moves the drawer; one already
 * scrolled stays scrollable, so a swipe down takes it back to its top before
 * it moves the drawer.
 */
function useScrolledMark(content: HTMLElement | null, enabled: boolean) {
  React.useEffect(() => {
    if (!content || !enabled) return;
    // Scroll doesn't bubble, but it does pass ancestors on the way down.
    const onScroll = (event: Event) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.hasAttribute("data-drawer-scroll")
      )
        target.toggleAttribute("data-scrolled", target.scrollTop > 0);
    };
    content.addEventListener("scroll", onScroll, {
      capture: true,
      passive: true,
    });
    return () =>
      content.removeEventListener("scroll", onScroll, { capture: true });
  }, [content, enabled]);
}

function useDrawer() {
  const context = React.useContext(DrawerContext);

  if (!context) {
    throw new Error("useDrawer must be used within a Drawer.");
  }

  return context;
}

function Drawer({
  modal = true,
  showSwipeHandle = false,
  snapPoints,
  swipeDirection = "down",
  ...props
}: DrawerPrimitive.Root.Props & {
  showSwipeHandle?: boolean;
}) {
  const hasSnapPoints = snapPoints != null && snapPoints.length > 0;
  const contextValue = React.useMemo(
    () => ({ hasSnapPoints, modal, showSwipeHandle, swipeDirection }),
    [hasSnapPoints, modal, showSwipeHandle, swipeDirection],
  );

  return (
    <DrawerContext.Provider value={contextValue}>
      <DrawerPrimitive.Root
        data-slot="drawer"
        modal={modal}
        snapPoints={snapPoints}
        swipeDirection={swipeDirection}
        {...props}
      />
    </DrawerContext.Provider>
  );
}

function DrawerPortal({ ...props }: DrawerPrimitive.Portal.Props) {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />;
}

function DrawerOverlay({
  className,
  ...props
}: Omit<DrawerPrimitive.Backdrop.Props, "className"> & { className?: string }) {
  return (
    <DrawerPrimitive.Backdrop
      data-slot="drawer-overlay"
      className={cn(
        "fixed inset-0 z-50 min-h-dvh bg-scrim/10 opacity-[max(var(--drawer-overlay-min-opacity,0),calc(1-var(--drawer-swipe-progress)))] transition-opacity duration-450 ease-[cubic-bezier(0.32,0.72,0,1)] select-none motion-reduce:transition-none data-ending-style:pointer-events-none data-ending-style:opacity-0 data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)] data-snap-points:[--drawer-overlay-min-opacity:0.5] data-starting-style:opacity-0 data-swiping:duration-0 supports-backdrop-filter:backdrop-blur-xs supports-[-webkit-touch-callout:none]:absolute",
        className,
      )}
      {...props}
    />
  );
}

function DrawerSwipeHandle({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-swipe-handle"
      aria-hidden="true"
      className={cn(
        "relative z-10 flex shrink-0 cursor-grab transition-opacity duration-200 motion-reduce:transition-none group-data-nested-drawer-open/drawer-popup:opacity-0 group-data-nested-drawer-swiping/drawer-popup:opacity-100 group-data-[swipe-axis=x]/drawer-popup:h-full group-data-[swipe-axis=x]/drawer-popup:w-3 group-data-[swipe-axis=x]/drawer-popup:items-center group-data-[swipe-axis=y]/drawer-popup:h-3 group-data-[swipe-axis=y]/drawer-popup:w-full group-data-[swipe-axis=y]/drawer-popup:justify-center group-data-[swipe-direction=down]/drawer-popup:items-end group-data-[swipe-direction=left]/drawer-popup:order-last group-data-[swipe-direction=left]/drawer-popup:justify-start group-data-[swipe-direction=right]/drawer-popup:justify-end group-data-[swipe-direction=up]/drawer-popup:order-last group-data-[swipe-direction=up]/drawer-popup:items-start after:block after:shrink-0 after:rounded-full after:bg-muted group-data-[swipe-axis=x]/drawer-popup:after:h-24 group-data-[swipe-axis=x]/drawer-popup:after:w-1 group-data-[swipe-axis=y]/drawer-popup:after:h-1 group-data-[swipe-axis=y]/drawer-popup:after:w-24 active:cursor-grabbing",
        className,
      )}
      {...props}
    />
  );
}

function DrawerContent({
  className,
  children,
  contentClassName,
  handle,
  edge,
  viewportClassName,
  restOffset = false,
  floating,
  onMotion,
  ...props
}: Omit<DrawerPrimitive.Popup.Props, "className"> & { className?: string } & {
  contentClassName?: string;
  handle?: React.ReactNode;
  /**
   * Rendered on the popup itself, outside its clipped content: whatever is
   * placed past its top edge moves with it, frame for frame.
   */
  edge?: React.ReactNode;
  viewportClassName?: string;
  /** Size the content to the settled snap point; see `useDrawerMotion`. */
  restOffset?: boolean;
  /**
   * True while it rests below full height: it stands clear of the screen's
   * sides and bottom like a card, and grows into them as it is maximized.
   * Leave it unset for a drawer that never floats.
   */
  floating?: boolean;
  onMotion?: (motion: DrawerMotion) => void;
}) {
  const { hasSnapPoints, modal, showSwipeHandle, swipeDirection } = useDrawer();
  const [content, setContent] = React.useState<HTMLDivElement | null>(null);
  useDrawerMotion(content, restOffset, onMotion);
  useFloatingGap(content, floating);
  usePinnedLines(content, floating);
  useScrolledMark(content, hasSnapPoints);
  const swipeAxis =
    swipeDirection === "down" || swipeDirection === "up" ? "y" : "x";
  const layer = React.useContext(SheetLayerContext);

  return (
    <DrawerPortal data-slot="drawer-portal" container={layer}>
      {modal === true && (
        <DrawerOverlay data-snap-points={hasSnapPoints ? "" : undefined} />
      )}
      <DrawerPrimitive.Viewport
        data-slot="drawer-viewport"
        data-modal={modal}
        data-floating={floating}
        className={cn(
          "pointer-events-none fixed inset-0 z-50 select-none data-[modal=true]:pointer-events-auto",
          // Floating: the popup runs past the screen's bottom edge, so the
          // viewport clips it a gap above it. The clip stays put on screen
          // while the popup moves, and eases with it as the gap closes.
          floating !== undefined &&
            "[--sheet-gap:0px] [--sheet-radius:0px] data-[floating=true]:[--sheet-gap:8px] data-[floating=true]:[--sheet-radius:var(--radius-sheet)] [clip-path:inset(0_var(--sheet-gap)_var(--sheet-gap)_round_0_0_var(--sheet-radius)_var(--sheet-radius))] transition-[clip-path] duration-450 ease-[cubic-bezier(0.22,1,0.36,1)] data-sheet-dragging:transition-none motion-reduce:transition-none",
          viewportClassName,
        )}
      >
        <DrawerPrimitive.Popup
          data-slot="drawer-popup"
          data-swipe-axis={swipeAxis}
          data-snap-points={hasSnapPoints ? "" : undefined}
          className={cn(
            // Base.
            "group/drawer-popup pointer-events-auto fixed z-50 m-(--drawer-inset,0px) flex h-(--drawer-content-height) max-h-(--drawer-content-max-height,none) min-h-0 w-(--drawer-content-width,auto) transform-[translate3d(var(--translate-x,0px),var(--translate-y,0px),0)_scale(var(--stack-scale))] flex-col border-border bg-surface text-sm text-ink transition-[transform,height,opacity,filter] duration-450 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform outline-none select-none [interpolate-size:allow-keywords] focus-visible:-outline-offset-2 motion-reduce:transition-none data-[swipe-direction=down]:rounded-t-sheet data-[swipe-direction=down]:border-t data-[swipe-direction=left]:rounded-r-sheet data-[swipe-direction=left]:border-r data-[swipe-direction=right]:rounded-l-sheet data-[swipe-direction=right]:border-l data-[swipe-direction=up]:rounded-b-sheet data-[swipe-direction=up]:border-b",
            layer && sheetShadowClasses,
            // Nested.
            "data-nested-drawer-open:overflow-hidden data-nested-drawer-open:brightness-95",
            // Bleed.
            "after:pointer-events-none after:absolute after:bg-(--drawer-bleed-background,var(--color-surface)) data-[swipe-axis=x]:after:inset-y-0 data-[swipe-axis=x]:after:w-(--bleed) data-[swipe-axis=y]:after:inset-x-0 data-[swipe-axis=y]:after:h-(--bleed) data-[swipe-direction=down]:after:top-full data-[swipe-direction=left]:after:right-full data-[swipe-direction=right]:after:left-full data-[swipe-direction=up]:after:bottom-full",
            // Sizing.
            "[--drawer-content-height:var(--drawer-height,auto)] data-[swipe-axis=x]:[--drawer-content-width:75%] data-[swipe-axis=y]:[--drawer-content-max-height:calc(100dvh-6rem)] data-[swipe-axis=y]:data-snap-points:[--drawer-content-height:100dvh] data-[swipe-axis=x]:sm:[--drawer-content-width:24rem]",
            // Stack.
            "[--bleed:3rem] [--peek:1rem] [--stack-height:var(--drawer-frontmost-height,var(--drawer-height,0px))] [--stack-peek-offset:max(0px,calc((var(--nested-drawers)-var(--stack-progress))*var(--peek)))] [--stack-progress:clamp(0,var(--drawer-swipe-progress),1)] [--stack-scale-base:max(0,calc(1-(var(--nested-drawers)*var(--stack-step))))] [--stack-scale:clamp(0,calc(var(--stack-scale-base)+(var(--stack-step)*var(--stack-progress))),1)] [--stack-shrink:calc(1-var(--stack-scale))] [--stack-step:0.05]",
            // Transitions.
            "data-ending-style:transform-(--closed-transform) data-ending-style:opacity-[0.9999] data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)] data-nested-drawer-swiping:duration-0 data-ending-style:data-nested-drawer-swiping:duration-[calc(var(--drawer-swipe-strength)*400ms)] data-starting-style:transform-(--closed-transform) data-swiping:duration-0 data-ending-style:data-swiping:duration-[calc(var(--drawer-swipe-strength)*400ms)]",
            // Axis: y.
            "data-[swipe-axis=y]:inset-x-0 data-[swipe-axis=y]:data-nested-drawer-open:h-(--stack-height)",
            // Axis: x.
            "data-[swipe-axis=x]:inset-y-0 data-[swipe-axis=x]:flex-row",
            // Direction: down.
            "data-[swipe-direction=down]:bottom-0 data-[swipe-direction=down]:origin-bottom data-[swipe-direction=down]:[--closed-transform:translate3d(0,calc(100%+var(--drawer-inset,0px)+2px),0)] data-[swipe-direction=down]:[--translate-y:calc(var(--drawer-snap-point-offset,0px)+var(--drawer-swipe-movement-y)-var(--stack-peek-offset)-(var(--stack-shrink)*var(--stack-height)))]",
            // Direction: up.
            "data-[swipe-direction=up]:top-0 data-[swipe-direction=up]:origin-top data-[swipe-direction=up]:[--closed-transform:translate3d(0,calc(-100%-var(--drawer-inset,0px)-2px),0)] data-[swipe-direction=up]:[--translate-y:calc(var(--drawer-snap-point-offset,0px)+var(--drawer-swipe-movement-y)+var(--stack-peek-offset)+(var(--stack-shrink)*var(--stack-height)))]",
            // Direction: left.
            "data-[swipe-direction=left]:left-0 data-[swipe-direction=left]:origin-left data-[swipe-direction=left]:[--closed-transform:translate3d(calc(-100%-var(--drawer-inset,0px)-2px),0,0)] data-[swipe-direction=left]:[--translate-x:calc(var(--drawer-swipe-movement-x)+var(--stack-peek-offset)+(var(--stack-shrink)*100%))]",
            // Direction: right.
            "data-[swipe-direction=right]:right-0 data-[swipe-direction=right]:origin-right data-[swipe-direction=right]:[--closed-transform:translate3d(calc(100%+var(--drawer-inset,0px)+2px),0,0)] data-[swipe-direction=right]:[--translate-x:calc(var(--drawer-swipe-movement-x)-var(--stack-peek-offset)-(var(--stack-shrink)*100%))]",
            // Floating: as narrow as the viewport's clip.
            floating !== undefined &&
              "[--sheet-gap:inherit] mx-(--sheet-gap) transition-[transform,height,opacity,filter,margin]",
            className,
          )}
          {...props}
        >
          {edge}
          {handle}
          {showSwipeHandle && <DrawerSwipeHandle />}
          <DrawerPrimitive.Content
            ref={setContent}
            data-slot="drawer-content"
            className={cn(
              "flex min-h-0 flex-1 flex-col overflow-hidden overscroll-contain transition-opacity duration-300 ease-[cubic-bezier(0.45,1.005,0,1.005)] select-text motion-reduce:transition-none group-data-nested-drawer-open/drawer-popup:opacity-0 group-data-nested-drawer-swiping/drawer-popup:opacity-100 group-data-swiping/drawer-popup:select-none",
              // Under a handle it starts below the popup's rounded corners.
              // Rounding it anyway costs a mask that Chrome can misdraw under
              // the floating clip, as in the theme's cross-fade.
              !(handle && swipeDirection === "down") && "rounded-[inherit]",
              floating !== undefined && "[--sheet-gap:inherit]",
              contentClassName,
            )}
          >
            {children}
          </DrawerPrimitive.Content>
        </DrawerPrimitive.Popup>
      </DrawerPrimitive.Viewport>
    </DrawerPortal>
  );
}

function DrawerTitle({
  className,
  ...props
}: Omit<DrawerPrimitive.Title.Props, "className"> & { className?: string }) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn("text-base font-medium text-ink", className)}
      {...props}
    />
  );
}

function DrawerDescription({
  className,
  ...props
}: Omit<DrawerPrimitive.Description.Props, "className"> & {
  className?: string;
}) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn("text-sm text-balance text-muted", className)}
      {...props}
    />
  );
}

const DrawerVirtualKeyboardProvider = DrawerPrimitive.VirtualKeyboardProvider;

export {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerDescription,
  DrawerVirtualKeyboardProvider,
  SheetLayer,
  sheetShadowClasses,
};

export type { DrawerMotion, DrawerSnapPoint };
