import { cardPresentation, isStandardCardKind } from './gameCards';
import type {
  ActionPrompt,
  ActiveGeneralSkillId,
  GameAction,
  GameCard,
  PlayableSkillHint,
  RoomDetail,
  SkillChoiceId,
  StandardImplementedSkillId,
  SkillResponseHint,
} from './types';

export const generalSkillNames: Record<ActiveGeneralSkillId | SkillChoiceId | StandardImplementedSkillId, string> = {
  wusheng: '武圣',
  longdan: '龙胆',
  qixi: '奇袭',
  kurou: '苦肉',
  zhiheng: '制衡',
  rende: '仁德',
  qingnang: '青囊',
  jieyin: '结姻',
  guose: '国色',
  qingguo: '倾国',
  jijiu: '急救',
  fanjian: '反间',
  lijian: '离间',
  jijiang: '激将',
  luoyi: '裸衣',
  keji: '克己',
  yingzi: '英姿',
  biyue: '闭月',
  luoshen: '洛神',
  jizhi: '集智',
  lianying: '连营',
  xiaoji: '枭姬',
  jianxiong: '奸雄',
  tiandu: '天妒',
  yiji: '遗计',
  guicai: '鬼才',
  fankui: '反馈',
  ganglie: '刚烈',
  tuxi: '突袭',
  guanxing: '观星',
  tieqi: '铁骑',
  liuli: '流离',
};

export const activeSkillDescriptions: Record<ActiveGeneralSkillId, string> = {
  wusheng: '将一张红色手牌或装备牌当「杀」使用或打出。',
  longdan: '将「闪」当「杀」、或将「杀」当「闪」使用或打出。',
  qixi: '将一张黑色手牌或装备牌当「过河拆桥」使用。',
  kurou: '失去 1 点体力，然后摸两张牌。',
  zhiheng: '出牌阶段限一次：弃置至少一张手牌或装备牌，然后摸等量的牌。',
  rende: '将至少一张手牌交给一名其他角色；本阶段累计交出两张时回复 1 点体力。',
  qingnang: '出牌阶段限一次：弃置一张手牌，令一名受伤角色回复 1 点体力。',
  jieyin: '出牌阶段限一次：弃置两张手牌，令你与一名受伤男性角色各回复 1 点体力。',
  guose: '将一张方块手牌或装备牌当「乐不思蜀」使用。',
  qingguo: '需要打出「闪」时，可以将一张黑色手牌当「闪」打出。',
  jijiu: '回合外可将一张红色手牌或装备牌当「桃」使用，救援濒死角色。',
  fanjian: '出牌阶段限一次：令一名其他角色先声明花色，再随机获得并公开你的一张手牌；花色不同则其受到你造成的 1 点伤害。',
  lijian: '出牌阶段限一次：弃置一张牌，依次选择两名其他男性角色，令前者视为对后者使用不可被无懈的「决斗」。',
  jijiang: '主公技：依次请求其他蜀势力角色打出一张实体「杀」，视为由你使用或打出。',
};

export function canSubmitSkillUse(
  skill: PlayableSkillHint | undefined,
  selectedCardIds: readonly string[],
  selectedTargetIds: readonly string[],
): boolean {
  if (!skill) return false;
  if (new Set(selectedCardIds).size !== selectedCardIds.length || new Set(selectedTargetIds).size !== selectedTargetIds.length) {
    return false;
  }
  if (selectedCardIds.length < skill.minCards || selectedCardIds.length > skill.maxCards) return false;
  if (!selectedCardIds.every((cardId) => skill.cardIds.includes(cardId))) return false;

  const targetIds = selectedCardIds.length === 1 && skill.cardTargetIds?.[selectedCardIds[0]!]
    ? skill.cardTargetIds[selectedCardIds[0]!]!
    : skill.targetIds;
  if (skill.targetMode === 'none' || skill.targetMode === 'self') return selectedTargetIds.length === 0;
  if (skill.targetMode === 'single-other') {
    return selectedTargetIds.length === 1 && targetIds.includes(selectedTargetIds[0]!);
  }
  if (skill.targetMode === 'ordered-two') {
    return selectedTargetIds.length === 2 && Boolean(
      skill.targetPairs?.some(([first, second]) => first === selectedTargetIds[0] && second === selectedTargetIds[1])
    );
  }
  const max = skill.targetMode === 'up-to-three' ? 3 : 2;
  const min = skill.targetMode === 'up-to-two' ? 0 : 1;
  return selectedTargetIds.length >= min && selectedTargetIds.length <= max &&
    selectedTargetIds.every((targetId) => targetIds.includes(targetId));
}

export function selectableResponseSkills(skillResponses: readonly SkillResponseHint[]): PlayableSkillHint[] {
  return skillResponses.map((skill) => ({
    ...skill,
    cardIds: [...skill.cardIds],
    minCards: 1,
    maxCards: 1,
    targetMode: 'none',
    targetIds: [],
    virtualCardKind: skill.responseKind === 'slash' ? 'slash' : undefined,
  }));
}

