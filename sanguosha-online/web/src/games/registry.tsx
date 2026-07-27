import type {
  DigitBombGameView,
  GameType,
  NumberConnectGameView,
  SplendorGameView,
} from '../types';
import {
  isDigitBombGameView,
  isNumberConnectGameView,
  isSplendorGameView,
} from '../types';

export interface GameRegistration {
  readonly label: string;
  readonly createLabel: string;
  readonly kicker: string;
  readonly minimumPlayers: number;
  readonly maximumPlayers: number;
  readonly defaultPlayers: number;
  readonly fixedPlayers: boolean;
  readonly supportsLlmBots: boolean;
  readonly noteTitle: string;
  readonly noteLines: readonly string[];
  readonly roomRuleSummary?: readonly {
    readonly label: string;
    readonly value: string;
  }[];
  readonly waitingCopy: string;
}

export const GAME_REGISTRY = {
  sanguosha: {
    label: '三国杀',
    createLabel: '三国杀 · 经典身份局',
    kicker: 'Sanguosha / Identity',
    minimumPlayers: 2,
    maximumPlayers: 10,
    defaultPlayers: 5,
    fixedPlayers: false,
    supportsLlmBots: true,
    noteTitle: '三国杀经典身份局',
    noteLines: ['选择武将包与选将方式，开局后由服务器分配身份并执行权威规则。'],
    waitingCopy: '所有成员准备后，房主可以开始并进入服务器选将流程。',
  },
  gouji: {
    label: '够级',
    createLabel: '够级 · 山东 6 人 3V3',
    kicker: 'Gouji / 3V3',
    minimumPlayers: 6,
    maximumPlayers: 6,
    defaultPlayers: 6,
    fixedPlayers: true,
    supportsLlmBots: false,
    noteTitle: '够级固定 6 人',
    noteLines: [
      '196 张牌，甲乙联邦交错落座；支持真人与服务器机器人混合开局。',
      '已启用憋 3、4 全出、够级隔离、开点、烧牌、让牌与头科至大拉结算。',
    ],
    roomRuleSummary: [
      { label: '玩法', value: '山东够级 3V3' },
      { label: '牌堆', value: '196 张' },
      { label: '座位', value: '甲乙联邦交错' },
      { label: '核心规则', value: '憋 3 / 开点 / 烧牌' },
    ],
    waitingCopy: '坐满 6 席并全部准备后开局；机器人会自动准备并按权威规则行动。',
  },
  doudizhu: {
    label: '斗地主',
    createLabel: '斗地主 · 经典 3 人局',
    kicker: 'Doudizhu / Classic',
    minimumPlayers: 3,
    maximumPlayers: 3,
    defaultPlayers: 3,
    fixedPlayers: true,
    supportsLlmBots: true,
    noteTitle: '斗地主固定 3 人',
    noteLines: [
      '标准 54 张牌，三人依次叫分；地主获得 3 张底牌，先出完手牌的一方获胜。',
      '支持顺子、连对、飞机、四带二、炸弹、王炸，以及炸弹与春天倍率。',
    ],
    roomRuleSummary: [
      { label: '玩法', value: '经典斗地主' },
      { label: '牌堆', value: '54 张' },
      { label: '座位', value: '固定 3 人' },
      { label: '核心规则', value: '叫分 / 炸弹 / 春天' },
    ],
    waitingCopy: '坐满 3 席并全部准备后开局；机器人会自动叫分和出牌。',
  },
  splendor: {
    label: '璀璨宝石',
    createLabel: '璀璨宝石 · 经典策略',
    kicker: 'Splendor / Classic',
    minimumPlayers: 2,
    maximumPlayers: 4,
    defaultPlayers: 4,
    fixedPlayers: false,
    supportsLlmBots: false,
    noteTitle: '璀璨宝石 2—4 人',
    noteLines: [
      '收集宝石筹码、购买发展卡并吸引贵族，率先建立足够声望。',
      '机器人仅使用权威规则决策，不调用大模型。',
    ],
    roomRuleSummary: [
      { label: '玩法', value: '经典璀璨宝石' },
      { label: '人数', value: '2—4 人' },
      { label: '市场', value: '三级发展卡' },
      { label: '目标', value: '声望与贵族' },
    ],
    waitingCopy: '至少 2 人、至多 4 人；全部成员准备后即可开始宝石竞逐。',
  },
  splendor_pokemon: {
    label: '璀璨宝石宝可梦',
    createLabel: '璀璨宝石宝可梦 · 训练家对决',
    kicker: 'Splendor / Pokémon',
    minimumPlayers: 2,
    maximumPlayers: 4,
    defaultPlayers: 4,
    fixedPlayers: false,
    supportsLlmBots: false,
    noteTitle: '璀璨宝石宝可梦 2—4 人',
    noteLines: [
      '收集精灵球、捕获 Lv.1—3 宝可梦，并争夺稀有与传说卡。',
      '满足条件后可完成进化；机器人仅使用权威规则决策。',
    ],
    roomRuleSummary: [
      { label: '玩法', value: '璀璨宝石宝可梦' },
      { label: '人数', value: '2—4 人' },
      { label: '卡池', value: 'Lv.1—3 / 稀有 / 传说' },
      { label: '特色', value: '捕获与进化' },
    ],
    waitingCopy: '至少 2 人、至多 4 人；全部训练家准备后即可进入竞技场。',
  },
  digit_bomb: {
    label: '数字炸弹',
    createLabel: '数字炸弹 · 双人拆弹对决',
    kicker: 'Digit Bomb / Versus',
    minimumPlayers: 2,
    maximumPlayers: 2,
    defaultPlayers: 2,
    fixedPlayers: true,
    supportsLlmBots: false,
    noteTitle: '数字炸弹固定 2 人',
    noteLines: [
      '双方秘密设置数字，轮流猜测并由出题者反馈位置正确的位数。',
      '密码允许以 0 开头、允许重复数字；机器人仅使用权威规则决策。',
    ],
    roomRuleSummary: [
      { label: '玩法', value: '双人数字炸弹' },
      { label: '座位', value: '固定 2 人' },
      { label: '反馈', value: '位置正确数' },
      { label: '赛制', value: '多局积分 / 双方投票结算' },
    ],
    waitingCopy: '坐满 2 席并全部准备后开局；双方将先秘密设置本局数字。',
  },
  number_connect: {
    label: '数字连连看',
    createLabel: '数字连连看 · 双人五线对决',
    kicker: 'Number Connect / 5×5',
    minimumPlayers: 2,
    maximumPlayers: 2,
    defaultPlayers: 2,
    fixedPlayers: true,
    supportsLlmBots: false,
    noteTitle: '数字连连看固定 2 人',
    noteLines: [
      '双方各有一张随机 5×5 数字棋盘，同一格位置不会出现相同数字。',
      '叫出的数字会在双方棋盘同时打叉；横、竖或斜向连满一线得 1 分，先到 5 分获胜。',
      '双方只能看到自己的棋盘；对局结束后也不会公开对方的数字排列。',
    ],
    roomRuleSummary: [
      { label: '玩法', value: '双人数字连线' },
      { label: '棋盘', value: '5×5 / 随机排列' },
      { label: '计分', value: '横 / 竖 / 双斜线' },
      { label: '目标', value: '率先完成 5 条线' },
    ],
    waitingCopy: '坐满 2 席并全部准备后开局；对局结束前，对手的数字排列保持隐藏。',
  },
} as const satisfies Record<GameType, GameRegistration>;

export function gameRegistration(gameType: GameType): GameRegistration {
  return GAME_REGISTRY[gameType];
}

export function isSplendorGameType(gameType: GameType): boolean {
  return gameType === 'splendor' || gameType === 'splendor_pokemon';
}

export function splendorViewForRoom(
  value: unknown,
  roomGameType: GameType | undefined,
): SplendorGameView | null {
  if (!isSplendorGameView(value)) return null;
  return roomGameType === value.kind ? value : null;
}

export function digitBombViewForRoom(
  value: unknown,
  roomGameType: GameType | undefined,
): DigitBombGameView | null {
  if (!isDigitBombGameView(value)) return null;
  return roomGameType === 'digit_bomb' ? value : null;
}

export function numberConnectViewForRoom(
  value: unknown,
  roomGameType: GameType | undefined,
): NumberConnectGameView | null {
  if (!isNumberConnectGameView(value)) return null;
  return roomGameType === 'number_connect' ? value : null;
}
