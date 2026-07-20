import { io, type Socket } from 'socket.io-client';
import type { GameAction, GameLogEntry, RoomDetail, RoomSummary, ServerState } from './types';
import { normalizeRoomDetail, normalizeRoomSummary } from './types';

export interface RealtimeHandlers {
  onConnectionChange: (connected: boolean) => void;
  onRooms: (rooms: RoomSummary[]) => void;
  onRoom: (room: RoomDetail | null) => void;
  onGame: (game: unknown | null) => void;
  onLog: (log: GameLogEntry) => void;
  onError: (message: string) => void;
}

function payloadData<T>(payload: T | { data: T }): T {
  if (payload && typeof payload === 'object' && 'data' in payload) return (payload as { data: T }).data;
  return payload as T;
}

function roomList(payload: unknown): RoomSummary[] {
  const data = payloadData(payload as RoomSummary[] | { rooms: RoomSummary[] });
  const raw = Array.isArray(data) ? data : (data as { rooms?: RoomSummary[] })?.rooms ?? [];
  return raw.map((room) => normalizeRoomSummary(room as RoomSummary & Record<string, unknown>));
}

export class RealtimeClient {
  private socket: Socket | null = null;
  private currentRoomId: string | null = null;
  private gameActionContext: {
    roomId: string;
    expectedRevision: number;
    expectedPromptId: string;
  } | null = null;

  private setCurrentRoom(room: RoomDetail | null): void {
    const roomId = room?.id ?? null;
    if (this.currentRoomId !== roomId) this.gameActionContext = null;
    this.currentRoomId = roomId;
  }

  private rememberGameView(game: unknown | null): void {
    if (!this.currentRoomId || !game || typeof game !== 'object') {
      this.gameActionContext = null;
      return;
    }
    const { revision, actionPromptId } = game as { revision?: unknown; actionPromptId?: unknown };
    if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0 ||
        typeof actionPromptId !== 'string' || actionPromptId.length === 0) {
      this.gameActionContext = null;
      return;
    }
    this.gameActionContext = {
      roomId: this.currentRoomId,
      expectedRevision: revision,
      expectedPromptId: actionPromptId,
    };
  }

  connect(handlers: RealtimeHandlers): void {
    this.disconnect();
    const socket = io({
      withCredentials: true,
      reconnection: true,
      reconnectionDelayMax: 4_000,
    });
    this.socket = socket;

    socket.on('connect', () => {
      this.gameActionContext = null;
      handlers.onConnectionChange(true);
    });
    socket.on('disconnect', () => {
      this.gameActionContext = null;
      handlers.onConnectionChange(false);
    });
    socket.on('connect_error', () => {
      this.gameActionContext = null;
      handlers.onConnectionChange(false);
    });
    socket.on('rooms:update', (payload: unknown) => handlers.onRooms(roomList(payload)));
    socket.on('room:update', (payload: unknown) => {
      const data = payloadData(payload as RoomDetail | { room: RoomDetail | null } | null);
      const room = data && typeof data === 'object' && 'room' in data ? data.room : data;
      const normalized = room ? normalizeRoomDetail(room as RoomDetail & Record<string, unknown>) : null;
      this.setCurrentRoom(normalized);
      handlers.onRoom(normalized);
    });
    socket.on('game:view', (payload: unknown) => {
      const data = payloadData(payload as unknown | { game: unknown | null } | null);
      const game = data && typeof data === 'object' && 'game' in data ? data.game : data;
      this.rememberGameView(game ?? null);
      handlers.onGame(game ?? null);
    });
    socket.on('game:log', (payload: unknown) => {
      const log = payloadData(payload as GameLogEntry);
      handlers.onLog(log);
    });
    socket.on('state', (payload: unknown) => {
      const state = payloadData(payload as ServerState);
      if (state.rooms) handlers.onRooms(roomList(state.rooms));
      if ('room' in state) {
        const room = state.room ? normalizeRoomDetail(state.room as RoomDetail & Record<string, unknown>) : null;
        this.setCurrentRoom(room);
        handlers.onRoom(room);
      }
      if ('game' in state) {
        this.rememberGameView(state.game ?? null);
        handlers.onGame(state.game ?? null);
      }
    });
    socket.on('server:error', (payload: unknown) => {
      const data = payloadData(payload as { message?: string } | string);
      handlers.onError(typeof data === 'string' ? data : data.message ?? '服务器发生错误');
    });
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.currentRoomId = null;
    this.gameActionContext = null;
  }

  sendGameAction(roomId: string, action: GameAction): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        reject(new Error('连接已断开，正在尝试重连'));
        return;
      }
      const context = this.gameActionContext;
      if (!context || context.roomId !== roomId) {
        reject(new Error('当前游戏状态尚未同步，请稍后重试'));
        return;
      }
      this.socket.timeout(8_000).emit('game:action', {
        roomId,
        expectedRevision: context.expectedRevision,
        expectedPromptId: context.expectedPromptId,
        action,
      }, (error: Error | null, ack?: unknown) => {
        if (error) {
          reject(new Error('操作超时，请重试'));
          return;
        }
        const result = ack as { ok?: boolean; error?: { message?: string } } | undefined;
        if (result?.ok === false) {
          reject(new Error(result.error?.message ?? '该操作当前不可用'));
          return;
        }
        resolve();
      });
    });
  }
}

export const realtime = new RealtimeClient();
