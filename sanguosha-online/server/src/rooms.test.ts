import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_COMPLETE_RULE_CONFIG,
  FULL_GENERAL_CATALOG,
  FULL_GENERAL_PACKS,
  applyAction,
  createGeneralDraft,
  createGameFromDraft,
  getCardDefinition,
  getGameView,
  grantSkill,
  type Card,
  type CardKind,
  type FullGeneralId,
  type GameAction,
  type GameSession,
  type GeneralDraftState,
  type RoomRuleConfig,
} from "@sanguosha/shared";
import { HttpError } from "./errors.js";
import {
  DEFAULT_SERVER_ROOM_RULE_CONFIG,
  RoomService,
  type RoomPlayerView,
} from "./rooms.js";
import type { PublicUser } from "./users.js";

function user(id: string, username: string): PublicUser {
  const now = new Date().toISOString();
  return {
    id,
    username,
    displayName: username,
    role: "player",
    disabled: false,
    createdAt: now,
    updatedAt: now,
  };
}

const owner = user("11111111-1111-4111-8111-111111111111", "owner");
const guest = user("22222222-2222-4222-8222-222222222222", "guest");
const third = user("33333333-3333-4333-8333-333333333333", "third");
const fourth = user("44444444-4444-4444-8444-444444444444", "fourth");
const fifth = user("55555555-5555-4555-8555-555555555555", "fifth");

function standardCard(id: string, kind: CardKind, suit: Card["suit"] = "spade"): Card {
  return { id, kind, ...getCardDefinition(kind), suit, rank: 7 };
}

interface InternalRoom {
  status: "waiting" | "drafting" | "playing" | "finished";
  players: Array<RoomPlayerView & { departed: boolean }>;
  ruleConfig: RoomRuleConfig;
  draft?: GeneralDraftState;
  game?: GameSession;
}

interface RoomInternals {
  rooms: Map<string, InternalRoom>;
  botContinuations: Map<string, NodeJS.Immediate>;
  runBots: (room: InternalRoom) => void;
  actionForBot: (game: GameSession, bot: RoomPlayerView & { departed: boolean }) => GameAction;
}

function roomInternals(rooms: RoomService): RoomInternals {
  return rooms as unknown as RoomInternals;
}

function startHumanRoom(rooms: RoomService, participants: PublicUser[]): string {
  const [roomOwner, ...guests] = participants;
  if (!roomOwner) throw new Error("Missing room owner");
  const room = rooms.create(roomOwner, { name: "多人韧性", maxPlayers: participants.length });
  for (const participant of guests) rooms.join(room.id, participant);
  for (const participant of participants) {
    rooms.setConnected(participant.id, true);
    rooms.setReady(room.id, participant.id, true);
  }
  rooms.start(room.id, roomOwner.id);
  return room.id;
}

const CHOICE_RULE_CONFIG: RoomRuleConfig = {
  ...DEFAULT_SERVER_ROOM_RULE_CONFIG,
  generalSelection: {
    mode: "choice",
    candidatesPerPlayer: 3,
    allowDuplicateGenerals: false,
  },
};

