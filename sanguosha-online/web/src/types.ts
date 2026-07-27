import {
  cardPresentation,
  formatCardRank,
  type CardCategory,
  type CardTargetMode,
  type StandardCardKind,
} from './gameCards';
import { activeSkillDescriptions, generalSkillNames } from './interactionRules';

export type UserRole = 'admin' | 'player';

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  disabled: boolean;
  mustChangePassword: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type FullGeneralId =
  | 'cao_cao' | 'guo_jia' | 'si_ma_yi' | 'xia_hou_dun' | 'xu_chu' | 'zhang_liao' | 'zhen_ji'
  | 'guan_yu' | 'huang_yue_ying' | 'liu_bei' | 'ma_chao' | 'zhang_fei' | 'zhao_yun' | 'zhu_ge_liang'
  | 'da_qiao' | 'gan_ning' | 'huang_gai' | 'lu_xun' | 'lv_meng' | 'sun_quan' | 'sun_shang_xiang' | 'zhou_yu'
  | 'diao_chan' | 'hua_tuo' | 'lv_bu' | 'yuan_shu'
  | 'cao_ren' | 'huang_zhong' | 'wei_yan' | 'xia_hou_yuan' | 'xiao_qiao' | 'yu_ji' | 'zhang_jiao' | 'zhou_tai'
  | 'dian_wei' | 'pang_de' | 'pang_tong' | 'tai_shi_ci' | 'wo_long' | 'xun_yu' | 'yan_liang_wen_chou' | 'yuan_shao'
  | 'cao_pi' | 'dong_zhuo' | 'jia_xu' | 'lu_su' | 'meng_huo' | 'sun_jian' | 'xu_huang' | 'zhu_rong'
  | 'cai_wen_ji' | 'deng_ai' | 'jiang_wei' | 'liu_chan' | 'sun_ce' | 'zhang_he' | 'zhang_zhao_zhang_hong' | 'zuo_ci'
  | 'shen_cao_cao' | 'shen_guan_yu' | 'shen_lv_bu' | 'shen_lv_meng'
  | 'shen_si_ma_yi' | 'shen_zhao_yun' | 'shen_zhou_yu' | 'shen_zhu_ge_liang';

export type PackId = 'standard' | 'sp' | 'wind' | 'fire' | 'forest' | 'mountain' | 'god';
export type PlayableFaction = 'wei' | 'shu' | 'wu' | 'qun';
export type GameRole = 'lord' | 'loyalist' | 'rebel' | 'renegade';
export type BotIntelligence = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export const BOT_INTELLIGENCE_NAMES: Record<BotIntelligence, string> = {
  1: '黄巾小卒',
  2: '乡勇锐士',
  3: '虎贲校尉',
  4: '镇军将军',
  5: '五虎上将',
  6: '卧龙军师',
  7: '武圣临凡',
};
export const GOUJI_BOT_INTELLIGENCE_NAMES: Record<BotIntelligence, string> = {
  1: '摸牌学徒',
  2: '跟牌新手',
  3: '牌桌熟手',
  4: '联邦主力',
  5: '烧牌高手',
  6: '牌局军师',
  7: '打牌宗师',
};
export const DOUDIZHU_BOT_INTELLIGENCE_NAMES: Record<BotIntelligence, string> = {
  1: '新手牌友',
  2: '稳健农民',
  3: '欢乐牌手',
  4: '记牌能手',
  5: '叫分专家',
  6: '残局大师',
  7: '牌桌宗师',
};
export type GeneralDraftStage = 'selecting_generals' | 'selecting_factions' | 'complete';

export interface RoomRuleConfig {
  readonly ruleSetVersion: 'original-66-v1';
  readonly enabledGeneralPacks: readonly PackId[];
  readonly generalSelection: {
    readonly mode: 'choice' | 'random';
    readonly candidatesPerPlayer: number;
    readonly allowDuplicateGenerals: boolean;
  };
  readonly deckProfile: 'original-160';
  readonly maximumReshuffles: number;
  readonly lordBonusMinimumPlayers: number;
  readonly godFactionChoice: boolean;
}

export interface GeneralDraftView {
  readonly stage: GeneralDraftStage;
  readonly currentPlayerId: string | null;
  readonly playerIds: readonly string[];
  /** This list contains only the current caller's private candidates. */
  readonly candidates: readonly FullGeneralId[];
  readonly candidateDetails?: readonly {
    readonly id: FullGeneralId;
    readonly name: string;
    readonly faction: PlayableFaction | 'selectable';
    readonly maxHp: number;
    readonly skills: readonly { readonly id: string; readonly name: string; readonly description: string }[];
  }[];
  readonly players: readonly {
    readonly playerId: string;
    readonly role: GameRole | null;
    readonly selected: boolean;
    readonly generalId: FullGeneralId | null;
    readonly needsFaction: boolean;
    readonly faction: PlayableFaction | null;
  }[];
}

export type RoomStatus = 'waiting' | 'drafting' | 'playing' | 'finished';
export type GameType = 'sanguosha' | 'gouji' | 'doudizhu';

export interface RoomSummary {
  id: string;
  name: string;
  gameType: GameType;
  status: RoomStatus;
  hostId: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  createdAt?: string;
}

export interface RoomMember {
  userId: string;
  username: string;
  displayName: string;
  botTitle?: string;
  seat: number;
  ready: boolean;
  online: boolean;
  isHost: boolean;
  isBot?: boolean;
}

export interface RoomChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  sentAt: string;
}

export interface RoomDetail extends RoomSummary {
  members: RoomMember[];
  botIntelligence?: BotIntelligence;
  ruleConfig?: RoomRuleConfig;
  chatMessages: RoomChatMessage[];
  /** Private projection for the caller; absent from public room summaries. */
  draft?: GeneralDraftView;
}

export type CardSuit = 'spade' | 'heart' | 'club' | 'diamond' | 'none';
export type GameTargetMode = CardTargetMode | 'single-any' | 'up-to-four';

export interface GameCard {
  id: string;
  name: string;
  kind?: StandardCardKind | string;
  suit: CardSuit;
  rank: string;
  description?: string;
  category?: CardCategory | string;
  targetMode?: GameTargetMode;
  playable?: boolean;
  allowedTargetIds?: string[];
  allowedTargetPairs?: Array<readonly [string, string]>;
}

export interface EquipmentView extends GameCard {
  slot: string;
}

// The shared engine remains authoritative; Web accepts new skill ids without requiring a lockstep UI release.
export type ActiveGeneralSkillId = string;
export type LordDispatchSkillId = 'hujia' | 'jijiang';
export type SkillChoiceId = 'luoyi' | 'keji' | 'yingzi' | 'biyue' | 'luoshen' | 'jizhi' | 'jilue' | 'lianying' | 'xiaoji' | 'buqu' | 'niepan';
export type StandardImplementedSkillId =
  | 'jianxiong' | 'tiandu' | 'yiji' | 'guicai' | 'fankui'
  | 'ganglie' | 'tuxi' | 'guanxing' | 'tieqi' | 'liuli' | 'liegong' | 'buqu' | 'tianxiang'
  | 'jushou' | 'shensu' | 'leiji' | 'guidao' | 'mengjin' | 'jieming' | 'shuangxiong'
  | 'benghuai' | 'luanwu' | 'haoshi' | 'dimeng' | 'zaiqi' | 'yinghun'
  | 'xingshang' | 'fangzhu' | 'songwei' | 'baonue' | 'lieren' | 'beige' | 'huashen' | 'xinsheng'
  | 'guixin' | 'wuhun' | 'kuangbao' | 'wumou' | 'shenfen' | 'renjie' | 'baiyin' | 'jilue'
  | 'qinyin' | 'lianpo' | 'yeyan' | 'shelie' | 'gongxin' | 'qixing' | 'kuangfeng' | 'dawu'
  | 'tiaoxin' | 'xiangle' | 'jiang' | 'yingyang' | 'zhiba' | 'zhijian' | 'tuntian' | 'zaoxian'
  | 'jixi' | 'zhiji' | 'fangquan' | 'ruoyu' | 'hunzi' | 'qiaobian' | 'guzheng';

