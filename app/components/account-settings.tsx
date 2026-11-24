"use client";

import Link from "next/link";
import { useId, useRef, useState, type RefObject } from "react";
import { BottomSheet, useSheetClose } from "./action-sheet";
import { LogOut, ShieldCheck } from "lucide-react";
import { navigateWithFreshSession } from "../lib/auth-navigation";
import { authClient } from "../lib/auth-client";
import { errorMessage } from "../lib/api-client";
import {
  accountView,
  dangerButton,
  dangerOutlineButton,
  fieldControl,
  secondaryButton,
} from "../lib/ui";
import { cn } from "../lib/cn";
import { mobileQuery, useMediaQuery } from "../lib/media";
import ProfileAvatar from "./profile-avatar";
import GoogleSignIn from "./google-sign-in";
import SignOutPrompt from "./sign-out-prompt";
import { currentPath } from "./username-form";
import { storeLoginIntent } from "../lib/login-intent";

/**
 * The account behind a profile: the Google account it signs in with,
 * logging out, and, set apart at the end, deleting it. On its own page
 * (`/konto`), in the account panel under its header on desktop, or in a
 * sheet on phones, which names it itself.
 */
export default function AccountSettings({
  user,
  variant = "page",
  onSignedOut,
}: {
  user: typeof authClient.$Infer.Session.user;
  variant?: "page" | "panel" | "sheet";
  /** Signed out in place; otherwise the page reloads where it is. */
  onSignedOut?: () => void;
}) {
  const id = useId();
  const embedded = variant !== "page";
  const mobile = useMediaQuery(mobileQuery);
  const [signingOut, setSigningOut] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [reauth, setReauth] = useState(false);
  const deleteTrigger = useRef<HTMLButtonElement>(null);

  async function deleteAccount() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await authClient.deleteUser();
      if (result.error) {
        if (result.error.code === "SESSION_EXPIRED") {
          setReauth(true);
          throw new Error(
            "Bekreft Google-kontoen på nytt før du sletter kontoen.",
          );
        }
        throw new Error("Kunne ikke slette kontoen. Prøv igjen.");
      }
      navigateWithFreshSession("/");
    } catch (failure) {
      setError(errorMessage(failure, "Noe gikk galt. Prøv igjen."));
    } finally {
      setBusy(false);
    }
  }

  function cancelDelete() {
    setDeleting(false);
    setConfirmation("");
    setReauth(false);
    setError(null);
    requestAnimationFrame(() =>
      deleteTrigger.current?.focus({ preventScroll: true }),
    );
  }

  return (
    <div
      data-drawer-scroll={variant === "panel" ? "" : undefined}
      data-account-settings=""
      className={cn(
        variant === "panel" &&
          "min-h-0 flex-1 overflow-y-auto overscroll-contain px-4.5 pt-2 pb-8 scrollbar-thin md:px-gutter-scroll",
        variant === "sheet" && "px-2.5 pb-2",
      )}
    >
      {variant === "page" && (
        <header className="mb-6">
          <h1 className="text-title">Kontoinnstillinger</h1>
          <div className="mt-3 flex items-center gap-2.5">
            <ProfileAvatar name={user.username!} className="size-8 text-xs" />
            <p className="min-w-0 text-sm font-semibold wrap-anywhere">
              @{user.username}
            </p>
          </div>
        </header>
      )}

      <section aria-label="Innlogging">
        <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-subtle px-3.5 py-3">
          <ShieldCheck
            size={18}
            className="shrink-0 text-accent"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-xs text-muted">Koblet til Google</p>
            <p className="text-sm wrap-anywhere">{user.email}</p>
          </div>
        </div>
        <button
          type="button"
          className={cn(secondaryButton, "mt-3 w-full")}
          onClick={() => setSigningOut(true)}
        >
          <LogOut size={17} aria-hidden="true" />
          Logg ut
        </button>
      </section>

      <section
        aria-labelledby={`${id}-delete`}
        className="mt-8 border-t border-border pt-6"
      >
        <h2 id={`${id}-delete`} className="text-body font-semibold">
          Slett konto
        </h2>
        <p className="mt-1 text-ui leading-relaxed text-muted">
          Kontoen, profilen, kommentarene, stemmene og fulgte prosjekter slettes
          permanent. Svar fra andre beholdes.
        </p>
        {!deleting ? (
          <button
            ref={deleteTrigger}
            type="button"
            className={cn(dangerOutlineButton, "mt-3 w-full")}
            onClick={() => {
              setDeleting(true);
              setError(null);
            }}
          >
            Slett kontoen min
          </button>
        ) : (
          <div
            className={cn(
              "mt-3 rounded-xl border border-danger/20 bg-danger-soft p-4",
              accountView,
            )}
          >
            <label
              htmlFor={`${id}-confirmation`}
              className="block text-ui leading-6"
            >
              Skriv <strong className="wrap-anywhere">{user.username}</strong>{" "}
              for å bekrefte.
            </label>
            <input
              id={`${id}-confirmation`}
              aria-label="Bekreft brukernavn for sletting"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
              disabled={busy}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              className={cn(fieldControl, "mt-2")}
            />
            <div aria-live="polite" aria-atomic="true">
              {error && (
                <p role="alert" className="mt-2 text-xs leading-6 text-danger">
                  {error}
                </p>
              )}
            </div>
            {reauth &&
              (embedded ? (
                // Back from Google to these settings, where they were.
                <div
                  className="mt-3"
                  onClickCapture={() => storeLoginIntent({ type: "account" })}
                >
                  <GoogleSignIn
                    next={currentPath()}
                    reauthenticate
                    label="Bekreft med Google"
                  />
                </div>
              ) : (
                <Link
                  href="/logg-inn?next=%2Fkonto&reauth=1"
                  className={cn(secondaryButton, "mt-3 w-full")}
                >
                  Bekreft med Google
                </Link>
              ))}
            <div className="mt-3 flex gap-2 max-xs:flex-col-reverse">
              <button
                type="button"
                className={cn(secondaryButton, "flex-1 bg-surface")}
                disabled={busy}
                onClick={cancelDelete}
              >
                Avbryt
              </button>
              <button
                type="button"
                disabled={busy || confirmation !== user.username}
                className={cn(dangerButton, "flex-1")}
                onClick={() => void deleteAccount()}
              >
                {busy ? "Sletter …" : "Slett konto permanent"}
              </button>
            </div>
          </div>
        )}
      </section>

      {signingOut && (
        <SignOutPrompt
          mobile={mobile}
          onClose={() => setSigningOut(false)}
          onSignedOut={() => {
            setSigningOut(false);
            if (onSignedOut) onSignedOut();
            else navigateWithFreshSession(embedded ? currentPath() : "/");
          }}
        />
      )}
    </div>
  );
}

