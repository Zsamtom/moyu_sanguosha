import {
  Button,
  InputNumber,
  Progress,
  Select,
  Spin,
  Tag,
  message,
} from 'antd';
import { useEffect, useMemo, useState } from 'react';
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
  const [now, setNow] = useState(Date.now());
  const [selectedAnimal, setSelectedAnimal] = useState<RanchAnimalId>('chicken');
  const [quantities, setQuantities] = useState<Record<RanchProductId, number>>(
    Object.fromEntries(PRODUCT_IDS.map((productId) => [productId, 1])) as Record<RanchProductId, number>,
  );

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const next = await api.getRanch();
      setSnapshot(next);
      setNow(Date.now());
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
    const clock = window.setInterval(() => setNow(Date.now()), 1_000);
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
    if (!snapshot || busy) return;
    setBusy(true);
    try {
      const next = await api.applyRanchAction(
        snapshot.ranch.farmRevision,
        snapshot.ranch.revision,
        action,
      );
      setSnapshot(next);
      setNow(Date.now());
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
      setBusy(false);
    }
  };

  const openNeighbor = async (ownerId: string) => {
    if (busy) return;
    setBusy(true);
    try {
      setNeighborRanch(await api.getRanchNeighbor(ownerId));
      setNow(Date.now());
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
      setNow(Date.now());
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
      <header className="farm-hero">
        <div>
          <p className="farm-kicker">PERSISTENT RANCH / REALTIME-V1</p>
          <h1>{isOwnerView ? '我的长期牧场' : `${displayGame.ownerName}的牧场`}</h1>
          <p className="farm-subtitle">
            农作物转化饲料 · 动物离线生产 · 农友清扫与限额拿取
          </p>
        </div>
        <div className="farm-day-block" aria-label="牧场等级">
          <span>RANCH LEVEL</span>
          <strong>{String(displayGame.level).padStart(2, '0')}</strong>
          <small>{displayGame.unlockedPens} / 8 间畜舍</small>
        </div>
      </header>

      <section className="farm-status-strip" aria-label="牧场状态">
        <span><i className="farm-status-dot" /> 存档：服务器实时持久化</span>
        <span>场主：{displayGame.ownerName}</span>
        <span>农场：LV {displayGame.farmLevel}</span>
        <span>护院犬：{displayGame.dogLevel} 级 / 拦截 {displayGame.dogBlockChance}%</span>
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
          <section className="farm-market-event ranch-feed-loop">
            <div>
              <span>FARM → FEED → PRODUCT → COIN</span>
              <h2>农牧循环已接通</h2>
            </div>
            <p>
              收获小麦、玉米与胡萝卜作为饲料；动物产品进入牧场仓库，
              售出后金币回到同一个农场账户。
            </p>
          </section>

          <div className="farm-document-grid">
            <section className="farm-panel farm-panel--field">
              <header className="farm-panel__header">
                <div>
                  <span>SECTION 01</span>
                  <h2>{isOwnerView ? '实时畜舍作业' : '农友畜舍访问'}</h2>
                </div>
                {isOwnerView && (
                  <Select
                    aria-label="购入动物"
                    size="small"
                    value={selectedAnimal}
                    options={ANIMAL_IDS.map((animalId) => {
                      const animal = ownGame.animals[animalId];
                      const unlocked = unlockedAnimals.includes(animalId);
                      return {
                        value: animalId,
                        disabled: !unlocked,
                        label: unlocked
                          ? `购入：${animal.name}`
                          : `${animal.name} · 农${animal.requiredFarmLevel}/牧${animal.requiredRanchLevel}`,
                      };
                    })}
                    onChange={setSelectedAnimal}
                  />
                )}
              </header>
              <div className="farm-plots farm-plots--realtime">
                {displayGame.pens.map((pen) => {
                  const animal = pen.animalId ? displayGame.animals[pen.animalId] : null;
                  const runtime = ranchPenRuntime(pen, animal, now);
                  const attempted = pen.collectAttempts.includes(ownGame.ownerId);
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
                      className={`farm-plot${runtime.ready ? ' farm-plot--ready' : ''}`}
                      key={pen.index}
                    >
                      <header>
                        <span>PEN-{String(pen.index + 1).padStart(2, '0')}</span>
                        <i>
                          {runtime.ready
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
                            ? '选择动物后即可购入'
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
                              disabled={
                                busy ||
                                !unlockedAnimals.includes(selectedAnimal) ||
                                economy.coins < selectedDefinition.purchaseCost
                              }
                              onClick={() => void runAction({
                                type: 'ranch_buy_animal',
                                animalId: selectedAnimal,
                                penIndex: pen.index,
                              })}
                            >
                              购入{selectedDefinition.name} · {selectedDefinition.purchaseCost}
                            </Button>
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
                              disabled={busy}
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
                  <small>SHARED ECONOMY / COIN</small>
                </header>
                <div className="farm-table-wrap">
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
                </div>
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
