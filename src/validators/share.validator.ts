import { z } from "zod";

export const createShareSchema = z.object({
  resourceType: z.enum(["file", "folder"]),

  resourceId: z
    .string()
    .uuid(),

  sharedWithEmail: z
    .string()
    .email(),

  role: z.enum(["viewer", "editor"]),
});