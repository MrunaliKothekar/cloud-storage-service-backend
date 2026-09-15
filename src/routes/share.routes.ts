import { Router } from "express";

import {
  createShare,
  getShares,
  deleteShare,
  getSharedWithMe,
  getSharedByMe,
} from "../controllers/share.controller.js";

import { requireAuth } from "../middlewares/auth.middleware.js";
import { createShareSchema } from "../validators/share.validator.js";
import { validate } from "../middlewares/validate.middleware.js";

const router = Router();

router.post(
  "/",
  requireAuth,
  validate(createShareSchema),
  createShare
);

router.get("/shared-with-me", requireAuth, getSharedWithMe);
router.get("/shared-by-me", requireAuth, getSharedByMe);
router.get("/", requireAuth, getShares);

router.delete("/:id", requireAuth, deleteShare);

export default router;