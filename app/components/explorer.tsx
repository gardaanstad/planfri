"use client";

import {
  type ComponentProps,
  type CSSProperties,
  Fragment,
  type ReactNode,
  type RefObject,
  memo,
  startTransition,
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { flushSync } from "react-dom";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ArrowDownUp,
  Construction,
  List as ListIcon,
  PanelLeftClose,
  PanelLeftOpen,
  GalleryVertical,
  LayoutList,
  LogIn,
  Map as MapIcon,
  MapPin,
  Plus,
  Search,
  SearchX,
  SlidersHorizontal,
  User,
  X,
} from "lucide-react";
import {
  type Bounds,
  type Project,
  projectHref,
  projectInBounds,
  statuses,
  statusOrder,
} from "../lib/data";
import {
  defaultDensity,
  defaultSort,
  defaultStatus,
  maxPinnedPlaces,
  noPinnedPlaces,
  parseExploreState,
  sameValues,
  sortOptions,
  storeCollapsed,
  storedCollapsed,
  storeDensity,
  storedDensity,
  storedLegend,
  storeLegend,
  storedPhonePins,
  storedPinnedPlaces,
  storePhonePins,
  storePinnedPlaces,
  subscribeCollapsed,
  subscribeDensity,
  subscribeLegend,
  subscribePhonePins,
  subscribePinnedPlaces,
  type ListDensity,
  type MapView,
} from "../lib/explore-state";
import type {
  MapApi,
  MapContextMenuAt,
  MapViewChange,
} from "./project-map";
import MapContextMenu from "./map-context-menu";
import OffMapGroup, { showOffMapEvent } from "./off-map-group";
import {
  extentPoints,
  findPlace,
  inPlace as inPlaceNamed,
  mainCities,
  placeExtent,
  placeInView,
  placeParts,
  places,
  projectPlaces,
} from "../lib/places";
import { errorMessage } from "../lib/api-client";
import { profileHref } from "../lib/profiles";
import { useAuth } from "./auth-provider";
import { useCommunity } from "./community-provider";
import AccountMenu from "./account-menu";
import { BrandMark } from "./brand-mark";
import ProfileAvatar from "./profile-avatar";
import ChoiceSelect from "./choice-select";
import FilterSheet, {
  FilterPopover,
  type FilterSection,
} from "./filter-sheet";
import { categoryOptions } from "./category-picker";
import { useOsmModeStored, useOsmReview } from "./osm-review";
import ProjectPost from "./project-post";
import ProjectCard, { type CardTarget } from "./project-card";
import { FeedRow, feedEntries, type FeedTarget } from "./activity-feed";
import { useListMotion } from "./use-list-motion";
import PanelResizer from "./panel-resizer";
import { useUnread } from "./unread-provider";
import { unreadCount } from "../lib/unread";
import EmptyState, { EmptyAction } from "./empty-state";
import { notify } from "./toast";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerDescription,
  DrawerVirtualKeyboardProvider,
  SheetLayer,
  sheetShadowClasses,
  type DrawerMotion,
  type DrawerSnapPoint,
} from "./drawer";
import {
  CoveredLayer,
  DrawerGrip,
  gripStrip,
  gripTarget,
  mobileDrawerClasses,
  Panel,
  PanelDrawer,
  PanelShell,
  ScrollFade,
  visibleBottomClasses,
} from "./panel";
import { takeLoginIntent } from "../lib/login-intent";
import {
  categorySummary,
  projectPoints,
} from "../lib/project-filters";
import { useProjectList } from "./use-project-list";
import { usePanelLayers, type Layer } from "./use-panel-layers";
import { panelWidth, useSidebarMode } from "./use-sidebar-mode";
import { useUrlSync } from "./use-url-sync";
import { replaceUrl, whenNextSettled } from "../lib/explore-history";
import { routeParam } from "../lib/explore-route";
import { cn } from "../lib/cn";
import { mobileQuery, reducedMotion, useMediaQuery } from "../lib/media";
import { openProfileEvent } from "../lib/profile-overlay";
import type { SidebarMode } from "./sidebar-panel";
import { DrawSurfaceContext } from "./draw-surface";
import WelcomeRow from "./welcome-row";
import {
  iconButton,
  primaryButton,
  sortChoice,
  statusTone,
  textButton,
  unselectable,
} from "../lib/ui";

const densityOptions = [
  { value: "compact", label: "Kompakt", Icon: LayoutList },
  { value: "expanded", label: "Utvidet", Icon: GalleryVertical },
] as const;

// The selects' options and icons are made once: a select only redraws when
// what it shows changes, not each time the list follows the map.
const densityChoices = densityOptions.map(({ value, label, Icon }) => ({
  value,
  label,
  icon: <Icon size={18} aria-hidden="true" />,
}));
const pickDensity = (value: string) => storeDensity(value as ListDensity);
// Phones: the view's trigger shows the chosen view's symbol, at the sort's size.
const densityIcons = Object.fromEntries(
  densityOptions.map(({ value, Icon }) => [
    value,
    <Icon key={value} size={14} aria-hidden="true" />,
  ]),
) as Record<ListDensity, ReactNode>;
const statusOptions = statusOrder.map((value) => ({
  value,
  label: statuses[value].label,
  dot: statusTone[value].dot,
}));
const sortIcon = <ArrowDownUp size={14} />;

/** Where in a project to open: an update, a comment, or a section. */
type PostTarget = {
  updateId?: string;
  commentId?: string;
  section?: "discussion" | "updates";
};
// A project opened over the map rests at this height, the map above it, and
// so does the list as the page opens (its static shell is sized to match).
const middleSnapPoint = 0.58;
// The compact drawer shows just the header and filters along the bottom edge.
const compactSnapPoint = "124px";
/**
 * The window's height, kept from its last resize. Chrome lays the page out
 * to answer `innerHeight`, and the drawer's motion asks on every write to
 * its style: the fold a pan starts held up the pan's first frame.
 */
let windowHeight = 0;
function viewHeight() {
  if (!windowHeight) {
    windowHeight = window.innerHeight;
    window.addEventListener("resize", () => {
      windowHeight = window.innerHeight;
    });
  }
  return windowHeight;
}
/** The map a project at the middle height covers. */
const middleMapInset = () => Math.round(viewHeight() * middleSnapPoint);
/** The map the drawer covers at its compact height. */
const compactMapInset = Number.parseInt(compactSnapPoint);
/**
 * What of the map's bottom the list covers at a height, for framing: at the
 * full height the map is out of sight, and counted as under the compact one.
 */
const listMapInset = (point: DrawerSnapPoint | null) =>
  point === middleSnapPoint ? middleMapInset() : compactMapInset;
// The list folds down to its filters, rests at the middle height with the
// map above it, or takes the whole screen.
const drawerSnapPoints: DrawerSnapPoint[] = [
  compactSnapPoint,
  middleSnapPoint,
  1,
];
// How long the full list takes to come down to meet a project; the drawers'
// own 450ms otherwise.
const meetTime = 340;
// A project over the map rests at the middle height or the full one. A touch
// on the map folds it down to its header and phase timeline (a height in
// pixels, measured; see `foldHeight`), over the folded list. The folded
// height is a stop only while it rests there: a swipe down from the middle
// height closes the project in one go.
const projectSnapPoints: DrawerSnapPoint[] = [middleSnapPoint, 1];
/** Folded, a project's snap point is its height in pixels. */
const isFolded = (point: DrawerSnapPoint) => typeof point === "string";
/** Below the phase timeline's labels, as below the folded list's filters. */
const foldPadding = 14;
/** The floating drawer's gap below it; see `useFloatingGap`. */
const sheetGap = 8;
/**
 * The place a panning map shows on phones, ahead of the explorer: only the
 * "Sted" pill reads it, so naming a new place mid-pan re-renders just that,
 * not the list. `base` is the explorer's place it was named over; once that
 * moves on, the explorer has caught up and the pill shows its place again.
 */
