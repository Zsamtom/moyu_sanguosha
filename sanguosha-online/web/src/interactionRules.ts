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
  huangtian: '黄天',
  luoyi: '裸衣',
  keji: '克己',
  yingzi: '英姿',
  biyue: '闭月',
  luoshen: '洛神',
  jizhi: '集智',
  lianying: '连营',
  xiaoji: '枭姬',
  niepan: '涅槃',
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
  buqu: '不屈',
  liegong: '烈弓',
  tianxiang: '天香',
  hujia: '护驾',
  qicai: '奇才',
  mashu: '马术',
  paoxiao: '咆哮',
  kongcheng: '空城',
  qianxun: '谦逊',
  jiuyuan: '救援',
  wushuang: '无双',
  yongsi: '庸肆',
  weidi: '伪帝',
  jushou: '据守',
  kuanggu: '狂骨',
  shensu: '神速',
  hongyan: '红颜',
  guhuo: '蛊惑',
  leiji: '雷击',
  guidao: '鬼道',
  qiangxi: '强袭',
  mengjin: '猛进',
  lianhuan: '连环',
  tianyi: '天义',
  bazhen: '八阵',
  huoji: '火计',
  kanpo: '看破',
  quhu: '驱虎',
  jieming: '节命',
  shuangxiong: '双雄',
  luanji: '乱击',
  xueyi: '血裔',
  xingshang: '行殇',
  fangzhu: '放逐',
  songwei: '颂威',
  jiuchi: '酒池',
  roulin: '肉林',
  benghuai: '崩坏',
  baonue: '暴虐',
  wansha: '完杀',
  luanwu: '乱武',
  weimu: '帷幕',
  haoshi: '好施',
  dimeng: '缔盟',
  huoshou: '祸首',
  zaiqi: '再起',
  yinghun: '英魂',
  duanliang: '断粮',
  juxiang: '巨象',
  lieren: '烈刃',
  beige: '悲歌',
  duanchang: '断肠',
  tuntian: '屯田',
  zaoxian: '凿险',
  jixi: '急袭',
  tiaoxin: '挑衅',
  zhiji: '志继',
  xiangle: '享乐',
  fangquan: '放权',
  ruoyu: '若愚',
  jiang: '激昂',
  yingyang: '鹰扬',
  hunzi: '魂姿',
  zhiba: '制霸',
  qiaobian: '巧变',
  zhijian: '直谏',
  guzheng: '固政',
  huashen: '化身',
  xinsheng: '新生',
  guixin: '归心',
  feiying: '飞影',
  wushen: '武神',
  wuhun: '武魂',
  kuangbao: '狂暴',
  wumou: '无谋',
  wuqian: '无前',
  shenfen: '神愤',
  shelie: '涉猎',
  gongxin: '攻心',
  renjie: '忍戒',
  baiyin: '拜印',
  jilue: '极略',
  lianpo: '连破',
  juejing: '绝境',
  longhun: '龙魂',
  qinyin: '琴音',
  yeyan: '业炎',
  qixing: '七星',
  kuangfeng: '狂风',
  dawu: '大雾',
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
  huangtian: '出牌阶段限一次：将一张手牌中的「闪」或「闪电」交给拥有「黄天」的主公。',
  wuqian: '移去 2 枚狂暴标记，本回合获得「无双」并使目标防具无效。',
  shenfen: '移去 6 枚狂暴标记，对所有其他角色依次结算伤害与弃牌，然后将武将牌翻面。',
  yeyan: '选择小业炎或支付四种花色发动大业炎，并按当前提示分配火焰伤害。',
  longhun: '按当前体力值将同花色牌转化为对应的基本牌使用或打出。',
  gongxin: '观看一名其他角色的手牌，并处理其中一张红桃牌。',
  jiuchi: '将一张黑桃手牌当「酒」使用。',
  duanliang: '将一张黑色基本牌或装备牌当「兵粮寸断」使用。',
  jixi: '将一张田牌当「顺手牵羊」使用。',
  tiaoxin: '令攻击范围内的一名角色选择对你使用「杀」，否则弃置其一张牌。',
  zhiba: '与拥有「制霸」的吴势力主公拼点。',
  zhijian: '将一张装备牌置入其他角色的装备区，然后摸一张牌。',
  luanwu: '限定技：令所有其他角色依次使用「杀」或失去 1 点体力。',
  dimeng: '弃置等同两名角色手牌数差值的牌，交换这两名角色的手牌。',
  qiangxi: '弃置一张武器牌或失去 1 点体力，对攻击范围内的一名其他角色造成 1 点伤害。',
  tianyi: '与一名其他角色拼点；胜出后强化本回合使用「杀」的次数与目标。',
  quhu: '与一名体力值更高的角色拼点，并按拼点结果结算伤害。',
  wushen: '将红桃手牌当「杀」使用或打出，且使用时无距离限制。',
  shuangxiong: '将与本回合双雄判定颜色相反的一张手牌当「决斗」使用。',
  lianhuan: '将一张梅花手牌当「铁索连环」使用或重铸。',
  huoji: '将一张红色手牌当「火攻」使用。',
  luanji: '将两张同花色手牌当「万箭齐发」使用。',
  jilue: '移去一枚忍戒标记，按当前阶段发动一种「极略」技能。',
};

