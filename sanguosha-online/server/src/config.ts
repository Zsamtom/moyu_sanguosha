import { z } from "zod";

const optionalBuildSha = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().regex(/^[0-9a-f]{7,64}$/i).optional(),
);

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3_000),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(16),
  INITIAL_ADMIN_USERNAME: z.string().min(3).max(32).default("admin"),
  INITIAL_ADMIN_PASSWORD: z.string().min(8).max(128),
  INITIAL_ADMIN_DISPLAY_NAME: z.string().min(1).max(40).default("管理员"),
  APP_ORIGIN: z.string().url().optional(),
  TRUST_PROXY: z.coerce.number().int().min(0).default(1),
  APP_VERSION: z.string().trim().regex(/^[0-9a-z][0-9a-z._+-]{0,63}$/i).default("dev"),
  BUILD_SHA: optionalBuildSha,
});

export interface AppConfig {
  nodeEnv: "development" | "test" | "production";
  port: number;
  databaseUrl: string;
  sessionSecret: string;
  initialAdmin: {
    username: string;
    password: string;
    displayName: string;
  };
  appOrigin?: string;
  trustProxy: number;
  secureCookies: boolean;
  appVersion: string;
  buildSha?: string;
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = environmentSchema.parse(environment);
  const appOrigin = parsed.APP_ORIGIN ? new URL(parsed.APP_ORIGIN).origin : undefined;
  if (parsed.NODE_ENV === "production" && parsed.SESSION_SECRET.length < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 characters in production");
  }
  if (parsed.NODE_ENV === "production") {
    if (!appOrigin) {
      throw new Error("APP_ORIGIN is required in production");
    }
    if (new URL(appOrigin).protocol !== "https:") {
      throw new Error("APP_ORIGIN must use https in production");
    }
  }

  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    databaseUrl: parsed.DATABASE_URL,
    sessionSecret: parsed.SESSION_SECRET,
    initialAdmin: {
      username: parsed.INITIAL_ADMIN_USERNAME,
      password: parsed.INITIAL_ADMIN_PASSWORD,
      displayName: parsed.INITIAL_ADMIN_DISPLAY_NAME,
    },
    appOrigin,
    trustProxy: parsed.TRUST_PROXY,
    secureCookies: parsed.NODE_ENV === "production",
    appVersion: parsed.APP_VERSION,
    buildSha: parsed.BUILD_SHA,
  };
}
