import { memo } from "react";
import { MapPin, Megaphone, MessageCircle, Plus } from "lucide-react";
import {
  getProjectUpdates,
  type Project,
  projectAddedAt,
  projectPlace,
} from "../lib/data";
import type { ProjectActivity } from "../lib/community";
import { type ProjectNews, unreadCount, unreadSummary } from "../lib/unread";
import { cn } from "../lib/cn";
import { keyboardFocused } from "../lib/ui";
import { UnreadMark } from "./project-card";
import RelativeTime from "./relative-time";

/** What last happened on a project: an update, a comment, or its arrival. */
export type ProjectEvent =
  | { kind: "update"; date: string; updateId: string; title: string }
  | {
      kind: "comment";
      date: string;
      commentId: string;
      author: string;
      text: string;
    }
  | { kind: "added"; date: string };

export type FeedEntry = { project: Project; event: ProjectEvent };

const time = (date: string) => Date.parse(date) || 0;

/** The newest of a project's latest update, newest comment, and arrival. */
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
    });
  const comment = activity?.latest;
  if (comment)
    events.push({
      kind: "comment",
      date: comment.date,
      commentId: comment.id,
      author: comment.author,
      text: comment.text,
    });
  return events.reduce((newest, event) =>
    time(event.date) > time(newest.date) ? event : newest,
  );
}

/** Projects by what last happened on them, newest first. */
export function feedEntries(
  projects: Project[],
  activity: Record<string, ProjectActivity>,
): FeedEntry[] {
  return projects
    .map((project) => ({
      project,
      event: latestEvent(project, activity[project.id]),
    }))
    .sort((a, b) => time(b.event.date) - time(a.event.date));
}

const meta = "flex min-w-0 items-center text-xs leading-4.5 text-muted";

/**
 * One project in the "Nytt" view: where, what, and what last happened on
 * it. The whole row opens the project at that update or comment.
 */
export const FeedRow = memo(function FeedRow({
  entry: { project, event },
  news,
  onOpen,
  onHover,
}: {
  entry: FeedEntry;
  news?: ProjectNews;
  onOpen: (
    id: string,
    target: { updateId?: string; commentId?: string },
  ) => void;
  onHover?: (id: string, hovering: boolean) => void;
}) {
  const fresh = news && unreadCount(news) > 0 ? news : undefined;
  const open = () =>
    onOpen(
      project.id,
      event.kind === "update"
        ? { updateId: event.updateId }
        : event.kind === "comment"
          ? { commentId: event.commentId }
          : {},
    );
  const Icon =
    event.kind === "update"
      ? Megaphone
      : event.kind === "comment"
        ? MessageCircle
        : Plus;
  return (
    <li
      className={cn(
        "relative isolate border-b border-border py-4 max-md:py-3.5",
        "before:absolute before:inset-x-[-12px] before:inset-y-2 before:-z-1 before:rounded-xl max-md:before:inset-x-[-8px] max-md:before:inset-y-1.5",
        "hover:before:bg-surface-muted/65",
      )}
      data-feed-id={project.id}
      data-event={event.kind}
      data-unread={fresh ? true : undefined}
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") onHover?.(project.id, true);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") onHover?.(project.id, false);
      }}
      onFocus={(e) => {
        if (keyboardFocused(e.target)) onHover?.(project.id, true);
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget))
          onHover?.(project.id, false);
      }}
    >
      <p className={cn(meta, "gap-1")}>
        <MapPin size={13} className="shrink-0" aria-hidden="true" />
        <span className="min-w-0 truncate">{projectPlace(project)}</span>
        <span className="ml-auto flex shrink-0 items-center gap-2 pl-2">
          {fresh && <UnreadMark news={fresh} />}
          <RelativeTime date={event.date} className="whitespace-nowrap" />
        </span>
      </p>
      <h2 className="mt-1 truncate text-item leading-5.5 text-ink">
        <button
          type="button"
          className={cn(
            "text-left outline-none",
            "after:absolute after:inset-x-[-12px] after:inset-y-2 after:rounded-xl max-md:after:inset-x-[-8px] max-md:after:inset-y-1.5",
            "focus-visible:after:outline-2 focus-visible:after:outline-focus",
          )}
          aria-label={`${project.title} · ${project.city}${fresh ? ` · ${unreadSummary(fresh)}` : ""}`}
          data-press=""
          onClick={open}
        >
          {project.title}
        </button>
      </h2>
      <p className="mt-1.5 flex gap-2 text-sm leading-5 text-ink-soft">
        <Icon
          size={14}
          className="mt-0.75 shrink-0 text-muted"
          aria-hidden="true"
        />
        <span className="line-clamp-2 min-w-0 wrap-anywhere">
          {event.kind === "update" ? (
            event.title
          ) : event.kind === "comment" ? (
            <>
              <span className="font-medium text-ink">{event.author}</span>{" "}
              {event.text}
            </>
          ) : (
            <span className="text-muted">Lagt til</span>
          )}
        </span>
      </p>
    </li>
  );
});
