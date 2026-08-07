import { describe, expect, it } from "vitest";
import {
  MINE_DEPOSITS,
  MineRuleError,
  applyMineAction,
  assertRestorableMineGameState,
  createFarmingGame,
  createMineGame,
  createRanchGame,
  getMineGameView,
  type MineLinkedEconomy,
} from "../src/index.js";

const start = Date.UTC(2026, 6, 29, 8, 0, 0);

function economy(input: Partial<MineLinkedEconomy> = {}): MineLinkedEconomy {
  const farm = createFarmingGame({
    ownerId: "owner",
    ownerName: "经营者",
    seed: "farm-seed",
    now: start,
  });
  const ranch = createRanchGame({
    ownerId: "owner",
    ownerName: "经营者",
    seed: "ranch-seed",
    now: start,
  });
  return {
    farmRevision: input.farmRevision ?? farm.revision,
    farmLevel: input.farmLevel ?? 6,
    coins: input.coins ?? 3_000,
    farmProduce: input.farmProduce ?? farm.produce,
    ranchRevision: input.ranchRevision ?? ranch.revision,
    ranchLevel: input.ranchLevel ?? 3,
    ranchProducts: input.ranchProducts ?? {
      ...ranch.products,
      egg: 10,
      rabbit_fur: 10,
      duck_egg: 10,
      wool: 10,
      milk: 10,
      goat_milk: 10,
    },
  };
}

