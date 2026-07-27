import {
  applyDigitBombAction,
  applyNumberConnectAction,
  applySplendorAction,
  chooseDigitBombBotAction,
  chooseSplendorBotAction,
  createDigitBombGame,
  createNumberConnectGame,
  createSplendorGame,
  forfeitDigitBombPlayer,
  forfeitNumberConnectPlayer,
  forfeitSplendorPlayer,
  getDigitBombGameView,
  getNumberConnectGameView,
  getSplendorGameView,
  type DigitBombAction,
  type DigitBombGameState,
  type DigitBombGameView,
  type NumberConnectAction,
  type NumberConnectGameState,
  type NumberConnectGameView,
  type SplendorAction,
  type SplendorGameKind,
  type SplendorGameState,
  type SplendorGameView,
} from "@sanguosha/shared";
import type { BotIntelligence } from "./bot-intelligence.js";

export type GameType =
  | "sanguosha"
  | "gouji"
  | "doudizhu"
  | SplendorGameKind
  | "digit_bomb"
  | "number_connect";
export type AdapterGameState =
  | SplendorGameState
  | DigitBombGameState
  | NumberConnectGameState;
export type AdapterAction = SplendorAction | DigitBombAction | NumberConnectAction;
export type AdapterGameView =
  | SplendorGameView
  | DigitBombGameView
  | NumberConnectGameView;

export interface GameTypeMetadata {
  readonly minimumPlayers: number;
  readonly maximumPlayers: number;
  readonly defaultMaximumPlayers: number;
  readonly fixedPlayerCount: boolean;
  readonly supportsRuleBots: boolean;
  readonly supportsLlmBots: boolean;
}

export const GAME_TYPE_METADATA = {
  sanguosha: {
    minimumPlayers: 2,
    maximumPlayers: 10,
    defaultMaximumPlayers: 8,
    fixedPlayerCount: false,
    supportsRuleBots: true,
    supportsLlmBots: true,
  },
  gouji: {
    minimumPlayers: 6,
    maximumPlayers: 6,
    defaultMaximumPlayers: 6,
    fixedPlayerCount: true,
    supportsRuleBots: true,
    supportsLlmBots: false,
  },
  doudizhu: {
    minimumPlayers: 3,
    maximumPlayers: 3,
    defaultMaximumPlayers: 3,
    fixedPlayerCount: true,
    supportsRuleBots: true,
    supportsLlmBots: true,
  },
  splendor: {
    minimumPlayers: 2,
    maximumPlayers: 4,
    defaultMaximumPlayers: 4,
    fixedPlayerCount: false,
    supportsRuleBots: true,
    supportsLlmBots: false,
  },
  splendor_pokemon: {
    minimumPlayers: 2,
    maximumPlayers: 4,
    defaultMaximumPlayers: 4,
    fixedPlayerCount: false,
    supportsRuleBots: true,
    supportsLlmBots: false,
  },
  digit_bomb: {
    minimumPlayers: 2,
    maximumPlayers: 2,
    defaultMaximumPlayers: 2,
    fixedPlayerCount: true,
    supportsRuleBots: true,
    supportsLlmBots: false,
  },
  number_connect: {
    minimumPlayers: 2,
    maximumPlayers: 2,
    defaultMaximumPlayers: 2,
    fixedPlayerCount: true,
    supportsRuleBots: false,
    supportsLlmBots: false,
  },
} as const satisfies Record<GameType, GameTypeMetadata>;

export function gameTypeMetadata(gameType: GameType): GameTypeMetadata {
  return GAME_TYPE_METADATA[gameType];
}

export function isSplendorGameType(gameType: GameType): gameType is SplendorGameKind {
  return gameType === "splendor" || gameType === "splendor_pokemon";
}

export function isAdapterGameType(
  gameType: GameType,
): gameType is SplendorGameKind | "digit_bomb" | "number_connect" {
  return isSplendorGameType(gameType) ||
    gameType === "digit_bomb" ||
    gameType === "number_connect";
}

export function isSplendorGame(game: unknown): game is SplendorGameState {
  if (!game || typeof game !== "object" || !("kind" in game)) return false;
  return game.kind === "splendor" || game.kind === "splendor_pokemon";
}

