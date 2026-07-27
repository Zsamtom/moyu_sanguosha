import { randomInteger, type ChaCha20State } from "./prng.js";

export const DOUDIZHU_RANKS = [
  "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2", "small_joker", "big_joker",
] as const;
export const DOUDIZHU_SUITS = ["spade", "heart", "diamond", "club"] as const;
export const DOUDIZHU_INITIAL_BEANS = 10_000;
export const DOUDIZHU_BEAN_ROOM_MULTIPLIER = 100;

export type DoudizhuRank = (typeof DOUDIZHU_RANKS)[number];
export type DoudizhuSuit = (typeof DOUDIZHU_SUITS)[number] | "joker";
export type DoudizhuRole = "landlord" | "farmer";
export type DoudizhuPatternType =
  | "single"
  | "pair"
  | "triple"
  | "triple_single"
  | "triple_pair"
  | "straight"
  | "consecutive_pairs"
  | "airplane"
  | "airplane_singles"
  | "airplane_pairs"
  | "four_two_singles"
  | "four_two_pairs"
  | "bomb"
  | "rocket";

export const DOUDIZHU_BOT_INTELLIGENCE_NAMES = {
  1: "新手牌友",
  2: "稳健农民",
  3: "欢乐牌手",
  4: "记牌能手",
  5: "叫分专家",
  6: "残局大师",
  7: "牌桌宗师",
} as const;
export type DoudizhuBotIntelligence = keyof typeof DOUDIZHU_BOT_INTELLIGENCE_NAMES;

export interface DoudizhuCard {
  readonly id: string;
  readonly rank: DoudizhuRank;
  readonly suit: DoudizhuSuit;
}

export interface DoudizhuPattern {
  readonly type: DoudizhuPatternType;
  readonly primaryRank: DoudizhuRank;
  readonly length: number;
  readonly cards: DoudizhuCard[];
}

export interface DoudizhuPlayerState {
  readonly id: string;
  readonly seat: number;
  readonly name: string;
  readonly botTitle?: string;
  role?: DoudizhuRole;
  hand: DoudizhuCard[];
  playedCount: number;
  beans: number;
  beanDelta: number;
}

export interface DoudizhuBidState {
  readonly firstPlayerId: string;
  currentBid: 0 | 1 | 2 | 3;
  bidderId: string | null;
  bids: Array<{ readonly playerId: string; readonly score: 0 | 1 | 2 | 3 }>;
}

export interface DoudizhuTrickState {
  readonly fromPlayerId: string;
  readonly pattern: DoudizhuPattern;
  passCount: number;
}

export interface DoudizhuWinner {
  readonly role: DoudizhuRole;
  readonly playerIds: string[];
  readonly baseScore: number;
  readonly multiplier: number;
  readonly spring: boolean;
  readonly beanStake: number;
  readonly settlements: Array<{
    readonly playerId: string;
    readonly delta: number;
    readonly balance: number;
  }>;
}

export interface DoudizhuLogEntry {
  readonly id: number;
  readonly type: "system" | "bid" | "play" | "pass" | "victory";
  readonly message: string;
  readonly actorSeat?: number;
  readonly bidScore?: 0 | 1 | 2 | 3;
  readonly pattern?: {
    readonly type: DoudizhuPatternType;
    readonly primaryRank: DoudizhuRank;
    readonly length: number;
    readonly ranks: DoudizhuRank[];
  };
}

export interface DoudizhuGameState {
  readonly kind: "doudizhu";
  readonly version: 1;
  revision: number;
  status: "playing" | "finished";
  phase: "bidding" | "playing" | "finished";
  players: DoudizhuPlayerState[];
  currentPlayerId: string;
  landlordId: string | null;
  bottomCards: DoudizhuCard[];
  bid: DoudizhuBidState;
  trick: DoudizhuTrickState | null;
  baseScore: number;
  multiplier: number;
  bombCount: number;
  winner: DoudizhuWinner | null;
  logs: DoudizhuLogEntry[];
  nextLogId: number;
  rng: ChaCha20State;
}

export interface DoudizhuPlayerView {
  readonly id: string;
  readonly seat: number;
  readonly name: string;
  readonly botTitle?: string;
  readonly role?: DoudizhuRole;
  readonly handCount: number;
  readonly hand?: DoudizhuCard[];
  readonly playedCount: number;
  readonly beans: number;
  readonly beanDelta: number;
}

export interface DoudizhuPrompt {
  readonly type: "bid" | "play" | "waiting" | "finished";
  readonly playerId: string | null;
  readonly bidOptions: Array<0 | 1 | 2 | 3>;
  readonly canPlay: boolean;
  readonly canPass: boolean;
  readonly recommendation: {
    readonly type: "play";
    readonly cardIds: string[];
  } | {
    readonly type: "pass";
  } | null;
}

