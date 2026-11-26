import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@libsql/client";
import { and, eq, inArray, like, notInArray, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import type { Project, ProjectUpdate } from "../app/lib/data";
import { comment, project, upload } from "../app/lib/db/schema";
import { databaseConfig } from "../app/lib/db/config";
import { sampleComments, sampleUpdates } from "./sample-data";
import { seedComments, seedProjects } from "./seed-data";
import { loadLocalSamples, type SampleComment } from "./local-samples";

/**
 * Fills local SQLite databases for development: copies the projects and
 * their public photos from a downloaded production database, lays the
 * fictional updates and comments in sample-data.ts over them, and adds the
 * worktree's own local-samples/*.ts (see local-samples.ts). Rerunning brings
 * all of it up to date. Users, sessions, votes and suggestions stay behind,
 * and the test seed's illustrative projects are removed.
 *
 *   bun run db:sample [production.db] [--worktrees]
 *
 * The production file defaults to ~/planfri-prod.db (`turso db export`).
 * `--worktrees` writes to every git worktree's local.db, each with its own
 * local samples, not just this one's.
 */
type Production = {
  projects: Project[];
  uploads: (typeof upload.$inferSelect)[];
};

async function readProduction(path: string): Promise<Production> {
  const client = createClient({ url: `file:${path}` });
  const db = drizzle(client);
  try {
    const projects = (await db.select().from(project)).map((row) => row.data);
    const used = new Set(
      projects.flatMap((item) =>
        [...JSON.stringify(item).matchAll(/\/api\/uploads\/([0-9a-f]+)/g)].map(
          (match) => match[1],
        ),
      ),
    );
    const uploads = used.size
      ? await db
          .select()
          .from(upload)
          .where(and(inArray(upload.id, [...used]), eq(upload.public, true)))
      : [];
    return { projects, uploads };
  } finally {
    client.close();
  }
}

const isSample = (item: { id: string }) =>
  item.id.startsWith("sample-") || item.id.startsWith("local-");

function withUpdates(data: Project, extra: ProjectUpdate[]): Project {
  const updates = [...data.updates.filter((item) => !isSample(item)), ...extra];
  const updated = [data.updated, ...extra.map((item) => item.date)]
    .sort()
    .at(-1)!;
  return { ...data, updates, updated };
}

async function writeSamples(worktree: string, url: string, production?: Production) {
  if (!url.startsWith("file:")) throw new Error(`refusing hosted ${url}`);
  const local = await loadLocalSamples(worktree);
  const overlays: Record<string, ProjectUpdate[]> = { ...sampleUpdates };
  for (const [id, updates] of Object.entries(local.updates))
    overlays[id] = [...(overlays[id] ?? []), ...updates];
  const fresh = [...(production?.projects ?? []), ...local.projects].map(
    (item) => withUpdates(item, overlays[item.id] ?? []),
  );
  const freshIds = fresh.map((item) => item.id);
  const localIds = local.projects.map((item) => item.id);
  const comments: SampleComment[] = [...sampleComments, ...local.comments];

  const client = createClient({ url, timeout: 5000, concurrency: 1 });
  const db = drizzle(client);
  try {
    // So removed projects take their comments, votes and saves with them.
    await client.execute("PRAGMA foreign_keys = ON");
    await db.transaction(async (tx) => {
      await tx.delete(project).where(
        or(
          // The fictional projects that came before production's.
          like(project.id, "sample-%"),
          and(like(project.id, "local-%"), notInArray(project.id, localIds)),
          inArray(project.id, seedProjects.map((item) => item.id)),
        ),
      );
      await tx.delete(comment).where(
        or(
          and(
            or(like(comment.id, "sample-%"), like(comment.id, "local-%")),
            notInArray(comment.id, comments.map((item) => item.id)),
          ),
          inArray(comment.id, seedComments.map((item) => item.id)),
        ),
      );
      for (const item of fresh) {
        await tx
          .insert(project)
          .values({ id: item.id, data: item })
          .onConflictDoUpdate({ target: project.id, set: { data: item } });
      }
      for (const item of production?.uploads ?? []) {
        const row = { ...item, userId: null };
        await tx
          .insert(upload)
          .values(row)
          .onConflictDoUpdate({ target: upload.id, set: row });
      }
      // Without a production file, overlay what an earlier run copied.
      const stale = Object.keys(overlays).filter((id) => !freshIds.includes(id));
      const earlier = stale.length
        ? await tx.select().from(project).where(inArray(project.id, stale))
        : [];
      for (const { id, data } of earlier) {
        await tx
          .update(project)
          .set({ data: withUpdates(data, overlays[id]) })
          .where(eq(project.id, id));
      }
      const projectIds = new Set(
        (await tx.select({ id: project.id }).from(project)).map((row) => row.id),
      );
      for (const item of comments.filter((c) => projectIds.has(c.projectId))) {
        const row = {
          projectId: item.projectId,
          updateId: item.updateId || "",
          seedAuthor: item.deleted ? null : item.author,
          parentId: item.parentId,
          text: item.deleted ? "" : item.text,
          date: item.date,
          seedVotes: item.votes,
        };
        await tx
          .insert(comment)
          .values({ id: item.id, ...row })
          .onConflictDoUpdate({ target: comment.id, set: row });
      }
    });
    console.log(
      `Sample data written to ${url}` +
        (local.projects.length || local.comments.length
          ? ` with ${local.projects.length} local projects and ${local.comments.length} local comments`
          : ""),
    );
  } finally {
    client.close();
  }
}

function worktrees() {
  const list = execFileSync("git", ["worktree", "list", "--porcelain"], {
    encoding: "utf8",
  });
  return list
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice("worktree ".length));
}

loadEnvConfig(process.cwd());
const source = resolve(
  process.argv.slice(2).find((arg) => !arg.startsWith("--")) ??
    join(homedir(), "planfri-prod.db"),
);
let production: Production | undefined;
if (existsSync(source)) {
  production = await readProduction(source);
  console.log(
    `Read ${production.projects.length} projects and ${production.uploads.length} photos from ${source}`,
  );
} else {
  console.log(
    `No production database at ${source}; keeping the projects copied earlier. Download one with turso db export.`,
  );
}
const here = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const targets = process.argv.includes("--worktrees")
  ? worktrees()
      .filter((dir) => existsSync(join(dir, "local.db")))
      .map((dir) => ({ dir, url: `file:${join(dir, "local.db")}` }))
  : [{ dir: here, url: databaseConfig().url }];
let failed = false;
for (const { dir, url } of targets) {
  try {
    await writeSamples(dir, url, production);
  } catch (error) {
    failed = true;
    console.error(`Skipped ${url}: ${(error as Error).message}`);
  }
}
if (failed) process.exitCode = 1;
