import { randomInteger, type ChaCha20State } from "./prng.js";
import {
  createClassicCards,
  createClassicNobles,
  createPokemonCards,
} from "./splendor-data.js";

export const SPLENDOR_CLASSIC_COLORS = ["white", "blue", "green", "red", "black"] as const;
export const SPLENDOR_POKEMON_COLORS = ["red", "blue", "black", "pink", "yellow"] as const;
export type SplendorClassicColor = (typeof SPLENDOR_CLASSIC_COLORS)[number];
export type SplendorPokemonColor = (typeof SPLENDOR_POKEMON_COLORS)[number];
export type SplendorWildColor = "gold" | "purple";
export type SplendorColor = SplendorClassicColor | SplendorPokemonColor | SplendorWildColor;
export type SplendorGameKind = "splendor" | "splendor_pokemon";
export type SplendorCardLevel = 1 | 2 | 3 | "rare" | "legendary";

export interface SplendorPlayerInput {
  readonly id: string;
  readonly name: string;
  readonly botTitle?: string;
}

export type SplendorResourceMap = Partial<Record<SplendorColor, number>>;

export interface SplendorCard {
  readonly id: string;
  readonly name: string;
  readonly level: SplendorCardLevel;
  readonly points: number;
  readonly cost: SplendorResourceMap;
  readonly bonus: SplendorColor;
  readonly bonusCount: number;
  readonly evolutionOf?: string;
  readonly evolutionReq?: SplendorResourceMap;
}

export interface SplendorNoble {
  readonly id: string;
  readonly points: 3;
  readonly requirement: SplendorResourceMap;
}

export interface SplendorReservedCard {
  readonly card: SplendorCard;
  readonly hidden: boolean;
}

export interface SplendorPlayerState {
  readonly id: string;
  readonly seat: number;
  readonly name: string;
  readonly botTitle?: string;
  tokens: SplendorResourceMap;
  bonuses: SplendorResourceMap;
  cards: SplendorCard[];
  evolvedCards: SplendorCard[];
  reserved: SplendorReservedCard[];
  nobles: SplendorNoble[];
  score: number;
  evolutionCount: number;
}

export type SplendorPhase = "main" | "return" | "choose_noble" | "evolution" | "finished";

export interface SplendorWinner {
  readonly playerIds: string[];
  readonly reason: "score" | "forfeit";
  readonly rankings: Array<{
    readonly playerId: string;
    readonly score: number;
    readonly developmentCardCount: number;
    readonly evolutionCount: number;
  }>;
}

export interface SplendorGameState {
  readonly kind: SplendorGameKind;
  readonly version: 1;
  revision: number;
  status: "playing" | "finished";
  phase: SplendorPhase;
  players: SplendorPlayerState[];
  currentPlayerId: string;
  firstPlayerId: string;
  tokenSupply: SplendorResourceMap;
  decks: Record<string, SplendorCard[]>;
  market: Record<string, SplendorCard[]>;
  nobles: SplendorNoble[];
  finalRoundTriggered: boolean;
  finalRoundTriggerPlayerId: string | null;
  pendingReturnCount: number;
  pendingNobleIds: string[];
  evolutionUsedThisTurn: boolean;
  winner: SplendorWinner | null;
  rng: ChaCha20State;
}

export type SplendorAction =
  | { readonly type: "splendor_take"; readonly playerId: string; readonly colors: SplendorColor[] }
  | { readonly type: "splendor_buy"; readonly playerId: string; readonly cardId: string }
  | {
      readonly type: "splendor_reserve";
      readonly playerId: string;
      readonly cardId?: string;
      readonly level?: SplendorCardLevel;
    }
  | { readonly type: "splendor_return"; readonly playerId: string; readonly colors: SplendorColor[] }
  | { readonly type: "splendor_choose_noble"; readonly playerId: string; readonly nobleId: string }
  | {
      readonly type: "splendor_evolve";
      readonly playerId: string;
      readonly fromCardId: string;
      readonly toCardId: string;
    }
  | { readonly type: "splendor_skip_evolution"; readonly playerId: string }
  | { readonly type: "splendor_pass"; readonly playerId: string };

export interface SplendorTakeOption {
  readonly colors: SplendorColor[];
}

export interface SplendorEvolutionOption {
  readonly fromCardId: string;
  readonly toCardId: string;
}

export type SplendorPrompt =
  | {
      readonly type: "take" | "buy" | "reserve";
      readonly playerId: string;
      readonly takeOptions: SplendorTakeOption[];
      readonly buyCardIds: string[];
      readonly reserveCardIds: string[];
      readonly reserveDeckLevels: SplendorCardLevel[];
      readonly evolutionOptions: SplendorEvolutionOption[];
      readonly canPass: boolean;
    }
  | {
      readonly type: "return";
      readonly playerId: string;
      readonly count: number;
      readonly available: SplendorResourceMap;
    }
  | {
      readonly type: "choose_noble";
      readonly playerId: string;
      readonly nobleIds: string[];
    }
  | {
      readonly type: "evolution";
      readonly playerId: string;
      readonly options: SplendorEvolutionOption[];
      readonly canSkip: true;
    }
  | { readonly type: "waiting"; readonly playerId: string }
  | { readonly type: "finished"; readonly playerId: null };

export interface SplendorPlayerView {
  readonly id: string;
  readonly seat: number;
  readonly name: string;
  readonly botTitle?: string;
  readonly tokens: SplendorResourceMap;
  readonly bonuses: SplendorResourceMap;
  readonly cards: SplendorCard[];
  readonly evolvedCards: SplendorCard[];
  readonly reservedCount: number;
  readonly reservedCards?: SplendorCard[];
  readonly publicReservedCards: SplendorCard[];
  readonly nobles: SplendorNoble[];
  readonly score: number;
  readonly evolutionCount: number;
}