export interface DoudizhuGameView {
  readonly kind: "doudizhu";
  readonly version: 1;
  readonly revision: number;
  readonly actionPromptId: string;
  readonly status: "playing" | "finished";
  readonly phase: "bidding" | "playing" | "finished";
  readonly currentPlayerId: string;
  readonly landlordId: string | null;
  readonly players: DoudizhuPlayerView[];
  readonly bottomCards: DoudizhuCard[];
  readonly bid: DoudizhuBidState;
  readonly trick: {
    readonly fromPlayerId: string;
    readonly pattern: DoudizhuPattern;
    readonly passCount: number;
  } | null;
  readonly baseScore: number;
  readonly multiplier: number;
  readonly winner: DoudizhuWinner | null;
  readonly prompt: DoudizhuPrompt;
  readonly logs: DoudizhuLogEntry[];
}

export type DoudizhuAction =
  | { readonly type: "doudizhu_bid"; readonly playerId: string; readonly score: 0 | 1 | 2 | 3 }
  | { readonly type: "doudizhu_play"; readonly playerId: string; readonly cardIds: string[] }
  | { readonly type: "doudizhu_pass"; readonly playerId: string };

export type DoudizhuRuleErrorCode =
  | "DOUDIZHU_GAME_FINISHED"
  | "DOUDIZHU_UNKNOWN_PLAYER"
  | "DOUDIZHU_NOT_YOUR_TURN"
  | "DOUDIZHU_INVALID_PHASE"
  | "DOUDIZHU_INVALID_BID"
  | "DOUDIZHU_INVALID_SELECTION"
  | "DOUDIZHU_INVALID_PATTERN"
  | "DOUDIZHU_CANNOT_BEAT"
  | "DOUDIZHU_CANNOT_PASS";

export class DoudizhuRuleError extends Error {
  constructor(readonly code: DoudizhuRuleErrorCode, message: string) {
    super(message);
    this.name = "DoudizhuRuleError";
  }
}

export function doudizhuRankValue(rank: DoudizhuRank): number {
  return DOUDIZHU_RANKS.indexOf(rank) + 3;
}

function sortCards(cards: readonly DoudizhuCard[]): DoudizhuCard[] {
  return [...cards].sort((left, right) =>
    doudizhuRankValue(left.rank) - doudizhuRankValue(right.rank) ||
    left.suit.localeCompare(right.suit) ||
    left.id.localeCompare(right.id)
  );
}

function createDeck(): DoudizhuCard[] {
  const cards: DoudizhuCard[] = [];
  for (const rank of DOUDIZHU_RANKS.slice(0, 13)) {
    for (const suit of DOUDIZHU_SUITS) {
      cards.push({ id: `doudizhu-${rank}-${suit}`, rank, suit });
    }
  }
  cards.push(
    { id: "doudizhu-small-joker", rank: "small_joker", suit: "joker" },
    { id: "doudizhu-big-joker", rank: "big_joker", suit: "joker" },
  );
  return cards;
}

function shuffle(cards: readonly DoudizhuCard[], initial: ChaCha20State): {
  cards: DoudizhuCard[];
  rng: ChaCha20State;
} {
  const result = [...cards];
  let rng = initial;
  for (let index = result.length - 1; index > 0; index -= 1) {
    const drawn = randomInteger(rng, index + 1);
    rng = drawn.state;
    [result[index], result[drawn.value]] = [result[drawn.value]!, result[index]!];
  }
  return { cards: result, rng };
}

function consecutive(ranks: readonly DoudizhuRank[]): boolean {
  if (ranks.some((rank) => doudizhuRankValue(rank) >= doudizhuRankValue("2"))) return false;
  const values = ranks.map(doudizhuRankValue).sort((a, b) => a - b);
  return values.every((value, index) => index === 0 || value === values[index - 1]! + 1);
}

function pattern(
  type: DoudizhuPatternType,
  primaryRank: DoudizhuRank,
  length: number,
  cards: readonly DoudizhuCard[],
): DoudizhuPattern {
  return { type, primaryRank, length, cards: sortCards(cards) };
}