/** Phones: the settings in a sheet over the explorer, from the account menu. */
export function AccountSettingsSheet({
  user,
  onClose,
  onSignedOut,
}: {
  user: typeof authClient.$Infer.Session.user;
  onClose: () => void;
  onSignedOut: () => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  return (
    <BottomSheet
      label="Kontoinnstillinger"
      scroller={scroller}
      className="max-h-[calc(100dvh-22px-env(safe-area-inset-top))]"
      onClose={onClose}
    >
      <SettingsSheetBody
        user={user}
        scroller={scroller}
        onSignedOut={onSignedOut}
      />
    </BottomSheet>
  );
}

function SettingsSheetBody({
  user,
  scroller,
  onSignedOut,
}: {
  user: typeof authClient.$Infer.Session.user;
  scroller: RefObject<HTMLDivElement | null>;
  onSignedOut: () => void;
}) {
  const id = useId();
  const close = useSheetClose();
  return (
    <div
      ref={scroller}
      aria-labelledby={`${id}-title`}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      data-settings-sheet=""
    >
      <h2 id={`${id}-title`} className="px-2.5 pb-4 text-heading">
        Kontoinnstillinger
      </h2>
      <AccountSettings
        user={user}
        variant="sheet"
        onSignedOut={() => close(onSignedOut)}
      />
    </div>
  );
}
