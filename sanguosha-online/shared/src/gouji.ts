import { randomInteger, type ChaCha20State } from "./prng.js";

export const GOUJI_RANKS = [
  "big_joker",
  "small_joker",
  "2",
  "A",
  "K",
  "Q",
  "J",
  "10",
  "9",
  "8",
  "7",
  "6",
  "5",
  "4",
  "3",
] as const;

export const GOUJI_SUITS = ["spade", "heart", "diamond", "club"] as const;

export type GoujiRank = (typeof GOUJI_RANKS)[number];
export type GoujiSuit = (typeof GOUJI_SUITS)[number] | "joker";
export type GoujiTeam = "A" | "B";
export type GoujiFinishRank = "头科" | "二科" | "三科" | "四科" | "二拉" | "大拉";
export const GOUJI_BOT_INTELLIGENCE_NAMES = {
  1: "摸牌学徒",
  2: "跟牌新手",
  3: "牌桌熟手",
  4: "联邦主力",
  5: "烧牌高手",
  6: "牌局军师",
  7: "打牌宗师",
} as const;
export type GoujiBotIntelligence = keyof typeof GOUJI_BOT_INTELLIGENCE_NAMES;

export interface GoujiCard {
  readonly id: string;
  readonly rank: GoujiRank;
  readonly suit: GoujiSuit;
  /** A card received as payment during automatic buy-3/buy-4 settlement. */
  readonly marked?: boolean;
}

export interface GoujiPattern {
  readonly mainRank: GoujiRank;
  readonly mainCount: number;
  readonly cards: GoujiCard[];
  readonly extras: GoujiCard[];
  readonly bigJokerCount: number;
  readonly isGouji: boolean;
  readonly canOpenPoint: boolean;
}

export interface GoujiPlayerState {
  readonly id: string;
  readonly seat: number;
  readonly name: string;
  readonly botTitle?: string;
  readonly team: GoujiTeam;
  hand: GoujiCard[];
  finishedRank?: GoujiFinishRank;
  openedPoint: boolean;
  naturalPoint: boolean;
  burnCount: number;
}

export interface GoujiTrickState {
  pattern: GoujiPattern;
  fromPlayerId: string;
  passedPlayerIds: string[];
  passedAt: Record<string, string>;
  yielded?: boolean;
  yieldPlayerId?: string;
  burning?: boolean;
  burnerPlayerId?: string;
}

export interface GoujiLogEntry {
  readonly id: number;
  readonly type: "system" | "play" | "pass" | "finish" | "victory";
  readonly message: string;
}

export interface GoujiWinner {
  readonly team: GoujiTeam;
  readonly playerIds: string[];
}

export interface GoujiGameState {
  readonly kind: "gouji";
  readonly version: 1;
  revision: number;
  status: "playing" | "finished";
  players: GoujiPlayerState[];
  currentPlayerId: string;
  leadPlayerId: string;
  trick: GoujiTrickState | null;
  winner: GoujiWinner | null;
  logs: GoujiLogEntry[];
  nextLogId: number;
  rng: ChaCha20State;
}

export interface GoujiPlayerView {
  readonly id: string;
  readonly seat: number;
  readonly name: string;
  readonly botTitle?: string;
  readonly team: GoujiTeam;
  readonly handCount: number;
  readonly hand?: GoujiCard[];
  readonly finishedRank?: GoujiFinishRank;
  readonly openedPoint: boolean;
  readonly naturalPoint: boolean;
  readonly burnCount: number;
}

export interface GoujiTrickView {
  readonly fromPlayerId: string;
  readonly cards: GoujiCard[];
  readonly mainRank: GoujiRank;
  readonly cardCount: number;
  readonly isGouji: boolean;
  readonly passedPlayerIds: string[];
  readonly burning: boolean;
  readonly burnerPlayerId?: string;
}

export interface GoujiPrompt {
  readonly type: "play" | "waiting" | "finished";
  readonly playerId: string | null;
  readonly canPlay: boolean;
  readonly canPass: boolean;
  readonly canYield: boolean;
  readonly mustIncludeJoker: boolean;
}

export interface GoujiGameView {
  readonly kind: "gouji";
  readonly version: 1;
  readonly revision: number;
  readonly actionPromptId: string;
  readonly status: "playing" | "finished";
  readonly currentPlayerId: string;
  readonly leadPlayerId: string;
  readonly players: GoujiPlayerView[];
  readonly trick: GoujiTrickView | null;
  readonly prompt: GoujiPrompt;
  readonly winner: GoujiWinner | null;
  readonly logs: GoujiLogEntry[];
}

export type GoujiAction =
  | { readonly type: "gouji_play"; readonly playerId: string; readonly cardIds: string[] }
  | { readonly type: "gouji_pass"; readonly playerId: string }
  | { readonly type: "gouji_yield"; readonly playerId: string };

export type GoujiRuleErrorCode =
  | "GOUJI_GAME_FINISHED"
  | "GOUJI_UNKNOWN_PLAYER"
  | "GOUJI_NOT_YOUR_TURN"
  | "GOUJI_INVALID_SELECTION"
  | "GOUJI_INVALID_PATTERN"
  | "GOUJI_MUST_HOLD_THREES"
  | "GOUJI_MUST_PLAY_ALL_FOURS"
  | "GOUJI_CANNOT_PASS"
  | "GOUJI_ALREADY_PASSED"
  | "GOUJI_CANNOT_YIELD"
  | "GOUJI_ISOLATION"
  | "GOUJI_CANNOT_BEAT"
  | "GOUJI_BURN_REQUIRES_POINT"
  | "GOUJI_BURN_UNSUSTAINABLE"
  | "GOUJI_BURN_REQUIRES_JOKER";

export class GoujiRuleError extends Error {
  constructor(
    readonly code: GoujiRuleErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GoujiRuleError";
  }
}

const BASE_GOUJI_REQUIREMENTS: Readonly<Partial<Record<GoujiRank, number>>> = Object.freeze({
  "10": 5,
  J: 4,
  Q: 3,
  K: 2,
  A: 2,
});