export function parseDoudizhuPattern(cards: readonly DoudizhuCard[]): DoudizhuPattern | null {
  if (cards.length === 0) return null;
  const sorted = sortCards(cards);
  const groups = new Map<DoudizhuRank, DoudizhuCard[]>();
  for (const card of sorted) {
    const group = groups.get(card.rank) ?? [];
    group.push(card);
    groups.set(card.rank, group);
  }
  const entries = [...groups.entries()].sort((left, right) =>
    doudizhuRankValue(left[0]) - doudizhuRankValue(right[0])
  );
  const rankWithCount = (count: number) => entries.find(([, group]) => group.length === count)?.[0];

  if (
    cards.length === 2 &&
    groups.has("small_joker") &&
    groups.has("big_joker")
  ) return pattern("rocket", "big_joker", 1, sorted);
  if (cards.length === 4 && entries.length === 1) return pattern("bomb", entries[0]![0], 1, sorted);
  if (cards.length === 1) return pattern("single", sorted[0]!.rank, 1, sorted);
  if (cards.length === 2 && entries.length === 1) return pattern("pair", entries[0]![0], 1, sorted);
  if (cards.length === 3 && entries.length === 1) return pattern("triple", entries[0]![0], 1, sorted);
  if (cards.length === 4 && entries.length === 2) {
    const tripleRank = rankWithCount(3);
    if (tripleRank) return pattern("triple_single", tripleRank, 1, sorted);
  }
  if (cards.length === 5 && entries.length === 2) {
    const tripleRank = rankWithCount(3);
    if (tripleRank && entries.some(([, group]) => group.length === 2)) {
      return pattern("triple_pair", tripleRank, 1, sorted);
    }
  }
  if (cards.length >= 5 && entries.length === cards.length && consecutive(entries.map(([rank]) => rank))) {
    return pattern("straight", entries.at(-1)![0], cards.length, sorted);
  }
  if (
    cards.length >= 6 &&
    cards.length % 2 === 0 &&
    entries.every(([, group]) => group.length === 2) &&
    consecutive(entries.map(([rank]) => rank))
  ) return pattern("consecutive_pairs", entries.at(-1)![0], entries.length, sorted);

  const tripleEntries = entries.filter(([, group]) => group.length === 3);
  if (tripleEntries.length >= 2 && consecutive(tripleEntries.map(([rank]) => rank))) {
    const count = tripleEntries.length;
    const primary = tripleEntries.at(-1)![0];
    if (cards.length === count * 3 && entries.length === count) {
      return pattern("airplane", primary, count, sorted);
    }
    const wingEntries = entries.filter(([, group]) => group.length !== 3);
    if (cards.length === count * 4 && wingEntries.reduce((sum, [, group]) => sum + group.length, 0) === count) {
      return pattern("airplane_singles", primary, count, sorted);
    }
    if (
      cards.length === count * 5 &&
      wingEntries.length === count &&
      wingEntries.every(([, group]) => group.length === 2)
    ) return pattern("airplane_pairs", primary, count, sorted);
  }

  if (cards.length === 6) {
    const fourRank = rankWithCount(4);
    if (fourRank) return pattern("four_two_singles", fourRank, 1, sorted);
  }
  if (cards.length === 8) {
    const fourRank = rankWithCount(4);
    const pairs = entries.filter(([, group]) => group.length === 2);
    if (fourRank && pairs.length === 2) return pattern("four_two_pairs", fourRank, 1, sorted);
  }
  return null;
}

export function canDoudizhuPatternBeat(
  candidate: DoudizhuPattern,
  previous: DoudizhuPattern,
): boolean {
  if (candidate.type === "rocket") return previous.type !== "rocket";
  if (previous.type === "rocket") return false;
  if (candidate.type === "bomb" && previous.type !== "bomb") return true;
  if (candidate.type !== previous.type || candidate.length !== previous.length) return false;
  return doudizhuRankValue(candidate.primaryRank) > doudizhuRankValue(previous.primaryRank);
}

function appendLog(
  game: DoudizhuGameState,
  type: DoudizhuLogEntry["type"],
  message: string,
  details: Pick<
    DoudizhuLogEntry,
    "actorSeat" | "bidScore" | "pattern"
  > = {},
): void {
  game.logs.push({ id: game.nextLogId, type, message, ...details });
  game.nextLogId += 1;
  if (game.logs.length > 120) game.logs.splice(0, game.logs.length - 120);
}

function nextPlayer(game: DoudizhuGameState, playerId: string): DoudizhuPlayerState {
  const index = game.players.findIndex((player) => player.id === playerId);
  return game.players[(index - 1 + game.players.length) % game.players.length]!;
}

function assignLandlord(game: DoudizhuGameState, playerId: string, score: number): void {
  const landlord = game.players.find((player) => player.id === playerId)!;
  game.landlordId = playerId;
  game.baseScore = Math.max(1, score);
  for (const player of game.players) player.role = player.id === playerId ? "landlord" : "farmer";
  landlord.hand = sortCards([...landlord.hand, ...game.bottomCards]);
  game.phase = "playing";
  game.currentPlayerId = playerId;
  appendLog(game, "system", `${landlord.name} 成为地主，底分 ${game.baseScore}`);
}

function redeal(game: DoudizhuGameState): void {
  const shuffled = shuffle(createDeck(), game.rng);
  const starter = randomInteger(shuffled.rng, 3);
  game.players.forEach((player, seat) => {
    player.role = undefined;
    player.hand = sortCards(shuffled.cards.slice(seat * 17, seat * 17 + 17));
    player.playedCount = 0;
    player.beanDelta = 0;
  });
  game.bottomCards = sortCards(shuffled.cards.slice(51));
  game.currentPlayerId = game.players[starter.value]!.id;
  game.landlordId = null;
  game.bid = {
    firstPlayerId: game.currentPlayerId,
    currentBid: 0,
    bidderId: null,
    bids: [],
  };
  game.trick = null;
  game.baseScore = 1;
  game.multiplier = 1;
  game.bombCount = 0;
  game.rng = starter.state;
  appendLog(game, "system", "三家都不叫，重新发牌");
}

