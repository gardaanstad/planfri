"use client";

import Link from "next/link";
import { useId, type Ref } from "react";
import { CalendarDays, MapPin, Pencil } from "lucide-react";
import { cn } from "../lib/cn";
import RelativeTime from "./relative-time";
import { type Profile } from "../lib/profiles";
import { projectHref } from "../lib/data";
import { useCommunity } from "./community-provider";
import { useAuth } from "./auth-provider";
import { iconButton } from "../lib/ui";
import ProfileAvatar from "./profile-avatar";
import ProfileEditor from "./profile-editor";
import Dialog from "./dialog";

export function ProfileEditDialog({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  if (!user?.username) return null;
  return (
    <Dialog
      title="Rediger profil"
      onClose={onClose}
      className="max-h-[calc(100dvh-32px)] overflow-hidden rounded-panel border-border shadow-panel"
    >
      <div className="flex max-h-[min(520px,calc(100dvh-48px))] flex-col">
        {/* Centred on the dialog's close button. */}
        <h2 className="flex h-19 shrink-0 items-center px-6 pr-18 text-heading max-sm:h-17">
          Rediger profil
        </h2>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6 scrollbar-thin">
          <ProfileEditor user={user} onSaved={onClose} />
        </div>
      </div>
    </Dialog>
  );
}

export function ProfileContent({
  profile: initialProfile,
  header = true,
  onEdit,
  editRef,
  onOpenComment,
}: {
  profile: Profile;
  /** False when the panel's header already shows the avatar and name. */
  header?: boolean;
  onEdit?: () => void;
  editRef?: Ref<HTMLButtonElement>;
  /** Opens a comment in its project in place instead of navigating. */
  onOpenComment?: (projectId: string, commentId: string) => void;
}) {
  const id = useId();
  const { comments, projects } = useCommunity();
  const { user } = useAuth();
  const ownProfile = user?.username === initialProfile.username;
  const profile = ownProfile
    ? { ...initialProfile, bio: user.bio || "", location: user.location || "" }
    : initialProfile;
  const contributions = comments
    .filter((comment) => comment.author === profile.username)
    .sort((a, b) => b.date.localeCompare(a.date));
  const projectTitles = new Map(projects.map((item) => [item.id, item.title]));
  const joined = new Intl.DateTimeFormat("nb-NO", {
    month: "long",
    year: "numeric",
  }).format(new Date(profile.joined));
  const meta = (
    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs leading-4.5 text-muted [&>span]:inline-flex [&>span]:min-w-0 [&>span]:items-center [&>span]:gap-1 [&_svg]:shrink-0">
      {profile.location && (
        <span className="wrap-anywhere">
          <MapPin size={14} aria-hidden="true" />
          {profile.location}
        </span>
      )}
      <span>
        <CalendarDays size={14} aria-hidden="true" />
        Medlem siden {joined}
      </span>
      {profile.example && <span>Eksempelprofil</span>}
    </p>
  );

  return (
    <div data-public-profile>
      {header ? (
        <header className="flex items-center gap-3">
          <ProfileAvatar
            name={profile.username}
            tone={profile.tone}
            className="size-12 text-lg"
          />
          <div className="min-w-0 flex-1">
            <h3 className="text-heading wrap-anywhere">{profile.username}</h3>
            {meta}
          </div>
          {ownProfile && onEdit && (
            <button
              ref={editRef}
              type="button"
              onClick={onEdit}
              className={cn(iconButton, "-mr-2.5 size-10 rounded-lg")}
              aria-label="Rediger profil"
              data-tooltip="Rediger profil"
              data-press=""
            >
              <Pencil size={17} aria-hidden="true" />
            </button>
          )}
        </header>
      ) : (
        meta
      )}
      {profile.bio && (
        <p className="mt-3 text-body leading-[1.65] whitespace-pre-wrap wrap-anywhere text-ink-soft">
          {profile.bio}
        </p>
      )}

      <section className="mt-5" aria-labelledby={`${id}-contributions`}>
        <h2
          id={`${id}-contributions`}
          className="border-b border-border pb-2 text-body font-semibold"
        >
          Kommentarer
        </h2>
        {contributions.length ? (
          <ol>
            {contributions.map((comment) => {
              const title = projectTitles.get(comment.projectId);
              return (
                <li
                  key={comment.id}
                  className="border-b border-border last:border-b-0"
                >
                  <Link
                    href={projectHref(comment.projectId)}
                    data-press=""
                    data-profile-comment=""
                    onClick={(event) => {
                      if (
                        !onOpenComment ||
                        event.metaKey ||
                        event.ctrlKey ||
                        event.shiftKey
                      )
                        return;
                      event.preventDefault();
                      onOpenComment(comment.projectId, comment.id);
                    }}
                    className={cn(
                      "-mx-2.5 my-1 block rounded-lg px-2.5 py-2",
                      "transition-colors duration-150 hover:bg-ink/[0.04] motion-reduce:transition-none",
                    )}
                  >
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="min-w-0 truncate text-ui font-semibold text-ink">
                        {title || "Se prosjektet"}
                      </span>
                      <RelativeTime
                        date={comment.date}
                        className="shrink-0 text-xs text-muted"
                      />
                    </span>
                    <span className="mt-0.5 block text-sm leading-normal whitespace-pre-wrap wrap-anywhere text-ink-soft">
                      {comment.text}
                    </span>
                    {comment.parentId && (
                      <span className="mt-1 block text-xs text-muted">
                        Svar på kommentar
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="py-6 text-center text-sm text-muted">
            Ingen kommentarer ennå
          </p>
        )}
      </section>
    </div>
  );
}
