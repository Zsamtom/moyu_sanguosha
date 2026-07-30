import type { AuthUser, BotIntelligence, BotMode, DeepSeekModel, DoudizhuLlmRecommendation, FarmActionSnapshot, FarmClientAction, FarmGameView, FarmNeighborSummary, FarmSnapshot, FarmVisitClientAction, FarmVisitSnapshot, FullGeneralId, GameType, HomesteadClientAction, HomesteadSnapshot, LlmConnectionTestResult, LlmSettings, MineClientAction, MineSnapshot, PlayableFaction, RanchActionSnapshot, RanchClientAction, RanchGameView, RanchNeighborSummary, RanchSnapshot, RanchVisitClientAction, RanchVisitSnapshot, RoomDetail, RoomRuleConfig, RoomSummary, UpdateLlmSettings } from './types';
import { normalizeRoomDetail, normalizeRoomSummary } from './types';

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

function unwrap<T>(value: unknown): T {
  if (value && typeof value === 'object' && 'data' in value) {
    return (value as { data: T }).data;
  }
  return value as T;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });

  const contentType = response.headers.get('content-type') ?? '';
  const body: unknown = contentType.includes('application/json') ? await response.json() : null;
  if (!response.ok) {
    const errorBody = (body && typeof body === 'object' && 'error' in body
      ? (body as { error: unknown }).error
      : body) as { message?: string; code?: string } | null;
    throw new ApiError(errorBody?.message ?? `请求失败（${response.status}）`, response.status, errorBody?.code);
  }
  return unwrap<T>(body);
}

function jsonBody(value: unknown): RequestInit {
  return { body: JSON.stringify(value) };
}

function extractUser(value: AuthUser | { user: AuthUser }): AuthUser {
  return 'user' in value ? value.user : value;
}

function extractRoom(value: RoomDetail | { room: RoomDetail }): RoomDetail {
  return 'room' in value ? value.room : value;
}

