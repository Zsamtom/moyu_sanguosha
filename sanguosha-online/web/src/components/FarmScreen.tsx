import {
  Button,
  InputNumber,
  Popconfirm,
  Progress,
  Spin,
  Tag,
  message,
} from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, errorMessage } from '../api';
import {
  isLatestRequest,
  isRevisionVectorAtLeast,
} from '../snapshotGuards';
import type {
  FarmClientAction,
  FarmCropDefinition,
  FarmCropId,
  FarmGameView,
  FarmPlot,
  FarmSnapshot,
  FarmVisitClientAction,
} from '../types';
import '../farm.css';

const CROP_IDS: FarmCropId[] = [
  'wheat',
  'carrot',
  'tomato',
  'corn',
  'pumpkin',
  'strawberry',
  'sunflower',
  'watermelon',
  'grape',
  'blueberry',
  'cotton',
  'dragonfruit',
];

const TREND_LABELS: Record<-1 | 0 | 1, string> = {
  [-1]: '↓ 下行',
  [0]: '— 持平',
  [1]: '↑ 上行',
};

const FARM_DAILY_HELP_LIMIT = 20;
const FARM_DAILY_STEAL_LIMIT = 20;

export interface FarmPlotRuntime {
  ready: boolean;
  progress: number;
  hasWeeds: boolean;
  hasPests: boolean;
  estimatedYield: number;
  remainingMs: number;
}

export type FarmPlotTool =
  | { type: 'plant'; cropId: FarmCropId }
  | { type: 'shovel' };

export function farmPlotToolAction(
  tool: FarmPlotTool,
  plot: FarmPlot,
): FarmClientAction | null {
  if (!plot.unlocked) return null;
  if (tool.type === 'shovel') {
    return plot.cropId === null
      ? null
      : { type: 'farming_clear_plot', plotIndex: plot.index };
  }
  return plot.cropId === null
    ? {
        type: 'farming_plant',
        cropId: tool.cropId,
        plotIndex: plot.index,
      }
    : null;
}

export function farmPlotCardAction(
  action: FarmClientAction | null,
  enabled: boolean,
): FarmClientAction | null {
  return enabled && action?.type === 'farming_plant' ? action : null;
}

export function optimisticFarmAction(
  snapshot: FarmSnapshot,
  action: FarmClientAction,
  at: number,
): FarmSnapshot {
  const game = snapshot.farm;
  const currentInventory = game.inventory;
  if (!game.isOwner || !currentInventory) return snapshot;

  const inventory = {
    ...currentInventory,
    seeds: { ...currentInventory.seeds },
    produce: { ...currentInventory.produce },
    mutations: { ...currentInventory.mutations },
  };
  let plots = game.plots;
  let changed = false;

  const updatePlot = (
    plotIndex: number,
    update: (plot: FarmPlot) => FarmPlot,
  ) => {
    const plot = plots.find((candidate) => candidate.index === plotIndex);
    if (!plot?.unlocked) return;
    plots = plots.map((candidate) =>
      candidate.index === plotIndex ? update(candidate) : candidate
    );
    changed = true;
  };

  if (action.type === 'farming_plant') {
    const crop = game.crops[action.cropId];
    const plot = plots.find((candidate) => candidate.index === action.plotIndex);
    if (!plot || plot.cropId !== null || inventory.seeds[action.cropId] < 1) {
      return snapshot;
    }
    inventory.seeds[action.cropId] -= 1;
    updatePlot(action.plotIndex, (current) => ({
      ...current,
      cycle: current.cycle + 1,
      cropId: action.cropId,
      plantedAt: at,
      maturesAt: at + crop.growthSeconds * 1_000,
      watered: false,
      weedAt: null,
      pestAt: null,
      weedCleared: false,
      pestCleared: false,
      stolen: 0,
      stealAttempts: [],
      stolenBy: [],
      ready: false,
      progress: 0,
      hasWeeds: false,
      hasPests: false,
      estimatedYield: Math.max(1, crop.yield - 1),
      maximumStealable: 0,
    }));
  } else if (action.type === 'farming_clear_plot') {
    const plot = plots.find((candidate) => candidate.index === action.plotIndex);
    if (!plot?.cropId) return snapshot;
    updatePlot(action.plotIndex, (current) => ({
      ...current,
      cropId: null,
      plantedAt: null,
      maturesAt: null,
      watered: false,
      weedAt: null,
      pestAt: null,
      weedCleared: false,
      pestCleared: false,
      stolen: 0,
      stealAttempts: [],
      stolenBy: [],
      ready: false,
      progress: 0,
      hasWeeds: false,
      hasPests: false,
      estimatedYield: 0,
      maximumStealable: 0,
    }));
  } else if (action.type === 'farming_tend') {
    updatePlot(action.plotIndex, (current) => ({
      ...current,
      ...(action.care === 'water' ? { watered: true } : {}),
      ...(action.care === 'weed'
        ? { weedCleared: true, hasWeeds: false }
        : {}),
      ...(action.care === 'pest'
        ? { pestCleared: true, hasPests: false }
        : {}),
    }));
  } else if (action.type === 'farming_buy_seed') {
    const cost = game.crops[action.cropId].seedCost * action.quantity;
    if (inventory.coins < cost) return snapshot;
    inventory.coins -= cost;
    inventory.seeds[action.cropId] += action.quantity;
    changed = true;
  } else if (action.type === 'farming_sell') {
    if (inventory.produce[action.cropId] < action.quantity) return snapshot;
    inventory.produce[action.cropId] -= action.quantity;
    inventory.coins += game.market[action.cropId].price * action.quantity;
    changed = true;
  } else if (action.type === 'farming_redeem_mutation') {
    if (inventory.mutations[action.cropId] < action.quantity) return snapshot;
    inventory.mutations[action.cropId] -= action.quantity;
    inventory.coins += game.market[action.cropId].price * 5 * action.quantity;
    changed = true;
  }

  if (!changed) return snapshot;
  return {
    ...snapshot,
    farm: {
      ...game,
      revision: game.revision + 1,
      serverTime: at,
      inventory,
      plots,
    },
  };
}

