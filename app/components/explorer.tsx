"use client";

import {
  type CSSProperties,
  Fragment,
  type ReactNode,
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
  Activity,
  ArrowDownUp,
  Construction,
  Maximize2,
  PanelLeftClose,
  PanelLeftOpen,
  GalleryVertical,
  LayoutList,
  Map as MapIcon,
  MapPin,
  Plus,
  Moon,
  Search,
  SearchX,
  SlidersHorizontal,
  User,
  X,
  ZoomOut,
} from "lucide-react";
import {
  categoryTree,
  type Bounds,
  type Project,
  projectHref,
  projectInBounds,
  statuses,
  statusOrder,
} from "../lib/data";
import {
  defaultDensity,
  defaultStatus,
  parseExploreState,
  sameValues,
  sortOptions,
  storeCollapsed,
  storedCollapsed,
  storeDensity,
  storedDensity,
  subscribeCollapsed,
  subscribeDensity,
  type ListDensity,
} from "../lib/explore-state";
import type { MapApi, MapViewChange } from "./project-map";
import {
  extentPoints,
  findPlace,
  placeContains,
  placeInView,
  places,
} from "../lib/places";
import { errorMessage } from "../lib/api-client";
import { profileHref } from "../lib/profiles";
import { useAuth } from "./auth-provider";
import { useCommunity } from "./community-provider";
import AccountPanel from "./account-panel";
import AccountMenu from "./account-menu";
import { authClient } from "../lib/auth-client";
import ProfileAvatar from "./profile-avatar";
import ChoiceSelect from "./choice-select";
import FilterSheet from "./filter-sheet";
import StatusDots from "./status-dots";
import CategoryIcon from "./category-icon";
import ProjectEditor from "./project-editor";
import { OsmPanel, useOsmModeStored, useOsmReview } from "./osm-review";
import ProjectPost from "./project-post";
import ProjectCard, { type CardTarget } from "./project-card";
import { FeedRow, feedEntries, type FeedTarget } from "./activity-feed";
import { useListMotion } from "./use-list-motion";
import PanelResizer from "./panel-resizer";
import SavedProjects from "./saved-projects";
import { useUnread } from "./unread-provider";
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
  DrawerGrip,
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
  lessUsedCategories,
  projectPoints,
} from "../lib/project-filters";
import { useProjectList } from "./use-project-list";
import { usePanelLayers, type Layer } from "./use-panel-layers";
import { panelWidth, useSidebarMode } from "./use-sidebar-mode";
import { useUrlSync } from "./use-url-sync";
import { replaceUrl, whenNextSettled } from "../lib/explore-history";
import { routeParam } from "../lib/explore-route";
import { cn } from "../lib/cn";
import { mobileQuery, useMediaQuery } from "../lib/media";
import ThemeToggle, { toggleTheme, useTheme } from "./theme-toggle";
import {
  OverflowMenu,
  useHeaderOverflow,
  type OverflowAction,
} from "./header-overflow";
import { openProfileEvent } from "../lib/profile-overlay";
import ProfileOverlay from "./profile-overlay";
import SuggestionList from "./suggestion-list";
import { MaximizeButton, type SidebarMode } from "./sidebar-panel";
import {
  iconButton,
  primaryButton,
  sortChoice,
  statusTone,
  textButton,
} from "../lib/ui";

const densityOptions = [
  { value: "compact", label: "Kompakt", Icon: LayoutList },
  { value: "expanded", label: "Utvidet", Icon: GalleryVertical },
  { value: "feed", label: "Nytt", Icon: Activity },
] as const;

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
const compactSnapPoint = "136px";
/** The map a project at the middle height covers. */
const middleMapInset = () => Math.round(window.innerHeight * middleSnapPoint);
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
 * How much of the open project's drawer shows folded: down to the end of
 * its phase timeline, scrolled to its top. Never lower than the folded list,
 * which it covers, nor near the middle height.
 */