export function createUseSkillAction(
  playerId: string,
  skill: PlayableSkillHint,
  selectedCardIds: readonly string[],
  selectedTargetIds: readonly string[],
): GameAction {
  if (!canSubmitSkillUse(skill, selectedCardIds, selectedTargetIds)) {
    throw new Error(`技能「${generalSkillNames[skill.skillId]}」的牌或目标选择不合法。`);
  }
  if (skill.skillId === 'jijiang') {
    return {
      type: 'invoke_lord_skill',
      playerId,
      skillId: 'jijiang',
      targetId: selectedTargetIds[0]!,
    };
  }
  return {
    type: 'use_skill',
    playerId,
    skillId: skill.skillId,
    ...(selectedCardIds.length > 0 ? { cardIds: [...selectedCardIds] } : {}),
    ...(skill.targetMode === 'single-other'
      ? { targetId: selectedTargetIds[0]! }
      : selectedTargetIds.length > 0 ? { targetIds: [...selectedTargetIds] } : {}),
  };
}

export function getRoomStartBlockReason(room: RoomDetail, connected: boolean): string | undefined {
  if (!connected) return '实时连接恢复后才能开局';
  if (room.members.length < 2) return '至少需要两名玩家';
  if (!room.members.every((member) => member.online)) return '有玩家离线，全部玩家在线后才能开局';
  if (!room.members.every((member) => member.ready)) return '所有玩家准备后才能开局';
  return undefined;
}

export const surrenderCopy = {
  label: '投降并离开',
  title: '确定投降并离开？',
  description: '此操作会判定你放弃本局，并结束你的个人参与，无法撤销。',
} as const;

export function cardRequiresTarget(card: GameCard): boolean {
  if (card.targetMode) return card.targetMode === 'single-other' || card.targetMode === 'up-to-two' || card.targetMode === 'up-to-three' || card.targetMode === 'ordered-two';
  if (!card.kind || !isStandardCardKind(card.kind)) return Boolean(card.allowedTargetIds?.length);
  return cardPresentation(card.kind)?.targetMode === 'single-other';
}

export function canSubmitCardPlay(card: GameCard | undefined, selectedTargetIds: readonly string[]): boolean {
  if (!card || card.playable === false) return false;
  if (!cardRequiresTarget(card)) return true;
  if (new Set(selectedTargetIds).size !== selectedTargetIds.length) return false;
  if (card.targetMode === 'up-to-two') {
    return selectedTargetIds.length <= 2 && selectedTargetIds.every((id) => !card.allowedTargetIds || card.allowedTargetIds.includes(id));
  }
  if (card.targetMode === 'up-to-three') {
    return selectedTargetIds.length >= 1 && selectedTargetIds.length <= 3 && selectedTargetIds.every((id) => !card.allowedTargetIds || card.allowedTargetIds.includes(id));
  }
  if (card.targetMode === 'ordered-two') {
    if (selectedTargetIds.length !== 2) return false;
    return card.allowedTargetPairs?.some(([first, second]) => first === selectedTargetIds[0] && second === selectedTargetIds[1]) ?? false;
  }
  if (selectedTargetIds.length !== 1) return false;
  return !card.allowedTargetIds || card.allowedTargetIds.includes(selectedTargetIds[0]!);
}

export function cardPlayButtonLabel(card: GameCard | undefined): string {
  if (!card) return '使用此牌';
  if (card.targetMode === 'up-to-two') return `使用／重铸「${card.name}」`;
  if (card.targetMode === 'up-to-three') return `对至多三名目标使用「${card.name}」`;
  if (card.targetMode === 'ordered-two') return `按顺序指定目标并使用「${card.name}」`;
  return cardRequiresTarget(card) ? `对目标使用「${card.name}」` : `使用「${card.name}」`;
}

export function responseCardName(prompt: ActionPrompt | null | undefined): string {
  if (prompt?.kind === 'respond-peach') return '桃 / 酒';
  if (prompt?.kind === 'respond-nullification') return '无懈可击';
  return prompt?.responseKind === 'slash' || prompt?.kind === 'respond-slash' ? '杀' : '闪';
}

export function isCardResponsePrompt(prompt: ActionPrompt | null | undefined): boolean {
  return prompt?.kind === 'respond-slash' || prompt?.kind === 'respond-dodge' || prompt?.kind === 'respond-peach' || prompt?.kind === 'respond-nullification';
}

export function isCardAllowedByPrompt(card: GameCard, prompt: ActionPrompt | null | undefined): boolean {
  if (!prompt) return card.playable !== false;
  if (prompt.allowedCardIds && !prompt.allowedCardIds.includes(card.id)) return false;
  if (prompt.kind === 'respond-slash') {
    return card.kind === 'slash' || card.kind === 'fire_slash' || card.kind === 'thunder_slash' ||
      Boolean(prompt.zhangBaAllowedCardIds?.includes(card.id));
  }
  if (prompt.kind === 'respond-dodge') return card.kind === 'dodge';
  if (prompt.kind === 'respond-peach') return card.kind === 'peach' || card.kind === 'wine';
  if (prompt.kind === 'respond-nullification') return card.kind === 'wu_xie_ke_ji';
  return true;
}
