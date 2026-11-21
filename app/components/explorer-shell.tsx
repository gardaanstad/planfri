"use client";
import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Explorer, { routeParam } from "./explorer";
import { isExplorerPath, pathSegments } from "../lib/explore-route";

export default function ExplorerShell({ mobileHint }: { mobileHint: boolean }) {
  const pathname = usePathname();
  // Read once: the explorer writes the query string itself as the map moves,
  // and passing each new one down would re-render it after every move.
  const searchParams = useSearchParams();
  const [initialSearch] = useState(() => searchParams.toString());
  // Other paths fall through to the route's not-found page.
  if (!isExplorerPath(pathSegments(pathname))) return null;
  return (
    <Explorer
      initialProjectId={routeParam(pathname, "/prosjekt/")}
      initialProfile={routeParam(pathname, "/profil/")}
      initialPanel={pathname === "/forslag" ? "suggestions" : undefined}
      initialSearch={initialSearch}
      mobileHint={mobileHint}
    />
  );
}
