import type { Pool } from "pg";
import {
  GameRuleError,
  applyAction,
  createGame,
  decodeGameDamageContinuation,
  encodeGameDamageContinuation,
  getCardDefinition,
  grantSkill,
  type Card,
  type CardKind,
  type GameSession,
} from "@sanguosha/shared";
import { describe, expect, it, vi } from "vitest";

import { loadRoomSnapshot } from "./room-persistence.js";
import type { RoomServiceSnapshot } from "./rooms.js";

type DeepMutable<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? DeepMutable<Item>[]
    : T extends object
      ? { -readonly [Key in keyof T]: DeepMutable<T[Key]> }
      : T;

type MutableSnapshot = DeepMutable<RoomServiceSnapshot>;

interface LethalFixture {
  readonly snapshot: RoomServiceSnapshot;
  readonly actorId: string;
  readonly victimId: string;
  readonly otherId: string;
  readonly slashId: string;
  readonly peachId: string;
  readonly secondPeachId: string | null;
}

interface NestedGanglieFixture {
  readonly snapshot: RoomServiceSnapshot;
  readonly opportunitySnapshot: RoomServiceSnapshot;
  readonly judgmentSnapshot: RoomServiceSnapshot | null;
  readonly actorId: string;
  readonly targetId: string;
  readonly peachId: string;
}

interface BuquRecoveryFixture {
  readonly snapshot: RoomServiceSnapshot;
  readonly ownerId: string;
  readonly woundIds: readonly string[];
}

function snapshotForGame(game: GameSession, id: string, name: string): RoomServiceSnapshot {
  return {
    version: 1,
    rooms: [{
      id,
      name,
      ownerId: game.currentPlayerId,
      status: game.status,
      maxPlayers: game.players.length,
      createdAt: new Date().toISOString(),
      players: game.players.map((player) => ({
        id: player.id,
        username: `persist-${player.seat}`,
        displayName: `persist-${player.seat}`,
        ready: true,
        connected: false,
        seat: player.seat,
      })),
      game,
    }],
  };
}

function poolWithSnapshot(snapshot: unknown): Pool {
  const query = vi.fn().mockResolvedValue({ rows: [{ snapshot }] }) as Pool["query"];
  return { query } as unknown as Pool;
}

function standardCard(id: string, kind: CardKind, suit: Card["suit"] = "spade"): Card {
  return { id, kind, ...getCardDefinition(kind), suit, rank: 7 };
}

function takeDistinctRankCards(game: GameSession, count: number): Card[] {
  const ranks = new Set<number>();
  const indexes: number[] = [];
  for (let index = game.deck.length - 1; index >= 0 && indexes.length < count; index -= 1) {
    const card = game.deck[index]!;
    if (ranks.has(card.rank)) continue;
    ranks.add(card.rank);
    indexes.push(index);
  }
  if (indexes.length !== count) throw new Error("Missing distinct-rank Buqu fixture cards");
  return indexes.map((index) => game.deck.splice(index, 1)[0]!);
}

function takeDuplicateRankCards(game: GameSession): Card[] {
  const firstIndexByRank = new Map<number, number>();
  for (let index = game.deck.length - 1; index >= 0; index -= 1) {
    const card = game.deck[index]!;
    const firstIndex = firstIndexByRank.get(card.rank);
    if (firstIndex === undefined) {
      firstIndexByRank.set(card.rank, index);
      continue;
    }
    return [firstIndex, index]
      .sort((left, right) => right - left)
      .map((cardIndex) => game.deck.splice(cardIndex, 1)[0]!);
  }
  throw new Error("Missing duplicate-rank Buqu fixture cards");
}

function buildBuquPeachGardenFixture(): BuquRecoveryFixture {
  const game = createGame({
    playerIds: [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
    ],
    seed: "d".repeat(64),
  });
  const actor = game.players.find((player) => player.id === game.currentPlayerId);
  const owner = game.players.find((player) => player.id !== game.currentPlayerId);
  if (!actor || !owner) throw new Error("Missing Buqu Peach Garden fixture players");
  game.discardPile.push(...game.players.flatMap((player) => player.hand));
  for (const player of game.players) {
    player.generalId = player.id === owner.id ? "zhou_tai" : "gan_ning";
    player.hp = 4;
    player.maxHp = 4;
    player.alive = true;
    player.hand = [];
    player.equipment = {};
    player.judgment = [];
    player.chained = false;
    player.extraPiles = {};
  }
  const wounds = takeDistinctRankCards(game, 6);
  owner.hp = 0;
  owner.extraPiles.buqu = wounds;
  const peachGardenId = "persist-buqu-peach-garden";
  actor.hand = [standardCard(peachGardenId, "peach_garden", "heart")];
  game.resolvingCards = [];
  game.pendingResponse = null;
  game.afterMove = { queuedRecoveries: [], queuedTriggers: [], suspendedPhase: null, suspendedResponse: null };
  game.turn = {
    ...game.turn,
    playerId: actor.id,
    phase: "play",
    slashUsed: false,
    wineUsed: false,
    slashDamageBonus: 0,
    requiredDiscardCount: 0,
    discardStage: "hand_limit",
    skipDraw: false,
    skipPlay: false,
    luoyiActive: false,
    slashRespondedInPlayPhase: false,
    skillUseCounts: {},
    rendeGivenCount: 0,
    rendeRecovered: false,
  };
  const offered = applyAction(game, {
    type: "play_card",
    playerId: actor.id,
    cardId: peachGardenId,
  });
  if (
    offered.pendingResponse?.type !== "standard_skill" ||
    offered.pendingResponse.skillId !== "buqu" ||
    offered.pendingResponse.stage !== "buqu_recovery"
  ) throw new Error("Peach Garden did not stop at the Buqu recovery prompt");
  return {
    snapshot: snapshotForGame(offered, "ffffffff-ffff-4fff-8fff-ffffffffffff", "Buqu Peach Garden Recovery"),
    ownerId: owner.id,
    woundIds: wounds.map((card) => card.id),
  };
}

