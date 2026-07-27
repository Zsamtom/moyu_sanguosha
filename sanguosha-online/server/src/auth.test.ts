import bcrypt from "bcryptjs";
import session from "express-session";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApplication } from "./app.js";
import { BotDecisionRegistry } from "./bots/decision-registry.js";
import type { AppConfig } from "./config.js";
import { HttpError } from "./errors.js";
import {
  LlmSettingsService,
  MemoryLlmSettingsStore,
} from "./llm-settings.js";
import { RoomService } from "./rooms.js";
import { SecurityEvents } from "./security-events.js";
import type {
  CreateUserInput,
  PublicUser,
  UserStore,
  UserWithPassword,
  SessionUser,
} from "./users.js";

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const PLAYER_ID = "22222222-2222-4222-8222-222222222222";

class MemoryUserStore implements UserStore {
  private readonly records = new Map<string, UserWithPassword>();
  private counter = 3;
  readonly audits: Array<{ actorId: string; action: string; targetUserId: string; details: object }> = [];

  constructor() {
    this.put(ADMIN_ID, "admin", "管理员", "admin-password", "admin", false);
    this.put(PLAYER_ID, "player", "玩家", "player-password", "player", false);
  }

  async findById(id: string): Promise<PublicUser | undefined> {
    const value = this.records.get(id);
    return value ? this.public(value) : undefined;
  }

  async findSessionUser(id: string): Promise<SessionUser | undefined> {
    const value = this.records.get(id);
    return value ? { user: this.public(value), sessionVersion: value.sessionVersion } : undefined;
  }

  async findByUsernameWithPassword(username: string): Promise<UserWithPassword | undefined> {
    return [...this.records.values()].find(
      (candidate) => candidate.username.toLowerCase() === username.toLowerCase(),
    );
  }

  async list(): Promise<PublicUser[]> {
    return [...this.records.values()].map((value) => this.public(value));
  }

  async create(input: CreateUserInput): Promise<PublicUser> {
    if ([...this.records.values()].some((value) => value.username.toLowerCase() === input.username.toLowerCase())) {
      throw new HttpError(409, "USERNAME_EXISTS", "用户名已存在");
    }
    const digit = String(this.counter++).padStart(12, "0");
    const id = `33333333-3333-4333-8333-${digit}`;
    this.put(
      id,
      input.username,
      input.displayName,
      input.password,
      input.role ?? "player",
      input.mustChangePassword ?? true,
    );
    return this.public(this.records.get(id)!);
  }

  async setDisabled(id: string, disabled: boolean): Promise<PublicUser | undefined> {
    const value = this.records.get(id);
    if (!value) return undefined;
    value.disabled = disabled;
    value.sessionVersion += 1;
    value.updatedAt = new Date().toISOString();
    return this.public(value);
  }

  async setDisplayName(id: string, displayName: string): Promise<PublicUser | undefined> {
    const value = this.records.get(id);
    if (!value) return undefined;
    value.displayName = displayName;
    value.updatedAt = new Date().toISOString();
    return this.public(value);
  }

  async delete(id: string): Promise<PublicUser | undefined> {
    const value = this.records.get(id);
    if (!value) return undefined;
    this.records.delete(id);
    return this.public(value);
  }

  async resetPassword(
    id: string,
    password: string,
    mustChangePassword = true,
  ): Promise<PublicUser | undefined> {
    const value = this.records.get(id);
    if (!value) return undefined;
    value.passwordHash = bcrypt.hashSync(password, 4);
    value.mustChangePassword = mustChangePassword;
    value.sessionVersion += 1;
    value.updatedAt = new Date().toISOString();
    return this.public(value);
  }

  async changePassword(id: string, password: string): Promise<SessionUser | undefined> {
    const value = this.records.get(id);
    if (!value) return undefined;
    value.passwordHash = bcrypt.hashSync(password, 4);
    value.mustChangePassword = false;
    value.sessionVersion += 1;
    value.updatedAt = new Date().toISOString();
    return { user: this.public(value), sessionVersion: value.sessionVersion };
  }

  async recordAudit(
    actorId: string,
    action: string,
    targetUserId: string,
    details: object = {},
  ): Promise<void> {
    this.audits.push({ actorId, action, targetUserId, details });
  }