export interface SplendorGameView {
  readonly kind: SplendorGameKind;
  readonly version: 1;
  readonly revision: number;
  readonly actionPromptId: string;
  readonly status: "playing" | "finished";
  readonly phase: SplendorPhase;
  readonly currentPlayerId: string;
  readonly players: SplendorPlayerView[];
  readonly tokenSupply: SplendorResourceMap;
  readonly market: Record<string, SplendorCard[]>;
  readonly deckCounts: Record<string, number>;
  readonly nobles: SplendorNoble[];
  readonly finalRoundTriggered: boolean;
  readonly winner: SplendorWinner | null;
  readonly prompt: SplendorPrompt;
}

export type SplendorRuleErrorCode =
  | "SPLENDOR_GAME_FINISHED"
  | "SPLENDOR_UNKNOWN_PLAYER"
  | "SPLENDOR_NOT_YOUR_TURN"
  | "SPLENDOR_INVALID_PHASE"
  | "SPLENDOR_INVALID_SELECTION"
  | "SPLENDOR_UNAVAILABLE"
  | "SPLENDOR_TOKEN_LIMIT"
  | "SPLENDOR_RESERVED_LIMIT"
  | "SPLENDOR_CANNOT_AFFORD";

export class SplendorRuleError extends Error {
  constructor(readonly code: SplendorRuleErrorCode, message: string) {
    super(message);
    this.name = "SplendorRuleError";
  }
}

const TOKEN_LIMIT = 10;
const RESERVED_LIMIT = 3;
const POKEMON_SPECIAL_LEVELS: SplendorCardLevel[] = ["rare", "legendary"];

function activeColors(kind: SplendorGameKind): readonly SplendorColor[] {
  return kind === "splendor" ? SPLENDOR_CLASSIC_COLORS : SPLENDOR_POKEMON_COLORS;
}

function wildColor(kind: SplendorGameKind): SplendorWildColor {
  return kind === "splendor" ? "gold" : "purple";
}

function marketLevels(kind: SplendorGameKind): SplendorCardLevel[] {
  return kind === "splendor" ? [1, 2, 3] : [1, 2, 3, "rare", "legendary"];
}

function marketLimit(level: SplendorCardLevel): number {
  return POKEMON_SPECIAL_LEVELS.includes(level) ? 1 : 4;
}

function amount(map: SplendorResourceMap, color: SplendorColor): number {
  return map[color] ?? 0;
}

function addAmount(map: SplendorResourceMap, color: SplendorColor, delta: number): void {
  const next = amount(map, color) + delta;
  if (next === 0) delete map[color];
  else map[color] = next;
}

function totalTokens(player: SplendorPlayerState): number {
  return Object.values(player.tokens).reduce((total, value) => total + (value ?? 0), 0);
}

function createResourceMap(colors: readonly SplendorColor[]): SplendorResourceMap {
  return Object.fromEntries(colors.map((color) => [color, 0])) as SplendorResourceMap;
}

function shuffle<T>(items: readonly T[], state: ChaCha20State): { items: T[]; rng: ChaCha20State } {
  const result = [...items];
  let rng = state;
  for (let index = result.length - 1; index > 0; index -= 1) {
    const drawn = randomInteger(rng, index + 1);
    rng = drawn.state;
    [result[index], result[drawn.value]] = [result[drawn.value]!, result[index]!];
  }
  return { items: result, rng };
}

function groupedAndShuffled(
  cards: readonly SplendorCard[],
  kind: SplendorGameKind,
  state: ChaCha20State,
): {
  decks: Record<string, SplendorCard[]>;
  market: Record<string, SplendorCard[]>;
  rng: ChaCha20State;
} {
  let rng = state;
  const decks: Record<string, SplendorCard[]> = {};
  const market: Record<string, SplendorCard[]> = {};
  for (const level of marketLevels(kind)) {
    const shuffled = shuffle(cards.filter((card) => card.level === level), rng);
    rng = shuffled.rng;
    market[String(level)] = shuffled.items.splice(0, marketLimit(level));
    decks[String(level)] = shuffled.items;
  }
  return { decks, market, rng };
}

export function createSplendorGame(input: {
  readonly kind: SplendorGameKind;
  readonly players: SplendorPlayerInput[];
  readonly seed: string;
}): SplendorGameState {
  if (input.players.length < 2 || input.players.length > 4) {
    throw new Error("璀璨宝石必须有 2 至 4 名玩家");
  }
  if (new Set(input.players.map((player) => player.id)).size !== input.players.length) {
    throw new Error("璀璨宝石玩家 id 不能重复");
  }
  if (!input.players.every((player) => player.id.length > 0 && player.name.length > 0)) {
    throw new Error("璀璨宝石玩家资料无效");
  }

  const cards = input.kind === "splendor" ? createClassicCards() : createPokemonCards();
  let rng: ChaCha20State = { key: input.seed.toLowerCase(), counter: 0 };
  const board = groupedAndShuffled(cards, input.kind, rng);
  rng = board.rng;
  let nobles: SplendorNoble[] = [];
  if (input.kind === "splendor") {
    const shuffledNobles = shuffle(createClassicNobles(), rng);
    rng = shuffledNobles.rng;
    nobles = shuffledNobles.items.slice(0, input.players.length + 1);
  }
  const first = randomInteger(rng, input.players.length);
  rng = first.state;
  const basicSupply = input.players.length === 2 ? 4 : input.players.length === 3 ? 5 : 7;
  const colors = activeColors(input.kind);
  const wild = wildColor(input.kind);
  const tokenSupply = createResourceMap([...colors, wild]);
  for (const color of colors) tokenSupply[color] = basicSupply;
  tokenSupply[wild] = 5;
  const players = input.players.map((player, seat): SplendorPlayerState => ({
    ...player,
    seat,
    tokens: createResourceMap([...colors, wild]),
    bonuses: createResourceMap([...colors, ...(input.kind === "splendor_pokemon" ? ["purple" as const] : [])]),
    cards: [],
    evolvedCards: [],
    reserved: [],
    nobles: [],
    score: 0,
    evolutionCount: 0,
  }));
  const firstPlayerId = players[first.value]!.id;
  return {
    kind: input.kind,
    version: 1,
    revision: 0,
    status: "playing",
    phase: "main",
    players,
    currentPlayerId: firstPlayerId,
    firstPlayerId,
    tokenSupply,
    decks: board.decks,
    market: board.market,
    nobles,
    finalRoundTriggered: false,
    finalRoundTriggerPlayerId: null,
    pendingReturnCount: 0,
    pendingNobleIds: [],
    evolutionUsedThisTurn: false,
    winner: null,
    rng,
  };
}