export interface PlayableSkillHint {
  skillId: ActiveGeneralSkillId;
  cardIds: string[];
  minCards: number;
  maxCards: number;
  targetMode: GameTargetMode;
  targetIds: string[];
  targetPairs?: Array<readonly [string, string]>;
  cardTargetIds?: Record<string, string[]>;
  cardPairs?: Array<readonly [string, string]>;
  cardGroups?: string[][];
  cardGroupTargets?: Array<{ cardIds: string[]; targetIds: string[]; maxTargets: number }>;
  virtualCardKind?:
    | 'slash' | 'fire_slash' | 'peach' | 'duel'
    | 'guo_he_chai_qiao' | 'shun_shou_qian_yang' | 'le_bu_si_shu' | 'bing_liang_cun_duan'
    | 'fire_attack' | 'iron_chain' | 'arrow_barrage' | 'wine';
}

export interface SkillResponseHint {
  skillId: 'wusheng' | 'longdan' | 'qingguo' | 'jijiu' | 'jiuchi' | 'wushen' | 'longhun';
  cardIds: string[];
  responseKind: 'slash' | 'dodge' | 'peach' | 'wine';
  minCards?: number;
  maxCards?: number;
  cardGroups?: string[][];
}

export interface GamePlayerView {
  id: string;
  userId?: string;
  displayName: string;
  seat: number;
  general?: string;
  faction?: string;
  gender?: 'male' | 'female';
  identity?: string;
  hp: number;
  maxHp: number;
  handCount: number;
  alive: boolean;
  faceUp: boolean;
  online: boolean;
  isSelf: boolean;
  isCurrent: boolean;
  equipment?: EquipmentView[];
  judgment?: EquipmentView[];
  publicPiles?: Record<string, GameCard[]>;
  publicPileCounts?: Record<string, number>;
  privatePiles?: Record<string, GameCard[]>;
  publicMarks?: Record<string, number>;
  publicEffects?: Array<{
    effectId: number;
    kind: 'kuangfeng' | 'dawu';
    targetPlayerId: string;
    sourcePlayerId: string;
  }>;
  chained?: boolean;
  effectiveSkillIds?: string[];
  effectiveSkills?: Array<{ id: string; name: string; description: string }>;
}

export interface GameLogEntry {
  id: string;
  at?: string;
  text: string;
  tone?: 'normal' | 'important' | 'damage' | 'heal';
}

export type PromptKind =
  | 'respond-slash'
  | 'respond-dodge'
  | 'respond-peach'
  | 'discard'
  | 'choose-card'
  | 'choose-target'
  | 'confirm'
  | string;

export interface ActionPrompt {
  id: string;
  promptId?: string;
  kind: PromptKind;
  message: string;
  min?: number;
  max?: number;
  optional?: boolean;
  responseKind?: 'slash' | 'dodge' | 'nullification';
  allowedCardIds?: string[];
  allowedTargetIds?: string[];
  zoneChoices?: Array<{ token: string; ownerId?: string; zone: 'hand' | 'equipment' | 'judgment'; label: string }>;
  cardChoices?: GameCard[];
  options?: string[];
  weaponStage?: string;
  zhangBaAllowedCardIds?: string[];
  skillResponses?: SkillResponseHint[];
  skillId?: ActiveGeneralSkillId | SkillChoiceId | StandardImplementedSkillId;
  standardStage?: string;
  cardTargetIds?: Record<string, string[]>;
  kanpoCardIds?: string[];
  longhunCardGroups?: string[][];
  sourceId?: string;
  opponentId?: string;
  declaredKind?: string;
  canChallenge?: boolean;
  minTargets?: number;
  maxTargets?: number;
  requiredCount?: number;
  respondedCount?: number;
  suitChoices?: Array<{ value: 'spade' | 'heart' | 'club' | 'diamond'; label: string }>;
  lordSkills?: LordDispatchSkillId[];
  lordSkillId?: LordDispatchSkillId;
  requesterId?: string;
}

export interface GameView {
  roomId: string;
  revision: number;
  actionPromptId: string;
  status: 'playing' | 'finished';
  round: number;
  phase: string;
  turnPlayerId?: string;
  actingPlayerId?: string;
  selfPlayerId: string;
  canAct: boolean;
  players: GamePlayerView[];
  hand: GameCard[];
  publicCards?: GameCard[];
  zhangBaSlash?: { allowedCardIds: string[]; targetIds: string[]; maxTargets?: number } | null;
  skills: PlayableSkillHint[];
  logs: GameLogEntry[];
  prompt?: ActionPrompt | null;
  availableActions?: string[];
  winner?: string;
}

export type GameAction =
  | { type: 'play_card'; playerId: string; cardId: string; targetId?: string; targetIds?: string[] }
  | { type: 'respond'; playerId: string; cardId?: string | null; cardIds?: string[] }
  | { type: 'declare_guhuo'; playerId: string; cardId: string; declaredKind: string; targetId?: string; targetIds?: string[] }
  | { type: 'resolve_guhuo'; playerId: string; promptId: string; challenge: boolean }
  | { type: 'choose_pindian_card'; playerId: string; promptId: string; cardId: string }
  | { type: 'use_zhang_ba_slash'; playerId: string; cardIds: string[]; targetId: string; targetIds?: string[] }
  | { type: 'discard'; playerId: string; cardIds: string[] }
  | { type: 'end_play'; playerId: string }
  | { type: 'activate_armor'; playerId: string; activate: boolean }
  | { type: 'choose_zone_card'; playerId: string; token: string }
  | { type: 'choose_hand_card'; playerId: string; cardId?: string | null }
  | { type: 'choose_amazing_grace_card'; playerId: string; cardId: string }
  | {
      type: 'choose_fanjian_suit';
      playerId: string;
      suit: 'spade' | 'heart' | 'club' | 'diamond';
      promptId: string;
    }
  | {
      type: 'use_skill';
      playerId: string;
      skillId: ActiveGeneralSkillId;
      cardIds?: string[];
      targetId?: string;
      targetIds?: string[];
      allocations?: Array<{ targetId: string; damage: number }>;
    }
  | { type: 'resolve_skill'; playerId: string; skillId: SkillChoiceId; activate: boolean; promptId?: string }
  | {
      type: 'resolve_standard_skill'; playerId: string; promptId: string; activate: boolean;
      cardId?: string; cardIds?: string[]; targetId?: string; targetIds?: string[]; tokens?: string[];
      topCardIds?: string[]; bottomCardIds?: string[];
      allocations?: Array<{ cardId: string; targetId: string }>;
      viewAsSkillId?: 'wusheng' | 'longdan' | 'wushen' | 'longhun' | 'zhang_ba_she_mao';
    }
  | { type: 'invoke_lord_skill'; playerId: string; skillId: LordDispatchSkillId; targetId?: string; targetIds?: string[] }
  | { type: 'resolve_lord_dispatch'; playerId: string; promptId: string; cardId?: string | null }
  | { type: 'resolve_weapon'; playerId: string; promptId?: string; activate: boolean; cardIds?: string[]; tokens?: string[] };

export type GoujiRank =
  | 'big_joker' | 'small_joker' | '2' | 'A' | 'K' | 'Q' | 'J'
  | '10' | '9' | '8' | '7' | '6' | '5' | '4' | '3';
export type GoujiSuit = 'spade' | 'heart' | 'diamond' | 'club' | 'joker';
export type GoujiTeam = 'A' | 'B';
export type GoujiFinishRank = '头科' | '二科' | '三科' | '四科' | '二拉' | '大拉';

export interface GoujiCard {
  id: string;
  rank: GoujiRank;
  suit: GoujiSuit;
  marked?: boolean;
}

export interface GoujiPlayerView {
  id: string;
  seat: number;
  name: string;
  botTitle?: string;
  team: GoujiTeam;
  handCount: number;
  hand?: GoujiCard[];
  finishedRank?: GoujiFinishRank;
  openedPoint: boolean;
  naturalPoint: boolean;
  burnCount: number;
}

export interface GoujiGameView {
  kind: 'gouji';
  version: 1;
  revision: number;
  actionPromptId: string;
  status: 'playing' | 'finished';
  currentPlayerId: string;
  leadPlayerId: string;
  players: GoujiPlayerView[];
  trick: {
    fromPlayerId: string;
    cards: GoujiCard[];
    mainRank: GoujiRank;
    cardCount: number;
    isGouji: boolean;
    passedPlayerIds: string[];
    burning: boolean;
    burnerPlayerId?: string;
  } | null;
  prompt: {
    type: 'play' | 'waiting' | 'finished';
    playerId: string | null;
    canPlay: boolean;
    canPass: boolean;
    canYield: boolean;
    mustIncludeJoker: boolean;
  };
  winner: { team: GoujiTeam; playerIds: string[] } | null;
  logs: Array<{
    id: number;
    type: 'system' | 'play' | 'pass' | 'finish' | 'victory';
    message: string;
  }>;
}

