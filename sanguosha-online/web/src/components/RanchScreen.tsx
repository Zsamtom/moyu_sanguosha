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
  isTownRevisionVectorAtLeast,
} from '../snapshotGuards';
import {
  awaitWithAbort,
  isSerialActionTimeoutError,
  useSerialActionQueue,
} from '../serialActionQueue';
import type {
  RanchAnimalDefinition,
  RanchAnimalId,
  RanchClientAction,
  RanchGameView,
  RanchPen,
  RanchProductId,
  RanchSnapshot,
  RanchVisitClientAction,
} from '../types';
import { ProductionModifierTag } from './ProductionModifierTag';
import '../farm.css';
import '../ranch.css';

const RANCH_DAILY_HELP_LIMIT = 20;
const RANCH_DAILY_COLLECT_LIMIT = 10;

export function canCommitRanchSnapshot(
  next: RanchSnapshot,
  current?: RanchSnapshot,
): boolean {
  return isTownRevisionVectorAtLeast(
    next.ranch.townId,
    [next.ranch.farmRevision, next.ranch.revision],
    current?.ranch.townId,
    current
      ? [current.ranch.farmRevision, current.ranch.revision]
      : undefined,
  );
}

const FEED_NAMES: Partial<Record<string, string>> = {
  wheat: '小麦',
  corn: '玉米',
  carrot: '胡萝卜',
  frost_barley: '霜麦',
  snow_potato: '雪薯',
  highland_bean: '高原豆',
};

type RanchCatalogView = Pick<RanchGameView, 'animals' | 'townDefinition'>;

function fallbackCatalogName(id: string): string {
  return id
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || '未知资源';
}

export function ranchAnimalCatalogIds(
  game: RanchCatalogView,
): RanchAnimalId[] {
  const available = new Set(Object.keys(game.animals));
  const ordered = game.townDefinition.content.animalIds.filter(
    (animalId): animalId is RanchAnimalId => available.has(animalId),
  );
  for (const animalId of available) {
    if (!ordered.includes(animalId as RanchAnimalId)) {
      ordered.push(animalId as RanchAnimalId);
    }
  }
  return ordered;
}

export function ranchAnimalName(
  game: Pick<RanchGameView, 'animals'>,
  animalId: RanchAnimalId,
): string {
  return game.animals[animalId]?.name ?? fallbackCatalogName(animalId);
}

export function ranchFeedName(cropId: string): string {
  return FEED_NAMES[cropId] ?? fallbackCatalogName(cropId);
}

function animalMark(animal: RanchAnimalDefinition): string {
  return animal.name.slice(0, 2) || '牧';
}

function inventoryCount<T extends string>(
  counts: Partial<Record<T, number>>,
  id: T,
): number {
  return counts[id] ?? 0;
}

export interface RanchPenRuntime {
  ready: boolean;
  progress: number;
  hasMess: boolean;
  estimatedYield: number;
  remainingMs: number;
}

export function ranchPenRuntime(
  pen: RanchPen,
  animal: RanchAnimalDefinition | null,
  now: number,
): RanchPenRuntime {
  if (!animal || pen.fedAt === null || pen.producesAt === null) {
    return {
      ready: false,
      progress: 0,
      hasMess: false,
      estimatedYield: 0,
      remainingMs: 0,
    };
  }
  const ready = now >= pen.producesAt;
  const progress = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        ((now - pen.fedAt) / Math.max(1, pen.producesAt - pen.fedAt)) * 100,
      ),
    ),
  );
  const hasMess =
    pen.messAt !== null &&
    now >= pen.messAt &&
    !pen.messCleaned;
  return {
    ready,
    progress,
    hasMess,
    estimatedYield: Math.max(
      1,
      Math.round(
        (animal.yield - (hasMess ? 1 : 0)) *
          (100 + (pen.productionModifierPercent ?? 0)) /
          100,
      ),
    ),
    remainingMs: Math.max(0, pen.producesAt - now),
  };
}

