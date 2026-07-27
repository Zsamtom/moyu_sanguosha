import { describe, expect, it } from 'vitest';
import {
  activeSkillDescriptions,
  canSubmitStandardSkill,
  canSubmitSkillUse,
  canSubmitCardPlay,
  cardPlayButtonLabel,
  cardRequiresTarget,
  createUseSkillAction,
  createStandardSkillAction,
  createStandardSkillActionFromUi,
  createZhangBaSlashAction,
  findSkillVariant,
  getRoomStartBlockReason,
  generalSkillNames,
  isCardAllowedByPrompt,
  isCardResponsePrompt,
  responseCardName,
  selectableResponseSkills,
  skillVariantKey,
  standardSkillOptionLabel,
  surrenderCopy,
} from './interactionRules';
import type { ActionPrompt, GameCard, PlayableSkillHint, RoomDetail } from './types';

function roomWith(overrides: Partial<RoomDetail> = {}): RoomDetail {
  return {
    id: 'room-1',
    name: '测试房间',
    gameType: 'sanguosha',
    status: 'waiting',
    hostId: 'user-1',
    hostName: '房主',
    playerCount: 2,
    maxPlayers: 5,
    chatMessages: [],
    members: [
      { userId: 'user-1', username: 'owner', displayName: '房主', seat: 0, ready: true, online: true, isHost: true },
      { userId: 'user-2', username: 'player', displayName: '玩家', seat: 1, ready: true, online: true, isHost: false },
    ],
    ...overrides,
  };
}

describe('room start rules', () => {
  it('allows starting only when connected and every player is online and ready', () => {
    expect(getRoomStartBlockReason(roomWith(), true)).toBeUndefined();
    expect(getRoomStartBlockReason(roomWith(), false)).toContain('连接');
  });

  it('blocks starting while any seated player is offline', () => {
    const room = roomWith();
    room.members[1] = { ...room.members[1]!, online: false };
    expect(getRoomStartBlockReason(room, true)).toContain('离线');
  });

  it('blocks starting while any seated player is not ready', () => {
    const room = roomWith();
    room.members[1] = { ...room.members[1]!, ready: false };
    expect(getRoomStartBlockReason(room, true)).toContain('准备');
  });
});

describe('active-game exit copy', () => {
  it('makes surrender consequences explicit before invoking the exit flow', () => {
    expect(surrenderCopy.label).toBe('投降并离开');
    expect(surrenderCopy.title).toContain('确定');
    expect(surrenderCopy.description).toMatch(/放弃本局.*结束你的个人参与/);
  });
});

it('provides a non-empty Web label for all 124 live skills', () => {
  expect(Object.keys(generalSkillNames)).toHaveLength(124);
  expect(Object.values(generalSkillNames).every(Boolean)).toBe(true);
});

function gameCard(overrides: Partial<GameCard>): GameCard {
  return {
    id: 'card-1',
    name: '无中生有',
    kind: 'ex_nihilo',
    suit: 'heart',
    rank: '7',
    category: 'trick',
    playable: true,
    ...overrides,
  };
}