function assertTurn(game: SplendorGameState, playerId: string): SplendorPlayerState {
  if (game.status === "finished") {
    throw new SplendorRuleError("SPLENDOR_GAME_FINISHED", "本局已经结束");
  }
  const player = game.players.find((candidate) => candidate.id === playerId);
  if (!player) throw new SplendorRuleError("SPLENDOR_UNKNOWN_PLAYER", "玩家不在本局中");
  if (game.currentPlayerId !== playerId) {
    throw new SplendorRuleError("SPLENDOR_NOT_YOUR_TURN", "还没有轮到你");
  }
  return player;
}

function findMarketCard(game: SplendorGameState, cardId: string): SplendorCard | undefined {
  return Object.values(game.market).flat().find((card) => card.id === cardId);
}

function findPurchasableCard(
  game: SplendorGameState,
  player: SplendorPlayerState,
  cardId: string,
): { card: SplendorCard; source: "market" | "reserved" } | null {
  const marketCard = findMarketCard(game, cardId);
  if (marketCard) return { card: marketCard, source: "market" };
  const reserved = player.reserved.find((entry) => entry.card.id === cardId);
  return reserved ? { card: reserved.card, source: "reserved" } : null;
}

function paymentFor(
  game: SplendorGameState,
  player: SplendorPlayerState,
  card: SplendorCard,
): SplendorResourceMap | null {
  const payment: SplendorResourceMap = {};
  const wild = wildColor(game.kind);
  const fixedWildCost = amount(card.cost, wild);
  if (amount(player.tokens, wild) < fixedWildCost) return null;
  let remainingWild = amount(player.tokens, wild) - fixedWildCost;
  if (fixedWildCost > 0) payment[wild] = fixedWildCost;
  for (const color of activeColors(game.kind)) {
    const discounted = Math.max(0, amount(card.cost, color) - amount(player.bonuses, color));
    const colored = Math.min(discounted, amount(player.tokens, color));
    if (colored > 0) payment[color] = colored;
    const shortage = discounted - colored;
    if (shortage > remainingWild) return null;
    if (shortage > 0) {
      payment[wild] = amount(payment, wild) + shortage;
      remainingWild -= shortage;
    }
  }
  return payment;
}

function removeMarketCard(game: SplendorGameState, cardId: string): SplendorCard | null {
  for (const cards of Object.values(game.market)) {
    const index = cards.findIndex((card) => card.id === cardId);
    if (index >= 0) return cards.splice(index, 1)[0]!;
  }
  return null;
}

function refillMarket(game: SplendorGameState): void {
  for (const level of marketLevels(game.kind)) {
    const key = String(level);
    const cards = game.market[key]!;
    const deck = game.decks[key]!;
    while (cards.length < marketLimit(level) && deck.length > 0) {
      cards.push(deck.shift()!);
    }
  }
}

function eligibleNobles(
  game: SplendorGameState,
  player: SplendorPlayerState,
): SplendorNoble[] {
  return game.nobles.filter((noble) =>
    SPLENDOR_CLASSIC_COLORS.every(
      (color) => amount(player.bonuses, color) >= amount(noble.requirement, color),
    ),
  );
}

function availableEvolutions(
  game: SplendorGameState,
  player: SplendorPlayerState,
): SplendorEvolutionOption[] {
  if (game.kind !== "splendor_pokemon" || game.evolutionUsedThisTurn) return [];
  const targets = [
    ...Object.values(game.market).flat(),
    ...player.reserved.map((entry) => entry.card),
  ];
  const result: SplendorEvolutionOption[] = [];
  for (const target of targets) {
    if (!target.evolutionOf || !target.evolutionReq) continue;
    const from = player.cards.find((card) => card.name === target.evolutionOf);
    if (!from) continue;
    if (
      SPLENDOR_POKEMON_COLORS.every(
        (color) => amount(player.bonuses, color) >= amount(target.evolutionReq!, color),
      ) &&
      amount(player.bonuses, "purple") >= amount(target.evolutionReq, "purple")
    ) {
      result.push({ fromCardId: from.id, toCardId: target.id });
    }
  }
  return result;
}

function rankings(game: SplendorGameState): SplendorWinner["rankings"] {
  return game.players
    .map((player) => ({
      playerId: player.id,
      score: player.score,
      developmentCardCount: player.cards.length + player.evolvedCards.length,
      evolutionCount: player.evolutionCount,
    }))
    .sort((left, right) =>
      right.score - left.score ||
      (game.kind === "splendor"
        ? left.developmentCardCount - right.developmentCardCount
        : right.evolutionCount - left.evolutionCount) ||
      game.players.findIndex((player) => player.id === left.playerId) -
        game.players.findIndex((player) => player.id === right.playerId),
    );
}

function scoreWinnerIds(
  game: SplendorGameState,
  ordered: SplendorWinner["rankings"],
): string[] {
  const first = ordered[0]!;
  return ordered.filter((candidate) =>
    candidate.score === first.score &&
    (game.kind === "splendor"
      ? candidate.developmentCardCount === first.developmentCardCount
      : candidate.evolutionCount === first.evolutionCount),
  ).map((winner) => winner.playerId);
}

function finalizeByScore(game: SplendorGameState): void {
  const ordered = rankings(game);
  game.status = "finished";
  game.phase = "finished";
  game.winner = { reason: "score", playerIds: scoreWinnerIds(game, ordered), rankings: ordered };
  game.pendingReturnCount = 0;
  game.pendingNobleIds = [];
}