type UseSkillAction = Extract<GameAction, { type: 'use_skill' }>;
type SkillDamageAllocation = NonNullable<UseSkillAction['allocations']>[number];

function sameSelection(selectedIds: readonly string[], allowedIds: readonly string[]): boolean {
  return selectedIds.length === allowedIds.length && selectedIds.every((id) => allowedIds.includes(id));
}

export function canSubmitSkillUse(
  skill: PlayableSkillHint | undefined,
  selectedCardIds: readonly string[],
  selectedTargetIds: readonly string[],
  allocations: readonly SkillDamageAllocation[] = [],
): boolean {
  if (!skill) return false;
  if (new Set(selectedCardIds).size !== selectedCardIds.length || new Set(selectedTargetIds).size !== selectedTargetIds.length) {
    return false;
  }
  if (selectedCardIds.length < skill.minCards || selectedCardIds.length > skill.maxCards) return false;
  if (!selectedCardIds.every((cardId) => skill.cardIds.includes(cardId))) return false;
  if (skill.cardGroups && !skill.cardGroups.some((group) => sameSelection(selectedCardIds, group))) return false;
  if (skill.cardPairs && !skill.cardPairs.some((pair) => sameSelection(selectedCardIds, pair))) return false;

  if (skill.skillId === 'yeyan') {
    if (allocations.length < 1 || allocations.length > 3 || new Set(allocations.map(({ targetId }) => targetId)).size !== allocations.length) {
      return false;
    }
    if (allocations.some(({ targetId, damage }) =>
      !skill.targetIds.includes(targetId) || !Number.isInteger(damage) || damage < 1)) return false;
    const totalDamage = allocations.reduce((sum, { damage }) => sum + damage, 0);
    if (totalDamage > 3) return false;
    if (!sameSelection(selectedTargetIds, allocations.map(({ targetId }) => targetId))) return false;
    if (selectedCardIds.length === 0
      ? allocations.some(({ damage }) => damage !== 1)
      : allocations.every(({ damage }) => damage === 1)) {
      return false;
    }
  } else if (allocations.length > 0) {
    return false;
  }

  const groupTargets = skill.cardGroupTargets?.find((group) => sameSelection(selectedCardIds, group.cardIds));
  if (skill.cardGroupTargets && !groupTargets) return false;
  const targetIds = groupTargets?.targetIds ?? (selectedCardIds.length === 1 && skill.cardTargetIds?.[selectedCardIds[0]!]
    ? skill.cardTargetIds[selectedCardIds[0]!]!
    : skill.targetIds);
  if (skill.targetMode === 'none' || skill.targetMode === 'self') return selectedTargetIds.length === 0;
  if (skill.targetMode === 'single-other' || skill.targetMode === 'single-any') {
    return selectedTargetIds.length === 1 && targetIds.includes(selectedTargetIds[0]!);
  }
  if (skill.targetMode === 'ordered-two') {
    return selectedTargetIds.length === 2 && Boolean(
      skill.targetPairs?.some(([first, second]) => first === selectedTargetIds[0] && second === selectedTargetIds[1])
    );
  }
  const max = groupTargets?.maxTargets ?? (skill.targetMode === 'up-to-four' ? 4 : skill.targetMode === 'up-to-three' ? 3 : 2);
  const min = skill.targetMode === 'up-to-two' && skill.virtualCardKind === 'iron_chain' ? 0 : 1;
  return selectedTargetIds.length >= min && selectedTargetIds.length <= max &&
    selectedTargetIds.every((targetId) => targetIds.includes(targetId));
}

