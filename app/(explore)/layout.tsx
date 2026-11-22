import type { ReactNode } from "react";
import { headers } from "next/headers";
import { userAgent } from "next/server";
import { getPageSession } from "../lib/auth";
import { commentListHeader, parseCommentList } from "../lib/community";
import { readComments, readCommunity } from "../lib/server/community";
import { readUnread } from "../lib/server/unread";
import { moderates } from "../lib/server/http";
import { CommunityProvider } from "../components/community-provider";
import { UnreadProvider } from "../components/unread-provider";
import ExplorerShell from "../components/explorer-shell";
import UsernamePrompt from "../components/username-prompt";

export default async function ExploreLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getPageSession();
  const userId = session?.user.id;
  const member = session?.user.username ? userId : undefined;
  // Phones get the mobile layout in the first HTML, so it doesn't swap after load.
  const requestHeaders = await headers();
  const { device } = userAgent({ headers: requestHeaders });
  // A project's page, or a profile, renders with its comments.
  const list = parseCommentList(requestHeaders.get(commentListHeader));
  const [community, unread, comments] = await Promise.all([
    readCommunity(userId, !!session && moderates(session.user, requestHeaders)),
    member ? readUnread(member) : null,
    list ? readComments(list) : null,
  ]);
  return (
    <CommunityProvider
      initialData={community}
      initialUserId={userId}
      initialComments={list && comments ? { [list]: comments } : undefined}
    >
      <UnreadProvider initialUnread={unread} initialUserId={member}>
        <ExplorerShell mobileHint={device.type === "mobile"} />
        {children}
        <UsernamePrompt />
      </UnreadProvider>
    </CommunityProvider>
  );
}