export type GoujiAction =
  | { type: 'gouji_play'; playerId: string; cardIds: string[] }
  | { type: 'gouji_pass'; playerId: string }
  | { type: 'gouji_yield'; playerId: string };

export type DoudizhuRank =
  | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A' | '2'
  | 'small_joker' | 'big_joker';
export type DoudizhuSuit = 'spade' | 'heart' | 'diamond' | 'club' | 'joker';
export type DoudizhuRole = 'landlord' | 'farmer';
export type DoudizhuPatternType =
  | 'single' | 'pair' | 'triple' | 'triple_single' | 'triple_pair'
  | 'straight' | 'consecutive_pairs' | 'airplane' | 'airplane_singles'
  | 'airplane_pairs' | 'four_two_singles' | 'four_two_pairs' | 'bomb' | 'rocket';

export interface DoudizhuCard {
  id: string;
  rank: DoudizhuRank;
  suit: DoudizhuSuit;
}

export interface DoudizhuPattern {
  type: DoudizhuPatternType;
  primaryRank: DoudizhuRank;
  length: number;
  cards: DoudizhuCard[];
}

export interface DoudizhuPlayerView {
  id: string;
  seat: number;
  name: string;
  botTitle?: string;
  role?: DoudizhuRole;
  handCount: number;
  hand?: DoudizhuCard[];
  playedCount: number;
  beans: number;
  beanDelta: number;
}

export interface DoudizhuGameView {
  kind: 'doudizhu';
  version: 1;
  revision: number;
  actionPromptId: string;
  status: 'playing' | 'finished';
  phase: 'bidding' | 'playing' | 'finished';
  currentPlayerId: string;
  landlordId: string | null;
  players: DoudizhuPlayerView[];
  bottomCards: DoudizhuCard[];
  bid: {
    firstPlayerId: string;
    currentBid: 0 | 1 | 2 | 3;
    bidderId: string | null;
    bids: Array<{ playerId: string; score: 0 | 1 | 2 | 3 }>;
  };
  trick: {
    fromPlayerId: string;
    pattern: DoudizhuPattern;
    passCount: number;
  } | null;
  baseScore: number;
  multiplier: number;
  winner: {
    role: DoudizhuRole;
    playerIds: string[];
    baseScore: number;
    multiplier: number;
    spring: boolean;
    beanStake: number;
    settlements: Array<{
      playerId: string;
      delta: number;
      balance: number;
    }>;
  } | null;
  prompt: {
    type: 'bid' | 'play' | 'waiting' | 'finished';
    playerId: string | null;
    bidOptions: Array<0 | 1 | 2 | 3>;
    canPlay: boolean;
    canPass: boolean;
    recommendation: {
      type: 'play';
      cardIds: string[];
    } | {
      type: 'pass';
    } | null;
  };
  logs: Array<{
    id: number;
    type: 'system' | 'bid' | 'play' | 'pass' | 'victory';
    message: string;
  }>;
}

export type DoudizhuAction =
  | { type: 'doudizhu_bid'; playerId: string; score: 0 | 1 | 2 | 3 }
  | { type: 'doudizhu_play'; playerId: string; cardIds: string[] }
  | { type: 'doudizhu_pass'; playerId: string };

export type AnyGameAction = GameAction | GoujiAction | DoudizhuAction;

export function isGoujiGameView(value: unknown): value is GoujiGameView {
  if (!value || typeof value !== 'object') return false;
  const game = value as Partial<GoujiGameView>;
  const players = Array.isArray(game.players) ? game.players : [];
  const prompt = game.prompt as Partial<GoujiGameView['prompt']> | undefined;
  return game.kind === 'gouji' &&
    game.version === 1 &&
    Number.isSafeInteger(game.revision) &&
    typeof game.actionPromptId === 'string' &&
    (game.status === 'playing' || game.status === 'finished') &&
    typeof game.currentPlayerId === 'string' &&
    typeof game.leadPlayerId === 'string' &&
    players.length === 6 &&
    players.every((player) =>
      player && typeof player === 'object' &&
      typeof player.id === 'string' &&
      Number.isInteger(player.seat) &&
      typeof player.name === 'string' &&
      (player.botTitle === undefined || typeof player.botTitle === 'string') &&
      (player.team === 'A' || player.team === 'B') &&
      Number.isInteger(player.handCount) &&
      (player.hand === undefined || Array.isArray(player.hand))
    ) &&
    Boolean(prompt) &&
    (prompt?.type === 'play' || prompt?.type === 'waiting' || prompt?.type === 'finished') &&
    Array.isArray(game.logs);
}

export function isDoudizhuGameView(value: unknown): value is DoudizhuGameView {
  if (!value || typeof value !== 'object') return false;
  const game = value as Partial<DoudizhuGameView>;
  const players = Array.isArray(game.players) ? game.players : [];
  const prompt = game.prompt as Partial<DoudizhuGameView['prompt']> | undefined;
  const recommendation = prompt?.recommendation;
  return game.kind === 'doudizhu' &&
    game.version === 1 &&
    Number.isSafeInteger(game.revision) &&
    typeof game.actionPromptId === 'string' &&
    (game.status === 'playing' || game.status === 'finished') &&
    (game.phase === 'bidding' || game.phase === 'playing' || game.phase === 'finished') &&
    typeof game.currentPlayerId === 'string' &&
    players.length === 3 &&
    players.every((player) =>
      player && typeof player === 'object' &&
      typeof player.id === 'string' &&
      Number.isInteger(player.seat) &&
      typeof player.name === 'string' &&
      Number.isInteger(player.handCount) &&
      Number.isSafeInteger(player.beans) &&
      Number.isSafeInteger(player.beanDelta) &&
      (player.hand === undefined || Array.isArray(player.hand))
    ) &&
    Boolean(prompt) &&
    (prompt?.type === 'bid' || prompt?.type === 'play' || prompt?.type === 'waiting' || prompt?.type === 'finished') &&
    (recommendation === null ||
      recommendation?.type === 'pass' ||
      (recommendation?.type === 'play' &&
        Array.isArray(recommendation.cardIds) &&
        recommendation.cardIds.every((cardId) => typeof cardId === 'string'))) &&
    Array.isArray(game.bottomCards) &&
    Array.isArray(game.logs);
}

export interface ApiErrorBody {
  code?: string;
  message?: string;
}

export interface SocketAck<T = unknown> {
  ok: boolean;
  data?: T;
  error?: ApiErrorBody;
}

export interface ServerState {
  rooms?: RoomSummary[];
  room?: RoomDetail | null;
  game?: GameView | GoujiGameView | DoudizhuGameView | null;
}

type EngineCardKind = StandardCardKind;

interface EngineCard {
  id: string;
  kind: EngineCardKind;
  name?: string;
  suit?: Exclude<CardSuit, 'none'>;
  rank?: number | string;
  category?: CardCategory;
}

interface EnginePlayer {
  id: string;
  seat: number;
  alive: boolean;
  faceUp?: boolean;
  hp: number;
  maxHp: number;
  handCount: number;
  hand: EngineCard[] | null;
  equipment?: EngineCard[];
  judgment?: EngineCard[];
  publicPiles?: Record<string, EngineCard[]>;
  publicPileCounts?: Record<string, number>;
  privatePiles?: Record<string, EngineCard[]>;
  publicMarks?: Record<string, number>;
  publicEffects?: Array<{
    effectId: number;
    kind: 'kuangfeng' | 'dawu';
    targetPlayerId: string;
    sourcePlayerId: string;
  }>;
  chained?: boolean;
  role: GameRole | null;
  general?: { id: string; name: string; faction: 'wei' | 'shu' | 'wu' | 'qun' | 'god'; gender: 'male' | 'female' } | null;
  effectiveSkillIds?: string[];
  effectiveSkills?: Array<{ id: string; name: string; description: string }>;
}

interface EnginePlayableCardHint {
  cardId: string;
  kind: EngineCardKind;
  targetIds: string[];
  targetMode?: GameTargetMode;
  targetPairs?: Array<readonly [string, string]>;
}

