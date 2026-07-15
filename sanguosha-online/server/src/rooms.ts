import { EventEmitter } from "node:events";
import { randomBytes, randomUUID } from "node:crypto";
import {
  applyAction,
  createGame,
  forfeitPlayer,
  getGameView,
  type GameAction,
  type GameSession,
  type GameView,
} from "@sanguosha/shared";
import { HttpError } from "./errors.js";
import type { PublicUser } from "./users.js";

export type RoomStatus = "waiting" | "playing" | "finished";

export interface RoomPlayerView {
  id: string;
  username: string;
  displayName: string;
  ready: boolean;
  connected: boolean;
  seat: number;
  isBot?: boolean;
}

export interface RoomSummary {
  id: string;
  name: string;
  ownerId: string;
  ownerName: string;
  status: RoomStatus;
  playerCount: number;
  maxPlayers: number;
  createdAt: string;
}

export interface RoomView extends RoomSummary {
  players: RoomPlayerView[];
}

interface RoomPlayer extends RoomPlayerView {
  /** Retained only so a started game's immutable seat roster can be restored. */
  departed: boolean;
}

interface Room {
  id: string;
  name: string;
  ownerId: string;
  status: RoomStatus;
  maxPlayers: number;
  createdAt: string;
  players: RoomPlayer[];
  game?: GameSession;
}

export interface RoomServiceSnapshot {
  readonly version: 1;
  readonly rooms: Array<{
    id: string;
    name: string;
    ownerId: string;
    status: RoomStatus;
    maxPlayers: number;
    createdAt: string;
    players: Array<RoomPlayerView & { departed?: boolean }>;
    game?: GameSession;
  }>;
}

export interface CreateRoomInput {
  name: string;
  maxPlayers?: number;
}

export class RoomService {
  private readonly rooms = new Map<string, Room>();
  private readonly roomByUser = new Map<string, string>();
  private readonly connectedUsers = new Set<string>();
  private readonly disconnectTimers = new Map<string, NodeJS.Timeout>();
  private readonly botRuns = new Set<string>();
  private readonly botContinuations = new Map<string, NodeJS.Immediate>();
  private readonly events = new EventEmitter();

  constructor(
    private readonly disconnectGraceMs = 90_000,
    private readonly botBatchSize = 200,
  ) {
    if (!Number.isSafeInteger(botBatchSize) || botBatchSize < 1) {
      throw new Error("botBatchSize must be a positive safe integer");
    }
  }