describe("RoomService", () => {
  it("lets one human add a ready bot and start a game that auto-plays bot prompts", () => {
    const rooms = new RoomService();
    const created = rooms.create(owner, { name: "单人机器人局", maxPlayers: 2 });
    rooms.setConnected(owner.id, true);
    const withBot = rooms.addBot(created.id, owner.id);
    const bot = withBot.players.find((player) => player.isBot);
    if (!bot) throw new Error("Bot missing");
    expect(bot).toMatchObject({ ready: true, connected: true, isBot: true });
    rooms.setReady(created.id, owner.id, true);

    const started = rooms.start(created.id, owner.id);

    expect(started.status).toBe("playing");
    const ownerView = rooms.getGameView(created.id, owner.id)!;
    expect(ownerView.players.find((player) => player.id === owner.id)?.hand).not.toBeNull();
    expect(ownerView.players.find((player) => player.id === bot.id)?.hand).toBeNull();
    expect(ownerView.prompt.type === "play" ? ownerView.prompt.playerId : ownerView.prompt.type).not.toBe(bot.id);
  });

  it("finishes bot games spanning all 66 generals without an illegal action", () => {
    const config: RoomRuleConfig = {
      ...DEFAULT_COMPLETE_RULE_CONFIG,
      enabledGeneralPacks: [...FULL_GENERAL_PACKS],
      generalSelection: { mode: "random", candidatesPerPlayer: 1, allowDuplicateGenerals: false },
      godFactionChoice: false,
    };
    const botError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      for (let offset = 0; offset < FULL_GENERAL_CATALOG.length; offset += 10) {
        const generals = FULL_GENERAL_CATALOG.slice(offset, offset + 10);
        const participants = generals.map((_general, index) => user(
          `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
          `bot-${index + 1}`,
        ));
        const rooms = new RoomService(90_000, 10_000);
        const created = rooms.create(participants[0]!, {
          name: `全武将机器人-${offset}`,
          maxPlayers: participants.length,
          ruleConfig: config,
        });
        for (const participant of participants.slice(1)) rooms.join(created.id, participant);
        for (const participant of participants) {
          rooms.setConnected(participant.id, true);
          rooms.setReady(created.id, participant.id, true);
        }
        rooms.start(created.id, participants[0]!.id);

        const internals = roomInternals(rooms);
        const room = internals.rooms.get(created.id)!;
        const playerIds = participants.map((participant) => participant.id);
        const draft: GeneralDraftState = {
          version: 1,
          playerIds,
          allowDuplicateGenerals: false,
          godFactionChoice: false,
          candidates: Object.fromEntries(playerIds.map((playerId, index) => [playerId, [generals[index]!.id]])),
          selections: Object.fromEntries(playerIds.map((playerId, index) => [playerId, generals[index]!.id])),
          factionSelections: Object.fromEntries(playerIds.map((playerId, index) => {
            const faction = generals[index]!.faction;
            return [playerId, faction === "selectable" ? "qun" : faction];
          })) as GeneralDraftState["factionSelections"],
          stage: "complete",
          rng: { key: String(offset + 1).padStart(64, "0"), counter: 0 },
        };
        room.ruleConfig = config;
        room.game = createGameFromDraft({ draft, config });
        for (const player of room.players) player.isBot = true;

        internals.runBots(room);
        expect(room.game.status, generals.map((general) => general.id).join(",")).toBe("finished");
      }
      expect(botError).not.toHaveBeenCalled();
    } finally {
      botError.mockRestore();
    }
  }, 15_000);

  it("keeps the production baseline on immediate standard/SP random selection", () => {
    expect(DEFAULT_SERVER_ROOM_RULE_CONFIG).toMatchObject({
      enabledGeneralPacks: ["standard", "sp"],
      generalSelection: { mode: "random", candidatesPerPlayer: 1, allowDuplicateGenerals: false },
    });
    const rooms = new RoomService();
    const room = rooms.create(owner, { name: "默认随机局", maxPlayers: 2 });
    rooms.join(room.id, guest);
    for (const player of [owner, guest]) {
      rooms.setConnected(player.id, true);
      rooms.setReady(room.id, player.id, true);
    }

    const started = rooms.start(room.id, owner.id);
    const internal = roomInternals(rooms).rooms.get(room.id);
    expect(started).toMatchObject({ status: "playing", ruleConfig: DEFAULT_SERVER_ROOM_RULE_CONFIG });
    expect(started).not.toHaveProperty("draft");
    expect(internal?.draft).toBeUndefined();
    expect(internal?.game?.players.every((player) => player.generalId !== null)).toBe(true);
    expect(
      (internal?.game?.deck.length ?? 0) +
      (internal?.game?.players.reduce((count, player) => count + player.hand.length, 0) ?? 0),
    ).toBe(160);

    (started.ruleConfig.enabledGeneralPacks as unknown as string[]).push("god");
    expect(rooms.getForUser(owner.id)?.ruleConfig.enabledGeneralPacks).toEqual(["standard", "sp"]);
  });

  it("keeps choice candidates private and accepts only each member's own authoritative choice", () => {
    const rooms = new RoomService();
    const room = rooms.create(owner, { name: "私密选将", maxPlayers: 2, ruleConfig: CHOICE_RULE_CONFIG });
    rooms.join(room.id, guest);
    for (const player of [owner, guest]) {
      rooms.setConnected(player.id, true);
      rooms.setReady(room.id, player.id, true);
    }

    const started = rooms.start(room.id, owner.id);
    const ownerDraft = started.draft!;
    const guestDraft = rooms.getForUser(guest.id)!.draft!;
    expect(started.status).toBe("drafting");
    expect(rooms.get(room.id)).not.toHaveProperty("draft");
    expect(ownerDraft.candidates).toHaveLength(3);
    expect(guestDraft.candidates).toHaveLength(3);
    const lordId = ownerDraft.players.find((player) => player.role === "lord")?.playerId;
    expect(lordId).toMatch(/.+/);
    expect(ownerDraft.currentPlayerId).toBe(lordId);
    expect(guestDraft.currentPlayerId).toBe(lordId);
    expect(ownerDraft.players.find((player) => player.playerId === owner.id)?.role).not.toBeNull();
    expect(guestDraft.players.find((player) => player.playerId === guest.id)?.role).not.toBeNull();
    expect(ownerDraft.players.find((player) => player.playerId === guest.id)?.generalId).toBeNull();
    expect(guestDraft.players.find((player) => player.playerId === owner.id)?.generalId).toBeNull();

    const ownerGeneral = ownerDraft.candidates[0]!;
    const guestGeneral = guestDraft.candidates[0]!;
    expect(() => rooms.chooseGeneral(room.id, owner.id, guestGeneral)).toThrowError(HttpError);
    expect(() => rooms.chooseGeneral(room.id, third.id, ownerGeneral)).toThrowError(HttpError);
    const first = lordId === owner.id ? { player: owner, general: ownerGeneral } : { player: guest, general: guestGeneral };
    const second = lordId === owner.id ? { player: guest, general: guestGeneral } : { player: owner, general: ownerGeneral };
    expect(() => rooms.chooseGeneral(room.id, second.player.id, second.general)).toThrowError(HttpError);
    rooms.chooseGeneral(room.id, first.player.id, first.general);
    expect(rooms.getForUser(second.player.id)?.draft?.players.find((player) => player.playerId === first.player.id)?.generalId).toBeNull();

    const completed = rooms.chooseGeneral(room.id, second.player.id, second.general);
    const game = roomInternals(rooms).rooms.get(room.id)?.game;
    expect(completed).toMatchObject({ status: "playing" });
    expect(completed).not.toHaveProperty("draft");
    expect(game?.players.map((player) => player.generalId)).toEqual([ownerGeneral, guestGeneral]);
    expect(game?.players.find((player) => player.role === "lord")?.id).toBe(lordId);
    expect(
      (game?.deck.length ?? 0) + (game?.players.reduce((count, player) => count + player.hand.length, 0) ?? 0),
    ).toBe(160);
  });

  it("auto-selects bots while locking the drafting roster and readiness", () => {
    const rooms = new RoomService();
    const room = rooms.create(owner, { name: "机器人选将", maxPlayers: 3, ruleConfig: CHOICE_RULE_CONFIG });
    const withBot = rooms.addBot(room.id, owner.id);
    const bot = withBot.players.find((player) => player.isBot)!;
    rooms.setConnected(owner.id, true);
    rooms.setReady(room.id, owner.id, true);

    const drafting = rooms.start(room.id, owner.id);
    expect(drafting).toMatchObject({ status: "drafting" });
    expect(drafting.draft?.currentPlayerId).toBe(owner.id);
    expect(drafting.draft?.players.find((player) => player.playerId === owner.id)).toMatchObject({
      selected: false,
      generalId: null,
    });
    expect(drafting.draft?.players.find((player) => player.playerId === bot.id)).toMatchObject({
      generalId: null,
    });
    expect(() => rooms.join(room.id, guest)).toThrowError(HttpError);
    expect(() => rooms.addBot(room.id, owner.id)).toThrowError(HttpError);
    expect(() => rooms.removeBot(room.id, owner.id, bot.id)).toThrowError(HttpError);
    expect(() => rooms.setReady(room.id, owner.id, false)).toThrowError(HttpError);

    const completed = rooms.chooseGeneral(room.id, owner.id, drafting.draft!.candidates[0]!);
    expect(completed.status).toBe("playing");
    expect(roomInternals(rooms).rooms.get(room.id)?.game?.players.find((player) => player.id === bot.id)?.generalId).not.toBeNull();
  });

  it("keeps God choices private until the selecting player commits a playable faction", () => {
    const godRules: RoomRuleConfig = {
      ...DEFAULT_COMPLETE_RULE_CONFIG,
      enabledGeneralPacks: ["standard", "god"],
      generalSelection: { mode: "choice", candidatesPerPlayer: 10, allowDuplicateGenerals: false },
    };
    const participants = [owner, guest, third];
    const rooms = new RoomService();
    const room = rooms.create(owner, { name: "神势力选择", maxPlayers: 3, ruleConfig: godRules });
    rooms.join(room.id, guest);
    rooms.join(room.id, third);
    for (const player of participants) {
      rooms.setConnected(player.id, true);
      rooms.setReady(room.id, player.id, true);
    }
    rooms.start(room.id, owner.id);

    const privateViews = new Map(participants.map((player) => [player.id, rooms.getForUser(player.id)!.draft!]));
    const godOwner = participants.find((player) =>
      privateViews.get(player.id)!.candidates.some((generalId) => generalId.startsWith("shen_")),
    )!;
    const selected = new Map<string, string>();
    for (let index = 0; index < participants.length; index += 1) {
      const currentPlayerId = rooms.getForUser(owner.id)!.draft!.currentPlayerId!;
      const candidates = privateViews.get(currentPlayerId)!.candidates;
      const generalId = currentPlayerId === godOwner.id
        ? candidates.find((candidate) => candidate.startsWith("shen_"))!
        : candidates.find((candidate) => !candidate.startsWith("shen_"))!;
      selected.set(currentPlayerId, generalId);
      rooms.chooseGeneral(room.id, currentPlayerId, generalId);
    }

    expect(rooms.getForUser(godOwner.id)?.draft?.players.find((player) => player.playerId === godOwner.id)).toMatchObject({
      generalId: selected.get(godOwner.id),
      needsFaction: true,
      faction: null,
    });
    const observer = participants.find((player) => player.id !== godOwner.id)!;
    expect(rooms.getForUser(observer.id)?.draft?.players.find((player) => player.playerId === godOwner.id)?.generalId).toBeNull();
    expect(() => rooms.chooseGodFaction(room.id, observer.id, "wei")).toThrowError(HttpError);

    const completed = rooms.chooseGodFaction(room.id, godOwner.id, "wu");
    const god = roomInternals(rooms).rooms.get(room.id)?.game?.players.find((player) => player.id === godOwner.id);
    expect(completed.status).toBe("playing");
    expect(god).toMatchObject({ generalId: selected.get(godOwner.id), godFaction: "wu" });
  });

  it("cancels a draft and clears every private candidate when a member leaves", () => {
    const rooms = new RoomService();
    const room = rooms.create(owner, { name: "离席取消选将", maxPlayers: 3, ruleConfig: CHOICE_RULE_CONFIG });
    rooms.join(room.id, guest);
    rooms.join(room.id, third);
    for (const player of [owner, guest, third]) {
      rooms.setConnected(player.id, true);
      rooms.setReady(room.id, player.id, true);
    }
    const drafting = rooms.start(room.id, owner.id);
    const currentPlayerId = drafting.draft!.currentPlayerId!;
    const currentDraft = rooms.getForUser(currentPlayerId)!.draft!;
    rooms.chooseGeneral(room.id, currentPlayerId, currentDraft.candidates[0]!);

    rooms.leave(room.id, guest.id);

    expect(rooms.get(room.id)).toMatchObject({
      status: "waiting",
      playerCount: 2,
      players: [
        { id: owner.id, ready: false },
        { id: third.id, ready: false },
      ],
    });
    expect(rooms.getForUser(owner.id)).not.toHaveProperty("draft");
    expect(roomInternals(rooms).rooms.get(room.id)?.draft).toBeUndefined();
  });

  it("uses the same draft reset after a disconnect grace timeout", () => {
    vi.useFakeTimers();
    try {
      const rooms = new RoomService(1_000);
      const room = rooms.create(owner, { name: "选将断线", maxPlayers: 2, ruleConfig: CHOICE_RULE_CONFIG });
      rooms.join(room.id, guest);
      for (const player of [owner, guest]) {
        rooms.setConnected(player.id, true);
        rooms.setReady(room.id, player.id, true);
      }
      rooms.start(room.id, owner.id);

      rooms.setConnected(guest.id, false);
      vi.advanceTimersByTime(1_000);

      expect(rooms.get(room.id)).toMatchObject({
        status: "waiting",
        playerCount: 1,
        players: [{ id: owner.id, ready: false }],
      });
      expect(rooms.getForUser(owner.id)).not.toHaveProperty("draft");
    } finally {
      vi.useRealTimers();
    }
  });

  it("validates and resumes a restored draft, including a bot's God faction", () => {
    const godRules: RoomRuleConfig = {
      ...DEFAULT_COMPLETE_RULE_CONFIG,
      enabledGeneralPacks: ["standard", "god"],
      generalSelection: { mode: "choice", candidatesPerPlayer: 10, allowDuplicateGenerals: false },
    };
    const seedRooms = new RoomService();
    const room = seedRooms.create(owner, { name: "恢复选将", maxPlayers: 2, ruleConfig: godRules });
    const bot = seedRooms.addBot(room.id, owner.id).players.find((player) => player.isBot)!;
    const snapshot = seedRooms.exportSnapshot();
    const saved = snapshot.rooms[0]!;
    saved.status = "drafting";
    saved.draft = structuredClone(createGeneralDraft({
      playerIds: saved.players.map((player) => player.id),
      config: godRules,
      rng: { key: "3".padStart(64, "0"), counter: 0 },
    }));
    const botCandidates = saved.draft.candidates[bot.id] as FullGeneralId[];
    const botGodIndex = botCandidates.findIndex((generalId) => generalId.startsWith("shen_"));
    expect(botGodIndex).toBeGreaterThanOrEqual(0);
    [botCandidates[0], botCandidates[botGodIndex]] = [botCandidates[botGodIndex]!, botCandidates[0]!];
    const botGodId = botCandidates[0]!;

    const corrupt = structuredClone(snapshot);
    (corrupt.rooms[0]!.draft as unknown as { playerIds: string[] }).playerIds = [
      ...corrupt.rooms[0]!.draft!.playerIds,
    ].reverse();
    expect(() => new RoomService().restoreSnapshot(corrupt)).toThrow(/roster/);

    const restored = new RoomService();
    restored.restoreSnapshot(structuredClone(snapshot));
    const ownerView = restored.getForUser(owner.id)!;
    expect(ownerView).toMatchObject({ status: "drafting" });
    expect(ownerView.draft?.players.find((player) => player.playerId === bot.id)).toMatchObject({
      selected: false,
      generalId: null,
    });

    const completed = restored.chooseGeneral(room.id, owner.id, ownerView.draft!.candidates[0]!);
    expect(completed.status).toBe("playing");
    expect(roomInternals(restored).rooms.get(room.id)?.game?.players.find((player) => player.id === bot.id)).toMatchObject({
      generalId: botGodId,
      godFaction: "qun",
    });
  });

  it("rejects invalid room rules at creation", () => {
    expect(() => new RoomService().create(owner, {
      name: "非法配置",
      ruleConfig: {
        ...DEFAULT_SERVER_ROOM_RULE_CONFIG,
        enabledGeneralPacks: ["sp"],
      },
    })).toThrowError(HttpError);
  });

  it("allows only the owner to remove a waiting-room bot", () => {
    const rooms = new RoomService();
    const room = rooms.create(owner, { name: "机器人管理", maxPlayers: 3 });
    const withBot = rooms.addBot(room.id, owner.id);
    const bot = withBot.players.find((player) => player.isBot)!;
    expect(() => rooms.removeBot(room.id, guest.id, bot.id)).toThrowError(HttpError);
    expect(rooms.removeBot(room.id, owner.id, bot.id).players).toHaveLength(1);
  });

  it("deletes a room when its last human leaves instead of transferring ownership to a bot", () => {
    const rooms = new RoomService();
    const room = rooms.create(owner, { name: "机器人清理", maxPlayers: 2 });
    rooms.addBot(room.id, owner.id);
    rooms.leave(room.id, owner.id);
    expect(rooms.get(room.id)).toBeUndefined();
    expect(rooms.list()).toEqual([]);
  });

  it("closes a started bot room explicitly when its last human leaves", () => {
    const rooms = new RoomService();
    const room = rooms.create(owner, { name: "开局后清理", maxPlayers: 2 });
    rooms.setConnected(owner.id, true);
    rooms.addBot(room.id, owner.id);
    rooms.setReady(room.id, owner.id, true);
    rooms.start(room.id, owner.id);

    rooms.leave(room.id, owner.id);

    expect(rooms.get(room.id)).toBeUndefined();
    expect(rooms.allRoomIds()).not.toContain(room.id);
  });

  it("enforces membership/readiness/ownership and creates a private game view", () => {
    const rooms = new RoomService();
    const room = rooms.create(owner, { name: "测试房", maxPlayers: 2 });
    rooms.join(room.id, guest);
    rooms.setConnected(owner.id, true);
    rooms.setConnected(guest.id, true);
    rooms.setReady(room.id, owner.id, true);
    rooms.setReady(room.id, guest.id, true);

    expect(() => rooms.start(room.id, guest.id)).toThrowError(HttpError);
    const started = rooms.start(room.id, owner.id);
    expect(started.status).toBe("playing");

    const ownerView = rooms.getGameView(room.id, owner.id)!;
    const guestView = rooms.getGameView(room.id, guest.id)!;
    expect(ownerView.players.find((player) => player.id === owner.id)?.hand).not.toBeNull();
    expect(ownerView.players.find((player) => player.id === guest.id)?.hand).toBeNull();
    expect(guestView.players.find((player) => player.id === guest.id)?.hand).not.toBeNull();
    rooms.leave(room.id, guest.id);
    expect(rooms.get(room.id)).toMatchObject({ status: "finished", playerCount: 1 });
    expect(rooms.getGameView(room.id, owner.id)).toMatchObject({
      status: "finished",
      prompt: { type: "finished" },
    });
  });

  it("rejects actions that impersonate another account", () => {
    const rooms = new RoomService();
    const room = rooms.create(owner, { name: "防作弊" });
    rooms.join(room.id, guest);
    rooms.setConnected(owner.id, true);
    rooms.setConnected(guest.id, true);
    rooms.setReady(room.id, owner.id, true);
    rooms.setReady(room.id, guest.id, true);
    rooms.start(room.id, owner.id);

    const view = rooms.getGameView(room.id, owner.id)!;
    expect(() => rooms.applyAction(room.id, owner.id, {
      expectedRevision: view.revision,
      expectedPromptId: view.actionPromptId,
      action: { type: "end_play", playerId: guest.id },
    })).toThrowError(/不能替其他玩家/);
  });

  it("rejects a replayed revision without changing authoritative state", () => {
    const rooms = new RoomService();
    const roomId = startHumanRoom(rooms, [owner, guest]);
    const game = roomInternals(rooms).rooms.get(roomId)?.game;
    if (!game) throw new Error("Missing game state");
    game.currentPlayerId = owner.id;
    game.turn = { ...game.turn, playerId: owner.id, phase: "play", requiredDiscardCount: 0 };
    game.pendingResponse = null;

    const view = rooms.getGameView(roomId, owner.id)!;
    const input = {
      expectedRevision: view.revision,
      expectedPromptId: view.actionPromptId,
      action: { type: "end_play", playerId: owner.id } as const,
    };
    expect(rooms.applyAction(roomId, owner.id, input).revision).toBe(view.revision + 1);
    const settled = rooms.exportSnapshot();

    let replayError: unknown;
    try {
      rooms.applyAction(roomId, owner.id, input);
    } catch (error) {
      replayError = error;
    }
    expect(replayError).toMatchObject({ status: 409, code: "STALE_GAME_ACTION" });
    expect(rooms.exportSnapshot()).toEqual(settled);
  });

  it("publishes only after the latest snapshot persistence barrier succeeds", async () => {
    const rooms = new RoomService();
    const barriers: Array<() => void> = [];
    rooms.setSnapshotPersistence(() => new Promise<void>((resolve) => barriers.push(resolve)));
    const changed = vi.fn();
    rooms.onChanged(changed);

    rooms.create(owner, { name: "持久化栅栏" });
    rooms.setConnected(owner.id, true);
    await Promise.resolve();
    expect(barriers).toHaveLength(2);

    barriers[0]!();
    await Promise.resolve();
    expect(changed).not.toHaveBeenCalled();
    barriers[1]!();
    await rooms.waitForPersistence();
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it("gives disconnected players a reconnect grace period, then forfeits", () => {
    vi.useFakeTimers();
    try {
      const rooms = new RoomService(1_000);
      const room = rooms.create(owner, { name: "断线托管", maxPlayers: 2 });
      rooms.join(room.id, guest);
      rooms.setConnected(owner.id, true);
      rooms.setConnected(guest.id, true);
      rooms.setReady(room.id, owner.id, true);
      rooms.setReady(room.id, guest.id, true);
      rooms.start(room.id, owner.id);

      rooms.setConnected(guest.id, false);
      vi.advanceTimersByTime(900);
      rooms.setConnected(guest.id, true);
      vi.advanceTimersByTime(200);
      expect(rooms.get(room.id)?.status).toBe("playing");

      rooms.setConnected(guest.id, false);
      vi.advanceTimersByTime(1_000);
      expect(rooms.get(room.id)).toMatchObject({ status: "finished", playerCount: 1 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("eliminates a leaving human but keeps a five-player identity game running", () => {
    const participants = [owner, guest, third, fourth, fifth];
    const rooms = new RoomService();
    const roomId = startHumanRoom(rooms, participants);
    const internals = roomInternals(rooms);
    const game = internals.rooms.get(roomId)?.game;
    const loyalist = game?.players.find((player) => player.role === "loyalist");
    if (!loyalist) throw new Error("Missing Loyalist");

    rooms.leave(roomId, loyalist.id);

    expect(rooms.get(roomId)).toMatchObject({ status: "playing", playerCount: 4 });
    expect(rooms.members(roomId)).not.toContain(loyalist.id);
    expect(rooms.getForUser(loyalist.id)).toBeUndefined();
    expect(internals.rooms.get(roomId)?.game?.players.find((player) => player.id === loyalist.id)).toMatchObject({
      alive: false,
      hp: 0,
      hand: [],
    });
    const snapshotRoom = rooms.exportSnapshot().rooms.find((room) => room.id === roomId);
    expect(snapshotRoom?.players).toHaveLength(5);
    expect(snapshotRoom?.players.find((player) => player.id === loyalist.id)).toMatchObject({
      departed: true,
      connected: false,
    });

    const restored = new RoomService();
    restored.restoreSnapshot(JSON.parse(JSON.stringify(rooms.exportSnapshot())));
    expect(restored.get(roomId)).toMatchObject({ status: "playing", playerCount: 4 });
    expect(restored.getForUser(loyalist.id)).toBeUndefined();
    expect(restored.members(roomId)).not.toContain(loyalist.id);
  });

  it("uses the same continuing-game rule after a disconnect timeout", () => {
    vi.useFakeTimers();
    try {
      const participants = [owner, guest, third, fourth, fifth];
      const rooms = new RoomService(1_000);
      const roomId = startHumanRoom(rooms, participants);
      const game = roomInternals(rooms).rooms.get(roomId)?.game;
      const loyalist = game?.players.find((player) => player.role === "loyalist");
      if (!loyalist) throw new Error("Missing Loyalist");

      rooms.setConnected(loyalist.id, false);
      vi.advanceTimersByTime(1_000);

      expect(rooms.get(roomId)).toMatchObject({ status: "playing", playerCount: 4 });
      expect(roomInternals(rooms).rooms.get(roomId)?.game?.players.find((player) => player.id === loyalist.id)).toMatchObject({
        alive: false,
        hp: 0,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("continues bot work asynchronously after a batch limit instead of sticking", async () => {
    const rooms = new RoomService(90_000, 1);
    const roomId = startHumanRoom(rooms, [owner, guest]);
    const internals = roomInternals(rooms);
    const room = internals.rooms.get(roomId);
    const game = room?.game;
    const bot = room?.players.find((player) => player.id === guest.id);
    const botPlayer = game?.players.find((player) => player.id === guest.id);
    if (!room || !game || !bot || !botPlayer) throw new Error("Missing bot test state");
    bot.isBot = true;
    botPlayer.generalId = "gan_ning";
    const injectedCard: Card = {
      id: "bot-batch-horse",
      kind: "chi_tu",
      name: "赤兔",
      category: "equipment",
      suit: "heart",
      rank: 5,
    };
    game.discardPile.push(...botPlayer.hand);
    botPlayer.hand = [injectedCard];
    game.currentPlayerId = bot.id;
    game.turn = {
      number: game.turn.number,
      playerId: bot.id,
      phase: "play",
      slashUsed: false,
      wineUsed: false,
      slashDamageBonus: 0,
      requiredDiscardCount: 0,
      skipDraw: false,
      skipPlay: false,
    };
    game.pendingResponse = null;
    const changed = vi.fn();
    rooms.onChanged(changed);

    internals.runBots(room);

    expect(internals.botContinuations.has(roomId)).toBe(true);
    await vi.waitFor(() => {
      expect(internals.botContinuations.has(roomId)).toBe(false);
      const current = internals.rooms.get(roomId)?.game;
      expect(
        current?.status === "finished" ||
        current?.currentPlayerId !== bot.id ||
        current.pendingResponse?.targetId !== bot.id,
      ).toBe(true);
    });
    expect(changed).toHaveBeenCalled();
  });

  it("contains a bot action exception and settles through authoritative elimination", () => {
    const rooms = new RoomService();
    const roomId = startHumanRoom(rooms, [owner, guest]);
    const internals = roomInternals(rooms);
    const room = internals.rooms.get(roomId);
    const game = room?.game;
    const bot = room?.players.find((player) => player.id === guest.id);
    const victim = game?.players.find((player) => player.id === owner.id);
    if (!room || !game || !bot || !victim) throw new Error("Missing bot failure state");
    bot.isBot = true;
    game.discardPile.push(...victim.hand, ...Object.values(victim.equipment), ...victim.judgment);
    victim.hand = [];
    victim.equipment = {};
    victim.judgment = [];
    const resolvingCard: Card = {
      id: "broken-zone-selection",
      kind: "guo_he_chai_qiao",
      name: "过河拆桥",
      category: "trick",
      suit: "spade",
      rank: 3,
    };
    game.resolvingCards.push(resolvingCard);
    game.currentPlayerId = bot.id;
    game.turn.playerId = bot.id;
    game.turn.phase = "respond";
    game.pendingResponse = {
      type: "zone_selection",
      attackerId: bot.id,
      targetId: bot.id,
      victimId: victim.id,
      cardId: resolvingCard.id,
      cardKind: "guo_he_chai_qiao",
      mode: "discard",
    };
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(() => internals.runBots(room)).not.toThrow();
      expect(rooms.get(roomId)?.status).toBe("finished");
      expect(room.game?.players.find((player) => player.id === bot.id)?.alive).toBe(false);
      expect(consoleError).toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("uses conversion skills only as a fallback and never activates Kurou", () => {
    const rooms = new RoomService();
    const roomId = startHumanRoom(rooms, [owner, guest]);
    const internals = roomInternals(rooms);
    const room = internals.rooms.get(roomId);
    const game = room?.game;
    const bot = room?.players.find((player) => player.id === guest.id);
    const botPlayer = game?.players.find((player) => player.id === guest.id);
    if (!room || !game || !bot || !botPlayer) throw new Error("Missing conversion-skill bot fixture");
    bot.isBot = true;
    game.discardPile.push(...botPlayer.hand);
    botPlayer.hand = [{
      id: "bot-wusheng-dodge",
      kind: "dodge",
      name: "闪",
      category: "basic",
      suit: "heart",
      rank: 2,
    }];
    botPlayer.generalId = "guan_yu";
    game.currentPlayerId = bot.id;
    game.turn = {
      ...game.turn,
      playerId: bot.id,
      phase: "play",
      slashUsed: false,
      requiredDiscardCount: 0,
    };
    game.pendingResponse = null;

    expect(internals.actionForBot(game, bot)).toEqual({
      type: "use_skill",
      playerId: bot.id,
      skillId: "wusheng",
      cardIds: ["bot-wusheng-dodge"],
      targetId: owner.id,
    });

    botPlayer.generalId = "huang_gai";
    expect(internals.actionForBot(game, bot)).toEqual({ type: "end_play", playerId: bot.id });
  });

  it("uses Fanjian and ordered Lijian, and answers a restored Fanjian suit prompt", () => {
    const rooms = new RoomService();
    const roomId = startHumanRoom(rooms, [owner, guest, third, fourth]);
    const internals = roomInternals(rooms);
    const room = internals.rooms.get(roomId);
    const game = room?.game;
    const bot = room?.players.find((player) => player.id === guest.id);
    const botPlayer = game?.players.find((player) => player.id === guest.id);
    if (!room || !game || !bot || !botPlayer) throw new Error("Missing Fanjian/Lijian bot fixture");
    bot.isBot = true;
    for (const player of game.players.filter((player) => player.id !== bot.id)) player.generalId = "liu_bei";
    game.discardPile.push(...botPlayer.hand);
    botPlayer.hand = [{
      id: "bot-skill-cost",
      kind: "dodge",
      name: "闪",
      category: "basic",
      suit: "club",
      rank: 8,
    }];
    game.currentPlayerId = bot.id;
    game.turn = {
      ...game.turn,
      playerId: bot.id,
      phase: "play",
      skillUseCounts: {},
      requiredDiscardCount: 0,
    };
    game.pendingResponse = null;

    botPlayer.generalId = "zhou_yu";
    expect(internals.actionForBot(game, bot)).toEqual({
      type: "use_skill", playerId: bot.id, skillId: "fanjian", targetId: owner.id,
    });

    botPlayer.generalId = "diao_chan";
    expect(internals.actionForBot(game, bot)).toEqual({
      type: "use_skill",
      playerId: bot.id,
      skillId: "lijian",
      cardIds: ["bot-skill-cost"],
      targetIds: [owner.id, third.id],
    });

    game.currentPlayerId = owner.id;
    game.turn = { ...game.turn, playerId: owner.id, phase: "respond", skillUseCounts: { fanjian: 1 } };
    game.pendingResponse = {
      type: "fanjian_suit",
      attackerId: owner.id,
      targetId: bot.id,
      eventId: 7,
      promptId: `skill:7:fanjian:${bot.id}:0`,
    };
    expect(internals.actionForBot(game, bot)).toEqual({
      type: "choose_fanjian_suit",
      playerId: bot.id,
      suit: "spade",
      promptId: `skill:7:fanjian:${bot.id}:0`,
    });
  });

  it("answers response prompts with Wusheng, Longdan, or Qingguo when no physical response exists", () => {
    const rooms = new RoomService();
    const roomId = startHumanRoom(rooms, [owner, guest]);
    const internals = roomInternals(rooms);
    const room = internals.rooms.get(roomId);
    const game = room?.game;
    const bot = room?.players.find((player) => player.id === guest.id);
    const botPlayer = game?.players.find((player) => player.id === guest.id);
    if (!room || !game || !bot || !botPlayer) throw new Error("Missing response-skill bot fixture");
    bot.isBot = true;
    game.discardPile.push(...botPlayer.hand);
    botPlayer.hand = [{
      id: "bot-wusheng-peach",
      kind: "peach",
      name: "桃",
      category: "basic",
      suit: "heart",
      rank: 3,
    }];
    botPlayer.generalId = "guan_yu";
    game.turn.phase = "respond";
    game.pendingResponse = {
      type: "duel",
      attackerId: owner.id,
      targetId: bot.id,
      cardId: "bot-duel",
      initiatorId: owner.id,
      originalTargetId: bot.id,
    };

    expect(internals.actionForBot(game, bot)).toEqual({
      type: "use_skill",
      playerId: bot.id,
      skillId: "wusheng",
      cardIds: ["bot-wusheng-peach"],
    });

    game.discardPile.push(...botPlayer.hand);
    botPlayer.hand = [{
      id: "bot-longdan-slash",
      kind: "slash",
      name: "杀",
      category: "basic",
      suit: "spade",
      rank: 7,
    }];
    botPlayer.generalId = "zhao_yun";
    game.pendingResponse = {
      type: "slash",
      attackerId: owner.id,
      targetId: bot.id,
      cardId: "bot-incoming-slash",
      slashKind: "slash",
      damage: 1,
      nature: "normal",
      color: "black",
      remainingTargetIds: [],
      zhuQueChecked: true,
      ciXiongChecked: true,
    };

    expect(internals.actionForBot(game, bot)).toEqual({
      type: "use_skill",
      playerId: bot.id,
      skillId: "longdan",
      cardIds: ["bot-longdan-slash"],
    });

    game.discardPile.push(...botPlayer.hand);
    botPlayer.hand = [{
      id: "bot-qingguo-black",
      kind: "peach",
      name: "桃",
      category: "basic",
      suit: "spade",
      rank: 4,
    }];
    botPlayer.generalId = "zhen_ji";

    expect(internals.actionForBot(game, bot)).toEqual({
      type: "use_skill",
      playerId: bot.id,
      skillId: "qingguo",
      cardIds: ["bot-qingguo-black"],
    });
  });

  it("uses the first authoritative multi-card group for a Longhun response", () => {
    const rooms = new RoomService();
    const roomId = startHumanRoom(rooms, [owner, guest]);
    const internals = roomInternals(rooms);
    const room = internals.rooms.get(roomId);
    const game = room?.game;
    const bot = room?.players.find((player) => player.id === guest.id);
    const attacker = game?.players.find((player) => player.id === owner.id);
    const defender = game?.players.find((player) => player.id === guest.id);
    if (!room || !game || !bot || !attacker || !defender) throw new Error("Missing Longhun bot fixture");
    bot.isBot = true;
    for (const player of game.players) {
      game.discardPile.push(...player.hand, ...Object.values(player.equipment));
      player.hand = [];
      player.equipment = {};
      player.generalId = "gan_ning";
    }
    grantSkill(game.completeRules.lifecycle, {
      ownerId: bot.id,
      skillId: "longhun",
      sourcePlayerId: bot.id,
      sourceSkillId: "bot-test",
      expiry: { type: "permanent" },
    });
    defender.hp = 2;
    attacker.hand = [standardCard("bot-longhun-slash", "slash", "spade")];
    defender.hand = [standardCard("bot-longhun-club-hand", "peach", "club")];
    defender.equipment.weapon = standardCard("bot-longhun-club-weapon", "zhu_ge_lian_nu", "club");
    game.currentPlayerId = attacker.id;
    game.turn = { ...game.turn, playerId: attacker.id, phase: "play", slashUsed: false };
    game.pendingResponse = null;

    const prompted = applyAction(game, {
      type: "play_card",
      playerId: attacker.id,
      cardId: "bot-longhun-slash",
      targetId: defender.id,
    });
    expect(getGameView(prompted, bot.id).prompt).toMatchObject({
      type: "respond",
      skillResponses: [expect.objectContaining({
        skillId: "longhun",
        cardGroups: [["bot-longhun-club-hand", "bot-longhun-club-weapon"]],
      })],
    });
    expect(internals.actionForBot(prompted, bot)).toEqual({
      type: "use_skill",
      playerId: bot.id,
      skillId: "longhun",
      cardIds: ["bot-longhun-club-hand", "bot-longhun-club-weapon"],
    });
  });

  it("answers both serialized Dodge prompts against a Wushuang Slash", () => {
    const rooms = new RoomService();
    const roomId = startHumanRoom(rooms, [owner, guest]);
    const internals = roomInternals(rooms);
    const room = internals.rooms.get(roomId);
    const game = room?.game;
    const bot = room?.players.find((player) => player.id === guest.id);
    const botPlayer = game?.players.find((player) => player.id === guest.id);
    const attacker = game?.players.find((player) => player.id === owner.id);
    if (!room || !game || !bot || !botPlayer || !attacker) throw new Error("Missing Wushuang bot fixture");
    bot.isBot = true;
    botPlayer.generalId = "gan_ning";
    game.discardPile.push(...botPlayer.hand);
    botPlayer.hand = [
      { id: "bot-dodge-1", kind: "dodge", name: "闪", category: "basic", suit: "heart", rank: 2 },
      { id: "bot-dodge-2", kind: "dodge", name: "闪", category: "basic", suit: "diamond", rank: 3 },
    ];
    attacker.generalId = "lv_bu";
    attacker.equipment = {};
    game.discardPile.push(...attacker.hand);
    const incoming: Card = {
      id: "bot-wushuang-slash", kind: "slash", name: "杀", category: "basic", suit: "spade", rank: 7,
    };
    attacker.hand = [incoming];
    game.currentPlayerId = attacker.id;
    game.turn = { ...game.turn, playerId: attacker.id, phase: "play", slashUsed: false };
    game.pendingResponse = null;
    const hpBefore = botPlayer.hp;
    room.game = applyAction(game, {
      type: "play_card",
      playerId: attacker.id,
      cardId: incoming.id,
      targetId: bot.id,
    });
    expect(room.game.pendingResponse).toMatchObject({
      type: "slash",
      targetId: bot.id,
      requiredDodgeCount: 2,
      dodgesPlayed: 0,
    });

    const first = internals.actionForBot(room.game, bot);
    expect(first).toEqual({ type: "respond", playerId: bot.id, cardId: "bot-dodge-1" });
    room.game = applyAction(room.game, first);
    expect(room.game.pendingResponse).toMatchObject({ type: "slash", targetId: bot.id, dodgesPlayed: 1 });

    const second = internals.actionForBot(room.game, bot);
    expect(second).toEqual({ type: "respond", playerId: bot.id, cardId: "bot-dodge-2" });
    room.game = applyAction(room.game, second);
    expect(room.game.pendingResponse).toBeNull();
    expect(room.game.players.find((player) => player.id === bot.id)?.hp).toBe(hpBefore);
  });

  it("uses the second active-skill batch with bounded conservative choices", () => {
    const rooms = new RoomService();
    const roomId = startHumanRoom(rooms, [owner, guest]);
    const internals = roomInternals(rooms);
    const room = internals.rooms.get(roomId);
    const game = room?.game;
    const bot = room?.players.find((player) => player.id === guest.id);
    const botPlayer = game?.players.find((player) => player.id === guest.id);
    const targetPlayer = game?.players.find((player) => player.id === owner.id);
    if (!room || !game || !bot || !botPlayer || !targetPlayer) throw new Error("Missing active-skill bot fixture");
    bot.isBot = true;
    botPlayer.role = "rebel";
    targetPlayer.role = "lord";
    game.currentPlayerId = bot.id;
    game.turn = {
      ...game.turn,
      playerId: bot.id,
      phase: "play",
      slashUsed: false,
      requiredDiscardCount: 0,
      skillUseCounts: {},
      rendeGivenCount: 0,
      rendeRecovered: false,
    };
    game.pendingResponse = null;
    game.virtualCardOrigins = {};
    game.discardPile.push(...targetPlayer.judgment);
    targetPlayer.judgment = [];
    targetPlayer.generalId = "guan_yu";
    targetPlayer.hp = targetPlayer.maxHp - 1;

    const setDodgeHand = (prefix: string, count: number, suit: Card["suit"] = "spade"): string[] => {
      game.discardPile.push(...botPlayer.hand);
      botPlayer.hand = Array.from({ length: count }, (_, index) => ({
        id: `${prefix}-${index + 1}`,
        kind: "dodge" as const,
        name: "闪" as const,
        category: "basic" as const,
        suit,
        rank: (index + 2) as Card["rank"],
      }));
      return botPlayer.hand.map((card) => card.id);
    };

    botPlayer.generalId = "sun_quan";
    const [zhihengCard] = setDodgeHand("bot-zhiheng", 1);
    expect(internals.actionForBot(game, bot)).toEqual({
      type: "use_skill", playerId: bot.id, skillId: "zhiheng", cardIds: [zhihengCard],
    });

    botPlayer.generalId = "liu_bei";
    botPlayer.hp = botPlayer.maxHp - 1;
    const rendeCards = setDodgeHand("bot-rende", 2);
    expect(internals.actionForBot(game, bot)).toEqual({
      type: "use_skill", playerId: bot.id, skillId: "rende", cardIds: rendeCards, targetId: owner.id,
    });
    game.turn.rendeRecovered = true;
    expect(internals.actionForBot(game, bot)).toEqual({ type: "end_play", playerId: bot.id });
    game.turn.rendeRecovered = false;

    botPlayer.generalId = "hua_tuo";
    botPlayer.hp = botPlayer.maxHp - 1;
    const [qingnangCard] = setDodgeHand("bot-qingnang", 1);
    expect(internals.actionForBot(game, bot)).toEqual({
      type: "use_skill", playerId: bot.id, skillId: "qingnang", cardIds: [qingnangCard], targetId: bot.id,
    });

    botPlayer.generalId = "sun_shang_xiang";
    botPlayer.hp = botPlayer.maxHp - 1;
    const jieyinCards = setDodgeHand("bot-jieyin", 2);
    expect(internals.actionForBot(game, bot)).toEqual({
      type: "use_skill", playerId: bot.id, skillId: "jieyin", cardIds: jieyinCards, targetId: owner.id,
    });

    botPlayer.generalId = "da_qiao";
    botPlayer.hp = botPlayer.maxHp;
    const [guoseCard] = setDodgeHand("bot-guose", 1, "diamond");
    expect(internals.actionForBot(game, bot)).toEqual({
      type: "use_skill", playerId: bot.id, skillId: "guose", cardIds: [guoseCard], targetId: owner.id,
    });
    game.virtualCardOrigins = { "already-used-guose": "dodge" };
    expect(internals.actionForBot(game, bot)).toEqual({ type: "end_play", playerId: bot.id });
  });

  it("uses lesser Yeyan once against the first living opponent and then converges", () => {
    const rooms = new RoomService();
    const roomId = startHumanRoom(rooms, [owner, guest, third]);
    const internals = roomInternals(rooms);
    const room = internals.rooms.get(roomId);
    const game = room?.game;
    const bot = room?.players.find((player) => player.id === guest.id);
    const botPlayer = game?.players.find((player) => player.id === guest.id);
    if (!room || !game || !bot || !botPlayer) throw new Error("Missing Yeyan bot fixture");
    bot.isBot = true;
    for (const player of game.players) {
      game.discardPile.push(...player.hand, ...Object.values(player.equipment));
      player.hand = [];
      player.equipment = {};
      player.generalId = "gan_ning";
      player.maxHp = 4;
      player.hp = 4;
    }
    grantSkill(game.completeRules.lifecycle, {
      ownerId: bot.id,
      skillId: "yeyan",
      sourcePlayerId: bot.id,
      sourceSkillId: "bot-test",
      expiry: { type: "permanent" },
    });
    game.currentPlayerId = bot.id;
    game.turn = { ...game.turn, playerId: bot.id, phase: "play", slashUsed: false };
    game.pendingResponse = null;
    const prompt = getGameView(game, bot.id).prompt;
    if (prompt.type !== "play") throw new Error("Expected Yeyan play prompt");
    const hint = prompt.skills.find((skill) => skill.skillId === "yeyan" && skill.minCards === 0);
    const targetId = hint?.targetIds.find((candidate) => candidate !== bot.id);
    if (!targetId) throw new Error("Missing lesser Yeyan target");

    const action = internals.actionForBot(game, bot);
    expect(action).toEqual({
      type: "use_skill",
      playerId: bot.id,
      skillId: "yeyan",
      allocations: [{ targetId, damage: 1 }],
    });
    const resolved = applyAction(game, action);
    expect(resolved.players.find((player) => player.id === targetId)?.hp).toBe(3);
    expect(resolved.completeRules.lifecycle.limitedUses).toContainEqual(expect.objectContaining({
      ownerId: bot.id,
      skillId: "yeyan",
    }));
    expect(internals.actionForBot(resolved, bot)).toEqual({ type: "end_play", playerId: bot.id });
  });

  it("prefers physical rescue cards and otherwise answers dying with Jijiu", () => {
    const rooms = new RoomService();
    const roomId = startHumanRoom(rooms, [owner, guest]);
    const internals = roomInternals(rooms);
    const room = internals.rooms.get(roomId);
    const game = room?.game;
    const bot = room?.players.find((player) => player.id === guest.id);
    const botPlayer = game?.players.find((player) => player.id === guest.id);
    const victim = game?.players.find((player) => player.id === owner.id);
    if (!room || !game || !bot || !botPlayer || !victim) throw new Error("Missing Jijiu bot fixture");
    bot.isBot = true;
    botPlayer.generalId = "hua_tuo";
    game.discardPile.push(...botPlayer.hand);
    botPlayer.hand = [{
      id: "bot-jijiu-red",
      kind: "dodge",
      name: "闪",
      category: "basic",
      suit: "heart",
      rank: 6,
    }];
    game.currentPlayerId = owner.id;
    game.turn.playerId = owner.id;
    game.turn.phase = "respond";
    victim.alive = true;
    victim.hp = 0;
    game.pendingResponse = {
      type: "dying",
      victimId: victim.id,
      damageSourceId: null,
      targetId: bot.id,
      remainingResponderIds: [owner.id],
      resume: { type: "finish_effect" },
    };

    expect(internals.actionForBot(game, bot)).toEqual({
      type: "use_skill", playerId: bot.id, skillId: "jijiu", cardIds: ["bot-jijiu-red"],
    });

    botPlayer.hand.unshift({
      id: "bot-physical-peach",
      kind: "peach",
      name: "桃",
      category: "basic",
      suit: "diamond",
      rank: 5,
    });
    expect(internals.actionForBot(game, bot)).toEqual({
      type: "respond", playerId: bot.id, cardId: "bot-physical-peach",
    });
  });

  it("accepts beneficial phase skills but uses Luoyi only with health and an immediate damage card", () => {
    const rooms = new RoomService();
    const roomId = startHumanRoom(rooms, [owner, guest]);
    const internals = roomInternals(rooms);
    const room = internals.rooms.get(roomId);
    const game = room?.game;
    const bot = room?.players.find((player) => player.id === guest.id);
    const botPlayer = game?.players.find((player) => player.id === guest.id);
    if (!room || !game || !bot || !botPlayer) throw new Error("Missing skill-choice bot fixture");
    bot.isBot = true;
    game.discardPile.push(...botPlayer.hand);
    botPlayer.hand = [{
      id: "bot-luoyi-slash",
      kind: "slash",
      name: "杀",
      category: "basic",
      suit: "spade",
      rank: 9,
    }];
    botPlayer.hp = Math.min(2, botPlayer.maxHp);
    game.turn.phase = "respond";
    game.pendingResponse = {
      type: "skill_choice",
      targetId: bot.id,
      skillId: "luoyi",
      resume: { type: "finish_draw", playerId: bot.id },
    };

    expect(internals.actionForBot(game, bot)).toEqual({
      type: "resolve_skill",
      playerId: bot.id,
      skillId: "luoyi",
      activate: true,
    });

    botPlayer.hp = 1;
    expect(internals.actionForBot(game, bot)).toEqual({
      type: "resolve_skill",
      playerId: bot.id,
      skillId: "luoyi",
      activate: false,
    });

    game.pendingResponse = {
      type: "skill_choice",
      targetId: bot.id,
      skillId: "keji",
      resume: { type: "enter_discard", playerId: bot.id, count: 1 },
    };
    expect(internals.actionForBot(game, bot)).toEqual({
      type: "resolve_skill",
      playerId: bot.id,
      skillId: "keji",
      activate: true,
    });

    const jizhiCard: Card = {
      id: "bot-jizhi-ex",
      kind: "ex_nihilo",
      name: "无中生有",
      category: "trick",
      suit: "heart",
      rank: 7,
    };
    botPlayer.hand.push(jizhiCard);
    game.nextUseId = 2;
    game.nextEventId = 2;
    const jizhiTriggerId = `1:jizhi:${bot.id}:0`;
    game.pendingResponse = {
      type: "skill_choice",
      targetId: bot.id,
      skillId: "jizhi",
      promptId: `skill:${jizhiTriggerId}`,
      triggerId: jizhiTriggerId,
      resume: {
        type: "card_use",
        stage: "card_use_declared",
        eventId: 1,
        remainingTriggers: [],
        intent: {
          useId: 1,
          sourceId: bot.id,
          physicalCardId: jizhiCard.id,
          physicalKind: jizhiCard.kind,
          effectiveKind: jizhiCard.kind,
          suit: jizhiCard.suit,
          rank: jizhiCard.rank,
          targetIds: [bot.id],
          method: "use",
          viaSkill: null,
        },
      },
    };
    expect(internals.actionForBot(game, bot)).toEqual({
      type: "resolve_skill",
      playerId: bot.id,
      skillId: "jizhi",
      promptId: `skill:${jizhiTriggerId}`,
      activate: true,
    });

    for (const [index, skillId] of (["lianying", "xiaoji"] as const).entries()) {
      const eventId = 2 + index;
      const triggerId = `${eventId}:${skillId}:${bot.id}:0`;
      game.afterMove = { queuedTriggers: [], suspendedPhase: "play", suspendedResponse: null };
      game.pendingResponse = {
        type: "skill_choice",
        targetId: bot.id,
        skillId,
        promptId: `skill:${triggerId}`,
        triggerId,
        resume: { type: "after_move", eventId },
      };
      expect(internals.actionForBot(game, bot)).toEqual({
        type: "resolve_skill",
        playerId: bot.id,
        skillId,
        promptId: `skill:${triggerId}`,
        activate: true,
      });
    }
    game.afterMove = { queuedTriggers: [], suspendedPhase: null, suspendedResponse: null };

    game.pendingResponse = {
      type: "skill_choice",
      targetId: bot.id,
      skillId: "niepan",
      promptId: "dying:17:niepan",
      resume: { type: "dying", frameId: 17, resume: { type: "finish_effect" } },
    };
    expect(internals.actionForBot(game, bot)).toEqual({
      type: "resolve_skill",
      playerId: bot.id,
      skillId: "niepan",
      promptId: "dying:17:niepan",
      activate: true,
    });

    game.pendingResponse = {
      type: "skill_choice",
      targetId: bot.id,
      skillId: "buqu",
      promptId: "dying:18:buqu-entry",
      resume: {
        type: "dying",
        frameId: 18,
        resume: { type: "finish_effect" },
        buquLoss: { hpBefore: 1, amount: 1 },
      },
    };
    expect(internals.actionForBot(game, bot)).toEqual({
      type: "resolve_skill",
      playerId: bot.id,
      skillId: "buqu",
      promptId: "dying:18:buqu-entry",
      activate: true,
    });

    const beneficialChoices = [
      { skillId: "yingzi" as const, resume: { type: "finish_draw" as const, playerId: bot.id } },
      { skillId: "biyue" as const, resume: { type: "finish_turn" as const, playerId: bot.id } },
      { skillId: "luoshen" as const, resume: { type: "continue_judgment" as const, playerId: bot.id }, iteration: 4 },
    ];
    for (const choice of beneficialChoices) {
      game.pendingResponse = {
        type: "skill_choice",
        targetId: bot.id,
        ...choice,
      };
      expect(internals.actionForBot(game, bot)).toEqual({
        type: "resolve_skill",
        playerId: bot.id,
        skillId: choice.skillId,
        activate: true,
      });
    }

    game.deck = [];
    game.discardPile = [];
    expect(internals.actionForBot(game, bot)).toEqual({
      type: "resolve_skill",
      playerId: bot.id,
      skillId: "luoshen",
      activate: false,
    });

    const judgmentlessSlash = {
      type: "slash" as const,
      attackerId: owner.id,
      targetId: bot.id,
      cardId: "bot-empty-judgment-slash",
      slashKind: "slash" as const,
      damage: 1,
      nature: "normal" as const,
      color: "black" as const,
      remainingTargetIds: [],
      zhuQueChecked: true,
      ciXiongChecked: true,
    };
    game.pendingResponse = {
      type: "standard_skill",
      targetId: bot.id,
      promptId: `standard:19:tieqi:${bot.id}:target-${bot.id}`,
      eventId: 19,
      skillId: "tieqi",
      stage: "invoke",
      slash: judgmentlessSlash,
    };
    expect(internals.actionForBot(game, bot)).toEqual({
      type: "resolve_standard_skill",
      playerId: bot.id,
      promptId: `standard:19:tieqi:${bot.id}:target-${bot.id}`,
      activate: false,
    });

    botPlayer.equipment.armor = standardCard("bot-empty-bagua", "ba_gua_zhen");
    game.pendingResponse = judgmentlessSlash;
    expect(internals.actionForBot(game, bot)).toEqual({
      type: "activate_armor",
      playerId: bot.id,
      activate: false,
    });
  });

  it("answers serialized standard-skill prompts with bounded deterministic choices", () => {
    const rooms = new RoomService();
    const roomId = startHumanRoom(rooms, [owner, guest, third]);
    const internals = roomInternals(rooms);
    const room = internals.rooms.get(roomId);
    const game = room?.game;
    const bot = room?.players.find((player) => player.id === guest.id);
    const botPlayer = game?.players.find((player) => player.id === guest.id);
    const ownerPlayer = game?.players.find((player) => player.id === owner.id);
    const thirdPlayer = game?.players.find((player) => player.id === third.id);
    if (!room || !game || !bot || !botPlayer || !ownerPlayer || !thirdPlayer) {
      throw new Error("Missing standard-skill bot fixture");
    }
    bot.isBot = true;
    for (const player of game.players) {
      game.discardPile.push(...player.hand, ...Object.values(player.equipment));
      player.hand = [];
      player.equipment = {};
      player.extraPiles = {};
      player.generalId = "gan_ning";
    }
    game.turn = { ...game.turn, phase: "respond", requiredDiscardCount: 0 };

    game.deck = [standardCard("bot-gx-first", "slash"), standardCard("bot-gx-second", "dodge")];
    game.pendingResponse = {
      type: "standard_skill",
      targetId: bot.id,
      promptId: `standard:21:guanxing:${bot.id}:guanxing_reorder`,
      eventId: 21,
      skillId: "guanxing",
      stage: "guanxing_reorder",
      selectedCardIds: ["bot-gx-second", "bot-gx-first"],
    };
    expect(internals.actionForBot(game, bot)).toEqual({
      type: "resolve_standard_skill",
      playerId: bot.id,
      promptId: `standard:21:guanxing:${bot.id}:guanxing_reorder`,
      activate: true,
      topCardIds: ["bot-gx-second", "bot-gx-first"],
      bottomCardIds: [],
    });

    ownerPlayer.hand = [standardCard("bot-tuxi-owner", "peach")];
    thirdPlayer.hand = [standardCard("bot-tuxi-third", "dodge")];
    game.pendingResponse = {
      type: "standard_skill",
      targetId: bot.id,
      promptId: `standard:22:tuxi:${bot.id}:tuxi_select`,
      eventId: 22,
      skillId: "tuxi",
      stage: "tuxi_select",
    };
    const tuxi = internals.actionForBot(game, bot);
    expect(tuxi).toMatchObject({
      type: "resolve_standard_skill",
      playerId: bot.id,
      activate: true,
      tokens: ["hand:0", "hand:0"],
    });
    expect(tuxi.type === "resolve_standard_skill" ? new Set(tuxi.targetIds) : null).toEqual(new Set([owner.id, third.id]));

    botPlayer.extraPiles[`yiji:23:${bot.id}`] = [
      standardCard("bot-yiji-one", "slash"),
      standardCard("bot-yiji-two", "peach"),
    ];
    game.pendingResponse = {
      type: "standard_skill",
      targetId: bot.id,
      promptId: `standard:23:yiji:${bot.id}:yiji_distribute`,
      eventId: 23,
      skillId: "yiji",
      stage: "yiji_distribute",
      selectedCardIds: ["bot-yiji-one", "bot-yiji-two"],
    };
    expect(internals.actionForBot(game, bot)).toMatchObject({
      type: "resolve_standard_skill",
      activate: true,
      allocations: [
        { cardId: "bot-yiji-one", targetId: bot.id },
        { cardId: "bot-yiji-two", targetId: bot.id },
      ],
    });

    botPlayer.extraPiles.buqu = [standardCard("bot-buqu-first", "slash"), standardCard("bot-buqu-second", "dodge")];
    game.pendingResponse = {
      type: "standard_skill",
      targetId: bot.id,
      promptId: `recovery:24:buqu:${bot.id}`,
      eventId: 24,
      skillId: "buqu",
      stage: "buqu_recovery",
      selectedCardIds: ["bot-buqu-first", "bot-buqu-second"],
    };
    expect(internals.actionForBot(game, bot)).toEqual({
      type: "resolve_standard_skill",
      playerId: bot.id,
      promptId: `recovery:24:buqu:${bot.id}`,
      activate: true,
      cardId: "bot-buqu-first",
    });

    botPlayer.hand = [standardCard("bot-ganglie-one", "slash"), standardCard("bot-ganglie-two", "dodge")];
    game.pendingResponse = {
      type: "standard_skill",
      targetId: bot.id,
      promptId: `standard:25:ganglie:${bot.id}:ganglie_punish`,
      eventId: 25,
      skillId: "ganglie",
      stage: "ganglie_punish",
      sourceId: owner.id,
    };
    expect(internals.actionForBot(game, bot)).toMatchObject({
      type: "resolve_standard_skill",
      activate: true,
      cardIds: ["bot-ganglie-one", "bot-ganglie-two"],
    });

    game.discardPile.push(...ownerPlayer.hand, ...thirdPlayer.hand, ...botPlayer.hand);
    ownerPlayer.hand = [standardCard("bot-bagua-slash", "slash")];
    thirdPlayer.hand = [];
    botPlayer.hand = [standardCard("bot-guicai-cost", "dodge", "club")];
    botPlayer.equipment.armor = standardCard("bot-bagua", "ba_gua_zhen");
    grantSkill(game.completeRules.lifecycle, {
      ownerId: bot.id,
      skillId: "guicai",
      sourcePlayerId: bot.id,
      sourceSkillId: "bot-test",
      expiry: { type: "permanent" },
    });
    game.deck = [standardCard("bot-bagua-judgment", "peach", "heart")];
    game.resolvingCards = [];
    game.currentPlayerId = owner.id;
    game.turn = { ...game.turn, playerId: owner.id, phase: "play", slashUsed: false };
    game.pendingResponse = null;
    const attacked = applyAction(game, {
      type: "play_card", playerId: owner.id, cardId: "bot-bagua-slash", targetId: bot.id,
    });
    const judging = applyAction(attacked, { type: "activate_armor", playerId: bot.id, activate: true });
    room.game = judging;
    expect(internals.actionForBot(judging, bot)).toMatchObject({
      type: "resolve_standard_skill",
      playerId: bot.id,
      activate: false,
      promptId: expect.stringContaining("judgment:"),
    });
  });

  it("accepts the authoritative Shelie invoke and settles one card per printed suit", () => {
    const rooms = new RoomService();
    const roomId = startHumanRoom(rooms, [owner, guest]);
    const internals = roomInternals(rooms);
    const room = internals.rooms.get(roomId);
    const game = room?.game;
    const bot = room?.players.find((player) => player.id === guest.id);
    const starter = game?.players.find((player) => player.id === owner.id);
    const botPlayer = game?.players.find((player) => player.id === guest.id);
    if (!room || !game || !bot || !starter || !botPlayer) throw new Error("Missing Shelie bot fixture");
    bot.isBot = true;
    for (const player of game.players) {
      game.discardPile.push(...player.hand, ...Object.values(player.equipment));
      player.hand = [];
      player.equipment = {};
      player.generalId = "gan_ning";
      player.faceUp = true;
    }
    grantSkill(game.completeRules.lifecycle, {
      ownerId: bot.id,
      skillId: "shelie",
      sourcePlayerId: bot.id,
      sourceSkillId: "bot-test",
      expiry: { type: "permanent" },
    });
    game.deck = [
      standardCard("bot-shelie-diamond", "slash", "diamond"),
      standardCard("bot-shelie-club", "dodge", "club"),
      standardCard("bot-shelie-heart", "peach", "heart"),
      standardCard("bot-shelie-spade-2", "wine", "spade"),
      standardCard("bot-shelie-spade-1", "slash", "spade"),
    ];
    game.currentPlayerId = starter.id;
    game.turn = { ...game.turn, playerId: starter.id, phase: "play", slashUsed: false };
    game.pendingResponse = null;

    let prompted = applyAction(game, { type: "end_play", playerId: starter.id });
    expect(getGameView(prompted, bot.id).prompt).toMatchObject({
      type: "standard_skill",
      skillId: "shelie",
      stage: "shelie_invoke",
      canPass: true,
    });
    const invoke = internals.actionForBot(prompted, bot);
    expect(invoke).toMatchObject({ type: "resolve_standard_skill", playerId: bot.id, activate: true });
    prompted = applyAction(prompted, invoke);
    const selectionPrompt = getGameView(prompted, bot.id).prompt;
    if (selectionPrompt.type !== "standard_skill") throw new Error("Expected Shelie selection prompt");
    const selection = internals.actionForBot(prompted, bot);
    expect(selection).toMatchObject({
      type: "resolve_standard_skill",
      playerId: bot.id,
      activate: true,
      cardIds: expect.arrayContaining([
        "bot-shelie-diamond",
        "bot-shelie-club",
        "bot-shelie-heart",
      ]),
    });
    expect(selection.type === "resolve_standard_skill" ? selection.cardIds : null).toHaveLength(4);
    const settled = applyAction(prompted, selection);
    expect(settled).toMatchObject({ currentPlayerId: bot.id, turn: { playerId: bot.id, phase: "play" } });
    expect(settled.pendingResponse).toBeNull();
  });

  it("submits cardIds for the mandatory one-card Club Beige source discard", () => {
    const rooms = new RoomService();
    const roomId = startHumanRoom(rooms, [owner, guest, third]);
    const internals = roomInternals(rooms);
    const room = internals.rooms.get(roomId);
    const game = room?.game;
    const bot = room?.players.find((player) => player.id === guest.id);
    const source = game?.players.find((player) => player.id === guest.id);
    const victim = game?.players.find((player) => player.id === owner.id);
    const beigeOwner = game?.players.find((player) => player.id === third.id);
    if (!room || !game || !bot || !source || !victim || !beigeOwner) throw new Error("Missing Beige bot fixture");
    bot.isBot = true;
    for (const player of game.players) {
      game.discardPile.push(...player.hand, ...Object.values(player.equipment));
      player.hand = [];
      player.equipment = {};
      player.generalId = "gan_ning";
      player.hp = player.maxHp;
    }
    source.hand = [
      standardCard("bot-beige-slash", "slash", "spade"),
      standardCard("bot-beige-only-card", "dodge", "heart"),
    ];
    beigeOwner.generalId = "cai_wen_ji";
    beigeOwner.hand = [standardCard("bot-beige-cost", "dodge", "diamond")];
    game.deck = [standardCard("bot-beige-club-judgment", "dodge", "club")];
    game.currentPlayerId = source.id;
    game.turn = { ...game.turn, playerId: source.id, phase: "play", slashUsed: false };
    game.pendingResponse = null;

    let prompted = applyAction(game, {
      type: "play_card",
      playerId: source.id,
      cardId: "bot-beige-slash",
      targetId: victim.id,
    });
    prompted = applyAction(prompted, { type: "respond", playerId: victim.id, cardId: null });
    const costPrompt = getGameView(prompted, beigeOwner.id).prompt;
    if (costPrompt.type !== "standard_skill") throw new Error("Expected Beige cost prompt");
    prompted = applyAction(prompted, {
      type: "resolve_standard_skill",
      playerId: beigeOwner.id,
      promptId: costPrompt.promptId,
      activate: true,
      cardId: "bot-beige-cost",
    });
    expect(getGameView(prompted, bot.id).prompt).toMatchObject({
      type: "standard_skill",
      skillId: "beige",
      stage: "beige_source_discard",
      allowedCardIds: ["bot-beige-only-card"],
      minCards: 1,
      canPass: false,
    });
    const discard = internals.actionForBot(prompted, bot);
    expect(discard).toMatchObject({
      type: "resolve_standard_skill",
      playerId: bot.id,
      activate: true,
      cardIds: ["bot-beige-only-card"],
    });
    expect(discard.type === "resolve_standard_skill" ? discard.cardId : undefined).toBeUndefined();
    const settled = applyAction(prompted, discard);
    expect(settled.players.find((player) => player.id === bot.id)?.hand).toEqual([]);
    expect(settled.completeRules.damageFlow.frames).toEqual([]);
  });

  it("chooses mandatory standard options but declines an unhandled optional prompt without looping", () => {
    const rooms = new RoomService();
    const roomId = startHumanRoom(rooms, [owner, guest]);
    const internals = roomInternals(rooms);
    const room = internals.rooms.get(roomId);
    const game = room?.game;
    const bot = room?.players.find((player) => player.id === guest.id);
    const botPlayer = game?.players.find((player) => player.id === guest.id);
    if (!room || !game || !bot || !botPlayer) throw new Error("Missing generic standard-skill bot fixture");
    bot.isBot = true;
    game.turn.phase = "respond";
    game.pendingResponse = {
      type: "standard_skill",
      targetId: bot.id,
      promptId: `standard:31:benghuai:${bot.id}:choice`,
      eventId: 31,
      skillId: "benghuai",
      stage: "benghuai_choice",
    };
    expect(internals.actionForBot(game, bot)).toEqual({
      type: "resolve_standard_skill",
      playerId: bot.id,
      promptId: `standard:31:benghuai:${bot.id}:choice`,
      activate: true,
      tokens: ["lose_hp"],
    });

    game.discardPile.push(...botPlayer.hand, ...Object.values(botPlayer.equipment));
    botPlayer.generalId = "shen_zhou_yu";
    botPlayer.hp = 2;
    botPlayer.hand = Array.from({ length: 4 }, (_value, index) =>
      standardCard(`bot-qinyin-${index + 1}`, "dodge", "heart"));
    botPlayer.equipment = {};
    game.currentPlayerId = bot.id;
    game.turn = { ...game.turn, playerId: bot.id, phase: "play", slashUsed: false, requiredDiscardCount: 0 };
    game.pendingResponse = null;
    let prompted = applyAction(game, { type: "end_play", playerId: bot.id });
    prompted = applyAction(prompted, {
      type: "discard",
      playerId: bot.id,
      cardIds: ["bot-qinyin-1", "bot-qinyin-2"],
    });
    expect(getGameView(prompted, bot.id).prompt).toMatchObject({
      type: "standard_skill",
      skillId: "qinyin",
      canPass: true,
    });
    const decline = internals.actionForBot(prompted, bot);
    expect(decline).toMatchObject({ type: "resolve_standard_skill", playerId: bot.id, activate: false });
    const settled = applyAction(prompted, decline);
    expect(settled.pendingResponse).not.toMatchObject({ targetId: bot.id, skillId: "qinyin" });
  });

  it("activates an authoritative Liegong invoke prompt", () => {
    const rooms = new RoomService();
    const roomId = startHumanRoom(rooms, [owner, guest]);
    const internals = roomInternals(rooms);
    const room = internals.rooms.get(roomId);
    const game = room?.game;
    const bot = room?.players.find((player) => player.id === guest.id);
    const botPlayer = game?.players.find((player) => player.id === guest.id);
    const target = game?.players.find((player) => player.id === owner.id);
    if (!room || !game || !bot || !botPlayer || !target) throw new Error("Missing Liegong bot fixture");
    bot.isBot = true;
    game.discardPile.push(...botPlayer.hand, ...target.hand);
    botPlayer.hand = [standardCard("bot-liegong-slash", "slash")];
    botPlayer.equipment = {};
    botPlayer.generalId = "huang_zhong";
    target.hand = [];
    target.equipment = {};
    game.currentPlayerId = bot.id;
    game.turn = { ...game.turn, playerId: bot.id, phase: "play", slashUsed: false };
    game.pendingResponse = null;

    const prompted = applyAction(game, {
      type: "play_card",
      playerId: bot.id,
      cardId: "bot-liegong-slash",
      targetId: target.id,
    });
    expect(prompted.pendingResponse).toMatchObject({
      type: "standard_skill",
      targetId: bot.id,
      skillId: "liegong",
      stage: "invoke",
      slash: {
        liegongChecked: true,
        useProvenance: { method: "use", turnPlayerId: bot.id, phase: "play" },
      },
    });
    expect(internals.actionForBot(prompted, bot)).toMatchObject({
      type: "resolve_standard_skill",
      playerId: bot.id,
      promptId: expect.stringContaining(":liegong:"),
      activate: true,
    });
  });

  it("uses only the authoritative Tianxiang card-target choices and passes without a legal pair", () => {
    const rooms = new RoomService();
    const roomId = startHumanRoom(rooms, [owner, guest, third]);
    const internals = roomInternals(rooms);
    const room = internals.rooms.get(roomId);
    const game = room?.game;
    const bot = room?.players.find((player) => player.id === guest.id);
    const attacker = game?.players.find((player) => player.id === owner.id);
    const xiaoQiao = game?.players.find((player) => player.id === guest.id);
    const redirectTarget = game?.players.find((player) => player.id === third.id);
    if (!room || !game || !bot || !attacker || !xiaoQiao || !redirectTarget) {
      throw new Error("Missing Tianxiang bot fixture");
    }
    bot.isBot = true;
    for (const player of game.players) {
      game.discardPile.push(...player.hand, ...Object.values(player.equipment));
      player.hand = [];
      player.equipment = {};
      player.extraPiles = {};
      player.generalId = "gan_ning";
    }
    attacker.hand = [standardCard("bot-tianxiang-slash", "slash")];
    xiaoQiao.hand = [standardCard("bot-tianxiang-hongyan", "peach", "spade")];
    xiaoQiao.generalId = "xiao_qiao";
    game.currentPlayerId = attacker.id;
    game.turn = { ...game.turn, playerId: attacker.id, phase: "play", slashUsed: false };
    game.pendingResponse = null;

    const awaitingDodge = applyAction(game, {
      type: "play_card",
      playerId: attacker.id,
      cardId: "bot-tianxiang-slash",
      targetId: xiaoQiao.id,
    });
    const prompted = applyAction(awaitingDodge, {
      type: "respond",
      playerId: xiaoQiao.id,
      cardId: null,
    });
    expect(getGameView(prompted, bot.id).prompt).toMatchObject({
      type: "standard_skill",
      skillId: "tianxiang",
      stage: "tianxiang_redirect",
      allowedCardIds: ["bot-tianxiang-hongyan"],
      targetIds: [attacker.id, redirectTarget.id],
    });
    expect(internals.actionForBot(prompted, bot)).toEqual({
      type: "resolve_standard_skill",
      playerId: bot.id,
      promptId: expect.stringMatching(/^damage:/),
      activate: true,
      cardId: "bot-tianxiang-hongyan",
      targetId: attacker.id,
    });

    const noPair = structuredClone(prompted);
    const unavailableAttacker = noPair.players.find((player) => player.id === attacker.id)!;
    const unavailableTarget = noPair.players.find((player) => player.id === redirectTarget.id)!;
    unavailableAttacker.alive = false;
    unavailableAttacker.hp = 0;
    unavailableTarget.alive = false;
    unavailableTarget.hp = 0;
    expect(getGameView(noPair, bot.id).prompt).toMatchObject({
      type: "standard_skill",
      allowedCardIds: [],
      targetIds: [],
    });
    expect(internals.actionForBot(noPair, bot)).toMatchObject({
      type: "resolve_standard_skill",
      playerId: bot.id,
      activate: false,
    });
  });

  it("forwards the authoritative DamageFlow prompt when a bot activates Qilin Bow", () => {
    const rooms = new RoomService();
    const roomId = startHumanRoom(rooms, [owner, guest]);
    const internals = roomInternals(rooms);
    const room = internals.rooms.get(roomId);
    const game = room?.game;
    const bot = room?.players.find((player) => player.id === guest.id);
    const victim = game?.players.find((player) => player.id === owner.id);
    if (!room || !game || !bot || !victim) throw new Error("Missing Qilin bot fixture");
    bot.isBot = true;
    victim.equipment.offensive_horse = standardCard("bot-qilin-horse", "chi_tu", "diamond");
    game.turn.phase = "respond";
    game.pendingResponse = {
      type: "weapon_action",
      weaponKind: "qi_lin_gong",
      stage: "qilin_discard_horse",
      attackerId: bot.id,
      targetId: bot.id,
      victimId: victim.id,
      slash: {
        type: "slash",
        attackerId: bot.id,
        targetId: victim.id,
        cardId: "bot-qilin-slash",
        slashKind: "slash",
        damage: 1,
        nature: "normal",
        color: "black",
        remainingTargetIds: [],
        zhuQueChecked: true,
        ciXiongChecked: true,
        completion: { type: "default" },
      },
      damageOpportunity: {
        actionId: 9,
        promptId: 41,
        frameId: 7,
        damageId: 7,
        windowId: 3,
        opportunityId: "source_after_once:qi_lin_gong:bot",
        ownerId: bot.id,
        expectedRevision: 12,
      },
    };

    expect(internals.actionForBot(game, bot)).toEqual({
      type: "resolve_weapon",
      playerId: bot.id,
      promptId: "damage:41",
      activate: true,
      tokens: ["equipment:offensive_horse"],
    });
  });

  it("removes a disconnected dead member without crashing or ending the match", () => {
    vi.useFakeTimers();
    try {
      const rooms = new RoomService(1_000);
      const room = rooms.create(owner, { name: "阵亡离席", maxPlayers: 3 });
      rooms.join(room.id, guest);
      rooms.join(room.id, third);
      for (const player of [owner, guest, third]) {
        rooms.setConnected(player.id, true);
        rooms.setReady(room.id, player.id, true);
      }
      rooms.start(room.id, owner.id);

      const internalRooms = (rooms as unknown as {
        rooms: Map<string, { game?: GameSession }>;
      }).rooms;
      const game = internalRooms.get(room.id)?.game;
      const deadPlayer = game?.players.find((player) => player.id === guest.id);
      if (!deadPlayer) throw new Error("test game player missing");
      deadPlayer.alive = false;
      deadPlayer.hp = 0;

      rooms.setConnected(guest.id, false);
      expect(() => vi.advanceTimersByTime(1_000)).not.toThrow();
      expect(rooms.get(room.id)).toMatchObject({ status: "playing", playerCount: 2 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("round-trips room and private game state through a restart snapshot", () => {
    const rooms = new RoomService();
    const room = rooms.create(owner, { name: "持久化对局", maxPlayers: 2 });
    rooms.join(room.id, guest);
    rooms.setConnected(owner.id, true);
    rooms.setConnected(guest.id, true);
    rooms.setReady(room.id, owner.id, true);
    rooms.setReady(room.id, guest.id, true);
    rooms.start(room.id, owner.id);

    const serialized = JSON.stringify(rooms.exportSnapshot());
    const restored = new RoomService();
    restored.restoreSnapshot(JSON.parse(serialized));

    expect(restored.get(room.id)).toMatchObject({
      status: "playing",
      playerCount: 2,
      players: [
        { id: owner.id, connected: false },
        { id: guest.id, connected: false },
      ],
    });
    const ownerView = restored.getGameView(room.id, owner.id)!;
    expect(ownerView.players.find((player) => player.id === owner.id)?.hand).not.toBeNull();
    expect(ownerView.players.find((player) => player.id === guest.id)?.hand).toBeNull();
  });
});