export function createDoudizhuGame(input: {
  readonly players: Array<{
    readonly id: string;
    readonly name: string;
    readonly botTitle?: string;
    readonly beans?: number;
  }>;
  readonly seed: string;
}): DoudizhuGameState {
  if (input.players.length !== 3) throw new Error("斗地主必须恰好有 3 名玩家");
  if (new Set(input.players.map((player) => player.id)).size !== 3) {
    throw new Error("斗地主玩家 id 不能重复");
  }
  const shuffled = shuffle(createDeck(), { key: input.seed.toLowerCase(), counter: 0 });
  const starter = randomInteger(shuffled.rng, 3);
  const bottomCards = sortCards(shuffled.cards.slice(51));
  const players = input.players.map((player, seat): DoudizhuPlayerState => {
    const beans = player.beans ?? DOUDIZHU_INITIAL_BEANS;
    if (!Number.isSafeInteger(beans) || beans < 0) {
      throw new Error("斗地主初始欢乐豆无效");
    }
    return {
      ...player,
      seat,
      hand: sortCards(shuffled.cards.slice(seat * 17, seat * 17 + 17)),
      playedCount: 0,
      beans,
      beanDelta: 0,
    };
  });
  const firstPlayerId = players[starter.value]!.id;
  return {
    kind: "doudizhu",
    version: 1,
    revision: 0,
    status: "playing",
    phase: "bidding",
    players,
    currentPlayerId: firstPlayerId,
    landlordId: null,
    bottomCards,
    bid: { firstPlayerId, currentBid: 0, bidderId: null, bids: [] },
    trick: null,
    baseScore: 1,
    multiplier: 1,
    bombCount: 0,
    winner: null,
    logs: [{ id: 1, type: "system", message: "牌已发完，开始叫分" }],
    nextLogId: 2,
    rng: starter.state,
  };
}

function assertTurn(game: DoudizhuGameState, playerId: string): DoudizhuPlayerState {
  if (game.status === "finished") {
    throw new DoudizhuRuleError("DOUDIZHU_GAME_FINISHED", "本局已经结束");
  }
  const player = game.players.find((candidate) => candidate.id === playerId);
  if (!player) throw new DoudizhuRuleError("DOUDIZHU_UNKNOWN_PLAYER", "玩家不在本局中");
  if (game.currentPlayerId !== playerId) {
    throw new DoudizhuRuleError("DOUDIZHU_NOT_YOUR_TURN", "还没有轮到你");
  }
  return player;
}

function settleDoudizhuBeans(
  game: DoudizhuGameState,
  winnerRole: DoudizhuRole,
  forfeitingPlayerId?: string,
): Pick<DoudizhuWinner, "beanStake" | "settlements"> {
  const beanStake = game.baseScore * game.multiplier * DOUDIZHU_BEAN_ROOM_MULTIPLIER;
  for (const player of game.players) player.beanDelta = 0;

  const transfer = (
    loser: DoudizhuPlayerState,
    winners: DoudizhuPlayerState[],
    requested: number,
  ) => {
    const paid = Math.min(loser.beans, requested);
    loser.beans -= paid;
    loser.beanDelta -= paid;
    const evenShare = Math.floor(paid / winners.length);
    let remainder = paid % winners.length;
    for (const winner of winners) {
      const received = evenShare + (remainder > 0 ? 1 : 0);
      remainder = Math.max(0, remainder - 1);
      winner.beans += received;
      winner.beanDelta += received;
    }
  };

  if (forfeitingPlayerId && game.players.some((player) => player.role === undefined)) {
    const loser = game.players.find((player) => player.id === forfeitingPlayerId)!;
    transfer(loser, game.players.filter((player) => player.id !== forfeitingPlayerId), beanStake);
  } else {
    const landlord = game.players.find((player) => player.role === "landlord")!;
    const farmers = game.players.filter((player) => player.role === "farmer");
    if (winnerRole === "landlord") {
      for (const farmer of farmers) transfer(farmer, [landlord], beanStake);
    } else {
      transfer(landlord, farmers, beanStake * 2);
    }
  }

  return {
    beanStake,
    settlements: game.players.map((player) => ({
      playerId: player.id,
      delta: player.beanDelta,
      balance: player.beans,
    })),
  };
}

function finish(game: DoudizhuGameState, player: DoudizhuPlayerState): void {
  const winnerRole = player.role!;
  const landlord = game.players.find((candidate) => candidate.role === "landlord")!;
  const farmers = game.players.filter((candidate) => candidate.role === "farmer");
  const spring = winnerRole === "landlord"
    ? farmers.every((candidate) => candidate.playedCount === 0)
    : landlord.playedCount <= 1;
  if (spring) game.multiplier *= 2;
  const beanSettlement = settleDoudizhuBeans(game, winnerRole);
  game.status = "finished";
  game.phase = "finished";
  game.winner = {
    role: winnerRole,
    playerIds: game.players.filter((candidate) => candidate.role === winnerRole).map((candidate) => candidate.id),
    baseScore: game.baseScore,
    multiplier: game.multiplier,
    spring,
    ...beanSettlement,
  };
  appendLog(
    game,
    "victory",
    `${winnerRole === "landlord" ? "地主" : "农民"}获胜${spring ? "，触发春天" : ""}，倍率 ${game.multiplier}`,
  );
}

