const reservedUsernames = new Set([
  "admin",
  "administrator",
  "moderator",
  "support",
  "google",
  "planfri",
  "system",
  "api",
  "konto",
  "profil",
  "gjest",
  "nabolagsvenn",
  "byvandrer",
  "arkitekturinteressert",
  "oslo_på_sykkel",
]);
export const usernameRules = {
  min: 3,
  max: 24,
  pattern: /^[a-z0-9æøå][a-z0-9æøå_]*$/,
  reserved: (value: string) => reservedUsernames.has(value),
};
export const usernameMessages = {
  short: "Bruk minst 3 tegn.",
  long: "Bruk maks 24 tegn.",
  pattern:
    "Bruk bokstaver, tall og understrek. Start med en bokstav eller et tall.",
  reserved: "Dette brukernavnet er reservert.",
};
/**
 * The username rules without zod, for the browser: the normalized name, or
 * the first rule it breaks. The server's `usernameSchema`
 * (`account-schemas.ts`) checks the same rules in the same order.
 */
export function checkUsername(
  value: string,
): { success: true; data: string } | { success: false; message: string } {
  const name = value.trim().toLowerCase();
  const message =
    name.length < usernameRules.min
      ? usernameMessages.short
      : name.length > usernameRules.max
        ? usernameMessages.long
        : !usernameRules.pattern.test(name)
          ? usernameMessages.pattern
          : usernameRules.reserved(name)
            ? usernameMessages.reserved
            : "";
  return message ? { success: false, message } : { success: true, data: name };
}

export function safeReturnPath(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\x00-\x20]/.test(value)
  )
    return "/";
  try {
    const url = new URL(value, "https://planfri.invalid");
    if (
      url.origin !== "https://planfri.invalid" ||
      !(
        /^\/$/.test(url.pathname) ||
        /^\/prosjekt\/[^/]+$/.test(url.pathname) ||
        /^\/profil\/[^/]+$/.test(url.pathname) ||
        url.pathname === "/konto"
      )
    )
      return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}
export function loginHref(next: string = "/") {
  return `/logg-inn?next=${encodeURIComponent(safeReturnPath(next))}`;
}
/** Auth pages return to `next`, except account settings, which need an account. */
export function authBackHref(next: string) {
  return next === "/konto" ? "/" : next;
}
