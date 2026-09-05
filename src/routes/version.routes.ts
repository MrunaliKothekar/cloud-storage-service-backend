import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";

import {
  getVersions,
  downloadVersion,
  revertVersion,
} from "../controllers/version.controller.js";

const router = Router();

router.get(
  "/:fileId",
  requireAuth,
  getVersions
);

router.get(
  "/:fileId/:versionId/download",
  requireAuth,
  downloadVersion
);

router.post(
  "/:fileId/:versionId/revert",
  requireAuth,
  revertVersion
);

export default router;