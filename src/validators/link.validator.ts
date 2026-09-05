import { z } from "zod";

export const createLinkSchema = z.object({
  resourceType: z.enum(["file", "folder"]),

  resourceId: z
    .string()
    .uuid(),

  expiresAt: z
    .string()
    .datetime()
    .optional(),

  password: z
    .string()
    .min(4)
    .max(100)
    .optional(),
});