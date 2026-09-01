import bcrypt from "bcrypt";
import { pool } from "../config/database.js";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "../utils/jwt.js";
import type {
  LoginInput,
  RegisterInput,
} from "../validators/auth.validator.js";

export const registerUser = async ({
  email,
  password,
  name,
}: RegisterInput) => {
  const existingUser = await pool.query(
    "SELECT id FROM users WHERE email = $1",
    [email]
  );

  if (existingUser.rows.length > 0) {
    throw new Error("EMAIL_ALREADY_EXISTS");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const result = await pool.query(
    `
    INSERT INTO users (
      email,
      name,
      password_hash
    )
    VALUES ($1, $2, $3)
    RETURNING id, email, name, image_url, created_at
    `,
    [email, name, passwordHash]
  );

  const user = result.rows[0];

  const accessToken = generateAccessToken(user.id);
  const refreshToken = generateRefreshToken(user.id, 0);

  return {
    user,
    accessToken,
    refreshToken,
  };
};

export const loginUser = async ({
  email,
  password,
}: LoginInput) => {
  const result = await pool.query(
    `
    SELECT
      id,
      email,
      name,
      image_url,
      password_hash,
      token_version,
      created_at
    FROM users
    WHERE email = $1
    `,
    [email]
  );

  if (result.rows.length === 0) {
    throw new Error("INVALID_CREDENTIALS");
  }

  const user = result.rows[0];

  const passwordMatches = await bcrypt.compare(
    password,
    user.password_hash
  );

  if (!passwordMatches) {
    throw new Error("INVALID_CREDENTIALS");
  }

  const accessToken = generateAccessToken(user.id);

  const refreshToken = generateRefreshToken(
    user.id,
    user.token_version
  );

  delete user.password_hash;
  delete user.token_version;

  return {
    user,
    accessToken,
    refreshToken,
  };
};
export const refreshUserSession = async (refreshToken: string) => {
  const payload = verifyRefreshToken(refreshToken);

  const result = await pool.query(
    `
    SELECT
      id,
      email,
      name,
      image_url,
      token_version,
      created_at
    FROM users
    WHERE id = $1
    `,
    [payload.userId]
  );

  if (result.rows.length === 0) {
    throw new Error("INVALID_REFRESH_TOKEN");
  }

  const user = result.rows[0];

  if (user.token_version !== payload.tokenVersion) {
    throw new Error("INVALID_REFRESH_TOKEN");
  }

  const newTokenVersion = user.token_version + 1;

  await pool.query(
    `
    UPDATE users
    SET token_version = $1
    WHERE id = $2
    `,
    [newTokenVersion, user.id]
  );

  const accessToken = generateAccessToken(user.id);

  const newRefreshToken = generateRefreshToken(
    user.id,
    newTokenVersion
  );

  delete user.token_version;

  return {
    user,
    accessToken,
    refreshToken: newRefreshToken,
  };
};