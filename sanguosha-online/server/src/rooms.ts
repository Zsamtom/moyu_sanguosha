import { EventEmitter } from "node:events";
import { randomBytes, randomUUID } from "node:crypto";
import {
  DEFAULT_COMPLETE_RULE_CONFIG,
  DOUDIZHU_INITIAL_BEANS,
  DOUDIZHU_BOT_INTELLIGENCE_NAMES,
  GOUJI_BOT_INTELLIGENCE_NAMES,
  applyDoudizhuAction,
  applyAction,
  assertGeneralDraftForConfig,
  autoChooseGeneral,
  chooseGeneral as chooseDraftGeneral,
  chooseGodFaction as chooseDraftGodFaction,
  cloneGeneralDraft,
  chooseGoujiBotAction,
  chooseDoudizhuBotAction,
  createDoudizhuGame,
  createGameFromDraft,
  createGeneralDraft,
  createGoujiGame,
  forfeitPlayer,
  forfeitDoudizhuPlayer,
  forfeitGoujiPlayer,
  getDoudizhuGameView,
  getGoujiGameView,
  getGeneralDraftView,
  getGameView,
  applyGoujiAction,
  validateRoomRuleConfig,
  type FullGeneralId,
  type DoudizhuAction,
  type DoudizhuGameState,
  type DoudizhuGameView,
  type DigitBombAction,
  type DigitBombGameState,
  type DigitBombGameView,
  type NumberConnectAction,
  type NumberConnectGameState,
  type NumberConnectGameView,
  type GameAction,
  type GameSession,
  type GameView,
  type GoujiAction,
  type GoujiGameState,
  type GoujiGameView,
  type GeneralDraftState,
  type GeneralDraftView,
  type PlayableFaction,
  type RoomRuleConfig,
  type SplendorAction,
  type SplendorGameState,
  type SplendorGameView,
} from "@sanguosha/shared";
import { HttpError } from "./errors.js";
import {
  applyAdapterAction,
  chooseAdapterBotAction,
  createAdapterGame,
  forfeitAdapterPlayer,
  gameTypeMetadata,
  getAdapterGameView,
  isAdapterGame,
  isAdapterGameType,
  isDigitBombAction,
  isDigitBombGame,
  isNumberConnectAction,
  isNumberConnectGame,
  isSplendorAction,
  isSplendorGame,
  isSplendorGameType,
  type GameType,
} from "./game-adapters.js";
import {
  DEFAULT_BOT_INTELLIGENCE,
  chooseBotTarget,
  type BotIntelligence,
} from "./bot-intelligence.js";
import {
  BotDecisionRegistry,
  botDecisionFailureReason,
  type BotDecisionFailureReason,
} from "./bots/decision-registry.js";
import {
  EMPTY_DOUDIZHU_LLM_USAGE,
  createDoudizhuDecision,
  type DoudizhuLlmUsage,
} from "./bots/doudizhu-llm.js";
import { createSanguoshaDecision } from "./bots/sanguosha-llm.js";
import type { PublicUser } from "./users.js";

export type RoomStatus = "waiting" | "drafting" | "playing" | "finished";
export type { GameType } from "./game-adapters.js";
export type BotMode = "rules" | "llm";

export const DEFAULT_SERVER_ROOM_RULE_CONFIG: Readonly<RoomRuleConfig> = Object.freeze({
  ...DEFAULT_COMPLETE_RULE_CONFIG,
  enabledGeneralPacks: Object.freeze(["standard", "sp"] as const),
  generalSelection: Object.freeze({
    mode: "random",
    candidatesPerPlayer: 1,
    allowDuplicateGenerals: false,
  }),
});

export interface RoomPlayerView {
  id: string;
  username: string;
  displayName: string;
  botTitle?: string;
  ready: boolean;
  connected: boolean;
  seat: number;
  isBot?: boolean;
}

export interface RoomChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  sentAt: string;
}

export interface RoomSummary {
  id: string;
  name: string;
  gameType: GameType;
  ownerId: string;
  ownerName: string;
  status: RoomStatus;
  playerCount: number;
  maxPlayers: number;
  createdAt: string;
}

export interface RoomView extends RoomSummary {
  players: RoomPlayerView[];
  ruleConfig: RoomRuleConfig;
  botIntelligence: BotIntelligence;
  botMode: BotMode;
  /** Present only for Digit Bomb rooms. */
  digitBombDigits?: number;
  llmBot: {
    available: boolean;
    thinkingPlayerId: string | null;
    usage: DoudizhuLlmUsage;
  };
  chatMessages: RoomChatMessage[];
  /** Present only in the requesting member's private room view. */
  draft?: GeneralDraftView;
}

interface RoomPlayer extends RoomPlayerView {
  /** Retained only so a started game's immutable seat roster can be restored. */
  departed: boolean;
}

export interface DoudizhuLlmRecommendation {
  readonly action: DoudizhuAction;
  readonly source: "llm" | "rules";
  readonly fallbackReason?: BotDecisionFailureReason;
}

interface Room {
  id: string;
  name: string;
  gameType: GameType;
  ownerId: string;
  status: RoomStatus;
  maxPlayers: number;
  createdAt: string;
  players: RoomPlayer[];
  ruleConfig: RoomRuleConfig;
  botIntelligence: BotIntelligence;
  botMode: BotMode;
  digitBombDigits?: number;
  doudizhuLlmUsage: DoudizhuLlmUsage;
  chatMessages: RoomChatMessage[];
  draft?: GeneralDraftState;
  game?:
    | GameSession
    | GoujiGameState
    | DoudizhuGameState
    | SplendorGameState
    | DigitBombGameState
    | NumberConnectGameState;
}

const GOUJI_BOT_NICKNAMES = [
  "皮的猫",
  "半杯乌龙",
  "慢半拍",
  "晚风不迟",
  "纸飞机",
  "云端漫步",
  "橘子汽水",
  "周末晴天",
  "白噪音",
  "小岛来信",
  "正在加载",
  "深夜电台",
  "山间微风",
  "一页书签",
  "北窗",
] as const;

const DOUDIZHU_BOT_NICKNAMES = [
  "晚风有信",
  "山茶来信",
  "橘子汽水",
  "一页旧书",
  "北窗听雨",
  "半杯乌龙",
  "纸飞机",
  "小岛来信",
  "云端漫步",
  "周末晴天",
  "深夜电台",
  "白噪音",
  "正在加载",
  "路过人间",
  "慢半拍",
  "海盐柠檬",
  "今天早睡",
  "匿名牌友",
] as const;

function doudizhuBotNickname(room: Room, entropy: string): string {
  const start = Number.parseInt(entropy.slice(0, 8), 16) % DOUDIZHU_BOT_NICKNAMES.length;
  for (let offset = 0; offset < DOUDIZHU_BOT_NICKNAMES.length; offset += 1) {
    const candidate = DOUDIZHU_BOT_NICKNAMES[(start + offset) % DOUDIZHU_BOT_NICKNAMES.length]!;
    if (!room.players.some((player) => player.displayName === candidate)) return candidate;
  }
  return `匿名牌友${room.players.filter((player) => player.isBot).length + 1}`;
}

function goujiBotNickname(room: Room, entropy: string): string {
  const start = Number.parseInt(entropy.slice(0, 8), 16) % GOUJI_BOT_NICKNAMES.length;
  for (let offset = 0; offset < GOUJI_BOT_NICKNAMES.length; offset += 1) {
    const candidate = GOUJI_BOT_NICKNAMES[(start + offset) % GOUJI_BOT_NICKNAMES.length]!;
    if (!room.players.some((player) => player.displayName === candidate)) return candidate;
  }
  return `匿名牌友${room.players.filter((player) => player.isBot).length + 1}`;
}

export interface RoomServiceSnapshot {
  readonly version: 1;
  readonly rooms: Array<{
    id: string;
    name: string;
    gameType?: GameType;
    ownerId: string;
    status: RoomStatus;
    maxPlayers: number;
    createdAt: string;
    players: Array<RoomPlayerView & { departed?: boolean }>;
    ruleConfig: RoomRuleConfig;
    botIntelligence?: BotIntelligence;
    botMode?: BotMode;
    digitBombDigits?: number;
    doudizhuLlmUsage?: DoudizhuLlmUsage;
    chatMessages?: RoomChatMessage[];
    draft?: GeneralDraftState;
    game?:
      | GameSession
      | GoujiGameState
      | DoudizhuGameState
      | SplendorGameState
      | DigitBombGameState
      | NumberConnectGameState;
  }>;
}

export interface CreateRoomInput {
  name: string;
  gameType?: GameType;
  maxPlayers?: number;
  ruleConfig?: RoomRuleConfig;
  botIntelligence?: BotIntelligence;
  botMode?: BotMode;
  digitBombDigits?: number;
}

function cloneRuleConfig(config: RoomRuleConfig): RoomRuleConfig {
  const clone = structuredClone(config);
  validateRoomRuleConfig(clone);
  return clone;
}

type AuthorityGame =
  | GameSession
  | GoujiGameState
  | DoudizhuGameState
  | SplendorGameState
  | DigitBombGameState
  | NumberConnectGameState;
type AuthorityAction =
  | GameAction
  | GoujiAction
  | DoudizhuAction
  | SplendorAction
  | DigitBombAction
  | NumberConnectAction;
type AuthorityGameView =
  | GameView
  | GoujiGameView
  | DoudizhuGameView
  | SplendorGameView
  | DigitBombGameView
  | NumberConnectGameView;

function isGoujiGame(game: AuthorityGame): game is GoujiGameState {
  return "kind" in game && game.kind === "gouji";
}

function isDoudizhuGame(game: AuthorityGame): game is DoudizhuGameState {
  return "kind" in game && game.kind === "doudizhu";
}

function isGoujiAction(action: AuthorityAction): action is GoujiAction {
  return action.type.startsWith("gouji_");
}

function isDoudizhuAction(action: AuthorityAction): action is DoudizhuAction {
  return action.type.startsWith("doudizhu_");
}

export class RoomService {
  private readonly rooms = new Map<string, Room>();
  private readonly roomByUser = new Map<string, string>();
  private readonly connectedUsers = new Set<string>();
  private readonly disconnectTimers = new Map<string, NodeJS.Timeout>();
  private readonly botRuns = new Set<string>();
  private readonly botContinuations = new Map<string, NodeJS.Timeout>();
  private readonly llmBotRuns = new Map<string, { revision: number; playerId: string }>();
  private readonly llmRecommendationRuns = new Map<
    string,
    { revision: number; playerId: string }
  >();
  private readonly lastChatAtByUser = new Map<string, number>();
  private readonly events = new EventEmitter();
  private snapshotPersistence?: (snapshot: RoomServiceSnapshot) => Promise<void>;
  private persistenceBarrier: Promise<void> = Promise.resolve();

