import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { BotDecisionRegistry } from "./bots/decision-registry.js";
import { createDatabasePool, migrateDatabase } from "./db.js";
import { FarmService, PostgresFarmStateStore } from "./farm-service.js";
import {
  loadRoomSnapshot,
  loadRoomSnapshotEntries,
  quarantineRoomSnapshotEntry,
  saveRoomSnapshot,
} from "./room-persistence.js";
import { RoomService } from "./rooms.js";
import {
  TownWeatherService,
  type TownWeatherProviderResult,
} from "./town-weather.js";
import { PostgresUserStore } from "./users.js";

const databaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)("PostgreSQL integration", () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createDatabasePool(databaseUrl!);
    await migrateDatabase(pool);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("persists users with case-insensitive uniqueness", async () => {
    const store = new PostgresUserStore(pool);
    const suffix = randomUUID().slice(0, 8);
    const username = `integration-${suffix}`;
    const created = await store.create({
      username,
      displayName: "集成测试玩家",
      password: "integration-password",
      mustChangePassword: false,
    });

    expect((await store.findByUsernameWithPassword(username.toUpperCase()))?.id)
      .toBe(created.id);
    await expect(store.create({
      username: username.toUpperCase(),
      displayName: "重复玩家",
      password: "integration-password",
    })).rejects.toMatchObject({ status: 409, code: "USERNAME_EXISTS" });

    await pool.query(
      `INSERT INTO estate_account_state (user_id, state)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (user_id) DO UPDATE SET state = EXCLUDED.state`,
      [created.id, JSON.stringify({ ownerName: "旧昵称" })],
    );
    await pool.query(
      `INSERT INTO town_estate_state (user_id, town_id, state)
       VALUES ($1, 'greenvale', $2::jsonb)
       ON CONFLICT (user_id, town_id) DO UPDATE SET state = EXCLUDED.state`,
      [created.id, JSON.stringify({
        farm: { ownerName: "旧昵称" },
        ranch: { ownerName: "旧昵称" },
        mine: { ownerName: "旧昵称" },
        homestead: { ownerName: "旧昵称" },
      })],
    );

    await expect(store.setDisplayName(created.id, "新昵称"))
      .resolves.toMatchObject({ displayName: "新昵称" });
    const renamed = await pool.query<{ account_name: string; farm_name: string }>(
      `SELECT account.state->>'ownerName' AS account_name,
              town.state->'farm'->>'ownerName' AS farm_name
       FROM estate_account_state account
       JOIN town_estate_state town ON town.user_id = account.user_id
       WHERE account.user_id = $1 AND town.town_id = 'greenvale'`,
      [created.id],
    );
    expect(renamed.rows[0]).toEqual({
      account_name: "新昵称",
      farm_name: "新昵称",
    });
  });

  it("round-trips a room snapshot through real JSONB storage", async () => {
    const snapshot = { version: 1, rooms: [] } as const;
    await saveRoomSnapshot(pool, snapshot);
    await expect(loadRoomSnapshot(pool)).resolves.toEqual({
      kind: "valid",
      snapshot,
    });
    await expect(loadRoomSnapshotEntries(pool)).resolves.toEqual({
      kind: "entries",
      entries: [],
      invalidEntries: [],
    });
  });

  it("does not advance weather revision after a JSONB town-estate round trip", async () => {
    const users = new PostgresUserStore(pool);
    const suffix = randomUUID().slice(0, 8);
    const user = await users.create({
      username: `weather-jsonb-${suffix}`,
      displayName: "气象集成测试玩家",
      password: "integration-password",
      mustChangePassword: false,
    });
    const now = Date.parse("2026-07-29T08:00:00+08:00");
    const weather = new TownWeatherService({
      provider: {
        fetchTownWeather: async (): Promise<TownWeatherProviderResult> => ({
          provider: "qweather",
          observedAt: now,
          conditionCode: "305",
          conditionText: "小雨",
          temperatureC: 18,
          feelsLikeC: 18,
          humidityPercent: 81,
          precipitationMm: 4.2,
          windSpeedKph: 13,
          visibilityKm: 12,
          alerts: [{
            id: "weather-jsonb-alert",
            eventCode: "test-alert",
            eventName: "寒潮",
            headline: "JSONB 键序回归预警",
            description: "验证 JSONB 对象字段重排不会推进庄园 revision",
            instruction: null,
            senderName: "测试气象台",
            messageType: "alert",
            severity: "severe",
            certainty: "likely",
            urgency: "expected",
            colorCode: "orange",
            issuedAt: now,
            effectiveAt: now,
            expiresAt: now + 24 * 60 * 60 * 1_000,
          }],
          forecast: [{
            forecastStartAt: now + 24 * 60 * 60 * 1_000,
            forecastEndAt: now + 48 * 60 * 60 * 1_000,
            conditionCode: "305",
            conditionText: "小雨",
            temperatureMinC: 12,
            temperatureMaxC: 19,
            precipitationMm: 4.2,
            precipitationProbabilityPercent: 75,
            humidityPercent: 81,
            windSpeedKph: 13,
          }],
          attributions: ["QWeather"],
        }),
      },
      rules: {
        resolveWeatherId: () => "gentle_rain",
        resolveDisaster: () => ({ mechanicId: "cold_snap", label: "寒潮" }),
      },
    });
    const service = new FarmService(
      new PostgresFarmStateStore(pool),
      new BotDecisionRegistry(),
      () => now,
      weather,
    );

    const first = await service.getOrCreateHomestead(user);
    const second = await service.getOrCreateHomestead(user);

    expect(second.homestead.revision).toBe(first.homestead.revision);
  });

  it("isolates a malformed per-room row without losing a healthy room", async () => {
    const store = new PostgresUserStore(pool);
    const suffix = randomUUID().slice(0, 8);
    const [first, second] = await Promise.all([
      store.create({
        username: `room-a-${suffix}`,
        displayName: "健康房主",
        password: "integration-password",
        mustChangePassword: false,
      }),
      store.create({
        username: `room-b-${suffix}`,
        displayName: "损坏房主",
        password: "integration-password",
        mustChangePassword: false,
      }),
    ]);
    const rooms = new RoomService();
    const healthy = rooms.create(first, { name: "健康房间", maxPlayers: 2 });
    const corrupted = rooms.create(second, { name: "待损坏房间", maxPlayers: 2 });
    await saveRoomSnapshot(pool, rooms.exportSnapshot());
    await pool.query(
      `UPDATE room_state_entry
       SET snapshot = jsonb_set(snapshot, '{maxPlayers}', '0'::jsonb)
       WHERE room_id = $1`,
      [corrupted.id],
    );

    const loaded = await loadRoomSnapshotEntries(pool);
    expect(loaded).toMatchObject({
      kind: "entries",
      entries: [{ roomId: healthy.id }],
      invalidEntries: [{ roomId: corrupted.id }],
    });
    if (loaded.kind !== "entries") throw new Error("Expected per-room entries");
    await quarantineRoomSnapshotEntry(pool, loaded.invalidEntries[0]!);
    const remaining = await pool.query<{ room_id: string }>(
      "SELECT room_id::text AS room_id FROM room_state_entry ORDER BY room_id",
    );
    expect(remaining.rows).toEqual([{ room_id: healthy.id }]);
  });
});
