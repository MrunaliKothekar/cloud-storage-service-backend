import type { Request, Response } from "express";

import {
  loginSchema,
  registerSchema,
} from "../validators/auth.validator.js";

import {
  loginUser,
  registerUser,
  refreshUserSession,
} from "../services/auth.service.js";

import { pool } from "../config/database.js";

import {
  generateAccessToken,
  generateRefreshToken,
} from "../utils/jwt.js";

import { env } from "../config/env.js";

const setAuthCookies = (
  res: Response,
  accessToken: string,
  refreshToken: string
) => {
  res.cookie("access_token", accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 15 * 60 * 1000,
  });

  res.cookie("refresh_token", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

export const register = async (
  req: Request,
  res: Response
) => {
  try {
    const data = registerSchema.parse(req.body);

    const result = await registerUser(data);

    setAuthCookies(
      res,
      result.accessToken,
      result.refreshToken
    );

    return res.status(201).json({
      success: true,
      user: result.user,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "EMAIL_ALREADY_EXISTS"
    ) {
      return res.status(409).json({
        success: false,
        error: {
          code: "EMAIL_ALREADY_EXISTS",
          message: "An account with this email already exists.",
        },
      });
    }

    return res.status(400).json({
      success: false,
      error: {
        code: "INVALID_REQUEST",
        message: "Invalid registration data.",
      },
    });
  }
};

export const login = async (
  req: Request,
  res: Response
) => {
  try {
    const data = loginSchema.parse(req.body);

    const result = await loginUser(data);

    setAuthCookies(
      res,
      result.accessToken,
      result.refreshToken
    );

    return res.status(200).json({
      success: true,
      user: result.user,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "INVALID_CREDENTIALS"
    ) {
      return res.status(401).json({
        success: false,
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Invalid email or password.",
        },
      });
    }

    return res.status(400).json({
      success: false,
      error: {
        code: "INVALID_REQUEST",
        message: "Invalid login data.",
      },
    });
  }
};

export const logout = async (
  _req: Request,
  res: Response
) => {
  res.clearCookie("access_token");
  res.clearCookie("refresh_token");

  return res.status(200).json({
    success: true,
    message: "Logged out successfully.",
  });
};

export const getCurrentUser = async (
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

    const result = await pool.query(
      `
      SELECT
        id,
        email,
        name,
        image_url,
        created_at
      FROM users
      WHERE id = $1
      `,
      [req.auth.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: "USER_NOT_FOUND",
          message: "User not found.",
        },
      });
    }

    return res.status(200).json({
      success: true,
      user: result.rows[0],
    });
  } catch (error) {
    console.error("Get current user error:", error);

    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong.",
      },
    });
  }
};

export const refresh = async (
  req: Request,
  res: Response
) => {
  try {
    const refreshToken = req.cookies?.refresh_token;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Refresh token required.",
        },
      });
    }

    const result = await refreshUserSession(refreshToken);

    setAuthCookies(
      res,
      result.accessToken,
      result.refreshToken
    );

    return res.status(200).json({
      success: true,
      user: result.user,
    });
  } catch {
    return res.status(401).json({
      success: false,
      error: {
        code: "INVALID_REFRESH_TOKEN",
        message: "Invalid or expired refresh token.",
      },
    });
  }
};

export const googleCallback = async (
  req: Request,
  res: Response
) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code: "GOOGLE_AUTH_FAILED",
          message: "Google authentication failed.",
        },
      });
    }

    const user = req.user as {
      id: string;
      email: string;
      name: string | null;
      image_url: string | null;
      token_version: number;
      created_at: string;
    };

    const accessToken = generateAccessToken(user.id);

    const refreshToken = generateRefreshToken(
      user.id,
      user.token_version
    );

    setAuthCookies(
      res,
      accessToken,
      refreshToken
    );

    return res.redirect(
      `${env.CORS_ORIGIN}/`
    );
  } catch (error) {
    console.error("Google callback error:", error);

    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Google authentication failed.",
      },
    });
  }
};