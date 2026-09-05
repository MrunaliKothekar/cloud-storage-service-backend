import type { Request, Response } from "express";
import { pool } from "../config/database.js";

export const search = async (
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

    const {
      q = "",
      type,
      owner,
      starred,
    } = req.query;

    const searchText = String(q).trim();

    if (!searchText) {
      return res.status(400).json({
        success: false,
        message: "Search query is required",
      });
    }

    if (
      type &&
      type !== "file" &&
      type !== "folder"
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid type",
      });
    }

    // ======================================
    // FILES
    // ======================================
    let files: any[] = [];

    if (!type || type === "file") {
      const fileResult = await pool.query(
        `
        SELECT
          f.id,
          f.name,
          f.mime_type,
          f.size_bytes,
          f.folder_id,
          f.owner_id,
          f.created_at,
          f.updated_at,
          'file' AS resource_type
        FROM files f
        WHERE f.is_deleted = false
          AND (
            f.owner_id = $1
            OR EXISTS (
              SELECT 1
              FROM shares s
              WHERE s.resource_type = 'file'
                AND s.resource_id = f.id
                AND s.grantee_user_id = $1
            )
            OR EXISTS (
              SELECT 1
              FROM shares s
              JOIN folders sf
                ON sf.id = s.resource_id
              WHERE s.resource_type = 'folder'
                AND s.grantee_user_id = $1
                AND f.folder_id = sf.id
            )
          )
          AND f.name ILIKE '%' || $2 || '%'
        ORDER BY f.updated_at DESC
        `,
        [userId, searchText]
      );

      files = fileResult.rows;
    }

    // ======================================
    // FOLDERS
    // ======================================
    let folders: any[] = [];

    if (!type || type === "folder") {
      const folderResult = await pool.query(
        `
        SELECT
          f.id,
          f.name,
          f.parent_id,
          f.owner_id,
          f.created_at,
          f.updated_at,
          'folder' AS resource_type
        FROM folders f
        WHERE f.is_deleted = false
          AND (
            f.owner_id = $1
            OR EXISTS (
              SELECT 1
              FROM shares s
              WHERE s.resource_type = 'folder'
                AND s.resource_id = f.id
                AND s.grantee_user_id = $1
            )
          )
          AND f.name ILIKE '%' || $2 || '%'
        ORDER BY f.updated_at DESC
        `,
        [userId, searchText]
      );

      folders = folderResult.rows;
    }

    // ======================================
    // OWNER FILTER
    // ======================================
    const ownerFiltered = owner
      ? [
          ...files.filter(
            (file) => file.owner_id === owner
          ),
          ...folders.filter(
            (folder) => folder.owner_id === owner
          ),
        ]
      : [...files, ...folders];

    // ======================================
    // STARRED FILTER
    // ======================================
    let finalResults = ownerFiltered;

    if (starred === "true") {
      const starResult = await pool.query(
        `
        SELECT resource_type, resource_id
        FROM stars
        WHERE user_id = $1
        `,
        [userId]
      );

      const starSet = new Set(
        starResult.rows.map(
          (star) =>
            `${star.resource_type}:${star.resource_id}`
        )
      );

      finalResults = ownerFiltered.filter(
        (item) =>
          starSet.has(
            `${item.resource_type}:${item.id}`
          )
      );
    }

    return res.status(200).json({
      success: true,
      query: searchText,
      total: finalResults.length,
      results: finalResults,
    });
  } catch (error) {
    console.error("Search error:", error);

    return res.status(500).json({
      success: false,
      message: "Search failed",
    });
  }
};