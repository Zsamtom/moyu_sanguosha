import connectPgSimple from "connect-pg-simple";
import session, { type SessionOptions } from "express-session";
import type { Pool } from "pg";
import type { AppConfig } from "./config.js";

export const SESSION_COOKIE_NAME = "sanguosha.sid";

export function createSessionMiddleware(
  config: AppConfig,
  pool: Pool,
): ReturnType<typeof session> {
  const PostgresStore = connectPgSimple(session);
  return session({
    name: SESSION_COOKIE_NAME,
    secret: config.sessionSecret,
    store: new PostgresStore({
      pool,
      tableName: "user_sessions",
      createTableIfMissing: true,
      pruneSessionInterval: 15 * 60,
    }),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: config.secureCookies,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1_000,
    },
  } satisfies SessionOptions);
}