const FINISH_ORDER: readonly GoujiFinishRank[] = ["头科", "二科", "三科", "四科", "二拉", "大拉"];

export function goujiTeamForSeat(seat: number): GoujiTeam {
  return seat % 2 === 0 ? "A" : "B";
}

export function goujiOppositeSeat(seat: number): number {
  return (seat + 3) % 6;
}

export function goujiRankValue(rank: GoujiRank): number {
  return GOUJI_RANKS.length - GOUJI_RANKS.indexOf(rank);
}

function isJoker(rank: GoujiRank): boolean {
  return rank === "big_joker" || rank === "small_joker";
}

function createGoujiDeck(): GoujiCard[] {
  const cards: GoujiCard[] = [];
  let sequence = 0;
  const push = (rank: GoujiRank, suit: GoujiSuit): void => {
    cards.push({ id: `gouji-${rank}-${suit}-${sequence}`, rank, suit });
    sequence += 1;
  };
  const normalRanks = GOUJI_RANKS.filter((rank) =>
    rank !== "big_joker" && rank !== "small_joker" && rank !== "3" && rank !== "4"
  );
  for (let deck = 0; deck < 4; deck += 1) {
    for (const rank of normalRanks) {
      for (const suit of GOUJI_SUITS) push(rank, suit);
    }
    push("small_joker", "joker");
    push("big_joker", "joker");
  }
  for (let index = 0; index < 6; index += 1) {
    push("3", GOUJI_SUITS[index % GOUJI_SUITS.length]!);
    push("4", GOUJI_SUITS[index % GOUJI_SUITS.length]!);
  }
  return cards;
}

function shuffleGoujiCards(
  source: readonly GoujiCard[],
  initialRng: ChaCha20State,
): { cards: GoujiCard[]; rng: ChaCha20State } {
  const cards = [...source];
  let rng = initialRng;
  for (let index = cards.length - 1; index > 0; index -= 1) {
    const generated = randomInteger(rng, index + 1);
    rng = generated.state;
    [cards[index], cards[generated.value]] = [cards[generated.value]!, cards[index]!];
  }
  return { cards, rng };
}

function sortGoujiHand(hand: readonly GoujiCard[]): GoujiCard[] {
  return [...hand].sort((left, right) => {
    const rankDifference = GOUJI_RANKS.indexOf(left.rank) - GOUJI_RANKS.indexOf(right.rank);
    return rankDifference || left.suit.localeCompare(right.suit) || left.id.localeCompare(right.id);
  });
}

function countRank(hand: readonly GoujiCard[], rank: GoujiRank): number {
  return hand.filter((card) => card.rank === rank).length;
}

function paymentCard(hand: readonly GoujiCard[]): GoujiCard | undefined {
  return hand.find((card) => !card.marked && card.rank === "2")
    ?? hand.find((card) => !card.marked && card.rank === "small_joker")
    ?? hand.find((card) => !card.marked && card.rank === "big_joker");
}

function removeById(hand: readonly GoujiCard[], cardId: string): GoujiCard[] {
  return hand.filter((card) => card.id !== cardId);
}

function settleAutomaticPurchase(players: GoujiPlayerState[], rank: "3" | "4"): string[] {
  const messages: string[] = [];
  for (const buyer of players) {
    if (countRank(buyer.hand, rank) > 0) continue;
    const donor = players
      .filter((candidate) => candidate.id !== buyer.id && countRank(candidate.hand, rank) > 1)
      .sort((left, right) => {
        const leftSameTeam = left.team === buyer.team ? 0 : 1;
        const rightSameTeam = right.team === buyer.team ? 0 : 1;
        return leftSameTeam - rightSameTeam ||
          countRank(right.hand, rank) - countRank(left.hand, rank) ||
          left.seat - right.seat;
      })[0];
    if (!donor) continue;
    const purchased = donor.hand.find((card) => card.rank === rank)!;
    donor.hand = removeById(donor.hand, purchased.id);
    buyer.hand.push(purchased);
    const payment = paymentCard(buyer.hand.filter((card) => card.id !== purchased.id));
    if (payment) {
      buyer.hand = removeById(buyer.hand, payment.id);
      donor.hand.push({ ...payment, marked: true });
      messages.push(`${buyer.name} 向 ${donor.name} 买 ${rank}，支付${goujiRankLabel(payment.rank)}`);
    } else {
      messages.push(`${donor.name} 向 ${buyer.name} 免费补发 ${rank}`);
    }
    buyer.hand = sortGoujiHand(buyer.hand);
    donor.hand = sortGoujiHand(donor.hand);
  }
  return messages;
}

function hasNaturalPoint(hand: readonly GoujiCard[]): boolean {
  return !Object.entries(BASE_GOUJI_REQUIREMENTS).some(([rank, count]) =>
    countRank(hand, rank as GoujiRank) >= count!
  );
}

export function parseGoujiPattern(cards: readonly GoujiCard[]): GoujiPattern | null {
  if (cards.length === 0) return null;
  const bigJokers = cards.filter((card) => card.rank === "big_joker");
  const twos = cards.filter((card) => card.rank === "2");
  const mains = cards.filter((card) => !isJoker(card.rank) && card.rank !== "2");

  let mainRank: GoujiRank;
  let mainCount: number;
  let extras: GoujiCard[];
  if (mains.length === 0) {
    if (twos.length > 0 && cards.every((card) => card.rank === "2" || isJoker(card.rank))) {
      mainRank = "2";
      mainCount = twos.length;
      extras = cards.filter((card) => card.rank !== "2");
    } else if (cards.every((card) => card.rank === "big_joker")) {
      mainRank = "big_joker";
      mainCount = cards.length;
      extras = [];
    } else if (cards.every((card) => card.rank === "small_joker")) {
      mainRank = "small_joker";
      mainCount = cards.length;
      extras = [];
    } else {
      return null;
    }
  } else {
    const ranks = new Set(mains.map((card) => card.rank));
    if (ranks.size !== 1) return null;
    mainRank = mains[0]!.rank;
    mainCount = mains.length;
    extras = cards.filter((card) => card.rank !== mainRank);
    if (!extras.every((card) => card.rank === "2" || isJoker(card.rank))) return null;
    if (mainRank === "3" && extras.length > 0) return null;
  }

  const baseRequirement = BASE_GOUJI_REQUIREMENTS[mainRank];
  const isGouji = mainRank === "2" || mainRank === "small_joker" ||
    (baseRequirement !== undefined && mainCount >= baseRequirement);
  const canOpenPoint = extras.length === 0 &&
    baseRequirement !== undefined &&
    mainCount >= baseRequirement;
  return {
    mainRank,
    mainCount,
    cards: [...cards],
    extras,
    bigJokerCount: bigJokers.length,
    isGouji,
    canOpenPoint,
  };
}

