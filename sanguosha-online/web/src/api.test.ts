import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import type { HomesteadSnapshot, RestaurantSnapshot, RoomRuleConfig } from './types';

const ruleConfig: RoomRuleConfig = {
  ruleSetVersion: 'original-66-v1',
  enabledGeneralPacks: ['standard', 'sp', 'wind'],
  generalSelection: { mode: 'choice', candidatesPerPlayer: 2, allowDuplicateGenerals: false },
  deckProfile: 'original-160',
  maximumReshuffles: 5,
  lordBonusMinimumPlayers: 5,
  godFactionChoice: true,
};

function roomPayload(status: 'waiting' | 'drafting' | 'playing' | 'finished' = 'drafting') {
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

describe('account API', () => {
  it('registers with the invitation and updates the current user profile', async () => {
    const user = {
      id: 'user-1',
      username: 'new_player',
      displayName: '新玩家',
      role: 'player' as const,
      disabled: false,
      mustChangePassword: false,
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ user }))
      .mockResolvedValueOnce(jsonResponse({ user: { ...user, displayName: '新昵称' } }));
    vi.stubGlobal('fetch', fetchMock);

    const registered = await api.register({
      invitationCode: 'moyu2026',
      username: 'new_player',
      password: 'new-player-password',
    });
    const updated = await api.updateProfile({ displayName: '新昵称' });

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/auth/register', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({
        invitationCode: 'moyu2026',
        username: 'new_player',
        password: 'new-player-password',
      }),
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/auth/profile', expect.objectContaining({
      method: 'PATCH',
      credentials: 'include',
      body: JSON.stringify({ displayName: '新昵称' }),
    }));
    expect(registered).toEqual(user);
    expect(updated.displayName).toBe('新昵称');
  });
});

describe('room draft API', () => {
  it('keeps existing room creation calls compatible and optionally sends rule configuration', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ room: roomPayload('waiting') }))
      .mockResolvedValueOnce(jsonResponse({ room: roomPayload('waiting') }))
      .mockResolvedValueOnce(jsonResponse({ room: roomPayload('waiting') }))
      .mockResolvedValueOnce(jsonResponse({
        room: { ...roomPayload('waiting'), gameType: 'gouji', maxPlayers: 6 },
      }))
      .mockResolvedValueOnce(jsonResponse({
        room: { ...roomPayload('waiting'), gameType: 'doudizhu', maxPlayers: 3 },
      }))
      .mockResolvedValueOnce(jsonResponse({
        room: { ...roomPayload('waiting'), gameType: 'splendor', maxPlayers: 4 },
      }))
      .mockResolvedValueOnce(jsonResponse({
        room: { ...roomPayload('waiting'), gameType: 'splendor_pokemon', maxPlayers: 4 },
      }))
      .mockResolvedValueOnce(jsonResponse({
        room: {
          ...roomPayload('waiting'),
          gameType: 'digit_bomb',
          maxPlayers: 2,
          digitBombDigits: 6,
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        room: { ...roomPayload('waiting'), gameType: 'number_connect', maxPlayers: 2 },
      }));
    vi.stubGlobal('fetch', fetchMock);

    await api.createRoom('默认规则', 5);
    const configured = await api.createRoom('风火选将', 5, ruleConfig, 7);
    await api.createRoom('三国杀大模型', 5, ruleConfig, 6, 'sanguosha', 'llm');
    // The lobby can still hold preserved Sanguosha fields after switching the
    // game selector. Gouji requests must never forward that unrelated config.
    const gouji = await api.createRoom('够级房', 6, ruleConfig, 5, 'gouji');
    const doudizhu = await api.createRoom('斗地主房', 3, ruleConfig, 4, 'doudizhu', 'llm');
    const splendor = await api.createRoom('璀璨宝石房', 4, ruleConfig, 4, 'splendor', 'llm');
    const pokemon = await api.createRoom('璀璨宝石宝可梦房', 4, ruleConfig, 4, 'splendor_pokemon', 'llm');
    const digitBomb = await api.createRoom('数字炸弹房', 2, ruleConfig, 5, 'digit_bomb', 'llm', 6);
    const numberConnect = await api.createRoom('数字连连看房', 2, ruleConfig, 4, 'number_connect', 'llm');

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ name: '默认规则', maxPlayers: 5, botIntelligence: 3 });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({ name: '风火选将', maxPlayers: 5, botIntelligence: 7, ruleConfig });
    expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toEqual({
      name: '三国杀大模型',
      maxPlayers: 5,
      botIntelligence: 6,
      botMode: 'llm',
      ruleConfig,
    });
    expect(JSON.parse(String(fetchMock.mock.calls[3]?.[1]?.body))).toEqual({
      name: '够级房',
      maxPlayers: 6,
      botIntelligence: 5,
      gameType: 'gouji',
    });
    expect(JSON.parse(String(fetchMock.mock.calls[4]?.[1]?.body))).toEqual({
      name: '斗地主房',
      maxPlayers: 3,
      botIntelligence: 4,
      gameType: 'doudizhu',
      botMode: 'llm',
    });
    expect(JSON.parse(String(fetchMock.mock.calls[5]?.[1]?.body))).toEqual({
      name: '璀璨宝石房',
      maxPlayers: 4,
      botIntelligence: 4,
      gameType: 'splendor',
    });
    expect(JSON.parse(String(fetchMock.mock.calls[6]?.[1]?.body))).toEqual({
      name: '璀璨宝石宝可梦房',
      maxPlayers: 4,
      botIntelligence: 4,
      gameType: 'splendor_pokemon',
    });
    expect(JSON.parse(String(fetchMock.mock.calls[7]?.[1]?.body))).toEqual({
      name: '数字炸弹房',
      maxPlayers: 2,
      botIntelligence: 5,
      gameType: 'digit_bomb',
      digitBombDigits: 6,
    });
    expect(JSON.parse(String(fetchMock.mock.calls[8]?.[1]?.body))).toEqual({
      name: '数字连连看房',
      maxPlayers: 2,
      botIntelligence: 4,
      gameType: 'number_connect',
    });
    expect(configured.ruleConfig).toEqual(ruleConfig);
    expect(gouji).toMatchObject({ gameType: 'gouji', maxPlayers: 6 });
    expect(doudizhu).toMatchObject({ gameType: 'doudizhu', maxPlayers: 3 });
    expect(splendor).toMatchObject({ gameType: 'splendor', maxPlayers: 4, botMode: 'rules' });
    expect(pokemon).toMatchObject({ gameType: 'splendor_pokemon', maxPlayers: 4, botMode: 'rules' });
    expect(digitBomb).toMatchObject({
      gameType: 'digit_bomb',
      maxPlayers: 2,
      botMode: 'rules',
      digitBombDigits: 6,
    });
    expect(numberConnect).toMatchObject({
      gameType: 'number_connect',
      maxPlayers: 2,
      botMode: 'rules',
    });
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

  it('confirms a Doudizhu rematch through the room endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      room: { ...roomPayload('playing'), gameType: 'doudizhu', maxPlayers: 3 },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const room = await api.rematchRoom('room/03');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/rooms/room%2F03/rematch',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(room).toMatchObject({ gameType: 'doudizhu', status: 'playing' });
  });

  it('requests a private Doudizhu LLM recommendation without submitting an action', async () => {
    const recommendation = {
      action: {
        type: 'doudizhu_play' as const,
        playerId: 'user-1',
        cardIds: ['card-1'],
      },
      source: 'llm' as const,
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ recommendation }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await api.getDoudizhuLlmRecommendation('room/03');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/rooms/room%2F03/llm-recommendation',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result).toEqual(recommendation);
  });
});