export function selectableResponseSkills(skillResponses: readonly SkillResponseHint[]): PlayableSkillHint[] {
  return skillResponses.map((skill) => ({
    ...skill,
    cardIds: [...skill.cardIds],
    minCards: skill.minCards ?? 1,
    maxCards: skill.maxCards ?? 1,
    cardGroups: skill.cardGroups?.map((group) => [...group]),
    targetMode: 'none',
    targetIds: [],
    virtualCardKind: skill.responseKind === 'slash' || skill.responseKind === 'peach' || skill.responseKind === 'wine'
      ? skill.responseKind
      : undefined,
  }));
}

export function skillVariantKey(skill: PlayableSkillHint): string {
  return [skill.skillId, skill.virtualCardKind ?? 'direct', skill.minCards, skill.maxCards, skill.targetMode].join(':');
}

export function findSkillVariant(
  skills: readonly PlayableSkillHint[],
  skillId: ActiveGeneralSkillId | undefined,
  selectedCardIds: readonly string[],
  selectedTargetIds: readonly string[],
  allocations: readonly SkillDamageAllocation[] = [],
): PlayableSkillHint | undefined {
  return skills.find((skill) =>
    skill.skillId === skillId && canSubmitSkillUse(skill, selectedCardIds, selectedTargetIds, allocations));
}

export function createUseSkillAction(
  playerId: string,
  skill: PlayableSkillHint,
  selectedCardIds: readonly string[],
  selectedTargetIds: readonly string[],
  allocations: readonly SkillDamageAllocation[] = [],
): GameAction {
  if (!canSubmitSkillUse(skill, selectedCardIds, selectedTargetIds, allocations)) {
    throw new Error(`技能「${generalSkillNames[skill.skillId] ?? skill.skillId}」的牌或目标选择不合法。`);
  }
  if (skill.skillId === 'jijiang') {
    return {
      type: 'invoke_lord_skill',
      playerId,
      skillId: 'jijiang',
      targetId: selectedTargetIds[0]!,
      ...(selectedTargetIds.length > 1 ? { targetIds: [...selectedTargetIds] } : {}),
    };
  }
  if (skill.skillId === 'yeyan') {
    return {
      type: 'use_skill',
      playerId,
      skillId: 'yeyan',
      ...(selectedCardIds.length > 0 ? { cardIds: [...selectedCardIds] } : {}),
      allocations: allocations.map((allocation) => ({ ...allocation })),
    };
  }
  return {
    type: 'use_skill',
    playerId,
    skillId: skill.skillId,
    ...(selectedCardIds.length > 0 ? { cardIds: [...selectedCardIds] } : {}),
    ...(skill.targetMode === 'single-other' || skill.targetMode === 'single-any'
      ? { targetId: selectedTargetIds[0]! }
      : selectedTargetIds.length > 0 ? { targetIds: [...selectedTargetIds] } : {}),
  };
}

export function createZhangBaSlashAction(
  playerId: string,
  cardIds: readonly string[],
  targetIds: readonly string[],
  maxTargets = 1,
): GameAction {
  if (!Number.isInteger(maxTargets) || maxTargets < 1 || maxTargets > 4 ||
      cardIds.length !== 2 || new Set(cardIds).size !== 2 || targetIds.length < 1 ||
      targetIds.length > maxTargets || new Set(targetIds).size !== targetIds.length) {
    throw new Error('丈八蛇矛的费用牌或目标选择不合法。');
  }
  return {
    type: 'use_zhang_ba_slash',
    playerId,
    cardIds: [...cardIds],
    targetId: targetIds[0]!,
    ...(targetIds.length > 1 ? { targetIds: [...targetIds] } : {}),
  };
}

type StandardSkillAction = Extract<GameAction, { type: 'resolve_standard_skill' }>;
type StandardSkillPrompt = ActionPrompt;