export function applyDoudizhuAction(
  state: DoudizhuGameState,
  action: DoudizhuAction,
): DoudizhuGameState {
  const game = structuredClone(state);
  const player = assertTurn(game, action.playerId);

  if (action.type === "doudizhu_bid") {
    if (game.phase !== "bidding") {
      throw new DoudizhuRuleError("DOUDIZHU_INVALID_PHASE", "叫分阶段已经结束");
    }
    if (
      !Number.isInteger(action.score) ||
      action.score < 0 ||
      action.score > 3 ||
      (action.score > 0 && action.score <= game.bid.currentBid)
    ) {
      throw new DoudizhuRuleError("DOUDIZHU_INVALID_BID", "叫分必须高于当前分数，或选择不叫");
    }
    game.bid.bids.push({ playerId: player.id, score: action.score });
    appendLog(
      game,
      "bid",
      `${player.name}${action.score === 0 ? "不叫" : `叫 ${action.score} 分`}`,
      { actorSeat: player.seat, bidScore: action.score },
    );
    if (action.score > game.bid.currentBid) {
      game.bid.currentBid = action.score;
      game.bid.bidderId = player.id;
    }
    if (action.score === 3) {
      assignLandlord(game, player.id, 3);
    } else if (game.bid.bids.length === 3) {
      if (game.bid.bidderId) {
        assignLandlord(game, game.bid.bidderId, game.bid.currentBid);
      } else {
        redeal(game);
      }
    } else {
      game.currentPlayerId = nextPlayer(game, player.id).id;
    }
  } else if (action.type === "doudizhu_play") {
    if (game.phase !== "playing") {
      throw new DoudizhuRuleError("DOUDIZHU_INVALID_PHASE", "当前不是出牌阶段");
    }
    if (action.cardIds.length === 0 || new Set(action.cardIds).size !== action.cardIds.length) {
      throw new DoudizhuRuleError("DOUDIZHU_INVALID_SELECTION", "请选择不重复的手牌");
    }
    const selected = action.cardIds.map((cardId) => player.hand.find((card) => card.id === cardId));
    if (selected.some((card) => !card)) {
      throw new DoudizhuRuleError("DOUDIZHU_INVALID_SELECTION", "所选牌不都在你的手牌中");
    }
    const parsed = parseDoudizhuPattern(selected as DoudizhuCard[]);
    if (!parsed) throw new DoudizhuRuleError("DOUDIZHU_INVALID_PATTERN", "这组牌不是有效的斗地主牌型");
    if (
      game.trick &&
      game.trick.fromPlayerId !== player.id &&
      !canDoudizhuPatternBeat(parsed, game.trick.pattern)
    ) {
      throw new DoudizhuRuleError("DOUDIZHU_CANNOT_BEAT", "所选牌无法压过上一手");
    }
    const ids = new Set(action.cardIds);
    player.hand = player.hand.filter((card) => !ids.has(card.id));
    player.playedCount += 1;
    if (parsed.type === "bomb" || parsed.type === "rocket") {
      game.bombCount += 1;
      game.multiplier *= 2;
    }
    game.trick = { fromPlayerId: player.id, pattern: parsed, passCount: 0 };
    appendLog(
      game,
      "play",
      `${player.name}打出${describeDoudizhuPattern(parsed)}`,
      {
        actorSeat: player.seat,
        pattern: {
          type: parsed.type,
          primaryRank: parsed.primaryRank,
          length: parsed.length,
          ranks: parsed.cards.map((card) => card.rank),
        },
      },
    );
    if (player.hand.length === 0) {
      finish(game, player);
    } else {
      game.currentPlayerId = nextPlayer(game, player.id).id;
    }
  } else {
    if (game.phase !== "playing") {
      throw new DoudizhuRuleError("DOUDIZHU_INVALID_PHASE", "当前不是出牌阶段");
    }
    if (!game.trick || game.trick.fromPlayerId === player.id) {
      throw new DoudizhuRuleError("DOUDIZHU_CANNOT_PASS", "新一轮领牌时不能不出");
    }
    appendLog(game, "pass", `${player.name}不出`, {
      actorSeat: player.seat,
    });
    game.trick.passCount += 1;
    if (game.trick.passCount >= 2) {
      const leaderId = game.trick.fromPlayerId;
      game.trick = null;
      game.currentPlayerId = leaderId;
    } else {
      game.currentPlayerId = nextPlayer(game, player.id).id;
    }
  }
  game.revision += 1;
  return game;
}

export function doudizhuActionPromptId(game: DoudizhuGameState): string {
  return `doudizhu:${game.revision}:${game.phase}:${game.currentPlayerId}:${game.trick?.fromPlayerId ?? "lead"}`;
}