function nextPlayer(game: SplendorGameState, playerId: string): SplendorPlayerState {
  const index = game.players.findIndex((player) => player.id === playerId);
  return game.players[(index + 1) % game.players.length]!;
}

function finishTurn(game: SplendorGameState, player: SplendorPlayerState): void {
  const threshold = game.kind === "splendor" ? 15 : 18;
  if (!game.finalRoundTriggered && player.score >= threshold) {
    game.finalRoundTriggered = true;
    game.finalRoundTriggerPlayerId = player.id;
  }
  const next = nextPlayer(game, player.id);
  const shouldFinish = game.finalRoundTriggered && next.id === game.firstPlayerId;
  if (shouldFinish) {
    finalizeByScore(game);
    return;
  }
  game.currentPlayerId = next.id;
  game.phase = "main";
  game.pendingReturnCount = 0;
  game.pendingNobleIds = [];
  game.evolutionUsedThisTurn = false;
}

function completeMainAction(
  game: SplendorGameState,
  player: SplendorPlayerState,
  allowPokemonEvolution: boolean,
): void {
  const excess = Math.max(0, totalTokens(player) - TOKEN_LIMIT);
  if (excess > 0) {
    game.phase = "return";
    game.pendingReturnCount = excess;
    return;
  }
  if (game.kind === "splendor") {
    const eligible = eligibleNobles(game, player);
    if (eligible.length === 1) {
      const noble = eligible[0]!;
      game.nobles = game.nobles.filter((candidate) => candidate.id !== noble.id);
      player.nobles.push(noble);
      player.score += noble.points;
    } else if (eligible.length > 1) {
      game.phase = "choose_noble";
      game.pendingNobleIds = eligible.map((noble) => noble.id);
      return;
    }
    finishTurn(game, player);
    return;
  }
  const evolutions = allowPokemonEvolution ? availableEvolutions(game, player) : [];
  if (evolutions.length > 0) {
    game.phase = "evolution";
    return;
  }
  finishTurn(game, player);
}

function takeOptions(game: SplendorGameState): SplendorTakeOption[] {
  const available = activeColors(game.kind).filter((color) => amount(game.tokenSupply, color) > 0);
  const options: SplendorTakeOption[] = [];
  const required = Math.min(3, available.length);
  const choose = (start: number, picked: SplendorColor[]): void => {
    if (picked.length === required) {
      if (picked.length > 0) options.push({ colors: [...picked] });
      return;
    }
    for (let index = start; index < available.length; index += 1) {
      choose(index + 1, [...picked, available[index]!]);
    }
  };
  choose(0, []);
  for (const color of activeColors(game.kind)) {
    if (amount(game.tokenSupply, color) >= 4) options.push({ colors: [color, color] });
  }
  return options;
}

function mainOptions(game: SplendorGameState, player: SplendorPlayerState): {
  take: SplendorTakeOption[];
  buy: string[];
  reserveCards: string[];
  reserveDecks: SplendorCardLevel[];
  evolutions: SplendorEvolutionOption[];
  canPass: boolean;
} {
  const take = takeOptions(game);
  const buy = [
    ...Object.values(game.market).flat(),
    ...player.reserved.map((entry) => entry.card),
  ].filter((card) => paymentFor(game, player, card)).map((card) => card.id);
  const evolutions = availableEvolutions(game, player);
  const canReserve = player.reserved.length < RESERVED_LIMIT &&
    (game.kind === "splendor" || amount(game.tokenSupply, "purple") > 0);
  const reserveCards = canReserve ? Object.values(game.market).flat().map((card) => card.id) : [];
  const reserveDecks = canReserve
    ? marketLevels(game.kind).filter((level) => game.decks[String(level)]!.length > 0)
    : [];
  return {
    take,
    buy,
    reserveCards,
    reserveDecks,
    evolutions,
    canPass:
      take.length === 0 &&
      buy.length === 0 &&
      reserveCards.length === 0 &&
      reserveDecks.length === 0 &&
      evolutions.length === 0,
  };
}