describe('farm API', () => {
  it('submits an owner action and accepts the lightweight action snapshot', async () => {
    const payload = {
      farm: { version: 3, revision: 3 },
      marketDirectorAvailable: false,
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(payload));
    vi.stubGlobal('fetch', fetchMock);

    const result = await api.applyFarmAction(
      2,
      {
        type: 'farming_redeem_mutation',
        cropId: 'wheat',
        quantity: 1,
      },
      'greenvale',
    );

    expect(result).toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/farm/actions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          townId: 'greenvale',
          expectedRevision: 2,
          action: {
            type: 'farming_redeem_mutation',
            cropId: 'wheat',
            quantity: 1,
          },
        }),
      }),
    );
  });

  it('submits a cross-account farm action with both optimistic revisions', async () => {
    const payload = {
      farm: { version: 3 },
      neighbor: { version: 3 },
      neighbors: [],
      outcome: 'helped',
      marketDirectorAvailable: false,
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(payload));
    vi.stubGlobal('fetch', fetchMock);

    await api.applyFarmVisitAction(
      'neighbor/with space',
      12,
      7,
      {
        type: 'farming_help',
        care: 'water',
        plotIndex: 2,
      },
      'greenvale',
    );

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/farm/neighbors/neighbor%2Fwith%20space/actions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          townId: 'greenvale',
          expectedRevision: 12,
          expectedNeighborRevision: 7,
          action: {
            type: 'farming_help',
            care: 'water',
            plotIndex: 2,
          },
        }),
      }),
    );
  });
});

describe('ranch API', () => {
  it('submits linked actions with farm and ranch optimistic revisions', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      ranch: { version: 2 },
      neighbors: [],
    }));
    vi.stubGlobal('fetch', fetchMock);

    await api.applyRanchAction(
      14,
      6,
      { type: 'ranch_feed', penIndex: 1 },
      'frostpeak',
    );

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ranch/actions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          townId: 'frostpeak',
          expectedFarmRevision: 14,
          expectedRanchRevision: 6,
          action: { type: 'ranch_feed', penIndex: 1 },
        }),
      }),
    );
  });

  it('submits cross-account ranch actions with both ranch revisions', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      ranch: { version: 2 },
      neighbor: { version: 2 },
      neighbors: [],
      outcome: 'collected',
    }));
    vi.stubGlobal('fetch', fetchMock);

    await api.applyRanchVisitAction(
      'neighbor/with space',
      9,
      12,
      { type: 'ranch_neighbor_collect', penIndex: 0 },
      'frostpeak',
    );

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ranch/neighbors/neighbor%2Fwith%20space/actions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          townId: 'frostpeak',
          expectedRanchRevision: 9,
          expectedNeighborRevision: 12,
          action: { type: 'ranch_neighbor_collect', penIndex: 0 },
        }),
      }),
    );
  });
});

