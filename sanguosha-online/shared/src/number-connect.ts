import {
  normalizeChaCha20Key,
  randomInteger,
  type ChaCha20State,
} from "./prng.js";

export const NUMBER_CONNECT_SIZE = 5;
export const NUMBER_CONNECT_CELL_COUNT = NUMBER_CONNECT_SIZE ** 2;
export const NUMBER_CONNECT_TARGET_LINES = 5;

export interface NumberConnectPlayerInput {
  readonly id: string;
  readonly name: string;
  readonly botTitle?: string;
}

export interface NumberConnectPlayerState {
  readonly id: string;
  readonly seat: number;
  readonly name: string;
  readonly botTitle?: string;
  readonly board: number[];
  lineCount: number;
}

export interface NumberConnectRanking {
  readonly playerId: string;
  readonly lineCount: number;
}

export interface NumberConnectWinner {
  readonly playerIds: string[];
  readonly reason: "lines" | "forfeit";
  readonly rankings: NumberConnectRanking[];
}

export interface NumberConnectGameState {
  readonly kind: "number_connect";
  readonly version: 1;
  revision: number;
  status: "playing" | "finished";
  players: NumberConnectPlayerState[];
  currentPlayerId: string | null;
  calledNumbers: number[];
  lastNumber: number | null;
  winner: NumberConnectWinner | null;
}

export type NumberConnectAction = {
  readonly type: "number_connect_call";
  readonly playerId: string;
  readonly number: number;
};

export interface NumberConnectPlayerView {
  readonly id: string;
  readonly seat: number;
  readonly name: string;
  readonly botTitle?: string;
  readonly lineCount: number;
  /** Only the viewer's board is ever present in a private game view. */
  readonly board?: number[];
}

export type NumberConnectPrompt =
  | {
      readonly type: "call";
      readonly playerId: string;
      readonly availableNumbers: number[];
    }
  | { readonly type: "waiting"; readonly playerId: string }
  | { readonly type: "finished"; readonly playerId: null };

export interface NumberConnectGameView {
  readonly kind: "number_connect";
  readonly version: 1;
  readonly revision: number;
  readonly actionPromptId: string;
  readonly status: "playing" | "finished";
  readonly currentPlayerId: string | null;
  readonly players: NumberConnectPlayerView[];
  readonly calledNumbers: number[];
  readonly lastNumber: number | null;
  readonly winner: NumberConnectWinner | null;
  readonly prompt: NumberConnectPrompt;
}

export type NumberConnectRuleErrorCode =
  | "NUMBER_CONNECT_GAME_FINISHED"
  | "NUMBER_CONNECT_UNKNOWN_PLAYER"
  | "NUMBER_CONNECT_NOT_YOUR_TURN"
  | "NUMBER_CONNECT_INVALID_NUMBER"
  | "NUMBER_CONNECT_NUMBER_ALREADY_CALLED";

export class NumberConnectRuleError extends Error {
  constructor(
    readonly code: NumberConnectRuleErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "NumberConnectRuleError";
  }
}

const WINNING_LINES: readonly (readonly number[])[] = [
  ...Array.from({ length: NUMBER_CONNECT_SIZE }, (_, row) =>
    Array.from(
      { length: NUMBER_CONNECT_SIZE },
      (_, column) => row * NUMBER_CONNECT_SIZE + column,
    ),
  ),
  ...Array.from({ length: NUMBER_CONNECT_SIZE }, (_, column) =>
    Array.from(
      { length: NUMBER_CONNECT_SIZE },
      (_, row) => row * NUMBER_CONNECT_SIZE + column,
    ),
  ),
  Array.from(
    { length: NUMBER_CONNECT_SIZE },
    (_, index) => index * NUMBER_CONNECT_SIZE + index,
  ),
  Array.from(
    { length: NUMBER_CONNECT_SIZE },
    (_, index) => index * NUMBER_CONNECT_SIZE + (NUMBER_CONNECT_SIZE - 1 - index),
  ),
];

function isValidNumber(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 1 && value <= NUMBER_CONNECT_CELL_COUNT;
}

function isPermutation(board: readonly number[]): boolean {
  return board.length === NUMBER_CONNECT_CELL_COUNT &&
    board.every(isValidNumber) &&
    new Set(board).size === NUMBER_CONNECT_CELL_COUNT;
}

export function getNumberConnectCompletedLines(
  board: readonly number[],
  calledNumbers: ReadonlySet<number> | readonly number[],
): number {
  if (!isPermutation(board)) throw new Error("数字连连看棋盘无效");
  const called = calledNumbers instanceof Set
    ? calledNumbers
    : new Set(calledNumbers);
  return WINNING_LINES.filter((line) =>
    line.every((index) => called.has(board[index]!))
  ).length;
}

