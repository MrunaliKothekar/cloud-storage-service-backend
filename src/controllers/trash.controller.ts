import type { Request, Response } from "express";
import { pool } from "../config/database.js";

// ==========================================
// GET TRASH
// ==========================================
export const getTrash = async (
  req: Request,
  res: Response
) => {
  try {
    if (!req.auth) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
      });
    }

    const userId = req.auth.userId;

    const files = await pool.query(
      `
      SELECT
        id,
        name,
        mime_type,
        size_bytes,
        folder_id,
        created_at,
        updated_at,
        'file' AS resource_type
      FROM files
      WHERE owner_id = $1
        AND is_deleted = true
      ORDER BY updated_at DESC
      `,
      [userId]
    );

    const folders = await pool.query(
      `
      SELECT
        id,
        name,
        parent_id,
        created_at,
        updated_at,
        'folder' AS resource_type
      FROM folders
      WHERE owner_id = $1
        AND is_deleted = true
      ORDER BY updated_at DESC
      `,
      [userId]
    );

    return res.status(200).json({
      success: true,
      files: files.rows,
      folders: folders.rows,
      total:
        files.rows.length +
        folders.rows.length,
    });
  } catch (error) {
    console.error("Get trash error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get trash",
    });
  }
};

// ==========================================
// RESTORE FILE
// ==========================================
export const restoreFile = async (
  req: Request,
  res: Response
) => {
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
      SELECT
        id,
        name,
        folder_id
      FROM files
      WHERE id = $1
        AND owner_id = $2
        AND is_deleted = true
      `,
      [id, userId]
    );

    if (fileResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Deleted file not found",
      });
    }

    const file = fileResult.rows[0];

    // --------------------------------------
    // If original folder was deleted,
    // restore file to root.
    // --------------------------------------
    let folderId = file.folder_id;

    if (folderId) {
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

      if (folderResult.rowCount === 0) {
        folderId = null;
      }
    }

    // --------------------------------------
    // Check duplicate filename
    // --------------------------------------
    const duplicate = await pool.query(
      `
      SELECT id
      FROM files
      WHERE owner_id = $1
        AND folder_id IS NOT DISTINCT FROM $2
        AND name = $3
        AND is_deleted = false
      `,
      [
        userId,
        folderId,
        file.name,
      ]
    );

    if ((duplicate.rowCount ?? 0) > 0) {
      return res.status(409).json({
        success: false,
        message:
          "A file with this name already exists in the destination",
      });
    }

    await pool.query(
      `
      UPDATE files
      SET
        is_deleted = false,
        folder_id = $2,
        updated_at = now()
      WHERE id = $1
        AND owner_id = $3
      `,
      [id, folderId, userId]
    );

    await pool.query(
      `
      INSERT INTO activities
      (
        actor_id,
        action,
        resource_type,
        resource_id,
        context
      )
      VALUES ($1, 'restore', 'file', $2, $3)
      `,
      [
        userId,
        id,
        JSON.stringify({
          name: file.name,
        }),
      ]
    );

    return res.status(200).json({
      success: true,
      message: "File restored successfully",
    });
  } catch (error) {
    console.error("Restore file error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to restore file",
    });
  }
};

// ==========================================
// RESTORE FOLDER
// ==========================================
export const restoreFolder = async (
  req: Request,
  res: Response
) => {
  try {
    if (!req.auth) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
      });
    }

    const userId = req.auth.userId;
    const { id } = req.params;

    const folderResult = await pool.query(
      `
      SELECT
        id,
        name,
        parent_id
      FROM folders
      WHERE id = $1
        AND owner_id = $2
        AND is_deleted = true
      `,
      [id, userId]
    );

    if (folderResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Deleted folder not found",
      });
    }

    const folder = folderResult.rows[0];

    // --------------------------------------
    // Destination parent
    // --------------------------------------
    let parentId = folder.parent_id;

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

      if (parentResult.rowCount === 0) {
        parentId = null;
      }
    }

    // --------------------------------------
    // Check duplicate folder name
    // --------------------------------------
    const duplicate = await pool.query(
      `
      SELECT id
      FROM folders
      WHERE owner_id = $1
        AND parent_id IS NOT DISTINCT FROM $2
        AND name = $3
        AND is_deleted = false
      `,
      [
        userId,
        parentId,
        folder.name,
      ]
    );

    if ((duplicate.rowCount ?? 0) > 0) {
      return res.status(409).json({
        success: false,
        message:
          "A folder with this name already exists in the destination",
      });
    }

    // --------------------------------------
    // Restore folder tree
    // --------------------------------------
    await pool.query(
      `
      WITH RECURSIVE descendants AS (
        SELECT id
        FROM folders
        WHERE id = $1
          AND owner_id = $2

        UNION ALL

        SELECT f.id
        FROM folders f
        INNER JOIN descendants d
          ON f.parent_id = d.id
        WHERE f.owner_id = $2
      )
      UPDATE folders
      SET
        is_deleted = false,
        updated_at = now()
      WHERE id IN (
        SELECT id FROM descendants
      )
      `,
      [id, userId]
    );

    // Restore files inside folder tree
    await pool.query(
      `
      WITH RECURSIVE descendants AS (
        SELECT id
        FROM folders
        WHERE id = $1
          AND owner_id = $2

        UNION ALL

        SELECT f.id
        FROM folders f
        INNER JOIN descendants d
          ON f.parent_id = d.id
        WHERE f.owner_id = $2
      )
      UPDATE files
      SET
        is_deleted = false,
        updated_at = now()
      WHERE owner_id = $2
        AND folder_id IN (
          SELECT id FROM descendants
        )
      `,
      [id, userId]
    );

    // Restore root folder and correct parent
    await pool.query(
      `
      UPDATE folders
      SET
        parent_id = $2,
        is_deleted = false,
        updated_at = now()
      WHERE id = $1
        AND owner_id = $3
      `,
      [id, parentId, userId]
    );

    await pool.query(
      `
      INSERT INTO activities
      (
        actor_id,
        action,
        resource_type,
        resource_id,
        context
      )
      VALUES ($1, 'restore', 'folder', $2, $3)
      `,
      [
        userId,
        id,
        JSON.stringify({
          name: folder.name,
        }),
      ]
    );

    return res.status(200).json({
      success: true,
      message: "Folder restored successfully",
    });
  } catch (error) {
    console.error("Restore folder error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to restore folder",
    });
  }
};