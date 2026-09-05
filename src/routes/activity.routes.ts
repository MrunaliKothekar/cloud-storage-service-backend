import { Router } from "express";
import { getActivities } from "../controllers/activity.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";

const router = Router();

router.get(
  "/",
  requireAuth,
  getActivities
);

export default router;