export interface StandardSkillSelection {
  activate?: boolean;
  cardId?: string;
  cardIds?: readonly string[];
  targetId?: string;
  targetIds?: readonly string[];
  tokens?: readonly string[];
  topCardIds?: readonly string[];
  bottomCardIds?: readonly string[];
  allocations?: readonly { cardId: string; targetId: string }[];
  viewAsSkillId?: StandardSkillAction['viewAsSkillId'];
}

export interface StandardSkillUiSelection {
  readonly cardIds?: readonly string[];
  readonly targetIds?: readonly string[];
  readonly zoneTokens?: readonly string[];
  readonly option?: string;
}

const standardViewAsOptions = new Set<NonNullable<StandardSkillAction['viewAsSkillId']>>([
  'wusheng',
  'longdan',
  'wushen',
  'longhun',
  'zhang_ba_she_mao',
]);

const standardArrayCardStages = new Set([
  'qixing_initial',
  'qixing_exchange',
  'shelie_select',
  'shenfen_discard_hand',
  'yinghun_discard',
  'beige_source_discard',
  'dawu_choice',
]);

const standardArrayTargetStages = new Set(['dawu_choice']);
const standardSlashChoiceStages = new Set(['luanwu_slash', 'tiaoxin_response']);

export const standardSkillOptionLabels: Readonly<Record<string, string>> = {
  all_recover_one: '令所有角色各回复 1 点体力',
  all_lose_one_hp: '令所有角色各失去 1 点体力',
  take_extra_turn: '获得一个额外回合',
  remove_rage: '移去 1 枚暴怒标记',
  lose_hp: '失去 1 点体力',
  discard: '弃置此牌',
  put_on_draw_pile_top: '置于牌堆顶',
  physical_slash: '使用实体「杀」',
  wusheng: '发动「武圣」当「杀」',
  longdan: '发动「龙胆」当「杀」',
  wushen: '发动「武神」视为「杀」',
  longhun: '发动「龙魂」当「杀」',
  zhang_ba_she_mao: '发动「丈八蛇矛」两牌当「杀」',
  jijiang: '发动「激将」请求协助',
  decline: '不修改／不响应',
  plus_three: '拼点点数 +3',
  minus_three: '拼点点数 -3',
  recover_one: '回复 1 点体力',
  draw_two: '摸两张牌',
  lose_max_hp: '失去 1 点体力上限',
  draw_x_discard_one: '摸 X 张牌，然后弃置一张牌',
  draw_one_discard_x: '摸一张牌，然后弃置 X 张牌',
};

export function standardSkillOptionLabel(option: string): string {
  return standardSkillOptionLabels[option] ?? option;
}

