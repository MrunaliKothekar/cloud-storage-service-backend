import { Router } from "express";

import {
  createLink,
  getLinks,
  deleteLink,
  accessPublicLink,
} from "../controllers/link.controller.js";

import { requireAuth } from "../middlewares/auth.middleware.js";
import { createLinkSchema } from "../validators/link.validator.js";
import { validate } from "../middlewares/validate.middleware.js";

const router = Router();

// Authenticated
router.post(
  "/",
  requireAuth,
  validate(createLinkSchema),
  createLink
);
router.get("/", requireAuth, getLinks);

// Public
router.get("/public/:token", accessPublicLink);

// Authenticated
router.delete("/:id", requireAuth, deleteLink);

export default router;