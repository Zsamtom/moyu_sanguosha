import type { Server as HttpServer } from "node:http";
import {
  DoudizhuRuleError,
  GameRuleError,
  GoujiRuleError,
  type DoudizhuGameView,
  type GameView,
  type GoujiGameView,
} from "@sanguosha/shared";
import type { RequestHandler, Request } from "express";
import { Server, type Socket } from "socket.io";
import { ZodError, z } from "zod";
import type { AppConfig } from "./config.js";
import { HttpError } from "./errors.js";
import {
  chooseGeneralPayloadSchema,
  chooseGodFactionPayloadSchema,
  chatMessagePayloadSchema,
  createRoomSchema,
  gameActionPayloadSchema,
  roomIdSchema,
} from "./room-schemas.js";
import type { RoomChatMessage, RoomService, RoomSummary, RoomView } from "./rooms.js";
import type { SecurityEvents } from "./security-events.js";
import type { PublicUser, UserStore } from "./users.js";

export type AckResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };
type Ack<T> = (result: AckResult<T>) => void;

interface ClientToServerEvents {
  "room:create": (input: unknown, ack: Ack<{ room: RoomView }>) => void;
  "room:join": (input: unknown, ack: Ack<{ room: RoomView }>) => void;
  "room:leave": (input: unknown, ack: Ack<Record<string, never>>) => void;
  "room:ready": (input: unknown, ack: Ack<{ room: RoomView }>) => void;
  "room:start": (input: unknown, ack: Ack<{ room: RoomView }>) => void;
  "room:choose-general": (input: unknown, ack: Ack<{ room: RoomView }>) => void;
  "room:choose-god-faction": (input: unknown, ack: Ack<{ room: RoomView }>) => void;
  "room:chat": (input: unknown, ack: Ack<{ message: RoomChatMessage }>) => void;
  "game:action": (input: unknown, ack: Ack<{ game: GameView | GoujiGameView | DoudizhuGameView }>) => void;
}

export interface RealtimeState {
  rooms: RoomSummary[];
  room: RoomView | null;
  game: GameView | GoujiGameView | DoudizhuGameView | null;
}

interface ServerToClientEvents {
  "rooms:update": (rooms: RoomSummary[]) => void;
  "room:update": (room: RoomView | null) => void;
  "game:view": (game: GameView | GoujiGameView | DoudizhuGameView | null) => void;
  state: (state: RealtimeState) => void;
  "server:error": (error: { code: string; message: string }) => void;
}

interface SocketData {
  user: PublicUser;
}

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>;
const roomIdPayload = z.object({ roomId: roomIdSchema });
const readyPayload = roomIdPayload.extend({ ready: z.boolean() });

function userChannel(userId: string): string {
  return `user:${userId}`;
}

function errorPayload(error: unknown): { code: string; message: string } {
  if (error instanceof HttpError) return { code: error.code, message: error.message };
  if (error instanceof ZodError) return { code: "VALIDATION_ERROR", message: "请求参数不合法" };
  if (error instanceof GameRuleError) return { code: error.code, message: error.message };
  if (error instanceof GoujiRuleError) return { code: error.code, message: error.message };
  if (error instanceof DoudizhuRuleError) return { code: error.code, message: error.message };
  console.error(error);
  return { code: "INTERNAL_ERROR", message: "服务器内部错误" };
}