export function applySplendorAction(
  state: SplendorGameState,
  action: SplendorAction,
): SplendorGameState {
  const game = structuredClone(state);
  const player = assertTurn(game, action.playerId);

  if (action.type === "splendor_take") {
    if (game.phase !== "main") {
      throw new SplendorRuleError("SPLENDOR_INVALID_PHASE", "当前不能拿取筹码");
    }
    const selectionKey = [...action.colors].sort().join("|");
    const legal = takeOptions(game).some(
      (option) => [...option.colors].sort().join("|") === selectionKey,
    );
    if (!legal) throw new SplendorRuleError("SPLENDOR_INVALID_SELECTION", "筹码组合不合法");
    for (const color of action.colors) {
      addAmount(game.tokenSupply, color, -1);
      addAmount(player.tokens, color, 1);
    }
    completeMainAction(game, player, false);
  } else if (action.type === "splendor_buy") {
    if (game.phase !== "main") {
      throw new SplendorRuleError("SPLENDOR_INVALID_PHASE", "本回合已经执行过主要行动");
    }
    const located = findPurchasableCard(game, player, action.cardId);
    if (!located) throw new SplendorRuleError("SPLENDOR_UNAVAILABLE", "找不到要购买的卡牌");
    const payment = paymentFor(game, player, located.card);
    if (!payment) throw new SplendorRuleError("SPLENDOR_CANNOT_AFFORD", "无法支付这张卡牌");
    for (const [color, count] of Object.entries(payment) as Array<[SplendorColor, number]>) {
      addAmount(player.tokens, color, -count);
      addAmount(game.tokenSupply, color, count);
    }
    if (located.source === "market") removeMarketCard(game, located.card.id);
    else player.reserved = player.reserved.filter((entry) => entry.card.id !== located.card.id);
    player.cards.push(located.card);
    addAmount(player.bonuses, located.card.bonus, located.card.bonusCount);
    player.score += located.card.points;
    refillMarket(game);
    completeMainAction(game, player, true);
  } else if (action.type === "splendor_reserve") {
    if (game.phase !== "main") {
      throw new SplendorRuleError("SPLENDOR_INVALID_PHASE", "本回合已经执行过主要行动");
    }
    if (player.reserved.length >= RESERVED_LIMIT) {
      throw new SplendorRuleError("SPLENDOR_RESERVED_LIMIT", "最多只能保留 3 张卡牌");
    }
    if (game.kind === "splendor_pokemon" && amount(game.tokenSupply, "purple") < 1) {
      throw new SplendorRuleError("SPLENDOR_UNAVAILABLE", "大师球已耗尽，不能预留宝可梦");
    }
    if ((action.cardId === undefined) === (action.level === undefined)) {
      throw new SplendorRuleError("SPLENDOR_INVALID_SELECTION", "必须选择一张公开卡或一个牌堆");
    }
    let card: SplendorCard | undefined;
    let hidden = false;
    if (action.cardId !== undefined) {
      card = removeMarketCard(game, action.cardId) ?? undefined;
    } else if (action.level !== undefined) {
      const deck = game.decks[String(action.level)];
      if (!deck || deck.length === 0) {
        throw new SplendorRuleError("SPLENDOR_UNAVAILABLE", "所选牌堆已经为空");
      }
      card = deck.shift();
      hidden = true;
    }
    if (!card) throw new SplendorRuleError("SPLENDOR_UNAVAILABLE", "找不到要保留的卡牌");
    player.reserved.push({ card, hidden });
    const wild = wildColor(game.kind);
    if (amount(game.tokenSupply, wild) > 0) {
      addAmount(game.tokenSupply, wild, -1);
      addAmount(player.tokens, wild, 1);
    }
    refillMarket(game);
    completeMainAction(game, player, false);
  } else if (action.type === "splendor_return") {
    if (game.phase !== "return") {
      throw new SplendorRuleError("SPLENDOR_INVALID_PHASE", "当前不需要返还筹码");
    }
    if (
      action.colors.length !== game.pendingReturnCount ||
      action.colors.some((color) => amount(player.tokens, color) <
        action.colors.filter((candidate) => candidate === color).length)
    ) {
      throw new SplendorRuleError("SPLENDOR_INVALID_SELECTION", "返还筹码数量或颜色不合法");
    }
    for (const color of action.colors) {
      if (![...activeColors(game.kind), wildColor(game.kind)].includes(color)) {
        throw new SplendorRuleError("SPLENDOR_INVALID_SELECTION", "不能返还这种筹码");
      }
      addAmount(player.tokens, color, -1);
      addAmount(game.tokenSupply, color, 1);
    }
    game.pendingReturnCount = 0;
    if (game.kind === "splendor_pokemon") finishTurn(game, player);
    else completeMainAction(game, player, false);
  } else if (action.type === "splendor_choose_noble") {
    if (game.phase !== "choose_noble" || !game.pendingNobleIds.includes(action.nobleId)) {
      throw new SplendorRuleError("SPLENDOR_INVALID_PHASE", "当前不能选择这位贵族");
    }
    const noble = game.nobles.find((candidate) => candidate.id === action.nobleId);
    if (!noble) throw new SplendorRuleError("SPLENDOR_UNAVAILABLE", "贵族已经离开");
    game.nobles = game.nobles.filter((candidate) => candidate.id !== noble.id);
    player.nobles.push(noble);
    player.score += noble.points;
    game.pendingNobleIds = [];
    finishTurn(game, player);
  } else if (action.type === "splendor_evolve") {
    if (
      (game.phase !== "main" && game.phase !== "evolution") ||
      game.kind !== "splendor_pokemon"
    ) {
      throw new SplendorRuleError("SPLENDOR_INVALID_PHASE", "当前不能进化");
    }
    const legal = availableEvolutions(game, player).some(
      (option) =>
        option.fromCardId === action.fromCardId && option.toCardId === action.toCardId,
    );
    if (!legal) throw new SplendorRuleError("SPLENDOR_INVALID_SELECTION", "所选进化不合法");
    const from = player.cards.find((card) => card.id === action.fromCardId)!;
    const marketTarget = findMarketCard(game, action.toCardId);
    const reservedTarget = player.reserved.find((entry) => entry.card.id === action.toCardId);
    const target = marketTarget ?? reservedTarget?.card;
    if (!target) throw new SplendorRuleError("SPLENDOR_UNAVAILABLE", "进化目标已经离开");
    player.cards = player.cards.filter((card) => card.id !== from.id);
    player.evolvedCards.push(from);
    addAmount(player.bonuses, from.bonus, -from.bonusCount);
    if (marketTarget) removeMarketCard(game, target.id);
    else player.reserved = player.reserved.filter((entry) => entry.card.id !== target.id);
    player.cards.push(target);
    addAmount(player.bonuses, target.bonus, target.bonusCount);
    player.score += target.points;
    player.evolutionCount += 1;
    game.evolutionUsedThisTurn = true;
    refillMarket(game);
    finishTurn(game, player);
  } else if (action.type === "splendor_skip_evolution") {
    if (game.phase !== "evolution" || game.kind !== "splendor_pokemon") {
      throw new SplendorRuleError("SPLENDOR_INVALID_PHASE", "当前没有可跳过的进化阶段");
    }
    finishTurn(game, player);
  } else {
    if (game.phase !== "main" || !mainOptions(game, player).canPass) {
      throw new SplendorRuleError("SPLENDOR_INVALID_PHASE", "仍有其他合法行动时不能跳过");
    }
    completeMainAction(game, player, false);
  }
  game.revision += 1;
  return game;
}

export function splendorActionPromptId(game: SplendorGameState): string {
  return `${game.kind}:${game.revision}:${game.phase}:${game.currentPlayerId}`;
}

