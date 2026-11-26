import { createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { getAuth } from "@/app/lib/auth";
import { getDb } from "@/app/lib/db/client";
import { user } from "@/app/lib/db/schema";
import { devAccounts, devLoginEnabled } from "@/app/lib/server/dev-login";
import { api, json, readBody } from "@/app/lib/server/http";
export const runtime = "nodejs";

const body = z.object({ role: z.enum(["moderator", "member"]) });

/** Signs in as a fixed moderator or member account, in development only. */
export async function POST(request: Request) {
  if (!devLoginEnabled()) return new Response(null, { status: 404 });
  return api(async () => {
    const account = devAccounts[body.parse(await readBody(request)).role];
    const now = new Date();
    await getDb()
      .insert(user)
      .values({ ...account, emailVerified: true, createdAt: now, updatedAt: now })
      .onConflictDoNothing();
    const context = await getAuth().$context;
    const session = await context.internalAdapter.createSession(account.id);
    const signature = createHmac("sha256", context.secret)
      .update(session.token)
      .digest("base64");
    const { name, attributes } = context.authCookies.sessionToken;
    (await cookies()).set(name, `${session.token}.${signature}`, {
      path: attributes.path ?? "/",
      httpOnly: attributes.httpOnly ?? true,
      secure: attributes.secure ?? false,
      sameSite: "lax",
      maxAge: context.sessionConfig.expiresIn,
    });
    return json({ ok: true });
  });
}