  onChanged(listener: () => void): () => void {
    this.events.on("changed", listener);
    return () => this.events.off("changed", listener);
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
    for (const immediate of this.botContinuations.values()) clearImmediate(immediate);
    this.botContinuations.clear();
    this.botRuns.clear();
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
      const room = structuredClone(saved) as Room;
      room.players.forEach((player, seat) => {
        player.isBot ??= false;
        player.departed ??= false;
        if (!player.isBot && !player.departed && this.roomByUser.has(player.id)) {
          throw new Error(`User ${player.id} appears in multiple restored rooms`);
        }
        player.seat = seat;
        player.connected = Boolean(player.isBot && !player.departed);
        if (!player.isBot && !player.departed) this.roomByUser.set(player.id, room.id);
      });
      this.rooms.set(room.id, room);
      if (room.status === "playing") {
        for (const player of room.players) {
          if (!player.isBot && !player.departed) this.scheduleDisconnectResolution(player.id);
        }
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
    return roomId ? this.get(roomId) : undefined;
  }

  create(owner: PublicUser, input: CreateRoomInput): RoomView {
    this.assertNotInRoom(owner.id);
    const id = randomUUID();
    const room: Room = {
      id,
      name: input.name.trim(),
      ownerId: owner.id,
      status: "waiting",
      maxPlayers: input.maxPlayers ?? 8,
      createdAt: new Date().toISOString(),
      players: [this.toPlayer(owner, 0)],
    };
    this.rooms.set(id, room);
    this.roomByUser.set(owner.id, id);
    this.changed();
    return this.toView(room);
  }

  join(roomId: string, user: PublicUser): RoomView {
    const currentRoomId = this.roomByUser.get(user.id);
    if (currentRoomId === roomId) return this.requireRoomView(roomId);
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
    return this.toView(room);
  }

  addBot(roomId: string, ownerId: string): RoomView {
    const room = this.requireMember(roomId, ownerId);
    if (room.ownerId !== ownerId) throw new HttpError(403, "NOT_ROOM_OWNER", "只有房主可以添加机器人");
    if (room.status !== "waiting") throw new HttpError(409, "ROOM_ALREADY_STARTED", "游戏已经开始");
    if (room.players.length >= room.maxPlayers) throw new HttpError(409, "ROOM_FULL", "房间已满");
    const id = randomUUID();
    const botNumber = room.players.filter((player) => player.isBot).length + 1;
    room.players.push({
      id,
      username: `bot_${id.slice(0, 8)}`,
      displayName: `机器人 ${botNumber}`,
      ready: true,
      connected: true,
      seat: room.players.length,
      isBot: true,
      departed: false,
    });
    this.changed();
    return this.toView(room);
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
    return this.toView(room);
  }

  leave(roomId: string, userId: string): void {
    const room = this.requireMember(roomId, userId);
    this.clearDisconnectTimer(userId);
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
      // A dead player can safely leave without changing the still-running
      // identity match. Only a living departure is a forfeiture.
      if (gamePlayer.alive) {
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
    return this.toView(room);
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

    room.game = createGame({
      playerIds: room.players.map((player) => player.id),
      seed: randomBytes(32).toString("hex"),
    });
    room.status = "playing";
    this.runBots(room);
    if (!this.rooms.has(room.id)) {
      throw new HttpError(409, "ROOM_ABORTED", "房间因无法恢复的机器人错误已关闭");
    }
    this.changed();
    return this.toView(room);
  }

  applyAction(roomId: string, userId: string, action: GameAction): GameView {
    const room = this.requireMember(roomId, userId);
    if (room.status !== "playing" || !room.game) {
      throw new HttpError(409, "GAME_NOT_IN_PROGRESS", "游戏尚未开始或已经结束");
    }
    if (action.playerId !== userId) {
      throw new HttpError(403, "PLAYER_MISMATCH", "不能替其他玩家执行操作");
    }

    room.game = applyAction(room.game, action);
    this.runBots(room);
    if (!this.rooms.has(room.id)) {
      throw new HttpError(409, "ROOM_ABORTED", "房间因无法恢复的机器人错误已关闭");
    }
    if (room.game.status === "finished") room.status = "finished";
    this.changed();
    return getGameView(room.game, userId);
  }

  getGameView(roomId: string, userId: string): GameView | undefined {
    const room = this.requireMember(roomId, userId);
    return room.game ? getGameView(room.game, userId) : undefined;
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
    if (!connected && room?.status === "playing") {
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
      ownerId: room.ownerId,
      ownerName: activePlayers.find((player) => player.id === room.ownerId)?.displayName ?? "",
      status: room.status,
      playerCount: activePlayers.length,
      maxPlayers: room.maxPlayers,
      createdAt: room.createdAt,
    };
  }

  private toView(room: Room): RoomView {
    return {
      ...this.toSummary(room),
      players: room.players
        .filter((player) => !player.departed)
        .map(({ departed: _departed, ...player }) => ({ ...player })),
    };
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

  private runBots(room: Room, notify = false): void {
    if (room.status !== "playing" || !room.game || this.rooms.get(room.id) !== room) return;
    if (this.botRuns.has(room.id)) return;
    this.cancelBotContinuation(room.id);
    this.botRuns.add(room.id);

    let steps = 0;
    let mutations = 0;
    let aborted = false;
    try {
      while (steps < this.botBatchSize && room.game.status === "playing") {
        const bot = this.actingBot(room);
        if (!bot) break;
        steps += 1;
        try {
          room.game = applyAction(room.game, this.actionForBot(room.game, bot));
          mutations += 1;
        } catch (error) {
          // A bad heuristic or an unforeseen rule edge must not escape from an
          // asynchronous continuation and terminate the Node.js process. The
          // offending bot leaves under the same authoritative rule as a human.
          console.error(`Bot ${bot.id} failed in room ${room.id}; eliminating it`, error);
          try {
            const gamePlayer = room.game.players.find((player) => player.id === bot.id);
            if (!gamePlayer?.alive) throw new Error("Failed bot is not a living game player");
            room.game = forfeitPlayer(room.game, bot.id);
            mutations += 1;
          } catch (recoveryError) {
            console.error(`Room ${room.id} could not recover from a bot failure; closing it`, recoveryError);
            this.deleteRoom(room);
            aborted = true;
            break;
          }
        }
      }
      if (!aborted && room.game.status === "finished") room.status = "finished";
    } finally {
      this.botRuns.delete(room.id);
    }

    if (aborted) {
      this.changed();
      return;
    }
    if (steps >= this.botBatchSize && this.actingBot(room)) {
      this.scheduleBotContinuation(room.id);
    }
    if (notify && mutations > 0) this.changed();
  }

  private actingBot(room: Room): RoomPlayer | undefined {
    if (room.status !== "playing" || !room.game || room.game.status !== "playing") return undefined;
    const actingPlayerId = room.game.pendingResponse?.targetId
      ?? (room.game.turn.phase !== "respond" ? room.game.currentPlayerId : undefined);
    if (!actingPlayerId) return undefined;
    return room.players.find((player) =>
      player.isBot && !player.departed && player.id === actingPlayerId
    );
  }

  private actionForBot(game: GameSession, bot: RoomPlayer): GameAction {
    const prompt = getGameView(game, bot.id).prompt;
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
        const targetId = qingnang.targetIds.includes(bot.id) ? bot.id : qingnang.targetIds[0];
        const cardIds = costCards(qingnang.cardIds, 1);
        if (targetId && cardIds.length === 1) {
          return { type: "use_skill", playerId: bot.id, skillId: "qingnang", cardIds, targetId };
        }
      }
      const jieyin = prompt.skills.find((hint) => hint.skillId === "jieyin");
      if (jieyin && player.hp < player.maxHp) {
        const cardIds = costCards(jieyin.cardIds, 2);
        const targetId = jieyin.targetIds[0];
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
        const targetId = rende.targetIds
          .map((targetId) => game.players.find((candidate) => candidate.id === targetId))
          .filter((candidate) => candidate !== undefined)
          .sort((left, right) => left.hand.length - right.hand.length)[0]?.id;
        if (targetId && cardIds.length === needed) {
          return { type: "use_skill", playerId: bot.id, skillId: "rende", cardIds, targetId };
        }
      }

      const fanjian = prompt.skills.find((hint) => hint.skillId === "fanjian");
      if (fanjian?.targetIds[0]) {
        return { type: "use_skill", playerId: bot.id, skillId: "fanjian", targetId: fanjian.targetIds[0] };
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

      const preferred = prompt.cards.find((hint) => hint.kind === "peach")
        ?? prompt.cards.find((hint) => hint.kind === "ex_nihilo")
        ?? prompt.cards.find((hint) => hint.kind.includes("horse"))
        ?? prompt.cards[0];
      if (preferred) {
        return preferred.targetMode === "ordered-two"
          ? { type: "play_card", playerId: bot.id, cardId: preferred.cardId, targetIds: preferred.targetPairs?.[0] ? [...preferred.targetPairs[0]] : [] }
          : preferred.targetMode === "up-to-two" || preferred.targetMode === "up-to-three"
            ? { type: "play_card", playerId: bot.id, cardId: preferred.cardId, targetIds: preferred.targetIds.slice(0, preferred.targetMode === "up-to-three" ? 3 : 2) }
            : { type: "play_card", playerId: bot.id, cardId: preferred.cardId, targetId: preferred.targetIds[0] };
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
          targetId: prompt.zhangBaSlash.targetIds[0],
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
        const targetId = (activeSkill.cardTargetIds?.[skillCardId] ?? activeSkill.targetIds)[0];
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
    if (prompt.type === "respond") {
      const physicalCardId = prompt.responseKind === "slash" ? prompt.slashCardIds[0] : prompt.dodgeCardIds[0];
      if (physicalCardId) return { type: "respond", playerId: bot.id, cardId: physicalCardId };
      const skillResponse = prompt.skillResponses.find((hint) => hint.cardIds.length > 0);
      if (skillResponse) {
        return {
          type: "use_skill",
          playerId: bot.id,
          skillId: skillResponse.skillId,
          cardIds: [skillResponse.cardIds[0]!],
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
      const jijiu = prompt.skillResponses.find((hint) => hint.skillId === "jijiu" && hint.cardIds.length > 0);
      return jijiu
        ? { type: "use_skill", playerId: bot.id, skillId: "jijiu", cardIds: [jijiu.cardIds[0]!] }
        : { type: "respond", playerId: bot.id, cardId: null };
    }
    if (prompt.type === "nullification") {
      return { type: "respond", playerId: bot.id, cardId: prompt.allowedCardIds[0] ?? null };
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
          prompt.skillId === "luoshen" ||
          prompt.skillId === "jizhi" ||
          prompt.skillId === "lianying" ||
          prompt.skillId === "xiaoji" ||
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
      return { ...base, activate: true };
    }
    if (prompt.type === "fanjian_suit") {
      const suit = prompt.suits[0];
      if (!suit) throw new Error("Bot received a Fanjian prompt without suit choices");
      return { type: "choose_fanjian_suit", playerId: bot.id, suit, promptId: prompt.promptId };
    }
    if (prompt.type === "armor") {
      return { type: "activate_armor", playerId: bot.id, activate: true };
    }
    if (prompt.type === "weapon_action") {
      const choice = prompt.choices?.[0];
      const selectedCards = prompt.allowedCardIds.slice(0, prompt.minCards);
      return choice
        ? { type: "resolve_weapon", playerId: bot.id, activate: true, tokens: [choice.token] }
        : prompt.minCards === 0 || selectedCards.length === prompt.minCards
          ? { type: "resolve_weapon", playerId: bot.id, activate: true, cardIds: selectedCards }
          : { type: "resolve_weapon", playerId: bot.id, activate: false };
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
    const immediate = setImmediate(() => {
      this.botContinuations.delete(roomId);
      const room = this.rooms.get(roomId);
      if (!room) return;
      try {
        this.runBots(room, true);
      } catch (error) {
        // Keep all timer callbacks exception-safe even if a future change adds
        // a failure outside the per-action recovery boundary above.
        console.error(`Unhandled bot continuation failure in room ${roomId}; closing it`, error);
        this.deleteRoom(room);
        this.changed();
      }
    });
    immediate.unref();
    this.botContinuations.set(roomId, immediate);
  }

  private cancelBotContinuation(roomId: string): void {
    const immediate = this.botContinuations.get(roomId);
    if (!immediate) return;
    clearImmediate(immediate);
    this.botContinuations.delete(roomId);
  }

  private deleteRoom(room: Room): void {
    this.cancelBotContinuation(room.id);
    this.botRuns.delete(room.id);
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

  private requireRoomView(roomId: string): RoomView {
    return this.toView(this.requireRoom(roomId));
  }

  private requireMember(roomId: string, userId: string): Room {
    const room = this.requireRoom(roomId);
    if (!room.players.some((player) => player.id === userId && !player.departed)) {
      throw new HttpError(403, "NOT_ROOM_MEMBER", "你不在该房间中");
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
    this.events.emit("changed");
  }
}
