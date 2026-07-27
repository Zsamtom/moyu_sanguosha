import { createServer } from "node:http";
import type { PoolClient } from "pg";
import { createApplication } from "./app.js";
import { createBotDecisionRegistry } from "./bots/index.js";
import { loadConfig } from "./config.js";
import { createDatabasePool, migrateDatabase } from "./db.js";
import {
  LlmSettingsService,
  PostgresLlmSettingsStore,
} from "./llm-settings.js";
import { attachRealtimeServer } from "./realtime.js";
import {
  loadRoomSnapshot,
  quarantineInvalidRoomSnapshot,
  RoomSnapshotWriter,
} from "./room-persistence.js";
import { RoomService } from "./rooms.js";
import { SecurityEvents } from "./security-events.js";
import { createSessionMiddleware } from "./session.js";
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
      config.sessionSecret,
      config.doudizhuLlm,
    );
    await llmSettings.initialize();
    const rooms = new RoomService(
      90_000,
      200,
      700,
      [1_000, 5_000],
      botDecisions,
    );
    const savedRooms = await loadRoomSnapshot(pool);
    if (savedRooms.kind === "valid") {
      try {
        rooms.restoreSnapshot(savedRooms.snapshot);
        console.log(`Restored ${savedRooms.snapshot.rooms.length} room snapshot(s)`);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.error("Quarantining unrestorable persisted room state", error);
        await quarantineInvalidRoomSnapshot(pool, reason);
      }
    } else if (savedRooms.kind === "invalid") {
      console.error(`Quarantining invalid persisted room state: ${savedRooms.reason}`);
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
