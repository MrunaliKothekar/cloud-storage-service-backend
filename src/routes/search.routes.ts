import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { search } from "../controllers/search.controller.js";

const router = Router();

router.get("/", requireAuth, search);

export default router;