type LivePlace = { name: string; base: string } | null;
function createLivePlace() {
  let current: LivePlace = null;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set(next: LivePlace) {
      if (next?.name === current?.name && next?.base === current?.base) return;
      current = next;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
type LivePlaceStore = ReturnType<typeof createLivePlace>;
const noLivePlace = () => null;

type PlaceSelectProps = Omit<
  Extract<ComponentProps<typeof ChoiceSelect>, { multiple?: false }>,
  "pins"
>;

/**
 * "Sted", with the places pinned in this browser at its top, set apart by a
 * line. It keeps its own store, so pinning redraws just the menu.
 */
function PlaceSelect({ options, ...props }: PlaceSelectProps) {
  const pinned = useSyncExternalStore(
    subscribePinnedPlaces,
    storedPinnedPlaces,
    () => noPinnedPlaces,
  );
  const phonePins = useSyncExternalStore(
    subscribePhonePins,
    storedPhonePins,
    () => false,
  );
  const ordered = useMemo(() => {
    const byValue = new Map(options.map((option) => [option.value, option]));
    const first = pinned.flatMap((name) => {
      const option = byValue.get(name);
      return option?.pinnable ? [{ ...option, divider: false }] : [];
    });
    const firstValues = new Set(first.map((option) => option.value));
    // A line above the first left, and any a pinned option took along.
    const rest: typeof options = [];
    let divider = first.length > 0;
    for (const option of options) {
      if (firstValues.has(option.value)) divider ||= !!option.divider;
      else {
        rest.push({ ...option, divider: divider || option.divider });
        divider = false;
      }
    }
    return [...first, ...rest];
  }, [options, pinned]);
  const pins = useMemo(
    () => ({
      values: pinned,
      max: maxPinnedPlaces,
      onChange: storePinnedPlaces,
      phoneToggle: {
        label: "Fest steder til toppen",
        on: phonePins,
        onChange: storePhonePins,
      },
    }),
    [pinned, phonePins],
  );
  return <ChoiceSelect {...props} options={ordered} pins={pins} />;
}

/** The phone's "Sted" pill, naming the live place while the map pans. */
function LivePlaceSelect({
  live,
  place,
  fallback,
  className,
  ...props
}: Omit<PlaceSelectProps, "triggerLabel" | "value"> & {
  live: LivePlaceStore;
  place: string;
  fallback: string;
}) {
  const shown = useSyncExternalStore(live.subscribe, live.get, noLivePlace);
  const name = shown && shown.base === place ? shown.name : place;
  return (
    <PlaceSelect
      {...props}
      value={place}
      triggerLabel={name || fallback}
      className={cn(
        className,
        !name && "[&_[data-slot=choice-trigger]]:font-medium",
      )}
    />
  );
}

/** The open project's drawer, the last one in while another leaves. */
const projectDrawer = () =>
  [
    ...document.querySelectorAll<HTMLElement>(
      "[data-project-drawer]:not([data-ending-style])",
    ),
  ].at(-1);

/**
 * How much of the open project's drawer shows folded: down to the end of
 * its phase timeline, scrolled to its title, past any photos above it. Never
 * lower than the folded list, which it covers, nor near the middle height.
 */
function foldHeight(): DrawerSnapPoint {
  const drawer = projectDrawer();
  const scroller = drawer?.querySelector("[data-project-scroll]");
  const title = scroller?.querySelector("#project-card-title");
  const bar = drawer?.querySelector("[data-project-post] > header");
  scroller?.scrollTo({
    // A photo leads the post: folded past it, the title stands just under
    // the bar floating over the scroll.
    top:
      title && bar
        ? title.getBoundingClientRect().top -
          bar.getBoundingClientRect().bottom +
          scroller.scrollTop -
          6
        : 0,
    behavior: "instant",
  });
  const strip = drawer?.querySelector("[data-phase-strip]");
  if (!drawer || !strip) return compactSnapPoint;
  const popup = drawer.closest("[data-slot=drawer-popup]") ?? drawer;
  const height = Math.round(
    strip.getBoundingClientRect().bottom -
      popup.getBoundingClientRect().top +
      foldPadding +
      sheetGap,
  );
  const most = Math.round(window.innerHeight * middleSnapPoint) - 48;
  return `${Math.max(compactMapInset, Math.min(height, most))}px`;
}
// The map controls ride a drawer's top edge, 14px clear of its border.
const controlsSlotClasses = cn(
  "absolute inset-x-0 bottom-full h-0",
  "transition-[opacity,visibility] duration-150 motion-reduce:transition-none",
  "data-covered:invisible data-covered:opacity-0",
  "[&_[data-map-controls]]:bottom-[15px]!",
);
/** Hides the map controls in a slot while its drawer would cover them. */
/** A row of the list, and whether it is out of the map's view. */
type ListRow = { project: Project; offMap: boolean };
const rowKey = (row: ListRow) => row.project.id;

/**
 * The list's rows, in view and then out of it, moving from one set to the
 * next (see `useListMotion`). The rows it shows are its own state, so each
 * swap redraws the rows alone, not the whole explorer: in a dense area a pan
 * swaps them many times over.
 */
function ListRows({
  items,
  scroller,
  renderCard,
  hidden,
  offMapLabel,
  empty,
}: {
  items: ListRow[];
  scroller: RefObject<HTMLElement | null>;
  renderCard: (row: ListRow) => ReactNode;
  /** Kept moving out of sight, as in "Nytt", which shows its own rows. */
  hidden: boolean;
  offMapLabel: string;
  /** Shown once the last rows are gone, unless null. */
  empty: ReactNode;
}) {
  const rows = useListMotion(items, rowKey, scroller, "data-card-id");
  const inView = rows.filter((row) => !row.offMap);
  const outOfView = rows.filter((row) => row.offMap);
  return (
    <>
      {/* Kept when empty, so rows filtered out can fade in it. */}
      <ol className="relative" data-list-motion="">
        {!hidden && inView.map(renderCard)}
      </ol>
      {/* A list of their own, so a project coming into view is one row
          moving across rather than every row before it moving down. */}
      {!hidden && outOfView.length > 0 && (
        <OffMapGroup label={offMapLabel}>
          {outOfView.map(renderCard)}
        </OffMapGroup>
      )}
      {(hidden || rows.length === 0) && empty}
    </>
  );
}

function coverControls(slot: HTMLElement | null, motion: DrawerMotion) {
  if (!slot) return;
  const covered = motion.visible > viewHeight() * middleSnapPoint + 2;
  if (covered === slot.hasAttribute("data-covered")) return;
  // A snap up hides them at once, where the drawer would have slid over
  // them; a snap down shows them as it arrives. A drag fades them.
  slot.style.transitionDuration = covered && !motion.swiping ? "0ms" : "150ms";
  slot.style.transitionDelay = covered || motion.swiping ? "0ms" : "200ms";
  slot.toggleAttribute("data-covered", covered);
}
/** A drawer's slot for the map controls, which follow its motion. */
function useControlsSlot() {
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  const node = useCallback((element: HTMLDivElement | null) => {
    ref.current = element;
    setSlot(element);
  }, []);
  const follow = useCallback(
    (motion: DrawerMotion) => coverControls(ref.current, motion),
    [],
  );
  return { slot, node, follow };
}
const primaryCta = cn(primaryButton, "rounded-lg px-4 text-xs");
const quietAction = cn(textButton, "min-h-11 text-xs");
const compactIconAction = cn(iconButton, "rounded-lg");
/**
 * Marks the avatar when a member's suggestions have been reviewed, or, for a
 * moderator, when suggestions wait in the queue in its menu.
 */
const reviewedDot =
  "absolute -top-0.5 -right-0.5 size-2.75 rounded-full border-2 border-surface bg-accent";

const noProjects: Project[] = [];

// Desktop: the place, borderless at the start of the filter row, its text on
// the list's edge; its hover tints at once, as the sort's does.
const placeChoiceClasses = [
  "-ml-2.5 min-w-0 shrink",
  "[&_[data-slot=choice-trigger]]:min-h-9 [&_[data-slot=choice-trigger]]:gap-1.5 [&_[data-slot=choice-trigger]]:rounded-lg [&_[data-slot=choice-trigger]]:border-transparent! [&_[data-slot=choice-trigger]]:bg-transparent [&_[data-slot=choice-trigger]]:px-2.5 [&_[data-slot=choice-trigger]]:text-item [&_[data-slot=choice-trigger]]:transition-none",
  "[&_[data-slot=choice-trigger]]:hover:bg-ink/[0.05]! [&_[data-slot=choice-trigger]>svg]:text-muted",
  "[&_[data-slot=choice-menu][data-open=false]]:hidden",
].join(" ");

// The sort's name, which folds away to leave its icon.
const sortLabel =
  "[&_[data-slot=choice-trigger]>span]:max-w-24 [&_[data-slot=choice-trigger]>span]:transition-[max-width,margin,opacity] [&_[data-slot=choice-trigger]>span]:duration-220 [&_[data-slot=choice-trigger]>span]:ease-out-soft";
const sortLabelFolded =
  "[&_[data-slot=choice-trigger]>span]:max-w-0 [&_[data-slot=choice-trigger]>span]:-ml-1.5 [&_[data-slot=choice-trigger]>span]:opacity-0";
const sortLabelNarrow =
  "narrow:[&_[data-slot=choice-trigger]>span]:max-w-0 narrow:[&_[data-slot=choice-trigger]>span]:-ml-1.5 narrow:[&_[data-slot=choice-trigger]>span]:opacity-0";

// Mobile filters read as inline text; the menus carry the structure.
const inlineChoiceClasses = [
  "min-w-0 shrink",
  "[&_[data-slot=choice-trigger]]:min-h-11 [&_[data-slot=choice-trigger]]:gap-1.5 [&_[data-slot=choice-trigger]]:rounded-lg [&_[data-slot=choice-trigger]]:border-transparent! [&_[data-slot=choice-trigger]]:bg-transparent [&_[data-slot=choice-trigger]]:px-2 [&_[data-slot=choice-trigger]]:text-item",
  "[&_[data-slot=choice-trigger]>svg]:text-muted",
  "[&_[data-slot=choice-option]]:min-h-11 [&_[data-slot=choice-menu][data-open=false]]:hidden",
  "max-xs:[&_[data-slot=choice-trigger]]:gap-1 max-xs:[&_[data-slot=choice-trigger]]:px-1.5 max-xs:[&_[data-slot=choice-trigger]]:text-body",
].join(" ");
// Panels open in drawers of their own over it (see panel.tsx); it stays
// where it is under them, only dimmed, peeking out above them at full height.
const explorerDrawerClasses = cn(
  mobileDrawerClasses,
  "[--drawer-content-max-height:calc(100dvh_-_12px_-_env(safe-area-inset-top))]!",
  "data-panel-open:brightness-95",
);

// Sized to the snap point the drawer rests at, so the list's end shows; see
// `restOffset` on DrawerContent.
const mobileDrawerInnerClasses = [
  "min-h-0 flex-none overflow-hidden",
  "h-[calc(100%_-_12px_-_var(--drawer-rest-offset)_-_var(--sheet-gap,0px))]",
  "pb-[env(safe-area-inset-bottom)]",
].join(" ");

// Panels closed at first paint load apart, after the page is up (see
// `usePreloadPanels`), or at once when the URL opens one: server-rendered,
// a panel's code comes with the page.
const AccountPanel = dynamic(() => import("./account-panel"));
const AccountSettingsSheet = dynamic(() =>
  import("./account-settings").then((m) => m.AccountSettingsSheet),
);
const SignOutPrompt = dynamic(() => import("./sign-out-prompt"));
const ProjectEditor = dynamic(() => import("./project-editor"));
const SavedProjects = dynamic(() => import("./saved-projects"));
const ProfileOverlay = dynamic(() => import("./profile-overlay"));
const SuggestionList = dynamic(() => import("./suggestion-list"));
// Moderators' OSM mode, only while it is on.
const OsmPanel = dynamic(() =>
  import("./osm-panel").then((m) => m.OsmPanel),
);
const panelModules = [
  () => import("./saved-projects"),
  () => import("./profile-overlay"),
  () => import("./account-panel"),
  () => import("./account-settings"),
  () => import("./sign-out-prompt"),
  () => import("./project-editor"),
  () => import("./suggestion-list"),
  () => import("./login-prompt"),
];
let panelsPreloaded = false;
/**
 * Loads the panels' code one at a time when the browser is idle, from the
 * first input or a while after the page has loaded, so opening one later
 * doesn't wait on the network and the first paint doesn't wait on them.
 */
function usePreloadPanels() {
  useEffect(() => {
    if (panelsPreloaded) return;
    panelsPreloaded = true;
    const idle = (run: () => void) =>
      "requestIdleCallback" in window
        ? requestIdleCallback(run, { timeout: 2000 })
        : setTimeout(run, 50);
    const queue = [...panelModules];
    const next = () => {
      const load = queue.shift();
      if (load) idle(() => void load().catch(() => {}).then(next));
    };
    // Or at once on the first input, which may be on its way to a panel.
    const intents = ["pointermove", "pointerdown", "keydown"] as const;
    let started = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const begin = () => {
      if (started) return;
      started = true;
      clearTimeout(timer);
      for (const type of intents) window.removeEventListener(type, begin);
      next();
    };
    const start = () => (timer = setTimeout(begin, 4000));
    for (const type of intents)
      window.addEventListener(type, begin, { passive: true });
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
  }, []);
}
const ProjectMap = dynamic(() => import("./project-map"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 z-[700] flex flex-col items-center justify-center gap-[15px] bg-surface-muted text-ui text-muted">
      <MapIcon size={24} />
      <span>Laster kartet …</span>
    </div>
  ),
});

/**
 * Memoized: its props only change when the route does, so the layout's own
 * re-renders (such as Next.js syncing the URL the map writes) pass it by.
 */
export default memo(function Explorer({
  initialProjectId,
  initialProfile,
  initialPanel,
  initialSearch = "",
  mobileHint = false,
}: {
  initialProjectId?: string;
  initialProfile?: string;
  /** A sidebar panel with a route of its own, such as `/forslag`. */
  initialPanel?: "suggestions";
  /** The query string the page was opened with: filters and map position. */
  initialSearch?: string;
  /** From the request's user agent, so phones render mobile on the server. */
  mobileHint?: boolean;
}) {
  usePreloadPanels();
  const isMobile = useMediaQuery(mobileQuery, mobileHint);
  // The drawer lives in a portal that only mounts in the browser. Until it
  // does, a static copy in the same place shows its contents, then both swap
  // in one render so nothing shifts or flashes.
  const [drawerReady, setDrawerReady] = useState(false);
  // Likewise for a panel the page was opened on.
  const [panelsReady, setPanelsReady] = useState(
    !initialProjectId && !initialProfile && !initialPanel,
  );
  const panelReady = useCallback(() => setPanelsReady(true), []);
  // The list opens at the middle height, the map above it. Projects open in
  // their own drawer above it.
  const [snapPoint, setSnapPoint] = useState<DrawerSnapPoint | null>(
    middleSnapPoint,
  );
  const snapRef = useRef(snapPoint);
  /** A pan or zoom by hand under way, until the map settles. */
  const mapGesture = useRef(false);
  // A project opened over the map rests at the middle height with the list
  // at the same height behind it, so closing it leaves the list there. From
  // the full list, the list comes down to meet it, in step, and goes back up
  // as it closes (see `backToFullList`); from under a folded project, the
  // list rises behind it, unseen, once it is up.
  const meetPost = useRef(false);
  const meetPending = useRef(false);
  const raiseBehindPost = useRef(false);
  // A project folded over the map has the list folded under it; the list
  // comes back up to the middle height as the project closes.
  const listUnderFolded = useRef(false);
  // Opened over the folded list, a project leaves it folded: closing the
  // project goes back to it.
  const listStaysFolded = useRef(false);
  // Opened from the full list, a project leaves it as it was: closing the
  // project takes the list back to full height, scrolled where it was, its
  // projects kept in place until it comes down over the map again.
  const backToFullList = useRef(false);
  const [snapInstantly, setSnapInstantly] = useState(false);
  // Coming down to meet a project, the list moves a little quicker than the
  // project rises, so it is out from under it first.
  const [meetQuickly, setMeetQuickly] = useState(false);
  useEffect(() => {
    if (!meetQuickly) return;
    const timer = window.setTimeout(() => setMeetQuickly(false), meetTime);
    return () => window.clearTimeout(timer);
  }, [meetQuickly]);
  useLayoutEffect(() => {
    if (!snapInstantly) return;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => setSnapInstantly(false));
    });
    return () => cancelAnimationFrame(frame);
  }, [snapInstantly]);
  const drawerContentRef = useRef<HTMLDivElement>(null);
  const drawerHandleRef = useRef<HTMLButtonElement>(null);
  const projectTriggerRef = useRef<HTMLElement | SVGElement | null>(null);
  const {
    user,
    pending: authPending,
    canModerate,
    setMemberView,
    requireLogin,
  } = useAuth();
  const {
    projects,
    saved,
    activity,
    mutate,
    refresh,
    suggest,
    suggestions,
    reviewed,
  } = useCommunity();
  const { news, markSeen } = useUnread();
  const [initial] = useState(() =>
    parseExploreState(new URLSearchParams(initialSearch)),
  );
  const [query, setQuery] = useState(initial.query);
  // Phones: the filter sheet, which holds the search too, opened on it
  // when asked for the search.
  const [filterSheetOpen, setFilterSheetOpen] = useState<boolean | "search">(
    false,
  );
  const [status, setStatus] = useState<string[]>(initial.status);
  const [category, setCategory] = useState<string[]>(initial.category);
  const [sort, setSort] = useState(initial.sort);
  const [savedOnly, setSavedOnly] = useState(false);
  // The list's tab: the projects, or what's new on them ("Nytt").
  const [tab, setTab] = useState<"projects" | "feed">("projects");
  const feedOn = tab === "feed";
  // Desktop: the suggestion list as a sidebar panel (`/forslag`).
  // Guests opening its link get the login prompt over the list instead.
  const [suggestionsOpen, setSuggestionsOpen] = useState(
    initialPanel === "suggestions" && Boolean(user?.username),
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    initialProjectId || null,
  );
  // Where in the project to open: an update, or a comment in the discussion.
  const [postTarget, setPostTarget] = useState<PostTarget>({});
  const [postId, setPostId] = useState<string | null>(initialProjectId || null);
  // Phones: a project opened from the map or the list opens at the middle
  // height, over the map centered on it; dragged up, it takes the full height.
  const [postSnap, setPostSnap] = useState<{
    id: string;
    point: DrawerSnapPoint;
  } | null>(null);
  // Desktop: the explorer list hidden, the map at full width. Panels still
  // open at normal width over the map, and closing them returns here.
  // Desktop: where the editor draws a project (see `DrawSurfaceContext`).
  const [drawSurface, setDrawSurface] = useState<HTMLElement | null>(null);
  // The map's legend, off until asked for.
  const legendShown = useSyncExternalStore(
    subscribeLegend,
    storedLegend,
    () => false,
  );
  const collapsedPref = useSyncExternalStore(
    subscribeCollapsed,
    storedCollapsed,
    () => false,
  );
  const density = useSyncExternalStore(
    subscribeDensity,
    storedDensity,
    (): ListDensity => defaultDensity,
  );
  // Desktop: the OSM mode wants the whole map, so the list steps aside,
  // without its toggle, until the mode is off.
  const osmStored = useOsmModeStored();
  const osmFocus = canModerate && osmStored && !isMobile;
  const collapsed = collapsedPref || osmFocus;
  const sidebarMode: SidebarMode = collapsed ? "collapsed" : "normal";
  const panelRef = useRef<HTMLElement>(null);
  // While animating, the sidebar holds the larger of both layouts: out of
  // the map's way while collapsing or expanding, so the map resizes once,
  // not every frame.
  const { modeFrom, animateFrom, asideCollapsed, explorerHidden } =
    useSidebarMode({ panelRef, sidebarMode, collapsed });
  // The place shown in "Velg sted". It follows the map's view, and picking
  // one moves the map there.
  const [place, setPlace] = useState(
    () =>
      findPlace(initial.place ?? "")?.name ??
      (placeParts(initial.place ?? "").length ? initial.place! : ""),
  );
  // A picked place holds while the map flies there.
  const placeHold = useRef<{ name: string; until: number } | null>(null);
  const [livePlace] = useState(createLivePlace);
  useLayoutEffect(() => livePlace.set(null), [livePlace, place]);
  const lastZoom = useRef<number | null>(null);
  const [profileName, setProfileName] = useState<string | null>(
    initialProfile || null,
  );
  const [modal, setModal] = useState<"profile" | null>(null);
  // Phones: account settings, in a sheet of their own.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  // Phones: a profile's drawer, and one's own, rests at the middle height or
  // the full one; swiped down from the middle, it closes. One the page was
  // opened on stands at full height, where its static copy was.
  const [profileSnap, setProfileSnap] = useState<DrawerSnapPoint>(
    initialProfile ? 1 : middleSnapPoint,
  );
  const [accountSnap, setAccountSnap] =
    useState<DrawerSnapPoint>(middleSnapPoint);
  // The account panel opens on the profile, or on its settings; `n` starts
  // it afresh when the menu picks one while it is open.
  const [accountStart, setAccountStart] = useState<{
    view: "profile" | "settings";
    n: number;
  }>({ view: "profile", n: 0 });
  const [editorOpen, setEditorOpen] = useState(false);
  // What a new project starts from, such as a road from OpenStreetMap;
  // a new key starts the editor afresh.
  const [editorSeed, setEditorSeed] = useState<{
    key: number;
    draft?: Partial<Project>;
    /** Where its drawing map opens, such as a right-clicked spot. */
    view?: MapView;
  }>({ key: 0 });
  // The desktop map's right-click menu, while open.
  const [mapMenu, setMapMenu] = useState<MapContextMenuAt | null>(null);
  // The editor's own close, which asks before dropping a draft.
  const editorClose = useRef<(() => void) | null>(null);
  const editorDirty = useRef<(() => boolean) | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLElement>(null);
  const listContentRef = useRef<HTMLDivElement>(null);
  const listTopFade = useRef<HTMLDivElement>(null);
  const listBottomFade = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // The map is the place filter: the list holds what its view covers.
  const mapApi = useRef<MapApi | null>(null);
  // Every settled view lands in this ref. React only hears of a view, settled
  // or mid-pan, when the projects in it change, so panning about doesn't
  // re-render the explorer.
  const mapViewRef = useRef<MapViewChange | null>(null);
  const [viewBounds, setViewBounds] = useState<Bounds | null>(null);
  // None before the first view, which may have no projects in it.
  const inViewKey = useRef<string | null>(null);
  // Desktop: framing an open project moves the map, but the list behind the
  // panel keeps the area it was opened from, so it returns unchanged.
  const [frozenBounds, setFrozenBounds] = useState<Bounds | null>(null);
  const postView = useRef<{
    id: string;
    before: MapViewChange | null;
  } | null>(null);
  // Map moves after closing a project wait until history has stepped back:
  // replacing the URL mid-step makes Next.js reload the page.
  const afterPop = useRef<(() => void) | null>(null);
  const steppingBack = useRef(false);
  function stepBack(steps = 1) {
    steppingBack.current = true;
    window.history.go(-steps);
  }
  // The hovered card's project, drawn highlighted on the map.
  const hoveredId = useRef<string | null>(null);
  function highlight(id: string | null) {
    hoveredId.current = id;
    mapApi.current?.highlight(id);
  }
  // Moderators: OpenStreetMap railways and roads as candidates for projects.
  const osm = useOsmReview({
    allowed: canModerate,
    projects,
    // Clear of the bar and card over the top of the map.
    onFrame: (points) => mapApi.current?.fit(points, { maxZoom: 14, top: 230 }),
    // The list slides aside or back as the mode turns on or off.
    beforeToggle: () => {
      if (!isMobile && !collapsedPref) animateFrom();
    },
  });

  // The layer menu's switches: the legend, and moderators' OSM mode.
  const mapOverlays = useMemo(
    () => [
      {
        label: "Tegnforklaring",
        icon: <ListIcon size={18} />,
        on: legendShown,
        onToggle: () => storeLegend(!legendShown),
        quiet: true,
      },
      ...(osm.allowed
        ? [
            {
              label: "Nye veier og baner",
              icon: <Construction size={18} />,
              on: osm.on,
              onToggle: osm.toggle,
            },
          ]
        : []),
    ],
    [legendShown, osm.allowed, osm.on, osm.toggle],
  );

  const openSearch = useCallback(() => {
    if (postId || profileName || modal || savedOnly || suggestionsOpen) return;
    // Phones search in the filter sheet.
    if (isMobile) return setFilterSheetOpen("search");
    // A collapsed list comes back to be listedProjects.
    if (storedCollapsed()) flushSync(() => storeCollapsed(false));
    searchRef.current?.focus({ preventScroll: true });
  }, [isMobile, modal, postId, profileName, savedOnly, suggestionsOpen]);

  function closeSearch() {
    setQuery("");
    searchRef.current?.blur();
  }

  const { syncUrl, syncSoon, withSearch } = useUrlSync({
    state: { query, status, category, sort },
    view: () => mapViewRef.current ?? initial.view,
    paused: () => steppingBack.current,
  });

  function enterPostView(id: string, frame = true) {
    // Phones keep the view to return to; the list follows the map there.
    if (!isMobile && !postView.current && mapViewRef.current)
      setFrozenBounds(listBoundsOf(mapViewRef.current));
    // Phones: what of the map is in sight above the list right now, which its
    // last view may predate if the list has changed height since.
    const view = mapViewRef.current;
    postView.current = {
      id,
      before: postView.current
        ? postView.current.before
        : view && isMobile && mapApi.current
          ? { ...view, bounds: mapApi.current.boundsAbove(mapInset.current) }
          : view,
    };
    if (isMobile) return;
    const project = projects.find((item) => item.id === id);
    // Collapsed, the panel lies over the map's left edge.
    if (frame && project)
      mapApi.current?.fit(projectPoints(project), {
        left: sidebarMode === "collapsed" ? sidebarWidth() : 0,
      });
  }
  /** The width panels take beside the map. */
  function sidebarWidth() {
    return panelWidth(panelRef.current);
  }
  function leavePostView() {
    const view = postView.current;
    if (!view) return;
    postView.current = null;
    // Back to where the project was opened from; the list follows when the
    // map settles. Opened by link, the list takes the area around it.
    // Phones: the list may come to rest at another height than it had, so
    // the middle of what was in sight comes back above where it will rest,
    // at the zoom it had.
    if (view.before && isMobile)
      mapApi.current?.show(
        view.before,
        view.before.bounds,
        listMapInset(listPointAfterPost()),
      );
    else if (view.before) mapApi.current?.show(view.before);
    else setFrozenBounds(null);
    // The folded list shows only its filters, so it stays at its top.
    if (isMobile && snapPoint === compactSnapPoint) return;
    requestAnimationFrame(() =>
      listRef.current
        ?.querySelector(`[data-card-id="${CSS.escape(view.id)}"]`)
        ?.scrollIntoView({ block: "nearest" }),
    );
  }

  const onPopState = useEffectEvent(() => {
    // Entries keep the query string they had; the current filters win once
    // Next.js has handled the step, which can take a fetch after a reload.
    // Until then the URL stays put: replacing it mid-step makes Next.js
    // reload the page.
    steppingBack.current = true;
    const after = afterPop.current;
    afterPop.current = null;
    whenNextSettled(() => {
      steppingBack.current = false;
      syncUrl();
      after?.();
    });
    const path = window.location.pathname;
    // Forslag stays open under what was opened from it.
    setSuggestionsOpen(
      path === "/forslag" || Boolean(window.history.state?.suggestionsBelow),
    );
    const profile = routeParam(path, "/profil/");
    if (profile) {
      // Moving forward into a profile keeps whatever it was opened over.
      setProfileName(profile);
      setPostId(window.history.state?.profileOver ?? null);
      return;
    }
    const next = routeParam(path, "/prosjekt/") ?? null;
    setProfileName(null);
    setPostId(next);
    setSelectedId(next);
    if (next && next !== postId) enterPostView(next);
    else if (!next) leavePostView();
  });
  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if (
        event.key === "/" &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement) &&
        !document.querySelector("dialog[open]")
      ) {
        event.preventDefault();
        openSearch();
      }
    };
    window.addEventListener("keydown", keys);
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("keydown", keys);
      window.removeEventListener("popstate", onPopState);
    };
  }, [openSearch]);

  const savedIds = useMemo(() => new Set(saved), [saved]);
  const savedProjects = useMemo(
    () => projects.filter((project) => savedIds.has(project.id)),
    [projects, savedIds],
  );

  // Before the map reports its view (and on the server) the list covers
  // Norway.
  const listBounds = frozenBounds ?? viewBounds;
  // A search lists every hit, wherever it is; the map follows them.
  const searching = query.trim() !== "";
  const {
    placesOf,
    matching,
    mapProjects,
    needle,
    searchHits,
    listed: listedProjects,
    offMap: offMapProjects,
    outsideHits,
  } = useProjectList({
    projects,
    activity,
    query,
    status,
    category,
    sort,
    selectedId,
    bounds: searching ? null : listBounds,
    place: "",
    nearby: listBounds && !searching ? place : "",
  });

  // The project and profile panels keep theirs while sliding away.
  const [panelPostId, setPanelPostId] = useState(postId);
  if (postId && postId !== panelPostId) setPanelPostId(postId);
  const [panelProfileName, setPanelProfileName] = useState(profileName);
  if (profileName && profileName !== panelProfileName)
    setPanelProfileName(profileName);
  const found = projects.find((project) => project.id === panelPostId);
  // A project deleted while open keeps showing until its panel has closed.
  const [heldPost, setHeldPost] = useState(found);
  if (found && found !== heldPost) setHeldPost(found);
  const post =
    found ?? (heldPost?.id === panelPostId ? heldPost : undefined);

  // The panel stack over the explorer, bottom to top: layers in the sidebar
  // on desktop, drawers on phones. A header page (Lagret, Forslag, your
  // profile) can hold a project, which can hold a profile.
  const section: Layer | null = suggestionsOpen
    ? "suggestions"
    : modal === "profile"
      ? "account"
      : savedOnly
        ? "saved"
        : null;
  const liveLayers: Layer[] = [
    ...(section ? [section] : []),
    ...(postId ? ["project" as const] : []),
    ...(profileName ? ["profile" as const] : []),
    ...(editorOpen && user ? ["editor" as const] : []),
  ];
  const topLayer = liveLayers.at(-1) ?? null;
  const {
    layers,
    exiting,
    held,
    setHeld,
    exited,
    leaving,
    rememberTrigger,
  } = usePanelLayers({
    live: liveLayers,
    isMobile,
    panelRef,
  });
  const panelClosing = !postId && leaving("project");
  if (!postId && !panelClosing && panelPostId) setPanelPostId(null);
  if (!profileName && !leaving("profile") && panelProfileName)
    setPanelProfileName(null);
  // The places any project is in, for a view with none in it.
  const placesWithProjects = useMemo(
    () => new Set([...placesOf.values()].flat()),
    [placesOf],
  );
  function projectsInView(view: MapViewChange) {
    return projects.filter((project) => projectInBounds(project, view.bounds));
  }
  function onMapView(view: MapViewChange) {
    // On phones the drawer is folded down while the map pans, so the list
    // waits for it to settle; following it mid-pan stalled Safari. Only the
    // place it names keeps up, through the pill alone (see `LivePlace`).
    if (view.moving && isMobile) return followPlace(view);
    // Collapsed, the list is out of sight while the map pans, so it waits
    // for the map to settle, ready for the sidebar to come back.
    const collapsedList = !isMobile && sidebarMode === "collapsed";
    if (view.moving && collapsedList) return;
    if (!view.moving) mapGesture.current = false;
    // The URL and the view to return to take only views the map rests on.
    if (!view.moving) mapViewRef.current = view;
    const bounds = listBoundsOf(view);
    // On desktop the place is named from what the list takes too, so it
    // stays as it is when a collapsed sidebar comes back.
    const shown = isMobile
      ? projectsInView(view)
      : projects.filter((project) => projectInBounds(project, bounds));
    const listed =
      bounds === view.bounds || !isMobile
        ? shown
        : projects.filter((project) => projectInBounds(project, bounds));
    const key = listed.map((project) => project.id).join();
    const follow = () => {
      if (key !== inViewKey.current) {
        inViewKey.current = key;
        setViewBounds(bounds);
      }
      followPlace(view, shown);
    };
    // Mid-pan the list catches up between frames instead of holding one up:
    // rendering it inside a frame stalled the pan, worst in Safari.
    if (view.moving) return startTransition(follow);
    const settle = () => {
      follow();
      if (!postView.current && !backToFullList.current) setFrozenBounds(null);
    };
    // On phones the list was folded out of sight while the map moved, so
    // it lands a frame or two later as well: rendered at the gesture's end
    // with the map's own redraw, it held up that frame.
    if (isMobile) startTransition(settle);
    else settle();
    syncSoon();
  }
  /**
   * What the list takes of a view. On phones it holds what the folded list
   * leaves in sight, at every height, so raising the list over the map
   * keeps the rows it had rather than swapping out those it comes up over.
   * On desktop it holds what the sidebar leaves in sight, collapsed too, so
   * expanding it shuffles nothing. Taken from where the map lies rather than
   * the mode: the map takes its new width before this sees the new mode.
   */
  function listBoundsOf(view: MapViewChange) {
    if (!mapApi.current) return view.bounds;
    if (isMobile) return mapApi.current.boundsAbove(compactMapInset);
    return mapApi.current.boundsAbove(0, sidebarWidth());
  }
  /** Beside the map, "Velg sted" names the place the view shows. */
  function followPlace(view: MapViewChange, shown?: Project[]) {
    // An open project's framing is passing. Under the full drawer the map
    // is out of sight.
    if (postView.current) return;
    if (isMobile && snapRef.current === 1) return;
    const live = view.moving && isMobile;
    // Settled, the explorer takes the name; the pill's own copy is let go
    // once it has (see the layout effect on `place`).
    const name = (next: string) => {
      if (live) livePlace.set({ name: next, base: place });
      else if (next === place) livePlace.set(null);
      else setPlace(next);
    };
    const previousZoom = lastZoom.current ?? view.zoom;
    lastZoom.current = view.zoom;
    const hold = placeHold.current;
    if (hold && Date.now() < hold.until) return name(hold.name);
    placeHold.current = null;
    shown ??= projectsInView(view);
    const inView = shown.map((project) => placesOf.get(project.id) ?? []);
    const current = livePlace.get();
    const shownName = current && current.base === place ? current.name : place;
    name(
      placeInView(inView, view.zoom, shownName, previousZoom, {
        center: view.center,
        withProjects: placesWithProjects,
      }),
    );
  }
  // The drawer's height changes what of the map is in sight, and so the
  // place "Velg sted" names; the list holds what the folded drawer leaves in
  // sight at every height (see `listBoundsOf`). Under the full drawer the map
  // is out of sight: the place stays as it was.
  // Folded by a pan, it waits for the pan to settle, which reports the view
  // anyway: named in the frames after the fold, it held up the fold's start.
  const placeUnderDrawer = useEffectEvent(() => {
    if (snapRef.current === snapPoint) return;
    snapRef.current = snapPoint;
    if (!postId && snapPoint !== 1) backToFullList.current = false;
    const view = mapViewRef.current;
    if (!view || !mapApi.current || snapPoint === 1 || mapGesture.current)
      return;
    onMapView({ ...view, bounds: mapApi.current.boundsAbove(mapInset.current) });
  });
  useEffect(() => placeUnderDrawer(), [snapPoint]);
  // Folded down, the list shows only its filters: a list left scrolled, as a
  // wheel that unfolds it can leave it, would show rows there instead and
  // take the next swipe up from the drawer. Only a list marked scrolled is
  // (see `useScrolledMark`): scrolling lays the page out there and then,
  // which held up the first frame of a pan folding it.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (
      isMobile &&
      snapPoint === compactSnapPoint &&
      list?.hasAttribute("data-scrolled")
    )
      list.scrollTo({ top: 0 });
  }, [isMobile, snapPoint]);
  /** Moves the map to a place, or out to Norway for none. */
  function goToPlace(name: string) {
    livePlace.set(null);
    setPlace(name);
    const found = placeExtent(name);
    placeHold.current = { name: found ? name : "", until: Date.now() + 1500 };
    // On phones the list keeps its height, but comes down from the full one
    // so the map shows; the place is framed above where it comes to rest.
    if (isMobile) {
      const point =
        snapPoint === compactSnapPoint ? compactSnapPoint : middleSnapPoint;
      setSnapPoint(point);
      mapInset.current = listMapInset(point);
    }
    if (found) mapApi.current?.fit(extentPoints(found), { maxZoom: 14 });
    else mapApi.current?.showNorway();
  }
  const pickPlaceLatest = useRef(goToPlace);
  useLayoutEffect(() => {
    pickPlaceLatest.current = goToPlace;
  });
  const choosePlace = useCallback(
    (name: string) => pickPlaceLatest.current(name),
    [],
  );
  function onMapReady(api: MapApi) {
    mapApi.current = api;
    // Phones: the first view came before the map could say what of it the
    // folded list leaves in sight (see `listBoundsOf`).
    if (isMobile && mapViewRef.current) onMapView(mapViewRef.current);
    // A card hovered while the map loaded.
    api.highlight(hoveredId.current);
    // A linked place, without a view of its own, frames the map.
    if (place && !initial.view && !initialProjectId) return goToPlace(place);
    // A project link frames its project, unless the URL already places the map.
    if (initialProjectId) enterPostView(initialProjectId, !initial.view);
  }
  /**
   * On phones, a tap on the map closes a project opened from it at once; a
   * drag or a pinch folds it instead (see `onMapGesture`).
   */
  function onMapTap() {
    setSelectedId(postId);
    if (postOverMap) closePost();
  }
  function foldPost() {
    if (postOverMap && postSnap?.point === middleSnapPoint)
      movePost(foldHeight());
  }
  /**
   * Moves a project resting over the map between its heights. Folded, the
   * list folds down behind it; unfolded, it comes back up behind it, so
   * closing the project leaves it where it was.
   */
  function movePost(point: DrawerSnapPoint) {
    const from = postSnap?.point;
    setPostSnap((current) => current && { ...current, point });
    // Unfolded, back to the photos it folded past.
    if (from !== undefined && isFolded(from) && !isFolded(point))
      projectDrawer()
        ?.querySelector("[data-project-scroll]")
        ?.scrollTo({
          top: 0,
          behavior: reducedMotion() ? "instant" : "smooth",
        });
    if (listStaysFolded.current) return;
    if (isFolded(point)) {
      // Folded before the list was up behind it: it stays down, under the
      // project, and comes up as the project closes.
      backToFullList.current = false;
      meetPost.current = false;
      meetPending.current = false;
      raiseBehindPost.current = false;
      listUnderFolded.current = true;
      setSnapPoint(compactSnapPoint);
    } else if (from !== undefined && isFolded(from)) {
      listUnderFolded.current = false;
      setSnapPoint(middleSnapPoint);
    }
  }
  /**
   * Moved by hand while a project is open, the map stays where it was taken:
   * closing the project no longer returns it to where it was opened from.
   */
  function onMapMove() {
    if (!postView.current) return;
    postView.current.before = null;
    backToFullList.current = false;
  }
  /**
   * On phones, panning or zooming the map folds the list down out of its way.
   */
  function onMapGesture() {
    mapGesture.current = true;
    if (isMobile) foldPost();
    if (isMobile && !topLayer && snapPoint === middleSnapPoint)
      setSnapPoint(compactSnapPoint);
  }
  /** Frames projects on the part of the map the mobile drawer leaves open. */
  function fitProjects(list: Project[], bottom?: number) {
    mapApi.current?.fit(list.flatMap(projectPoints), { bottom, maxZoom: 14 });
  }
  // A search frames its hits once the typing pauses, so a place's name
  // takes the map there; an open project keeps the map on itself.
  const hitsKey = needle
    ? `${needle}:${searchHits.map((project) => project.id).join()}`
    : "";
  const fitHits = useEffectEvent(() => {
    if (!needle || postView.current) return;
    const bottom = isMobile ? middleMapInset() : undefined;
    // A place's name frames the place, projects in it or not.
    const named = places.find(
      (candidate) => candidate.name.toLocaleLowerCase("nb") === needle,
    );
    const extent = named && placeExtent(named.name);
    if (extent)
      return mapApi.current?.fit(extentPoints(extent), { bottom, maxZoom: 14 });
    if (searchHits.length) fitProjects(searchHits, bottom);
  });
  useEffect(() => {
    if (!hitsKey) return;
    const timer = window.setTimeout(fitHits, 450);
    return () => window.clearTimeout(timer);
  }, [hitsKey]);

  function showProfile(username: string) {
    if (username === profileName) return;
    window.history[profileName ? "replaceState" : "pushState"](
      {
        profileOverlay: true,
        profileOver: postId,
        suggestionsBelow: suggestionsOpen,
      },
      "",
      withSearch(profileHref(username)),
    );
    setModal(null);
    if (!profileName) setProfileSnap(middleSnapPoint);
    setProfileName(username);
  }
  const onOpenProfile = useEffectEvent((event: Event) =>
    showProfile((event as CustomEvent<string>).detail),
  );
  // A layout effect, so the listener is there in the commit that hydrates
  // the page: a click just after hydration would otherwise go unanswered.
  useLayoutEffect(() => {
    window.addEventListener(openProfileEvent, onOpenProfile);
    return () => window.removeEventListener(openProfileEvent, onOpenProfile);
  }, []);
  // Forslag's link, opened without an account: the list, and why not.
  const askForSuggestions = useEffectEvent(() => {
    replaceUrl(withSearch("/"));
    requireLogin("Du må være logget inn for å se forslag.");
  });
  useEffect(() => {
    if (initialPanel === "suggestions" && !user?.username) askForSuggestions();
    // Only for the page the explorer was opened on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Returns to the project or list the profile was opened over. */
  function closeProfile() {
    setProfileName(null);
    if (window.history.state?.profileOverlay) stepBack();
    else
      window.history.replaceState(
        {},
        "",
        withSearch(postId ? projectHref(postId) : "/"),
      );
  }

  /** A profile's comment opens in the profile's place in history. */
  function openFromProfile(id: string, commentId: string) {
    const overlay = Boolean(window.history.state?.profileOverlay);
    setProfileName(null);
    if (id === postId && overlay) {
      setPostTarget({ commentId });
      return stepBack();
    }
    window.history.replaceState(
      { projectOverlay: overlay, suggestionsBelow: suggestionsOpen },
      "",
      withSearch(projectHref(id)),
    );
    setPostTarget({ commentId });
    setPostSnap(null);
    setPostId(id);
    setSelectedId(id);
    enterPostView(id);
  }

  // Mobile: the map controls sit on the popup of the drawer over the map,
  // just above its top edge, so whatever moves the drawer moves them too:
  // the list's, or a project's resting at the middle height above it. Above
  // the middle stop, where the drawer would cover them, they fade out
  // instead of riding up.
  const {
    slot: controlsSlot,
    node: controlsSlotNode,
    follow: followDrawer,
  } = useControlsSlot();
  const {
    slot: postControlsSlot,
    node: postControlsSlotNode,
    follow: followPostDrawer,
  } = useControlsSlot();
  // Phones: a project resting at the middle height, the map above it.
  const postOverMap =
    isMobile &&
    topLayer === "project" &&
    postSnap?.id === postId &&
    postSnap.point !== 1;
  // What of the map's bottom a drawer covers, for framing and the list.
  const mapInset = useRef(compactMapInset);
  const listAtMiddle = isMobile && snapPoint === middleSnapPoint;
  const postFolded =
    postOverMap && postSnap && isFolded(postSnap.point)
      ? Number.parseInt(String(postSnap.point))
      : 0;
  useLayoutEffect(() => {
    mapInset.current = postFolded
      ? postFolded
      : postOverMap || listAtMiddle
        ? middleMapInset()
        : compactMapInset;
  }, [postOverMap, postFolded, listAtMiddle]);
  const mobileMapInset = useCallback(() => mapInset.current, []);
  // A project closed before the list reached it, or while folded over it,
  // leaves the list at the middle height all the same.
  function listRisesAfterPost() {
    return (
      meetPost.current ||
      meetPending.current ||
      raiseBehindPost.current ||
      listUnderFolded.current
    );
  }
  /** Where the list comes to rest once the open project closes. */
  function listPointAfterPost() {
    if (backToFullList.current) return 1;
    return listRisesAfterPost() ? middleSnapPoint : snapPoint;
  }
  useLayoutEffect(() => {
    if (!postId) listStaysFolded.current = false;
    if (postId || !(backToFullList.current || listRisesAfterPost())) return;
    meetPost.current = false;
    meetPending.current = false;
    raiseBehindPost.current = false;
    listUnderFolded.current = false;
    setSnapPoint(backToFullList.current ? 1 : middleSnapPoint);
  }, [postId]);

  function openPost(id: string, target: PostTarget = {}, overMap = false) {
    // The project folded over the map, tapped on it: it unfolds.
    if (isMobile && overMap && id === postId && postSnap?.id === id) {
      if (isFolded(postSnap.point)) movePost(middleSnapPoint);
      return;
    }
    setPostTarget(target);
    if (!(isMobile && overMap)) listStaysFolded.current = false;
    setPostSnap(isMobile && overMap ? { id, point: middleSnapPoint } : null);
    // Before the map moves, so closing returns to where it was.
    enterPostView(id);
    const project = projects.find((item) => item.id === id);
    if (isMobile && overMap) {
      // The list comes to the middle height behind it, unless it was folded
      // down, and the map centers the project above it.
      const folded = snapPoint === compactSnapPoint;
      meetPost.current = snapPoint === 1;
      if (snapPoint === 1 && !postId) {
        backToFullList.current = true;
        // The list behind the project keeps what it holds as the map moves.
        setFrozenBounds(frozenBounds ?? viewBounds);
      }
      raiseBehindPost.current = folded && listUnderFolded.current;
      listStaysFolded.current =
        folded && (!postId || listStaysFolded.current);
      mapInset.current = middleMapInset();
      if (project) mapApi.current?.center(projectPoints(project));
    }
    projectTriggerRef.current =
      document.activeElement instanceof HTMLElement ||
      document.activeElement instanceof SVGElement
        ? document.activeElement
        : null;
    // On desktop the panel it was opened from stays under it.
    if (isMobile) setModal(null);
    setPostId(id);
    setSelectedId(id);
    highlight(null);
    // Opened from the map over another project, it takes that one's place:
    // closing it goes back to what was under both.
    if (overMap && postId && !profileName)
      replaceUrl(withSearch(projectHref(id)));
    else
      window.history.pushState(
        { projectOverlay: true, suggestionsBelow: suggestionsOpen },
        "",
        withSearch(projectHref(id)),
      );
  }

  /**
   * The compact drawer hides the list, so focus returns to its handle.
   * `after` runs once the URL is back on the list.
   */
  function closePost(
    focusTrigger = !isMobile || snapPoint !== compactSnapPoint,
    after?: () => void,
  ) {
    const state = window.history.state ?? {};
    setPostId(null);
    setSelectedId(null);
    requestAnimationFrame(() => {
      const trigger = projectTriggerRef.current;
      if (trigger?.isConnected && focusTrigger)
        trigger.focus({ preventScroll: true });
      else if (isMobile)
        drawerHandleRef.current?.focus({ preventScroll: true });
    });
    if (state.projectOverlay) {
      // The history step leaves the map view as well (see onPopState).
      afterPop.current = after ?? null;
      stepBack();
    } else {
      window.history.replaceState(
        {},
        "",
        withSearch(suggestionsOpen ? "/forslag" : "/"),
      );
      leavePostView();
      after?.();
    }
  }

  /** Where the collapsed toggle rests: just right of the corner tab's logo. */
  const [toggleRest, setToggleRest] = useState(128);
  function toggleCollapsed() {
    animateFrom();
    storeCollapsed(sidebarMode !== "collapsed");
  }
  useEffect(() => {
    if (isMobile || !mapApi.current) return;
    mapApi.current.syncSize();
    // Runs once the map has its new width: at the start of collapsing, and
    // the end of expanding.
  }, [asideCollapsed, sidebarMode, isMobile]);

  // Opening a project, from anywhere, remembers it and reads what is new on
  // it, and so does activity that arrives while it stays open.
  const openNews = postId ? news.get(postId) : undefined;
  useEffect(() => {
    if (postId && projects.some((project) => project.id === postId))
      void markSeen(postId);
  }, [postId, openNews, projects, markSeen]);

  // Saving shows at once; a failure puts it back and says so.
  function toggleSave(id: string) {
    if (
      !requireLogin("Du må være logget inn for å lagre prosjekter.", {
        type: "save",
        projectId: id,
      })
    )
      return;
    const exists = savedIds.has(id);
    void mutate({ action: "save", projectId: id, saved: !exists }).catch(
      (error) =>
        notify(errorMessage(error, "Kunne ikke lagre prosjektet."), {
          error: true,
        }),
    );
    const title =
      projects.find((project) => project.id === id)?.title || "Prosjektet";
    notify(exists ? `Fjernet ${title} fra lagrede` : `Lagret ${title}`, {
      undo: () => {
        void mutate({
          action: "save",
          projectId: id,
          saved: exists,
        }).catch((error) =>
          notify(errorMessage(error, "Kunne ikke angre endringen."), {
            error: true,
          }),
        );
      },
    });
  }

  // Back from logging in, what was asked for goes ahead.
  useEffect(() => {
    if (!user?.username) return;
    // The intent is kept in session storage, outside React.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (takeLoginIntent("suggest-project")) setEditorOpen(true);
    if (takeLoginIntent("account")) openProfile("settings");
    const save = takeLoginIntent("save");
    if (!save) return;
    void mutate({
      action: "save",
      projectId: save.projectId,
      saved: true,
    }).catch((error) =>
      notify(errorMessage(error, "Kunne ikke lagre prosjektet."), {
        error: true,
      }),
    );
    // An intent is consumed once when the account is ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.username]);

  const statusChanged = !sameValues(status, defaultStatus);
  const filtersChanged = statusChanged || category.length > 0 || !!needle;
  function resetFilters() {
    setQuery("");
    setStatus(defaultStatus);
    setCategory([]);
  }

  function showList() {
    setModal(null);
    setSavedOnly(false);
    setSnapPoint(1);
  }

  const brand = (
    <Link
      className={cn(
        "group flex min-h-11 items-center whitespace-nowrap font-bold text-ink",
        "text-xl tracking-[-0.025em]",
        isMobile ? "gap-1.5" : "gap-2",
      )}
      href="/"
      aria-label="Planfri hjem"
      onClick={(event) => {
        event.preventDefault();
        resetFilters();
        const norway = () => mapApi.current?.showNorway();
        if (postId) closePost(undefined, norway);
        else norway();
        showList();
      }}
    >
      <BrandMark className={isMobile ? "size-6" : "size-7"} />
      <span>Planfri</span>
    </Link>
  );

  // Desktop: always there, between the place and the filters.
  const desktopSearch = (
    <div
      className={cn(
        "flex h-9 min-w-30 flex-1 items-center gap-2 rounded-full border border-border bg-surface pr-0.5 pl-3 text-muted",
        "transition-[border-color,box-shadow] duration-150 focus-within:border-accent/50 focus-within:ring-3 focus-within:ring-accent/10 motion-reduce:transition-none",
      )}
      data-search-field=""
    >
      <Search className="shrink-0" size={15} aria-hidden="true" />
      <input
        ref={searchRef}
        className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-ui text-ink outline-none shadow-none placeholder:truncate placeholder:text-muted"
        id="project-search"
        enterKeyHint="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Søk prosjekt eller sted"
        aria-label="Søk etter prosjekt eller sted"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            closeSearch();
          }
          if (event.key === "Enter" && listedProjects.length === 1)
            openPost(listedProjects[0].id, {}, true);
        }}
      />
      {query && (
        <button
          type="button"
          className={cn(
            compactIconAction,
            "size-8 shrink-0 rounded-full text-muted hover:text-ink",
          )}
          aria-label="Tøm søk"
          onClick={() => {
            setQuery("");
            searchRef.current?.focus({ preventScroll: true });
          }}
        >
          <X size={15} />
        </button>
      )}
    </div>
  );
  // Category and status gather in one sheet (phones) or popover, behind
  // this button; on phones, the search too.
  const filtersSet = isMobile
    ? filtersChanged
    : statusChanged || category.length > 0;
  const filterButton = (
    <button
      ref={filterButtonRef}
      type="button"
      className={cn(
        // Hover tints and colours at once, as the sort beside it does.
        "relative flex shrink-0 items-center justify-center text-muted",
        isMobile
          ? "size-11 rounded-full [-webkit-tap-highlight-color:transparent]"
          : "size-9 rounded-lg hover:bg-ink/[0.05] hover:text-ink",
        filtersSet && "text-ink",
      )}
      aria-label="Filtre"
      aria-haspopup="dialog"
      aria-expanded={!!filterSheetOpen}
      data-active={filtersSet || undefined}
      data-press=""
      data-tooltip={isMobile ? undefined : "Filtre"}
      {...(isMobile
        ? { onClick: () => setFilterSheetOpen(true) }
        : { popoverTarget: "project-filters" })}
    >
      <SlidersHorizontal size={isMobile ? 19 : 16} aria-hidden="true" />
      {filtersSet && (
        <span
          aria-hidden="true"
          className={cn(
            "absolute size-2 rounded-full border-[1.5px] border-surface bg-accent box-content",
            isMobile ? "top-2.5 right-2" : "top-1.5 right-1",
          )}
        />
      )}
    </button>
  );
  // The main cities, then other cities and counties with projects, A–Å;
  // `PlaceSelect` puts those pinned above them.
  const placeOptions = useMemo(() => {
    const listed = new Set(
      projects.flatMap((project) => placesOf.get(project.id) ?? []),
    );
    for (const part of placeParts(place)) listed.add(part.name);
    const option = (name: string) => ({
      value: name,
      label: name,
      pinnable: true,
    });
    return [
      { value: "", label: "Hele Norge" },
      ...mainCities.map(option),
      ...places
        .filter(({ name }) => listed.has(name) && !mainCities.includes(name))
        .map(({ name }) => name)
        .sort((a, b) => a.localeCompare(b, "nb"))
        .map((name, index) => ({ ...option(name), divider: index === 0 })),
    ];
  }, [place, placesOf, projects]);
  // With every match in sight, the view is as good as all of Norway.
  const allInView = useMemo(
    () =>
      !listBounds ||
      matching.every((project) => projectInBounds(project, listBounds)),
    [listBounds, matching],
  );
  const placeFallback = allInView ? "Hele Norge" : "Velg sted";
  // Every status shown is no filter; the last one shown can't be hidden.
  const statusValue = status.length ? status : statusOrder;
  const pickStatus = useCallback((next: string[]) => {
    if (next.length === 0) return;
    setStatus(next);
  }, []);
  // Phones: at the end of the tabs' line, the filters, then the place, its
  // chevron on the list's edge.
  const mobileFilters = (
    <section
      className="-mr-2 ml-auto flex min-w-0 items-center"
      aria-label="Filtrer prosjekter"
    >
      {filterButton}
      <LivePlaceSelect
        live={livePlace}
        label="Sted"
        goTo
        place={place}
        fallback={placeFallback}
        onChange={choosePlace}
        className={cn(
          inlineChoiceClasses,
          "[&_[data-slot=choice-trigger]>span:nth-of-type(2)]:hidden",
        )}
        options={placeOptions}
      />
    </section>
  );
  const shownStatuses = statusOrder.filter((value) =>
    statusValue.includes(value),
  );
  const filterSections: FilterSection[] = [
    {
      id: "category",
      label: "Kategori",
      summary: category.length ? categorySummary(category) : null,
      content: (
        <ChoiceSelect
          inline
          compact={!isMobile}
          label="Kategori"
          multiple
          value={category}
          onChange={setCategory}
          options={categoryOptions}
        />
      ),
    },
    {
      id: "status",
      label: "Status",
      summary:
        shownStatuses.length === statusOrder.length
          ? "Alle"
          : shownStatuses.length === 1
            ? statuses[shownStatuses[0]].label
            : `${shownStatuses.length} av ${statusOrder.length}`,
      content: (
        <ChoiceSelect
          inline
          compact={!isMobile}
          label="Prosjektstatus"
          multiple
          value={statusValue}
          onChange={pickStatus}
          options={statusOptions}
        />
      ),
    },
  ];
  const filterSheet = filterSheetOpen && (
    <FilterSheet
      label="Filtre"
      title="Filtrer prosjekter"
      onClose={() => setFilterSheetOpen(false)}
      sections={filterSections}
      search={{
        value: query,
        onChange: setQuery,
        focus: filterSheetOpen === "search",
        onSubmit: () => {
          // One hit opens; more show in the list, raised to show them.
          if (listedProjects.length === 1)
            openPost(listedProjects[0].id, {}, true);
          else if (snapPoint === compactSnapPoint)
            setSnapPoint(middleSnapPoint);
        },
      }}
    />
  );
  const filterPopover = (
    <FilterPopover
      id="project-filters"
      label="Filtre"
      anchor={filterButtonRef}
      onOpenChange={setFilterSheetOpen}
      sections={filterSections}
    />
  );

  const sortFilter = (
    <ChoiceSelect
      label="Sorter prosjekter"
      value={sort}
      // Beside the longer count, or in a narrow sidebar, the order keeps its
      // icon alone, its name folding away; the menu names it.
      className={cn(
        sortChoice,
        // Beside the view switch, not at the edge: no overhang.
        "mr-0",
        sortLabel,
        outsideHits > 0 ? sortLabelFolded : sortLabelNarrow,
        // Phones: its icon alone, as the view button's beside it.
        "max-md:[&_[data-slot=choice-trigger]>span]:sr-only",
      )}
      icon={sortIcon}
      triggerTooltip={isMobile ? undefined : "Sorter prosjekter"}
      triggerDot={!isMobile && sort !== defaultSort}
      onChange={setSort}
      options={sortOptions}
    />
  );
  // Phones: one button naming the view, its views in a sheet.
  // Phones: one button showing the view's symbol, its views in a sheet,
  // which name them.
  const densityMenu = (
    <ChoiceSelect
      label="Visning"
      value={density}
      onChange={pickDensity}
      icon={densityIcons[density]}
      className={cn(sortChoice, "[&_[data-slot=choice-trigger]>span]:sr-only")}
      options={densityChoices}
    />
  );
  const densitySwitch = (
    <div
      className="flex shrink-0 rounded-lg bg-ink/[0.05] p-0.5"
      role="group"
      aria-label="Visning"
    >
      {densityOptions.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          className={cn(
            // As tall as the sort beside it; the pressed pill moves with the
            // press, as the list does.
            "relative inline-flex h-8 min-w-8 items-center justify-center rounded-md px-[8.5px] text-muted",
            "hover:text-ink aria-pressed:bg-surface aria-pressed:text-ink aria-pressed:shadow-xs",
          )}
          aria-label={label}
          aria-pressed={density === value}
          data-tooltip={label}
          data-press=""
          onClick={() => storeDensity(value)}
        >
          <Icon size={16} className="shrink-0" aria-hidden="true" />
          {/* The pressed view names itself: the name opens out beside its
              symbol as the last one folds away. */}
          <span
            className={cn(
              "grid transition-[grid-template-columns,opacity,visibility] duration-180 ease-out-soft motion-reduce:transition-none",
              density === value
                ? // A narrow sidebar keeps the symbols alone.
                  "grid-cols-[1fr] opacity-100 narrow:invisible narrow:grid-cols-[0fr] narrow:opacity-0"
                : "grid-cols-[0fr] opacity-0",
            )}
            aria-hidden="true"
            data-view-label=""
            // Named here while pressed, so no tooltip unless this is hidden.
            data-tooltip-label={density === value ? "" : undefined}
          >
            <span className="min-w-0 overflow-hidden whitespace-nowrap">
              <span className="pl-1.5 text-xs font-medium">{label}</span>
            </span>
          </span>
        </button>
      ))}
    </div>
  );
  const placeFilter = (
    <PlaceSelect
      label="Sted"
      smoothWidth
      goTo
      value={place}
      onChange={choosePlace}
      triggerLabel={place || placeFallback}
      className={cn(
        placeChoiceClasses,
        // Always named; narrow, a long name gives way.
        "shrink-0 narrow:shrink",
      )}
      options={placeOptions}
    />
  );
  const desktopFilters = (
    <section
      className="mb-1 flex h-9 items-center gap-2"
      aria-label="Filtrer prosjekter"
    >
      {placeFilter}
      {desktopSearch}
      {filterButton}
    </section>
  );

  const shown = listedProjects.length;
  // Beside the map, the place the view is on, and how many match there.
  const countPlace = listBounds && place && !searching ? place : "";
  const inPlace = useMemo(
    () =>
      countPlace
        ? searchHits.filter((project) =>
            inPlaceNamed(placesOf.get(project.id), countPlace),
          ).length
        : 0,
    [countPlace, placesOf, searchHits],
  );
  const showInPlace = !!countPlace && inPlace !== shown;
  // The matches in the place the map is on, or in all of Norway: what
  // "Nytt" shows, not just those in view.
  const placeProjects = useMemo(
    () =>
      place
        ? searchHits.filter((project) =>
            inPlaceNamed(placesOf.get(project.id), place),
          )
        : searchHits,
    [place, placesOf, searchHits],
  );
  const feedProjects = feedOn ? placeProjects : noProjects;
  // "Nytt" gets a dot while any of them has news the user hasn't read.
  const feedUnread = useMemo(
    () =>
      placeProjects.some((project) => {
        const item = news.get(project.id);
        return item ? unreadCount(item) > 0 : false;
      }),
    [news, placeProjects],
  );
  const feedLabel = `Nytt fra ${placeProjects.length} ${placeProjects.length === 1 ? "prosjekt" : "prosjekter"} i ${place || "Norge"}`;
  const inPlaceLabel = `${inPlace} i ${countPlace}`;
  const projectsWord = (count: number) =>
    count === 1 ? "prosjekt" : "prosjekter";
  // What the list holds, in words: the news; a search's hits; what's on
  // the map, then, when the place it's on has more out of view, how many
  // there, which shows them below.
  const hitsLabel = shown === 0 ? "Ingen treff" : `${shown} treff`;
  const listCount = feedOn ? (
    <span className="min-w-0 truncate" role="status" aria-label={feedLabel}>
      {feedLabel}
    </span>
  ) : searching ? (
    <span role="status" aria-label={hitsLabel}>
      {hitsLabel}
    </span>
  ) : outsideHits > 0 ? (
    <span className="flex min-w-0 items-center whitespace-nowrap">
      <span role="status" aria-label={`${shown} på kartet`}>
        {`${shown} på kartet`}
      </span>
      {showInPlace && (
        <>
          <span className="px-1.5" aria-hidden="true">
            ·
          </span>
          <button
            type="button"
            className={cn(
              "relative min-w-0 truncate text-muted underline-offset-3 hover:text-ink hover:underline",
              // Fingers get room past the line.
              "pointer-coarse:after:absolute pointer-coarse:after:-inset-2",
            )}
            aria-label={`${inPlace} ${projectsWord(inPlace)} i ${countPlace}`}
            data-in-place=""
            onClick={() => {
              const show = () =>
                listRef.current
                  ?.querySelector("[data-off-map-toggle]")
                  ?.dispatchEvent(new Event(showOffMapEvent));
              if (!isMobile || snapPoint === 1) return show();
              // The drawer rises to full height first, and its list takes
              // that height (see `restOffset`) before it scrolls, the two
              // moving together.
              setSnapPoint(1);
              requestAnimationFrame(() => requestAnimationFrame(show));
            }}
          >
            {inPlaceLabel}
          </button>
        </>
      )}
    </span>
  ) : (
    <span role="status" aria-label={`${shown} ${projectsWord(shown)}`}>
      {`${shown} ${projectsWord(shown)}`}
    </span>
  );
  // Only filters can be undone; an empty stretch of map has no action.
  const emptyActions = filtersChanged && [
    <EmptyAction key="reset" onClick={resetFilters}>
      Nullstill filtre
    </EmptyAction>,
  ];
  const nothingMatches = matching.length === 0 && !savedOnly;
  // Stable, so memoized cards skip re-rendering when the list changes.
  const openLatest = useRef(openPost);
  useLayoutEffect(() => {
    openLatest.current = openPost;
  });
  const newsLatest = useRef(news);
  useLayoutEffect(() => {
    newsLatest.current = news;
  });
  // A card with something new opens at the oldest of it, unless it shows
  // an update or comment of its own to open at.
  const openCard = useCallback(
    (id: string, target?: CardTarget) => {
      if (typeof target === "object") return openLatest.current(id, target);
      const section = target;
      const item = newsLatest.current.get(id);
      openLatest.current(
        id,
        section || !item?.first ? { section } : item.first,
      );
    },
    [],
  );
  // The list's cards open at the middle height over the map, unless they
  // open at something further down, which needs the room.
  const openListCard = useCallback(
    (id: string, target?: CardTarget) => {
      if (target || newsLatest.current.get(id)?.first) openCard(id, target);
      else openLatest.current(id, {}, true);
    },
    [openCard],
  );
  const feed = useMemo(
    () => (feedOn ? feedEntries(feedProjects, activity) : []),
    [activity, feedOn, feedProjects],
  );
  // A row opens at what it shows, over the map like a card.
  const openFeedRow = useCallback((id: string, target: FeedTarget) => {
    if (target.updateId || target.commentId) openLatest.current(id, target);
    else openLatest.current(id, {}, true);
  }, []);
  const saveLatest = useRef(toggleSave);
  useLayoutEffect(() => {
    saveLatest.current = toggleSave;
  });
  const saveCard = useCallback((id: string) => saveLatest.current(id), []);
  const hoverCard = useCallback((id: string, hovering: boolean) => {
    const current = hoveredId.current;
    const next = hovering ? id : current === id ? null : current;
    hoveredId.current = next;
    mapApi.current?.highlight(next);
  }, []);
  // Below what's in view, the rest of the place it's on, muted. Which side
  // a row is on travels with it through the list's motion, so it changes
  // sides in the swap, measured, not a render ahead of it: split by the
  // live set, rows changed lists before their places were read, jumping
  // and mounting anew outside the transition.
  const listItems = useMemo(
    () => [
      ...listedProjects.map((project) => ({ project, offMap: false })),
      ...offMapProjects.map((project) => ({ project, offMap: true })),
    ],
    [listedProjects, offMapProjects],
  );
  const renderCard = ({ project, offMap }: ListRow) => (
    <ProjectCard
      key={project.id}
      project={project}
      commentCount={activity[project.id]?.comments ?? 0}
      density={density}
      saved={savedIds.has(project.id)}
      offMap={offMap}
      news={news.get(project.id)}
      onOpen={openListCard}
      onSave={saveCard}
      onHover={hoverCard}
    />
  );
  /**
   * On desktop the header stays put over the list, and fades along the
   * list's edges show there is more past either end, as in the phone's
   * sheets: whole once a fade's height or more is left that way, gone at
   * that end. Clamped, so a bounce past an end doesn't flash them.
   */
  function updateListFades() {
    const scroller = listRef.current;
    if (!scroller) return;
    const below =
      scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop;
    for (const [overlay, left] of [
      [listTopFade.current, scroller.scrollTop],
      [listBottomFade.current, below],
    ] as const) {
      if (!overlay) continue;
      const height = overlay.offsetHeight || 32;
      overlay.style.opacity = String(Math.min(1, Math.max(0, left / height)));
    }
  }
  const refreshListFades = useEffectEvent(updateListFades);
  // Resizing, and rows coming and going, change what's left.
  useLayoutEffect(() => {
    if (isMobile) return;
    refreshListFades();
    const observer = new ResizeObserver(() => refreshListFades());
    if (listRef.current) observer.observe(listRef.current);
    if (listContentRef.current) observer.observe(listContentRef.current);
    return () => observer.disconnect();
  }, [isMobile]);
  // The projects, or what's new on them, as the project page's tabs are.
  const listTabs = (
    [
      { id: "projects", label: "Prosjekter" },
      { id: "feed", label: "Nytt" },
    ] as const
  ).map(({ id, label }) => (
    <button
      key={id}
      type="button"
      className={cn(
        "relative -mb-px flex items-center gap-1.5 border-b-2 border-transparent",
        "text-sm leading-normal font-medium whitespace-nowrap text-muted",
        "hover:text-ink",
        "aria-pressed:border-ink aria-pressed:text-ink",
      )}
      aria-pressed={tab === id}
      aria-label={
        id === "feed" && feedUnread ? `${label}, med uleste` : undefined
      }
      data-list-tab={id}
      data-press=""
      onClick={() => setTab(id)}
    >
      {label}
      {id === "feed" && feedUnread && (
        <i
          className="size-1.5 shrink-0 rounded-full bg-accent"
          aria-hidden="true"
          data-unread-mark=""
        />
      )}
    </button>
  ));
  // On phones the header scrolls away with the rows.
  const projectResults = (header?: ReactNode) => (
    <section
      ref={listRef}
      data-drawer-scroll
      className="group/list min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain bg-surface scrollbar-thin max-md:bg-transparent"
      aria-label="Prosjektliste"
      onScroll={isMobile ? undefined : updateListFades}
    >
      {!isMobile && (
        // Under the header: more above, once scrolled.
        <div
          aria-hidden="true"
          className="pointer-events-none sticky top-0 z-10 h-0"
        >
          <div
            ref={listTopFade}
            data-list-fade="top"
            className="h-8 bg-linear-to-b from-surface to-transparent opacity-0"
          />
        </div>
      )}
      {header && (
        <>
          {/* Over the rows as they scroll under the screen's top, once the
              header has scrolled away with them. */}
          <div
            aria-hidden="true"
            className="pointer-events-none sticky top-0 z-10 h-0"
          >
            <div className="h-8 bg-linear-to-b from-surface to-transparent opacity-0 transition-opacity duration-150 group-data-scrolled/list:opacity-100 motion-reduce:transition-none" />
          </div>
          {header}
        </>
      )}
      <div
        ref={listContentRef}
        className={cn(
          // At least as tall as the list, so on desktop "Foreslå prosjekt"
          // sits at the bottom however few rows there are. On phones it
          // follows the last row, as the drawer's height keeps changing.
          "@container/list flex min-h-full flex-col pb-5 max-md:px-4.5 max-md:pt-0 max-md:pb-6 md:px-gutter-scroll",
        )}
      >
        {isMobile ? filterSheet : desktopFilters}
        {!isMobile && filterPopover}
        {/* The list's tabs, with the projects' order and layout beside them
            on desktop, and the filters and place on phones. */}
        <div className="flex min-h-12 items-stretch justify-between gap-x-3 border-b border-border max-md:min-h-11 max-md:gap-x-2">
          <h1 className="sr-only">Prosjekter</h1>
          <nav className="flex shrink-0 items-stretch gap-5" aria-label="Liste">
            {listTabs}
          </nav>
          {isMobile ? (
            mobileFilters
          ) : (
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              {/* "Nytt" has its own order, and rows of its own. */}
              {!feedOn && sortFilter}
              {!feedOn && densitySwitch}
            </div>
          )}
        </div>
        {/* What the list holds, and a way back from the filters; on phones,
            the order and layout at its end. Ruled below, its text centred
            between the rules, so the first row has a line above it too. */}
        <div
          className="flex min-h-9 items-center justify-between gap-x-3 border-b border-border py-2 text-ui text-muted tabular-nums max-md:min-h-11 max-md:gap-x-2 max-md:py-0"
          data-list-count=""
        >
          {listCount}
          {(filtersChanged || (isMobile && !feedOn)) && (
            <div className="flex shrink-0 items-center">
              {filtersChanged && (
                <button
                  type="button"
                  className="relative shrink-0 text-xs whitespace-nowrap text-muted underline-offset-3 hover:text-ink hover:underline pointer-coarse:after:absolute pointer-coarse:after:-inset-2 max-md:mr-1"
                  onClick={resetFilters}
                >
                  Nullstill filtre
                </button>
              )}
              {isMobile && !feedOn && sortFilter}
              {isMobile && !feedOn && densityMenu}
            </div>
          )}
        </div>
        {!feedOn && !searching && <WelcomeRow />}
        {feedOn && feedProjects.length > 0 && (
          <ol aria-label="Nytt">
            {feed.map((entry) => (
              <FeedRow
                key={entry.project.id}
                entry={entry}
                news={news.get(entry.project.id)}
                onOpen={openFeedRow}
                onHover={hoverCard}
              />
            ))}
          </ol>
        )}
        <ListRows
          items={listItems}
          scroller={listRef}
          renderCard={renderCard}
          hidden={feedOn}
          offMapLabel={`Utenfor kartet i ${place}`}
          empty={
            feedOn && feedProjects.length > 0 ? null : (
              // Fades in as the last rows fade out over it; a tab shows
              // it at once.
              <div className={feedOn ? undefined : "animate-panel-fade-in"}>
                <EmptyState
                  level={2}
                  icon={
                    filtersChanged ? (
                      <Search size={24} />
                    ) : (
                      <MapPin size={24} />
                    )
                  }
                  title={
                    filtersChanged ? "Ingen treff" : "Ingen prosjekter her"
                  }
                >
                  {emptyActions}
                </EmptyState>
              </div>
            )
          }
        />
        <div className="flex pt-3 md:mt-auto">
          {/* Pulled out by its padding, border and the plus's own inset, so
              the plus lines up with the rows' text. */}
          <button
            type="button"
            className={cn(quietAction, "-ml-3 gap-1.5 text-muted hover:text-ink")}
            onClick={() => openEditorHere()}
          >
            <Plus size={16} aria-hidden="true" />
            {canModerate ? "Legg til prosjekt" : "Foreslå prosjekt"}
          </button>
        </div>
      </div>
      {!isMobile && (
        // More below: fades out over the last stretch of scrolling.
        <div
          aria-hidden="true"
          className="pointer-events-none sticky bottom-0 z-10 h-0"
        >
          <div
            ref={listBottomFade}
            data-list-fade="bottom"
            className="absolute inset-x-0 bottom-0 h-10 bg-linear-to-t from-surface to-transparent opacity-0"
          />
        </div>
      )}
    </section>
  );

  const projectPost = post && (
    <ProjectPost
      key={post.id}
      project={post}
      initialUpdateId={postTarget.updateId}
      initialCommentId={postTarget.commentId}
      initialSection={postTarget.section}
      closeOnEscape={!panelClosing && topLayer === "project"}
      onClose={() => {
        if (!panelClosing) closePost();
      }}
      mobile={isMobile}
      saved={savedIds.has(post.id)}
      onSave={() => toggleSave(post.id)}
      onNotify={notify}
    />
  );

  const missingProject = (
    <div className="flex min-h-[250px] flex-col items-center justify-center gap-[18px] px-6 py-[55px] text-center text-muted">
      <MapPin size={24} />
      <h2 className="text-body font-medium text-ink">Prosjektet finnes ikke</h2>
      <button className={primaryCta} onClick={() => closePost()}>
        Tilbake til prosjektene
      </button>
    </div>
  );

  /**
   * Members suggest projects; moderators add them directly, optionally from
   * a head start. A draft in progress isn't replaced: closing it asks first.
   */
  function openEditor(draft?: Partial<Project>, view?: MapView) {
    if (editorOpen) {
      // Without a head start, the open draft just stays.
      if (!draft && !view) return;
      if (editorDirty.current?.()) editorClose.current?.();
      else setEditorSeed(({ key }) => ({ key: key + 1, draft, view }));
      return;
    }
    setEditorSeed(({ key }) => ({ key: key + 1, draft, view }));
    if (
      canModerate ||
      requireLogin("Du må være logget inn for å foreslå prosjekter.", {
        type: "suggest-project",
      })
    ) {
      rememberTrigger("editor");
      setEditorOpen(true);
    }
  }
  /** A new project starts where the map is, and in the place it shows. */
  function openEditorHere() {
    const view = mapViewRef.current;
    if (!view) return openEditor();
    const [city] = view.zoom >= 9 ? projectPlaces("", view.center) : [];
    openEditor(city ? { city } : undefined, {
      center: view.center,
      zoom: view.zoom,
    });
  }
  function openProfile(start: "profile" | "settings" = "profile") {
    // Phones: settings are a sheet over whatever is open.
    if (start === "settings" && isMobile) return setSettingsOpen(true);
    rememberTrigger("account");
    setAccountStart(({ n }) => ({ view: start, n: n + 1 }));
    if (modal !== "profile") setAccountSnap(middleSnapPoint);
    setModal("profile");
  }
  /** The account menu opens the saved projects. */
  function showSaved() {
    if (!requireLogin("Du må være logget inn for å se lagrede prosjekter."))
      return;
    rememberTrigger("saved");
    if (postId) closePost();
    setModal(null);
    setSavedOnly(true);
  }
  /** Desktop: Forslag opens as a panel, on its own URL. */
  function openSuggestions() {
    rememberTrigger("suggestions");
    setModal(null);
    setSavedOnly(false);
    setSuggestionsOpen(true);
    window.history.pushState(
      { suggestionsOverlay: true },
      "",
      withSearch("/forslag"),
    );
  }
  function closeSuggestions() {
    setSuggestionsOpen(false);
    if (window.history.state?.suggestionsOverlay) stepBack();
    else window.history.replaceState({}, "", withSearch("/"));
  }
  function minimizeDrawer() {
    if (postId) closePost(false);
    setModal(null);
    setSnapPoint(compactSnapPoint);
  }

  const drawerPopupRef = (node: HTMLDivElement | null) => {
    drawerContentRef.current = node;
    // A transition: the list renders into the drawer in slices while its
    // static copy still shows, then both swap in one commit.
    if (node) startTransition(() => setDrawerReady(true));
  };
  function signedOut(everywhere = false) {
    setSignOutOpen(false);
    setSettingsOpen(false);
    setModal(null);
    setSavedOnly(false);
    if (suggestionsOpen) closeSuggestions();
    notify(
      everywhere ? "Du er logget ut på alle enheter" : "Du er logget ut",
    );
  }
  function switchMemberView(on: boolean) {
    setMemberView(on);
    // The pending count and the like differ for a member: read them again.
    void refresh().catch(() => {});
    notify(
      on
        ? "Moderatormodus er av. Du ser appen som en vanlig bruker"
        : "Moderatormodus er på",
    );
  }
  const profileButtonClass = cn(
    "inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-transparent text-xs font-semibold text-muted",
    "hover:bg-ink/[0.05] hover:text-ink active:scale-[0.97] data-popup-open:bg-ink/[0.05] motion-reduce:transition-none motion-reduce:active:scale-100",
    // On phones the avatar, not its hit area, meets the content's edge.
    isMobile && "-mr-1",
  );
  const profileButton = user?.username ? (
    <AccountMenu
      username={user.username}
      mobile={isMobile}
      triggerClassName={profileButtonClass}
      triggerLabel={`Konto${reviewed ? ` (${reviewed} behandlet)` : ""}`}
      triggerTooltip={isMobile || authPending ? undefined : `@${user.username}`}
      trigger={
        <span className="relative">
          <ProfileAvatar name={user.username} className="size-9 text-sm" />
          {(reviewed > 0 || (canModerate && suggestions > 0)) && (
            <span className={reviewedDot} />
          )}
        </span>
      }
      suggestions={suggestions}
      reviewed={reviewed}
      onSuggestions={() => openSuggestions()}
      onProfile={() => openProfile()}
      onSaved={showSaved}
      onSettings={() => openProfile("settings")}
      onMemberView={switchMemberView}
      onSignOut={() => setSignOutOpen(true)}
    />
  ) : user ? (
    <button
      className={profileButtonClass}
      aria-label="Din profil"
      aria-haspopup="dialog"
      aria-expanded={modal === "profile"}
      data-press=""
      data-tooltip={isMobile || authPending ? undefined : "Velg brukernavn"}
      onClick={() => openProfile()}
    >
      <User size={18} />
    </button>
  ) : (
    // Signed out, logging in is the header's one action: a label in the
    // icon row, borderless like its neighbours so it doesn't echo the filter
    // pills. A narrow sidebar folds the label into its icon.
    <button
      type="button"
      className={cn(
        compactIconAction,
        "w-auto px-3 text-ui font-medium text-ink",
      )}
      aria-label="Logg inn"
      aria-haspopup="dialog"
      data-login-button=""
      data-press=""
      data-tooltip="Logg inn"
      onClick={() => requireLogin()}
    >
      <span className="fold folded narrow:unfolded" aria-hidden="true">
        <span>
          <LogIn size={18} />
        </span>
      </span>
      <span className="fold unfolded narrow:folded" data-tooltip-label="">
        <span className="whitespace-nowrap">Logg inn</span>
      </span>
    </button>
  );
  const sidebarToggle = (
    <button
      type="button"
      className={cn(compactIconAction, "text-muted hover:text-ink")}
      aria-label={
        sidebarMode === "collapsed"
          ? "Vis prosjektlisten"
          : "Skjul prosjektlisten"
      }
      data-tooltip={
        sidebarMode === "collapsed"
          ? "Vis prosjektlisten"
          : "Skjul prosjektlisten"
      }
      aria-expanded={sidebarMode !== "collapsed"}
      aria-controls="project-panel"
      data-sidebar-toggle=""
      data-press=""
      onClick={toggleCollapsed}
    >
      {sidebarMode === "collapsed" ? (
        <PanelLeftOpen size={18} />
      ) : (
        <PanelLeftClose size={18} />
      )}
    </button>
  );
  /** What closes each panel: its close button, Escape, or a swipe down. */
  function closeLayer(layer: Layer) {
    if (layer === "project") return closePost();
    if (layer === "profile") return closeProfile();
    if (layer === "account") return setModal(null);
    if (layer === "saved") return setSavedOnly(false);
    if (layer === "editor")
      return editorClose.current ? editorClose.current() : setEditorOpen(false);
    closeSuggestions();
  }
  const layerTitles: Record<Layer, string> = {
    project: post?.title || "Prosjektet finnes ikke",
    profile: `Profilen til ${panelProfileName ?? ""}`,
    account: "Din profil",
    saved: "Lagret",
    suggestions: "Forslag",
    editor: canModerate ? "Nytt prosjekt" : "Foreslå prosjekt",
  };
  /**
   * A panel's content, written once: a sidebar layer in its current mode on
   * desktop, a drawer on phones.
   */
  function layerContent(layer: Layer) {
    if (layer === "project") return projectPost || missingProject;
    const frame = {
      mobile: isMobile,
      name: layer,
      active: topLayer === layer,
      onClose: () => closeLayer(layer),
    };
    switch (layer) {
      case "profile":
        return (
          <Panel {...frame} closeLabel="Lukk profil" titled>
            <ProfileOverlay
              key={panelProfileName}
              username={panelProfileName!}
              onOpenComment={openFromProfile}
            />
          </Panel>
        );
      case "account":
        return (
          <Panel {...frame} titled>
            <AccountPanel
              key={accountStart.n}
              initialView={accountStart.view}
              onSignedOut={() => signedOut()}
            />
          </Panel>
        );
      case "saved":
        return (
          <Panel {...frame} titled>
            <SavedProjects
              projects={savedProjects}
              activity={activity}
              density={density}
              news={news}
              onOpen={openCard}
              onSave={saveCard}
              onHover={hoverCard}
            />
          </Panel>
        );
      case "editor":
        return (
          <Panel {...frame} titled>
            {canModerate ? (
              <ProjectEditor
                key={editorSeed.key}
                initial={editorSeed.draft}
                view={editorSeed.view}
                closeRef={editorClose}
                dirtyRef={editorDirty}
                onClose={() => setEditorOpen(false)}
                onSave={async (project) => {
                  await mutate({ action: "project", project, create: true });
                  setQuery("");
                  setStatus(defaultStatus);
                  setCategory([]);
                  setSavedOnly(false);
                  setEditorOpen(false);
                  notify("Prosjektet er lagt til");
                  openPost(project.id);
                  // Not in this render's project list yet, so frame it directly.
                  if (!isMobile) fitProjects([project]);
                }}
              />
            ) : (
              <ProjectEditor
                suggest
                key={editorSeed.key}
                initial={editorSeed.draft}
                view={editorSeed.view}
                closeRef={editorClose}
                dirtyRef={editorDirty}
                onClose={() => setEditorOpen(false)}
                onSave={async (project) => {
                  await suggest({ kind: "project", project });
                  setEditorOpen(false);
                  notify("Forslaget er sendt");
                }}
              />
            )}
          </Panel>
        );
      case "suggestions":
        return (
          <Panel {...frame} titled>
            <SuggestionList
              // A moderator viewing the app as a member sees a member's list.
              key={canModerate ? "queue" : "mine"}
              embedded
              moderator={canModerate}
              onOpenProject={(id) => openPost(id)}
              onClose={() => closeSuggestions()}
              onChange={() => void refresh().catch(() => {})}
            />
          </Panel>
        );
    }
  }
  const drawerBody = (
    <>
      <CoveredLayer
        className="flex min-h-0 flex-1 flex-col"
        // Under the panels it stays in place, ready to swipe back to.
        covered={liveLayers.length > 0}
        aria-hidden={liveLayers.length > 0 || undefined}
      >
        {projectResults(
          <div className="px-4.5 pb-0.5 max-xs:px-3.5">
            <div className="flex h-11 items-center justify-between">
              {brand}
              {profileButton}
            </div>
          </div>,
        )}
      </CoveredLayer>
    </>
  );
  const drawerShell = isMobile && !drawerReady && (
    <div
      aria-hidden="true"
      className={cn(
        explorerDrawerClasses,
        sheetShadowClasses,
        // Its own layer, like the drawer's popup, so its contents snap to
        // the same pixels: in place, the drawer's copy draws nothing larger,
        // and its first paint stays the page's largest.
        "fixed inset-x-0 bottom-0 z-[900] flex flex-col will-change-transform",
        snapPoint === 1
          ? "h-[calc(100dvh-12px-env(safe-area-inset-top))]"
          : "inset-x-2 bottom-2 rounded-b-sheet",
        snapPoint === middleSnapPoint && "h-[calc(58dvh-8px)]",
        snapPoint === compactSnapPoint && "h-[116px]",
      )}
    >
      <div className={gripStrip}>
        <span className={gripTarget}>
          <DrawerGrip />
        </span>
      </div>
      <div
        data-slot="drawer-content"
        className={cn(
          "flex flex-col overflow-hidden",
          mobileDrawerInnerClasses,
        )}
      >
        {drawerBody}
      </div>
    </div>
  );
  // Phones: the panel drawers, bottom to top. Ones replaced by another
  // stay open under it until it is up.
  const mobileLayers = [
    ...held.filter((layer) => !layers.includes(layer)),
    ...layers,
  ];
  const panelShell = isMobile && !panelsReady && topLayer && (
    <PanelShell>{layerContent(topLayer)}</PanelShell>
  );
  /** Heights a panel's drawer rests at; without them, the full one. */
  function layerSnap(layer: Layer) {
    if (layer === "profile")
      return {
        points: projectSnapPoints,
        point: profileSnap,
        onChange: setProfileSnap,
      };
    if (layer === "account")
      return {
        points: projectSnapPoints,
        point: accountSnap,
        onChange: setAccountSnap,
      };
    if (layer !== "project" || postSnap?.id !== panelPostId) return undefined;
    return {
      points: isFolded(postSnap.point)
        ? [postSnap.point, ...projectSnapPoints]
        : projectSnapPoints,
      point: postSnap.point,
      onChange: movePost,
      folded: isFolded(postSnap.point),
    };
  }
  const panelDrawers =
    isMobile &&
    mobileLayers.map((layer, index) => (
      <PanelDrawer
        key={layer === "project" ? `project-${panelPostId}` : layer}
        name={layer}
        title={layerTitles[layer]}
        index={index}
        open={liveLayers.includes(layer) || held.includes(layer)}
        active={layer === topLayer}
        ready={panelsReady}
        onReady={panelReady}
        onDismiss={() => {
          if (liveLayers.includes(layer)) closeLayer(layer);
        }}
        onOpened={() => {
          if (layer === topLayer && held.length) setHeld([]);
          if (layer !== "project" || !raiseBehindPost.current) return;
          raiseBehindPost.current = false;
          setSnapInstantly(true);
          setSnapPoint(middleSnapPoint);
        }}
        onClosed={() => exited(layer)}
        onEnter={
          layer === "project"
            ? () => {
                if (!meetPost.current) return;
                meetPost.current = false;
                // A frame on, the two start moving together.
                requestAnimationFrame(() => {
                  if (!meetPending.current) return;
                  meetPending.current = false;
                  setMeetQuickly(true);
                  setSnapPoint(middleSnapPoint);
                });
                meetPending.current = true;
              }
            : undefined
        }
        // Resting over the map, the project carries the map controls.
        edge={
          layer === "project" && postSnap?.id === panelPostId ? (
            <div
              ref={postControlsSlotNode}
              data-map-controls-slot=""
              className={controlsSlotClasses}
            />
          ) : undefined
        }
        onMotion={
          layer === "project" && postSnap?.id === panelPostId
            ? followPostDrawer
            : undefined
        }
        snap={layerSnap(layer)}
      >
        {layerContent(layer)}
      </PanelDrawer>
    ));

  return (
    <DrawSurfaceContext value={isMobile ? null : drawSurface}>
    <div
      className={cn(
        "flex h-dvh min-h-0 overflow-hidden bg-canvas motion-reduce:[&_*]:transition-none motion-reduce:[&_*]:animate-none",
        isMobile ? "flex-col" : "flex-row",
        // While the panel is resized: one cursor, no selection, map at rest.
        "data-resizing:cursor-col-resize data-resizing:select-none [&[data-resizing]_[data-project-map]]:pointer-events-none",
      )}
      ref={rootRef}
    >
      {!isMobile && (
        <aside
          ref={panelRef}
          id="project-panel"
          className={cn(
            "relative z-10 flex h-full shrink-0 flex-col bg-surface",
            // Collapsed, it leaves the map the whole width; panels lie over it.
            asideCollapsed
              ? "w-0"
              : "w-(--sidebar-width) border-r border-border shadow-[1px_0_12px_rgb(20_28_24/0.05)]",
          )}
          style={
            {
              "--sidebar-width": "var(--panel-width,clamp(380px,36vw,540px))",
            } as CSSProperties
          }
          aria-label="Prosjekter"
          data-sidebar-mode={sidebarMode}
        >
          {(sidebarMode === "collapsed" || modeFrom === "collapsed") && (
            // Where the header has them, so the toggle never moves: a tab
            // in the corner of the page, its shadow fading with the list.
            <div
              className={cn(
                "absolute top-0 left-0 z-30 flex h-16 items-center gap-2 rounded-br-2xl bg-surface pl-6",
                // Without the toggle, the logo gets the same room each side.
                osmFocus ? "pr-6" : "pr-2",
                "transition-shadow duration-320 ease-out-soft starting:shadow-none",
                sidebarMode === "collapsed" &&
                  "shadow-[2px_2px_16px_rgb(20_28_24/0.12)]",
              )}
              data-sidebar-tab=""
            >
              {brand}
              {/* Where the toggle comes to rest, right of the logo. */}
              <span
                hidden={osmFocus}
                ref={(node) => {
                  if (node) setToggleRest(node.offsetLeft);
                }}
                aria-hidden="true"
                className="size-11 shrink-0"
                data-toggle-rest=""
              />
            </div>
          )}
          {/*
            The sidebar toggle: at the header's end, where a panel has its
            close button, and in the corner tab when collapsed. It glides
            between the two with the sidebar's edge. Panels cover it.
          */}
          <div
            className={cn(
              "absolute top-2.5 z-[35] motion-reduce:transition-none",
              // It tracks the edge as the sidebar resizes.
              sidebarMode !== "collapsed" &&
                "left-[calc(var(--sidebar-width)-0.75rem-2.75rem)]",
            )}
            style={
              sidebarMode === "collapsed" ? { left: toggleRest } : undefined
            }
            hidden={osmFocus}
            data-explorer-toggle=""
          >
            {sidebarToggle}
          </div>
          {/* The base layer: stays mounted under panels, so it keeps its scroll. */}
          <CoveredLayer
            className={cn(
              // The container `narrow:` measures (see globals.css).
              "@container/sidebar absolute inset-y-0 left-0 flex flex-col bg-surface",
              asideCollapsed ? "w-(--sidebar-width)" : "w-full",
              explorerHidden && "invisible",
            )}
            data-explorer-layer=""
            // Live again as soon as a panel starts sliding away, so focus
            // can return to the card it was opened from.
            covered={sidebarMode === "collapsed" || liveLayers.length > 0}
            aria-hidden={liveLayers.length > 0 || undefined}
          >
            <header
              className="flex h-16 shrink-0 items-center justify-between gap-2 pr-3 pl-6"
              data-explorer-header=""
            >
              <div data-explorer-brand="">{brand}</div>
              <nav
                className="flex items-center gap-0.5"
                aria-label="Konto"
                data-explorer-nav=""
              >
                {profileButton}
                <span
                  aria-hidden="true"
                  className="mx-1.5 h-5 w-px shrink-0 bg-border"
                />
                {/* The sidebar toggle stands here (see below). */}
                <span
                  aria-hidden="true"
                  className="size-11 shrink-0"
                  data-toggle-slot=""
                />
              </nav>
            </header>
            <div className="relative min-h-0 flex-1">
              <div className="absolute inset-0 flex flex-col">
                {projectResults()}
              </div>
            </div>
          </CoveredLayer>
          {layers.map((layer, index) => (
            // Panels cover the whole sidebar, header included, and slide
            // out from its left edge.
            <div
              key={layer === "project" ? `project-${panelPostId}` : layer}
              className={cn(
                "absolute inset-y-0 left-0 flex flex-col overflow-hidden bg-surface",
                "animate-panel-in shadow-[10px_0_30px_rgb(20_28_24/0.10)]",
                asideCollapsed
                  ? "w-(--sidebar-width) border-r border-border"
                  : "w-full",
              )}
              style={{ zIndex: 40 + index }}
              data-sidebar-layer={layer}
              data-project-layer={layer === "project" ? "" : undefined}
              data-exiting={exiting.includes(layer) || undefined}
              inert={layer !== topLayer}
            >
              {layerContent(layer)}
            </div>
          ))}
          {sidebarMode === "normal" && !modeFrom && (
            <PanelResizer
              panel={panelRef}
              root={rootRef}
              controls="project-panel"
              onResizeStart={() => mapApi.current?.beginResize()}
              onResize={() => mapApi.current?.syncSize()}
              onResizeEnd={() => mapApi.current?.endResize()}
            />
          )}
        </aside>
      )}

      <main
        className="relative isolate flex min-h-0 min-w-0 flex-1 overflow-hidden bg-surface"
        aria-label="Utforsk prosjekter"
      >
        <section
          className="relative isolate h-full min-h-0 w-full min-w-0 flex-1"
          aria-label="Prosjektkart"
        >
          {/* Desktop: a project being drawn takes the map area. */}
          <div
            ref={setDrawSurface}
            className="absolute inset-0 z-[700] empty:hidden"
            data-draw-surface=""
          />
          <ProjectMap
            projects={osm.on && osm.hideProjects ? noProjects : mapProjects}
            initialView={initial.view}
            onViewChange={onMapView}
            onReady={onMapReady}
            onGestureStart={onMapGesture}
            onUserMove={onMapMove}
            bottomInset={isMobile ? mobileMapInset : undefined}
            // Collapsed, panels lie over the map's left edge.
            leftInset={
              !isMobile && sidebarMode === "collapsed" ? sidebarWidth : undefined
            }
            foldCredits={isMobile && nothingMatches}
            controlsContainer={
              isMobile
                ? postOverMap
                  ? postControlsSlot
                  : controlsSlot
                : undefined
            }
            selectedId={selectedId}
            onSelect={(id) => (id ? openPost(id, {}, true) : onMapTap())}
            osm={osm.layer}
            onContextMenu={isMobile ? undefined : setMapMenu}
            legend={legendShown}
            overlays={mapOverlays}
          />
          <MapContextMenu
            at={mapMenu}
            canModerate={canModerate}
            onClose={() => setMapMenu(null)}
            onCreate={() => {
              if (!mapMenu) return;
              const { point, zoom } = mapMenu;
              const [place] = projectPlaces("", point);
              openEditor(place ? { city: place } : undefined, {
                center: point,
                // Close enough to draw at, or as close as it already was.
                zoom: Math.min(Math.max(Math.round(zoom), 16), 18),
              });
            }}
          />
          {osm.on && (
            <OsmPanel
              review={osm}
              keyboard={liveLayers.length === 0}
              onCreate={openEditor}
              onOpenProject={(id) => openPost(id)}
              className="absolute top-3 left-1/2 z-[660] -translate-x-1/2 max-md:right-17 max-md:left-3 max-md:w-auto max-md:translate-x-0"
            />
          )}
        </section>
      </main>

      {drawerShell}
      {isMobile && (
        <SheetLayer>
          <Drawer
            open
            modal={false}
            disablePointerDismissal
            snapPoints={drawerSnapPoints}
            snapToSequentialPoints
            snapPoint={snapPoint}
            onSnapPointChange={(point, details) => {
              // Reject dismissal before Base UI restores the previous snap point.
              // The navigation drawer always settles at its compact height.
              if (point === null) {
                details.cancel();
                minimizeDrawer();
                return;
              }
              if (point === compactSnapPoint) {
                minimizeDrawer();
                return;
              }
              setSnapPoint(point);
            }}
            onOpenChange={(open, details) => {
              if (open) return;
              details.cancel();
              // Escape belongs to the panel or dialog on top, if any.
              if (
                details.reason === "escape-key" &&
                (liveLayers.length || document.querySelector("dialog[open]"))
              )
                return;
              minimizeDrawer();
            }}
          >
            <DrawerVirtualKeyboardProvider>
              <DrawerContent
                ref={drawerPopupRef}
                restOffset
                floating={snapPoint !== 1}
                onMotion={followDrawer}
                edge={
                  <>
                    <div
                      ref={controlsSlotNode}
                      data-map-controls-slot=""
                      className={cn(
                        controlsSlotClasses,
                        "peer",
                        // A panel covers the map, all but a sliver.
                        "group-data-map-covered/drawer-popup:invisible group-data-map-covered/drawer-popup:opacity-0",
                      )}
                    />
                    {/* Nothing matches: a note riding the drawer's top edge,
                      level with the controls and gone with them, the credits
                      folded for it. Pressed, it clears the filters. */}
                    {nothingMatches && (
                      <div
                        className={cn(
                          controlsSlotClasses,
                          "pointer-events-none peer-data-covered:invisible peer-data-covered:opacity-0",
                          "group-data-map-covered/drawer-popup:invisible group-data-map-covered/drawer-popup:opacity-0",
                        )}
                      >
                        <button
                          type="button"
                          data-base-ui-swipe-ignore=""
                          aria-label="Ingen treff med filtrene, nullstill filtre"
                          className="pointer-events-auto absolute bottom-[19px] left-1/2 flex h-9 max-w-[calc(100%-7rem)] -translate-x-1/2 animate-panel-fade-in items-center gap-2 rounded-full border border-border bg-surface px-3.5 text-ui font-medium whitespace-nowrap text-ink shadow-popover transition-colors duration-150 hover:bg-surface-muted active:bg-surface-muted motion-reduce:transition-none"
                          onClick={resetFilters}
                        >
                          <SearchX
                            size={16}
                            className="shrink-0 text-muted"
                            aria-hidden="true"
                          />
                          <span className="truncate">Ingen treff med filtrene</span>
                          <X
                            size={14}
                            className="-mr-1 shrink-0 text-muted"
                            aria-hidden="true"
                          />
                        </button>
                      </div>
                    )}
                    {/* For the list's own rows. It stays while a panel is over
                      it, so it is already there as a closing panel leaves. */}
                    <ScrollFade shown={snapPoint === middleSnapPoint} />
                  </>
                }
                data-explorer-drawer=""
                data-panel-open={liveLayers.length > 0 || undefined}
                data-map-covered={liveLayers.length > 0 || undefined}
                viewportClassName={
                  snapInstantly
                    ? "transition-none"
                    : meetQuickly
                      ? "duration-340"
                      : undefined
                }
                className={cn(
                  explorerDrawerClasses,
                  visibleBottomClasses,
                  snapInstantly && "transition-none",
                  meetQuickly && "duration-340",
                  // Let Base UI swipe the drawer before its content starts scrolling,
                  // unless the content is scrolled already (`useScrolledMark`).
                  snapPoint !== 1 &&
                    "[&_[data-drawer-scroll]:not([data-scrolled])]:overflow-y-hidden",
                )}
                contentClassName={cn(mobileDrawerInnerClasses, unselectable)}
                initialFocus={false}
                finalFocus={false}
                onWheel={(event) => {
                  if (
                    snapPoint === 1 ||
                    event.ctrlKey ||
                    event.deltaY <= 4 ||
                    Math.abs(event.deltaX) > Math.abs(event.deltaY) ||
                    (event.target instanceof Element &&
                      event.target.closest("[popover], dialog"))
                  ) {
                    return;
                  }

                  setSnapPoint(1);
                }}
                handle={
                  <div className={gripStrip}>
                    <button
                      ref={drawerHandleRef}
                      className={cn(
                        gripTarget,
                        "group/handle p-0",
                        "transition-[color,opacity] duration-150 hover:text-accent active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100",
                        "group-data-panel-open/drawer-popup:opacity-0",
                      )}
                      aria-label={
                        snapPoint === 1
                          ? "Vis mer av kartet"
                          : "Utvid prosjektlisten"
                      }
                      onClick={() =>
                        snapPoint === 1 ? minimizeDrawer() : setSnapPoint(1)
                      }
                    >
                      <DrawerGrip />
                    </button>
                  </div>
                }
              >
                <DrawerTitle className="sr-only">
                  Utforsk prosjekter
                </DrawerTitle>
                <DrawerDescription className="sr-only">
                  Dra eller trykk på håndtaket for å endre høyden. Utforsk kart,
                  prosjekter og dem du har lagret.
                </DrawerDescription>
                {drawerReady && drawerBody}
              </DrawerContent>
            </DrawerVirtualKeyboardProvider>
          </Drawer>
          {panelDrawers}
        </SheetLayer>
      )}
      {panelShell}
      {settingsOpen && user?.username && (
        <AccountSettingsSheet
          user={user}
          onClose={() => setSettingsOpen(false)}
          onSignedOut={() => signedOut()}
        />
      )}
      {signOutOpen && (
        <SignOutPrompt
          mobile={isMobile}
          onClose={() => setSignOutOpen(false)}
          onSignedOut={signedOut}
        />
      )}
    </div>
    </DrawSurfaceContext>
  );
});
