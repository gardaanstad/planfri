"use client";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { Point, Project } from "../lib/data";
import { apiRequest, errorMessage } from "../lib/api-client";
import {
  covered,
  matchProject,
  type OsmCandidate,
  type OsmFeed,
  type OsmKind,
  type OsmMatch,
  type OsmStatus,
  osmTitles,
} from "../lib/osm-candidates";
import type { OsmLayer, OsmLine } from "./project-map";
import { notify } from "./toast";

const modeKey = "planfri-osm-mode";
const modeEvent = "planfri-osm-mode";
// Without browser storage, the mode still lasts for this visit.
let modeFallback = false;
function storedMode() {
  try {
    return localStorage.getItem(modeKey) === "1";
  } catch {
    return modeFallback;
  }
}
function storeMode(on: boolean) {
  modeFallback = on;
  try {
    if (on) localStorage.setItem(modeKey, "1");
    else localStorage.removeItem(modeKey);
  } catch {
    /* The fallback above holds it. */
  }
  window.dispatchEvent(new Event(modeEvent));
}
function subscribeMode(callback: () => void) {
  window.addEventListener(modeEvent, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(modeEvent, callback);
    window.removeEventListener("storage", callback);
  };
}

/** Whether the OSM mode is on in this browser, moderator or not. */
export const useOsmModeStored = () =>
  useSyncExternalStore(subscribeMode, storedMode, () => false);

type Entry = OsmLine & { found: OsmMatch | null };
const noEntries: Entry[] = [];
const allKinds = { rail: true, road: true };
const allStatuses = { construction: true, proposed: true };

/**
 * Moderators' OSM mode: railways and roads under construction and proposed
 * in OpenStreetMap, drawn on the map as candidates for new projects. What
 * a project already covers is left out of the review; the rest can be
 * stepped through, started as a project, or hidden for every moderator.
 * OSM is only read when a moderator asks.
 */
