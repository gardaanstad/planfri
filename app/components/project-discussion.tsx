"use client";
import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  ChevronDown,
  X,
  Megaphone,
  MessageCircle,
} from "lucide-react";
import { type Comment, type ProjectUpdate } from "../lib/data";
import RelativeTime from "./relative-time";
import { discussionThreads, type DiscussionSort } from "../lib/discussion";
import { useAuth } from "./auth-provider";
import { takeLoginIntent } from "../lib/login-intent";
import { useCommunity } from "./community-provider";
import { cn } from "../lib/cn";
import { errorMessage } from "../lib/api-client";
import { composer, composerField, composerSend, sortChoice } from "../lib/ui";
import UserIdentity from "./user-identity";
import ChoiceSelect from "./choice-select";
import CommentMenu from "./comment-menu";
import EmptyState from "./empty-state";
import styles from "./project-discussion.module.css";

const voteButton = cn(
  "grid size-8 place-items-center rounded-md p-0 text-muted max-sm:size-9",
  "transition-colors hover:bg-ink/[0.06] hover:not-aria-pressed:text-ink",
  "[&[aria-pressed=true]>svg]:stroke-[2.8]",
);
/** On a phone, where the replies' line is hidden, a tap on the name's line folds a thread. */
const phoneQuery = "(width < 40rem)";

/** Counts the given threads' roots and every reply beneath them. */
function countThreadComments(comments: Comment[], thread: Comment[]) {
  const included = new Set(thread.map((comment) => comment.id));
  let size;
  do {
    size = included.size;
    for (const comment of comments)
      if (comment.parentId && included.has(comment.parentId))
        included.add(comment.id);
  } while (included.size > size);
  return comments.filter(
    (comment) => !comment.deleted && included.has(comment.id),
  ).length;
}