describe('standard-card interaction rules', () => {
  it.each(['slash', 'fire_slash', 'thunder_slash', 'duel', 'guo_he_chai_qiao', 'shun_shou_qian_yang'] as const)(
    'requires exactly one legal target for %s',
    (kind) => {
      const card = gameCard({ kind, name: kind, targetMode: 'single-other', allowedTargetIds: ['user-2'] });
      expect(cardRequiresTarget(card)).toBe(true);
      expect(canSubmitCardPlay(card, [])).toBe(false);
      expect(canSubmitCardPlay(card, ['user-3'])).toBe(false);
      expect(canSubmitCardPlay(card, ['user-2'])).toBe(true);
    },
  );

  it.each(['wine', 'ex_nihilo', 'barbarian_invasion', 'arrow_barrage', 'peach_garden'] as const)(
    'can submit %s without selecting a target',
    (kind) => {
      const card = gameCard({ kind, name: kind, targetMode: 'none' });
      expect(cardRequiresTarget(card)).toBe(false);
      expect(canSubmitCardPlay(card, [])).toBe(true);
    },
  );

  it('uses Peach on self without requiring a player-panel selection', () => {
    const peach = gameCard({ kind: 'peach', name: '桃', targetMode: 'self', allowedTargetIds: ['user-1'] });
    expect(cardRequiresTarget(peach)).toBe(false);
    expect(canSubmitCardPlay(peach, [])).toBe(true);
  });

  it('accepts zero to two legal Iron Chain targets for recast or chaining', () => {
    const ironChain = gameCard({
      kind: 'iron_chain', name: '铁索连环', targetMode: 'up-to-two', allowedTargetIds: ['user-1', 'user-2', 'user-3'],
    });
    expect(canSubmitCardPlay(ironChain, [])).toBe(true);
    expect(canSubmitCardPlay(ironChain, ['user-1'])).toBe(true);
    expect(canSubmitCardPlay(ironChain, ['user-1', 'user-2'])).toBe(true);
    expect(canSubmitCardPlay(ironChain, ['user-1', 'user-2', 'user-3'])).toBe(false);
    expect(canSubmitCardPlay(ironChain, ['forged'])).toBe(false);
  });

  it('accepts one to three distinct legal targets for FangTian Slash', () => {
    const slash = gameCard({
      kind: 'slash', name: '杀', targetMode: 'up-to-three',
      allowedTargetIds: ['user-2', 'user-3', 'user-4'],
    });
    expect(canSubmitCardPlay(slash, [])).toBe(false);
    expect(canSubmitCardPlay(slash, ['user-2'])).toBe(true);
    expect(canSubmitCardPlay(slash, ['user-2', 'user-3', 'user-4'])).toBe(true);
    expect(canSubmitCardPlay(slash, ['user-2', 'user-2'])).toBe(false);
    expect(canSubmitCardPlay(slash, ['user-2', 'forged'])).toBe(false);
  });

  it('supports single-any and one-to-four target contracts', () => {
    const singleAny = gameCard({ targetMode: 'single-any', allowedTargetIds: ['self', 'other'] });
    expect(canSubmitCardPlay(singleAny, ['self'])).toBe(true);
    expect(canSubmitCardPlay(singleAny, [])).toBe(false);

    const upToFour = gameCard({
      kind: 'slash', name: '杀', targetMode: 'up-to-four', allowedTargetIds: ['one', 'two', 'three', 'four'],
    });
    expect(canSubmitCardPlay(upToFour, ['one', 'two', 'three', 'four'])).toBe(true);
    expect(canSubmitCardPlay(upToFour, [])).toBe(false);
    expect(canSubmitCardPlay(upToFour, ['one', 'two', 'three', 'four', 'five'])).toBe(false);
    expect(cardPlayButtonLabel(upToFour)).toContain('至多四名');
  });

  it('requires a legal ordered target pair for Borrowed Sword', () => {
    const borrowedSword = gameCard({
      kind: 'borrowed_sword',
      name: '借刀杀人',
      targetMode: 'ordered-two',
      allowedTargetIds: ['holder'],
      allowedTargetPairs: [['holder', 'victim']],
    });
    expect(canSubmitCardPlay(borrowedSword, ['holder', 'victim'])).toBe(true);
    expect(canSubmitCardPlay(borrowedSword, ['victim', 'holder'])).toBe(false);
    expect(canSubmitCardPlay(borrowedSword, ['holder'])).toBe(false);
  });

  it('uses card-specific play copy and generic slash/dodge response copy', () => {
    expect(cardPlayButtonLabel(gameCard({ name: '决斗', kind: 'duel', targetMode: 'single-other' }))).toBe('对目标使用「决斗」');
    expect(cardPlayButtonLabel(gameCard({ name: '无中生有', kind: 'ex_nihilo', targetMode: 'none' }))).toBe('使用「无中生有」');

    const slashPrompt = { id: 'p1', kind: 'respond-slash', message: '请出杀', responseKind: 'slash' } as const;
    const dodgePrompt = { id: 'p2', kind: 'respond-dodge', message: '请出闪', responseKind: 'dodge' } as const;
    expect(isCardResponsePrompt(slashPrompt)).toBe(true);
    expect(responseCardName(slashPrompt)).toBe('杀');
    expect(responseCardName(dodgePrompt)).toBe('闪');
  });

  it('accepts every slash nature for a slash response and rejects unrelated cards', () => {
    const prompt: ActionPrompt = {
      id: 'duel-response',
      kind: 'respond-slash',
      message: '请出杀',
      responseKind: 'slash',
      allowedCardIds: ['slash', 'fire', 'thunder'],
    };

    expect(isCardAllowedByPrompt(gameCard({ id: 'slash', kind: 'slash' }), prompt)).toBe(true);
    expect(isCardAllowedByPrompt(gameCard({ id: 'fire', kind: 'fire_slash' }), prompt)).toBe(true);
    expect(isCardAllowedByPrompt(gameCard({ id: 'thunder', kind: 'thunder_slash' }), prompt)).toBe(true);
    expect(isCardAllowedByPrompt(gameCard({ id: 'dodge', kind: 'dodge' }), prompt)).toBe(false);
  });

  it('allows arbitrary hand cards selected as a ZhangBa virtual Slash response', () => {
    const prompt: ActionPrompt = {
      id: 'zhangba-response',
      kind: 'respond-slash',
      message: '请出杀',
      responseKind: 'slash',
      allowedCardIds: ['dodge', 'peach'],
      zhangBaAllowedCardIds: ['dodge', 'peach'],
    };
    expect(isCardAllowedByPrompt(gameCard({ id: 'dodge', kind: 'dodge' }), prompt)).toBe(true);
    expect(isCardAllowedByPrompt(gameCard({ id: 'peach', kind: 'peach' }), prompt)).toBe(true);
  });

  it('allows Peach or Wine only when listed by a dying rescue prompt', () => {
    const prompt: ActionPrompt = {
      id: 'dying-response',
      kind: 'respond-peach',
      message: '濒死救援',
      allowedCardIds: ['peach', 'wine'],
    };

    expect(isCardAllowedByPrompt(gameCard({ id: 'peach', kind: 'peach' }), prompt)).toBe(true);
    expect(isCardAllowedByPrompt(gameCard({ id: 'wine', kind: 'wine' }), prompt)).toBe(true);
    expect(isCardAllowedByPrompt(gameCard({ id: 'slash', kind: 'slash' }), prompt)).toBe(false);
    expect(responseCardName(prompt)).toBe('桃 / 酒');
  });

  it('allows only Nullification during a nullification response', () => {
    const prompt: ActionPrompt = {
      id: 'nullification-response',
      kind: 'respond-nullification',
      message: '是否使用无懈可击',
      responseKind: 'nullification',
      allowedCardIds: ['wuxie'],
    };
    expect(isCardResponsePrompt(prompt)).toBe(true);
    expect(responseCardName(prompt)).toBe('无懈可击');
    expect(isCardAllowedByPrompt(gameCard({ id: 'wuxie', kind: 'wu_xie_ke_ji' }), prompt)).toBe(true);
    expect(isCardAllowedByPrompt(gameCard({ id: 'dodge', kind: 'dodge' }), prompt)).toBe(false);
  });
});

