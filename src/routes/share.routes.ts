import { Router } from "express";

import {
  createShare,
  getShares,
  deleteShare,
} from "../controllers/share.controller.js";

import { requireAuth } from "../middlewares/auth.middleware.js";

const router = Router();

router.post("/", requireAuth, createShare);

router.get("/", requireAuth, getShares);

router.delete("/:id", requireAuth, deleteShare);

export default router;