export function canGoujiPatternBeat(attacker: GoujiPattern, defender: GoujiPattern): boolean {
  if (
    defender.mainRank === "small_joker" &&
    defender.extras.length === 0 &&
    attacker.mainRank === "big_joker" &&
    attacker.extras.length === 0
  ) {
    return attacker.mainCount === defender.mainCount;
  }
  if (defender.mainRank === "big_joker" && attacker.mainRank === "big_joker") {
    return attacker.cards.length > defender.cards.length;
  }
  if (defender.bigJokerCount > 0) {
    const bigJokersNeeded = defender.bigJokerCount * 2;
    if (attacker.bigJokerCount < bigJokersNeeded) return false;
    let removedBigJokers = 0;
    const attackerRemainder = attacker.cards.filter((card) => {
      if (card.rank !== "big_joker" || removedBigJokers >= bigJokersNeeded) return true;
      removedBigJokers += 1;
      return false;
    });
    const defenderRemainder = defender.cards.filter((card) => card.rank !== "big_joker");
    if (attackerRemainder.length !== defenderRemainder.length) return false;
    if (defenderRemainder.length === 0) return true;
    const nextAttacker = parseGoujiPattern(attackerRemainder);
    const nextDefender = parseGoujiPattern(defenderRemainder);
    return Boolean(
      nextAttacker &&
      nextDefender &&
      goujiRankValue(nextAttacker.mainRank) > goujiRankValue(nextDefender.mainRank)
    );
  }
  return attacker.cards.length === defender.cards.length &&
    goujiRankValue(attacker.mainRank) > goujiRankValue(defender.mainRank);
}

function canSustainBurn(hand: readonly GoujiCard[], selected: readonly GoujiCard[]): boolean {
  const selectedIds = new Set(selected.map((card) => card.id));
  const remainder = hand.filter((card) => !selectedIds.has(card.id));
  const jokerCount = remainder.filter((card) => isJoker(card.rank)).length;
  const remainingRanks = new Set(
    remainder
      .filter((card) => card.rank !== "3" && !isJoker(card.rank))
      .map((card) => card.rank),
  );
  return remainingRanks.size <= jokerCount;
}

function requirePlayer(state: GoujiGameState, playerId: string): GoujiPlayerState {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) throw new GoujiRuleError("GOUJI_UNKNOWN_PLAYER", "玩家不在本局够级中");
  return player;
}

function previousSeat(seat: number): number {
  return (seat + 5) % 6;
}

function upperTeammateSeat(seat: number): number {
  return previousSeat(previousSeat(seat));
}

function nextActivePlayer(
  state: GoujiGameState,
  fromSeat: number,
  skippedPlayerIds: readonly string[] = [],
): GoujiPlayerState | undefined {
  for (let offset = 1; offset <= 6; offset += 1) {
    const seat = (fromSeat + offset) % 6;
    const player = state.players.find((candidate) => candidate.seat === seat);
    if (player && !player.finishedRank && !skippedPlayerIds.includes(player.id)) return player;
  }
  return undefined;
}

function addLog(
  state: GoujiGameState,
  type: GoujiLogEntry["type"],
  message: string,
): void {
  state.logs.push({ id: state.nextLogId, type, message });
  state.nextLogId += 1;
  if (state.logs.length > 300) state.logs.splice(0, state.logs.length - 300);
}

function finishGame(state: GoujiGameState): void {
  const positions = new Map<GoujiFinishRank, number>(
    FINISH_ORDER.map((rank, index) => [rank, index + 1]),
  );
  const score = (team: GoujiTeam) => state.players
    .filter((player) => player.team === team)
    .reduce((total, player) => total + (positions.get(player.finishedRank ?? "大拉") ?? 6), 0);
  const scoreA = score("A");
  const scoreB = score("B");
  const headTeam = state.players.find((player) => player.finishedRank === "头科")?.team ?? "A";
  const team: GoujiTeam = scoreA === scoreB ? headTeam : scoreA < scoreB ? "A" : "B";
  state.status = "finished";
  state.winner = {
    team,
    playerIds: state.players.filter((player) => player.team === team).map((player) => player.id),
  };
  state.trick = null;
  addLog(state, "victory", `${team === "A" ? "甲联" : "乙联"}获胜`);
}

function assignFinishRank(state: GoujiGameState, player: GoujiPlayerState): void {
  if (player.hand.length > 0 || player.finishedRank) return;
  const used = new Set(state.players.map((candidate) => candidate.finishedRank).filter(Boolean));
  player.finishedRank = FINISH_ORDER.find((rank) => !used.has(rank))!;
  addLog(state, "finish", `${player.name} 成为${player.finishedRank}`);
  const remaining = state.players.filter((candidate) => !candidate.finishedRank);
  if (remaining.length === 1) {
    const lastRank = FINISH_ORDER.find((rank) =>
      !state.players.some((candidate) => candidate.finishedRank === rank)
    )!;
    remaining[0]!.finishedRank = lastRank;
    addLog(state, "finish", `${remaining[0]!.name} 成为${lastRank}`);
    finishGame(state);
  }
}

function allOtherActivePlayersPassed(state: GoujiGameState): boolean {
  const trick = state.trick;
  if (!trick) return false;
  return state.players
    .filter((player) => !player.finishedRank && player.id !== trick.fromPlayerId)
    .every((player) => trick.passedPlayerIds.includes(player.id));
}