  constructor(
    private readonly disconnectGraceMs = 90_000,
    private readonly botBatchSize = 200,
    private readonly botActionDelayMs = 0,
    private readonly doudizhuBotDelayRangeMs: readonly [number, number] = [1_000, 5_000],
    private readonly botDecisions = new BotDecisionRegistry(),
  ) {
    if (!Number.isSafeInteger(botBatchSize) || botBatchSize < 1) {
      throw new Error("botBatchSize must be a positive safe integer");
    }
    if (!Number.isSafeInteger(botActionDelayMs) || botActionDelayMs < 0) {
      throw new Error("botActionDelayMs must be a non-negative safe integer");
    }
    const [minimumDoudizhuDelay, maximumDoudizhuDelay] = doudizhuBotDelayRangeMs;
    if (
      !Number.isSafeInteger(minimumDoudizhuDelay) ||
      !Number.isSafeInteger(maximumDoudizhuDelay) ||
      minimumDoudizhuDelay < 0 ||
      maximumDoudizhuDelay < minimumDoudizhuDelay
    ) {
      throw new Error("doudizhuBotDelayRangeMs must be an ordered pair of non-negative safe integers");
    }
  }

  onChanged(listener: () => void): () => void {
    this.events.on("changed", listener);
    return () => this.events.off("changed", listener);
  }

  setSnapshotPersistence(persist: (snapshot: RoomServiceSnapshot) => Promise<void>): void {
    this.snapshotPersistence = persist;
  }

  async waitForPersistence(): Promise<void> {
    while (true) {
      const barrier = this.persistenceBarrier;
      try {
        await barrier;
      } catch (error) {
        if (barrier === this.persistenceBarrier) throw error;
        continue;
      }
      if (barrier === this.persistenceBarrier) return;
    }
  }

  exportSnapshot(): RoomServiceSnapshot {
    return {
      version: 1,
      rooms: [...this.rooms.values()].map((room) => structuredClone(room)),
    };
  }

  restoreSnapshot(snapshot: RoomServiceSnapshot): void {
    if (snapshot.version !== 1) throw new Error(`Unsupported room snapshot version: ${snapshot.version}`);
    for (const timer of this.disconnectTimers.values()) clearTimeout(timer);
    this.disconnectTimers.clear();
    for (const timer of this.botContinuations.values()) clearTimeout(timer);
    this.botContinuations.clear();
    this.botRuns.clear();
    this.llmBotRuns.clear();
    this.lastChatAtByUser.clear();
    this.connectedUsers.clear();
    this.rooms.clear();
    this.roomByUser.clear();

    for (const saved of snapshot.rooms) {
      if (saved.players.every((player) => player.isBot || player.departed)) continue;
      if (this.rooms.has(saved.id)) throw new Error(`Duplicate room in snapshot: ${saved.id}`);
      if (!saved.players.some((player) => player.id === saved.ownerId && !player.departed)) {
        throw new Error(`Room ${saved.id} owner is not a member`);
      }
      if (saved.status === "playing" && !saved.game) {
        throw new Error(`Playing room ${saved.id} has no game state`);
      }
      if (saved.status === "drafting" && (!saved.draft || saved.game)) {
        throw new Error(`Drafting room ${saved.id} has inconsistent draft state`);
      }
      if (saved.status !== "drafting" && saved.draft) {
        throw new Error(`Non-drafting room ${saved.id} retains a draft`);
      }
      const room = structuredClone(saved) as Room;
      room.gameType = saved.gameType ?? "sanguosha";
      if (
        !gameTypeMetadata(room.gameType).supportsRuleBots &&
        room.players.some((player) => player.isBot && !player.departed)
      ) {
        throw new Error(`Room ${saved.id} contains a bot unsupported by ${room.gameType}`);
      }
      room.botIntelligence = saved.botIntelligence ?? DEFAULT_BOT_INTELLIGENCE;
      room.botMode = gameTypeMetadata(room.gameType).supportsLlmBots
        ? saved.botMode ?? "rules"
        : "rules";
      room.digitBombDigits = room.gameType === "digit_bomb"
        ? saved.digitBombDigits ?? 4
        : undefined;
      if (
        room.gameType === "digit_bomb" &&
        (!Number.isSafeInteger(room.digitBombDigits) ||
          room.digitBombDigits! < 1 ||
          room.digitBombDigits! > 8)
      ) {
        throw new Error(`Room ${saved.id} has invalid Digit Bomb digits`);
      }
      room.doudizhuLlmUsage = {
        ...EMPTY_DOUDIZHU_LLM_USAGE,
        ...saved.doudizhuLlmUsage,
      };
      room.chatMessages = (saved.chatMessages ?? []).slice(-100);
      room.ruleConfig = cloneRuleConfig(
        saved.ruleConfig ?? DEFAULT_SERVER_ROOM_RULE_CONFIG,
      );
      room.players.forEach((player, seat) => {
        player.isBot ??= false;
        player.departed ??= false;
        if (player.isBot && room.gameType !== "sanguosha") {
          player.botTitle ??= room.gameType === "gouji"
            ? GOUJI_BOT_INTELLIGENCE_NAMES[room.botIntelligence]
            : room.gameType === "doudizhu"
              ? DOUDIZHU_BOT_INTELLIGENCE_NAMES[room.botIntelligence]
              : room.gameType === "digit_bomb"
                ? "拆弹专家"
                : "宝石行家";
        }
        if (!player.isBot && !player.departed && this.roomByUser.has(player.id)) {
          throw new Error(`User ${player.id} appears in multiple restored rooms`);
        }
        player.seat = seat;
        player.connected = Boolean(player.isBot && !player.departed);
        if (!player.isBot && !player.departed) this.roomByUser.set(player.id, room.id);
      });
      if (room.status === "drafting") {
        if (room.gameType !== "sanguosha") {
          throw new Error(`Non-Sanguosha room ${saved.id} cannot be in a general draft`);
        }
        const draftPlayerIds = room.players.filter((player) => !player.departed).map((player) => player.id);
        if (room.players.some((player) => player.departed) ||
            room.draft!.playerIds.length !== draftPlayerIds.length ||
            room.draft!.playerIds.some((playerId, index) => playerId !== draftPlayerIds[index])) {
          throw new Error(`Drafting room ${saved.id} roster does not match its draft`);
        }
        assertGeneralDraftForConfig(room.draft!, room.ruleConfig);
        this.commitDraft(room, cloneGeneralDraft(room.draft!));
      }
      if (room.game) {
        const matches = room.gameType === "gouji"
          ? isGoujiGame(room.game)
          : room.gameType === "doudizhu"
            ? isDoudizhuGame(room.game)
            : isSplendorGameType(room.gameType)
              ? isSplendorGame(room.game) && room.game.kind === room.gameType
              : room.gameType === "digit_bomb"
                ? isDigitBombGame(room.game)
                : room.gameType === "number_connect"
                  ? isNumberConnectGame(room.game)
              : !isGoujiGame(room.game) &&
                !isDoudizhuGame(room.game) &&
                !isAdapterGame(room.game);
        if (!matches) throw new Error(`Room ${saved.id} game type does not match its game state`);
        if (
          isDigitBombGame(room.game) &&
          room.game.digits !== room.digitBombDigits
        ) {
          throw new Error(`Room ${saved.id} Digit Bomb digits do not match its game state`);
        }
      }
      this.rooms.set(room.id, room);
      if (room.status === "drafting" || room.status === "playing") {
        for (const player of room.players) {
          if (!player.isBot && !player.departed) this.scheduleDisconnectResolution(player.id);
        }
      }
      if (room.status === "playing") {
        this.runBots(room);
      }
    }
  }

