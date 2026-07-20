import { describe, expect, it } from "vitest";

import {
  GAME_DAMAGE_CONTINUATION_MAX_DEPTH,
  GAME_DAMAGE_CONTINUATION_TYPE,
  GameDamageContinuationError,
  assertGameDamageContinuation,
  decodeGameDamageContinuation,
  encodeGameDamageContinuation,
  type GameDamageResume,
} from "../src/index.js";
import type {
  DyingResume,
  PendingMassAttackResponse,
  PendingSlashResponse,
  StandardDamageAftermath,
} from "../src/types.js";

function massAttackPending(): PendingMassAttackResponse {
  return {
    type: "mass_attack",
    attackerId: "attacker",
    targetId: "target",
    cardId: "mass-card",
    cardKind: "barbarian_invasion",
    responseKind: "slash",
    remainingTargetIds: ["next-target"],
    armorAttempted: false,
    declinedLordSkillIds: ["jijiang"],
  };
}

function slashPending(): PendingSlashResponse {
  return {
    type: "slash",
    attackerId: "attacker",
    targetId: "target",
    cardId: "slash-card",
    damageCardIds: ["slash-card", "second-physical-card"],
    slashKind: "fire_slash",
    damage: 2,
    nature: "fire",
    color: "red",
    armorAttempted: true,
    armorIgnored: false,
    requiredDodgeCount: 2,
    dodgesPlayed: 1,
    remainingTargetIds: ["next-target"],
    zhuQueChecked: true,
    ciXiongChecked: true,
    liuliCheckedPlayerIds: ["target"],
    xiangleCheckedPlayerIds: ["target"],
    jiangProcessedPlayerIds: ["attacker", "target"],
    liegongChecked: true,
    tieqiChecked: true,
    useProvenance: {
      method: "use",
      turnPlayerId: "attacker",
      phase: "play",
    },
    excludedRedirectTargetIds: ["attacker", "target", "next-target"],
    dodgeProhibited: false,
    completion: {
      type: "turn_flow",
      continuationId: 17,
      playerId: "attacker",
      destination: "discard_or_end",
    },
    declinedLordSkillIds: ["hujia"],
  };
}

function aftermath(resume: DyingResume): StandardDamageAftermath {
  return {
    eventId: 23,
    sourceId: "attacker",
    targetId: "target",
    amount: 2,
    damageCardIds: ["damage-card"],
    remainingSkillIds: ["jianxiong", "yiji"],
    resume,
  };
}

function rawContinuation(resume: unknown): unknown {
  return { type: GAME_DAMAGE_CONTINUATION_TYPE, data: { resume } };
}

function standardWrapper(resume: unknown, eventId = 1): unknown {
  return {
    type: "standard_damage",
    aftermath: {
      eventId,
      sourceId: "attacker",
      targetId: "target",
      amount: 1,
      damageCardIds: [],
      remainingSkillIds: [],
      resume,
    },
  };
}