function resolveTrick(state: GoujiGameState): void {
  const trick = state.trick;
  if (!trick) return;
  const leader = requirePlayer(state, trick.fromPlayerId);
  const nextLeader = leader.finishedRank ? nextActivePlayer(state, leader.seat) : leader;
  if (!nextLeader) {
    finishGame(state);
    return;
  }
  state.trick = null;
  state.currentPlayerId = nextLeader.id;
  state.leadPlayerId = nextLeader.id;
  addLog(state, "system", `落牌，由 ${nextLeader.name} 继续出牌`);
}

function seatsAfterUntil(afterSeat: number, untilSeat: number): number[] {
  const result: number[] = [];
  for (let seat = (afterSeat + 1) % 6; seat !== untilSeat && result.length < 6; seat = (seat + 1) % 6) {
    result.push(seat);
  }
  return result;
}

function advanceTrick(state: GoujiGameState, fromSeat: number): void {
  const trick = state.trick;
  if (!trick) return;
  if (trick.yielded && trick.yieldPlayerId) {
    const yieldPlayer = requirePlayer(state, trick.yieldPlayerId);
    const leader = requirePlayer(state, trick.fromPlayerId);
    const afterYield = seatsAfterUntil(yieldPlayer.seat, leader.seat);
    const allDone = afterYield.every((seat) => {
      const player = state.players.find((candidate) => candidate.seat === seat)!;
      return Boolean(player.finishedRank || trick.passedPlayerIds.includes(player.id));
    });
    if (allDone) {
      state.currentPlayerId = yieldPlayer.id;
      return;
    }
  }
  if (allOtherActivePlayersPassed(state)) {
    resolveTrick(state);
    return;
  }
  const softSkipped = trick.yielded && trick.yieldPlayerId
    ? [...trick.passedPlayerIds, trick.yieldPlayerId]
    : trick.passedPlayerIds;
  const next = nextActivePlayer(state, fromSeat, softSkipped);
  if (!next || next.id === trick.fromPlayerId) {
    resolveTrick(state);
    return;
  }
  state.currentPlayerId = next.id;
}

function canPlayerYield(state: GoujiGameState, player: GoujiPlayerState): boolean {
  const trick = state.trick;
  if (!trick || trick.yielded || trick.passedPlayerIds.includes(player.id)) return false;
  const leader = requirePlayer(state, trick.fromPlayerId);
  if (goujiOppositeSeat(player.seat) !== leader.seat) return false;
  const previous = state.players.find((candidate) => candidate.seat === previousSeat(player.seat))!;
  const upper = state.players.find((candidate) => candidate.seat === upperTeammateSeat(player.seat))!;
  return trick.passedPlayerIds.includes(previous.id) && trick.passedPlayerIds.includes(upper.id);
}

function applyPlay(state: GoujiGameState, action: Extract<GoujiAction, { type: "gouji_play" }>): void {
  const player = requirePlayer(state, action.playerId);
  if (new Set(action.cardIds).size !== action.cardIds.length || action.cardIds.length === 0) {
    throw new GoujiRuleError("GOUJI_INVALID_SELECTION", "请至少选择一张属于你的牌");
  }
  const selectedIds = new Set(action.cardIds);
  const cards = player.hand.filter((card) => selectedIds.has(card.id));
  if (cards.length !== action.cardIds.length) {
    throw new GoujiRuleError("GOUJI_INVALID_SELECTION", "选牌已失效，请重新选择");
  }
  if (cards.some((card) => card.rank === "3") && !player.hand.every((card) => card.rank === "3")) {
    throw new GoujiRuleError("GOUJI_MUST_HOLD_THREES", "憋 3：只有手牌只剩 3 时才能出 3");
  }
  if (cards.some((card) => card.rank === "4")) {
    const allFours = cards.every((card) => card.rank === "4") &&
      cards.length === countRank(player.hand, "4");
    if (!allFours) {
      throw new GoujiRuleError("GOUJI_MUST_PLAY_ALL_FOURS", "4 必须一次打完手中全部的 4");
    }
  }
  const pattern = parseGoujiPattern(cards);
  if (!pattern) throw new GoujiRuleError("GOUJI_INVALID_PATTERN", "牌型无效：主牌点数必须一致，只能挂 2 或王");

  const oldTrick = state.trick;
  let isBurn = false;
  if (oldTrick) {
    if (oldTrick.passedPlayerIds.includes(player.id)) {
      throw new GoujiRuleError("GOUJI_ALREADY_PASSED", "本圈已经过牌，不能再次出牌");
    }
    const leader = requirePlayer(state, oldTrick.fromPlayerId);
    if (oldTrick.pattern.isGouji && leader.team === player.team) {
      throw new GoujiRuleError("GOUJI_ISOLATION", "够级隔离：联邦队友不能压够级牌");
    }
    if (!canGoujiPatternBeat(pattern, oldTrick.pattern)) {
      throw new GoujiRuleError("GOUJI_CANNOT_BEAT", "所选牌无法压过桌面牌型");
    }
    isBurn = oldTrick.pattern.isGouji &&
      leader.team !== player.team &&
      goujiOppositeSeat(leader.seat) !== player.seat;
    if (isBurn && !player.openedPoint) {
      throw new GoujiRuleError("GOUJI_BURN_REQUIRES_POINT", "未开点不能烧牌");
    }
    if (isBurn && !canSustainBurn(player.hand, cards)) {
      throw new GoujiRuleError("GOUJI_BURN_UNSUSTAINABLE", "剩余王不足以一烧到底");
    }
    if (
      oldTrick.burning &&
      oldTrick.burnerPlayerId === player.id &&
      !cards.some((card) => isJoker(card.rank))
    ) {
      throw new GoujiRuleError("GOUJI_BURN_REQUIRES_JOKER", "烧牌后续每手必须挂王");
    }
  }

  player.hand = sortGoujiHand(player.hand.filter((card) => !selectedIds.has(card.id)));
  if (pattern.canOpenPoint && !player.openedPoint) player.openedPoint = true;
  assignFinishRank(state, player);
  if (state.status === "finished") return;

  const passedPlayerIds = oldTrick
    ? oldTrick.passedPlayerIds.filter((playerId) => playerId !== player.id)
    : [];
  const passedAt = oldTrick ? { ...oldTrick.passedAt } : {};
  delete passedAt[player.id];
  if (oldTrick?.yielded && oldTrick.yieldPlayerId && oldTrick.yieldPlayerId !== player.id) {
    if (!passedPlayerIds.includes(oldTrick.yieldPlayerId)) passedPlayerIds.push(oldTrick.yieldPlayerId);
    passedAt[oldTrick.yieldPlayerId] = oldTrick.fromPlayerId;
  }
  const burning = isBurn || Boolean(oldTrick?.burning && oldTrick.burnerPlayerId === player.id);
  state.trick = {
    pattern,
    fromPlayerId: player.id,
    passedPlayerIds,
    passedAt,
    burning,
    burnerPlayerId: burning ? player.id : undefined,
  };
  if (isBurn) player.burnCount += 1;
  addLog(
    state,
    "play",
    `${player.name}${isBurn ? " 烧牌" : " 出牌"}：${describeGoujiPattern(pattern)}${player.openedPoint ? " · 已开点" : ""}`,
  );
  advanceTrick(state, player.seat);
}