function shuffleBoard(
  initialState: ChaCha20State,
): { board: number[]; state: ChaCha20State } {
  const board = Array.from(
    { length: NUMBER_CONNECT_CELL_COUNT },
    (_, index) => index + 1,
  );
  let state = initialState;
  for (let index = board.length - 1; index > 0; index -= 1) {
    const generated = randomInteger(state, index + 1);
    state = generated.state;
    [board[index], board[generated.value]] = [board[generated.value]!, board[index]!];
  }
  return { board, state };
}

function ensurePositionallyDistinctBoards(
  firstBoard: readonly number[],
  secondBoard: number[],
): void {
  const matchingIndexes = firstBoard
    .map((number, index) => secondBoard[index] === number ? index : -1)
    .filter((index) => index >= 0);
  if (matchingIndexes.length === 0) return;

  if (matchingIndexes.length === 1) {
    const matchingIndex = matchingIndexes[0]!;
    const swapIndex = matchingIndex === 0 ? 1 : 0;
    [secondBoard[matchingIndex], secondBoard[swapIndex]] = [
      secondBoard[swapIndex]!,
      secondBoard[matchingIndex]!,
    ];
    return;
  }

  const matchingValues = matchingIndexes.map((index) => secondBoard[index]!);
  matchingIndexes.forEach((index, position) => {
    secondBoard[index] = matchingValues[(position + 1) % matchingValues.length]!;
  });
}

function rankings(game: NumberConnectGameState): NumberConnectRanking[] {
  return [...game.players]
    .sort((left, right) => right.lineCount - left.lineCount || left.seat - right.seat)
    .map((player) => ({ playerId: player.id, lineCount: player.lineCount }));
}

function otherPlayer(
  game: NumberConnectGameState,
  playerId: string,
): NumberConnectPlayerState {
  return game.players.find((player) => player.id !== playerId)!;
}

function actionPromptId(game: NumberConnectGameState): string {
  return [
    "number-connect",
    game.revision,
    game.status,
    game.currentPlayerId ?? "finished",
  ].join(":");
}

function availableNumbers(game: NumberConnectGameState): number[] {
  const called = new Set(game.calledNumbers);
  return Array.from(
    { length: NUMBER_CONNECT_CELL_COUNT },
    (_, index) => index + 1,
  ).filter((number) => !called.has(number));
}

export function createNumberConnectGame(input: {
  readonly players: NumberConnectPlayerInput[];
  readonly seed: string;
}): NumberConnectGameState {
  if (input.players.length !== 2) throw new Error("数字连连看固定为 2 名玩家");
  if (new Set(input.players.map((player) => player.id)).size !== 2) {
    throw new Error("数字连连看玩家 id 不能重复");
  }
  if (!input.players.every((player) => player.id.length > 0 && player.name.length > 0)) {
    throw new Error("数字连连看玩家资料无效");
  }

  let rng: ChaCha20State = {
    key: normalizeChaCha20Key(input.seed),
    counter: 0,
  };
  const firstBoard = shuffleBoard(rng);
  rng = firstBoard.state;
  const secondBoard = shuffleBoard(rng);
  rng = secondBoard.state;
  ensurePositionallyDistinctBoards(firstBoard.board, secondBoard.board);
  const firstPlayer = randomInteger(rng, 2).value;
  const players = input.players.map((player, seat): NumberConnectPlayerState => ({
    ...player,
    seat,
    board: seat === 0 ? firstBoard.board : secondBoard.board,
    lineCount: 0,
  }));
  return {
    kind: "number_connect",
    version: 1,
    revision: 0,
    status: "playing",
    players,
    currentPlayerId: players[firstPlayer]!.id,
    calledNumbers: [],
    lastNumber: null,
    winner: null,
  };
}