export function useOsmReview({
  allowed,
  projects,
  onFrame,
  beforeToggle,
}: {
  /** Moderators only; the server checks too. */
  allowed: boolean;
  /** Runs as the mode turns on or off, before anything changes. */
  beforeToggle?: () => void;
  projects: Project[];
  /** Frames a candidate on the map. */
  onFrame: (points: Point[]) => void;
}) {
  const stored = useOsmModeStored();
  const on = allowed && stored;
  const [feed, setFeed] = useState<OsmFeed | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [kinds, setKinds] = useState<Record<OsmKind, boolean>>(allKinds);
  const [statuses, setStatuses] =
    useState<Record<OsmStatus, boolean>>(allStatuses);
  const [showHidden, setShowHidden] = useState(false);
  // The map's own projects out of the way while reviewing.
  const [hideProjects, setHideProjects] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const requested = useRef(false);

  // The candidates as last read: from the server's store, not from OSM.
  const read = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setFeed(await apiRequest<OsmFeed>("/api/osm-candidates"));
    } catch (failure) {
      setError(errorMessage(failure, "Kunne ikke hente kandidatene."));
    } finally {
      setLoading(false);
    }
  }, []);
  /** Reads OpenStreetMap again: only ever on a moderator's request. */
  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    setError("");
    try {
      setFeed(
        await apiRequest<OsmFeed>("/api/osm-candidates", {
          method: "POST",
          body: JSON.stringify({ action: "refresh" }),
        }),
      );
    } catch (failure) {
      setError(errorMessage(failure, "Kunne ikke hente fra OpenStreetMap."));
    } finally {
      setRefreshing(false);
    }
  }
  const start = useEffectEvent(() => {
    if (requested.current) return;
    requested.current = true;
    void read();
  });
  useEffect(() => {
    if (on) start();
  }, [on]);

  const candidates = feed?.candidates;
  const titles = useMemo(() => osmTitles(candidates ?? []), [candidates]);
  const matches = useMemo(
    () =>
      new Map(
        (candidates ?? []).map((candidate) => [
          candidate.id,
          matchProject(candidate, projects),
        ]),
      ),
    [candidates, projects],
  );
  const dismissed = useMemo(() => new Set(feed?.dismissed), [feed?.dismissed]);
  const entries = useMemo<Entry[]>(() => {
    if (!candidates) return noEntries;
    return candidates.flatMap((candidate) => {
      const found = matches.get(candidate.id) ?? null;
      const state = dismissed.has(candidate.id)
        ? "dismissed"
        : covered(found)
          ? "exists"
          : "new";
      if (state === "dismissed" && !showHidden) return [];
      return [
        {
          candidate,
          title: titles.get(candidate.id)!,
          state,
          found,
          match: found?.project.title,
        },
      ];
    });
  }, [candidates, matches, dismissed, showHidden, titles]);
  const visible = useMemo(
    () =>
      entries.filter(
        ({ candidate }) => kinds[candidate.kind] && statuses[candidate.status],
      ),
    [entries, kinds, statuses],
  );
  // What's left to review, longest first.
  const queue = useMemo(
    () => visible.filter((entry) => entry.state === "new"),
    [visible],
  );
  const selected =
    visible.find((entry) => entry.candidate.id === selectedId) ?? null;

  function toggle() {
    beforeToggle?.();
    if (on) setSelectedId(null);
    storeMode(!on);
  }
  /** Selects a neighbour in the queue, and frames it. */
  function step(direction: 1 | -1) {
    if (!queue.length) return;
    const index = queue.findIndex((entry) => entry.candidate.id === selectedId);
    const next =
      index < 0
        ? direction === 1
          ? 0
          : queue.length - 1
        : (index + direction + queue.length) % queue.length;
    show(queue[next].candidate);
  }
  function show(candidate: OsmCandidate) {
    setSelectedId(candidate.id);
    onFrame(candidate.path);
  }
  async function setDismissed(ids: string[], value: boolean) {
    const apply = (hidden: boolean) =>
      setFeed(
        (current) =>
          current && {
            ...current,
            dismissed: [
              ...current.dismissed.filter((other) => !ids.includes(other)),
              ...(hidden ? ids : []),
            ],
          },
      );
    apply(value);
    try {
      await apiRequest("/api/osm-candidates", {
        method: "POST",
        body: JSON.stringify({ action: "dismiss", ids, dismissed: value }),
      });
    } catch (failure) {
      apply(!value);
      notify(errorMessage(failure, "Kunne ikke lagre endringen."), {
        error: true,
      });
      return false;
    }
    return true;
  }
  /** Hides a candidate for every moderator, and moves on to the next. */
  async function dismiss(id: string) {
    const index = queue.findIndex((entry) => entry.candidate.id === id);
    const rest = queue.filter((entry) => entry.candidate.id !== id);
    const next = rest.length ? rest[Math.max(0, index) % rest.length] : null;
    if (!(await setDismissed([id], true))) return;
    if (next) show(next.candidate);
    else setSelectedId(null);
    notify("Skjult", {
      undo: () => {
        void setDismissed([id], false).then((done) => done && setSelectedId(id));
      },
    });
  }
  /** Brings back every hidden candidate, for every moderator. */
  async function resetDismissed() {
    const ids = feed?.dismissed ?? [];
    if (!ids.length || !(await setDismissed(ids, false))) return;
    notify(ids.length === 1 ? "1 vises igjen" : `${ids.length} vises igjen`, {
      undo: () => void setDismissed(ids, true),
    });
  }

  const layer = useMemo<OsmLayer | undefined>(
    () =>
      on ? { lines: visible, selectedId, onSelect: setSelectedId } : undefined,
    [on, visible, selectedId],
  );

  return {
    allowed,
    on,
    toggle,
    layer,
    feed,
    loading,
    refreshing,
    error,
    refresh,
    kinds,
    setKinds,
    statuses,
    setStatuses,
    showHidden,
    setShowHidden,
    hideProjects,
    setHideProjects,
    resetDismissed,
    queue,
    selected,
    select: setSelectedId,
    step,
    dismiss,
    restore: (id: string) => void setDismissed([id], false),
  };
}
export type OsmReview = ReturnType<typeof useOsmReview>;