function applyPass(state: GoujiGameState, action: Extract<GoujiAction, { type: "gouji_pass" }>): void {
  const player = requirePlayer(state, action.playerId);
  const trick = state.trick;
  if (!trick) throw new GoujiRuleError("GOUJI_CANNOT_PASS", "自由出牌时不能过牌");
  if (trick.passedPlayerIds.includes(player.id)) {
    throw new GoujiRuleError("GOUJI_ALREADY_PASSED", "本圈已经过牌");
  }
  trick.passedPlayerIds.push(player.id);
  trick.passedAt[player.id] = trick.fromPlayerId;
  if (trick.yieldPlayerId === player.id) {
    trick.yielded = false;
    trick.yieldPlayerId = undefined;
  }
  addLog(state, "pass", `${player.name} 过牌`);
  advanceTrick(state, player.seat);
}

function applyYield(state: GoujiGameState, action: Extract<GoujiAction, { type: "gouji_yield" }>): void {
  const player = requirePlayer(state, action.playerId);
  if (!canPlayerYield(state, player)) {
    throw new GoujiRuleError("GOUJI_CANNOT_YIELD", "当前不满足让牌条件");
  }
  const trick = state.trick!;
  trick.yielded = true;
  trick.yieldPlayerId = player.id;
  addLog(state, "pass", `${player.name} 让牌`);
  advanceTrick(state, player.seat);
}

export function applyGoujiAction(state: GoujiGameState, action: GoujiAction): GoujiGameState {
  if (state.status !== "playing") {
    throw new GoujiRuleError("GOUJI_GAME_FINISHED", "本局够级已经结束");
  }
  if (action.playerId !== state.currentPlayerId) {
    throw new GoujiRuleError("GOUJI_NOT_YOUR_TURN", "还没有轮到你操作");
  }
  const next = structuredClone(state);
  if (action.type === "gouji_play") applyPlay(next, action);
  else if (action.type === "gouji_pass") applyPass(next, action);
  else applyYield(next, action);
  next.revision += 1;
  return next;
}

export function forfeitGoujiPlayer(state: GoujiGameState, playerId: string): GoujiGameState {
  if (state.status !== "playing") return state;
  const next = structuredClone(state);
  const player = requirePlayer(next, playerId);
  player.finishedRank = "大拉";
  player.hand = [];
  const winnerTeam: GoujiTeam = player.team === "A" ? "B" : "A";
  next.status = "finished";
  next.trick = null;
  next.winner = {
    team: winnerTeam,
    playerIds: next.players.filter((candidate) => candidate.team === winnerTeam).map((candidate) => candidate.id),
  };
  next.revision += 1;
  addLog(next, "victory", `${player.name} 离席判负，${winnerTeam === "A" ? "甲联" : "乙联"}获胜`);
  return next;
}

export function createGoujiGame(input: {
  readonly players: readonly { id: string; name: string; botTitle?: string }[];
  readonly seed: string;
}): GoujiGameState {
  if (input.players.length !== 6 || new Set(input.players.map((player) => player.id)).size !== 6) {
    throw new GoujiRuleError("GOUJI_INVALID_SELECTION", "够级必须由 6 名不同玩家开始");
  }
  const shuffled = shuffleGoujiCards(createGoujiDeck(), { key: input.seed.toLowerCase(), counter: 0 });
  const quotas = [33, 33, 33, 33, 32, 32] as const;
  let cursor = 0;
  const players: GoujiPlayerState[] = input.players.map((source, seat) => {
    const hand = sortGoujiHand(shuffled.cards.slice(cursor, cursor + quotas[seat]!));
    cursor += quotas[seat]!;
    return {
      id: source.id,
      seat,
      name: source.name,
      ...(source.botTitle ? { botTitle: source.botTitle } : {}),
      team: goujiTeamForSeat(seat),
      hand,
      openedPoint: false,
      naturalPoint: false,
      burnCount: 0,
    };
  });
  const purchaseMessages = [
    ...settleAutomaticPurchase(players, "3"),
    ...settleAutomaticPurchase(players, "4"),
  ];
  for (const player of players) player.naturalPoint = hasNaturalPoint(player.hand);
  const leadRoll = randomInteger(shuffled.rng, 6);
  const leader = players[leadRoll.value]!;
  const logs: GoujiLogEntry[] = [
    { id: 1, type: "system", message: "够级开局：6 人、3V3、196 张牌" },
    ...purchaseMessages.map((message, index): GoujiLogEntry => ({
      id: index + 2,
      type: "system",
      message,
    })),
    {
      id: purchaseMessages.length + 2,
      type: "system",
      message: `${leader.name} 获得首发`,
    },
  ];
  return {
    kind: "gouji",
    version: 1,
    revision: 0,
    status: "playing",
    players,
    currentPlayerId: leader.id,
    leadPlayerId: leader.id,
    trick: null,
    winner: null,
    logs,
    nextLogId: logs.length + 1,
    rng: leadRoll.state,
  };
}

