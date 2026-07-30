import { z } from "zod";

const optionalBuildSha = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().regex(/^[0-9a-f]{7,64}$/i).optional(),
);

const optionalTrimmedString = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().min(1).optional(),
);

const optionalUrl = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().url().optional(),
);

const optionalQWeatherHost = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().url().refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname.endsWith(".qweatherapi.com") &&
      url.port === "" &&
      (url.pathname === "" || url.pathname === "/") &&
      url.search === "" &&
      url.hash === "" &&
      url.username === "" &&
      url.password === "";
  }, "QWEATHER_API_HOST must be a dedicated HTTPS *.qweatherapi.com origin")
    .optional(),
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
  DOUDIZHU_LLM_ENDPOINT: optionalUrl,
  DOUDIZHU_LLM_API_KEY: optionalTrimmedString,
  DOUDIZHU_LLM_MODEL: optionalTrimmedString,
  DOUDIZHU_LLM_TIMEOUT_MS: z.coerce.number().int().min(500).max(30_000).default(10_000),
  DOUDIZHU_LLM_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(8).max(4_000).default(4_000),
  QWEATHER_API_HOST: optionalQWeatherHost,
  QWEATHER_API_KEY: optionalTrimmedString,
  QWEATHER_TIMEOUT_MS: z.coerce.number().int().min(500).max(10_000).default(3_000),
}).superRefine((environment, context) => {
  const providerValues = [
    environment.DOUDIZHU_LLM_ENDPOINT,
    environment.DOUDIZHU_LLM_API_KEY,
    environment.DOUDIZHU_LLM_MODEL,
  ];
  if (providerValues.some(Boolean) && !providerValues.every(Boolean)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "DOUDIZHU_LLM_ENDPOINT, DOUDIZHU_LLM_API_KEY and DOUDIZHU_LLM_MODEL must be configured together",
    });
  }
  const qWeatherValues = [
    environment.QWEATHER_API_HOST,
    environment.QWEATHER_API_KEY,
  ];
  if (qWeatherValues.some(Boolean) && !qWeatherValues.every(Boolean)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "QWEATHER_API_HOST and QWEATHER_API_KEY must be configured together",
    });
  }
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
  doudizhuLlm?: {
    endpoint: string;
    apiKey: string;
    model: string;
    timeoutMs: number;
    maximumOutputTokens: number;
  };
  townWeather?: {
    apiHost: string;
    apiKey: string;
    timeoutMs: number;
  };
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
    ...(parsed.DOUDIZHU_LLM_ENDPOINT && parsed.DOUDIZHU_LLM_API_KEY && parsed.DOUDIZHU_LLM_MODEL
      ? {
          doudizhuLlm: {
            endpoint: parsed.DOUDIZHU_LLM_ENDPOINT,
            apiKey: parsed.DOUDIZHU_LLM_API_KEY,
            model: parsed.DOUDIZHU_LLM_MODEL,
            timeoutMs: parsed.DOUDIZHU_LLM_TIMEOUT_MS,
            maximumOutputTokens: parsed.DOUDIZHU_LLM_MAX_OUTPUT_TOKENS,
          },
        }
      : {}),
    ...(parsed.QWEATHER_API_HOST && parsed.QWEATHER_API_KEY
      ? {
          townWeather: {
            apiHost: parsed.QWEATHER_API_HOST,
            apiKey: parsed.QWEATHER_API_KEY,
            timeoutMs: parsed.QWEATHER_TIMEOUT_MS,
          },
        }
      : {}),
  };
}
