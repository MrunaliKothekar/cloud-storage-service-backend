import type { Request, Response } from "express";
import crypto from "crypto";
import { pool } from "../config/database.js";

export const createFolder = async (req: Request, res: Response) => {
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

    const { name, parentId = null } = req.body;

    // -------------------------
    // Validation
    // -------------------------

    if (typeof name !== "string" || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_FOLDER_NAME",
          message: "Folder name is required.",
        },
      });
    }

    const folderName = name.trim();

    if (folderName.length > 255) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_FOLDER_NAME",
          message: "Folder name cannot exceed 255 characters.",
        },
      });
    }

    // -------------------------
    // Validate parent folder
    // -------------------------

    if (parentId) {
      const parentResult = await pool.query(
        `
        SELECT id
        FROM folders
        WHERE id = $1
          AND owner_id = $2
          AND is_deleted = false
        `,
        [parentId, userId]
      );

      if (parentResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: {
            code: "PARENT_FOLDER_NOT_FOUND",
            message: "Parent folder not found.",
          },
        });
      }
    }

    // -------------------------
    // Check duplicate folder
    // -------------------------

    const duplicateResult = await pool.query(
      `
      SELECT id
      FROM folders
      WHERE owner_id = $1
        AND name = $2
        AND is_deleted = false
        AND (
          parent_id = $3
          OR (parent_id IS NULL AND $3 IS NULL)
        )
      `,
      [userId, folderName, parentId]
    );

    if (duplicateResult.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: {
          code: "FOLDER_ALREADY_EXISTS",
          message: "A folder with this name already exists here.",
        },
      });
    }

    // -------------------------
    // Create folder
    // -------------------------

    const folderId = crypto.randomUUID();

    const result = await pool.query(
      `
      INSERT INTO folders (
        id,
        name,
        owner_id,
        parent_id
      )
      VALUES ($1, $2, $3, $4)
      RETURNING
        id,
        name,
        owner_id,
        parent_id,
        is_deleted,
        created_at,
        updated_at
      `,
      [folderId, folderName, userId, parentId]
    );

    // -------------------------
    // Activity log
    // -------------------------

    await pool.query(
      `
      INSERT INTO activities (
        actor_id,
        action,
        resource_type,
        resource_id,
        context
      )
      VALUES ($1, 'rename', 'folder', $2, $3)
      `,
      [
        userId,
        folderId,
        JSON.stringify({
          action: "create",
          name: folderName,
        }),
      ]
    );

    return res.status(201).json({
      success: true,
      folder: result.rows[0],
    });
  } catch (error) {
    console.error("Create folder error:", error);

    return res.status(500).json({
      success: false,
      error: {
        code: "FOLDER_CREATION_FAILED",
        message: "Failed to create folder.",
      },
    });
  }
};


export const getFolder = async (req: Request, res: Response) => {
  try {
    if (!req.auth) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
      });
    }

    const userId = req.auth.userId;
    const { id } = req.params;

    // 1. Get current folder
    const folderResult = await pool.query(
      `
      SELECT
        id,
        name,
        owner_id,
        parent_id,
        is_deleted,
        created_at,
        updated_at
      FROM folders
      WHERE id = $1
        AND owner_id = $2
        AND is_deleted = false
      `,
      [id, userId]
    );

    if (folderResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Folder not found",
      });
    }

    const folder = folderResult.rows[0];

    // 2. Get child folders
    const foldersResult = await pool.query(
      `
      SELECT
        id,
        name,
        owner_id,
        parent_id,
        created_at,
        updated_at
      FROM folders
      WHERE parent_id = $1
        AND owner_id = $2
        AND is_deleted = false
      ORDER BY name ASC
      `,
      [id, userId]
    );

    // 3. Get files inside this folder
    const filesResult = await pool.query(
      `
      SELECT
        id,
        name,
        mime_type,
        size_bytes,
        folder_id,
        owner_id,
        checksum,
        created_at,
        updated_at
      FROM files
      WHERE folder_id = $1
        AND owner_id = $2
        AND is_deleted = false
      ORDER BY name ASC
      `,
      [id, userId]
    );

    // 4. Build breadcrumb path
    const pathResult = await pool.query(
  `
  WITH RECURSIVE folder_path AS (
    SELECT
      id,
      name,
      parent_id,
      0 AS depth
    FROM folders
    WHERE id = $1
      AND owner_id = $2
      AND is_deleted = false

    UNION ALL

    SELECT
      f.id,
      f.name,
      f.parent_id,
      fp.depth + 1
    FROM folders f
    INNER JOIN folder_path fp
      ON f.id = fp.parent_id
    WHERE f.owner_id = $2
      AND f.is_deleted = false
  )
  SELECT id, name
  FROM folder_path
  ORDER BY depth DESC;
  `,
  [id, userId]
);

    return res.status(200).json({
      success: true,
      folder,
      children: {
        folders: foldersResult.rows,
        files: filesResult.rows,
      },
      path: pathResult.rows,
    });
  } catch (error) {
    console.error("Get folder error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get folder",
    });
  }
};