export function goujiActionPromptId(state: GoujiGameState): string {
  return `gouji:${state.revision}:${state.status}:${state.currentPlayerId}`;
}

export function getGoujiGameView(state: GoujiGameState, viewerId: string): GoujiGameView {
  const viewer = requirePlayer(state, viewerId);
  const current = requirePlayer(state, state.currentPlayerId);
  const prompt: GoujiPrompt = state.status === "finished"
    ? {
        type: "finished",
        playerId: null,
        canPlay: false,
        canPass: false,
        canYield: false,
        mustIncludeJoker: false,
      }
    : current.id === viewer.id
      ? {
          type: "play",
          playerId: viewer.id,
          canPlay: true,
          canPass: state.trick !== null,
          canYield: canPlayerYield(state, viewer),
          mustIncludeJoker: Boolean(
            state.trick?.burning && state.trick.burnerPlayerId === viewer.id,
          ),
        }
      : {
          type: "waiting",
          playerId: current.id,
          canPlay: false,
          canPass: false,
          canYield: false,
          mustIncludeJoker: false,
        };
  return {
    kind: "gouji",
    version: 1,
    revision: state.revision,
    actionPromptId: goujiActionPromptId(state),
    status: state.status,
    currentPlayerId: state.currentPlayerId,
    leadPlayerId: state.leadPlayerId,
    players: state.players.map((player) => ({
      id: player.id,
      seat: player.seat,
      name: player.name,
      ...(player.botTitle ? { botTitle: player.botTitle } : {}),
      team: player.team,
      handCount: player.hand.length,
      ...(player.id === viewer.id ? { hand: structuredClone(player.hand) } : {}),
      ...(player.finishedRank ? { finishedRank: player.finishedRank } : {}),
      openedPoint: player.openedPoint,
      naturalPoint: player.naturalPoint,
      burnCount: player.burnCount,
    })),
    trick: state.trick
      ? {
          fromPlayerId: state.trick.fromPlayerId,
          cards: structuredClone(state.trick.pattern.cards),
          mainRank: state.trick.pattern.mainRank,
          cardCount: state.trick.pattern.cards.length,
          isGouji: state.trick.pattern.isGouji,
          passedPlayerIds: [...state.trick.passedPlayerIds],
          burning: Boolean(state.trick.burning),
          ...(state.trick.burnerPlayerId ? { burnerPlayerId: state.trick.burnerPlayerId } : {}),
        }
      : null,
    prompt,
    winner: state.winner ? structuredClone(state.winner) : null,
    logs: structuredClone(state.logs),
  };
}

function candidateBeatSelections(state: GoujiGameState, player: GoujiPlayerState): string[][] {
  const defender = state.trick?.pattern;
  if (!defender) return [];
  const byRank = new Map<GoujiRank, GoujiCard[]>(
    GOUJI_RANKS.map((rank) => [rank, player.hand.filter((card) => card.rank === rank)]),
  );
  const targetSizes = new Set([defender.cards.length]);
  if (defender.bigJokerCount > 0) targetSizes.add(defender.cards.length + defender.bigJokerCount);
  const candidates: string[][] = [];

  const addCandidate = (cards: readonly GoujiCard[]): void => {
    if (cards.length === 0) return;
    const ids = cards.map((card) => card.id);
    const key = [...ids].sort().join("|");
    if (!candidates.some((candidate) => [...candidate].sort().join("|") === key)) candidates.push(ids);
  };

  const bigJokers = byRank.get("big_joker")!;
  const smallJokers = byRank.get("small_joker")!;
  const twos = byRank.get("2")!;
  for (let count = 1; count <= bigJokers.length; count += 1) addCandidate(bigJokers.slice(0, count));
  for (let count = 1; count <= smallJokers.length; count += 1) addCandidate(smallJokers.slice(0, count));

  for (const mainRank of GOUJI_RANKS.filter((rank) =>
    rank !== "big_joker" && rank !== "small_joker"
  )) {
    const mains = byRank.get(mainRank)!;
    for (let mainCount = 1; mainCount <= mains.length; mainCount += 1) {
      if (mainRank === "3" && (mainCount !== mains.length || player.hand.length !== mains.length)) continue;
      if (mainRank === "4" && mainCount !== mains.length) continue;
      for (const targetSize of targetSizes) {
        const extraCount = targetSize - mainCount;
        if (extraCount < 0) continue;
        if ((mainRank === "3" || mainRank === "4") && extraCount > 0) continue;
        const availableTwos = mainRank === "2" ? [] : twos;
        for (let twoCount = 0; twoCount <= Math.min(availableTwos.length, extraCount); twoCount += 1) {
          for (
            let smallCount = 0;
            smallCount <= Math.min(smallJokers.length, extraCount - twoCount);
            smallCount += 1
          ) {
            const bigCount = extraCount - twoCount - smallCount;
            if (bigCount > bigJokers.length) continue;
            addCandidate([
              ...mains.slice(0, mainCount),
              ...availableTwos.slice(0, twoCount),
              ...smallJokers.slice(0, smallCount),
              ...bigJokers.slice(0, bigCount),
            ]);
          }
        }
      }
    }
  }
  return candidates;
}

function isLegalBotPlay(state: GoujiGameState, playerId: string, cardIds: string[]): boolean {
  try {
    applyGoujiAction(state, { type: "gouji_play", playerId, cardIds });
    return true;
  } catch (error) {
    if (error instanceof GoujiRuleError) return false;
    throw error;
  }
}

function candidateLeadSelections(state: GoujiGameState, player: GoujiPlayerState): string[][] {
  const candidates: string[][] = [];
  for (const rank of [...GOUJI_RANKS].reverse()) {
    const ranked = player.hand.filter((card) => card.rank === rank);
    if (ranked.length === 0) continue;
    if (rank === "3" || rank === "4") {
      const cardIds = ranked.map((card) => card.id);
      if (isLegalBotPlay(state, player.id, cardIds)) candidates.push(cardIds);
      continue;
    }
    for (let count = 1; count <= ranked.length; count += 1) {
      const cardIds = ranked.slice(0, count).map((card) => card.id);
      if (isLegalBotPlay(state, player.id, cardIds)) candidates.push(cardIds);
    }
  }
  return candidates;
}

