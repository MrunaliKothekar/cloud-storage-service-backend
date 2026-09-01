import type { Request, Response } from "express";
import crypto from "crypto";

import { pool } from "../config/database.js";
import { uploadToStorage } from "../services/storage.service.js";

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