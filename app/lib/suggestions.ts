import {
  arrangePhotos,
  centroid,
  hasPhoto,
  ownPhotos,
  projectPhotos,
  type Project,
} from "./data";

export type SuggestionKind = "project" | "correction" | "update";
export type SuggestionStatus = "pending" | "approved" | "rejected";

/** Project fields a correction may change. */
export const correctionKeys = [
  "title",
  "description",
  "status",
  "year",
  "phaseDates",
  "skippedPhases",
  "milestones",
  "categories",
  "city",
  "district",
  "developer",
  "website",
  "geometry",
  "geometryType",
  "center",
  "image",
  "images",
] as const;
export type CorrectionKey = (typeof correctionKeys)[number];
/** An empty website means the link is removed. */
export type CorrectionChanges = Partial<Pick<Project, CorrectionKey>>;

type CorrectionData = {
  changes: CorrectionChanges;
  base: CorrectionChanges;
  /** The fields a moderator applied. */
  applied?: CorrectionKey[];
};
type TipData = {
  text: string;
  sourceUrl: string;
  image?: string;
  /** The update an approved tip became; credits it. */
  updateId?: string;
};
export type SuggestionData = { project: Project } | CorrectionData | TipData;

type SuggestionBase = {
  id: string;
  status: SuggestionStatus;
  note: string;
  reason: string;
  createdAt: string;
  reviewedAt?: string;
  author: string;
  /** The existing project, or the published one once a new project is approved. */
  projectId?: string;
  title: string;
  /** Reviewed since the member last opened their suggestions. */
  fresh?: boolean;
};
export type Suggestion = SuggestionBase &
  (
    | { kind: "project"; data: { project: Project } }
    | {
        kind: "correction";
        data: CorrectionData;
        /** The project as it is now. */
        project?: Project;
      }
    | { kind: "update"; data: TipData }
  );
export type SuggestionLists = {
  mine: Suggestion[];
  /** Moderators only. */
  queue?: Suggestion[];
  handled?: Suggestion[];
};

export const kindLabels: Record<SuggestionKind, string> = {
  project: "Nytt prosjekt",
  correction: "Rettelse",
  update: "Tips",
};
export const statusLabels: Record<SuggestionStatus, string> = {
  pending: "Venter",
  approved: "Godkjent",
  rejected: "Avvist",
};

/** A tip's update headline: its first sentence or line, shortened. */
export function tipTitle(text: string) {
  const first = text.trim().split(/(?<=[.!?])\s|\n/)[0].trim();
  return first.length > 80 ? `${first.slice(0, 79).trimEnd()}…` : first;
}

/**
 * Lays changes over a project the way a moderator's edit would save. Photos
 * keep what the project knows about them; new ones get `credit`.
 */
export function applyChanges(
  current: Project,
  changes: CorrectionChanges,
  credit?: string,
): Project {
  const next = { ...current, ...changes };
  if ("image" in changes || "images" in changes) {
    const srcs = ownPhotos(next).map((photo) => photo.src);
    const known = new Map(projectPhotos(current).map((photo) => [photo.src, photo]));
    Object.assign(next, arrangePhotos(current, srcs, credit));
    const cover = known.get(next.image);
    next.imageCredit = cover ? cover.credit : hasPhoto(next) ? credit : undefined;
    // The source belongs to the cover it was given for.
    if (next.image !== current.image) next.imageSource = undefined;
  }
  if ("website" in changes) next.website = changes.website || undefined;
  if ("milestones" in changes && !changes.milestones?.length)
    next.milestones = undefined;
  if (changes.city !== undefined || changes.district !== undefined)
    next.district = next.district.trim() || next.city;
  if (changes.geometry) next.center = centroid(changes.geometry);
  return next;
}

// The schemas live apart, so the client gets these rules without zod.
export type {
  SuggestionInput,
  SuggestionMutation,
} from "./suggestion-schemas";
