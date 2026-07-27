import { describe, expect, it } from "vitest";
import {
  SplendorRuleError,
  applySplendorAction,
  assertRestorableSplendorGameState,
  chooseSplendorBotAction,
  createSplendorGame,
  forfeitSplendorPlayer,
  getSplendorGameView,
  type SplendorCard,
  type SplendorGameState,
  type SplendorPlayerState,
  type SplendorResourceMap,
} from "../src/index.js";

const SEED = "4a".repeat(32);
const players = Array.from({ length: 3 }, (_, seat) => ({
  id: `player-${seat + 1}`,
  name: `玩家${seat + 1}`,
}));

function currentPlayer(game: SplendorGameState): SplendorPlayerState {
  return game.players.find((player) => player.id === game.currentPlayerId)!;
}

function removeCardFromBoard(game: SplendorGameState, predicate: (card: SplendorCard) => boolean): SplendorCard {
  for (const zone of [game.market, game.decks]) {
    for (const cards of Object.values(zone)) {
      const index = cards.findIndex(predicate);
      if (index >= 0) return cards.splice(index, 1)[0]!;
    }
  }
  throw new Error("card not found");
}

function makePokemonEvolutionAvailable(game: SplendorGameState): {
  player: SplendorPlayerState;
  base: SplendorCard;
  target: SplendorCard;
} {
  const player = currentPlayer(game);
  const target = Object.values(game.market).flat().find((card) => card.evolutionOf)!;
  const base = removeCardFromBoard(game, (card) => card.name === target.evolutionOf);
  player.cards.push(base);
  player.bonuses = { ...(target.evolutionReq as SplendorResourceMap) };
  player.bonuses[base.bonus] = (player.bonuses[base.bonus] ?? 0) + base.bonusCount;
  return { player, base, target };
}

