import type { Request, Response } from "express";
import { pool } from "../config/database.js";
import { getResourcePermission } from "../services/permission.service.js";

// ==========================================
// STAR
// ==========================================
export const addStar = async (
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
      resourceType,
      resourceId,
    } = req.body;

    if (
      !["file", "folder"].includes(resourceType) ||
      !resourceId
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid resource",
      });
    }

    const permission =
      await getResourcePermission(
        userId,
        resourceType,
        resourceId
      );

    if (!permission) {
      return res.status(403).json({
        success: false,
        message: "You do not have access to this resource",
      });
    }

    await pool.query(
      `INSERT INTO stars
       (
         user_id,
         resource_type,
         resource_id
       )
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [
        userId,
        resourceType,
        resourceId,
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Resource starred",
    });
  } catch (error) {
    console.error("Add star error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to star resource",
    });
  }
};

// ==========================================
// GET MY STARS
// ==========================================
export const getStars = async (
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

    const result = await pool.query(
      `
      SELECT
        s.resource_type,
        s.resource_id,
        s.user_id
      FROM stars s
      WHERE s.user_id = $1
      ORDER BY s.resource_type, s.resource_id
      `,
      [req.auth.userId]
    );

    return res.status(200).json({
      success: true,
      stars: result.rows,
    });
  } catch (error) {
    console.error("Get stars error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get starred resources",
    });
  }
};

// ==========================================
// REMOVE STAR
// ==========================================
export const removeStar = async (
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

    const {
      resourceType,
      resourceId,
    } = req.body;

    if (
      !["file", "folder"].includes(resourceType) ||
      !resourceId
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid resource",
      });
    }

    const result = await pool.query(
      `DELETE FROM stars
       WHERE user_id = $1
         AND resource_type = $2
         AND resource_id = $3`,
      [
        req.auth.userId,
        resourceType,
        resourceId,
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Star not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Star removed",
    });
  } catch (error) {
    console.error("Remove star error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to remove star",
    });
  }
};