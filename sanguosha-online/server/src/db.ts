import { Pool } from "pg";

export function createDatabasePool(connectionString: string): Pool {
  return new Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}

export async function migrateDatabase(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      username VARCHAR(32) NOT NULL,
      display_name VARCHAR(40) NOT NULL,
      password_hash TEXT NOT NULL,
      role VARCHAR(16) NOT NULL DEFAULT 'player' CHECK (role IN ('admin', 'player')),
      disabled BOOLEAN NOT NULL DEFAULT FALSE,
      must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
      session_version INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_unique
      ON users (LOWER(username));

    ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

    CREATE TABLE IF NOT EXISTS admin_audit_log (
      id BIGSERIAL PRIMARY KEY,
      actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
      action VARCHAR(64) NOT NULL,
      target_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key VARCHAR(64) PRIMARY KEY,
      value JSONB NOT NULL,
      updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS room_state (
      id SMALLINT PRIMARY KEY CHECK (id = 1),
      snapshot JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS room_state_quarantine (
      id BIGSERIAL PRIMARY KEY,
      snapshot JSONB NOT NULL,
      reason TEXT NOT NULL,
      quarantined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS farm_state (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      state JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

export async function checkDatabase(pool: Pool): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