describe("Splendor authoritative engine", () => {
  it("creates deterministic classic and Pokemon boards with the correct supply", () => {
    for (const kind of ["splendor", "splendor_pokemon"] as const) {
      const first = createSplendorGame({ kind, players, seed: SEED });
      const second = createSplendorGame({ kind, players, seed: SEED });
      expect(first.currentPlayerId).toBe(second.currentPlayerId);
      expect(first.market).toEqual(second.market);
      expect(first.decks).toEqual(second.decks);
      expect(first.players).toHaveLength(3);
      expect(Object.values(first.decks).flat()).toHaveLength(kind === "splendor" ? 78 : 76);
      expect(Object.values(first.market).flat()).toHaveLength(kind === "splendor" ? 12 : 14);
      expect(first.tokenSupply[kind === "splendor" ? "gold" : "purple"]).toBe(5);
      for (const color of kind === "splendor"
        ? ["white", "blue", "green", "red", "black"] as const
        : ["red", "blue", "black", "pink", "yellow"] as const) {
        expect(first.tokenSupply[color]).toBe(5);
      }
      expect(() => assertRestorableSplendorGameState(first)).not.toThrow();
    }
  });

  it("keeps a deck reservation private while preserving its public count", () => {
    let game = createSplendorGame({ kind: "splendor", players, seed: SEED });
    const ownerId = game.currentPlayerId;
    game = applySplendorAction(game, {
      type: "splendor_reserve",
      playerId: ownerId,
      level: 3,
    });
    const ownerView = getSplendorGameView(game, ownerId);
    const opponentId = game.players.find((player) => player.id !== ownerId)!.id;
    const opponentView = getSplendorGameView(game, opponentId);
    const ownerInOwnView = ownerView.players.find((player) => player.id === ownerId)!;
    const ownerInOpponentView = opponentView.players.find((player) => player.id === ownerId)!;

    expect(ownerInOwnView.reservedCards).toHaveLength(1);
    expect(ownerInOpponentView.reservedCount).toBe(1);
    expect(ownerInOpponentView.reservedCards).toBeUndefined();
    expect(ownerInOpponentView.publicReservedCards).toEqual([]);
    expect(opponentView).not.toHaveProperty("decks");
    expect(opponentView).not.toHaveProperty("rng");
  });

  it("takes legal tokens and uses an independent return phase above ten", () => {
    const game = createSplendorGame({ kind: "splendor", players, seed: SEED });
    const player = currentPlayer(game);
    player.tokens = { white: 3, blue: 3, green: 3, red: 0, black: 0, gold: 0 };
    game.tokenSupply.white = 2;
    game.tokenSupply.blue = 2;
    game.tokenSupply.green = 2;

    const afterTake = applySplendorAction(game, {
      type: "splendor_take",
      playerId: player.id,
      colors: ["white", "blue", "green"],
    });
    expect(afterTake.phase).toBe("return");
    expect(afterTake.pendingReturnCount).toBe(2);
    expect(afterTake.currentPlayerId).toBe(player.id);
    expect(() => applySplendorAction(afterTake, {
      type: "splendor_take",
      playerId: player.id,
      colors: ["red", "black"],
    })).toThrow(SplendorRuleError);

    const afterReturn = applySplendorAction(afterTake, {
      type: "splendor_return",
      playerId: player.id,
      colors: ["white", "blue"],
    });
    expect(afterReturn.phase).toBe("main");
    expect(afterReturn.currentPlayerId).not.toBe(player.id);
  });

  it("allows classic reservation when the gold supply is empty", () => {
    const game = createSplendorGame({ kind: "splendor", players, seed: SEED });
    game.tokenSupply.gold = 0;
    currentPlayer(game).tokens.gold = 5;
    const cardId = game.market["3"]![0]!.id;
    const next = applySplendorAction(game, {
      type: "splendor_reserve",
      playerId: game.currentPlayerId,
      cardId,
    });
    expect(next.players.find((player) => player.id === game.currentPlayerId)?.reserved[0]?.card.id).toBe(cardId);
    expect(next.players.find((player) => player.id === game.currentPlayerId)?.tokens.gold).toBe(5);
  });

  it("disallows Pokemon reservation when the master-ball supply is empty", () => {
    const game = createSplendorGame({ kind: "splendor_pokemon", players, seed: SEED });
    game.tokenSupply.purple = 0;
    currentPlayer(game).tokens.purple = 5;
    const prompt = getSplendorGameView(game, game.currentPlayerId).prompt;
    if (!("reserveCardIds" in prompt)) throw new Error("expected main prompt");
    expect(prompt.reserveCardIds).toEqual([]);
    expect(prompt.reserveDeckLevels).toEqual([]);
    expect(() => applySplendorAction(game, {
      type: "splendor_reserve",
      playerId: game.currentPlayerId,
      cardId: game.market["rare"]![0]!.id,
    })).toThrowError(expect.objectContaining({ code: "SPLENDOR_UNAVAILABLE" }));
  });

  it("requires the printed master-ball cost in addition to colored payment", () => {
    const game = createSplendorGame({ kind: "splendor_pokemon", players, seed: SEED });
    const player = currentPlayer(game);
    const rare = game.market["rare"]![0]!;
    player.tokens = {
      red: rare.cost.red ?? 0,
      blue: rare.cost.blue ?? 0,
      black: rare.cost.black ?? 0,
      pink: rare.cost.pink ?? 0,
      yellow: rare.cost.yellow ?? 0,
      purple: 0,
    };
    expect(() => applySplendorAction(game, {
      type: "splendor_buy",
      playerId: player.id,
      cardId: rare.id,
    })).toThrowError(expect.objectContaining({ code: "SPLENDOR_CANNOT_AFFORD" }));

    player.tokens.purple = 1;
    const purchased = applySplendorAction(game, {
      type: "splendor_buy",
      playerId: player.id,
      cardId: rare.id,
    });
    const buyer = purchased.players.find((candidate) => candidate.id === player.id)!;
    expect(buyer.cards.some((card) => card.id === rare.id)).toBe(true);
    expect(buyer.tokens.purple ?? 0).toBe(0);
  });

  it("does not let purple permanent bonuses reduce colored or printed master-ball costs", () => {
    const game = createSplendorGame({ kind: "splendor_pokemon", players, seed: SEED });
    const player = currentPlayer(game);
    const purpleBonus = removeCardFromBoard(game, (card) => card.bonus === "purple");
    player.cards.push(purpleBonus);
    player.bonuses.purple = purpleBonus.bonusCount;
    player.score += purpleBonus.points;
    const rare = game.market["rare"]![0]!;
    const insufficientTokens: SplendorResourceMap = { purple: 1 };
    let omitted = purpleBonus.bonusCount;
    for (const color of ["red", "blue", "black", "pink", "yellow"] as const) {
      const printed = rare.cost[color] ?? 0;
      const missing = Math.min(printed, omitted);
      omitted -= missing;
      insufficientTokens[color] = printed - missing;
    }
    player.tokens = insufficientTokens;
    expect(() => applySplendorAction(game, {
      type: "splendor_buy",
      playerId: player.id,
      cardId: rare.id,
    })).toThrowError(expect.objectContaining({ code: "SPLENDOR_CANNOT_AFFORD" }));

    player.tokens = {
      red: rare.cost.red ?? 0,
      blue: rare.cost.blue ?? 0,
      black: rare.cost.black ?? 0,
      pink: rare.cost.pink ?? 0,
      yellow: rare.cost.yellow ?? 0,
      purple: 1,
    };
    const purchased = applySplendorAction(game, {
      type: "splendor_buy",
      playerId: player.id,
      cardId: rare.id,
    });
    const buyer = purchased.players.find((candidate) => candidate.id === player.id)!;
    expect(buyer.cards.some((card) => card.id === rare.id)).toBe(true);
    expect(buyer.tokens.purple ?? 0).toBe(0);
    expect(Object.values(buyer.tokens).reduce((sum, count) => sum + (count ?? 0), 0)).toBe(0);
  });

  it("exposes evolution in the main prompt and lets it consume the whole turn", () => {
    const game = createSplendorGame({ kind: "splendor_pokemon", players, seed: SEED });
    const { player, base, target } = makePokemonEvolutionAvailable(game);
    const prompt = getSplendorGameView(game, player.id).prompt;
    if (!("evolutionOptions" in prompt)) throw new Error("expected main prompt");
    expect(prompt.evolutionOptions).toContainEqual({
      fromCardId: base.id,
      toCardId: target.id,
    });

    const evolved = applySplendorAction(game, {
      type: "splendor_evolve",
      playerId: player.id,
      fromCardId: base.id,
      toCardId: target.id,
    });
    const evolvedPlayer = evolved.players.find((candidate) => candidate.id === player.id)!;
    expect(evolvedPlayer.cards.some((card) => card.id === target.id)).toBe(true);
    expect(evolvedPlayer.cards.some((card) => card.id === base.id)).toBe(false);
    expect(evolvedPlayer.evolvedCards.some((card) => card.id === base.id)).toBe(true);
    expect(evolvedPlayer.score).toBe(target.points);
    expect(evolvedPlayer.evolutionCount).toBe(1);
    expect(evolved.currentPlayerId).not.toBe(player.id);
  });

  it("offers the optional post-buy evolution but not after taking tokens or reserving", () => {
    const buyGame = createSplendorGame({ kind: "splendor_pokemon", players, seed: SEED });
    const buySetup = makePokemonEvolutionAvailable(buyGame);
    buySetup.player.bonuses = {
      red: 10,
      blue: 10,
      black: 10,
      pink: 10,
      yellow: 10,
      purple: 0,
    };
    const boughtCard = buyGame.market["1"]!.find((card) => card.id !== buySetup.target.id)!;
    const afterBuy = applySplendorAction(buyGame, {
      type: "splendor_buy",
      playerId: buySetup.player.id,
      cardId: boughtCard.id,
    });
    expect(afterBuy.phase).toBe("evolution");
    const afterSkip = applySplendorAction(afterBuy, {
      type: "splendor_skip_evolution",
      playerId: buySetup.player.id,
    });
    expect(afterSkip.currentPlayerId).not.toBe(buySetup.player.id);

    const takeGame = createSplendorGame({ kind: "splendor_pokemon", players, seed: SEED });
    const takeSetup = makePokemonEvolutionAvailable(takeGame);
    const takePrompt = getSplendorGameView(takeGame, takeSetup.player.id).prompt;
    if (!("takeOptions" in takePrompt)) throw new Error("expected main prompt");
    const afterTake = applySplendorAction(takeGame, {
      type: "splendor_take",
      playerId: takeSetup.player.id,
      colors: takePrompt.takeOptions[0]!.colors,
    });
    expect(afterTake.phase).toBe("main");
    expect(afterTake.currentPlayerId).not.toBe(takeSetup.player.id);

    const reserveGame = createSplendorGame({ kind: "splendor_pokemon", players, seed: SEED });
    const reserveSetup = makePokemonEvolutionAvailable(reserveGame);
    const reservedCard = reserveGame.market["1"]![0]!;
    const afterReserve = applySplendorAction(reserveGame, {
      type: "splendor_reserve",
      playerId: reserveSetup.player.id,
      cardId: reservedCard.id,
    });
    expect(afterReserve.phase).toBe("main");
    expect(afterReserve.currentPlayerId).not.toBe(reserveSetup.player.id);
  });

  it("ends a Pokemon turn after returning excess tokens without offering evolution", () => {
    const game = createSplendorGame({ kind: "splendor_pokemon", players, seed: SEED });
    const { player } = makePokemonEvolutionAvailable(game);
    player.tokens = { red: 3, blue: 3, black: 3, pink: 0, yellow: 0, purple: 0 };
    game.tokenSupply.red = 2;
    game.tokenSupply.blue = 2;
    game.tokenSupply.black = 2;
    const afterTake = applySplendorAction(game, {
      type: "splendor_take",
      playerId: player.id,
      colors: ["red", "blue", "black"],
    });
    expect(afterTake.phase).toBe("return");
    const afterReturn = applySplendorAction(afterTake, {
      type: "splendor_return",
      playerId: player.id,
      colors: ["red", "blue"],
    });
    expect(afterReturn.phase).toBe("main");
    expect(afterReturn.currentPlayerId).not.toBe(player.id);
  });

  it("finishes classic play at the equal-round boundary", () => {
    const game = createSplendorGame({ kind: "splendor", players, seed: SEED });
    const firstIndex = game.players.findIndex((player) => player.id === game.firstPlayerId);
    const finisher = game.players[(firstIndex - 1 + game.players.length) % game.players.length]!;
    game.currentPlayerId = finisher.id;
    game.nobles = [];
    finisher.score = 14;
    finisher.bonuses = { white: 10, blue: 10, green: 10, red: 10, black: 10 };
    const card = game.market["3"]![0]!;
    const finished = applySplendorAction(game, {
      type: "splendor_buy",
      playerId: finisher.id,
      cardId: card.id,
    });
    expect(finished.status).toBe("finished");
    expect(finished.phase).toBe("finished");
    expect(finished.winner?.playerIds).toContain(finisher.id);
  });

  it("finishes Pokemon play at the first-player boundary when a later seat triggers it", () => {
    const game = createSplendorGame({ kind: "splendor_pokemon", players, seed: SEED });
    const firstIndex = game.players.findIndex((player) => player.id === game.firstPlayerId);
    const finisher = game.players[(firstIndex - 1 + game.players.length) % game.players.length]!;
    expect(finisher.id).not.toBe(game.firstPlayerId);
    game.currentPlayerId = finisher.id;
    finisher.score = 17;
    finisher.bonuses = { red: 10, blue: 10, black: 10, pink: 10, yellow: 10, purple: 0 };
    finisher.tokens.purple = 1;
    const card = game.market["rare"]![0]!;
    const finished = applySplendorAction(game, {
      type: "splendor_buy",
      playerId: finisher.id,
      cardId: card.id,
    });
    expect(finished.status).toBe("finished");
    expect(finished.finalRoundTriggerPlayerId).toBe(finisher.id);
    expect(finished.winner?.playerIds).toContain(finisher.id);
  });

  it("forfeits, rejects illegal actions, and detects restore tampering", () => {
    const game = createSplendorGame({ kind: "splendor", players, seed: SEED });
    const other = game.players.find((player) => player.id !== game.currentPlayerId)!;
    expect(() => applySplendorAction(game, {
      type: "splendor_take",
      playerId: other.id,
      colors: ["white", "blue", "green"],
    })).toThrowError(expect.objectContaining({ code: "SPLENDOR_NOT_YOUR_TURN" }));

    const forfeited = forfeitSplendorPlayer(game, other.id);
    expect(forfeited.status).toBe("finished");
    expect(forfeited.winner).toMatchObject({ reason: "forfeit" });
    expect(forfeited.winner?.playerIds).not.toContain(other.id);

    const tampered = structuredClone(game);
    tampered.market["1"]!.push(tampered.decks["1"]![0]!);
    expect(() => assertRestorableSplendorGameState(tampered)).toThrow();
    const metadataTampered = structuredClone(game);
    metadataTampered.market["1"]![0]!.points += 99;
    expect(() => assertRestorableSplendorGameState(metadataTampered)).toThrow();
  });

  it("rejects tampered finished winner snapshots", () => {
    const game = createSplendorGame({ kind: "splendor", players, seed: SEED });
    const forfeitingPlayer = game.players.find((player) => player.id !== game.currentPlayerId)!;
    const finished = forfeitSplendorPlayer(game, forfeitingPlayer.id);
    expect(() => assertRestorableSplendorGameState(finished)).not.toThrow();

    const ghostWinner = structuredClone(finished);
    ghostWinner.winner!.playerIds.splice(
      0,
      ghostWinner.winner!.playerIds.length,
      "ghost-player",
    );
    expect(() => assertRestorableSplendorGameState(ghostWinner)).toThrow();

    const duplicateWinner = structuredClone(finished);
    duplicateWinner.winner!.playerIds.splice(
      0,
      duplicateWinner.winner!.playerIds.length,
      duplicateWinner.winner!.playerIds[0]!,
      duplicateWinner.winner!.playerIds[0]!,
    );
    expect(() => assertRestorableSplendorGameState(duplicateWinner)).toThrow();

    const nullRankings = structuredClone(finished);
    (nullRankings.winner as unknown as { rankings: unknown }).rankings = null;
    expect(() => assertRestorableSplendorGameState(nullRankings)).toThrow();

    const reorderedRankings = structuredClone(finished);
    reorderedRankings.winner!.rankings.reverse();
    expect(() => assertRestorableSplendorGameState(reorderedRankings)).toThrow();

    const tamperedScore = structuredClone(finished);
    tamperedScore.winner!.rankings[0]!.score += 1;
    expect(() => assertRestorableSplendorGameState(tamperedScore)).toThrow();

    const invalidReason = structuredClone(finished);
    (invalidReason.winner as unknown as { reason: unknown }).reason = "draw";
    expect(() => assertRestorableSplendorGameState(invalidReason)).toThrow();
  });

  it("runs both rule bots to a legal terminal state", () => {
    for (const kind of ["splendor", "splendor_pokemon"] as const) {
      let game = createSplendorGame({ kind, players, seed: "ab".repeat(32) });
      for (let step = 0; step < 1_000 && game.status === "playing"; step += 1) {
        const before = game.revision;
        game = applySplendorAction(game, chooseSplendorBotAction(game, game.currentPlayerId));
        expect(game.revision).toBe(before + 1);
      }
      expect(game.status).toBe("finished");
      expect(game.winner?.playerIds.length).toBeGreaterThan(0);
      expect(() => assertRestorableSplendorGameState(game)).not.toThrow();
    }
  });
});
