import { describe, expect, it } from "vitest";

import {
  GameRuleError,
  applyAction,
  createGame,
  getCardDefinition,
  getGameView,
  recordSkillLoss,
  type Card,
  type CardKind,
  type GamePlayer,
  type GameSession,
} from "../src/index.js";

const seed = "91".padStart(64, "0");

function card(id: string, kind: CardKind): Card {
  return { id, kind, ...getCardDefinition(kind), suit: "spade", rank: 1 };
}

function setup(): { session: GameSession; giver: GamePlayer; receiver: GamePlayer; observer: GamePlayer } {
  const session = createGame({ playerIds: ["giver", "receiver", "observer"], seed });
  const giver = session.players.find((player) => player.id === session.currentPlayerId)!;
  const [receiver, observer] = session.players.filter((player) => player.id !== giver.id);
  const formerLord = session.players.find((player) => player.role === "lord")!;
  if (formerLord.id !== receiver!.id) {
    const receiverRole = receiver!.role;
    receiver!.role = "lord";
    formerLord.role = receiverRole;
  }
  giver.generalId = "hua_tuo";
  receiver!.generalId = "zhang_jiao";
  observer!.generalId = "cao_cao";
  for (const player of session.players) {
    player.alive = true;
    player.hp = player.maxHp = 4;
    player.hand = [];
    player.equipment = {};
    player.judgment = [];
    player.extraPiles = {};
  }
  session.deck = [];
  session.discardPile = [];
  session.resolvingCards = [];
  session.pendingResponse = null;
  session.turn.phase = "play";
  session.turn.skillUseCounts = {};
  return { session, giver, receiver: receiver!, observer: observer! };
}

function code(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    if (!(error instanceof GameRuleError)) throw error;
    return error.code;
  }
  return undefined;
}

describe("live Wind skill: Huangtian", () => {
  it("projects only the giver's legal choices and transfers one physical hand card once per play phase", () => {
    const { session, giver, receiver, observer } = setup();
    giver.hand = [card("secret-dodge", "dodge"), card("secret-lightning", "shan_dian"), card("secret-slash", "slash")];

    const giverPrompt = getGameView(session, giver.id).prompt;
    if (giverPrompt.type !== "play") throw new Error("expected play prompt");
    expect(giverPrompt.skills.find((skill) => skill.skillId === "huangtian")).toEqual({
      skillId: "huangtian",
      cardIds: ["secret-dodge", "secret-lightning"],
      minCards: 1,
      maxCards: 1,
      targetMode: "single-other",
      targetIds: [receiver.id],
    });
    expect(JSON.stringify(getGameView(session, observer.id))).not.toContain("secret-");

    const game = applyAction(session, {
      type: "use_skill",
      playerId: giver.id,
      skillId: "huangtian",
      cardIds: ["secret-dodge"],
      targetId: receiver.id,
    });
    expect(game.players.find((player) => player.id === giver.id)?.hand.map((item) => item.id)).toEqual([
      "secret-lightning", "secret-slash",
    ]);
    expect(game.players.find((player) => player.id === receiver.id)?.hand.map((item) => item.id)).toEqual(["secret-dodge"]);
    expect(game.turn.skillUseCounts.huangtian).toBe(1);
    expect(JSON.stringify(getGameView(game, observer.id))).not.toContain("secret-dodge");
    expect(code(() => applyAction(game, {
      type: "use_skill",
      playerId: giver.id,
      skillId: "huangtian",
      cardIds: ["secret-lightning"],
      targetId: receiver.id,
    }))).toBe("INVALID_SKILL");
  });

  it("rejects non-Qun givers, non-hand or wrong cards, and an ineffective Huangtian lord", () => {
    {
      const { session, giver, receiver } = setup();
      giver.generalId = "cao_cao";
      giver.hand = [card("wei-dodge", "dodge")];
      expect(code(() => applyAction(session, {
        type: "use_skill", playerId: giver.id, skillId: "huangtian", cardIds: ["wei-dodge"], targetId: receiver.id,
      }))).toBe("INVALID_SKILL");
    }
    {
      const { session, giver, receiver } = setup();
      giver.equipment.weapon = card("equipped-lightning", "shan_dian");
      expect(code(() => applyAction(session, {
        type: "use_skill", playerId: giver.id, skillId: "huangtian", cardIds: ["equipped-lightning"], targetId: receiver.id,
      }))).toBe("INVALID_CARD");
      giver.equipment = {};
      giver.hand = [card("wrong-kind", "slash")];
      expect(code(() => applyAction(session, {
        type: "use_skill", playerId: giver.id, skillId: "huangtian", cardIds: ["wrong-kind"], targetId: receiver.id,
      }))).toBe("INVALID_CARD");
    }
    {
      const { session, giver, receiver } = setup();
      giver.hand = [card("lost-skill-dodge", "dodge")];
      recordSkillLoss(session.completeRules.lifecycle, {
        ownerId: receiver.id,
        skillIds: ["huangtian"],
        sourcePlayerId: giver.id,
        sourceSkillId: "test_loss",
        lostAtEventId: 1,
      });
      expect(getGameView(session, giver.id).prompt).toMatchObject({ type: "play", skills: expect.not.arrayContaining([
        expect.objectContaining({ skillId: "huangtian" }),
      ]) });
      expect(code(() => applyAction(session, {
        type: "use_skill", playerId: giver.id, skillId: "huangtian", cardIds: ["lost-skill-dodge"], targetId: receiver.id,
      }))).toBe("INVALID_TARGET");
    }
  });
});
