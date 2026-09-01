import { Router } from "express";

import {
  register,
  login,
  logout,
  getCurrentUser,
  refresh,
  googleCallback,
} from "../controllers/auth.controller.js";
import passport from "passport";

import { requireAuth } from "../middlewares/auth.middleware.js";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/logout", logout);
router.post("/refresh", refresh);

router.get("/me", requireAuth, getCurrentUser);

router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
  })
);

router.get(
  "/google/callback",
  passport.authenticate("google", {
    session: false,
    failureRedirect: `${process.env.CORS_ORIGIN}/login`,
  }),
  googleCallback
);

export default router;