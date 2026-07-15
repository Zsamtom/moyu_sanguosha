import bcrypt from "bcryptjs";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { asyncHandler, HttpError } from "../errors.js";
import { currentUser, requireAuth } from "../middleware/auth.js";
import { SESSION_COOKIE_NAME } from "../session.js";
import type { SecurityEvents } from "../security-events.js";
import type { UserStore } from "../users.js";

const loginSchema = z.object({
  username: z.string().trim().min(1).max(32),
  password: z.string().min(1).max(128),
});

const passwordSchema = z.string().min(8).max(128);
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});

function regenerateSession(request: Express.Request): Promise<void> {
  return new Promise((resolve, reject) => {
    request.session.regenerate((error) => error ? reject(error) : resolve());
  });
}

function saveSession(request: Express.Request): Promise<void> {
  return new Promise((resolve, reject) => {
    request.session.save((error) => error ? reject(error) : resolve());
  });
}

export function createAuthRouter(users: UserStore, securityEvents: SecurityEvents): Router {
  const router = Router();
  const loginLimiter = rateLimit({
    windowMs: 10 * 60 * 1_000,
    limit: 30,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: { code: "TOO_MANY_ATTEMPTS", message: "登录尝试过于频繁，请稍后再试" } },
  });

  router.post("/login", loginLimiter, asyncHandler(async (request, response) => {
    const input = loginSchema.parse(request.body);
    const user = await users.findByUsernameWithPassword(input.username);
    const passwordMatches = user
      ? await bcrypt.compare(input.password, user.passwordHash)
      : await bcrypt.compare(input.password, "$2b$12$4N0mBHZLxwzE3TuWJvVgS.Sb61qM8JrXqADKPKAOv4BXK4qSfH4Qa");

    if (!user || !passwordMatches) {
      throw new HttpError(401, "INVALID_CREDENTIALS", "用户名或密码错误");
    }
    if (user.disabled) {
      throw new HttpError(403, "ACCOUNT_DISABLED", "账号已被停用");
    }

    await regenerateSession(request);
    request.session.userId = user.id;
    request.session.authVersion = user.sessionVersion;
    await saveSession(request);
    const { passwordHash: _passwordHash, sessionVersion: _sessionVersion, ...publicUser } = user;
    response.json({ user: publicUser });
  }));

  router.post("/logout", asyncHandler(async (request, response) => {
    const userId = request.session.userId;
    await new Promise<void>((resolve, reject) => {
      request.session.destroy((error) => error ? reject(error) : resolve());
    });
    if (userId) securityEvents.sessionRevoked(userId);
    response.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
    response.status(204).end();
  }));

  router.get("/me", requireAuth(users), (_request, response) => {
    response.json({ user: currentUser(response) });
  });

  router.post("/change-password", requireAuth(users), asyncHandler(async (request, response) => {
    const actor = currentUser(response);
    const input = changePasswordSchema.parse(request.body);
    const user = await users.findByUsernameWithPassword(actor.username);
    const currentPasswordMatches = user?.id === actor.id
      && await bcrypt.compare(input.currentPassword, user.passwordHash);

    if (!currentPasswordMatches) {
      throw new HttpError(401, "INVALID_CURRENT_PASSWORD", "当前密码错误");
    }
    if (await bcrypt.compare(input.newPassword, user.passwordHash)) {
      throw new HttpError(400, "PASSWORD_UNCHANGED", "新密码不能与当前密码相同");
    }

    const updated = await users.changePassword(actor.id, input.newPassword);
    if (!updated) throw new HttpError(404, "USER_NOT_FOUND", "账号不存在");
    request.session.authVersion = updated.sessionVersion;
    await saveSession(request);
    await users.recordAudit(actor.id, "user.change_password", actor.id);
    response.json({ user: updated.user });
  }));

  return router;
}
