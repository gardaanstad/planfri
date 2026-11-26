"use client";
import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  ChevronDown,
  X,
  MessageCircle,
} from "lucide-react";
import { type Comment, isPost, type ProjectUpdate } from "../lib/data";
import RelativeTime from "./relative-time";
import {
  commentCounts,
  discussionThreads,
  type DiscussionSort,
} from "../lib/discussion";
import { useAuth } from "./auth-provider";
import { takeLoginIntent } from "../lib/login-intent";
import { useCommunity } from "./community-provider";
import { cn } from "../lib/cn";
import { errorMessage } from "../lib/api-client";
import {
  composer,
  composerField,
  composerSend,
  sortChoice,
  textLink,
} from "../lib/ui";
import UserIdentity from "./user-identity";
import ChoiceSelect from "./choice-select";
import CommentMenu from "./comment-menu";
import EmptyState from "./empty-state";
import styles from "./project-discussion.module.css";

const voteButton = cn(
  "grid size-8 place-items-center rounded-md p-0 text-muted max-sm:size-9",
  "transition-colors hover:bg-ink/[0.05] hover:not-aria-pressed:text-ink",
  "[&[aria-pressed=true]>svg]:stroke-[2.8]",
);
/** On a phone, where the replies' line is hidden, a tap on the name's line folds a thread. */
const phoneQuery = "(width < 40rem)";

const sortOptions = [
  { value: "relevant", label: "Aktuelt" },
  { value: "top", label: "Topp" },
  { value: "newest", label: "Nyeste" },
];

/** How a discussion's threads are ordered. */
export function DiscussionSortSelect({
  value,
  onChange,
}: {
  value: DiscussionSort;
  onChange: (sort: DiscussionSort) => void;
}) {
  return (
    <ChoiceSelect
      label="Sorter kommentarer"
      value={value}
      className={sortChoice}
      icon={<ArrowDownUp size={14} />}
      onChange={(next) => onChange(next as DiscussionSort)}
      options={sortOptions}
    />
  );
}

