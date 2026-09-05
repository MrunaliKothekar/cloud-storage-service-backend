import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import {
  addStar,
  getStars,
  removeStar,
} from "../controllers/star.controller.js";

const router = Router();

router.post("/", requireAuth, addStar);
router.get("/", requireAuth, getStars);
router.delete("/", requireAuth, removeStar);

export default router;