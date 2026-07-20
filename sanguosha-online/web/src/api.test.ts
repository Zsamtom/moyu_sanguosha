import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import type { RoomRuleConfig } from './types';

const ruleConfig: RoomRuleConfig = {
  ruleSetVersion: 'original-66-v1',
  enabledGeneralPacks: ['standard', 'sp', 'wind'],
  generalSelection: { mode: 'choice', candidatesPerPlayer: 2, allowDuplicateGenerals: false },
  deckProfile: 'original-160',
  maximumReshuffles: 5,
  lordBonusMinimumPlayers: 5,
  godFactionChoice: true,
};

function roomPayload(status: 'waiting' | 'drafting' | 'playing' = 'drafting') {
  return {
    id: 'room-1',
    name: '风火选将',
    ownerId: 'user-1',
    ownerName: '玄德',
    status,
    playerCount: 2,
    maxPlayers: 5,
    players: [
      { id: 'user-1', username: 'liubei', displayName: '玄德', ready: true, connected: true, seat: 0 },
      { id: 'user-2', username: 'guanyu', displayName: '云长', ready: true, connected: true, seat: 1 },
    ],
    ruleConfig,
    ...(status === 'drafting' ? {
      draft: {
        stage: 'selecting_generals' as const,
        currentPlayerId: 'user-1',
        playerIds: ['user-1', 'user-2'],
        candidates: ['cao_cao', 'liu_bei'] as const,
        players: [
          { playerId: 'user-1', role: 'lord' as const, selected: false, generalId: null, needsFaction: false, faction: null },
          { playerId: 'user-2', role: 'rebel' as const, selected: false, generalId: null, needsFaction: false, faction: null },
        ],
      },
    } : {}),
  };
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => vi.unstubAllGlobals());

describe('room draft API', () => {
  it('keeps existing room creation calls compatible and optionally sends rule configuration', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ room: roomPayload('waiting') }))
      .mockResolvedValueOnce(jsonResponse({ room: roomPayload('waiting') }));
    vi.stubGlobal('fetch', fetchMock);

    await api.createRoom('默认规则', 5);
    const configured = await api.createRoom('风火选将', 5, ruleConfig, 7);

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ name: '默认规则', maxPlayers: 5, botIntelligence: 3 });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({ name: '风火选将', maxPlayers: 5, botIntelligence: 7, ruleConfig });
    expect(configured.ruleConfig).toEqual(ruleConfig);
  });

  it('returns the private room projection when starting a choice-mode room', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ room: roomPayload() }));
    vi.stubGlobal('fetch', fetchMock);

    const room = await api.startRoom('room/with space');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/rooms/room%2Fwith%20space/start',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(room).toMatchObject({ status: 'drafting', draft: { candidates: ['cao_cao', 'liu_bei'] } });
  });

  it('submits general and God faction selections to the authoritative room endpoints', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ room: roomPayload() }))
      .mockResolvedValueOnce(jsonResponse({ room: roomPayload('playing') }));
    vi.stubGlobal('fetch', fetchMock);

    const selected = await api.chooseGeneral('room-1', 'cao_cao');
    const started = await api.chooseGodFaction('room-1', 'wu');

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/rooms/room-1/draft/general');
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ generalId: 'cao_cao' });
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/rooms/room-1/draft/god-faction');
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({ faction: 'wu' });
    expect(selected.draft?.candidates).toEqual(['cao_cao', 'liu_bei']);
    expect(started).toMatchObject({ status: 'playing' });
  });
});