function buildLethalFixture(options: {
  readonly damageBonus?: 0 | 1;
  readonly peachCount?: 1 | 2;
  readonly victimGeneralId?: "gan_ning" | "pang_tong" | "zhou_tai";
} = {}): LethalFixture {
  const playerIds = [
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
    "33333333-3333-4333-8333-333333333333",
  ];
  const game = createGame({ playerIds, seed: "a".repeat(64) });
  const actor = game.players.find((player) => player.id === game.currentPlayerId);
  const victims = game.players.filter((player) => player.id !== game.currentPlayerId);
  const victim = victims[0];
  const other = victims[1];
  if (!actor || !victim || !other) throw new Error("Missing lethal persistence fixture players");

  game.discardPile.push(...game.players.flatMap((player) => player.hand));
  for (const player of game.players) {
    player.generalId = "gan_ning";
    player.hp = 4;
    player.maxHp = 4;
    player.alive = true;
    player.hand = [];
    player.equipment = {};
    player.judgment = [];
    player.chained = false;
    player.extraPiles = {};
  }
  victim.generalId = options.victimGeneralId ?? "gan_ning";
  const slashId = "persist-live-lethal-slash";
  const peachId = "persist-live-rescue-peach";
  const secondPeachId = options.peachCount === 2 ? "persist-live-rescue-peach-2" : null;
  actor.hand = [standardCard(slashId, "slash")];
  victim.hand = [
    standardCard(peachId, "peach", "heart"),
    ...(secondPeachId ? [standardCard(secondPeachId, "peach", "diamond")] : []),
  ];
  victim.hp = 1;
  game.resolvingCards = [];
  game.pendingResponse = null;
  game.afterMove = { queuedTriggers: [], suspendedPhase: null, suspendedResponse: null };
  game.turn = {
    ...game.turn,
    playerId: actor.id,
    phase: "play",
    slashUsed: false,
    wineUsed: false,
    slashDamageBonus: options.damageBonus ?? 0,
    requiredDiscardCount: 0,
    discardStage: "hand_limit",
    skipDraw: false,
    skipPlay: false,
    luoyiActive: false,
    slashRespondedInPlayPhase: false,
    skillUseCounts: {},
    rendeGivenCount: 0,
    rendeRecovered: false,
  };

  const awaitingDodge = applyAction(game, {
    type: "play_card",
    playerId: actor.id,
    cardId: slashId,
    targetId: victim.id,
  });
  const lethal = applyAction(awaitingDodge, {
    type: "respond",
    playerId: victim.id,
    cardId: null,
  });
  if (options.victimGeneralId === "pang_tong") {
    if (lethal.pendingResponse?.type !== "skill_choice" || lethal.pendingResponse.skillId !== "niepan") {
      throw new Error("Real lethal damage did not stop at the Niepan prompt");
    }
  } else if (options.victimGeneralId === "zhou_tai") {
    if (lethal.pendingResponse?.type !== "skill_choice" || lethal.pendingResponse.skillId !== "buqu") {
      throw new Error("Real lethal damage did not stop at the Buqu entry prompt");
    }
  } else if (lethal.pendingResponse?.type !== "dying" || lethal.pendingResponse.resume.type !== "damage_flow") {
    throw new Error("Real lethal damage did not stop at the DamageFlow dying barrier");
  }
  if (lethal.completeRules.damageFlow.frames.length !== 1) {
    throw new Error("Real lethal damage did not retain exactly one active DamageFlow frame");
  }

  const snapshot: RoomServiceSnapshot = {
    version: 1,
    rooms: [{
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "Live lethal persistence",
      ownerId: actor.id,
      status: "playing",
      maxPlayers: 3,
      createdAt: new Date().toISOString(),
      players: lethal.players.map((player) => ({
        id: player.id,
        username: player.id === actor.id ? "live-actor" : player.id === victim.id ? "live-victim" : "live-other",
        displayName: player.id === actor.id ? "live-actor" : player.id === victim.id ? "live-victim" : "live-other",
        ready: true,
        connected: false,
        seat: player.seat,
      })),
      game: lethal,
    }],
  };
  return {
    snapshot,
    actorId: actor.id,
    victimId: victim.id,
    otherId: other.id,
    slashId,
    peachId,
    secondPeachId,
  };
}

function buildNestedGanglieFixture(): NestedGanglieFixture {
  const playerIds = [
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
    "33333333-3333-4333-8333-333333333333",
  ];
  const game = createGame({ playerIds, seed: "b".repeat(64) });
  const actor = game.players.find((player) => player.id === game.currentPlayerId);
  const target = game.players.find((player) => player.id !== game.currentPlayerId);
  if (!actor || !target) throw new Error("Missing nested Ganglie fixture players");
  game.discardPile.push(...game.players.flatMap((player) => player.hand));
  for (const player of game.players) {
    player.generalId = player.id === target.id ? "xia_hou_dun" : "gan_ning";
    player.hp = player.id === actor.id ? 1 : 4;
    player.maxHp = 4;
    player.alive = true;
    player.hand = [];
    player.equipment = {};
    player.judgment = [];
    player.chained = false;
    player.extraPiles = {};
  }
  const slashId = "nested-ganglie-slash";
  const peachId = "nested-ganglie-peach";
  actor.hand = [standardCard(slashId, "slash"), standardCard(peachId, "peach", "heart")];
  const judgmentIndex = game.deck.findIndex((card) => card.suit !== "heart");
  if (judgmentIndex < 0) throw new Error("Missing non-Heart Ganglie judgment card");
  const [judgmentCard] = game.deck.splice(judgmentIndex, 1);
  game.deck.push(judgmentCard!);
  game.resolvingCards = [];
  game.pendingResponse = null;
  game.afterMove = { queuedRecoveries: [], queuedTriggers: [], suspendedPhase: null, suspendedResponse: null };
  game.turn = {
    ...game.turn,
    playerId: actor.id,
    phase: "play",
    slashUsed: false,
    wineUsed: false,
    slashDamageBonus: 0,
    requiredDiscardCount: 0,
    discardStage: "hand_limit",
    skipDraw: false,
    skipPlay: false,
    luoyiActive: false,
    slashRespondedInPlayPhase: false,
    skillUseCounts: {},
    rendeGivenCount: 0,
    rendeRecovered: false,
  };

  let current = applyAction(game, { type: "play_card", playerId: actor.id, cardId: slashId, targetId: target.id });
  current = applyAction(current, { type: "respond", playerId: target.id, cardId: null });
  const invoke = current.pendingResponse;
  if (invoke?.type !== "standard_skill" || invoke.skillId !== "ganglie" || !invoke.damageOpportunity) {
    throw new Error("Ganglie did not stop at its DamageFlow opportunity");
  }
  const opportunitySnapshot = snapshotForGame(
    current,
    "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    "Ganglie Damage Opportunity",
  );
  current = applyAction(current, {
    type: "resolve_standard_skill",
    playerId: invoke.targetId,
    promptId: invoke.promptId,
    activate: true,
  });
  const judgmentSnapshot = current.pendingResponse?.type === "standard_judgment"
    ? snapshotForGame(current, "dddddddd-dddd-4ddd-8ddd-dddddddddddd", "Ganglie Judgment")
    : null;
  while (current.pendingResponse?.type === "standard_judgment") {
    const judgment = current.pendingResponse;
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: judgment.targetId,
      promptId: judgment.promptId,
      activate: false,
    });
  }
  const punishment = current.pendingResponse;
  if (punishment?.type !== "standard_skill" || punishment.skillId !== "ganglie" || punishment.stage !== "ganglie_punish") {
    throw new Error("Ganglie did not reach its punishment prompt");
  }
  current = applyAction(current, {
    type: "resolve_standard_skill",
    playerId: punishment.targetId,
    promptId: punishment.promptId,
    activate: false,
  });
  if (current.pendingResponse?.type !== "dying" || current.pendingResponse.resume.type !== "damage_flow") {
    throw new Error("Ganglie child damage did not enter dying");
  }
  return {
    snapshot: snapshotForGame(current, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "Nested Ganglie DamageFlow"),
    opportunitySnapshot,
    judgmentSnapshot,
    actorId: actor.id,
    targetId: target.id,
    peachId,
  };
}

