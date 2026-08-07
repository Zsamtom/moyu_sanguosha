import { createServer } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import session from "express-session";
import type { Pool } from "pg";
import { createApplication } from "./app.js";
import { HttpError } from "./errors.js";
import type { AppConfig } from "./config.js";
import { createBotDecisionRegistry } from "./bots/index.js";
import { FarmService, MemoryFarmStateStore } from "./farm-service.js";
import {
  LlmSettingsService,
  MemoryLlmSettingsStore,
} from "./llm-settings.js";
import {
  LlmGovernanceService,
  MemoryLlmGovernanceStore,
} from "./llm-governance.js";
import { MemoryHomesteadDirectorJobStore } from "./homestead-director-jobs.js";
import { attachRealtimeServer } from "./realtime.js";
import { RoomService } from "./rooms.js";
import { SecurityEvents } from "./security-events.js";
import {
  ensureInitialAdmin,
  normalizeUsername,
  type CreateUserInput,
  type PublicUser,
  type SessionUser,
  type UserStore,
  type UserWithPassword,
} from "./users.js";

const PASSWORD_ROUNDS = 12;

class LocalMemoryUserStore implements UserStore {
  private readonly users = new Map<string, UserWithPassword>();

  async findById(id: string): Promise<PublicUser | undefined> {
    const user = this.users.get(id);
    return user ? this.publicUser(user) : undefined;
  }

  async findSessionUser(id: string): Promise<SessionUser | undefined> {
    const user = this.users.get(id);
    return user ? { user: this.publicUser(user), sessionVersion: user.sessionVersion } : undefined;
  }

  async findByUsernameWithPassword(username: string): Promise<UserWithPassword | undefined> {
    const normalized = normalizeUsername(username);
    return [...this.users.values()].find((user) => user.username.toLowerCase() === normalized);
  }

  async list(): Promise<PublicUser[]> {
    return [...this.users.values()]
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map((user) => this.publicUser(user));
  }

  async create(input: CreateUserInput): Promise<PublicUser> {
    if (await this.findByUsernameWithPassword(input.username)) {
      throw new HttpError(409, "USERNAME_EXISTS", "用户名已存在");
    }
    const now = new Date().toISOString();
    const user: UserWithPassword = {
      id: randomUUID(),
      username: normalizeUsername(input.username),
      displayName: input.displayName.trim(),
      role: input.role ?? "player",
      disabled: false,
      mustChangePassword: input.mustChangePassword ?? true,
      createdAt: now,
      updatedAt: now,
      passwordHash: await bcrypt.hash(input.password, PASSWORD_ROUNDS),
      sessionVersion: 0,
    };
    this.users.set(user.id, user);
    return this.publicUser(user);
  }

  async setDisplayName(id: string, displayName: string): Promise<PublicUser | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    user.displayName = displayName.trim();
    user.updatedAt = new Date().toISOString();
    return this.publicUser(user);
  }

  async setDisabled(id: string, disabled: boolean): Promise<PublicUser | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    user.disabled = disabled;
    user.sessionVersion += 1;
    user.updatedAt = new Date().toISOString();
    return this.publicUser(user);
  }

  async delete(id: string): Promise<PublicUser | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    this.users.delete(id);
    return this.publicUser(user);
  }

  async resetPassword(id: string, password: string): Promise<PublicUser | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    user.passwordHash = await bcrypt.hash(password, PASSWORD_ROUNDS);
    user.mustChangePassword = true;
    user.sessionVersion += 1;
    user.updatedAt = new Date().toISOString();
    return this.publicUser(user);
  }

  async changePassword(id: string, password: string): Promise<SessionUser | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    user.passwordHash = await bcrypt.hash(password, PASSWORD_ROUNDS);
    user.mustChangePassword = false;
    user.sessionVersion += 1;
    user.updatedAt = new Date().toISOString();
    return { user: this.publicUser(user), sessionVersion: user.sessionVersion };
  }

  async recordAudit(): Promise<void> {
    // Local preview data is intentionally ephemeral.
  }

  private publicUser(user: UserWithPassword): PublicUser {
    const { passwordHash: _passwordHash, sessionVersion: _sessionVersion, ...publicUser } = user;
    return { ...publicUser };
  }
}

async function main(): Promise<void> {
  const port = Number(process.env.PORT ?? 3_000);
  const adminUsername = process.env.INITIAL_ADMIN_USERNAME ?? "admin";
  const adminPassword = process.env.INITIAL_ADMIN_PASSWORD ?? "moyu-local-2026";
  const sessionSecret = randomBytes(32).toString("hex");
  const config: AppConfig = {
    nodeEnv: "development",
    port,
    databaseUrl: "memory://local-preview",
    sessionSecret,
    settingsEncryptionSecret: sessionSecret,
    settingsEncryptionPreviousSecrets: [],
    initialAdmin: {
      username: adminUsername,
      password: adminPassword,
      displayName: process.env.INITIAL_ADMIN_DISPLAY_NAME ?? "本地管理员",
    },
    appOrigin: `http://localhost:${port}`,
    trustProxy: 0,
    secureCookies: false,
    appVersion: "local-preview",
  };
  const users = new LocalMemoryUserStore();
  await ensureInitialAdmin(users, config.initialAdmin);
  const botDecisions = createBotDecisionRegistry();
  const llmSettings = new LlmSettingsService(
    new MemoryLlmSettingsStore(),
    botDecisions,
    config.sessionSecret,
  );
  await llmSettings.initialize();
  const llmGovernance = new LlmGovernanceService(
    new MemoryLlmGovernanceStore(),
  );
  const directorJobs = new MemoryHomesteadDirectorJobStore();
  const farm = new FarmService(
    new MemoryFarmStateStore(),
    botDecisions,
    Date.now,
    undefined,
    llmGovernance,
    directorJobs,
  );
  const rooms = new RoomService(
    90_000,
    200,
    350,
    [1_000, 5_000],
    botDecisions,
  );
  rooms.setSnapshotPersistence(async () => undefined);
  const securityEvents = new SecurityEvents();
  const sessionMiddleware = session({
    name: "sanguosha.sid",
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1_000,
    },
  });
  const healthPool = {
    query: async () => ({ rows: [{ ok: 1 }] }),
  } as unknown as Pool;
  const app = createApplication({
    config,
    pool: healthPool,
    sessionMiddleware,
    users,
    rooms,
    securityEvents,
    llmSettings,
    llmGovernance,
    directorJobs,
    farm,
  });
  const httpServer = createServer(app);
  const io = attachRealtimeServer({
    httpServer,
    config,
    sessionMiddleware,
    users,
    rooms,
    securityEvents,
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(port, "127.0.0.1", () => {
      httpServer.off("error", reject);
      resolve();
    });
  });
  void farm.resumeHomesteadDirectorJobs().catch((error) => {
    console.error("Failed to resume local homestead director jobs", error);
  });
  console.log(`墨鱼本地测试站点：http://localhost:${port}`);
  console.log(`本地管理员：${adminUsername} / ${adminPassword}`);
  console.log("当前为内存模式，关闭服务后账号、房间和对局数据会清空。");

  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    io.disconnectSockets(true);
    await new Promise<void>((resolve) => io.close(() => resolve()));
    if (httpServer.listening) {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }
  };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
}

main().catch((error) => {
  console.error("本地测试站点启动失败", error);
  process.exitCode = 1;
});