  list(): RoomSummary[] {
    return [...this.rooms.values()]
      .map((room) => this.toSummary(room))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  get(roomId: string): RoomView | undefined {
    const room = this.rooms.get(roomId);
    return room ? this.toView(room) : undefined;
  }

  getForUser(userId: string): RoomView | undefined {
    const roomId = this.roomByUser.get(userId);
    const room = roomId ? this.rooms.get(roomId) : undefined;
    return room ? this.toView(room, userId) : undefined;
  }

  setDisplayName(userId: string, displayName: string): void {
    const roomId = this.roomByUser.get(userId);
    const player = roomId ? this.rooms.get(roomId)?.players.find((candidate) => candidate.id === userId) : undefined;
    if (!player) return;
    player.displayName = displayName;
    this.changed();
  }

  create(owner: PublicUser, input: CreateRoomInput): RoomView {
    this.assertNotInRoom(owner.id);
    const gameType = input.gameType ?? "sanguosha";
    let ruleConfig: RoomRuleConfig;
    try {
      ruleConfig = cloneRuleConfig(input.ruleConfig ?? DEFAULT_SERVER_ROOM_RULE_CONFIG);
    } catch (error) {
      throw new HttpError(
        400,
        "INVALID_ROOM_RULE_CONFIG",
        error instanceof Error ? error.message : "房间规则配置无效",
      );
    }
    const id = randomUUID();
    const metadata = gameTypeMetadata(gameType);
    const maxPlayers = metadata.fixedPlayerCount
      ? metadata.maximumPlayers
      : input.maxPlayers ?? metadata.defaultMaximumPlayers;
    if (maxPlayers < metadata.minimumPlayers || maxPlayers > metadata.maximumPlayers) {
      throw new HttpError(
        400,
        "INVALID_MAX_PLAYERS",
        `该游戏房间人数需为 ${metadata.minimumPlayers} 至 ${metadata.maximumPlayers} 人`,
      );
    }
    if (
      gameType === "digit_bomb" &&
      input.digitBombDigits !== undefined &&
      (!Number.isSafeInteger(input.digitBombDigits) ||
        input.digitBombDigits < 1 ||
        input.digitBombDigits > 8)
    ) {
      throw new HttpError(400, "INVALID_DIGIT_BOMB_DIGITS", "数字炸弹密码位数需为 1 至 8");
    }
    if (gameType !== "digit_bomb" && input.digitBombDigits !== undefined) {
      throw new HttpError(
        400,
        "DIGIT_BOMB_DIGITS_NOT_APPLICABLE",
        "密码位数仅适用于数字炸弹房间",
      );
    }
    const room: Room = {
      id,
      name: input.name.trim(),
      gameType,
      ownerId: owner.id,
      status: "waiting",
      maxPlayers,
      createdAt: new Date().toISOString(),
      players: [this.toPlayer(owner, 0)],
      ruleConfig,
      botIntelligence: input.botIntelligence ?? DEFAULT_BOT_INTELLIGENCE,
      botMode: metadata.supportsLlmBots ? input.botMode ?? "rules" : "rules",
      ...(gameType === "digit_bomb"
        ? { digitBombDigits: input.digitBombDigits ?? 4 }
        : {}),
      doudizhuLlmUsage: { ...EMPTY_DOUDIZHU_LLM_USAGE },
      chatMessages: [],
    };
    this.rooms.set(id, room);
    this.roomByUser.set(owner.id, id);
    this.changed();
    return this.toView(room, owner.id);
  }

  join(roomId: string, user: PublicUser): RoomView {
    const currentRoomId = this.roomByUser.get(user.id);
    if (currentRoomId === roomId) return this.requireRoomView(roomId, user.id);
    this.assertNotInRoom(user.id);
    const room = this.requireRoom(roomId);
    if (room.status !== "waiting") {
      throw new HttpError(409, "ROOM_ALREADY_STARTED", "游戏已经开始");
    }
    if (room.players.length >= room.maxPlayers) {
      throw new HttpError(409, "ROOM_FULL", "房间已满");
    }

    room.players.push(this.toPlayer(user, room.players.length));
    room.players.forEach((player) => { player.ready = Boolean(player.isBot); });
    this.roomByUser.set(user.id, room.id);
    this.changed();
    return this.toView(room, user.id);
  }

  addBot(roomId: string, ownerId: string): RoomView {
    const room = this.requireMember(roomId, ownerId);
    if (room.ownerId !== ownerId) throw new HttpError(403, "NOT_ROOM_OWNER", "只有房主可以添加机器人");
    if (room.status !== "waiting") throw new HttpError(409, "ROOM_ALREADY_STARTED", "游戏已经开始");
    if (!gameTypeMetadata(room.gameType).supportsRuleBots) {
      throw new HttpError(409, "BOT_NOT_AVAILABLE", "该游戏不支持规则机器人");
    }
    if (room.players.length >= room.maxPlayers) throw new HttpError(409, "ROOM_FULL", "房间已满");
    const id = randomUUID();
    room.players.push({
      id,
      username: `bot_${id.slice(0, 8)}`,
      displayName: room.gameType === "gouji"
        ? goujiBotNickname(room, id)
        : room.gameType === "doudizhu"
          ? doudizhuBotNickname(room, id)
          : isSplendorGameType(room.gameType)
            ? `晶石旅人 ${room.players.filter((player) => player.isBot).length + 1}`
            : room.gameType === "digit_bomb"
              ? `拆弹员 ${room.players.filter((player) => player.isBot).length + 1}`
              : `机器人 ${room.players.filter((player) => player.isBot).length + 1}`,
      ...(room.gameType !== "sanguosha"
        ? {
            botTitle: room.gameType === "gouji"
              ? GOUJI_BOT_INTELLIGENCE_NAMES[room.botIntelligence]
              : room.gameType === "doudizhu"
                ? DOUDIZHU_BOT_INTELLIGENCE_NAMES[room.botIntelligence]
                : room.gameType === "digit_bomb"
                  ? "拆弹专家"
                  : "宝石行家",
          }
        : {}),
      ready: true,
      connected: true,
      seat: room.players.length,
      isBot: true,
      departed: false,
    });
    this.changed();
    return this.toView(room, ownerId);
  }

  removeBot(roomId: string, ownerId: string, botId: string): RoomView {
    const room = this.requireMember(roomId, ownerId);
    if (room.ownerId !== ownerId) throw new HttpError(403, "NOT_ROOM_OWNER", "只有房主可以移除机器人");
    if (room.status !== "waiting") throw new HttpError(409, "ROOM_ALREADY_STARTED", "游戏已经开始");
    const index = room.players.findIndex((player) => player.id === botId && player.isBot);
    if (index < 0) throw new HttpError(404, "BOT_NOT_FOUND", "机器人不存在");
    room.players.splice(index, 1);
    room.players.forEach((player, seat) => { player.seat = seat; });
    this.changed();
    return this.toView(room, ownerId);
  }

  leave(roomId: string, userId: string): void {
    const room = this.requireMember(roomId, userId);
    this.clearDisconnectTimer(userId);
    if (room.status === "drafting") this.cancelDraft(room);
    if (room.status === "playing") {
      if (!room.game) {
        console.error(`Playing room ${room.id} has no game state; closing it`);
        this.deleteRoom(room);
        this.changed();
        return;
      }
      const gamePlayer = room.game.players.find((player) => player.id === userId);
      if (!gamePlayer) {
        console.error(`Room member ${userId} is absent from game ${room.id}; closing it`);
        this.deleteRoom(room);
        this.changed();
        return;
      }
      if (isGoujiGame(room.game)) {
        room.game = forfeitGoujiPlayer(room.game, userId);
        room.status = room.game.status;
      } else if (isDoudizhuGame(room.game)) {
        room.game = forfeitDoudizhuPlayer(room.game, userId);
        this.finishRoomIfNeeded(room);
      } else if (isAdapterGame(room.game)) {
        room.game = forfeitAdapterPlayer(room.game, userId);
        this.finishRoomIfNeeded(room);
      // A dead Sanguosha player can safely leave without changing the
      // still-running identity match. Only a living departure is a forfeiture.
      } else if ("alive" in gamePlayer && gamePlayer.alive) {
        try {
          room.game = forfeitPlayer(room.game, userId);
          room.status = room.game.status;
        } catch (error) {
          console.error(`Room ${room.id} could not resolve departure of ${userId}; closing it`, error);
          this.deleteRoom(room);
          this.changed();
          return;
        }
      }
    }

    const index = room.players.findIndex((player) => player.id === userId);
    const player = room.players[index]!;
    if (room.status === "waiting") {
      room.players.splice(index, 1);
    } else {
      // Keep an internal tombstone after a game starts. GameSession seats and
      // identities are immutable, and retaining the matching room roster makes
      // a post-departure snapshot safe to restore. Public room views omit it.
      player.departed = true;
      player.connected = false;
      player.ready = false;
    }
    this.roomByUser.delete(userId);
    this.lastChatAtByUser.delete(userId);
    const remainingHumans = room.players.filter((candidate) => !candidate.isBot && !candidate.departed);
    if (remainingHumans.length === 0) {
      this.deleteRoom(room);
    } else {
      if (room.status === "waiting") {
        room.players.forEach((candidate, seat) => {
          candidate.seat = seat;
          candidate.ready = Boolean(candidate.isBot);
        });
      }
      if (room.ownerId === userId) room.ownerId = remainingHumans[0]!.id;
      if (room.status === "playing") this.runBots(room);
    }
    this.changed();
  }

  setReady(roomId: string, userId: string, ready: boolean): RoomView {
    const room = this.requireMember(roomId, userId);
    if (room.status !== "waiting") {
      throw new HttpError(409, "ROOM_ALREADY_STARTED", "游戏已经开始");
    }
    const player = room.players.find((candidate) => candidate.id === userId)!;
    player.ready = ready;
    this.changed();
    return this.toView(room, userId);
  }

  sendChat(roomId: string, userId: string, rawText: string): RoomChatMessage {
    const room = this.requireMember(roomId, userId);
    const player = room.players.find((candidate) => candidate.id === userId && !candidate.departed)!;
    if (player.isBot) throw new HttpError(403, "BOT_CHAT_NOT_ALLOWED", "机器人不能发送聊天消息");
    const text = rawText.replace(/\r\n?/g, "\n").trim();
    if (text.length < 1 || text.length > 200) {
      throw new HttpError(400, "INVALID_CHAT_MESSAGE", "聊天内容需为 1 至 200 个字符");
    }
    const now = Date.now();
    const lastSentAt = this.lastChatAtByUser.get(userId) ?? 0;
    if (now - lastSentAt < 500) {
      throw new HttpError(429, "CHAT_RATE_LIMITED", "发送太快，请稍后再试");
    }
    this.lastChatAtByUser.set(userId, now);
    const message: RoomChatMessage = {
      id: randomUUID(),
      senderId: player.id,
      senderName: player.displayName,
      text,
      sentAt: new Date(now).toISOString(),
    };
    room.chatMessages.push(message);
    if (room.chatMessages.length > 100) {
      room.chatMessages.splice(0, room.chatMessages.length - 100);
    }
    this.changed();
    return { ...message };
  }

  requestRematch(roomId: string, userId: string): RoomView {
    const room = this.requireMember(roomId, userId);
    if (
      room.status !== "finished" ||
      !room.game ||
      (!isDoudizhuGame(room.game) && !isNumberConnectGame(room.game))
    ) {
      throw new HttpError(409, "REMATCH_NOT_AVAILABLE", "当前房间不能继续下一局");
    }
    const doudizhuGame = isDoudizhuGame(room.game) ? room.game : null;
    const previousBeans = new Map(
      doudizhuGame?.players.map((candidate) => [candidate.id, candidate.beans] as const) ?? [],
    );
    const activePlayers = room.players.filter((player) => !player.departed);
    const requiredPlayers = doudizhuGame ? 3 : 2;
    if (activePlayers.length !== requiredPlayers) {
      throw new HttpError(
        409,
        doudizhuGame ? "REMATCH_REQUIRES_THREE_PLAYERS" : "REMATCH_REQUIRES_TWO_PLAYERS",
        `继续下一局需要${requiredPlayers === 3 ? "三" : "两"}名玩家都留在房间`,
      );
    }

    const player = activePlayers.find((candidate) => candidate.id === userId)!;
    player.ready = true;
    for (const bot of activePlayers.filter((candidate) => candidate.isBot)) bot.ready = true;

    const everyoneReady = activePlayers.every((candidate) =>
      candidate.ready && (candidate.isBot || candidate.connected)
    );
    if (everyoneReady) {
      room.players = activePlayers;
      room.players.forEach((candidate, seat) => {
        candidate.seat = seat;
        candidate.ready = true;
      });
      if (doudizhuGame) {
        room.game = createDoudizhuGame({
          players: room.players.map((candidate) => ({
            id: candidate.id,
            name: candidate.displayName,
            ...(candidate.botTitle ? { botTitle: candidate.botTitle } : {}),
            beans: previousBeans.get(candidate.id) ?? DOUDIZHU_INITIAL_BEANS,
          })),
          seed: randomBytes(32).toString("hex"),
        });
        room.doudizhuLlmUsage = { ...EMPTY_DOUDIZHU_LLM_USAGE };
      } else {
        room.game = createAdapterGame(
          "number_connect",
          room.players.map((candidate) => ({
            id: candidate.id,
            name: candidate.displayName,
          })),
          randomBytes(32).toString("hex"),
        )!;
      }
      room.status = "playing";
      this.runBots(room);
    }

    this.changed();
    return this.toView(room, userId);
  }

  start(roomId: string, userId: string): RoomView {
    const room = this.requireMember(roomId, userId);
    if (room.ownerId !== userId) {
      throw new HttpError(403, "NOT_ROOM_OWNER", "只有房主可以开始游戏");
    }
    if (room.status !== "waiting") {
      throw new HttpError(409, "ROOM_ALREADY_STARTED", "游戏已经开始");
    }
    if (room.players.length < 2) {
      throw new HttpError(409, "NOT_ENOUGH_PLAYERS", "至少需要 2 名玩家");
    }
    if (room.players.some((player) => !player.connected)) {
      throw new HttpError(409, "PLAYERS_OFFLINE", "有玩家离线，无法开始游戏");
    }
    if (room.players.some((player) => !player.ready)) {
      throw new HttpError(409, "PLAYERS_NOT_READY", "所有玩家准备后才能开始");
    }

    if (isAdapterGameType(room.gameType)) {
      const metadata = gameTypeMetadata(room.gameType);
      if (
        room.players.length < metadata.minimumPlayers ||
        room.players.length > metadata.maximumPlayers
      ) {
        throw new HttpError(
          409,
          "ADAPTER_PLAYER_COUNT_INVALID",
          `该游戏需要 ${metadata.minimumPlayers} 至 ${metadata.maximumPlayers} 人才能开始`,
        );
      }
      room.game = createAdapterGame(
        room.gameType,
        room.players.map((player) => ({
          id: player.id,
          name: player.displayName,
          ...(player.botTitle ? { botTitle: player.botTitle } : {}),
        })),
        randomBytes(32).toString("hex"),
        { digitBombDigits: room.digitBombDigits ?? 4 },
      );
      if (!room.game) throw new Error(`Missing adapter for ${room.gameType}`);
      room.status = "playing";
      room.draft = undefined;
      this.runBots(room);
      if (!this.rooms.has(room.id)) {
        throw new HttpError(409, "ROOM_ABORTED", "房间因无法恢复的机器人错误已关闭");
      }
      this.changed();
      return this.toView(room, userId);
    }

    if (room.gameType === "gouji") {
      if (room.players.length !== 6) {
        throw new HttpError(409, "GOUJI_REQUIRES_SIX_PLAYERS", "够级必须恰好 6 人才能开始");
      }
      room.game = createGoujiGame({
        players: room.players.map((player) => ({
          id: player.id,
          name: player.displayName,
          ...(player.botTitle ? { botTitle: player.botTitle } : {}),
        })),
        seed: randomBytes(32).toString("hex"),
      });
      room.status = "playing";
      room.draft = undefined;
      this.runBots(room);
      if (!this.rooms.has(room.id)) {
        throw new HttpError(409, "ROOM_ABORTED", "房间因无法恢复的机器人错误已关闭");
      }
      this.changed();
      return this.toView(room, userId);
    }

    if (room.gameType === "doudizhu") {
      if (room.players.length !== 3) {
        throw new HttpError(409, "DOUDIZHU_REQUIRES_THREE_PLAYERS", "斗地主必须恰好 3 人才能开始");
      }
      room.game = createDoudizhuGame({
        players: room.players.map((player) => ({
          id: player.id,
          name: player.displayName,
          ...(player.botTitle ? { botTitle: player.botTitle } : {}),
        })),
        seed: randomBytes(32).toString("hex"),
      });
      room.doudizhuLlmUsage = { ...EMPTY_DOUDIZHU_LLM_USAGE };
      room.status = "playing";
      room.draft = undefined;
      this.runBots(room);
      if (!this.rooms.has(room.id)) {
        throw new HttpError(409, "ROOM_ABORTED", "房间因无法恢复的机器人错误已关闭");
      }
      this.changed();
      return this.toView(room, userId);
    }

    try {
      const draft = createGeneralDraft({
        playerIds: room.players.map((player) => player.id),
        config: room.ruleConfig,
        rng: { key: randomBytes(32).toString("hex"), counter: 0 },
      });
      this.commitDraft(room, draft);
    } catch (error) {
      throw new HttpError(
        409,
        "INVALID_ROOM_RULE_CONFIG",
        error instanceof Error ? error.message : "房间规则配置无法开始游戏",
      );
    }
    this.runBots(room);
    if (!this.rooms.has(room.id)) {
      throw new HttpError(409, "ROOM_ABORTED", "房间因无法恢复的机器人错误已关闭");
    }
    this.changed();
    return this.toView(room, userId);
  }

  chooseGeneral(roomId: string, userId: string, generalId: FullGeneralId): RoomView {
    const room = this.requireDraftingMember(roomId, userId);
    const draft = cloneGeneralDraft(room.draft!);
    try {
      chooseDraftGeneral(draft, userId, generalId);
      this.commitDraft(room, draft);
    } catch (error) {
      throw new HttpError(
        409,
        "INVALID_GENERAL_SELECTION",
        error instanceof Error ? error.message : "武将选择无效",
      );
    }
    if (room.status === "playing") this.runBots(room);
    if (!this.rooms.has(room.id)) {
      throw new HttpError(409, "ROOM_ABORTED", "房间因无法恢复的机器人错误已关闭");
    }
    this.changed();
    return this.toView(room, userId);
  }

  chooseGodFaction(roomId: string, userId: string, faction: PlayableFaction): RoomView {
    const room = this.requireDraftingMember(roomId, userId);
    const draft = cloneGeneralDraft(room.draft!);
    try {
      chooseDraftGodFaction(draft, userId, faction);
      this.commitDraft(room, draft);
    } catch (error) {
      throw new HttpError(
        409,
        "INVALID_GOD_FACTION",
        error instanceof Error ? error.message : "神武将势力选择无效",
      );
    }
    if (room.status === "playing") this.runBots(room);
    if (!this.rooms.has(room.id)) {
      throw new HttpError(409, "ROOM_ABORTED", "房间因无法恢复的机器人错误已关闭");
    }
    this.changed();
    return this.toView(room, userId);
  }

  applyAction(
    roomId: string,
    userId: string,
    input: { expectedRevision: number; expectedPromptId: string; action: AuthorityAction },
  ): AuthorityGameView {
    const room = this.requireMember(roomId, userId);
    if (room.status !== "playing" || !room.game) {
      throw new HttpError(409, "GAME_NOT_IN_PROGRESS", "游戏尚未开始或已经结束");
    }
    const { expectedRevision, expectedPromptId, action } = input;
    if (action.playerId !== userId) {
      throw new HttpError(403, "PLAYER_MISMATCH", "不能替其他玩家执行操作");
    }
    const currentView = isGoujiGame(room.game)
      ? getGoujiGameView(room.game, userId)
      : isDoudizhuGame(room.game)
        ? getDoudizhuGameView(room.game, userId)
        : isAdapterGame(room.game)
          ? getAdapterGameView(room.game, userId)
          : getGameView(room.game, userId);
    const acceptsConcurrentNumberConnectAction =
      isNumberConnectGame(room.game) && isNumberConnectAction(action);
    if (
      !acceptsConcurrentNumberConnectAction &&
      (expectedRevision !== currentView.revision ||
        expectedPromptId !== currentView.actionPromptId)
    ) {
      throw new HttpError(409, "STALE_GAME_ACTION", "游戏状态已更新，请基于最新界面重试");
    }

    if (isGoujiGame(room.game)) {
      if (!isGoujiAction(action)) {
        throw new HttpError(409, "GAME_TYPE_MISMATCH", "该房间正在进行够级");
      }
      room.game = applyGoujiAction(room.game, action);
    } else if (isDoudizhuGame(room.game)) {
      if (!isDoudizhuAction(action)) {
        throw new HttpError(409, "GAME_TYPE_MISMATCH", "该房间正在进行斗地主");
      }
      room.game = applyDoudizhuAction(room.game, action);
    } else if (isSplendorGame(room.game)) {
      if (!isSplendorAction(action)) {
        throw new HttpError(409, "GAME_TYPE_MISMATCH", "该房间正在进行璀璨宝石");
      }
      room.game = applyAdapterAction(room.game, action);
    } else if (isDigitBombGame(room.game)) {
      if (!isDigitBombAction(action)) {
        throw new HttpError(409, "GAME_TYPE_MISMATCH", "该房间正在进行数字炸弹");
      }
      room.game = applyAdapterAction(room.game, action);
    } else if (isNumberConnectGame(room.game)) {
      if (!isNumberConnectAction(action)) {
        throw new HttpError(409, "GAME_TYPE_MISMATCH", "该房间正在进行数字连连看");
      }
      room.game = applyAdapterAction(room.game, action);
    } else {
      if (
        isGoujiAction(action) ||
        isDoudizhuAction(action) ||
        isSplendorAction(action) ||
        isDigitBombAction(action) ||
        isNumberConnectAction(action)
      ) {
        throw new HttpError(409, "GAME_TYPE_MISMATCH", "该房间正在进行三国杀");
      }
      room.game = applyAction(room.game, action);
    }
    this.runBots(room);
    if (!this.rooms.has(room.id)) {
      throw new HttpError(409, "ROOM_ABORTED", "房间因无法恢复的机器人错误已关闭");
    }
    this.finishRoomIfNeeded(room);
    this.changed();
    return isGoujiGame(room.game)
      ? getGoujiGameView(room.game, userId)
      : isDoudizhuGame(room.game)
        ? getDoudizhuGameView(room.game, userId)
        : isAdapterGame(room.game)
          ? getAdapterGameView(room.game, userId)
          : getGameView(room.game, userId);
  }

  async recommendDoudizhuAction(
    roomId: string,
    userId: string,
  ): Promise<DoudizhuLlmRecommendation> {
    const room = this.requireMember(roomId, userId);
    if (
      room.status !== "playing" ||
      !room.game ||
      !isDoudizhuGame(room.game)
    ) {
      throw new HttpError(
        409,
        "DOUDIZHU_NOT_PLAYING",
        "当前没有进行中的斗地主牌局",
      );
    }
    if (room.game.currentPlayerId !== userId) {
      throw new HttpError(409, "NOT_YOUR_TURN", "当前还没有轮到你");
    }
    if (!this.botDecisions.supports("doudizhu")) {
      throw new HttpError(
        409,
        "LLM_UNAVAILABLE",
        "管理员尚未启用大模型推荐",
      );
    }
    if (
      this.llmBotRuns.has(room.id) ||
      this.llmRecommendationRuns.has(room.id)
    ) {
      throw new HttpError(409, "LLM_BUSY", "大模型正在处理当前牌局");
    }

    const decision = createDoudizhuDecision(
      room.id,
      room.game,
      userId,
      room.botIntelligence,
    );
    if (!decision) {
      throw new HttpError(409, "NO_LEGAL_ACTION", "当前没有可推荐的合法动作");
    }

    const request = {
      revision: room.game.revision,
      playerId: userId,
    };
    room.doudizhuLlmUsage.calls += 1;
    room.doudizhuLlmUsage.promptTokens += decision.estimatedPromptTokens;
    room.doudizhuLlmUsage.lastFailureReason = null;
    this.llmRecommendationRuns.set(room.id, request);
    this.changed();

    const currentGame = (): DoudizhuGameState => {
      const currentRoom = this.rooms.get(room.id);
      if (
        currentRoom !== room ||
        this.llmRecommendationRuns.get(room.id) !== request ||
        !currentRoom.game ||
        !isDoudizhuGame(currentRoom.game) ||
        currentRoom.game.revision !== request.revision ||
        currentRoom.game.currentPlayerId !== request.playerId
      ) {
        throw new HttpError(
          409,
          "LLM_RECOMMENDATION_STALE",
          "牌局状态已变化，请重新获取推荐",
        );
      }
      return currentRoom.game;
    };

    try {
      const result = await this.botDecisions.decide(
        "doudizhu",
        decision.input,
      );
      currentGame();
      if (result) {
        room.doudizhuLlmUsage.promptTokens += Math.max(
          0,
          result.usage.promptTokens - decision.estimatedPromptTokens,
        );
        room.doudizhuLlmUsage.completionTokens += result.usage.completionTokens;
      }
      const selected = result?.candidateIndex === null ||
          result?.candidateIndex === undefined
        ? undefined
        : decision.input.candidates[result.candidateIndex];
      if (!selected) {
        room.doudizhuLlmUsage.fallbacks += 1;
        const fallbackReason = result?.failureReason ?? "invalid_candidate";
        room.doudizhuLlmUsage.lastFailureReason = fallbackReason;
        return {
          action: decision.fallback,
          source: "rules",
          fallbackReason,
        };
      }
      room.doudizhuLlmUsage.lastFailureReason = null;
      return { action: selected, source: "llm" };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      currentGame();
      room.doudizhuLlmUsage.fallbacks += 1;
      const fallbackReason = botDecisionFailureReason(error);
      room.doudizhuLlmUsage.lastFailureReason = fallbackReason;
      console.error(
        `LLM recommendation failed in room ${room.id} (${fallbackReason}); using rule fallback`,
        error,
      );
      return {
        action: decision.fallback,
        source: "rules",
        fallbackReason,
      };
    } finally {
      if (this.llmRecommendationRuns.get(room.id) === request) {
        this.llmRecommendationRuns.delete(room.id);
        this.changed();
      }
    }
  }

  getGameView(roomId: string, userId: string): AuthorityGameView | undefined {
    const room = this.requireMember(roomId, userId);
    if (!room.game) return undefined;
    return isGoujiGame(room.game)
      ? getGoujiGameView(room.game, userId)
      : isDoudizhuGame(room.game)
        ? getDoudizhuGameView(room.game, userId)
        : isAdapterGame(room.game)
          ? getAdapterGameView(room.game, userId)
          : getGameView(room.game, userId);
  }

  setConnected(userId: string, connected: boolean): void {
    if (connected) {
      this.connectedUsers.add(userId);
      this.clearDisconnectTimer(userId);
    } else {
      this.connectedUsers.delete(userId);
    }
    const roomId = this.roomByUser.get(userId);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    const player = room?.players.find((candidate) => candidate.id === userId);
    if (!player || player.connected === connected) return;
    player.connected = connected;
    this.changed();
    if (!connected && (room?.status === "drafting" || room?.status === "playing")) {
      this.scheduleDisconnectResolution(userId);
    }
  }

  members(roomId: string): string[] {
    return this.rooms.get(roomId)?.players
      .filter((player) => !player.departed)
      .map((player) => player.id) ?? [];
  }

  allRoomIds(): string[] {
    return [...this.rooms.keys()];
  }

  private toSummary(room: Room): RoomSummary {
    const activePlayers = room.players.filter((player) => !player.departed);
    return {
      id: room.id,
      name: room.name,
      gameType: room.gameType,
      ownerId: room.ownerId,
      ownerName: activePlayers.find((player) => player.id === room.ownerId)?.displayName ?? "",
      status: room.status,
      playerCount: activePlayers.length,
      maxPlayers: room.maxPlayers,
      createdAt: room.createdAt,
    };
  }

  private toView(room: Room, viewerId?: string): RoomView {
    const supportsLlmBots = gameTypeMetadata(room.gameType).supportsLlmBots;
    return {
      ...this.toSummary(room),
      players: room.players
        .filter((player) => !player.departed)
        .map(({ departed: _departed, ...player }) => ({ ...player })),
      ruleConfig: structuredClone(room.ruleConfig),
      botIntelligence: room.botIntelligence,
      botMode: room.botMode,
      ...(room.gameType === "digit_bomb"
        ? { digitBombDigits: room.digitBombDigits ?? 4 }
        : {}),
      llmBot: {
        available: supportsLlmBots && (
          room.gameType === "sanguosha"
            ? this.botDecisions.supports("sanguosha")
            : room.gameType === "doudizhu"
              ? this.botDecisions.supports("doudizhu")
              : false
        ),
        thinkingPlayerId:
          this.llmBotRuns.get(room.id)?.playerId ??
          this.llmRecommendationRuns.get(room.id)?.playerId ??
          null,
        usage: { ...room.doudizhuLlmUsage },
      },
      chatMessages: room.chatMessages.map((message) => ({ ...message })),
      ...(viewerId && room.draft ? { draft: getGeneralDraftView(room.draft, viewerId) } : {}),
    };
  }

  private commitDraft(room: Room, draft: GeneralDraftState): void {
    for (let pass = 0; pass < draft.playerIds.length * 2; pass += 1) {
      for (const player of room.players) {
        if (player.isBot && !player.departed) autoChooseGeneral(draft, player.id);
      }
    }
    if (draft.stage !== "complete") {
      room.status = "drafting";
      room.draft = draft;
      room.game = undefined;
      return;
    }
    const game = createGameFromDraft({ draft, config: room.ruleConfig });
    room.status = "playing";
    room.draft = undefined;
    room.game = game;
  }

  private cancelDraft(room: Room): void {
    room.status = "waiting";
    room.draft = undefined;
    room.game = undefined;
    for (const player of room.players) player.ready = Boolean(player.isBot);
  }

  private toPlayer(user: PublicUser, seat: number): RoomPlayer {
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      ready: false,
      connected: this.connectedUsers.has(user.id),
      seat,
      isBot: false,
      departed: false,
    };
  }

