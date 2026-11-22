"use client";
import { useCallback, useEffect, useRef } from "react";
import {
  exploreSearch,
  type ExploreState,
  type MapView,
} from "../lib/explore-state";
import { replaceUrl } from "../lib/explore-history";

/**
 * Filters, the map position and the full-page view live in the query
 * string, for sharing and reloads. Each change replaces the entry, so
 * history only holds pages. The map's position is written once it has
 * rested, not after every move (`syncSoon`).
 */
export function useUrlSync({
  state,
  view,
  paused,
}: {
  state: Omit<ExploreState, "view">;
  /** The map's current view. */
  view: () => MapView | null;
  /** Mid-step the entry is changing; the step syncs the URL when it lands. */
  paused: () => boolean;
}) {
  const current = useRef(state);
  const timer = useRef(0);
  const latest = useRef({ view, paused });
  useEffect(() => {
    latest.current = { view, paused };
  });
  /** The query string for a path in the explorer. */
  const searchFor = useCallback(
    () => exploreSearch({ ...current.current, view: latest.current.view() }),
    [],
  );
  const syncUrl = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = 0;
    if (latest.current.paused()) return;
    const path = window.location.pathname;
    const search = searchFor();
    if (window.location.search !== search) replaceUrl(path + search);
  }, [searchFor]);
  const { query, status, category, sort, full, place } = state;
  useEffect(() => {
    current.current = { query, status, category, sort, full, place };
    syncUrl();
  }, [query, status, category, sort, full, place, syncUrl]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const syncSoon = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(syncUrl, 300);
  }, [syncUrl]);
  const withSearch = useCallback(
    (path: string) => {
      syncUrl();
      return path + searchFor();
    },
    [searchFor, syncUrl],
  );
  return {
    syncUrl,
    /** Syncs once the map has rested a moment. */
    syncSoon,
    /** A path in the explorer, with the current filters and map position. */
    withSearch,
  };
}