export function createStandardSkillAction(
  playerId: string,
  prompt: StandardSkillPrompt,
  selection: StandardSkillSelection = {},
): StandardSkillAction {
  if (prompt.kind !== 'standard-skill') throw new Error('当前提示不是标准技能提示。');
  const activate = selection.activate ?? false;
  const payloadKeys = Object.keys(selection).filter((key) => key !== 'activate');
  if (!activate) {
    if (prompt.optional === false || payloadKeys.length > 0) throw new Error('当前技能必须完成选择后提交。');
    return { type: 'resolve_standard_skill', playerId, promptId: prompt.id, activate: false };
  }
  if (selection.cardId && selection.cardIds) throw new Error('不能同时提交单张牌和多张牌。');
  if (selection.targetId && selection.targetIds) throw new Error('不能同时提交单个目标和多个目标。');

  const allocations = selection.allocations ?? [];
  if (allocations.length > 0 && (selection.cardId || selection.cardIds || selection.targetId || selection.targetIds)) {
    throw new Error('技能分配不能与普通牌或目标字段混用。');
  }
  if (new Set(allocations.map(({ cardId }) => cardId)).size !== allocations.length ||
      allocations.some(({ cardId, targetId }) =>
        !prompt.allowedCardIds?.includes(cardId) || !prompt.allowedTargetIds?.includes(targetId))) {
    throw new Error('技能分配不合法。');
  }
  const cardIds = allocations.length > 0
    ? allocations.map(({ cardId }) => cardId)
    : selection.cardIds ?? (selection.cardId ? [selection.cardId] : []);
  const targetIds = allocations.length > 0
    ? [...new Set(allocations.map(({ targetId }) => targetId))]
    : selection.targetIds ?? (selection.targetId ? [selection.targetId] : []);
  const tokens = selection.tokens ?? [];
  const zoneTokenSet = new Set(prompt.zoneChoices?.map(({ token }) => token) ?? []);
  const optionTokenSet = new Set(prompt.options ?? []);
  const zoneTokens = tokens.filter((token) => zoneTokenSet.has(token));
  const optionTokens = tokens.filter((token) => optionTokenSet.has(token));
  const allowedTokens = new Set([...zoneTokenSet, ...optionTokenSet]);
  const optionIsEncodedBySlashFields = standardSlashChoiceStages.has(prompt.standardStage ?? '');
  if (new Set(tokens).size !== tokens.length || tokens.some((token) => !allowedTokens.has(token)) ||
      (prompt.options?.length && !optionIsEncodedBySlashFields && optionTokens.length !== 1) ||
      (zoneTokens.length > 0 && cardIds.length > 0)) {
    throw new Error('技能选项不合法。');
  }
  const minCards = prompt.min ?? 0;
  const maxCards = prompt.max ?? minCards;
  const minTargets = prompt.minTargets ?? 0;
  const maxTargets = prompt.maxTargets ?? minTargets;
  const selectedCardCount = zoneTokens.length > 0 ? zoneTokens.length : cardIds.length;
  if (new Set(cardIds).size !== cardIds.length || selectedCardCount < minCards || selectedCardCount > maxCards ||
      cardIds.some((id) => !prompt.allowedCardIds?.includes(id))) throw new Error('技能牌选择不合法。');
  if (new Set(targetIds).size !== targetIds.length || targetIds.length < minTargets || targetIds.length > maxTargets ||
      targetIds.some((id) => !prompt.allowedTargetIds?.includes(id))) throw new Error('技能目标选择不合法。');
  if (prompt.cardTargetIds && (allocations.length > 0
    ? allocations.some(({ cardId, targetId }) => !prompt.cardTargetIds?.[cardId]?.includes(targetId))
    : cardIds.some((cardId) => targetIds.some((targetId) => !prompt.cardTargetIds?.[cardId]?.includes(targetId))))) {
    throw new Error('技能牌与目标配对不合法。');
  }

  const reorderedCardIds = [...(selection.topCardIds ?? []), ...(selection.bottomCardIds ?? [])];
  if (new Set(reorderedCardIds).size !== reorderedCardIds.length ||
      reorderedCardIds.some((cardId) => !prompt.allowedCardIds?.includes(cardId)) ||
      (prompt.standardStage === 'guanxing_reorder' && !sameSelection(reorderedCardIds, prompt.allowedCardIds ?? []))) {
    throw new Error('技能牌序不合法。');
  }

  return {
    type: 'resolve_standard_skill',
    playerId,
    promptId: prompt.id,
    activate: true,
    ...(selection.cardId ? { cardId: selection.cardId } : {}),
    ...(selection.cardIds ? { cardIds: [...selection.cardIds] } : {}),
    ...(selection.targetId ? { targetId: selection.targetId } : {}),
    ...(selection.targetIds ? { targetIds: [...selection.targetIds] } : {}),
    ...(selection.tokens ? { tokens: [...selection.tokens] } : {}),
    ...(selection.topCardIds ? { topCardIds: [...selection.topCardIds] } : {}),
    ...(selection.bottomCardIds ? { bottomCardIds: [...selection.bottomCardIds] } : {}),
    ...(selection.allocations ? { allocations: selection.allocations.map((allocation) => ({ ...allocation })) } : {}),
    ...(selection.viewAsSkillId ? { viewAsSkillId: selection.viewAsSkillId } : {}),
  };
}

/**
 * Converts the generic Web selection state into the exact tagged payload used
 * by the engine. A few Slash-choice prompts advertise human-readable options
 * while encoding the choice through viewAsSkillId or a declined activation.
 */
