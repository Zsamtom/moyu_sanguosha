import type { Pool } from "pg";
import {
  addMark,
  applyAction,
  createGame,
  getCardDefinition,
  grantSkill,
  standardPromptId,
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

const playerIds = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444",
  "55555555-5555-4555-8555-555555555555",
];

function card(
  id: string,
  kind: CardKind,
  rank: Card["rank"] = 7,
  suit: Card["suit"] = "club",
): Card {
  return { id, kind, ...getCardDefinition(kind), suit, rank };
}

function setup(count = 3) {
  const game = createGame({ playerIds: playerIds.slice(0, count), seed: "f7".repeat(32) });
  const owner = game.players.find((player) => player.id === game.currentPlayerId);
  if (!owner) throw new Error("Missing pending-response fixture owner");
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
  game.resolvingCards = [];
  game.pendingResponse = null;
  game.afterMove = { queuedRecoveries: [], queuedTriggers: [], suspendedPhase: null, suspendedResponse: null };
  game.turn = {
    ...game.turn,
    playerId: owner.id,
    phase: "play",
    slashUsed: false,
    activeSlashUses: 0,
    tianyiOutcome: null,
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
  return { game, owner, others: game.players.filter((player) => player.id !== owner.id) };
}

function snapshotForGame(game: GameSession, name: string): RoomServiceSnapshot {
  return {
    version: 1,
    rooms: [{
      id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      name,
      ownerId: game.currentPlayerId,
      status: game.status,
      maxPlayers: game.players.length,
      createdAt: "2026-07-17T00:00:00.000Z",
      players: game.players.map((player) => ({
        id: player.id,
        username: `pending-${player.seat}`,
        displayName: `pending-${player.seat}`,
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

async function restoreGame(snapshot: RoomServiceSnapshot): Promise<GameSession> {
  const loaded = await loadRoomSnapshot(poolWithSnapshot(structuredClone(snapshot)));
  if (loaded.kind !== "valid") throw new Error(`Snapshot fixture was rejected: ${loaded.kind === "invalid" ? loaded.reason : "empty"}`);
  const game = loaded.snapshot.rooms[0]?.game;
  if (!game) throw new Error("Restored room has no game");
  return game;
}

async function expectInvalid(snapshot: unknown): Promise<void> {
  expect(await loadRoomSnapshot(poolWithSnapshot(snapshot))).toMatchObject({ kind: "invalid" });
}

type ResponseCommitmentKind =
  | "mass_attack_commitment"
  | "nullification_progress"
  | "slash_response_progress"
  | "duel_response_progress";

async function roundTripCommittedResponse(
  game: GameSession,
  name: string,
  kind: ResponseCommitmentKind,
): Promise<void> {
  const snapshot = snapshotForGame(game, name);
  await restoreGame(snapshot);
  const forged = structuredClone(snapshot) as MutableSnapshot;
  const effect = forged.rooms[0]?.game?.completeRules.lifecycle.effects.find((entry) => entry.kind === kind);
  if (!effect) throw new Error(`Missing ${kind} effect`);
  effect.payload.cursor = `forged:${String(effect.payload.cursor)}`;
  await expectInvalid(forged);
}

function declineNullifications(game: GameSession): GameSession {
  let current = game;
  while (current.pendingResponse?.type === "nullification") {
    current = applyAction(current, {
      type: "respond",
      playerId: current.pendingResponse.targetId,
      cardId: null,
    });
  }
  return current;
}

describe("pending response persistence", () => {
  it("round-trips a top-level Guhuo challenge and rejects a missing physical card", async () => {
    const { game, owner: yuji } = setup();
    yuji.generalId = "yu_ji";
    yuji.hand = [card("persist-guhuo-hidden", "dodge")];

    const challenged = applyAction(game, {
      type: "declare_guhuo",
      playerId: yuji.id,
      cardId: "persist-guhuo-hidden",
      declaredKind: "ex_nihilo",
      targetId: yuji.id,
    });
    if (challenged.pendingResponse?.type !== "guhuo" || challenged.pendingResponse.stage !== "challenge") {
      throw new Error("Guhuo did not stop at a challenge prompt");
    }
    const snapshot = snapshotForGame(challenged, "Pending Guhuo challenge");

    const restored = await restoreGame(snapshot);
    const pending = restored.pendingResponse;
    if (pending?.type !== "guhuo" || pending.stage !== "challenge") {
      throw new Error("Guhuo challenge was not restored");
    }
    expect(pending).toMatchObject({
      sourceId: yuji.id,
      physicalCardId: "persist-guhuo-hidden",
      declaredKind: "ex_nihilo",
      challengeCursor: 0,
    });
    const advanced = applyAction(restored, {
      type: "resolve_guhuo",
      playerId: pending.targetId,
      promptId: pending.promptId,
      challenge: false,
    });
    expect(advanced.pendingResponse).toMatchObject({ type: "guhuo", stage: "challenge", challengeCursor: 1 });

    const forged = structuredClone(snapshot) as MutableSnapshot;
    const forgedPending = forged.rooms[0]?.game?.pendingResponse;
    if (forgedPending?.type !== "guhuo") throw new Error("Missing forged Guhuo challenge");
    forgedPending.physicalCardId = "missing-guhuo-card";
    await expectInvalid(forged);
  });

  it("round-trips a top-level Pindian commitment and rejects forged selection ownership", async () => {
    const { game, owner, others: [opponent] } = setup();
    if (!opponent) throw new Error("Missing Pindian opponent");
    owner.generalId = "tai_shi_ci";
    owner.hand = [card("persist-pindian-high", "slash", 13), card("persist-pindian-owner-spare", "peach")];
    opponent.hand = [card("persist-pindian-low", "dodge", 1), card("persist-pindian-target-spare", "peach")];

    let current = applyAction(game, {
      type: "use_skill",
      playerId: owner.id,
      skillId: "tianyi",
      targetId: opponent.id,
    });
    if (current.pendingResponse?.type !== "pindian") throw new Error("Tianyi did not start Pindian");
    current = applyAction(current, {
      type: "choose_pindian_card",
      playerId: owner.id,
      promptId: current.pendingResponse.promptId,
      cardId: "persist-pindian-high",
    });
    if (current.pendingResponse?.type !== "pindian") throw new Error("Pindian did not await the opponent");
    const snapshot = snapshotForGame(current, "Pending Tianyi Pindian");

    const restored = await restoreGame(snapshot);
    const pending = restored.pendingResponse;
    if (pending?.type !== "pindian") throw new Error("Pindian was not restored");
    expect(pending).toMatchObject({
      targetId: opponent.id,
      skillId: "tianyi",
      frame: { stage: "selecting", selections: { [owner.id]: "persist-pindian-high" } },
    });
    const resolved = applyAction(restored, {
      type: "choose_pindian_card",
      playerId: opponent.id,
      promptId: pending.promptId,
      cardId: "persist-pindian-low",
    });
    expect(resolved.turn.tianyiOutcome).toBe("win");
    expect(resolved.discardPile.filter((entry) => entry.id === "persist-pindian-high")).toHaveLength(1);
    expect(resolved.discardPile.filter((entry) => entry.id === "persist-pindian-low")).toHaveLength(1);

    const forged = structuredClone(snapshot) as MutableSnapshot;
    const forgedPending = forged.rooms[0]?.game?.pendingResponse;
    if (forgedPending?.type !== "pindian") throw new Error("Missing forged Pindian");
    forgedPending.frame.selections[owner.id] = "persist-pindian-owner-spare";
    await expectInvalid(forged);
  });

  it("round-trips a suspended Qiangxi effect and rejects an invalid internal owner", async () => {
    const { game, owner, others: [target] } = setup();
    if (!target) throw new Error("Missing Qiangxi target");
    owner.generalId = "dian_wei";
    owner.equipment.weapon = card("persist-qiangxi-weapon", "qing_long_yan_yue_dao");
    grantSkill(game.completeRules.lifecycle, {
      ownerId: owner.id,
      skillId: "xiaoji",
      sourcePlayerId: owner.id,
      sourceSkillId: "persistence-test",
      expiry: { type: "permanent" },
    });
    const hpBefore = target.hp;

    const paused = applyAction(game, {
      type: "use_skill",
      playerId: owner.id,
      skillId: "qiangxi",
      cardIds: ["persist-qiangxi-weapon"],
      targetId: target.id,
    });
    expect(paused.pendingResponse).toMatchObject({ type: "skill_choice", skillId: "xiaoji", targetId: owner.id });
    expect(paused.afterMove.suspendedResponse).toMatchObject({
      type: "qiangxi_effect",
      sourceId: owner.id,
      targetId: owner.id,
      damageTargetId: target.id,
    });
    const snapshot = snapshotForGame(paused, "Suspended Qiangxi effect");

    const restored = await restoreGame(snapshot);
    const prompt = restored.pendingResponse;
    if (prompt?.type !== "skill_choice" || prompt.skillId !== "xiaoji" || !prompt.promptId) {
      throw new Error("Xiaoji prompt was not restored");
    }
    const resolved = applyAction(restored, {
      type: "resolve_skill",
      playerId: owner.id,
      skillId: "xiaoji",
      promptId: prompt.promptId,
      activate: false,
    });
    expect(resolved.players.find((player) => player.id === target.id)?.hp).toBe(hpBefore - 1);
    expect(resolved.logs.filter((entry) => entry.message.includes("受到强袭影响"))).toHaveLength(1);

    const forged = structuredClone(snapshot) as MutableSnapshot;
    const suspended = forged.rooms[0]?.game?.afterMove.suspendedResponse;
    if (suspended?.type !== "qiangxi_effect") throw new Error("Missing forged suspended Qiangxi effect");
    suspended.targetId = target.id;
    await expectInvalid(forged);
  });

  it("round-trips a Qiangxi dying resume and rejects a self-targeting continuation", async () => {
    const { game, owner, others: [target] } = setup();
    if (!target) throw new Error("Missing dying Qiangxi target");
    owner.generalId = "dian_wei";
    owner.hp = 1;
    owner.hand = [card("persist-qiangxi-peach", "peach", 7, "heart")];
    const hpBefore = target.hp;

    const dying = applyAction(game, {
      type: "use_skill",
      playerId: owner.id,
      skillId: "qiangxi",
      targetId: target.id,
    });
    if (dying.pendingResponse?.type !== "dying" || dying.pendingResponse.resume.type !== "qiangxi") {
      throw new Error("HP-paid Qiangxi did not stop at its dying resume");
    }
    const snapshot = snapshotForGame(dying, "Qiangxi dying resume");

    const restored = await restoreGame(snapshot);
    const pending = restored.pendingResponse;
    if (pending?.type !== "dying" || pending.resume.type !== "qiangxi") {
      throw new Error("Qiangxi dying resume was not restored");
    }
    expect(pending.resume).toMatchObject({ sourceId: owner.id, damageTargetId: target.id });
    const rescued = applyAction(restored, {
      type: "respond",
      playerId: owner.id,
      cardId: "persist-qiangxi-peach",
    });
    expect(rescued.players.find((player) => player.id === owner.id)?.hp).toBe(1);
    expect(rescued.players.find((player) => player.id === target.id)?.hp).toBe(hpBefore - 1);
    expect(rescued.logs.filter((entry) => entry.message.includes("受到强袭影响"))).toHaveLength(1);

    const forged = structuredClone(snapshot) as MutableSnapshot;
    const forgedPending = forged.rooms[0]?.game?.pendingResponse;
    if (forgedPending?.type !== "dying" || forgedPending.resume.type !== "qiangxi") {
      throw new Error("Missing forged Qiangxi dying resume");
    }
    forgedPending.resume.damageTargetId = owner.id;
    await expectInvalid(forged);
  });

  it("round-trips an outside-turn Tuntian prompt and its live JudgmentFrame", async () => {
    const { game, owner: actor, others: [tuntianOwner] } = setup();
    if (!tuntianOwner) throw new Error("Missing Tuntian owner");
    actor.hand = [
      card("persist-tuntian-snatch", "shun_shou_qian_yang"),
      card("persist-tuntian-retrial", "dodge", 8, "club"),
    ];
    tuntianOwner.hand = [card("persist-tuntian-lost", "dodge")];
    game.deck = [card("persist-tuntian-judgment", "slash", 6, "club")];
    grantSkill(game.completeRules.lifecycle, {
      ownerId: actor.id,
      skillId: "guicai",
      sourcePlayerId: actor.id,
      sourceSkillId: "persistence-test",
      expiry: { type: "permanent" },
    });
    grantSkill(game.completeRules.lifecycle, {
      ownerId: tuntianOwner.id,
      skillId: "tuntian",
      sourcePlayerId: tuntianOwner.id,
      sourceSkillId: "persistence-test",
      expiry: { type: "permanent" },
    });

    let current = applyAction(game, {
      type: "play_card",
      playerId: actor.id,
      cardId: "persist-tuntian-snatch",
      targetId: tuntianOwner.id,
    });
    current = applyAction(current, { type: "choose_zone_card", playerId: actor.id, token: "hand:0" });
    const prompt = current.pendingResponse;
    if (prompt?.type !== "standard_skill" || prompt.skillId !== "tuntian") {
      throw new Error("Tuntian did not pause after the outside-turn loss");
    }
    current = await restoreGame(snapshotForGame(current, "Pending Tuntian trigger"));
    const restoredPrompt = current.pendingResponse;
    if (restoredPrompt?.type !== "standard_skill" || restoredPrompt.skillId !== "tuntian") {
      throw new Error("Tuntian prompt was not restored");
    }
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: tuntianOwner.id,
      promptId: restoredPrompt.promptId,
      activate: true,
    });
    const judgmentSnapshot = snapshotForGame(current, "Pending Tuntian judgment");
    current = await restoreGame(judgmentSnapshot);
    const judgment = current.pendingResponse;
    if (judgment?.type !== "standard_judgment" || judgment.context.type !== "tuntian") {
      throw new Error("Tuntian JudgmentFrame was not restored");
    }
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: actor.id,
      promptId: judgment.promptId,
      activate: false,
    });
    expect(current.players.find((player) => player.id === tuntianOwner.id)?.extraPiles.field)
      .toContainEqual(expect.objectContaining({ id: "persist-tuntian-judgment" }));

    const forged = structuredClone(judgmentSnapshot) as MutableSnapshot;
    const forgedJudgment = forged.rooms[0]?.game?.pendingResponse;
    if (forgedJudgment?.type !== "standard_judgment" || forgedJudgment.context.type !== "tuntian") {
      throw new Error("Missing forged Tuntian judgment");
    }
    forgedJudgment.context.moveBatchId = forged.rooms[0]!.game!.completeRules.nextMoveBatchId;
    await expectInvalid(forged);
  });

  it("binds frozen skill continuations and live response commitments", async () => {
    const wumou = setup();
    const wumouTarget = wumou.others[0]!;
    grantSkill(wumou.game.completeRules.lifecycle, {
      ownerId: wumou.owner.id,
      skillId: "wumou",
      sourcePlayerId: wumou.owner.id,
      sourceSkillId: "persistence-test",
      expiry: { type: "permanent" },
    });
    wumou.owner.hand = [card("persist-wumou-trick", "ex_nihilo", 7, "heart")];
    wumou.game.deck = [card("persist-wumou-draw-2", "peach"), card("persist-wumou-draw-1", "dodge")];
    const wumouPending = applyAction(wumou.game, {
      type: "play_card",
      playerId: wumou.owner.id,
      cardId: "persist-wumou-trick",
    });
    const wumouSnapshot = snapshotForGame(wumouPending, "Committed Wumou continuation");
    await restoreGame(wumouSnapshot);

    const forgedWumou = structuredClone(wumouSnapshot) as MutableSnapshot;
    const forgedWumouPending = forgedWumou.rooms[0]?.game?.pendingResponse;
    if (forgedWumouPending?.type !== "standard_skill" ||
        forgedWumouPending.wumouContinuation?.type !== "trick_effect" ||
        forgedWumouPending.wumouContinuation.effect.type !== "ex_nihilo") {
      throw new Error("Missing committed Wumou trick continuation");
    }
    forgedWumouPending.wumouContinuation.effect.targetId = wumouTarget.id;
    await expectInvalid(forgedWumou);

    const shenfen = setup();
    grantSkill(shenfen.game.completeRules.lifecycle, {
      ownerId: shenfen.owner.id,
      skillId: "shenfen",
      sourcePlayerId: shenfen.owner.id,
      sourceSkillId: "persistence-test",
      expiry: { type: "permanent" },
    });
    addMark(shenfen.game.completeRules.lifecycle, {
      markId: "rage",
      ownerId: shenfen.owner.id,
      sourcePlayerId: shenfen.owner.id,
      sourceSkillId: "kuangbao",
      amount: 6,
      visibility: "public",
      expiry: { type: "permanent" },
    });
    for (const [targetIndex, target] of shenfen.others.entries()) {
      target.hand = Array.from({ length: 5 }, (_value, cardIndex) =>
        card(`persist-shenfen-${targetIndex}-${cardIndex}`, "dodge"));
    }
    const shenfenPending = applyAction(shenfen.game, {
      type: "use_skill",
      playerId: shenfen.owner.id,
      skillId: "shenfen",
    });
    const shenfenSnapshot = snapshotForGame(shenfenPending, "Committed Shenfen cursor");
    await restoreGame(shenfenSnapshot);

    const forgedShenfen = structuredClone(shenfenSnapshot) as MutableSnapshot;
    const forgedShenfenPending = forgedShenfen.rooms[0]?.game?.pendingResponse;
    const skippedTarget = shenfen.others[1];
    if (!skippedTarget || forgedShenfenPending?.type !== "standard_skill" ||
        forgedShenfenPending.skillId !== "shenfen" || !forgedShenfenPending.shenfenContinuation) {
      throw new Error("Missing committed Shenfen hand cursor");
    }
    forgedShenfenPending.targetId = skippedTarget.id;
    forgedShenfenPending.handCardIds = skippedTarget.hand.map((entry) => entry.id);
    forgedShenfenPending.shenfenContinuation.nextTargetIndex = 1;
    forgedShenfenPending.promptId = standardPromptId(
      forgedShenfenPending.eventId,
      "shenfen",
      skippedTarget.id,
      "discard-hand-1",
    );
    await expectInvalid(forgedShenfen);

    const leiji = setup();
    const defender = leiji.others[0]!;
    grantSkill(leiji.game.completeRules.lifecycle, {
      ownerId: defender.id,
      skillId: "longhun",
      sourcePlayerId: defender.id,
      sourceSkillId: "persistence-test",
      expiry: { type: "permanent" },
    });
    grantSkill(leiji.game.completeRules.lifecycle, {
      ownerId: defender.id,
      skillId: "leiji",
      sourcePlayerId: defender.id,
      sourceSkillId: "persistence-test",
      expiry: { type: "permanent" },
    });
    defender.hp = 2;
    leiji.owner.hand = [card("persist-leiji-slash", "slash", 7, "heart")];
    defender.hand = [
      card("persist-longhun-club-1", "peach", 4, "club"),
      card("persist-longhun-club-2", "dodge", 9, "club"),
    ];
    let leijiPending = applyAction(leiji.game, {
      type: "play_card",
      playerId: leiji.owner.id,
      cardId: "persist-leiji-slash",
      targetId: defender.id,
    });
    leijiPending = applyAction(leijiPending, {
      type: "use_skill",
      playerId: defender.id,
      skillId: "longhun",
      cardIds: ["persist-longhun-club-1", "persist-longhun-club-2"],
    });
    const leijiSnapshot = snapshotForGame(leijiPending, "Committed Longhun Dodge provenance");
    await restoreGame(leijiSnapshot);
    await roundTripCommittedResponse(leijiPending, "Committed nested Slash response", "slash_response_progress");

    const forgedLeiji = structuredClone(leijiSnapshot) as MutableSnapshot;
    const forgedComponent = forgedLeiji.rooms[0]?.game?.resolvingCards
      .find((entry) => entry.id === "persist-longhun-club-2");
    if (!forgedComponent) throw new Error("Missing persisted Longhun component");
    forgedComponent.suit = "diamond";
    await expectInvalid(forgedLeiji);

    const nullification = setup();
    nullification.owner.hand = [card("persist-nullification-trick", "ex_nihilo", 7, "heart")];
    nullification.game.deck = [
      card("persist-nullification-draw-2", "peach"),
      card("persist-nullification-draw-1", "dodge"),
    ];
    nullification.others[0]!.hand = [card("persist-nullification-response", "wu_xie_ke_ji")];
    const nullificationPending = applyAction(nullification.game, {
      type: "play_card",
      playerId: nullification.owner.id,
      cardId: "persist-nullification-trick",
    });
    if (nullificationPending.pendingResponse?.type !== "nullification") {
      throw new Error("Trick did not stop at Nullification");
    }
    await roundTripCommittedResponse(
      nullificationPending,
      "Committed Nullification response",
      "nullification_progress",
    );

    const duel = setup();
    const duelTarget = duel.others[0]!;
    duel.owner.hand = [card("persist-duel", "duel", 1, "spade")];
    const duelPending = declineNullifications(applyAction(duel.game, {
      type: "play_card",
      playerId: duel.owner.id,
      cardId: "persist-duel",
      targetId: duelTarget.id,
    }));
    if (duelPending.pendingResponse?.type !== "duel") throw new Error("Duel response did not begin");
    await roundTripCommittedResponse(duelPending, "Committed Duel response", "duel_response_progress");

    const massAttack = setup();
    massAttack.owner.hand = [card("persist-arrows", "arrow_barrage", 1, "heart")];
    const massAttackPending = declineNullifications(applyAction(massAttack.game, {
      type: "play_card",
      playerId: massAttack.owner.id,
      cardId: "persist-arrows",
    }));
    if (massAttackPending.pendingResponse?.type !== "mass_attack") {
      throw new Error("Mass-attack response did not begin");
    }
    await roundTripCommittedResponse(
      massAttackPending,
      "Committed mass-attack response",
      "mass_attack_commitment",
    );

    const orphaned = applyAction(duelPending, {
      type: "respond",
      playerId: duelTarget.id,
      cardId: null,
    });
    const orphanEffect = duelPending.completeRules.lifecycle.effects.find((effect) =>
      effect.kind === "duel_response_progress");
    if (!orphanEffect || orphaned.pendingResponse !== null) throw new Error("Duel did not finish cleanly");
    const forgedOrphan = structuredClone(snapshotForGame(orphaned, "Orphan response commitment")) as MutableSnapshot;
    const lifecycle = forgedOrphan.rooms[0]!.game!.completeRules.lifecycle;
    lifecycle.effects.push({ ...structuredClone(orphanEffect), effectId: lifecycle.nextEffectId++ });
    await expectInvalid(forgedOrphan);
  });
});