  private put(
    id: string,
    username: string,
    displayName: string,
    password: string,
    role: "admin" | "player",
    mustChangePassword: boolean,
  ): void {
    const now = new Date().toISOString();
    this.records.set(id, {
      id,
      username,
      displayName,
      passwordHash: bcrypt.hashSync(password, 4),
      sessionVersion: 0,
      role,
      disabled: false,
      mustChangePassword,
      createdAt: now,
      updatedAt: now,
    });
  }

  private public(value: UserWithPassword): PublicUser {
    const { passwordHash: _passwordHash, sessionVersion: _sessionVersion, ...publicUser } = value;
    return { ...publicUser };
  }
}

const config: AppConfig = {
  nodeEnv: "test",
  port: 3_000,
  databaseUrl: "postgresql://unused",
  sessionSecret: "test-session-secret-at-least-32-characters",
  initialAdmin: { username: "admin", password: "admin-password", displayName: "管理员" },
  trustProxy: 0,
  secureCookies: false,
  appVersion: "test-release",
  buildSha: "0123456789abcdef",
};

describe("account allocation and authorization", () => {
  let users: MemoryUserStore;
  let app: ReturnType<typeof createApplication>;
  let botDecisions: BotDecisionRegistry;

  beforeEach(async () => {
    users = new MemoryUserStore();
    botDecisions = new BotDecisionRegistry();
    const llmSettings = new LlmSettingsService(
      new MemoryLlmSettingsStore(),
      botDecisions,
      config.sessionSecret,
      undefined,
      vi.fn(async () => new Response(JSON.stringify({
        object: "list",
        data: [
          { id: "deepseek-v4-flash", object: "model", owned_by: "deepseek" },
          { id: "deepseek-v4-pro", object: "model", owned_by: "deepseek" },
        ],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })),
    );
    await llmSettings.initialize();
    app = createApplication({
      config,
      pool: { query: async () => ({ rows: [{ "?column?": 1 }] }) } as never,
      sessionMiddleware: session({ secret: config.sessionSecret, resave: false, saveUninitialized: false }),
      users,
      rooms: new RoomService(),
      securityEvents: new SecurityEvents(),
      llmSettings,
    });
  });

  it("exposes uncached health and non-secret build metadata without authentication", async () => {
    const health = await request(app).get("/healthz").expect(200);
    expect(health.headers["cache-control"]).toBe("no-store");
    expect(health.body).toEqual({ status: "ok", database: "up" });

    const version = await request(app).get("/version").expect(200);
    expect(version.headers["cache-control"]).toBe("no-store");
    expect(version.body).toEqual({
      service: "sanguosha-online",
      version: "test-release",
      buildSha: "0123456789abcdef",
    });
  });

  it("does not expose registration and rejects anonymous admin requests", async () => {
    await request(app).post("/api/auth/register").send({}).expect(404);
    const response = await request(app).get("/api/admin/users").expect(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("allows only admins to allocate, disable and reset player accounts", async () => {
    const playerAgent = request.agent(app);
    await playerAgent.post("/api/auth/login")
      .send({ username: "player", password: "player-password" })
      .expect(200);
    await playerAgent.get("/api/admin/users").expect(403);
    await playerAgent.get("/api/admin/llm-settings").expect(403);

    const adminAgent = request.agent(app);
    await adminAgent.post("/api/auth/login")
      .send({ username: "admin", password: "admin-password" })
      .expect(200);

    const created = await adminAgent.post("/api/admin/users")
      .send({ username: "new_player", displayName: "新玩家", password: "initial-password" })
      .expect(201);
    expect(created.body.user).toMatchObject({
      username: "new_player",
      role: "player",
      disabled: false,
      mustChangePassword: true,
    });
    expect(created.body.user).not.toHaveProperty("passwordHash");

    const reset = await adminAgent.post(`/api/admin/users/${PLAYER_ID}/reset-password`)
      .send({ password: "replacement-password" })
      .expect(200);
    expect(reset.body.user.mustChangePassword).toBe(true);
    expect(reset.body.user).not.toHaveProperty("passwordHash");
    expect(reset.body.user).not.toHaveProperty("sessionVersion");
    await request(app).post("/api/auth/login")
      .send({ username: "player", password: "player-password" })
      .expect(401);
    await playerAgent.get("/api/auth/me").expect(401);
    await playerAgent.post("/api/auth/login")
      .send({ username: "player", password: "replacement-password" })
      .expect(200);

    await adminAgent.patch(`/api/admin/users/${PLAYER_ID}/status`)
      .send({ disabled: true })
      .expect(200);
    const disabledResponse = await playerAgent.get("/api/auth/me").expect(403);
    expect(disabledResponse.body.error.code).toBe("ACCOUNT_DISABLED");
    expect(JSON.stringify(users.audits)).not.toContain("replacement-password");
    expect(JSON.stringify(users.audits)).not.toContain("passwordHash");
  });

  it("lets admins hot-update DeepSeek settings without ever returning the API key", async () => {
    const adminAgent = request.agent(app);
    await adminAgent.post("/api/auth/login")
      .send({ username: "admin", password: "admin-password" })
      .expect(200);

    const defaults = await adminAgent.get("/api/admin/llm-settings").expect(200);
    expect(defaults.headers["cache-control"]).toBe("no-store");
    expect(defaults.body.settings).toMatchObject({
      provider: "deepseek",
      enabled: false,
      endpoint: "https://api.deepseek.com/chat/completions",
      model: "deepseek-v4-flash",
      apiKeyConfigured: false,
      thinkingEnabled: false,
      timeoutMs: 10_000,
      maximumOutputTokens: 4_000,
    });
    expect(botDecisions.supports("doudizhu")).toBe(false);
    expect(botDecisions.supports("sanguosha")).toBe(false);

    await adminAgent.put("/api/admin/llm-settings")
      .send({
        enabled: false,
        model: "invalid model id",
        thinkingEnabled: false,
        timeoutMs: 4_000,
        maximumOutputTokens: 16,
      })
      .expect(400);

    await adminAgent.put("/api/admin/llm-settings")
      .send({
        enabled: true,
        model: "deepseek-v4-pro",
        thinkingEnabled: false,
        timeoutMs: 4_000,
        maximumOutputTokens: 16,
      })
      .expect(400);

    const saved = await adminAgent.put("/api/admin/llm-settings")
      .send({
        enabled: true,
        model: "deepseek-v4-pro",
        apiKey: "sk-private-deepseek-key",
        thinkingEnabled: false,
        timeoutMs: 10_000,
        maximumOutputTokens: 4_000,
      })
      .expect(200);
    expect(saved.body.settings).toMatchObject({
      enabled: true,
      model: "deepseek-v4-pro",
      apiKeyConfigured: true,
      thinkingEnabled: false,
      timeoutMs: 10_000,
      maximumOutputTokens: 4_000,
    });
    expect(saved.text).not.toContain("sk-private-deepseek-key");
    expect(botDecisions.supports("doudizhu")).toBe(true);
    expect(botDecisions.supports("sanguosha")).toBe(true);

    const reloaded = await adminAgent.get("/api/admin/llm-settings").expect(200);
    expect(reloaded.text).not.toContain("sk-private-deepseek-key");
    expect(reloaded.body.settings.apiKeyConfigured).toBe(true);
    const connection = await adminAgent.post("/api/admin/llm-settings/test")
      .send({ model: "deepseek-v4-pro" })
      .expect(200);
    expect(connection.headers["cache-control"]).toBe("no-store");
    expect(connection.body.result).toMatchObject({
      ok: true,
      provider: "deepseek",
      model: "deepseek-v4-pro",
    });
    expect(connection.text).not.toContain("sk-private-deepseek-key");
    expect(users.audits.at(-1)).toMatchObject({
      action: "settings.llm.update",
      details: {
        provider: "deepseek",
        enabled: true,
        apiKeyChanged: true,
      },
    });

    const cleared = await adminAgent.put("/api/admin/llm-settings")
      .send({
        enabled: false,
        model: "deepseek-v4-pro",
        clearApiKey: true,
        thinkingEnabled: false,
        timeoutMs: 10_000,
        maximumOutputTokens: 4_000,
      })
      .expect(200);
    expect(cleared.body.settings.apiKeyConfigured).toBe(false);
    expect(botDecisions.supports("doudizhu")).toBe(false);
    expect(botDecisions.supports("sanguosha")).toBe(false);
  });

  it("lets an admin rename and delete another account but not itself", async () => {
    const adminAgent = request.agent(app);
    await adminAgent.post("/api/auth/login")
      .send({ username: "admin", password: "admin-password" })
      .expect(200);

    const renamed = await adminAgent.patch(`/api/admin/users/${PLAYER_ID}/display-name`)
      .send({ displayName: "新昵称" })
      .expect(200);
    expect(renamed.body.user.displayName).toBe("新昵称");

    await adminAgent.delete(`/api/admin/users/${ADMIN_ID}`).expect(400);
    await adminAgent.delete(`/api/admin/users/${PLAYER_ID}`).expect(204);
    expect(await users.findById(PLAYER_ID)).toBeUndefined();
    expect(users.audits.map((audit) => audit.action)).toEqual(expect.arrayContaining(["user.rename", "user.delete"]));
  });

  it("requires allocated users to replace their temporary password before entering the lobby", async () => {
    const adminAgent = request.agent(app);
    await adminAgent.post("/api/auth/login")
      .send({ username: "admin", password: "admin-password" })
      .expect(200);
    await adminAgent.post("/api/admin/users")
      .send({ username: "forced_player", displayName: "待改密玩家", password: "temporary-password" })
      .expect(201);

    const playerAgent = request.agent(app);
    const login = await playerAgent.post("/api/auth/login")
      .send({ username: "forced_player", password: "temporary-password" })
      .expect(200);
    expect(login.body.user.mustChangePassword).toBe(true);
    expect(login.body.user).not.toHaveProperty("passwordHash");

    const blockedLobby = await playerAgent.get("/api/rooms").expect(403);
    expect(blockedLobby.body.error.code).toBe("PASSWORD_CHANGE_REQUIRED");

    const wrongCurrentPassword = await playerAgent.post("/api/auth/change-password")
      .send({ currentPassword: "wrong-password", newPassword: "new-player-password" })
      .expect(401);
    expect(wrongCurrentPassword.body.error.code).toBe("INVALID_CURRENT_PASSWORD");

    const unchangedPassword = await playerAgent.post("/api/auth/change-password")
      .send({ currentPassword: "temporary-password", newPassword: "temporary-password" })
      .expect(400);
    expect(unchangedPassword.body.error.code).toBe("PASSWORD_UNCHANGED");

    const changed = await playerAgent.post("/api/auth/change-password")
      .send({ currentPassword: "temporary-password", newPassword: "new-player-password" })
      .expect(200);
    expect(changed.body.user.mustChangePassword).toBe(false);
    expect(changed.body.user).not.toHaveProperty("passwordHash");
    expect(changed.body.user).not.toHaveProperty("sessionVersion");
    await playerAgent.get("/api/auth/me").expect(200);
    await playerAgent.get("/api/rooms").expect(200);

    await request(app).post("/api/auth/login")
      .send({ username: "forced_player", password: "temporary-password" })
      .expect(401);
    await request(app).post("/api/auth/login")
      .send({ username: "forced_player", password: "new-player-password" })
      .expect(200);
    expect(JSON.stringify(users.audits)).not.toContain("new-player-password");
  });

  it("ignores attempts to bypass the required temporary-password change", async () => {
    const adminAgent = request.agent(app);
    await adminAgent.post("/api/auth/login")
      .send({ username: "admin", password: "admin-password" })
      .expect(200);
    const created = await adminAgent.post("/api/admin/users")
      .send({
        username: "trusted_player",
        displayName: "可信玩家",
        password: "trusted-password",
        mustChangePassword: false,
      })
      .expect(201);
    expect(created.body.user.mustChangePassword).toBe(true);

    const playerAgent = request.agent(app);
    await playerAgent.post("/api/auth/login")
      .send({ username: "trusted_player", password: "trusted-password" })
      .expect(200);
    expect((await playerAgent.get("/api/rooms").expect(403)).body.error.code).toBe("PASSWORD_CHANGE_REQUIRED");

    const reset = await adminAgent.post(`/api/admin/users/${created.body.user.id}/reset-password`)
      .send({ password: "reset-password", mustChangePassword: false })
      .expect(200);
    expect(reset.body.user.mustChangePassword).toBe(true);
    await playerAgent.get("/api/auth/me").expect(401);

    const relogged = request.agent(app);
    await relogged.post("/api/auth/login")
      .send({ username: "trusted_player", password: "reset-password" })
      .expect(200);
    const blockedLobby = await relogged.get("/api/rooms").expect(403);
    expect(blockedLobby.body.error.code).toBe("PASSWORD_CHANGE_REQUIRED");
  });

  it("also gates an administrator after a self-reset until the new password is replaced", async () => {
    const adminAgent = request.agent(app);
    await adminAgent.post("/api/auth/login")
      .send({ username: "admin", password: "admin-password" })
      .expect(200);
    await adminAgent.post(`/api/admin/users/${ADMIN_ID}/reset-password`)
      .send({ password: "temporary-admin-password" })
      .expect(200);
    await adminAgent.get("/api/auth/me").expect(401);

    const relogged = request.agent(app);
    const login = await relogged.post("/api/auth/login")
      .send({ username: "admin", password: "temporary-admin-password" })
      .expect(200);
    expect(login.body.user.mustChangePassword).toBe(true);
    const blockedAdmin = await relogged.get("/api/admin/users").expect(403);
    expect(blockedAdmin.body.error.code).toBe("PASSWORD_CHANGE_REQUIRED");

    const changed = await relogged.post("/api/auth/change-password")
      .send({
        currentPassword: "temporary-admin-password",
        newPassword: "private-admin-password",
      })
      .expect(200);
    expect(changed.body.user.mustChangePassword).toBe(false);
    await relogged.get("/api/admin/users").expect(200);
  });

  it("wires draft selections to the authenticated user and rejects injected player ids", async () => {
    const roomId = "33333333-3333-4333-8333-333333333333";
    const calls: unknown[][] = [];
    const draftRooms = {
      chooseGeneral: (selectedRoomId: string, userId: string, generalId: string) => {
        calls.push(["general", selectedRoomId, userId, generalId]);
        return { id: selectedRoomId, marker: "general" };
      },
      chooseGodFaction: (selectedRoomId: string, userId: string, faction: string) => {
        calls.push(["faction", selectedRoomId, userId, faction]);
        return { id: selectedRoomId, marker: "faction" };
      },
      waitForPersistence: async () => {},
    } as unknown as RoomService;
    const draftApp = createApplication({
      config,
      pool: { query: async () => ({ rows: [{ "?column?": 1 }] }) } as never,
      sessionMiddleware: session({ secret: config.sessionSecret, resave: false, saveUninitialized: false }),
      users,
      rooms: draftRooms,
      securityEvents: new SecurityEvents(),
    });
    const playerAgent = request.agent(draftApp);
    await playerAgent.post("/api/auth/login")
      .send({ username: "player", password: "player-password" })
      .expect(200);

    await playerAgent.post(`/api/rooms/${roomId}/draft/general`)
      .send({ generalId: "cao_cao", playerId: ADMIN_ID })
      .expect(400);
    const general = await playerAgent.post(`/api/rooms/${roomId}/draft/general`)
      .send({ generalId: "cao_cao" })
      .expect(200);
    expect(general.body).toEqual({ room: { id: roomId, marker: "general" } });

    await playerAgent.post(`/api/rooms/${roomId}/draft/god-faction`)
      .send({ faction: "wu", playerId: ADMIN_ID })
      .expect(400);
    const faction = await playerAgent.post(`/api/rooms/${roomId}/draft/god-faction`)
      .send({ faction: "wu" })
      .expect(200);
    expect(faction.body).toEqual({ room: { id: roomId, marker: "faction" } });
    expect(calls).toEqual([
      ["general", roomId, PLAYER_ID, "cao_cao"],
      ["faction", roomId, PLAYER_ID, "wu"],
    ]);
  });
});
