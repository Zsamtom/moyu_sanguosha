import { describe, expect, it } from 'vitest';
import { RealtimeClient } from './realtime';
import {
  isDigitBombGameView,
  isDoudizhuGameView,
  isGoujiGameView,
  isNumberConnectGameView,
  isSplendorGameView,
  normalizeGameView,
  normalizeRoomDetail,
  type GameAction,
} from './types';

describe('server payload adapters', () => {
  it('normalizes the server room view and identifies the owner', () => {
    const room = normalizeRoomDetail({
      id: 'room-1',
      name: '桃园结义',
      ownerId: 'user-1',
      ownerName: '玄德',
      status: 'waiting',
      playerCount: 2,
      maxPlayers: 5,
      players: [
        { id: 'user-1', username: 'liubei', displayName: '玄德', ready: true, connected: true, seat: 0 },
        { id: 'user-2', username: 'guanyu', displayName: '云长', ready: false, connected: false, seat: 1 },
      ],
    });

    expect(room.hostId).toBe('user-1');
    expect(room.hostName).toBe('玄德');
      expect(room.botIntelligence).toBe(3);
      expect(room.botMode).toBe('rules');
      expect(room.llmBot).toMatchObject({ available: false, usage: { calls: 0 } });
      expect(room.chatMessages).toEqual([]);
      expect(room.members[0]).toMatchObject({ userId: 'user-1', isHost: true, online: true });
    expect(room.members[1]).toMatchObject({ userId: 'user-2', isHost: false, online: false });
  });

  it('preserves the Gouji room discriminator and recognizes its private game view', () => {
    const room = normalizeRoomDetail({
      id: 'room-gouji',
      name: '够级',
      gameType: 'gouji',
      status: 'waiting',
      ownerId: 'user-1',
      maxPlayers: 6,
      players: [],
    });
    expect(room.gameType).toBe('gouji');
    expect(isGoujiGameView({
      kind: 'gouji',
      version: 1,
      revision: 0,
      actionPromptId: 'gouji:0:playing:user-1',
      status: 'playing',
      currentPlayerId: 'user-1',
      leadPlayerId: 'user-1',
      players: Array.from({ length: 6 }, (_, seat) => ({
        id: `user-${seat + 1}`,
        seat,
        name: `玩家${seat + 1}`,
        team: seat % 2 === 0 ? 'A' : 'B',
        handCount: 32,
        openedPoint: false,
        naturalPoint: false,
        burnCount: 0,
      })),
      prompt: {
        type: 'play',
        playerId: 'user-1',
        canPlay: true,
        canPass: false,
        canYield: false,
        mustIncludeJoker: false,
      },
      logs: [],
    })).toBe(true);
  });

  it('preserves the Doudizhu room discriminator and recognizes its private game view', () => {
    const room = normalizeRoomDetail({
      id: 'room-doudizhu',
      name: '斗地主',
      gameType: 'doudizhu',
      status: 'playing',
      ownerId: 'user-1',
      maxPlayers: 3,
      players: [],
    });
    expect(room.gameType).toBe('doudizhu');
    expect(isDoudizhuGameView({
      kind: 'doudizhu',
      version: 1,
      revision: 4,
      actionPromptId: 'doudizhu:4:playing:user-1:lead',
      status: 'playing',
      phase: 'playing',
      currentPlayerId: 'user-1',
      landlordId: 'user-1',
      players: Array.from({ length: 3 }, (_, seat) => ({
        id: `user-${seat + 1}`,
        seat,
        name: `玩家${seat + 1}`,
        role: seat === 0 ? 'landlord' : 'farmer',
        handCount: seat === 0 ? 20 : 17,
        playedCount: 0,
        beans: 10_000,
        beanDelta: 0,
      })),
      bottomCards: [],
        prompt: {
          type: 'play',
          playerId: 'user-1',
          bidOptions: [],
          canPlay: true,
          canPass: false,
          recommendation: { type: 'play', cardIds: ['card-1'] },
        },
      logs: [],
    })).toBe(true);
  });

  it('recognizes both Splendor views and requires the server privacy projection', () => {
    const players = Array.from({ length: 2 }, (_, seat) => ({
      id: `user-${seat + 1}`,
      seat,
      name: `玩家${seat + 1}`,
      tokens: {},
      bonuses: {},
      cards: [],
      evolvedCards: [],
      reservedCount: seat,
      ...(seat === 0 ? { reservedCards: [] } : {}),
      publicReservedCards: [],
      nobles: [],
      score: 0,
      evolutionCount: 0,
    }));
    const base = {
      version: 1,
      revision: 1,
      actionPromptId: 'splendor:1:main:user-1',
      status: 'playing',
      phase: 'main',
      currentPlayerId: 'user-1',
      players,
      tokenSupply: {},
      market: { 1: [], 2: [], 3: [] },
      deckCounts: { 1: 36, 2: 26, 3: 16 },
      nobles: [],
      finalRoundTriggered: false,
      winner: null,
      prompt: {
        type: 'take',
        playerId: 'user-1',
        takeOptions: [{ colors: ['white', 'blue', 'green'] }],
        buyCardIds: [],
        reserveCardIds: [],
        reserveDeckLevels: [1, 2, 3],
        evolutionOptions: [{ fromCardId: 'charmander', toCardId: 'charmeleon' }],
        canPass: false,
      },
    };

    expect(isSplendorGameView({ ...base, kind: 'splendor' })).toBe(true);
    expect(isSplendorGameView({ ...base, kind: 'splendor_pokemon' })).toBe(true);
    expect(isSplendorGameView({
      ...base,
      kind: 'splendor_pokemon',
      prompt: { ...base.prompt, evolutionOptions: undefined },
    })).toBe(false);
    expect(isSplendorGameView({
      ...base,
      kind: 'splendor_pokemon',
      prompt: { ...base.prompt, evolutionOptions: [{ fromCardId: 'charmander' }] },
    })).toBe(false);
    expect(isSplendorGameView({
      ...base,
      kind: 'splendor',
      players: players.map(({ publicReservedCards: _public, ...player }) => player),
    })).toBe(false);
  });

  it('preserves Digit Bomb room options and recognizes its private game view', () => {
    const room = normalizeRoomDetail({
      id: 'room-bomb',
      name: '霓虹拆弹',
      gameType: 'digit_bomb',
      status: 'playing',
      ownerId: 'user-1',
      maxPlayers: 2,
      digitBombDigits: 6,
      players: [],
    });
    expect(room).toMatchObject({ gameType: 'digit_bomb', maxPlayers: 2, digitBombDigits: 6 });

    const gameView = {
      kind: 'digit_bomb',
      version: 1,
      revision: 2,
      actionPromptId: 'digit-bomb:2:1:guess:user-1',
      status: 'playing',
      phase: 'guess',
      digits: 6,
      round: 1,
      roundStarterId: 'user-1',
      currentPlayerId: 'user-1',
      players: [
        { id: 'user-1', seat: 0, name: '玩家一', score: 0, secretSubmitted: true, guesses: [], vote: null },
        { id: 'user-2', seat: 1, name: '玩家二', score: 0, secretSubmitted: true, guesses: [], vote: null },
      ],
      ownSecret: '001122',
      pendingGuess: null,
      roundResult: null,
      winner: null,
      prompt: { type: 'guess', playerId: 'user-1' },
    };
    expect(isDigitBombGameView(gameView)).toBe(true);

    const { ownSecret: _missingSecret, ...withoutOwnSecret } = gameView;
    expect(isDigitBombGameView(withoutOwnSecret)).toBe(false);
    expect(isDigitBombGameView({ ...gameView, ownSecret: '00112' })).toBe(false);
    expect(isDigitBombGameView({ ...gameView, ownSecret: '00112a' })).toBe(false);
    expect(isDigitBombGameView({
      ...gameView,
      players: gameView.players.map((player, index) =>
        index === 1 ? { ...player, secret: '999999' } : player),
    })).toBe(false);
  });

  it('preserves Number Connect rooms and recognizes a private board view', () => {
    const room = normalizeRoomDetail({
      id: 'room-connect',
      name: '五线对决',
      gameType: 'number_connect',
      status: 'playing',
      ownerId: 'user-1',
      maxPlayers: 2,
      players: [],
    });
    expect(room).toMatchObject({ gameType: 'number_connect', maxPlayers: 2 });

    const board = Array.from({ length: 25 }, (_, index) => index + 1);
    const gameView = {
      kind: 'number_connect',
      version: 1,
      revision: 2,
      actionPromptId: 'number-connect:2:playing',
      status: 'playing',
      currentPlayerId: null,
      players: [
        { id: 'user-1', seat: 0, name: '玩家一', lineCount: 0, board },
        { id: 'user-2', seat: 1, name: '玩家二', lineCount: 0 },
      ],
      calledNumbers: [3, 7],
      lastNumber: 7,
      winner: null,
      prompt: {
        type: 'call',
        playerId: 'user-1',
        availableNumbers: board.filter((number) => number !== 3 && number !== 7),
      },
    };
    expect(isNumberConnectGameView(gameView)).toBe(true);
    expect(isNumberConnectGameView({
      ...gameView,
      players: gameView.players.map((player) => ({ ...player, board })),
    })).toBe(true);
    expect(isNumberConnectGameView({
      ...gameView,
      players: [{ ...gameView.players[0], board: [...board.slice(0, 24), 24] }, gameView.players[1]],
    })).toBe(false);
    expect(isNumberConnectGameView({ ...gameView, calledNumbers: [3, 3] })).toBe(false);
  });

  it('preserves the caller-private general draft without deriving other candidates', () => {
    const room = normalizeRoomDetail({
      id: 'room-draft',
      name: '风火选将',
      ownerId: 'user-1',
      ownerName: '玄德',
      status: 'drafting',
      playerCount: 2,
      maxPlayers: 5,
      players: [
        { id: 'user-1', username: 'liubei', displayName: '玄德', ready: true, connected: true, seat: 0 },
        { id: 'user-2', username: 'guanyu', displayName: '云长', ready: true, connected: true, seat: 1 },
      ],
      ruleConfig: {
        ruleSetVersion: 'original-66-v1',
        enabledGeneralPacks: ['standard', 'sp', 'wind'],
        generalSelection: { mode: 'choice', candidatesPerPlayer: 2, allowDuplicateGenerals: false },
        deckProfile: 'original-160',
        maximumReshuffles: 5,
        lordBonusMinimumPlayers: 5,
        godFactionChoice: true,
      },
      draft: {
        stage: 'selecting_generals',
        currentPlayerId: 'user-1',
        playerIds: ['user-1', 'user-2'],
        candidates: ['cao_cao', 'liu_bei'],
        candidateDetails: [{
          id: 'cao_cao', name: '曹操', faction: 'wei', maxHp: 4,
          skills: [{ id: 'cao_cao_jianxiong', name: '奸雄', description: '受到伤害后，可以获得造成伤害的牌。' }],
        }],
        players: [
          {
            playerId: 'user-1', role: 'lord', selected: false, generalId: null, needsFaction: false, faction: null,
          },
          {
            playerId: 'user-2', role: 'rebel', selected: true, generalId: null, needsFaction: false, faction: null,
          },
        ],
      },
    });

    expect(room.status).toBe('drafting');
    expect(room.ruleConfig).toMatchObject({
      enabledGeneralPacks: ['standard', 'sp', 'wind'],
      generalSelection: { mode: 'choice', candidatesPerPlayer: 2, allowDuplicateGenerals: false },
    });
    expect(room.draft?.candidates).toEqual(['cao_cao', 'liu_bei']);
    expect(room.draft?.candidateDetails?.[0]?.skills[0]).toMatchObject({ name: '奸雄', description: expect.any(String) });
    expect(room.draft?.currentPlayerId).toBe('user-1');
    expect(room.draft?.players).toEqual([
      { playerId: 'user-1', role: 'lord', selected: false, generalId: null, needsFaction: false, faction: null },
      { playerId: 'user-2', role: 'rebel', selected: true, generalId: null, needsFaction: false, faction: null },
    ]);
    expect(JSON.stringify(room.draft)).not.toContain('guan_yu');
  });

  it('turns a private engine view into playable UI state', () => {
    const game = normalizeGameView({
      version: 1,
      revision: 3,
      actionPromptId: 'game:3',
      status: 'playing',
      players: [
        { id: 'user-1', seat: 0, alive: true, hp: 4, maxHp: 4, handCount: 2, equipment: [
          { id: 'horse-1', kind: 'chi_tu', name: '赤兔', suit: 'heart', rank: 5, category: 'equipment' },
        ], judgment: [
          { id: 'lebu-1', kind: 'le_bu_si_shu', name: '乐不思蜀', suit: 'heart', rank: 6, category: 'trick' },
        ], hand: [
          { id: 'card-1', kind: 'slash' },
          { id: 'card-2', kind: 'peach' },
        ], role: 'lord', effectiveSkillIds: ['rende'], effectiveSkills: [
          { id: 'rende', name: '仁德', description: '出牌阶段，你可以将任意张手牌交给一名其他角色。' },
        ] },
        { id: 'user-2', seat: 1, alive: true, hp: 3, maxHp: 4, handCount: 1, hand: null, role: null },
      ],
      currentPlayerId: 'user-1',
      turn: { number: 2, playerId: 'user-1', phase: 'play', slashUsed: false, requiredDiscardCount: 0 },
      pendingResponse: null,
      winner: null,
      logs: [
        { id: 1, type: 'turn', message: 'user-1 的回合开始' },
        { id: 2, type: 'card', message: 'user-2 可以发动ganglie。' },
      ],
      prompt: {
        type: 'play',
        playerId: 'user-1',
        cards: [
          { cardId: 'card-1', kind: 'slash', targetIds: ['user-2'] },
          { cardId: 'card-2', kind: 'peach', targetIds: [] },
        ],
      },
    }, { userId: 'user-1', roomId: 'room-1' });

    expect(game).toMatchObject({
      roomId: 'room-1', revision: 3, actionPromptId: 'game:3', round: 2, canAct: true, selfPlayerId: 'user-1', actingPlayerId: 'user-1',
    });
    expect(game.hand[0]).toMatchObject({ id: 'card-1', name: '杀', playable: true, allowedTargetIds: ['user-2'] });
    expect(game.hand[1]).toMatchObject({ id: 'card-2', name: '桃', playable: true, targetMode: 'self' });
    expect(game.players[0]).toMatchObject({ isSelf: true, identity: '主公' });
    expect(game.players[0]?.equipment?.[0]).toMatchObject({
      id: 'horse-1', kind: 'chi_tu', slot: '进攻坐骑', name: '赤兔', suit: 'heart', rank: '5', category: 'equipment',
    });
    expect(game.players[0]?.judgment?.[0]).toMatchObject({ id: 'lebu-1', slot: '判定区', name: '乐不思蜀' });
    expect(game.players[0]?.effectiveSkills).toEqual([
      { id: 'rende', name: '仁德', description: '出牌阶段，你可以将任意张手牌交给一名其他角色。' },
    ]);
    expect(game.logs[0]?.text).toBe('玩家 1 的回合开始');
    expect(game.logs[1]?.text).toBe('玩家 2 可以发动刚烈。');
  });

  it('caches raw game action tokens and sends a strict envelope', async () => {
    const sent: unknown[] = [];
    const socket = {
      connected: true,
      timeout: () => ({
        emit: (_event: string, payload: unknown, ack: (error: Error | null, result: unknown) => void) => {
          sent.push(payload);
          ack(null, { ok: true });
        },
      }),
    };
    const client = new RealtimeClient();
    const internals = client as unknown as {
      socket: unknown;
      currentRoomId: string | null;
      rememberGameView: (game: unknown | null) => void;
    };
    internals.socket = socket;
    internals.currentRoomId = 'room-1';
    internals.rememberGameView({ revision: 9, actionPromptId: 'game:9' });

    const action = { type: 'end_play', playerId: 'user-1' } as const;
    await client.sendGameAction('room-1', action);
    expect(sent).toEqual([{
      roomId: 'room-1',
      expectedRevision: 9,
      expectedPromptId: 'game:9',
      action,
    }]);

    internals.rememberGameView(null);
    await expect(client.sendGameAction('room-1', action)).rejects.toThrow('尚未同步');
  });

  it('sends room chat through the realtime room channel', async () => {
    const sent: Array<{ event: string; payload: unknown }> = [];
    const socket = {
      connected: true,
      timeout: () => ({
        emit: (event: string, payload: unknown, ack: (error: Error | null, result: unknown) => void) => {
          sent.push({ event, payload });
          ack(null, { ok: true });
        },
      }),
    };
    const client = new RealtimeClient();
    (client as unknown as { socket: unknown }).socket = socket;

    await client.sendRoomChat('room-1', '你好');
    expect(sent).toEqual([{
      event: 'room:chat',
      payload: { roomId: 'room-1', message: '你好' },
    }]);
  });

  it('normalizes a dodge response prompt', () => {
    const game = normalizeGameView({
      version: 1,
      status: 'playing',
      players: [
        { id: 'user-1', seat: 0, alive: true, hp: 4, maxHp: 4, handCount: 0, hand: null, role: 'lord' },
        { id: 'user-2', seat: 1, alive: true, hp: 3, maxHp: 4, handCount: 1, hand: [{ id: 'dodge-1', kind: 'dodge' }], role: 'rebel' },
      ],
      currentPlayerId: 'user-1',
      turn: { number: 1, playerId: 'user-1', phase: 'respond', slashUsed: true, requiredDiscardCount: 0 },
      pendingResponse: { type: 'slash', attackerId: 'user-1', targetId: 'user-2', cardId: 'slash-1' },
      winner: null,
      logs: [],
      prompt: { type: 'respond', playerId: 'user-2', attackerId: 'user-1', dodgeCardIds: ['dodge-1'], canPass: true },
    }, { userId: 'user-2' });

    expect(game.prompt).toMatchObject({ kind: 'respond-dodge', allowedCardIds: ['dodge-1'], optional: true });
    expect(game.hand[0]).toMatchObject({ name: '闪', playable: true });
  });

  it('normalizes a Bagua Formation activation prompt and armor slot', () => {
    const game = normalizeGameView({
      version: 1,
      status: 'playing',
      players: [
        { id: 'user-1', seat: 0, alive: true, hp: 4, maxHp: 4, handCount: 0, hand: null, role: 'lord' },
        { id: 'user-2', seat: 1, alive: true, hp: 3, maxHp: 4, handCount: 0, hand: [], role: 'rebel', equipment: [
          { id: 'bagua-1', kind: 'ba_gua_zhen', name: '八卦阵', suit: 'spade', rank: 2, category: 'equipment' },
        ] },
      ],
      currentPlayerId: 'user-1',
      turn: { number: 1, playerId: 'user-1', phase: 'respond', slashUsed: true, requiredDiscardCount: 0 },
      pendingResponse: { type: 'slash', attackerId: 'user-1', targetId: 'user-2', cardId: 'slash-1', armorAttempted: false },
      winner: null,
      logs: [],
      prompt: {
        type: 'armor', playerId: 'user-2', armorKind: 'ba_gua_zhen',
        requiredCount: 2, respondedCount: 1, canPass: true,
      },
    }, { userId: 'user-2' });

    expect(game.prompt).toMatchObject({
      id: 'armor-1-user-2-1-of-2', kind: 'activate-armor', optional: true,
      requiredCount: 2, respondedCount: 1,
    });
    expect(game.prompt?.message).toContain('第 2/2 张闪');
    expect(game.players[1]?.equipment?.[0]).toMatchObject({
      id: 'bagua-1', kind: 'ba_gua_zhen', slot: '防具', name: '八卦阵', suit: 'spade', rank: '2', category: 'equipment',
    });
  });

  it('normalizes a private Nullification prompt', () => {
    const game = normalizeGameView({
      version: 1,
      status: 'playing',
      players: [
        { id: 'user-1', seat: 0, alive: true, hp: 4, maxHp: 4, handCount: 0, hand: null, role: 'lord' },
        { id: 'user-2', seat: 1, alive: true, hp: 4, maxHp: 4, handCount: 1, hand: [
          { id: 'wuxie-1', kind: 'wu_xie_ke_ji', name: '无懈可击', suit: 'spade', rank: 11, category: 'trick' },
        ], role: 'rebel' },
      ],
      currentPlayerId: 'user-1',
      turn: { number: 2, playerId: 'user-1', phase: 'respond' },
      pendingResponse: null,
      winner: null,
      logs: [],
      prompt: {
        type: 'nullification', playerId: 'user-2', sourceId: 'user-1', effectTargetId: 'user-2',
        cardKind: 'duel', allowedCardIds: ['wuxie-1'], canPass: true,
      },
    }, { userId: 'user-2' });
    expect(game.prompt).toMatchObject({ kind: 'respond-nullification', responseKind: 'nullification', allowedCardIds: ['wuxie-1'] });
    expect(game.hand[0]).toMatchObject({ name: '无懈可击', playable: true });
  });

  it('preserves the authoritative Fanjian prompt id and exposes only four suit choices', () => {
    const promptId = 'skill:17:fanjian:user-2:0';
    const game = normalizeGameView({
      version: 1,
      status: 'playing',
      players: [
        { id: 'user-1', seat: 0, alive: true, hp: 3, maxHp: 3, handCount: 3, hand: null, role: 'lord' },
        { id: 'user-2', seat: 1, alive: true, hp: 4, maxHp: 4, handCount: 1, hand: [{ id: 'own-card', kind: 'dodge' }], role: 'rebel' },
      ],
      currentPlayerId: 'user-1',
      turn: { number: 3, playerId: 'user-1', phase: 'respond' },
      pendingResponse: null,
      winner: null,
      logs: [],
      prompt: {
        type: 'fanjian_suit', playerId: 'user-2', sourceId: 'user-1', promptId,
        suits: ['spade', 'heart', 'club', 'diamond'],
      },
    }, { userId: 'user-2' });

    expect(game.prompt).toMatchObject({
      id: promptId,
      kind: 'choose-fanjian-suit',
      suitChoices: [
        { value: 'spade', label: '黑桃 ♠' },
        { value: 'heart', label: '红桃 ♥' },
        { value: 'club', label: '梅花 ♣' },
        { value: 'diamond', label: '方块 ♦' },
      ],
    });
    expect(game.prompt?.message).toContain('随机获得并公开');
    expect(JSON.stringify(game.prompt)).not.toContain('source-hand');
  });

  it('normalizes anonymous hand and public zone choices', () => {
    const game = normalizeGameView({
      version: 1,
      status: 'playing',
      players: [
        { id: 'user-1', seat: 0, alive: true, hp: 4, maxHp: 4, handCount: 0, hand: [], role: 'lord' },
        { id: 'user-2', seat: 1, alive: true, hp: 4, maxHp: 4, handCount: 2, hand: null, role: 'rebel' },
      ],
      currentPlayerId: 'user-1',
      turn: { number: 2, playerId: 'user-1', phase: 'respond' },
      pendingResponse: null,
      winner: null,
      logs: [],
      prompt: {
        type: 'zone_selection', playerId: 'user-1', victimId: 'user-2', mode: 'gain',
        choices: [
          { token: 'hand:0', zone: 'hand', card: null },
          { token: 'hand:1', zone: 'hand', card: null },
          { token: 'equipment:weapon', zone: 'equipment', card: { id: 'blade', kind: 'gu_ding_dao', name: '古锭刀' } },
        ],
      },
    }, { userId: 'user-1' });
    expect(game.prompt).toMatchObject({
      kind: 'choose-zone-card',
      zoneChoices: [
        { token: 'hand:0', label: '手牌 1（暗牌）' },
        { token: 'hand:1', label: '手牌 2（暗牌）' },
        { token: 'equipment:weapon', label: '装备区 · 古锭刀' },
      ],
    });
    expect(JSON.stringify(game.prompt)).not.toContain('hidden');
  });

  it('normalizes Fire Attack and Amazing Grace private choices with public cards', () => {
    const base = {
      version: 1,
      status: 'playing',
      players: [
        { id: 'user-1', seat: 0, alive: true, hp: 4, maxHp: 4, handCount: 2, hand: [
          { id: 'heart-card', kind: 'slash', suit: 'heart', rank: 7, category: 'basic' },
          { id: 'spade-card', kind: 'dodge', suit: 'spade', rank: 8, category: 'basic' },
        ], role: 'lord', chained: true },
        { id: 'user-2', seat: 1, alive: true, hp: 4, maxHp: 4, handCount: 1, hand: null, role: 'rebel' },
      ],
      currentPlayerId: 'user-1',
      turn: { number: 4, playerId: 'user-1', phase: 'respond' },
      pendingResponse: null,
      winner: null,
      logs: [],
    } as const;
    const fire = normalizeGameView({
      ...base,
      publicCards: [{ id: 'revealed', kind: 'peach', suit: 'heart', rank: 3, category: 'basic' }],
      prompt: {
        type: 'fire_attack_discard', playerId: 'user-1', victimId: 'user-2',
        revealedCard: { id: 'revealed', kind: 'peach', suit: 'heart', rank: 3, category: 'basic' },
        allowedCardIds: ['heart-card'], canPass: true,
      },
    }, { userId: 'user-1' });
    expect(fire.prompt).toMatchObject({ kind: 'fire-attack-discard', allowedCardIds: ['heart-card'], optional: true });
    expect(fire.hand.find((card) => card.id === 'heart-card')?.playable).toBe(true);
    expect(fire.hand.find((card) => card.id === 'spade-card')?.playable).toBe(false);
    expect(fire.publicCards?.[0]).toMatchObject({ id: 'revealed', name: '桃' });
    expect(fire.players[0]?.chained).toBe(true);

    const grace = normalizeGameView({
      ...base,
      publicCards: [{ id: 'grace-choice', kind: 'slash', suit: 'spade', rank: 7, category: 'basic' }],
      prompt: {
        type: 'amazing_grace_selection', playerId: 'user-1',
        cards: [{ id: 'grace-choice', kind: 'slash', suit: 'spade', rank: 7, category: 'basic' }],
      },
    }, { userId: 'user-1' });
    expect(grace.prompt).toMatchObject({ kind: 'amazing-grace-selection', cardChoices: [{ id: 'grace-choice', name: '杀' }] });
  });

  it('maps standard card metadata, suit, rank, category and target mode', () => {
    const cards = [
      { id: 'fire-1', kind: 'fire_slash', name: '火杀', suit: 'heart', rank: 4, category: 'basic' },
      { id: 'thunder-1', kind: 'thunder_slash', name: '雷杀', suit: 'spade', rank: 12, category: 'basic' },
      { id: 'wine-1', kind: 'wine', name: '酒', suit: 'diamond', rank: 9, category: 'basic' },
      { id: 'ex-1', kind: 'ex_nihilo', name: '无中生有', suit: 'heart', rank: 7, category: 'trick' },
      { id: 'duel-1', kind: 'duel', name: '决斗', suit: 'spade', rank: 1, category: 'trick' },
      { id: 'nanman-1', kind: 'barbarian_invasion', name: '南蛮入侵', suit: 'club', rank: 7, category: 'trick' },
      { id: 'wanjian-1', kind: 'arrow_barrage', name: '万箭齐发', suit: 'heart', rank: 1, category: 'trick' },
      { id: 'taoyuan-1', kind: 'peach_garden', name: '桃园结义', suit: 'heart', rank: 1, category: 'trick' },
    ];
    const game = normalizeGameView({
      version: 1,
      status: 'playing',
      players: [
        { id: 'user-1', seat: 0, alive: true, hp: 3, maxHp: 4, handCount: cards.length, hand: cards, role: 'lord' },
        { id: 'user-2', seat: 1, alive: true, hp: 4, maxHp: 4, handCount: 0, hand: null, role: null },
      ],
      currentPlayerId: 'user-1',
      turn: { number: 3, playerId: 'user-1', phase: 'play', slashUsed: false, requiredDiscardCount: 0 },
      pendingResponse: null,
      winner: null,
      logs: [],
      prompt: {
        type: 'play',
        playerId: 'user-1',
        cards: [
          { cardId: 'fire-1', kind: 'fire_slash', targetIds: ['user-2'], targetMode: 'single-other' },
          { cardId: 'duel-1', kind: 'duel', targetIds: ['user-2'], targetMode: 'single-other' },
          { cardId: 'ex-1', kind: 'ex_nihilo', targetIds: [], targetMode: 'none' },
          { cardId: 'nanman-1', kind: 'barbarian_invasion', targetIds: [], targetMode: 'none' },
        ],
      },
    }, { userId: 'user-1', roomId: 'room-1' });

    expect(game.hand.map((card) => [card.name, card.suit, card.rank, card.category])).toEqual([
      ['火杀', 'heart', '4', 'basic'],
      ['雷杀', 'spade', 'Q', 'basic'],
      ['酒', 'diamond', '9', 'basic'],
      ['无中生有', 'heart', '7', 'trick'],
      ['决斗', 'spade', 'A', 'trick'],
      ['南蛮入侵', 'club', '7', 'trick'],
      ['万箭齐发', 'heart', 'A', 'trick'],
      ['桃园结义', 'heart', 'A', 'trick'],
    ]);
    expect(game.hand.find((card) => card.kind === 'fire_slash')).toMatchObject({
      playable: true,
      targetMode: 'single-other',
      allowedTargetIds: ['user-2'],
    });
    expect(game.hand.find((card) => card.kind === 'thunder_slash')).toMatchObject({ playable: false });
    expect(game.hand.find((card) => card.kind === 'nanman-1')).toBeUndefined();
    expect(game.hand.find((card) => card.kind === 'barbarian_invasion')?.description).toContain('打出一张「杀」');
  });

  it('normalizes a generic request to play slash and allows passing', () => {
    const game = normalizeGameView({
      version: 1,
      status: 'playing',
      players: [
        { id: 'user-1', seat: 0, alive: true, hp: 4, maxHp: 4, handCount: 0, hand: null, role: 'lord' },
        { id: 'user-2', seat: 1, alive: true, hp: 3, maxHp: 4, handCount: 2, hand: [
          { id: 'slash-1', kind: 'slash', name: '杀', suit: 'spade', rank: 7, category: 'basic' },
          { id: 'dodge-1', kind: 'dodge', name: '闪', suit: 'heart', rank: 2, category: 'basic' },
        ], role: 'rebel' },
      ],
      currentPlayerId: 'user-1',
      turn: { number: 4, playerId: 'user-1', phase: 'respond', slashUsed: false, requiredDiscardCount: 0 },
      pendingResponse: { type: 'duel', sourceId: 'user-1', targetId: 'user-2', cardId: 'duel-1' },
      winner: null,
      logs: [],
      prompt: {
        type: 'respond',
        playerId: 'user-2',
        responseKind: 'slash',
        allowedCardIds: ['slash-1'],
        canPass: true,
        context: 'duel',
      },
    }, { userId: 'user-2' });

    expect(game.prompt).toMatchObject({
      kind: 'respond-slash',
      responseKind: 'slash',
      allowedCardIds: ['slash-1'],
      optional: true,
    });
    expect(game.prompt?.message).toContain('「决斗」');
    expect(game.hand.find((card) => card.id === 'slash-1')).toMatchObject({ playable: true });
    expect(game.hand.find((card) => card.id === 'dodge-1')).toMatchObject({ playable: false });
  });

  it('accepts the legacy slashCardIds response field', () => {
    const game = normalizeGameView({
      version: 1,
      status: 'playing',
      players: [
        { id: 'user-1', seat: 0, alive: true, hp: 4, maxHp: 4, handCount: 0, hand: null, role: 'lord' },
        { id: 'user-2', seat: 1, alive: true, hp: 3, maxHp: 4, handCount: 1, hand: [
          { id: 'slash-1', kind: 'slash', name: '杀', suit: 'spade', rank: 7, category: 'basic' },
        ], role: 'rebel' },
      ],
      currentPlayerId: 'user-1',
      turn: { number: 4, playerId: 'user-1', phase: 'respond', slashUsed: false, requiredDiscardCount: 0 },
      pendingResponse: { type: 'duel', sourceId: 'user-1', targetId: 'user-2', cardId: 'duel-1' },
      winner: null,
      logs: [],
      prompt: {
        type: 'respond',
        playerId: 'user-2',
        responseKind: 'slash',
        slashCardIds: ['slash-1'],
        canPass: true,
        context: 'duel',
      },
    }, { userId: 'user-2' });

    expect(game.prompt).toMatchObject({
      kind: 'respond-slash',
      allowedCardIds: ['slash-1'],
    });
    expect(game.hand[0]).toMatchObject({ id: 'slash-1', playable: true });
  });

  it('normalizes a dying rescue prompt with Peach and self-rescue Wine', () => {
    const game = normalizeGameView({
      version: 1,
      status: 'playing',
      players: [
        { id: 'user-1', seat: 0, alive: true, hp: 0, maxHp: 4, handCount: 2, hand: [
          { id: 'peach-1', kind: 'peach', name: '桃', suit: 'heart', rank: 3, category: 'basic' },
          { id: 'wine-1', kind: 'wine', name: '酒', suit: 'spade', rank: 9, category: 'basic' },
        ], equipment: [
          { id: 'red-horse', kind: 'chi_tu', name: '赤兔', suit: 'diamond', rank: 5, category: 'equipment' },
        ], role: 'rebel' },
        { id: 'user-2', seat: 1, alive: true, hp: 4, maxHp: 5, handCount: 0, hand: null, role: 'lord' },
      ],
      currentPlayerId: 'user-2',
      turn: { number: 5, playerId: 'user-2', phase: 'respond', slashUsed: true, requiredDiscardCount: 0 },
      pendingResponse: { type: 'dying', victimId: 'user-1', damageSourceId: 'user-2', targetId: 'user-1' },
      winner: null,
      logs: [],
      prompt: {
        type: 'dying',
        playerId: 'user-1',
        victimId: 'user-1',
        allowedCardIds: ['peach-1', 'wine-1'],
        peachCardIds: ['peach-1'],
        wineCardIds: ['wine-1'],
        skillResponses: [{ skillId: 'jijiu', cardIds: ['red-horse'], responseKind: 'peach' }],
        canPass: true,
      },
    }, { userId: 'user-1' });

    expect(game.prompt).toMatchObject({
      kind: 'respond-peach',
      allowedCardIds: ['peach-1', 'wine-1'],
      skillResponses: [{ skillId: 'jijiu', cardIds: ['red-horse'], responseKind: 'peach' }],
      optional: true,
    });
    expect(game.prompt?.message).toContain('桃');
    expect(game.prompt?.message).toContain('酒');
    expect(game.hand).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'peach-1', playable: true }),
      expect.objectContaining({ id: 'wine-1', playable: true }),
    ]));
    expect(game.players[0]?.equipment?.[0]).toMatchObject({ id: 'red-horse', suit: 'diamond', category: 'equipment' });
  });

  it('normalizes the authoritative Niepan dying choice', () => {
    const game = normalizeGameView({
      version: 1,
      status: 'playing',
      players: [
        { id: 'pang-tong', seat: 0, alive: true, hp: 0, maxHp: 3, handCount: 0, hand: [], role: 'rebel' },
        { id: 'lord', seat: 1, alive: true, hp: 4, maxHp: 4, handCount: 0, hand: null, role: 'lord' },
      ],
      currentPlayerId: 'lord',
      turn: { number: 6, playerId: 'lord', phase: 'respond' },
      winner: null,
      logs: [],
      prompt: {
        type: 'skill_choice', playerId: 'pang-tong', skillId: 'niepan',
        promptId: 'dying:17:niepan', canPass: true,
      },
    }, { userId: 'pang-tong' });

    expect(game.prompt).toMatchObject({
      id: 'dying:17:niepan', kind: 'skill-choice', skillId: 'niepan', optional: true,
    });
    expect(game.prompt?.message).toContain('涅槃');
  });

  it('normalizes the optional Buqu entry-save choice', () => {
    const game = normalizeGameView({
      version: 1,
      status: 'playing',
      players: [
        { id: 'zhou-tai', seat: 0, alive: true, hp: 0, maxHp: 4, handCount: 0, hand: [], role: 'rebel' },
        { id: 'lord', seat: 1, alive: true, hp: 4, maxHp: 4, handCount: 0, hand: null, role: 'lord' },
      ],
      currentPlayerId: 'lord',
      turn: { number: 7, playerId: 'lord', phase: 'respond' },
      winner: null,
      logs: [],
      prompt: {
        type: 'skill_choice', playerId: 'zhou-tai', skillId: 'buqu',
        promptId: 'dying:23:buqu-entry', canPass: true,
      },
    }, { userId: 'zhou-tai' });

    expect(game.prompt).toMatchObject({
      id: 'dying:23:buqu-entry', kind: 'skill-choice', skillId: 'buqu', optional: true,
    });
    expect(game.prompt?.message).toContain('点数均不重复');
  });

  it('exposes only public Buqu wounds and normalizes the required recovery choice', () => {
    const wound = { id: 'buqu-wound', kind: 'slash', name: '杀', suit: 'spade', rank: 7, category: 'basic' };
    const game = normalizeGameView({
      version: 1,
      status: 'playing',
      players: [{
        id: 'zhou-tai', seat: 0, alive: true, hp: 0, maxHp: 4, handCount: 0, hand: [], role: 'rebel',
        publicPiles: { buqu: [wound] },
        privatePiles: { yiji: [{ ...wound, id: 'hidden-card' }] },
      }],
      currentPlayerId: 'zhou-tai',
      turn: { number: 7, playerId: 'zhou-tai', phase: 'respond' },
      winner: null,
      logs: [],
      prompt: {
        type: 'standard_skill', playerId: 'zhou-tai', skillId: 'buqu', stage: 'buqu_recovery',
        promptId: 'recovery:23:buqu:zhou-tai', canPass: false,
        cards: [wound], allowedCardIds: ['buqu-wound'], targetIds: [],
        minCards: 1, maxCards: 1, minTargets: 0, maxTargets: 0,
      },
    }, { userId: 'zhou-tai' });

    expect(game.players[0]?.publicPiles).toEqual({
      buqu: [expect.objectContaining({ id: 'buqu-wound', rank: '7', suit: 'spade' })],
    });
    expect(game.players[0]?.privatePiles).toEqual({
      yiji: [expect.objectContaining({ id: 'hidden-card' })],
    });
    expect(game.prompt).toMatchObject({
      id: 'recovery:23:buqu:zhou-tai', kind: 'standard-skill', skillId: 'buqu',
      standardStage: 'buqu_recovery', optional: false, allowedCardIds: ['buqu-wound'],
      cardChoices: [expect.objectContaining({ id: 'buqu-wound' })],
    });
  });

  it('normalizes weapon decisions and ZhangBa virtual Slash controls', () => {
    const base = {
      version: 1 as const,
      status: 'playing' as const,
      players: [
        { id: 'user-1', seat: 0, alive: true, hp: 4, maxHp: 4, handCount: 2, hand: [
          { id: 'cost-1', kind: 'dodge' },
          { id: 'cost-2', kind: 'peach' },
        ], equipment: [{ id: 'zhangba', kind: 'zhang_ba_she_mao', name: '丈八蛇矛', category: 'equipment' }], role: 'lord' as const },
        { id: 'user-2', seat: 1, alive: true, hp: 4, maxHp: 4, handCount: 0, hand: null, role: 'rebel' as const },
      ],
      currentPlayerId: 'user-1',
      turn: { number: 3, playerId: 'user-1', phase: 'play' as const, slashUsed: false, requiredDiscardCount: 0 },
      winner: null,
      logs: [],
    };
    const play = normalizeGameView({
      ...base,
      prompt: {
        type: 'play', playerId: 'user-1', cards: [],
        zhangBaSlash: { allowedCardIds: ['cost-1', 'cost-2'], targetIds: ['user-2'], maxTargets: 3 },
      },
    }, { userId: 'user-1' });
    expect(play.zhangBaSlash).toEqual({ allowedCardIds: ['cost-1', 'cost-2'], targetIds: ['user-2'], maxTargets: 3 });
    expect(play.players[0]?.equipment?.[0]).toMatchObject({ id: 'zhangba', kind: 'zhang_ba_she_mao', slot: '武器', name: '丈八蛇矛' });

    const weapon = normalizeGameView({
      ...base,
      turn: { ...base.turn, phase: 'respond' as const },
      prompt: {
        type: 'weapon_action', playerId: 'user-1', weaponKind: 'guan_shi_fu',
        stage: 'guanshi_force_hit', victimId: 'user-2', promptId: 'damage:41', allowedCardIds: ['cost-1', 'cost-2'],
        minCards: 2, maxCards: 2, canPass: true,
      },
    }, { userId: 'user-1' });
    expect(weapon.prompt).toMatchObject({
      id: 'damage:41', promptId: 'damage:41', kind: 'weapon-action', weaponStage: 'guanshi_force_hit', min: 2, max: 2,
      allowedCardIds: ['cost-1', 'cost-2'], optional: true,
    });
  });

  it('exposes playable general skills independently and preserves equipment skill costs', () => {
    const game = normalizeGameView({
      version: 1,
      status: 'playing',
      players: [
        {
          id: 'user-1', seat: 0, alive: true, hp: 4, maxHp: 4, handCount: 2, role: 'lord',
          hand: [
            { id: 'red-hand', kind: 'dodge', suit: 'heart', rank: 2, category: 'basic' },
            { id: 'black-hand', kind: 'peach', suit: 'spade', rank: 3, category: 'basic' },
          ],
          equipment: [
            { id: 'red-horse', kind: 'chi_tu', suit: 'diamond', rank: 5, category: 'equipment' },
            { id: 'black-weapon', kind: 'gu_ding_dao', suit: 'spade', rank: 1, category: 'equipment' },
          ],
        },
        { id: 'user-2', seat: 1, alive: true, hp: 4, maxHp: 4, handCount: 1, hand: null, role: 'rebel' },
      ],
      currentPlayerId: 'user-1',
      turn: { number: 6, playerId: 'user-1', phase: 'play' },
      winner: null,
      logs: [],
      prompt: {
        type: 'play',
        playerId: 'user-1',
        cards: [],
        skills: [
          {
            skillId: 'wusheng', cardIds: ['red-hand', 'red-horse'], minCards: 1, maxCards: 1,
            targetMode: 'single-other', targetIds: ['user-2'], cardTargetIds: { 'red-hand': ['user-2'], 'red-horse': ['user-2'] },
            virtualCardKind: 'slash',
          },
          {
            skillId: 'qixi', cardIds: ['black-hand', 'black-weapon'], minCards: 1, maxCards: 1,
            targetMode: 'single-other', targetIds: ['user-2'], virtualCardKind: 'guo_he_chai_qiao',
          },
          {
            skillId: 'lijian', cardIds: ['black-hand'], minCards: 1, maxCards: 1,
            targetMode: 'ordered-two', targetIds: ['user-2', 'user-3'], targetPairs: [['user-2', 'user-3']],
          },
        ],
      },
    }, { userId: 'user-1' });

    expect(game.skills).toEqual(expect.arrayContaining([
      expect.objectContaining({ skillId: 'wusheng', cardIds: ['red-hand', 'red-horse'] }),
      expect.objectContaining({ skillId: 'qixi', cardIds: ['black-hand', 'black-weapon'] }),
      expect.objectContaining({ skillId: 'lijian', targetPairs: [['user-2', 'user-3']] }),
    ]));
    expect(game.hand.every((card) => card.playable === false)).toBe(true);
    expect(game.players[0]?.equipment).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'red-horse', kind: 'chi_tu', suit: 'diamond', rank: '5', category: 'equipment', slot: '进攻坐骑',
      }),
      expect.objectContaining({
        id: 'black-weapon', kind: 'gu_ding_dao', suit: 'spade', rank: 'A', category: 'equipment', slot: '武器',
      }),
    ]));
  });

  it('normalizes multi-card, self-targeting and delayed-trick skill hints without collapsing their constraints', () => {
    const game = normalizeGameView({
      version: 1,
      status: 'playing',
      players: [
        {
          id: 'self', seat: 0, alive: true, hp: 2, maxHp: 4, handCount: 3, role: 'lord',
          hand: [
            { id: 'h1', kind: 'slash', suit: 'spade', rank: 7, category: 'basic' },
            { id: 'h2', kind: 'dodge', suit: 'heart', rank: 2, category: 'basic' },
            { id: 'h3', kind: 'peach', suit: 'diamond', rank: 3, category: 'basic' },
          ],
          equipment: [{ id: 'diamond-horse', kind: 'chi_tu', suit: 'diamond', rank: 5, category: 'equipment' }],
        },
        { id: 'ally', seat: 1, alive: true, hp: 2, maxHp: 4, handCount: 0, hand: null, role: 'loyalist' },
      ],
      currentPlayerId: 'self',
      turn: { number: 8, playerId: 'self', phase: 'play' },
      winner: null,
      logs: [],
      prompt: {
        type: 'play', playerId: 'self', cards: [],
        skills: [
          { skillId: 'zhiheng', cardIds: ['h1', 'h2', 'h3', 'diamond-horse'], minCards: 1, maxCards: 4, targetMode: 'none', targetIds: [] },
          { skillId: 'rende', cardIds: ['h1', 'h2', 'h3'], minCards: 1, maxCards: 3, targetMode: 'single-other', targetIds: ['ally'] },
          { skillId: 'qingnang', cardIds: ['h1', 'h2', 'h3'], minCards: 1, maxCards: 1, targetMode: 'single-other', targetIds: ['self', 'ally'] },
          { skillId: 'jieyin', cardIds: ['h1', 'h2', 'h3'], minCards: 2, maxCards: 2, targetMode: 'single-other', targetIds: ['ally'] },
          {
            skillId: 'guose', cardIds: ['h3', 'diamond-horse'], minCards: 1, maxCards: 1,
            targetMode: 'single-other', targetIds: ['ally'], virtualCardKind: 'le_bu_si_shu',
          },
        ],
      },
    }, { userId: 'self' });

    expect(game.skills).toEqual(expect.arrayContaining([
      expect.objectContaining({ skillId: 'zhiheng', minCards: 1, maxCards: 4, targetMode: 'none' }),
      expect.objectContaining({ skillId: 'rende', cardIds: ['h1', 'h2', 'h3'], targetIds: ['ally'] }),
      expect.objectContaining({ skillId: 'qingnang', targetIds: ['self', 'ally'] }),
      expect.objectContaining({ skillId: 'jieyin', minCards: 2, maxCards: 2 }),
      expect.objectContaining({ skillId: 'guose', cardIds: ['h3', 'diamond-horse'], virtualCardKind: 'le_bu_si_shu' }),
    ]));
    expect(game.players[0]?.equipment?.[0]).toMatchObject({ id: 'diamond-horse', suit: 'diamond', category: 'equipment' });
  });

  it('normalizes conversion-skill responses and optional locked-skill choices', () => {
    const base = {
      version: 1 as const,
      status: 'playing' as const,
      players: [
        { id: 'user-1', seat: 0, alive: true, hp: 4, maxHp: 4, handCount: 0, hand: null, role: 'lord' as const },
        {
          id: 'user-2', seat: 1, alive: true, hp: 3, maxHp: 4, handCount: 1,
          hand: [{ id: 'red-dodge', kind: 'dodge', suit: 'heart', rank: 2, category: 'basic' }], role: 'rebel' as const,
        },
      ],
      currentPlayerId: 'user-1',
      turn: { number: 7, playerId: 'user-1', phase: 'respond' as const },
      winner: null,
      logs: [],
    };
    const response = normalizeGameView({
      ...base,
      prompt: {
        type: 'respond', playerId: 'user-2', attackerId: 'user-1', targetId: 'user-2', context: 'duel',
        responseKind: 'slash', allowedCardIds: [], dodgeCardIds: [], slashCardIds: [],
        requiredCount: 2, respondedCount: 1,
        skillResponses: [{ skillId: 'wusheng', cardIds: ['red-dodge'], responseKind: 'slash' }], canPass: true,
      },
    }, { userId: 'user-2' });
    expect(response.prompt).toMatchObject({
      id: 'respond-7-duel-user-2-1-of-2',
      kind: 'respond-slash',
      requiredCount: 2,
      respondedCount: 1,
      skillResponses: [{ skillId: 'wusheng', cardIds: ['red-dodge'], responseKind: 'slash' }],
    });
    expect(response.prompt?.message).toContain('第 2/2 张「杀」');

    const skillChoice = normalizeGameView({
      ...base,
      prompt: { type: 'skill_choice', playerId: 'user-2', skillId: 'luoyi', canPass: true },
    }, { userId: 'user-2' });
    expect(skillChoice.prompt).toMatchObject({ kind: 'skill-choice', skillId: 'luoyi', optional: true });
    expect(skillChoice.prompt?.message).toContain('少摸一张牌');

    const huashen = normalizeGameView({
      ...base,
      prompt: {
        type: 'standard_skill', playerId: 'user-2', skillId: 'huashen', stage: 'huashen_initial',
        promptId: 'huashen-initial', canPass: false, cards: [], allowedCardIds: [], targetIds: [],
        minCards: 0, maxCards: 0, minTargets: 0, maxTargets: 0,
        options: ['huashen:zhang_liao:tuxi'],
      },
    }, { userId: 'user-2' });
    expect(huashen.prompt).toMatchObject({
      kind: 'standard-skill', skillId: 'huashen', options: ['huashen:zhang_liao:tuxi'], optional: false,
    });
    expect(huashen.prompt?.message).toContain('两张私有化身牌');

    const yingzi = normalizeGameView({
      ...base,
      prompt: { type: 'skill_choice', playerId: 'user-2', skillId: 'yingzi', canPass: true },
    }, { userId: 'user-2' });
    expect(yingzi.prompt).toMatchObject({ kind: 'skill-choice', skillId: 'yingzi', optional: true });
    expect(yingzi.prompt?.message).toContain('摸三张牌');

    const biyue = normalizeGameView({
      ...base,
      prompt: { type: 'skill_choice', playerId: 'user-2', skillId: 'biyue', canPass: true },
    }, { userId: 'user-2' });
    expect(biyue.prompt).toMatchObject({ kind: 'skill-choice', skillId: 'biyue', optional: true });
    expect(biyue.prompt?.message).toContain('结束阶段');

    const luoshen = normalizeGameView({
      ...base,
      prompt: { type: 'skill_choice', playerId: 'user-2', skillId: 'luoshen', iteration: 3, canPass: true },
    }, { userId: 'user-2' });
    expect(luoshen.prompt).toMatchObject({
      id: 'skill-choice-7-luoshen-user-2-3', kind: 'skill-choice', skillId: 'luoshen', optional: true,
    });
    expect(luoshen.prompt?.message).toContain('已通过 3 次黑色判定');

    const jizhi = normalizeGameView({
      ...base,
      prompt: {
        type: 'skill_choice', playerId: 'user-2', skillId: 'jizhi',
        promptId: 'skill:41:jizhi:user-2:0', canPass: true,
      },
    }, { userId: 'user-2' });
    expect(jizhi.prompt).toMatchObject({
      id: 'skill:41:jizhi:user-2:0', kind: 'skill-choice', skillId: 'jizhi', optional: true,
    });
    expect(jizhi.prompt?.message).toContain('集智');

    for (const [skillId, label, eventId] of [
      ['lianying', '连营', 42],
      ['xiaoji', '枭姬', 43],
    ] as const) {
      const promptId = `skill:${eventId}:${skillId}:user-2:0`;
      const afterMove = normalizeGameView({
        ...base,
        prompt: { type: 'skill_choice', playerId: 'user-2', skillId, promptId, canPass: true },
      }, { userId: 'user-2' });
      expect(afterMove.prompt).toMatchObject({
        id: promptId, kind: 'skill-choice', skillId, optional: true,
      });
      expect(afterMove.prompt?.message).toContain(label);
    }
  });

  it('normalizes Qingguo as an independent Dodge response action', () => {
    const game = normalizeGameView({
      version: 1,
      status: 'playing',
      players: [
        { id: 'attacker', seat: 0, alive: true, hp: 4, maxHp: 4, handCount: 0, hand: null, role: 'lord' },
        {
          id: 'self', seat: 1, alive: true, hp: 3, maxHp: 3, handCount: 1, role: 'rebel',
          hand: [{ id: 'black-hand', kind: 'peach', suit: 'spade', rank: 3, category: 'basic' }],
        },
      ],
      currentPlayerId: 'attacker',
      turn: { number: 9, playerId: 'attacker', phase: 'respond' },
      winner: null,
      logs: [],
      prompt: {
        type: 'respond', playerId: 'self', attackerId: 'attacker', targetId: 'self', context: 'slash',
        responseKind: 'dodge', allowedCardIds: [], dodgeCardIds: [], slashCardIds: [],
        skillResponses: [{ skillId: 'qingguo', cardIds: ['black-hand'], responseKind: 'dodge' }], canPass: true,
      },
    }, { userId: 'self' });

    expect(game.prompt).toMatchObject({
      kind: 'respond-dodge',
      skillResponses: [{ skillId: 'qingguo', cardIds: ['black-hand'], responseKind: 'dodge' }],
    });
    expect(game.hand[0]).toMatchObject({ id: 'black-hand', playable: false });
  });

  it('normalizes requester-side lord-skill offers and provider-side physical-card prompts', () => {
    const base = {
      version: 1 as const,
      status: 'playing' as const,
      players: [
        {
          id: 'requester', seat: 0, alive: true, hp: 4, maxHp: 4, handCount: 0,
          hand: [] as Array<Record<string, unknown>>, role: 'lord' as const,
          effectiveSkillIds: ['hujia'],
        },
        {
          id: 'provider', seat: 1, alive: true, hp: 3, maxHp: 3, handCount: 1,
          hand: [{ id: 'provider-dodge', kind: 'dodge' as const, name: '闪', suit: 'heart' as const, rank: 2, category: 'basic' as const }],
          role: 'loyalist' as const,
        },
      ],
      currentPlayerId: 'requester',
      turn: { number: 12, playerId: 'requester', phase: 'respond' as const },
      winner: null,
      logs: [],
    };
    const requester = normalizeGameView({
      ...base,
      prompt: {
        type: 'respond' as const, playerId: 'requester', attackerId: 'attacker', targetId: 'requester',
        context: 'slash' as const, responseKind: 'dodge' as const, allowedCardIds: [],
        dodgeCardIds: [], slashCardIds: [], skillResponses: [], lordSkills: ['hujia' as const], canPass: true as const,
      },
    }, { userId: 'requester' });
    expect(requester.prompt).toMatchObject({ kind: 'respond-dodge', lordSkills: ['hujia'] });
    expect(requester.players[0]?.effectiveSkillIds).toContain('hujia');

    const provider = normalizeGameView({
      ...base,
      players: base.players.map((player) => player.id === 'requester'
        ? { ...player, hand: null }
        : player),
      prompt: {
        type: 'lord_dispatch' as const,
        playerId: 'provider', requesterId: 'requester', skillId: 'hujia' as const,
        responseKind: 'dodge' as const, method: 'respond' as const,
        promptId: 'lord:9:hujia:requester:provider', allowedCardIds: ['provider-dodge'], canPass: true as const,
      },
    }, { userId: 'provider' });
    expect(provider.prompt).toMatchObject({
      id: 'lord:9:hujia:requester:provider', kind: 'lord-dispatch', lordSkillId: 'hujia',
      allowedCardIds: ['provider-dodge'], optional: true,
    });
    expect(provider.hand[0]).toMatchObject({ id: 'provider-dodge', playable: true });
    expect(provider.prompt?.message).toContain('实体「闪」');
  });

  it('normalizes reconnectable standard-skill prompts without revealing anonymous opponent hands', () => {
    const base = {
      version: 1 as const,
      status: 'playing' as const,
      players: [
        {
          id: 'self', seat: 0, alive: true, hp: 3, maxHp: 3, handCount: 2,
          hand: [
            { id: 'retrial-card', kind: 'dodge' as const, name: '闪', suit: 'club' as const, rank: 2, category: 'basic' as const },
            { id: 'kept-card', kind: 'peach' as const, name: '桃', suit: 'heart' as const, rank: 3, category: 'basic' as const },
          ],
          role: 'lord' as const,
        },
        { id: 'other', seat: 1, alive: true, hp: 4, maxHp: 4, handCount: 2, hand: null, role: null },
      ],
      currentPlayerId: 'other',
      turn: { number: 18, playerId: 'other', phase: 'respond' as const },
      winner: null,
      logs: [],
      publicCards: [
        { id: 'judgment-card', kind: 'slash' as const, name: '杀', suit: 'spade' as const, rank: 5, category: 'basic' as const },
      ],
    };
    const guicai = normalizeGameView({
      ...base,
      prompt: {
        type: 'standard_skill' as const,
        playerId: 'self',
        skillId: 'guicai' as const,
        stage: 'judgment_retrial',
        promptId: 'judgment:9:retrial:self:0',
        canPass: true,
        cards: [],
        allowedCardIds: ['retrial-card'],
        targetIds: [],
        minCards: 1,
        maxCards: 1,
        minTargets: 0,
        maxTargets: 0,
      },
    }, { userId: 'self' });
    expect(guicai.prompt).toMatchObject({
      id: 'judgment:9:retrial:self:0',
      kind: 'standard-skill',
      skillId: 'guicai',
      standardStage: 'judgment_retrial',
      allowedCardIds: ['retrial-card'],
      min: 1,
      max: 1,
      optional: true,
    });
    expect(guicai.hand).toEqual([
      expect.objectContaining({ id: 'retrial-card', playable: true }),
      expect.objectContaining({ id: 'kept-card', playable: false }),
    ]);
    expect(guicai.publicCards).toEqual([expect.objectContaining({ id: 'judgment-card' })]);

    const tuxi = normalizeGameView({
      ...base,
      prompt: {
        type: 'standard_skill' as const,
        playerId: 'self',
        skillId: 'tuxi' as const,
        stage: 'tuxi_select',
        promptId: 'standard:10:tuxi:self:tuxi_select',
        canPass: true,
        cards: [],
        allowedCardIds: [],
        targetIds: ['other'],
        minCards: 0,
        maxCards: 0,
        minTargets: 1,
        maxTargets: 1,
        choices: [
          { token: 'hand:0', ownerId: 'other', zone: 'hand' as const, card: null },
          { token: 'hand:1', ownerId: 'other', zone: 'hand' as const, card: null },
        ],
      },
    }, { userId: 'self' });
    expect(tuxi.prompt).toMatchObject({
      id: 'standard:10:tuxi:self:tuxi_select',
      skillId: 'tuxi',
      allowedTargetIds: ['other'],
      minTargets: 1,
      maxTargets: 1,
      zoneChoices: [
        { token: 'hand:0', ownerId: 'other', zone: 'hand' },
        { token: 'hand:1', ownerId: 'other', zone: 'hand' },
      ],
    });
    expect(tuxi.prompt?.zoneChoices?.every((choice) => choice.label.includes('暗牌'))).toBe(true);

    const liegong = normalizeGameView({
      ...base,
      prompt: {
        type: 'standard_skill' as const,
        playerId: 'self',
        skillId: 'liegong' as const,
        stage: 'invoke',
        promptId: 'standard:11:liegong:self:invoke',
        canPass: true,
        cards: [],
        allowedCardIds: [],
        targetIds: [],
        minCards: 0,
        maxCards: 0,
        minTargets: 0,
        maxTargets: 0,
      },
    }, { userId: 'self' });
    expect(liegong.prompt).toMatchObject({
      id: 'standard:11:liegong:self:invoke',
      kind: 'standard-skill',
      skillId: 'liegong',
      standardStage: 'invoke',
      optional: true,
    });
    expect(liegong.prompt?.message).toContain('不能使用「闪」');

    const tianxiang = normalizeGameView({
      ...base,
      players: [
        {
          ...base.players[0],
          handCount: 3,
          hand: [
            ...(base.players[0]?.hand ?? []),
            { id: 'hongyan-spade', kind: 'slash' as const, name: '杀', suit: 'spade' as const, rank: 7, category: 'basic' as const },
          ],
        },
        base.players[1],
      ],
      prompt: {
        type: 'standard_skill' as const,
        playerId: 'self',
        skillId: 'tianxiang' as const,
        stage: 'tianxiang_redirect',
        promptId: 'damage:41',
        canPass: true,
        cards: [],
        allowedCardIds: ['hongyan-spade'],
        targetIds: ['other'],
        minCards: 1,
        maxCards: 1,
        minTargets: 1,
        maxTargets: 1,
      },
    }, { userId: 'self' });
    expect(tianxiang.prompt).toMatchObject({
      id: 'damage:41',
      kind: 'standard-skill',
      skillId: 'tianxiang',
      standardStage: 'tianxiang_redirect',
      allowedCardIds: ['hongyan-spade'],
      allowedTargetIds: ['other'],
      min: 1,
      max: 1,
      minTargets: 1,
      maxTargets: 1,
      optional: true,
    });
    expect(tianxiang.prompt?.message).toContain('服务器判定');
    expect(tianxiang.hand.find((card) => card.id === 'hongyan-spade')).toMatchObject({ playable: true, suit: 'spade' });
    expect(tianxiang.hand.find((card) => card.id === 'kept-card')).toMatchObject({ playable: false });
  });

  it('preserves the complete shared play hints and public/private lifecycle projection', () => {
    const game = normalizeGameView({
      version: 1,
      status: 'playing',
      players: [
        {
          id: 'self', seat: 0, alive: true, faceUp: true, hp: 2, maxHp: 4, handCount: 4, role: 'lord',
          hand: [
            { id: 'spade-1', kind: 'slash', suit: 'spade', rank: 1, category: 'basic' },
            { id: 'spade-2', kind: 'dodge', suit: 'spade', rank: 2, category: 'basic' },
            { id: 'heart-1', kind: 'peach', suit: 'heart', rank: 3, category: 'basic' },
            { id: 'club-1', kind: 'wine', suit: 'club', rank: 4, category: 'basic' },
          ],
          publicPiles: { field: [{ id: 'field-1', kind: 'slash', suit: 'diamond', rank: 5, category: 'basic' }] },
          publicPileCounts: { stars: 7 },
          privatePiles: { stars: [{ id: 'star-1', kind: 'dodge', suit: 'heart', rank: 6, category: 'basic' }] },
          publicMarks: { rage: 2, ren: 1 },
          publicEffects: [{ effectId: 9, kind: 'kuangfeng', targetPlayerId: 'other', sourcePlayerId: 'self' }],
        },
        { id: 'other', seat: 1, alive: true, faceUp: true, hp: 4, maxHp: 4, handCount: 0, hand: null, role: 'rebel' },
      ],
      currentPlayerId: 'self',
      turn: { number: 20, playerId: 'self', phase: 'play' },
      winner: null,
      logs: [],
      prompt: {
        type: 'play', playerId: 'self',
        cards: [{ cardId: 'spade-1', kind: 'slash', targetMode: 'up-to-four', targetIds: ['other'] }],
        skills: [{
          skillId: 'longhun', cardIds: ['spade-1', 'spade-2', 'heart-1', 'club-1'],
          minCards: 2, maxCards: 2, targetMode: 'single-any', targetIds: ['self', 'other'],
          cardPairs: [['spade-1', 'spade-2']],
          cardGroups: [['spade-1', 'spade-2'], ['heart-1', 'club-1']],
          cardGroupTargets: [{ cardIds: ['spade-1', 'spade-2'], targetIds: ['other'], maxTargets: 4 }],
          virtualCardKind: 'fire_slash',
        }],
        zhangBaSlash: { allowedCardIds: ['spade-1', 'spade-2'], targetIds: ['other'], maxTargets: 4 },
      },
    }, { userId: 'self' });

    expect(game.hand[0]).toMatchObject({ targetMode: 'up-to-four', allowedTargetIds: ['other'] });
    expect(game.skills[0]).toMatchObject({
      skillId: 'longhun', targetMode: 'single-any',
      cardPairs: [['spade-1', 'spade-2']],
      cardGroups: [['spade-1', 'spade-2'], ['heart-1', 'club-1']],
      cardGroupTargets: [{ cardIds: ['spade-1', 'spade-2'], targetIds: ['other'], maxTargets: 4 }],
      virtualCardKind: 'fire_slash',
    });
    expect(game.zhangBaSlash).toEqual({ allowedCardIds: ['spade-1', 'spade-2'], targetIds: ['other'], maxTargets: 4 });
    expect(game.players[0]).toMatchObject({
      publicPileCounts: { stars: 7 }, publicMarks: { rage: 2, ren: 1 },
      publicEffects: [{ effectId: 9, kind: 'kuangfeng', targetPlayerId: 'other', sourcePlayerId: 'self' }],
      publicPiles: { field: [expect.objectContaining({ id: 'field-1' })] },
      privatePiles: { stars: [expect.objectContaining({ id: 'star-1' })] },
    });
  });

  it('normalizes authoritative Guhuo and Pindian prompts', () => {
    const base = {
      version: 1 as const,
      status: 'playing' as const,
      players: [
        { id: 'source', seat: 0, alive: true, hp: 3, maxHp: 3, handCount: 1, hand: null, role: 'rebel' as const },
        {
          id: 'self', seat: 1, alive: true, hp: 4, maxHp: 4, handCount: 2, role: 'lord' as const,
          hand: [{ id: 'pindian-1', kind: 'slash' as const }, { id: 'pindian-2', kind: 'peach' as const }],
        },
      ],
      currentPlayerId: 'source',
      turn: { number: 21, playerId: 'source', phase: 'respond' as const },
      winner: null,
      logs: [],
    };
    const guhuo = normalizeGameView({
      ...base,
      prompt: {
        type: 'guhuo_challenge' as const, playerId: 'self', sourceId: 'source', declaredKind: 'peach' as const,
        promptId: 'guhuo:21:self', canChallenge: true as const,
      },
    }, { userId: 'self' });
    expect(guhuo.prompt).toMatchObject({
      id: 'guhuo:21:self', promptId: 'guhuo:21:self', kind: 'guhuo-challenge',
      sourceId: 'source', declaredKind: 'peach', canChallenge: true, optional: true,
    });

    const pindian = normalizeGameView({
      ...base,
      prompt: {
        type: 'choose_pindian_card' as const, playerId: 'self', opponentId: 'source', skillId: 'tianyi' as const,
        promptId: 'pindian:22:self', allowedCardIds: ['pindian-1', 'pindian-2'],
      },
    }, { userId: 'self' });
    expect(pindian.prompt).toMatchObject({
      id: 'pindian:22:self', promptId: 'pindian:22:self', kind: 'choose-pindian-card',
      opponentId: 'source', skillId: 'tianyi', min: 1, max: 1, allowedCardIds: ['pindian-1', 'pindian-2'],
    });
    expect(pindian.hand.every((card) => card.playable)).toBe(true);
  });

  it('preserves Kanpo, Longhun and grouped response contracts', () => {
    const base = {
      version: 1 as const,
      status: 'playing' as const,
      players: [
        { id: 'source', seat: 0, alive: true, hp: 4, maxHp: 4, handCount: 0, hand: null, role: 'lord' as const },
        {
          id: 'self', seat: 1, alive: true, hp: 2, maxHp: 4, handCount: 3, role: 'rebel' as const,
          hand: [
            { id: 'black-1', kind: 'slash' as const, suit: 'spade' as const },
            { id: 'black-2', kind: 'dodge' as const, suit: 'spade' as const },
            { id: 'club-1', kind: 'wine' as const, suit: 'club' as const },
          ],
        },
      ],
      currentPlayerId: 'source',
      turn: { number: 22, playerId: 'source', phase: 'respond' as const },
      winner: null,
      logs: [],
    };
    const nullification = normalizeGameView({
      ...base,
      prompt: {
        type: 'nullification' as const, playerId: 'self', sourceId: 'source', effectTargetId: 'self',
        cardKind: 'duel' as const, allowedCardIds: [], kanpoCardIds: ['club-1'],
        longhunCardGroups: [['black-1', 'black-2']], canPass: true as const,
      },
    }, { userId: 'self' });
    expect(nullification.prompt).toMatchObject({
      kind: 'respond-nullification', kanpoCardIds: ['club-1'], longhunCardGroups: [['black-1', 'black-2']],
    });

    const response = normalizeGameView({
      ...base,
      prompt: {
        type: 'respond' as const, playerId: 'self', attackerId: 'source', targetId: 'self',
        context: 'duel' as const, responseKind: 'slash' as const, allowedCardIds: [], dodgeCardIds: [], slashCardIds: [],
        requiredCount: 1, respondedCount: 0, canPass: true as const, lordSkills: [],
        skillResponses: [
          { skillId: 'wushen' as const, cardIds: ['black-1'], responseKind: 'slash' as const, minCards: 1, maxCards: 1 },
          {
            skillId: 'longhun' as const, cardIds: ['black-1', 'black-2'], responseKind: 'slash' as const,
            minCards: 2, maxCards: 2, cardGroups: [['black-1', 'black-2']],
          },
          { skillId: 'jiuchi' as const, cardIds: ['club-1'], responseKind: 'wine' as const, minCards: 1, maxCards: 1 },
        ],
      },
    }, { userId: 'self' });
    expect(response.prompt?.skillResponses).toEqual([
      expect.objectContaining({ skillId: 'wushen', minCards: 1, maxCards: 1 }),
      expect.objectContaining({ skillId: 'longhun', minCards: 2, maxCards: 2, cardGroups: [['black-1', 'black-2']] }),
      expect.objectContaining({ skillId: 'jiuchi', responseKind: 'wine', minCards: 1, maxCards: 1 }),
    ]);
  });

  it('preserves standard options, judgment choices and complete action payloads', () => {
    const judgment = { id: 'lightning-1', kind: 'shan_dian', suit: 'spade', rank: 1, category: 'trick' };
    const game = normalizeGameView({
      version: 1,
      status: 'playing',
      players: [
        { id: 'self', seat: 0, alive: true, hp: 3, maxHp: 4, handCount: 0, hand: [], role: 'lord' },
        { id: 'other', seat: 1, alive: true, hp: 4, maxHp: 4, handCount: 0, hand: null, role: 'rebel' },
      ],
      currentPlayerId: 'self',
      turn: { number: 23, playerId: 'self', phase: 'respond' },
      winner: null,
      logs: [],
      prompt: {
        type: 'standard_skill', playerId: 'self', skillId: 'qiaobian', stage: 'invoke',
        promptId: 'standard:23:qiaobian', canPass: true, cards: [], allowedCardIds: [],
        targetIds: ['other'], minCards: 0, maxCards: 0, minTargets: 0, maxTargets: 1,
        options: ['skip_draw', 'skip_play'],
        choices: [{ token: 'judgment:lightning-1', ownerId: 'other', zone: 'judgment', card: judgment }],
      },
    }, { userId: 'self' });
    expect(game.prompt).toMatchObject({
      id: 'standard:23:qiaobian', options: ['skip_draw', 'skip_play'], allowedTargetIds: ['other'],
      zoneChoices: [{ token: 'judgment:lightning-1', ownerId: 'other', zone: 'judgment' }],
    });
    expect(game.prompt?.zoneChoices?.[0]?.label).toContain('判定区');

    const actions = [
      { type: 'declare_guhuo', playerId: 'self', cardId: 'hidden-1', declaredKind: 'slash', targetIds: ['other'] },
      { type: 'resolve_guhuo', playerId: 'self', promptId: 'guhuo:1', challenge: true },
      { type: 'choose_pindian_card', playerId: 'self', promptId: 'pindian:1', cardId: 'hand-1' },
      { type: 'use_zhang_ba_slash', playerId: 'self', cardIds: ['hand-1', 'hand-2'], targetId: 'other', targetIds: ['other', 'third'] },
      {
        type: 'use_skill', playerId: 'self', skillId: 'yeyan', targetIds: ['other', 'third'],
        allocations: [{ targetId: 'other', damage: 2 }, { targetId: 'third', damage: 1 }],
      },
      {
        type: 'resolve_standard_skill', playerId: 'self', promptId: 'standard:1', activate: true,
        targetIds: ['other', 'third'], allocations: [{ cardId: 'viewed-1', targetId: 'other' }], viewAsSkillId: 'longhun',
      },
      { type: 'invoke_lord_skill', playerId: 'self', skillId: 'jijiang', targetId: 'other', targetIds: ['other', 'third'] },
    ] satisfies GameAction[];
    expect(actions.map((action) => action.type)).toEqual([
      'declare_guhuo', 'resolve_guhuo', 'choose_pindian_card', 'use_zhang_ba_slash',
      'use_skill', 'resolve_standard_skill', 'invoke_lord_skill',
    ]);
  });
});
