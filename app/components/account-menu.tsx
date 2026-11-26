"use client";
import { useRef, useState, type ReactNode } from "react";
import { Menu } from "@base-ui/react/menu";
import {
  Bookmark,
  ChevronRight,
  Inbox,
  LogOut,
  Moon,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "./auth-provider";
import { toggleTheme, useTheme } from "./theme-toggle";
import ActionSheet, { SwitchTrack, type SheetAction } from "./action-sheet";
import ProfileAvatar from "./profile-avatar";
import { cn } from "../lib/cn";
import { DropdownPopup } from "./dropdown";
import {
  countBadge,
  menuItem as item,
  menuItemDangerHover,
  menuSeparator as separator,
} from "../lib/ui";


function Count({ count }: { count: number }) {
  return count > 0 ? (
    <span className={countBadge}>{count > 99 ? "99+" : count}</span>
  ) : null;
}

/**
 * The signed-in member's menu from their avatar: their profile, with
 * settings beside it, what they saved and their suggestions, dark mode, then
 * logging out. Moderators switch moderator mode off to view the app as a
 * member, and, with it on, reach the suggestion queue just below it. A
 * dropdown on desktop, a sheet on phones.
 */
export default function AccountMenu({
  username,
  mobile,
  trigger,
  triggerLabel,
  triggerTooltip,
  triggerClassName,
  onProfile,
  onSaved,
  onSettings,
  onMemberView,
  suggestions,
  reviewed,
  onSuggestions,
  onSignOut,
}: {
  username: string;
  mobile: boolean;
  trigger: ReactNode;
  triggerLabel: string;
  triggerTooltip?: string;
  triggerClassName: string;
  onProfile: () => void;
  onSaved: () => void;
  onSettings: () => void;
  onMemberView: (on: boolean) => void;
  /** Suggestions waiting for a moderator. */
  suggestions: number;
  /** A member's suggestions reviewed since they last looked. */
  reviewed: number;
  onSuggestions: () => void;
  onSignOut: () => void;
}) {
  const { isModerator, memberView, canModerate } = useAuth();
  const dark = useTheme() === "dark";
  // Moderators get the queue; members their own suggestions.
  const suggestionsName = canModerate ? "Forslag" : "Mine forslag";
  const suggestionsCount = canModerate ? suggestions : reviewed;
  const suggestionsLabel = `${suggestionsName}${suggestionsCount > 0 ? ` (${suggestionsCount})` : ""}`;
  const [sheetOpen, setSheetOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  // A panel opened from the menu returns focus to the avatar, not to the
  // item that is gone once the menu closes.
  function run(action: () => void) {
    button.current?.focus({ preventScroll: true });
    action();
  }
  if (mobile) {
    const actions: SheetAction[] = [
      {
        id: "profile",
        label: "Din profil",
        icon: <ProfileAvatar name={username} className="size-6 text-2xs" />,
        opens: true,
        onSelect: onProfile,
        aside: {
          id: "settings",
          label: "Kontoinnstillinger",
          icon: <Settings size={20} />,
          onSelect: onSettings,
        },
      },
      {
        id: "saved",
        label: "Lagret",
        icon: <Bookmark size={20} />,
        onSelect: onSaved,
        divided: true,
      },
      ...(!canModerate
        ? [
            {
              id: "suggestions",
              label: suggestionsName,
              icon: <Inbox size={20} />,
              trailing: <Count count={reviewed} />,
              onSelect: onSuggestions,
            },
          ]
        : []),
      ...(isModerator
        ? [
            {
              id: "moderator-mode",
              label: "Moderatormodus",
              icon: <ShieldCheck size={20} />,
              checked: !memberView,
              onSelect: () => onMemberView(!memberView),
              divided: true,
            },
          ]
        : []),
      ...(canModerate
        ? [
            {
              id: "suggestions",
              label: "Forslag",
              icon: <Inbox size={20} />,
              trailing: <Count count={suggestions} />,
              onSelect: onSuggestions,
            },
          ]
        : []),
      {
        id: "theme",
        label: "Mørk modus",
        icon: <Moon size={20} />,
        checked: dark,
        onSelect: toggleTheme,
        divided: true,
      },
      {
        id: "sign-out",
        label: "Logg ut",
        icon: <LogOut size={20} />,
        dangerPress: true,
        onSelect: onSignOut,
        divided: true,
      },
    ];
    return (
      <>
        <button
          ref={button}
          type="button"
          className={triggerClassName}
          aria-label={triggerLabel}
          aria-haspopup="dialog"
          aria-expanded={sheetOpen}
          data-account-menu=""
          data-press=""
          onClick={() => setSheetOpen(true)}
        >
          {trigger}
        </button>
        {sheetOpen && (
          <ActionSheet
            label="Konto"
            actions={actions}
            onClose={() => setSheetOpen(false)}
          />
        )}
      </>
    );
  }

  return (
    <Menu.Root>
      <Menu.Trigger
        ref={button}
        className={triggerClassName}
        aria-label={triggerLabel}
        data-tooltip={triggerTooltip}
        // Base UI opens it on press already; no data-press here.
        data-account-menu=""
      >
        {trigger}
      </Menu.Trigger>
      <DropdownPopup aria-label="Konto" className="min-w-60">
        <div className="flex gap-1">
          <Menu.Item
            // Reaches across the gap to settings, so none is dead.
            className={cn(
              item,
              "relative min-w-0 flex-1 before:absolute before:inset-y-0 before:left-0 before:-right-1",
            )}
            onClick={() => run(onProfile)}
          >
            <ProfileAvatar
              name={username}
              className="-mx-0.5 size-5 text-2xs"
            />
            Din profil
            <ChevronRight
              size={14}
              className="-ml-1 shrink-0 text-muted"
              aria-hidden="true"
            />
          </Menu.Item>
          <Menu.Item
            className={cn(item, "w-9 justify-center px-0 py-0 pointer-coarse:w-11")}
            aria-label="Kontoinnstillinger"
            data-tooltip="Kontoinnstillinger"
            onClick={() => run(onSettings)}
          >
            <Settings size={16} aria-hidden="true" />
          </Menu.Item>
        </div>
        <Menu.Separator className={separator} />
        <Menu.Item className={item} onClick={() => run(onSaved)}>
          <Bookmark size={16} aria-hidden="true" />
          Lagret
        </Menu.Item>
        {!canModerate && (
          <Menu.Item
            className={item}
            aria-label={suggestionsLabel}
            onClick={() => run(onSuggestions)}
          >
            <Inbox size={16} aria-hidden="true" />
            <span className="flex-1">{suggestionsName}</span>
            <Count count={reviewed} />
          </Menu.Item>
        )}
        {isModerator && (
          <>
            <Menu.Separator className={separator} />
            <Menu.CheckboxItem
              className={item}
              checked={!memberView}
              onCheckedChange={(on) => onMemberView(!on)}
              closeOnClick
            >
              <ShieldCheck size={16} aria-hidden="true" />
              <span className="mr-3 flex-1">Moderatormodus</span>
              <SwitchTrack on={!memberView} />
            </Menu.CheckboxItem>
          </>
        )}
        {canModerate && (
          <Menu.Item
            className={item}
            aria-label={suggestionsLabel}
            onClick={() => run(onSuggestions)}
          >
            <Inbox size={16} aria-hidden="true" />
            <span className="flex-1">Forslag</span>
            <Count count={suggestions} />
          </Menu.Item>
        )}
        <Menu.Separator className={separator} />
        <Menu.CheckboxItem
          className={item}
          checked={dark}
          onCheckedChange={toggleTheme}
          closeOnClick
        >
          <Moon size={16} aria-hidden="true" />
          <span className="mr-3 flex-1">Mørk modus</span>
          <SwitchTrack on={dark} />
        </Menu.CheckboxItem>
        <Menu.Separator className={separator} />
        <Menu.Item
          className={cn(item, menuItemDangerHover)}
          onClick={() => run(onSignOut)}
        >
          <LogOut size={16} aria-hidden="true" />
          Logg ut
        </Menu.Item>
      </DropdownPopup>
    </Menu.Root>
  );
}
