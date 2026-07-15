import { describe, expect, it } from 'vitest';
import {
  activeSkillDescriptions,
  canSubmitSkillUse,
  canSubmitCardPlay,
  cardPlayButtonLabel,
  cardRequiresTarget,
  createUseSkillAction,
  getRoomStartBlockReason,
  generalSkillNames,
  isCardAllowedByPrompt,
  isCardResponsePrompt,
  responseCardName,
  selectableResponseSkills,
  surrenderCopy,
} from './interactionRules';
import type { ActionPrompt, GameCard, PlayableSkillHint, RoomDetail } from './types';

function roomWith(overrides: Partial<RoomDetail> = {}): RoomDetail {
  return {
    id: 'room-1',
    name: '测试房间',
    status: 'waiting',
    hostId: 'user-1',
    hostName: '房主',
    playerCount: 2,
    maxPlayers: 5,
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
      jijiu: '急救', fanjian: '反间', lijian: '离间', jijiang: '激将',
      luoyi: '裸衣', keji: '克己', yingzi: '英姿', biyue: '闭月', luoshen: '洛神',
      jianxiong: '奸雄', tiandu: '天妒', yiji: '遗计', guicai: '鬼才', fankui: '反馈',
      ganglie: '刚烈', tuxi: '突袭', guanxing: '观星', tieqi: '铁骑', liuli: '流离',
    });
    expect(activeSkillDescriptions.kurou).toContain('失去 1 点体力');
    expect(activeSkillDescriptions.zhiheng).toContain('装备牌');
    expect(activeSkillDescriptions.qingguo).toContain('黑色手牌');
    expect(activeSkillDescriptions.jijiu).toContain('装备牌');
    expect(activeSkillDescriptions.fanjian).toContain('声明花色');
    expect(activeSkillDescriptions.lijian).toContain('不可被无懈');
    expect(activeSkillDescriptions.jijiang).toContain('实体');
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
});
