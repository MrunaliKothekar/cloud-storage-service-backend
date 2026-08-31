import bcrypt from "bcrypt";
import { pool } from "../config/database.js";
import {
  generateAccessToken,
  generateRefreshToken,
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