export function farmPlotRuntime(
  plot: FarmPlot,
  crop: FarmCropDefinition | null,
  now: number,
): FarmPlotRuntime {
  if (!crop || plot.plantedAt === null || plot.maturesAt === null) {
    return {
      ready: false,
      progress: 0,
      hasWeeds: false,
      hasPests: false,
      estimatedYield: 0,
      remainingMs: 0,
    };
  }
  const ready = now >= plot.maturesAt;
  const progress = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        ((now - plot.plantedAt) / Math.max(1, plot.maturesAt - plot.plantedAt)) * 100,
      ),
    ),
  );
  const hasWeeds =
    plot.weedAt !== null &&
    now >= plot.weedAt &&
    !plot.weedCleared;
  const hasPests =
    plot.pestAt !== null &&
    now >= plot.pestAt &&
    !plot.pestCleared;
  let estimatedYield = crop.yield;
  if (!plot.watered) estimatedYield -= 1;
  if (hasWeeds) estimatedYield -= 1;
  if (hasPests) estimatedYield -= 1;
  return {
    ready,
    progress,
    hasWeeds,
    hasPests,
    estimatedYield: Math.max(
      1,
      Math.round(
        estimatedYield *
          (100 + (plot.productionModifierPercent ?? 0)) /
          100,
      ),
    ),
    remainingMs: Math.max(0, plot.maturesAt - now),
  };
}

function durationLabel(seconds: number): string {
  if (seconds < 60 * 60) return `${Math.round(seconds / 60)} 分钟`;
  return `${Math.round((seconds / 60 / 60) * 10) / 10} 小时`;
}

