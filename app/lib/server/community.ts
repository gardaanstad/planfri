import "server-only";
import { and, desc, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { getDb } from "../db/client";
import {
  comment,
  project,
  projectView,
  rateLimit,
  suggestion,
  user,
  vote,
} from "../db/schema";
import { projectEvents, type Comment, type Project } from "../data";
import type {
  CommentList,
  CommunityData,
  LatestComment,
  ProjectActivity,
} from "../community";
import { HttpError } from "./http";
import { credit, readCredits } from "./credits";
import { serverNow } from "./clock";

const week = 7 * 24 * 60 * 60 * 1000;

/**
 * Comment counts per project, with each project's newest comments: those
 * within a week of its newest, newest first. One project's if `projectId`
 * is given.
 */
async function readActivity(projectId?: string) {
  const db = getDb();
  const weekAgo = new Date(serverNow().getTime() - week).toISOString();
  // Deleted comments keep their place in threads with their text emptied.
  const live = and(
    ne(comment.text, ""),
    projectId ? eq(comment.projectId, projectId) : undefined,
  );
  const withNewest = db
    .select({
      id: comment.id,
      projectId: comment.projectId,
      author:
        sql<string>`coalesce(${user.username}, ${comment.seedAuthor}, 'slettet_bruker')`.as(
          "author",
        ),
      text: comment.text,
      date: comment.date,
      newest:
        sql<string>`max(${comment.date}) over (partition by ${comment.projectId})`.as(
          "newest",
        ),
    })
    .from(comment)
    .leftJoin(user, eq(comment.userId, user.id))
    .where(live)
    .as("with_newest");
  const [rows, recentRows] = await Promise.all([
    db
      .select({
        projectId: comment.projectId,
        comments: sql<number>`count(*)`,
        recent: sql<number>`coalesce(sum(${comment.date} >= ${weekAgo}), 0)`,
      })
      .from(comment)
      .where(live)
      .groupBy(comment.projectId),
    db
      .select()
      .from(withNewest)
      .where(
        sql`${withNewest.date} = ${withNewest.newest} or ${withNewest.date} >= strftime('%Y-%m-%dT%H:%M:%S', ${withNewest.newest}, '-7 days')`,
      )
      .orderBy(desc(withNewest.date), withNewest.id),
  ]);
  const recent = new Map<string, LatestComment[]>();
  for (const { id, projectId, author, text, date } of recentRows) {
    const list = recent.get(projectId) ?? [];
    list.push({
      id,
      author,
      date,
      text:
        text.length > latestLength
          ? `${text.slice(0, latestLength).trimEnd()}…`
          : text,
    });
    recent.set(projectId, list);
  }
  return Object.fromEntries(
    rows.map(({ projectId, ...counts }) => {
      const list = recent.get(projectId) ?? [];
      return [
        projectId,
        {
          ...counts,
          latest: list.slice(0, latestShown),
          latestMore: Math.max(0, list.length - latestShown),
        },
      ];
    }),
  ) as Record<string, ProjectActivity>;
}
// Enough for two lines of a comment in "Nytt", and its few newest.
const latestLength = 200;
const latestShown = 3;

/**
 * Everything the explorer shows. `suggestions` counts pending suggestions:
 * the whole queue for moderators, the viewer's own for everyone else.
 * Approved suggestions credit their members on projects and updates.
 */
export async function readCommunity(
  userId?: string,
  moderator = false,
): Promise<CommunityData> {
  const db = getDb();
  const [projects, activity, saved, votes, [pending], [reviewed], credits] =
    await Promise.all([
      db.select().from(project),
      readActivity(),
      userId
        ? db
            .select({ projectId: projectView.projectId })
            .from(projectView)
            .where(
              and(eq(projectView.userId, userId), eq(projectView.saved, true)),
            )
        : [],
      userId ? db.select().from(vote).where(eq(vote.userId, userId)) : [],
      userId
        ? db
            .select({ count: sql<number>`count(*)` })
            .from(suggestion)
            .where(
              and(
                eq(suggestion.status, "pending"),
                moderator ? undefined : eq(suggestion.userId, userId),
              ),
            )
        : [{ count: 0 }],
      userId && !moderator
        ? db
            .select({ count: sql<number>`count(*)` })
            .from(suggestion)
            .where(
              and(
                eq(suggestion.userId, userId),
                isNotNull(suggestion.reviewedAt),
                isNull(suggestion.seenAt),
              ),
            )
        : [{ count: 0 }],
      readCredits(),
    ]);
  return {
    projects: projects.map((row) => credit(row.data, credits)),
    activity,
    saved: saved.map((row) => row.projectId),
    votes: Object.fromEntries(votes.map((row) => [row.commentId, row.value])),
    suggestions: pending?.count ?? 0,
    /** The member's suggestions reviewed since they last looked. */
    reviewed: reviewed?.count ?? 0,
  };
}

const author = sql<string>`coalesce(${user.username}, ${comment.seedAuthor}, 'slettet_bruker')`;

/**
 * A list of comments, oldest first. References to updates that are gone,
 * and to parents that are, read as none. A deleted comment that others
 * replied to stays in its project's list, without author or text.
 */
export async function readComments(list: CommentList): Promise<Comment[]> {
  const db = getDb();
  const parent = alias(comment, "parent");
  const at = list.indexOf(":");
  const key = list.slice(at + 1);
  const rows = await db
    .select({
      id: comment.id,
      projectId: comment.projectId,
      updateId: comment.updateId,
      parentId: parent.id,
      author,
      text: comment.text,
      date: comment.date,
      votes: sql<number>`${comment.seedVotes} + coalesce(sum(${vote.value}), 0)`,
    })
    .from(comment)
    .leftJoin(user, eq(comment.userId, user.id))
    .leftJoin(parent, eq(comment.parentId, parent.id))
    .leftJoin(vote, eq(vote.commentId, comment.id))
    .where(
      list.startsWith("project:")
        ? eq(comment.projectId, key)
        : and(sql`${author} = ${key}`, ne(comment.text, "")),
    )
    .groupBy(comment.id)
    .orderBy(comment.date, comment.id);
  const ids = [...new Set(rows.map((row) => row.projectId))];
  const projects = ids.length
    ? await db
        .select({ data: project.data })
        .from(project)
        .where(inArray(project.id, ids))
    : [];
  const updateIds = new Map(
    projects.map(({ data }) => [
      data.id,
      new Set(projectEvents(data).map((update) => update.id)),
    ]),
  );
  return rows.map((row) => ({
    ...row,
    updateId: updateIds.get(row.projectId)?.has(row.updateId)
      ? row.updateId
      : undefined,
    parentId: row.parentId ?? undefined,
    ...(!row.text && { author: "", votes: 0, deleted: true }),
  }));
}

/**
 * Atomic per-key throttling that works across server instances: at most
 * `limit` requests per `window` milliseconds.
 */
export async function throttle(
  userId: string,
  {
    key = `community:${userId}`,
    limit = 40,
    window = 60_000,
    message = "Litt mange endringer på kort tid. Vent et minutt og prøv igjen.",
  } = {},
) {
  const now = serverNow().getTime();
  const expired = sql`${rateLimit.lastRequest} < ${now - window}`;
  const [row] = await getDb()
    .insert(rateLimit)
    .values({ id: key, key, count: 1, lastRequest: now })
    .onConflictDoUpdate({
      target: rateLimit.key,
      set: {
        count: sql`case when ${expired} then 1 else ${rateLimit.count} + 1 end`,
        lastRequest: sql`case when ${expired} then ${now} else ${rateLimit.lastRequest} end`,
      },
    })
    .returning();
  if (row.count > limit) throw new HttpError(429, message);
}

export async function findProject(id: string) {
  const [row] = await getDb()
    .select({ data: project.data })
    .from(project)
    .where(eq(project.id, id));
  if (!row) throw new HttpError(404, "Prosjektet finnes ikke.");
  return row.data;
}

/** Edit and creation times always come from the server. */
export async function saveProject(data: Project, create: boolean) {
  const db = getDb();
  const now = serverNow().toISOString();
  if (create) {
    const [inserted] = await db
      .insert(project)
      .values({ id: data.id, data: { ...data, updated: now, created: now } })
      .onConflictDoNothing()
      .returning();
    if (!inserted) throw new HttpError(409, "Prosjektet finnes allerede.");
    return credit(inserted.data, await readCredits());
  }
  const existing = await findProject(data.id);
  const [updated] = await db
    .update(project)
    .set({ data: { ...data, updated: now, created: existing.created } })
    .where(eq(project.id, data.id))
    .returning({ data: project.data });
  if (!updated) throw new HttpError(404, "Prosjektet finnes ikke.");
  return credit(updated.data, await readCredits());
}

/**
 * Deletes a project with everything that hangs on it: its discussion and
 * votes, members' views and saves, and suggestions about it. Spelled out
 * rather than left to the foreign keys, which a connection may not enforce.
 */
export async function deleteProject(id: string) {
  await findProject(id);
  const db = getDb();
  const comments = db
    .select({ id: comment.id })
    .from(comment)
    .where(eq(comment.projectId, id));
  await db.batch([
    db.delete(vote).where(inArray(vote.commentId, comments)),
    db.delete(comment).where(eq(comment.projectId, id)),
    db.delete(projectView).where(eq(projectView.projectId, id)),
    db.delete(suggestion).where(eq(suggestion.projectId, id)),
    db.delete(project).where(eq(project.id, id)),
  ]);
}

export async function castVote(
  userId: string,
  commentId: string,
  value: -1 | 0 | 1,
) {
  const db = getDb();
  const [target] = await db
    .select({ id: comment.id })
    .from(comment)
    .where(eq(comment.id, commentId));
  if (!target) throw new HttpError(404, "Kommentaren finnes ikke.");
  if (value === 0)
    await db
      .delete(vote)
      .where(and(eq(vote.userId, userId), eq(vote.commentId, commentId)));
  else
    await db
      .insert(vote)
      .values({ userId, commentId, value })
      .onConflictDoUpdate({
        target: [vote.userId, vote.commentId],
        set: { value },
      });
  const [total] = await db
    .select({
      votes: sql<number>`${comment.seedVotes} + coalesce(sum(${vote.value}), 0)`,
    })
    .from(comment)
    .leftJoin(vote, eq(vote.commentId, comment.id))
    .where(eq(comment.id, commentId))
    .groupBy(comment.id);
  return total.votes;
}

/** A first view of a project, now: nothing before it is unread. */
function newView(userId: string, projectId: string, saved = false) {
  const now = serverNow();
  return { userId, projectId, saved, createdAt: now, seenAt: now };
}

/** Saving keeps the read state of a project already opened. */
export async function setSaved(
  userId: string,
  projectId: string,
  saved: boolean,
) {
  await findProject(projectId);
  await getDb()
    .insert(projectView)
    .values(newView(userId, projectId, saved))
    .onConflictDoUpdate({
      target: [projectView.userId, projectView.projectId],
      set: { saved },
    });
}

export async function addComment(
  userId: string,
  input: {
    projectId: string;
    updateId?: string;
    parentId?: string;
    text: string;
  },
) {
  const target = await findProject(input.projectId);
  if (
    input.updateId &&
    !projectEvents(target).some((update) => update.id === input.updateId)
  )
    throw new HttpError(400, "Oppdateringen finnes ikke.");
  const db = getDb();
  if (input.parentId) {
    const [parent] = await db
      .select({ projectId: comment.projectId })
      .from(comment)
      .where(eq(comment.id, input.parentId));
    if (!parent || parent.projectId !== input.projectId)
      throw new HttpError(400, "Svaret må tilhøre den samme samtalen.");
  }
  // Identity and timestamps always come from the verified session and server.
  // Commenting counts as having opened the project; an earlier view keeps
  // its read state.
  await db.batch([
    db.insert(comment).values({
      id: crypto.randomUUID(),
      projectId: input.projectId,
      // A reply lives in its thread, wherever that is.
      updateId: (!input.parentId && input.updateId) || "",
      parentId: input.parentId,
      text: input.text,
      date: serverNow().toISOString(),
      userId,
    }),
    db
      .insert(projectView)
      .values(newView(userId, input.projectId))
      .onConflictDoNothing(),
  ]);
  const [comments, activity] = await Promise.all([
    readComments(`project:${input.projectId}`),
    readActivity(input.projectId),
  ]);
  return { comments, activity: activity[input.projectId] };
}

/**
 * Deletes a member's own comment. One that others replied to stays as a
 * placeholder holding its thread together; a placeholder left without
 * replies goes too.
 */
export async function deleteComment(userId: string, commentId: string) {
  const db = getDb();
  const [target] = await db
    .select({ projectId: comment.projectId, userId: comment.userId })
    .from(comment)
    .where(eq(comment.id, commentId));
  if (!target || !target.userId)
    throw new HttpError(404, "Kommentaren finnes ikke.");
  if (target.userId !== userId)
    throw new HttpError(403, "Du kan bare slette dine egne kommentarer.");
  let id: string | null = commentId;
  let own = true;
  while (id) {
    const [reply] = await db
      .select({ id: comment.id })
      .from(comment)
      .where(eq(comment.parentId, id))
      .limit(1);
    if (reply) {
      if (own)
        await db.batch([
          db
            .update(comment)
            .set({ text: "", userId: null, seedAuthor: null, seedVotes: 0 })
            .where(eq(comment.id, id)),
          db.delete(vote).where(eq(vote.commentId, id)),
        ]);
      break;
    }
    const [row] = await db
      .select({ parentId: comment.parentId })
      .from(comment)
      .where(eq(comment.id, id));
    await db.batch([
      db.delete(vote).where(eq(vote.commentId, id)),
      db.delete(comment).where(eq(comment.id, id)),
    ]);
    // Up the thread: only a placeholder parent, now perhaps without replies.
    const parentId: string | null = row?.parentId ?? null;
    if (!parentId) break;
    const [parent] = await db
      .select({ text: comment.text })
      .from(comment)
      .where(eq(comment.id, parentId));
    id = parent && !parent.text ? parentId : null;
    own = false;
  }
  const [comments, activity] = await Promise.all([
    readComments(`project:${target.projectId}`),
    readActivity(target.projectId),
  ]);
  return {
    projectId: target.projectId,
    comments,
    activity: activity[target.projectId] ?? { comments: 0, recent: 0 },
  };
}
