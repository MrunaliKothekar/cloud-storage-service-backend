import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export interface AccessTokenPayload {
  userId: string;
}

export interface RefreshTokenPayload {
  userId: string;
  tokenVersion: number;
}

export const generateAccessToken = (userId: string) => {
  return jwt.sign(
    {
      userId,
    },
    env.JWT_SECRET,
    {
      expiresIn: "15m",
    }
  );
};

export const generateRefreshToken = (
  userId: string,
  tokenVersion: number
) => {
  return jwt.sign(
    {
      userId,
      tokenVersion,
    },
    env.REFRESH_SECRET,
    {
      expiresIn: "7d",
    }
  );
};

export const verifyAccessToken = (token: string) => {
  return jwt.verify(
    token,
    env.JWT_SECRET
  ) as AccessTokenPayload;
};

export const verifyRefreshToken = (token: string) => {
  return jwt.verify(
    token,
    env.REFRESH_SECRET
  ) as RefreshTokenPayload;
};