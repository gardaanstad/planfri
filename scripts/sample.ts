import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@libsql/client";
import { and, eq, inArray, like, notInArray, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import type { Project, ProjectUpdate } from "../app/lib/data";
import { comment, externalCache, project, upload } from "../app/lib/db/schema";
import { databaseConfig } from "../app/lib/db/config";
import { sampleComments, sampleUpdates } from "./sample-data";
import { seedComments, seedProjects } from "./seed-data";
import { loadLocalSamples, type SampleComment } from "./local-samples";

/**
 * Fills local SQLite databases for development: migrates them, copies the
 * projects and their public photos from a downloaded production database
 * (migrated first, on a temporary copy, so an older export still matches
 * the schema), lays the fictional updates and comments in sample-data.ts over
 * them, and adds the worktree's own local-samples/*.ts (see local-samples.ts).
 * Rerunning brings all of it up to date. Users, sessions, votes and
 * suggestions stay behind, and the test seed's illustrative projects are
 * removed.
 *
 *   bun run db:sample [production.db] [--worktrees] [--if-stale]
 *
 * The production file defaults to ~/planfri-prod.db (`turso db export`).
 * `--worktrees` writes to every git worktree's local.db whose migrations
 * match this checkout's, each with its own local samples. `--if-stale`, run
 * by `bun dev` and Preview, does nothing while the database already holds
 * what the current production file, migrations and sample files give.
 */
type Production = {
  projects: Project[];
  uploads: (typeof upload.$inferSelect)[];
};

const here = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const journal = (dir: string) =>
  readFileSync(join(dir, "drizzle", "meta", "_journal.json"), "utf8");

async function migrateDatabase(url: string, dir: string) {
  const client = createClient({ url, timeout: 5000, concurrency: 1 });
  try {
    await client.execute("PRAGMA journal_mode = WAL");
    await migrate(drizzle(client), { migrationsFolder: join(dir, "drizzle") });
  } finally {
    client.close();
  }
}

async function readProduction(path: string): Promise<Production> {
  // Never written to: migrations run on a copy.
  const dir = mkdtempSync(join(tmpdir(), "planfri-prod-"));
  const copy = join(dir, "prod.db");
  copyFileSync(path, copy);
  const client = createClient({ url: `file:${copy}` });
  const db = drizzle(client);
  try {
    const applied = Number(
      (await client.execute("select count(*) as n from __drizzle_migrations")).rows[0].n,
    );
    const known = (JSON.parse(journal(here)) as { entries: unknown[] }).entries.length;
    if (applied > known)
      console.warn(
        `${path} has ${applied} migrations and this checkout ${known}; rebase on main if projects look wrong.`,
      );
    await migrate(db, { migrationsFolder: join(here, "drizzle") });
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
    rmSync(dir, { recursive: true, force: true });
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

/** What a target's sample data is made from, as one hash. */
function stamp(worktree: string, source: string) {
  const hash = createHash("sha1");
  for (const file of ["sample.ts", "sample-data.ts", "local-samples.ts", "seed-data.ts"])
    hash.update(readFileSync(join(here, "scripts", file)));
  hash.update(journal(here));
  const localDir = join(worktree, "local-samples");
  if (existsSync(localDir))
    for (const name of readdirSync(localDir).sort())
      hash.update(name).update(readFileSync(join(localDir, name)));
  if (existsSync(source)) {
    const { size, mtimeMs } = statSync(source);
    hash.update(`${source}:${size}:${mtimeMs}`);
  }
  return hash.digest("hex");
}

const stampKey = "dev-sample";

/**
 * Whether the target already holds this stamp's data. Also checks the rows
 * themselves, since an older checkout's db:sample may have replaced them.
 */
async function isFresh(worktree: string, url: string, expected: string) {
  const client = createClient({ url, timeout: 5000, concurrency: 1 });
  const db = drizzle(client);
  try {
    const [row] = await db
      .select()
      .from(externalCache)
      .where(eq(externalCache.key, stampKey));
    if ((row?.data as { stamp?: string } | undefined)?.stamp !== expected) return false;
    const local = await loadLocalSamples(worktree);
    const overlays = { ...sampleUpdates };
    for (const [id, updates] of Object.entries(local.updates))
      overlays[id] = [...(overlays[id] ?? []), ...updates];
    const projects = await db
      .select()
      .from(project)
      .where(inArray(project.id, [...Object.keys(overlays), ...local.projects.map((p) => p.id)]));
    if (projects.length < local.projects.length) return false;
    for (const { id, data } of projects) {
      const have = new Set(data.updates.map((item) => item.id));
      if ((overlays[id] ?? []).some((item) => !have.has(item.id))) return false;
    }
    const present = new Set(projects.map((item) => item.id));
    const wanted = [...sampleComments, ...local.comments]
      .filter((item) => present.has(item.projectId) || item.projectId.startsWith("local-"))
      .map((item) => item.id);
    const found = wanted.length
      ? await db.select({ id: comment.id }).from(comment).where(inArray(comment.id, wanted))
      : [];
    return found.length === wanted.length;
  } catch {
    return false;
  } finally {
    client.close();
  }
}

async function writeSamples(
  worktree: string,
  url: string,
  production: Production | undefined,
  newStamp: string,
) {
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
      const mark = { key: stampKey, data: { stamp: newStamp }, fetchedAt: new Date() };
      await tx
        .insert(externalCache)
        .values(mark)
        .onConflictDoUpdate({ target: externalCache.key, set: mark });
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
const ifStale = process.argv.includes("--if-stale");
const source = resolve(
  process.argv.slice(2).find((arg) => !arg.startsWith("--")) ??
    join(homedir(), "planfri-prod.db"),
);
const targets = process.argv.includes("--worktrees")
  ? worktrees()
      .filter((dir) => existsSync(join(dir, "local.db")))
      .filter((dir) => {
        // Older code would not understand this checkout's data.
        const same = existsSync(join(dir, "drizzle")) && journal(dir) === journal(here);
        if (!same) console.log(`Skipped ${dir}: its migrations differ; rebase it on main.`);
        return same;
      })
      .map((dir) => ({ dir, url: `file:${join(dir, "local.db")}` }))
  : [{ dir: here, url: databaseConfig().url }];
let production: Production | undefined;
let read = false;
let failed = false;
for (const { dir, url } of targets) {
  try {
    if (!url.startsWith("file:")) throw new Error(`refusing hosted ${url}`);
    await migrateDatabase(url, dir);
    const next = stamp(dir, source);
    if (ifStale && (await isFresh(dir, url, next))) continue;
    if (!read) {
      read = true;
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
    }
    await writeSamples(dir, url, production, next);
  } catch (error) {
    failed = true;
    console.error(`Skipped ${url}: ${(error as Error).message}`);
  }
}
if (failed) process.exitCode = 1;
