import { describe, expect, it } from "vitest";

import {
  createGame,
  getEffectiveGeneralSkillIds,
  grantSkill,
} from "../src/index.js";

const seed = "6d".repeat(32);

describe("initial intrinsic skill resolution", () => {
  it.each([
    ["deng_ai", ["tuntian", "zaoxian"]],
    ["jiang_wei", ["tiaoxin", "zhiji"]],
    ["liu_chan", ["xiangle", "fangquan", "ruoyu"]],
    ["sun_ce", ["jiang", "yingyang", "hunzi", "zhiba"]],
    ["shen_si_ma_yi", ["renjie", "baiyin", "lianpo"]],
    ["shen_lv_bu", ["kuangbao", "wumou", "wuqian", "shenfen"]],
    ["zuo_ci", ["huashen", "xinsheng"]],
  ] as const)("starts %s with only intrinsic skills", (generalId, expected) => {
    const game = createGame({ playerIds: ["intrinsic-1", "intrinsic-2"], seed });
    const player = game.players[0]!;
    player.generalId = generalId;
    player.role = "lord";

    expect(getEffectiveGeneralSkillIds(game, player.id)).toEqual(expected);
  });

  it.each([
    ["zhu_ge_liang", "guanxing"],
    ["liu_bei", "jijiang"],
    ["zhou_yu", "yingzi"],
    ["sun_jian", "yinghun"],
    ["lv_bu", "wushuang"],
  ] as const)("keeps %s's ordinary %s occurrence intrinsic", (generalId, skillId) => {
    const game = createGame({ playerIds: ["ordinary-1", "ordinary-2"], seed });
    const player = game.players[0]!;
    player.generalId = generalId;
    player.role = "lord";

    expect(getEffectiveGeneralSkillIds(game, player.id)).toContain(skillId);
  });

  it("makes an excluded skill effective after an explicit lifecycle grant", () => {
    const game = createGame({ playerIds: ["grant-1", "grant-2"], seed });
    const player = game.players[0]!;
    player.generalId = "shen_lv_bu";
    expect(getEffectiveGeneralSkillIds(game, player.id)).not.toContain("wushuang");

    grantSkill(game.completeRules.lifecycle, {
      ownerId: player.id,
      skillId: "wushuang",
      sourcePlayerId: player.id,
      sourceSkillId: "wuqian",
      expiry: { type: "permanent" },
    });

    expect(getEffectiveGeneralSkillIds(game, player.id)).toContain("wushuang");
  });
});