export function createStandardSkillActionFromUi(
  playerId: string,
  prompt: StandardSkillPrompt,
  selection: StandardSkillUiSelection = {},
): StandardSkillAction {
  if (prompt.kind !== 'standard-skill') throw new Error('当前提示不是标准技能提示。');
  const stage = prompt.standardStage ?? '';
  const option = selection.option;
  if (prompt.options?.length && !option) throw new Error('请选择一个技能选项。');
  if (option && !prompt.options?.includes(option)) throw new Error('技能选项不合法。');

  if ((stage === 'luanwu_slash' && option === 'lose_hp') ||
      (stage === 'tiaoxin_response' && option === 'decline')) {
    return createStandardSkillAction(playerId, prompt, { activate: false });
  }

  const cardIds = [...(selection.cardIds ?? [])];
  const targetIds = [...(selection.targetIds ?? [])];
  const zoneTokens = [...(selection.zoneTokens ?? [])];
  let viewAsSkillId: StandardSkillAction['viewAsSkillId'];
  const tokens = [...zoneTokens];

  if (option) {
    if (standardViewAsOptions.has(option as NonNullable<StandardSkillAction['viewAsSkillId']>)) {
      viewAsSkillId = option as NonNullable<StandardSkillAction['viewAsSkillId']>;
    } else if (!(standardSlashChoiceStages.has(stage) &&
        (option === 'physical_slash' || option === 'decline' || option === 'lose_hp'))) {
      tokens.push(option);
    }
  }

  if (standardSlashChoiceStages.has(stage)) {
    if (option === 'jijiang') {
      if (cardIds.length > 0) throw new Error('发动激将时不需要选择牌。');
    } else if (option === 'zhang_ba_she_mao') {
      if (cardIds.length !== 2) throw new Error('丈八蛇矛必须选择两张牌。');
    } else if (option !== 'decline' && option !== 'lose_hp' && cardIds.length !== 1) {
      throw new Error('请选择一张用于响应的牌。');
    }
  }
  if (stage === 'dawu_choice' && cardIds.length !== targetIds.length) {
    throw new Error('大雾选择的星数必须与目标数相同。');
  }

  const useCardArray = standardArrayCardStages.has(stage) || cardIds.length !== 1;
  const useTargetArray = standardArrayTargetStages.has(stage) || targetIds.length !== 1;
  return createStandardSkillAction(playerId, prompt, {
    activate: true,
    ...(cardIds.length > 0 || standardArrayCardStages.has(stage)
      ? useCardArray ? { cardIds } : { cardId: cardIds[0] }
      : {}),
    ...(targetIds.length > 0
      ? useTargetArray ? { targetIds } : { targetId: targetIds[0] }
      : {}),
    ...(tokens.length > 0 ? { tokens } : {}),
    ...(viewAsSkillId ? { viewAsSkillId } : {}),
  });
}

export function canSubmitStandardSkill(
  playerId: string,
  prompt: StandardSkillPrompt,
  selection: StandardSkillSelection = {},
): boolean {
  try {
    createStandardSkillAction(playerId, prompt, selection);
    return true;
  } catch {
    return false;
  }
}

export function getRoomStartBlockReason(room: RoomDetail, connected: boolean): string | undefined {
  if (!connected) return '实时连接恢复后才能开局';
  if (room.gameType === 'gouji' && room.members.length !== 6) return '够级必须坐满 6 人';
  if (room.gameType === 'doudizhu' && room.members.length !== 3) return '斗地主必须坐满 3 人';
  if (room.gameType === 'digit_bomb' && room.members.length !== 2) return '数字炸弹必须坐满 2 人';
  if (room.gameType === 'number_connect' && room.members.length !== 2) return '数字连连看必须坐满 2 人';
  if ((room.gameType === 'splendor' || room.gameType === 'splendor_pokemon') && room.members.length > 4) {
    return '璀璨宝石最多支持 4 人';
  }
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
  if (card.targetMode) return card.targetMode === 'single-other' || card.targetMode === 'single-any' ||
    card.targetMode === 'up-to-two' || card.targetMode === 'up-to-three' || card.targetMode === 'up-to-four' || card.targetMode === 'ordered-two';
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
  if (card.targetMode === 'up-to-three' || card.targetMode === 'up-to-four') {
    const max = card.targetMode === 'up-to-four' ? 4 : 3;
    return selectedTargetIds.length >= 1 && selectedTargetIds.length <= max && selectedTargetIds.every((id) => !card.allowedTargetIds || card.allowedTargetIds.includes(id));
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
  if (card.targetMode === 'up-to-four') return `对至多四名目标使用「${card.name}」`;
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
