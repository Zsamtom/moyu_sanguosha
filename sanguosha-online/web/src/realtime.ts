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

  connect(handlers: RealtimeHandlers): void {
    this.disconnect();
    const socket = io({
      withCredentials: true,
      reconnection: true,
      reconnectionDelayMax: 4_000,
    });
    this.socket = socket;

    socket.on('connect', () => handlers.onConnectionChange(true));
    socket.on('disconnect', () => handlers.onConnectionChange(false));
    socket.on('connect_error', () => handlers.onConnectionChange(false));
    socket.on('rooms:update', (payload: unknown) => handlers.onRooms(roomList(payload)));
    socket.on('room:update', (payload: unknown) => {
      const data = payloadData(payload as RoomDetail | { room: RoomDetail | null } | null);
      const room = data && typeof data === 'object' && 'room' in data ? data.room : data;
      handlers.onRoom(room ? normalizeRoomDetail(room as RoomDetail & Record<string, unknown>) : null);
    });
    socket.on('game:view', (payload: unknown) => {
      const data = payloadData(payload as unknown | { game: unknown | null } | null);
      const game = data && typeof data === 'object' && 'game' in data ? data.game : data;
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
        handlers.onRoom(state.room ? normalizeRoomDetail(state.room as RoomDetail & Record<string, unknown>) : null);
      }
      if ('game' in state) handlers.onGame(state.game ?? null);
    });
    socket.on('server:error', (payload: unknown) => {
      const data = payloadData(payload as { message?: string } | string);
      handlers.onError(typeof data === 'string' ? data : data.message ?? '服务器发生错误');
    });
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  sendGameAction(roomId: string, action: GameAction): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        reject(new Error('连接已断开，正在尝试重连'));
        return;
      }
      this.socket.timeout(8_000).emit('game:action', { roomId, action }, (error: Error | null, ack?: unknown) => {
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