interface EnginePlayableSkillHint {
  skillId: ActiveGeneralSkillId;
  cardIds: string[];
  minCards: number;
  maxCards: number;
  targetMode: GameTargetMode;
  targetIds: string[];
  targetPairs?: Array<readonly [string, string]>;
  cardTargetIds?: Readonly<Record<string, string[]>>;
  cardPairs?: ReadonlyArray<readonly [string, string]>;
  cardGroups?: ReadonlyArray<readonly string[]>;
  cardGroupTargets?: ReadonlyArray<{
    cardIds: readonly string[];
    targetIds: readonly string[];
    maxTargets: number;
  }>;
  virtualCardKind?: PlayableSkillHint['virtualCardKind'];
}

interface EngineSkillResponseHint {
  skillId: SkillResponseHint['skillId'];
  cardIds: string[];
  responseKind: 'slash' | 'dodge' | 'peach' | 'wine';
  minCards?: number;
  maxCards?: number;
  cardGroups?: ReadonlyArray<readonly string[]>;
}

type EngineResponseContext = 'slash' | 'duel' | 'barbarian_invasion' | 'arrow_barrage' | 'borrowed_sword';

type EnginePrompt =
  | {
      type: 'play';
      playerId: string;
      cards: EnginePlayableCardHint[];
      skills?: EnginePlayableSkillHint[];
      zhangBaSlash?: { allowedCardIds: string[]; targetIds: string[]; maxTargets?: number } | null;
    }
  | {
      type: 'guhuo_challenge'; playerId: string; sourceId: string;
      declaredKind: EngineCardKind; promptId: string; canChallenge: true;
    }
  | {
      type: 'choose_pindian_card'; playerId: string; opponentId: string;
      skillId: 'tianyi' | 'quhu' | 'lieren' | 'zhiba'; promptId: string; allowedCardIds: string[];
    }
  | {
      type: 'fanjian_suit'; playerId: string; sourceId: string; promptId: string;
      suits: Array<'spade' | 'heart' | 'club' | 'diamond'>;
    }
  | {
      type: 'armor'; playerId: string; armorKind: 'ba_gua_zhen';
      sourceSkillId?: 'bazhen' | null;
      requiredCount?: number; respondedCount?: number; canPass: true;
    }
  | {
      type: 'nullification'; playerId: string; sourceId: string; effectTargetId: string;
      cardKind: EngineCardKind; allowedCardIds: string[]; kanpoCardIds?: string[];
      longhunCardGroups?: ReadonlyArray<readonly string[]>; canPass: true;
    }
  | {
      type: 'zone_selection'; playerId: string; victimId: string; mode: 'discard' | 'gain';
      choices: Array<{ token: string; zone: 'hand' | 'equipment' | 'judgment'; card: EngineCard | null }>;
    }
  | { type: 'fire_attack_reveal'; playerId: string; sourceId: string; allowedCardIds: string[] }
  | {
      type: 'fire_attack_discard'; playerId: string; victimId: string;
      revealedCard: EngineCard; allowedCardIds: string[]; canPass: true;
    }
  | { type: 'amazing_grace_selection'; playerId: string; cards: EngineCard[] }
  | {
      type: 'weapon_action'; playerId: string; weaponKind: EngineCardKind; stage: string; victimId: string;
      promptId?: string;
      allowedCardIds: string[]; minCards: number; maxCards: number; canPass: boolean;
      choices?: Array<{ token: string; zone: 'hand' | 'equipment'; card: EngineCard | null }>;
    }
  | {
      type: 'respond';
      playerId: string;
      attackerId?: string;
      targetId?: string;
      responseKind?: 'slash' | 'dodge';
      allowedCardIds?: string[];
      dodgeCardIds?: string[];
      slashCardIds?: string[];
      zhangBaCardIds?: string[];
      skillResponses?: EngineSkillResponseHint[];
      requiredCount?: number;
      respondedCount?: number;
      canPass: true;
      context?: EngineResponseContext;
      lordSkills?: LordDispatchSkillId[];
    }
  | {
      type: 'lord_dispatch'; playerId: string; requesterId: string;
      skillId: LordDispatchSkillId; responseKind: 'slash' | 'dodge'; method: 'use' | 'respond';
      promptId: string; allowedCardIds: string[]; canPass: true;
    }
  | {
      type: 'dying';
      playerId: string;
      victimId: string;
      allowedCardIds: string[];
      peachCardIds: string[];
      wineCardIds: string[];
      skillResponses?: EngineSkillResponseHint[];
      canPass: true;
    }
  | { type: 'skill_choice'; playerId: string; skillId: SkillChoiceId; promptId?: string; iteration?: number; canPass: true }
  | {
      type: 'standard_skill'; playerId: string; skillId: StandardImplementedSkillId;
      stage: string; promptId: string; canPass: boolean; cards: EngineCard[]; allowedCardIds: string[];
      targetIds: string[]; minCards: number; maxCards: number; minTargets: number; maxTargets: number;
      options?: readonly string[];
      choices?: Array<{ token: string; ownerId: string; zone: 'hand' | 'equipment' | 'judgment'; card: EngineCard | null }>;
      cardTargetIds?: Record<string, string[]>;
    }
  | { type: 'discard'; playerId: string; count: number; cardIds: string[] }
  | { type: 'waiting' }
  | { type: 'finished'; winner: { side: 'lord' | 'rebel' | 'renegade'; playerIds: string[] } };

interface EngineGameView {
  version: 1;
  revision: number;
  actionPromptId: string;
  status: 'playing' | 'finished';
  players: EnginePlayer[];
  currentPlayerId: string;
  pendingResponse?: { targetId?: string } | null;
  turn: { number: number; playerId: string; phase: 'prepare' | 'judgment' | 'draw' | 'play' | 'respond' | 'discard' | 'end' };
  winner: { side: 'lord' | 'rebel' | 'renegade'; playerIds: string[] } | null;
  logs: { id: number; type: 'system' | 'turn' | 'card' | 'damage' | 'death' | 'victory'; message: string }[];
  publicCards?: EngineCard[];
  prompt: EnginePrompt;
}

const roleNames = { lord: '主公', loyalist: '忠臣', rebel: '反贼', renegade: '内奸' } as const;
const winnerNames = { lord: '主公与忠臣', rebel: '反贼', renegade: '内奸' } as const;
const factionNames = { wei: '魏', shu: '蜀', wu: '吴', qun: '群', god: '神' } as const;

function isEngineGameView(value: unknown): value is EngineGameView {
  return Boolean(value && typeof value === 'object' && (value as { version?: unknown }).version === 1 && 'turn' in value);
}

function responsePromptMessage(prompt: Extract<EnginePrompt, { type: 'respond' }>): string {
  const responseName = prompt.responseKind === 'slash' ? '杀' : '闪';
  const sourceNames: Record<EngineResponseContext, string> = {
    slash: '杀',
    duel: '决斗',
    barbarian_invasion: '南蛮入侵',
    arrow_barrage: '万箭齐发',
    borrowed_sword: '借刀杀人',
  };
  const sourceName = prompt.context ? sourceNames[prompt.context] : undefined;
  const requiredCount = prompt.requiredCount ?? 1;
  const respondedCount = prompt.respondedCount ?? 0;
  const progress = requiredCount > 1 ? `第 ${respondedCount + 1}/${requiredCount} 张` : '一张';
  if (sourceName) return `「${sourceName}」正在结算，请打出${progress}「${responseName}」或选择跳过。`;
  return `需要你打出一张「${responseName}」，也可以选择跳过。`;
}

