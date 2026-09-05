import { Router } from "express";
import {
  getTrash,
  restoreFile,
  restoreFolder,
} from "../controllers/trash.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";

const router = Router();

router.get("/", requireAuth, getTrash);

router.patch(
  "/files/:id/restore",
  requireAuth,
  restoreFile
);

router.patch(
  "/folders/:id/restore",
  requireAuth,
  restoreFolder
);

export default router;