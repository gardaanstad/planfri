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
import type { CommunityMutation } from "../lib/community-rules";
import type { Comment, Project } from "../lib/data";
import type { SuggestionInput, SuggestionMutation } from "../lib/suggestions";
type CommunityData = {
  projects: Project[];
  comments: Comment[];
  /** The member's saved projects. */
  saved: string[];
  votes: Record<string, number>;
  /** Pending suggestions: the queue for moderators, one's own otherwise. */
  suggestions: number;
  /** A member's suggestions reviewed since they last looked. */
  reviewed: number;
};
type CommunityContext = CommunityData & {
  mutate: (mutation: CommunityMutation) => Promise<void>;
  refresh: () => Promise<void>;
  /** Sends a member's suggestion to the moderation queue. */
  suggest: (suggestion: SuggestionInput) => Promise<void>;
};
// Returning to the tab reads again only if the last request is this old.
const STALE_AFTER = 30_000;
const Context = createContext<CommunityContext | null>(null);
// Polling mostly returns what is already shown; keeping unchanged parts by
// reference spares the explorer and map from rebuilding on every read.
function reuse<T>(current: T, next: T) {
  return JSON.stringify(current) === JSON.stringify(next) ? current : next;
}
function merge(current: CommunityData, next: CommunityData): CommunityData {
  return {
    projects: reuse(current.projects, next.projects),
    comments: reuse(current.comments, next.comments),
    saved: reuse(current.saved, next.saved),
    votes: reuse(current.votes, next.votes),
    suggestions: next.suggestions,
    reviewed: next.reviewed,
  };
}
export function CommunityProvider({
  children,
  initialData,
  initialUserId,
}: {
  children: ReactNode;
  initialData: CommunityData;
  initialUserId?: string;
}) {
  const { user } = useAuth();
  const [state, setState] = useState({
    data: initialData,
    userId: initialUserId,
  });
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
  // When the last read or write went out, so returning to the tab reads
  // once, and only if the data is a while old.
  const lastRequest = useRef(0);
  useEffect(() => {
    identity.current = user?.id;
  }, [user?.id]);
  function receive(data: CommunityData, userId?: string) {
    loadedFor.current = userId;
    setState((state) => ({ data: merge(state.data, data), userId }));
  }
  const refresh = useCallback(async () => {
    const current = user?.id;
    const version = ++revision.current;
    lastRequest.current = Date.now();
    const data = await apiRequest<CommunityData>("/api/community");
    if (identity.current === current && revision.current === version)
      receive(data, current);
  }, [user?.id]);
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
  async function mutate(mutation: CommunityMutation) {
    const current = user?.id;
    // A save or a vote shows at once and falls back if the server refuses it.
    if (mutation.action === "save")
      return sendInOrder<boolean>(
        `save:${mutation.projectId}`,
        mutation,
        current,
        setPendingSaves,
        mutation.projectId,
        mutation.saved,
      );
    if (mutation.action === "vote")
      return sendInOrder<number>(
        `vote:${mutation.commentId}`,
        mutation,
        current,
        setPendingVotes,
        mutation.commentId,
        mutation.value,
      );
    return send(mutation, current);
  }
  async function sendInOrder<T>(
    key: string,
    mutation: CommunityMutation,
    current: string | undefined,
    setPending: Dispatch<SetStateAction<Record<string, T>>>,
    id: string,
    value: T,
  ) {
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
  }
  async function send(mutation: CommunityMutation, current?: string) {
    const version = ++revision.current;
    lastRequest.current = Date.now();
    const data = await apiRequest<CommunityData>("/api/community", {
      method: "POST",
      body: JSON.stringify(mutation),
    });
    if (identity.current === current && revision.current === version)
      receive(data, current);
    else if (identity.current === current) await refresh();
  }
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
  // A pending vote moves the comment's count by its difference from the
  // member's last confirmed vote.
  const comments = useMemo(() => {
    if (!Object.keys(pendingVotes).length) return state.data.comments;
    return state.data.comments.map((comment) => {
      if (!(comment.id in pendingVotes)) return comment;
      const change =
        pendingVotes[comment.id] - (state.data.votes[comment.id] || 0);
      return change ? { ...comment, votes: comment.votes + change } : comment;
    });
  }, [pendingVotes, state.data.comments, state.data.votes]);
  async function suggest(suggestion: SuggestionInput) {
    await apiRequest("/api/suggestions", {
      method: "POST",
      body: JSON.stringify({
        action: "submit",
        suggestion,
      } satisfies SuggestionMutation),
    });
    // The pending count is part of the community read.
    void refresh().catch(() => {});
  }
  const personal = state.userId === user?.id && !!user;
  return (
    <Context.Provider
      value={{
        ...state.data,
        comments: personal ? comments : state.data.comments,
        saved: personal ? saved : [],
        votes: personal ? votes : {},
        suggestions: personal ? state.data.suggestions : 0,
        reviewed: personal ? state.data.reviewed : 0,
        mutate,
        refresh,
        suggest,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useCommunity() {
  const context = useContext(Context);
  if (!context) throw new Error("useCommunity requires CommunityProvider");
  return context;
}