describe("linked mine engine", () => {
  it("normalizes historical duplicate log ids before an action appends a new entry", () => {
    const mine = createMineGame({
      ownerId: "owner",
      ownerName: "经营者",
      seed: "mine-log-ids",
      now: start,
    });
    mine.logs.push({ ...mine.logs[0]!, text: "重复旧日志" });
    const view = getMineGameView(
      mine,
      economy({ farmLevel: 1, ranchLevel: 1 }),
      start,
    );
    expect(new Set(view.logs.map((entry) => entry.id)).size)
      .toBe(view.logs.length);

    const result = applyMineAction(
      mine,
      economy({ farmLevel: 1, ranchLevel: 1 }),
      { type: "mine_start", depositId: "coal", shaftIndex: 0 },
      start,
    );
    expect(new Set(result.mine.logs.map((entry) => entry.id)).size)
      .toBe(result.mine.logs.length);
  });

  it("opens starter deposits on day one while retaining deeper progression", () => {
    const mine = createMineGame({
      ownerId: "owner",
      ownerName: "经营者",
      seed: "mine-seed",
      now: start,
    });
    expect(getMineGameView(
      mine,
      economy({ ranchLevel: 1 }),
      start,
    ).unlocked).toBe(true);
    expect(() => applyMineAction(
      mine,
      economy({ farmLevel: 1, ranchLevel: 1 }),
      { type: "mine_start", depositId: "coal", shaftIndex: 0 },
      start,
    )).not.toThrow();
    expect(() => applyMineAction(
      mine,
      economy({ farmLevel: 1, ranchLevel: 1 }),
      { type: "mine_start", depositId: "copper", shaftIndex: 0 },
      start,
    )).toThrowError(MineRuleError);
  });

  it("uses the same market modifier in mine cards and account settlement", () => {
    const mine = createMineGame({
      ownerId: "owner",
      ownerName: "经营者",
      seed: "mine-market",
      now: start,
    });
    mine.ores.coal = 1;
    const production = {
      yieldPercent: 0,
      durationPercent: 0,
      label: "灾期市场",
      marketBuyPercent: 25,
      marketSellPercent: 25,
    };
    const linked = economy({ farmLevel: 1, ranchLevel: 1 });
    const view = getMineGameView(mine, linked, start, production);
    expect(view.deposits.coal.expeditionCost).toBe(25);
    expect(view.deposits.coal.orePrice).toBe(35);

    const started = applyMineAction(
      mine,
      linked,
      { type: "mine_start", depositId: "coal", shaftIndex: 0 },
      start,
      production,
    );
    expect(started.economy.coins).toBe(linked.coins - 25);
    const sold = applyMineAction(
      started.mine,
      started.economy,
      { type: "mine_sell", depositId: "coal", quantity: 1 },
      start + 1,
      production,
    );
    expect(sold.economy.coins).toBe(linked.coins + 10);
  });

  it("consumes farm coins and ranch rations, then returns ore revenue", () => {
    let mine = createMineGame({
      ownerId: "owner",
      ownerName: "经营者",
      seed: "mine-seed",
      now: start,
    });
    let linked = economy();

    let result = applyMineAction(
      mine,
      linked,
      { type: "mine_start", depositId: "coal", shaftIndex: 0 },
      start,
    );
    mine = result.mine;
    linked = result.economy;
    expect(linked.coins).toBe(3_000 - MINE_DEPOSITS.coal.expeditionCost);
    expect(linked.ranchProducts.egg).toBe(9);
    expect(result).toMatchObject({ farmChanged: true, ranchChanged: true });

    const readyAt = start + MINE_DEPOSITS.coal.durationSeconds * 1_000;
    result = applyMineAction(
      mine,
      linked,
      { type: "mine_reinforce", shaftIndex: 0 },
      readyAt,
    );
    expect(result.economy.ranchProducts.rabbit_fur).toBe(9);
    result = applyMineAction(
      result.mine,
      result.economy,
      { type: "mine_collect", shaftIndex: 0 },
      readyAt,
    );
    expect(result.mine.ores.coal).toBe(MINE_DEPOSITS.coal.yield + 1);

    result = applyMineAction(
      result.mine,
      result.economy,
      { type: "mine_sell", depositId: "coal", quantity: 2 },
      readyAt,
    );
    expect(result.mine.ores.coal).toBe(MINE_DEPOSITS.coal.yield - 1);
    expect(result.economy.coins).toBe(
      3_000 -
      MINE_DEPOSITS.coal.expeditionCost +
      MINE_DEPOSITS.coal.orePrice * 2,
    );
  });

  it("reinforces and collects every eligible shaft in one revision", () => {
    let mine = createMineGame({
      ownerId: "owner",
      ownerName: "经营者",
      seed: "mine-batch",
      now: start,
    });
    let linked = economy();
    for (const shaftIndex of [0, 1]) {
      const result = applyMineAction(
        mine,
        linked,
        { type: "mine_start", depositId: "coal", shaftIndex },
        start,
      );
      mine = result.mine;
      linked = result.economy;
    }
    const readyAt = start + MINE_DEPOSITS.coal.durationSeconds * 1_000;
    const mineRevision = mine.revision;
    const ranchRevision = linked.ranchRevision;
    let result = applyMineAction(
      mine,
      linked,
      { type: "mine_reinforce_all" },
      readyAt,
    );
    expect(result.mine.revision).toBe(mineRevision + 1);
    expect(result.economy.ranchRevision).toBe(ranchRevision + 1);
    expect(result.mine.shafts.slice(0, 2).every(({ reinforced }) => reinforced))
      .toBe(true);

    const collectRevision = result.mine.revision;
    result = applyMineAction(
      result.mine,
      result.economy,
      { type: "mine_collect_all" },
      readyAt,
    );
    expect(result.mine.revision).toBe(collectRevision + 1);
    expect(result.mine.ores.coal).toBe((MINE_DEPOSITS.coal.yield + 1) * 2);
    expect(result.mine.shafts.slice(0, 2).every(({ depositId }) => depositId === null))
      .toBe(true);
  });

  it("captures disaster-time efficiency when an expedition starts", () => {
    const mine = createMineGame({
      ownerId: "owner",
      ownerName: "经营者",
      seed: "mine-weather",
      now: start,
    });
    let result = applyMineAction(
      mine,
      economy(),
      { type: "mine_start", depositId: "coal", shaftIndex: 0 },
      start,
      { yieldPercent: 50, durationPercent: -20, label: "应急排采" },
    );
    const shaft = result.mine.shafts[0]!;
    expect(shaft.completesAt! - shaft.startedAt!).toBe(
      MINE_DEPOSITS.coal.durationSeconds * 800,
    );
    shaft.hazardAt = null;
    result = applyMineAction(
      result.mine,
      result.economy,
      { type: "mine_collect", shaftIndex: 0 },
      shaft.completesAt!,
    );
    expect(result.mine.ores.coal).toBe(
      Math.round(MINE_DEPOSITS.coal.yield * 1.5),
    );
  });

  it("makes reinforcement worth two units versus ignoring the risk point", () => {
    let mine = createMineGame({
      ownerId: "owner",
      ownerName: "经营者",
      seed: "mine-seed",
      now: start,
    });
    let result = applyMineAction(
      mine,
      economy(),
      { type: "mine_start", depositId: "iron", shaftIndex: 0 },
      start,
    );
    mine = applyMineAction(
      result.mine,
      result.economy,
      { type: "mine_collect", shaftIndex: 0 },
      start + MINE_DEPOSITS.iron.durationSeconds * 1_000,
    ).mine;

    expect(mine.ores.iron).toBe(MINE_DEPOSITS.iron.yield - 1);
  });

  it("abandons an active expedition without refunding its linked resources", () => {
    const mine = createMineGame({
      ownerId: "owner",
      ownerName: "经营者",
      seed: "mine-seed",
      now: start,
    });
    let result = applyMineAction(
      mine,
      economy(),
      { type: "mine_start", depositId: "coal", shaftIndex: 0 },
      start,
    );
    const coinsAfterStart = result.economy.coins;
    const eggsAfterStart = result.economy.ranchProducts.egg;

    result = applyMineAction(
      result.mine,
      result.economy,
      { type: "mine_abandon", shaftIndex: 0 },
      start + 1,
    );

    expect(result.mine.shafts[0]).toMatchObject({
      depositId: null,
      startedAt: null,
      completesAt: null,
    });
    expect(result.economy.coins).toBe(coinsAfterStart);
    expect(result.economy.ranchProducts.egg).toBe(eggsAfterStart);
    expect(result).toMatchObject({ farmChanged: false, ranchChanged: false });
    expect(() => applyMineAction(
      result.mine,
      result.economy,
      { type: "mine_abandon", shaftIndex: 0 },
      start + 2,
    )).toThrow("矿井当前没有采掘任务");
  });

  it("strictly validates restorable mine saves", () => {
    const mine = createMineGame({
      ownerId: "owner",
      ownerName: "经营者",
      seed: "mine-seed",
      now: start,
    });
    expect(() => assertRestorableMineGameState(mine)).not.toThrow();
    expect(() => assertRestorableMineGameState({
      ...mine,
      ores: { ...mine.ores, gold: -1 },
    })).toThrow("矿山主状态无效");
  });
});
