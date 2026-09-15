import type { Request, Response } from "express";
import { pool } from "../config/database.js";

export const createShare = async (req: Request, res: Response) => {
  try {
    if (!req.auth) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
      });
    }

    const userId = req.auth.userId;

    const {
      resourceType,
      resourceId,
      sharedWithEmail,
      role = "viewer",
    } = req.body;

    // Validate required fields
    if (!resourceType || !resourceId || !sharedWithEmail) {
      return res.status(400).json({
        success: false,
        message:
          "resourceType, resourceId and sharedWithEmail are required",
      });
    }

    // Validate resource type
    if (!["file", "folder"].includes(resourceType)) {
      return res.status(400).json({
        success: false,
        message: "resourceType must be file or folder",
      });
    }

    // Validate role
    if (!["viewer", "editor"].includes(role)) {
      return res.status(400).json({
        success: false,
        message: "role must be viewer or editor",
      });
    }

    // Find recipient
    const userResult = await pool.query(
      `
      SELECT id, email, name
      FROM users
      WHERE LOWER(email) = LOWER($1)
      `,
      [sharedWithEmail.trim()]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User with this email does not exist",
      });
    }

    const grantee = userResult.rows[0];

    // Cannot share with yourself
    if (grantee.id === userId) {
      return res.status(400).json({
        success: false,
        message: "You cannot share a resource with yourself",
      });
    }

    // Verify that resource belongs to current user
    let resourceResult;

    if (resourceType === "file") {
      resourceResult = await pool.query(
        `
        SELECT id, name
        FROM files
        WHERE id = $1
          AND owner_id = $2
          AND is_deleted = false
        `,
        [resourceId, userId]
      );
    } else {
      resourceResult = await pool.query(
        `
        SELECT id, name
        FROM folders
        WHERE id = $1
          AND owner_id = $2
          AND is_deleted = false
        `,
        [resourceId, userId]
      );
    }

    if (resourceResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Resource not found",
      });
    }

    // Check existing share
    const existingShare = await pool.query(
      `
      SELECT id
      FROM shares
      WHERE resource_type = $1
        AND resource_id = $2
        AND grantee_user_id = $3
      `,
      [resourceType, resourceId, grantee.id]
    );

    if (existingShare.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Resource is already shared with this user",
      });
    }

    // Create share
    const result = await pool.query(
      `
      INSERT INTO shares (
        resource_type,
        resource_id,
        grantee_user_id,
        role,
        created_by
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [
        resourceType,
        resourceId,
        grantee.id,
        role,
        userId,
      ]
    );

    // Activity
    await pool.query(
      `
      INSERT INTO activities
        (actor_id, action, resource_type, resource_id, context)
      VALUES
        ($1, 'share', $2, $3, $4)
      `,
      [
        userId,
        resourceType,
        resourceId,
        JSON.stringify({
          sharedWith: grantee.email,
          role,
        }),
      ]
    );

    return res.status(201).json({
      success: true,
      share: result.rows[0],
    });
  } catch (error) {
    console.error("Create share error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create share",
    });
  }
};
export const getShares = async (req: Request, res: Response) => {
  try {
    if (!req.auth) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
      });
    }

    const userId = req.auth.userId;

    const { resourceType, resourceId } = req.query;

    if (!resourceType || !resourceId) {
      return res.status(400).json({
        success: false,
        message: "resourceType and resourceId are required",
      });
    }

    // Verify ownership
    let resourceResult;

    if (resourceType === "file") {
      resourceResult = await pool.query(
        `
        SELECT id
        FROM files
        WHERE id = $1
          AND owner_id = $2
          AND is_deleted = false
        `,
        [resourceId, userId]
      );
    } else if (resourceType === "folder") {
      resourceResult = await pool.query(
        `
        SELECT id
        FROM folders
        WHERE id = $1
          AND owner_id = $2
          AND is_deleted = false
        `,
        [resourceId, userId]
      );
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid resource type",
      });
    }

    if (resourceResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Resource not found",
      });
    }

    const result = await pool.query(
      `
      SELECT
        s.id,
        s.resource_type,
        s.resource_id,
        s.role,
        s.created_at,
        u.id AS user_id,
        u.name AS user_name,
        u.email AS user_email
      FROM shares s
      INNER JOIN users u
        ON u.id = s.grantee_user_id
      WHERE s.resource_type = $1
        AND s.resource_id = $2
      ORDER BY s.created_at DESC
      `,
      [resourceType, resourceId]
    );

    return res.status(200).json({
      success: true,
      shares: result.rows,
    });
  } catch (error) {
    console.error("Get shares error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get shares",
    });
  }
};
export const deleteShare = async (req: Request, res: Response) => {
  try {
    if (!req.auth) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
      });
    }

    const userId = req.auth.userId;
    const { id } = req.params;

    const shareResult = await pool.query(
      `
      SELECT
        id,
        resource_type,
        resource_id
      FROM shares
      WHERE id = $1
        AND created_by = $2
      `,
      [id, userId]
    );

    if (shareResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Share not found",
      });
    }

    const share = shareResult.rows[0];

    await pool.query(
      `
      DELETE FROM shares
      WHERE id = $1
        AND created_by = $2
      `,
      [id, userId]
    );

    return res.status(200).json({
      success: true,
      message: "Share revoked successfully",
    });
  } catch (error) {
    console.error("Delete share error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to revoke share",
    });
  }
};

export const getSharedWithMe = async (req: Request, res: Response) => {
  try {
    if (!req.auth) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    const userId = req.auth.userId;

    const result = await pool.query(
      `
      SELECT
        s.id AS share_id,
        s.resource_type,
        s.resource_id,
        s.role,
        s.created_at AS shared_at,
        u.name AS owner_name,
        u.email AS owner_email,
        f.name,
        f.mime_type,
        f.size_bytes,
        f.folder_id,
        f.updated_at
      FROM shares s
      INNER JOIN files f
        ON s.resource_type = 'file'
       AND s.resource_id = f.id
      INNER JOIN users u ON u.id = f.owner_id
      WHERE s.grantee_user_id = $1
        AND f.is_deleted = false

      UNION ALL

      SELECT
        s.id AS share_id,
        s.resource_type,
        s.resource_id,
        s.role,
        s.created_at AS shared_at,
        u.name AS owner_name,
        u.email AS owner_email,
        d.name,
        NULL AS mime_type,
        NULL AS size_bytes,
        d.parent_id AS folder_id,
        d.updated_at
      FROM shares s
      INNER JOIN folders d
        ON s.resource_type = 'folder'
       AND s.resource_id = d.id
      INNER JOIN users u ON u.id = d.owner_id
      WHERE s.grantee_user_id = $1
        AND d.is_deleted = false

      ORDER BY shared_at DESC
      `,
      [userId]
    );

    return res.status(200).json({
      success: true,
      shares: result.rows,
    });
  } catch (error) {
    console.error("Get shared with me error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get shared resources",
    });
  }
};

export const getSharedByMe = async (req: Request, res: Response) => {
  try {
    if (!req.auth) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    const userId = req.auth.userId;

    const result = await pool.query(
      `
      SELECT
        s.id AS share_id,
        s.resource_type,
        s.resource_id,
        s.role,
        s.created_at AS shared_at,
        u.name AS shared_with_name,
        u.email AS shared_with_email,
        f.name,
        f.mime_type,
        f.size_bytes,
        f.folder_id,
        f.updated_at
      FROM shares s
      INNER JOIN files f
        ON s.resource_type = 'file'
       AND s.resource_id = f.id
      INNER JOIN users u ON u.id = s.grantee_user_id
      WHERE s.created_by = $1
        AND f.is_deleted = false

      UNION ALL

      SELECT
        s.id AS share_id,
        s.resource_type,
        s.resource_id,
        s.role,
        s.created_at AS shared_at,
        u.name AS shared_with_name,
        u.email AS shared_with_email,
        d.name,
        NULL AS mime_type,
        NULL AS size_bytes,
        d.parent_id AS folder_id,
        d.updated_at
      FROM shares s
      INNER JOIN folders d
        ON s.resource_type = 'folder'
       AND s.resource_id = d.id
      INNER JOIN users u ON u.id = s.grantee_user_id
      WHERE s.created_by = $1
        AND d.is_deleted = false

      ORDER BY shared_at DESC
      `,
      [userId]
    );

    return res.status(200).json({
      success: true,
      shares: result.rows,
    });
  } catch (error) {
    console.error("Get shared by me error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get resources shared by you",
    });
  }
};

