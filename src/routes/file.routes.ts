import { Router } from "express";
import { deleteFile, updateFile, uploadFile, getFiles, getFileStats, downloadFile, initUpload, completeUpload, getUploadUrl} from "../controllers/file.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { uploadSingleFile } from "../middlewares/upload.middleware.js";

const router = Router();

router.post(
  "/upload",
  requireAuth,
  uploadSingleFile,
  uploadFile,

);
router.post(
  "/upload-url",
  requireAuth,
  getUploadUrl
);
router.patch("/:id", requireAuth, updateFile);
router.delete("/:id", requireAuth, deleteFile);
router.get("/stats", requireAuth, getFileStats);
router.get("/", requireAuth, getFiles);
router.get("/:id/download", requireAuth, downloadFile);
router.post("/init", requireAuth, initUpload);
router.post("/complete", requireAuth, completeUpload);

export default router;