function remainingLabel(milliseconds: number): string {
  if (milliseconds <= 0) return '产品可收取';
  const seconds = Math.ceil(milliseconds / 1_000);
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours} 小时${rest > 0 ? ` ${rest} 分` : ''}`;
}

function durationLabel(seconds: number): string {
  if (seconds < 60 * 60) return `${Math.round(seconds / 60)} 分钟`;
  return `${Math.round((seconds / 60 / 60) * 10) / 10} 小时`;
}

function experiencePercent(game: RanchGameView): number {
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

export function RanchScreen() {
  const [toast, toastContext] = message.useMessage();
  const [snapshot, setSnapshot] = useState<RanchSnapshot>();
  const [neighborRanch, setNeighborRanch] = useState<RanchGameView>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState<RanchClientAction>();
  const [now, setNow] = useState(Date.now());
  const clockOffset = useRef(0);
  const actionInFlight = useRef(false);
  const snapshotRef = useRef<RanchSnapshot>();
  const neighborRanchRef = useRef<RanchGameView>();
  const loadRequestSequence = useRef(0);
  const neighborRequestSequence = useRef(0);
  const {
    enqueue: enqueueAction,
    cancelPending: cancelPendingActions,
    pendingCount: queuedActionCount,
  } =
    useSerialActionQueue();
  const previousQueuedActionCount = useRef(queuedActionCount);
  const [selectedAnimal, setSelectedAnimal] =
    useState<RanchAnimalId | null>(null);
  const [movingPenIndex, setMovingPenIndex] = useState<number>();
  const [marketOpen, setMarketOpen] = useState(false);
  const [quantities, setQuantities] = useState<
    Partial<Record<RanchProductId, number>>
  >({});

  const commitSnapshot = (next: RanchSnapshot): boolean => {
    const current = snapshotRef.current;
    if (!canCommitRanchSnapshot(next, current)) {
      return false;
    }
    const townChanged = Boolean(
      current && current.ranch.townId !== next.ranch.townId,
    );
    snapshotRef.current = next;
    setSnapshot(next);
    clockOffset.current = next.ranch.serverTime - Date.now();
    setNow(next.ranch.serverTime);
    if (townChanged) {
      neighborRequestSequence.current += 1;
      neighborRanchRef.current = undefined;
      setNeighborRanch(undefined);
      setSelectedAnimal(null);
      setMovingPenIndex(undefined);
      setMarketOpen(false);
      setQuantities({});
    }
    return true;
  };

  const commitNeighborRanch = (
    next: RanchGameView | undefined,
    requestId?: number,
  ): boolean => {
    if (
      requestId !== undefined &&
      !isLatestRequest(requestId, neighborRequestSequence.current)
    ) {
      return false;
    }
    const current = neighborRanchRef.current;
    if (
      next &&
      current?.ownerId === next.ownerId &&
      !isRevisionVectorAtLeast(
        [next.farmRevision, next.revision],
        [current.farmRevision, current.revision],
      )
    ) {
      return false;
    }
    neighborRanchRef.current = next;
    setNeighborRanch(next);
    return true;
  };

  const clearNeighborRanch = () => {
    neighborRequestSequence.current += 1;
    commitNeighborRanch(undefined);
  };

  const load = async (quiet = false, allowDuringAction = false) => {
    if (quiet && actionInFlight.current && !allowDuringAction) return;
    const requestId = ++loadRequestSequence.current;
    if (!quiet) setLoading(true);
    try {
      const next = await api.getRanch();
      if (
        !isLatestRequest(requestId, loadRequestSequence.current) ||
        (actionInFlight.current && !allowDuringAction) ||
        !commitSnapshot(next)
      ) {
        return;
      }
      if (
        neighborRanchRef.current &&
        !next.neighbors.some(
          (candidate) => candidate.ownerId === neighborRanchRef.current?.ownerId,
        )
      ) {
        clearNeighborRanch();
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
    const previousCount = previousQueuedActionCount.current;
    previousQueuedActionCount.current = queuedActionCount;
    if (previousCount > 0 && queuedActionCount === 0) {
      void load(true, true);
    }
  }, [queuedActionCount]);

  useEffect(() => {
    if (!neighborRanch) return;
    const ownerId = neighborRanch.ownerId;
    const refresh = window.setInterval(() => {
      if (actionInFlight.current) return;
      const requestId = ++neighborRequestSequence.current;
      void api.getRanchNeighbor(ownerId)
        .then((ranch) => commitNeighborRanch(ranch, requestId))
        .catch(() => undefined);
    }, 30_000);
    return () => window.clearInterval(refresh);
  }, [neighborRanch?.ownerId]);

  const executeAction = async (
    action: RanchClientAction,
    signal: AbortSignal,
  ): Promise<void> => {
    const current = snapshotRef.current;
    if (!current) return;
    actionInFlight.current = true;
    loadRequestSequence.current += 1;
    if (action.type !== 'ranch_move_animal') {
      setMovingPenIndex(undefined);
    }
    setPendingAction(action);
    try {
      const next = await awaitWithAbort(
        api.applyRanchAction(
          current.ranch.farmRevision,
          current.ranch.revision,
          action,
          current.ranch.townId,
          signal,
        ),
        signal,
      );
      commitSnapshot({
        ranch: next.ranch,
        neighbors: snapshotRef.current?.neighbors ?? current.neighbors,
      });
      if (action.type === 'ranch_buy_animal') {
        toast.success(
          `已在 ${action.penIndex + 1} 号畜舍购入${ranchAnimalName(next.ranch, action.animalId)}`,
        );
      } else if (action.type === 'ranch_move_animal') {
        setMovingPenIndex(undefined);
        toast.success(
          `已将动物移动至 ${action.toPenIndex + 1} 号畜舍`,
        );
      } else if (action.type === 'ranch_sell_animal') {
        toast.success(`已出售 ${action.penIndex + 1} 号畜舍的动物`);
      } else if (action.type === 'ranch_clean_all') {
        toast.success('已完成一键清扫');
      } else if (action.type === 'ranch_collect_all') {
        toast.success('已收取全部成熟产品');
      }
    } catch (error) {
      if (
        error instanceof ApiError &&
        ['FARM_REVISION_CONFLICT', 'RANCH_REVISION_CONFLICT'].includes(
          error.code ?? '',
        )
      ) {
        cancelPendingActions();
        await load(true, true);
        toast.warning('状态已刷新：本次及后续待处理操作已取消，请确认后重新提交。');
      } else {
        if (isSerialActionTimeoutError(error)) {
          cancelPendingActions();
          await load(true, true);
          toast.warning('保存请求超时，已取消后续待处理操作并刷新状态；请确认结果后再试。');
        } else {
          toast.error(errorMessage(error));
        }
      }
    } finally {
      actionInFlight.current = false;
      setPendingAction(undefined);
    }
  };

  const runAction = (action: RanchClientAction) => {
    enqueueAction((signal) => executeAction(action, signal));
  };

  const openNeighbor = async (ownerId: string) => {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    loadRequestSequence.current += 1;
    const requestId = ++neighborRequestSequence.current;
    setBusy(true);
    try {
      const next = await api.getRanchNeighbor(ownerId);
      if (commitNeighborRanch(next, requestId)) {
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

  const runVisitAction = async (action: RanchVisitClientAction) => {
    const current = snapshotRef.current;
    const currentNeighbor = neighborRanchRef.current;
    if (!current || !currentNeighbor || actionInFlight.current) return;
    actionInFlight.current = true;
    loadRequestSequence.current += 1;
    neighborRequestSequence.current += 1;
    setBusy(true);
    let refreshAfterAction = false;
    try {
      const next = await api.applyRanchVisitAction(
        currentNeighbor.ownerId,
        current.ranch.revision,
        currentNeighbor.revision,
        action,
        current.ranch.townId,
      );
      commitSnapshot({ ranch: next.ranch, neighbors: next.neighbors });
      commitNeighborRanch(next.neighbor);
      toast.success(
        next.outcome === 'helped'
          ? '已帮助农友清扫畜舍'
          : next.outcome === 'collected'
            ? '成功拿到 1 份牧场产品'
            : '护院犬发现了你，本次拿取失败',
      );
    } catch (error) {
      if (
        error instanceof ApiError &&
        ['RANCH_REVISION_CONFLICT', 'RANCH_NEIGHBOR_REVISION_CONFLICT'].includes(
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
        commitNeighborRanch(
          await api.getRanchNeighbor(currentNeighbor.ownerId),
          requestId,
        );
      } catch {
        clearNeighborRanch();
      }
      actionInFlight.current = false;
      setBusy(false);
    }
  };

  const ownGame = snapshot?.ranch;
  const displayGame = neighborRanch ?? ownGame;
  const animalIds = useMemo(
    () => ownGame ? ranchAnimalCatalogIds(ownGame) : [],
    [ownGame?.animals, ownGame?.townDefinition],
  );
  const unlockedAnimals = useMemo(
    () => ownGame
      ? animalIds.filter((animalId) => {
          const animal = ownGame.animals[animalId];
          return animal !== undefined &&
            ownGame.farmLevel >= animal.requiredFarmLevel &&
            ownGame.level >= animal.requiredRanchLevel;
        })
      : [],
    [animalIds, ownGame?.animals, ownGame?.farmLevel, ownGame?.level],
  );
  const activeAnimalId =
    selectedAnimal && unlockedAnimals.includes(selectedAnimal)
      ? selectedAnimal
      : unlockedAnimals[0] ?? animalIds[0] ?? null;

  useEffect(() => {
    if (activeAnimalId !== selectedAnimal) {
      setSelectedAnimal(activeAnimalId);
    }
  }, [activeAnimalId, selectedAnimal]);

  if (loading && !snapshot) {
    return (
      <main className="farm-page farm-page--loading ranch-page">
        {toastContext}
        <Spin />
        <span>正在读取长期牧场档案…</span>
      </main>
    );
  }

  if (!snapshot || !ownGame || !displayGame) {
    return (
      <main className="farm-page farm-page--loading ranch-page">
        {toastContext}
        <p>未能读取牧场档案。</p>
        <Button onClick={() => void load()}>重新读取</Button>
      </main>
    );
  }

  const selectedDefinition =
    activeAnimalId ? ownGame.animals[activeAnimalId] : undefined;
  if (!activeAnimalId || !selectedDefinition) {
    return (
      <main className="farm-page farm-page--loading ranch-page">
        {toastContext}
        <p>{ownGame.townDefinition.name}的动物目录暂不可用，请刷新后重试。</p>
        <Button onClick={() => void load()}>重新读取</Button>
      </main>
    );
  }

  const isOwnerView = displayGame.isOwner;
  const economy = ownGame.economy!;
  const canExpand =
    isOwnerView &&
    ownGame.nextExpansion !== null &&
    ownGame.farmLevel >= ownGame.nextExpansion.requiredFarmLevel &&
    ownGame.level >= ownGame.nextExpansion.requiredRanchLevel &&
    economy.coins >= ownGame.nextExpansion.coinCost;
  const feedCropIds = Array.from(new Set(
    animalIds
      .map((animalId) => ownGame.animals[animalId]?.feedCropId)
      .filter((cropId): cropId is RanchAnimalDefinition['feedCropId'] =>
        cropId !== undefined
      ),
  ));
  const dirtyPenCount = ownGame.pens.filter((pen) =>
    pen.unlocked &&
    pen.animalId !== null &&
    pen.fedAt !== null &&
    pen.messAt !== null &&
    now >= pen.messAt &&
    !pen.messCleaned
  ).length;
  const readyPenCount = ownGame.pens.filter((pen) =>
    pen.unlocked &&
    pen.animalId !== null &&
    pen.producesAt !== null &&
    now >= pen.producesAt
  ).length;

  return (
    <main className="farm-page ranch-page">
      {toastContext}
      <section className="farm-status-strip" aria-label="牧场状态">
        <span><i className="farm-status-dot" /> 存档：服务器实时持久化</span>
        <span>城镇：{displayGame.townDefinition.name}</span>
        <span>场主：{displayGame.ownerName}</span>
        <span>牧场：LV {displayGame.level} / {displayGame.unlockedPens} 间畜舍</span>
        <span>农场：LV {displayGame.farmLevel}</span>
        <span>护院犬：{displayGame.dogLevel} 级 / 拦截 {displayGame.dogBlockChance}%</span>
        <span>
          今日互助：{ownGame.dailySocial?.helps ?? 0}/{RANCH_DAILY_HELP_LIMIT} ·
          拿取：{ownGame.dailySocial?.collects ?? 0}/{RANCH_DAILY_COLLECT_LIMIT}
        </span>
        <span>
          修订：F{String(displayGame.farmRevision).padStart(5, '0')} /
          R{String(displayGame.revision).padStart(5, '0')}
        </span>
        {!isOwnerView && (
          <Button
            size="small"
            disabled={busy}
            onClick={clearNeighborRanch}
          >
            返回我的牧场
          </Button>
        )}
        <span role="status" aria-live="polite">
          {busy
            ? '正在处理农友交互'
            : queuedActionCount > 0
              ? `后台保存队列 ${queuedActionCount} 项，可继续操作`
              : '操作就绪'}
        </span>
      </section>

      <section className="farm-metrics" aria-label="牧场经营指标">
        <article>
          <span>{isOwnerView ? '农场账户金币' : '牧场等级'}</span>
          <strong>{isOwnerView ? `◎ ${economy.coins}` : `LV ${displayGame.level}`}</strong>
          <small>{isOwnerView ? 'SHARED FARM COINS' : 'NEIGHBOR LEVEL'}</small>
        </article>
        <article>
          <span>牧场经验</span>
          <strong>{displayGame.experience}</strong>
          <Progress
            percent={experiencePercent(displayGame)}
            size="small"
            showInfo={false}
            strokeColor="#111"
          />
        </article>
        <article>
          <span>已扩建畜舍</span>
          <strong>{displayGame.unlockedPens} / {displayGame.pens.length}</strong>
          <small>PERMANENT PENS</small>
        </article>
        <article>
          <span>可收产品</span>
          <strong>
            {displayGame.pens.filter((pen) =>
              pen.producesAt !== null && now >= pen.producesAt
            ).length}
          </strong>
          <small>READY TO COLLECT</small>
        </article>
      </section>

      {!ownGame.unlocked ? (
        <section className="ranch-lock">
          <span>RANCH ACCESS CONTROL</span>
          <h2>牧场将在农场达到 {ownGame.requiredFarmLevel} 级后开放</h2>
          <p>
            当前农场等级为 {ownGame.farmLevel}。继续种植、照料和收获可获得经验；
            开放后，本镇特色作物会成为动物饲料。
          </p>
          <Progress
            percent={Math.min(
              100,
              Math.round((ownGame.farmLevel / ownGame.requiredFarmLevel) * 100),
            )}
            strokeColor="#111"
          />
        </section>
      ) : (
        <>
          <div className="farm-document-grid">
            <section className="farm-panel farm-panel--field">
              <header className="farm-panel__header">
                <div>
                  <span>SECTION 01</span>
                  <h2>{isOwnerView ? '实时畜舍作业' : '农友畜舍访问'}</h2>
                </div>
              </header>
              {isOwnerView && (
                <div className="farm-tool-strip" aria-label="动物购入工具">
                  <span className="farm-tool-strip__label">购入</span>
                  {unlockedAnimals.map((animalId) => {
                    const animal = ownGame.animals[animalId];
                    if (!animal) return null;
                    return (
                      <Button
                        key={animalId}
                        aria-pressed={activeAnimalId === animalId}
                        disabled={busy}
                        size="small"
                        type={activeAnimalId === animalId ? 'primary' : 'default'}
                        onClick={() => {
                          setSelectedAnimal(animalId);
                          setMovingPenIndex(undefined);
                          toast.info(`已选择${animal.name}，请点击空置畜舍购入`);
                        }}
                      >
                        {activeAnimalId === animalId && <span aria-hidden="true">✓</span>}
                        {animal.name}
                        <small>◎{animal.purchaseCost}</small>
                      </Button>
                    );
                  })}
                  <Button
                    disabled={busy || dirtyPenCount === 0}
                    loading={pendingAction?.type === 'ranch_clean_all'}
                    size="small"
                    onClick={() => void runAction({ type: 'ranch_clean_all' })}
                  >
                    一键清扫 ({dirtyPenCount})
                  </Button>
                  <Button
                    disabled={busy || readyPenCount === 0}
                    loading={pendingAction?.type === 'ranch_collect_all'}
                    size="small"
                    onClick={() => void runAction({ type: 'ranch_collect_all' })}
                  >
                    一键收取 ({readyPenCount})
                  </Button>
                  {movingPenIndex !== undefined && (
                    <Button
                      danger
                      size="small"
                      disabled={busy}
                      onClick={() => setMovingPenIndex(undefined)}
                    >
                      取消移栏
                    </Button>
                  )}
                  <span className="farm-tool-strip__hint">
                    {pendingAction
                      ? '正在保存本次牧场操作…'
                      : movingPenIndex !== undefined
                        ? `已选择 ${movingPenIndex + 1} 号畜舍，请点击另一间空置畜舍`
                        : `点击空置畜舍购入${selectedDefinition.name}；动物闲置时可以移栏或出售`}
                  </span>
                </div>
              )}
              <div className="farm-plots farm-plots--realtime">
                {displayGame.pens.map((pen) => {
                  const animal = pen.animalId
                    ? displayGame.animals[pen.animalId] ?? null
                    : null;
                  const runtime = ranchPenRuntime(pen, animal, now);
                  const attempted = pen.collectAttempts.includes(ownGame.ownerId);
                  const penPending =
                    pendingAction?.type === 'ranch_move_animal'
                      ? pendingAction.fromPenIndex === pen.index ||
                        pendingAction.toPenIndex === pen.index
                      : pendingAction !== undefined &&
                        'penIndex' in pendingAction &&
                        pendingAction.penIndex === pen.index;
                  const canMoveHere =
                    isOwnerView &&
                    !animal &&
                    !busy &&
                    movingPenIndex !== undefined &&
                    movingPenIndex !== pen.index;
                  const canBuyHere =
                    isOwnerView &&
                    !animal &&
                    !busy &&
                    movingPenIndex === undefined &&
                    unlockedAnimals.includes(activeAnimalId) &&
                    economy.coins >= selectedDefinition.purchaseCost;
                  if (!pen.unlocked) {
                    return (
                      <article className="farm-plot farm-plot--locked" key={pen.index}>
                        <header>
                          <span>PEN-{String(pen.index + 1).padStart(2, '0')}</span>
                          <i>LOCKED</i>
                        </header>
                        <div className="farm-plot__body">
                          <strong>待扩建畜舍</strong>
                          <small>提升农场与牧场等级后永久解锁</small>
                        </div>
                      </article>
                    );
                  }
                  return (
                    <article
                      className={`farm-plot${runtime.ready ? ' farm-plot--ready' : ''}${
                        canBuyHere || canMoveHere ? ' farm-plot--tool-ready' : ''
                      }${penPending ? ' farm-plot--pending' : ''}`}
                      key={pen.index}
                      onClick={(event) => {
                        if (
                          (!canBuyHere && !canMoveHere) ||
                          (event.target as HTMLElement).closest('button')
                        ) return;
                        void runAction(canMoveHere
                          ? {
                              type: 'ranch_move_animal',
                              fromPenIndex: movingPenIndex,
                              toPenIndex: pen.index,
                            }
                          : {
                              type: 'ranch_buy_animal',
                              animalId: activeAnimalId,
                              penIndex: pen.index,
                            });
                      }}
                    >
                      <header>
                        <span>PEN-{String(pen.index + 1).padStart(2, '0')}</span>
                        <i>
                          {penPending
                            ? 'SYNCING'
                            : runtime.ready
                            ? 'READY'
                            : pen.fedAt !== null ? 'PRODUCING' : animal ? 'WAITING' : 'IDLE'}
                        </i>
                      </header>
                      <div className="farm-plot__body ranch-pen__body">
                        {animal && (
                          <span className="ranch-animal-mark" aria-hidden="true">
                            {animalMark(animal)}
                          </span>
                        )}
                        <strong>
                          {pen.animalId
                            ? ranchAnimalName(displayGame, pen.animalId)
                            : '空置畜舍'}
                        </strong>
                        <small>
                          {pen.animalId && !animal
                            ? '动物目录正在同步，本地暂不估算产出'
                            : !animal
                            ? movingPenIndex !== undefined
                              ? `点击下方按钮把动物移到 ${pen.index + 1} 号畜舍`
                              : `点击下方按钮购入${selectedDefinition.name}`
                            : pen.fedAt === null
                              ? `等待投喂 · 产出${animal.productName}`
                              : `${remainingLabel(runtime.remainingMs)} · 预计 ${runtime.estimatedYield} 份${animal.productName}`}
                        </small>
                        <div className="farm-plot__tags">
                          {pen.fedAt !== null && (
                            <ProductionModifierTag
                              yieldPercent={pen.productionModifierPercent ?? 0}
                              durationPercent={pen.durationModifierPercent ?? 0}
                            />
                          )}
                          {animal && pen.fedAt === null && <Tag>待投喂</Tag>}
                          {runtime.hasMess && <Tag color="orange">需清扫</Tag>}
                          {pen.messCleaned && pen.fedAt !== null && <Tag color="green">已清扫</Tag>}
                          {pen.taken > 0 && <Tag>已被拿 {pen.taken}</Tag>}
                        </div>
                        <div className="farm-progress" aria-label={`生产进度 ${runtime.progress}%`}>
                          <span style={{ width: `${runtime.progress}%` }} />
                        </div>
                      </div>

                      {isOwnerView ? (
                        <div className="farm-plot__actions">
                          {!animal && (
                            <Button
                              block
                              size="small"
                              type={canMoveHere ? 'primary' : 'default'}
                              disabled={!canBuyHere && !canMoveHere}
                              title={
                                busy
                                  ? '正在切换农友页面'
                                  : !canMoveHere &&
                                      economy.coins < selectedDefinition.purchaseCost
                                    ? `金币不足，需要 ${selectedDefinition.purchaseCost}`
                                    : undefined
                              }
                              onClick={() => void runAction(canMoveHere
                                ? {
                                    type: 'ranch_move_animal',
                                    fromPenIndex: movingPenIndex,
                                    toPenIndex: pen.index,
                                  }
                                  : {
                                    type: 'ranch_buy_animal',
                                    animalId: activeAnimalId,
                                    penIndex: pen.index,
                                  })}
                            >
                              {canMoveHere
                                ? '移到这里'
                                : `购入${selectedDefinition.name} · ${selectedDefinition.purchaseCost}`}
                            </Button>
                          )}
                          {animal && (
                            <>
                              <Button
                                size="small"
                                disabled={busy || pen.fedAt !== null}
                                title={pen.fedAt !== null ? '生产中，请先收取产品' : undefined}
                                onClick={() => setMovingPenIndex(pen.index)}
                              >
                                {movingPenIndex === pen.index ? '已选择移栏' : '移动'}
                              </Button>
                              <Popconfirm
                                title={`出售${animal.name}？`}
                                description={`出售后返还 ${animal.resalePrice} 金币；生产中的动物需先收取产品。`}
                                okText="确认出售"
                                cancelText="取消"
                                disabled={busy || pen.fedAt !== null}
                                onConfirm={() => void runAction({
                                  type: 'ranch_sell_animal',
                                  penIndex: pen.index,
                                })}
                              >
                                <Button
                                  danger
                                  size="small"
                                  disabled={busy || pen.fedAt !== null}
                                  title={pen.fedAt !== null ? '生产中，请先收取产品' : undefined}
                                >
                                  出售 · ◎{animal.resalePrice}
                                </Button>
                              </Popconfirm>
                            </>
                          )}
                          {animal && pen.fedAt === null && (
                            <Button
                              block
                              size="small"
                              disabled={
                                busy ||
                                economy.coins < animal.careCost ||
                                inventoryCount(economy.produce, animal.feedCropId) <
                                  animal.feedAmount
                              }
                              onClick={() => void runAction({
                                type: 'ranch_feed',
                                penIndex: pen.index,
                              })}
                            >
                              投喂{ranchFeedName(animal.feedCropId)}
                              ×{animal.feedAmount}
                              {' '}+ 养护 ◎{animal.careCost}
                              （库存 {inventoryCount(economy.produce, animal.feedCropId)}）
                            </Button>
                          )}
                          {animal && runtime.hasMess && (
                            <Button
                              size="small"
                              disabled={busy}
                              onClick={() => void runAction({
                                type: 'ranch_clean',
                                penIndex: pen.index,
                              })}
                            >
                              清扫
                            </Button>
                          )}
                          {animal && runtime.ready && (
                            <Button
                              type="primary"
                              size="small"
                              disabled={busy}
                              onClick={() => void runAction(
                                animal.productionKind === 'meat'
                                  ? { type: 'ranch_slaughter', penIndex: pen.index }
                                  : { type: 'ranch_collect', penIndex: pen.index },
                              )}
                            >
                              {animal.productionKind === 'meat' ? '出栏' : '收取'}
                              {animal.productName}
                            </Button>
                          )}
                        </div>
                      ) : (
                        <div className="farm-plot__actions">
                          {animal && runtime.hasMess && (
                            <Button
                              size="small"
                              disabled={
                                busy ||
                                (ownGame.dailySocial?.helps ?? 0) >= RANCH_DAILY_HELP_LIMIT
                              }
                              onClick={() => void runVisitAction({
                                type: 'ranch_help',
                                penIndex: pen.index,
                              })}
                            >
                              帮忙清扫
                            </Button>
                          )}
                          {animal && runtime.ready && (
                            <Button
                              danger
                              size="small"
                              disabled={
                                busy ||
                                attempted ||
                                (ownGame.dailySocial?.collects ?? 0) >=
                                  RANCH_DAILY_COLLECT_LIMIT ||
                                pen.taken >= (runtime.estimatedYield >= 3 ? 1 : 0)
                              }
                              onClick={() => void runVisitAction({
                                type: 'ranch_neighbor_collect',
                                penIndex: pen.index,
                              })}
                            >
                              {attempted ? '已经尝试' : `拿取 1 份${animal.productName}`}
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
                    <h2>动物与产品市场</h2>
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
                        <th>动物 / 产品</th>
                        <th>解锁</th>
                        <th>饲料</th>
                        <th>周期</th>
                        <th>产量</th>
                        <th>库存</th>
                        <th>数量</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {animalIds.map((animalId) => {
                        const animal = ownGame.animals[animalId];
                        if (!animal) return null;
                        const quantity = quantities[animal.productId] ?? 1;
                        const unlocked = unlockedAnimals.includes(animalId);
                        return (
                          <tr key={animalId} className={unlocked ? '' : 'farm-row--locked'}>
                            <td>
                              <strong>{animal.name} → {animal.productName}</strong>
                              <small>购入 {animal.purchaseCost} · 售价 {animal.productPrice}</small>
                            </td>
                            <td>农 {animal.requiredFarmLevel} / 牧 {animal.requiredRanchLevel}</td>
                            <td>
                              {ranchFeedName(animal.feedCropId)}
                              ×{animal.feedAmount} + 养护 ◎{animal.careCost}
                            </td>
                            <td>{durationLabel(animal.productionSeconds)}</td>
                            <td>{animal.yield}</td>
                            <td>{inventoryCount(economy.products, animal.productId)}</td>
                            <td>
                              <InputNumber
                                aria-label={`${animal.productName}出售数量`}
                                min={1}
                                max={99}
                                size="small"
                                value={quantity}
                                onChange={(value) => setQuantities((current) => ({
                                  ...current,
                                  [animal.productId]: value ?? 1,
                                }))}
                              />
                            </td>
                            <td>
                              <Button
                                size="small"
                                disabled={
                                  busy ||
                                  inventoryCount(economy.products, animal.productId) <
                                    quantity
                                }
                                title={
                                  busy
                                    ? '正在切换农友页面'
                                    : inventoryCount(economy.products, animal.productId) <
                                        quantity
                                      ? `库存不足，当前有 ${inventoryCount(economy.products, animal.productId)}`
                                      : undefined
                                }
                                onClick={() => void runAction({
                                  type: 'ranch_sell',
                                  productId: animal.productId,
                                  quantity,
                                })}
                              >
                                出 售
                              </Button>
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
              <section className="farm-panel">
                <header className="farm-panel__header">
                  <div>
                    <span>SECTION 03</span>
                    <h2>农牧资源台账</h2>
                  </div>
                </header>
                <div className="ranch-resource-grid">
                  {feedCropIds.map((cropId) => (
                    <article key={cropId}>
                      <span>{ranchFeedName(cropId)}饲料源</span>
                      <strong>{inventoryCount(economy.produce, cropId)}</strong>
                      <small>来自农场仓库</small>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {isOwnerView && (
              <section className="farm-panel">
                <header className="farm-panel__header">
                  <div>
                    <span>SECTION 04</span>
                    <h2>永久扩建</h2>
                  </div>
                </header>
                <div className="farm-upgrades ranch-upgrades">
                  <article>
                    <span>畜舍扩建</span>
                    <strong>
                      {ownGame.nextExpansion
                        ? `第 ${ownGame.nextExpansion.penIndex + 1} 间`
                        : '全部完成'}
                    </strong>
                    <small>
                      {ownGame.nextExpansion
                        ? `农 ${ownGame.nextExpansion.requiredFarmLevel} / 牧 ${ownGame.nextExpansion.requiredRanchLevel} · ${ownGame.nextExpansion.coinCost} 金币`
                        : '全部畜舍已永久开放'}
                    </small>
                    <Button
                      size="small"
                      disabled={busy || !canExpand}
                      onClick={() => void runAction({ type: 'ranch_expand_pen' })}
                    >
                      永久扩建
                    </Button>
                  </article>
                  <article>
                    <span>生产总览</span>
                    <strong>{ownGame.statistics?.productsCollected ?? 0} 份</strong>
                    <small>累计收取动物产品</small>
                  </article>
                  <article>
                    <span>农友协作</span>
                    <strong>{ownGame.statistics?.helpsGiven ?? 0} 次</strong>
                    <small>累计帮助清扫畜舍</small>
                  </article>
                </div>
              </section>
            )}

            <section className="farm-panel">
              <header className="farm-panel__header">
                <div>
                  <span>SECTION {isOwnerView ? '05' : '02'}</span>
                  <h2>牧友广场</h2>
                </div>
                <small>{snapshot.neighbors.length} ACTIVE RANCHES</small>
              </header>
              <div className="farm-neighbor-list">
                {snapshot.neighbors.length === 0 ? (
                  <p className="farm-empty-note">暂时没有其他长期牧场。</p>
                ) : snapshot.neighbors.map((neighbor) => (
                  <button
                    className={`farm-neighbor${
                      neighborRanch?.ownerId === neighbor.ownerId
                        ? ' farm-neighbor--active'
                        : ''
                    }`}
                    key={neighbor.ownerId}
                    type="button"
                    disabled={busy}
                    onClick={() => void openNeighbor(neighbor.ownerId)}
                  >
                    <span>
                      <strong>{neighbor.ownerName}</strong>
                      <small>牧 LV {neighbor.level} · {neighbor.unlockedPens} 间畜舍</small>
                    </span>
                    <span className="farm-neighbor__signals">
                      {neighbor.careNeededPens > 0 && <Tag>可帮 {neighbor.careNeededPens}</Tag>}
                      {neighbor.collectiblePens > 0 && <Tag>可拿 {neighbor.collectiblePens}</Tag>}
                      {neighbor.readyPens > 0 && <Tag>成熟 {neighbor.readyPens}</Tag>}
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section className="farm-panel">
              <header className="farm-panel__header">
                <div>
                  <span>SECTION {isOwnerView ? '06' : '03'}</span>
                  <h2>{isOwnerView ? '牧场经营记录' : '牧场里程碑'}</h2>
                </div>
                <small>LAST {displayGame.logs.length}</small>
              </header>
              <ul className="farm-log">
                {displayGame.logs.slice().reverse().map((entry) => (
                  <li key={`${entry.id}-${entry.at}`}>
                    <span>
                      {new Date(entry.at).toLocaleString('zh-CN', {
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <p>{entry.text}</p>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </>
      )}
    </main>
  );
}