export default function ProjectDiscussion({
  projectId,
  comments,
  updates,
  updateId,
  initialCommentId,
  onReadUpdate,
  onNotify,
}: {
  projectId: string;
  comments: Comment[];
  updates: ProjectUpdate[];
  /** A comment opened as the first unread: scrolled to and marked. */
  initialCommentId?: string;
  /**
   * Scopes the section to one update: it lists threads that reference the
   * update, and new comments written here reference it.
   */
  updateId?: string;
  onReadUpdate: (id: string) => void;
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
  const [sort, setSort] = useState<DiscussionSort>("relevant");
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
    const frame = requestAnimationFrame(() =>
      document
        .querySelector(`[data-comment-id="${CSS.escape(initialCommentId)}"]`)
        ?.scrollIntoView({ block: "center" }),
    );
    return () => cancelAnimationFrame(frame);
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
    latest: updates[0]?.date,
    updateId,
  });
  const commentCount = scoped
    ? countThreadComments(comments, thread)
    : comments.filter((comment) => !comment.deleted).length;
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
        // Replies sit in their thread; only new threads carry the reference.
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
    const reference =
      comment.updateId && comment.updateId !== updateId
        ? updates.find((update) => update.id === comment.updateId)
        : undefined;
    const replyFormId = `${idPrefix}reply-${comment.id}`;
    const replies = repliesOf.get(comment.id) ?? [];
    const folded = collapsed.has(comment.id);
    const shut = minimized.has(comment.id);
    const replyCount = replies.length ? countReplies(comment.id) : 0;
    const replyLabel = `${replyCount} svar`;
    return (
      <div
        className={cn(styles.thread, depth === 0 ? "py-2.5" : "pt-2")}
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
            <div className="flex min-h-8 items-center gap-2.5">
              <span
                aria-hidden="true"
                className="size-8 shrink-0 rounded-full border border-dashed border-border-strong"
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
                {reference && (
                  <div className="mt-0.5 mb-1 flex min-w-0">
                    <button
                      type="button"
                      // Baseline-aligned so the chip's text, not its border, lines up with the date.
                      className={cn(
                        "inline-flex max-w-full min-w-0 items-baseline gap-1 rounded-full border border-border-strong pr-1.75 pl-1.5",
                        "text-left text-xs leading-4 text-muted transition-colors duration-120 hover:border-muted hover:text-ink",
                        "[&>svg]:shrink-0 [&>svg]:self-center",
                      )}
                      data-tooltip="Viser til denne oppdateringen"
                      data-tooltip-delay="long"
                      onClick={() => onReadUpdate(reference.id)}
                    >
                      <Megaphone size={11} aria-hidden="true" />
                      <span className="truncate">{reference.title}</span>
                    </button>
                  </div>
                )}
                <div className={styles.fold} inert={shut}>
                  <div className={styles.clip}>
                    <p className="wrap-anywhere whitespace-pre-wrap text-body leading-[1.6] text-ink-soft">
                      {comment.text
                        .split(/(https?:\/\/[^\s<>]+)/g)
                        .map((part, index) =>
                          /^https?:\/\//.test(part) ? (
                            <a
                              key={index}
                              href={part}
                              target="_blank"
                              rel="noreferrer"
                              className="underline decoration-accent/40 underline-offset-3 hover:text-accent"
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
                  <div className="ml-[34px] flex items-center gap-2 text-xs text-muted max-sm:-mr-1.5 max-sm:ml-0 max-sm:justify-end max-sm:gap-1">
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
                        <ArrowUp size={15} />
                      </button>
                      <span
                        className={cn(
                          "min-w-4.5 text-center text-xs font-semibold tabular-nums",
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
                        <ArrowDown size={15} />
                      </button>
                    </div>
                    <button
                      type="button"
                      className={cn(
                        "inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted",
                        "transition-colors hover:bg-ink/[0.06] hover:text-ink max-sm:order-first max-sm:h-9",
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
                      <MessageCircle size={13} />
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
                        "mt-1.5 mb-0.5 ml-10.5 motion-safe:animate-menu-enter",
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
                          "transition-colors hover:bg-ink/[0.06] hover:text-ink",
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

  return (
    <section
      aria-label={scoped ? "Kommentarer til oppdateringen" : "Kommentarer"}
      className={cn(scoped && "pt-3.5 -mb-2.5 max-sm:pt-3")}
      data-scoped={scoped || undefined}
    >
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
      {(!scoped || thread.length > 1) && (
        <div
          className={cn(
            "mb-1 flex items-center justify-between gap-3 border-b border-border pb-2",
            scoped ? "mt-3" : user?.username ? "mt-5" : "mt-0",
          )}
        >
          <span className="text-ui whitespace-nowrap text-muted tabular-nums">
            {commentCount} {commentCount === 1 ? "kommentar" : "kommentarer"}
          </span>
          <ChoiceSelect
            label="Sorter kommentarer"
            value={sort}
            className={sortChoice}
            icon={<ArrowDownUp size={14} />}
            onChange={(value) => setSort(value as DiscussionSort)}
            options={[
              { value: "relevant", label: "Aktuelt" },
              { value: "top", label: "Topp" },
              { value: "newest", label: "Nyeste" },
            ]}
          />
        </div>
      )}
      <div>
        {thread.map((comment) => renderComment(comment))}
        {thread.length === 0 &&
          (scoped ? (
            <p className="pt-3 text-ui text-muted">Ingen kommentarer ennå</p>
          ) : (
            <EmptyState
              icon={<MessageCircle size={24} />}
              title="Ingen kommentarer ennå"
            />
          ))}
      </div>
      {/* Reading comes first; joining in is a quiet line after them. */}
      {!user?.username && (
        <p
          className={cn(
            "text-ui leading-normal text-muted max-md:text-xs",
            scoped ? "pt-3" : "pt-4",
          )}
          data-login-to-comment=""
        >
          <button
            type="button"
            className="font-medium text-ink underline decoration-ink/35 underline-offset-3 transition-[text-decoration-color] duration-150 hover:decoration-current"
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
      )}
    </section>
  );
}
