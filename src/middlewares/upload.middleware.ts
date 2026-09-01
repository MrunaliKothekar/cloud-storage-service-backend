import multer from "multer";
import path from "path";

const storage = multer.memoryStorage();

const allowedMimeTypes = new Set([
  // Images
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",

  // Documents
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

  // Spreadsheets
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

  // Presentations
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",

  // Archives
  "application/zip",
]);

const extensionMimeTypes: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",

  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".csv": "text/csv",

  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

  ".xls": "application/vnd.ms-excel",
  ".xlsx":
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",

  ".zip": "application/zip",
};

const fileFilter: multer.Options["fileFilter"] = (
  _req,
  file,
  callback
) => {
  console.log("========== FILE UPLOAD ==========");
  console.log("Original name:", file.originalname);
  console.log("Received MIME:", file.mimetype);

  // Normal MIME type
  if (allowedMimeTypes.has(file.mimetype)) {
    console.log("✅ MIME TYPE ACCEPTED");
    return callback(null, true);
  }

  // Fallback for clients sending application/octet-stream
  if (file.mimetype === "application/octet-stream") {
    const extension = path
      .extname(file.originalname)
      .toLowerCase();

    const detectedMimeType = extensionMimeTypes[extension];

    console.log("Extension:", extension);
    console.log("Detected MIME:", detectedMimeType);

    if (detectedMimeType) {
      console.log("✅ FILE ACCEPTED BY EXTENSION");
      return callback(null, true);
    }
  }

  console.log("❌ UNSUPPORTED FILE TYPE");

  return callback(
    new Error("UNSUPPORTED_FILE_TYPE")
  );
};

export const uploadSingleFile = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
  fileFilter,
}).single("file");