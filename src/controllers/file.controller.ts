import type { Request, Response } from "express";
import crypto from "crypto";

import { pool } from "../config/database.js";
import { uploadToStorage } from "../services/storage.service.js";

import { createSignedDownloadUrl } from "../services/storage.service.js";
import { createSignedUploadUrl } from "../services/storage.service.js";

import path from "path";
import { randomUUID } from "crypto";

export const uploadFile = async (
  req: Request,
  res: Response
) => {
  try {
    if (!req.auth) {
      return res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required.",
        },
      });
    }
    const userId = req.auth.userId;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: {
          code: "FILE_REQUIRED",
          message: "Please provide a file.",
        },
      });
    }

    const fileId = crypto.randomUUID();

    const folderId =
      typeof req.body.folderId === "string" &&
      req.body.folderId.length > 0
        ? req.body.folderId
        : null;

    const safeFileName = req.file.originalname
      .replace(/[^a-zA-Z0-9._-]/g, "_");

    const storageKey = folderId
      ? `tenants/${req.auth.userId}/folders/${folderId}/files/${fileId}-${safeFileName}`
      : `tenants/${req.auth.userId}/files/${fileId}-${safeFileName}`;

    const checksum = crypto
      .createHash("sha256")
      .update(req.file.buffer)
      .digest("hex");

    await uploadToStorage(
      storageKey,
      req.file.buffer,
      req.file.mimetype
    );

    const result = await pool.query(
      `
      INSERT INTO files (
        id,
        name,
        mime_type,
        size_bytes,
        storage_key,
        owner_id,
        folder_id,
        checksum
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8
      )
      RETURNING
        id,
        name,
        mime_type,
        size_bytes,
        storage_key,
        owner_id,
        folder_id,
        checksum,
        is_deleted,
        created_at,
        updated_at
      `,
      [
        fileId,
        req.file.originalname,
        req.file.mimetype,
        req.file.size,
        storageKey,
        req.auth.userId,
        folderId,
        checksum,
      ]
    );

    await pool.query(
      `
      INSERT INTO activities (
        actor_id,
        action,
        resource_type,
        resource_id,
        context
      )
      VALUES ($1, 'upload', 'file', $2, $3)
      `,
      [
        req.auth.userId,
        fileId,
        JSON.stringify({
          name: req.file.originalname,
          size: req.file.size,
          mimeType: req.file.mimetype,
        }),
      ]
    );

    return res.status(201).json({
      success: true,
      file: result.rows[0],
    });
  } catch (error) {
    console.error("Upload file error:", error);

    return res.status(500).json({
      success: false,
      error: {
        code: "UPLOAD_FAILED",
        message: "File upload failed.",
      },
    });
  }
};
export const updateFile = async (req: Request, res: Response) => {
  try {
    if (!req.auth) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
      });
    }

    const userId = req.auth.userId;
    const { id } = req.params;
    const { name, folderId } = req.body;

    // Get current file
    const fileResult = await pool.query(
      `
      SELECT *
      FROM files
      WHERE id = $1
        AND owner_id = $2
        AND is_deleted = false
      `,
      [id, userId]
    );

    if (fileResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "File not found",
      });
    }

    const currentFile = fileResult.rows[0];

    // Keep old values if not provided
    const newName =
      name !== undefined
        ? String(name).trim()
        : currentFile.name;

    const newFolderId =
      folderId !== undefined
        ? folderId
        : currentFile.folder_id;

    // Validate name
    if (!newName || newName.length > 255) {
      return res.status(400).json({
        success: false,
        message: "File name must be between 1 and 255 characters",
      });
    }

    // Validate destination folder
    if (newFolderId !== null) {
      const folderResult = await pool.query(
        `
        SELECT id
        FROM folders
        WHERE id = $1
          AND owner_id = $2
          AND is_deleted = false
        `,
        [newFolderId, userId]
      );

      if (folderResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Destination folder not found",
        });
      }
    }

    // Check duplicate filename in destination folder
    const duplicateResult = await pool.query(
      `
      SELECT id
      FROM files
      WHERE owner_id = $1
        AND folder_id IS NOT DISTINCT FROM $2
        AND name = $3
        AND id != $4
        AND is_deleted = false
      `,
      [userId, newFolderId, newName, id]
    );

    if (duplicateResult.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "A file with this name already exists in the destination folder",
      });
    }

    // Update file
    const updatedResult = await pool.query(
      `
      UPDATE files
      SET
        name = $1,
        folder_id = $2,
        updated_at = NOW()
      WHERE id = $3
        AND owner_id = $4
        AND is_deleted = false
      RETURNING *
      `,
      [
        newName,
        newFolderId,
        id,
        userId,
      ]
    );

    const updatedFile = updatedResult.rows[0];

    // Determine activity
    let action = "rename";

    if (newFolderId !== currentFile.folder_id) {
      action = "move";
    }

    await pool.query(
      `
      INSERT INTO activities
        (actor_id, action, resource_type, resource_id, context)
      VALUES
        ($1, $2, $3, $4, $5)
      `,
      [
        userId,
        action,
        "file",
        id,
        JSON.stringify({
          oldName: currentFile.name,
          newName,
          oldFolderId: currentFile.folder_id,
          newFolderId,
        }),
      ]
    );

    return res.status(200).json({
      success: true,
      file: updatedFile,
    });
  } catch (error) {
    console.error("Update file error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update file",
    });
  }
};