export function getDoudizhuGameView(game: DoudizhuGameState, viewerId: string): DoudizhuGameView {
  const viewer = game.players.find((player) => player.id === viewerId);
  if (!viewer) throw new DoudizhuRuleError("DOUDIZHU_UNKNOWN_PLAYER", "玩家不在本局中");
  const ownTurn = game.status === "playing" && game.currentPlayerId === viewerId;
  const recommendedAction = ownTurn && game.phase === "playing"
    ? chooseDoudizhuBotAction(game, viewerId, 5)
    : null;
  const recommendation = recommendedAction?.type === "doudizhu_play"
    ? { type: "play" as const, cardIds: [...recommendedAction.cardIds] }
    : recommendedAction?.type === "doudizhu_pass"
      ? { type: "pass" as const }
      : null;
  const prompt: DoudizhuPrompt = game.status === "finished"
    ? { type: "finished", playerId: null, bidOptions: [], canPlay: false, canPass: false, recommendation: null }
    : !ownTurn
      ? { type: "waiting", playerId: game.currentPlayerId, bidOptions: [], canPlay: false, canPass: false, recommendation: null }
      : game.phase === "bidding"
        ? {
            type: "bid",
            playerId: viewerId,
            bidOptions: ([0, 1, 2, 3] as const).filter((score) => score === 0 || score > game.bid.currentBid),
            canPlay: false,
            canPass: false,
            recommendation: null,
          }
        : {
            type: "play",
            playerId: viewerId,
            bidOptions: [],
            canPlay: true,
            canPass: Boolean(game.trick && game.trick.fromPlayerId !== viewerId),
            recommendation,
          };
  return {
    kind: "doudizhu",
    version: 1,
    revision: game.revision,
    actionPromptId: doudizhuActionPromptId(game),
    status: game.status,
    phase: game.phase,
    currentPlayerId: game.currentPlayerId,
    landlordId: game.landlordId,
    players: game.players.map((player) => ({
      id: player.id,
      seat: player.seat,
      name: player.name,
      ...(player.botTitle ? { botTitle: player.botTitle } : {}),
      ...(player.role ? { role: player.role } : {}),
      handCount: player.hand.length,
      ...(player.id === viewerId ? { hand: sortCards(player.hand) } : {}),
      playedCount: player.playedCount,
      beans: player.beans,
      beanDelta: player.beanDelta,
    })),
    bottomCards: game.phase === "bidding" ? [] : [...game.bottomCards],
    bid: structuredClone(game.bid),
    trick: game.trick ? structuredClone(game.trick) : null,
    baseScore: game.baseScore,
    multiplier: game.multiplier,
    winner: game.winner ? structuredClone(game.winner) : null,
    prompt,
    logs: game.logs.map((log) => ({ ...log })),
  };
}

function candidatePatterns(hand: readonly DoudizhuCard[]): DoudizhuPattern[] {
  const groups = new Map<DoudizhuRank, DoudizhuCard[]>();
  for (const card of sortCards(hand)) {
    const group = groups.get(card.rank) ?? [];
    group.push(card);
    groups.set(card.rank, group);
  }
  const patterns: DoudizhuPattern[] = [];
  const seen = new Set<string>();
  const addPattern = (cards: readonly DoudizhuCard[]): void => {
    const parsed = parseDoudizhuPattern(cards);
    if (!parsed) return;
    const key = parsed.cards.map((card) => card.id).sort().join("|");
    if (seen.has(key)) return;
    seen.add(key);
    patterns.push(parsed);
  };
  const entries = [...groups.entries()].sort((a, b) => doudizhuRankValue(a[0]) - doudizhuRankValue(b[0]));
  for (const [, cards] of entries) {
    addPattern(cards.slice(0, 1));
    if (cards.length >= 2) addPattern(cards.slice(0, 2));
    if (cards.length >= 3) addPattern(cards.slice(0, 3));
    if (cards.length === 4) addPattern(cards);
  }
  if (groups.has("small_joker") && groups.has("big_joker")) {
    addPattern([groups.get("small_joker")![0]!, groups.get("big_joker")![0]!]);
  }
  const sequenceRanks = entries
    .map(([rank]) => rank)
    .filter((rank) => doudizhuRankValue(rank) < doudizhuRankValue("2"));
  for (let start = 0; start < sequenceRanks.length; start += 1) {
    for (let end = start + 5; end <= sequenceRanks.length; end += 1) {
      const ranks = sequenceRanks.slice(start, end);
      if (!consecutive(ranks)) break;
      addPattern(ranks.map((rank) => groups.get(rank)![0]!));
    }
  }

  const pairRanks = sequenceRanks.filter((rank) => groups.get(rank)!.length >= 2);
  for (let start = 0; start < pairRanks.length; start += 1) {
    for (let end = start + 3; end <= pairRanks.length; end += 1) {
      const ranks = pairRanks.slice(start, end);
      if (!consecutive(ranks)) break;
      addPattern(ranks.flatMap((rank) => groups.get(rank)!.slice(0, 2)));
    }
  }

  const tripleRanks = sequenceRanks.filter((rank) => groups.get(rank)!.length >= 3);
  for (let start = 0; start < tripleRanks.length; start += 1) {
    for (let end = start + 2; end <= tripleRanks.length; end += 1) {
      const ranks = tripleRanks.slice(start, end);
      if (!consecutive(ranks)) break;
      addPattern(ranks.flatMap((rank) => groups.get(rank)!.slice(0, 3)));
    }
  }

  for (const [tripleRank, tripleCards] of entries.filter(([, cards]) => cards.length >= 3)) {
    for (const [attachmentRank, attachmentCards] of entries) {
      if (attachmentRank === tripleRank) continue;
      addPattern([...tripleCards.slice(0, 3), attachmentCards[0]!]);
      if (attachmentCards.length >= 2) {
        addPattern([...tripleCards.slice(0, 3), ...attachmentCards.slice(0, 2)]);
      }
    }
  }
  return patterns;
}

/**
 * Estimates how many future plays remain by repeatedly choosing the legal
 * pattern that sheds the most cards while preserving lower ranks on ties.
 * It is intentionally bounded and deterministic so it can be attached to
 * every LLM candidate without turning a room action into an expensive search.
 */
