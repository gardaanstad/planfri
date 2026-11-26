import type { Comment } from "./data";

export type DiscussionSort = "relevant" | "newest" | "top";

/**
 * The first comment of the thread a comment is in. A reply to a comment
 * that's gone starts a thread of its own.
 */
function threadRoot(comment: Comment, byId: Map<string, Comment>) {
  let root = comment;
  const seen = new Set([root.id]);
  while (root.parentId && byId.has(root.parentId) && !seen.has(root.parentId)) {
    root = byId.get(root.parentId)!;
    seen.add(root.id);
  }
  return root;
}

/**
 * Where a thread lives: under the update its first comment was written
 * under, or, as "", in the project's own discussion. Replies follow.
 */
const home = (root: Comment) => root.updateId || "";

/** Where the comment with this id lives: an update's id, "" or, if it's gone, undefined. */
export function commentHome(comments: Comment[], id: string) {
  const byId = new Map(comments.map((comment) => [comment.id, comment]));
  const comment = byId.get(id);
  return comment && home(threadRoot(comment, byId));
}

/** How many comments, deleted ones aside, live in each place, by `commentHome`. */
export function commentCounts(comments: Comment[]) {
  const byId = new Map(comments.map((comment) => [comment.id, comment]));
  const counts = new Map<string, number>();
  for (const comment of comments) {
    if (comment.deleted) continue;
    const key = home(threadRoot(comment, byId));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * The threads that live in one place: under `updateId`, or without it in
 * the project's own discussion. Replies keep their parent visible, even when
 * only recent activity is requested. "relevant" lists threads active since
 * `latest` (the newest project update) first, then the rest; both by votes.
 */
export function discussionThreads(
  comments: Comment[],
  sort: DiscussionSort,
  {
    since,
    latest,
    updateId,
  }: {
    /** Only threads with activity at or after this time. */
    since?: string;
    /** The newest project update; "relevant" ranks activity after it first. */
    latest?: string;
    /** The update whose threads these are; none for the project's own. */
    updateId?: string;
  } = {},
) {
  const byId = new Map(comments.map((comment) => [comment.id, comment]));
  const activity = new Map<string, number>();
  for (const comment of comments) {
    const root = threadRoot(comment, byId);
    activity.set(
      root.id,
      Math.max(activity.get(root.id) || 0, Date.parse(comment.date)),
    );
  }
  const sinceTime = since ? Date.parse(since) : -Infinity;
  const cutoff = latest ? Date.parse(latest) : -Infinity;
  const recent = (comment: Comment) =>
    (activity.get(comment.id) || 0) >= cutoff ? 1 : 0;
  return comments
    .filter(
      (comment) =>
        (!comment.parentId || !byId.has(comment.parentId)) &&
        (!since || (activity.get(comment.id) || 0) >= sinceTime) &&
        home(comment) === (updateId || ""),
    )
    .sort((a, b) => {
      const delta =
        sort === "relevant"
          ? recent(b) - recent(a) || b.votes - a.votes
          : sort === "top"
            ? b.votes - a.votes
            : Date.parse(b.date) - Date.parse(a.date);
      return (
        delta ||
        Date.parse(b.date) - Date.parse(a.date) ||
        a.id.localeCompare(b.id)
      );
    });
}
