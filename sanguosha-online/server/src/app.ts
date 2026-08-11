import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express, { type Express, type RequestHandler } from "express";
import helmet from "helmet";
import type { Pool } from "pg";
import type { AppConfig } from "./config.js";
import { checkDatabase } from "./db.js";
import { errorHandler, HttpError, notFoundHandler } from "./errors.js";
import type { FarmService } from "./farm-service.js";
import type { LlmSettingsService } from "./llm-settings.js";
import type { LlmGovernanceService } from "./llm-governance.js";
import type { HomesteadDirectorJobStore } from "./homestead-director-jobs.js";
import { requireAuth, requirePasswordChangeComplete } from "./middleware/auth.js";
import { createAdminRouter } from "./routes/admin.js";
import { createAuthRouter } from "./routes/auth.js";
import { createFarmRouter } from "./routes/farm.js";
import { createHomesteadRouter } from "./routes/homestead.js";
import { createMineRouter } from "./routes/mine.js";
import { createRanchRouter } from "./routes/ranch.js";
import { createRestaurantRouter } from "./routes/restaurant.js";
import { createRoomsRouter } from "./routes/rooms.js";
import type { RoomService } from "./rooms.js";
import type { SecurityEvents } from "./security-events.js";
import type { UserStore } from "./users.js";
import type { TownWeatherSettingsService } from "./weather-settings.js";

export function createApplication(options: {
  config: AppConfig;
  pool: Pool;
  sessionMiddleware: RequestHandler;
  users: UserStore;
  rooms: RoomService;
  securityEvents: SecurityEvents;
  llmSettings?: LlmSettingsService;
  townWeatherSettings?: TownWeatherSettingsService;
  llmGovernance?: LlmGovernanceService;
  directorJobs?: HomesteadDirectorJobStore;
  farm?: FarmService;
}): Express {
  const {
    config,
    pool,
    sessionMiddleware,
    users,
    rooms,
    securityEvents,
    llmSettings,
    townWeatherSettings,
    llmGovernance,
    directorJobs,
    farm,
  } = options;
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy);
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        fontSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  }));
  if (config.appOrigin) app.use(cors({ origin: config.appOrigin, credentials: true }));
  app.use(express.json({ limit: "64kb" }));
  app.use("/api", (request, _response, next) => {
    const safeMethod = request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS";
    if (config.nodeEnv === "production" && !safeMethod && request.get("origin") !== config.appOrigin) {
      next(new HttpError(403, "ORIGIN_MISMATCH", "请求来源不受信任"));
      return;
    }
    next();
  });
  app.use(sessionMiddleware);

  app.get("/healthz", async (_request, response) => {
    const database = await checkDatabase(pool);
    response.set("Cache-Control", "no-store");
    response.status(database ? 200 : 503).json({
      status: database ? "ok" : "degraded",
      database: database ? "up" : "down",
    });
  });

  app.get("/version", (_request, response) => {
    response.set("Cache-Control", "no-store").json({
      service: "sanguosha-online",
      version: config.appVersion,
      ...(config.buildSha ? { buildSha: config.buildSha } : {}),
    });
  });

  app.use("/api/auth", createAuthRouter(users, securityEvents, rooms));
  app.use(
    "/api/admin",
    createAdminRouter(
      users,
      securityEvents,
      rooms,
      llmSettings,
      llmGovernance,
      directorJobs,
      townWeatherSettings,
    ),
  );
  if (farm) {
    app.use("/api/farm", requireAuth(users), requirePasswordChangeComplete, createFarmRouter(farm));
    app.use("/api/ranch", requireAuth(users), requirePasswordChangeComplete, createRanchRouter(farm));
    app.use("/api/mine", requireAuth(users), requirePasswordChangeComplete, createMineRouter(farm));
    app.use("/api/homestead", requireAuth(users), requirePasswordChangeComplete, createHomesteadRouter(farm));
    app.use("/api/restaurant", requireAuth(users), requirePasswordChangeComplete, createRestaurantRouter(farm));
  }
  app.use("/api/rooms", requireAuth(users), requirePasswordChangeComplete, createRoomsRouter(users, rooms));

  const webDist = fileURLToPath(new URL("../../web/dist/", import.meta.url));
  if (existsSync(webDist)) {
    app.use(express.static(webDist, { index: false, maxAge: config.nodeEnv === "production" ? "1h" : 0 }));
    app.use((request, response, next) => {
      if (request.method !== "GET" || request.path.startsWith("/api/") || request.path.startsWith("/socket.io/")) {
        next();
        return;
      }
      response.sendFile(fileURLToPath(new URL("../../web/dist/index.html", import.meta.url)));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
