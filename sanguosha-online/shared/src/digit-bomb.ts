import {
  normalizeChaCha20Key,
  randomInteger,
  type ChaCha20State,
} from "./prng.js";

export type DigitBombPhase =
  | "setup"
  | "guess"
  | "feedback"
  | "round_finished"
  | "finished";
export type DigitBombVote = "rematch" | "settle";

export interface DigitBombPlayerInput {
  readonly id: string;
  readonly name: string;
  readonly botTitle?: string;
}

export interface DigitBombGuessRecord {
  readonly value: string;
  feedback: number | null;
}

export interface DigitBombPlayerState {
  readonly id: string;
  readonly seat: number;
  readonly name: string;
  readonly botTitle?: string;
  score: number;
  secret: string | null;
  guesses: DigitBombGuessRecord[];
  vote: DigitBombVote | null;
}

export interface DigitBombPendingGuess {
  readonly guesserId: string;
  readonly responderId: string;
  readonly value: string;
  readonly attempt: number;
}

export interface DigitBombRoundResult {
  readonly winnerId: string;
  readonly attempts: number;
  readonly points: number;
}

export interface DigitBombRanking {
  readonly playerId: string;
  readonly score: number;
}

export interface DigitBombWinner {
  readonly playerIds: string[];
  readonly reason: "settle" | "forfeit";
  readonly rankings: DigitBombRanking[];
}

export interface DigitBombGameState {
  readonly kind: "digit_bomb";
  readonly version: 1;
  revision: number;
  status: "playing" | "finished";
  phase: DigitBombPhase;
  readonly digits: number;
  round: number;
  players: DigitBombPlayerState[];
  roundStarterId: string;
  currentPlayerId: string | null;
  pendingGuess: DigitBombPendingGuess | null;
  roundResult: DigitBombRoundResult | null;
  winner: DigitBombWinner | null;
  rng: ChaCha20State;
}

export type DigitBombAction =
  | {
      readonly type: "digit_bomb_set_secret";
      readonly playerId: string;
      readonly secret: string;
    }
  | {
      readonly type: "digit_bomb_guess";
      readonly playerId: string;
      readonly guess: string;
    }
  | {
      readonly type: "digit_bomb_feedback";
      readonly playerId: string;
      readonly correctPositions: number;
    }
  | {
      readonly type: "digit_bomb_vote";
      readonly playerId: string;
      readonly vote: DigitBombVote;
    };

export interface DigitBombPlayerView {
  readonly id: string;
  readonly seat: number;
  readonly name: string;
  readonly botTitle?: string;
  readonly score: number;
  readonly secretSubmitted: boolean;
  readonly guesses: DigitBombGuessRecord[];
  readonly vote: DigitBombVote | null;
}

export type DigitBombPrompt =
  | { readonly type: "set_secret"; readonly playerId: string }
  | { readonly type: "guess"; readonly playerId: string }
  | {
      readonly type: "feedback";
      readonly playerId: string;
      readonly pendingGuess: DigitBombPendingGuess;
    }
  | {
      readonly type: "vote";
      readonly playerId: string;
      readonly currentVote: DigitBombVote | null;
    }
  | { readonly type: "waiting"; readonly playerId: string | null }
  | { readonly type: "finished"; readonly playerId: null };

export interface DigitBombGameView {
  readonly kind: "digit_bomb";
  readonly version: 1;
  readonly revision: number;
  readonly actionPromptId: string;
  readonly status: "playing" | "finished";
  readonly phase: DigitBombPhase;
  readonly digits: number;
  readonly round: number;
  readonly roundStarterId: string;
  readonly currentPlayerId: string | null;
  readonly players: DigitBombPlayerView[];
  /** The viewing player's secret only; null for spectators or before submission. */
  readonly ownSecret: string | null;
  readonly pendingGuess: DigitBombPendingGuess | null;
  readonly roundResult: DigitBombRoundResult | null;
  readonly winner: DigitBombWinner | null;
  readonly prompt: DigitBombPrompt;
}

export type DigitBombRuleErrorCode =
  | "DIGIT_BOMB_GAME_FINISHED"
  | "DIGIT_BOMB_UNKNOWN_PLAYER"
  | "DIGIT_BOMB_NOT_YOUR_TURN"
  | "DIGIT_BOMB_INVALID_PHASE"
  | "DIGIT_BOMB_INVALID_NUMBER"
  | "DIGIT_BOMB_ALREADY_SUBMITTED"
  | "DIGIT_BOMB_INVALID_FEEDBACK";

