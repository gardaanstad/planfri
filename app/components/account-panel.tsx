"use client";

import { LoaderCircle, Pencil, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "./auth-provider";
import GoogleSignIn from "./google-sign-in";
import AccountSettings from "./account-settings";
import ProfileAvatar from "./profile-avatar";
import ProfileEditor from "./profile-editor";
import { ProfileContent } from "./profile-page";
import { PanelHeader, PanelHeaderButton, usePanelExpand } from "./panel";
import { currentPath } from "./username-form";
import { accountProfile } from "../lib/profiles";
import { cn } from "../lib/cn";
import { accountView } from "../lib/ui";

const scroll =
  "min-h-0 flex-1 overflow-y-auto overscroll-contain px-4.5 pt-1 pb-8 scrollbar-thin md:px-gutter-scroll";

/**
 * One's own profile, which edits in place, or the account's settings: a
 * panel like any other, its header naming the view. Render it in a titled
 * `Panel`.
 */
export default function AccountPanel({
  initialView = "profile",
  onSignedOut,
}: {
  initialView?: "profile" | "settings";
  /** Signed out in place; without it the page reloads where it is. */
  onSignedOut?: () => void;
}) {
  const { user, pending } = useAuth();
  const [view, setView] = useState<"profile" | "edit" | "settings">(
    initialView,
  );
  const editTrigger = useRef<HTMLButtonElement>(null);
  const editHeading = useRef<HTMLHeadingElement>(null);
  // Without a username there is no profile yet; one is chosen in UsernamePrompt.
  const activeView = user?.username ? view : "signin";

  // Focus follows a switch once the view it lands on is shown.
  const switched = useRef(false);
  // Phones: a form needs the drawer's full height, not the middle one.
  const expand = usePanelExpand();
  function switchView(next: typeof view) {
    switched.current = true;
    if (next !== "profile") expand?.();
    setView(next);
  }
  useEffect(() => {
    if (!switched.current) return;
    switched.current = false;
    (view === "edit" ? editHeading : editTrigger).current?.focus({
      preventScroll: true,
    });
  }, [view]);

  const shown = (name: typeof activeView) =>
    cn(
      "min-h-0 flex-1 flex-col",
      accountView,
      activeView === name ? "flex" : "hidden",
    );

  return (
    <div
      data-account-panel
      className="relative flex h-full min-h-0 flex-col"
    >
      <div className={shown("signin")}>
        <PanelHeader title="Logg inn" />
        <div data-drawer-scroll className={cn(scroll, "flex flex-col")}>
          {pending ? (
            <p
              role="status"
              className="flex flex-1 items-center justify-center gap-2 text-sm text-muted"
            >
              <LoaderCircle
                size={18}
                className="animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
              Henter profilen din …
            </p>
          ) : (
            <div className="space-y-3">
              <span
                aria-hidden="true"
                className="grid size-14 place-items-center rounded-full bg-accent-soft text-accent"
              >
                <UserRound size={24} />
              </span>
              {!user && <GoogleSignIn next={currentPath()} />}
              <p className="text-xs leading-5 text-muted">
                E-posten din vises aldri.
              </p>
            </div>
          )}
        </div>
      </div>
      {user?.username && (
        <>
          <div className={shown("profile")}>
            <PanelHeader
              title={user.username}
              icon={
                <ProfileAvatar
                  name={user.username}
                  className="size-9 text-base"
                />
              }
              actions={
                <PanelHeaderButton
                  ref={editTrigger}
                  onClick={() => switchView("edit")}
                  aria-label="Rediger profil"
                  data-tooltip="Rediger profil"
                >
                  <Pencil size={18} aria-hidden="true" />
                </PanelHeaderButton>
              }
            />
            <div data-drawer-scroll className={scroll}>
              <ProfileContent
                profile={accountProfile({ ...user, username: user.username })}
                header={false}
              />
            </div>
          </div>
          <div className={shown("edit")}>
            <PanelHeader
              title="Rediger profil"
              headingRef={editHeading}
              onBack={() => switchView("profile")}
            />
            <div data-drawer-scroll className={scroll}>
              <ProfileEditor
                key={user.id}
                user={user}
                onSaved={() => switchView("profile")}
              />
            </div>
          </div>
          <div className={shown("settings")}>
            <PanelHeader title="Kontoinnstillinger" />
            <AccountSettings
              key={user.id}
              user={user}
              variant="panel"
              onSignedOut={onSignedOut}
            />
          </div>
        </>
      )}
    </div>
  );
}