function buildNestedGuhuoDyingFixture() {
  const game = createGame({
    playerIds: [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
      "44444444-4444-4444-8444-444444444444",
    ],
    seed: "e7".repeat(32),
  });
  const attacker = game.players.find((player) => player.id === game.currentPlayerId);
  const victim = game.players.find((player) => player.id !== game.currentPlayerId);
  if (!attacker || !victim) throw new Error("Missing nested Guhuo fixture players");
  game.discardPile.push(...game.players.flatMap((player) => player.hand));
  for (const player of game.players) {
    player.generalId = "gan_ning";
    player.hp = player.maxHp = 4;
    player.alive = true;
    player.hand = [];
    player.equipment = {};
    player.judgment = [];
    player.extraPiles = {};
    player.chained = false;
  }
  victim.generalId = "yu_ji";
  victim.hp = 1;
  attacker.hand = [standardCard("persist-nested-guhuo-slash", "slash")];
  victim.hand = [standardCard("persist-nested-guhuo-peach", "peach", "heart")];
  game.resolvingCards = [];
  game.pendingResponse = null;
  game.afterMove = { queuedRecoveries: [], queuedTriggers: [], suspendedPhase: null, suspendedResponse: null };
  game.turn = {
    ...game.turn,
    playerId: attacker.id,
    phase: "play",
    slashUsed: false,
    wineUsed: false,
    slashDamageBonus: 0,
    requiredDiscardCount: 0,
    discardStage: "hand_limit",
    skipDraw: false,
    skipPlay: false,
    luoyiActive: false,
    slashRespondedInPlayPhase: false,
    skillUseCounts: {},
    rendeGivenCount: 0,
    rendeRecovered: false,
  };

  let current = applyAction(game, {
    type: "play_card",
    playerId: attacker.id,
    cardId: "persist-nested-guhuo-slash",
    targetId: victim.id,
  });
  current = applyAction(current, { type: "respond", playerId: victim.id, cardId: null });
  current = applyAction(current, {
    type: "declare_guhuo",
    playerId: victim.id,
    cardId: "persist-nested-guhuo-peach",
    declaredKind: "peach",
  });
  const challenge = current.pendingResponse;
  if (challenge?.type !== "guhuo" || challenge.stage !== "challenge") {
    throw new Error("Guhuo did not stop at its challenge prompt");
  }
  const challengerId = challenge.targetId;
  const challenger = current.players.find((player) => player.id === challengerId);
  if (!challenger) throw new Error("Missing nested Guhuo challenger");
  challenger.hp = 1;
  challenger.hand = [standardCard("persist-nested-challenger-peach", "peach", "diamond")];
  while (current.pendingResponse?.type === "guhuo" && current.pendingResponse.stage === "challenge") {
    const pending = current.pendingResponse;
    current = applyAction(current, {
      type: "resolve_guhuo",
      playerId: pending.targetId,
      promptId: pending.promptId,
      challenge: pending.targetId === challengerId,
    });
  }
  if (current.pendingResponse?.type !== "dying" || current.pendingResponse.resume.type !== "guhuo") {
    throw new Error("Truthful Guhuo challenge did not create a nested DyingStack cursor");
  }
  return {
    snapshot: snapshotForGame(
      current,
      "efefefef-efef-4fef-8fef-efefefefefef",
      "Nested Guhuo DyingStack",
    ),
    challengerId,
    victimId: victim.id,
    rescueCardId: "persist-nested-challenger-peach",
  };
}

function mutableFixtureSnapshot(fixture: LethalFixture): MutableSnapshot {
  return structuredClone(fixture.snapshot) as MutableSnapshot;
}

function activeParts(snapshot: MutableSnapshot) {
  const game = snapshot.rooms[0]?.game;
  if (!game) throw new Error("Missing forged game");
  const pending = game.pendingResponse;
  if (pending?.type !== "dying" || pending.resume.type !== "damage_flow") {
    throw new Error("Missing forged DamageFlow dying cursor");
  }
  const frame = game.completeRules.damageFlow.frames[0];
  if (!frame || !frame.dying || !frame.callerContinuation) {
    throw new Error("Missing forged active damage frame parts");
  }
  return {
    game,
    pending,
    frame,
    barrier: frame.dying,
    caller: frame.callerContinuation,
  };
}

async function expectInvalid(snapshot: MutableSnapshot): Promise<void> {
  const result = await loadRoomSnapshot(poolWithSnapshot(snapshot));
  expect(result).toMatchObject({ kind: "invalid" });
}