export class DigitBombRuleError extends Error {
  constructor(
    readonly code: DigitBombRuleErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DigitBombRuleError";
  }
}

function otherPlayer(game: DigitBombGameState, playerId: string): DigitBombPlayerState {
  return game.players.find((player) => player.id !== playerId)!;
}

function numberPattern(digits: number): RegExp {
  return new RegExp(`^\\d{${digits}}$`);
}

function assertNumber(value: string, digits: number): void {
  if (!numberPattern(digits).test(value)) {
    throw new DigitBombRuleError(
      "DIGIT_BOMB_INVALID_NUMBER",
      `必须输入恰好 ${digits} 位数字`,
    );
  }
}

function scoreForAttempts(attempts: number): number {
  return Math.max(1, Math.min(10, 15 - attempts));
}

function rankings(game: DigitBombGameState): DigitBombRanking[] {
  return [...game.players]
    .sort((left, right) => right.score - left.score || left.seat - right.seat)
    .map((player) => ({ playerId: player.id, score: player.score }));
}

function settleWinner(game: DigitBombGameState): DigitBombWinner {
  const ordered = rankings(game);
  const topScore = ordered[0]!.score;
  return {
    reason: "settle",
    playerIds: ordered.filter((entry) => entry.score === topScore).map((entry) => entry.playerId),
    rankings: ordered,
  };
}

function nextSetupPlayerId(game: DigitBombGameState): string | null {
  return game.players.find((player) => player.secret === null)?.id ?? null;
}

function nextVotePlayerId(game: DigitBombGameState): string | null {
  return game.players.find((player) => player.vote === null)?.id ?? null;
}

function beginNextRound(game: DigitBombGameState): void {
  const previousStarter = game.roundStarterId;
  game.round += 1;
  game.roundStarterId = otherPlayer(game, previousStarter).id;
  game.phase = "setup";
  game.currentPlayerId = game.players[0]!.id;
  game.pendingGuess = null;
  game.roundResult = null;
  for (const player of game.players) {
    player.secret = null;
    player.guesses = [];
    player.vote = null;
  }
}

function actionPromptId(game: DigitBombGameState): string {
  return [
    "digit-bomb",
    game.revision,
    game.round,
    game.phase,
    game.currentPlayerId ?? "all",
  ].join(":");
}

function promptFor(game: DigitBombGameState, viewerId: string | null): DigitBombPrompt {
  if (game.status === "finished") return { type: "finished", playerId: null };
  if (viewerId === null) return { type: "waiting", playerId: game.currentPlayerId };
  const viewer = game.players.find((player) => player.id === viewerId)!;
  if (game.phase === "setup") {
    return viewer.secret === null
      ? { type: "set_secret", playerId: viewer.id }
      : { type: "waiting", playerId: game.currentPlayerId };
  }
  if (game.phase === "guess") {
    return game.currentPlayerId === viewerId
      ? { type: "guess", playerId: viewerId }
      : { type: "waiting", playerId: game.currentPlayerId };
  }
  if (game.phase === "feedback") {
    return game.currentPlayerId === viewerId
      ? {
          type: "feedback",
          playerId: viewerId,
          pendingGuess: structuredClone(game.pendingGuess!),
        }
      : { type: "waiting", playerId: game.currentPlayerId };
  }
  if (game.phase === "round_finished") {
    return {
      type: "vote",
      playerId: viewerId,
      currentVote: viewer.vote,
    };
  }
  return { type: "finished", playerId: null };
}

