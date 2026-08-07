import { createServer } from "node:http";
import type { PoolClient } from "pg";
import { createApplication } from "./app.js";
import { createBotDecisionRegistry } from "./bots/index.js";
import { loadConfig } from "./config.js";
import { createDatabasePool, migrateDatabase } from "./db.js";
import { FarmService, PostgresFarmStateStore } from "./farm-service.js";
import {
  LlmSettingsService,
  PostgresLlmSettingsStore,
} from "./llm-settings.js";
import {
  LlmGovernanceService,
  PostgresLlmGovernanceStore,
} from "./llm-governance.js";
import { PostgresHomesteadDirectorJobStore } from "./homestead-director-jobs.js";
import { attachRealtimeServer } from "./realtime.js";
import {
  loadRoomSnapshotEntries,
  quarantineInvalidRoomSnapshot,
  quarantineRoomSnapshotEntry,
  RoomSnapshotWriter,
  selectRestorableRoomSnapshotEntries,
} from "./room-persistence.js";
import { RoomService } from "./rooms.js";
import { SecurityEvents } from "./security-events.js";
import { createSessionMiddleware } from "./session.js";
import { createTownWeatherService } from "./town-weather.js";
import {
  PostgresTownWeatherSettingsStore,
  TownWeatherSettingsService,
} from "./weather-settings.js";
import { ensureInitialAdmin, PostgresUserStore } from "./users.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const pool = createDatabasePool(config.databaseUrl);
  let instanceLock: PoolClient | undefined;

  try {
    await migrateDatabase(pool);
    instanceLock = await pool.connect();
    const lock = await instanceLock.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_lock($1) AS acquired",
      [1_396_789_831],
    );
    if (!lock.rows[0]?.acquired) {
      throw new Error("Another Sanguosha application instance already owns the room-state lock");
    }
    const users = new PostgresUserStore(pool);
    await ensureInitialAdmin(users, config.initialAdmin);

    const botDecisions = createBotDecisionRegistry();
    const llmSettings = new LlmSettingsService(
      new PostgresLlmSettingsStore(pool),
      botDecisions,
      {
        current: config.settingsEncryptionSecret,
        previous: config.settingsEncryptionPreviousSecrets,
      },
      config.doudizhuLlm,
    );
    await llmSettings.initialize();
    const llmGovernance = new LlmGovernanceService(
      new PostgresLlmGovernanceStore(pool),
    );
    const directorJobs = new PostgresHomesteadDirectorJobStore(pool);
    const townWeather = createTownWeatherService();
    const townWeatherSettings = new TownWeatherSettingsService(
      new PostgresTownWeatherSettingsStore(pool),
      townWeather,
      {
        current: config.settingsEncryptionSecret,
        previous: config.settingsEncryptionPreviousSecrets,
      },
      config.townWeather,
    );
    await townWeatherSettings.initialize();
    const farm = new FarmService(
      new PostgresFarmStateStore(pool),
      botDecisions,
      Date.now,
      townWeather,
      llmGovernance,
      directorJobs,
    );
    const createRooms = () => new RoomService(
      90_000,
      200,
      700,
      [1_000, 5_000],
      botDecisions,
    );
    const rooms = createRooms();
    const savedRooms = await loadRoomSnapshotEntries(pool);
    if (savedRooms.kind === "entries") {
      const restoreValidation = selectRestorableRoomSnapshotEntries(
        savedRooms.entries,
        (snapshot) => {
          // restoreSnapshot has a small set of runtime-only invariants that
          // cannot be represented by the persistence schema. Validate the
          // room in an isolated service before mutating the live service, so
          // one runtime-only invariant failure cannot discard healthy rooms.
          const probe = createRooms();
          try {
            probe.restoreSnapshot(snapshot);
          } finally {
            probe.restoreSnapshot({ version: 1, rooms: [] });
          }
        },
      );
      const invalidEntries = [
        ...savedRooms.invalidEntries,
        ...restoreValidation.invalidEntries,
      ];
      for (const entry of invalidEntries) {
        await quarantineRoomSnapshotEntry(pool, entry);
      }
      if (restoreValidation.entries.length > 0) {
        rooms.restoreSnapshot({
          version: 1,
          rooms: restoreValidation.entries.map((entry) => entry.snapshot),
        });
        console.log(`Restored ${restoreValidation.entries.length} room snapshot(s)`);
      }
      if (invalidEntries.length > 0) {
        console.error(
          `Quarantined ${invalidEntries.length} invalid room snapshot(s) while preserving healthy rooms`,
        );
      }
    } else if (savedRooms.kind === "invalid_legacy") {
      console.error(`Quarantining invalid legacy room state: ${savedRooms.reason}`);
      await quarantineInvalidRoomSnapshot(pool, savedRooms.reason);
    }
    const roomPersistence = new RoomSnapshotWriter(
      pool,
      (error) => console.error("Failed to persist room state; retry scheduled", error),
    );
    rooms.setSnapshotPersistence((snapshot) => roomPersistence.enqueue(snapshot));
    await roomPersistence.enqueue(rooms.exportSnapshot());
    const securityEvents = new SecurityEvents();
    const sessionMiddleware = createSessionMiddleware(config, pool);
    const app = createApplication({
      config,
      pool,
      sessionMiddleware,
      users,
      rooms,
      securityEvents,
      llmSettings,
      townWeatherSettings,
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
      httpServer.listen(config.port, "0.0.0.0", () => {
        httpServer.off("error", reject);
        resolve();
      });
    });
    console.log(`Sanguosha server listening on port ${config.port}`);
    void farm.resumeHomesteadDirectorJobs().catch((error) => {
      console.error("Failed to resume homestead director jobs", error);
    });

    let shuttingDown = false;
    const shutdown = async (signal: string): Promise<void> => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(`Received ${signal}; shutting down`);
      const forceExit = setTimeout(() => process.exit(1), 10_000);
      forceExit.unref();
      io.disconnectSockets(true);
      await new Promise<void>((resolve) => io.close(() => resolve()));
      if (httpServer.listening) {
        await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      }
      await roomPersistence.flush(rooms.exportSnapshot());
      await instanceLock?.query("SELECT pg_advisory_unlock($1)", [1_396_789_831]);
      instanceLock?.release();
      instanceLock = undefined;
      await pool.end();
      clearTimeout(forceExit);
    };

    process.once("SIGINT", () => void shutdown("SIGINT"));
    process.once("SIGTERM", () => void shutdown("SIGTERM"));
  } catch (error) {
    instanceLock?.release();
    await pool.end();
    throw error;
  }
}

main().catch((error) => {
  console.error("Server startup failed", error);
  process.exitCode = 1;
});