export function normalizeGameView(
  payload: unknown,
  options: { roomId?: string; room?: RoomDetail | null; userId: string },
): GameView {
  const container = payload as { roomId?: string; view?: unknown; game?: unknown };
  const raw = container?.view ?? container?.game ?? payload;
  if (!isEngineGameView(raw)) return raw as GameView;

  const roomId = container?.roomId ?? options.roomId ?? options.room?.id ?? '';
  const prompt = raw.prompt;
  const selfId = prompt && 'playerId' in prompt && prompt.playerId === options.userId
    ? prompt.playerId
    : raw.players.some((player) => player.id === options.userId)
      ? options.userId
      : raw.players.find((player) => player.hand !== null)?.id ?? options.userId;
  const memberFor = (player: EnginePlayer) =>
    options.room?.members.find((member) => member.userId === player.id || member.seat === player.seat);
  const playableCards = prompt.type === 'play' ? new Map(prompt.cards.map((card) => [card.cardId, card])) : new Map();
  const playableSkills: PlayableSkillHint[] = prompt.type === 'play'
    ? (prompt.skills ?? []).map((skill) => ({
        ...skill,
        cardIds: [...skill.cardIds],
        targetIds: [...skill.targetIds],
        targetPairs: skill.targetPairs?.map(([first, second]) => [first, second] as const),
        cardTargetIds: skill.cardTargetIds
          ? Object.fromEntries(Object.entries(skill.cardTargetIds).map(([cardId, targetIds]) => [cardId, [...targetIds]]))
          : undefined,
        cardPairs: skill.cardPairs?.map(([first, second]) => [first, second] as const),
        cardGroups: skill.cardGroups?.map((cardIds) => [...cardIds]),
        cardGroupTargets: skill.cardGroupTargets?.map((group) => ({
          cardIds: [...group.cardIds],
          targetIds: [...group.targetIds],
          maxTargets: group.maxTargets,
        })),
      }))
    : [];
  const responseCardIds = prompt.type === 'dying'
    ? prompt.allowedCardIds
    : prompt.type === 'nullification'
      ? prompt.allowedCardIds
    : prompt.type === 'respond'
      ? prompt.allowedCardIds
        ?? (prompt.responseKind === 'slash' ? prompt.slashCardIds : prompt.dodgeCardIds)
        ?? []
      : prompt.type === 'lord_dispatch'
        ? prompt.allowedCardIds
      : prompt.type === 'standard_skill'
        ? prompt.allowedCardIds
      : prompt.type === 'choose_pindian_card'
        ? prompt.allowedCardIds
      : prompt.type === 'fire_attack_reveal' || prompt.type === 'fire_attack_discard' || prompt.type === 'weapon_action'
        ? prompt.allowedCardIds
      : [];
  const selfRaw = raw.players.find((player) => player.id === selfId || player.hand !== null);
  const displayNameById = new Map(raw.players.map((player) => {
    const member = memberFor(player);
    return [player.id, member?.displayName ?? `玩家 ${player.seat + 1}`] as const;
  }));
  const readableLog = (message: string) => {
    let result = message;
    for (const [playerId, displayName] of displayNameById) {
      result = result.replaceAll(playerId, displayName);
    }
    for (const [skillId, name] of Object.entries(generalSkillNames)) {
      result = result.replace(new RegExp(`\\b${skillId}\\b`, 'g'), name);
    }
    return result;
  };

  const mapCard = (card: EngineCard): GameCard => {
    const hint = playableCards.get(card.id);
    const presentation = cardPresentation(card.kind);
    return {
      id: card.id,
      kind: card.kind,
      name: card.name ?? presentation?.name ?? card.kind,
      suit: card.suit ?? 'none',
      rank: formatCardRank(card.rank),
      category: card.category ?? presentation?.category ?? 'basic',
      description: presentation?.description,
      targetMode: hint?.targetMode ?? presentation?.targetMode,
      playable:
        prompt.type === 'play'
          ? playableCards.has(card.id)
          : prompt.type === 'respond' || prompt.type === 'lord_dispatch' || prompt.type === 'dying' || prompt.type === 'nullification' || prompt.type === 'choose_pindian_card' || prompt.type === 'fire_attack_reveal' || prompt.type === 'fire_attack_discard' || prompt.type === 'weapon_action' || prompt.type === 'standard_skill'
            ? responseCardIds.includes(card.id)
            : prompt.type === 'discard'
              ? prompt.cardIds.includes(card.id)
              : false,
      allowedTargetIds: hint?.targetIds,
      allowedTargetPairs: hint?.targetPairs,
    };
  };

  let normalizedPrompt: ActionPrompt | null = null;
  if (prompt.type === 'guhuo_challenge' && prompt.playerId === selfId) {
    const sourceName = displayNameById.get(prompt.sourceId) ?? '蛊惑来源';
    normalizedPrompt = {
      id: prompt.promptId,
      promptId: prompt.promptId,
      kind: 'guhuo-challenge',
      message: `${sourceName} 声明使用「${cardPresentation(prompt.declaredKind)?.name ?? prompt.declaredKind}」，是否质疑？`,
      optional: true,
      sourceId: prompt.sourceId,
      declaredKind: prompt.declaredKind,
      canChallenge: prompt.canChallenge,
    };
  } else if (prompt.type === 'choose_pindian_card' && prompt.playerId === selfId) {
    const opponentName = displayNameById.get(prompt.opponentId) ?? '拼点对手';
    normalizedPrompt = {
      id: prompt.promptId,
      promptId: prompt.promptId,
      kind: 'choose-pindian-card',
      message: `请选择一张手牌与 ${opponentName} 拼点。`,
      min: 1,
      max: 1,
      allowedCardIds: [...prompt.allowedCardIds],
      opponentId: prompt.opponentId,
      skillId: prompt.skillId,
    };
  } else if (prompt.type === 'fanjian_suit' && prompt.playerId === selfId) {
    const sourceName = displayNameById.get(prompt.sourceId) ?? '反间来源';
    const suitLabels = { spade: '黑桃 ♠', heart: '红桃 ♥', club: '梅花 ♣', diamond: '方块 ♦' } as const;
    normalizedPrompt = {
      id: prompt.promptId,
      kind: 'choose-fanjian-suit',
      message: `${sourceName} 对你发动了「反间」。请先声明一种花色；随后你会随机获得并公开其一张手牌，花色不同则受到其造成的 1 点伤害。`,
      suitChoices: prompt.suits.map((suit) => ({ value: suit, label: suitLabels[suit] })),
    };
  } else if (prompt.type === 'skill_choice' && prompt.playerId === selfId) {
    const skillCopy: Record<SkillChoiceId, { name: string; message: string }> = {
      luoyi: {
        name: '裸衣',
        message: '是否发动「裸衣」？少摸一张牌，本回合使用「杀」或「决斗」造成的伤害 +1。',
      },
      keji: {
        name: '克己',
        message: '本回合未使用或打出过「杀」，是否发动「克己」跳过弃牌阶段？',
      },
      yingzi: {
        name: '英姿',
        message: '是否发动「英姿」？本摸牌阶段改为摸三张牌。',
      },
      biyue: {
        name: '闭月',
        message: '是否在结束阶段发动「闭月」摸一张牌？结算后将进入下一名角色的回合。',
      },
      luoshen: {
        name: '洛神',
        message: (prompt.iteration ?? 0) > 0
          ? `已通过 ${prompt.iteration} 次黑色判定并获得对应牌，是否继续发动「洛神」？红色判定会自动结束流程。`
          : '是否在准备阶段发动「洛神」？黑色判定牌由你获得并可继续判定，红色判定会结束流程。',
      },
      jizhi: {
        name: '集智',
        message: '是否发动「集智」？在当前普通锦囊结算前摸一张牌。',
      },
      jilue: {
        name: '极略',
        message: '是否消耗一枚「忍」发动本次「极略」子技能？',
      },
      lianying: {
        name: '连营',
        message: '你失去了最后的手牌，是否发动「连营」摸一张牌？',
      },
      xiaoji: {
        name: '枭姬',
        message: '你失去了装备区里的牌，是否发动「枭姬」摸两张牌？',
      },
      buqu: {
        name: '不屈',
        message: '你即将进入濒死状态，是否发动「不屈」？亮出不屈牌且点数均不重复时可避免此次濒死。',
      },
      niepan: {
        name: '涅槃',
        message: '你正处于濒死状态，是否发动「涅槃」？你将弃置区域内的牌，复原状态并摸三张牌。',
      },
    };
    normalizedPrompt = {
      id: prompt.promptId ?? `skill-choice-${raw.turn.number}-${prompt.skillId}-${prompt.playerId}-${prompt.iteration ?? 0}`,
      kind: 'skill-choice',
      message: skillCopy[prompt.skillId].message,
      optional: prompt.canPass,
      skillId: prompt.skillId,
    };
  } else if (prompt.type === 'standard_skill' && prompt.playerId === selfId) {
    const stageMessages: Record<string, string> = {
      judgment_retrial: '是否发动「鬼才」？可选择一张手牌替换当前最终判定牌，原判定牌进入弃牌堆。',
      judgment_post: '是否发动「天妒」获得最终生效的判定牌？',
      guanxing_reorder: '请将全部观看牌以任意顺序分到牌堆顶或牌堆底。',
      tuxi_select: '是否发动「突袭」替代摸牌？可选择至多两名有手牌的其他角色，并各选择一张匿名手牌。',
      yiji_distribute: '请将本次「遗计」观看的牌逐张分配给任意存活角色（可以交给自己）。',
      fankui_select: '请选择伤害来源的一张手牌或装备牌，通过「反馈」获得。',
      ganglie_punish: '「刚烈」判定不为红桃：请选择弃置两张手牌；若不弃置，则受到 1 点伤害。',
      liuli_redirect: '可弃置一张手牌或装备牌发动「流离」，将此杀转移给你攻击范围内的合法新目标。',
      tianxiang_redirect: '可弃置一张服务器判定有效花色为红桃的手牌发动「天香」，将此伤害转移给一名合法的其他角色。',
      buqu_recovery: '请选择一张「不屈」伤牌移除。',
      huashen_initial: '请从两张私有化身牌中选择一张，并获得其中一项技能。',
      huashen_turn_start: '你可以在准备阶段更换展示的化身及获得的技能。',
      huashen_turn_end: '你可以在回合结束后更换展示的化身及获得的技能。',
      qinyin_choice: '请选择「琴音」的效果，或放弃发动。',
      lianpo_choice: '是否发动「连破」，在当前回合结束后获得一个额外回合？',
      wumou_choice: '「无谋」必须选择移去一枚暴怒标记，或失去 1 点体力。',
      benghuai_choice: '「崩坏」必须选择失去 1 点体力，或失去 1 点体力上限。',
      zhiji_choice: '「志继」觉醒：请选择回复 1 点体力，或摸两张牌。',
      yingyang_modify: '请选择是否将本次拼点点数增加或减少 3。',
      yinghun_select: '请选择「英魂」的目标与摸牌、弃牌方式。',
      yinghun_discard: '请一次性选择并弃置「英魂」要求的牌。',
      gongxin_choose: '请选择一张可处理的红桃手牌及其去向，或结束「攻心」。',
      qixing_initial: '请选择等量的起始手牌与星进行交换；也可以不交换直接确认。',
      qixing_exchange: '你可以选择等量的手牌与星进行交换，或放弃交换。',
      kuangfeng_choice: '请选择一张星和一名存活角色发动「狂风」，或不发动。',
      dawu_choice: '请选择等量且非空的星与存活角色发动「大雾」，或不发动。',
      shelie_select: '请选择花色各不相同的展示牌并获得。',
      shenfen_discard_hand: '请因「神愤」选择并弃置四张手牌。',
      guixin_select: '请选择从当前角色的手牌、装备区或判定区获得一张牌。',
      tiaoxin_response: '请选择一种合法的出杀方式响应「挑衅」，或拒绝响应。',
      tiaoxin_discard: '请选择被挑衅角色区域内的一张牌弃置。',
      luanwu_slash: '请选择一种合法的出杀方式及距离最近的目标；也可以失去 1 点体力。',
      fangquan_finish: '可弃置一张手牌并选择一名其他角色获得额外回合，或放弃。',
      qiaobian_skip: '可弃置一张手牌发动「巧变」跳过当前阶段，或不发动。',
      qiaobian_draw: '可从至多两名不同角色处各获得一张暗置手牌，或结束选择。',
      qiaobian_play: '可选择场上的一张装备牌或判定牌及其合法新持有者，或结束选择。',
      wuhun_target: '请选择一名梦魇标记最多的存活角色进行「武魂」判定。',
      haoshi_transfer: '请选择恰好一半手牌，交给一名手牌数最少的其他角色。',
      shensu_judgment_draw: '可跳过判定阶段和摸牌阶段，视为对一名合法目标使用「杀」。',
      shensu_play: '可弃置一张装备牌并跳过出牌阶段，视为对一名合法目标使用「杀」。',
      jieming_target: '请选择一名存活角色结算「节命」。',
      leiji_target: '请选择一名存活角色作为「雷击」的判定目标。',
      fangzhu_target: '请选择一名其他存活角色结算「放逐」。',
      jilue_fangzhu: '请选择一名其他存活角色结算「极略·放逐」。',
      guzheng_claim: '请选择一张本弃牌阶段弃置的牌返还，或不发动「固政」。',
      beige_cost: '可弃置一张牌发动「悲歌」，令当前伤害进行判定。',
      beige_source_discard: '请因「悲歌」选择并弃置要求数量的牌。',
      jushou_dispose: '请选择一张合法手牌完成「据守」的后续处理。',
      mengjin_discard: '可选择目标的一张手牌或装备牌发动「猛进」，或不发动。',
    };
    const invokeMessages: Partial<Record<StandardImplementedSkillId, string>> = {
      jianxiong: '是否发动「奸雄」，获得仍在处理区中的伤害实体牌？',
      tiandu: '是否发动「天妒」？',
      yiji: '是否发动本次「遗计」，观看牌堆顶两张牌并分配？',
      guicai: '是否发动「鬼才」？',
      fankui: '是否发动「反馈」，获得伤害来源的一张牌？',
      ganglie: '是否发动「刚烈」进行判定？若不为红桃，伤害来源须弃两张手牌或受到 1 点伤害。',
      tuxi: '是否发动「突袭」？',
      guanxing: '是否发动「观星」，观看并重排牌堆顶 X 张牌？',
      tieqi: '是否对当前杀的目标发动「铁骑」？红色判定将令其不能使用或打出闪。',
      liuli: '是否发动「流离」？',
      buqu: '是否发动「不屈」？',
      liegong: '是否发动「烈弓」？令当前目标不能使用「闪」响应此「杀」。',
      tianxiang: '是否发动「天香」？',
    };
    normalizedPrompt = {
      id: prompt.promptId,
      kind: 'standard-skill',
      message: prompt.stage === 'invoke'
        ? invokeMessages[prompt.skillId] ?? `是否发动「${generalSkillNames[prompt.skillId]}」？`
        : stageMessages[prompt.stage] ?? `请处理「${generalSkillNames[prompt.skillId]}」。`,
      optional: prompt.canPass,
      min: prompt.minCards,
      max: prompt.maxCards,
      minTargets: prompt.minTargets,
      maxTargets: prompt.maxTargets,
      allowedCardIds: [...prompt.allowedCardIds],
      allowedTargetIds: [...prompt.targetIds],
      cardChoices: prompt.cards.map(mapCard),
      options: prompt.options ? [...prompt.options] : undefined,
      skillId: prompt.skillId,
      standardStage: prompt.stage,
      cardTargetIds: prompt.cardTargetIds
        ? Object.fromEntries(Object.entries(prompt.cardTargetIds).map(([cardId, ids]) => [cardId, [...ids]]))
        : undefined,
      zoneChoices: prompt.choices?.map((choice, index) => ({
        token: choice.token,
        ownerId: choice.ownerId,
        zone: choice.zone,
        label: choice.card
          ? `${displayNameById.get(choice.ownerId) ?? '角色'} · ${choice.zone === 'hand' ? '手牌' : choice.zone === 'equipment' ? '装备区' : '判定区'} · ${choice.card.name ?? cardPresentation(choice.card.kind)?.name ?? choice.card.kind}`
          : `${displayNameById.get(choice.ownerId) ?? '角色'} · 手牌 ${index + 1}（暗牌）`,
      })),
    };
  } else if (prompt.type === 'armor' && prompt.playerId === selfId) {
    const requiredCount = prompt.requiredCount ?? 1;
    const respondedCount = prompt.respondedCount ?? 0;
    const progress = requiredCount > 1 ? `（第 ${respondedCount + 1}/${requiredCount} 张闪）` : '';
    normalizedPrompt = {
      id: `armor-${raw.turn.number}-${prompt.playerId}-${respondedCount}-of-${requiredCount}`,
      kind: 'activate-armor',
      message: `是否发动「八卦阵」进行判定${progress}？红色判定牌视为打出一张「闪」。`,
      optional: prompt.canPass,
      requiredCount,
      respondedCount,
    };
  } else if (prompt.type === 'nullification' && prompt.playerId === selfId) {
    const targetName = displayNameById.get(prompt.effectTargetId) ?? '当前目标';
    normalizedPrompt = {
      id: `nullification-${raw.turn.number}-${prompt.cardKind}-${prompt.playerId}`,
      kind: 'respond-nullification',
      message: `是否对影响 ${targetName} 的「${cardPresentation(prompt.cardKind)?.name ?? prompt.cardKind}」使用「无懈可击」？`,
      optional: true,
      min: 0,
      max: 1,
      responseKind: 'nullification',
      allowedCardIds: responseCardIds,
      kanpoCardIds: [...(prompt.kanpoCardIds ?? [])],
      longhunCardGroups: prompt.longhunCardGroups?.map((cardIds) => [...cardIds]),
    };
  } else if (prompt.type === 'respond' && prompt.playerId === selfId) {
    const responseKind = prompt.responseKind ?? 'dodge';
    const contextId = prompt.context ?? prompt.attackerId ?? 'card';
    const requiredCount = prompt.requiredCount ?? 1;
    const respondedCount = prompt.respondedCount ?? 0;
    normalizedPrompt = {
      id: `respond-${raw.turn.number}-${contextId}-${prompt.playerId}-${respondedCount}-of-${requiredCount}`,
      kind: responseKind === 'slash' ? 'respond-slash' : 'respond-dodge',
      message: responsePromptMessage(prompt),
      optional: true,
      min: 0,
      max: 1,
      responseKind,
      allowedCardIds: responseCardIds,
      zhangBaAllowedCardIds: prompt.zhangBaCardIds,
      requiredCount,
      respondedCount,
      skillResponses: (prompt.skillResponses ?? []).map((skill) => ({
        ...skill,
        cardIds: [...skill.cardIds],
        cardGroups: skill.cardGroups?.map((cardIds) => [...cardIds]),
      })),
      lordSkills: [...(prompt.lordSkills ?? [])],
    };
  } else if (prompt.type === 'lord_dispatch' && prompt.playerId === selfId) {
    const requesterName = displayNameById.get(prompt.requesterId) ?? '请求者';
    const skillName = prompt.skillId === 'hujia' ? '护驾' : '激将';
    const cardName = prompt.responseKind === 'dodge' ? '闪' : '杀';
    normalizedPrompt = {
      id: prompt.promptId,
      kind: 'lord-dispatch',
      message: `${requesterName} 发动「${skillName}」，请打出一张实体「${cardName}」代其${prompt.method === 'use' ? '使用' : '响应'}，或选择不响应。`,
      optional: true,
      min: 0,
      max: 1,
      responseKind: prompt.responseKind,
      allowedCardIds: [...prompt.allowedCardIds],
      lordSkillId: prompt.skillId,
      requesterId: prompt.requesterId,
    };
  } else if (prompt.type === 'dying' && prompt.playerId === selfId) {
    const victimName = displayNameById.get(prompt.victimId) ?? '濒死角色';
    normalizedPrompt = {
      id: `dying-${raw.turn.number}-${prompt.victimId}-${prompt.playerId}`,
      kind: 'respond-peach',
      message: prompt.playerId === prompt.victimId
        ? '你正处于濒死状态，请使用「桃」或「酒」自救，也可以放弃。'
        : `${victimName} 正处于濒死状态，请使用一张「桃」救援，也可以放弃。`,
      optional: true,
      min: 0,
      max: 1,
      allowedCardIds: responseCardIds,
      skillResponses: (prompt.skillResponses ?? []).map((skill) => ({
        ...skill,
        cardIds: [...skill.cardIds],
        cardGroups: skill.cardGroups?.map((cardIds) => [...cardIds]),
      })),
    };
  } else if (prompt.type === 'zone_selection' && prompt.playerId === selfId) {
    const victimName = displayNameById.get(prompt.victimId) ?? '目标角色';
    normalizedPrompt = {
      id: `zone-selection-${raw.turn.number}-${prompt.victimId}-${prompt.mode}`,
      kind: 'choose-zone-card',
      message: `请选择${victimName}区域内的一张牌${prompt.mode === 'gain' ? '获得' : '弃置'}。手牌为匿名暗牌。`,
      zoneChoices: prompt.choices.map((choice, index) => ({
        token: choice.token,
        zone: choice.zone,
        label: choice.card
          ? `${choice.zone === 'equipment' ? '装备区' : '判定区'} · ${choice.card.name ?? cardPresentation(choice.card.kind)?.name ?? choice.card.kind}`
          : `手牌 ${index + 1}（暗牌）`,
      })),
    };
  } else if (prompt.type === 'fire_attack_reveal' && prompt.playerId === selfId) {
    normalizedPrompt = {
      id: `fire-attack-reveal-${raw.turn.number}-${prompt.playerId}`,
      kind: 'fire-attack-reveal',
      message: '火攻生效：请选择并展示一张手牌。',
      min: 1,
      max: 1,
      allowedCardIds: prompt.allowedCardIds,
    };
  } else if (prompt.type === 'fire_attack_discard' && prompt.playerId === selfId) {
    normalizedPrompt = {
      id: `fire-attack-discard-${raw.turn.number}-${prompt.playerId}-${prompt.revealedCard.id}`,
      kind: 'fire-attack-discard',
      message: `目标展示了${prompt.revealedCard.name ?? cardPresentation(prompt.revealedCard.kind)?.name ?? prompt.revealedCard.kind}，可弃置一张同花色手牌造成 1 点火焰伤害，或放弃。`,
      min: 0,
      max: 1,
      optional: prompt.canPass,
      allowedCardIds: prompt.allowedCardIds,
    };
  } else if (prompt.type === 'amazing_grace_selection' && prompt.playerId === selfId) {
    normalizedPrompt = {
      id: `amazing-grace-${raw.turn.number}-${prompt.playerId}-${prompt.cards.map((card) => card.id).join('-')}`,
      kind: 'amazing-grace-selection',
      message: '五谷丰登生效：请选择一张亮出的牌获得。',
      min: 1,
      max: 1,
      cardChoices: prompt.cards.map(mapCard),
    };
  } else if (prompt.type === 'weapon_action' && prompt.playerId === selfId) {
    const victimName = displayNameById.get(prompt.victimId) ?? '目标角色';
    const weaponName = cardPresentation(prompt.weaponKind)?.name ?? prompt.weaponKind;
    const messages: Record<string, string> = {
      zhuque_convert: `是否发动「${weaponName}」，将此普通杀改为火杀？`,
      cixiong_activate: `是否对 ${victimName} 发动「${weaponName}」？`,
      cixiong_choice: `请选择弃置一张手牌；若不弃置，攻击者摸一张牌。`,
      guanshi_force_hit: `可弃置两张牌发动「${weaponName}」，令被闪抵消的杀强制命中。`,
      qinglong_followup: `可选择另一张杀发动「${weaponName}」，继续攻击 ${victimName}。`,
      hanbing_prevent: `是否发动「${weaponName}」，防止伤害并改为弃置 ${victimName} 至多两张牌？`,
      hanbing_select: prompt.canPass
        ? `可继续选择 ${victimName} 的一张手牌或装备弃置，也可结束选择。`
        : `请选择 ${victimName} 的一张手牌或装备弃置；发动后至少弃置一张。`,
      qilin_discard_horse: `是否发动「${weaponName}」，弃置 ${victimName} 的一匹坐骑？`,
    };
    normalizedPrompt = {
      id: prompt.promptId ?? `weapon-${raw.turn.number}-${prompt.stage}-${prompt.playerId}-${prompt.victimId}`,
      promptId: prompt.promptId,
      kind: 'weapon-action',
      weaponStage: prompt.stage,
      message: messages[prompt.stage] ?? `是否发动「${weaponName}」？`,
      min: prompt.minCards,
      max: prompt.maxCards,
      optional: prompt.canPass,
      allowedCardIds: prompt.allowedCardIds,
      zoneChoices: prompt.choices?.map((choice, index) => ({
        token: choice.token,
        zone: choice.zone,
        label: choice.card
          ? `${choice.zone === 'equipment' ? '装备区' : '手牌'} · ${choice.card.name ?? cardPresentation(choice.card.kind)?.name ?? choice.card.kind}`
          : `手牌 ${index + 1}（暗牌）`,
      })),
    };
  } else if (prompt.type === 'discard' && prompt.playerId === selfId) {
    normalizedPrompt = {
      id: `discard-${raw.turn.number}-${prompt.playerId}`,
      kind: 'discard',
      message: `请弃置 ${prompt.count} 张手牌。`,
      min: prompt.count,
      max: prompt.count,
      allowedCardIds: prompt.cardIds,
    };
  }

  return {
    roomId,
    revision: raw.revision,
    actionPromptId: raw.actionPromptId,
    status: raw.status,
    round: raw.turn.number,
    phase: raw.turn.phase,
    turnPlayerId: raw.currentPlayerId,
    actingPlayerId: prompt.type !== 'waiting' && 'playerId' in prompt
      ? prompt.playerId
      : raw.pendingResponse?.targetId ?? raw.currentPlayerId,
    selfPlayerId: selfId,
    canAct: prompt.type === 'play' && prompt.playerId === selfId,
    players: raw.players.map((player) => {
      const member = memberFor(player);
      return {
        id: player.id,
        userId: player.id,
        displayName: member?.displayName ?? `玩家 ${player.seat + 1}`,
        seat: player.seat,
        general: player.general?.name,
        faction: player.general ? factionNames[player.general.faction] : undefined,
        gender: player.general?.gender,
        identity: player.role ? roleNames[player.role] : undefined,
        hp: player.hp,
        maxHp: player.maxHp,
        handCount: player.handCount,
        alive: player.alive,
        faceUp: player.faceUp ?? true,
        online: member?.online ?? true,
        isSelf: player.id === selfId,
        isCurrent: player.id === raw.currentPlayerId,
        equipment: (player.equipment ?? []).map((card) => ({
          ...mapCard(card),
            slot: ['zhu_ge_lian_nu', 'gu_ding_dao', 'qing_gang_jian', 'ci_xiong_shuang_gu_jian', 'han_bing_jian', 'qing_long_yan_yue_dao', 'zhang_ba_she_mao', 'guan_shi_fu', 'fang_tian_hua_ji', 'zhu_que_yu_shan', 'qi_lin_gong'].includes(card.kind)
              ? '武器'
              : ['ren_wang_dun', 'teng_jia', 'bai_yin_shi_zi', 'ba_gua_zhen'].includes(card.kind)
              ? '防具'
              : ['chi_tu', 'da_wan', 'zi_xing'].includes(card.kind) ? '进攻坐骑' : '防御坐骑',
        })),
        judgment: (player.judgment ?? []).map((card) => ({
          ...mapCard(card),
          slot: '判定区',
        })),
        publicPiles: player.publicPiles
          ? Object.fromEntries(Object.entries(player.publicPiles).map(([pileId, cards]) => [pileId, cards.map(mapCard)]))
          : undefined,
        publicPileCounts: player.publicPileCounts ? { ...player.publicPileCounts } : undefined,
        privatePiles: player.privatePiles
          ? Object.fromEntries(Object.entries(player.privatePiles).map(([pileId, cards]) => [pileId, cards.map(mapCard)]))
          : undefined,
        publicMarks: player.publicMarks ? { ...player.publicMarks } : undefined,
        publicEffects: player.publicEffects?.map((effect) => ({ ...effect })),
        chained: player.chained ?? false,
        effectiveSkillIds: [...(player.effectiveSkillIds ?? [])],
        effectiveSkills: (player.effectiveSkills ?? (player.effectiveSkillIds ?? []).map((id) => ({
          id,
          name: generalSkillNames[id] ?? id,
          description: activeSkillDescriptions[id] ?? '暂无技能说明。',
        }))).map((skill) => ({ ...skill })),
      };
    }),
    hand: (selfRaw?.hand ?? []).map(mapCard),
    zhangBaSlash: prompt.type === 'play' && prompt.zhangBaSlash
      ? {
          allowedCardIds: [...prompt.zhangBaSlash.allowedCardIds],
          targetIds: [...prompt.zhangBaSlash.targetIds],
          maxTargets: prompt.zhangBaSlash.maxTargets,
        }
      : null,
    skills: playableSkills,
    publicCards: (raw.publicCards ?? []).map(mapCard),
    logs: raw.logs.map((log) => ({
      id: String(log.id),
      text: readableLog(log.message),
      tone: log.type === 'damage' || log.type === 'death' ? 'damage' : log.type === 'victory' ? 'important' : 'normal',
    })),
    prompt: normalizedPrompt,
    winner: raw.winner ? winnerNames[raw.winner.side] : undefined,
  };
}