  private runBots(room: Room, notify = false, delayElapsed = false): void {
    if (room.status !== "playing" || !room.game || this.rooms.get(room.id) !== room) return;
    if (this.botRuns.has(room.id) || this.llmBotRuns.has(room.id)) return;
    this.cancelBotContinuation(room.id);
    if (this.hasBotActionDelay(room) && !delayElapsed && this.actingBot(room)) {
      this.scheduleBotContinuation(room.id);
      return;
    }
    this.botRuns.add(room.id);

    let steps = 0;
    let mutations = 0;
    let aborted = false;
    try {
      while (steps < this.botBatchSize && room.game.status === "playing") {
        const bot = this.actingBot(room);
        if (!bot) break;
        steps += 1;
        if (
          !isGoujiGame(room.game) &&
          !isDoudizhuGame(room.game) &&
          !isAdapterGame(room.game) &&
          room.botMode === "llm" &&
          this.startSanguoshaLlmDecision(room, room.game, bot)
        ) {
          break;
        }
        if (
          isDoudizhuGame(room.game) &&
          room.botMode === "llm" &&
          this.startDoudizhuLlmDecision(room, room.game, bot)
        ) {
          break;
        }
        try {
          room.game = isGoujiGame(room.game)
            ? applyGoujiAction(
                room.game,
                chooseGoujiBotAction(room.game, bot.id, room.botIntelligence),
              )
            : isDoudizhuGame(room.game)
              ? applyDoudizhuAction(
                  room.game,
                  chooseDoudizhuBotAction(room.game, bot.id, room.botIntelligence),
                )
              : isAdapterGame(room.game)
                ? applyAdapterAction(
                    room.game,
                    chooseAdapterBotAction(room.game, bot.id, room.botIntelligence),
                  )
                : applyAction(room.game, this.actionForBot(room.game, bot, room.botIntelligence));
          mutations += 1;
        } catch (error) {
          // A bad heuristic or an unforeseen rule edge must not escape from an
          // asynchronous continuation and terminate the Node.js process. The
          // offending bot leaves under the same authoritative rule as a human.
          console.error(`Bot ${bot.id} failed in room ${room.id}; eliminating it`, error);
          try {
            if (isGoujiGame(room.game)) {
              room.game = forfeitGoujiPlayer(room.game, bot.id);
            } else if (isDoudizhuGame(room.game)) {
              room.game = forfeitDoudizhuPlayer(room.game, bot.id);
            } else if (isAdapterGame(room.game)) {
              room.game = forfeitAdapterPlayer(room.game, bot.id);
            } else {
              const gamePlayer = room.game.players.find((player) => player.id === bot.id);
              if (!gamePlayer?.alive) throw new Error("Failed bot is not a living game player");
              room.game = forfeitPlayer(room.game, bot.id);
            }
            mutations += 1;
          } catch (recoveryError) {
            console.error(`Room ${room.id} could not recover from a bot failure; closing it`, recoveryError);
            this.deleteRoom(room);
            aborted = true;
            break;
          }
        }
        if (this.hasBotActionDelay(room)) break;
      }
      if (!aborted) this.finishRoomIfNeeded(room);
    } finally {
      this.botRuns.delete(room.id);
    }

    if (aborted) {
      this.changed();
      return;
    }
    if (
      !this.llmBotRuns.has(room.id) &&
      (steps >= this.botBatchSize || this.hasBotActionDelay(room)) &&
      this.actingBot(room)
    ) {
      this.scheduleBotContinuation(room.id);
    }
    if (notify && mutations > 0) this.changed();
  }

