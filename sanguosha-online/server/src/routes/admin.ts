import { Router } from "express";
import { z } from "zod";
import { asyncHandler, HttpError } from "../errors.js";
import {
  currentUser,
  requireAdmin,
  requireAuth,
  requirePasswordChangeComplete,
} from "../middleware/auth.js";
import type { LlmSettingsService } from "../llm-settings.js";
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
const displayNameSchema = z.object({ displayName: z.string().trim().min(1).max(40) });
const passwordResetSchema = z.object({
  password: passwordSchema,
});
const userIdSchema = z.string().uuid();
const deepSeekModelSchema = z.string().trim().min(1).max(128)
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/,
    "DeepSeek 模型 ID 格式无效",
  );
const llmSettingsSchema = z.object({
  enabled: z.boolean(),
  model: deepSeekModelSchema,
  apiKey: z.string().trim().min(8).max(512).optional(),
  clearApiKey: z.boolean().optional(),
  thinkingEnabled: z.boolean(),
  timeoutMs: z.number().int().min(500).max(30_000),
  maximumOutputTokens: z.number().int().min(8).max(64),
}).strict();
const llmConnectionTestSchema = z.object({
  apiKey: z.string().trim().min(8).max(512).optional(),
  model: deepSeekModelSchema.optional(),
}).strict();

export function createAdminRouter(
  users: UserStore,
  securityEvents: SecurityEvents,
  rooms: RoomService,
  llmSettings?: LlmSettingsService,
): Router {
  const router = Router();
  router.use(requireAuth(users), requirePasswordChangeComplete, requireAdmin);

  if (llmSettings) {
    router.get("/llm-settings", (_request, response) => {
      response.set("Cache-Control", "no-store").json({
        settings: llmSettings.getPublicSettings(),
      });
    });

    router.put("/llm-settings", asyncHandler(async (request, response) => {
      const actor = currentUser(response);
      const input = llmSettingsSchema.parse(request.body);
      const existing = llmSettings.getPublicSettings();
      const willHaveApiKey = input.clearApiKey
        ? false
        : Boolean(input.apiKey || existing.apiKeyConfigured);
      if (input.enabled && !willHaveApiKey) {
        throw new HttpError(
          400,
          "LLM_API_KEY_REQUIRED",
          "启用大模型机器人前必须配置 DeepSeek API Key",
        );
      }
      const settings = await llmSettings.update(input, actor.id);
      await users.recordAudit(actor.id, "settings.llm.update", actor.id, {
        provider: settings.provider,
        enabled: settings.enabled,
        model: settings.model,
        thinkingEnabled: settings.thinkingEnabled,
        maximumOutputTokens: settings.maximumOutputTokens,
        apiKeyChanged: Boolean(input.apiKey || input.clearApiKey),
      });
      response.set("Cache-Control", "no-store").json({ settings });
    }));

    router.post("/llm-settings/test", asyncHandler(async (request, response) => {
      const input = llmConnectionTestSchema.parse(request.body ?? {});
      const existing = llmSettings.getPublicSettings();
      if (!input.apiKey && !existing.apiKeyConfigured) {
        throw new HttpError(
          400,
          "LLM_API_KEY_REQUIRED",
          "请先输入或保存 DeepSeek API Key",
        );
      }
      try {
        const result = await llmSettings.testConnection(
          input.apiKey,
          input.model,
        );
        response.set("Cache-Control", "no-store").json({ result });
      } catch (error) {
        throw new HttpError(
          502,
          "LLM_CONNECTION_FAILED",
          error instanceof Error && error.name === "AbortError"
            ? "连接 DeepSeek 超时，请稍后重试"
            : "DeepSeek 连接失败，请检查 API Key 和网络",
        );
      }
    }));
  }

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

  router.patch("/users/:id/display-name", asyncHandler(async (request, response) => {
    const actor = currentUser(response);
    const targetId = userIdSchema.parse(request.params.id);
    const { displayName } = displayNameSchema.parse(request.body);
    const user = await users.setDisplayName(targetId, displayName);
    if (!user) throw new HttpError(404, "USER_NOT_FOUND", "账号不存在");
    rooms.setDisplayName(user.id, user.displayName);
    await rooms.waitForPersistence();
    await users.recordAudit(actor.id, "user.rename", user.id, { displayName: user.displayName });
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

  router.delete("/users/:id", asyncHandler(async (request, response) => {
    const actor = currentUser(response);
    const targetId = userIdSchema.parse(request.params.id);
    if (targetId === actor.id) {
      throw new HttpError(400, "CANNOT_DELETE_SELF", "不能删除当前管理员账号");
    }
    const target = await users.findById(targetId);
    if (!target) throw new HttpError(404, "USER_NOT_FOUND", "账号不存在");
    await users.recordAudit(actor.id, "user.delete", target.id, { username: target.username });
    const room = rooms.getForUser(target.id);
    if (room) rooms.leave(room.id, target.id);
    securityEvents.sessionRevoked(target.id);
    await rooms.waitForPersistence();
    await users.delete(target.id);
    response.status(204).end();
  }));

  return router;
}