describe("game DamageFlow caller continuation codec", () => {
  const variants: ReadonlyArray<[string, GameDamageResume]> = [
    ["finish_effect", { type: "finish_effect" }],
    ["turn_start", { type: "turn_start" }],
    ["skill-kurou", { type: "skill", skillId: "kurou", playerId: "skill-owner" }],
    ["mass_attack", { type: "mass_attack", pending: massAttackPending() }],
    ["slash_sequence", { type: "slash_sequence", pending: slashPending() }],
    ["chain_damage", {
      type: "chain_damage",
      sourceId: "attacker",
      amount: 2,
      nature: "thunder",
      damageCardIds: ["chain-card"],
      remainingTargetIds: ["chain-a", "chain-b"],
      finalResume: { type: "turn_start" },
    }],
    ["standard_damage", {
      type: "standard_damage",
      aftermath: aftermath({ type: "finish_effect" }),
    }],
  ];

  it.each(variants)("round-trips and JSON-recovers %s", (_name, resume) => {
    const encoded = encodeGameDamageContinuation(resume);
    expect(encoded.type).toBe("game_session.damage_resume.v1");
    expect(decodeGameDamageContinuation(JSON.parse(JSON.stringify(encoded)))).toEqual(resume);
    expect(assertGameDamageContinuation(encoded)).toEqual(resume);
  });

  it("normalizes legal legacy Slash and chain omissions to the current standard shape", () => {
    const legacySlash = {
      type: "slash_sequence",
      pending: {
        type: "slash",
        attackerId: "attacker",
        targetId: "target",
        cardId: "legacy-slash",
      },
    } as unknown as GameDamageResume;
    const normalized = decodeGameDamageContinuation(encodeGameDamageContinuation(legacySlash));
    expect(normalized).toEqual({
      type: "slash_sequence",
      pending: {
        type: "slash",
        attackerId: "attacker",
        targetId: "target",
        cardId: "legacy-slash",
        damageCardIds: ["legacy-slash"],
        slashKind: "slash",
        damage: 1,
        nature: "normal",
        color: "colorless",
        requiredDodgeCount: 1,
        dodgesPlayed: 0,
        remainingTargetIds: [],
        zhuQueChecked: true,
        ciXiongChecked: true,
        liuliCheckedPlayerIds: [],
        xiangleCheckedPlayerIds: [],
        jiangProcessedPlayerIds: [],
        liegongChecked: false,
        tieqiChecked: false,
        excludedRedirectTargetIds: ["attacker", "target"],
        dodgeProhibited: false,
        completion: { type: "default" },
        declinedLordSkillIds: [],
      },
    });

    const normalizedChain = decodeGameDamageContinuation(rawContinuation({
      type: "chain_damage",
      sourceId: null,
      amount: 1,
      nature: "fire",
      remainingTargetIds: [],
      finalResume: { type: "finish_effect" },
    }));
    expect(normalizedChain).toMatchObject({ type: "chain_damage", damageCardIds: [] });
  });

  it("supports nested standard aftermath and chain continuations", () => {
    const nested: GameDamageResume = {
      type: "standard_damage",
      aftermath: aftermath({
        type: "chain_damage",
        sourceId: "attacker",
        amount: 1,
        nature: "fire",
        damageCardIds: ["fire-card"],
        remainingTargetIds: ["chain-target"],
        finalResume: {
          type: "standard_damage",
          aftermath: aftermath({ type: "skill", skillId: "kurou", playerId: "skill-owner" }),
        },
      }),
    };
    expect(decodeGameDamageContinuation(encodeGameDamageContinuation(nested))).toEqual(nested);
  });

  it("defensively deep-clones on encode, decode and assert", () => {
    const original: GameDamageResume = { type: "slash_sequence", pending: slashPending() };
    const encoded = encodeGameDamageContinuation(original);
    original.pending.remainingTargetIds.push("mutated-original");
    expect((encoded.data.resume as any).pending.remainingTargetIds).toEqual(["next-target"]);

    const first = decodeGameDamageContinuation(encoded);
    const second = assertGameDamageContinuation(encoded);
    if (first.type !== "slash_sequence" || second.type !== "slash_sequence") throw new Error("expected Slash resumes");
    first.pending.remainingTargetIds.push("mutated-decoded-copy");
    expect(second.pending.remainingTargetIds).toEqual(["next-target"]);
    expect((encoded.data.resume as any).pending.remainingTargetIds).toEqual(["next-target"]);
  });

  it("accepts exactly the maximum recursive resume depth and rejects the next level", () => {
    let accepted: unknown = { type: "finish_effect" };
    for (let index = 1; index < GAME_DAMAGE_CONTINUATION_MAX_DEPTH; index += 1) {
      accepted = standardWrapper(accepted, index);
    }
    expect(() => decodeGameDamageContinuation(rawContinuation(accepted))).not.toThrow();
    expect(() => decodeGameDamageContinuation(rawContinuation(standardWrapper(accepted, 32))))
      .toThrow(GameDamageContinuationError);
  });

  const invalidCases: ReadonlyArray<[string, () => unknown]> = [
    ["wrong continuation type", () => ({ type: "game_session.damage_resume.v0", data: { resume: { type: "finish_effect" } } })],
    ["top-level extra field", () => ({ ...rawContinuation({ type: "finish_effect" }) as object, extra: true })],
    ["data extra field", () => ({ type: GAME_DAMAGE_CONTINUATION_TYPE, data: { resume: { type: "finish_effect" }, extra: true } })],
    ["variant extra field", () => rawContinuation({ type: "finish_effect", extra: true })],
    ["pending extra field", () => rawContinuation({ type: "mass_attack", pending: { ...massAttackPending(), extra: true } })],
    ["aftermath extra field", () => rawContinuation({
      type: "standard_damage",
      aftermath: { ...aftermath({ type: "finish_effect" }), extra: true },
    })],
    ["completion extra field", () => rawContinuation({
      type: "slash_sequence",
      pending: { ...slashPending(), completion: { type: "default", extra: true } },
    })],
    ["provenance extra field", () => rawContinuation({
      type: "slash_sequence",
      pending: { ...slashPending(), useProvenance: { ...slashPending().useProvenance, extra: true } },
    })],
    ["invalid provenance method", () => rawContinuation({
      type: "slash_sequence",
      pending: { ...slashPending(), useProvenance: { ...slashPending().useProvenance, method: "play" } },
    })],
    ["invalid provenance phase", () => rawContinuation({
      type: "slash_sequence",
      pending: { ...slashPending(), useProvenance: { ...slashPending().useProvenance, phase: "dying" } },
    })],
    ["empty player id", () => rawContinuation({ type: "skill", skillId: "kurou", playerId: "" })],
    ["wrong skill id", () => rawContinuation({ type: "skill", skillId: "fanjian", playerId: "owner" })],
    ["unsafe integer", () => rawContinuation({
      type: "standard_damage",
      aftermath: { ...aftermath({ type: "finish_effect" }), eventId: Number.MAX_SAFE_INTEGER + 1 },
    })],
    ["zero damage", () => rawContinuation({
      type: "chain_damage", sourceId: null, amount: 0, nature: "fire", damageCardIds: [],
      remainingTargetIds: [], finalResume: { type: "finish_effect" },
    })],
    ["invalid enum", () => rawContinuation({
      type: "chain_damage", sourceId: null, amount: 1, nature: "normal", damageCardIds: [],
      remainingTargetIds: [], finalResume: { type: "finish_effect" },
    })],
    ["duplicate mass targets", () => rawContinuation({
      type: "mass_attack",
      pending: { ...massAttackPending(), remainingTargetIds: ["same", "same"] },
    })],
    ["too many mass targets", () => rawContinuation({
      type: "mass_attack",
      pending: { ...massAttackPending(), remainingTargetIds: Array.from({ length: 10 }, (_value, index) => `p-${index}`) },
    })],
    ["duplicate Slash physical cards", () => rawContinuation({
      type: "slash_sequence",
      pending: { ...slashPending(), damageCardIds: ["same", "same"] },
    })],
    ["too many Slash remaining targets", () => rawContinuation({
      type: "slash_sequence",
      pending: { ...slashPending(), remainingTargetIds: ["one", "two", "three"] },
    })],
    ["more accepted Dodges than required", () => rawContinuation({
      type: "slash_sequence",
      pending: { ...slashPending(), requiredDodgeCount: 1, dodgesPlayed: 2 },
    })],
    ["duplicate Xiangle target", () => rawContinuation({
      type: "slash_sequence",
      pending: { ...slashPending(), xiangleCheckedPlayerIds: ["target", "target"] },
    })],
    ["duplicate Jiang owner", () => rawContinuation({
      type: "slash_sequence",
      pending: { ...slashPending(), jiangProcessedPlayerIds: ["attacker", "attacker"] },
    })],
    ["duplicate declined lord skill", () => rawContinuation({
      type: "mass_attack",
      pending: { ...massAttackPending(), declinedLordSkillIds: ["hujia", "hujia"] },
    })],
    ["duplicate standard damage skill", () => rawContinuation({
      type: "standard_damage",
      aftermath: { ...aftermath({ type: "finish_effect" }), remainingSkillIds: ["jianxiong", "jianxiong"] },
    })],
    ["non-damage standard skill", () => rawContinuation({
      type: "standard_damage",
      aftermath: { ...aftermath({ type: "finish_effect" }), remainingSkillIds: ["tiandu"] },
    })],
    ["direct nested chain", () => rawContinuation({
      type: "chain_damage",
      sourceId: null,
      amount: 1,
      nature: "fire",
      damageCardIds: [],
      remainingTargetIds: [],
      finalResume: {
        type: "chain_damage", sourceId: null, amount: 1, nature: "thunder", damageCardIds: [],
        remainingTargetIds: [], finalResume: { type: "finish_effect" },
      },
    })],
    ["top-level engine damage cursor", () => rawContinuation({ type: "damage_flow", frameId: 1, damageId: 1, dyingId: 1 })],
    ["nested engine damage cursor", () => rawContinuation(standardWrapper({
      type: "damage_flow", frameId: 1, damageId: 1, dyingId: 1,
    }))],
    ["undefined", () => rawContinuation({ type: "skill", skillId: "kurou", playerId: undefined })],
    ["NaN", () => rawContinuation({
      type: "chain_damage", sourceId: null, amount: Number.NaN, nature: "fire", damageCardIds: [],
      remainingTargetIds: [], finalResume: { type: "finish_effect" },
    })],
    ["Date", () => ({ type: GAME_DAMAGE_CONTINUATION_TYPE, data: { resume: new Date(0) } })],
    ["symbol value", () => rawContinuation({ type: "skill", skillId: "kurou", playerId: Symbol("owner") })],
    ["sparse array", () => rawContinuation({
      type: "mass_attack",
      pending: { ...massAttackPending(), remainingTargetIds: new Array(1) },
    })],
    ["array custom property", () => {
      const ids = ["target"] as string[] & { extra?: boolean };
      ids.extra = true;
      return rawContinuation({ type: "mass_attack", pending: { ...massAttackPending(), remainingTargetIds: ids } });
    }],
    ["symbol key", () => {
      const resume = { type: "finish_effect" } as Record<PropertyKey, unknown>;
      resume[Symbol("extra")] = true;
      return rawContinuation(resume);
    }],
    ["cycle", () => {
      const resume = standardWrapper({ type: "finish_effect" }) as any;
      resume.aftermath.resume = resume;
      return rawContinuation(resume);
    }],
  ];

  it.each(invalidCases)("rejects %s", (_name, build) => {
    expect(() => decodeGameDamageContinuation(build())).toThrow(GameDamageContinuationError);
  });

  it("validates encode input at runtime even when TypeScript was bypassed", () => {
    expect(() => encodeGameDamageContinuation({
      type: "damage_flow", frameId: 1, damageId: 1, dyingId: 1,
    } as unknown as GameDamageResume)).toThrow(GameDamageContinuationError);
  });
});
