export const standardCardKinds = [
  'slash',
  'fire_slash',
  'thunder_slash',
  'dodge',
  'peach',
  'wine',
  'ex_nihilo',
  'duel',
  'barbarian_invasion',
  'arrow_barrage',
  'peach_garden',
  'chi_tu', 'da_wan', 'zi_xing', 'di_lu', 'hua_liu', 'jue_ying', 'zhua_huang_fei_dian',
  'zhu_ge_lian_nu', 'gu_ding_dao', 'ci_xiong_shuang_gu_jian', 'han_bing_jian',
  'qing_long_yan_yue_dao', 'zhang_ba_she_mao', 'guan_shi_fu', 'fang_tian_hua_ji',
  'zhu_que_yu_shan', 'qi_lin_gong',
    'ren_wang_dun', 'teng_jia', 'bai_yin_shi_zi', 'ba_gua_zhen', 'qing_gang_jian',
    'le_bu_si_shu', 'bing_liang_cun_duan', 'shan_dian',
    'wu_xie_ke_ji',
    'guo_he_chai_qiao', 'shun_shou_qian_yang',
    'fire_attack', 'amazing_grace', 'borrowed_sword', 'iron_chain',
] as const;

export type StandardCardKind = (typeof standardCardKinds)[number];
export type CardCategory = 'basic' | 'trick' | 'equipment';
export type CardTargetMode = 'none' | 'self' | 'single-other' | 'up-to-two' | 'up-to-three' | 'ordered-two';

export interface CardPresentation {
  readonly name: string;
  readonly category: CardCategory;
  readonly description: string;
  readonly targetMode: CardTargetMode;
}

