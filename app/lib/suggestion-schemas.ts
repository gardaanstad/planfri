import { z } from "zod";
import { id, image, projectFields, projectSchema, sourceUrl } from "./community-rules";
import { correctionKeys } from "./suggestions";

const note = z.string().trim().max(500).default("");
const correctionFields = projectFields
  .pick({
    title: true,
    description: true,
    status: true,
    year: true,
    phaseDates: true,
    skippedPhases: true,
    milestones: true,
    categories: true,
    city: true,
    district: true,
    developer: true,
    geometry: true,
    geometryType: true,
    center: true,
    image: true,
    images: true,
  })
  .extend({ website: z.union([sourceUrl, z.literal("")]) })
  .partial()
  .strict();

export const submitSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("project"), project: projectSchema, note }),
  z.object({
    kind: z.literal("correction"),
    projectId: id,
    changes: correctionFields,
    note,
  }),
  z.object({
    kind: z.literal("update"),
    projectId: id,
    text: z.string().trim().min(1, "Skriv tipset først.").max(2000),
    sourceUrl,
    image: image.optional(),
  }),
]);
export type SuggestionInput = z.input<typeof submitSchema>;

export const suggestionMutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("submit"), suggestion: submitSchema }),
  z.object({
    action: z.literal("approve"),
    id,
    /** Edit-then-approve: overrides for a new project or a tip. */
    title: z.string().trim().min(3).max(200).optional(),
    description: z.string().trim().max(10_000).optional(),
    text: z.string().trim().min(1).max(10_000).optional(),
    /** A correction's fields to apply; all of them when omitted. */
    keys: z.array(z.enum(correctionKeys)).min(1).optional(),
  }),
  z.object({
    action: z.literal("reject"),
    id,
    reason: z.string().trim().max(300).default(""),
  }),
]);
export type SuggestionMutation = z.input<typeof suggestionMutationSchema>;
