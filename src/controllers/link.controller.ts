import type { Request, Response } from "express";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { pool } from "../config/database.js";
import { createSignedDownloadUrl } from "../services/storage.service.js";

const generateToken = () => {
  return crypto.randomBytes(32).toString("hex");
};

// ==========================================
// CREATE PUBLIC LINK
// ==========================================
export const createLink = async (req: Request, res: Response) => {
  try {
    if (!req.auth) {
      return res.status(401).json({
        success: false,
        message: "Not authorized",
      });
    }

    const userId = req.auth.userId;

    const {
      resourceType,
      resourceId,
      password,
      expiresAt,
    } = req.body;

    if (!["file", "folder"].includes(resourceType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid resource type",
      });
    }

    if (!resourceId) {
      return res.status(400).json({
        success: false,
        message: "Resource ID is required",
      });
    }

    // Validate expiry
    if (expiresAt) {
      const expiry = new Date(expiresAt);

      if (isNaN(expiry.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid expiration date",
        });
      }

      if (expiry <= new Date()) {
        return res.status(400).json({
          success: false,
          message: "Expiration date must be in the future",
        });
      }
    }

    const table = resourceType === "file" ? "files" : "folders";

    // Verify ownership
    const resource = await pool.query(
      `SELECT id
       FROM ${table}
       WHERE id = $1
       AND owner_id = $2
       AND is_deleted = false`,
      [resourceId, userId]
    );

    if (resource.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Resource not found",
      });
    }

    // Password is optional
    let passwordHash: string | null = null;

    if (password) {
      if (typeof password !== "string" || password.length < 4) {
        return res.status(400).json({
          success: false,
          message: "Password must contain at least 4 characters",
        });
      }

      passwordHash = await bcrypt.hash(password, 10);
    }

    const token = generateToken();

    const result = await pool.query(
      `INSERT INTO link_shares
       (
         resource_type,
         resource_id,
         token,
         role,
         password_hash,
         expires_at,
         created_by
       )
       VALUES ($1, $2, $3, 'viewer', $4, $5, $6)
       RETURNING
         id,
         resource_type,
         resource_id,
         token,
         role,
         expires_at,
         created_at`,
      [
        resourceType,
        resourceId,
        token,
        passwordHash,
        expiresAt || null,
        userId,
      ]
    );

    await pool.query(
      `INSERT INTO activities
       (
         actor_id,
         action,
         resource_type,
         resource_id,
         context
       )
       VALUES ($1, 'share', $2, $3, $4)`,
      [
        userId,
        resourceType,
        resourceId,
        JSON.stringify({
          type: "public_link_created",
        }),
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Public link created successfully",
      link: result.rows[0],
    });
  } catch (error) {
    console.error("Create link error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create public link",
    });
  }
};

// ==========================================
// GET MY PUBLIC LINKS
// ==========================================
export const getLinks = async (req: Request, res: Response) => {
  try {
    if (!req.auth) {
      return res.status(401).json({
        success: false,
        message: "Not authorized",
      });
    }

    const result = await pool.query(
      `SELECT
         id,
         resource_type,
         resource_id,
         token,
         role,
         expires_at,
         created_at
       FROM link_shares
       WHERE created_by = $1
       ORDER BY created_at DESC`,
      [req.auth.userId]
    );

    return res.json({
      success: true,
      links: result.rows,
    });
  } catch (error) {
    console.error("Get links error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch public links",
    });
  }
};

// ==========================================
// DELETE / REVOKE PUBLIC LINK
// ==========================================
export const deleteLink = async (req: Request, res: Response) => {
  try {
    if (!req.auth) {
      return res.status(401).json({
        success: false,
        message: "Not authorized",
      });
    }

    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM link_shares
       WHERE id = $1
       AND created_by = $2
       RETURNING id`,
      [id, req.auth.userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Public link not found",
      });
    }

    return res.json({
      success: true,
      message: "Public link revoked successfully",
    });
  } catch (error) {
    console.error("Delete link error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to revoke public link",
    });
  }
};

// ==========================================
// ACCESS PUBLIC LINK
// ==========================================
export const accessPublicLink = async (
  req: Request,
  res: Response
) => {
  try {
    const { token } = req.params;

    const result = await pool.query(
      `SELECT *
       FROM link_shares
       WHERE token = $1`,
      [token]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Invalid public link",
      });
    }

    const link = result.rows[0];

    // --------------------------------------
    // Check expiration
    // --------------------------------------
    if (
      link.expires_at &&
      new Date(link.expires_at) <= new Date()
    ) {
      return res.status(410).json({
        success: false,
        message: "This public link has expired",
      });
    }

    // --------------------------------------
    // Password protected?
    // --------------------------------------
    if (link.password_hash) {
      const { password } = req.query;

      if (!password) {
        return res.status(401).json({
          success: false,
          message: "Password required",
          passwordRequired: true,
        });
      }

      const validPassword = await bcrypt.compare(
        String(password),
        link.password_hash
      );

      if (!validPassword) {
        return res.status(401).json({
          success: false,
          message: "Incorrect password",
          passwordRequired: true,
        });
      }
    }

    // --------------------------------------
    // Get resource
    // --------------------------------------
    const table =
      link.resource_type === "file"
        ? "files"
        : "folders";

    const resource = await pool.query(
      `SELECT *
       FROM ${table}
       WHERE id = $1
       AND is_deleted = false`,
      [link.resource_id]
    );

    if (resource.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Resource no longer exists",
      });
    }

    const item = resource.rows[0];

    // --------------------------------------
    // PUBLIC FOLDER
    // --------------------------------------
    if (link.resource_type === "folder") {
      const children = await pool.query(
        `SELECT
           id,
           name,
           'folder' AS resource_type
         FROM folders
         WHERE parent_id = $1
         AND is_deleted = false

         UNION ALL

         SELECT
           id,
           name,
           'file' AS resource_type
         FROM files
         WHERE folder_id = $1
         AND is_deleted = false

         ORDER BY name`,
        [link.resource_id]
      );

      return res.json({
        success: true,
        type: "folder",
        folder: {
          id: item.id,
          name: item.name,
        },
        children: children.rows,
      });
    }

    // --------------------------------------
    // PUBLIC FILE
    // --------------------------------------
    const signedUrl = await createSignedDownloadUrl(
      item.storage_key
    );

    return res.json({
      success: true,
      type: "file",
      file: {
        id: item.id,
        name: item.name,
        mimeType: item.mime_type,
        sizeBytes: item.size_bytes,
      },
      downloadUrl: signedUrl,
    });
  } catch (error) {
    console.error("Public link access error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to access public link",
    });
  }
};