export const updateFolder = async (req: Request, res: Response) => {
  try {
    if (!req.auth) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
      });
    }

    const userId = req.auth.userId;
    const { id } = req.params;
    const { name, parentId } = req.body;

    // 1. Get current folder
    const folderResult = await pool.query(
      `
      SELECT *
      FROM folders
      WHERE id = $1
        AND owner_id = $2
        AND is_deleted = false
      `,
      [id, userId]
    );

    if (folderResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Folder not found",
      });
    }

    const currentFolder = folderResult.rows[0];

    const newName =
      name !== undefined ? String(name).trim() : currentFolder.name;

    const newParentId =
      parentId !== undefined ? parentId : currentFolder.parent_id;

    // 2. Validate name
    if (!newName || newName.length > 255) {
      return res.status(400).json({
        success: false,
        message: "Folder name must be between 1 and 255 characters",
      });
    }

    // 3. If moving folder
    if (newParentId !== null) {
      // Parent must exist and belong to same user
      const parentResult = await pool.query(
        `
        SELECT id
        FROM folders
        WHERE id = $1
          AND owner_id = $2
          AND is_deleted = false
        `,
        [newParentId, userId]
      );

      if (parentResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Parent folder not found",
        });
      }

      // Cannot be its own parent
      if (newParentId === id) {
        return res.status(400).json({
          success: false,
          message: "A folder cannot be its own parent",
        });
      }

      // 4. Prevent moving folder inside its own descendant
      const descendantResult = await pool.query(
        `
        WITH RECURSIVE descendants AS (
          SELECT id
          FROM folders
          WHERE parent_id = $1
            AND owner_id = $2
            AND is_deleted = false

          UNION ALL

          SELECT f.id
          FROM folders f
          INNER JOIN descendants d
            ON f.parent_id = d.id
          WHERE f.owner_id = $2
            AND f.is_deleted = false
        )
        SELECT id
        FROM descendants
        WHERE id = $3
        LIMIT 1;
        `,
        [id, userId, newParentId]
      );

      if (descendantResult.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Cannot move a folder inside one of its descendants",
        });
      }
    }

    // 5. Prevent duplicate folder names
    const duplicateResult = await pool.query(
      `
      SELECT id
      FROM folders
      WHERE owner_id = $1
        AND parent_id IS NOT DISTINCT FROM $2
        AND name = $3
        AND id != $4
        AND is_deleted = false
      `,
      [userId, newParentId, newName, id]
    );

    if (duplicateResult.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "A folder with this name already exists here",
      });
    }

    // 6. Update folder
    const updatedResult = await pool.query(
      `
      UPDATE folders
      SET
        name = $1,
        parent_id = $2,
        updated_at = NOW()
      WHERE id = $3
        AND owner_id = $4
        AND is_deleted = false
      RETURNING *
      `,
      [newName, newParentId, id, userId]
    );

    const updatedFolder = updatedResult.rows[0];

    // 7. Activity
    await pool.query(
      `
      INSERT INTO activities
        (actor_id, action, resource_type, resource_id, context)
      VALUES
        ($1, $2, $3, $4, $5)
      `,
      [
        userId,
        newParentId !== currentFolder.parent_id ? "move" : "rename",
        "folder",
        id,
        JSON.stringify({
          oldName: currentFolder.name,
          newName,
          oldParentId: currentFolder.parent_id,
          newParentId,
        }),
      ]
    );

    return res.status(200).json({
      success: true,
      folder: updatedFolder,
    });
  } catch (error) {
    console.error("Update folder error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update folder",
    });
  }
};

export const deleteFolder = async (req: Request, res: Response) => {
  try {
    if (!req.auth) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
      });
    }

    const userId = req.auth.userId;
    const { id } = req.params;

    // Check folder exists
    const folderResult = await pool.query(
      `
      SELECT id, name, parent_id
      FROM folders
      WHERE id = $1
        AND owner_id = $2
        AND is_deleted = false
      `,
      [id, userId]
    );

    if (folderResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Folder not found",
      });
    }

    const folder = folderResult.rows[0];

    // Soft delete folder
    await pool.query(
      `
      UPDATE folders
      SET
        is_deleted = true,
        updated_at = NOW()
      WHERE id = $1
        AND owner_id = $2
        AND is_deleted = false
      `,
      [id, userId]
    );

    // Soft delete all descendant folders
    await pool.query(
      `
      WITH RECURSIVE descendants AS (
        SELECT id
        FROM folders
        WHERE parent_id = $1
          AND owner_id = $2
          AND is_deleted = false

        UNION ALL

        SELECT f.id
        FROM folders f
        INNER JOIN descendants d
          ON f.parent_id = d.id
        WHERE f.owner_id = $2
          AND f.is_deleted = false
      )
      UPDATE folders
      SET
        is_deleted = true,
        updated_at = NOW()
      WHERE id IN (
        SELECT id FROM descendants
      );
      `,
      [id, userId]
    );

    // Soft delete files inside the folder hierarchy
    await pool.query(
      `
      WITH RECURSIVE folder_tree AS (
        SELECT id
        FROM folders
        WHERE id = $1
          AND owner_id = $2

        UNION ALL

        SELECT f.id
        FROM folders f
        INNER JOIN folder_tree ft
          ON f.parent_id = ft.id
        WHERE f.owner_id = $2
      )
      UPDATE files
      SET
        is_deleted = true,
        updated_at = NOW()
      WHERE folder_id IN (
        SELECT id FROM folder_tree
      )
      AND owner_id = $2
      AND is_deleted = false;
      `,
      [id, userId]
    );

    // Activity
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
        "folder",
        id,
        JSON.stringify({
          name: folder.name,
          parentId: folder.parent_id,
        }),
      ]
    );

    return res.status(200).json({
      success: true,
      message: "Folder deleted successfully",
    });
  } catch (error) {
    console.error("Delete folder error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete folder",
    });
  }
};