function promptFor(game: SplendorGameState, viewerId: string | null): SplendorPrompt {
  if (game.status === "finished") return { type: "finished", playerId: null };
  if (viewerId !== game.currentPlayerId) return { type: "waiting", playerId: game.currentPlayerId };
  const player = game.players.find((candidate) => candidate.id === viewerId)!;
  if (game.phase === "return") {
    return {
      type: "return",
      playerId: player.id,
      count: game.pendingReturnCount,
      available: structuredClone(player.tokens),
    };
  }
  if (game.phase === "choose_noble") {
    return { type: "choose_noble", playerId: player.id, nobleIds: [...game.pendingNobleIds] };
  }
  if (game.phase === "evolution") {
    return {
      type: "evolution",
      playerId: player.id,
      options: availableEvolutions(game, player),
      canSkip: true,
    };
  }
  const options = mainOptions(game, player);
  const type = options.buy.length > 0 ? "buy" : options.take.length > 0 ? "take" : "reserve";
  return {
    type,
    playerId: player.id,
    takeOptions: options.take,
    buyCardIds: options.buy,
    reserveCardIds: options.reserveCards,
    reserveDeckLevels: options.reserveDecks,
    evolutionOptions: options.evolutions,
    canPass: options.canPass,
  };
}

export function getSplendorGameView(
  game: SplendorGameState,
  viewerId: string | null,
): SplendorGameView {
  if (viewerId !== null && !game.players.some((player) => player.id === viewerId)) {
    throw new SplendorRuleError("SPLENDOR_UNKNOWN_PLAYER", "玩家不在本局中");
  }
  return {
    kind: game.kind,
    version: 1,
    revision: game.revision,
    actionPromptId: splendorActionPromptId(game),
    status: game.status,
    phase: game.phase,
    currentPlayerId: game.currentPlayerId,
    players: game.players.map((player) => ({
      id: player.id,
      seat: player.seat,
      name: player.name,
      ...(player.botTitle ? { botTitle: player.botTitle } : {}),
      tokens: structuredClone(player.tokens),
      bonuses: structuredClone(player.bonuses),
      cards: structuredClone(player.cards),
      evolvedCards: structuredClone(player.evolvedCards),
      reservedCount: player.reserved.length,
      ...(player.id === viewerId
        ? { reservedCards: player.reserved.map((entry) => structuredClone(entry.card)) }
        : {}),
      publicReservedCards: player.reserved
        .filter((entry) => !entry.hidden)
        .map((entry) => structuredClone(entry.card)),
      nobles: structuredClone(player.nobles),
      score: player.score,
      evolutionCount: player.evolutionCount,
    })),
    tokenSupply: structuredClone(game.tokenSupply),
    market: structuredClone(game.market),
    deckCounts: Object.fromEntries(
      Object.entries(game.decks).map(([level, cards]) => [level, cards.length]),
    ),
    nobles: structuredClone(game.nobles),
    finalRoundTriggered: game.finalRoundTriggered,
    winner: game.winner ? structuredClone(game.winner) : null,
    prompt: promptFor(game, viewerId),
  };
}

export function chooseSplendorBotAction(
  game: SplendorGameState,
  playerId: string,
): SplendorAction {
  const player = assertTurn(game, playerId);
  if (game.phase === "return") {
    const colors = [...activeColors(game.kind), wildColor(game.kind)]
      .flatMap((color) => Array.from({ length: amount(player.tokens, color) }, () => color))
      .sort((left, right) => amount(player.tokens, right) - amount(player.tokens, left))
      .slice(0, game.pendingReturnCount);
    return { type: "splendor_return", playerId, colors };
  }
  if (game.phase === "choose_noble") {
    return { type: "splendor_choose_noble", playerId, nobleId: game.pendingNobleIds[0]! };
  }
  if (game.phase === "evolution") {
    const best = availableEvolutions(game, player).sort((left, right) => {
      const leftCard = findPurchasableCard(game, player, left.toCardId)?.card;
      const rightCard = findPurchasableCard(game, player, right.toCardId)?.card;
      return (rightCard?.points ?? 0) - (leftCard?.points ?? 0);
    })[0];
    return best
      ? { type: "splendor_evolve", playerId, ...best }
      : { type: "splendor_skip_evolution", playerId };
  }
  const options = mainOptions(game, player);
  const bestEvolution = [...options.evolutions].sort((left, right) => {
    const leftCard = findPurchasableCard(game, player, left.toCardId)?.card;
    const rightCard = findPurchasableCard(game, player, right.toCardId)?.card;
    return (rightCard?.points ?? 0) - (leftCard?.points ?? 0);
  })[0];
  if (bestEvolution) return { type: "splendor_evolve", playerId, ...bestEvolution };
  const bestBuy = options.buy
    .map((cardId) => findPurchasableCard(game, player, cardId)!.card)
    .sort((left, right) => right.points - left.points || right.bonusCount - left.bonusCount)[0];
  if (bestBuy) return { type: "splendor_buy", playerId, cardId: bestBuy.id };
  if (options.take.length > 0) {
    const target = Object.values(game.market).flat()
      .sort((left, right) => right.points - left.points)[0];
    const bestTake = [...options.take].sort((left, right) => {
      const score = (option: SplendorTakeOption) => option.colors.reduce(
        (total, color) => total + (target ? amount(target.cost, color) : 1),
        0,
      );
      return score(right) - score(left);
    })[0]!;
    return { type: "splendor_take", playerId, colors: [...bestTake.colors] };
  }
  if (options.reserveCards.length > 0) {
    const card = options.reserveCards.map((id) => findMarketCard(game, id)!)
      .sort((left, right) => right.points - left.points)[0]!;
    return { type: "splendor_reserve", playerId, cardId: card.id };
  }
  if (options.reserveDecks.length > 0) {
    return { type: "splendor_reserve", playerId, level: options.reserveDecks[0] };
  }
  return { type: "splendor_pass", playerId };
}