export function applyNumberConnectAction(
  state: NumberConnectGameState,
  action: NumberConnectAction,
): NumberConnectGameState {
  const game = structuredClone(state);
  if (game.status === "finished") {
    throw new NumberConnectRuleError("NUMBER_CONNECT_GAME_FINISHED", "游戏已经结束");
  }
  const player = game.players.find((candidate) => candidate.id === action.playerId);
  if (!player) {
    throw new NumberConnectRuleError("NUMBER_CONNECT_UNKNOWN_PLAYER", "玩家不在本局中");
  }
  if (game.currentPlayerId !== action.playerId) {
    throw new NumberConnectRuleError("NUMBER_CONNECT_NOT_YOUR_TURN", "还没有轮到该玩家");
  }
  if (!isValidNumber(action.number)) {
    throw new NumberConnectRuleError(
      "NUMBER_CONNECT_INVALID_NUMBER",
      "只能选择 1 至 25 的整数",
    );
  }
  if (game.calledNumbers.includes(action.number)) {
    throw new NumberConnectRuleError(
      "NUMBER_CONNECT_NUMBER_ALREADY_CALLED",
      "该数字已经被选择",
    );
  }

  game.calledNumbers.push(action.number);
  game.lastNumber = action.number;
  const called = new Set(game.calledNumbers);
  for (const candidate of game.players) {
    candidate.lineCount = getNumberConnectCompletedLines(candidate.board, called);
  }
  const winners = game.players.filter(
    (candidate) => candidate.lineCount >= NUMBER_CONNECT_TARGET_LINES,
  );
  if (winners.length > 0) {
    game.status = "finished";
    game.currentPlayerId = null;
    game.winner = {
      reason: "lines",
      playerIds: winners.map((candidate) => candidate.id),
      rankings: rankings(game),
    };
  } else {
    game.currentPlayerId = otherPlayer(game, player.id).id;
  }
  game.revision += 1;
  return game;
}

export function getNumberConnectGameView(
  game: NumberConnectGameState,
  viewerId: string | null,
): NumberConnectGameView {
  if (viewerId !== null && !game.players.some((player) => player.id === viewerId)) {
    throw new NumberConnectRuleError("NUMBER_CONNECT_UNKNOWN_PLAYER", "玩家不在本局中");
  }
  const prompt: NumberConnectPrompt = game.status === "finished"
    ? { type: "finished", playerId: null }
    : viewerId === game.currentPlayerId
      ? {
          type: "call",
          playerId: viewerId!,
          availableNumbers: availableNumbers(game),
        }
      : { type: "waiting", playerId: game.currentPlayerId! };
  return {
    kind: "number_connect",
    version: 1,
    revision: game.revision,
    actionPromptId: actionPromptId(game),
    status: game.status,
    currentPlayerId: game.currentPlayerId,
    players: game.players.map((player) => ({
      id: player.id,
      seat: player.seat,
      name: player.name,
      ...(player.botTitle ? { botTitle: player.botTitle } : {}),
      lineCount: player.lineCount,
      ...(player.id === viewerId
        ? { board: [...player.board] }
        : {}),
    })),
    calledNumbers: [...game.calledNumbers],
    lastNumber: game.lastNumber,
    winner: game.winner ? structuredClone(game.winner) : null,
    prompt,
  };
}

export function chooseNumberConnectBotAction(
  game: NumberConnectGameState,
  playerId: string,
): NumberConnectAction {
  if (game.status === "finished") {
    throw new NumberConnectRuleError("NUMBER_CONNECT_GAME_FINISHED", "游戏已经结束");
  }
  const player = game.players.find((candidate) => candidate.id === playerId);
  if (!player) {
    throw new NumberConnectRuleError("NUMBER_CONNECT_UNKNOWN_PLAYER", "玩家不在本局中");
  }
  if (game.currentPlayerId !== playerId) {
    throw new NumberConnectRuleError("NUMBER_CONNECT_NOT_YOUR_TURN", "还没有轮到该玩家");
  }
  const alreadyCalled = new Set(game.calledNumbers);
  const candidates = availableNumbers(game);
  let bestNumber = candidates[0]!;
  let bestScore = -1;
  for (const number of candidates) {
    const nextCalled = new Set(alreadyCalled);
    nextCalled.add(number);
    let score = getNumberConnectCompletedLines(player.board, nextCalled) * 100;
    for (const line of WINNING_LINES) {
      const values = line.map((index) => player.board[index]!);
      if (!values.includes(number)) continue;
      score += values.filter((value) => nextCalled.has(value)).length ** 2;
    }
    if (score > bestScore || (score === bestScore && number < bestNumber)) {
      bestNumber = number;
      bestScore = score;
    }
  }
  return { type: "number_connect_call", playerId, number: bestNumber };
}

