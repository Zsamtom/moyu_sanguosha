import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Pool } from "pg";
import { HttpError } from "./errors.js";

export type UserRole = "admin" | "player";

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  disabled: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserWithPassword extends PublicUser {
  passwordHash: string;
  sessionVersion: number;
}

export interface SessionUser {
  user: PublicUser;
  sessionVersion: number;
}

export interface CreateUserInput {
  username: string;
  displayName: string;
  password: string;
  role?: UserRole;
  mustChangePassword?: boolean;
}

export interface UserStore {
  findById(id: string): Promise<PublicUser | undefined>;
  findSessionUser(id: string): Promise<SessionUser | undefined>;
  findByUsernameWithPassword(username: string): Promise<UserWithPassword | undefined>;
  list(): Promise<PublicUser[]>;
  create(input: CreateUserInput): Promise<PublicUser>;
  setDisabled(id: string, disabled: boolean): Promise<PublicUser | undefined>;
  resetPassword(id: string, password: string): Promise<PublicUser | undefined>;
  changePassword(id: string, password: string): Promise<SessionUser | undefined>;
  recordAudit(actorId: string, action: string, targetUserId: string, details?: object): Promise<void>;
}

interface UserRow {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  role: UserRole;
  disabled: boolean;
  must_change_password: boolean;
  session_version: number;
  created_at: Date | string;
  updated_at: Date | string;
}

const PASSWORD_ROUNDS = 12;

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    disabled: row.disabled,
    mustChangePassword: row.must_change_password,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function toUserWithPassword(row: UserRow): UserWithPassword {
  return {
    ...toPublicUser(row),
    passwordHash: row.password_hash,
    sessionVersion: row.session_version,
  };
}

export class PostgresUserStore implements UserStore {
  constructor(private readonly pool: Pool) {}

  async findById(id: string): Promise<PublicUser | undefined> {
    const result = await this.pool.query<UserRow>(
      "SELECT * FROM users WHERE id = $1",
      [id],
    );
    const row = result.rows[0];
    return row ? toPublicUser(row) : undefined;
  }

  async findSessionUser(id: string): Promise<SessionUser | undefined> {
    const result = await this.pool.query<UserRow>(
      "SELECT * FROM users WHERE id = $1",
      [id],
    );
    const row = result.rows[0];
    return row ? { user: toPublicUser(row), sessionVersion: row.session_version } : undefined;
  }

  async findByUsernameWithPassword(username: string): Promise<UserWithPassword | undefined> {
    const result = await this.pool.query<UserRow>(
      "SELECT * FROM users WHERE LOWER(username) = LOWER($1)",
      [username.trim()],
    );
    const row = result.rows[0];
    return row ? toUserWithPassword(row) : undefined;
  }

  async list(): Promise<PublicUser[]> {
    const result = await this.pool.query<UserRow>(
      "SELECT * FROM users ORDER BY created_at ASC",
    );
    return result.rows.map(toPublicUser);
  }

  async create(input: CreateUserInput): Promise<PublicUser> {
    const passwordHash = await bcrypt.hash(input.password, PASSWORD_ROUNDS);
    try {
      const result = await this.pool.query<UserRow>(
        `INSERT INTO users (id, username, display_name, password_hash, role, must_change_password)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          randomUUID(),
          input.username.trim(),
          input.displayName.trim(),
          passwordHash,
          input.role ?? "player",
          input.mustChangePassword ?? true,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error("User insert did not return a row");
      return toPublicUser(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new HttpError(409, "USERNAME_EXISTS", "用户名已存在");
      }
      throw error;
    }
  }

  async setDisabled(id: string, disabled: boolean): Promise<PublicUser | undefined> {
    const result = await this.pool.query<UserRow>(
      `UPDATE users SET disabled = $2, session_version = session_version + 1, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, disabled],
    );
    const row = result.rows[0];
    return row ? toPublicUser(row) : undefined;
  }

  async resetPassword(
    id: string,
    password: string,
  ): Promise<PublicUser | undefined> {
    const passwordHash = await bcrypt.hash(password, PASSWORD_ROUNDS);
    const result = await this.pool.query<UserRow>(
      `UPDATE users SET password_hash = $2, must_change_password = TRUE,
         session_version = session_version + 1, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, passwordHash],
    );
    const row = result.rows[0];
    return row ? toPublicUser(row) : undefined;
  }

  async changePassword(id: string, password: string): Promise<SessionUser | undefined> {
    const passwordHash = await bcrypt.hash(password, PASSWORD_ROUNDS);
    const result = await this.pool.query<UserRow>(
      `UPDATE users SET password_hash = $2, must_change_password = FALSE,
         session_version = session_version + 1, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, passwordHash],
    );
    const row = result.rows[0];
    return row ? { user: toPublicUser(row), sessionVersion: row.session_version } : undefined;
  }

  async recordAudit(
    actorId: string,
    action: string,
    targetUserId: string,
    details: object = {},
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO admin_audit_log (actor_id, action, target_user_id, details)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [actorId, action, targetUserId, JSON.stringify(details)],
    );
  }
}

export async function ensureInitialAdmin(
  users: UserStore,
  initialAdmin: { username: string; password: string; displayName: string },
): Promise<PublicUser> {
  const existing = await users.findByUsernameWithPassword(initialAdmin.username);
  if (existing) {
    if (existing.role !== "admin") {
      throw new Error(`Initial admin username '${initialAdmin.username}' belongs to a player account`);
    }
    const { passwordHash: _passwordHash, sessionVersion: _sessionVersion, ...publicUser } = existing;
    return publicUser;
  }

  return users.create({ ...initialAdmin, role: "admin", mustChangePassword: false });
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}