export default function ProjectDiscussion({
  projectId,
  comments,
  updates,
  updateId,
  initialCommentId,
  notice,
  sort: sortProp,
  onSortChange,
  onNotify,
}: {
  projectId: string;
  comments: Comment[];
  /** The project's events, newest first; each has comments of its own. */
  updates: ProjectUpdate[];
  /** A comment opened as the first unread: scrolled to and marked. */
  initialCommentId?: string;
  /**
   * The update whose comments these are: it lists the threads started under
   * it, and starts new ones there. Without it, the project's own discussion.
   */
  updateId?: string;
  /** A line above the project's own discussion, pointing to comments elsewhere. */
  notice?: React.ReactNode;
  /** Set when the order is chosen elsewhere, beside the section's tabs. */
  sort?: DiscussionSort;
  onSortChange?: (sort: DiscussionSort) => void;
  onNotify: (message: string) => void;
}) {
  const { user, requireLogin } = useAuth();
  const { votes, mutate } = useCommunity();
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  // Whose reply the draft is: a reply closed by a click elsewhere keeps it.
  const replyDraftFor = useRef<string | null>(null);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const replyButtons = useRef(new Map<string, HTMLButtonElement>());
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const idPrefix = useId();
  const [ownSort, setOwnSort] = useState<DiscussionSort>("relevant");
  const sort = sortProp ?? ownSort;
  const setSort = onSortChange ?? setOwnSort;
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  // Threads collapsed to their author's line by a tap, on a phone.
  const [minimized, setMinimized] = useState<ReadonlySet<string>>(new Set());
  // A comment opened from elsewhere isn't left folded away in its thread.
  const [shownCommentId, setShownCommentId] = useState(initialCommentId);
  if (initialCommentId !== shownCommentId) {
    setShownCommentId(initialCommentId);
    const parents = new Map(comments.map((item) => [item.id, item.parentId]));
    const ancestors: string[] = [];
    for (
      let parent = initialCommentId && parents.get(initialCommentId);
      parent;
      parent = parents.get(parent)
    )
      ancestors.push(parent);
    const without = (set: ReadonlySet<string>, ids: string[]) =>
      ids.some((id) => set.has(id))
        ? new Set([...set].filter((id) => !ids.includes(id)))
        : set;
    setCollapsed(without(collapsed, ancestors));
    if (initialCommentId)
      setMinimized(without(minimized, [initialCommentId, ...ancestors]));
  }
  useEffect(() => {
    if (!initialCommentId) return;
    const target = () =>
      document.querySelector(
        `[data-comment-id="${CSS.escape(initialCommentId)}"]`,
      );
    const scroll = () => target()?.scrollIntoView({ block: "center" });
    const frame = requestAnimationFrame(scroll);
    // Under an update, its comments may still be unfolding: again once open.
    const section = target()?.closest("[data-update-comments]");
    const settled = (event: Event) => {
      if (event.target === section) scroll();
    };
    section?.addEventListener("transitionend", settled);
    return () => {
      cancelAnimationFrame(frame);
      section?.removeEventListener("transitionend", settled);
    };
  }, [initialCommentId]);
  const repliesOf = new Map<string, Comment[]>();
  for (const comment of comments) {
    if (!comment.parentId) continue;
    const siblings = repliesOf.get(comment.parentId);
    if (siblings) siblings.push(comment);
    else repliesOf.set(comment.parentId, [comment]);
  }
  function countReplies(id: string): number {
    return (repliesOf.get(id) ?? []).reduce(
      (total, reply) =>
        total + (reply.deleted ? 0 : 1) + countReplies(reply.id),
      0,
    );
  }
  function toggleReplies(id: string) {
    const folding = !collapsed.has(id);
    setCollapsed((current) => {
      const next = new Set(current);
      if (folding) next.add(id);
      else next.delete(id);
      return next;
    });
    // Folding a long thread from far down would leave the reader below it.
    if (folding)
      requestAnimationFrame(() =>
        document
          .querySelector(`[data-comment-id="${CSS.escape(id)}"]`)
          ?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
      );
  }
  // A click anywhere but the open reply form, or the button that opened it, closes it.
  useEffect(() => {
    if (!replyTo) return;
    const form = document.getElementById(`${idPrefix}reply-${replyTo}`);
    const opener = replyButtons.current.get(replyTo);
    function close(event: globalThis.MouseEvent) {
      const target = event.target as Node;
      if (form?.contains(target) || opener?.contains(target)) return;
      setReplyTo(null);
    }
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [replyTo, idPrefix]);
  function toggleMinimized(event: React.MouseEvent, id: string) {
    if (!window.matchMedia(phoneQuery).matches) return;
    // The name keeps its own tap, as does a selection.
    if (
      (event.target as Element).closest("a, button") ||
      !window.getSelection()?.isCollapsed
    )
      return;
    const minimizing = !minimized.has(id);
    setMinimized((current) => {
      const next = new Set(current);
      if (minimizing) next.add(id);
      else next.delete(id);
      return next;
    });
    if (minimizing && replyTo === id) setReplyTo(null);
    if (minimizing)
      requestAnimationFrame(() =>
        document
          .querySelector(`[data-comment-id="${CSS.escape(id)}"]`)
          ?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
      );
  }
  const scoped = !!updateId;
  // Back from logging in to comment: the composer is ready.
  const member = Boolean(user?.username);
  useEffect(() => {
    if (!member || scoped || !takeLoginIntent("comment", projectId)) return;
    // Not cancelled: the intent is already taken.
    requestAnimationFrame(() => {
      composerRef.current?.scrollIntoView({ block: "center" });
      composerRef.current?.focus({ preventScroll: true });
    });
  }, [member, scoped, projectId]);
  const thread = discussionThreads(comments, sort, {
    latest: updates.find(isPost)?.date,
    updateId,
  });
  function resizeComposer(element: HTMLTextAreaElement) {
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 260)}px`;
  }
  async function addComment(parentId?: string) {
    if (
      sendingRef.current ||
      !requireLogin("Du må være logget inn for å kommentere.", {
        type: "comment",
        projectId,
      })
    )
      return;
    const text = (parentId ? replyText : draft).trim();
    if (!text) return;
    sendingRef.current = true;
    setSending(true);
    try {
      await mutate({
        action: "comment",
        projectId,
        // Replies sit in their thread; a new one starts under the update.
        updateId: parentId ? undefined : updateId,
        text,
        parentId,
      });
      if (parentId) {
        setCollapsed((current) => {
          const next = new Set(current);
          next.delete(parentId);
          return next;
        });
        setReplyText("");
        setReplyTo(null);
      } else {
        setDraft("");
        if (composerRef.current) composerRef.current.style.height = "";
      }
      setSort("newest");
      onNotify(
        parentId ? "Svaret ditt er lagt til" : "Kommentaren din er lagt til",
      );
    } catch (error) {
      onNotify(errorMessage(error, "Kunne ikke sende kommentaren."));
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }
  async function castVote(commentId: string, value: -1 | 0 | 1) {
    if (!requireLogin("Du må være logget inn for å stemme på kommentarer."))
      return;
    try {
      await mutate({ action: "vote", commentId, value });
    } catch (error) {
      onNotify(errorMessage(error, "Kunne ikke lagre stemmen."));
    }
  }
  async function removeComment(commentId: string) {
    try {
      await mutate({ action: "delete-comment", commentId });
      if (replyTo === commentId) setReplyTo(null);
      onNotify("Kommentaren er slettet");
    } catch (error) {
      onNotify(errorMessage(error, "Kunne ikke slette kommentaren."));
    }
  }
  function renderComment(comment: Comment, depth = 0): React.ReactNode {
    const vote = votes[comment.id] || 0;
    const replyFormId = `${idPrefix}reply-${comment.id}`;
    const replies = repliesOf.get(comment.id) ?? [];
    const folded = collapsed.has(comment.id);
    const shut = minimized.has(comment.id);
    const replyCount = replies.length ? countReplies(comment.id) : 0;
    const replyLabel = `${replyCount} svar`;
    return (
      <div
        className={cn(styles.thread, depth === 0 ? "py-2" : "pt-2.5")}
        key={comment.id}
        data-comment-id={comment.id}
      >
        <div
          className={cn(
            styles.self,
            "relative min-w-0",
            comment.id === initialCommentId &&
              "rounded-sm animate-highlight motion-reduce:animate-none",
          )}
          data-highlighted={comment.id === initialCommentId || undefined}
          data-minimized={shut || undefined}
        >
          {comment.deleted ? (
            <div className="flex min-h-7 items-center gap-2 max-sm:min-h-6 max-sm:gap-1.5">
              <span
                aria-hidden="true"
                className="size-7 shrink-0 rounded-full border border-dashed border-border-strong max-sm:size-6"
              />
              <p className="text-ui text-muted italic">Slettet kommentar</p>
            </div>
          ) : (
            <>
              <UserIdentity
                username={comment.author}
                onRowClick={(event) => toggleMinimized(event, comment.id)}
                meta={
                  <>
                    <RelativeTime
                      date={comment.date}
                      className="shrink-0 text-xs whitespace-nowrap text-muted select-none"
                    />
                    <ChevronDown
                      size={16}
                      aria-hidden="true"
                      className={cn(
                        "ml-auto shrink-0 self-center text-muted transition-opacity duration-200 motion-reduce:transition-none",
                        !shut && "opacity-0",
                      )}
                    />
                  </>
                }
              >
                <div className={styles.fold} inert={shut}>
                  <div className={styles.clip}>
                    <p className="wrap-anywhere whitespace-pre-wrap text-body leading-normal text-ink-soft max-sm:mt-1">
                      {comment.text
                        .split(/(https?:\/\/[^\s<>]+)/g)
                        .map((part, index) =>
                          /^https?:\/\//.test(part) ? (
                            <a
                              key={index}
                              href={part}
                              target="_blank"
                              rel="noreferrer"
                              className={textLink}
                            >
                              {part}
                            </a>
                          ) : (
                            part
                          ),
                        )}
                    </p>
                  </div>
                </div>
              </UserIdentity>
              <div className={styles.fold} inert={shut}>
                <div className={styles.clip}>
                  <div className="mt-0.5 ml-7 flex items-center gap-1 text-xs text-muted max-sm:-mr-1.5 max-sm:ml-0 max-sm:justify-end">
                    <div
                      className="flex items-center gap-0 text-muted"
                      role="group"
                      aria-label={`Stem på kommentaren fra ${comment.author}`}
                      data-vote={vote}
                    >
                      <button
                        type="button"
                        className={cn(voteButton, "aria-pressed:text-accent")}
                        aria-label={`Stem opp kommentaren fra ${comment.author}`}
                        aria-pressed={vote === 1}
                        onClick={() =>
                          void castVote(comment.id, vote === 1 ? 0 : 1)
                        }
                      >
                        <ArrowUp size={16} />
                      </button>
                      <span
                        className={cn(
                          "min-w-4.5 text-center text-xs font-medium tabular-nums",
                          vote === 1 && "text-accent",
                          vote === -1 && "text-danger",
                        )}
                        aria-live="polite"
                        aria-atomic="true"
                      >
                        {comment.votes}
                      </span>
                      <button
                        type="button"
                        className={cn(voteButton, "aria-pressed:text-danger")}
                        aria-label={`Stem ned kommentaren fra ${comment.author}`}
                        aria-pressed={vote === -1}
                        onClick={() =>
                          void castVote(comment.id, vote === -1 ? 0 : -1)
                        }
                      >
                        <ArrowDown size={16} />
                      </button>
                    </div>
                    <button
                      type="button"
                      className={cn(
                        "inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted",
                        "transition-colors hover:bg-ink/[0.05] hover:text-ink max-sm:order-first max-sm:h-9",
                      )}
                      ref={(element) => {
                        if (element)
                          replyButtons.current.set(comment.id, element);
                        else replyButtons.current.delete(comment.id);
                      }}
                      aria-expanded={replyTo === comment.id}
                      aria-controls={replyFormId}
                      onClick={() => {
                        if (
                          !requireLogin("Du må være logget inn for å svare.", {
                            type: "comment",
                            projectId,
                          })
                        )
                          return;
                        setReplyTo(replyTo === comment.id ? null : comment.id);
                        if (replyDraftFor.current !== comment.id)
                          setReplyText("");
                        replyDraftFor.current = comment.id;
                      }}
                    >
                      <MessageCircle size={14} />
                      Svar
                    </button>
                    {user?.username === comment.author && (
                      <CommentMenu
                        hasReplies={replies.length > 0}
                        onDelete={() => removeComment(comment.id)}
                      />
                    )}
                  </div>
                  {replyTo === comment.id && (
                    <form
                      id={replyFormId}
                      className={cn(
                        composer,
                        "mt-1 mb-0.5 ml-9 motion-safe:animate-menu-enter max-sm:ml-0",
                      )}
                      onSubmit={(e) => {
                        e.preventDefault();
                        addComment(comment.id);
                      }}
                    >
                      <textarea
                        aria-label={`Svar til ${comment.author}`}
                        placeholder={`Svar til ${comment.author}`}
                        value={replyText}
                        rows={1}
                        onChange={(e) => {
                          setReplyText(e.target.value);
                          resizeComposer(e.target);
                        }}
                        onKeyDown={(e) => {
                          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                            e.preventDefault();
                            addComment(comment.id);
                          }
                          if (e.key === "Escape") {
                            e.preventDefault();
                            e.stopPropagation();
                            setReplyTo(null);
                            replyButtons.current.get(comment.id)?.focus();
                          }
                        }}
                        required
                        maxLength={2000}
                        autoFocus
                        className={cn(
                          composerField,
                          "block max-h-65 resize-none max-md:placeholder:text-ui",
                          "max-md:placeholder-shown:pt-2 max-md:placeholder-shown:pb-0.5",
                        )}
                      />
                      {replyText.length > 1800 && (
                        <span className="self-center text-xs leading-normal text-muted tabular-nums">
                          {replyText.length}/2000
                        </span>
                      )}
                      <button
                        type="button"
                        className={cn(
                          "grid size-8 shrink-0 place-items-center rounded-full text-muted",
                          "transition-colors hover:bg-ink/[0.05] hover:text-ink",
                        )}
                        aria-label="Avbryt"
                        onClick={() => {
                          setReplyTo(null);
                          setReplyText("");
                          replyButtons.current.get(comment.id)?.focus();
                        }}
                      >
                        <X size={16} />
                      </button>
                      <button
                        type="submit"
                        className={composerSend}
                        disabled={sending || !replyText.trim()}
                        aria-label="Send svar"
                      >
                        <ArrowUp size={16} strokeWidth={2.25} />
                      </button>
                    </form>
                  )}
                </div>
              </div>
            </>
          )}
          {replies.length > 0 && (
            <button
              type="button"
              className={styles.rail}
              aria-expanded={!folded}
              aria-label={`Skjul ${replyLabel}`}
              aria-hidden={folded || undefined}
              tabIndex={folded ? -1 : undefined}
              onClick={() => toggleReplies(comment.id)}
            />
          )}
        </div>
        {replies.length > 0 && (
          <div className={cn(styles.replies, styles.fold)} inert={shut}>
            <div className={styles.clip}>
              {folded ? (
                <div className={styles.branch} data-folded>
                  <span
                    className={styles.elbow}
                    aria-hidden="true"
                    onClick={() => toggleReplies(comment.id)}
                  />
                  <button
                    type="button"
                    className={cn(
                      "inline-flex h-8 items-center gap-1 rounded-full border border-border-strong px-3 text-xs font-medium text-muted",
                      "transition-colors hover:border-muted hover:text-ink",
                    )}
                    aria-expanded={false}
                    onClick={() => toggleReplies(comment.id)}
                  >
                    <ChevronDown size={14} aria-hidden="true" />
                    {replyLabel}
                  </button>
                </div>
              ) : (
                replies.map((reply, index) => (
                  <div className={styles.branch} key={reply.id}>
                    {index < replies.length - 1 && (
                      <span
                        className={styles.through}
                        aria-hidden="true"
                        onClick={() => toggleReplies(comment.id)}
                      />
                    )}
                    <span
                      className={styles.elbow}
                      aria-hidden="true"
                      onClick={() => toggleReplies(comment.id)}
                    />
                    {renderComment(reply, depth + 1)}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  const loginLine = !user?.username && (
    <p
      className={cn(
        "text-center text-ui leading-normal text-muted max-md:text-xs",
        // As far above the first comment as below the tabs (pt-4.5, md:pt-5),
        // less the thread's own 8px; under an update, as far as below its
        // actions.
        thread.length > 0 &&
          (scoped ? "pb-1.5 max-sm:pb-1" : "pb-2.5 md:pb-3"),
      )}
      data-login-to-comment=""
    >
      <button
        type="button"
        className={cn(textLink, "font-medium text-ink")}
        onClick={() =>
          requireLogin("Du må være logget inn for å kommentere.", {
            type: "comment",
            projectId,
          })
        }
      >
        {user ? "Velg brukernavn" : "Logg inn"}
      </button>{" "}
      for å kommentere.
    </p>
  );

  return (
    <section
      aria-label={scoped ? "Kommentarer til oppdateringen" : "Kommentarer"}
      className={cn(scoped && "pt-3.5 max-sm:pt-3")}
      data-scoped={scoped || undefined}
    >
      {!scoped && notice}
      {user?.username && (
        <form
          className={composer}
          onSubmit={(event) => {
            event.preventDefault();
            void addComment();
          }}
        >
          <textarea
            ref={composerRef}
            aria-label={
              scoped ? "Kommenter oppdateringen" : "Kommenter prosjektet"
            }
            placeholder="Skriv en kommentar"
            className={cn(
              composerField,
              "block max-h-65 resize-none max-md:placeholder:text-ui",
              // The smaller placeholder sits at the top of the line; down to
              // its middle, the box keeping its height.
              "max-md:placeholder-shown:pt-2 max-md:placeholder-shown:pb-0.5",
            )}
            value={draft}
            required
            maxLength={2000}
            rows={1}
            onChange={(event) => {
              setDraft(event.target.value);
              resizeComposer(event.target);
            }}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                void addComment();
              }
            }}
          />
          {draft.length > 1800 && (
            <span className="self-center text-xs leading-normal text-muted tabular-nums">
              {draft.length}/2000
            </span>
          )}
          <button
            type="submit"
            className={composerSend}
            disabled={sending || !draft.trim()}
            aria-label="Send kommentar"
          >
            <ArrowUp size={16} strokeWidth={2.25} />
          </button>
        </form>
      )}
      {/* An update's comments are headed by their count and order, as the
          project's are by the tabs' line. */}
      {scoped && thread.length > 1 && (
        <div className="mt-3 -mb-1 flex items-center justify-between gap-3">
          <p className="text-ui text-muted tabular-nums">
            {commentCounts(comments).get(updateId) ?? 0} kommentarer
          </p>
          <DiscussionSortSelect value={sort} onChange={setSort} />
        </div>
      )}
      {/* Reading comes first; joining in is a quiet line among them. */}
      {thread.length > 0 && loginLine}
      <div className={cn(user?.username && "mt-3")}>
        {thread.map((comment) => renderComment(comment))}
        {thread.length === 0 &&
          (scoped ? (
            // The empty state, small enough to sit under an update.
            <div className="flex flex-col gap-1 pt-1 pb-2.5 text-center">
              <p className="text-ui font-medium text-ink">
                Ingen kommentarer ennå
              </p>
              {loginLine}
            </div>
          ) : notice ? (
            // Nothing here yet, but the notice says where the talk is.
            loginLine
          ) : (
            <EmptyState
              icon={<MessageCircle size={24} />}
              title="Ingen kommentarer ennå"
              description={loginLine}
            />
          ))}
      </div>
    </section>
  );
}
