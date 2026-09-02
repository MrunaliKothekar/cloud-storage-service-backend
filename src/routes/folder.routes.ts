import { Router } from "express";
import {
  createFolder,
  getFolder,
  updateFolder,
  deleteFolder,
} from "../controllers/folder.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";

const router = Router();

router.post("/", requireAuth, createFolder);

router.get("/:id", requireAuth, getFolder);

router.patch("/:id", requireAuth, updateFolder);

router.delete("/:id", requireAuth, deleteFolder);

export default router;

