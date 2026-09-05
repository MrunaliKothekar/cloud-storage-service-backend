import type { Request, Response } from "express";
import { pool } from "../config/database.js";

export const getActivities = async (
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

    const limit = Math.min(
      Math.max(
        Number(req.query.limit) || 50,
        1
      ),
      100
    );

    const result = await pool.query(
      `
      SELECT
        a.id,
        a.action,
        a.resource_type,
        a.resource_id,
        a.context,
        a.created_at,
        u.id AS actor_id,
        u.name AS actor_name,
        u.email AS actor_email
      FROM activities a
      LEFT JOIN users u
        ON u.id = a.actor_id
      WHERE a.actor_id = $1
      ORDER BY a.created_at DESC
      LIMIT $2
      `,
      [
        req.auth.userId,
        limit,
      ]
    );

    return res.status(200).json({
      success: true,
      activities: result.rows,
    });
  } catch (error) {
    console.error("Get activities error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get activities",
    });
  }
};