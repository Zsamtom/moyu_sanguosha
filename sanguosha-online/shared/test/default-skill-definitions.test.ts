import { describe, expect, it } from "vitest";

import { GAME_EVENT_TYPES } from "../src/engine/events.js";
import { FULL_GENERAL_CATALOG } from "../src/full-general-catalog.js";
import {
  DEFAULT_SKILL_RULE_DEFINITIONS,
  DEFAULT_SKILL_RULE_IDS,
  createDefaultSkillRegistry,
} from "../src/skills/default-definitions.js";

const catalogDefaultRulesIds = [...new Set(
  FULL_GENERAL_CATALOG
    .filter((general) => general.pack === "standard" || general.pack === "sp")
    .flatMap((general) => general.skills.map((skill) => skill.rulesId)),
)];

function definition(rulesId: string) {
  const result = DEFAULT_SKILL_RULE_DEFINITIONS.find((candidate) => candidate.rulesId === rulesId);
  if (!result) throw new Error(`missing definition ${rulesId}`);
  return result;
}

function soleTrigger(rulesId: string) {
  const triggers = definition(rulesId).triggers;
  expect(triggers).toHaveLength(1);
  return triggers[0]!;
}

describe("default skill rule definitions", () => {
  it("derives the exact 42 unique rules IDs from the full catalog and proves registry coverage", () => {
    expect(DEFAULT_SKILL_RULE_IDS).toHaveLength(42);
    expect(DEFAULT_SKILL_RULE_DEFINITIONS).toHaveLength(42);
    expect([...DEFAULT_SKILL_RULE_IDS].sort()).toEqual([...catalogDefaultRulesIds].sort());
    expect(DEFAULT_SKILL_RULE_DEFINITIONS.map((entry) => entry.rulesId).sort()).toEqual([...catalogDefaultRulesIds].sort());

    const registry = createDefaultSkillRegistry();
    expect(() => registry.assertCoverage(catalogDefaultRulesIds)).not.toThrow();
    expect(registry.all()).toHaveLength(42);
  });

  it("keeps every catalog category and registers at least one executable dispatch spec per rule", () => {
    for (const general of FULL_GENERAL_CATALOG.filter((candidate) => candidate.pack === "standard" || candidate.pack === "sp")) {
      for (const catalogSkill of general.skills) {
        expect(definition(catalogSkill.rulesId).categories).toContain(catalogSkill.category);
      }
    }

    for (const rule of DEFAULT_SKILL_RULE_DEFINITIONS) {
      expect(rule.triggers.length + rule.active.length + rule.viewAs.length + rule.modifiers.length).toBeGreaterThan(0);
      expect(rule.triggers.every((entry) => (GAME_EVENT_TYPES as readonly string[]).includes(entry.event))).toBe(true);
      expect(rule.triggers.every((entry) => entry.conditionId.startsWith(`${rule.rulesId}.`))).toBe(true);
      expect(rule.triggers.every((entry) => entry.effectId.startsWith(`${rule.rulesId}.`))).toBe(true);
      expect(rule.active.every((entry) => entry.programId.startsWith(`${rule.rulesId}.`))).toBe(true);
      expect(rule.viewAs.every((entry) => entry.programId.startsWith(`${rule.rulesId}.`))).toBe(true);
      expect(rule.modifiers.every((entry) => entry.handlerId.startsWith(`${rule.rulesId}.`))).toBe(true);
    }
  });

  it("maps the remaining damage and judgment skills to their exact event windows", () => {
    expect(soleTrigger("jianxiong")).toMatchObject({ event: "damage_received", compulsory: false });
    expect(soleTrigger("yiji")).toMatchObject({ event: "damage_received", compulsory: false });
    expect(soleTrigger("fankui")).toMatchObject({ event: "damage_received", compulsory: false });
    expect(soleTrigger("ganglie")).toMatchObject({ event: "damage_received", compulsory: false });
    expect(soleTrigger("guicai")).toMatchObject({
      event: "judgment_replacing",
      compulsory: false,
      conditionId: "guicai.owner_has_hand_card_and_judgment_replaceable",
      effectId: "guicai.replace_judgment_with_hand_card",
      priority: 300,
    });
    expect(soleTrigger("tiandu")).toMatchObject({ event: "judgment_finished", compulsory: false });
  });

  it("maps movement, phase and target skills while preserving Liuli-before-Tieqi order", () => {
    expect(soleTrigger("xiaoji")).toMatchObject({ event: "equipment_lost", compulsory: false });
    expect(soleTrigger("lianying")).toMatchObject({ event: "hand_became_empty", compulsory: false });
    expect(soleTrigger("tuxi")).toMatchObject({ event: "phase_started", compulsory: false });
    expect(soleTrigger("guanxing")).toMatchObject({ event: "phase_started", compulsory: false });
    expect(soleTrigger("tieqi")).toMatchObject({ event: "target_confirmed", compulsory: false });
    expect(soleTrigger("liuli")).toMatchObject({ event: "target_confirming", compulsory: false });
    expect(soleTrigger("liuli").priority).toBeGreaterThan(soleTrigger("tieqi").priority);
  });

  it("represents dispatch and active remaining skills without inventing response events", () => {
    expect(definition("hujia").viewAs).toEqual([
      { id: "dispatch_dodge", programId: "hujia.dispatch_wei_dodge", enabledFor: ["use", "respond"] },
    ]);
    expect(definition("jijiang").active).toEqual([
      { id: "request_slash_for_use", programId: "jijiang.request_shu_slash_for_use", usage: "unlimited" },
    ]);
    expect(definition("jijiang").viewAs[0]).toMatchObject({ programId: "jijiang.dispatch_shu_slash" });
    expect(definition("fanjian").active[0]).toMatchObject({ usage: "once_per_phase" });
    expect(definition("lijian").active[0]).toMatchObject({ usage: "once_per_phase" });
  });

  it("registers locked Yongsi and dynamic Weidi lifecycle metadata", () => {
    expect(soleTrigger("yongsi")).toMatchObject({ event: "phase_started", compulsory: true });
    expect(definition("yongsi").modifiers).toEqual([
      {
        id: "draw_living_faction_count",
        query: "draw_count",
        handlerId: "yongsi.add_living_faction_count_to_draw",
        priority: 100,
      },
    ]);

    const weidi = definition("weidi");
    expect(weidi.triggers.map((entry) => entry.event)).toEqual(["game_started", "skill_gained", "skill_lost"]);
    expect(weidi.triggers.every((entry) => entry.compulsory)).toBe(true);
    expect(weidi.triggers.every((entry) => entry.effectId === "weidi.refresh_current_lord_skill")).toBe(true);
    expect(weidi.triggers.find((entry) => entry.event === "skill_gained")).toMatchObject({
      conditionId: "weidi.current_lord_skill_gain_changes_effective_skill",
      priority: 400,
    });
  });
});