function foldHeight(): DrawerSnapPoint {
  const drawer = [
    ...document.querySelectorAll<HTMLElement>(
      "[data-project-drawer]:not([data-ending-style])",
    ),
  ].at(-1);
  drawer
    ?.querySelector("[data-project-scroll]")
    ?.scrollTo({ top: 0, behavior: "instant" });
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
const projectKey = (project: Project) => project.id;

function coverControls(slot: HTMLElement | null, motion: DrawerMotion) {
  if (!slot) return;
  const covered = motion.visible > window.innerHeight * middleSnapPoint + 2;
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

// Desktop filters: compact pills that turn green once they narrow the list.
const panelChoiceClasses = [
  "min-w-0 shrink",
  "[&_[data-slot=choice-trigger]]:min-h-9 [&_[data-slot=choice-trigger]]:gap-1.5 [&_[data-slot=choice-trigger]]:rounded-full [&_[data-slot=choice-trigger]]:px-3 [&_[data-slot=choice-trigger]]:text-ui [&_[data-slot=choice-trigger]]:font-medium",
  "[&_[data-slot=choice-trigger]>svg]:shrink-0 [&_[data-slot=choice-trigger]>svg]:text-muted [&_[data-slot=choice-trigger]>svg:last-child]:ml-0",
  "[&_[data-slot=choice-trigger]>span:nth-of-type(2)]:hidden [&_[data-slot=choice-menu][data-open=false]]:hidden",
].join(" ");
// Set, a filter's pill gets a firmer edge and bolder words; nothing else.
const panelChoiceActive =
  "[&_[data-slot=choice-trigger]]:border-ink/45 [&_[data-slot=choice-trigger]]:font-semibold";

// Mobile filters read as inline text; the menus carry the structure.
const inlineChoiceClasses = [
  "min-w-0 shrink",
  "[&_[data-slot=choice-trigger]]:min-h-11 [&_[data-slot=choice-trigger]]:gap-1.5 [&_[data-slot=choice-trigger]]:rounded-lg [&_[data-slot=choice-trigger]]:border-transparent! [&_[data-slot=choice-trigger]]:bg-transparent [&_[data-slot=choice-trigger]]:px-2 [&_[data-slot=choice-trigger]]:text-body [&_[data-slot=choice-trigger]]:font-semibold [&_[data-slot=choice-trigger]]:tracking-[-0.2px]",
  "[&_[data-slot=choice-trigger]>svg]:text-muted",
  "[&_[data-slot=choice-option]]:min-h-11 [&_[data-slot=choice-menu][data-open=false]]:hidden",
  "max-xs:[&_[data-slot=choice-trigger]]:gap-1 max-xs:[&_[data-slot=choice-trigger]]:px-1.5 max-xs:[&_[data-slot=choice-trigger]]:text-[14px]",
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
  "h-[calc(100%_-_24px_-_var(--drawer-rest-offset)_-_var(--sheet-gap,0px))]",
  "pb-[env(safe-area-inset-bottom)]",
].join(" ");

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
  // A project opened over the map rests at the middle height with the list
  // at the same height behind it, so closing it leaves the list there. From
  // the full list, the list comes down to meet it, in step; from under a
  // folded project, the list rises behind it, unseen, once it is up.
  const meetPost = useRef(false);
  const meetPending = useRef(false);
  const raiseBehindPost = useRef(false);
  // A project folded over the map has the list folded under it; the list
  // comes back up to the middle height as the project closes.
  const listUnderFolded = useRef(false);
  // Opened over the folded list, a project leaves it folded: closing the
  // project goes back to it.
  const listStaysFolded = useRef(false);
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
  const dark = useTheme() === "dark";
  const [initial] = useState(() =>
    parseExploreState(new URLSearchParams(initialSearch)),
  );
  const [query, setQuery] = useState(initial.query);
  const [searchOpen, setSearchOpen] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [status, setStatus] = useState<string[]>(initial.status);
  const [category, setCategory] = useState<string[]>(initial.category);
  const [sort, setSort] = useState(initial.sort);
  const [savedOnly, setSavedOnly] = useState(false);
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
  // Desktop: the sidebar, and every panel on it, fills the window.
  const [maximized, setMaximized] = useState(Boolean(initial.full));
  // Desktop: the explorer list hidden, the map at full width. Panels still
  // open at normal width over the map, and closing them returns here.
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
  const sidebarMode: SidebarMode = maximized
    ? "maximized"
    : collapsed
      ? "collapsed"
      : "normal";
  const panelRef = useRef<HTMLElement>(null);
  // While animating, the sidebar holds the larger of both layouts: full
  // width while maximizing or restoring; out of the map's way while
  // collapsing or expanding, so the map resizes once, not every frame.
  const {
    modeFrom,
    animateFrom,
    changeMode,
    wide,
    asideCollapsed,
    explorerHidden,
  } = useSidebarMode({ panelRef, sidebarMode, collapsed });
  // The place shown in "Velg sted". Beside the map it follows the view and
  // picking one moves the map there; maximized, it filters the list instead.
  const [place, setPlace] = useState(
    initial.place && findPlace(initial.place) ? initial.place : "",
  );
  // A picked place holds while the map flies there.
  const placeHold = useRef<{ name: string; until: number } | null>(null);
  const lastZoom = useRef<number | null>(null);
  const [profileName, setProfileName] = useState<string | null>(
    initialProfile || null,
  );
  const [modal, setModal] = useState<"profile" | null>(null);
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
  }>({ key: 0 });
  // The editor's own close, which asks before dropping a draft.
  const editorClose = useRef<(() => void) | null>(null);
  const editorDirty = useRef<(() => boolean) | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchTriggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // The map is the place filter: the list holds what its view covers.
  const mapApi = useRef<MapApi | null>(null);
  // Every settled view lands in this ref. React only hears of a view, settled
  // or mid-pan, when the projects in it change, so panning about doesn't
  // re-render the explorer.
  const mapViewRef = useRef<MapViewChange | null>(null);
  const [viewBounds, setViewBounds] = useState<Bounds | null>(null);
  const inViewKey = useRef("");
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
      if (!isMobile && !collapsedPref && !maximized) animateFrom();
    },
  });

  const openSearch = useCallback(() => {
    if (postId || profileName || modal || savedOnly || suggestionsOpen) return;
    // Focus during the tap so mobile browsers also open the keyboard.
    flushSync(() => {
      setSearchOpen(true);
      // A collapsed list comes back to be listedProjects.
      if (!isMobile && storedCollapsed()) storeCollapsed(false);
    });
    searchRef.current?.focus({ preventScroll: true });
  }, [isMobile, modal, postId, profileName, savedOnly, suggestionsOpen]);

  function closeSearch() {
    flushSync(() => {
      setSearchOpen(false);
      setQuery("");
    });
    searchTriggerRef.current?.focus({ preventScroll: true });
  }

  const { syncUrl, syncSoon, withSearch } = useUrlSync({
    state: { query, status, category, sort, full: maximized, place },
    view: () => mapViewRef.current ?? initial.view,
    paused: () => steppingBack.current,
  });

  function enterPostView(id: string, frame = true) {
    // Phones keep the view to return to; the list follows the map there.
    if (!isMobile && !postView.current && mapViewRef.current)
      setFrozenBounds(mapViewRef.current.bounds);
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
  // As the sidebar narrows, the list header's actions move into a menu,
  // last of all the maximize button; the sidebar is never narrower than
  // what stays.
  const headerNavRef = useRef<HTMLElement>(null);
  const headerOverflow = useHeaderOverflow(
    headerNavRef,
    ["theme", "maximize"],
  );
  /** The header's width plus the sidebar's border. */
  function headerWidth(all: boolean) {
    const header = headerNavRef.current?.parentElement;
    const aside = panelRef.current;
    if (!header || !aside) return 0;
    return headerOverflow.needed(all) + aside.offsetWidth - header.offsetWidth;
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
  // Escape takes the maximized list back beside the map; panels handle
  // their own Escape, and the search clears itself first.
  const onEscape = useEffectEvent((event: KeyboardEvent) => {
    if (
      event.key !== "Escape" ||
      event.defaultPrevented ||
      isMobile ||
      !maximized ||
      liveLayers.length > 0 ||
      document.querySelector(
        "dialog[open], [data-slot=choice-menu][data-open=true]",
      )
    )
      return;
    event.preventDefault();
    minimize();
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
    window.addEventListener("keydown", onEscape);
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("keydown", keys);
      window.removeEventListener("keydown", onEscape);
      window.removeEventListener("popstate", onPopState);
    };
  }, [openSearch]);

  const savedIds = useMemo(() => new Set(saved), [saved]);
  const savedProjects = useMemo(
    () => projects.filter((project) => savedIds.has(project.id)),
    [projects, savedIds],
  );

  // Before the map reports its view (and on the server) the list covers
  // Norway. Maximized, the map is out of sight and the place filters instead.
  const listBounds =
    maximized && !isMobile ? null : (frozenBounds ?? viewBounds);
  const listPlace = maximized && !isMobile ? place : "";
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
    bounds: listBounds,
    place: listPlace,
    nearby: listBounds ? place : "",
  });

  // The project and profile panels keep theirs while sliding away.
  const [panelPostId, setPanelPostId] = useState(postId);
  if (postId && postId !== panelPostId) setPanelPostId(postId);
  const [panelProfileName, setPanelProfileName] = useState(profileName);
  if (profileName && profileName !== panelProfileName)
    setPanelProfileName(profileName);
  const post = projects.find((project) => project.id === panelPostId);

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
    openedMaximized,
    rememberTrigger,
  } = usePanelLayers({
    live: liveLayers,
    isMobile,
    maximized,
    panelRef,
    // Closing a panel opened beside the map takes the sidebar back there.
    onClosedOverMaximized: () => minimize(),
  });
  const panelClosing = !postId && leaving("project");
  if (!postId && !panelClosing && panelPostId) setPanelPostId(null);
  if (!profileName && !leaving("profile") && panelProfileName)
    setPanelProfileName(null);
  function projectsInView(view: MapViewChange) {
    return projects.filter((project) => projectInBounds(project, view.bounds));
  }
  function onMapView(view: MapViewChange) {
    // On phones the drawer is folded down while the map pans, so the list
    // waits for it to settle; following it mid-pan stalled Safari.
    if (view.moving && isMobile) return;
    // The URL and the view to return to take only views the map rests on.
    if (!view.moving) mapViewRef.current = view;
    const shown = projectsInView(view);
    const key = shown.map((project) => project.id).join();
    const follow = () => {
      if (key !== inViewKey.current) {
        inViewKey.current = key;
        setViewBounds(view.bounds);
      }
      followPlace(view, shown);
    };
    // Mid-pan the list catches up between frames instead of holding one up:
    // rendering it inside a frame stalled the pan, worst in Safari.
    if (view.moving) return startTransition(follow);
    follow();
    if (!postView.current) setFrozenBounds(null);
    syncSoon();
  }
  /** Beside the map, "Velg sted" names the place the view shows. */
  function followPlace(view: MapViewChange, shown?: Project[]) {
    // Maximized, the place filters the list; an open project's framing
    // is passing. Under the full drawer the map is out of sight.
    if ((maximized && !isMobile) || postView.current) return;
    if (isMobile && snapRef.current === 1) return;
    shown ??= projectsInView(view);
    const previousZoom = lastZoom.current ?? view.zoom;
    lastZoom.current = view.zoom;
    const hold = placeHold.current;
    if (hold && Date.now() < hold.until) return setPlace(hold.name);
    placeHold.current = null;
    const inView = shown.map((project) => placesOf.get(project.id) ?? []);
    setPlace((current) =>
      placeInView(inView, view.zoom, current, previousZoom),
    );
  }
  // The drawer's height changes what of the map is in sight, and so what the
  // list holds. Under the full drawer the map is out of sight: the list
  // keeps what it had.
  const placeUnderDrawer = useEffectEvent(() => {
    if (snapRef.current === snapPoint) return;
    snapRef.current = snapPoint;
    const view = mapViewRef.current;
    if (!view || !mapApi.current || snapPoint === 1) return;
    onMapView({ ...view, bounds: mapApi.current.boundsAbove(mapInset.current) });
  });
  useEffect(() => placeUnderDrawer(), [snapPoint]);
  // Folded down, the list shows only its filters: a list left scrolled, as a
  // wheel that unfolds it can leave it, would show rows there instead and
  // take the next swipe up from the drawer.
  useLayoutEffect(() => {
    if (isMobile && snapPoint === compactSnapPoint)
      listRef.current?.scrollTo({ top: 0 });
  }, [isMobile, snapPoint]);
  /** Moves the map to a place, or out to Norway for none. */
  function goToPlace(name: string) {
    setPlace(name);
    const found = findPlace(name);
    placeHold.current = { name: found ? name : "", until: Date.now() + 1500 };
    // On phones the list keeps its height, but comes down from the full one
    // so the map shows; the place is framed above where it comes to rest.
    if (isMobile) {
      const point =
        snapPoint === compactSnapPoint ? compactSnapPoint : middleSnapPoint;
      setSnapPoint(point);
      mapInset.current = listMapInset(point);
    }
    if (found) mapApi.current?.fit(extentPoints(found.extent), { maxZoom: 14 });
    else mapApi.current?.showNorway();
  }
  function pickPlace(name: string) {
    if (maximized && !isMobile) return setPlace(name);
    goToPlace(name);
  }
  function onMapReady(api: MapApi) {
    mapApi.current = api;
    // A card hovered while the map loaded.
    api.highlight(hoveredId.current);
    // A place picked before the map was ready, or linked without a view.
    const fit = pendingFit.current;
    pendingFit.current = null;
    if (fit) return goToPlace(fit);
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
    if (listStaysFolded.current) return;
    if (isFolded(point)) {
      // Folded before the list was up behind it: it stays down, under the
      // project, and comes up as the project closes.
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
    if (postView.current) postView.current.before = null;
  }
  /**
   * On phones, panning or zooming the map folds the list down out of its way.
   */
  function onMapGesture() {
    if (isMobile) foldPost();
    if (isMobile && !topLayer && snapPoint === middleSnapPoint)
      setSnapPoint(compactSnapPoint);
  }
  /** Frames projects on the part of the map the mobile drawer leaves open. */
  function fitProjects(list: Project[], bottom?: number) {
    mapApi.current?.fit(list.flatMap(projectPoints), { bottom, maxZoom: 14 });
  }
  function showSearchHits() {
    fitProjects(searchHits);
    if (isMobile) setSnapPoint(compactSnapPoint);
  }

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
    return listRisesAfterPost() ? middleSnapPoint : snapPoint;
  }
  useLayoutEffect(() => {
    if (!postId) listStaysFolded.current = false;
    if (postId || !listRisesAfterPost()) return;
    meetPost.current = false;
    meetPending.current = false;
    raiseBehindPost.current = false;
    listUnderFolded.current = false;
    setSnapPoint(middleSnapPoint);
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
      else searchTriggerRef.current?.focus({ preventScroll: true });
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

  // A place to frame once the map has its new width (see the effect below).
  const pendingFit = useRef<string | null>(
    !initial.full && !initial.view && place ? place : null,
  );
  /** Where the collapsed toggle rests: just right of the corner tab's logo. */
  const [toggleRest, setToggleRest] = useState(128);
  // The place the map showed when maximized; restoring keeps the view unless
  // another was picked meanwhile. Opened maximized, the URL's view shows the
  // URL's place if it lies within it.
  const placeOnMap = useRef<string | null>(
    initial.full && initial.view && placeContains(place, initial.view.center)
      ? place
      : null,
  );
  function maximize() {
    if (isMobile || maximized) return;
    placeOnMap.current = place;
    changeMode(() => setMaximized(true), "maximize");
  }
  /** Back beside the map, which now shows the place picked while maximized. */
  function restore() {
    setMaximized(false);
    if (place && place !== placeOnMap.current) pendingFit.current = place;
  }
  function minimize() {
    if (!maximized) return;
    changeMode(restore, "restore");
  }
  function toggleCollapsed() {
    animateFrom();
    if (sidebarMode === "collapsed") return storeCollapsed(false);
    if (maximized) restore();
    storeCollapsed(true);
  }
  const fitPending = useEffectEvent(() => {
    const fit = pendingFit.current;
    pendingFit.current = null;
    if (fit) goToPlace(fit);
  });
  useEffect(() => {
    if (isMobile || !mapApi.current) return;
    mapApi.current.syncSize();
    fitPending();
    // Runs once the map has its new width: at the start of collapsing, the
    // end of expanding, and not at all when maximizing.
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
  const filtersChanged =
    statusChanged || category.length > 0 || !!needle || !!listPlace;
  function resetFilters() {
    setQuery("");
    // Beside the map, the place is where the map is, not a filter.
    if (listPlace) setPlace("");
    setSearchOpen(false);
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
        "flex min-h-11 items-center whitespace-nowrap font-bold text-ink",
        "transition-colors hover:text-accent motion-reduce:transition-none",
        "text-xl tracking-[-0.04em]",
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
      <span
        className={cn(
          "flex h-[27px] origin-left items-end gap-[3px]",
          isMobile
            ? "w-[21px] -mr-1 [transform:skewY(-8deg)_scale(.65)]"
            : "w-6 [transform:skewY(-8deg)_scale(.85)]",
        )}
        aria-hidden="true"
      >
        <i className="block h-[18px] w-[7px] rounded-[1px] bg-accent" />
        <i className="block h-7 w-[7px] rounded-[1px] bg-accent" />
        <i className="block h-[23px] w-[7px] rounded-[1px] bg-accent" />
      </span>
      <span>Planfri</span>
    </Link>
  );

  // One field on phones and beside the map: it opens out of its button over
  // the filters. Beside the map it folds back once left empty, or keeps its
  // words behind the button, marked, and as a chip.
  const search = (
    <div
      className={cn(
        "flex h-full w-full min-w-0 items-center gap-2 rounded-full border border-border bg-surface pl-3.5 text-muted",
        isMobile &&
          "transition-[border-color,box-shadow] duration-150 focus-within:border-accent/50 focus-within:ring-3 focus-within:ring-accent/10 motion-reduce:transition-none",
      )}
      data-base-ui-swipe-ignore
      onBlur={(event) => {
        if (isMobile || event.currentTarget.contains(event.relatedTarget))
          return;
        setSearchOpen(false);
      }}
    >
      <Search className="shrink-0" size={isMobile ? 17 : 15} />
      <input
        ref={searchRef}
        className={cn(
          "h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-ink outline-none shadow-none placeholder:truncate placeholder:text-muted",
          isMobile ? "text-base placeholder:text-sm" : "text-ui",
        )}
        id="project-search"
        enterKeyHint="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => {
          if (isMobile) setSnapPoint(1);
        }}
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
      <button
        type="button"
        className={cn(
          compactIconAction,
          "shrink-0 rounded-full text-muted hover:text-ink",
          isMobile ? "size-11" : "size-8.5",
        )}
        aria-label="Lukk søk"
        onClick={closeSearch}
      >
        <X size={15} />
      </button>
    </div>
  );
  const searchActive = !searchOpen && !!needle;
  const searchButton = (
    <button
      ref={searchTriggerRef}
      type="button"
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-full text-muted",
        "transition-colors duration-150 motion-reduce:transition-none",
        isMobile
          ? "size-11 [-webkit-tap-highlight-color:transparent]"
          : [
              "size-9 hover:text-ink",
              searchActive && "text-accent hover:text-accent-strong",
            ],
      )}
      aria-label="Åpne søk"
      aria-expanded={searchOpen}
      aria-controls="project-search-field"
      data-active={searchActive || undefined}
      onClick={openSearch}
    >
      <Search size={isMobile ? 19 : 16} aria-hidden="true" />
    </button>
  );
  // Phones gather category and status in one sheet, behind this button.
  const filtersSet = statusChanged || category.length > 0;
  const filterButton = (
    <button
      type="button"
      className={cn(
        "relative flex size-11 shrink-0 items-center justify-center rounded-full text-muted",
        "transition-colors duration-150 [-webkit-tap-highlight-color:transparent] motion-reduce:transition-none",
        filtersSet && "text-ink",
      )}
      aria-label="Filtre"
      aria-haspopup="dialog"
      aria-expanded={filterSheetOpen}
      data-active={filtersSet || undefined}
      onClick={() => setFilterSheetOpen(true)}
    >
      <SlidersHorizontal size={19} aria-hidden="true" />
      {filtersSet && (
        <span
          aria-hidden="true"
          className="absolute top-2.5 right-2 size-2 rounded-full border-[1.5px] border-surface bg-accent box-content"
        />
      )}
    </button>
  );
  // The filters fade as the field opens out of the button at their end.
  const filterBar = (filters: ReactNode) => (
    <section
      className={cn(
        "relative",
        isMobile
          ? "-mx-2 mt-1.5 mb-0.5 h-11 [--search-button:2.75rem]"
          : cn(
              "@container mb-1 h-9 [--search-button:2.25rem]",
              // Narrower still, the pills drop their chevrons.
              "@max-[300px]:[&_[data-slot=choice-trigger]>svg:last-child]:hidden",
            ),
      )}
      aria-label="Filtrer prosjekter"
    >
      <div
        className={cn(
          "flex h-full min-w-0 items-center transition-opacity duration-200 ease-out motion-reduce:transition-none",
          !isMobile && "gap-1.5",
          searchOpen ? "pointer-events-none opacity-0" : "opacity-100",
        )}
        inert={searchOpen}
        aria-hidden={searchOpen || undefined}
      >
        {filters}
        <div
          className={cn(
            "ml-auto flex shrink-0 items-center pl-1",
            // The glyph, not the button, ends on the list's edge.
            !isMobile && "-mr-2.5",
          )}
        >
          {/* Any filter but the place offers a way back, beside them. */}
          {(statusChanged || category.length > 0 || !!needle) && (
            <button
              type="button"
              className={cn(
                "text-xs whitespace-nowrap text-muted underline-offset-3 hover:text-ink hover:underline",
                isMobile ? "min-h-11 px-1" : "min-h-9 px-1",
              )}
              onClick={resetFilters}
            >
              Nullstill filtre
            </button>
          )}
          {isMobile && filterButton}
          {searchButton}
        </div>
      </div>
      <div
        id="project-search-field"
        className={cn(
          "absolute inset-0 z-20 transition-[clip-path,opacity] duration-250 ease-out-soft motion-reduce:transition-none",
          searchOpen
            ? "opacity-100 [clip-path:inset(-4px_round_9999px)]"
            : "pointer-events-none opacity-0 [clip-path:inset(0_0_0_calc(100%_-_var(--search-button))_round_9999px)]",
        )}
        inert={!searchOpen}
        aria-hidden={!searchOpen}
      >
        {search}
      </div>
    </section>
  );

  const statusOptions = statusOrder.map((value) => ({
    value,
    label: statuses[value].label,
    dot: statusTone[value].dot,
  }));
  // Main categories; their subcategories open underneath once chosen.
  const categoryOptions = categoryTree.map((node) => ({
    value: node.name,
    label: node.name,
    icon: <CategoryIcon category={node.name} size={16} />,
    more: lessUsedCategories.has(node.name),
    children: node.subcategories.map((sub) => ({ value: sub, label: sub })),
  }));
  // Cities and counties with projects, counted by the other filters.
  const placeOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const project of matching)
      for (const name of placesOf.get(project.id) ?? [])
        counts.set(name, (counts.get(name) ?? 0) + 1);
    const listed = new Set(
      projects.flatMap((project) => placesOf.get(project.id) ?? []),
    );
    if (place) listed.add(place);
    return [
      { value: "", label: "Hele Norge" },
      ...places
        .filter(({ name }) => listed.has(name))
        .map(({ name }) => name)
        .sort((a, b) => a.localeCompare(b, "nb"))
        .map((name) => ({
          value: name,
          label: name,
          ...(!isMobile && { count: counts.get(name) ?? 0 }),
        })),
    ];
  }, [isMobile, matching, place, placesOf, projects]);
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
  const pickStatus = (next: string[]) => {
    if (next.length === 0) return;
    setStatus(next.length === statusOrder.length ? [] : next);
  };
  const statusFilter = (
    <ChoiceSelect
      label="Prosjektstatus"
      smoothWidth
      multiple
      value={statusValue}
      onChange={pickStatus}
      triggerLabel="Status"
      icon={<StatusDots values={status} />}
      className={cn(
        panelChoiceClasses,
        "shrink-0",
        // Narrow, its dots alone; the menu carries the name.
        // The dots already count what is shown.
        "[&_[data-slot=choice-trigger]>span:nth-of-type(2)]:hidden",
        "@max-[360px]:[&_[data-slot=choice-trigger]>span]:sr-only [&_[data-slot=choice-menu]]:min-w-[200px]",
      )}
      options={statusOptions}
    />
  );
  const mobileFilters = filterBar(
    <ChoiceSelect
      label="Sted"
      smoothWidth
      value={place}
      onChange={pickPlace}
      triggerLabel={place || placeFallback}
      className={cn(
        inlineChoiceClasses,
        "[&_[data-slot=choice-trigger]>span:nth-of-type(2)]:hidden",
        !place && "[&_[data-slot=choice-trigger]]:font-medium",
      )}
      options={placeOptions}
    />,
  );
  const shownStatuses = statusOrder.filter((value) =>
    statusValue.includes(value),
  );
  const filterSheet = filterSheetOpen && (
    <FilterSheet
      label="Filtre"
      onClose={() => setFilterSheetOpen(false)}
      sections={[
        {
          id: "category",
          label: "Kategori",
          summary: category.length ? categorySummary(category) : "Alle",
          content: (
            <ChoiceSelect
              inline
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
              label="Prosjektstatus"
              multiple
              value={statusValue}
              onChange={pickStatus}
              options={statusOptions}
            />
          ),
        },
      ]}
    />
  );

  const sortFilter = (
    <ChoiceSelect
      label="Sorter prosjekter"
      value={sort}
      // A narrow list keeps the icon; the menu names the order.
      className={cn(
        sortChoice,
        // Beside the view switch, not at the edge: no overhang.
        "mr-0",
        "md:@max-[320px]/list:[&_[data-slot=choice-trigger]>span]:sr-only",
        // Phones: beside the view button, a narrow list keeps the icon alone.
        "max-md:@max-[360px]/list:[&_[data-slot=choice-trigger]>span]:sr-only",
        // Beside the longer count, a narrow list keeps its icon alone too.
        outsideHits > 0 &&
          "@max-[560px]/list:[&_[data-slot=choice-trigger]>span]:sr-only",
      )}
      icon={<ArrowDownUp size={14} />}
      onChange={setSort}
      options={sortOptions}
    />
  );
  // Phones: one button naming the view, its views in a sheet.
  const densityMenu = (
    <ChoiceSelect
      label="Visning"
      value={density}
      onChange={(value) => storeDensity(value as ListDensity)}
      className={sortChoice}
      options={densityOptions.map(({ value, label, Icon }) => ({
        value,
        label,
        icon: <Icon size={18} aria-hidden="true" />,
      }))}
    />
  );
  const densitySwitch = (
    <div
      className="flex shrink-0 rounded-lg bg-ink/[0.05] p-0.5"
      role="group"
      aria-label="Visning"
    >
      {densityOptions.map(({ value, label, Icon }) => (
        <Fragment key={value}>
        {/* The layouts of the cards, then "Nytt", a view of its own. */}
        {value === "feed" && (
          <span
            className="pointer-events-none mx-1 my-2 w-px shrink-0 bg-border-strong"
            aria-hidden="true"
          />
        )}
        <button
          type="button"
          className={cn(
            // As tall as the sort beside it; the pressed pill moves with the
            // press, as the list does.
            "relative inline-flex h-8 min-w-8 items-center justify-center rounded-md px-[8.5px] text-muted",
            "hover:text-ink aria-pressed:bg-surface aria-pressed:text-ink aria-pressed:shadow-xs",
            // Either side of the divider presses the view beside it, up to
            // the line, so the gap is never dead.
            value === "expanded" &&
              "after:absolute after:inset-y-0 after:left-full after:w-[4.5px]",
            value === "feed" &&
              "after:absolute after:inset-y-0 after:right-full after:w-[4.5px]",
          )}
          aria-label={label}
          aria-pressed={density === value}
          data-tooltip={label}
          data-press=""
          onClick={() => storeDensity(value)}
        >
          <Icon size={15} className="shrink-0" aria-hidden="true" />
          {/* The pressed view names itself: the name opens out beside its
              symbol as the last one folds away. */}
          <span
            className={cn(
              "grid transition-[grid-template-columns,opacity] duration-180 ease-out-soft motion-reduce:transition-none",
              // A narrow list keeps the symbols alone.
              "@max-[360px]/list:hidden",
              density === value
                ? "grid-cols-[1fr] opacity-100"
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
        </Fragment>
      ))}
    </div>
  );
  const placeFilter = (
    <ChoiceSelect
      label="Sted"
      smoothWidth
      value={place}
      onChange={pickPlace}
      triggerLabel={place || placeFallback}
      icon={<MapPin size={15} aria-hidden="true" />}
      className={cn(
        panelChoiceClasses,
        "shrink-0",
        // Narrow, its pin alone; the menu names the place.
        "@max-[400px]:[&_[data-slot=choice-trigger]>span]:sr-only",
        place && panelChoiceActive,
      )}
      options={placeOptions}
    />
  );
  const desktopFilters = filterBar(
    <>
      {placeFilter}
      <ChoiceSelect
        label="Kategori"
        smoothWidth
        multiple
        value={category}
        onChange={setCategory}
        triggerLabel={categorySummary(category)}
        className={cn(
          panelChoiceClasses,
          category.length > 0 && panelChoiceActive,
        )}
        options={categoryOptions}
      />
      <span className="flex shrink-0">{statusFilter}</span>
    </>,
  );

  const shown = listedProjects.length;
  const total = shown + outsideHits;
  // Beside the map, the place the view is on, and how many match there.
  const countPlace = listBounds && place ? place : "";
  const inPlace = useMemo(
    () =>
      countPlace
        ? searchHits.filter((project) =>
            placesOf.get(project.id)?.includes(countPlace),
          ).length
        : 0,
    [countPlace, placesOf, searchHits],
  );
  const showInPlace = !!countPlace && inPlace !== shown;
  const showTotal = total !== (showInPlace ? inPlace : shown);
  // "Nytt" shows the news of every match in the place, not just those in
  // view; with no place, all of Norway.
  const feedProjects = useMemo(
    () =>
      density !== "feed"
        ? []
        : place
          ? searchHits.filter((project) =>
              placesOf.get(project.id)?.includes(place),
            )
          : searchHits,
    [density, place, placesOf, searchHits],
  );
  const feedPlace = place || "Norge";
  const feedLabel = `Nytt fra ${feedProjects.length} ${feedProjects.length === 1 ? "prosjekt" : "prosjekter"} i ${feedPlace}`;
  const feedCount = (
    <span className="whitespace-nowrap" role="status" aria-label={feedLabel}>
      {feedLabel}
    </span>
  );
  // Words that frame the map on what they count. Their press area reaches
  // past the line, as tall as a finger needs.
  const countLink =
    "relative text-ink-soft underline decoration-border-strong underline-offset-3 transition-[text-decoration-color,color] duration-120 hover:text-ink hover:decoration-current after:absolute after:-inset-x-1 after:-inset-y-1.5 pointer-coarse:after:-inset-y-3";
  // Every part leads with a dot, clipped where the part starts a line: the
  // first, and any wrapped onto a new one, so no line starts with a dot.
  const countSeparator = (
    <span aria-hidden="true" className="w-4 shrink-0 text-center">
      ·
    </span>
  );
  // With matches outside the map: what's in view, in the place the view is
  // on, then all of them; a press on either of the last frames them. The
  // padding keeps the links' press areas clear of the clip.
  const listCount =
    density === "feed" ? (
      <span className="text-ui min-w-0 truncate text-muted tabular-nums">
        {feedCount}
      </span>
    ) : outsideHits > 0 ? (
      <span className="-my-3 min-w-0 overflow-hidden py-3">
        <span className="text-ui -ml-4 flex min-w-0 flex-wrap items-center gap-y-1 text-muted tabular-nums">
          <span className="inline-flex min-w-0 items-center">
            {countSeparator}
            <span
              className="whitespace-nowrap"
              role="status"
              aria-label={`${shown} ${shown === 1 ? "synlig prosjekt" : "synlige prosjekter"}`}
            >
              {shown} {shown === 1 ? "synlig" : "synlige"}
              {/* A narrow list keeps the line whole with the shorter words. */}
              <span className="@max-[560px]/list:hidden">
                {shown === 1 ? " prosjekt" : " prosjekter"}
              </span>
            </span>
          </span>
          {showInPlace && (
            <span className="inline-flex min-w-0 items-center whitespace-nowrap">
              {countSeparator}
              <button
                type="button"
                className={cn(countLink, "flex min-w-0")}
                aria-label={`${inPlace} i ${countPlace}, vis ${countPlace} på kartet`}
                onClick={() => goToPlace(countPlace)}
              >
                {/* A long name gives way; the press area stays whole. */}
                <span className="max-w-[12rem] truncate">
                  {inPlace} i {countPlace}
                </span>
              </button>
            </span>
          )}
          {showTotal && (
            <span className="inline-flex items-center whitespace-nowrap">
              {countSeparator}
              <button
                type="button"
                className={countLink}
                aria-label={`${total} totalt, vis alle på kartet`}
                onClick={showSearchHits}
              >
                {total} totalt
              </button>
            </span>
          )}
        </span>
      </span>
    ) : (
      <span
        className="text-ui whitespace-nowrap text-muted tabular-nums"
        role="status"
        aria-label={`${shown} ${shown === 1 ? "prosjekt" : "prosjekter"}`}
      >
        {shown} {shown === 1 ? "prosjekt" : "prosjekter"}
      </span>
    );
  // Only filters can be undone; an empty stretch of map has no action.
  const emptyActions = filtersChanged && [
    outsideHits > 0 && needle && (
      <EmptyAction
        key="hits"
        icon={<ZoomOut size={15} />}
        onClick={showSearchHits}
      >
        Vis {outsideHits} treff
      </EmptyAction>
    ),
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
  // Lagret keeps cards in "Nytt" too.
  const cardDensity = density === "feed" ? "compact" : density;
  const feed = useMemo(
    () => (density === "feed" ? feedEntries(feedProjects, activity) : []),
    [activity, density, feedProjects],
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
  // Below what's in view, the rest of the place it's on, muted.
  const listItems = useMemo(
    () =>
      offMapProjects.length
        ? [...listedProjects, ...offMapProjects]
        : listedProjects,
    [listedProjects, offMapProjects],
  );
  const offMapIds = useMemo(
    () => new Set(offMapProjects.map((project) => project.id)),
    [offMapProjects],
  );
  const listRows = useListMotion(
    listItems,
    projectKey,
    listRef,
    "data-card-id",
  );
  const renderCard = (project: Project) => (
    <ProjectCard
      key={project.id}
      project={project}
      commentCount={activity[project.id]?.comments ?? 0}
      density={cardDensity}
      saved={savedIds.has(project.id)}
      offMap={offMapIds.has(project.id)}
      news={news.get(project.id)}
      onOpen={openListCard}
      onSave={saveCard}
      onHover={hoverCard}
    />
  );
  const projectResults = (
    <section
      ref={listRef}
      data-drawer-scroll
      className={cn(
        "min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain bg-surface scrollbar-thin max-md:bg-transparent",
        // Centred on the window, like the header above it.
        wide && "[scrollbar-gutter:stable_both-edges]",
      )}
      aria-label="Prosjektliste"
    >
      <div
        className={cn(
          // At least as tall as the list, so on desktop "Foreslå prosjekt"
          // sits at the bottom however few rows there are. On phones it
          // follows the last row, as the drawer's height keeps changing.
          "@container/list flex min-h-full flex-col pb-8 max-md:px-4.5 max-md:pt-0 max-md:pb-6",
          // Maximized, both edges keep a scrollbar's gutter, so it is even.
          wide ? "mx-auto w-full max-w-[880px] px-6" : "md:px-gutter-scroll",
        )}
      >
        {isMobile ? mobileFilters : desktopFilters}
        {isMobile && filterSheet}
        {/* Too narrow for both, the views and order go under the count;
            on phones they stay beside it, and the count wraps instead. */}
        <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border py-1.5 max-md:flex-nowrap">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="sr-only">Prosjekter</h1>
            {listCount}
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1.5 max-md:gap-0">
            {/* The switch at the edge, so the order coming and going, or a
                longer name for it, never moves it. "Nytt" has its own order. */}
            {density !== "feed" && sortFilter}
            {isMobile ? densityMenu : densitySwitch}
          </div>
        </div>
        {density === "feed" && feedProjects.length > 0 && (
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
        {/* Kept when empty, so rows filtered out can fade in it. */}
        <ol className="relative" data-list-motion="">
          {density !== "feed" &&
            listRows
              .filter((project) => !offMapIds.has(project.id))
              .map(renderCard)}
        </ol>
        {/* A list of their own, so a project coming into view is one row
            moving across rather than every row before it moving down. */}
        {density !== "feed" && offMapIds.size > 0 && (
          <ol aria-label={`Utenfor kartet i ${place}`}>
            {listRows
              .filter((project) => offMapIds.has(project.id))
              .map(renderCard)}
          </ol>
        )}
        {(density === "feed"
          ? feedProjects.length === 0
          : listRows.length === 0) && (
          // Fades in as the last rows fade out over it.
          <div className="animate-panel-fade-in">
            <EmptyState
              level={2}
              icon={
                filtersChanged ? <Search size={22} /> : <MapPin size={22} />
              }
              title={filtersChanged ? "Ingen treff" : "Ingen prosjekter her"}
            >
              {emptyActions}
            </EmptyState>
          </div>
        )}
        <div className="flex pt-6 md:mt-auto">
          <button
            type="button"
            className={cn(quietAction, "gap-1.5 text-muted hover:text-ink")}
            onClick={() => openEditor()}
          >
            <Plus size={15} aria-hidden="true" />
            {canModerate ? "Legg til prosjekt" : "Foreslå prosjekt"}
          </button>
        </div>
      </div>
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
      // Escape steps down from the full page before closing.
      onEscape={maximized ? minimize : undefined}
      full={!isMobile && wide}
      mobile={isMobile}
      onToggleFull={isMobile ? undefined : maximized ? minimize : maximize}
      saved={savedIds.has(post.id)}
      onSave={() => toggleSave(post.id)}
      onNotify={notify}
    />
  );

  const missingProject = (
    <div className="flex min-h-[250px] flex-col items-center justify-center gap-[18px] px-6 py-[55px] text-center text-muted">
      <MapPin size={28} />
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
  function openEditor(draft?: Partial<Project>) {
    if (draft && editorOpen) {
      if (editorDirty.current?.()) editorClose.current?.();
      else setEditorSeed(({ key }) => ({ key: key + 1, draft }));
      return;
    }
    setEditorSeed(({ key }) => ({ key: key + 1, draft }));
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
  function openProfile(start: "profile" | "settings" = "profile") {
    rememberTrigger("account");
    setAccountStart(({ n }) => ({ view: start, n: n + 1 }));
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
    if (node) setDrawerReady(true);
  };
  async function signOut() {
    const result = await authClient.signOut().catch(() => null);
    if (!result || result.error)
      return notify("Kunne ikke logge ut. Prøv igjen.", { error: true });
    setModal(null);
    setSavedOnly(false);
    if (suggestionsOpen) closeSuggestions();
    notify("Du er logget ut");
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
    "hover:bg-ink/[0.06] hover:text-ink active:scale-[0.97] data-popup-open:bg-ink/[0.06] motion-reduce:transition-none motion-reduce:active:scale-100",
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
      onSuggestions={() => openSuggestions()}
      onProfile={() => openProfile()}
      onSaved={showSaved}
      onSettings={() => openProfile("settings")}
      onMemberView={switchMemberView}
      onSignOut={() => void signOut()}
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
    // icon row, borderless like its neighbours so it doesn't echo the filter pills.
    <button
      type="button"
      className={cn(
        compactIconAction,
        "w-auto px-3 text-ui font-medium text-ink",
      )}
      aria-haspopup="dialog"
      data-login-button=""
      data-press=""
      onClick={() => requireLogin()}
    >
      Logg inn
    </button>
  );
  /** One of the list header's actions, while it fits beside the others. */
  const inline = (id: string, node: ReactNode) =>
    node && !headerOverflow.hidden.has(id) ? (
      <div className="flex shrink-0" data-overflow-item={id}>
        {node}
      </div>
    ) : null;
  const overflowActions = (
    [
      {
        id: "theme",
        label: "Mørk modus",
        icon: <Moon size={16} />,
        checked: dark,
        onSelect: toggleTheme,
      },
      {
        id: "maximize",
        label: "Vis som helside",
        icon: <Maximize2 size={16} />,
        onSelect: maximize,
      },
    ] satisfies OverflowAction[]
  ).filter((action) => headerOverflow.hidden.has(action.id));
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
      maximized: !isMobile && wide,
      active: topLayer === layer,
      onToggleMaximized: maximized ? minimize : maximize,
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
          <Panel {...frame}>
            <AccountPanel
              key={accountStart.n}
              initialView={accountStart.view}
              onSignedOut={() => {
                setModal(null);
                notify("Du er logget ut");
              }}
            />
          </Panel>
        );
      case "saved":
        return (
          <Panel {...frame} titled>
            <SavedProjects
              projects={savedProjects}
              activity={activity}
              density={cardDensity}
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
                closeRef={editorClose}
                dirtyRef={editorDirty}
                onClose={() => setEditorOpen(false)}
                onSave={async (project) => {
                  await mutate({ action: "project", project, create: true });
                  setQuery("");
                  setStatus([]);
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
                closeRef={editorClose}
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
      <div
        className="flex min-h-0 flex-1 flex-col"
        // Under the panels it stays in place, ready to swipe back to.
        inert={liveLayers.length > 0}
        aria-hidden={liveLayers.length > 0 || undefined}
      >
        <div className="relative z-10 shrink-0 bg-surface px-4.5 pb-0.5 max-xs:px-3.5">
          <div className="flex h-11 items-center justify-between">
            {brand}
            <div className="flex items-center gap-0.5">
              <ThemeToggle tooltip={false} />
              {profileButton}
            </div>
          </div>
        </div>
        {projectResults}
      </div>
    </>
  );
  const drawerShell = isMobile && !drawerReady && (
    <div
      aria-hidden="true"
      className={cn(
        explorerDrawerClasses,
        sheetShadowClasses,
        "fixed inset-x-0 bottom-0 z-[900] flex flex-col",
        snapPoint === 1
          ? "h-[calc(100dvh-12px-env(safe-area-inset-top))]"
          : "inset-x-2 bottom-2 rounded-b-sheet",
        snapPoint === middleSnapPoint && "h-[calc(58dvh-8px)]",
        snapPoint === compactSnapPoint && "h-[128px]",
      )}
    >
      <div className="flex h-5 shrink-0 items-center justify-center">
        <DrawerGrip />
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
        snap={
          layer === "project" && postSnap?.id === panelPostId
            ? {
                points: isFolded(postSnap.point)
                  ? [postSnap.point, ...projectSnapPoints]
                  : projectSnapPoints,
                point: postSnap.point,
                onChange: movePost,
                folded: isFolded(postSnap.point),
              }
            : undefined
        }
      >
        {layerContent(layer)}
      </PanelDrawer>
    ));

  return (
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
              "absolute top-2.5 z-[35] transition-[left,opacity] duration-320 ease-out-soft motion-reduce:transition-none",
              "[[data-resizing]_&]:transition-none",
              sidebarMode !== "collapsed" &&
                // Left of the maximize button, the header's last, or last
                // itself once that is in the menu.
                headerOverflow.hidden.has("maximize")
                ? "left-[calc(var(--sidebar-width)-0.75rem-2.75rem)]"
                : "left-[calc(var(--sidebar-width)-0.75rem-5.625rem)]",
              sidebarMode === "maximized" && "pointer-events-none opacity-0",
            )}
            style={
              sidebarMode === "collapsed" ? { left: toggleRest } : undefined
            }
            inert={sidebarMode === "maximized"}
            hidden={osmFocus}
            data-explorer-toggle=""
          >
            {sidebarToggle}
          </div>
          {/* The base layer: stays mounted under panels, so it keeps its scroll. */}
          <div
            className={cn(
              "absolute inset-y-0 left-0 flex flex-col bg-surface",
              wide
                ? "z-30 w-screen"
                : asideCollapsed
                  ? "w-(--sidebar-width)"
                  : "w-full",
              explorerHidden && "invisible",
            )}
            data-explorer-layer=""
            // Live again as soon as a panel starts sliding away, so focus
            // can return to the card it was opened from.
            inert={sidebarMode === "collapsed" || liveLayers.length > 0}
            aria-hidden={liveLayers.length > 0 || undefined}
          >
            <header
              className={cn(
                "flex h-16 shrink-0 items-center justify-between gap-2 pr-3 pl-6",
              )}
              // Maximized, it spans the list's column: the logo over its
              // start, the controls over its end.
              style={
                wide
                  ? {
                      // Icon glyphs, not hit areas, end on the list's edge.
                      paddingLeft:
                        "max(1.5rem, calc((100% - 880px) / 2 + 1.5rem))",
                      paddingRight:
                        "max(0.75rem, calc((100% - 880px) / 2 + 0.75rem))",
                    }
                  : undefined
              }
              data-explorer-header=""
            >
              <div data-explorer-brand="">{brand}</div>
              <nav
                ref={headerNavRef}
                className="flex items-center gap-0.5"
                aria-label="Konto"
                data-explorer-nav=""
              >
                {inline("theme", <ThemeToggle />)}
                {overflowActions.length > 0 && (
                  <OverflowMenu actions={overflowActions} />
                )}
                {profileButton}
                <span
                  aria-hidden="true"
                  className="mx-1.5 h-5 w-px shrink-0 bg-border"
                />
                {/* The sidebar toggle stands here (see below). */}
                {sidebarMode !== "maximized" && (
                  <span
                    aria-hidden="true"
                    className="size-11 shrink-0"
                    data-toggle-slot=""
                  />
                )}
                {inline(
                  "maximize",
                  <MaximizeButton
                    maximized={sidebarMode === "maximized"}
                    onToggle={sidebarMode === "maximized" ? minimize : maximize}
                    labels={["Vis som helside", "Vis kart"]}
                  />,
                )}
              </nav>
            </header>
            <div className="relative min-h-0 flex-1">
              <div className="absolute inset-0 flex flex-col">
                {projectResults}
              </div>
            </div>
          </div>
          {layers.map((layer, index) => (
            // Panels cover the whole sidebar, header included, and slide
            // out from its left edge. Maximized, they cover the map too.
            <div
              key={layer === "project" ? `project-${panelPostId}` : layer}
              className={cn(
                "absolute inset-y-0 left-0 flex flex-col overflow-hidden bg-surface",
                wide
                  ? "w-screen"
                  : cn(
                      "shadow-[10px_0_30px_rgb(20_28_24/0.10)]",
                      asideCollapsed
                        ? "w-(--sidebar-width) border-r border-border"
                        : "w-full",
                    ),
                // Over a maximized sidebar a panel appears at once, in place.
                !openedMaximized[layer] && "animate-panel-in",
              )}
              style={{ zIndex: 40 + index }}
              data-sidebar-layer={layer}
              data-project-layer={layer === "project" ? "" : undefined}
              data-full={wide || undefined}
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
              contentWidth={() => headerWidth(false)}
              naturalWidth={() => headerWidth(true)}
              contentRef={headerNavRef}
            />
          )}
        </aside>
      )}

      <main
        className="relative isolate flex min-h-0 min-w-0 flex-1 overflow-hidden bg-surface"
        aria-label="Utforsk prosjekter"
        // Under a maximized sidebar the map is out of reach, but untouched.
        inert={!isMobile && maximized}
      >
        <section
          className="relative isolate h-full min-h-0 w-full min-w-0 flex-1"
          aria-label="Prosjektkart"
        >
          <ProjectMap
            projects={osm.on && osm.hideProjects ? noProjects : mapProjects}
            initialView={initial.view}
            onViewChange={onMapView}
            onReady={onMapReady}
            onGestureStart={onMapGesture}
            onUserMove={onMapMove}
            bottomInset={isMobile ? mobileMapInset : undefined}
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
            overlays={
              osm.allowed
                ? [
                    {
                      label: "Nye veier og baner",
                      icon: <Construction size={17} />,
                      on: osm.on,
                      onToggle: osm.toggle,
                    },
                  ]
                : undefined
            }
          />
          <OsmPanel
            review={osm}
            keyboard={liveLayers.length === 0}
            onCreate={openEditor}
            onOpenProject={(id) => openPost(id)}
            className="absolute top-3 left-1/2 z-[660] -translate-x-1/2 max-md:right-17 max-md:left-3 max-md:w-auto max-md:translate-x-0"
          />
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
                            size={15}
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
                contentClassName={mobileDrawerInnerClasses}
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
                  <button
                    ref={drawerHandleRef}
                    className={cn(
                      "group/handle flex h-5 w-full shrink-0 touch-none cursor-grab items-center justify-center p-0 active:cursor-grabbing",
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
    </div>
  );
});