function remainingLabel(milliseconds: number): string {
  if (milliseconds <= 0) return '已经成熟';
  const seconds = Math.ceil(milliseconds / 1_000);
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours} 小时${rest > 0 ? ` ${rest} 分` : ''}`;
}

function experiencePercent(game: FarmGameView): number {
  if (game.nextLevelExperience === null) return 100;
  const span = game.nextLevelExperience - game.currentLevelExperience;
  return Math.max(
    0,
    Math.min(
      100,
      Math.round(
        ((game.experience - game.currentLevelExperience) / Math.max(1, span)) * 100,
      ),
    ),
  );
}

export function FarmScreen() {
  const [toast, toastContext] = message.useMessage();
  const [snapshot, setSnapshot] = useState<FarmSnapshot>();
  const [neighborFarm, setNeighborFarm] = useState<FarmGameView>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState<FarmClientAction>();
  const [now, setNow] = useState(Date.now());
  const clockOffset = useRef(0);
  const actionInFlight = useRef(false);
  const snapshotRef = useRef<FarmSnapshot>();
  const neighborFarmRef = useRef<FarmGameView>();
  const loadRequestSequence = useRef(0);
  const neighborRequestSequence = useRef(0);
  const [selectedCrop, setSelectedCrop] = useState<FarmCropId>('wheat');
  const [toolMode, setToolMode] = useState<'plant' | 'shovel'>('plant');
  const [marketOpen, setMarketOpen] = useState(false);
  const [quantities, setQuantities] = useState<Record<FarmCropId, number>>(
    Object.fromEntries(CROP_IDS.map((cropId) => [cropId, 1])) as Record<FarmCropId, number>,
  );

  const commitSnapshot = (
    next: FarmSnapshot,
    force = false,
  ): boolean => {
    const current = snapshotRef.current;
    if (
      !force &&
      !isRevisionVectorAtLeast(
        [next.farm.revision],
        current ? [current.farm.revision] : undefined,
      )
    ) {
      return false;
    }
    snapshotRef.current = next;
    setSnapshot(next);
    clockOffset.current = next.farm.serverTime - Date.now();
    setNow(next.farm.serverTime);
    return true;
  };

  const commitNeighborFarm = (
    next: FarmGameView | undefined,
    requestId?: number,
  ): boolean => {
    if (
      requestId !== undefined &&
      !isLatestRequest(requestId, neighborRequestSequence.current)
    ) {
      return false;
    }
    const current = neighborFarmRef.current;
    if (
      next &&
      current?.ownerId === next.ownerId &&
      next.revision < current.revision
    ) {
      return false;
    }
    neighborFarmRef.current = next;
    setNeighborFarm(next);
    return true;
  };

  const clearNeighborFarm = () => {
    neighborRequestSequence.current += 1;
    commitNeighborFarm(undefined);
  };

  const load = async (quiet = false, allowDuringAction = false) => {
    if (quiet && actionInFlight.current && !allowDuringAction) return;
    const requestId = ++loadRequestSequence.current;
    if (!quiet) setLoading(true);
    try {
      const next = await api.getFarm();
      if (
        !isLatestRequest(requestId, loadRequestSequence.current) ||
        (actionInFlight.current && !allowDuringAction) ||
        !commitSnapshot(next)
      ) {
        return;
      }
      if (neighborFarmRef.current) {
        const summary = next.neighbors.find(
          (candidate) => candidate.ownerId === neighborFarmRef.current?.ownerId,
        );
        if (!summary) clearNeighborFarm();
      }
    } catch (error) {
      if (
        !quiet &&
        isLatestRequest(requestId, loadRequestSequence.current) &&
        (allowDuringAction || !actionInFlight.current)
      ) {
        toast.error(errorMessage(error));
      }
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const clock = window.setInterval(
      () => setNow(Date.now() + clockOffset.current),
      1_000,
    );
    const refresh = window.setInterval(() => void load(true), 30_000);
    return () => {
      window.clearInterval(clock);
      window.clearInterval(refresh);
    };
  }, []);

  useEffect(() => {
    if (!neighborFarm) return;
    const ownerId = neighborFarm.ownerId;
    const refresh = window.setInterval(() => {
      if (actionInFlight.current) return;
      const requestId = ++neighborRequestSequence.current;
      void api.getFarmNeighbor(ownerId)
        .then((farm) => commitNeighborFarm(farm, requestId))
        .catch(() => undefined);
    }, 30_000);
    return () => window.clearInterval(refresh);
  }, [neighborFarm?.ownerId]);

  const runAction = async (action: FarmClientAction) => {
    const previous = snapshotRef.current;
    if (!previous || actionInFlight.current) return;
    const expectedRevision = previous.farm.revision;
    actionInFlight.current = true;
    loadRequestSequence.current += 1;
    setBusy(true);
    setPendingAction(action);
    commitSnapshot(optimisticFarmAction(previous, action, now));
    let refreshAfterAction = false;
    try {
      const next = await api.applyFarmAction(expectedRevision, action);
      commitSnapshot({
        farm: next.farm,
        neighbors: snapshotRef.current?.neighbors ?? previous.neighbors,
        marketDirectorAvailable: next.marketDirectorAvailable,
      });
      if (action.type === 'farming_plant') {
        toast.success(
          `已在 ${action.plotIndex + 1} 号田播种${next.farm.crops[action.cropId].name}`,
        );
      } else if (action.type === 'farming_clear_plot') {
        toast.success(`已铲除 ${action.plotIndex + 1} 号田的作物`);
      } else if (action.type === 'farming_redeem_mutation') {
        toast.success(
          `已兑换 ${action.quantity} 株变异${next.farm.crops[action.cropId].name}`,
        );
      }
    } catch (error) {
      if (error instanceof ApiError && error.code === 'FARM_REVISION_CONFLICT') {
        refreshAfterAction = true;
      } else {
        commitSnapshot(previous, true);
      }
      toast.error(errorMessage(error));
    } finally {
      if (!refreshAfterAction) {
        actionInFlight.current = false;
        setBusy(false);
        setPendingAction(undefined);
      }
    }
    if (refreshAfterAction) {
      await load(true, true);
      actionInFlight.current = false;
      setBusy(false);
      setPendingAction(undefined);
    }
  };

  const openNeighbor = async (ownerId: string) => {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    loadRequestSequence.current += 1;
    const requestId = ++neighborRequestSequence.current;
    setBusy(true);
    try {
      const next = await api.getFarmNeighbor(ownerId);
      if (commitNeighborFarm(next, requestId)) {
        clockOffset.current = next.serverTime - Date.now();
        setNow(next.serverTime);
      }
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      actionInFlight.current = false;
      setBusy(false);
    }
  };

  const runVisitAction = async (action: FarmVisitClientAction) => {
    const current = snapshotRef.current;
    const currentNeighbor = neighborFarmRef.current;
    if (!current || !currentNeighbor || actionInFlight.current) return;
    actionInFlight.current = true;
    loadRequestSequence.current += 1;
    neighborRequestSequence.current += 1;
    setBusy(true);
    let refreshAfterAction = false;
    try {
      const next = await api.applyFarmVisitAction(
        currentNeighbor.ownerId,
        current.farm.revision,
        currentNeighbor.revision,
        action,
      );
      commitSnapshot({
        farm: next.farm,
        neighbors: next.neighbors,
        marketDirectorAvailable: next.marketDirectorAvailable,
      });
      commitNeighborFarm(next.neighbor);
      toast.success(
        next.outcome === 'helped'
          ? '已帮助农友照料作物'
          : next.outcome === 'stolen'
            ? '成功摘到 1 份成熟作物'
            : '护院犬发现了你，本次摘取失败',
      );
    } catch (error) {
      if (
        error instanceof ApiError &&
        ['FARM_REVISION_CONFLICT', 'FARMING_NEIGHBOR_REVISION_CONFLICT'].includes(
          error.code ?? '',
        )
      ) {
        refreshAfterAction = true;
      }
      toast.error(errorMessage(error));
    } finally {
      if (!refreshAfterAction) {
        actionInFlight.current = false;
        setBusy(false);
      }
    }
    if (refreshAfterAction) {
      await load(true, true);
      const requestId = ++neighborRequestSequence.current;
      try {
        commitNeighborFarm(
          await api.getFarmNeighbor(currentNeighbor.ownerId),
          requestId,
        );
      } catch {
        clearNeighborFarm();
      }
      actionInFlight.current = false;
      setBusy(false);
    }
  };

  const ownGame = snapshot?.farm;
  const displayGame = neighborFarm ?? ownGame;
  const selectedDefinition = ownGame?.crops[selectedCrop];
  const unlockedCrops = useMemo(
    () => ownGame
      ? CROP_IDS.filter((cropId) =>
          ownGame.level >= ownGame.crops[cropId].unlockLevel
        )
      : [],
    [ownGame],
  );

  useEffect(() => {
    if (ownGame && selectedDefinition && ownGame.level < selectedDefinition.unlockLevel) {
      setSelectedCrop(unlockedCrops[0] ?? 'wheat');
    }
  }, [ownGame?.level]);

  if (loading && !snapshot) {
    return (
      <main className="farm-page farm-page--loading">
        {toastContext}
        <Spin />
        <span>正在读取长期农场档案…</span>
      </main>
    );
  }

  if (!snapshot || !ownGame || !displayGame) {
    return (
      <main className="farm-page farm-page--loading">
        {toastContext}
        <p>未能读取农场档案。</p>
        <Button onClick={() => void load()}>重新读取</Button>
      </main>
    );
  }

  const isOwnerView = displayGame.isOwner;
  const inventory = ownGame.inventory!;
  const displayInventory = displayGame.inventory;
  const canExpand =
    isOwnerView &&
    ownGame.nextExpansion !== null &&
    ownGame.level >= ownGame.nextExpansion.requiredLevel &&
    inventory.coins >= ownGame.nextExpansion.coinCost;
  const canUpgradeDog =
    isOwnerView &&
    ownGame.nextDogUpgrade !== null &&
    ownGame.level >= ownGame.nextDogUpgrade.requiredFarmLevel &&
    inventory.coins >= ownGame.nextDogUpgrade.coinCost;

  return (
    <main className="farm-page">
      {toastContext}
      <section className="farm-status-strip" aria-label="农场状态">
        <span><i className="farm-status-dot" /> 存档：服务器实时持久化</span>
        <span>场主：{displayGame.ownerName}</span>
        <span>农场：LV {displayGame.level} / {displayGame.unlockedPlots} 块田</span>
        <span>护院犬：{displayGame.dogLevel} 级 / 拦截 {displayGame.dogBlockChance}%</span>
        <span>
          今日互助：{ownGame.dailySocial?.helps ?? 0}/{FARM_DAILY_HELP_LIMIT} ·
          摘取：{ownGame.dailySocial?.steals ?? 0}/{FARM_DAILY_STEAL_LIMIT}
        </span>
        <span>修订：{String(displayGame.revision).padStart(5, '0')}</span>
        {!isOwnerView && (
          <Button
            size="small"
            disabled={busy}
            onClick={clearNeighborFarm}
          >
            返回我的农场
          </Button>
        )}
        <span role="status" aria-live="polite">
          {busy ? '正在保存操作，其他经营按钮暂不可用' : '操作就绪'}
        </span>
      </section>

      <section className="farm-metrics" aria-label="经营指标">
        <article>
          <span>{isOwnerView ? '可用金币' : '农场等级'}</span>
          <strong>{isOwnerView ? `◎ ${displayInventory!.coins}` : `LV ${displayGame.level}`}</strong>
          <small>{isOwnerView ? 'COINS AVAILABLE' : 'NEIGHBOR LEVEL'}</small>
        </article>
        <article>
          <span>成长经验</span>
          <strong>{displayGame.experience}</strong>
          <Progress
            percent={experiencePercent(displayGame)}
            size="small"
            showInfo={false}
            strokeColor="#111"
          />
        </article>
        <article>
          <span>已开垦土地</span>
          <strong>{displayGame.unlockedPlots} / 12</strong>
          <small>PERMANENT PLOTS</small>
        </article>
        <article>
          <span>成熟作物</span>
          <strong>
            {displayGame.plots.filter((plot) =>
              plot.cropId && plot.maturesAt !== null && now >= plot.maturesAt
            ).length}
          </strong>
          <small>READY TO HARVEST</small>
        </article>
      </section>

      <div className="farm-document-grid">
        <section className="farm-panel farm-panel--field">
          <header className="farm-panel__header">
            <div>
              <span>SECTION 01</span>
              <h2>{isOwnerView ? '实时田块作业' : '农友田块访问'}</h2>
            </div>
          </header>
          {isOwnerView && (
            <div className="farm-tool-strip" aria-label="田块工具">
              <span className="farm-tool-strip__label">播种</span>
              {unlockedCrops.map((cropId) => (
                <Button
                  key={cropId}
                  aria-pressed={toolMode === 'plant' && selectedCrop === cropId}
                  disabled={busy}
                  size="small"
                  type={toolMode === 'plant' && selectedCrop === cropId ? 'primary' : 'default'}
                  onClick={() => {
                    setSelectedCrop(cropId);
                    setToolMode('plant');
                    toast.info(`已选择${ownGame.crops[cropId].name}，请点击空田播种`);
                  }}
                >
                  {toolMode === 'plant' && selectedCrop === cropId && (
                    <span aria-hidden="true">✓</span>
                  )}
                  {ownGame.crops[cropId].name}
                  <small>×{inventory.seeds[cropId]}</small>
                </Button>
              ))}
              <Button
                danger
                aria-pressed={toolMode === 'shovel'}
                disabled={busy}
                size="small"
                type={toolMode === 'shovel' ? 'primary' : 'default'}
                onClick={() => setToolMode('shovel')}
              >
                铲子
              </Button>
              <span className="farm-tool-strip__hint">
                {toolMode === 'shovel'
                  ? '点击田块内的铲除按钮并确认'
                  : `点击空田播种${ownGame.crops[selectedCrop].name}`}
              </span>
            </div>
          )}
          <div className="farm-plots farm-plots--realtime">
            {displayGame.plots.map((plot) => {
              const crop = plot.cropId ? displayGame.crops[plot.cropId] : null;
              const runtime = farmPlotRuntime(plot, crop, now);
              const attempted = plot.stealAttempts.includes(ownGame.ownerId);
              const plotToolAction = isOwnerView
                ? farmPlotToolAction(
                    toolMode === 'shovel'
                      ? { type: 'shovel' }
                      : { type: 'plant', cropId: selectedCrop },
                    plot,
                  )
                : null;
              const plotToolReady =
                !busy &&
                plotToolAction?.type === 'farming_plant' &&
                inventory.seeds[plotToolAction.cropId] > 0;
              const plotCardAction = farmPlotCardAction(
                plotToolAction,
                plotToolReady,
              );
              const plotPending =
                pendingAction !== undefined &&
                'plotIndex' in pendingAction &&
                pendingAction.plotIndex === plot.index;
              if (!plot.unlocked) {
                return (
                  <article className="farm-plot farm-plot--locked" key={plot.index}>
                    <header>
                      <span>PLOT-{String(plot.index + 1).padStart(2, '0')}</span>
                      <i>LOCKED</i>
                    </header>
                    <div className="farm-plot__body">
                      <strong>待开垦土地</strong>
                      <small>提升等级并支付金币后永久解锁</small>
                    </div>
                  </article>
                );
              }
              return (
                <article
                  className={`farm-plot${runtime.ready ? ' farm-plot--ready' : ''}${
                    plotCardAction ? ' farm-plot--tool-ready' : ''
                  }${plotPending ? ' farm-plot--pending' : ''
                  }`}
                  key={plot.index}
                  onClick={(event) => {
                    if (
                      !plotCardAction ||
                      (event.target as HTMLElement).closest('button')
                    ) return;
                    void runAction(plotCardAction);
                  }}
                >
                  <header>
                    <span>PLOT-{String(plot.index + 1).padStart(2, '0')}</span>
                    <i>{plotPending ? 'SYNCING' : runtime.ready ? 'RIPE' : crop ? 'GROWING' : 'IDLE'}</i>
                  </header>
                  <div className="farm-plot__body">
                    <strong>{crop?.name ?? '空置田块'}</strong>
                    <small>
                      {crop
                        ? `${remainingLabel(runtime.remainingMs)} · 预计产量 ${runtime.estimatedYield}`
                        : !isOwnerView
                          ? '当前田块为空'
                          : toolMode === 'shovel'
                            ? '空田无需铲除'
                            : inventory.seeds[selectedCrop] > 0
                              ? `点击田块播种${ownGame.crops[selectedCrop].name}`
                              : `${ownGame.crops[selectedCrop].name}种子不足，请先到市场购入`}
                    </small>
                    <div className="farm-plot__tags">
                      {crop && (plot.productionModifierPercent ?? 0) !== 0 && (
                        <Tag color={(plot.productionModifierPercent ?? 0) > 0 ? 'green' : 'volcano'}>
                          {plot.productionModifierLabel ?? '庄园环境'}
                          {' '}· 产量 {(plot.productionModifierPercent ?? 0) > 0 ? '+' : ''}
                          {plot.productionModifierPercent}%
                        </Tag>
                      )}
                      {plot.watered && <Tag color="blue">已浇水</Tag>}
                      {runtime.hasWeeds && <Tag color="orange">有杂草</Tag>}
                      {runtime.hasPests && <Tag color="red">有害虫</Tag>}
                      {plot.stolen > 0 && <Tag>已被摘 {plot.stolen}</Tag>}
                    </div>
                    <div className="farm-progress" aria-label={`生长进度 ${runtime.progress}%`}>
                      <span style={{ width: `${runtime.progress}%` }} />
                    </div>
                    {plotPending && (
                      <small className="farm-plot__pending-label">
                        正在保存本次操作…
                      </small>
                    )}
                  </div>

                  {isOwnerView ? (
                    <div className="farm-plot__actions">
                      {!crop && toolMode === 'plant' && (
                        <Button
                          block
                          size="small"
                          type="primary"
                          disabled={!plotToolReady}
                          onClick={() => {
                            if (plotToolAction?.type === 'farming_plant') {
                              void runAction(plotToolAction);
                            }
                          }}
                        >
                          播种{ownGame.crops[selectedCrop].name}
                        </Button>
                      )}
                      {crop && toolMode === 'shovel' && (
                        <>
                          <small className="farm-plot__tool-hint farm-plot__tool-hint--danger">
                            铲除后不会返还种子或获得收成
                          </small>
                          <Popconfirm
                            title={`确认铲除${crop.name}？`}
                            description="作物、种子与本轮投入都不会返还。"
                            okText="确认铲除"
                            cancelText="取消"
                            disabled={busy}
                            onConfirm={() => void runAction({
                              type: 'farming_clear_plot',
                              plotIndex: plot.index,
                            })}
                          >
                            <Button
                              block
                              danger
                              size="small"
                              disabled={busy}
                            >
                              铲除{crop.name}
                            </Button>
                          </Popconfirm>
                        </>
                      )}
                      {crop && runtime.ready && (
                        <Button
                          block
                          size="small"
                          type="primary"
                          disabled={busy}
                          onClick={() => void runAction({
                            type: 'farming_harvest',
                            plotIndex: plot.index,
                          })}
                        >
                          收获
                        </Button>
                      )}
                      {crop && !plot.watered && (
                        <Button
                          size="small"
                          disabled={busy}
                          onClick={() => void runAction({
                            type: 'farming_tend',
                            care: 'water',
                            plotIndex: plot.index,
                          })}
                        >
                          浇水
                        </Button>
                      )}
                      {crop && runtime.hasWeeds && (
                        <Button
                          size="small"
                          disabled={busy}
                          onClick={() => void runAction({
                            type: 'farming_tend',
                            care: 'weed',
                            plotIndex: plot.index,
                          })}
                        >
                          除草
                        </Button>
                      )}
                      {crop && runtime.hasPests && (
                        <Button
                          size="small"
                          disabled={busy}
                          onClick={() => void runAction({
                            type: 'farming_tend',
                            care: 'pest',
                            plotIndex: plot.index,
                          })}
                        >
                          除虫
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="farm-plot__actions">
                      {crop && !plot.watered && (
                        <Button
                          size="small"
                          disabled={
                            busy ||
                            (ownGame.dailySocial?.helps ?? 0) >= FARM_DAILY_HELP_LIMIT
                          }
                          onClick={() => void runVisitAction({
                            type: 'farming_help',
                            care: 'water',
                            plotIndex: plot.index,
                          })}
                        >
                          帮忙浇水
                        </Button>
                      )}
                      {crop && runtime.hasWeeds && (
                        <Button
                          size="small"
                          disabled={
                            busy ||
                            (ownGame.dailySocial?.helps ?? 0) >= FARM_DAILY_HELP_LIMIT
                          }
                          onClick={() => void runVisitAction({
                            type: 'farming_help',
                            care: 'weed',
                            plotIndex: plot.index,
                          })}
                        >
                          帮忙除草
                        </Button>
                      )}
                      {crop && runtime.hasPests && (
                        <Button
                          size="small"
                          disabled={
                            busy ||
                            (ownGame.dailySocial?.helps ?? 0) >= FARM_DAILY_HELP_LIMIT
                          }
                          onClick={() => void runVisitAction({
                            type: 'farming_help',
                            care: 'pest',
                            plotIndex: plot.index,
                          })}
                        >
                          帮忙除虫
                        </Button>
                      )}
                      {crop && runtime.ready && (
                        <Button
                          danger
                          size="small"
                          disabled={
                            busy ||
                            attempted ||
                            (ownGame.dailySocial?.steals ?? 0) >= FARM_DAILY_STEAL_LIMIT ||
                            plot.stolen >= (
                              runtime.estimatedYield < 3
                                ? 0
                                : Math.max(1, Math.floor(runtime.estimatedYield * 0.3))
                            )
                          }
                          onClick={() => void runVisitAction({
                            type: 'farming_steal',
                            plotIndex: plot.index,
                          })}
                        >
                          {attempted ? '已经尝试' : '摘取 1 份'}
                        </Button>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        {isOwnerView && (
          <section className="farm-panel farm-panel--market">
            <header className="farm-panel__header">
              <div>
                <span>SECTION 02</span>
                <h2>种子与收购市场</h2>
              </div>
              <Button
                aria-expanded={marketOpen}
                size="small"
                type="text"
                onClick={() => setMarketOpen((current) => !current)}
              >
                {marketOpen ? '收起 ↑' : '展开 ↓'}
              </Button>
            </header>
            {marketOpen && <div className="farm-table-wrap">
              <table className="farm-table">
                <thead>
                  <tr>
                    <th>作物</th>
                    <th>解锁</th>
                    <th>时间</th>
                    <th>现价</th>
                    <th>库存</th>
                    <th>数量</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {CROP_IDS.map((cropId) => {
                    const crop = ownGame.crops[cropId];
                    const quote = ownGame.market[cropId];
                    const quantity = quantities[cropId];
                    const unlocked = ownGame.level >= crop.unlockLevel;
                    return (
                      <tr key={cropId} className={unlocked ? '' : 'farm-row--locked'}>
                        <td>
                          <strong>{crop.name}</strong>
                          <small>种价 {crop.seedCost} · 产量 {crop.yield}</small>
                        </td>
                        <td>LV {crop.unlockLevel}</td>
                        <td>{durationLabel(crop.growthSeconds)}</td>
                        <td>
                          <strong>{quote.price}</strong>
                          <small>{TREND_LABELS[quote.trend]}</small>
                        </td>
                        <td>
                          种 {inventory.seeds[cropId]}
                          <small>货 {inventory.produce[cropId]}</small>
                        </td>
                        <td>
                          <InputNumber
                            aria-label={`${crop.name}交易数量`}
                            min={1}
                            max={99}
                            size="small"
                            value={quantity}
                            onChange={(value) => setQuantities((current) => ({
                              ...current,
                              [cropId]: Number(value) || 1,
                            }))}
                          />
                        </td>
                        <td>
                          <div className="farm-row-actions">
                            <Button
                              size="small"
                              disabled={
                                busy ||
                                !unlocked ||
                                inventory.coins < crop.seedCost * quantity
                              }
                              title={
                                busy
                                  ? '正在保存另一项操作'
                                  : !unlocked
                                    ? `农场达到 LV ${crop.unlockLevel} 后开放`
                                    : inventory.coins < crop.seedCost * quantity
                                      ? `金币不足，需要 ${crop.seedCost * quantity}`
                                      : undefined
                              }
                              onClick={() => void runAction({
                                type: 'farming_buy_seed',
                                cropId,
                                quantity,
                              })}
                            >
                              买种
                            </Button>
                            <Button
                              size="small"
                              type="primary"
                              disabled={busy || inventory.produce[cropId] < quantity}
                              title={
                                busy
                                  ? '正在保存另一项操作'
                                  : inventory.produce[cropId] < quantity
                                    ? `库存不足，当前有 ${inventory.produce[cropId]}`
                                    : undefined
                              }
                              onClick={() => void runAction({
                                type: 'farming_sell',
                                cropId,
                                quantity,
                              })}
                            >
                              出售
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>}
          </section>
        )}

        {isOwnerView && (
          <section className="farm-panel farm-panel--progression">
            <header className="farm-panel__header">
              <div>
                <span>SECTION 03</span>
                <h2>永久建设</h2>
              </div>
            </header>
            <div className="farm-upgrades">
              <article>
                <span>土地扩建</span>
                {ownGame.nextExpansion ? (
                  <>
                    <strong>第 {ownGame.nextExpansion.plotIndex + 1} 块田</strong>
                    <small>
                      需要 LV {ownGame.nextExpansion.requiredLevel} · {ownGame.nextExpansion.coinCost} 金币
                    </small>
                    <Button
                      type="primary"
                      disabled={busy || !canExpand}
                      onClick={() => void runAction({ type: 'farming_expand_plot' })}
                    >
                      永久开垦
                    </Button>
                  </>
                ) : <strong>全部土地已开垦</strong>}
              </article>
              <article>
                <span>护院犬</span>
                {ownGame.nextDogUpgrade ? (
                  <>
                    <strong>升级至 {ownGame.nextDogUpgrade.level} 级</strong>
                    <small>
                      需要 LV {ownGame.nextDogUpgrade.requiredFarmLevel} · {ownGame.nextDogUpgrade.coinCost} 金币
                    </small>
                    <Button
                      disabled={busy || !canUpgradeDog}
                      onClick={() => void runAction({ type: 'farming_upgrade_dog' })}
                    >
                      升级守护
                    </Button>
                  </>
                ) : <strong>护院犬已满级</strong>}
              </article>
              <article className="farm-mutation-card">
                <span>变异图鉴</span>
                <strong>
                  {CROP_IDS.reduce((total, cropId) => total + inventory.mutations[cropId], 0)} 株
                </strong>
                <small>
                  普通收获有 7% 概率发现；完整浇水、除草和除虫可提升到 12%。
                  变异作物可提交珍稀订单，按当日收购价 5 倍兑换金币，并获得对应收获经验。
                </small>
                {CROP_IDS.some((cropId) => inventory.mutations[cropId] > 0) ? (
                  <div className="farm-mutation-list">
                    {CROP_IDS.filter((cropId) =>
                      inventory.mutations[cropId] > 0
                    ).map((cropId) => {
                      const crop = ownGame.crops[cropId];
                      const coinReward = ownGame.market[cropId].price * 5;
                      return (
                        <div key={cropId}>
                          <span>
                            <strong>变异{crop.name} ×{inventory.mutations[cropId]}</strong>
                            <small>{coinReward} 金币 + {crop.harvestExperience} 经验 / 株</small>
                          </span>
                          <Button
                            size="small"
                            type="primary"
                            disabled={busy}
                            onClick={() => void runAction({
                              type: 'farming_redeem_mutation',
                              cropId,
                              quantity: 1,
                            })}
                          >
                            兑换 1 株
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <em className="farm-mutation-empty">
                    暂无变异作物；保持完整照料后收获即可尝试发现。
                  </em>
                )}
              </article>
            </div>
          </section>
        )}

        <section className="farm-panel farm-panel--neighbors">
          <header className="farm-panel__header">
            <div>
              <span>SECTION {isOwnerView ? '04' : '02'}</span>
              <h2>农友广场</h2>
            </div>
            <small>{snapshot.neighbors.length} ACTIVE FARMS</small>
          </header>
          <div className="farm-neighbor-list">
            {snapshot.neighbors.length === 0 && (
              <p className="farm-empty-note">其他账号建立农场后会出现在这里。</p>
            )}
            {snapshot.neighbors.map((neighbor) => (
              <button
                type="button"
                key={neighbor.ownerId}
                className={
                  neighborFarm?.ownerId === neighbor.ownerId
                    ? 'farm-neighbor farm-neighbor--active'
                    : 'farm-neighbor'
                }
                disabled={busy}
                onClick={() => void openNeighbor(neighbor.ownerId)}
              >
                <span>
                  <strong>{neighbor.ownerName}</strong>
                  <small>LV {neighbor.level} · {neighbor.unlockedPlots} 块田 · 犬 {neighbor.dogLevel} 级</small>
                </span>
                <span className="farm-neighbor__signals">
                  {neighbor.stealablePlots > 0 && <Tag color="red">可摘 {neighbor.stealablePlots}</Tag>}
                  {neighbor.careNeededPlots > 0 && <Tag color="blue">可帮 {neighbor.careNeededPlots}</Tag>}
                  {neighbor.readyPlots > 0 && <Tag>成熟 {neighbor.readyPlots}</Tag>}
                </span>
              </button>
            ))}
          </div>
        </section>

        {isOwnerView && (
          <section className="farm-panel farm-panel--ledger">
            <header className="farm-panel__header">
              <div>
                <span>SECTION 05</span>
                <h2>库存台账</h2>
              </div>
            </header>
            <dl className="farm-ledger farm-ledger--expanded">
              {CROP_IDS.filter((cropId) =>
                inventory.seeds[cropId] > 0 ||
                inventory.produce[cropId] > 0 ||
                inventory.mutations[cropId] > 0
              ).map((cropId) => (
                <div key={cropId}>
                  <dt>{ownGame.crops[cropId].name}</dt>
                  <dd><span>种子</span><strong>{inventory.seeds[cropId]}</strong></dd>
                  <dd><span>农产</span><strong>{inventory.produce[cropId]}</strong></dd>
                  <dd><span>变异</span><strong>{inventory.mutations[cropId]}</strong></dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <section className="farm-panel farm-panel--log">
          <header className="farm-panel__header">
            <div>
              <span>SECTION {isOwnerView ? '06' : '03'}</span>
              <h2>{isOwnerView ? '经营与访问记录' : '农场里程碑'}</h2>
            </div>
            <small>LAST {Math.min(displayGame.logs.length, 16)}</small>
          </header>
          <ol className="farm-log">
            {displayGame.logs.slice(-16).reverse().map((entry) => (
              <li key={`${entry.id}-${entry.at}`}>
                <span>{new Date(entry.at).toLocaleString('zh-CN', {
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}</span>
                <p>{entry.text}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}