  private startDoudizhuLlmDecision(
    room: Room,
    game: DoudizhuGameState,
    bot: RoomPlayer,
  ): boolean {
    if (!this.botDecisions.supports("doudizhu")) return false;
    const decision = createDoudizhuDecision(
      room.id,
      game,
      bot.id,
      room.botIntelligence,
    );
    if (!decision) return false;
    const request = { revision: game.revision, playerId: bot.id };
    room.doudizhuLlmUsage.calls += 1;
    room.doudizhuLlmUsage.promptTokens += decision.estimatedPromptTokens;
    room.doudizhuLlmUsage.lastFailureReason = null;
    this.llmBotRuns.set(room.id, request);
    this.changed();

    void this.botDecisions.decide("doudizhu", decision.input)
      .then((result) => {
        const currentRoom = this.rooms.get(room.id);
        const currentRequest = this.llmBotRuns.get(room.id);
        if (
          currentRoom !== room ||
          currentRequest !== request ||
          !currentRoom.game ||
          !isDoudizhuGame(currentRoom.game) ||
          currentRoom.game.revision !== request.revision ||
          currentRoom.game.currentPlayerId !== request.playerId
        ) {
          return;
        }

        if (result) {
          currentRoom.doudizhuLlmUsage.promptTokens += Math.max(
            0,
            result.usage.promptTokens - decision.estimatedPromptTokens,
          );
          currentRoom.doudizhuLlmUsage.completionTokens += result.usage.completionTokens;
        }
        const selected = result?.candidateIndex === null || result?.candidateIndex === undefined
          ? undefined
          : decision.input.candidates[result.candidateIndex];
        const action = selected ?? decision.fallback;
        if (!selected) {
          currentRoom.doudizhuLlmUsage.fallbacks += 1;
          currentRoom.doudizhuLlmUsage.lastFailureReason =
            result?.failureReason ?? "invalid_candidate";
        } else {
          currentRoom.doudizhuLlmUsage.lastFailureReason = null;
        }
        try {
          currentRoom.game = applyDoudizhuAction(currentRoom.game, action);
        } catch (error) {
          currentRoom.doudizhuLlmUsage.fallbacks += 1;
          currentRoom.doudizhuLlmUsage.lastFailureReason =
            "invalid_candidate";
          console.error(
            `LLM-selected bot action failed in room ${currentRoom.id}; using rule fallback`,
            error,
          );
          try {
            currentRoom.game = applyDoudizhuAction(currentRoom.game, decision.fallback);
          } catch (fallbackError) {
            console.error(
              `Rule fallback failed for bot ${bot.id} in room ${currentRoom.id}; eliminating it`,
              fallbackError,
            );
            currentRoom.game = forfeitDoudizhuPlayer(currentRoom.game, bot.id);
          }
        }
        this.finishRoomIfNeeded(currentRoom);
        this.changed();
      })
      .catch((error) => {
        const currentRoom = this.rooms.get(room.id);
        const currentRequest = this.llmBotRuns.get(room.id);
        if (
          currentRoom !== room ||
          currentRequest !== request ||
          !currentRoom.game ||
          !isDoudizhuGame(currentRoom.game) ||
          currentRoom.game.revision !== request.revision ||
          currentRoom.game.currentPlayerId !== request.playerId
        ) {
          return;
        }
        currentRoom.doudizhuLlmUsage.fallbacks += 1;
        const failureReason = botDecisionFailureReason(error);
        currentRoom.doudizhuLlmUsage.lastFailureReason = failureReason;
        console.error(
          `LLM bot request failed in room ${currentRoom.id} (${failureReason}); using rule fallback`,
          error,
        );
        try {
          currentRoom.game = applyDoudizhuAction(currentRoom.game, decision.fallback);
        } catch (fallbackError) {
          console.error(
            `Rule fallback failed for bot ${bot.id} in room ${currentRoom.id}; eliminating it`,
            fallbackError,
          );
          currentRoom.game = forfeitDoudizhuPlayer(currentRoom.game, bot.id);
        }
        this.finishRoomIfNeeded(currentRoom);
        this.changed();
      })
      .finally(() => {
        if (this.llmBotRuns.get(room.id) !== request) return;
        this.llmBotRuns.delete(room.id);
        const currentRoom = this.rooms.get(room.id);
        if (currentRoom) {
          this.runBots(currentRoom, true);
          this.changed();
        }
      });
    return true;
  }