describe('general-skill interaction rules', () => {
  const wusheng: PlayableSkillHint = {
    skillId: 'wusheng',
    cardIds: ['red-hand', 'red-horse'],
    minCards: 1,
    maxCards: 1,
    targetMode: 'single-other',
    targetIds: ['nearby', 'far'],
    cardTargetIds: {
      'red-hand': ['nearby', 'far'],
      'red-horse': ['nearby'],
    },
    virtualCardKind: 'slash',
  };

  it('requires one legal cost and a target legal after that exact equipment cost is removed', () => {
    expect(canSubmitSkillUse(wusheng, ['red-hand'], ['far'])).toBe(true);
    expect(canSubmitSkillUse(wusheng, ['red-horse'], ['far'])).toBe(false);
    expect(canSubmitSkillUse(wusheng, ['red-horse'], ['nearby'])).toBe(true);
    expect(canSubmitSkillUse(wusheng, [], ['nearby'])).toBe(false);
    expect(canSubmitSkillUse(wusheng, ['forged'], ['nearby'])).toBe(false);
  });

  it('accepts Kurou only without card or target selections', () => {
    const kurou: PlayableSkillHint = {
      skillId: 'kurou', cardIds: [], minCards: 0, maxCards: 0, targetMode: 'none', targetIds: [],
    };
    expect(canSubmitSkillUse(kurou, [], [])).toBe(true);
    expect(canSubmitSkillUse(kurou, ['card'], [])).toBe(false);
    expect(canSubmitSkillUse(kurou, [], ['target'])).toBe(false);
  });

  it('keeps Fanjian cost-free and requires Lijian exact ordered target pairs', () => {
    const fanjian: PlayableSkillHint = {
      skillId: 'fanjian', cardIds: [], minCards: 0, maxCards: 0,
      targetMode: 'single-other', targetIds: ['target'],
    };
    expect(createUseSkillAction('zhou-yu', fanjian, [], ['target'])).toEqual({
      type: 'use_skill', playerId: 'zhou-yu', skillId: 'fanjian', targetId: 'target',
    });

    const lijian: PlayableSkillHint = {
      skillId: 'lijian', cardIds: ['cost'], minCards: 1, maxCards: 1,
      targetMode: 'ordered-two', targetIds: ['first', 'second', 'third'],
      targetPairs: [['first', 'second'], ['second', 'first']],
    };
    expect(canSubmitSkillUse(lijian, ['cost'], ['first'])).toBe(false);
    expect(canSubmitSkillUse(lijian, ['cost'], ['first', 'third'])).toBe(false);
    expect(canSubmitSkillUse(lijian, ['cost'], ['second', 'first'])).toBe(true);
    expect(createUseSkillAction('diao-chan', lijian, ['cost'], ['second', 'first'])).toEqual({
      type: 'use_skill', playerId: 'diao-chan', skillId: 'lijian', cardIds: ['cost'], targetIds: ['second', 'first'],
    });
  });

  it('creates the dedicated server-authoritative active Jijiang request action', () => {
    const jijiang: PlayableSkillHint = {
      skillId: 'jijiang', cardIds: [], minCards: 0, maxCards: 0,
      targetMode: 'single-other', targetIds: ['victim'], virtualCardKind: 'slash',
    };
    expect(canSubmitSkillUse(jijiang, [], ['victim'])).toBe(true);
    expect(createUseSkillAction('lord', jijiang, [], ['victim'])).toEqual({
      type: 'invoke_lord_skill', playerId: 'lord', skillId: 'jijiang', targetId: 'victim',
    });
  });

  it('provides explicit Chinese names and consequences for every currently interactive skill', () => {
    expect(generalSkillNames).toMatchObject({
      wusheng: '武圣', longdan: '龙胆', qixi: '奇袭', kurou: '苦肉',
      zhiheng: '制衡', rende: '仁德', qingnang: '青囊', jieyin: '结姻', guose: '国色', qingguo: '倾国',
      jijiu: '急救', fanjian: '反间', lijian: '离间', jijiang: '激将', huangtian: '黄天',
      luoyi: '裸衣', keji: '克己', yingzi: '英姿', biyue: '闭月', luoshen: '洛神',
      niepan: '涅槃',
      jianxiong: '奸雄', tiandu: '天妒', yiji: '遗计', guicai: '鬼才', fankui: '反馈',
      ganglie: '刚烈', tuxi: '突袭', guanxing: '观星', tieqi: '铁骑', liuli: '流离', buqu: '不屈', liegong: '烈弓', tianxiang: '天香',
    });
    expect(activeSkillDescriptions.kurou).toContain('失去 1 点体力');
    expect(activeSkillDescriptions.zhiheng).toContain('装备牌');
    expect(activeSkillDescriptions.qingguo).toContain('黑色手牌');
    expect(activeSkillDescriptions.jijiu).toContain('装备牌');
    expect(activeSkillDescriptions.fanjian).toContain('声明花色');
    expect(activeSkillDescriptions.lijian).toContain('不可被无懈');
    expect(activeSkillDescriptions.jijiang).toContain('实体');
    expect(activeSkillDescriptions.huangtian).toContain('闪电');
  });

  it('creates a no-target Zhiheng payload with every selected hand or equipment cost', () => {
    const zhiheng: PlayableSkillHint = {
      skillId: 'zhiheng', cardIds: ['hand', 'armor'], minCards: 1, maxCards: 2, targetMode: 'none', targetIds: [],
    };
    expect(canSubmitSkillUse(zhiheng, ['hand', 'armor'], [])).toBe(true);
    expect(createUseSkillAction('sun-quan', zhiheng, ['hand', 'armor'], [])).toEqual({
      type: 'use_skill', playerId: 'sun-quan', skillId: 'zhiheng', cardIds: ['hand', 'armor'],
    });
  });

  it('creates one targetId for multi-card Rende and enforces exactly two cards for Jieyin', () => {
    const rende: PlayableSkillHint = {
      skillId: 'rende', cardIds: ['one', 'two', 'three'], minCards: 1, maxCards: 3,
      targetMode: 'single-other', targetIds: ['ally'],
    };
    expect(createUseSkillAction('liu-bei', rende, ['one', 'three'], ['ally'])).toEqual({
      type: 'use_skill', playerId: 'liu-bei', skillId: 'rende', cardIds: ['one', 'three'], targetId: 'ally',
    });

    const jieyin: PlayableSkillHint = {
      skillId: 'jieyin', cardIds: ['one', 'two', 'three'], minCards: 2, maxCards: 2,
      targetMode: 'single-other', targetIds: ['injured-man'],
    };
    expect(canSubmitSkillUse(jieyin, ['one'], ['injured-man'])).toBe(false);
    expect(createUseSkillAction('sun-shang-xiang', jieyin, ['one', 'two'], ['injured-man'])).toMatchObject({
      skillId: 'jieyin', cardIds: ['one', 'two'], targetId: 'injured-man',
    });
  });

  it('allows Qingnang to target self and creates Qingguo response payload without a target', () => {
    const qingnang: PlayableSkillHint = {
      skillId: 'qingnang', cardIds: ['cost'], minCards: 1, maxCards: 1,
      targetMode: 'single-other', targetIds: ['hua-tuo', 'ally'],
    };
    expect(canSubmitSkillUse(qingnang, ['cost'], ['hua-tuo'])).toBe(true);
    expect(createUseSkillAction('hua-tuo', qingnang, ['cost'], ['hua-tuo'])).toMatchObject({
      skillId: 'qingnang', cardIds: ['cost'], targetId: 'hua-tuo',
    });

    const qingguo: PlayableSkillHint = {
      skillId: 'qingguo', cardIds: ['black-hand'], minCards: 1, maxCards: 1, targetMode: 'none', targetIds: [],
    };
    expect(createUseSkillAction('zhen-ji', qingguo, ['black-hand'], [])).toEqual({
      type: 'use_skill', playerId: 'zhen-ji', skillId: 'qingguo', cardIds: ['black-hand'],
    });
  });

  it('accepts a diamond equipment card as a Guose cost', () => {
    const guose: PlayableSkillHint = {
      skillId: 'guose', cardIds: ['diamond-horse'], minCards: 1, maxCards: 1,
      targetMode: 'single-other', targetIds: ['victim'], virtualCardKind: 'le_bu_si_shu',
    };
    expect(createUseSkillAction('da-qiao', guose, ['diamond-horse'], ['victim'])).toMatchObject({
      skillId: 'guose', cardIds: ['diamond-horse'], targetId: 'victim',
    });
  });

  it('creates a Jijiu rescue payload from one red hand or equipment card without a target', () => {
    const jijiu: PlayableSkillHint = {
      skillId: 'jijiu', cardIds: ['red-horse'], minCards: 1, maxCards: 1, targetMode: 'none', targetIds: [],
    };
    expect(createUseSkillAction('hua-tuo', jijiu, ['red-horse'], [])).toEqual({
      type: 'use_skill', playerId: 'hua-tuo', skillId: 'jijiu', cardIds: ['red-horse'],
    });
  });

  it('turns Qingguo and Jijiu response hints into one-card, no-target UI selections', () => {
    expect(selectableResponseSkills([
      { skillId: 'qingguo', cardIds: ['black-hand'], responseKind: 'dodge' },
      { skillId: 'jijiu', cardIds: ['red-horse'], responseKind: 'peach' },
    ])).toEqual([
      expect.objectContaining({ skillId: 'qingguo', cardIds: ['black-hand'], minCards: 1, maxCards: 1, targetMode: 'none' }),
      expect.objectContaining({ skillId: 'jijiu', cardIds: ['red-horse'], minCards: 1, maxCards: 1, targetMode: 'none' }),
    ]);
  });

  it('enforces exact card pairs, card groups and per-group target limits', () => {
    const luanji: PlayableSkillHint = {
      skillId: 'luanji', cardIds: ['a', 'b', 'c'], minCards: 2, maxCards: 2,
      targetMode: 'none', targetIds: [], cardPairs: [['a', 'b']],
    };
    expect(canSubmitSkillUse(luanji, ['b', 'a'], [])).toBe(true);
    expect(canSubmitSkillUse(luanji, ['a', 'c'], [])).toBe(false);

    const longhun: PlayableSkillHint = {
      skillId: 'longhun', cardIds: ['d1', 'd2', 'd3', 'd4'], minCards: 2, maxCards: 2,
      targetMode: 'up-to-four', targetIds: ['one', 'two', 'three', 'four'],
      cardGroups: [['d1', 'd2'], ['d3', 'd4']],
      cardGroupTargets: [
        { cardIds: ['d1', 'd2'], targetIds: ['one', 'two'], maxTargets: 2 },
        { cardIds: ['d3', 'd4'], targetIds: ['three'], maxTargets: 1 },
      ],
      virtualCardKind: 'fire_slash',
    };
    expect(canSubmitSkillUse(longhun, ['d2', 'd1'], ['one', 'two'])).toBe(true);
    expect(canSubmitSkillUse(longhun, ['d1', 'd2'], ['three'])).toBe(false);
    expect(canSubmitSkillUse(longhun, ['d3', 'd4'], ['three', 'one'])).toBe(false);

    const singleAny: PlayableSkillHint = {
      skillId: 'huoji', cardIds: ['red'], minCards: 1, maxCards: 1,
      targetMode: 'single-any', targetIds: ['self'], virtualCardKind: 'fire_attack',
    };
    expect(createUseSkillAction('self', singleAny, ['red'], ['self'])).toMatchObject({ targetId: 'self' });
  });

  it('keeps grouped response costs and resolves same-skill variants by the selected contract', () => {
    const responseSkills = selectableResponseSkills([
      {
        skillId: 'longhun', cardIds: ['d1', 'd2'], responseKind: 'slash', minCards: 2, maxCards: 2,
        cardGroups: [['d1', 'd2']],
      },
      { skillId: 'jiuchi', cardIds: ['spade'], responseKind: 'wine' },
    ]);
    expect(responseSkills).toEqual([
      expect.objectContaining({
        skillId: 'longhun', minCards: 2, maxCards: 2, cardGroups: [['d1', 'd2']], virtualCardKind: 'slash',
      }),
      expect.objectContaining({ skillId: 'jiuchi', minCards: 1, maxCards: 1, virtualCardKind: 'wine' }),
    ]);

    const variants: PlayableSkillHint[] = [
      {
        skillId: 'longhun', cardIds: ['h1', 'h2'], minCards: 2, maxCards: 2,
        targetMode: 'none', targetIds: [], cardGroups: [['h1', 'h2']], virtualCardKind: 'peach',
      },
      {
        skillId: 'longhun', cardIds: ['d1', 'd2'], minCards: 2, maxCards: 2,
        targetMode: 'single-any', targetIds: ['victim'], cardGroups: [['d1', 'd2']], virtualCardKind: 'fire_slash',
      },
    ];
    expect(skillVariantKey(variants[0]!)).not.toBe(skillVariantKey(variants[1]!));
    expect(findSkillVariant(variants, 'longhun', ['h1', 'h2'], [])).toBe(variants[0]);
    expect(findSkillVariant(variants, 'longhun', ['d2', 'd1'], ['victim'])).toBe(variants[1]);
  });

  it('builds multi-target Jijiang and ZhangBa actions without losing ordered targetIds', () => {
    const jijiang: PlayableSkillHint = {
      skillId: 'jijiang', cardIds: [], minCards: 0, maxCards: 0,
      targetMode: 'up-to-four', targetIds: ['one', 'two', 'three'], virtualCardKind: 'slash',
    };
    expect(canSubmitSkillUse({ ...jijiang, targetMode: 'up-to-two' }, [], [])).toBe(false);
    expect(createUseSkillAction('lord', jijiang, [], ['one', 'two', 'three'])).toEqual({
      type: 'invoke_lord_skill', playerId: 'lord', skillId: 'jijiang',
      targetId: 'one', targetIds: ['one', 'two', 'three'],
    });
    expect(createZhangBaSlashAction('owner', ['cost-1', 'cost-2'], ['one', 'two', 'three'], 3)).toEqual({
      type: 'use_zhang_ba_slash', playerId: 'owner', cardIds: ['cost-1', 'cost-2'],
      targetId: 'one', targetIds: ['one', 'two', 'three'],
    });
    expect(() => createZhangBaSlashAction('owner', ['cost-1', 'cost-1'], ['one'], 1)).toThrow();
  });

  it('validates Yeyan allocations and emits only the authoritative allocation payload', () => {
    const lesser: PlayableSkillHint = {
      skillId: 'yeyan', cardIds: [], minCards: 0, maxCards: 0,
      targetMode: 'up-to-three', targetIds: ['one', 'two', 'three'],
    };
    const lesserAllocations = [{ targetId: 'one', damage: 1 }, { targetId: 'two', damage: 1 }];
    expect(canSubmitSkillUse(lesser, [], ['one', 'two'], lesserAllocations)).toBe(true);
    expect(createUseSkillAction('zhou-yu', lesser, [], ['one', 'two'], lesserAllocations)).toEqual({
      type: 'use_skill', playerId: 'zhou-yu', skillId: 'yeyan', allocations: lesserAllocations,
    });
    expect(canSubmitSkillUse(lesser, [], ['one'], [{ targetId: 'one', damage: 2 }])).toBe(false);

    const greater: PlayableSkillHint = {
      skillId: 'yeyan', cardIds: ['s', 'h', 'c', 'd'], minCards: 4, maxCards: 4,
      targetMode: 'up-to-three', targetIds: ['one'], cardGroups: [['s', 'h', 'c', 'd']],
    };
    expect(canSubmitSkillUse(greater, ['d', 'c', 'h', 's'], ['one'], [{ targetId: 'one', damage: 3 }])).toBe(true);
    expect(canSubmitSkillUse(greater, ['s', 'h', 'c', 'd'], ['one'], [{ targetId: 'one', damage: 2 }])).toBe(true);
    expect(canSubmitSkillUse(greater, ['s', 'h', 'c', 'd'], ['one'], [{ targetId: 'one', damage: 1 }])).toBe(false);
  });
});