describe('mine API', () => {
  it('submits actions with farm, ranch and mine optimistic revisions', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      mine: { version: 2 },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await api.applyMineAction(
      18,
      9,
      4,
      { type: 'mine_start', depositId: 'iron', shaftIndex: 1 },
      'greenvale',
    );

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/mine/actions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          townId: 'greenvale',
          expectedFarmRevision: 18,
          expectedRanchRevision: 9,
          expectedMineRevision: 4,
          action: {
            type: 'mine_start',
            depositId: 'iron',
            shaftIndex: 1,
          },
        }),
      }),
    );
  });
});

describe('homestead API', () => {
  it('submits linked actions with all four optimistic revisions', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse({
      homestead: { version: 1 },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const snapshot = {
      homestead: {
        revision: 7,
        accountRevision: 11,
        activeTownId: 'frostpeak',
        revisions: {
          farm: 18,
          ranch: 9,
          mine: 4,
        },
      },
    } as HomesteadSnapshot;

    await api.applyHomesteadAction(snapshot, {
      type: 'homestead_start_job',
      recipeId: 'fertilizer_soil_conditioner',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/homestead/actions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          townId: 'frostpeak',
          expectedFarmRevision: 18,
          expectedRanchRevision: 9,
          expectedMineRevision: 4,
          expectedHomesteadRevision: 7,
          expectedAccountRevision: 11,
          action: {
            type: 'homestead_start_job',
            recipeId: 'fertilizer_soil_conditioner',
          },
        }),
      }),
    );

    await api.applyHomesteadAction(snapshot, {
      type: 'homestead_talk_npc',
      npcId: 'agronomist_lin',
      topicId: 'rotation',
    });

    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/homestead/actions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          townId: 'frostpeak',
          expectedFarmRevision: 18,
          expectedRanchRevision: 9,
          expectedMineRevision: 4,
          expectedHomesteadRevision: 7,
          expectedAccountRevision: 11,
          action: {
            type: 'homestead_talk_npc',
            npcId: 'agronomist_lin',
            topicId: 'rotation',
          },
        }),
      }),
    );
  });
});

describe('restaurant API', () => {
  it('submits account, restaurant and source-town revision vectors', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse({
      restaurant: { version: 1 },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const snapshot = {
      accountRevision: 8,
      restaurant: { revision: 5 },
      supplySources: [{
        townId: 'frostpeak',
        farmRevision: 12,
        ranchRevision: 9,
        mineRevision: 6,
        homesteadRevision: 4,
        lines: [],
      }],
    } as unknown as RestaurantSnapshot;

    await api.applyRestaurantAction(snapshot, {
      type: 'restaurant_set_menu',
      recipeIds: ['tomato_carrot_salad'],
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/restaurant/actions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          expectedAccountRevision: 8,
          expectedRestaurantRevision: 5,
          action: {
            type: 'restaurant_set_menu',
            recipeIds: ['tomato_carrot_salad'],
          },
        }),
      }),
    );

    await api.supplyRestaurantFromTown(snapshot, {
      type: 'restaurant_supply_from_town',
      sourceTownId: 'frostpeak',
      lines: [{ source: 'farm', itemId: 'cloudberry', quantity: 2 }],
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/restaurant/actions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          expectedAccountRevision: 8,
          expectedRestaurantRevision: 5,
          expectedFarmRevision: 12,
          expectedRanchRevision: 9,
          expectedMineRevision: 6,
          expectedHomesteadRevision: 4,
          action: {
            type: 'restaurant_supply_from_town',
            sourceTownId: 'frostpeak',
            lines: [{ source: 'farm', itemId: 'cloudberry', quantity: 2 }],
          },
        }),
      }),
    );
  });
});

describe('LLM governance API', () => {
  it('loads the administrator usage snapshot without exposing prompts', async () => {
    const usage = {
      policy: {
        dailyCallLimitPerUser: 8,
        dailyTokenLimitPerUser: 40_000,
        circuitFailureThreshold: 3,
        circuitCooldownMs: 300_000,
      },
      rolling24Hours: {
        calls: 1,
        successes: 1,
        fallbacks: 0,
        failures: 0,
        skipped: 0,
        promptTokens: 120,
        completionTokens: 20,
      },
      circuit: {
        open: false,
        retryAt: null,
        consecutiveFailures: 0,
      },
      recent: [],
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ usage }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.getLlmUsage()).resolves.toEqual(usage);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/llm-usage',
      expect.objectContaining({ credentials: 'include' }),
    );
  });
});
