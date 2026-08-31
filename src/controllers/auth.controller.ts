import type { Request, Response } from "express";
import {
  loginSchema,
  registerSchema,
} from "../validators/auth.validator.js";
import {
  loginUser,
  registerUser,
} from "../services/auth.service.js";

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