export function estimateDoudizhuRemainingTurns(
  hand: readonly DoudizhuCard[],
): number {
  let remaining = sortCards(hand);
  let turns = 0;
  while (remaining.length > 0) {
    const best = candidatePatterns(remaining).sort((left, right) =>
      right.cards.length - left.cards.length ||
      doudizhuRankValue(left.primaryRank) -
        doudizhuRankValue(right.primaryRank)
    )[0];
    if (!best) return turns + remaining.length;
    const played = new Set(best.cards.map((card) => card.id));
    remaining = remaining.filter((card) => !played.has(card.id));
    turns += 1;
  }
  return turns;
}

function handStrength(hand: readonly DoudizhuCard[]): number {
  const counts = new Map<DoudizhuRank, number>();
  for (const card of hand) counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  let score = 0;
  for (const card of hand) {
    if (card.rank === "big_joker") score += 5;
    else if (card.rank === "small_joker") score += 4;
    else if (card.rank === "2") score += 2;
    else if (card.rank === "A") score += 1;
  }
  score += [...counts.values()].filter((count) => count === 4).length * 5;
  return score;
}

export function chooseDoudizhuBotAction(
  game: DoudizhuGameState,
  playerId: string,
  intelligence: DoudizhuBotIntelligence = 3,
): DoudizhuAction {
  const actions = listDoudizhuBotActions(game, playerId, intelligence);
  if (actions.length === 0) {
    throw new DoudizhuRuleError("DOUDIZHU_INVALID_SELECTION", "机器人没有可执行动作");
  }
  if (intelligence === 1 && actions.length > 1) {
    return actions[Math.floor(Math.random() * Math.min(actions.length, 4))]!;
  }
  if (intelligence === 2 && actions.length > 1 && Math.random() < 0.25) {
    return actions[Math.min(1, actions.length - 1)]!;
  }
  return actions[0]!;
}

function remainingHandScore(
  hand: readonly DoudizhuCard[],
  playedCardIds: ReadonlySet<string>,
): number {
  const counts = new Map<DoudizhuRank, number>();
  for (const card of hand) {
    if (playedCardIds.has(card.id)) continue;
    counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  }
  let groups = counts.size * 20;
  for (const count of counts.values()) {
    if (count >= 2) groups -= 4;
    if (count >= 3) groups -= 5;
    if (count === 4) groups -= 3;
  }
  return groups;
}

function sameDoudizhuSide(
  left: DoudizhuPlayerState,
  right: DoudizhuPlayerState,
): boolean {
  return left.role !== undefined && left.role === right.role;
}

/**
 * Returns a compact, ordered set of legal actions. The authoritative reducer
 * still validates the selected action, while rule bots and external decision
 * providers can share the same candidate boundary.
 */
export function listDoudizhuBotActions(
  game: DoudizhuGameState,
  playerId: string,
  intelligence: DoudizhuBotIntelligence = 3,
): DoudizhuAction[] {
  const player = assertTurn(game, playerId);
  if (game.phase === "bidding") {
    const strength = handStrength(player.hand) + Math.max(0, intelligence - 3);
    const target = strength >= 15 ? 3 : strength >= 10 ? 2 : strength >= 6 ? 1 : 0;
    const legalScores = ([0, 1, 2, 3] as const)
      .filter((score) => score === 0 || score > game.bid.currentBid)
      .sort((left, right) => Math.abs(left - target) - Math.abs(right - target) || right - left);
    return legalScores.map((score) => ({ type: "doudizhu_bid", playerId, score }));
  }
  const candidates = candidatePatterns(player.hand)
    .filter((candidate) => !game.trick || game.trick.fromPlayerId === playerId ||
      canDoudizhuPatternBeat(candidate, game.trick.pattern));
  const trickLeader = game.trick
    ? game.players.find((candidate) => candidate.id === game.trick!.fromPlayerId)
    : undefined;
  const next = nextPlayer(game, playerId);
  const teammateLeading = Boolean(
    intelligence >= 5 &&
    trickLeader &&
    trickLeader.id !== playerId &&
    sameDoudizhuSide(player, trickLeader),
  );
  const urgentOpponent = game.players.some((candidate) =>
    candidate.id !== playerId &&
    !sameDoudizhuSide(player, candidate) &&
    candidate.hand.length <= Math.max(1, intelligence - 4)
  );

  const score = (pattern: DoudizhuPattern): number => {
    const rank = doudizhuRankValue(pattern.primaryRank);
    const isBomb = pattern.type === "bomb" || pattern.type === "rocket";
    let value = pattern.cards.length * (intelligence >= 3 ? 35 : 12) - rank * 2;
    if (pattern.cards.length === player.hand.length) value += 100_000;
    if (isBomb && pattern.cards.length !== player.hand.length) {
      value -= intelligence >= 4 ? 600 : 80;
    }
    if (teammateLeading && !urgentOpponent) value -= 2_000;
    if (!sameDoudizhuSide(player, next) && next.hand.length <= 2) {
      value += rank * Math.max(0, intelligence - 3) * 8;
    }
    if (intelligence >= 6 && urgentOpponent) value += pattern.cards.length * 80;
    if (intelligence >= 7) {
      value -= remainingHandScore(player.hand, new Set(pattern.cards.map((card) => card.id)));
    }
    return value;
  };

  const ordered: DoudizhuAction[] = candidates
    .sort((left, right) => score(right) - score(left))
    .map((candidate) => ({
      type: "doudizhu_play" as const,
      playerId,
      cardIds: candidate.cards.map((card) => card.id),
    }));
  if (game.trick && game.trick.fromPlayerId !== playerId) {
    const pass = { type: "doudizhu_pass" as const, playerId };
    if (teammateLeading && !urgentOpponent) ordered.unshift(pass);
    else ordered.push(pass);
  }
  return ordered;
}

