import { Router } from "express";
import { z } from "zod";
import { asyncHandler, HttpError } from "../errors.js";
import {
  currentUser,
  requireAdmin,
  requireAuth,
  requirePasswordChangeComplete,
} from "../middleware/auth.js";
import type { SecurityEvents } from "../security-events.js";
import type { RoomService } from "../rooms.js";
import type { UserStore } from "../users.js";

const usernameSchema = z.string().trim().min(3).max(32)
  .regex(/^[A-Za-z0-9_.-]+$/, "用户名只能包含字母、数字、点、下划线和连字符");
const passwordSchema = z.string().min(8).max(128);

const createUserSchema = z.object({
  username: usernameSchema,
  displayName: z.string().trim().min(1).max(40),
  password: passwordSchema,
});

const statusSchema = z.object({ disabled: z.boolean() });
const passwordResetSchema = z.object({
  password: passwordSchema,
});
const userIdSchema = z.string().uuid();

export function createAdminRouter(users: UserStore, securityEvents: SecurityEvents, rooms: RoomService): Router {
  const router = Router();
  router.use(requireAuth(users), requirePasswordChangeComplete, requireAdmin);

  router.get("/users", asyncHandler(async (_request, response) => {
    response.json({ users: await users.list() });
  }));

  router.post("/users", asyncHandler(async (request, response) => {
    const actor = currentUser(response);
    const input = createUserSchema.parse(request.body);
    const user = await users.create({ ...input, role: "player", mustChangePassword: true });
    await users.recordAudit(actor.id, "user.create", user.id, { username: user.username });
    response.status(201).json({ user });
  }));

  router.patch("/users/:id/status", asyncHandler(async (request, response) => {
    const actor = currentUser(response);
    const targetId = userIdSchema.parse(request.params.id);
    const { disabled } = statusSchema.parse(request.body);
    if (targetId === actor.id && disabled) {
      throw new HttpError(400, "CANNOT_DISABLE_SELF", "不能停用当前管理员账号");
    }

    const user = await users.setDisabled(targetId, disabled);
    if (!user) throw new HttpError(404, "USER_NOT_FOUND", "账号不存在");
    await users.recordAudit(actor.id, disabled ? "user.disable" : "user.enable", user.id);
    if (disabled) {
      securityEvents.userDisabled(user.id);
      await rooms.waitForPersistence();
    }
    response.json({ user });
  }));

  router.post("/users/:id/reset-password", asyncHandler(async (request, response) => {
    const actor = currentUser(response);
    const targetId = userIdSchema.parse(request.params.id);
    const { password } = passwordResetSchema.parse(request.body);
    const user = await users.resetPassword(targetId, password);
    if (!user) throw new HttpError(404, "USER_NOT_FOUND", "账号不存在");
    await users.recordAudit(actor.id, "user.reset_password", user.id, { mustChangePassword: true });
    securityEvents.sessionRevoked(user.id);
    await rooms.waitForPersistence();
    response.json({ user });
  }));

  return router;
}
