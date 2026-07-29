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
import '../farm.css';
import '../ranch.css';

const ANIMAL_IDS: RanchAnimalId[] = [
  'chicken',
  'duck',
  'rabbit',
  'sheep',
  'cow',
  'goat',
];

const PRODUCT_IDS: RanchProductId[] = [
  'egg',
  'duck_egg',
  'rabbit_fur',
  'wool',
  'milk',
  'goat_milk',
];

const RANCH_DAILY_HELP_LIMIT = 20;
const RANCH_DAILY_COLLECT_LIMIT = 10;

const FEED_NAMES = {
  wheat: '小麦',
  corn: '玉米',
  carrot: '胡萝卜',
} as const;

const ANIMAL_MARKS: Record<RanchAnimalId, string> = {
  chicken: '鸡',
  duck: '鸭',
  rabbit: '兔',
  sheep: '羊',
  cow: '牛',
  goat: '乳羊',
};

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
    estimatedYield: Math.max(1, animal.yield - (hasMess ? 1 : 0)),
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
  const [selectedAnimal, setSelectedAnimal] = useState<RanchAnimalId>('chicken');
  const [movingPenIndex, setMovingPenIndex] = useState<number>();
  const [marketOpen, setMarketOpen] = useState(false);
  const [quantities, setQuantities] = useState<Record<RanchProductId, number>>(
    Object.fromEntries(PRODUCT_IDS.map((productId) => [productId, 1])) as Record<RanchProductId, number>,
  );

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const next = await api.getRanch();
      setSnapshot(next);
      clockOffset.current = next.ranch.serverTime - Date.now();
      setNow(next.ranch.serverTime);
      if (
        neighborRanch &&
        !next.neighbors.some((candidate) => candidate.ownerId === neighborRanch.ownerId)
      ) {
        setNeighborRanch(undefined);
      }
    } catch (error) {
      if (!quiet) toast.error(errorMessage(error));
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
    if (!neighborRanch) return;
    const ownerId = neighborRanch.ownerId;
    const refresh = window.setInterval(() => {
      void api.getRanchNeighbor(ownerId)
        .then((ranch) => setNeighborRanch(ranch))
        .catch(() => undefined);
    }, 30_000);
    return () => window.clearInterval(refresh);
  }, [neighborRanch?.ownerId]);

  const runAction = async (action: RanchClientAction) => {
    if (!snapshot || actionInFlight.current) return;
    actionInFlight.current = true;
    if (action.type !== 'ranch_move_animal') {
      setMovingPenIndex(undefined);
    }
    setBusy(true);
    setPendingAction(action);
    try {
      const next = await api.applyRanchAction(
        snapshot.ranch.farmRevision,
        snapshot.ranch.revision,
        action,
      );
      setSnapshot((current) => ({
        ranch: next.ranch,
        neighbors: current?.neighbors ?? snapshot.neighbors,
      }));
      clockOffset.current = next.ranch.serverTime - Date.now();
      setNow(next.ranch.serverTime);
      if (action.type === 'ranch_buy_animal') {
        toast.success(
          `已在 ${action.penIndex + 1} 号畜舍购入${next.ranch.animals[action.animalId].name}`,
        );
      } else if (action.type === 'ranch_move_animal') {
        setMovingPenIndex(undefined);
        toast.success(
          `已将动物移动至 ${action.toPenIndex + 1} 号畜舍`,
        );
      } else if (action.type === 'ranch_sell_animal') {
        toast.success(`已出售 ${action.penIndex + 1} 号畜舍的动物`);
      }
    } catch (error) {
      if (
        error instanceof ApiError &&
        ['FARM_REVISION_CONFLICT', 'RANCH_REVISION_CONFLICT'].includes(
          error.code ?? '',
        )
      ) {
        await load();
      }
      toast.error(errorMessage(error));
    } finally {
      actionInFlight.current = false;
      setBusy(false);
      setPendingAction(undefined);
    }
  };

  const openNeighbor = async (ownerId: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const next = await api.getRanchNeighbor(ownerId);
      setNeighborRanch(next);
      clockOffset.current = next.serverTime - Date.now();
      setNow(next.serverTime);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const runVisitAction = async (action: RanchVisitClientAction) => {
    if (!snapshot || !neighborRanch || busy) return;
    setBusy(true);
    try {
      const next = await api.applyRanchVisitAction(
        neighborRanch.ownerId,
        snapshot.ranch.revision,
        neighborRanch.revision,
        action,
      );
      setSnapshot({ ranch: next.ranch, neighbors: next.neighbors });
      setNeighborRanch(next.neighbor);
      clockOffset.current = next.ranch.serverTime - Date.now();
      setNow(next.ranch.serverTime);
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
        await load();
        try {
          setNeighborRanch(await api.getRanchNeighbor(neighborRanch.ownerId));
        } catch {
          setNeighborRanch(undefined);
        }
      }
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const ownGame = snapshot?.ranch;
  const displayGame = neighborRanch ?? ownGame;
  const unlockedAnimals = useMemo(
    () => ownGame
      ? ANIMAL_IDS.filter((animalId) => {
          const animal = ownGame.animals[animalId];
          return ownGame.farmLevel >= animal.requiredFarmLevel &&
            ownGame.level >= animal.requiredRanchLevel;
        })
      : [],
    [ownGame],
  );

  useEffect(() => {
    if (ownGame && !unlockedAnimals.includes(selectedAnimal)) {
      setSelectedAnimal(unlockedAnimals[0] ?? 'chicken');
    }
  }, [ownGame?.farmLevel, ownGame?.level]);

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

  const isOwnerView = displayGame.isOwner;
  const economy = ownGame.economy!;
  const selectedDefinition = ownGame.animals[selectedAnimal];
  const canExpand =
    isOwnerView &&
    ownGame.nextExpansion !== null &&
    ownGame.farmLevel >= ownGame.nextExpansion.requiredFarmLevel &&
    ownGame.level >= ownGame.nextExpansion.requiredRanchLevel &&
    economy.coins >= ownGame.nextExpansion.coinCost;
  const productDefinitions = Object.fromEntries(
    ANIMAL_IDS.map((animalId) => {
      const animal = ownGame.animals[animalId];
      return [animal.productId, animal];
    }),
  ) as Record<RanchProductId, RanchAnimalDefinition>;

  return (
    <main className="farm-page ranch-page">
      {toastContext}
      <section className="farm-status-strip" aria-label="牧场状态">
        <span><i className="farm-status-dot" /> 存档：服务器实时持久化</span>
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
          <Button size="small" onClick={() => setNeighborRanch(undefined)}>
            返回我的牧场
          </Button>
        )}
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
          <strong>{displayGame.unlockedPens} / 8</strong>
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
            开放后，小麦、玉米与胡萝卜会成为动物饲料。
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
                    return (
                      <Button
                        key={animalId}
                        aria-pressed={selectedAnimal === animalId}
                        size="small"
                        type={selectedAnimal === animalId ? 'primary' : 'default'}
                        onClick={() => {
                          setSelectedAnimal(animalId);
                          setMovingPenIndex(undefined);
                          toast.info(`已选择${animal.name}，请点击空置畜舍购入`);
                        }}
                      >
                        {selectedAnimal === animalId && <span aria-hidden="true">✓</span>}
                        {animal.name}
                        <small>◎{animal.purchaseCost}</small>
                      </Button>
                    );
                  })}
                  {movingPenIndex !== undefined && (
                    <Button
                      danger
                      size="small"
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
                  const animal = pen.animalId ? displayGame.animals[pen.animalId] : null;
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
                    unlockedAnimals.includes(selectedAnimal) &&
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
                              animalId: selectedAnimal,
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
                            {ANIMAL_MARKS[animal.id]}
                          </span>
                        )}
                        <strong>{animal?.name ?? '空置畜舍'}</strong>
                        <small>
                          {!animal
                            ? movingPenIndex !== undefined
                              ? `点击下方按钮把动物移到 ${pen.index + 1} 号畜舍`
                              : `点击下方按钮购入${selectedDefinition.name}`
                            : pen.fedAt === null
                              ? `等待投喂 · 产出${animal.productName}`
                              : `${remainingLabel(runtime.remainingMs)} · 预计 ${runtime.estimatedYield} 份${animal.productName}`}
                        </small>
                        <div className="farm-plot__tags">
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
                              onClick={() => void runAction(canMoveHere
                                ? {
                                    type: 'ranch_move_animal',
                                    fromPenIndex: movingPenIndex,
                                    toPenIndex: pen.index,
                                  }
                                : {
                                    type: 'ranch_buy_animal',
                                    animalId: selectedAnimal,
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
                                economy.produce[animal.feedCropId] < animal.feedAmount
                              }
                              onClick={() => void runAction({
                                type: 'ranch_feed',
                                penIndex: pen.index,
                              })}
                            >
                              投喂{FEED_NAMES[animal.feedCropId as keyof typeof FEED_NAMES] ?? animal.feedCropId}
                              ×{animal.feedAmount}
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
                              onClick={() => void runAction({
                                type: 'ranch_collect',
                                penIndex: pen.index,
                              })}
                            >
                              收取{animal.productName}
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
                      {ANIMAL_IDS.map((animalId) => {
                        const animal = ownGame.animals[animalId];
                        const quantity = quantities[animal.productId];
                        const unlocked = unlockedAnimals.includes(animalId);
                        return (
                          <tr key={animalId} className={unlocked ? '' : 'farm-row--locked'}>
                            <td>
                              <strong>{animal.name} → {animal.productName}</strong>
                              <small>购入 {animal.purchaseCost} · 售价 {animal.productPrice}</small>
                            </td>
                            <td>农 {animal.requiredFarmLevel} / 牧 {animal.requiredRanchLevel}</td>
                            <td>
                              {FEED_NAMES[animal.feedCropId as keyof typeof FEED_NAMES] ?? animal.feedCropId}
                              ×{animal.feedAmount}
                            </td>
                            <td>{durationLabel(animal.productionSeconds)}</td>
                            <td>{animal.yield}</td>
                            <td>{economy.products[animal.productId]}</td>
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
                                disabled={busy || economy.products[animal.productId] < quantity}
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
                  {(['wheat', 'corn', 'carrot'] as const).map((cropId) => (
                    <article key={cropId}>
                      <span>{FEED_NAMES[cropId]}饲料源</span>
                      <strong>{economy.produce[cropId]}</strong>
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