export function createDigitBombGame(input: {
  readonly players: DigitBombPlayerInput[];
  readonly seed: string;
  readonly digits: number;
}): DigitBombGameState {
  if (input.players.length !== 2) throw new Error("数字炸弹固定为 2 名玩家");
  if (new Set(input.players.map((player) => player.id)).size !== 2) {
    throw new Error("数字炸弹玩家 id 不能重复");
  }
  if (!input.players.every((player) => player.id.length > 0 && player.name.length > 0)) {
    throw new Error("数字炸弹玩家资料无效");
  }
  if (!Number.isSafeInteger(input.digits) || input.digits < 1 || input.digits > 8) {
    throw new Error("数字炸弹密码位数需为 1 至 8");
  }
  let rng: ChaCha20State = {
    key: normalizeChaCha20Key(input.seed),
    counter: 0,
  };
  const first = randomInteger(rng, 2);
  rng = first.state;
  const players = input.players.map((player, seat): DigitBombPlayerState => ({
    ...player,
    seat,
    score: 0,
    secret: null,
    guesses: [],
    vote: null,
  }));
  const starterId = players[first.value]!.id;
  return {
    kind: "digit_bomb",
    version: 1,
    revision: 0,
    status: "playing",
    phase: "setup",
    digits: input.digits,
    round: 1,
    players,
    roundStarterId: starterId,
    currentPlayerId: players[0]!.id,
    pendingGuess: null,
    roundResult: null,
    winner: null,
    rng,
  };
}

export function applyDigitBombAction(
  state: DigitBombGameState,
  action: DigitBombAction,
): DigitBombGameState {
  const game = structuredClone(state);
  if (game.status === "finished") {
    throw new DigitBombRuleError("DIGIT_BOMB_GAME_FINISHED", "游戏已经结束");
  }
  const player = game.players.find((candidate) => candidate.id === action.playerId);
  if (!player) throw new DigitBombRuleError("DIGIT_BOMB_UNKNOWN_PLAYER", "玩家不在本局中");

  if (action.type === "digit_bomb_set_secret") {
    if (game.phase !== "setup") {
      throw new DigitBombRuleError("DIGIT_BOMB_INVALID_PHASE", "当前不能设置密码");
    }
    if (player.secret !== null) {
      throw new DigitBombRuleError("DIGIT_BOMB_ALREADY_SUBMITTED", "本局密码已经提交");
    }
    assertNumber(action.secret, game.digits);
    player.secret = action.secret;
    const next = nextSetupPlayerId(game);
    if (next === null) {
      game.phase = "guess";
      game.currentPlayerId = game.roundStarterId;
    } else {
      game.currentPlayerId = next;
    }
  } else if (action.type === "digit_bomb_guess") {
    if (game.phase !== "guess") {
      throw new DigitBombRuleError("DIGIT_BOMB_INVALID_PHASE", "当前不能猜测");
    }
    if (game.currentPlayerId !== player.id) {
      throw new DigitBombRuleError("DIGIT_BOMB_NOT_YOUR_TURN", "还没有轮到该玩家猜测");
    }
    assertNumber(action.guess, game.digits);
    const responder = otherPlayer(game, player.id);
    const attempt = player.guesses.length + 1;
    player.guesses.push({ value: action.guess, feedback: null });
    game.pendingGuess = {
      guesserId: player.id,
      responderId: responder.id,
      value: action.guess,
      attempt,
    };
    game.phase = "feedback";
    game.currentPlayerId = responder.id;
  } else if (action.type === "digit_bomb_feedback") {
    if (game.phase !== "feedback" || !game.pendingGuess) {
      throw new DigitBombRuleError("DIGIT_BOMB_INVALID_PHASE", "当前没有等待反馈的猜测");
    }
    if (game.currentPlayerId !== player.id || game.pendingGuess.responderId !== player.id) {
      throw new DigitBombRuleError("DIGIT_BOMB_NOT_YOUR_TURN", "应由出题玩家反馈");
    }
    if (
      !Number.isSafeInteger(action.correctPositions) ||
      action.correctPositions < 0 ||
      action.correctPositions > game.digits
    ) {
      throw new DigitBombRuleError(
        "DIGIT_BOMB_INVALID_FEEDBACK",
        `反馈必须为 0 至 ${game.digits}`,
      );
    }
    const guesser = game.players.find(
      (candidate) => candidate.id === game.pendingGuess!.guesserId,
    )!;
    const record = guesser.guesses.at(-1);
    if (!record || record.feedback !== null || record.value !== game.pendingGuess.value) {
      throw new Error("数字炸弹猜测历史与待反馈状态不一致");
    }
    record.feedback = action.correctPositions;
    if (action.correctPositions === game.digits) {
      const attempts = game.pendingGuess.attempt;
      const points = scoreForAttempts(attempts);
      guesser.score += points;
      game.roundResult = { winnerId: guesser.id, attempts, points };
      game.pendingGuess = null;
      game.phase = "round_finished";
      for (const candidate of game.players) candidate.vote = null;
      game.currentPlayerId = game.players[0]!.id;
    } else {
      game.pendingGuess = null;
      game.phase = "guess";
      game.currentPlayerId = player.id;
    }
  } else {
    if (game.phase !== "round_finished") {
      throw new DigitBombRuleError("DIGIT_BOMB_INVALID_PHASE", "当前不能投票");
    }
    player.vote = action.vote;
    const votes = game.players.map((candidate) => candidate.vote);
    if (votes.every((vote) => vote === "rematch")) {
      beginNextRound(game);
    } else if (votes.every((vote) => vote === "settle")) {
      game.status = "finished";
      game.phase = "finished";
      game.currentPlayerId = null;
      game.winner = settleWinner(game);
    } else {
      game.currentPlayerId = nextVotePlayerId(game);
    }
  }

  game.revision += 1;
  return game;
}

