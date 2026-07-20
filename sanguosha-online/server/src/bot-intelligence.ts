import type { GameSession, PlayerId } from "@sanguosha/shared";

export const BOT_INTELLIGENCE_NAMES = {
  1: "黄巾小卒",
  2: "乡勇锐士",
  3: "虎贲校尉",
  4: "镇军将军",
  5: "五虎上将",
  6: "卧龙军师",
  7: "武圣临凡",
} as const;

export type BotIntelligence = keyof typeof BOT_INTELLIGENCE_NAMES;
export const DEFAULT_BOT_INTELLIGENCE: BotIntelligence = 3;

function targetScore(
  game: GameSession,
  botId: PlayerId,
  targetId: PlayerId,
  intelligence: BotIntelligence,
  beneficial: boolean,
): number {
  const bot = game.players.find((player) => player.id === botId);
  const target = game.players.find((player) => player.id === targetId);
  if (!bot || !target) return Number.NEGATIVE_INFINITY;

  const missingHp = target.maxHp - target.hp;
  if (beneficial) {
    let score = missingHp * 20;
    if (target.id === bot.id) score += 12;
    if (intelligence >= 6 && target.role === "lord") {
      if (bot.role === "lord" || bot.role === "loyalist") score += 80;
      if (bot.role === "rebel") score -= 80;
    }
    return score;
  }

  let score = intelligence >= 4 ? missingHp * 12 : 0;
  if (intelligence >= 5) score += target.hand.length * 2 + Object.keys(target.equipment).length * 5;
  if (intelligence >= 6 && target.role === "lord") {
    if (bot.role === "rebel") score += 100;
    if (bot.role === "lord" || bot.role === "loyalist") score -= 100;
    if (bot.role === "renegade") score += game.players.filter((player) => player.alive).length === 2 ? 100 : -30;
  }
  if (intelligence >= 7) {
    if (target.hp <= 1) score += 40;
    if (target.hand.length === 0) score += 15;
  }
  return score;
}

export function chooseBotTarget(
  game: GameSession,
  botId: PlayerId,
  targetIds: readonly PlayerId[],
  intelligence: BotIntelligence,
  beneficial = false,
): PlayerId | undefined {
  if (targetIds.length === 0) return undefined;
  if (intelligence === 1) return targetIds[Math.floor(Math.random() * targetIds.length)];
  if (intelligence === 2) {
    const window = Math.max(1, Math.ceil(targetIds.length / 2));
    return targetIds[Math.floor(Math.random() * window)];
  }
  if (intelligence === 3) return targetIds[0];

  const ranked = [...targetIds].sort((left, right) =>
    targetScore(game, botId, right, intelligence, beneficial) -
    targetScore(game, botId, left, intelligence, beneficial)
  );
  if (intelligence === 4 && ranked.length > 1) return ranked[Math.floor(Math.random() * 2)];
  return ranked[0];
}
