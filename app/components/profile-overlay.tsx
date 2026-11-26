"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, Pencil, UserRound } from "lucide-react";
import {
  accountProfile,
  getSeedProfile,
  type Profile,
} from "../lib/profiles";
import { apiRequest } from "../lib/api-client";
import { useAuth } from "./auth-provider";
import { PanelHeader, PanelHeaderButton } from "./panel";
import ProfileAvatar from "./profile-avatar";
import { ProfileContent, ProfileEditDialog } from "./profile-page";

/** A public profile shown over the explorer, like a project. */
export default function ProfileOverlay({
  username,
  onOpenComment,
}: {
  username: string;
  onOpenComment: (projectId: string, commentId: string) => void;
}) {
  const { user } = useAuth();
  const [loaded, setLoaded] = useState<{
    username: string;
    profile: Profile | null;
  } | null>(null);
  const [editing, setEditing] = useState(false);
  const own =
    user?.username === username ? accountProfile({ ...user, username }) : null;
  const known = own || getSeedProfile(username);

  useEffect(() => {
    if (known) return;
    const controller = new AbortController();
    void apiRequest<{ profile: Profile }>(
      `/api/profiles/${encodeURIComponent(username)}`,
      { signal: controller.signal },
    )
      .then(({ profile }) => setLoaded({ username, profile }))
      .catch(() => {
        if (!controller.signal.aborted) setLoaded({ username, profile: null });
      });
    return () => controller.abort();
  }, [known, username]);

  const profile =
    known || (loaded?.username === username ? loaded.profile : undefined);

  return (
    <article
      className="flex h-full min-h-0 flex-1 flex-col"
      aria-labelledby="profile-title"
      data-profile-overlay=""
    >
      <PanelHeader
        id="profile-title"
        title={profile?.username ?? username}
        icon={
          profile && (
            <ProfileAvatar
              name={profile.username}
              tone={profile.tone}
              className="size-9 text-base"
            />
          )
        }
        actions={
          own && (
            <PanelHeaderButton
              onClick={() => setEditing(true)}
              aria-label="Rediger profil"
              data-tooltip="Rediger profil"
            >
              <Pencil size={18} aria-hidden="true" />
            </PanelHeaderButton>
          )
        }
      />
      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4.5 pt-1 pb-8 scrollbar-thin md:px-gutter-scroll"
        data-drawer-scroll
      >
        {profile ? (
          <ProfileContent
            profile={profile}
            header={false}
            onOpenComment={onOpenComment}
          />
        ) : (
          <p
            role="status"
            className="flex min-h-48 flex-col items-center justify-center gap-3 text-sm text-muted"
          >
            {profile === null ? (
              <>
                <UserRound size={24} aria-hidden="true" />
                Fant ikke @{username}
              </>
            ) : (
              <>
                <LoaderCircle
                  size={20}
                  className="animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
                Henter profilen …
              </>
            )}
          </p>
        )}
      </div>
      {editing && <ProfileEditDialog onClose={() => setEditing(false)} />}
    </article>
  );
}