export function getDigitBombGameView(
  game: DigitBombGameState,
  viewerId: string | null,
): DigitBombGameView {
  if (viewerId !== null && !game.players.some((player) => player.id === viewerId)) {
    throw new DigitBombRuleError("DIGIT_BOMB_UNKNOWN_PLAYER", "玩家不在本局中");
  }
  const viewer = viewerId === null
    ? undefined
    : game.players.find((player) => player.id === viewerId);
  return {
    kind: "digit_bomb",
    version: 1,
    revision: game.revision,
    actionPromptId: actionPromptId(game),
    status: game.status,
    phase: game.phase,
    digits: game.digits,
    round: game.round,
    roundStarterId: game.roundStarterId,
    currentPlayerId: game.currentPlayerId,
    players: game.players.map((player) => ({
      id: player.id,
      seat: player.seat,
      name: player.name,
      ...(player.botTitle ? { botTitle: player.botTitle } : {}),
      score: player.score,
      secretSubmitted: player.secret !== null,
      guesses: structuredClone(player.guesses),
      vote: player.vote,
    })),
    ownSecret: viewer?.secret ?? null,
    pendingGuess: game.pendingGuess ? structuredClone(game.pendingGuess) : null,
    roundResult: game.roundResult ? structuredClone(game.roundResult) : null,
    winner: game.winner ? structuredClone(game.winner) : null,
    prompt: promptFor(game, viewerId),
  };
}

function matchingPositions(left: string, right: string): number {
  let matches = 0;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] === right[index]) matches += 1;
  }
  return matches;
}

function deterministicDigits(game: DigitBombGameState, player: DigitBombPlayerState): string {
  let rng = game.rng;
  const skip = game.revision + game.round * 5 + player.seat * 11;
  for (let index = 0; index < skip; index += 1) rng = randomInteger(rng, 10).state;
  let value = "";
  for (let index = 0; index < game.digits; index += 1) {
    const generated = randomInteger(rng, 10);
    value += String(generated.value);
    rng = generated.state;
  }
  return value;
}

function botGuess(game: DigitBombGameState, player: DigitBombPlayerState): string {
  const tried = new Set(player.guesses.map((record) => record.value));
  if (game.digits <= 5) {
    const limit = 10 ** game.digits;
    const candidates: string[] = [];
    for (let value = 0; value < limit; value += 1) {
      const candidate = String(value).padStart(game.digits, "0");
      if (tried.has(candidate)) continue;
      if (player.guesses.every(
        (record) =>
          record.feedback === null ||
          matchingPositions(candidate, record.value) === record.feedback,
      )) {
        candidates.push(candidate);
      }
    }
    if (candidates.length > 0) {
      const selected = randomInteger(game.rng, candidates.length);
      return candidates[selected.value]!;
    }
  }
  let candidate = deterministicDigits(game, player);
  for (let attempt = 0; attempt < 100 && tried.has(candidate); attempt += 1) {
    candidate = String((Number(candidate) + 1) % (10 ** Math.min(game.digits, 8)))
      .padStart(game.digits, "0");
  }
  return candidate;
}