export function forfeitSplendorPlayer(
  state: SplendorGameState,
  playerId: string,
): SplendorGameState {
  const game = structuredClone(state);
  if (game.status === "finished") return game;
  if (!game.players.some((player) => player.id === playerId)) {
    throw new SplendorRuleError("SPLENDOR_UNKNOWN_PLAYER", "玩家不在本局中");
  }
  const ordered = rankings(game);
  game.status = "finished";
  game.phase = "finished";
  game.pendingReturnCount = 0;
  game.pendingNobleIds = [];
  game.winner = {
    reason: "forfeit",
    playerIds: game.players.filter((player) => player.id !== playerId).map((player) => player.id),
    rankings: ordered,
  };
  game.revision += 1;
  return game;
}

function assertResourceMap(
  map: unknown,
  colors: readonly SplendorColor[],
  label: string,
): asserts map is SplendorResourceMap {
  if (!map || typeof map !== "object" || Array.isArray(map)) throw new Error(`${label}无效`);
  for (const [color, value] of Object.entries(map)) {
    if (!colors.includes(color as SplendorColor) || !Number.isSafeInteger(value) || (value as number) < 0) {
      throw new Error(`${label}无效`);
    }
  }
}

export function assertRestorableSplendorGameState(
  value: unknown,
): asserts value is SplendorGameState {
  if (!value || typeof value !== "object") throw new Error("璀璨宝石存档不是对象");
  const game = value as Partial<SplendorGameState>;
  if ((game.kind !== "splendor" && game.kind !== "splendor_pokemon") || game.version !== 1) {
    throw new Error("璀璨宝石存档版本无效");
  }
  if (!Number.isSafeInteger(game.revision) || game.revision! < 0) throw new Error("璀璨宝石修订号无效");
  if (
    !Number.isSafeInteger(game.pendingReturnCount) ||
    game.pendingReturnCount! < 0 ||
    !Array.isArray(game.pendingNobleIds)
  ) {
    throw new Error("璀璨宝石待处理状态无效");
  }
  if (!Array.isArray(game.players) || game.players.length < 2 || game.players.length > 4) {
    throw new Error("璀璨宝石玩家数量无效");
  }
  if (new Set(game.players.map((player) => player?.id)).size !== game.players.length) {
    throw new Error("璀璨宝石玩家 id 重复");
  }
  const colors = [...activeColors(game.kind), wildColor(game.kind)];
  assertResourceMap(game.tokenSupply, colors, "璀璨宝石供应区");
  const expectedCards = new Map(
    (game.kind === "splendor" ? createClassicCards() : createPokemonCards())
      .map((card) => [card.id, card]),
  );
  const expectedNobles = new Map(createClassicNobles().map((noble) => [noble.id, noble]));
  const cardIds = new Set<string>();
  const nobleIds = new Set<string>();
  const registerCard = (card: SplendorCard): void => {
    const canonical = card && typeof card.id === "string" ? expectedCards.get(card.id) : undefined;
    if (
      !canonical ||
      cardIds.has(card.id) ||
      JSON.stringify(card) !== JSON.stringify(canonical)
    ) {
      throw new Error("璀璨宝石卡牌 id 重复");
    }
    cardIds.add(card.id);
  };
  const registerNoble = (noble: SplendorNoble): void => {
    const canonical = noble && typeof noble.id === "string" ? expectedNobles.get(noble.id) : undefined;
    if (
      !canonical ||
      nobleIds.has(noble.id) ||
      JSON.stringify(noble) !== JSON.stringify(canonical)
    ) {
      throw new Error("璀璨宝石贵族 id 重复");
    }
    nobleIds.add(noble.id);
  };
  if (!game.decks || !game.market) throw new Error("璀璨宝石牌桌无效");
  for (const level of marketLevels(game.kind)) {
    const deck = game.decks[String(level)];
    const market = game.market[String(level)];
    if (!Array.isArray(deck) || !Array.isArray(market) || market.length > marketLimit(level)) {
      throw new Error("璀璨宝石牌堆或市场无效");
    }
    if ([...deck, ...market].some((card) => card.level !== level)) {
      throw new Error("璀璨宝石卡牌所在等级无效");
    }
    deck.forEach(registerCard);
    market.forEach(registerCard);
  }
  if (!Array.isArray(game.nobles)) throw new Error("璀璨宝石贵族状态无效");
  game.nobles.forEach(registerNoble);
  for (const player of game.players) {
    if (
      !player ||
      typeof player.id !== "string" ||
      !Number.isSafeInteger(player.seat) ||
      !Array.isArray(player.cards) ||
      !Array.isArray(player.evolvedCards) ||
      !Array.isArray(player.reserved) ||
      !Array.isArray(player.nobles) ||
      player.reserved.length > RESERVED_LIMIT ||
      !Number.isSafeInteger(player.score) ||
      player.score < 0 ||
      !Number.isSafeInteger(player.evolutionCount) ||
      player.evolutionCount < 0
    ) {
      throw new Error("璀璨宝石玩家状态无效");
    }
    assertResourceMap(player.tokens, colors, "璀璨宝石玩家筹码");
    assertResourceMap(player.bonuses, game.kind === "splendor" ? SPLENDOR_CLASSIC_COLORS : [...POKEMON_COLORS_WITH_PURPLE], "璀璨宝石玩家奖励");
    player.cards.forEach(registerCard);
    player.evolvedCards.forEach(registerCard);
    player.reserved.forEach((entry) => {
      if (!entry || typeof entry.hidden !== "boolean") throw new Error("璀璨宝石保留牌无效");
      registerCard(entry.card);
    });
    player.nobles.forEach(registerNoble);
    if (player.evolutionCount !== player.evolvedCards.length) {
      throw new Error("璀璨宝石进化次数无效");
    }
    const expectedBonuses: SplendorResourceMap = {};
    player.cards.forEach((card) => addAmount(expectedBonuses, card.bonus, card.bonusCount));
    for (const color of game.kind === "splendor" ? SPLENDOR_CLASSIC_COLORS : POKEMON_COLORS_WITH_PURPLE) {
      if (amount(expectedBonuses, color) !== amount(player.bonuses, color)) {
        throw new Error("璀璨宝石玩家奖励与卡牌不一致");
      }
    }
    const expectedScore = [...player.cards, ...player.evolvedCards]
      .reduce((sum, card) => sum + card.points, 0) +
      player.nobles.reduce((sum, noble) => sum + noble.points, 0);
    if (player.score !== expectedScore) throw new Error("璀璨宝石玩家分数无效");
  }
  if (
    cardIds.size !== expectedCards.size ||
    [...cardIds].some((cardId) => !expectedCards.has(cardId))
  ) {
    throw new Error("璀璨宝石卡牌集合不完整");
  }
  if (
    game.kind === "splendor"
      ? nobleIds.size !== game.players.length + 1
      : nobleIds.size !== 0
  ) {
    throw new Error("璀璨宝石贵族集合不完整");
  }
  const basicSupply = game.players.length === 2 ? 4 : game.players.length === 3 ? 5 : 7;
  for (const color of activeColors(game.kind)) {
    const total = amount(game.tokenSupply, color) +
      game.players.reduce((sum, player) => sum + amount(player.tokens, color), 0);
    if (total !== basicSupply) throw new Error("璀璨宝石筹码总量无效");
  }
  const wild = wildColor(game.kind);
  if (
    amount(game.tokenSupply, wild) +
      game.players.reduce((sum, player) => sum + amount(player.tokens, wild), 0) !== 5
  ) {
    throw new Error("璀璨宝石万能筹码总量无效");
  }
  if (
    typeof game.currentPlayerId !== "string" ||
    !game.players.some((player) => player.id === game.currentPlayerId) ||
    typeof game.firstPlayerId !== "string" ||
    !game.players.some((player) => player.id === game.firstPlayerId)
  ) {
    throw new Error("璀璨宝石当前玩家无效");
  }
  if (
    !["playing", "finished"].includes(game.status ?? "") ||
    !["main", "return", "choose_noble", "evolution", "finished"].includes(game.phase ?? "") ||
    typeof game.finalRoundTriggered !== "boolean" ||
    typeof game.evolutionUsedThisTurn !== "boolean"
  ) {
    throw new Error("璀璨宝石阶段状态无效");
  }
  if (!game.rng || !/^[0-9a-f]{64}$/.test(game.rng.key) || !Number.isSafeInteger(game.rng.counter) || game.rng.counter < 0 || game.rng.counter > 0xffff_ffff) {
    throw new Error("璀璨宝石随机状态无效");
  }
  if (game.status === "finished") {
    const winner = game.winner as unknown;
    const winnerRecord = winner && typeof winner === "object" && !Array.isArray(winner)
      ? winner as Record<string, unknown>
      : null;
    const winnerPlayerIds = winnerRecord?.playerIds;
    const winnerRankings = winnerRecord?.rankings;
    const knownPlayerIds = new Set(game.players.map((player) => player.id));
    const expectedRankings = rankings(game as SplendorGameState);
    const rankingsMatch = Array.isArray(winnerRankings) &&
      winnerRankings.length === expectedRankings.length &&
      winnerRankings.every((entry, index) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
        const record = entry as Record<string, unknown>;
        const expected = expectedRankings[index]!;
        return Object.keys(record).length === 4 &&
          record.playerId === expected.playerId &&
          record.score === expected.score &&
          record.developmentCardCount === expected.developmentCardCount &&
          record.evolutionCount === expected.evolutionCount;
      });
    const playerIdsValid = Array.isArray(winnerPlayerIds) &&
      winnerPlayerIds.length > 0 &&
      new Set(winnerPlayerIds).size === winnerPlayerIds.length &&
      winnerPlayerIds.every((playerId) =>
        typeof playerId === "string" && knownPlayerIds.has(playerId)
      );
    const expectedScoreWinnerIds = scoreWinnerIds(
      game as SplendorGameState,
      expectedRankings,
    );
    const scoreWinnerIdsMatch = Array.isArray(winnerPlayerIds) &&
      winnerPlayerIds.length === expectedScoreWinnerIds.length &&
      winnerPlayerIds.every((playerId, index) => playerId === expectedScoreWinnerIds[index]);
    const forfeitWinnerIdsValid = Array.isArray(winnerPlayerIds) &&
      winnerPlayerIds.length === game.players.length - 1;
    if (
      game.phase !== "finished" ||
      !winnerRecord ||
      Object.keys(winnerRecord).length !== 3 ||
      (winnerRecord.reason !== "score" && winnerRecord.reason !== "forfeit") ||
      !playerIdsValid ||
      !rankingsMatch ||
      (winnerRecord.reason === "score" && !scoreWinnerIdsMatch) ||
      (winnerRecord.reason === "forfeit" && !forfeitWinnerIdsValid)
    ) {
      throw new Error("璀璨宝石终局状态无效");
    }
  } else {
    if (game.phase === "finished" || game.winner !== null) throw new Error("璀璨宝石进行中状态无效");
    const current = game.players.find((player) => player.id === game.currentPlayerId)!;
    if (
      game.phase === "return" &&
      (game.pendingReturnCount! <= 0 || game.pendingReturnCount !== totalTokens(current) - TOKEN_LIMIT)
    ) {
      throw new Error("璀璨宝石返还阶段无效");
    }
    if (
      game.phase === "choose_noble" &&
      (game.kind !== "splendor" ||
        game.pendingNobleIds!.length < 2 ||
        game.pendingNobleIds!.some((id) => !eligibleNobles(game as SplendorGameState, current).some((noble) => noble.id === id)))
    ) {
      throw new Error("璀璨宝石贵族选择阶段无效");
    }
    if (
      game.phase === "evolution" &&
      (game.kind !== "splendor_pokemon" ||
        game.evolutionUsedThisTurn ||
        availableEvolutions(game as SplendorGameState, current).length === 0)
    ) {
      throw new Error("璀璨宝石进化阶段无效");
    }
  }
}

const POKEMON_COLORS_WITH_PURPLE = [...SPLENDOR_POKEMON_COLORS, "purple" as const];
