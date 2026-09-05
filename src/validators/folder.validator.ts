import { z } from "zod";

export const createFolderSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Folder name is required")
    .max(255, "Folder name is too long"),

  parentId: z
    .string()
    .uuid()
    .nullable()
    .optional(),
});

export const updateFolderSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .optional(),

  parentId: z
    .string()
    .uuid()
    .nullable()
    .optional(),
});