export const api = {
  async login(username: string, password: string): Promise<AuthUser> {
    const result = await request<AuthUser | { user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      ...jsonBody({ username, password }),
    });
    return extractUser(result);
  },

  async logout(): Promise<void> {
    await request('/api/auth/logout', { method: 'POST' });
  },

  async me(): Promise<AuthUser> {
    const result = await request<AuthUser | { user: AuthUser }>('/api/auth/me');
    return extractUser(result);
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<AuthUser> {
    const result = await request<AuthUser | { user: AuthUser }>('/api/auth/change-password', {
      method: 'POST',
      ...jsonBody({ currentPassword, newPassword }),
    });
    return extractUser(result);
  },

  async listRooms(): Promise<{ rooms: RoomSummary[]; currentRoom: RoomDetail | null }> {
    const result = await request<
      RoomSummary[] | { rooms: RoomSummary[]; currentRoom?: RoomDetail | null }
    >('/api/rooms');
    const rooms = Array.isArray(result) ? result : result.rooms;
    const currentRoom = Array.isArray(result) ? null : result.currentRoom ?? null;
    return {
      rooms: rooms.map((room) => normalizeRoomSummary(room as RoomSummary & Record<string, unknown>)),
      currentRoom: currentRoom
        ? normalizeRoomDetail(currentRoom as RoomDetail & Record<string, unknown>)
        : null,
    };
  },

  async createRoom(
    name: string,
    maxPlayers: number,
    ruleConfig?: RoomRuleConfig,
    botIntelligence: BotIntelligence = 3,
    gameType: GameType = 'sanguosha',
    botMode: BotMode = 'rules',
    digitBombDigits?: number,
  ): Promise<RoomDetail> {
    const result = await request<RoomDetail | { room: RoomDetail }>('/api/rooms', {
      method: 'POST',
      ...jsonBody({
        name,
        maxPlayers,
        botIntelligence,
        ...(gameType !== 'sanguosha' ? { gameType } : {}),
        ...(gameType !== 'gouji' &&
          gameType !== 'splendor' &&
          gameType !== 'splendor_pokemon' &&
          gameType !== 'digit_bomb' &&
          gameType !== 'number_connect' &&
          botMode === 'llm'
          ? { botMode }
          : {}),
        ...(gameType === 'sanguosha' && ruleConfig ? { ruleConfig } : {}),
        ...(gameType === 'digit_bomb' ? { digitBombDigits: digitBombDigits ?? 4 } : {}),
      }),
    });
    return normalizeRoomDetail(extractRoom(result) as RoomDetail & Record<string, unknown>);
  },

  async joinRoom(roomId: string): Promise<RoomDetail> {
    const result = await request<RoomDetail | { room: RoomDetail }>(`/api/rooms/${encodeURIComponent(roomId)}/join`, {
      method: 'POST',
    });
    return normalizeRoomDetail(extractRoom(result) as RoomDetail & Record<string, unknown>);
  },

  async leaveRoom(roomId: string): Promise<void> {
    await request(`/api/rooms/${encodeURIComponent(roomId)}/leave`, { method: 'POST' });
  },

  async setReady(roomId: string, ready: boolean): Promise<RoomDetail | null> {
    const result = await request<RoomDetail | { room: RoomDetail } | null>(
      `/api/rooms/${encodeURIComponent(roomId)}/ready`,
      { method: 'POST', ...jsonBody({ ready }) },
    );
    return result ? normalizeRoomDetail(extractRoom(result) as RoomDetail & Record<string, unknown>) : null;
  },

  async startRoom(roomId: string): Promise<RoomDetail> {
    const result = await request<RoomDetail | { room: RoomDetail }>(`/api/rooms/${encodeURIComponent(roomId)}/start`, { method: 'POST' });
    return normalizeRoomDetail(extractRoom(result) as RoomDetail & Record<string, unknown>);
  },

  async rematchRoom(roomId: string): Promise<RoomDetail> {
    const result = await request<RoomDetail | { room: RoomDetail }>(
      `/api/rooms/${encodeURIComponent(roomId)}/rematch`,
      { method: 'POST' },
    );
    return normalizeRoomDetail(extractRoom(result) as RoomDetail & Record<string, unknown>);
  },

  async chooseGeneral(roomId: string, generalId: FullGeneralId): Promise<RoomDetail> {
    const result = await request<RoomDetail | { room: RoomDetail }>(
      `/api/rooms/${encodeURIComponent(roomId)}/draft/general`,
      { method: 'POST', ...jsonBody({ generalId }) },
    );
    return normalizeRoomDetail(extractRoom(result) as RoomDetail & Record<string, unknown>);
  },

  async chooseGodFaction(roomId: string, faction: PlayableFaction): Promise<RoomDetail> {
    const result = await request<RoomDetail | { room: RoomDetail }>(
      `/api/rooms/${encodeURIComponent(roomId)}/draft/god-faction`,
      { method: 'POST', ...jsonBody({ faction }) },
    );
    return normalizeRoomDetail(extractRoom(result) as RoomDetail & Record<string, unknown>);
  },

  async addBot(roomId: string): Promise<RoomDetail> {
    const result = await request<RoomDetail | { room: RoomDetail }>(`/api/rooms/${encodeURIComponent(roomId)}/bots`, { method: 'POST' });
    return normalizeRoomDetail(extractRoom(result) as RoomDetail & Record<string, unknown>);
  },

  async removeBot(roomId: string, botId: string): Promise<RoomDetail> {
    const result = await request<RoomDetail | { room: RoomDetail }>(
      `/api/rooms/${encodeURIComponent(roomId)}/bots/${encodeURIComponent(botId)}`,
      { method: 'DELETE' },
    );
    return normalizeRoomDetail(extractRoom(result) as RoomDetail & Record<string, unknown>);
  },

  async getDoudizhuLlmRecommendation(
    roomId: string,
  ): Promise<DoudizhuLlmRecommendation> {
    const result = await request<
      DoudizhuLlmRecommendation |
      { recommendation: DoudizhuLlmRecommendation }
    >(
      `/api/rooms/${encodeURIComponent(roomId)}/llm-recommendation`,
      { method: 'POST' },
    );
    return 'recommendation' in result ? result.recommendation : result;
  },

  async getFarm(): Promise<FarmSnapshot> {
    return request<FarmSnapshot>('/api/farm');
  },

  async applyFarmAction(
    expectedRevision: number,
    action: FarmClientAction,
  ): Promise<FarmActionSnapshot> {
    return request<FarmActionSnapshot>('/api/farm/actions', {
      method: 'POST',
      ...jsonBody({ expectedRevision, action }),
    });
  },

  async getFarmNeighbors(): Promise<FarmNeighborSummary[]> {
    const result = await request<{ neighbors: FarmNeighborSummary[] }>('/api/farm/neighbors');
    return result.neighbors;
  },

  async getFarmNeighbor(userId: string): Promise<FarmGameView> {
    const result = await request<{ farm: FarmGameView }>(
      `/api/farm/neighbors/${encodeURIComponent(userId)}`,
    );
    return result.farm;
  },

  async applyFarmVisitAction(
    neighborId: string,
    expectedRevision: number,
    expectedNeighborRevision: number,
    action: FarmVisitClientAction,
  ): Promise<FarmVisitSnapshot> {
    return request<FarmVisitSnapshot>(
      `/api/farm/neighbors/${encodeURIComponent(neighborId)}/actions`,
      {
      method: 'POST',
        ...jsonBody({ expectedRevision, expectedNeighborRevision, action }),
      },
    );
  },

  async getRanch(): Promise<RanchSnapshot> {
    return request<RanchSnapshot>('/api/ranch');
  },

  async applyRanchAction(
    expectedFarmRevision: number,
    expectedRanchRevision: number,
    action: RanchClientAction,
  ): Promise<RanchActionSnapshot> {
    return request<RanchActionSnapshot>('/api/ranch/actions', {
      method: 'POST',
      ...jsonBody({ expectedFarmRevision, expectedRanchRevision, action }),
    });
  },

  async getRanchNeighbors(): Promise<RanchNeighborSummary[]> {
    const result = await request<{ neighbors: RanchNeighborSummary[] }>(
      '/api/ranch/neighbors',
    );
    return result.neighbors;
  },

  async getRanchNeighbor(userId: string): Promise<RanchGameView> {
    const result = await request<{ ranch: RanchGameView }>(
      `/api/ranch/neighbors/${encodeURIComponent(userId)}`,
    );
    return result.ranch;
  },

  async applyRanchVisitAction(
    neighborId: string,
    expectedRanchRevision: number,
    expectedNeighborRevision: number,
    action: RanchVisitClientAction,
  ): Promise<RanchVisitSnapshot> {
    return request<RanchVisitSnapshot>(
      `/api/ranch/neighbors/${encodeURIComponent(neighborId)}/actions`,
      {
        method: 'POST',
        ...jsonBody({
          expectedRanchRevision,
          expectedNeighborRevision,
          action,
        }),
      },
    );
  },

  async getMine(): Promise<MineSnapshot> {
    return request<MineSnapshot>('/api/mine');
  },

  async applyMineAction(
    expectedFarmRevision: number,
    expectedRanchRevision: number,
    expectedMineRevision: number,
    action: MineClientAction,
  ): Promise<MineSnapshot> {
    return request<MineSnapshot>('/api/mine/actions', {
      method: 'POST',
      ...jsonBody({
        expectedFarmRevision,
        expectedRanchRevision,
        expectedMineRevision,
        action,
      }),
    });
  },

  async getHomestead(): Promise<HomesteadSnapshot> {
    return request<HomesteadSnapshot>('/api/homestead');
  },

  async applyHomesteadAction(
    snapshot: HomesteadSnapshot,
    action: HomesteadClientAction,
  ): Promise<HomesteadSnapshot> {
    return request<HomesteadSnapshot>('/api/homestead/actions', {
      method: 'POST',
      ...jsonBody({
        expectedFarmRevision: snapshot.homestead.revisions.farm,
        expectedRanchRevision: snapshot.homestead.revisions.ranch,
        expectedMineRevision: snapshot.homestead.revisions.mine,
        expectedHomesteadRevision: snapshot.homestead.revision,
        action,
      }),
    });
  },

  async listUsers(): Promise<AuthUser[]> {
    const result = await request<AuthUser[] | { users: AuthUser[] }>('/api/admin/users');
    return Array.isArray(result) ? result : result.users;
  },

  async getLlmSettings(): Promise<LlmSettings> {
    const result = await request<LlmSettings | { settings: LlmSettings }>('/api/admin/llm-settings');
    return 'settings' in result ? result.settings : result;
  },

  async updateLlmSettings(input: UpdateLlmSettings): Promise<LlmSettings> {
    const result = await request<LlmSettings | { settings: LlmSettings }>('/api/admin/llm-settings', {
      method: 'PUT',
      ...jsonBody(input),
    });
    return 'settings' in result ? result.settings : result;
  },

  async testLlmConnection(
    apiKey?: string,
    model?: DeepSeekModel,
  ): Promise<LlmConnectionTestResult> {
    const result = await request<LlmConnectionTestResult | { result: LlmConnectionTestResult }>(
      '/api/admin/llm-settings/test',
      {
        method: 'POST',
        ...jsonBody({
          ...(apiKey?.trim() ? { apiKey: apiKey.trim() } : {}),
          ...(model ? { model } : {}),
        }),
      },
    );
    return 'result' in result ? result.result : result;
  },

  async createUser(input: {
    username: string;
    displayName: string;
    password: string;
  }): Promise<AuthUser> {
    const result = await request<AuthUser | { user: AuthUser }>('/api/admin/users', {
      method: 'POST',
      ...jsonBody(input),
    });
    return extractUser(result);
  },

  async setUserDisabled(userId: string, disabled: boolean): Promise<AuthUser> {
    const result = await request<AuthUser | { user: AuthUser }>(
      `/api/admin/users/${encodeURIComponent(userId)}/status`,
      { method: 'PATCH', ...jsonBody({ disabled }) },
    );
    return extractUser(result);
  },

  async setUserDisplayName(userId: string, displayName: string): Promise<AuthUser> {
    const result = await request<AuthUser | { user: AuthUser }>(
      `/api/admin/users/${encodeURIComponent(userId)}/display-name`,
      { method: 'PATCH', ...jsonBody({ displayName }) },
    );
    return extractUser(result);
  },

  async deleteUser(userId: string): Promise<void> {
    await request(`/api/admin/users/${encodeURIComponent(userId)}`, { method: 'DELETE' });
  },

  async resetPassword(userId: string, password: string): Promise<AuthUser> {
    const result = await request<AuthUser | { user: AuthUser }>(
      `/api/admin/users/${encodeURIComponent(userId)}/reset-password`,
      {
        method: 'POST',
        ...jsonBody({ password }),
      },
    );
    return extractUser(result);
  },
};

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return '操作失败，请稍后重试';
}
