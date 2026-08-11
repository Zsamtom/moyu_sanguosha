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

    -- New installations persist each room independently. The legacy
    -- room_state row is intentionally retained during the rolling upgrade so
    -- older application instances can still read a complete snapshot.
    CREATE TABLE IF NOT EXISTS room_state_entry (
      room_id UUID PRIMARY KEY,
      snapshot JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS room_state_entry_updated_idx
      ON room_state_entry (updated_at ASC, room_id ASC);

    CREATE TABLE IF NOT EXISTS room_state_entry_quarantine (
      id BIGSERIAL PRIMARY KEY,
      room_id TEXT,
      snapshot JSONB NOT NULL,
      reason TEXT NOT NULL,
      source TEXT NOT NULL,
      quarantined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS farm_state (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      state JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS farm_state_quarantine (
      id BIGSERIAL PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      state JSONB NOT NULL,
      reason TEXT NOT NULL,
      quarantined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ranch_state (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      state JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ranch_state_quarantine (
      id BIGSERIAL PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      state JSONB NOT NULL,
      reason TEXT NOT NULL,
      quarantined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS mine_state (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      state JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS mine_state_quarantine (
      id BIGSERIAL PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      state JSONB NOT NULL,
      reason TEXT NOT NULL,
      quarantined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS homestead_state (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      state JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS homestead_state_quarantine (
      id BIGSERIAL PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      state JSONB NOT NULL,
      reason TEXT NOT NULL,
      quarantined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS estate_account_state (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      state JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS restaurant_state (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      state JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS restaurant_state_quarantine (
      id BIGSERIAL PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      state JSONB NOT NULL,
      reason TEXT NOT NULL,
      quarantined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS town_estate_state (
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      town_id TEXT NOT NULL,
      state JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, town_id)
    );

    CREATE INDEX IF NOT EXISTS town_estate_state_town_updated_idx
      ON town_estate_state (town_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS town_estate_state_quarantine (
      id BIGSERIAL PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      town_id TEXT NOT NULL,
      state JSONB NOT NULL,
      reason TEXT NOT NULL,
      quarantined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS llm_decision_audit (
      id UUID PRIMARY KEY,
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      feature VARCHAR(32) NOT NULL CHECK (feature IN ('homestead')),
      town_id TEXT,
      day_key TEXT,
      status VARCHAR(16) NOT NULL
        CHECK (status IN ('success', 'fallback', 'failure', 'skipped')),
      failure_reason VARCHAR(64),
      candidate_count INTEGER NOT NULL DEFAULT 0 CHECK (candidate_count >= 0),
      selected_event_id TEXT,
      event_instance_id TEXT,
      prompt_tokens INTEGER NOT NULL DEFAULT 0 CHECK (prompt_tokens >= 0),
      completion_tokens INTEGER NOT NULL DEFAULT 0 CHECK (completion_tokens >= 0),
      latency_ms INTEGER NOT NULL DEFAULT 0 CHECK (latency_ms >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS llm_decision_audit_feature_created_idx
      ON llm_decision_audit (feature, created_at DESC);

    CREATE INDEX IF NOT EXISTS llm_decision_audit_user_day_idx
      ON llm_decision_audit (user_id, feature, day_key);

    CREATE TABLE IF NOT EXISTS homestead_director_job (
      id UUID PRIMARY KEY,
      job_key TEXT NOT NULL UNIQUE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      town_id TEXT NOT NULL,
      day_key TEXT NOT NULL,
      profile JSONB NOT NULL,
      disaster_id TEXT,
      status VARCHAR(16) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'applied', 'obsolete', 'failed')),
      attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ
    );

    CREATE INDEX IF NOT EXISTS homestead_director_job_status_created_idx
      ON homestead_director_job (status, created_at);

    CREATE INDEX IF NOT EXISTS homestead_director_job_user_created_idx
      ON homestead_director_job (user_id, created_at DESC);
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
