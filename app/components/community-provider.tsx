"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { useAuth } from "./auth-provider";
import { apiRequest } from "../lib/api-client";
import {
  commentListUrl,
  projectComments,
  type CommentList,
  type CommunityData,
  type MutationResult,
} from "../lib/community";
import type { CommunityMutation } from "../lib/community-rules";
import type { Comment, Project } from "../lib/data";
import type { SuggestionInput, SuggestionMutation } from "../lib/suggestions";

type CommentLists = Partial<Record<CommentList, Comment[]>>;
type CommunityContext = CommunityData & {
  /** Comment lists loaded so far; read them with `useComments`. */
  comments: CommentLists;
  /** Keeps a list loaded and current while the returned cleanup is pending. */
  watch: (list: CommentList) => () => void;
  mutate: (mutation: CommunityMutation) => Promise<void>;
  refresh: () => Promise<void>;
  /** Sends a member's suggestion to the moderation queue. */
  suggest: (suggestion: SuggestionInput) => Promise<void>;
};
// Returning to the tab reads again only if the last request is this old.
const STALE_AFTER = 30_000;
const Context = createContext<CommunityContext | null>(null);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
// Polling mostly returns what is already shown; keeping unchanged parts by
// reference spares the explorer and map from rebuilding on every read.
function reuse<T>(current: T, next: T) {
  return same(current, next) ? current : next;
}
/** Keeps each unchanged project by reference, and the list if all are. */
function reuseProjects(current: Project[], next: Project[]) {
  const byId = new Map(current.map((project) => [project.id, project]));
  let changed = current.length !== next.length;
  const merged = next.map((project, index) => {
    const held = byId.get(project.id);
    if (held && same(held, project)) {
      if (current[index] !== held) changed = true;
      return held;
    }
    changed = true;
    return project;
  });
  return changed ? merged : current;
}
function merge(current: CommunityData, next: CommunityData): CommunityData {
  return {
    projects: reuseProjects(current.projects, next.projects),
    activity: reuse(current.activity, next.activity),
    saved: reuse(current.saved, next.saved),
    votes: reuse(current.votes, next.votes),
    suggestions: next.suggestions,
    reviewed: next.reviewed,
  };
}
/** Reads the community, or null if it's unchanged since the read tagged `etag`. */
async function readCommunity(etag: string | null) {
  const response = await fetch("/api/community", {
    cache: "no-store",
    headers: etag ? { "If-None-Match": etag } : {},
  });
  if (response.status === 304) return null;
  if (!response.ok) throw new Error("Noe gikk galt. Prøv igjen.");
  return {
    data: (await response.json()) as CommunityData,
    etag: response.headers.get("ETag"),
  };
}
export function CommunityProvider({
  children,
  initialData,
  initialUserId,
  initialComments,
}: {
  children: ReactNode;
  initialData: CommunityData;
  initialUserId?: string;
  initialComments?: CommentLists;
}) {
  const { user } = useAuth();
  const [state, setState] = useState({
    data: initialData,
    userId: initialUserId,
  });
  const [comments, setComments] = useState<CommentLists>(
    initialComments ?? {},
  );
  // Saves and votes shown before the server confirms them, by project and
  // by comment.
  const [pendingSaves, setPendingSaves] = useState<Record<string, boolean>>(
    {},
  );
  const [pendingVotes, setPendingVotes] = useState<Record<string, number>>(
    {},
  );
  // Each project's saves, and each comment's votes, reach the server in the
  // order they were made.
  const queues = useRef(new Map<string, Promise<unknown>>());
  const identity = useRef(user?.id);
  const revision = useRef(0);
  // Whose data is held: the server's render needs no immediate refetch.
  const loadedFor = useRef(initialUserId);
  // The tag of the read held, sent back so an unchanged read is empty.
  const etag = useRef<string | null>(null);
  // When the last read or write went out, so returning to the tab reads
  // once, and only if the data is a while old.
  const lastRequest = useRef(0);
  // How many readers each comment list has, and the latest read of each.
  const watched = useRef(new Map<CommentList, number>());
  const listRevision = useRef(new Map<CommentList, number>());
  // Lists the server rendered with, current for their first reader.
  const rendered = useRef(
    new Set(Object.keys(initialComments ?? {}) as CommentList[]),
  );
  useEffect(() => {
    identity.current = user?.id;
  }, [user?.id]);

  const setList = useCallback((list: CommentList, next: Comment[]) => {
    // Supersedes any read of the list still under way.
    listRevision.current.set(list, (listRevision.current.get(list) ?? 0) + 1);
    setComments((lists) => ({
      ...lists,
      [list]: lists[list] ? reuse(lists[list], next) : next,
    }));
  }, []);
  const loadList = useCallback(async (list: CommentList) => {
    const version = (listRevision.current.get(list) ?? 0) + 1;
    listRevision.current.set(list, version);
    const { comments } = await apiRequest<{ comments: Comment[] }>(
      commentListUrl(list),
    );
    if (listRevision.current.get(list) === version)
      setComments((lists) => ({
        ...lists,
        [list]: lists[list] ? reuse(lists[list], comments) : comments,
      }));
  }, []);
  const reloadWatched = useCallback(
    (only?: (list: CommentList) => boolean) => {
      for (const list of watched.current.keys())
        if (!only || only(list))
          void loadList(list).catch(() => {
            /* Keep the last successful read. */
          });
    },
    [loadList],
  );
  const watch = useCallback(
    (list: CommentList) => {
      const readers = watched.current.get(list) ?? 0;
      watched.current.set(list, readers + 1);
      // A list held from before shows at once and is read again.
      if (!readers && !rendered.current.delete(list))
        void loadList(list).catch(() => {
          /* Readers show it as loading until a read succeeds. */
        });
      return () => {
        const left = (watched.current.get(list) ?? 1) - 1;
        if (left) watched.current.set(list, left);
        else watched.current.delete(list);
      };
    },
    [loadList],
  );

  const refresh = useCallback(async () => {
    const current = user?.id;
    const version = ++revision.current;
    lastRequest.current = Date.now();
    reloadWatched();
    const read = await readCommunity(
      loadedFor.current === current ? etag.current : null,
    );
    if (!read || identity.current !== current || revision.current !== version)
      return;
    loadedFor.current = current;
    etag.current = read.etag;
    setState((state) => ({
      data: state.userId === current ? merge(state.data, read.data) : read.data,
      userId: current,
    }));
  }, [user?.id, reloadWatched]);
  useEffect(() => {
    const update = () => {
      void refresh().catch(() => {
        /* Keep the last successful read. Mutations show errors. */
      });
    };
    if (loadedFor.current !== user?.id) update();
    else lastRequest.current = Date.now();
    // Focus and visibilitychange both fire on returning to the tab.
    const updateIfStale = () => {
      if (document.hidden) return;
      if (Date.now() - lastRequest.current < STALE_AFTER) return;
      update();
    };
    const timer = window.setInterval(updateIfStale, 60_000);
    window.addEventListener("focus", updateIfStale);
    document.addEventListener("visibilitychange", updateIfStale);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", updateIfStale);
      document.removeEventListener("visibilitychange", updateIfStale);
    };
  }, [refresh, user?.id]);

  /** Lays a confirmed change over the data held. */
  const apply = useCallback(
    (result: MutationResult) => {
      const update = (change: (data: CommunityData) => CommunityData) =>
        setState((state) => ({ ...state, data: change(state.data) }));
      switch (result.action) {
        case "save":
          return update((data) => ({
            ...data,
            saved: result.saved
              ? data.saved.includes(result.projectId)
                ? data.saved
                : [...data.saved, result.projectId]
              : data.saved.filter((id) => id !== result.projectId),
          }));
        case "vote": {
          update((data) => {
            const votes = { ...data.votes, [result.commentId]: result.value };
            if (!result.value) delete votes[result.commentId];
            return { ...data, votes };
          });
          return setComments((lists) => {
            const next: CommentLists = {};
            for (const [list, comments] of Object.entries(lists) as [
              CommentList,
              Comment[],
            ][])
              next[list] = comments.some((item) => item.id === result.commentId)
                ? comments.map((item) =>
                    item.id === result.commentId
                      ? { ...item, votes: result.votes }
                      : item,
                  )
                : comments;
            return next;
          });
        }
        case "comment":
        case "delete-comment":
          update((data) => ({
            ...data,
            activity: { ...data.activity, [result.projectId]: result.activity },
          }));
          setList(projectComments(result.projectId), result.comments);
          // The author's own list, if a profile shows it, has changed too.
          return reloadWatched((list) => list.startsWith("author:"));
        case "project":
          return update((data) => {
            const index = data.projects.findIndex(
              (item) => item.id === result.project.id,
            );
            const projects = [...data.projects];
            if (index < 0) projects.push(result.project);
            else projects[index] = result.project;
            return { ...data, projects };
          });
      }
    },
    [reloadWatched, setList],
  );
  const send = useCallback(
    async (mutation: CommunityMutation, current?: string) => {
      // A read already under way may predate this change; it's dropped.
      ++revision.current;
      lastRequest.current = Date.now();
      const result = await apiRequest<MutationResult>("/api/community", {
        method: "POST",
        body: JSON.stringify(mutation),
      });
      if (identity.current === current) apply(result);
    },
    [apply],
  );
  const sendInOrder = useCallback(
    async <T,>(
      key: string,
      mutation: CommunityMutation,
      current: string | undefined,
      setPending: Dispatch<SetStateAction<Record<string, T>>>,
      id: string,
      value: T,
    ) => {
      setPending((pending) => ({ ...pending, [id]: value }));
      const queue = queues.current;
      const previous = queue.get(key);
      const request = (previous ?? Promise.resolve())
        .catch(() => {})
        .then(() => send(mutation, current));
      queue.set(key, request);
      try {
        await request;
      } finally {
        // A later change of the same item keeps showing until it lands.
        if (queue.get(key) === request) {
          queue.delete(key);
          setPending((pending) => {
            const rest = { ...pending };
            delete rest[id];
            return rest;
          });
        }
      }
    },
    [send],
  );
  const userId = user?.id;
  const mutate = useCallback(
    async (mutation: CommunityMutation) => {
      // A save or a vote shows at once and falls back if the server refuses it.
      if (mutation.action === "save")
        return sendInOrder<boolean>(
          `save:${mutation.projectId}`,
          mutation,
          userId,
          setPendingSaves,
          mutation.projectId,
          mutation.saved,
        );
      if (mutation.action === "vote")
        return sendInOrder<number>(
          `vote:${mutation.commentId}`,
          mutation,
          userId,
          setPendingVotes,
          mutation.commentId,
          mutation.value,
        );
      return send(mutation, userId);
    },
    [send, sendInOrder, userId],
  );
  const suggest = useCallback(
    async (suggestion: SuggestionInput) => {
      await apiRequest("/api/suggestions", {
        method: "POST",
        body: JSON.stringify({
          action: "submit",
          suggestion,
        } satisfies SuggestionMutation),
      });
      // The pending count is part of the community read.
      void refresh().catch(() => {});
    },
    [refresh],
  );

  const saved = useMemo(() => {
    const changes = Object.entries(pendingSaves);
    if (!changes.length) return state.data.saved;
    const ids = new Set(state.data.saved);
    for (const [id, on] of changes) {
      if (on) ids.add(id);
      else ids.delete(id);
    }
    return [...ids];
  }, [pendingSaves, state.data.saved]);
  const votes = useMemo(() => {
    if (!Object.keys(pendingVotes).length) return state.data.votes;
    return { ...state.data.votes, ...pendingVotes };
  }, [pendingVotes, state.data.votes]);
  const personal = state.userId === user?.id && !!user;
  // A pending vote moves the comment's count by its difference from the
  // member's last confirmed vote.
  const shownComments = useMemo(() => {
    if (!personal || !Object.keys(pendingVotes).length) return comments;
    const next: CommentLists = {};
    for (const [list, items] of Object.entries(comments) as [
      CommentList,
      Comment[],
    ][])
      next[list] = items.some((item) => item.id in pendingVotes)
        ? items.map((item) => {
            if (!(item.id in pendingVotes)) return item;
            const change =
              pendingVotes[item.id] - (state.data.votes[item.id] || 0);
            return change ? { ...item, votes: item.votes + change } : item;
          })
        : items;
    return next;
  }, [comments, pendingVotes, personal, state.data.votes]);
  const value = useMemo(
    () => ({
      ...state.data,
      comments: shownComments,
      saved: personal ? saved : [],
      votes: personal ? votes : {},
      suggestions: personal ? state.data.suggestions : 0,
      reviewed: personal ? state.data.reviewed : 0,
      watch,
      mutate,
      refresh,
      suggest,
    }),
    [
      state.data,
      shownComments,
      personal,
      saved,
      votes,
      watch,
      mutate,
      refresh,
      suggest,
    ],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useCommunity() {
  const context = useContext(Context);
  if (!context) throw new Error("useCommunity requires CommunityProvider");
  return context;
}
/** A comment list, loaded while it's read; undefined until it first is. */
export function useComments(list: CommentList | null) {
  const { comments, watch } = useCommunity();
  useEffect(() => (list ? watch(list) : undefined), [list, watch]);
  return list ? comments[list] : undefined;
}