export function attachRealtimeServer(options: {
  httpServer: HttpServer;
  config: AppConfig;
  sessionMiddleware: RequestHandler;
  users: UserStore;
  rooms: RoomService;
  securityEvents: SecurityEvents;
}): Server<ClientToServerEvents, ServerToClientEvents, object, SocketData> {
  const { httpServer, config, sessionMiddleware, users, rooms, securityEvents } = options;
  const io = new Server<ClientToServerEvents, ServerToClientEvents, object, SocketData>(httpServer, {
    cors: config.appOrigin ? { origin: config.appOrigin, credentials: true } : undefined,
    transports: ["websocket", "polling"],
    allowRequest: (request, callback) => {
      const origin = request.headers.origin;
      // Browsers send Origin for cross-site WebSocket/XHR attempts. Requests
      // without Origin are same-origin/non-browser clients and still require a
      // valid HttpOnly session before the Socket.IO handshake succeeds.
      const allowed = !config.appOrigin || !origin || origin === config.appOrigin;
      callback(null, allowed);
    },
  });

  io.engine.use(sessionMiddleware as unknown as Parameters<typeof io.engine.use>[0]);

  io.use(async (socket, next) => {
    try {
      const request = socket.request as Request;
      const userId = request.session?.userId;
      if (!userId) return next(new Error("UNAUTHENTICATED"));
      const authenticated = await users.findSessionUser(userId);
      if (!authenticated || authenticated.sessionVersion !== request.session.authVersion) {
        return next(new Error("UNAUTHENTICATED"));
      }
      if (authenticated.user.disabled) return next(new Error("ACCOUNT_DISABLED"));
      if (authenticated.user.mustChangePassword) return next(new Error("PASSWORD_CHANGE_REQUIRED"));
      socket.data.user = authenticated.user;
      next();
    } catch (error) {
      next(error instanceof Error ? error : new Error("INTERNAL_ERROR"));
    }
  });

  const stateFor = (userId: string): RealtimeState => {
    const room = rooms.getForUser(userId) ?? null;
    const game = room ? rooms.getGameView(room.id, userId) ?? null : null;
    return { rooms: rooms.list(), room, game };
  };

  const emitStateToUser = (userId: string): void => {
    const state = stateFor(userId);
    const channel = io.to(userChannel(userId));
    channel.emit("room:update", state.room);
    channel.emit("game:view", state.game);
    channel.emit("state", state);
  };

  const broadcastState = (): void => {
    io.emit("rooms:update", rooms.list());
    for (const roomId of rooms.allRoomIds()) {
      for (const userId of rooms.members(roomId)) emitStateToUser(userId);
    }
  };

  rooms.onChanged(broadcastState);
  const revokeRealtimeAccess = (userId: string): void => {
    const room = rooms.getForUser(userId);
    if (room) rooms.leave(room.id, userId);
    io.in(userChannel(userId)).disconnectSockets(true);
  };
  securityEvents.onUserDisabled((userId) => {
    revokeRealtimeAccess(userId);
  });
  securityEvents.onSessionRevoked((userId) => {
    revokeRealtimeAccess(userId);
  });

  io.on("connection", (socket) => {
    const userId = socket.data.user.id;
    void socket.join(userChannel(userId));
    rooms.setConnected(userId, true);
    void rooms.waitForPersistence().then(() => {
      if (!socket.connected) return;
      socket.emit("rooms:update", rooms.list());
      const initialState = stateFor(userId);
      socket.emit("room:update", initialState.room);
      socket.emit("game:view", initialState.game);
      socket.emit("state", initialState);
    }).catch((error) => {
      socket.emit("server:error", errorPayload(error));
      socket.disconnect(true);
    });

    const sessionCheck = setInterval(() => {
      void verifySocketSession(socket, users).catch(() => socket.disconnect(true));
    }, 60_000);
    sessionCheck.unref();

    socket.on("room:create", (raw, ack) => void withAck(socket, users, rooms, ack, async (user) => {
      const room = rooms.create(user, createRoomSchema.parse(raw));
      return { room };
    }));

    socket.on("room:join", (raw, ack) => void withAck(socket, users, rooms, ack, async (user) => {
      const { roomId } = roomIdPayload.parse(raw);
      return { room: rooms.join(roomId, user) };
    }));

    socket.on("room:leave", (raw, ack) => void withAck(socket, users, rooms, ack, async (user) => {
      const { roomId } = roomIdPayload.parse(raw);
      rooms.leave(roomId, user.id);
      await rooms.waitForPersistence();
      io.to(userChannel(user.id)).emit("room:update", null);
      io.to(userChannel(user.id)).emit("game:view", null);
      return {};
    }));

    socket.on("room:ready", (raw, ack) => void withAck(socket, users, rooms, ack, async (user) => {
      const { roomId, ready } = readyPayload.parse(raw);
      return { room: rooms.setReady(roomId, user.id, ready) };
    }));

    socket.on("room:start", (raw, ack) => void withAck(socket, users, rooms, ack, async (user) => {
      const { roomId } = roomIdPayload.parse(raw);
      return { room: rooms.start(roomId, user.id) };
    }));

    socket.on("room:choose-general", (raw, ack) => void withAck(socket, users, rooms, ack, async (user) => {
      const { roomId, generalId } = chooseGeneralPayloadSchema.parse(raw);
      return { room: rooms.chooseGeneral(roomId, user.id, generalId) };
    }));

    socket.on("room:choose-god-faction", (raw, ack) => void withAck(socket, users, rooms, ack, async (user) => {
      const { roomId, faction } = chooseGodFactionPayloadSchema.parse(raw);
      return { room: rooms.chooseGodFaction(roomId, user.id, faction) };
    }));

    socket.on("room:chat", (raw, ack) => void withAck(socket, users, rooms, ack, async (user) => {
      const { roomId, message } = chatMessagePayloadSchema.parse(raw);
      return { message: rooms.sendChat(roomId, user.id, message) };
    }));

    socket.on("game:action", (raw, ack) => void withAck(socket, users, rooms, ack, async (user) => {
      const { roomId, ...input } = gameActionPayloadSchema.parse(raw);
      return { game: rooms.applyAction(roomId, user.id, input) };
    }));

    socket.on("disconnect", async () => {
      clearInterval(sessionCheck);
      const remainingSockets = await io.in(userChannel(userId)).fetchSockets();
      if (remainingSockets.length === 0) rooms.setConnected(userId, false);
    });
  });

  return io;
}