describe('generic standard-skill action rules', () => {
  const prompt = (overrides: Partial<ActionPrompt> = {}): ActionPrompt & { kind: 'standard-skill' } => ({
    id: 'standard:1', message: '处理技能', optional: true,
    min: 0, max: 0, minTargets: 0, maxTargets: 0,
    allowedCardIds: [], allowedTargetIds: [],
    ...overrides,
    kind: 'standard-skill',
  });

  it('defaults an unknown optional prompt to decline and never activates implicitly', () => {
    const unknown = prompt({ standardStage: 'future_stage', skillId: 'future_skill' });
    expect(createStandardSkillAction('self', unknown)).toEqual({
      type: 'resolve_standard_skill', playerId: 'self', promptId: 'standard:1', activate: false,
    });
    expect(canSubmitStandardSkill('self', unknown)).toBe(true);
  });

  it('blocks an incomplete mandatory prompt', () => {
    const mandatory = prompt({
      optional: false, min: 1, max: 1, allowedCardIds: ['required-card'],
    });
    expect(canSubmitStandardSkill('self', mandatory)).toBe(false);
    expect(() => createStandardSkillAction('self', mandatory)).toThrow('必须完成选择');
    expect(createStandardSkillAction('self', mandatory, { activate: true, cardId: 'required-card' })).toMatchObject({
      activate: true, cardId: 'required-card',
    });
  });

  it('accepts only advertised options and zone tokens', () => {
    const choice = prompt({
      options: ['draw', 'recover'],
      zoneChoices: [{ token: 'judgment:lightning', ownerId: 'other', zone: 'judgment', label: '闪电' }],
    });
    expect(createStandardSkillAction('self', choice, { activate: true, tokens: ['recover'] })).toMatchObject({
      activate: true, tokens: ['recover'],
    });
    expect(() => createStandardSkillAction('self', choice, { activate: true, tokens: ['forged'] })).toThrow('选项');
    expect(() => createStandardSkillAction('self', choice, { activate: true })).toThrow('选项');

    const mandatoryZoneChoice = prompt({
      optional: false, min: 1, max: 1,
      zoneChoices: [{ token: 'hand:0', ownerId: 'other', zone: 'hand', label: '一张手牌' }],
    });
    expect(createStandardSkillAction('self', mandatoryZoneChoice, {
      activate: true, tokens: ['hand:0'],
    })).toMatchObject({ activate: true, tokens: ['hand:0'] });
    expect(() => createStandardSkillAction('self', mandatoryZoneChoice, { activate: true })).toThrow('技能牌');
  });

  it('requires all six seats before a Gouji room can start', () => {
    expect(getRoomStartBlockReason(roomWith({ gameType: 'gouji', maxPlayers: 6 }), true)).toContain('6 人');
  });

  it('requires all three seats before a Doudizhu room can start', () => {
    expect(getRoomStartBlockReason(roomWith({ gameType: 'doudizhu', maxPlayers: 3 }), true)).toContain('3 人');
  });

  it('submits pure mandatory choices used by Benghuai, Zhiji, Qinyin and Wumou', () => {
    const choice = prompt({
      optional: false,
      standardStage: 'benghuai_choice',
      skillId: 'benghuai',
      options: ['lose_hp', 'lose_max_hp'],
    });
    expect(createStandardSkillActionFromUi('self', choice, { option: 'lose_max_hp' })).toEqual({
      type: 'resolve_standard_skill', playerId: 'self', promptId: 'standard:1', activate: true,
      tokens: ['lose_max_hp'],
    });
    expect(standardSkillOptionLabel('lose_max_hp')).toContain('体力上限');
    expect(() => createStandardSkillActionFromUi('self', choice)).toThrow('选择');
  });

  it('combines advertised modes with targets or cards for Yinghun and Gongxin', () => {
    const yinghun = prompt({
      standardStage: 'yinghun_select', skillId: 'yinghun',
      options: ['draw_x_discard_one', 'draw_one_discard_x'],
      allowedTargetIds: ['target'], minTargets: 1, maxTargets: 1,
    });
    expect(createStandardSkillActionFromUi('self', yinghun, {
      option: 'draw_x_discard_one', targetIds: ['target'],
    })).toMatchObject({ activate: true, targetId: 'target', tokens: ['draw_x_discard_one'] });

    const gongxin = prompt({
      standardStage: 'gongxin_choose', skillId: 'gongxin', options: ['discard', 'put_on_draw_pile_top'],
      allowedCardIds: ['heart'], min: 0, max: 1,
    });
    expect(createStandardSkillActionFromUi('self', gongxin, {
      option: 'discard', cardIds: ['heart'],
    })).toMatchObject({ activate: true, cardId: 'heart', tokens: ['discard'] });
  });

  it('encodes Luanwu and Tiaoxin Slash variants through viewAs fields instead of option tokens', () => {
    const luanwu = prompt({
      standardStage: 'luanwu_slash', skillId: 'luanwu',
      options: ['physical_slash', 'wusheng', 'zhang_ba_she_mao', 'lose_hp'],
      allowedCardIds: ['slash', 'red', 'cost-a', 'cost-b'], min: 1, max: 2,
      allowedTargetIds: ['nearest'], minTargets: 1, maxTargets: 1,
    });
    expect(createStandardSkillActionFromUi('self', luanwu, {
      option: 'wusheng', cardIds: ['red'], targetIds: ['nearest'],
    })).toMatchObject({ activate: true, cardId: 'red', targetId: 'nearest', viewAsSkillId: 'wusheng' });
    expect(createStandardSkillActionFromUi('self', luanwu, { option: 'lose_hp' })).toMatchObject({ activate: false });
    expect(() => createStandardSkillActionFromUi('self', luanwu, {
      option: 'zhang_ba_she_mao', cardIds: ['cost-a'], targetIds: ['nearest'],
    })).toThrow('两张');

    const tiaoxin = prompt({
      standardStage: 'tiaoxin_response', skillId: 'tiaoxin',
      options: ['jijiang', 'decline'], min: 0, max: 0,
    });
    expect(createStandardSkillActionFromUi('self', tiaoxin, { option: 'jijiang' })).toMatchObject({
      activate: true, tokens: ['jijiang'],
    });
    expect(createStandardSkillActionFromUi('self', tiaoxin, { option: 'decline' })).toMatchObject({ activate: false });
  });

  it('submits generic region choices and keeps Dawu cards paired with targets', () => {
    const region = prompt({
      optional: false, standardStage: 'guixin_select', skillId: 'guixin', min: 1, max: 1,
      zoneChoices: [{ token: 'equipment:weapon', ownerId: 'other', zone: 'equipment', label: '武器' }],
    });
    expect(createStandardSkillActionFromUi('self', region, { zoneTokens: ['equipment:weapon'] })).toMatchObject({
      activate: true, tokens: ['equipment:weapon'],
    });

    const dawu = prompt({
      standardStage: 'dawu_choice', skillId: 'dawu',
      allowedCardIds: ['star-a', 'star-b'], min: 1, max: 2,
      allowedTargetIds: ['one', 'two'], minTargets: 1, maxTargets: 2,
    });
    expect(createStandardSkillActionFromUi('self', dawu, {
      cardIds: ['star-a', 'star-b'], targetIds: ['one', 'two'],
    })).toMatchObject({ cardIds: ['star-a', 'star-b'], targetIds: ['one', 'two'] });
    expect(() => createStandardSkillActionFromUi('self', dawu, {
      cardIds: ['star-a'], targetIds: ['one', 'two'],
    })).toThrow('相同');
  });

  it('preserves view-as, multi-target and allocation payloads after boundary validation', () => {
    const viewAs = prompt({
      min: 2, max: 2, allowedCardIds: ['one', 'two'],
      minTargets: 1, maxTargets: 2, allowedTargetIds: ['target-a', 'target-b'],
    });
    expect(createStandardSkillAction('self', viewAs, {
      activate: true,
      cardIds: ['one', 'two'],
      targetIds: ['target-a', 'target-b'],
      viewAsSkillId: 'longhun',
    })).toEqual({
      type: 'resolve_standard_skill', playerId: 'self', promptId: 'standard:1', activate: true,
      cardIds: ['one', 'two'], targetIds: ['target-a', 'target-b'], viewAsSkillId: 'longhun',
    });

    const distribution = prompt({
      optional: false,
      cardChoices: [gameCard({ id: 'viewed-1' }), gameCard({ id: 'viewed-2' })],
      allowedCardIds: ['viewed-1', 'viewed-2'], min: 2, max: 2,
      allowedTargetIds: ['target-a', 'target-b'],
      minTargets: 1, maxTargets: 2,
    });
    const allocations = [
      { cardId: 'viewed-1', targetId: 'target-a' },
      { cardId: 'viewed-2', targetId: 'target-b' },
    ];
    expect(createStandardSkillAction('self', distribution, { activate: true, allocations })).toMatchObject({
      activate: true, allocations,
    });
    expect(() => createStandardSkillAction('self', distribution, {
      activate: true, allocations: [{ cardId: 'forged', targetId: 'target-a' }],
    })).toThrow('分配');
    expect(() => createStandardSkillAction('self', distribution, {
      activate: true, cardIds: ['viewed-1', 'viewed-2'], targetIds: ['target-a'], allocations,
    })).toThrow('不能与普通牌');
  });

  it('requires a complete Guanxing reorder and validates card-specific targets', () => {
    const guanxing = prompt({
      optional: false, standardStage: 'guanxing_reorder',
      allowedCardIds: ['top-1', 'top-2', 'top-3'], min: 0, max: 3,
    });
    expect(canSubmitStandardSkill('self', guanxing, { activate: true })).toBe(false);
    expect(() => createStandardSkillAction('self', guanxing, {
      activate: true, topCardIds: ['top-1'], bottomCardIds: ['top-2'],
    })).toThrow('牌序');
    expect(createStandardSkillAction('self', guanxing, {
      activate: true, topCardIds: ['top-2', 'top-1'], bottomCardIds: ['top-3'],
    })).toMatchObject({ topCardIds: ['top-2', 'top-1'], bottomCardIds: ['top-3'] });

    const paired = prompt({
      min: 1, max: 1, allowedCardIds: ['short-range', 'long-range'],
      minTargets: 1, maxTargets: 1, allowedTargetIds: ['near', 'far'],
      cardTargetIds: { 'short-range': ['near'], 'long-range': ['near', 'far'] },
    });
    expect(canSubmitStandardSkill('self', paired, {
      activate: true, cardId: 'short-range', targetId: 'far',
    })).toBe(false);
    expect(createStandardSkillAction('self', paired, {
      activate: true, cardId: 'long-range', targetId: 'far',
    })).toMatchObject({ cardId: 'long-range', targetId: 'far' });
  });
});
