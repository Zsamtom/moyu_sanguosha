import { describe, expect, it } from "vitest";
import { FULL_SKILL_RULE_IDS } from "../src/full-skill-ids.js";
import {
  EXTENSION_SKILL_RULE_DEFINITIONS,
  FULL_SKILL_RULE_DEFINITIONS,
  createFullSkillRegistry,
} from "../src/skills/full-definitions.js";

const byId = (rulesId: string) => {
  const definition = FULL_SKILL_RULE_DEFINITIONS.find((candidate) => candidate.rulesId === rulesId);
  if (!definition) throw new Error(`missing definition ${rulesId}`);
  return definition;
};

describe("complete skill dispatch catalog", () => {
  it("covers every unique rules skill exactly once in canonical order", () => {
    expect(FULL_SKILL_RULE_DEFINITIONS.map((definition) => definition.rulesId)).toEqual(FULL_SKILL_RULE_IDS);
    expect(new Set(FULL_SKILL_RULE_DEFINITIONS.map((definition) => definition.rulesId)).size).toBe(FULL_SKILL_RULE_IDS.length);
    expect(EXTENSION_SKILL_RULE_DEFINITIONS).toHaveLength(FULL_SKILL_RULE_IDS.length - 42);
    expect(FULL_SKILL_RULE_DEFINITIONS.every((definition) =>
      definition.triggers.length + definition.active.length + definition.viewAs.length + definition.modifiers.length > 0
    )).toBe(true);
    expect(() => createFullSkillRegistry()).not.toThrow();
  });

  it("merges lifecycle categories for rules shared by intrinsic and granted skills", () => {
    expect(byId("jijiang").categories).toEqual(expect.arrayContaining(["lord", "post_awakening"]));
    expect(byId("yingzi").categories).toEqual(expect.arrayContaining(["optional", "post_awakening"]));
    expect(byId("wushuang").categories).toEqual(expect.arrayContaining(["locked", "special"]));
  });

  it("registers replacement, per-target, damage, death, pile, and extra-turn entry points", () => {
    expect(byId("guidao").triggers[0]).toMatchObject({ event: "judgment_replacing", priority: 300 });
    expect(byId("tianxiang").triggers[0]).toMatchObject({ event: "damage_redirecting", priority: 250 });
    expect(byId("liegong").triggers[0]).toMatchObject({ event: "target_confirmed", priority: 200 });
    expect(byId("duanchang").triggers[0]).toMatchObject({ event: "death", compulsory: true });
    expect(byId("tuntian").triggers[0]).toMatchObject({ event: "cards_moved" });
    expect(byId("fangquan").triggers.map((entry) => entry.event)).toEqual(["phase_before", "turn_finished"]);
  });

  it("keeps multi-mode transformation skills explicit", () => {
    expect(byId("longhun").viewAs.map((entry) => entry.id)).toEqual([
      "hearts_as_peach",
      "diamonds_as_fire_slash",
      "clubs_as_dodge",
      "spades_as_nullification",
    ]);
    expect(byId("qixing").triggers.map((entry) => entry.event)).toEqual(["game_started", "phase_ended"]);
    expect(byId("shensu").triggers).toHaveLength(2);
  });
});
