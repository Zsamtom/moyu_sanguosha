import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { ApiError } from '../api';
import type { HomesteadSnapshot } from '../types';
import {
  canCommitHomesteadSnapshot,
  formatDisasterReputationImpact,
  formatHomesteadDuration,
  formatWeatherObservedAt,
  isHomesteadRevisionConflict,
  isWeatherMechanicsEnabled,
  runHomesteadActionWithConflictRetry,
} from './HomesteadScreen';

describe('HomesteadScreen helpers', () => {
  it('formats production countdowns for short and long jobs', () => {
    expect(formatHomesteadDuration(0)).toBe('可收取');
    expect(formatHomesteadDuration(10 * 60_000)).toBe('10 分钟');
    expect(formatHomesteadDuration(90 * 60_000)).toBe('1 小时 30 分');
    expect(formatHomesteadDuration(2 * 60 * 60_000)).toBe('2 小时');
    expect(formatWeatherObservedAt()).toBe('等待首次同步');
  });

  it('explains zero and non-zero next-day reputation losses clearly', () => {
    expect(formatDisasterReputationImpact({
      reputationPenaltyPaid: 2,
      reputationPenaltyContinues: true,
      nextReputationLoss: 4,
    })).toBe(
      '本轮已扣声望 2/12 · 声望惩罚仍继续，下一跨日预计 -4',
    );
    expect(formatDisasterReputationImpact({
      reputationPenaltyPaid: 2,
      reputationPenaltyContinues: true,
      nextReputationLoss: 0,
    })).toBe(
      '本轮已扣声望 2/12 · 声望惩罚仍继续，但当前声望已到底，下一跨日无实际扣除',
    );
    expect(formatDisasterReputationImpact({
      reputationPenaltyPaid: 12,
      reputationPenaltyContinues: false,
      nextReputationLoss: 0,
    })).toBe(
      '本轮已扣声望 12/12 · 声望惩罚已达本次灾害上限',
    );
  });

  it('fails closed for stale, fallback, and incomplete weather metadata', () => {
    expect(isWeatherMechanicsEnabled({
      source: 'live',
      mechanicsEnabled: true,
    })).toBe(true);
    expect(isWeatherMechanicsEnabled({
      source: 'rules',
      mechanicsEnabled: true,
    })).toBe(true);
    expect(isWeatherMechanicsEnabled({
      source: 'last_known_good',
      mechanicsEnabled: true,
    })).toBe(false);
    expect(isWeatherMechanicsEnabled({
      source: 'fallback',
      mechanicsEnabled: true,
    })).toBe(false);
    expect(isWeatherMechanicsEnabled({
      source: 'live',
    })).toBe(false);
    expect(isWeatherMechanicsEnabled({
      source: 'rules',
    })).toBe(false);
    expect(isWeatherMechanicsEnabled({
      mechanicsEnabled: true,
    })).toBe(false);
  });

  it('accepts a switch to either town even when local revisions restart lower', () => {
    const snapshot = (
      activeTownId: 'greenvale' | 'frostpeak',
      revisions: readonly [
        account: number,
        homestead: number,
        farm: number,
        ranch: number,
        mine: number,
      ],
    ) => ({
      homestead: {
        activeTownId,
        accountRevision: revisions[0],
        revision: revisions[1],
        revisions: {
          farm: revisions[2],
          ranch: revisions[3],
          mine: revisions[4],
        },
      },
    }) as unknown as HomesteadSnapshot;

    expect(canCommitHomesteadSnapshot(
      snapshot('frostpeak', [9, 1, 1, 0, 0]),
      snapshot('greenvale', [8, 50, 60, 35, 16]),
    )).toBe(true);
    expect(canCommitHomesteadSnapshot(
      snapshot('greenvale', [10, 2, 2, 1, 0]),
      snapshot('frostpeak', [9, 40, 45, 22, 10]),
    )).toBe(true);
    expect(canCommitHomesteadSnapshot(
      snapshot('greenvale', [11, 49, 61, 35, 16]),
      snapshot('greenvale', [10, 50, 60, 35, 16]),
    )).toBe(false);
    expect(canCommitHomesteadSnapshot(
      snapshot('greenvale', [9, 1, 1, 1, 1]),
      snapshot('greenvale', [10, 50, 60, 35, 16]),
      true,
    )).toBe(true);
  });

  it('retries only revision conflicts and never disguises business errors as state churn', async () => {
    const initial = { homestead: { revision: 5 } } as unknown as HomesteadSnapshot;
    const latest = { homestead: { revision: 6 } } as unknown as HomesteadSnapshot;
    const apply = vi.fn()
      .mockRejectedValueOnce(new ApiError('stale', 409, 'HOMESTEAD_REVISION_CONFLICT'))
      .mockResolvedValueOnce('applied');
    const refresh = vi.fn().mockResolvedValue(latest);

    await expect(runHomesteadActionWithConflictRetry(
      initial,
      apply,
      refresh,
    )).resolves.toEqual({ result: 'applied', retried: true });
    expect(apply).toHaveBeenNthCalledWith(1, initial);
    expect(apply).toHaveBeenNthCalledWith(2, latest);
    expect(refresh).toHaveBeenCalledTimes(1);

    const stillStale = vi.fn()
      .mockRejectedValue(new ApiError('stale', 409, 'HOMESTEAD_REVISION_CONFLICT'));
    await expect(runHomesteadActionWithConflictRetry(
      initial,
      stillStale,
      refresh,
    )).rejects.toMatchObject({ status: 409 });
    expect(stillStale).toHaveBeenCalledTimes(3);
    expect(refresh).toHaveBeenCalledTimes(3);

    const businessConflict = new ApiError(
      '今日物流容量不足',
      409,
      'ESTATE_LOGISTICS_INSUFFICIENT',
    );
    const rejectedBusinessAction = vi.fn().mockRejectedValue(businessConflict);
    const unusedRefresh = vi.fn();
    await expect(runHomesteadActionWithConflictRetry(
      initial,
      rejectedBusinessAction,
      unusedRefresh,
    )).rejects.toBe(businessConflict);
    expect(unusedRefresh).not.toHaveBeenCalled();
    expect(isHomesteadRevisionConflict(businessConflict)).toBe(false);
  });

  it('queues overview actions without globally locking the interface', () => {
    const source = readFileSync(
      new URL('./HomesteadScreen.tsx', import.meta.url),
      'utf8',
    );
    expect(source).toContain('useSerialActionQueue');
    expect(source).toContain('正在后台依次保存，可继续安排其他操作');
    expect(source).not.toContain('其他经营操作暂不可用');
  });

  it('keeps every supported modular homestead action reachable from the interface', () => {
    const source = readFileSync(
      new URL('./HomesteadScreen.tsx', import.meta.url),
      'utf8',
    );
    for (const actionType of [
      'homestead_build_facility',
      'homestead_start_job',
      'homestead_collect_job',
      'homestead_complete_order',
      'homestead_choose_event',
      'homestead_unlock_research',
      'homestead_upgrade_facility',
      'homestead_plan_rotation',
      'homestead_run_feed_program',
      'homestead_upgrade_mine_protection',
      'homestead_survey_layer',
      'homestead_talk_npc',
      'homestead_claim_honor_reward',
      'homestead_upgrade_infrastructure',
      'homestead_upgrade_resilience',
      'homestead_activate_emergency_boost',
      'homestead_unlock_town',
      'homestead_switch_town',
      'homestead_buy_merchant_item',
      'homestead_use_acceleration_card',
      'homestead_complete_value_route',
      'homestead_dispatch_cargo',
      'homestead_collect_cargo',
    ]) {
      expect(source).toContain(`type: '${actionType}'`);
    }
  });

  it('uses one complete estate interface for every active town', () => {
    const source = readFileSync(
      new URL('./HomesteadScreen.tsx', import.meta.url),
      'utf8',
    );

    expect(source).not.toContain("if (homestead.activeTownId === 'frostpeak'");
    expect(source).toContain('Object.values(homestead.plannedTowns)');
    expect(source).toContain('accountRevision');
    expect(source).toContain('今日物流调度');
    expect(source).toContain('庄园商会');
    expect(source).toContain('实时天气暂不可用');
    expect(source).toContain('缓存倍率已中和');
    expect(source).toContain('既有灾害，其后果仍会继续结算');
  });

  it('shows reputation costs and ongoing disaster consequences', () => {
    const source = readFileSync(
      new URL('./HomesteadScreen.tsx', import.meta.url),
      'utf8',
    );
    const typesSource = readFileSync(
      new URL('../types.ts', import.meta.url),
      'utf8',
    );

    expect(source).toContain("option.reputationReward >= 0 ? '+' : ''");
    expect(source).toContain('声望不足（还差');
    expect(source).toContain('声望惩罚仍继续，下一跨日预计');
    expect(source).toContain('当前声望已到底，下一跨日无实际扣除');
    expect(source).toContain('临时方案不会解除灾害');
    expect(source).toContain('灾害仍在持续，请改选彻底处置');
    expect(typesSource).toContain('missingReputation: number');
    expect(typesSource).toContain('nextReputationLoss: number');
    expect(typesSource).toContain('reputationPenaltyContinues: boolean');
    expect(typesSource).toContain('temporaryAlreadyUsed: boolean');
  });

  it('shows backstage estate intelligence, local operation rhythm, and research milestones', () => {
    const source = readFileSync(
      new URL('./HomesteadScreen.tsx', import.meta.url),
      'utf8',
    );
    const typesSource = readFileSync(
      new URL('../types.ts', import.meta.url),
      'utf8',
    );

    expect(source).toContain('ESTATE INTELLIGENCE');
    expect(source).not.toContain('规则世界导演');
    expect(source).not.toContain('启用个性化世界导演');
    expect(source).toContain('本次导演依据');
    expect(source).toContain('跨日伏笔');
    expect(source).toContain('LOCAL OPERATING RHYTHM');
    expect(source).toContain('今日顺序已经错过');
    expect(source).toContain('经营里程碑尚缺');
    expect(typesSource).toContain("| 'homestead-town-rhythm'");
    expect(typesSource).toContain('completedCycles: number');
    expect(typesSource).toContain('worldBeatId?:');
  });
});