describe("live lethal DamageFlow persistence", () => {
  it("round-trips a truthful Guhuo challenge with a nested DyingStack and rejects forged links", async () => {
    const fixture = buildNestedGuhuoDyingFixture();
    const loaded = await loadRoomSnapshot(poolWithSnapshot(fixture.snapshot));
    if (loaded.kind !== "valid") throw new Error(loaded.reason);
    const restored = loaded.snapshot.rooms[0]?.game;
    if (!restored || restored.pendingResponse?.type !== "dying") throw new Error("Nested Guhuo cursor was not restored");
    expect(restored.completeRules.dying.frames.map((frame) => frame.victimId)).toEqual([
      fixture.victimId,
      fixture.challengerId,
    ]);
    const completed = applyAction(restored, {
      type: "respond",
      playerId: fixture.challengerId,
      cardId: fixture.rescueCardId,
    });
    expect(completed.completeRules.dying.frames).toEqual([]);
    expect(completed.players.find((player) => player.id === fixture.victimId)).toMatchObject({ alive: true, hp: 1 });

    const forgedContinuation = structuredClone(fixture.snapshot);
    const forgedPending = forgedContinuation.rooms[0]?.game?.pendingResponse;
    if (forgedPending?.type !== "dying" || forgedPending.resume.type !== "guhuo" ||
        forgedPending.resume.pending.continuation.type !== "respond" ||
        forgedPending.resume.pending.continuation.pending.type !== "dying") {
      throw new Error("Missing forged nested Guhuo continuation");
    }
    forgedPending.resume.pending.continuation.pending.frameId += 1;
    await expectInvalid(forgedContinuation as MutableSnapshot);

    const forgedLink = structuredClone(fixture.snapshot) as MutableSnapshot;
    const parent = forgedLink.rooms[0]?.game?.completeRules.dying.frames[0];
    if (!parent) throw new Error("Missing forged parent DyingStack frame");
    parent.suspendedByFrameId = null;
    await expectInvalid(forgedLink);
  });

  it("round-trips a live chained-damage cursor and rejects a deleted frozen target", async () => {
    const game = createGame({
      playerIds: [
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
        "33333333-3333-4333-8333-333333333333",
      ],
      seed: "e".repeat(64),
    });
    const actor = game.players.find((player) => player.id === game.currentPlayerId);
    const targets = game.players.filter((player) => player.id !== game.currentPlayerId)
      .sort((left, right) => left.seat - right.seat);
    const first = targets[0];
    const second = targets[1];
    if (!actor || !first || !second) throw new Error("Missing chained-damage fixture players");

    game.discardPile.push(...game.players.flatMap((player) => player.hand));
    for (const player of game.players) {
      player.generalId = "gan_ning";
      player.hp = 4;
      player.maxHp = 4;
      player.alive = true;
      player.hand = [];
      player.equipment = {};
      player.judgment = [];
      player.extraPiles = {};
      player.chained = false;
    }
    first.generalId = "xiao_qiao";
    first.hp = first.maxHp = 3;
    first.chained = true;
    second.chained = true;
    actor.hand = [standardCard("persist-chain-fire-slash", "fire_slash", "heart")];
    first.hand = [standardCard("persist-chain-tianxiang", "dodge", "heart")];
    game.resolvingCards = [];
    game.pendingResponse = null;
    game.afterMove = { queuedRecoveries: [], queuedTriggers: [], suspendedPhase: null, suspendedResponse: null };
    game.turn = {
      ...game.turn,
      playerId: actor.id,
      phase: "play",
      slashUsed: false,
      wineUsed: false,
      slashDamageBonus: 0,
      requiredDiscardCount: 0,
      discardStage: "hand_limit",
      skipDraw: false,
      skipPlay: false,
      luoyiActive: false,
      slashRespondedInPlayPhase: false,
      skillUseCounts: {},
      rendeGivenCount: 0,
      rendeRecovered: false,
    };

    let current = applyAction(game, {
      type: "play_card",
      playerId: actor.id,
      cardId: "persist-chain-fire-slash",
      targetId: first.id,
    });
    current = applyAction(current, { type: "respond", playerId: first.id, cardId: null });
    expect(current.pendingResponse).toMatchObject({
      type: "standard_skill",
      skillId: "tianxiang",
      stage: "tianxiang_redirect",
    });
    const root = current.completeRules.damageFlow.frames[0];
    if (!root?.callerContinuation) throw new Error("Missing chained-damage caller continuation");
    const caller = decodeGameDamageContinuation(root.callerContinuation);
    if (caller.type !== "chain_damage") throw new Error("Expected chained-damage caller continuation");
    expect(caller.remainingTargetIds).toEqual([second.id]);

    const snapshot = snapshotForGame(
      current,
      "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      "Live Chained Damage",
    );
    const loaded = await loadRoomSnapshot(poolWithSnapshot(snapshot));
    if (loaded.kind !== "valid") throw new Error(loaded.reason);

    const forged = structuredClone(snapshot) as MutableSnapshot;
    const forgedRoot = forged.rooms[0]?.game?.completeRules.damageFlow.frames[0];
    if (!forgedRoot?.callerContinuation) throw new Error("Missing forged chained-damage caller");
    const forgedCaller = decodeGameDamageContinuation(forgedRoot.callerContinuation);
    if (forgedCaller.type !== "chain_damage") throw new Error("Expected forged chained-damage caller");
    forgedRoot.callerContinuation = encodeGameDamageContinuation({
      ...forgedCaller,
      remainingTargetIds: [],
    });
    const forgedResult = await loadRoomSnapshot(poolWithSnapshot(forged));
    expect(forgedResult).toMatchObject({
      kind: "invalid",
      reason: expect.stringContaining("Chain-damage continuation"),
    });

  });

  it("rejects a forged target in a live Ganglie standard-damage continuation", async () => {
    const game = createGame({
      playerIds: [
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
        "33333333-3333-4333-8333-333333333333",
      ],
      seed: "f".repeat(64),
    });
    const punished = game.players.find((player) => player.id === game.currentPlayerId);
    const owner = game.players.find((player) => player.id !== game.currentPlayerId);
    const forgedTarget = game.players.find((player) => player.id !== punished?.id && player.id !== owner?.id);
    if (!punished || !owner || !forgedTarget) throw new Error("Missing standard-damage fixture players");
    game.discardPile.push(...game.players.flatMap((player) => player.hand));
    for (const player of game.players) {
      player.generalId = player.id === owner.id ? "xia_hou_dun" : "gan_ning";
      player.hp = player.maxHp = 4;
      player.alive = true;
      player.hand = [];
      player.equipment = {};
      player.judgment = [];
      player.extraPiles = {};
      player.chained = false;
    }
    punished.hp = 1;
    const eventId = game.nextEventId;
    game.nextEventId += 1;
    game.completeRules.nextEventId = game.nextEventId;
    const promptId = `standard:${eventId}:ganglie:${punished.id}:punish`;
    game.turn.phase = "respond";
    game.pendingResponse = {
      type: "standard_skill",
      targetId: punished.id,
      promptId,
      eventId,
      skillId: "ganglie",
      stage: "ganglie_punish",
      sourceId: owner.id,
      aftermath: {
        eventId,
        sourceId: punished.id,
        targetId: owner.id,
        amount: 1,
        damageCardIds: [],
        remainingSkillIds: [],
        resume: { type: "finish_effect" },
      },
    };

    const current = applyAction(game, {
      type: "resolve_standard_skill",
      playerId: punished.id,
      promptId,
      activate: false,
    });
    const root = current.completeRules.damageFlow.frames[0];
    if (!root?.callerContinuation) throw new Error("Ganglie did not retain its standard-damage continuation");
    const caller = decodeGameDamageContinuation(root.callerContinuation);
    if (caller.type !== "standard_damage") throw new Error("Expected a standard-damage continuation");
    expect(caller.aftermath).toMatchObject({ sourceId: punished.id, targetId: owner.id });

    const snapshot = snapshotForGame(
      current,
      "fafafafa-fafa-4afa-8afa-fafafafafafa",
      "Ganglie Standard Damage",
    );
    const loaded = await loadRoomSnapshot(poolWithSnapshot(snapshot));
    if (loaded.kind !== "valid") throw new Error(loaded.reason);

    const forged = structuredClone(snapshot) as MutableSnapshot;
    const forgedRoot = forged.rooms[0]?.game?.completeRules.damageFlow.frames[0];
    if (!forgedRoot?.callerContinuation) throw new Error("Missing forged standard-damage caller");
    const forgedCaller = decodeGameDamageContinuation(forgedRoot.callerContinuation);
    if (forgedCaller.type !== "standard_damage") throw new Error("Expected forged standard-damage caller");
    forgedRoot.callerContinuation = encodeGameDamageContinuation({
      ...forgedCaller,
      aftermath: { ...forgedCaller.aftermath, targetId: forgedTarget.id },
    });
    expect(await loadRoomSnapshot(poolWithSnapshot(forged))).toMatchObject({
      kind: "invalid",
      reason: expect.stringContaining("Standard damage aftermath"),
    });
  });

  it("restores the active barrier and completes its frame exactly once after a Peach rescue", async () => {
    const fixture = buildLethalFixture();
    const loaded = await loadRoomSnapshot(poolWithSnapshot(fixture.snapshot));
    if (loaded.kind !== "valid") throw new Error(loaded.reason);
    const restored = loaded.snapshot.rooms[0]?.game;
    if (!restored) throw new Error("Restored room lost its game");

    expect(restored.pendingResponse).toMatchObject({
      type: "dying",
      victimId: fixture.victimId,
      damageSourceId: fixture.actorId,
      targetId: fixture.victimId,
      resume: { type: "damage_flow", frameId: 1, damageId: 1, dyingId: 1 },
    });
    expect(restored.completeRules.damageFlow).toMatchObject({
      frames: [{ frameId: 1, damageId: 1, step: "dying", dying: { dyingId: 1 } }],
      completedDamageIds: [],
      completedFrameIds: [],
    });

    const rescued = applyAction(restored, {
      type: "respond",
      playerId: fixture.victimId,
      cardId: fixture.peachId,
    });
    expect(rescued.players.find((player) => player.id === fixture.victimId)).toMatchObject({ hp: 1, alive: true });
    expect(rescued.pendingResponse).toBeNull();
    expect(rescued.turn.phase).toBe("play");
    expect(rescued.completeRules.damageFlow.frames).toEqual([]);
    expect(rescued.completeRules.damageFlow.completedDamageIds).toEqual([1]);
    expect(rescued.completeRules.damageFlow.completedFrameIds).toEqual([1]);
    expect(rescued.completeRules.damageFlow.completedDamageIds.filter((damageId) => damageId === 1)).toHaveLength(1);
    expect(rescued.completeRules.nextDamageId).toBe(2);
    expect(rescued.resolvingCards).toEqual([]);
    expect(rescued.discardPile.filter((card) => card.id === fixture.slashId)).toHaveLength(1);
    expect(rescued.discardPile.filter((card) => card.id === fixture.peachId)).toHaveLength(1);
    expect(() => applyAction(rescued, {
      type: "respond",
      playerId: fixture.victimId,
      cardId: fixture.peachId,
    })).toThrow(GameRuleError);
  });

  it("rejects forged DamageFlow identifiers in a live Xingshang death continuation", async () => {
    const fixture = buildLethalFixture();
    let current = structuredClone(fixture.snapshot.rooms[0]?.game);
    if (!current || current.pendingResponse?.type !== "dying") throw new Error("Missing lethal DyingStack fixture");
    grantSkill(current.completeRules.lifecycle, {
      ownerId: fixture.otherId,
      skillId: "xingshang",
      sourcePlayerId: fixture.otherId,
      sourceSkillId: "persistence-test",
      expiry: { type: "permanent" },
    });
    while (current.pendingResponse?.type === "dying") {
      current = applyAction(current, {
        type: "respond",
        playerId: current.pendingResponse.targetId,
        cardId: null,
      });
    }
    const pending = current.pendingResponse;
    if (pending?.type !== "standard_skill" || pending.skillId !== "xingshang" ||
        pending.deathResolution?.completion.type !== "dying" ||
        pending.deathResolution.completion.resume.type !== "damage_flow") {
      throw new Error("Lethal damage did not stop at a Xingshang DamageFlow death continuation");
    }

    const snapshot = snapshotForGame(
      current,
      "abababab-abab-4bab-8bab-abababababac",
      "Xingshang DamageFlow Death",
    );
    const loaded = await loadRoomSnapshot(poolWithSnapshot(snapshot));
    if (loaded.kind !== "valid") throw new Error(loaded.reason);

    for (const field of ["frameId", "damageId", "dyingId"] as const) {
      const forged = structuredClone(snapshot) as MutableSnapshot;
      const forgedPending = forged.rooms[0]?.game?.pendingResponse;
      if (forgedPending?.type !== "standard_skill" ||
          forgedPending.deathResolution?.completion.type !== "dying" ||
          forgedPending.deathResolution.completion.resume.type !== "damage_flow") {
        throw new Error("Missing forged Xingshang DamageFlow death continuation");
      }
      forgedPending.deathResolution.completion.resume[field] += 1;
      expect(await loadRoomSnapshot(poolWithSnapshot(forged))).toMatchObject({
        kind: "invalid",
        reason: expect.stringContaining("DamageFlow"),
      });
    }
  });

  it("round-trips a Niepan owner-response cursor and consumes it exactly once", async () => {
    const fixture = buildLethalFixture({ victimGeneralId: "pang_tong" });
    const loaded = await loadRoomSnapshot(poolWithSnapshot(fixture.snapshot));
    if (loaded.kind !== "valid") throw new Error(loaded.reason);
    const restored = loaded.snapshot.rooms[0]?.game;
    const pending = restored?.pendingResponse;
    if (!restored || pending?.type !== "skill_choice" || pending.skillId !== "niepan" || pending.resume.type !== "dying") {
      throw new Error("Restored Niepan prompt is missing");
    }
    expect(pending).toMatchObject({
      targetId: fixture.victimId,
      promptId: "dying:1:niepan",
      resume: { frameId: 1, resume: { type: "damage_flow", dyingId: 1 } },
    });
    const activated = applyAction(restored, {
      type: "resolve_skill",
      playerId: fixture.victimId,
      skillId: "niepan",
      activate: true,
      promptId: pending.promptId,
    });
    expect(activated.players.find((player) => player.id === fixture.victimId)).toMatchObject({ hp: 3, alive: true });
    expect(activated.completeRules.dying.frames).toEqual([]);
    expect(activated.completeRules.damageFlow.frames).toEqual([]);
    expect(activated.completeRules.lifecycle.limitedUses).toEqual(expect.arrayContaining([
      expect.objectContaining({ ownerId: fixture.victimId, skillId: "niepan" }),
    ]));

    const forged = mutableFixtureSnapshot(fixture);
    const forgedPending = forged.rooms[0]?.game?.pendingResponse;
    if (forgedPending?.type !== "skill_choice") throw new Error("Missing forged Niepan prompt");
    forgedPending.promptId = "dying:2:niepan";
    await expectInvalid(forged);
  });

  it("round-trips the optional Buqu entry-save cursor and rejects forged loss metadata", async () => {
    const fixture = buildLethalFixture({ damageBonus: 1, victimGeneralId: "zhou_tai" });
    const loaded = await loadRoomSnapshot(poolWithSnapshot(fixture.snapshot));
    if (loaded.kind !== "valid") throw new Error(loaded.reason);
    const restored = loaded.snapshot.rooms[0]?.game;
    const pending = restored?.pendingResponse;
    if (!restored || pending?.type !== "skill_choice" || pending.skillId !== "buqu" || pending.resume.type !== "dying") {
      throw new Error("Restored Buqu entry prompt is missing");
    }
    expect(pending).toMatchObject({
      targetId: fixture.victimId,
      promptId: "dying:1:buqu-entry",
      resume: {
        frameId: 1,
        buquLoss: { hpBefore: 1, amount: 2 },
        resume: { type: "damage_flow", frameId: 1, damageId: 1, dyingId: 1 },
      },
    });
    expect(restored.players.find((player) => player.id === fixture.victimId)).toMatchObject({ hp: -1, alive: true });
    expect(restored.players.find((player) => player.id === fixture.victimId)?.extraPiles.buqu).toBeUndefined();
    expect(restored.completeRules.dying.frames).toMatchObject([{
      frameId: 1,
      victimId: fixture.victimId,
      stage: "entry_save",
      entrySaveSkillIds: ["buqu"],
    }]);
    const declined = applyAction(restored, {
      type: "resolve_skill",
      playerId: fixture.victimId,
      skillId: "buqu",
      activate: false,
      promptId: pending.promptId,
    });
    expect(declined.pendingResponse).toMatchObject({
      type: "dying",
      frameId: 1,
      victimId: fixture.victimId,
      resume: { type: "damage_flow", frameId: 1, damageId: 1, dyingId: 1 },
    });
    expect(declined.completeRules.dying.frames).toMatchObject([{ stage: "rescue", entrySaveSkillIds: [] }]);

    const forgedPrompt = mutableFixtureSnapshot(fixture);
    const prompt = forgedPrompt.rooms[0]?.game?.pendingResponse;
    if (prompt?.type !== "skill_choice") throw new Error("Missing forged Buqu entry prompt");
    prompt.promptId = "dying:2:buqu-entry";
    await expectInvalid(forgedPrompt);

    const forgedHpBefore = mutableFixtureSnapshot(fixture);
    const hpBefore = forgedHpBefore.rooms[0]?.game?.pendingResponse;
    if (hpBefore?.type !== "skill_choice" || hpBefore.resume.type !== "dying" || !hpBefore.resume.buquLoss) {
      throw new Error("Missing forged Buqu loss cursor");
    }
    hpBefore.resume.buquLoss.hpBefore += 1;
    await expectInvalid(forgedHpBefore);

    const forgedAmount = mutableFixtureSnapshot(fixture);
    const amount = forgedAmount.rooms[0]?.game?.pendingResponse;
    if (amount?.type !== "skill_choice" || amount.resume.type !== "dying" || !amount.resume.buquLoss) {
      throw new Error("Missing forged Buqu loss cursor");
    }
    amount.resume.buquLoss.amount -= 1;
    await expectInvalid(forgedAmount);
  });

  it("restores a partial rescue at zero HP without rewriting the original negative barrier", async () => {
    const fixture = buildLethalFixture({ damageBonus: 1, peachCount: 2 });
    if (!fixture.secondPeachId) throw new Error("Missing second Peach fixture");
    const lethal = fixture.snapshot.rooms[0]?.game;
    if (!lethal) throw new Error("Missing lethal game");
    const partial = applyAction(lethal, {
      type: "respond",
      playerId: fixture.victimId,
      cardId: fixture.peachId,
    });
    expect(partial.players.find((player) => player.id === fixture.victimId)).toMatchObject({ hp: 0, alive: true });
    expect(partial.pendingResponse).toMatchObject({ type: "dying", frameId: 1, targetId: fixture.victimId });
    expect(partial.completeRules.damageFlow.frames[0]?.dying).toMatchObject({ dyingId: 1, hpAfterDamage: -1 });
    expect(partial.completeRules.dying.frames[0]?.rescues).toMatchObject([{ hpAfter: 0, recoveredAmount: 1 }]);

    const partialSnapshot = mutableFixtureSnapshot(fixture);
    partialSnapshot.rooms[0]!.game = partial;
    const loaded = await loadRoomSnapshot(poolWithSnapshot(partialSnapshot));
    if (loaded.kind !== "valid") throw new Error(loaded.reason);
    const restored = loaded.snapshot.rooms[0]?.game;
    if (!restored) throw new Error("Restored partial rescue lost its game");
    expect(restored.players.find((player) => player.id === fixture.victimId)?.hp).toBe(0);
    expect(restored.completeRules.damageFlow.frames[0]?.dying?.hpAfterDamage).toBe(-1);

    const rescued = applyAction(restored, {
      type: "respond",
      playerId: fixture.victimId,
      cardId: fixture.secondPeachId,
    });
    expect(rescued.players.find((player) => player.id === fixture.victimId)).toMatchObject({ hp: 1, alive: true });
    expect(rescued.completeRules.dying.frames).toEqual([]);
    expect(rescued.completeRules.damageFlow.frames).toEqual([]);
    expect(rescued.completeRules.damageFlow.completedDamageIds).toEqual([1]);

    const forged = structuredClone(partialSnapshot);
    const rescue = forged.rooms[0]?.game?.completeRules.dying.frames[0]?.rescues[0];
    if (!rescue) throw new Error("Missing persisted rescue record");
    rescue.hpAfter += 1;
    await expectInvalid(forged);
  });

  it("restores a child-lethal nested DamageFlow and migrates legacy frameId from dyingId", async () => {
    const fixture = buildNestedGanglieFixture();
    const loaded = await loadRoomSnapshot(poolWithSnapshot(fixture.snapshot));
    if (loaded.kind !== "valid") throw new Error(loaded.reason);
    const restored = loaded.snapshot.rooms[0]?.game;
    if (!restored || restored.pendingResponse?.type !== "dying" || restored.pendingResponse.resume.type !== "damage_flow") {
      throw new Error("Restored nested flow lost its dying cursor");
    }
    expect(restored.completeRules.damageFlow.frames).toMatchObject([
      { frameId: 1, damageId: 1, status: "suspended", awaitingChildToken: expect.stringMatching(/^dfr1:/) },
      { frameId: 2, damageId: 2, status: "active", step: "dying", dying: { dyingId: 1 } },
    ]);
    expect(restored.pendingResponse).toMatchObject({
      frameId: 1,
      resume: { frameId: 2, damageId: 2, dyingId: 1 },
    });
    const rescued = applyAction(restored, {
      type: "respond",
      playerId: fixture.actorId,
      cardId: fixture.peachId,
    });
    expect(rescued.completeRules.dying.frames).toEqual([]);
    expect(rescued.completeRules.damageFlow.frames).toEqual([]);
    expect(new Set(rescued.completeRules.damageFlow.completedDamageIds)).toEqual(new Set([1, 2]));
    expect(new Set(rescued.completeRules.damageFlow.completedFrameIds)).toEqual(new Set([1, 2]));

    const legacy = structuredClone(fixture.snapshot) as unknown as MutableSnapshot;
    const legacyGame = legacy.rooms[0]?.game;
    if (!legacyGame || legacyGame.pendingResponse?.type !== "dying" || legacyGame.pendingResponse.resume.type !== "damage_flow") {
      throw new Error("Missing legacy nested fixture cursor");
    }
    delete (legacyGame.pendingResponse as unknown as { frameId?: number }).frameId;
    legacyGame.completeRules.dying.frames = [];
    const migrated = await loadRoomSnapshot(poolWithSnapshot(legacy));
    if (migrated.kind !== "valid") throw new Error(migrated.reason);
    expect(migrated.snapshot.rooms[0]?.game?.pendingResponse).toMatchObject({
      type: "dying",
      frameId: 1,
      resume: { type: "damage_flow", frameId: 2, damageId: 2, dyingId: 1 },
    });
    expect(migrated.snapshot.rooms[0]?.game?.completeRules.dying.frames).toMatchObject([{ frameId: 1 }]);
  });

  it("round-trips Ganglie post-damage cursors and rejects cursor tampering", async () => {
    const fixture = buildNestedGanglieFixture();
    const opportunity = await loadRoomSnapshot(poolWithSnapshot(fixture.opportunitySnapshot));
    if (opportunity.kind !== "valid") throw new Error(opportunity.reason);
    expect(opportunity.snapshot.rooms[0]?.game?.pendingResponse).toMatchObject({
      type: "standard_skill",
      skillId: "ganglie",
      stage: "invoke",
      promptId: "damage:1",
      damageOpportunity: { frameId: 1, damageId: 1, promptId: 1 },
    });

    const forged = structuredClone(fixture.opportunitySnapshot) as unknown as MutableSnapshot;
    const pending = forged.rooms[0]?.game?.pendingResponse;
    if (pending?.type !== "standard_skill" || !pending.damageOpportunity) {
      throw new Error("Missing forged Ganglie opportunity");
    }
    pending.damageOpportunity.promptId += 1;
    await expectInvalid(forged);

    const wrongSkill = structuredClone(fixture.opportunitySnapshot) as unknown as MutableSnapshot;
    const wrongPending = wrongSkill.rooms[0]?.game?.pendingResponse;
    if (wrongPending?.type !== "standard_skill") throw new Error("Missing forged standard skill");
    wrongPending.skillId = "jianxiong";
    await expectInvalid(wrongSkill);

    if (fixture.judgmentSnapshot) {
      const judgment = await loadRoomSnapshot(poolWithSnapshot(fixture.judgmentSnapshot));
      if (judgment.kind !== "valid") throw new Error(judgment.reason);
      expect(judgment.snapshot.rooms[0]?.game?.pendingResponse).toMatchObject({
        type: "standard_judgment",
        context: { type: "ganglie", damageOpportunity: { frameId: 1, damageId: 1 } },
      });
    }
  });

  it("round-trips the Qilin Bow post-damage weapon cursor", async () => {
    const game = createGame({
      playerIds: [
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
        "33333333-3333-4333-8333-333333333333",
      ],
      seed: "c".repeat(64),
    });
    const actor = game.players.find((player) => player.id === game.currentPlayerId);
    const target = game.players.find((player) => player.id !== game.currentPlayerId);
    if (!actor || !target) throw new Error("Missing Qilin Bow fixture players");
    game.discardPile.push(...game.players.flatMap((player) => player.hand));
    for (const player of game.players) {
      player.generalId = "gan_ning";
      player.hp = 4;
      player.maxHp = 4;
      player.alive = true;
      player.hand = [];
      player.equipment = {};
      player.judgment = [];
      player.chained = false;
      player.extraPiles = {};
    }
    const slashId = "qilin-opportunity-slash";
    actor.hand = [standardCard(slashId, "slash")];
    actor.equipment.weapon = standardCard("qilin-opportunity-weapon", "qi_lin_gong");
    target.equipment.offensive_horse = standardCard("qilin-opportunity-horse", "chi_tu");
    game.resolvingCards = [];
    game.pendingResponse = null;
    game.afterMove = { queuedRecoveries: [], queuedTriggers: [], suspendedPhase: null, suspendedResponse: null };
    game.turn = {
      ...game.turn,
      playerId: actor.id,
      phase: "play",
      slashUsed: false,
      wineUsed: false,
      slashDamageBonus: 0,
      requiredDiscardCount: 0,
      discardStage: "hand_limit",
      skipDraw: false,
      skipPlay: false,
      luoyiActive: false,
      slashRespondedInPlayPhase: false,
      skillUseCounts: {},
      rendeGivenCount: 0,
      rendeRecovered: false,
    };
    let current = applyAction(game, { type: "play_card", playerId: actor.id, cardId: slashId, targetId: target.id });
    current = applyAction(current, { type: "respond", playerId: target.id, cardId: null });
    if (current.pendingResponse?.type !== "weapon_action" || !current.pendingResponse.damageOpportunity) {
      throw new Error("Qilin Bow did not stop at its DamageFlow opportunity");
    }
    const snapshot = snapshotForGame(current, "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", "Qilin Bow Opportunity");
    const loaded = await loadRoomSnapshot(poolWithSnapshot(snapshot));
    if (loaded.kind !== "valid") throw new Error(loaded.reason);
    expect(loaded.snapshot.rooms[0]?.game?.pendingResponse).toMatchObject({
      type: "weapon_action",
      weaponKind: "qi_lin_gong",
      stage: "qilin_discard_horse",
      damageOpportunity: { ownerId: actor.id, frameId: 1, damageId: 1 },
    });

    const forged = structuredClone(snapshot) as unknown as MutableSnapshot;
    const pending = forged.rooms[0]?.game?.pendingResponse;
    if (pending?.type !== "weapon_action") throw new Error("Missing forged Qilin prompt");
    pending.weaponKind = "han_bing_jian";
    await expectInvalid(forged);
  });

  it("round-trips a six-card protected Buqu pile through an ordinary Peach Garden recovery", async () => {
    const fixture = buildBuquPeachGardenFixture();
    const loaded = await loadRoomSnapshot(poolWithSnapshot(fixture.snapshot));
    if (loaded.kind !== "valid") throw new Error(loaded.reason);
    const restored = loaded.snapshot.rooms[0]?.game;
    const pending = restored?.pendingResponse;
    if (!restored || pending?.type !== "standard_skill" || pending.skillId !== "buqu" || !pending.recovery) {
      throw new Error("Restored Buqu recovery prompt is missing");
    }
    expect(pending).toMatchObject({
      targetId: fixture.ownerId,
      promptId: `recovery:${pending.eventId}:buqu:1:6`,
      selectedCardIds: fixture.woundIds,
      recovery: { targetId: fixture.ownerId, hpBefore: 0, requestedAmount: 1, remainingAmount: 1, reason: "peach_garden" },
    });
    expect(restored.afterMove).toMatchObject({
      queuedRecoveries: [],
      queuedTriggers: [],
      suspendedPhase: "play",
      suspendedResponse: null,
    });

    const resolved = applyAction(restored, {
      type: "resolve_standard_skill",
      playerId: fixture.ownerId,
      promptId: pending.promptId,
      activate: true,
      cardId: fixture.woundIds[0],
    });
    expect(resolved.players.find((player) => player.id === fixture.ownerId)).toMatchObject({ hp: 0, alive: true });
    expect(resolved.pendingResponse).toBeNull();
    expect(resolved.afterMove).toEqual({ queuedRecoveries: [], queuedTriggers: [], suspendedPhase: null, suspendedResponse: null });

    const forgedPrompt = structuredClone(fixture.snapshot) as unknown as MutableSnapshot;
    const prompt = forgedPrompt.rooms[0]?.game?.pendingResponse;
    if (prompt?.type !== "standard_skill") throw new Error("Missing forged Buqu prompt");
    prompt.promptId = `recovery:${prompt.eventId}:buqu:1:5`;
    await expectInvalid(forgedPrompt);

    const forgedSelection = structuredClone(fixture.snapshot) as unknown as MutableSnapshot;
    const selection = forgedSelection.rooms[0]?.game?.pendingResponse;
    if (selection?.type !== "standard_skill" || !selection.selectedCardIds) {
      throw new Error("Missing forged Buqu selection");
    }
    selection.selectedCardIds.pop();
    await expectInvalid(forgedSelection);

    const duplicateWound = structuredClone(fixture.snapshot) as unknown as MutableSnapshot;
    const duplicateOwner = duplicateWound.rooms[0]?.game?.players.find((player) => player.id === fixture.ownerId);
    const duplicateCards = duplicateOwner?.extraPiles.buqu;
    if (!duplicateCards?.[0] || !duplicateCards[1]) throw new Error("Missing forged Buqu wounds");
    duplicateCards[1].rank = duplicateCards[0].rank;
    await expectInvalid(duplicateWound);

    const falseOwner = structuredClone(fixture.snapshot) as unknown as MutableSnapshot;
    const forgedOwner = falseOwner.rooms[0]?.game?.players.find((player) => player.id === fixture.ownerId);
    if (!forgedOwner) throw new Error("Missing forged Buqu owner");
    forgedOwner.generalId = "gan_ning";
    await expectInvalid(falseOwner);
  });

  it("round-trips a Buqu recovery that suspends a live Dying rescue and rejects forged rescue provenance", async () => {
    const lethal = buildLethalFixture({ damageBonus: 1, peachCount: 2 });
    const game = structuredClone(lethal.snapshot.rooms[0]?.game);
    if (!game || game.pendingResponse?.type !== "dying") throw new Error("Missing Buqu dying-rescue fixture");
    const victim = game.players.find((player) => player.id === lethal.victimId);
    if (!victim) throw new Error("Missing Buqu dying-rescue victim");
    victim.generalId = "zhou_tai";
    const wounds = takeDuplicateRankCards(game);
    victim.extraPiles.buqu = wounds;
    const offered = applyAction(game, {
      type: "respond",
      playerId: lethal.victimId,
      cardId: lethal.peachId,
    });
    const snapshot = snapshotForGame(
      offered,
      "abababab-abab-4bab-8bab-abababababab",
      "Buqu Suspended Dying Rescue",
    );
    expect(offered.pendingResponse).toMatchObject({
      type: "standard_skill",
      skillId: "buqu",
      stage: "buqu_recovery",
      selectedCardIds: wounds.map((card) => card.id),
      recovery: {
        targetId: lethal.victimId,
        sourceId: lethal.victimId,
        hpBefore: -1,
        requestedAmount: 1,
        remainingAmount: 1,
        dyingRescue: {
          frameId: 1,
          responderId: lethal.victimId,
          cardKind: "peach",
          viewAsSkillId: null,
          effectiveSuit: "heart",
          suitModifierSkillId: null,
        },
      },
    });
    expect(offered.afterMove).toMatchObject({
      suspendedPhase: "respond",
      suspendedResponse: { type: "dying", frameId: 1, victimId: lethal.victimId, targetId: lethal.victimId },
    });
    const loaded = await loadRoomSnapshot(poolWithSnapshot(snapshot));
    if (loaded.kind !== "valid") throw new Error(loaded.reason);

    const rescueMutations: ReadonlyArray<[
      string,
      (forged: MutableSnapshot) => void,
    ]> = [
      ["card kind", (forged) => {
        const recovery = forged.rooms[0]?.game?.pendingResponse;
        if (recovery?.type !== "standard_skill" || !recovery.recovery?.dyingRescue) throw new Error("Missing forged rescue");
        recovery.recovery.dyingRescue.cardKind = "wine";
      }],
      ["direct-card source zone", (forged) => {
        const recovery = forged.rooms[0]?.game?.pendingResponse;
        if (recovery?.type !== "standard_skill" || !recovery.recovery?.dyingRescue) throw new Error("Missing forged rescue");
        recovery.recovery.dyingRescue.from = "equipment";
        recovery.recovery.dyingRescue.equipmentSlot = "armor";
      }],
      ["recovery amount", (forged) => {
        const recovery = forged.rooms[0]?.game?.pendingResponse;
        if (recovery?.type !== "standard_skill" || !recovery.recovery) throw new Error("Missing forged recovery");
        recovery.recovery.requestedAmount = 3;
      }],
      ["processing entity", (forged) => {
        const card = forged.rooms[0]?.game?.resolvingCards?.find((candidate) => candidate.id === lethal.peachId);
        if (!card) throw new Error("Missing forged processing rescue card");
        card.kind = "wine";
      }],
      ["view-as provider", (forged) => {
        const recovery = forged.rooms[0]?.game?.pendingResponse;
        if (recovery?.type !== "standard_skill" || !recovery.recovery?.dyingRescue) throw new Error("Missing forged rescue");
        recovery.recovery.dyingRescue.cardKind = "view_as_peach";
      }],
      ["effective suit", (forged) => {
        const recovery = forged.rooms[0]?.game?.pendingResponse;
        if (recovery?.type !== "standard_skill" || !recovery.recovery?.dyingRescue) throw new Error("Missing forged rescue");
        recovery.recovery.dyingRescue.effectiveSuit = "club";
      }],
      ["Hongyan marker", (forged) => {
        const recovery = forged.rooms[0]?.game?.pendingResponse;
        if (recovery?.type !== "standard_skill" || !recovery.recovery?.dyingRescue) throw new Error("Missing forged rescue");
        recovery.recovery.dyingRescue.suitModifierSkillId = "hongyan";
      }],
      ["Dying responder", (forged) => {
        const frame = forged.rooms[0]?.game?.completeRules.dying.frames[0];
        if (!frame) throw new Error("Missing forged DyingStack frame");
        frame.responderIndex = 1;
      }],
      ["suspended Dying cursor", (forged) => {
        const suspended = forged.rooms[0]?.game?.afterMove.suspendedResponse;
        if (suspended?.type !== "dying") throw new Error("Missing forged suspended Dying cursor");
        suspended.targetId = lethal.otherId;
      }],
    ];
    for (const [, mutate] of rescueMutations) {
      const forged = structuredClone(snapshot) as unknown as MutableSnapshot;
      mutate(forged);
      await expectInvalid(forged);
    }
  });

  it("round-trips Hongyan-modified Jijiu rescue provenance and rejects a forged skill owner", async () => {
    const lethal = buildLethalFixture({ damageBonus: 1, peachCount: 2 });
    const game = structuredClone(lethal.snapshot.rooms[0]?.game);
    if (!game || game.pendingResponse?.type !== "dying") throw new Error("Missing Hongyan Jijiu fixture");
    const responder = game.players.find((player) => player.id === lethal.victimId);
    if (!responder) throw new Error("Missing Hongyan Jijiu responder");
    responder.generalId = "hua_tuo";
    const cost = standardCard("persist-hongyan-jijiu", "dodge", "spade");
    responder.hand.push(cost);
    grantSkill(game.completeRules.lifecycle, {
      ownerId: responder.id,
      skillId: "hongyan",
      sourcePlayerId: responder.id,
      sourceSkillId: "persistence-test",
      expiry: { type: "permanent" },
    });

    const queuedGame = structuredClone(game);
    const queuedResponder = queuedGame.players.find((player) => player.id === responder.id)!;
    grantSkill(queuedGame.completeRules.lifecycle, {
      ownerId: responder.id,
      skillId: "buqu",
      sourcePlayerId: responder.id,
      sourceSkillId: "persistence-test",
      expiry: { type: "permanent" },
    });
    queuedResponder.extraPiles.buqu = takeDuplicateRankCards(queuedGame);
    const queued = applyAction(queuedGame, {
      type: "use_skill",
      playerId: responder.id,
      skillId: "jijiu",
      cardIds: [cost.id],
    });
    expect(queued.pendingResponse).toMatchObject({
      type: "standard_skill",
      recovery: { dyingRescue: {
        cardKind: "view_as_peach",
        viewAsSkillId: "jijiu",
        effectiveSuit: "heart",
        suitModifierSkillId: "hongyan",
      } },
    });
    const queuedSnapshot = snapshotForGame(
      queued,
      "adadadad-adad-4dad-8dad-adadadadadad",
      "Queued Hongyan Jijiu Rescue",
    );
    const queuedLoaded = await loadRoomSnapshot(poolWithSnapshot(queuedSnapshot));
    if (queuedLoaded.kind !== "valid") throw new Error(queuedLoaded.reason);

    const rescued = applyAction(game, {
      type: "use_skill",
      playerId: responder.id,
      skillId: "jijiu",
      cardIds: [cost.id],
    });
    expect(rescued.completeRules.dying.frames[0]?.rescues[0]).toMatchObject({
      responderId: responder.id,
      cardKind: "view_as_peach",
      viewAsSkillId: "jijiu",
      effectiveSuit: "heart",
      suitModifierSkillId: "hongyan",
    });
    const snapshot = snapshotForGame(
      rescued,
      "acacacac-acac-4cac-8cac-acacacacacac",
      "Hongyan Jijiu Rescue",
    );
    const loaded = await loadRoomSnapshot(poolWithSnapshot(snapshot));
    if (loaded.kind !== "valid") throw new Error(loaded.reason);

    const forged = structuredClone(snapshot) as unknown as MutableSnapshot;
    const lifecycle = forged.rooms[0]?.game?.completeRules.lifecycle;
    if (!lifecycle) throw new Error("Missing forged lifecycle");
    lifecycle.grants = lifecycle.grants.filter((grant) => grant.skillId !== "hongyan");
    const invalid = await loadRoomSnapshot(poolWithSnapshot(forged));
    expect(invalid).toMatchObject({
      kind: "invalid",
      reason: expect.stringContaining("effective-suit provenance"),
    });

    const forgedQueue = structuredClone(queuedSnapshot) as unknown as MutableSnapshot;
    const queuedLifecycle = forgedQueue.rooms[0]?.game?.completeRules.lifecycle;
    if (!queuedLifecycle) throw new Error("Missing forged queued lifecycle");
    queuedLifecycle.grants = queuedLifecycle.grants.filter((grant) => grant.skillId !== "hongyan");
    await expectInvalid(forgedQueue);
  });

  const cursorMutations: ReadonlyArray<[
    string,
    (snapshot: MutableSnapshot, fixture: LethalFixture) => void,
  ]> = [
    ["pending DyingStack frameId", (snapshot) => { activeParts(snapshot).pending.frameId += 1; }],
    ["cursor frameId", (snapshot) => { activeParts(snapshot).pending.resume.frameId += 1; }],
    ["cursor damageId", (snapshot) => { activeParts(snapshot).pending.resume.damageId += 1; }],
    ["cursor dyingId", (snapshot) => { activeParts(snapshot).pending.resume.dyingId += 1; }],
    ["pending victim", (snapshot, fixture) => { activeParts(snapshot).pending.victimId = fixture.otherId; }],
    ["pending damage source", (snapshot) => { activeParts(snapshot).pending.damageSourceId = null; }],
    ["barrier hp", (snapshot) => { activeParts(snapshot).barrier.hpAfterDamage -= 1; }],
    ["caller type", (snapshot) => { activeParts(snapshot).caller.type = "game_session.damage_resume.v0"; }],
    ["caller data", (snapshot) => { activeParts(snapshot).caller.data = {}; }],
    ["caller business player", (snapshot) => {
      const caller = activeParts(snapshot).caller;
      const data = caller.data as unknown as {
        resume: { type: string; pending: { attackerId: string } };
      };
      data.resume.pending.attackerId = "99999999-9999-4999-8999-999999999999";
    }],
    ["missing active frame", (snapshot) => { activeParts(snapshot).game.completeRules.damageFlow.frames = []; }],
    ["missing pending dying", (snapshot) => { activeParts(snapshot).game.pendingResponse = null; }],
    ["finished game with active flow", (snapshot) => { activeParts(snapshot).game.status = "finished"; }],
    ["extra active frame", (snapshot) => {
      const { game, frame } = activeParts(snapshot);
      game.completeRules.damageFlow.frames.push(structuredClone(frame));
    }],
  ];

  it.each(cursorMutations)("rejects tampered %s", async (_name, mutate) => {
    const fixture = buildLethalFixture();
    const forged = mutableFixtureSnapshot(fixture);
    mutate(forged, fixture);
    await expectInvalid(forged);
  });
});