export const cardCatalog: Record<StandardCardKind, CardPresentation> = {
  slash: {
    name: '杀',
    category: 'basic',
    description: '出牌阶段，对一名其他角色使用。目标需打出「闪」，否则受到 1 点伤害。',
    targetMode: 'single-other',
  },
  fire_slash: {
    name: '火杀',
    category: 'basic',
    description: '火属性的「杀」。目标需打出「闪」，否则受到 1 点火焰伤害。',
    targetMode: 'single-other',
  },
  thunder_slash: {
    name: '雷杀',
    category: 'basic',
    description: '雷属性的「杀」。目标需打出「闪」，否则受到 1 点雷电伤害。',
    targetMode: 'single-other',
  },
  dodge: {
    name: '闪',
    category: 'basic',
    description: '响应「杀」或「万箭齐发」时打出，抵消此次伤害。',
    targetMode: 'none',
  },
  peach: {
    name: '桃',
    category: 'basic',
    description: '出牌阶段使用，回复 1 点体力。体力已满时不能使用。',
    targetMode: 'self',
  },
  wine: {
    name: '酒',
    category: 'basic',
    description: '出牌阶段使用，本回合下一张「杀」造成的伤害 +1。',
    targetMode: 'none',
  },
  ex_nihilo: {
    name: '无中生有',
    category: 'trick',
    description: '出牌阶段使用，你摸两张牌。',
    targetMode: 'none',
  },
  duel: {
    name: '决斗',
    category: 'trick',
    description: '选择一名其他角色，由其开始与你轮流打出「杀」；首先不出「杀」的一方受到 1 点伤害。',
    targetMode: 'single-other',
  },
  barbarian_invasion: {
    name: '南蛮入侵',
    category: 'trick',
    description: '所有其他角色依次需打出一张「杀」，否则受到 1 点伤害。',
    targetMode: 'none',
  },
  arrow_barrage: {
    name: '万箭齐发',
    category: 'trick',
    description: '所有其他角色依次需打出一张「闪」，否则受到 1 点伤害。',
    targetMode: 'none',
  },
  peach_garden: {
    name: '桃园结义',
    category: 'trick',
    description: '所有已受伤角色各回复 1 点体力。',
    targetMode: 'none',
  },
  chi_tu: { name: '赤兔', category: 'equipment', description: '进攻坐骑：你计算与其他角色的距离 -1。', targetMode: 'self' },
  da_wan: { name: '大宛', category: 'equipment', description: '进攻坐骑：你计算与其他角色的距离 -1。', targetMode: 'self' },
  zi_xing: { name: '紫骍', category: 'equipment', description: '进攻坐骑：你计算与其他角色的距离 -1。', targetMode: 'self' },
  di_lu: { name: '的卢', category: 'equipment', description: '防御坐骑：其他角色计算与你的距离 +1。', targetMode: 'self' },
  hua_liu: { name: '骅骝', category: 'equipment', description: '防御坐骑：其他角色计算与你的距离 +1。', targetMode: 'self' },
  jue_ying: { name: '绝影', category: 'equipment', description: '防御坐骑：其他角色计算与你的距离 +1。', targetMode: 'self' },
  zhua_huang_fei_dian: { name: '爪黄飞电', category: 'equipment', description: '防御坐骑：其他角色计算与你的距离 +1。', targetMode: 'self' },
  zhu_ge_lian_nu: { name: '诸葛连弩', category: 'equipment', description: '武器，范围 1：出牌阶段使用「杀」无次数限制。', targetMode: 'self' },
  gu_ding_dao: { name: '古锭刀', category: 'equipment', description: '武器，范围 2：使用「杀」命中没有手牌的目标时伤害 +1。', targetMode: 'self' },
  ci_xiong_shuang_gu_jian: { name: '雌雄双股剑', category: 'equipment', description: '武器，范围 2：杀指定异性目标后，可令其弃一张手牌，否则你摸一张牌。', targetMode: 'self' },
  han_bing_jian: { name: '寒冰剑', category: 'equipment', description: '武器，范围 2：杀造成伤害前，可防止伤害并依次弃置目标至多两张牌。', targetMode: 'self' },
  qing_long_yan_yue_dao: { name: '青龙偃月刀', category: 'equipment', description: '武器，范围 3：杀被闪抵消后，可继续对同一目标使用杀。', targetMode: 'self' },
  zhang_ba_she_mao: { name: '丈八蛇矛', category: 'equipment', description: '武器，范围 3：可将两张手牌当作一张杀使用或打出。', targetMode: 'self' },
  guan_shi_fu: { name: '贯石斧', category: 'equipment', description: '武器，范围 3：杀被闪抵消后，可弃两张牌令此杀强制命中。', targetMode: 'self' },
  fang_tian_hua_ji: { name: '方天画戟', category: 'equipment', description: '武器，范围 4：使用最后一张手牌中的杀时，可额外指定至多两个目标。', targetMode: 'self' },
  zhu_que_yu_shan: { name: '朱雀羽扇', category: 'equipment', description: '武器，范围 4：可将普通杀改为火杀。', targetMode: 'self' },
  qi_lin_gong: { name: '麒麟弓', category: 'equipment', description: '武器，范围 5：杀造成伤害后，可弃置目标装备区里的一匹坐骑。', targetMode: 'self' },
  ren_wang_dun: { name: '仁王盾', category: 'equipment', description: '防具：黑色的「杀」对你无效。', targetMode: 'self' },
  teng_jia: { name: '藤甲', category: 'equipment', description: '防具：南蛮、万箭和普通杀对你无效；受到火焰伤害时伤害 +1。', targetMode: 'self' },
  bai_yin_shi_zi: { name: '白银狮子', category: 'equipment', description: '防具：受到超过 1 点的伤害时改为 1；失去此装备时回复 1 点体力。', targetMode: 'self' },
  ba_gua_zhen: { name: '八卦阵', category: 'equipment', description: '防具：需要使用或打出「闪」时可判定，红色判定牌视为「闪」。', targetMode: 'self' },
  qing_gang_jian: { name: '青釭剑', category: 'equipment', description: '武器，范围 2：你使用「杀」指定目标后，无视其防具。', targetMode: 'self' },
  le_bu_si_shu: { name: '乐不思蜀', category: 'trick', description: '延时锦囊：目标判定非红桃时，跳过本回合出牌阶段。', targetMode: 'single-other' },
  bing_liang_cun_duan: { name: '兵粮寸断', category: 'trick', description: '延时锦囊，距离 1：目标判定非梅花时，跳过本回合摸牌阶段。', targetMode: 'single-other' },
  shan_dian: { name: '闪电', category: 'trick', description: '延时锦囊：黑桃 2—9 时受到 3 点雷电伤害，否则移至下家判定区。', targetMode: 'self' },
  wu_xie_ke_ji: { name: '无懈可击', category: 'trick', description: '响应锦囊牌：抵消其对一个目标的效果；可继续用无懈可击抵消。', targetMode: 'none' },
  guo_he_chai_qiao: { name: '过河拆桥', category: 'trick', description: '选择一名区域内有牌的其他角色，弃置其区域内一张牌。', targetMode: 'single-other' },
  shun_shou_qian_yang: { name: '顺手牵羊', category: 'trick', description: '选择距离 1 且区域内有牌的其他角色，获得其区域内一张牌。', targetMode: 'single-other' },
  fire_attack: { name: '火攻', category: 'trick', description: '一名有手牌的其他角色展示一张手牌；你可弃置同花色手牌，对其造成 1 点火焰伤害。', targetMode: 'single-other' },
  amazing_grace: { name: '五谷丰登', category: 'trick', description: '亮出等同存活角色数的牌，各角色依次获得其中一张。', targetMode: 'none' },
  borrowed_sword: { name: '借刀杀人', category: 'trick', description: '指定一名持有武器的角色及其攻击范围内另一角色；前者须对后者使用杀，否则将武器交给你。', targetMode: 'ordered-two' },
  iron_chain: { name: '铁索连环', category: 'trick', description: '横置或重置一至两名角色；也可不选目标重铸并摸一张牌。属性伤害会在连环角色间传导。', targetMode: 'up-to-two' },
};

export function isStandardCardKind(value: unknown): value is StandardCardKind {
  return typeof value === 'string' && (standardCardKinds as readonly string[]).includes(value);
}

export function cardPresentation(kind: string): CardPresentation | undefined {
  return isStandardCardKind(kind) ? cardCatalog[kind] : undefined;
}

export function formatCardRank(rank: number | string | undefined): string {
  const numeric = typeof rank === 'number' ? rank : Number(rank);
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > 13) return '·';
  if (numeric === 1) return 'A';
  if (numeric === 11) return 'J';
  if (numeric === 12) return 'Q';
  if (numeric === 13) return 'K';
  return String(numeric);
}
