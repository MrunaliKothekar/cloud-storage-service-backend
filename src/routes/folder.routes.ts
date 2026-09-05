import { Router } from "express";
import {
  createFolder,
  getFolder,
  updateFolder,
  deleteFolder,
} from "../controllers/folder.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { createFolderSchema } from "../validators/folder.validator.js";
import { validate } from "../middlewares/validate.middleware.js";

const router = Router();

router.post(
  "/",
  requireAuth,
  validate(createFolderSchema),
  createFolder
);

router.get("/:id", requireAuth, getFolder);

router.patch("/:id", requireAuth, updateFolder);

router.delete("/:id", requireAuth, deleteFolder);

export default router;