export function forfeitNumberConnectPlayer(
  state: NumberConnectGameState,
  playerId: string,
): NumberConnectGameState {
  const game = structuredClone(state);
  if (game.status === "finished") return game;
  const forfeiting = game.players.find((player) => player.id === playerId);
  if (!forfeiting) {
    throw new NumberConnectRuleError("NUMBER_CONNECT_UNKNOWN_PLAYER", "玩家不在本局中");
  }
  const winner = otherPlayer(game, playerId);
  game.status = "finished";
  game.currentPlayerId = null;
  game.winner = {
    reason: "forfeit",
    playerIds: [winner.id],
    rankings: [
      { playerId: winner.id, lineCount: winner.lineCount },
      { playerId: forfeiting.id, lineCount: forfeiting.lineCount },
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

export function assertRestorableNumberConnectGameState(
  value: unknown,
): asserts value is NumberConnectGameState {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "kind", "version", "revision", "status", "players", "currentPlayerId",
    "calledNumbers", "lastNumber", "winner",
  ])) {
    throw new Error("数字连连看存档结构无效");
  }
  if (value.kind !== "number_connect" || value.version !== 1) {
    throw new Error("数字连连看存档版本无效");
  }
  if (!Number.isSafeInteger(value.revision) || (value.revision as number) < 0) {
    throw new Error("数字连连看修订号无效");
  }
  if (!Array.isArray(value.players) || value.players.length !== 2) {
    throw new Error("数字连连看玩家数量无效");
  }
  if (
    !Array.isArray(value.calledNumbers) ||
    !value.calledNumbers.every((number) => typeof number === "number" && isValidNumber(number)) ||
    new Set(value.calledNumbers).size !== value.calledNumbers.length
  ) {
    throw new Error("数字连连看已选数字无效");
  }
  const calledNumbers = value.calledNumbers as number[];
  const playerIds = new Set<string>();
  for (const [seat, rawPlayer] of value.players.entries()) {
    if (
      !isRecord(rawPlayer) ||
      !hasOnlyKeys(rawPlayer, ["id", "seat", "name", "board", "lineCount"], ["botTitle"]) ||
      typeof rawPlayer.id !== "string" ||
      rawPlayer.id.length === 0 ||
      playerIds.has(rawPlayer.id) ||
      rawPlayer.seat !== seat ||
      typeof rawPlayer.name !== "string" ||
      rawPlayer.name.length === 0 ||
      (rawPlayer.botTitle !== undefined &&
        (typeof rawPlayer.botTitle !== "string" || rawPlayer.botTitle.length === 0)) ||
      !Array.isArray(rawPlayer.board) ||
      !rawPlayer.board.every((number) => typeof number === "number") ||
      !isPermutation(rawPlayer.board as number[]) ||
      !Number.isSafeInteger(rawPlayer.lineCount) ||
      rawPlayer.lineCount !== getNumberConnectCompletedLines(
        rawPlayer.board as number[],
        calledNumbers,
      )
    ) {
      throw new Error("数字连连看玩家状态无效");
    }
    playerIds.add(rawPlayer.id);
  }
  const players = value.players as unknown as NumberConnectPlayerState[];
  if (players[0]!.board.some((number, index) => players[1]!.board[index] === number)) {
    throw new Error("数字连连看双方棋盘同一位置不能出现相同数字");
  }
  if (
    value.lastNumber !== (calledNumbers.at(-1) ?? null) ||
    (value.status !== "playing" && value.status !== "finished")
  ) {
    throw new Error("数字连连看阶段无效");
  }
  if (value.status === "playing") {
    if (
      typeof value.currentPlayerId !== "string" ||
      !playerIds.has(value.currentPlayerId) ||
      value.winner !== null ||
      players.some((player) => player.lineCount >= NUMBER_CONNECT_TARGET_LINES)
    ) {
      throw new Error("数字连连看进行中状态无效");
    }
    return;
  }
  if (value.currentPlayerId !== null || !isRecord(value.winner)) {
    throw new Error("数字连连看终局状态无效");
  }
  const winner = value.winner;
  if (
    !hasOnlyKeys(winner, ["playerIds", "reason", "rankings"]) ||
    !Array.isArray(winner.playerIds) ||
    winner.playerIds.length < 1 ||
    winner.playerIds.some((id) => typeof id !== "string" || !playerIds.has(id)) ||
    (winner.reason !== "lines" && winner.reason !== "forfeit") ||
    !Array.isArray(winner.rankings) ||
    winner.rankings.length !== 2 ||
    winner.rankings.some((entry) =>
      !isRecord(entry) ||
      !hasOnlyKeys(entry, ["playerId", "lineCount"]) ||
      typeof entry.playerId !== "string" ||
      !playerIds.has(entry.playerId) ||
      !Number.isSafeInteger(entry.lineCount) ||
      players.find((player) => player.id === entry.playerId)?.lineCount !== entry.lineCount
    )
  ) {
    throw new Error("数字连连看胜负结果无效");
  }
  if (
    winner.reason === "lines" &&
    (winner.playerIds as string[]).some((id) =>
      players.find((player) => player.id === id)!.lineCount < NUMBER_CONNECT_TARGET_LINES
    )
  ) {
    throw new Error("数字连连看连线胜负无效");
  }
  if (winner.reason === "forfeit" && winner.playerIds.length !== 1) {
    throw new Error("数字连连看判负结果无效");
  }
}
