import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  unknownDeveloper,
  type Comment,
  type Point,
  type Project,
  type ProjectUpdate,
} from "../app/lib/data";

/**
 * A worktree's own development data: any `local-samples/*.ts` file in a
 * worktree (gitignored) default-exports a LocalSamples, and `bun run
 * db:sample` writes it to that worktree's local.db only, next to the
 * production copy. Every id starts with `local-`; deleting a file and
 * rerunning removes its rows.
 *
 *   // local-samples/long-titles.ts
 *   import { localProject, type LocalSamples } from "../scripts/local-samples";
 *   export default {
 *     projects: [localProject("local-long", { title: "…", status: "proposed" })],
 *     updates: { "prosjekt-ff2424ad": [{ id: "local-u1", … }] },
 *     comments: [{ id: "local-c1", projectId: "local-long", … }],
 *   } satisfies LocalSamples;
 */
export type SampleComment = Omit<Comment, "updateId"> & { updateId?: string };
export type LocalSamples = {
  projects?: Project[];
  /** Updates added to any project, production's included, by project id. */
  updates?: Record<string, ProjectUpdate[]>;
  comments?: SampleComment[];
};

/** An area of about 300 m around a centre. */
function square([lat, lng]: Point): Point[] {
  return [
    [lat - 0.0014, lng - 0.0025],
    [lat + 0.0014, lng - 0.0025],
    [lat + 0.0014, lng + 0.0025],
    [lat - 0.0014, lng + 0.0025],
  ];
}

/** A planned Oslo project with no photo; override whatever the test needs. */
export function localProject(
  id: `local-${string}`,
  overrides: Partial<Project> = {},
): Project {
  const center = overrides.center ?? [59.9139, 10.7522];
  return {
    id,
    title: id,
    district: "Sentrum",
    city: "Oslo",
    categories: ["Byutvikling"],
    status: "planned",
    image: "",
    description: "",
    center,
    geometry: square(center),
    geometryType: "area",
    year: "",
    updated: "2026-11-01T12:00:00",
    comments: 0,
    developer: unknownDeveloper,
    updates: [],
    ...overrides,
  };
}

/** Every `local-samples/*.ts` in the worktree, merged and checked. */
export async function loadLocalSamples(worktree: string) {
  const dir = join(worktree, "local-samples");
  const merged = {
    projects: [] as Project[],
    updates: {} as Record<string, ProjectUpdate[]>,
    comments: [] as SampleComment[],
  };
  if (!existsSync(dir)) return merged;
  for (const name of readdirSync(dir).filter((file) => file.endsWith(".ts")).sort()) {
    const path = join(dir, name);
    const samples: LocalSamples = (await import(pathToFileURL(path).href)).default;
    const ids = [
      ...(samples.projects ?? []).map((item) => item.id),
      ...Object.values(samples.updates ?? {}).flat().map((item) => item.id),
      ...(samples.comments ?? []).map((item) => item.id),
    ];
    const stray = ids.find((id) => !id.startsWith("local-"));
    if (stray) throw new Error(`${path}: id ${stray} must start with local-`);
    merged.projects.push(...(samples.projects ?? []));
    merged.comments.push(...(samples.comments ?? []));
    for (const [id, updates] of Object.entries(samples.updates ?? {}))
      (merged.updates[id] ??= []).push(...updates);
  }
  return merged;
}
