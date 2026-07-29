export const FARM_ACTIONS_PER_TURN = 3;
export const FARM_FINAL_DAY = 12;
export const FARM_PLOT_COUNT = 6;

export const FARM_CROP_IDS = ["wheat", "tomato", "pumpkin"] as const;
export type FarmCropId = (typeof FARM_CROP_IDS)[number];

export interface FarmCropDefinition {
  readonly id: FarmCropId;
  readonly name: string;
  readonly seedCost: number;
  readonly basePrice: number;
  readonly minimumPrice: number;
  readonly maximumPrice: number;
  readonly growthDays: number;
  readonly yield: number;
}

export const FARM_CROPS: Readonly<Record<FarmCropId, FarmCropDefinition>> = {
  wheat: {
    id: "wheat",
    name: "小麦",
    seedCost: 6,
    basePrice: 10,
    minimumPrice: 6,
    maximumPrice: 16,
    growthDays: 2,
    yield: 2,
  },
  tomato: {
    id: "tomato",
    name: "番茄",
    seedCost: 11,
    basePrice: 18,
    minimumPrice: 9,
    maximumPrice: 29,
    growthDays: 3,
    yield: 2,
  },
  pumpkin: {
    id: "pumpkin",
    name: "南瓜",
    seedCost: 18,
    basePrice: 32,
    minimumPrice: 16,
    maximumPrice: 52,
    growthDays: 4,
    yield: 3,
  },
};

export interface FarmPlayerInput {
  readonly id: string;
  readonly name: string;
}

export type FarmCropCounts = Record<FarmCropId, number>;

export interface FarmPlot {
  cropId: FarmCropId | null;
  growth: number;
  watered: boolean;
}

export interface FarmPlayerState {
  readonly id: string;
  readonly seat: number;
  readonly name: string;
  coins: number;
  seeds: FarmCropCounts;
  produce: FarmCropCounts;
  plots: FarmPlot[];
  totalRevenue: number;
  actionsRemaining: number;
}

export interface FarmMarketQuote {
  readonly cropId: FarmCropId;
  price: number;
  previousPrice: number;
  trend: -1 | 0 | 1;
}

export interface FarmLogEntry {
  readonly id: number;
  readonly day: number;
  readonly playerId: string | null;
  readonly text: string;
}

export interface FarmMarketEvent {
  readonly title: string;
  readonly summary: string;
  readonly tone: "neutral" | "surge" | "crash" | "volatile";
  readonly source: "rules" | "llm";
}

export interface FarmMarketDecision {
  readonly title: string;
  readonly summary: string;
  readonly tone: FarmMarketEvent["tone"];
  readonly prices: Record<FarmCropId, number>;
}

export interface FarmRanking {
  readonly playerId: string;
  readonly netWorth: number;
  readonly coins: number;
  readonly revenue: number;
}

export interface FarmWinner {
  readonly playerIds: string[];
  readonly reason: "final_day" | "forfeit";
  readonly rankings: FarmRanking[];
}

export interface FarmGameState {
  readonly kind: "farm";
  readonly version: 1;
  readonly seed: string;
  revision: number;
  status: "playing" | "finished";
  day: number;
  turnIndex: number;
  currentPlayerId: string | null;
  players: FarmPlayerState[];
  market: Record<FarmCropId, FarmMarketQuote>;
  marketEvent: FarmMarketEvent;
  logs: FarmLogEntry[];
  winner: FarmWinner | null;
}

export type FarmAction =
  | {
      readonly type: "farm_buy_seed";
      readonly playerId: string;
      readonly cropId: FarmCropId;
      readonly quantity: number;
    }
  | {
      readonly type: "farm_plant";
      readonly playerId: string;
      readonly cropId: FarmCropId;
      readonly plotIndex: number;
    }
  | {
      readonly type: "farm_water";
      readonly playerId: string;
    }
  | {
      readonly type: "farm_harvest";
      readonly playerId: string;
      readonly plotIndex: number;
    }
  | {
      readonly type: "farm_sell";
      readonly playerId: string;
      readonly cropId: FarmCropId;
      readonly quantity: number;
    }
  | {
      readonly type: "farm_end_turn";
      readonly playerId: string;
    };

