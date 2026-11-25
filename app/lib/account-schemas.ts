import { z } from "zod";
import { usernameMessages, usernameRules } from "./account-rules";

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(usernameRules.min, usernameMessages.short)
  .max(usernameRules.max, usernameMessages.long)
  .regex(usernameRules.pattern, usernameMessages.pattern)
  .refine((value) => !usernameRules.reserved(value), usernameMessages.reserved);
export const profileSchema = z.object({
  bio: z.string().trim().max(280),
  location: z.string().trim().max(80),
});
