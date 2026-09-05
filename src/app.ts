import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env.js";
import authRoutes from "./routes/auth.routes.js";
import passport from "./config/passport.js";
import fileRoutes from "./routes/file.routes.js";
import folderRoutes from "./routes/folder.routes.js";
import shareRoutes from "./routes/share.routes.js";
import linkRoutes from "./routes/link.routes.js";
import searchRoutes from "./routes/search.routes.js";
import starRoutes from "./routes/star.routes.js";
import trashRoutes from "./routes/trash.routes.js";
import activityRoutes from "./routes/activity.routes.js";
import versionRoutes from "./routes/version.routes.js";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

const app = express();

app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
  })
);
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api", apiLimiter);
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api/auth", authLimiter);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(
  helmet()
);

app.use(passport.initialize());

app.get("/api/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Cloud Storage API is running",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/files", fileRoutes);
app.use("/api/folders", folderRoutes);
app.use("/api/shares", shareRoutes);
app.use("/api/links", linkRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/stars", starRoutes);
app.use("/api/trash", trashRoutes);
app.use("/api/activities", activityRoutes);
app.use("/api/versions", versionRoutes);

export default app;