  private startSanguoshaLlmDecision(
    room: Room,
    game: GameSession,
    bot: RoomPlayer,
  ): boolean {
    if (!this.botDecisions.supports("sanguosha")) return false;
    let fallback: GameAction;
    let candidates: GameAction[];
    try {
      fallback = this.actionForBot(game, bot, room.botIntelligence);
      const seen = new Set<string>();
      candidates = ([3, 5, 6, 7] as const)
        .map((intelligence) => this.actionForBot(game, bot, intelligence))
        .filter((action) => {
          const key = JSON.stringify(action);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
    } catch {
      return false;
    }
    const decision = createSanguoshaDecision(
      room.id,
      game,
      bot.id,
      room.botIntelligence,
      candidates,
      fallback,
    );
    if (!decision) return false;
    const request = { revision: game.revision, playerId: bot.id };
    room.doudizhuLlmUsage.calls += 1;
    room.doudizhuLlmUsage.promptTokens += decision.estimatedPromptTokens;
    room.doudizhuLlmUsage.lastFailureReason = null;
    this.llmBotRuns.set(room.id, request);
    this.changed();

    const isCurrentRequest = (currentRoom: Room | undefined): currentRoom is Room =>
      currentRoom === room &&
      this.llmBotRuns.get(room.id) === request &&
      Boolean(
        currentRoom.game &&
        !isGoujiGame(currentRoom.game) &&
        !isDoudizhuGame(currentRoom.game) &&
        !isAdapterGame(currentRoom.game) &&
        currentRoom.game.revision === request.revision &&
        this.actingBot(currentRoom)?.id === request.playerId,
      );

    void this.botDecisions.decide("sanguosha", decision.input)
      .then((result) => {
        const currentRoom = this.rooms.get(room.id);
        if (!isCurrentRequest(currentRoom)) return;
        if (result) {
          currentRoom.doudizhuLlmUsage.promptTokens += Math.max(
            0,
            result.usage.promptTokens - decision.estimatedPromptTokens,
          );
          currentRoom.doudizhuLlmUsage.completionTokens += result.usage.completionTokens;
        }
        const selected = result?.candidateIndex === null || result?.candidateIndex === undefined
          ? undefined
          : decision.input.candidates[result.candidateIndex];
        const action = selected ?? decision.fallback;
        if (!selected) {
          currentRoom.doudizhuLlmUsage.fallbacks += 1;
          currentRoom.doudizhuLlmUsage.lastFailureReason =
            result?.failureReason ?? "invalid_candidate";
        } else {
          currentRoom.doudizhuLlmUsage.lastFailureReason = null;
        }
        try {
          currentRoom.game = applyAction(currentRoom.game as GameSession, action);
        } catch (error) {
          currentRoom.doudizhuLlmUsage.fallbacks += 1;
          currentRoom.doudizhuLlmUsage.lastFailureReason =
            "invalid_candidate";
          console.error(
            `LLM-selected Sanguosha bot action failed in room ${currentRoom.id}; using rule fallback`,
            error,
          );
          try {
            currentRoom.game = applyAction(currentRoom.game as GameSession, decision.fallback);
          } catch (fallbackError) {
            console.error(
              `Rule fallback failed for bot ${bot.id} in room ${currentRoom.id}; eliminating it`,
              fallbackError,
            );
            currentRoom.game = forfeitPlayer(currentRoom.game as GameSession, bot.id);
          }
        }
        this.finishRoomIfNeeded(currentRoom);
        this.changed();
      })
      .catch((error) => {
        const currentRoom = this.rooms.get(room.id);
        if (!isCurrentRequest(currentRoom)) return;
        currentRoom.doudizhuLlmUsage.fallbacks += 1;
        const failureReason = botDecisionFailureReason(error);
        currentRoom.doudizhuLlmUsage.lastFailureReason = failureReason;
        console.error(
          `Sanguosha LLM bot request failed in room ${currentRoom.id} (${failureReason}); using rule fallback`,
          error,
        );
        try {
          currentRoom.game = applyAction(currentRoom.game as GameSession, decision.fallback);
        } catch (fallbackError) {
          console.error(
            `Rule fallback failed for bot ${bot.id} in room ${currentRoom.id}; eliminating it`,
            fallbackError,
          );
          currentRoom.game = forfeitPlayer(currentRoom.game as GameSession, bot.id);
        }
        this.finishRoomIfNeeded(currentRoom);
        this.changed();
      })
      .finally(() => {
        if (this.llmBotRuns.get(room.id) !== request) return;
        this.llmBotRuns.delete(room.id);
        const currentRoom = this.rooms.get(room.id);
        if (currentRoom) {
          this.runBots(currentRoom, true);
          this.changed();
        }
      });
    return true;
  }

  private hasBotActionDelay(room: Room): boolean {
    return room.game && isDoudizhuGame(room.game)
      ? this.doudizhuBotDelayRangeMs[1] > 0
      : this.botActionDelayMs > 0;
  }

  private finishRoomIfNeeded(room: Room): void {
    if (!room.game || room.game.status !== "finished") return;
    const transitioned = room.status !== "finished";
    room.status = "finished";
    if (transitioned && isDoudizhuGame(room.game)) {
      for (const player of room.players) {
        player.ready = Boolean(player.isBot && !player.departed);
      }
    } else if (transitioned && isNumberConnectGame(room.game)) {
      for (const player of room.players) player.ready = false;
    }
  }

  private actingBot(room: Room): RoomPlayer | undefined {
    if (room.status !== "playing" || !room.game || room.game.status !== "playing") return undefined;
    const actingPlayerId = isGoujiGame(room.game) ||
      isDoudizhuGame(room.game) ||
      isAdapterGame(room.game)
      ? room.game.currentPlayerId
      : room.game.pendingResponse?.targetId
        ?? (room.game.turn.phase !== "respond" ? room.game.currentPlayerId : undefined);
    if (!actingPlayerId) return undefined;
    return room.players.find((player) =>
      player.isBot && !player.departed && player.id === actingPlayerId
    );
  }

  private actionForBot(
    game: GameSession,
    bot: RoomPlayer,
    intelligence: BotIntelligence = DEFAULT_BOT_INTELLIGENCE,
  ): GameAction {
    const prompt = getGameView(game, bot.id).prompt;
    const canRevealJudgment = game.deck.length > 0 || game.discardPile.length > 0;
    const target = (targetIds: readonly string[], beneficial = false) =>
      chooseBotTarget(game, bot.id, targetIds, intelligence, beneficial);
    if (prompt.type === "play") {
      const player = game.players.find((candidate) => candidate.id === bot.id);
      if (!player) throw new Error(`Bot ${bot.id} is absent from the game`);
      const ownedCards = [...player.hand, ...Object.values(player.equipment)];
      const cardById = new Map(ownedCards.map((card) => [card.id, card]));
      const keepScore = (cardId: string): number => {
        const kind = cardById.get(cardId)?.kind;
        if (kind === "peach") return 100;
        if (kind === "dodge" || kind === "wu_xie_ke_ji") return 80;
        if (kind === "slash" || kind === "fire_slash" || kind === "thunder_slash") return 70;
        if (kind === "ex_nihilo") return 60;
        return 10;
      };
      const costCards = (cardIds: readonly string[], count: number): string[] =>
        [...cardIds].sort((left, right) => keepScore(left) - keepScore(right)).slice(0, count);

      // Healing-oriented skills precede generic card play. Each action either
      // has an engine-enforced once-per-turn counter or consumes Rende's single
      // recovery threshold, so repeated bot batches always converge.
      const qingnang = prompt.skills.find((hint) => hint.skillId === "qingnang");
      if (qingnang) {
        const targetId = intelligence <= 3 && qingnang.targetIds.includes(bot.id)
          ? bot.id
          : target(qingnang.targetIds, true);
        const cardIds = costCards(qingnang.cardIds, 1);
        if (targetId && cardIds.length === 1) {
          return { type: "use_skill", playerId: bot.id, skillId: "qingnang", cardIds, targetId };
        }
      }
      const jieyin = prompt.skills.find((hint) => hint.skillId === "jieyin");
      if (jieyin && player.hp < player.maxHp) {
        const cardIds = costCards(jieyin.cardIds, 2);
        const targetId = target(jieyin.targetIds, true);
        if (targetId && cardIds.length === 2) {
          return { type: "use_skill", playerId: bot.id, skillId: "jieyin", cardIds, targetId };
        }
      }
      const rende = prompt.skills.find((hint) => hint.skillId === "rende");
      if (
        rende &&
        player.hp < player.maxHp &&
        !game.turn.rendeRecovered &&
        game.turn.rendeGivenCount < 2
      ) {
        const needed = 2 - game.turn.rendeGivenCount;
        const cardIds = costCards(rende.cardIds, needed);
        const targetId = intelligence >= 4
          ? target(rende.targetIds, true)
          : rende.targetIds
            .map((targetId) => game.players.find((candidate) => candidate.id === targetId))
            .filter((candidate) => candidate !== undefined)
            .sort((left, right) => left.hand.length - right.hand.length)[0]?.id;
        if (targetId && cardIds.length === needed) {
          return { type: "use_skill", playerId: bot.id, skillId: "rende", cardIds, targetId };
        }
      }

      const fanjian = prompt.skills.find((hint) => hint.skillId === "fanjian");
      if (fanjian?.targetIds[0]) {
        return { type: "use_skill", playerId: bot.id, skillId: "fanjian", targetId: target(fanjian.targetIds)! };
      }
      const lijian = prompt.skills.find((hint) => hint.skillId === "lijian");
      const lijianPair = lijian?.targetPairs?.[0];
      const lijianCost = lijian ? costCards(lijian.cardIds, 1) : [];
      if (lijianPair && lijianCost.length === 1) {
        return {
          type: "use_skill",
          playerId: bot.id,
          skillId: "lijian",
          cardIds: lijianCost,
          targetIds: [...lijianPair],
        };
      }
      const huangtian = prompt.skills.find((hint) => hint.skillId === "huangtian");
      const huangtianCard = huangtian ? costCards(huangtian.cardIds, 1)[0] : undefined;
      if (huangtianCard && huangtian?.targetIds[0]) {
        return {
          type: "use_skill",
          playerId: bot.id,
          skillId: "huangtian",
          cardIds: [huangtianCard],
          targetId: target(huangtian.targetIds, true),
        };
      }

      if (intelligence === 1 && Math.random() < 0.35) return { type: "end_play", playerId: bot.id };
      const preferred = intelligence <= 2
        ? prompt.cards[Math.floor(Math.random() * prompt.cards.length)]
        : prompt.cards.find((hint) => hint.kind === "peach")
          ?? prompt.cards.find((hint) => hint.kind === "ex_nihilo")
          ?? prompt.cards.find((hint) => hint.kind.includes("horse"))
          ?? prompt.cards[0];
      if (preferred) {
        const primaryTarget = target(preferred.targetIds);
        const rankedTargets = primaryTarget && preferred.targetIds.length > 1 && intelligence >= 4
          ? [primaryTarget, ...preferred.targetIds.filter((targetId) => targetId !== primaryTarget)]
          : preferred.targetIds;
        return preferred.targetMode === "ordered-two"
          ? { type: "play_card", playerId: bot.id, cardId: preferred.cardId, targetIds: preferred.targetPairs?.[0] ? [...preferred.targetPairs[0]] : [] }
          : preferred.targetMode === "up-to-two" || preferred.targetMode === "up-to-three"
            ? { type: "play_card", playerId: bot.id, cardId: preferred.cardId, targetIds: rankedTargets.slice(0, preferred.targetMode === "up-to-three" ? 3 : 2) }
            : { type: "play_card", playerId: bot.id, cardId: preferred.cardId, targetId: primaryTarget };
      }
      const lesserYeyan = prompt.skills.find((hint) => hint.skillId === "yeyan" && hint.minCards === 0);
      const yeyanTargetId = lesserYeyan?.targetIds.find((targetId) =>
        targetId !== bot.id && game.players.some((candidate) => candidate.id === targetId && candidate.alive));
      if (yeyanTargetId) {
        return {
          type: "use_skill",
          playerId: bot.id,
          skillId: "yeyan",
          allocations: [{ targetId: yeyanTargetId, damage: 1 }],
        };
      }
      const jijiang = prompt.skills.find((hint) => hint.skillId === "jijiang");
      if (jijiang?.targetIds[0]) {
        return {
          type: "invoke_lord_skill",
          playerId: bot.id,
          skillId: "jijiang",
          targetId: jijiang.targetIds[0],
        };
      }
      if (prompt.zhangBaSlash?.targetIds[0]) {
        return {
          type: "use_zhang_ba_slash",
          playerId: bot.id,
          cardIds: prompt.zhangBaSlash.allowedCardIds.slice(0, 2),
          targetId: target(prompt.zhangBaSlash.targetIds)!,
        };
      }
      // Conversion skills are a fallback after ordinary legal cards. Kurou is
      // deliberately never automated: repeated HP loss is both strategically
      // unsafe and capable of producing a long self-rescue action chain.
      for (const skillId of ["wusheng", "longdan", "qixi", "guose"] as const) {
        const activeSkill = prompt.skills.find((hint) => hint.skillId === skillId);
        if (!activeSkill) continue;
        if (skillId === "guose" && Object.keys(game.virtualCardOrigins).length > 0) continue;
        const skillCardId = costCards(activeSkill.cardIds, 1)[0];
        if (!skillCardId) continue;
        const targetId = target(activeSkill.cardTargetIds?.[skillCardId] ?? activeSkill.targetIds);
        if (!targetId) continue;
        return { type: "use_skill", playerId: bot.id, skillId, cardIds: [skillCardId], targetId };
      }
      const zhiheng = prompt.skills.find((hint) => hint.skillId === "zhiheng");
      if (zhiheng) {
        const cardIds = costCards(zhiheng.cardIds, 1);
        if (cardIds.length === 1) {
          return { type: "use_skill", playerId: bot.id, skillId: "zhiheng", cardIds };
        }
      }
      return { type: "end_play", playerId: bot.id };
    }
    if (prompt.type === "guhuo_challenge") {
      return { type: "resolve_guhuo", playerId: bot.id, promptId: prompt.promptId, challenge: false };
    }
    if (prompt.type === "choose_pindian_card") {
      const cardId = prompt.allowedCardIds[0];
      if (!cardId) throw new Error("Bot received a Pindian prompt without a legal hand card");
      return { type: "choose_pindian_card", playerId: bot.id, promptId: prompt.promptId, cardId };
    }
    if (prompt.type === "respond") {
      const physicalCardId = prompt.responseKind === "slash" ? prompt.slashCardIds[0] : prompt.dodgeCardIds[0];
      if (physicalCardId) return { type: "respond", playerId: bot.id, cardId: physicalCardId };
      const skillResponse = prompt.skillResponses.find((hint) => (hint.cardGroups?.[0]?.length ?? hint.cardIds.length) > 0);
      if (skillResponse) {
        const cardIds = skillResponse.cardGroups?.[0] ?? skillResponse.cardIds.slice(0, skillResponse.minCards ?? 1);
        return {
          type: "use_skill",
          playerId: bot.id,
          skillId: skillResponse.skillId,
          cardIds: [...cardIds],
        };
      }
      const lordSkill = prompt.lordSkills[0];
      if (lordSkill) return { type: "invoke_lord_skill", playerId: bot.id, skillId: lordSkill };
      return prompt.responseKind === "slash" && (prompt.zhangBaCardIds?.length ?? 0) >= 2
        ? { type: "respond", playerId: bot.id, cardIds: prompt.zhangBaCardIds!.slice(0, 2) }
        : { type: "respond", playerId: bot.id, cardId: null };
    }
    if (prompt.type === "lord_dispatch") {
      return {
        type: "resolve_lord_dispatch",
        playerId: bot.id,
        promptId: prompt.promptId,
        cardId: prompt.allowedCardIds[0] ?? null,
      };
    }
    if (prompt.type === "dying") {
      const physicalCardId = prompt.allowedCardIds[0];
      if (physicalCardId) return { type: "respond", playerId: bot.id, cardId: physicalCardId };
      const skillResponse = prompt.skillResponses.find((hint) => (hint.cardGroups?.[0]?.length ?? hint.cardIds.length) > 0);
      if (!skillResponse) return { type: "respond", playerId: bot.id, cardId: null };
      const cardIds = skillResponse.cardGroups?.[0] ?? skillResponse.cardIds.slice(0, skillResponse.minCards ?? 1);
      return { type: "use_skill", playerId: bot.id, skillId: skillResponse.skillId, cardIds: [...cardIds] };
    }
    if (prompt.type === "nullification") {
      const physicalCardId = prompt.allowedCardIds[0];
      if (physicalCardId) return { type: "respond", playerId: bot.id, cardId: physicalCardId };
      const kanpoCardId = prompt.kanpoCardIds[0];
      if (kanpoCardId) return { type: "use_skill", playerId: bot.id, skillId: "kanpo", cardIds: [kanpoCardId] };
      const longhunCardIds = prompt.longhunCardGroups?.[0];
      return longhunCardIds
        ? { type: "use_skill", playerId: bot.id, skillId: "longhun", cardIds: [...longhunCardIds] }
        : { type: "respond", playerId: bot.id, cardId: null };
    }
    if (prompt.type === "skill_choice") {
      const player = game.players.find((candidate) => candidate.id === bot.id);
      const canSafelyUseLuoyi = Boolean(
        player &&
        player.hp > 1 &&
        player.hand.some((card) =>
          card.kind === "slash" || card.kind === "fire_slash" || card.kind === "thunder_slash" || card.kind === "duel"
        )
      );
      return {
        type: "resolve_skill",
        playerId: bot.id,
        skillId: prompt.skillId,
        ...(prompt.promptId ? { promptId: prompt.promptId } : {}),
        activate:
          prompt.skillId === "keji" ||
          prompt.skillId === "yingzi" ||
          prompt.skillId === "biyue" ||
          (prompt.skillId === "luoshen" && canRevealJudgment) ||
          prompt.skillId === "jizhi" ||
          prompt.skillId === "lianying" ||
          prompt.skillId === "xiaoji" ||
          prompt.skillId === "buqu" ||
          prompt.skillId === "niepan" ||
          canSafelyUseLuoyi,
      };
    }
    if (prompt.type === "standard_skill") {
      const base = {
        type: "resolve_standard_skill" as const,
        playerId: bot.id,
        promptId: prompt.promptId,
      };
      if (prompt.stage === "judgment_retrial") return { ...base, activate: false };
      if (prompt.stage === "judgment_post") return { ...base, activate: true };
      if (prompt.skillId === "guanxing" && prompt.stage === "invoke") return { ...base, activate: true };
      if (prompt.skillId === "guanxing" && prompt.stage === "guanxing_reorder") {
        return { ...base, activate: true, topCardIds: prompt.cards.map((card) => card.id), bottomCardIds: [] };
      }
      if (prompt.skillId === "shelie" && prompt.stage === "shelie_select") {
        const suits = new Set<string>();
        const cardIds = prompt.cards
          .filter((card) => {
            if (suits.has(card.suit)) return false;
            suits.add(card.suit);
            return true;
          })
          .map((card) => card.id);
        return { ...base, activate: true, cardIds };
      }
      if (prompt.skillId === "tuxi") {
        const targetIds = prompt.targetIds.slice(0, 2);
        const tokens = targetIds.map((targetId) => prompt.choices?.find((choice) => choice.ownerId === targetId)?.token);
        return targetIds.length > 0 && tokens.every((token): token is string => Boolean(token))
          ? { ...base, activate: true, targetIds, tokens }
          : { ...base, activate: false };
      }
      if (prompt.skillId === "yiji" && prompt.stage === "yiji_distribute") {
        return {
          ...base,
          activate: true,
          allocations: prompt.cards.map((card) => ({ cardId: card.id, targetId: bot.id })),
        };
      }
      if (prompt.skillId === "buqu" && prompt.stage === "buqu_recovery") {
        const cardId = prompt.allowedCardIds[0];
        if (!cardId) throw new Error("Bot received Buqu recovery without a wound choice");
        return { ...base, activate: true, cardId };
      }
      if (prompt.skillId === "fankui" && prompt.stage === "fankui_select") {
        const choice = prompt.choices?.[0];
        if (!choice) throw new Error("Bot received Fankui without a source-card choice");
        return { ...base, activate: true, tokens: [choice.token] };
      }
      if (prompt.skillId === "ganglie" && prompt.stage === "ganglie_punish") {
        return prompt.allowedCardIds.length >= 2
          ? { ...base, activate: true, cardIds: prompt.allowedCardIds.slice(0, 2) }
          : { ...base, activate: false };
      }
      if (prompt.skillId === "liuli") {
        const cardId = prompt.allowedCardIds[0];
        const targetId = cardId ? prompt.cardTargetIds?.[cardId]?.[0] : undefined;
        return cardId && targetId
          ? { ...base, activate: true, cardId, targetId }
          : { ...base, activate: false };
      }
      if (prompt.skillId === "tianxiang" && prompt.stage === "tianxiang_redirect") {
        const cardId = prompt.allowedCardIds[0];
        const targetId = prompt.targetIds[0];
        return cardId && targetId
          ? { ...base, activate: true, cardId, targetId }
          : { ...base, activate: false };
      }
      if ((prompt.stage === "invoke" && (prompt.skillId === "liegong" || prompt.skillId === "tieqi")) ||
          (prompt.skillId === "shelie" && prompt.stage === "shelie_invoke")) {
        return { ...base, activate: prompt.skillId !== "tieqi" || canRevealJudgment };
      }
      if (prompt.skillId === "beige" && prompt.stage === "beige_source_discard") {
        return { ...base, activate: true, cardIds: prompt.allowedCardIds.slice(0, prompt.minCards) };
      }
      if (prompt.canPass) return { ...base, activate: false };

      const choiceTokens = prompt.options?.[0]
        ? [prompt.options[0]]
        : prompt.choices?.slice(0, Math.max(1, prompt.minCards)).map((choice) => choice.token);
      const cardTargetPair = prompt.minCards === 1 && prompt.minTargets === 1
        ? prompt.allowedCardIds
          .map((cardId) => ({ cardId, targetId: prompt.cardTargetIds?.[cardId]?.[0] }))
          .find((choice) => choice.targetId !== undefined)
        : undefined;
      const cardIds = prompt.choices || cardTargetPair
        ? []
        : prompt.allowedCardIds.slice(0, prompt.minCards);
      const targetIds = cardTargetPair
        ? [cardTargetPair.targetId!]
        : prompt.targetIds.slice(0, prompt.minTargets);
      return {
        ...base,
        activate: true,
        ...(choiceTokens?.length ? { tokens: choiceTokens } : {}),
        ...(cardTargetPair
          ? { cardId: cardTargetPair.cardId }
          : cardIds.length === 1 ? { cardId: cardIds[0] } : cardIds.length > 1 ? { cardIds } : {}),
        ...(targetIds.length === 1 ? { targetId: targetIds[0] } : targetIds.length > 1 ? { targetIds } : {}),
      };
    }
    if (prompt.type === "fanjian_suit") {
      const suit = prompt.suits[0];
      if (!suit) throw new Error("Bot received a Fanjian prompt without suit choices");
      return { type: "choose_fanjian_suit", playerId: bot.id, suit, promptId: prompt.promptId };
    }
    if (prompt.type === "armor") {
      return { type: "activate_armor", playerId: bot.id, activate: canRevealJudgment };
    }
    if (prompt.type === "weapon_action") {
      const base = {
        type: "resolve_weapon" as const,
        playerId: bot.id,
        ...(prompt.promptId ? { promptId: prompt.promptId } : {}),
      };
      const choice = prompt.choices?.[0];
      const selectedCards = prompt.allowedCardIds.slice(0, prompt.minCards);
      return choice
        ? { ...base, activate: true, tokens: [choice.token] }
        : prompt.minCards === 0 || selectedCards.length === prompt.minCards
          ? { ...base, activate: true, cardIds: selectedCards }
          : { ...base, activate: false };
    }
    if (prompt.type === "discard") {
      return { type: "discard", playerId: bot.id, cardIds: prompt.cardIds.slice(0, prompt.count) };
    }
    if (prompt.type === "zone_selection") {
      const choice = prompt.choices[0];
      if (!choice) throw new Error("Bot received a zone-selection prompt without choices");
      return { type: "choose_zone_card", playerId: bot.id, token: choice.token };
    }
    if (prompt.type === "fire_attack_reveal" || prompt.type === "fire_attack_discard") {
      return { type: "choose_hand_card", playerId: bot.id, cardId: prompt.allowedCardIds[0] ?? null };
    }
    if (prompt.type === "amazing_grace_selection") {
      const choice = prompt.cards[0];
      if (!choice) throw new Error("Bot received an Amazing Grace prompt without cards");
      return { type: "choose_amazing_grace_card", playerId: bot.id, cardId: choice.id };
    }
    throw new Error(`Bot ${bot.id} has no actionable prompt`);
  }

  private scheduleBotContinuation(roomId: string): void {
    if (this.botContinuations.has(roomId)) return;
    const scheduledRoom = this.rooms.get(roomId);
    if (!scheduledRoom?.game) return;
    const delay = isDoudizhuGame(scheduledRoom.game)
      ? this.doudizhuBotDelayRangeMs[0] + Math.floor(
          Math.random() *
          (this.doudizhuBotDelayRangeMs[1] - this.doudizhuBotDelayRangeMs[0] + 1),
        )
      : this.botActionDelayMs > 0
        ? this.botActionDelayMs + Math.floor(Math.random() * this.botActionDelayMs)
        : 0;
    const timer = setTimeout(() => {
      this.botContinuations.delete(roomId);
      const room = this.rooms.get(roomId);
      if (!room) return;
      try {
        this.runBots(room, true, true);
      } catch (error) {
        // Keep all timer callbacks exception-safe even if a future change adds
        // a failure outside the per-action recovery boundary above.
        console.error(`Unhandled bot continuation failure in room ${roomId}; closing it`, error);
        this.deleteRoom(room);
        this.changed();
      }
    }, delay);
    timer.unref();
    this.botContinuations.set(roomId, timer);
  }

  private cancelBotContinuation(roomId: string): void {
    const timer = this.botContinuations.get(roomId);
    if (!timer) return;
    clearTimeout(timer);
    this.botContinuations.delete(roomId);
  }

  private deleteRoom(room: Room): void {
    this.cancelBotContinuation(room.id);
    this.botRuns.delete(room.id);
    this.llmBotRuns.delete(room.id);
    this.llmRecommendationRuns.delete(room.id);
    for (const player of room.players) {
      this.clearDisconnectTimer(player.id);
      if (this.roomByUser.get(player.id) === room.id) this.roomByUser.delete(player.id);
    }
    this.rooms.delete(room.id);
  }

  private requireRoom(roomId: string): Room {
    const room = this.rooms.get(roomId);
    if (!room) throw new HttpError(404, "ROOM_NOT_FOUND", "房间不存在");
    return room;
  }

  private requireRoomView(roomId: string, viewerId?: string): RoomView {
    return this.toView(this.requireRoom(roomId), viewerId);
  }

  private requireMember(roomId: string, userId: string): Room {
    const room = this.requireRoom(roomId);
    if (!room.players.some((player) => player.id === userId && !player.departed)) {
      throw new HttpError(403, "NOT_ROOM_MEMBER", "你不在该房间中");
    }
    return room;
  }

  private requireDraftingMember(roomId: string, userId: string): Room {
    const room = this.requireMember(roomId, userId);
    if (room.status !== "drafting" || !room.draft) {
      throw new HttpError(409, "GENERAL_DRAFT_NOT_ACTIVE", "当前不在选将阶段");
    }
    return room;
  }

  private assertNotInRoom(userId: string): void {
    if (this.roomByUser.has(userId)) {
      throw new HttpError(409, "ALREADY_IN_ROOM", "请先离开当前房间");
    }
  }

  private clearDisconnectTimer(userId: string): void {
    const timer = this.disconnectTimers.get(userId);
    if (!timer) return;
    clearTimeout(timer);
    this.disconnectTimers.delete(userId);
  }

  private scheduleDisconnectResolution(userId: string): void {
    this.clearDisconnectTimer(userId);
    const timer = setTimeout(() => {
      this.disconnectTimers.delete(userId);
      const activeRoomId = this.roomByUser.get(userId);
      const activeRoom = activeRoomId ? this.rooms.get(activeRoomId) : undefined;
      const activePlayer = activeRoom?.players.find((candidate) => candidate.id === userId);
      if (activeRoom && activePlayer && !activePlayer.connected) {
        try {
          this.leave(activeRoom.id, userId);
        } catch (error) {
          // A timer must never turn a recoverable room-state race into an
          // uncaught exception that terminates the whole Node.js process.
          console.error("Failed to resolve disconnected room member", error);
        }
      }
    }, this.disconnectGraceMs);
    timer.unref();
    this.disconnectTimers.set(userId, timer);
  }

  private changed(): void {
    const persist = this.snapshotPersistence;
    if (!persist) {
      this.events.emit("changed");
      return;
    }
    const snapshot = this.exportSnapshot();
    const barrier = Promise.resolve().then(() => persist(snapshot));
    this.persistenceBarrier = barrier;
    void barrier.then(() => {
      if (this.persistenceBarrier === barrier) this.events.emit("changed");
    }, () => {});
  }
}
