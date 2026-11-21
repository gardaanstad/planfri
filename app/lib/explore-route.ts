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