export const deleteFile = async (req: Request, res: Response) => {
  try {
    if (!req.auth) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
      });
    }

    const userId = req.auth.userId;
    const { id } = req.params;

    const fileResult = await pool.query(
      `
      SELECT id, name, folder_id
      FROM files
      WHERE id = $1
        AND owner_id = $2
        AND is_deleted = false
      `,
      [id, userId]
    );

    if (fileResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "File not found",
      });
    }

    const file = fileResult.rows[0];

    await pool.query(
      `
      UPDATE files
      SET
        is_deleted = true,
        updated_at = NOW()
      WHERE id = $1
        AND owner_id = $2
        AND is_deleted = false
      `,
      [id, userId]
    );

    await pool.query(
      `
      INSERT INTO activities
        (actor_id, action, resource_type, resource_id, context)
      VALUES
        ($1, $2, $3, $4, $5)
      `,
      [
        userId,
        "delete",
        "file",
        id,
        JSON.stringify({
          name: file.name,
          folderId: file.folder_id,
        }),
      ]
    );

    return res.status(200).json({
      success: true,
      message: "File deleted successfully",
    });
  } catch (error) {
    console.error("Delete file error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete file",
    });
  }
};

export const downloadFile = async (req: Request, res: Response) => {
  try {
    if (!req.auth) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
      });
    }

    const userId = req.auth.userId;
    const { id } = req.params;

    const result = await pool.query(
      `
      SELECT
        id,
        name,
        mime_type,
        storage_key,
        size_bytes
      FROM files
      WHERE id = $1
        AND owner_id = $2
        AND is_deleted = false
      `,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "File not found",
      });
    }

    const file = result.rows[0];

    const signedUrl = await createSignedDownloadUrl(
      file.storage_key
    );

    await pool.query(
      `
      INSERT INTO activities
        (actor_id, action, resource_type, resource_id, context)
      VALUES
        ($1, $2, $3, $4, $5)
      `,
      [
        userId,
        "download",
        "file",
        id,
        JSON.stringify({
          name: file.name,
        }),
      ]
    );

    return res.status(200).json({
      success: true,
      file: {
        id: file.id,
        name: file.name,
        mimeType: file.mime_type,
        sizeBytes: file.size_bytes,
      },
      downloadUrl: signedUrl,
    });
  } catch (error) {
    console.error("Download file error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to generate download URL",
    });
  }
};

export const getFiles = async (req: Request, res: Response) => {
  try {
    if (!req.auth) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
      });
    }

    const userId = req.auth.userId;
    const { folderId } = req.query;

    const result = await pool.query(
      `
      SELECT
        id,
        name,
        mime_type,
        size_bytes,
        folder_id,
        owner_id,
        storage_key,
        checksum,
        created_at,
        updated_at
      FROM files
      WHERE owner_id = $1
        AND folder_id IS NOT DISTINCT FROM $2
        AND is_deleted = false
      ORDER BY name ASC
      `,
      [
        userId,
        folderId || null,
      ]
    );

    return res.status(200).json({
      success: true,
      files: result.rows,
    });
  } catch (error) {
    console.error("Get files error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get files",
    });
  }
};