export function chooseDigitBombBotAction(
  game: DigitBombGameState,
  playerId: string,
): DigitBombAction {
  if (game.status === "finished") {
    throw new DigitBombRuleError("DIGIT_BOMB_GAME_FINISHED", "游戏已经结束");
  }
  const player = game.players.find((candidate) => candidate.id === playerId);
  if (!player) throw new DigitBombRuleError("DIGIT_BOMB_UNKNOWN_PLAYER", "玩家不在本局中");
  if (game.phase === "setup") {
    if (player.secret !== null) {
      throw new DigitBombRuleError("DIGIT_BOMB_ALREADY_SUBMITTED", "本局密码已经提交");
    }
    return {
      type: "digit_bomb_set_secret",
      playerId,
      secret: deterministicDigits(game, player),
    };
  }
  if (game.phase === "guess") {
    if (game.currentPlayerId !== playerId) {
      throw new DigitBombRuleError("DIGIT_BOMB_NOT_YOUR_TURN", "还没有轮到该玩家猜测");
    }
    return { type: "digit_bomb_guess", playerId, guess: botGuess(game, player) };
  }
  if (game.phase === "feedback") {
    if (game.currentPlayerId !== playerId || game.pendingGuess?.responderId !== playerId) {
      throw new DigitBombRuleError("DIGIT_BOMB_NOT_YOUR_TURN", "应由出题玩家反馈");
    }
    if (player.secret === null) throw new Error("数字炸弹机器人没有提交密码");
    return {
      type: "digit_bomb_feedback",
      playerId,
      correctPositions: matchingPositions(game.pendingGuess.value, player.secret),
    };
  }
  if (game.phase === "round_finished") {
    const opponentVote = otherPlayer(game, playerId).vote;
    return {
      type: "digit_bomb_vote",
      playerId,
      vote: opponentVote === "settle" ? "settle" : "rematch",
    };
  }
  throw new DigitBombRuleError("DIGIT_BOMB_GAME_FINISHED", "游戏已经结束");
}

export function forfeitDigitBombPlayer(
  state: DigitBombGameState,
  playerId: string,
): DigitBombGameState {
  const game = structuredClone(state);
  if (game.status === "finished") return game;
  const forfeiting = game.players.find((player) => player.id === playerId);
  if (!forfeiting) {
    throw new DigitBombRuleError("DIGIT_BOMB_UNKNOWN_PLAYER", "玩家不在本局中");
  }
  const winner = otherPlayer(game, playerId);
  game.status = "finished";
  game.phase = "finished";
  game.currentPlayerId = null;
  game.pendingGuess = null;
  game.winner = {
    reason: "forfeit",
    playerIds: [winner.id],
    rankings: [
      { playerId: winner.id, score: winner.score },
      { playerId: forfeiting.id, score: forfeiting.score },
    ],
  };
  game.revision += 1;
  return game;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const keys = Object.keys(value);
  return required.every((key) => key in value) &&
    keys.every((key) => required.includes(key) || optional.includes(key));
}

function assertRanking(
  value: unknown,
  playerIds: ReadonlySet<string>,
): asserts value is DigitBombRanking[] {
  if (!Array.isArray(value) || value.length !== 2) throw new Error("数字炸弹排名无效");
  if (new Set(value.map((entry) => isRecord(entry) ? entry.playerId : undefined)).size !== 2) {
    throw new Error("数字炸弹排名玩家重复");
  }
  for (const entry of value) {
    if (
      !isRecord(entry) ||
      !hasOnlyKeys(entry, ["playerId", "score"]) ||
      typeof entry.playerId !== "string" ||
      !playerIds.has(entry.playerId) ||
      !Number.isSafeInteger(entry.score) ||
      (entry.score as number) < 0
    ) {
      throw new Error("数字炸弹排名无效");
    }
  }
}