export type FarmPrompt =
  | {
      readonly type: "act";
      readonly playerId: string;
      readonly actionsRemaining: number;
    }
  | {
      readonly type: "waiting";
      readonly playerId: string;
    }
  | {
      readonly type: "finished";
      readonly playerId: null;
    };

export interface FarmGameView {
  readonly kind: "farm";
  readonly version: 1;
  readonly revision: number;
  readonly actionPromptId: string;
  readonly status: "playing" | "finished";
  readonly day: number;
  readonly finalDay: number;
  readonly currentPlayerId: string | null;
  readonly crops: Readonly<Record<FarmCropId, FarmCropDefinition>>;
  readonly players: FarmPlayerState[];
  readonly estimatedNetWorth: number;
  readonly market: Record<FarmCropId, FarmMarketQuote>;
  readonly marketEvent: FarmMarketEvent;
  readonly logs: FarmLogEntry[];
  readonly winner: FarmWinner | null;
  readonly prompt: FarmPrompt;
}

export type FarmRuleErrorCode =
  | "FARM_GAME_FINISHED"
  | "FARM_UNKNOWN_PLAYER"
  | "FARM_NOT_YOUR_TURN"
  | "FARM_NO_ACTIONS"
  | "FARM_INVALID_QUANTITY"
  | "FARM_NOT_ENOUGH_COINS"
  | "FARM_INVALID_PLOT"
  | "FARM_PLOT_OCCUPIED"
  | "FARM_NOT_ENOUGH_SEEDS"
  | "FARM_NOTHING_TO_WATER"
  | "FARM_NOT_READY"
  | "FARM_NOT_ENOUGH_PRODUCE";

export class FarmRuleError extends Error {
  constructor(
    readonly code: FarmRuleErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "FarmRuleError";
  }
}

function cropCounts(initial = 0): FarmCropCounts {
  return {
    wheat: initial,
    tomato: initial,
    pumpkin: initial,
  };
}