function compareWeakestSelections(
  player: GoujiPlayerState,
  left: readonly string[],
  right: readonly string[],
): number {
  const leftPattern = parseGoujiPattern(
    player.hand.filter((card) => left.includes(card.id)),
  )!;
  const rightPattern = parseGoujiPattern(
    player.hand.filter((card) => right.includes(card.id)),
  )!;
  return left.length - right.length ||
    goujiRankValue(leftPattern.mainRank) - goujiRankValue(rightPattern.mainRank) ||
    leftPattern.extras.length - rightPattern.extras.length;
}

function strategicSelectionCost(
  state: GoujiGameState,
  player: GoujiPlayerState,
  cardIds: readonly string[],
  intelligence: GoujiBotIntelligence,
): number {
  const cards = player.hand.filter((card) => cardIds.includes(card.id));
  const pattern = parseGoujiPattern(cards)!;
  const resourceCost = cards.reduce((total, card) => {
    if (card.rank === "big_joker") return total + 80;
    if (card.rank === "small_joker") return total + 55;
    if (card.rank === "2") return total + 35;
    return total + goujiRankValue(card.rank) * 3;
  }, 0);
  let score =
    goujiRankValue(pattern.mainRank) * 12 +
    resourceCost +
    pattern.extras.length * 24 -
    cards.length * (intelligence >= 5 ? 7 : 3);

  if (cards.length === player.hand.length) score -= 10_000;
  if (!player.openedPoint && pattern.canOpenPoint) score -= intelligence >= 5 ? 90 : 25;
  if (intelligence >= 7 && state.trick) {
    const leader = requirePlayer(state, state.trick.fromPlayerId);
    if (leader.team !== player.team && leader.hand.length <= 5) score -= 70;
  }
  return score;
}

/**
 * A legality-first Gouji bot with the same seven intelligence levels exposed
 * by rooms. Lower levels make seeded, reproducible mistakes; higher levels
 * conserve wild cards, cooperate with teammates and prioritize finishing.
 */
export function chooseGoujiBotAction(
  state: GoujiGameState,
  playerId: string,
  intelligence: GoujiBotIntelligence = 3,
): GoujiAction {
  const player = requirePlayer(state, playerId);
  if (state.currentPlayerId !== playerId) {
    throw new GoujiRuleError("GOUJI_NOT_YOUR_TURN", "机器人尚未轮到操作");
  }
  let botRng: ChaCha20State = {
    key: state.rng.key,
    counter: (state.rng.counter + state.revision * 8 + player.seat) % 0xffff_ff00,
  };
  const randomBelow = (upperExclusive: number): number => {
    const generated = randomInteger(botRng, upperExclusive);
    botRng = generated.state;
    return generated.value;
  };

  const candidates = (state.trick
    ? candidateBeatSelections(state, player)
    : candidateLeadSelections(state, player))
    .filter((cardIds) => isLegalBotPlay(state, playerId, cardIds));

  if (candidates.length === 0) {
    if (state.trick && intelligence >= 5 && canPlayerYield(state, player)) {
      return { type: "gouji_yield", playerId };
    }
    if (state.trick) return { type: "gouji_pass", playerId };
    throw new GoujiRuleError("GOUJI_INVALID_SELECTION", "机器人没有可用的首发牌型");
  }

  const finishing = candidates.find((cardIds) => cardIds.length === player.hand.length);
  if (finishing) return { type: "gouji_play", playerId, cardIds: finishing };

  if (state.trick) {
    if (intelligence === 1 && randomBelow(100) < 45) return { type: "gouji_pass", playerId };
    if (intelligence === 2 && randomBelow(100) < 20) return { type: "gouji_pass", playerId };
    const leader = requirePlayer(state, state.trick.fromPlayerId);
    if (intelligence >= 6 && leader.team === player.team && player.hand.length > 3) {
      return { type: "gouji_pass", playerId };
    }
  }

  if (intelligence === 1) {
    return { type: "gouji_play", playerId, cardIds: candidates[randomBelow(candidates.length)]! };
  }

  const weakest = [...candidates].sort((left, right) =>
    compareWeakestSelections(player, left, right)
  );
  if (intelligence === 2) {
    const window = Math.max(1, Math.ceil(weakest.length / 2));
    return { type: "gouji_play", playerId, cardIds: weakest[randomBelow(window)]! };
  }
  if (intelligence === 3) {
    return { type: "gouji_play", playerId, cardIds: weakest[0]! };
  }

  const strategic = [...candidates].sort((left, right) =>
    strategicSelectionCost(state, player, left, intelligence) -
      strategicSelectionCost(state, player, right, intelligence) ||
    compareWeakestSelections(player, left, right)
  );
  const choice = intelligence === 4 && strategic.length > 1
    ? strategic[randomBelow(Math.min(2, strategic.length))]!
    : strategic[0]!;
  return { type: "gouji_play", playerId, cardIds: choice };
}

export function goujiRankLabel(rank: GoujiRank): string {
  if (rank === "big_joker") return "大王";
  if (rank === "small_joker") return "小王";
  return rank;
}