export function forfeitDoudizhuPlayer(
  state: DoudizhuGameState,
  playerId: string,
): DoudizhuGameState {
  const game = structuredClone(state);
  if (game.status === "finished") return game;
  const player = game.players.find((candidate) => candidate.id === playerId);
  if (!player) throw new DoudizhuRuleError("DOUDIZHU_UNKNOWN_PLAYER", "玩家不在本局中");
  const winnerRole: DoudizhuRole = player.role === "landlord"
    ? "farmer"
      : player.role === "farmer"
        ? "landlord"
        : "farmer";
  const beanSettlement = settleDoudizhuBeans(game, winnerRole, playerId);
  game.status = "finished";
  game.phase = "finished";
  game.winner = {
    role: winnerRole,
    playerIds: game.players.filter((candidate) =>
      candidate.id !== playerId &&
      (candidate.role === winnerRole || player.role === undefined)
    ).map((candidate) => candidate.id),
    baseScore: game.baseScore,
    multiplier: game.multiplier,
    spring: false,
    ...beanSettlement,
  };
  appendLog(game, "victory", `${player.name}离开对局，对方获胜`);
  game.revision += 1;
  return game;
}

const PATTERN_LABELS: Record<DoudizhuPatternType, string> = {
  single: "单张",
  pair: "对子",
  triple: "三张",
  triple_single: "三带一",
  triple_pair: "三带二",
  straight: "顺子",
  consecutive_pairs: "连对",
  airplane: "飞机",
  airplane_singles: "飞机带单",
  airplane_pairs: "飞机带对",
  four_two_singles: "四带二",
  four_two_pairs: "四带两对",
  bomb: "炸弹",
  rocket: "王炸",
};

export function describeDoudizhuPattern(value: DoudizhuPattern): string {
  return `${PATTERN_LABELS[value.type]}（${value.cards.map((card) => card.rank).join(" ")}）`;
}

export function assertRestorableDoudizhuGameState(value: unknown): asserts value is DoudizhuGameState {
  if (!value || typeof value !== "object") throw new Error("斗地主存档不是对象");
  const game = value as Partial<DoudizhuGameState>;
  if (game.kind !== "doudizhu" || game.version !== 1) throw new Error("斗地主存档版本无效");
  if (!Array.isArray(game.players) || game.players.length !== 3) throw new Error("斗地主存档必须有 3 名玩家");
  if (!Array.isArray(game.bottomCards) || game.bottomCards.length !== 3) throw new Error("斗地主底牌无效");
  if (!game.bid || !Array.isArray(game.bid.bids)) throw new Error("斗地主叫分状态无效");
  if (!game.rng || typeof game.rng.key !== "string" || !Number.isSafeInteger(game.rng.counter)) {
    throw new Error("斗地主随机状态无效");
  }
  const ids = new Set<string>();
  for (const player of game.players) {
    if (!player || typeof player.id !== "string" || !Array.isArray(player.hand)) {
      throw new Error("斗地主玩家状态无效");
    }
    if (
      !Number.isSafeInteger(player.beans) ||
      player.beans < 0 ||
      !Number.isSafeInteger(player.beanDelta)
    ) {
      throw new Error("Invalid Doudizhu bean state");
    }
    for (const card of player.hand) {
      if (!card || typeof card.id !== "string" || ids.has(card.id)) throw new Error("斗地主牌 id 重复");
      ids.add(card.id);
    }
  }
  for (const card of game.bottomCards) {
    if (!card || typeof card.id !== "string") throw new Error("斗地主底牌无效");
    if (game.phase === "bidding" && ids.has(card.id)) throw new Error("斗地主发牌重复");
  }
  if (typeof game.currentPlayerId !== "string" || !game.players.some((player) => player.id === game.currentPlayerId)) {
    throw new Error("斗地主当前玩家无效");
  }
  if (game.status === "finished") {
    if (
      !game.winner ||
      !Number.isSafeInteger(game.winner.beanStake) ||
      game.winner.beanStake < 0 ||
      !Array.isArray(game.winner.settlements) ||
      game.winner.settlements.length !== 3 ||
      game.winner.settlements.some((settlement) =>
        !game.players!.some((player) => player.id === settlement.playerId) ||
        !Number.isSafeInteger(settlement.delta) ||
        !Number.isSafeInteger(settlement.balance) ||
        settlement.balance < 0
      )
    ) {
      throw new Error("Invalid Doudizhu bean settlement");
    }
  }
}
