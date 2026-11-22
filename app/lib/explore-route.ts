/**
 * Whether path segments name an explorer view: the list (no segments),
 * `/forslag`, `/prosjekt/<id>` or `/profil/<username>`.
 */
export function isExplorerPath([first, ...rest]: string[]) {
  if (first === undefined) return true;
  if (first === "forslag") return rest.length === 0;
  return (first === "prosjekt" || first === "profil") && rest.length === 1;
}

/** The segments of a pathname such as `/prosjekt/akerselva`. */
export const pathSegments = (pathname: string) =>
  pathname.split("/").filter(Boolean);

/** The decoded id after a route prefix such as "/prosjekt/", if on that route. */
export function routeParam(pathname: string, prefix: string) {
  return pathname.startsWith(prefix)
    ? decodeURIComponent(pathname.slice(prefix.length).split("/")[0])
    : undefined;
}
