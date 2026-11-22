import type { Comment, Project } from "./data";

/** A project's newest comment, its text shortened, for the "Nytt" view. */
export type LatestComment = {
  id: string;
  author: string;
  text: string;
  date: string;
};

/** A project's comments: all of them, those from the past week, the newest. */
export type ProjectActivity = {
  comments: number;
  recent: number;
  latest?: LatestComment;
};

/**
 * What the explorer shows. Comments themselves load per project, or per
 * member for a profile, as they're opened (see `CommentList`).
 */
export type CommunityData = {
  projects: Project[];
  activity: Record<string, ProjectActivity>;
  /** The member's saved projects. */
  saved: string[];
  /** The member's votes, by comment. */
  votes: Record<string, number>;
  /** Pending suggestions: the queue for moderators, one's own otherwise. */
  suggestions: number;
  /** A member's suggestions reviewed since they last looked. */
  reviewed: number;
};

/** What each community mutation answers: only what it changed. */
export type MutationResult =
  | {
      action: "comment" | "delete-comment";
      projectId: string;
      comments: Comment[];
      activity: ProjectActivity;
    }
  | { action: "vote"; commentId: string; value: number; votes: number }
  | { action: "save"; projectId: string; saved: boolean }
  | { action: "project"; project: Project };

/** A list of comments: one project's discussion, or one member's comments. */
export type CommentList = `project:${string}` | `author:${string}`;

export const projectComments = (id: string): CommentList => `project:${id}`;
export const authorComments = (username: string): CommentList =>
  `author:${username}`;

export function commentListUrl(list: CommentList) {
  const at = list.indexOf(":");
  return `/api/comments?${list.slice(0, at)}=${encodeURIComponent(list.slice(at + 1))}`;
}

/** Parses a list name, e.g. from a request header; null if malformed. */
export function parseCommentList(value: string | null): CommentList | null {
  return value && /^(project|author):.+$/.test(value)
    ? (value as CommentList)
    : null;
}

/** Set by `proxy.ts`: the comment list a page's first render includes. */
export const commentListHeader = "x-comment-list";
