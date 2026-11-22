import { getProjectUpdates, type Project, projectAddedAt } from "./data";
import type { LatestComment, ProjectActivity } from "./community";

/**
 * What last happened on a project: an update, its newest comments (those
 * within a week of the newest, grouped), or its arrival.
 */
export type ProjectEvent =
  | {
      kind: "update";
      date: string;
      updateId: string;
      title: string;
      body: string;
    }
  | {
      kind: "comment";
      date: string;
      comments: LatestComment[];
      /** More within that week than are shown. */
      more: number;
    }
  | { kind: "added"; date: string };

export const eventTime = (event: ProjectEvent) => Date.parse(event.date) || 0;

/** The newest of a project's latest update, newest comments, and arrival. */
export function latestEvent(
  project: Project,
  activity?: ProjectActivity,
): ProjectEvent {
  const events: ProjectEvent[] = [
    { kind: "added", date: projectAddedAt(project) },
  ];
  const update = getProjectUpdates(project)[0];
  if (update)
    events.push({
      kind: "update",
      date: update.date,
      updateId: update.id,
      title: update.title,
      body: update.body,
    });
  const comments = activity?.latest ?? [];
  if (comments.length)
    events.push({
      kind: "comment",
      date: comments[0].date,
      comments,
      more: activity?.latestMore ?? 0,
    });
  return events.reduce((newest, event) =>
    eventTime(event) > eventTime(newest) ? event : newest,
  );
}