export function isDigitBombGame(game: unknown): game is DigitBombGameState {
  return Boolean(
    game &&
    typeof game === "object" &&
    "kind" in game &&
    game.kind === "digit_bomb",
  );
}

export function isNumberConnectGame(game: unknown): game is NumberConnectGameState {
  return Boolean(
    game &&
    typeof game === "object" &&
    "kind" in game &&
    game.kind === "number_connect",
  );
}

export function isAdapterGame(game: unknown): game is AdapterGameState {
  return isSplendorGame(game) || isDigitBombGame(game) || isNumberConnectGame(game);
}

const SPLENDOR_ACTION_TYPES: ReadonlySet<SplendorAction["type"]> = new Set([
  "splendor_take",
  "splendor_buy",
  "splendor_reserve",
  "splendor_return",
  "splendor_choose_noble",
  "splendor_evolve",
  "splendor_skip_evolution",
  "splendor_pass",
]);

export function isSplendorAction(
  action: { readonly type: string },
): action is SplendorAction {
  return SPLENDOR_ACTION_TYPES.has(action.type as SplendorAction["type"]);
}

const DIGIT_BOMB_ACTION_TYPES: ReadonlySet<DigitBombAction["type"]> = new Set([
  "digit_bomb_set_secret",
  "digit_bomb_guess",
  "digit_bomb_feedback",
  "digit_bomb_vote",
]);

export function isDigitBombAction(
  action: { readonly type: string },
): action is DigitBombAction {
  return DIGIT_BOMB_ACTION_TYPES.has(action.type as DigitBombAction["type"]);
}

export function isNumberConnectAction(
  action: { readonly type: string },
): action is NumberConnectAction {
  return action.type === "number_connect_call";
}

export function createAdapterGame(
  gameType: GameType,
  players: Array<{ readonly id: string; readonly name: string; readonly botTitle?: string }>,
  seed: string,
  options: { readonly digitBombDigits?: number } = {},
): AdapterGameState | undefined {
  if (isSplendorGameType(gameType)) {
    return createSplendorGame({ kind: gameType, players, seed });
  }
  if (gameType === "digit_bomb") {
    return createDigitBombGame({
      players,
      seed,
      digits: options.digitBombDigits ?? 4,
    });
  }
  if (gameType === "number_connect") {
    return createNumberConnectGame({ players, seed });
  }
  return undefined;
}

export function applyAdapterAction(
  game: AdapterGameState,
  action: AdapterAction,
): AdapterGameState {
  if (isDigitBombGame(game)) {
    if (!isDigitBombAction(action)) throw new Error("Digit Bomb action type mismatch");
    return applyDigitBombAction(game, action);
  }
  if (isNumberConnectGame(game)) {
    if (!isNumberConnectAction(action)) {
      throw new Error("Number Connect action type mismatch");
    }
    return applyNumberConnectAction(game, action);
  }
  if (!isSplendorAction(action)) throw new Error("Splendor action type mismatch");
  return applySplendorAction(game, action);
}

export function getAdapterGameView(
  game: AdapterGameState,
  viewerId: string,
): AdapterGameView {
  if (isDigitBombGame(game)) return getDigitBombGameView(game, viewerId);
  if (isNumberConnectGame(game)) return getNumberConnectGameView(game, viewerId);
  return getSplendorGameView(game, viewerId);
}

export function forfeitAdapterPlayer(
  game: AdapterGameState,
  playerId: string,
): AdapterGameState {
  if (isDigitBombGame(game)) return forfeitDigitBombPlayer(game, playerId);
  if (isNumberConnectGame(game)) return forfeitNumberConnectPlayer(game, playerId);
  return forfeitSplendorPlayer(game, playerId);
}

export function chooseAdapterBotAction(
  game: AdapterGameState,
  playerId: string,
  _intelligence: BotIntelligence,
): AdapterAction {
  if (isDigitBombGame(game)) return chooseDigitBombBotAction(game, playerId);
  if (isNumberConnectGame(game)) {
    throw new Error("Number Connect does not support bots");
  }
  return chooseSplendorBotAction(game, playerId);
}