export const initUpload = async (req: Request, res: Response) => {
  try {
    if (!req.auth) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
      });
    }

    const userId = req.auth.userId;

    const {
      name,
      mimeType,
      sizeBytes,
      folderId = null,
    } = req.body;

    // Validate name
    if (!name || typeof name !== "string") {
      return res.status(400).json({
        success: false,
        message: "File name is required",
      });
    }

    const cleanName = name.trim();

    if (!cleanName || cleanName.length > 255) {
      return res.status(400).json({
        success: false,
        message: "File name must be between 1 and 255 characters",
      });
    }

    // Validate size
    if (
      typeof sizeBytes !== "number" ||
      sizeBytes <= 0 ||
      sizeBytes > 50 * 1024 * 1024
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid file size",
      });
    }

    // Validate folder
    if (folderId !== null) {
      const folderResult = await pool.query(
        `
        SELECT id
        FROM folders
        WHERE id = $1
          AND owner_id = $2
          AND is_deleted = false
        `,
        [folderId, userId]
      );

      if (folderResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Folder not found",
        });
      }
    }

    // Prevent duplicate filename
    const duplicateResult = await pool.query(
      `
      SELECT id
      FROM files
      WHERE owner_id = $1
        AND folder_id IS NOT DISTINCT FROM $2
        AND name = $3
        AND is_deleted = false
      `,
      [userId, folderId, cleanName]
    );

    if (duplicateResult.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "A file with this name already exists here",
      });
    }

    const fileId = randomUUID();

    const extension = path.extname(cleanName).toLowerCase();

    const baseName = path.basename(
      cleanName,
      extension
    );

    const safeBaseName = baseName
      .replace(/[^a-zA-Z0-9-_]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    const storageKey =
      `tenants/${userId}/folders/` +
      `${folderId ?? "root"}/files/` +
      `${fileId}-${safeBaseName}${extension}`;

    return res.status(200).json({
      success: true,
      upload: {
        fileId,
        storageKey,
        name: cleanName,
        mimeType,
        sizeBytes,
        folderId,
      },
    });
  } catch (error) {
    console.error("Init upload error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to initialize upload",
    });
  }
};

export const completeUpload = async (req: Request, res: Response) => {
  try {
    if (!req.auth) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
      });
    }

    const userId = req.auth.userId;

    const {
      fileId,
      name,
      mimeType,
      sizeBytes,
      folderId = null,
      storageKey,
      checksum,
    } = req.body;

    if (
      !fileId ||
      !name ||
      !mimeType ||
      !sizeBytes ||
      !storageKey
    ) {
      return res.status(400).json({
        success: false,
        message: "Missing required upload information",
      });
    }

    // Make sure folder belongs to user
    if (folderId !== null) {
      const folderResult = await pool.query(
        `
        SELECT id
        FROM folders
        WHERE id = $1
          AND owner_id = $2
          AND is_deleted = false
        `,
        [folderId, userId]
      );

      if (folderResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Folder not found",
        });
      }
    }

    // Prevent duplicate DB record
    const existingFile = await pool.query(
      `
      SELECT id
      FROM files
      WHERE id = $1
        AND owner_id = $2
      `,
      [fileId, userId]
    );

    if (existingFile.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "File upload already completed",
      });
    }

    const result = await pool.query(
      `
      INSERT INTO files (
        id,
        name,
        mime_type,
        size_bytes,
        folder_id,
        owner_id,
        storage_key,
        checksum,
        is_deleted,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        false,
        NOW(),
        NOW()
      )
      RETURNING *
      `,
      [
        fileId,
        name.trim(),
        mimeType,
        sizeBytes,
        folderId,
        userId,
        storageKey,
        checksum ?? null,
      ]
    );

    const file = result.rows[0];

    await pool.query(
      `
      INSERT INTO activities
        (actor_id, action, resource_type, resource_id, context)
      VALUES
        ($1, $2, $3, $4, $5)
      `,
      [
        userId,
        "upload",
        "file",
        fileId,
        JSON.stringify({
          name: file.name,
          folderId,
          sizeBytes,
        }),
      ]
    );

    return res.status(201).json({
      success: true,
      file,
    });
  } catch (error) {
    console.error("Complete upload error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to complete upload",
    });
  }
};

export const getUploadUrl = async (req: Request, res: Response) => {
  try {
    if (!req.auth) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
      });
    }

    const userId = req.auth.userId;

    const { storageKey } = req.body;

    if (!storageKey || typeof storageKey !== "string") {
      return res.status(400).json({
        success: false,
        message: "Storage key is required",
      });
    }

    // Security check:
    // User can only upload into their own storage namespace.
    const expectedPrefix = `tenants/${userId}/`;

    if (!storageKey.startsWith(expectedPrefix)) {
      return res.status(403).json({
        success: false,
        message: "Invalid storage key",
      });
    }

    const uploadData = await createSignedUploadUrl(storageKey);

    return res.status(200).json({
      success: true,
      upload: uploadData,
    });
  } catch (error) {
    console.error("Get upload URL error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to generate upload URL",
    });
  }
};