import bcrypt from "bcryptjs";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { asyncHandler, HttpError } from "../errors.js";
import { currentUser, requireAuth } from "../middleware/auth.js";
import { SESSION_COOKIE_NAME } from "../session.js";
import type { SecurityEvents } from "../security-events.js";
import type { RoomService } from "../rooms.js";
import type { UserStore } from "../users.js";

const REGISTRATION_INVITATION_CODE = "moyu2026";

const usernameSchema = z.string().trim().min(3).max(32)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/, "用户名只能包含字母、数字、点、下划线和连字符")
  .transform((username) => username.toLowerCase());
const displayNameSchema = z.string().trim().min(1).max(40);
const passwordSchema = z.string().min(8).max(128)
  .refine((password) => password.trim().length > 0, "密码不能只包含空白字符");

const loginSchema = z.object({
  username: z.string().trim().min(1).max(32),
  password: z.string().min(1).max(128),
}).strict();

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
}).strict();
const registrationSchema = z.object({
  invitationCode: z.string().trim().min(1).max(64),
  username: usernameSchema,
  displayName: displayNameSchema.optional(),
  password: passwordSchema,
}).strict();
const profileSchema = z.object({ displayName: displayNameSchema }).strict();

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

export function createAuthRouter(users: UserStore, securityEvents: SecurityEvents, rooms: RoomService): Router {
  const router = Router();
  const loginLimiter = rateLimit({
    windowMs: 10 * 60 * 1_000,
    limit: 30,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: { code: "TOO_MANY_ATTEMPTS", message: "登录尝试过于频繁，请稍后再试" } },
  });
  const registrationLimiter = rateLimit({
    windowMs: 60 * 60 * 1_000,
    limit: 8,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: { code: "TOO_MANY_REGISTRATIONS", message: "注册尝试过于频繁，请稍后再试" } },
  });

  router.post("/register", registrationLimiter, asyncHandler(async (request, response) => {
    const input = registrationSchema.parse(request.body);
    if (input.invitationCode !== REGISTRATION_INVITATION_CODE) {
      throw new HttpError(400, "INVALID_INVITATION_CODE", "邀请码无效");
    }

    const user = await users.create({
      username: input.username,
      displayName: input.displayName ?? input.username,
      password: input.password,
      role: "player",
      mustChangePassword: false,
    });
    const sessionUser = await users.findSessionUser(user.id);
    if (!sessionUser) throw new HttpError(500, "USER_NOT_FOUND", "账号创建后未找到");
    await regenerateSession(request);
    request.session.userId = user.id;
    request.session.authVersion = sessionUser.sessionVersion;
    await saveSession(request);
    await users.recordAudit(user.id, "user.register", user.id, { username: user.username });
    response.status(201).json({ user });
  }));

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
    const sessionId = request.sessionID;
    await new Promise<void>((resolve, reject) => {
      request.session.destroy((error) => error ? reject(error) : resolve());
    });
    if (userId) {
      securityEvents.sessionEnded(userId, sessionId);
      await rooms.waitForPersistence();
    }
    response.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
    response.status(204).end();
  }));

  router.get("/me", requireAuth(users), (_request, response) => {
    response.json({ user: currentUser(response) });
  });

  router.patch("/profile", requireAuth(users), asyncHandler(async (request, response) => {
    const actor = currentUser(response);
    const { displayName } = profileSchema.parse(request.body);
    const user = await users.setDisplayName(actor.id, displayName);
    if (!user) throw new HttpError(404, "USER_NOT_FOUND", "账号不存在");
    rooms.setDisplayName(user.id, user.displayName);
    await rooms.waitForPersistence();
    await users.recordAudit(actor.id, "user.change_display_name", user.id, { displayName: user.displayName });
    response.json({ user });
  }));

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