async function withAck<T>(
  socket: GameSocket,
  users: UserStore,
  rooms: RoomService,
  ack: Ack<T> | undefined,
  operation: (user: PublicUser) => Promise<T>,
): Promise<void> {
  try {
    const user = await verifySocketSession(socket, users);
    const data = await operation(user);
    await rooms.waitForPersistence();
    ack?.({ ok: true, data });
  } catch (error) {
    const payload = errorPayload(error);
    ack?.({ ok: false, error: payload });
    socket.emit("server:error", payload);
    if (error instanceof HttpError && (error.status === 401 || error.status === 403)) {
      socket.disconnect(true);
    }
  }
}

async function verifySocketSession(socket: GameSocket, users: UserStore): Promise<PublicUser> {
  const request = socket.request as Request;
  await new Promise<void>((resolve, reject) => {
    if (!request.session) {
      reject(new Error("SESSION_MISSING"));
      return;
    }
    request.session.reload((error) => error ? reject(error) : resolve());
  }).catch(() => {
    throw new HttpError(401, "UNAUTHENTICATED", "登录状态已失效");
  });

  const userId = request.session?.userId;
  if (!userId || userId !== socket.data.user.id) {
    throw new HttpError(401, "UNAUTHENTICATED", "登录状态已失效");
  }
  const authenticated = await users.findSessionUser(userId);
  if (!authenticated || authenticated.sessionVersion !== request.session.authVersion) {
    throw new HttpError(401, "UNAUTHENTICATED", "登录状态已失效");
  }
  if (authenticated.user.disabled) {
    throw new HttpError(403, "ACCOUNT_DISABLED", "账号已被停用");
  }
  if (authenticated.user.mustChangePassword) {
    throw new HttpError(403, "PASSWORD_CHANGE_REQUIRED", "请先修改初始密码");
  }
  return authenticated.user;
}