export function normalizeRoomSummary(room: Partial<RoomSummary> & Record<string, unknown>): RoomSummary {
  const members = Array.isArray(room.members) ? room.members : [];
  const host = members.find((member) => Boolean((member as Record<string, unknown>).isHost)) as
    | Record<string, unknown>
    | undefined;
  return {
    id: String(room.id ?? ''),
    name: String(room.name ?? '未命名房间'),
    gameType: room.gameType === 'gouji' || room.gameType === 'doudizhu' ? room.gameType : 'sanguosha',
    status: (room.status as RoomStatus | undefined) ?? 'waiting',
    hostId: String(room.hostId ?? room.ownerId ?? host?.userId ?? ''),
    hostName: String(room.hostName ?? room.ownerName ?? host?.displayName ?? ''),
    playerCount: Number(room.playerCount ?? members.length ?? 0),
    maxPlayers: Number(room.maxPlayers ?? 8),
    createdAt: typeof room.createdAt === 'string' ? room.createdAt : undefined,
  };
}

export function normalizeRoomDetail(room: Partial<RoomDetail> & Record<string, unknown>): RoomDetail {
  const summary = normalizeRoomSummary(room);
  const rawBotIntelligence = Number(room.botIntelligence ?? 3);
  const botIntelligence = Number.isInteger(rawBotIntelligence) && rawBotIntelligence >= 1 && rawBotIntelligence <= 7
    ? rawBotIntelligence as BotIntelligence
    : 3;
  const rawMembers = Array.isArray(room.members)
    ? room.members
    : Array.isArray(room.players)
      ? room.players
      : [];
  const members = rawMembers.map((raw, index) => {
    const member = raw as Record<string, unknown>;
    return {
      userId: String(member.userId ?? member.id ?? ''),
      username: String(member.username ?? ''),
      displayName: String(member.displayName ?? member.name ?? member.username ?? `玩家${index + 1}`),
      ...(typeof member.botTitle === 'string' ? { botTitle: member.botTitle } : {}),
      seat: Number(member.seat ?? index),
      ready: Boolean(member.ready),
      online: (member.online ?? member.connected) !== false,
      isHost: Boolean(member.isHost ?? String(member.userId ?? member.id ?? '') === summary.hostId),
      isBot: Boolean(member.isBot),
    };
  });
  const ruleConfig = room.ruleConfig ? {
    ruleSetVersion: room.ruleConfig.ruleSetVersion,
    enabledGeneralPacks: [...room.ruleConfig.enabledGeneralPacks],
    generalSelection: { ...room.ruleConfig.generalSelection },
    deckProfile: room.ruleConfig.deckProfile,
    maximumReshuffles: room.ruleConfig.maximumReshuffles,
    lordBonusMinimumPlayers: room.ruleConfig.lordBonusMinimumPlayers,
    godFactionChoice: room.ruleConfig.godFactionChoice,
  } satisfies RoomRuleConfig : undefined;
  const chatMessages = Array.isArray(room.chatMessages)
    ? room.chatMessages.flatMap((raw) => {
        if (!raw || typeof raw !== 'object') return [];
        const message = raw as unknown as Record<string, unknown>;
        if (
          typeof message.id !== 'string' ||
          typeof message.senderId !== 'string' ||
          typeof message.senderName !== 'string' ||
          typeof message.text !== 'string' ||
          typeof message.sentAt !== 'string'
        ) return [];
        return [{
          id: message.id,
          senderId: message.senderId,
          senderName: message.senderName,
          text: message.text,
          sentAt: message.sentAt,
        }];
      }).slice(-100)
    : [];
  const draft = room.draft ? {
    stage: room.draft.stage,
    currentPlayerId: room.draft.currentPlayerId ?? null,
    playerIds: [...room.draft.playerIds],
    candidates: [...room.draft.candidates],
    candidateDetails: room.draft.candidateDetails?.map((general) => ({
      ...general,
      skills: general.skills.map((skill) => ({ ...skill })),
    })),
    players: room.draft.players.map((player) => ({
      playerId: player.playerId,
      role: player.role ?? null,
      selected: player.selected,
      generalId: player.generalId,
      needsFaction: player.needsFaction,
      faction: player.faction,
    })),
  } satisfies GeneralDraftView : undefined;
  return {
    ...summary,
    members,
    playerCount: members.length,
    botIntelligence,
    chatMessages,
    ...(ruleConfig ? { ruleConfig } : {}),
    ...(draft ? { draft } : {}),
  };
}
