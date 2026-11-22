import { NextResponse, type NextRequest } from "next/server";
import { commentListHeader, type CommentList } from "./app/lib/community";

/**
 * Layouts can't read the path, so this names the comments the explorer's
 * layout renders with: a project's on its page, a member's on their profile.
 */
export function proxy(request: NextRequest) {
  const [kind, value] = request.nextUrl.pathname.split("/").filter(Boolean);
  const headers = new Headers(request.headers);
  headers.delete(commentListHeader);
  try {
    const list: CommentList = `${kind === "prosjekt" ? "project" : "author"}:${decodeURIComponent(value)}`;
    headers.set(commentListHeader, list);
  } catch {
    // A malformed path renders without comments, and then its not-found page.
  }
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/prosjekt/:id", "/profil/:username"],
};
