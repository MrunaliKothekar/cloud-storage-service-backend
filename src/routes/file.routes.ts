import { Router } from "express";

import { uploadFile } from "../controllers/file.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { uploadSingleFile } from "../middlewares/upload.middleware.js";

const router = Router();

router.post(
  "/upload",
  requireAuth,
  uploadSingleFile,
  uploadFile
);

export default router;