function hashText(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function quoteForDay(
  seed: string,
  cropId: FarmCropId,
  day: number,
  previousPrice?: number,
): FarmMarketQuote {
  const crop = FARM_CROPS[cropId];
  const range = crop.maximumPrice - crop.minimumPrice + 1;
  const price = crop.minimumPrice + hashText(`${seed}:${cropId}:${day}`) % range;
  const previous = previousPrice ?? crop.basePrice;
  return {
    cropId,
    price,
    previousPrice: previous,
    trend: price === previous ? 0 : price > previous ? 1 : -1,
  };
}

function marketForDay(
  seed: string,
  day: number,
  previous?: Record<FarmCropId, FarmMarketQuote>,
): Record<FarmCropId, FarmMarketQuote> {
  return Object.fromEntries(
    FARM_CROP_IDS.map((cropId) => [
      cropId,
      quoteForDay(seed, cropId, day, previous?.[cropId].price),
    ]),
  ) as Record<FarmCropId, FarmMarketQuote>;
}

export function calculateFarmNetWorth(
  player: FarmPlayerState,
  market: Record<FarmCropId, FarmMarketQuote>,
): number {
  const seedValue = FARM_CROP_IDS.reduce(
    (total, cropId) => total + player.seeds[cropId] * FARM_CROPS[cropId].seedCost,
    0,
  );
  const produceValue = FARM_CROP_IDS.reduce(
    (total, cropId) => total + player.produce[cropId] * market[cropId].price,
    0,
  );
  const fieldValue = player.plots.reduce((total, plot) => {
    if (!plot.cropId) return total;
    const crop = FARM_CROPS[plot.cropId];
    return total + Math.floor(crop.basePrice * Math.min(plot.growth / crop.growthDays, 1));
  }, 0);
  return player.coins + seedValue + produceValue + fieldValue;
}

function rankings(game: FarmGameState, excludedPlayerId?: string): FarmRanking[] {
  return game.players
    .filter((player) => player.id !== excludedPlayerId)
    .map((player) => ({
      playerId: player.id,
      netWorth: calculateFarmNetWorth(player, game.market),
      coins: player.coins,
      revenue: player.totalRevenue,
    }))
    .sort((left, right) =>
      right.netWorth - left.netWorth ||
      right.coins - left.coins ||
      game.players.find((player) => player.id === left.playerId)!.seat -
        game.players.find((player) => player.id === right.playerId)!.seat
    );
}

function addLog(game: FarmGameState, playerId: string | null, text: string): void {
  game.logs.push({
    id: game.revision + 1,
    day: game.day,
    playerId,
    text,
  });
  if (game.logs.length > 24) game.logs.splice(0, game.logs.length - 24);
}

function finishGame(
  game: FarmGameState,
  reason: FarmWinner["reason"],
  excludedPlayerId?: string,
): void {
  const result = rankings(game, excludedPlayerId);
  const best = result[0]?.netWorth;
  game.status = "finished";
  game.currentPlayerId = null;
  game.winner = {
    reason,
    playerIds: result
      .filter((entry) => entry.netWorth === best)
      .map((entry) => entry.playerId),
    rankings: result,
  };
  for (const player of game.players) player.actionsRemaining = 0;
}

function isCropId(value: unknown): value is FarmCropId {
  return typeof value === "string" &&
    (FARM_CROP_IDS as readonly string[]).includes(value);
}

function validQuantity(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 1 && value <= 20;
}

function requirePlot(player: FarmPlayerState, plotIndex: number): FarmPlot {
  if (!Number.isSafeInteger(plotIndex) || plotIndex < 0 || plotIndex >= FARM_PLOT_COUNT) {
    throw new FarmRuleError("FARM_INVALID_PLOT", "田地编号无效");
  }
  return player.plots[plotIndex]!;
}

function consumeAction(player: FarmPlayerState): void {
  if (player.actionsRemaining < 1) {
    throw new FarmRuleError("FARM_NO_ACTIONS", "本回合行动点已经用完");
  }
  player.actionsRemaining -= 1;
}

function advanceDay(game: FarmGameState): void {
  for (const player of game.players) {
    for (const plot of player.plots) {
      if (plot.cropId && plot.watered) {
        plot.growth = Math.min(plot.growth + 1, FARM_CROPS[plot.cropId].growthDays);
      }
      plot.watered = false;
    }
  }
  if (game.day >= FARM_FINAL_DAY) {
    finishGame(game, "final_day");
    addLog(game, null, `第 ${FARM_FINAL_DAY} 日结束，系统按总资产完成结算。`);
    return;
  }
  game.day += 1;
  game.market = marketForDay(game.seed, game.day, game.market);
  game.marketEvent = {
    title: "常规报价",
    summary: "规则市场根据经营周期生成了新一日基准报价，市场导演正在评估供需。",
    tone: "neutral",
    source: "rules",
  };
  addLog(game, null, `第 ${game.day} 日市场报价已更新。`);
}

function actionPromptId(game: FarmGameState): string {
  return ["farm", game.revision, game.day, game.currentPlayerId ?? "finished"].join(":");
}

export function createFarmGame(input: {
  readonly players: FarmPlayerInput[];
  readonly seed: string;
}): FarmGameState {
  if (input.players.length !== 1) {
    throw new Error("农场为单人游戏");
  }
  if (
    new Set(input.players.map((player) => player.id)).size !== input.players.length ||
    input.players.some((player) => player.id.length === 0 || player.name.length === 0)
  ) {
    throw new Error("农场玩家资料无效");
  }
  if (input.seed.length < 1 || input.seed.length > 128) {
    throw new Error("农场随机种子无效");
  }

  const players = input.players.map((player, seat): FarmPlayerState => ({
    ...player,
    seat,
    coins: 80,
    seeds: {
      ...cropCounts(),
      wheat: 2,
      tomato: 1,
    },
    produce: cropCounts(),
    plots: Array.from({ length: FARM_PLOT_COUNT }, (): FarmPlot => ({
      cropId: null,
      growth: 0,
      watered: false,
    })),
    totalRevenue: 0,
    actionsRemaining: seat === 0 ? FARM_ACTIONS_PER_TURN : 0,
  }));

  return {
    kind: "farm",
    version: 1,
    seed: input.seed,
    revision: 0,
    status: "playing",
    day: 1,
    turnIndex: 0,
    currentPlayerId: players[0]!.id,
    players,
    market: marketForDay(input.seed, 1),
    marketEvent: {
      title: "开市公告",
      summary: "第一日采用规则市场基准报价。完成经营记录后，市场导演将更新下一日行情。",
      tone: "neutral",
      source: "rules",
    },
    logs: [{
      id: 0,
      day: 1,
      playerId: null,
      text: "经营周期开始。观察行情，配置你的第一批作物。",
    }],
    winner: null,
  };
}

export function applyFarmAction(
  state: FarmGameState,
  action: FarmAction,
): FarmGameState {
  const game = structuredClone(state);
  if (game.status === "finished") {
    throw new FarmRuleError("FARM_GAME_FINISHED", "本轮经营已经结束");
  }
  const player = game.players.find((candidate) => candidate.id === action.playerId);
  if (!player) {
    throw new FarmRuleError("FARM_UNKNOWN_PLAYER", "玩家不在本局中");
  }
  if (game.currentPlayerId !== player.id) {
    throw new FarmRuleError("FARM_NOT_YOUR_TURN", "当前不是你的经营回合");
  }

  if (action.type === "farm_buy_seed") {
    if (!validQuantity(action.quantity)) {
      throw new FarmRuleError("FARM_INVALID_QUANTITY", "购买数量需为 1 至 20");
    }
    const crop = FARM_CROPS[action.cropId];
    const cost = crop.seedCost * action.quantity;
    if (player.coins < cost) {
      throw new FarmRuleError("FARM_NOT_ENOUGH_COINS", "资金不足，无法购买这些种子");
    }
    consumeAction(player);
    player.coins -= cost;
    player.seeds[action.cropId] += action.quantity;
    addLog(game, player.id, `${player.name} 购入 ${action.quantity} 袋${crop.name}种子，支出 ${cost}。`);
  } else if (action.type === "farm_plant") {
    const plot = requirePlot(player, action.plotIndex);
    if (plot.cropId !== null) {
      throw new FarmRuleError("FARM_PLOT_OCCUPIED", "这块田地已有作物");
    }
    if (player.seeds[action.cropId] < 1) {
      throw new FarmRuleError("FARM_NOT_ENOUGH_SEEDS", "库存中没有对应种子");
    }
    consumeAction(player);
    player.seeds[action.cropId] -= 1;
    plot.cropId = action.cropId;
    plot.growth = 0;
    plot.watered = false;
    addLog(game, player.id, `${player.name} 在 ${action.plotIndex + 1} 号田播种${FARM_CROPS[action.cropId].name}。`);
  } else if (action.type === "farm_water") {
    const eligible = player.plots.filter((plot) =>
      plot.cropId !== null &&
      plot.growth < FARM_CROPS[plot.cropId].growthDays &&
      !plot.watered
    );
    if (eligible.length === 0) {
      throw new FarmRuleError("FARM_NOTHING_TO_WATER", "当前没有需要浇水的作物");
    }
    consumeAction(player);
    for (const plot of eligible) plot.watered = true;
    addLog(game, player.id, `${player.name} 完成全田灌溉，共处理 ${eligible.length} 块田。`);
  } else if (action.type === "farm_harvest") {
    const plot = requirePlot(player, action.plotIndex);
    if (!plot.cropId || plot.growth < FARM_CROPS[plot.cropId].growthDays) {
      throw new FarmRuleError("FARM_NOT_READY", "作物尚未成熟，不能收获");
    }
    const crop = FARM_CROPS[plot.cropId];
    consumeAction(player);
    player.produce[crop.id] += crop.yield;
    plot.cropId = null;
    plot.growth = 0;
    plot.watered = false;
    addLog(game, player.id, `${player.name} 收获 ${crop.yield} 份${crop.name}。`);
  } else if (action.type === "farm_sell") {
    if (!validQuantity(action.quantity)) {
      throw new FarmRuleError("FARM_INVALID_QUANTITY", "出售数量需为 1 至 20");
    }
    if (player.produce[action.cropId] < action.quantity) {
      throw new FarmRuleError("FARM_NOT_ENOUGH_PRODUCE", "仓库中的作物数量不足");
    }
    const quote = game.market[action.cropId];
    const revenue = quote.price * action.quantity;
    consumeAction(player);
    player.produce[action.cropId] -= action.quantity;
    player.coins += revenue;
    player.totalRevenue += revenue;
    quote.price = Math.max(
      FARM_CROPS[action.cropId].minimumPrice,
      quote.price - Math.floor(action.quantity / 2),
    );
    quote.trend = quote.price === quote.previousPrice
      ? 0
      : quote.price > quote.previousPrice ? 1 : -1;
    addLog(game, player.id, `${player.name} 售出 ${action.quantity} 份${FARM_CROPS[action.cropId].name}，收入 ${revenue}。`);
  } else {
    player.actionsRemaining = 0;
    addLog(game, player.id, `${player.name} 提交本日经营记录。`);
    advanceDay(game);
    if (game.status === "playing") {
      player.actionsRemaining = FARM_ACTIONS_PER_TURN;
      game.currentPlayerId = player.id;
    }
  }

  game.revision += 1;
  return game;
}

export function getFarmGameView(
  game: FarmGameState,
  viewerId: string | null,
): FarmGameView {
  if (viewerId !== null && !game.players.some((player) => player.id === viewerId)) {
    throw new FarmRuleError("FARM_UNKNOWN_PLAYER", "玩家不在本局中");
  }
  const prompt: FarmPrompt = game.status === "finished"
    ? { type: "finished", playerId: null }
    : viewerId === game.currentPlayerId
      ? {
          type: "act",
          playerId: viewerId!,
          actionsRemaining: game.players.find((player) => player.id === viewerId)!.actionsRemaining,
        }
      : { type: "waiting", playerId: game.currentPlayerId! };
  return {
    kind: "farm",
    version: 1,
    revision: game.revision,
    actionPromptId: actionPromptId(game),
    status: game.status,
    day: game.day,
    finalDay: FARM_FINAL_DAY,
    currentPlayerId: game.currentPlayerId,
    crops: structuredClone(FARM_CROPS),
    players: structuredClone(game.players),
    estimatedNetWorth: calculateFarmNetWorth(
      game.players.find((player) => player.id === viewerId) ?? game.players[0]!,
      game.market,
    ),
    market: structuredClone(game.market),
    marketEvent: structuredClone(game.marketEvent),
    logs: structuredClone(game.logs),
    winner: game.winner ? structuredClone(game.winner) : null,
    prompt,
  };
}

export function forfeitFarmPlayer(
  state: FarmGameState,
  playerId: string,
): FarmGameState {
  const game = structuredClone(state);
  if (game.status === "finished") return game;
  if (!game.players.some((player) => player.id === playerId)) {
    throw new FarmRuleError("FARM_UNKNOWN_PLAYER", "玩家不在本局中");
  }
  finishGame(game, "forfeit");
  addLog(game, playerId, "一名经营者离场，本轮按当前资产提前结算。");
  game.revision += 1;
  return game;
}

export function applyFarmMarketDecision(
  state: FarmGameState,
  decision: FarmMarketDecision,
): FarmGameState {
  const game = structuredClone(state);
  if (game.status === "finished") return game;
  if (
    typeof decision.title !== "string" ||
    decision.title.trim().length < 1 ||
    decision.title.trim().length > 40 ||
    typeof decision.summary !== "string" ||
    decision.summary.trim().length < 1 ||
    decision.summary.trim().length > 160 ||
    !["neutral", "surge", "crash", "volatile"].includes(decision.tone) ||
    !isRecord(decision.prices) ||
    !FARM_CROP_IDS.every((cropId) => {
      const price = decision.prices[cropId];
      const crop = FARM_CROPS[cropId];
      return Number.isSafeInteger(price) &&
        price >= crop.minimumPrice &&
        price <= crop.maximumPrice;
    })
  ) {
    throw new Error("农场市场导演决策无效");
  }
  for (const cropId of FARM_CROP_IDS) {
    const quote = game.market[cropId];
    const price = decision.prices[cropId];
    quote.price = price;
    quote.trend = price === quote.previousPrice ? 0 : price > quote.previousPrice ? 1 : -1;
  }
  game.marketEvent = {
    title: decision.title.trim(),
    summary: decision.summary.trim(),
    tone: decision.tone,
    source: "llm",
  };
  addLog(game, null, `市场导演：${game.marketEvent.title}。${game.marketEvent.summary}`);
  game.revision += 1;
  return game;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function validCounts(value: unknown): value is FarmCropCounts {
  return isRecord(value) &&
    Object.keys(value).length === FARM_CROP_IDS.length &&
    FARM_CROP_IDS.every((cropId) => isNonNegativeInteger(value[cropId]));
}

export function assertRestorableFarmGameState(
  value: unknown,
): asserts value is FarmGameState {
  if (!isRecord(value) || value.kind !== "farm" || value.version !== 1) {
    throw new Error("农场存档版本无效");
  }
  if (
    typeof value.seed !== "string" ||
    value.seed.length < 1 ||
    value.seed.length > 128 ||
    !isNonNegativeInteger(value.revision) ||
    (value.status !== "playing" && value.status !== "finished") ||
    !Number.isSafeInteger(value.day) ||
    Number(value.day) < 1 ||
    Number(value.day) > FARM_FINAL_DAY ||
    !Number.isSafeInteger(value.turnIndex) ||
    !Array.isArray(value.players) ||
    value.players.length !== 1
  ) {
    throw new Error("农场存档主状态无效");
  }
  const players = value.players;
  const playerIds = new Set<string>();
  for (const [seat, rawPlayer] of players.entries()) {
    if (
      !isRecord(rawPlayer) ||
      typeof rawPlayer.id !== "string" ||
      rawPlayer.id.length === 0 ||
      playerIds.has(rawPlayer.id) ||
      rawPlayer.seat !== seat ||
      typeof rawPlayer.name !== "string" ||
      rawPlayer.name.length === 0 ||
      !isNonNegativeInteger(rawPlayer.coins) ||
      !validCounts(rawPlayer.seeds) ||
      !validCounts(rawPlayer.produce) ||
      !isNonNegativeInteger(rawPlayer.totalRevenue) ||
      !isNonNegativeInteger(rawPlayer.actionsRemaining) ||
      Number(rawPlayer.actionsRemaining) > FARM_ACTIONS_PER_TURN ||
      !Array.isArray(rawPlayer.plots) ||
      rawPlayer.plots.length !== FARM_PLOT_COUNT
    ) {
      throw new Error("农场玩家状态无效");
    }
    for (const rawPlot of rawPlayer.plots) {
      if (
        !isRecord(rawPlot) ||
        (rawPlot.cropId !== null && !isCropId(rawPlot.cropId)) ||
        !isNonNegativeInteger(rawPlot.growth) ||
        typeof rawPlot.watered !== "boolean" ||
        (rawPlot.cropId === null &&
          (rawPlot.growth !== 0 || rawPlot.watered)) ||
        (isCropId(rawPlot.cropId) &&
          Number(rawPlot.growth) > FARM_CROPS[rawPlot.cropId].growthDays)
      ) {
        throw new Error("农场田地状态无效");
      }
    }
    playerIds.add(rawPlayer.id);
  }
  if (Number(value.turnIndex) >= players.length) {
    throw new Error("农场回合索引无效");
  }
  if (!isRecord(value.market) || Object.keys(value.market).length !== FARM_CROP_IDS.length) {
    throw new Error("农场市场状态无效");
  }
  for (const cropId of FARM_CROP_IDS) {
    const quote = value.market[cropId];
    const crop = FARM_CROPS[cropId];
    if (
      !isRecord(quote) ||
      quote.cropId !== cropId ||
      !Number.isSafeInteger(quote.price) ||
      Number(quote.price) < crop.minimumPrice ||
      Number(quote.price) > crop.maximumPrice ||
      !Number.isSafeInteger(quote.previousPrice) ||
      (quote.trend !== -1 && quote.trend !== 0 && quote.trend !== 1)
    ) {
      throw new Error("农场市场报价无效");
    }
  }
  if (
    !isRecord(value.marketEvent) ||
    typeof value.marketEvent.title !== "string" ||
    value.marketEvent.title.length < 1 ||
    value.marketEvent.title.length > 40 ||
    typeof value.marketEvent.summary !== "string" ||
    value.marketEvent.summary.length < 1 ||
    value.marketEvent.summary.length > 160 ||
    !["neutral", "surge", "crash", "volatile"].includes(String(value.marketEvent.tone)) ||
    (value.marketEvent.source !== "rules" && value.marketEvent.source !== "llm")
  ) {
    throw new Error("农场市场事件无效");
  }
  if (
    !Array.isArray(value.logs) ||
    value.logs.length > 24 ||
    value.logs.some((rawLog) =>
      !isRecord(rawLog) ||
      !isNonNegativeInteger(rawLog.id) ||
      !Number.isSafeInteger(rawLog.day) ||
      Number(rawLog.day) < 1 ||
      Number(rawLog.day) > FARM_FINAL_DAY ||
      (rawLog.playerId !== null &&
        (typeof rawLog.playerId !== "string" || !playerIds.has(rawLog.playerId))) ||
      typeof rawLog.text !== "string" ||
      rawLog.text.length === 0
    )
  ) {
    throw new Error("农场日志状态无效");
  }
  if (value.status === "playing") {
    const current = players[Number(value.turnIndex)] as Record<string, unknown>;
    if (
      value.currentPlayerId !== current.id ||
      value.winner !== null ||
      players.some((rawPlayer, seat) =>
        Number((rawPlayer as Record<string, unknown>).actionsRemaining) >
          (seat === Number(value.turnIndex) ? FARM_ACTIONS_PER_TURN : 0)
      )
    ) {
      throw new Error("农场进行中状态无效");
    }
    return;
  }
  if (value.currentPlayerId !== null || !isRecord(value.winner)) {
    throw new Error("农场结算状态无效");
  }
  const winner = value.winner;
  if (
    (winner.reason !== "final_day" && winner.reason !== "forfeit") ||
    !Array.isArray(winner.playerIds) ||
    winner.playerIds.length < 1 ||
    winner.playerIds.some((id) => typeof id !== "string" || !playerIds.has(id)) ||
    !Array.isArray(winner.rankings) ||
    winner.rankings.length < 1 ||
    winner.rankings.length > players.length ||
    winner.rankings.some((entry) =>
      !isRecord(entry) ||
      typeof entry.playerId !== "string" ||
      !playerIds.has(entry.playerId) ||
      !isNonNegativeInteger(entry.netWorth) ||
      !isNonNegativeInteger(entry.coins) ||
      !isNonNegativeInteger(entry.revenue)
    )
  ) {
    throw new Error("农场结算结果无效");
  }
}