export function assertRestorableDigitBombGameState(
  value: unknown,
): asserts value is DigitBombGameState {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "kind", "version", "revision", "status", "phase", "digits", "round", "players",
    "roundStarterId", "currentPlayerId", "pendingGuess", "roundResult", "winner", "rng",
  ])) {
    throw new Error("数字炸弹存档结构无效");
  }
  if (value.kind !== "digit_bomb" || value.version !== 1) throw new Error("数字炸弹存档版本无效");
  if (!Number.isSafeInteger(value.revision) || (value.revision as number) < 0) {
    throw new Error("数字炸弹修订号无效");
  }
  if (!Number.isSafeInteger(value.digits) || (value.digits as number) < 1 || (value.digits as number) > 8) {
    throw new Error("数字炸弹密码位数无效");
  }
  if (!Number.isSafeInteger(value.round) || (value.round as number) < 1) {
    throw new Error("数字炸弹局数无效");
  }
  if (!Array.isArray(value.players) || value.players.length !== 2) {
    throw new Error("数字炸弹玩家数量无效");
  }
  const digits = value.digits as number;
  const playerIds = new Set<string>();
  for (const [seat, rawPlayer] of value.players.entries()) {
    if (
      !isRecord(rawPlayer) ||
      !hasOnlyKeys(
        rawPlayer,
        ["id", "seat", "name", "score", "secret", "guesses", "vote"],
        ["botTitle"],
      ) ||
      typeof rawPlayer.id !== "string" ||
      rawPlayer.id.length === 0 ||
      playerIds.has(rawPlayer.id) ||
      rawPlayer.seat !== seat ||
      typeof rawPlayer.name !== "string" ||
      rawPlayer.name.length === 0 ||
      (rawPlayer.botTitle !== undefined &&
        (typeof rawPlayer.botTitle !== "string" || rawPlayer.botTitle.length === 0)) ||
      !Number.isSafeInteger(rawPlayer.score) ||
      (rawPlayer.score as number) < 0 ||
      (rawPlayer.secret !== null &&
        (typeof rawPlayer.secret !== "string" || !numberPattern(digits).test(rawPlayer.secret))) ||
      !Array.isArray(rawPlayer.guesses) ||
      (rawPlayer.vote !== null &&
        rawPlayer.vote !== "rematch" &&
        rawPlayer.vote !== "settle")
    ) {
      throw new Error("数字炸弹玩家状态无效");
    }
    playerIds.add(rawPlayer.id);
    for (const guess of rawPlayer.guesses) {
      if (
        !isRecord(guess) ||
        !hasOnlyKeys(guess, ["value", "feedback"]) ||
        typeof guess.value !== "string" ||
        !numberPattern(digits).test(guess.value) ||
        (guess.feedback !== null &&
          (!Number.isSafeInteger(guess.feedback) ||
            (guess.feedback as number) < 0 ||
            (guess.feedback as number) > digits))
      ) {
        throw new Error("数字炸弹猜测历史无效");
      }
    }
  }
  if (
    typeof value.roundStarterId !== "string" ||
    !playerIds.has(value.roundStarterId) ||
    (value.currentPlayerId !== null &&
      (typeof value.currentPlayerId !== "string" || !playerIds.has(value.currentPlayerId)))
  ) {
    throw new Error("数字炸弹当前玩家无效");
  }
  if (!isRecord(value.rng) || !hasOnlyKeys(value.rng, ["key", "counter"])) {
    throw new Error("数字炸弹随机状态无效");
  }
  if (
    typeof value.rng.key !== "string" ||
    !/^[0-9a-f]{64}$/.test(value.rng.key) ||
    !Number.isSafeInteger(value.rng.counter) ||
    (value.rng.counter as number) < 0 ||
    (value.rng.counter as number) > 0xffff_ffff
  ) {
    throw new Error("数字炸弹随机状态无效");
  }
  if (
    value.status !== "playing" && value.status !== "finished" ||
    !["setup", "guess", "feedback", "round_finished", "finished"].includes(value.phase as string)
  ) {
    throw new Error("数字炸弹阶段无效");
  }

  const players = value.players as unknown as DigitBombPlayerState[];
  if (value.pendingGuess !== null) {
    if (
      !isRecord(value.pendingGuess) ||
      !hasOnlyKeys(value.pendingGuess, ["guesserId", "responderId", "value", "attempt"]) ||
      typeof value.pendingGuess.guesserId !== "string" ||
      typeof value.pendingGuess.responderId !== "string" ||
      value.pendingGuess.guesserId === value.pendingGuess.responderId ||
      !playerIds.has(value.pendingGuess.guesserId) ||
      !playerIds.has(value.pendingGuess.responderId) ||
      typeof value.pendingGuess.value !== "string" ||
      !numberPattern(digits).test(value.pendingGuess.value) ||
      !Number.isSafeInteger(value.pendingGuess.attempt) ||
      (value.pendingGuess.attempt as number) < 1
    ) {
      throw new Error("数字炸弹待反馈猜测无效");
    }
  }
  if (value.roundResult !== null) {
    if (
      !isRecord(value.roundResult) ||
      !hasOnlyKeys(value.roundResult, ["winnerId", "attempts", "points"]) ||
      typeof value.roundResult.winnerId !== "string" ||
      !playerIds.has(value.roundResult.winnerId) ||
      !Number.isSafeInteger(value.roundResult.attempts) ||
      (value.roundResult.attempts as number) < 1 ||
      value.roundResult.points !== scoreForAttempts(value.roundResult.attempts as number)
    ) {
      throw new Error("数字炸弹本局结果无效");
    }
  }
  if (value.winner !== null) {
    if (
      !isRecord(value.winner) ||
      !hasOnlyKeys(value.winner, ["playerIds", "reason", "rankings"]) ||
      !Array.isArray(value.winner.playerIds) ||
      value.winner.playerIds.length < 1 ||
      value.winner.playerIds.some((id) => typeof id !== "string" || !playerIds.has(id)) ||
      (value.winner.reason !== "settle" && value.winner.reason !== "forfeit")
    ) {
      throw new Error("数字炸弹最终结果无效");
    }
    assertRanking(value.winner.rankings, playerIds);
    const winner = value.winner as unknown as DigitBombWinner;
    if (winner.rankings.some((entry) =>
      players.find((player) => player.id === entry.playerId)?.score !== entry.score
    )) {
      throw new Error("数字炸弹排名与累计分数不一致");
    }
    if (winner.reason === "settle") {
      const expected = settleWinner(value as unknown as DigitBombGameState);
      if (
        winner.playerIds.length !== expected.playerIds.length ||
        winner.playerIds.some((id, index) => id !== expected.playerIds[index]) ||
        winner.rankings.some((entry, index) =>
          entry.playerId !== expected.rankings[index]?.playerId ||
          entry.score !== expected.rankings[index]?.score
        )
      ) {
        throw new Error("数字炸弹结算排名无效");
      }
    } else if (winner.playerIds.length !== 1) {
      throw new Error("数字炸弹判负结果无效");
    }
  }

  if (value.status === "finished") {
    if (
      value.phase !== "finished" ||
      value.currentPlayerId !== null ||
      value.pendingGuess !== null ||
      value.winner === null
    ) {
      throw new Error("数字炸弹终局状态无效");
    }
  } else if (value.phase === "finished" || value.winner !== null) {
    throw new Error("数字炸弹进行中状态无效");
  }
  if (value.phase === "setup") {
    if (
      value.pendingGuess !== null ||
      value.roundResult !== null ||
      players.some((player) => player.guesses.length > 0 || player.vote !== null)
    ) {
      throw new Error("数字炸弹设置阶段无效");
    }
    const next = players.find((player) => player.secret === null)?.id ?? null;
    if (next === null || value.currentPlayerId !== next) throw new Error("数字炸弹设置顺序无效");
  } else if (value.phase === "guess") {
    if (
      players.some((player) => player.secret === null) ||
      value.currentPlayerId === null ||
      value.pendingGuess !== null ||
      value.roundResult !== null ||
      players.some((player) =>
        player.vote !== null ||
        player.guesses.some((guess) => guess.feedback === null)
      )
    ) {
      throw new Error("数字炸弹猜测阶段无效");
    }
  } else if (value.phase === "feedback") {
    const pending = value.pendingGuess as DigitBombPendingGuess | null;
    const guesser = pending
      ? players.find((player) => player.id === pending.guesserId)
      : undefined;
    const record = guesser?.guesses.at(-1);
    if (
      players.some((player) => player.secret === null) ||
      !pending ||
      value.currentPlayerId !== pending.responderId ||
      !record ||
      record.value !== pending.value ||
      record.feedback !== null ||
      record !== guesser?.guesses[pending.attempt - 1] ||
      value.roundResult !== null ||
      players.some((player) => player.vote !== null)
    ) {
      throw new Error("数字炸弹反馈阶段无效");
    }
  } else if (value.phase === "round_finished") {
    const result = value.roundResult as DigitBombRoundResult | null;
    const roundWinner = result
      ? players.find((player) => player.id === result.winnerId)
      : undefined;
    if (
      value.pendingGuess !== null ||
      !result ||
      !roundWinner ||
      roundWinner.guesses.length !== result.attempts ||
      roundWinner.guesses.at(-1)?.feedback !== digits ||
      roundWinner.score < result.points
    ) {
      throw new Error("数字炸弹本局终局状态无效");
    }
  }
}
