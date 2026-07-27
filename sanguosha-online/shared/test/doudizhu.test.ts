import { describe, expect, it } from "vitest";
import {
  applyDoudizhuAction,
  canDoudizhuPatternBeat,
  chooseDoudizhuBotAction,
  createDoudizhuGame,
  getDoudizhuGameView,
  parseDoudizhuPattern,
  type DoudizhuCard,
} from "../src/index.js";

const SEED = "42".repeat(32);
const players = Array.from({ length: 3 }, (_, seat) => ({
  id: `player-${seat + 1}`,
  name: `玩家${seat + 1}`,
}));

function card(id: string, rank: DoudizhuCard["rank"], suit: DoudizhuCard["suit"] = "spade"): DoudizhuCard {
  return { id, rank, suit: rank.includes("joker") ? "joker" : suit };
}

describe("Doudizhu authoritative engine", () => {
  it("deals 17 cards each, keeps three bottom cards, and hides opponents' hands", () => {
    const first = createDoudizhuGame({ players, seed: SEED });
    const second = createDoudizhuGame({ players, seed: SEED });

    expect(first.players.map((player) => player.hand.length)).toEqual([17, 17, 17]);
    expect(first.players.map((player) => player.beans)).toEqual([10_000, 10_000, 10_000]);
    expect(first.bottomCards).toHaveLength(3);
    expect(first.players.map((player) => player.hand.map((item) => item.id))).toEqual(
      second.players.map((player) => player.hand.map((item) => item.id)),
    );

    const view = getDoudizhuGameView(first, players[0]!.id);
    expect(view.bottomCards).toEqual([]);
    expect(view.players[0]?.hand).toHaveLength(17);
    expect(view.players.slice(1).every((player) => player.hand === undefined)).toBe(true);
  });

  it("recognizes common combinations and bomb priority", () => {
    const straight = parseDoudizhuPattern([
      card("3", "3"), card("4", "4"), card("5", "5"), card("6", "6"), card("7", "7"),
    ]);
    const higherStraight = parseDoudizhuPattern([
      card("4b", "4"), card("5b", "5"), card("6b", "6"), card("7b", "7"), card("8b", "8"),
    ]);
    const airplane = parseDoudizhuPattern([
      card("333a", "3"), card("333b", "3", "heart"), card("333c", "3", "club"),
      card("444a", "4"), card("444b", "4", "heart"), card("444c", "4", "club"),
      card("wing5", "5"), card("wing6", "6"),
    ]);
    const bomb = parseDoudizhuPattern([
      card("9a", "9"), card("9b", "9", "heart"), card("9c", "9", "club"), card("9d", "9", "diamond"),
    ]);

    expect(straight).toMatchObject({ type: "straight", length: 5, primaryRank: "7" });
    expect(airplane).toMatchObject({ type: "airplane_singles", length: 2, primaryRank: "4" });
    expect(canDoudizhuPatternBeat(higherStraight!, straight!)).toBe(true);
    expect(canDoudizhuPatternBeat(bomb!, higherStraight!)).toBe(true);
  });

  it("finishes bidding, gives the landlord 20 cards, and resets after two passes", () => {
    let game = createDoudizhuGame({ players, seed: SEED });
    const first = game.currentPlayerId;
    game = applyDoudizhuAction(game, { type: "doudizhu_bid", playerId: first, score: 1 });
    game = applyDoudizhuAction(game, { type: "doudizhu_bid", playerId: game.currentPlayerId, score: 0 });
    game = applyDoudizhuAction(game, { type: "doudizhu_bid", playerId: game.currentPlayerId, score: 0 });

    expect(game.phase).toBe("playing");
    expect(game.landlordId).toBe(first);
    expect(game.players.find((player) => player.id === first)?.hand).toHaveLength(20);

    const landlord = game.players.find((player) => player.id === first)!;
    const leadCard = landlord.hand[0]!;
    game = applyDoudizhuAction(game, {
      type: "doudizhu_play",
      playerId: landlord.id,
      cardIds: [leadCard.id],
    });
    game = applyDoudizhuAction(game, { type: "doudizhu_pass", playerId: game.currentPlayerId });
    game = applyDoudizhuAction(game, { type: "doudizhu_pass", playerId: game.currentPlayerId });
    expect(game.trick).toBeNull();
    expect(game.currentPlayerId).toBe(landlord.id);
  });

  it("advances bidding and play counterclockwise", () => {
    let game = createDoudizhuGame({ players, seed: SEED });
    const biddingPlayer = game.currentPlayerId;
    const biddingIndex = game.players.findIndex((player) => player.id === biddingPlayer);
    const counterclockwiseBidder = game.players[(biddingIndex - 1 + game.players.length) % game.players.length]!.id;
    game = applyDoudizhuAction(game, {
      type: "doudizhu_bid",
      playerId: biddingPlayer,
      score: 1,
    });
    expect(game.currentPlayerId).toBe(counterclockwiseBidder);

    game = applyDoudizhuAction(game, {
      type: "doudizhu_bid",
      playerId: game.currentPlayerId,
      score: 3,
    });
    const landlordId = game.currentPlayerId;
    const landlordIndex = game.players.findIndex((player) => player.id === landlordId);
    const counterclockwisePlayer = game.players[(landlordIndex - 1 + game.players.length) % game.players.length]!.id;
    const leadCard = game.players[landlordIndex]!.hand[0]!;
    game = applyDoudizhuAction(game, {
      type: "doudizhu_play",
      playerId: landlordId,
      cardIds: [leadCard.id],
    });
    expect(game.currentPlayerId).toBe(counterclockwisePlayer);
  });

  it("returns a legal recommended play for the active player", () => {
    let game = createDoudizhuGame({ players, seed: SEED });
    game = applyDoudizhuAction(game, {
      type: "doudizhu_bid",
      playerId: game.currentPlayerId,
      score: 3,
    });

    const view = getDoudizhuGameView(game, game.currentPlayerId);
    expect(view.prompt.type).toBe("play");
    expect(view.prompt.recommendation?.type).toBe("play");
    const recommendation = view.prompt.recommendation;
    if (!recommendation || recommendation.type !== "play") throw new Error("Expected a play recommendation");
    expect(recommendation.cardIds.length).toBeGreaterThan(0);
    const beforeRevision = game.revision;
    game = applyDoudizhuAction(game, {
      type: "doudizhu_play",
      playerId: view.currentPlayerId,
      cardIds: recommendation.cardIds,
    });
    expect(game.revision).toBe(beforeRevision + 1);
  });

  it("redeals when all three players decline to bid", () => {
    const carriedBeans = [8_700, 10_400, 10_900];
    let game = createDoudizhuGame({
      players: players.map((player, index) => ({ ...player, beans: carriedBeans[index] })),
      seed: SEED,
    });
    const originalHands = game.players.map((player) => player.hand.map((item) => item.id));
    for (let turn = 0; turn < 3; turn += 1) {
      game = applyDoudizhuAction(game, {
        type: "doudizhu_bid",
        playerId: game.currentPlayerId,
        score: 0,
      });
    }
    expect(game.phase).toBe("bidding");
    expect(game.landlordId).toBeNull();
    expect(game.bid.bids).toEqual([]);
    expect(game.players.map((player) => player.hand.map((item) => item.id))).not.toEqual(originalHands);
    expect(game.players.map((player) => player.beans)).toEqual(carriedBeans);
    expect(game.logs.at(-1)?.message).toContain("重新发牌");
  });

  it("runs three bots to a winner", () => {
    let game = createDoudizhuGame({ players, seed: "ab".repeat(32) });
    for (let step = 0; step < 2_000 && game.status === "playing"; step += 1) {
      const action = chooseDoudizhuBotAction(game, game.currentPlayerId, 5);
      game = applyDoudizhuAction(game, action);
    }
    expect(game.status).toBe("finished");
    expect(game.winner?.playerIds.length).toBeGreaterThan(0);
    expect(game.players.reduce((total, player) => total + player.beans, 0)).toBe(30_000);
    expect(game.players.reduce((total, player) => total + player.beanDelta, 0)).toBe(0);
    expect(game.players.some((player) => player.beanDelta > 0)).toBe(true);
    expect(game.players.some((player) => player.beanDelta < 0)).toBe(true);
    expect(game.players.some((player) => player.beans !== 10_000)).toBe(true);
    expect(game.winner?.beanStake).toBe(game.baseScore * game.multiplier * 100);
    expect(game.winner?.settlements).toHaveLength(3);
  });
});
