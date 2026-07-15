import { describe, expect, it } from 'vitest';
import { normalizeGameView, normalizeRoomDetail } from './types';

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
    expect(room.members[0]).toMatchObject({ userId: 'user-1', isHost: true, online: true });
    expect(room.members[1]).toMatchObject({ userId: 'user-2', isHost: false, online: false });
  });

  it('turns a private engine view into playable UI state', () => {
    const game = normalizeGameView({
      version: 1,
      status: 'playing',
      players: [
        { id: 'user-1', seat: 0, alive: true, hp: 4, maxHp: 4, handCount: 2, equipment: [
          { id: 'horse-1', kind: 'chi_tu', name: '赤兔', suit: 'heart', rank: 5, category: 'equipment' },
        ], judgment: [
          { id: 'lebu-1', kind: 'le_bu_si_shu', name: '乐不思蜀', suit: 'heart', rank: 6, category: 'trick' },
        ], hand: [
          { id: 'card-1', kind: 'slash' },
          { id: 'card-2', kind: 'peach' },
        ], role: 'lord' },
        { id: 'user-2', seat: 1, alive: true, hp: 3, maxHp: 4, handCount: 1, hand: null, role: null },
      ],
      currentPlayerId: 'user-1',
      turn: { number: 2, playerId: 'user-1', phase: 'play', slashUsed: false, requiredDiscardCount: 0 },
      pendingResponse: null,
      winner: null,
      logs: [{ id: 1, type: 'turn', message: 'user-1 的回合开始' }],
      prompt: {
        type: 'play',
        playerId: 'user-1',
        cards: [
          { cardId: 'card-1', kind: 'slash', targetIds: ['user-2'] },
          { cardId: 'card-2', kind: 'peach', targetIds: [] },
        ],
      },
    }, { userId: 'user-1', roomId: 'room-1' });

    expect(game).toMatchObject({ roomId: 'room-1', round: 2, canAct: true, selfPlayerId: 'user-1' });
    expect(game.hand[0]).toMatchObject({ id: 'card-1', name: '杀', playable: true, allowedTargetIds: ['user-2'] });
    expect(game.hand[1]).toMatchObject({ id: 'card-2', name: '桃', playable: true, targetMode: 'self' });
    expect(game.players[0]).toMatchObject({ isSelf: true, identity: '主公' });
    expect(game.players[0]?.equipment?.[0]).toMatchObject({
      id: 'horse-1', kind: 'chi_tu', slot: '进攻坐骑', name: '赤兔', suit: 'heart', rank: '5', category: 'equipment',
    });
    expect(game.players[0]?.judgment?.[0]).toMatchObject({ id: 'lebu-1', slot: '判定区', name: '乐不思蜀' });
    expect(game.logs[0]?.text).toBe('玩家 1 的回合开始');
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
        zhangBaSlash: { allowedCardIds: ['cost-1', 'cost-2'], targetIds: ['user-2'] },
      },
    }, { userId: 'user-1' });
    expect(play.zhangBaSlash).toEqual({ allowedCardIds: ['cost-1', 'cost-2'], targetIds: ['user-2'] });
    expect(play.players[0]?.equipment?.[0]).toMatchObject({ id: 'zhangba', kind: 'zhang_ba_she_mao', slot: '武器', name: '丈八蛇矛' });

    const weapon = normalizeGameView({
      ...base,
      turn: { ...base.turn, phase: 'respond' as const },
      prompt: {
        type: 'weapon_action', playerId: 'user-1', weaponKind: 'guan_shi_fu',
        stage: 'guanshi_force_hit', victimId: 'user-2', allowedCardIds: ['cost-1', 'cost-2'],
        minCards: 2, maxCards: 2, canPass: true,
      },
    }, { userId: 'user-1' });
    expect(weapon.prompt).toMatchObject({
      kind: 'weapon-action', weaponStage: 'guanshi_force_hit', min: 2, max: 2,
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
  });
});
