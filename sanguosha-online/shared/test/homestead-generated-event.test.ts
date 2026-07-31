import { describe, expect, it } from "vitest";
import {
  HOMESTEAD_WORLD_EVENTS,
  applyHomesteadWorldEventDecision,
  compileHomesteadGeneratedEvent,
  createHomesteadGame,
  refreshHomesteadGame,
} from "../src/homestead.js";

const start = Date.parse("2026-07-30T08:00:00+08:00");

function safeGreenvaleTemplate() {
  return Object.values(HOMESTEAD_WORLD_EVENTS).find(
    (definition) =>
      (definition.townId ?? "greenvale") === "greenvale" &&
      definition.hazard === undefined &&
      definition.options.some(
        (option) =>
          option.coinCost === 0 &&
          option.costs.length === 0 &&
          option.reputationReward >= 0,
      ),
  )!;
}

describe("parameterized homestead generated events", () => {
  it("compiles only a server-whitelisted pacing preset", () => {
    const template = safeGreenvaleTemplate();
    const blueprint = {
      townId: "greenvale" as const,
      dayKey: "2026-07-30",
      templateId: template.id,
      narrative: "A bounded two-day follow-up.",
      pacingId: "two_day_follow_up" as const,
    };

    expect(() =>
      compileHomesteadGeneratedEvent(blueprint, [template.id])
    ).toThrow();

    const compiled = compileHomesteadGeneratedEvent(
      blueprint,
      [template.id],
      {
        allowedPacingIds: ["single_day", "two_day_follow_up"],
      },
    );
    expect(compiled).toMatchObject({
      rulesVersion: 2,
      parameters: {
        pacingId: "two_day_follow_up",
        durationDays: 2,
      },
    });
  });

  it("carries an unresolved two-day event once without changing its economy", () => {
    const template = safeGreenvaleTemplate();
    const game = createHomesteadGame({
      ownerId: "owner",
      ownerName: "Owner",
      seed: "two-day-generated-event",
      now: start,
      townId: "greenvale",
    });
    const compiled = compileHomesteadGeneratedEvent(
      {
        townId: "greenvale",
        dayKey: game.dayKey,
        templateId: template.id,
        narrative: "The same fixed options remain available tomorrow.",
        pacingId: "two_day_follow_up",
      },
      [template.id],
      {
        allowedPacingIds: ["single_day", "two_day_follow_up"],
      },
    );
    const directed = applyHomesteadWorldEventDecision(
      game,
      compiled.eventId,
      "llm",
      start,
      {
        narrative: compiled.narrative,
        eventInstanceId: compiled.instanceId,
        eventRulesVersion: compiled.rulesVersion,
        eventParameters: compiled.parameters,
      },
    );
    const originalEconomy = {
      reputation: directed.reputation,
      researchPoints: directed.researchPoints,
      goods: structuredClone(directed.goods),
    };

    const followUp = refreshHomesteadGame(
      directed,
      start + 24 * 60 * 60_000,
    );
    expect(followUp.worldEvent).toMatchObject({
      instanceId: compiled.instanceId,
      rulesVersion: 2,
      selectedOptionId: null,
      durationDays: 2,
      unresolvedDays: 1,
    });
    expect({
      reputation: followUp.reputation,
      researchPoints: followUp.researchPoints,
      goods: followUp.goods,
    }).toEqual(originalEconomy);

    const expired = refreshHomesteadGame(
      followUp,
      start + 2 * 24 * 60 * 60_000,
    );
    expect(expired.worldEvent.instanceId).not.toBe(compiled.instanceId);
    expect(expired.worldEvent.source).toBe("rules");
  });

  it("rejects parameters that do not match the compiled rules version", () => {
    const template = safeGreenvaleTemplate();
    const game = createHomesteadGame({
      ownerId: "owner",
      ownerName: "Owner",
      seed: "invalid-generated-parameters",
      now: start,
      townId: "greenvale",
    });

    expect(() =>
      applyHomesteadWorldEventDecision(
        game,
        template.id,
        "llm",
        start,
        {
          eventInstanceId: "generated:greenvale:test:invalid",
          eventRulesVersion: 2,
          eventParameters: {
            pacingId: "two_day_follow_up",
            durationDays: 1,
          },
        },
      )
    ).toThrow();

    expect(() =>
      applyHomesteadWorldEventDecision(
        game,
        template.id,
        "llm",
        start,
        {
          eventInstanceId: "generated:greenvale:test:missing-parameters",
          eventRulesVersion: 2,
        },
      )
    ).toThrow();

    expect(() =>
      applyHomesteadWorldEventDecision(
        game,
        template.id,
        "llm",
        start,
        {
          eventRulesVersion: 2,
          eventParameters: {
            pacingId: "two_day_follow_up",
            durationDays: 2,
          },
        },
      )
    ).toThrow();
  });
});
