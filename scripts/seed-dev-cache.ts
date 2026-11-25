/**
 * Gives a fresh worktree a warm Turbopack dev cache, copied from the checkout
 * that ran `next dev` most recently. With a cold cache the first page takes
 * about 35 seconds to compile; with a copied one, even from another branch,
 * about 7: Turbopack recompiles only the files that differ.
 *
 *   bun scripts/seed-dev-cache.ts    (run by `bun dev` and scripts/preview.ts)
 *
 * Does nothing when this checkout already has a cache. The cache is an
 * append-only store: numbered files that never change once written, and
 * CURRENT naming the last committed one, rewritten before a compaction
 * deletes files. Copying what CURRENT covers, and checking CURRENT didn't
 * change meanwhile, is safe while another dev server writes to its cache.
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const cacheDir = join(".next", "dev", "cache", "turbopack");

export function seedDevCache(dir: string) {
  const target = join(dir, cacheDir);
  if (existsSync(target)) return;
  const store = `v${nextVersion(dir)}-`;
  for (const { checkout, name } of sources(dir, store)) {
    if (copyStore(join(checkout, cacheDir, name), join(target, name))) {
      console.log(`Copied the Turbopack dev cache from ${checkout}.`);
      return;
    }
  }
}

function nextVersion(dir: string) {
  return (JSON.parse(readFileSync(join(dir, "node_modules", "next", "package.json"), "utf8")) as { version: string }).version;
}

/** Other checkouts' stores for this Next.js version, last committed first. */
function sources(dir: string, store: string) {
  const list = spawnSync("git", ["worktree", "list", "--porcelain"], { cwd: dir, encoding: "utf8" }).stdout;
  return list
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice("worktree ".length))
    .filter((path) => path !== dir)
    .flatMap((path) => {
      try {
        // Turbopack keeps one store per Next.js build, e.g. `v16.3.4-299180d3`.
        const name = readdirSync(join(path, cacheDir)).find((entry) => entry.startsWith(store));
        if (!name) return [];
        return [{ checkout: path, name, time: statSync(join(path, cacheDir, name, "CURRENT")).mtimeMs }];
      } catch {
        return [];
      }
    })
    .sort((a, b) => b.time - a.time);
}

/** Copies the committed files, retrying if a commit lands meanwhile. */
function copyStore(from: string, to: string) {
  const staging = `${to}.seeding-${process.pid}`;
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      rmSync(staging, { recursive: true, force: true });
      mkdirSync(staging, { recursive: true });
      const current = readFileSync(join(from, "CURRENT"), "utf8");
      const committed = (JSON.parse(current) as { max_sequence_number: number }).max_sequence_number;
      try {
        for (const name of readdirSync(from)) {
          const sequence = Number.parseInt(name, 10);
          if (Number.isNaN(sequence) || sequence > committed) continue;
          copyFileSync(join(from, name), join(staging, name));
        }
      } catch {
        continue; // A compaction removed a file; read CURRENT again.
      }
      if (readFileSync(join(from, "CURRENT"), "utf8") !== current) continue;
      writeFileSync(join(staging, "CURRENT"), current);
      renameSync(staging, to);
      return true;
    }
  } catch {
    // Another checkout's cache is only a head start; try the next one.
  }
  rmSync(staging, { recursive: true, force: true });
  return false;
}

if (import.meta.main) seedDevCache(process.cwd());
