import type { Pool } from "pg";
import {
  applyAction,
  createDeathFrame,
  createDamageInstance,
  createDyingFrame,
  createGame,
  getCardDefinition,
  grantSkill,
  pushDeathFrame,
  pushDamageFlowFrame,
  pushDyingFrame,
  turnOverGamePlayer,
  type Card,
  type CardKind,
} from "@sanguosha/shared";
import { describe, expect, it, vi } from "vitest";
import {
  loadRoomSnapshot,
  RoomSnapshotWriter,
} from "./room-persistence.js";
import { RoomService, type RoomServiceSnapshot } from "./rooms.js";

function poolWithQuery(query: Pool["query"]): Pool {
  return { query } as unknown as Pool;
}

function standardCard(id: string, kind: CardKind, suit: Card["suit"] = "spade"): Card {
  return { id, kind, ...getCardDefinition(kind), suit, rank: 7 };
}

describe("room snapshot persistence", () => {
  it("restores a departed seat tombstone while allowing that account in a new room", async () => {
    const playerIds = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
      "44444444-4444-4444-8444-444444444444",
      "55555555-5555-4555-8555-555555555555",
    ];
    const game = createGame({ playerIds, seed: "6".padStart(64, "0") });
    const loyalist = game.players.find((player) => player.role === "loyalist");
    const lord = game.players.find((player) => player.role === "lord");
    if (!loyalist || !lord) throw new Error("Missing required roles");
    game.discardPile.push(...loyalist.hand, ...Object.values(loyalist.equipment), ...loyalist.judgment);
    loyalist.hand = [];
    loyalist.equipment = {};
    loyalist.judgment = [];
    loyalist.alive = false;
    loyalist.hp = 0;
    const startedRoomId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const newRoomId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const snapshot: RoomServiceSnapshot = {
      version: 1,
      rooms: [
        {
          id: startedRoomId,
          name: "离席后仍在运行",
          ownerId: lord.id,
          status: "playing",
          maxPlayers: 5,
          createdAt: new Date().toISOString(),
          players: playerIds.map((id, seat) => ({
            id,
            username: `player-${seat}`,
            displayName: `player-${seat}`,
            ready: id !== loyalist.id,
            connected: false,
            seat,
            departed: id === loyalist.id,
          })),
          game,
        },
        {
          id: newRoomId,
          name: "离席者的新房间",
          ownerId: loyalist.id,
          status: "waiting",
          maxPlayers: 2,
          createdAt: new Date().toISOString(),
          players: [{
            id: loyalist.id,
            username: "leaver",
            displayName: "leaver",
            ready: false,
            connected: false,
            seat: 0,
          }],
        },
      ],
    };
    const pool = poolWithQuery(vi.fn().mockResolvedValue({ rows: [{ snapshot }] }) as Pool["query"]);

    const result = await loadRoomSnapshot(pool);

    expect(result.kind).toBe("valid");
    if (result.kind !== "valid") throw new Error(result.reason);
    const restored = new RoomService();
    restored.restoreSnapshot(result.snapshot);
    expect(restored.get(startedRoomId)).toMatchObject({ status: "playing", playerCount: 4 });
    expect(restored.members(startedRoomId)).not.toContain(loyalist.id);
    expect(restored.getForUser(loyalist.id)?.id).toBe(newRoomId);
  });

  it("round-trips completed live damage history while keeping the active stack empty", async () => {
    const ownerId = "11111111-1111-4111-8111-111111111111";
    const guestId = "22222222-2222-4222-8222-222222222222";
    const game = createGame({ playerIds: [ownerId, guestId], seed: "f".padStart(64, "0") });
    const actor = game.players.find((player) => player.id === game.currentPlayerId)!;
    const target = game.players.find((player) => player.id !== actor.id)!;
    game.discardPile.push(...game.players.flatMap((player) => player.hand));
    for (const player of game.players) {
      player.hand = [];
      player.generalId = "gan_ning";
      player.equipment = {};
    }
    actor.hand = [standardCard("persisted-live-slash", "slash")];
    game.turn = { ...game.turn, playerId: actor.id, phase: "play", slashUsed: false };
    game.pendingResponse = null;

    const pending = applyAction(game, {
      type: "play_card",
      playerId: actor.id,
      cardId: "persisted-live-slash",
      targetId: target.id,
    });
    const completed = applyAction(pending, {
      type: "respond",
      playerId: target.id,
      cardId: null,
    });
    expect(completed.completeRules.damageFlow).toMatchObject({
      frames: [],
      completedDamageIds: [1],
      completedFrameIds: [1],
    });

    const snapshot: RoomServiceSnapshot = {
      version: 1,
      rooms: [{
        id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        name: "Completed live damage",
        ownerId: actor.id,
        status: "playing",
        maxPlayers: 2,
        createdAt: new Date().toISOString(),
        players: completed.players.map((player) => ({
          id: player.id,
          username: player.id === actor.id ? "live-owner" : "live-guest",
          displayName: player.id === actor.id ? "live-owner" : "live-guest",
          ready: true,
          connected: false,
          seat: player.seat,
        })),
        game: completed,
      }],
    };
    const restored = await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot }] }) as Pool["query"],
    ));

    expect(restored).toMatchObject({
      kind: "valid",
      snapshot: { rooms: [{ game: { completeRules: {
        nextDamageId: 2,
        damageFlow: { frames: [], completedDamageIds: [1], completedFrameIds: [1] },
      } } }] },
    });
  });

  it("upgrades an old snapshot and preserves a turn-start rescue continuation", async () => {
    const ownerId = "11111111-1111-4111-8111-111111111111";
    const guestId = "22222222-2222-4222-8222-222222222222";
    const game = createGame({ playerIds: [ownerId, guestId], seed: "7".padStart(64, "0") });
    const victim = game.players.find((player) => player.id !== game.currentPlayerId);
    if (!victim) throw new Error("Missing victim");
    victim.hp = 0;
    game.turn.phase = "respond";
    game.pendingResponse = {
      type: "dying",
      victimId: victim.id,
      damageSourceId: null,
      targetId: victim.id,
      remainingResponderIds: [game.currentPlayerId],
      resume: { type: "turn_start" },
    };
    const snapshot: RoomServiceSnapshot = {
      version: 1,
      rooms: [{
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        name: "濒死恢复",
        ownerId,
        status: "playing",
        maxPlayers: 2,
        createdAt: new Date().toISOString(),
        players: [
          { id: ownerId, username: "owner", displayName: "owner", ready: true, connected: false, seat: 0 },
          { id: guestId, username: "guest", displayName: "guest", ready: true, connected: false, seat: 1 },
        ],
        game,
      }],
    };
    const legacySnapshot = structuredClone(snapshot) as unknown as {
      rooms: Array<{ game: {
        players: Array<Record<string, unknown>>;
        turn: Record<string, unknown>;
        virtualCardOrigins?: Record<string, unknown>;
        nextUseId?: number;
        nextEventId?: number;
        afterMove?: Record<string, unknown>;
        completeRules: Record<string, unknown>;
      } }>;
    };
    for (const player of legacySnapshot.rooms[0]!.game.players) {
      delete player.judgment;
      delete player.chained;
      delete player.faceUp;
      delete player.generalId;
    }
    delete legacySnapshot.rooms[0]!.game.turn.skipDraw;
    delete legacySnapshot.rooms[0]!.game.turn.skipPlay;
    delete legacySnapshot.rooms[0]!.game.turn.luoyiActive;
    delete legacySnapshot.rooms[0]!.game.turn.slashRespondedInPlayPhase;
    delete legacySnapshot.rooms[0]!.game.turn.skillUseCounts;
    delete legacySnapshot.rooms[0]!.game.turn.rendeGivenCount;
    delete legacySnapshot.rooms[0]!.game.turn.rendeRecovered;
    delete legacySnapshot.rooms[0]!.game.virtualCardOrigins;
    delete legacySnapshot.rooms[0]!.game.nextUseId;
    delete legacySnapshot.rooms[0]!.game.nextEventId;
    delete legacySnapshot.rooms[0]!.game.afterMove;
    delete legacySnapshot.rooms[0]!.game.completeRules.damageFlow;
    delete legacySnapshot.rooms[0]!.game.completeRules.dying;
    delete legacySnapshot.rooms[0]!.game.completeRules.death;
    const pool = poolWithQuery(vi.fn().mockResolvedValue({ rows: [{ snapshot: legacySnapshot }] }) as Pool["query"]);

    const result = await loadRoomSnapshot(pool);

    if (result.kind !== "valid") throw new Error(result.reason);
    expect(result).toMatchObject({
      kind: "valid",
      snapshot: { rooms: [{ game: {
        players: [
          { judgment: [], chained: false, faceUp: true, generalId: null },
          { judgment: [], chained: false, faceUp: true, generalId: null },
        ],
        turn: {
          skipDraw: false,
          skipPlay: false,
          luoyiActive: false,
          slashRespondedInPlayPhase: false,
          skillUseCounts: {},
          rendeGivenCount: 0,
          rendeRecovered: false,
        },
        virtualCardOrigins: {},
        nextUseId: 1,
        nextEventId: 1,
        afterMove: { queuedTriggers: [], suspendedPhase: null, suspendedResponse: null },
        completeRules: {
          damageFlow: { type: "damage_flow", version: 1, revision: 0, frames: [] },
          dying: { version: 1, frames: [] },
          death: { version: 1, frames: [] },
        },
        pendingResponse: { type: "dying", victimId: victim.id, resume: { type: "turn_start" } },
      } }] },
    });

    const forgedDying = structuredClone(snapshot);
    const forgedDyingGame = forgedDying.rooms[0]!.game!;
    const forgedDamageSourceId = forgedDyingGame.currentPlayerId;
    pushDyingFrame(forgedDyingGame.completeRules.dying, createDyingFrame(
      forgedDyingGame.players,
      {
        frameId: 1,
        victimId: victim.id,
        reason: { type: "damage", eventId: 1, sourceId: forgedDamageSourceId },
        responderOrder: [
          victim.id,
          ...forgedDyingGame.players.filter((player) => player.id !== victim.id).map((player) => player.id),
        ],
      },
    ));
    expect(await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: forgedDying }] }) as Pool["query"],
    ))).toMatchObject({ kind: "invalid", reason: expect.stringContaining("complete-rules") });

    const forgedDeath = structuredClone(snapshot);
    const forgedDeathGame = forgedDeath.rooms[0]!.game!;
    pushDeathFrame(forgedDeathGame.completeRules.death, createDeathFrame({
      frameId: 1,
      death: {
        type: "death",
        eventId: 1,
        victimId: victim.id,
        killerId: forgedDeathGame.currentPlayerId,
        reason: { type: "damage", eventId: 1, sourceId: forgedDeathGame.currentPlayerId },
      },
    }));
    expect(await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: forgedDeath }] }) as Pool["query"],
    ))).toMatchObject({ kind: "invalid", reason: expect.stringContaining("complete-rules") });

    const forgedActive = structuredClone(snapshot);
    const forgedGame = forgedActive.rooms[0]!.game!;
    forgedGame.completeRules.damageFlow = pushDamageFlowFrame(forgedGame.completeRules.damageFlow, {
      expectedParentFrameId: null,
      expectedRevision: 0,
      damage: createDamageInstance({
        damageId: 1,
        frameId: 1,
        sourceId: ownerId,
        targetId: guestId,
        nature: "normal",
        reason: { type: "rule", id: "forged-active-flow" },
        amount: 1,
      }),
    }).state;
    forgedGame.completeRules.nextDamageId = 2;
    // The strict engine state and allocator are valid, but an active room
    // frame is restorable only with its exact persisted dying continuation.
    expect(await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: forgedActive }] }) as Pool["query"],
    ))).toMatchObject({ kind: "invalid", reason: expect.stringContaining("exactly one matching dying continuation") });

    victim.hp = 1;
    game.pendingResponse = {
      type: "nullification",
      attackerId: ownerId,
      targetId: guestId,
      effectTargetId: guestId,
      cardId: "persisted-duel",
      cardKind: "duel",
      remainingResponderIds: [ownerId],
      negated: true,
      effect: { type: "duel", sourceId: ownerId, targetId: guestId, cardId: "persisted-duel" },
    };
    const nullificationResult = await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot }] }) as Pool["query"],
    ));
    expect(nullificationResult).toMatchObject({
      kind: "valid",
      snapshot: { rooms: [{ game: { pendingResponse: { type: "nullification", negated: true } } }] },
    });

    game.pendingResponse = {
      type: "skill_choice",
      targetId: ownerId,
      skillId: "luoyi",
      resume: { type: "finish_draw", playerId: ownerId },
    };
    const skillChoiceResult = await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot }] }) as Pool["query"],
    ));
    expect(skillChoiceResult).toMatchObject({
      kind: "valid",
      snapshot: { rooms: [{ game: { pendingResponse: {
        type: "skill_choice",
        skillId: "luoyi",
        resume: { type: "finish_draw", playerId: ownerId },
      } } }] },
    });

    game.pendingResponse = {
      type: "skill_choice",
      targetId: ownerId,
      skillId: "luoshen",
      resume: { type: "continue_judgment", playerId: ownerId },
      iteration: 17,
    };
    const repeatSkillChoiceResult = await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot }] }) as Pool["query"],
    ));
    expect(repeatSkillChoiceResult).toMatchObject({
      kind: "valid",
      snapshot: { rooms: [{ game: { pendingResponse: {
        type: "skill_choice",
        skillId: "luoshen",
        iteration: 17,
        resume: { type: "continue_judgment", playerId: ownerId },
      } } }] },
    });

    game.pendingResponse = {
      type: "skill_choice",
      targetId: ownerId,
      skillId: "biyue",
      resume: { type: "finish_turn", playerId: ownerId },
    };
    const endSkillChoiceResult = await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot }] }) as Pool["query"],
    ));
    expect(endSkillChoiceResult).toMatchObject({
      kind: "valid",
      snapshot: { rooms: [{ game: { pendingResponse: {
        type: "skill_choice",
        skillId: "biyue",
        resume: { type: "finish_turn", playerId: ownerId },
      } } }] },
    });

    const incompatibleSkillChoice = structuredClone(snapshot) as unknown as {
      rooms: Array<{ game: { pendingResponse: { skillId: string; resume: { type: string } } } }>;
    };
    incompatibleSkillChoice.rooms[0]!.game.pendingResponse.skillId = "keji";
    const incompatibleSkillChoiceResult = await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: incompatibleSkillChoice }] }) as Pool["query"],
    ));
    expect(incompatibleSkillChoiceResult).toMatchObject({
      kind: "invalid",
      reason: expect.stringContaining("incompatible resume point"),
    });

    game.pendingResponse = {
      type: "zone_selection",
      attackerId: ownerId,
      targetId: ownerId,
      victimId: guestId,
      cardId: "persisted-snatch",
      cardKind: "shun_shou_qian_yang",
      mode: "gain",
    };
    const zoneSelectionResult = await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot }] }) as Pool["query"],
    ));
    expect(zoneSelectionResult).toMatchObject({
      kind: "valid",
      snapshot: { rooms: [{ game: { pendingResponse: { type: "zone_selection", mode: "gain" } } }] },
    });

    const poolCard = game.deck.pop();
    if (!poolCard) throw new Error("Missing Amazing Grace pool fixture");
    game.pendingResponse = {
      type: "amazing_grace_selection",
      attackerId: ownerId,
      targetId: guestId,
      cardId: "persisted-grace",
      pool: [poolCard],
      remainingTargetIds: [ownerId],
    };
    const amazingGraceResult = await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot }] }) as Pool["query"],
    ));
    expect(amazingGraceResult).toMatchObject({
      kind: "valid",
      snapshot: { rooms: [{ game: { pendingResponse: { type: "amazing_grace_selection", pool: [{ id: poolCard.id }] } } }] },
    });

    game.pendingResponse = {
      type: "dying",
      victimId: guestId,
      damageSourceId: ownerId,
      targetId: guestId,
      remainingResponderIds: [ownerId],
      resume: {
        type: "chain_damage",
        sourceId: ownerId,
        amount: 1,
        nature: "fire",
        remainingTargetIds: [ownerId],
        finalResume: { type: "finish_effect" },
      },
    };
    const chainDamageResult = await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot }] }) as Pool["query"],
    ));
    expect(chainDamageResult).toMatchObject({
      kind: "valid",
      snapshot: { rooms: [{ game: { pendingResponse: { type: "dying", resume: { type: "chain_damage", nature: "fire" } } } }] },
    });

    const kurouPlayer = game.players.find((player) => player.id === guestId);
    if (!kurouPlayer) throw new Error("Missing Kurou persistence fixture player");
    kurouPlayer.alive = true;
    kurouPlayer.hp = 0;
    game.pendingResponse = {
      type: "dying",
      victimId: guestId,
      damageSourceId: null,
      targetId: guestId,
      remainingResponderIds: [ownerId],
      resume: { type: "skill", skillId: "kurou", playerId: guestId },
    };
    const kurouResult = await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot }] }) as Pool["query"],
    ));
    expect(kurouResult).toMatchObject({
      kind: "valid",
      snapshot: { rooms: [{ game: { pendingResponse: {
        type: "dying",
        damageSourceId: null,
        resume: { type: "skill", skillId: "kurou", playerId: guestId },
      } } }] },
    });

    const invalidKurouSnapshot = structuredClone(snapshot) as unknown as {
      rooms: Array<{ game: { pendingResponse: { resume: { playerId: string } } } }>;
    };
    invalidKurouSnapshot.rooms[0]!.game.pendingResponse.resume.playerId = "99999999-9999-4999-8999-999999999999";
    const invalidKurouResult = await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: invalidKurouSnapshot }] }) as Pool["query"],
    ));
    expect(invalidKurouResult).toMatchObject({
      kind: "invalid",
      reason: expect.stringContaining("unknown player"),
    });

    kurouPlayer.hp = 1;

    const slashCard = game.deck.pop();
    if (!slashCard) throw new Error("Missing weapon Slash fixture");
    game.resolvingCards = [slashCard];
    game.pendingResponse = {
      type: "weapon_action",
      weaponKind: "han_bing_jian",
      stage: "hanbing_select",
      attackerId: ownerId,
      targetId: ownerId,
      victimId: guestId,
      remainingSelections: 2,
      slash: {
        type: "slash",
        attackerId: ownerId,
        targetId: guestId,
        cardId: slashCard.id,
        slashKind: "slash",
        damage: 1,
        nature: "normal",
        color: "black",
        remainingTargetIds: [],
        zhuQueChecked: true,
        ciXiongChecked: true,
      },
    };
    const weaponResult = await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot }] }) as Pool["query"],
    ));
    expect(weaponResult).toMatchObject({
      kind: "valid",
      snapshot: { rooms: [{ game: { pendingResponse: { type: "weapon_action", stage: "hanbing_select" } } }] },
    });
  });

  it("round-trips an identified Jizhi card-use continuation and rejects corrupted frames", async () => {
    const ownerId = "11111111-1111-4111-8111-111111111111";
    const guestId = "22222222-2222-4222-8222-222222222222";
    const game = createGame({ playerIds: [ownerId, guestId], seed: "a".padStart(64, "0") });
    const actor = game.players.find((player) => player.id === game.currentPlayerId);
    if (!actor) throw new Error("Missing Jizhi persistence actor");
    for (const player of game.players) {
      game.discardPile.push(...player.hand);
      player.hand = [];
    }
    actor.generalId = "huang_yue_ying";
    actor.hand = [{
      id: "persisted-jizhi-ex",
      kind: "ex_nihilo",
      name: "无中生有",
      category: "trick",
      suit: "heart",
      rank: 7,
    }];
    game.turn.phase = "play";
    game.pendingResponse = null;

    const offered = applyAction(game, {
      type: "play_card",
      playerId: actor.id,
      cardId: "persisted-jizhi-ex",
    });
    expect(offered.pendingResponse).toMatchObject({
      type: "skill_choice",
      skillId: "jizhi",
      targetId: actor.id,
      promptId: expect.stringContaining("jizhi"),
      resume: {
        type: "card_use",
        stage: "card_use_declared",
        intent: { physicalCardId: "persisted-jizhi-ex", effectiveKind: "ex_nihilo" },
      },
    });
    const snapshot: RoomServiceSnapshot = {
      version: 1,
      rooms: [{
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        name: "集智恢复",
        ownerId,
        status: "playing",
        maxPlayers: 2,
        createdAt: new Date().toISOString(),
        players: [
          { id: ownerId, username: "owner", displayName: "owner", ready: true, connected: false, seat: 0 },
          { id: guestId, username: "guest", displayName: "guest", ready: true, connected: false, seat: 1 },
        ],
        game: offered,
      }],
    };

    const result = await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: JSON.parse(JSON.stringify(snapshot)) }] }) as Pool["query"],
    ));
    expect(result.kind).toBe("valid");
    if (result.kind !== "valid") throw new Error(result.reason);
    const restored = result.snapshot.rooms[0]?.game;
    if (!restored || restored.pendingResponse?.type !== "skill_choice") {
      throw new Error("Missing restored Jizhi continuation");
    }
    const promptId = restored.pendingResponse.promptId;
    if (!promptId) throw new Error("Missing restored Jizhi prompt identifier");
    const resolved = applyAction(restored, {
      type: "resolve_skill",
      playerId: actor.id,
      skillId: "jizhi",
      activate: false,
      promptId,
    });
    expect(resolved.pendingResponse).toBeNull();
    expect(resolved.discardPile.filter((card) => card.id === "persisted-jizhi-ex")).toHaveLength(1);

    const stalePrompt = structuredClone(snapshot);
    const stalePending = stalePrompt.rooms[0]?.game?.pendingResponse;
    if (!stalePending || stalePending.type !== "skill_choice") throw new Error("Missing stale-prompt fixture");
    stalePending.promptId = "skill:stale";
    const staleResult = await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: stalePrompt }] }) as Pool["query"],
    ));
    expect(staleResult).toMatchObject({
      kind: "invalid",
      reason: expect.stringContaining("prompt and trigger identifiers disagree"),
    });

    const missingPhysical = structuredClone(snapshot);
    const missingGame = missingPhysical.rooms[0]?.game;
    if (!missingGame) throw new Error("Missing physical-card fixture");
    const source = missingGame.players.find((player) => player.id === actor.id);
    if (!source) throw new Error("Missing physical-card source");
    source.hand = source.hand.filter((card) => card.id !== "persisted-jizhi-ex");
    const missingResult = await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: missingPhysical }] }) as Pool["query"],
    ));
    expect(missingResult).toMatchObject({
      kind: "invalid",
      reason: expect.stringContaining("physical card is no longer owned"),
    });
  });

  it("round-trips an after-move prompt with its suspended response and rejects corrupt suspension", async () => {
    const ownerId = "11111111-1111-4111-8111-111111111111";
    const guestId = "22222222-2222-4222-8222-222222222222";
    const game = createGame({ playerIds: [ownerId, guestId], seed: "b".padStart(64, "0") });
    const actor = game.players.find((player) => player.id === game.currentPlayerId);
    const target = game.players.find((player) => player.id !== game.currentPlayerId);
    if (!actor || !target) throw new Error("Missing after-move persistence players");
    for (const player of game.players) {
      game.discardPile.push(...player.hand);
      player.hand = [];
    }
    actor.generalId = "lu_xun";
    target.generalId = "liu_bei";
    actor.hand = [{
      id: "persisted-lianying-slash", kind: "slash", name: "杀", category: "basic", suit: "spade", rank: 7,
    }];
    target.hand = [{
      id: "persisted-lianying-dodge", kind: "dodge", name: "闪", category: "basic", suit: "heart", rank: 2,
    }];
    game.turn.phase = "play";
    game.pendingResponse = null;
    const offered = applyAction(game, {
      type: "play_card",
      playerId: actor.id,
      cardId: "persisted-lianying-slash",
      targetId: target.id,
    });
    expect(offered.pendingResponse).toMatchObject({
      type: "skill_choice", skillId: "lianying", targetId: actor.id, resume: { type: "after_move" },
    });
    expect(offered.afterMove).toMatchObject({
      suspendedPhase: "respond",
      suspendedResponse: { type: "slash", targetId: target.id },
    });
    const snapshot: RoomServiceSnapshot = {
      version: 1,
      rooms: [{
        id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        name: "牌移动恢复",
        ownerId,
        status: "playing",
        maxPlayers: 2,
        createdAt: new Date().toISOString(),
        players: [
          { id: ownerId, username: "owner", displayName: "owner", ready: true, connected: false, seat: 0 },
          { id: guestId, username: "guest", displayName: "guest", ready: true, connected: false, seat: 1 },
        ],
        game: offered,
      }],
    };

    const result = await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: JSON.parse(JSON.stringify(snapshot)) }] }) as Pool["query"],
    ));
    expect(result.kind).toBe("valid");
    if (result.kind !== "valid") throw new Error(result.reason);
    const restored = result.snapshot.rooms[0]?.game;
    const pending = restored?.pendingResponse;
    if (!restored || pending?.type !== "skill_choice" || !pending.promptId) {
      throw new Error("Missing restored after-move prompt");
    }
    const resumed = applyAction(restored, {
      type: "resolve_skill",
      playerId: actor.id,
      skillId: "lianying",
      activate: false,
      promptId: pending.promptId,
    });
    expect(resumed.pendingResponse).toMatchObject({ type: "slash", targetId: target.id });
    expect(resumed.afterMove).toEqual({ queuedTriggers: [], suspendedPhase: null, suspendedResponse: null });

    const missingSuspension = structuredClone(snapshot);
    const missingGame = missingSuspension.rooms[0]?.game;
    if (!missingGame) throw new Error("Missing corrupt suspension fixture");
    missingGame.afterMove.suspendedResponse = null;
    const missingResult = await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: missingSuspension }] }) as Pool["query"],
    ));
    expect(missingResult).toMatchObject({
      kind: "invalid", reason: expect.stringContaining("respond phase has no suspended response"),
    });

    const unknownTarget = structuredClone(snapshot);
    const unknownPending = unknownTarget.rooms[0]?.game?.afterMove.suspendedResponse;
    if (!unknownPending || unknownPending.type !== "slash") throw new Error("Missing unknown target fixture");
    unknownPending.targetId = "99999999-9999-4999-8999-999999999999";
    const unknownResult = await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: unknownTarget }] }) as Pool["query"],
    ));
    expect(unknownResult).toMatchObject({
      kind: "invalid", reason: expect.stringContaining("Suspended response references an unknown player"),
    });
  });

  it("defaults legacy Wushuang response counters while restoring Slash and Duel prompts", async () => {
    const ownerId = "11111111-1111-4111-8111-111111111111";
    const guestId = "22222222-2222-4222-8222-222222222222";
    const game = createGame({ playerIds: [ownerId, guestId], seed: "8".padStart(64, "0") });
    const resolving = game.players[0]!.hand.shift();
    if (!resolving) throw new Error("Missing response-counter fixture card");
    game.resolvingCards = [resolving];
    game.turn.phase = "respond";
    game.pendingResponse = {
      type: "slash",
      attackerId: ownerId,
      targetId: guestId,
      cardId: resolving.id,
      slashKind: "slash",
      damage: 1,
      nature: "normal",
      color: "black",
      remainingTargetIds: [],
      zhuQueChecked: true,
      ciXiongChecked: true,
    };
    const snapshot: RoomServiceSnapshot = {
      version: 1,
      rooms: [{
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        name: "旧无双响应",
        ownerId,
        status: "playing",
        maxPlayers: 2,
        createdAt: new Date().toISOString(),
        players: [
          { id: ownerId, username: "owner", displayName: "owner", ready: true, connected: false, seat: 0 },
          { id: guestId, username: "guest", displayName: "guest", ready: true, connected: false, seat: 1 },
        ],
        game,
      }],
    };

    const slashResult = await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: structuredClone(snapshot) }] }) as Pool["query"],
    ));
    expect(slashResult).toMatchObject({
      kind: "valid",
      snapshot: { rooms: [{ game: { pendingResponse: {
        type: "slash", requiredDodgeCount: 1, dodgesPlayed: 0,
      } } }] },
    });

    game.pendingResponse = { ...game.pendingResponse, requiredDodgeCount: 2, dodgesPlayed: 1 };
    const progressedSlashResult = await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: structuredClone(snapshot) }] }) as Pool["query"],
    ));
    expect(progressedSlashResult).toMatchObject({
      kind: "valid",
      snapshot: { rooms: [{ game: { pendingResponse: {
        type: "slash", requiredDodgeCount: 2, dodgesPlayed: 1,
      } } }] },
    });

    game.pendingResponse = {
      type: "duel",
      attackerId: ownerId,
      targetId: guestId,
      cardId: resolving.id,
      initiatorId: ownerId,
      originalTargetId: guestId,
    };
    const legacyDuelResult = await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: structuredClone(snapshot) }] }) as Pool["query"],
    ));
    expect(legacyDuelResult).toMatchObject({
      kind: "valid",
      snapshot: { rooms: [{ game: { pendingResponse: {
        type: "duel", requiredSlashCount: 1, slashesPlayed: 0,
      } } }] },
    });

    game.pendingResponse = { ...game.pendingResponse, requiredSlashCount: 2, slashesPlayed: 1 };
    const progressedDuelResult = await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: structuredClone(snapshot) }] }) as Pool["query"],
    ));
    expect(progressedDuelResult).toMatchObject({
      kind: "valid",
      snapshot: { rooms: [{ game: { pendingResponse: {
        type: "duel", requiredSlashCount: 2, slashesPlayed: 1,
      } } }] },
    });
  });

  it("validates per-turn skill counters and virtual delayed-card origins", async () => {
    const ownerId = "11111111-1111-4111-8111-111111111111";
    const guestId = "22222222-2222-4222-8222-222222222222";
    const game = createGame({ playerIds: [ownerId, guestId], seed: "9".padStart(64, "0") });
    const originIndex = game.deck.findIndex((card) => card.kind !== "le_bu_si_shu");
    const [origin] = game.deck.splice(originIndex, 1);
    if (!origin) throw new Error("Missing virtual delayed-card origin fixture");
    const virtualCard: typeof origin = { ...origin, kind: "le_bu_si_shu" };
    game.players[1]!.judgment.push(virtualCard);
    game.virtualCardOrigins[virtualCard.id] = origin.kind;
    game.turn.skillUseCounts = { zhiheng: 1, qingnang: 0 };
    game.turn.rendeGivenCount = 1;
    game.turn.rendeRecovered = false;
    const snapshot: RoomServiceSnapshot = {
      version: 1,
      rooms: [{
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        name: "技能状态持久化",
        ownerId,
        status: "playing",
        maxPlayers: 2,
        createdAt: new Date().toISOString(),
        players: [
          { id: ownerId, username: "owner", displayName: "owner", ready: true, connected: false, seat: 0 },
          { id: guestId, username: "guest", displayName: "guest", ready: true, connected: false, seat: 1 },
        ],
        game,
      }],
    };

    const validResult = await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot }] }) as Pool["query"],
    ));
    expect(validResult).toMatchObject({
      kind: "valid",
      snapshot: { rooms: [{ game: {
        turn: { skillUseCounts: { zhiheng: 1, qingnang: 0 }, rendeGivenCount: 1, rendeRecovered: false },
        virtualCardOrigins: { [virtualCard.id]: origin.kind },
      } }] },
    });

    const missingVirtualCard = structuredClone(snapshot) as unknown as {
      rooms: Array<{ game: { virtualCardOrigins: Record<string, string> } }>;
    };
    missingVirtualCard.rooms[0]!.game.virtualCardOrigins.missing = "slash";
    const missingVirtualCardResult = await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: missingVirtualCard }] }) as Pool["query"],
    ));
    expect(missingVirtualCardResult).toMatchObject({
      kind: "invalid",
      reason: expect.stringContaining("exactly one resolving or judgment card"),
    });

    const wrongVirtualKind = structuredClone(snapshot) as unknown as {
      rooms: Array<{ game: { players: Array<{ judgment: Array<{ id: string; kind: string }> }> } }>;
    };
    const mappedCard = wrongVirtualKind.rooms[0]!.game.players
      .flatMap((player) => player.judgment)
      .find((card) => card.id === virtualCard.id);
    if (!mappedCard) throw new Error("Missing mapped virtual-card fixture");
    mappedCard.kind = origin.kind;
    const wrongVirtualKindResult = await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: wrongVirtualKind }] }) as Pool["query"],
    ));
    expect(wrongVirtualKindResult).toMatchObject({
      kind: "invalid",
      reason: expect.stringContaining("supported virtual trick card"),
    });

    const invalidCounters = structuredClone(snapshot) as unknown as {
      rooms: Array<{ game: { turn: { skillUseCounts: Record<string, number> } } }>;
    };
    invalidCounters.rooms[0]!.game.turn.skillUseCounts = { not_a_skill: 1, zhiheng: -1 };
    const invalidCounterResult = await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: invalidCounters }] }) as Pool["query"],
    ));
    expect(invalidCounterResult.kind).toBe("invalid");
  });

  it("restores Fanjian suit prompts and virtual Lijian Duels while rejecting forged Fanjian ids", async () => {
    const playerIds = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
      "44444444-4444-4444-8444-444444444444",
    ];
    const members = playerIds.map((id, seat) => ({
      id,
      username: `player-${seat}`,
      displayName: `player-${seat}`,
      ready: true,
      connected: false,
      seat,
    }));
    const roomFor = (game: ReturnType<typeof createGame>, id: string): RoomServiceSnapshot => ({
      version: 1,
      rooms: [{
        id,
        name: "技能续体恢复",
        ownerId: playerIds[0]!,
        status: "playing",
        maxPlayers: 4,
        createdAt: new Date().toISOString(),
        players: members,
        game,
      }],
    });

    const fanjianBase = createGame({ playerIds, seed: "a".padStart(64, "0") });
    const zhouYu = fanjianBase.players.find((player) => player.id === fanjianBase.currentPlayerId)!;
    const target = fanjianBase.players.find((player) => player.id !== zhouYu.id)!;
    zhouYu.generalId = "zhou_yu";
    fanjianBase.turn.phase = "play";
    const fanjian = applyAction(fanjianBase, {
      type: "use_skill", playerId: zhouYu.id, skillId: "fanjian", targetId: target.id,
    });
    const fanjianSnapshot = roomFor(fanjian, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    const restoredFanjian = await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: fanjianSnapshot }] }) as Pool["query"],
    ));
    expect(restoredFanjian).toMatchObject({
      kind: "valid",
      snapshot: { rooms: [{ game: { pendingResponse: {
        type: "fanjian_suit",
        attackerId: zhouYu.id,
        targetId: target.id,
        promptId: expect.stringContaining(":fanjian:"),
      } } }] },
    });

    const forged = structuredClone(fanjianSnapshot) as unknown as {
      rooms: Array<{ game: { pendingResponse: { promptId: string } } }>;
    };
    forged.rooms[0]!.game.pendingResponse.promptId += ":replayed";
    const rejectedFanjian = await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: forged }] }) as Pool["query"],
    ));
    expect(rejectedFanjian).toMatchObject({
      kind: "invalid",
      reason: expect.stringContaining("Fanjian prompt state is inconsistent"),
    });

    const lijianBase = createGame({ playerIds, seed: "b".padStart(64, "0") });
    const diaoChan = lijianBase.players.find((player) => player.id === lijianBase.currentPlayerId)!;
    const [firstMale, secondMale, thirdMale] = lijianBase.players.filter((player) => player.id !== diaoChan.id);
    diaoChan.generalId = "diao_chan";
    firstMale!.generalId = "liu_bei";
    secondMale!.generalId = "zhu_ge_liang";
    thirdMale!.generalId = "guan_yu";
    lijianBase.turn.phase = "play";
    const costId = diaoChan.hand[0]!.id;
    const lijian = applyAction(lijianBase, {
      type: "use_skill",
      playerId: diaoChan.id,
      skillId: "lijian",
      cardIds: [costId],
      targetIds: [firstMale!.id, secondMale!.id],
    });
    const restoredLijian = await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{
        snapshot: roomFor(lijian, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
      }] }) as Pool["query"],
    ));
    expect(restoredLijian).toMatchObject({
      kind: "valid",
      snapshot: { rooms: [{ game: { pendingResponse: {
        type: "duel",
        attackerId: firstMale!.id,
        targetId: secondMale!.id,
        cardId: expect.stringMatching(/^skill:lijian:/),
      } } }] },
    });
  });

  it("restores the exact Hujia provider cursor and rejects a forged lord-dispatch prompt id", async () => {
    const playerIds = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
      "44444444-4444-4444-8444-444444444444",
    ];
    const game = createGame({ playerIds, seed: "c".padStart(64, "0") });
    for (const player of game.players) {
      game.discardPile.push(...player.hand);
      player.hand = [];
    }
    const attacker = game.players.find((player) => player.id === game.currentPlayerId)!;
    attacker.generalId = "lv_bu";
    const [caoCao, firstWei, secondWei] = game.players.filter((player) => player.id !== attacker.id);
    const oldLord = game.players.find((player) => player.role === "lord")!;
    oldLord.role = caoCao!.role;
    caoCao!.role = "lord";
    caoCao!.generalId = "cao_cao";
    firstWei!.generalId = "guo_jia";
    secondWei!.generalId = "si_ma_yi";
    attacker.hand = [{ id: "persist-hujia-slash", kind: "slash", name: "杀", category: "basic", suit: "spade", rank: 7 }];
    secondWei!.hand = [{ id: "persist-hujia-dodge", kind: "dodge", name: "闪", category: "basic", suit: "heart", rank: 2 }];
    game.turn.phase = "play";
    let pending = applyAction(game, {
      type: "play_card", playerId: attacker.id, cardId: "persist-hujia-slash", targetId: caoCao!.id,
    });
    pending = applyAction(pending, {
      type: "invoke_lord_skill", playerId: caoCao!.id, skillId: "hujia",
    });
    const snapshot: RoomServiceSnapshot = {
      version: 1,
      rooms: [{
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        name: "护驾恢复",
        ownerId: playerIds[0]!,
        status: "playing",
        maxPlayers: 4,
        createdAt: new Date().toISOString(),
        players: playerIds.map((id, seat) => ({
          id, username: `p-${seat}`, displayName: `p-${seat}`, ready: true, connected: false, seat,
        })),
        game: pending,
      }],
    };
    const restored = await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot }] }) as Pool["query"],
    ));
    expect(restored).toMatchObject({
      kind: "valid",
      snapshot: { rooms: [{ game: { pendingResponse: {
        type: "lord_dispatch",
        requesterId: caoCao!.id,
        targetId: firstWei!.id,
        remainingProviderIds: [secondWei!.id],
        resume: { type: "respond", pending: { type: "slash", targetId: caoCao!.id } },
      } } }] },
    });

    const forged = structuredClone(snapshot) as unknown as {
      rooms: Array<{ game: { pendingResponse: { promptId: string } } }>;
    };
    forged.rooms[0]!.game.pendingResponse.promptId += ":stale";
    const rejected = await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: forged }] }) as Pool["query"],
    ));
    expect(rejected).toMatchObject({
      kind: "invalid", reason: expect.stringContaining("Lord dispatch prompt state is inconsistent"),
    });
  });

  it("round-trips a private Guanxing reorder prompt and rejects forged prompt or top-card cursors", async () => {
    const ownerId = "11111111-1111-4111-8111-111111111111";
    const guestId = "22222222-2222-4222-8222-222222222222";
    const game = createGame({ playerIds: [ownerId, guestId], seed: "c".padStart(64, "0") });
    const actor = game.players.find((player) => player.id === game.currentPlayerId);
    const zhuge = game.players.find((player) => player.id !== game.currentPlayerId);
    if (!actor || !zhuge) throw new Error("Missing Guanxing persistence fixture players");
    game.discardPile.push(...game.players.flatMap((player) => player.hand));
    for (const player of game.players) {
      player.hand = [];
      player.equipment = {};
      player.generalId = "gan_ning";
    }
    zhuge.generalId = "zhu_ge_liang";
    game.deck = [
      standardCard("persisted-gx-bottom", "slash"),
      standardCard("persisted-gx-low", "peach"),
      standardCard("persisted-gx-high", "dodge"),
    ];
    game.resolvingCards = [];
    game.currentPlayerId = actor.id;
    game.turn = { ...game.turn, playerId: actor.id, phase: "play", requiredDiscardCount: 0 };
    game.pendingResponse = null;

    const offered = applyAction(game, { type: "end_play", playerId: actor.id });
    if (offered.pendingResponse?.type !== "standard_skill") throw new Error("Guanxing invoke prompt was not created");
    const choosing = applyAction(offered, {
      type: "resolve_standard_skill",
      playerId: zhuge.id,
      promptId: offered.pendingResponse.promptId,
      activate: true,
    });
    expect(choosing.pendingResponse).toMatchObject({
      type: "standard_skill",
      targetId: zhuge.id,
      skillId: "guanxing",
      stage: "guanxing_reorder",
      selectedCardIds: ["persisted-gx-high", "persisted-gx-low"],
    });

    const snapshot: RoomServiceSnapshot = {
      version: 1,
      rooms: [{
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        name: "观星私有游标重连",
        ownerId: actor.id,
        status: "playing",
        maxPlayers: 2,
        createdAt: new Date().toISOString(),
        players: game.players.map((player) => ({
          id: player.id,
          username: player.id === actor.id ? "owner" : "guest",
          displayName: player.id === actor.id ? "owner" : "guest",
          ready: true,
          connected: false,
          seat: player.seat,
        })),
        game: choosing,
      }],
    };
    expect(await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot }] }) as Pool["query"],
    ))).toMatchObject({
      kind: "valid",
      snapshot: { rooms: [{ game: { pendingResponse: {
        type: "standard_skill",
        skillId: "guanxing",
        stage: "guanxing_reorder",
        selectedCardIds: ["persisted-gx-high", "persisted-gx-low"],
      } } }] },
    });

    const forgedPrompt = structuredClone(snapshot) as unknown as {
      rooms: Array<{ game: { pendingResponse: { promptId: string } } }>;
    };
    forgedPrompt.rooms[0]!.game.pendingResponse.promptId = "standard:forged:guanxing";
    expect(await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: forgedPrompt }] }) as Pool["query"],
    ))).toMatchObject({ kind: "invalid", reason: expect.stringContaining("prompt metadata") });

    const forgedStage = structuredClone(snapshot) as unknown as {
      rooms: Array<{ game: { pendingResponse: { stage: string } } }>;
    };
    forgedStage.rooms[0]!.game.pendingResponse.stage = "tuxi_select";
    expect(await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: forgedStage }] }) as Pool["query"],
    ))).toMatchObject({ kind: "invalid", reason: expect.stringContaining("id/stage combination") });

    const forgedTopCards = structuredClone(snapshot) as unknown as {
      rooms: Array<{ game: { pendingResponse: { selectedCardIds: string[] } } }>;
    };
    forgedTopCards.rooms[0]!.game.pendingResponse.selectedCardIds[0] = "not-a-current-top-card";
    expect(await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: forgedTopCards }] }) as Pool["query"],
    ))).toMatchObject({ kind: "invalid", reason: expect.stringContaining("current top cards") });
  });

  it("round-trips an in-flight physical judgment and rejects forged judgment cursors or entities", async () => {
    const ownerId = "11111111-1111-4111-8111-111111111111";
    const guestId = "22222222-2222-4222-8222-222222222222";
    const game = createGame({ playerIds: [ownerId, guestId], seed: "d".padStart(64, "0") });
    const actor = game.players.find((player) => player.id === game.currentPlayerId);
    const target = game.players.find((player) => player.id !== game.currentPlayerId);
    if (!actor || !target) throw new Error("Missing standard judgment persistence fixture players");
    game.discardPile.push(...game.players.flatMap((player) => player.hand));
    for (const player of game.players) {
      player.hand = [];
      player.equipment = {};
      player.generalId = "gan_ning";
    }
    target.generalId = "si_ma_yi";
    grantSkill(game.completeRules.lifecycle, {
      ownerId: target.id,
      skillId: "guicai",
      sourcePlayerId: target.id,
      sourceSkillId: "persistence-test",
      expiry: { type: "permanent" },
    });
    actor.hand = [standardCard("persisted-bagua-slash", "slash")];
    target.hand = [standardCard("persisted-guicai-cost", "dodge", "club")];
    target.equipment.armor = standardCard("persisted-bagua", "ba_gua_zhen");
    game.deck = [standardCard("persisted-judgment", "peach", "heart")];
    game.resolvingCards = [];
    game.currentPlayerId = actor.id;
    game.turn = { ...game.turn, playerId: actor.id, phase: "play", slashUsed: false, requiredDiscardCount: 0 };
    game.pendingResponse = null;

    const attacked = applyAction(game, {
      type: "play_card", playerId: actor.id, cardId: "persisted-bagua-slash", targetId: target.id,
    });
    const judging = applyAction(attacked, { type: "activate_armor", playerId: target.id, activate: true });
    expect(judging.pendingResponse).toMatchObject({
      type: "standard_judgment",
      targetId: target.id,
      frame: { targetId: target.id, cardId: "persisted-judgment", stage: "retrial_window" },
      context: { type: "armor", pending: { type: "slash", targetId: target.id } },
    });

    const snapshot: RoomServiceSnapshot = {
      version: 1,
      rooms: [{
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        name: "实体判定重连",
        ownerId: actor.id,
        status: "playing",
        maxPlayers: 2,
        createdAt: new Date().toISOString(),
        players: game.players.map((player) => ({
          id: player.id,
          username: player.id === actor.id ? "owner" : "guest",
          displayName: player.id === actor.id ? "owner" : "guest",
          ready: true,
          connected: false,
          seat: player.seat,
        })),
        game: judging,
      }],
    };
    const valid = await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot }] }) as Pool["query"],
    ));
    if (valid.kind !== "valid") throw new Error(valid.reason);
    expect(valid).toMatchObject({
      kind: "valid",
      snapshot: { rooms: [{ game: { pendingResponse: {
        type: "standard_judgment",
        promptId: judging.pendingResponse?.type === "standard_judgment" ? judging.pendingResponse.promptId : "",
        frame: { cardId: "persisted-judgment" },
      } } }] },
    });

    const forgedCursor = structuredClone(snapshot) as unknown as {
      rooms: Array<{ game: { pendingResponse: { promptId: string } } }>;
    };
    forgedCursor.rooms[0]!.game.pendingResponse.promptId = "judgment:forged:retrial";
    expect(await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: forgedCursor }] }) as Pool["query"],
    ))).toMatchObject({ kind: "invalid", reason: expect.stringContaining("prompt cursor") });

    const forgedEntity = structuredClone(snapshot) as unknown as {
      rooms: Array<{ game: { pendingResponse: { frame: { cardId: string } } } }>;
    };
    forgedEntity.rooms[0]!.game.pendingResponse.frame.cardId = "missing-judgment-entity";
    expect(await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: forgedEntity }] }) as Pool["query"],
    ))).toMatchObject({ kind: "invalid", reason: expect.stringContaining("physical/derived") });

    const forgedContext = structuredClone(snapshot) as unknown as {
      rooms: Array<{ game: { pendingResponse: { frame: { reason: { id: string } } } } }>;
    };
    forgedContext.rooms[0]!.game.pendingResponse.frame.reason.id = "tieqi";
    expect(await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: forgedContext }] }) as Pool["query"],
    ))).toMatchObject({ kind: "invalid", reason: expect.stringContaining("context does not match") });
  });

  it("round-trips face-down state and a one-shot Slash turn-flow continuation", async () => {
    const playerIds = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
    ];
    let game = createGame({ playerIds, seed: "e".padStart(64, "0") });
    const actor = game.players.find((player) => player.id === game.currentPlayerId)!;
    const target = game.players.find((player) => player.id !== actor.id)!;
    game.discardPile.push(...game.players.flatMap((player) => player.hand));
    for (const player of game.players) {
      player.hand = [];
      player.generalId = "gan_ning";
      player.equipment = {};
    }
    actor.hp = 1;
    actor.hand = [
      standardCard("resume-slash", "slash"),
      standardCard("resume-extra-1", "dodge"),
      standardCard("resume-extra-2", "dodge"),
      standardCard("resume-extra-3", "dodge"),
    ];
    target.hand = [standardCard("resume-dodge", "dodge")];
    game.pendingResponse = null;
    game.turn = { ...game.turn, playerId: actor.id, phase: "play", slashUsed: false, requiredDiscardCount: 0 };
    game = turnOverGamePlayer(game, target.id);
    game = applyAction(game, {
      type: "play_card", playerId: actor.id, cardId: "resume-slash", targetId: target.id,
    });
    if (game.pendingResponse?.type !== "slash") throw new Error("Missing persisted Slash fixture");
    const continuationId = game.nextEventId;
    game.nextEventId += 1;
    game.completeRules.nextEventId = game.nextEventId;
    game.pendingResponse = {
      ...game.pendingResponse,
      completion: { type: "turn_flow", continuationId, playerId: actor.id, destination: "discard_or_end" },
    };
    const snapshot: RoomServiceSnapshot = {
      version: 1,
      rooms: [{
        id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        name: "Slash continuation",
        ownerId: actor.id,
        status: "playing",
        maxPlayers: 3,
        createdAt: new Date().toISOString(),
        players: game.players.map((player) => ({
          id: player.id,
          username: `player-${player.seat}`,
          displayName: `player-${player.seat}`,
          ready: true,
          connected: false,
          seat: player.seat,
        })),
        game,
      }],
    };

    const valid = await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot }] }) as Pool["query"],
    ));
    if (valid.kind !== "valid") throw new Error(valid.reason);
    expect(valid).toMatchObject({
      kind: "valid",
      snapshot: { rooms: [{ game: {
        players: expect.arrayContaining([expect.objectContaining({ id: target.id, faceUp: false })]),
        pendingResponse: { type: "slash", completion: { type: "turn_flow", continuationId } },
      } }] },
    });
    const restoredGame = valid.snapshot.rooms[0]!.game!;
    const resolved = applyAction(restoredGame, {
      type: "respond", playerId: target.id, cardId: "resume-dodge",
    });
    expect(resolved.turn).toMatchObject({ phase: "discard", requiredDiscardCount: 2 });
    expect(resolved.pendingResponse).toBeNull();

    const forged = structuredClone(snapshot) as unknown as {
      rooms: Array<{ game: { nextEventId: number; pendingResponse: { completion: { continuationId: number } } } }>;
    };
    forged.rooms[0]!.game.pendingResponse.completion.continuationId = forged.rooms[0]!.game.nextEventId;
    expect(await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: forged }] }) as Pool["query"],
    ))).toMatchObject({ kind: "invalid", reason: expect.stringContaining("Slash completion continuation") });

    const forgedPlayer = structuredClone(snapshot) as unknown as {
      rooms: Array<{ game: { pendingResponse: { completion: { playerId: string } } } }>;
    };
    forgedPlayer.rooms[0]!.game.pendingResponse.completion.playerId = target.id;
    expect(await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: forgedPlayer }] }) as Pool["query"],
    ))).toMatchObject({ kind: "invalid", reason: expect.stringContaining("Slash completion continuation") });

    const forgedDestination = structuredClone(snapshot) as unknown as {
      rooms: Array<{ game: { pendingResponse: { completion: { destination: string } } } }>;
    };
    forgedDestination.rooms[0]!.game.pendingResponse.completion.destination = "judgment";
    expect(await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: forgedDestination }] }) as Pool["query"],
    ))).toMatchObject({ kind: "invalid" });
  });

  it("rejects an incomplete game before RoomService restoration", async () => {
    const pool = poolWithQuery(vi.fn().mockResolvedValue({
      rows: [{
        snapshot: {
          version: 1,
          rooms: [{
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            name: "损坏对局",
            ownerId: "11111111-1111-4111-8111-111111111111",
            status: "playing",
            maxPlayers: 2,
            createdAt: new Date().toISOString(),
            players: [{
              id: "11111111-1111-4111-8111-111111111111",
              username: "owner",
              displayName: "owner",
              ready: true,
              connected: false,
              seat: 0,
            }],
            game: { version: 1 },
          }],
        },
      }],
    }) as Pool["query"]);

    const result = await loadRoomSnapshot(pool);

    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") expect(result.reason).toContain("Required");
  });

  it("coalesces queued mutations to the newest snapshot", async () => {
    let releaseFirstWrite: (() => void) | undefined;
    const firstWrite = new Promise<void>((resolve) => { releaseFirstWrite = resolve; });
    const query = vi.fn()
      .mockImplementationOnce(async () => {
        await firstWrite;
        return { rows: [] };
      })
      .mockResolvedValue({ rows: [] });
    const writer = new RoomSnapshotWriter(poolWithQuery(query as Pool["query"]), vi.fn());
    const first = { version: 1, rooms: [], marker: "first" } as unknown as RoomServiceSnapshot;
    const middle = { version: 1, rooms: [], marker: "middle" } as unknown as RoomServiceSnapshot;
    const newest = { version: 1, rooms: [], marker: "newest" } as unknown as RoomServiceSnapshot;

    writer.enqueue(first);
    await vi.waitFor(() => expect(query).toHaveBeenCalledTimes(1));
    writer.enqueue(middle);
    writer.enqueue(newest);
    releaseFirstWrite?.();
    await writer.flush();

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1]?.[1]).toEqual([JSON.stringify(newest)]);
  });
});
