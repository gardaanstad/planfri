"use client";
import { useEffect, useSyncExternalStore } from "react";
import { parseTheme, themeColors, themeCookie, type Theme } from "../lib/theme";

const darkQuery = "(prefers-color-scheme: dark)";

const systemTheme = (): Theme =>
  window.matchMedia(darkQuery).matches ? "dark" : "light";

function currentTheme(): Theme {
  return parseTheme(document.documentElement.dataset.theme) ?? systemTheme();
}

const listeners = new Set<() => void>();

function subscribeTheme(onChange: () => void) {
  const query = window.matchMedia(darkQuery);
  listeners.add(onChange);
  query.addEventListener("change", onChange);
  return () => {
    listeners.delete(onChange);
    query.removeEventListener("change", onChange);
  };
}

/** Next renders one theme-color per scheme; a choice overrides both. */
function syncThemeColor(chosen: Theme | undefined) {
  for (const meta of document.querySelectorAll<HTMLMetaElement>(
    'meta[name="theme-color"]',
  )) {
    const scheme = meta.media.includes("dark") ? "dark" : "light";
    meta.content = themeColors[chosen ?? scheme];
  }
}

// Switched at once: a cross-fade would cover the page with a snapshot that
// takes no hover or press until it ends.
function setTheme(theme: Theme) {
  const root = document.documentElement;
  const chosen = theme === systemTheme() ? undefined : theme;
  if (chosen) root.dataset.theme = chosen;
  else delete root.dataset.theme;
  document.cookie = chosen
    ? `${themeCookie}=${chosen}; path=/; max-age=31536000; samesite=lax`
    : `${themeCookie}=; path=/; max-age=0; samesite=lax`;
  syncThemeColor(chosen);
  listeners.forEach((listener) => listener());
}

/** Switches between light and dark. */
export function toggleTheme() {
  setTheme(currentTheme() === "dark" ? "light" : "dark");
}

/** Brings theme-color in line with a theme chosen on an earlier visit. */
export function ThemeColorSync() {
  useEffect(() => {
    syncThemeColor(parseTheme(document.documentElement.dataset.theme));
  }, []);
  return null;
}

/** The page's theme; light on the server, where the system is unknown. */
export function useTheme() {
  return useSyncExternalStore<Theme>(subscribeTheme, currentTheme, () => "light");
}