export function describeGoujiPattern(pattern: GoujiPattern): string {
  const extras = pattern.extras.length > 0
    ? `，挂${pattern.extras.map((card) => goujiRankLabel(card.rank)).join("、")}`
    : "";
  return `${pattern.mainCount} 张 ${goujiRankLabel(pattern.mainRank)}${extras}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isGoujiCard(value: unknown): value is GoujiCard {
  return isRecord(value) &&
    typeof value.id === "string" &&
    GOUJI_RANKS.includes(value.rank as GoujiRank) &&
    [...GOUJI_SUITS, "joker"].includes(value.suit as GoujiSuit) &&
    (value.marked === undefined || typeof value.marked === "boolean");
}

/** Throws when a persisted state cannot safely resume as an authoritative game. */
export function assertRestorableGoujiGameState(value: unknown): asserts value is GoujiGameState {
  if (!isRecord(value) || value.kind !== "gouji" || value.version !== 1) {
    throw new Error("Invalid Gouji game header");
  }
  if (
    !Number.isSafeInteger(value.revision) ||
    (value.revision as number) < 0 ||
    (value.status !== "playing" && value.status !== "finished") ||
    !Array.isArray(value.players) ||
    value.players.length !== 6 ||
    typeof value.currentPlayerId !== "string" ||
    typeof value.leadPlayerId !== "string"
  ) {
    throw new Error("Invalid Gouji game state");
  }
  const ids = new Set<string>();
  const cardIds = new Set<string>();
  const finishRanks = new Set<GoujiFinishRank>();
  for (let seat = 0; seat < value.players.length; seat += 1) {
    const player = value.players[seat];
    if (
      !isRecord(player) ||
      typeof player.id !== "string" ||
      ids.has(player.id) ||
      player.seat !== seat ||
      typeof player.name !== "string" ||
      player.name.length < 1 ||
      player.name.length > 40 ||
      (player.botTitle !== undefined &&
        (typeof player.botTitle !== "string" || player.botTitle.length < 1 || player.botTitle.length > 20)) ||
      player.team !== goujiTeamForSeat(seat) ||
      !Array.isArray(player.hand) ||
      !player.hand.every(isGoujiCard) ||
      typeof player.openedPoint !== "boolean" ||
      typeof player.naturalPoint !== "boolean" ||
      !Number.isSafeInteger(player.burnCount) ||
      (player.finishedRank !== undefined && !FINISH_ORDER.includes(player.finishedRank as GoujiFinishRank))
    ) {
      throw new Error("Invalid Gouji player state");
    }
    for (const card of player.hand as GoujiCard[]) {
      if (cardIds.has(card.id)) throw new Error("Duplicate Gouji card");
      cardIds.add(card.id);
    }
    if (player.finishedRank !== undefined) {
      if (finishRanks.has(player.finishedRank as GoujiFinishRank)) {
        throw new Error("Duplicate Gouji finish rank");
      }
      finishRanks.add(player.finishedRank as GoujiFinishRank);
    }
    ids.add(player.id);
  }
  if (!ids.has(value.currentPlayerId) || !ids.has(value.leadPlayerId)) {
    throw new Error("Gouji game cursor references an unknown player");
  }
  if (
    !Array.isArray(value.logs) ||
    !value.logs.every((log) =>
      isRecord(log) &&
      Number.isSafeInteger(log.id) &&
      (log.id as number) > 0 &&
      ["system", "play", "pass", "finish", "victory"].includes(log.type as string) &&
      typeof log.message === "string" &&
      log.message.length > 0 &&
      log.message.length <= 500
    ) ||
    value.logs.length > 300 ||
    !Number.isSafeInteger(value.nextLogId) ||
    (value.nextLogId as number) <= 0 ||
    !isRecord(value.rng) ||
    typeof value.rng.key !== "string" ||
    !/^[0-9a-f]{64}$/i.test(value.rng.key) ||
    !Number.isSafeInteger(value.rng.counter) ||
    (value.rng.counter as number) < 0 ||
    (value.rng.counter as number) > 0xffff_ffff
  ) {
    throw new Error("Invalid Gouji game metadata");
  }
  if (value.winner !== null) {
    if (
      !isRecord(value.winner) ||
      (value.winner.team !== "A" && value.winner.team !== "B") ||
      !Array.isArray(value.winner.playerIds) ||
      value.winner.playerIds.length !== 3 ||
      !value.winner.playerIds.every((id) => typeof id === "string" && ids.has(id))
    ) {
      throw new Error("Invalid Gouji winner");
    }
  }
  if (
    (value.status === "finished" && value.winner === null) ||
    (value.status === "playing" && value.winner !== null)
  ) {
    throw new Error("Gouji winner does not match game status");
  }
  const currentPlayer = (value.players as unknown as GoujiPlayerState[])
    .find((player) => player.id === value.currentPlayerId);
  if (value.status === "playing" && currentPlayer?.finishedRank) {
    throw new Error("Finished Gouji player cannot hold the active cursor");
  }
  if (value.trick !== null) {
    if (
      !isRecord(value.trick) ||
      !ids.has(value.trick.fromPlayerId as string) ||
      !isRecord(value.trick.pattern) ||
      !Array.isArray(value.trick.pattern.cards) ||
      !value.trick.pattern.cards.every(isGoujiCard) ||
      !Array.isArray(value.trick.passedPlayerIds) ||
      !value.trick.passedPlayerIds.every((id) => typeof id === "string" && ids.has(id)) ||
      new Set(value.trick.passedPlayerIds).size !== value.trick.passedPlayerIds.length ||
      !isRecord(value.trick.passedAt) ||
      (value.trick.burning !== undefined && typeof value.trick.burning !== "boolean") ||
      (value.trick.burnerPlayerId !== undefined &&
        (typeof value.trick.burnerPlayerId !== "string" || !ids.has(value.trick.burnerPlayerId)))
    ) {
      throw new Error("Invalid Gouji trick state");
    }
    const reparsed = parseGoujiPattern(value.trick.pattern.cards);
    if (
      !reparsed ||
      reparsed.mainRank !== value.trick.pattern.mainRank ||
      reparsed.mainCount !== value.trick.pattern.mainCount ||
      reparsed.bigJokerCount !== value.trick.pattern.bigJokerCount ||
      reparsed.isGouji !== value.trick.pattern.isGouji ||
      reparsed.canOpenPoint !== value.trick.pattern.canOpenPoint
    ) {
      throw new Error("Invalid persisted Gouji pattern");
    }
    for (const card of value.trick.pattern.cards as GoujiCard[]) {
      if (cardIds.has(card.id)) throw new Error("Played Gouji card still exists in a hand");
      cardIds.add(card.id);
    }
  }
}
