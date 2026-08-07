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
  isTownRevisionVectorAtLeast,
} from '../snapshotGuards';
import {
  awaitWithAbort,
  isSerialActionTimeoutError,
  useSerialActionQueue,
} from '../serialActionQueue';
import type {
  MineClientAction,
  MineDepositDefinition,
  MineDepositId,
  MineGameView,
  MineShaft,
  MineSnapshot,
  RanchProductId,
} from '../types';
import { ProductionModifierTag } from './ProductionModifierTag';
import '../farm.css';

const MINE_UNREINFORCED_YIELD_PENALTY = 1;
const MINE_REINFORCED_YIELD_BONUS = 1;
import '../mine.css';

export function canCommitMineSnapshot(
  next: MineSnapshot,
  current?: MineSnapshot,
): boolean {
  return isTownRevisionVectorAtLeast(
    next.mine.townId,
    [
      next.mine.farmRevision,
      next.mine.ranchRevision,
      next.mine.revision,
    ],
    current?.mine.townId,
    current
      ? [
          current.mine.farmRevision,
          current.mine.ranchRevision,
          current.mine.revision,
        ]
      : undefined,
  );
}

const PRODUCT_NAMES: Partial<Record<RanchProductId, string>> = {
  egg: '鸡蛋',
  duck_egg: '鸭蛋',
  rabbit_fur: '兔绒',
  wool: '羊毛',
  milk: '牛奶',
  goat_milk: '羊奶',
  snow_egg: '雪羽蛋',
  ptarmigan_egg: '雷鸟蛋',
  angora_fur: '高原兔绒',
  highland_wool: '高地羊毛',
  yak_milk: '牦牛奶',
  cashmere: '山羊绒',
};

const DEPOSIT_MARKS: Partial<Record<MineDepositId, string>> = {
  coal: 'C',
  iron: 'Fe',
  copper: 'Cu',
  silver: 'Ag',
  gold: 'Au',
  crystal: '◇',
  lignite: 'L',
  magnetite: 'Mt',
  tin: 'Sn',
  frost_silver: 'Fs',
  glacier_gold: 'Gg',
  frost_crystal: '◆',
};

type MineCatalogView = Pick<MineGameView, 'deposits' | 'townDefinition'>;

function fallbackCatalogName(id: string): string {
  return id
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || '未知资源';
}

export function mineDepositCatalogIds(
  game: MineCatalogView,
): MineDepositId[] {
  const available = new Set(Object.keys(game.deposits));
  const ordered = game.townDefinition.content.depositIds.filter(
    (depositId): depositId is MineDepositId => available.has(depositId),
  );
  for (const depositId of available) {
    if (!ordered.includes(depositId as MineDepositId)) {
      ordered.push(depositId as MineDepositId);
    }
  }
  return ordered;
}

export function mineDepositName(
  game: Pick<MineGameView, 'deposits'>,
  depositId: MineDepositId,
): string {
  return game.deposits[depositId]?.name ?? fallbackCatalogName(depositId);
}

export function mineProductName(productId: RanchProductId): string {
  return PRODUCT_NAMES[productId] ?? fallbackCatalogName(productId);
}

function depositMark(deposit: MineDepositDefinition): string {
  return DEPOSIT_MARKS[deposit.id] ?? (deposit.name.slice(0, 2) || '矿');
}

function inventoryCount<T extends string>(
  counts: Partial<Record<T, number>>,
  id: T,
): number {
  return counts[id] ?? 0;
}

export interface MineShaftRuntime {
  ready: boolean;
  progress: number;
  hasHazard: boolean;
  estimatedYield: number;
  remainingMs: number;
}

export function mineShaftRuntime(
  shaft: MineShaft,
  deposit: MineDepositDefinition | null,
  pickaxeYieldBonus: number,
  now: number,
): MineShaftRuntime {
  if (!deposit || shaft.startedAt === null || shaft.completesAt === null) {
    return {
      ready: false,
      progress: 0,
      hasHazard: false,
      estimatedYield: 0,
      remainingMs: 0,
    };
  }
  const ready = now >= shaft.completesAt;
  const progress = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        ((now - shaft.startedAt) /
          Math.max(1, shaft.completesAt - shaft.startedAt)) * 100,
      ),
    ),
  );
  const hasHazard =
    shaft.hazardAt !== null &&
    now >= shaft.hazardAt &&
    !shaft.reinforced;
  return {
    ready,
    progress,
    hasHazard,
    estimatedYield: Math.max(
      1,
      Math.round(
        (
          deposit.yield +
          pickaxeYieldBonus -
          (hasHazard ? MINE_UNREINFORCED_YIELD_PENALTY : 0) +
          (shaft.reinforced ? MINE_REINFORCED_YIELD_BONUS : 0)
        ) *
          (100 + (shaft.productionModifierPercent ?? 0)) /
          100,
      ),
    ),
    remainingMs: Math.max(0, shaft.completesAt - now),
  };
}

function remainingLabel(milliseconds: number): string {
  if (milliseconds <= 0) return '采掘完成';
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

function experiencePercent(game: MineGameView): number {
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

export function MineScreen() {
  const [toast, toastContext] = message.useMessage();
  const [snapshot, setSnapshot] = useState<MineSnapshot>();
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<MineClientAction>();
  const [now, setNow] = useState(Date.now());
  const clockOffset = useRef(0);
  const actionInFlight = useRef(false);
  const snapshotRef = useRef<MineSnapshot>();
  const loadRequestSequence = useRef(0);
  const {
    enqueue: enqueueAction,
    cancelPending: cancelPendingActions,
    pendingCount: queuedActionCount,
  } =
    useSerialActionQueue();
  const previousQueuedActionCount = useRef(queuedActionCount);
  const [selectedDeposit, setSelectedDeposit] =
    useState<MineDepositId | null>(null);
  const [marketOpen, setMarketOpen] = useState(false);
  const [quantities, setQuantities] = useState<
    Partial<Record<MineDepositId, number>>
  >({});

  const commitSnapshot = (next: MineSnapshot): boolean => {
    const current = snapshotRef.current;
    if (!canCommitMineSnapshot(next, current)) {
      return false;
    }
    const townChanged = Boolean(
      current && current.mine.townId !== next.mine.townId,
    );
    snapshotRef.current = next;
    setSnapshot(next);
    clockOffset.current = next.mine.serverTime - Date.now();
    setNow(next.mine.serverTime);
    if (townChanged) {
      setSelectedDeposit(null);
      setMarketOpen(false);
      setQuantities({});
    }
    return true;
  };

  const load = async (quiet = false, allowDuringAction = false) => {
    if (quiet && actionInFlight.current && !allowDuringAction) return;
    const requestId = ++loadRequestSequence.current;
    if (!quiet) setLoading(true);
    try {
      const next = await api.getMine();
      if (
        isLatestRequest(requestId, loadRequestSequence.current) &&
        (allowDuringAction || !actionInFlight.current)
      ) {
        commitSnapshot(next);
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

  const executeAction = async (
    action: MineClientAction,
    signal: AbortSignal,
  ): Promise<void> => {
    const current = snapshotRef.current;
    if (!current) return;
    actionInFlight.current = true;
    loadRequestSequence.current += 1;
    setPendingAction(action);
    try {
      const game = current.mine;
      const next = await awaitWithAbort(
        api.applyMineAction(
          game.farmRevision,
          game.ranchRevision,
          game.revision,
          action,
          game.townId,
          signal,
        ),
        signal,
      );
      commitSnapshot(next);
      if (action.type === 'mine_start') {
        toast.success(
          `已在 ${action.shaftIndex + 1} 号矿井开采${mineDepositName(next.mine, action.depositId)}`,
        );
      } else if (action.type === 'mine_abandon') {
        toast.success(`已放弃 ${action.shaftIndex + 1} 号矿井的采掘任务`);
      } else if (action.type === 'mine_reinforce_all') {
        toast.success('已完成一键加固');
      } else if (action.type === 'mine_collect_all') {
        toast.success('已收取全部完成矿井');
      }
    } catch (error) {
      if (
        error instanceof ApiError &&
        [
          'FARM_REVISION_CONFLICT',
          'RANCH_REVISION_CONFLICT',
          'MINE_REVISION_CONFLICT',
        ].includes(error.code ?? '')
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

  const runAction = (action: MineClientAction) => {
    enqueueAction((signal) => executeAction(action, signal));
  };

  const game = snapshot?.mine;
  const depositIds = useMemo(
    () => game ? mineDepositCatalogIds(game) : [],
    [game?.deposits, game?.townDefinition],
  );
  const unlockedDeposits = useMemo(
    () => game
      ? depositIds.filter((depositId) => {
          const deposit = game.deposits[depositId];
          return deposit !== undefined &&
            game.farmLevel >= deposit.requiredFarmLevel &&
            game.ranchLevel >= deposit.requiredRanchLevel &&
            game.level >= deposit.requiredMineLevel;
        })
      : [],
    [
      depositIds,
      game?.deposits,
      game?.farmLevel,
      game?.ranchLevel,
      game?.level,
    ],
  );
  const activeDepositId =
    selectedDeposit && unlockedDeposits.includes(selectedDeposit)
      ? selectedDeposit
      : unlockedDeposits[0] ?? depositIds[0] ?? null;

  useEffect(() => {
    if (activeDepositId !== selectedDeposit) {
      setSelectedDeposit(activeDepositId);
    }
  }, [activeDepositId, selectedDeposit]);

  if (loading && !snapshot) {
    return (
      <main className="farm-page farm-page--loading mine-page">
        {toastContext}
        <Spin />
        <span>正在读取矿山档案…</span>
      </main>
    );
  }

  if (!snapshot || !game) {
    return (
      <main className="farm-page farm-page--loading mine-page">
        {toastContext}
        <p>未能读取矿山档案。</p>
        <Button onClick={() => void load()}>重新读取</Button>
      </main>
    );
  }

  const selectedDefinition =
    activeDepositId ? game.deposits[activeDepositId] : undefined;
  if (!activeDepositId || !selectedDefinition) {
    return (
      <main className="farm-page farm-page--loading mine-page">
        {toastContext}
        <p>{game.townDefinition.name}的矿脉目录暂不可用，请刷新后重试。</p>
        <Button onClick={() => void load()}>重新读取</Button>
      </main>
    );
  }

  const canStartSelected =
    unlockedDeposits.includes(activeDepositId) &&
    game.economy.coins >= selectedDefinition.expeditionCost &&
    inventoryCount(
      game.economy.ranchProducts,
      selectedDefinition.rationProductId,
    ) >=
      selectedDefinition.rationAmount;
  const startIssue =
    game.economy.coins < selectedDefinition.expeditionCost
      ? `金币不足：需要 ${selectedDefinition.expeditionCost}`
      : inventoryCount(
          game.economy.ranchProducts,
          selectedDefinition.rationProductId,
        ) <
          selectedDefinition.rationAmount
        ? `${mineProductName(selectedDefinition.rationProductId)}不足：需要 ${selectedDefinition.rationAmount}`
        : null;
  const canExpand =
    game.nextExpansion !== null &&
    game.farmLevel >= game.nextExpansion.requiredFarmLevel &&
    game.ranchLevel >= game.nextExpansion.requiredRanchLevel &&
    game.level >= game.nextExpansion.requiredMineLevel &&
    game.economy.coins >= game.nextExpansion.coinCost;
  const canUpgrade =
    game.nextPickaxeUpgrade !== null &&
    game.farmLevel >= game.nextPickaxeUpgrade.requiredFarmLevel &&
    game.ranchLevel >= game.nextPickaxeUpgrade.requiredRanchLevel &&
    game.level >= game.nextPickaxeUpgrade.requiredMineLevel &&
    game.economy.coins >= game.nextPickaxeUpgrade.coinCost;
  const supplyProductIds = Array.from(new Set(
    depositIds.flatMap((depositId) => {
      const deposit = game.deposits[depositId];
      return deposit
        ? [deposit.rationProductId, deposit.supportProductId]
        : [];
    }),
  ));
  const hazardShaftCount = game.shafts.filter((shaft) =>
    shaft.unlocked &&
    shaft.depositId !== null &&
    shaft.hazardAt !== null &&
    now >= shaft.hazardAt &&
    !shaft.reinforced
  ).length;
  const readyShaftCount = game.shafts.filter((shaft) =>
    shaft.unlocked &&
    shaft.depositId !== null &&
    shaft.completesAt !== null &&
    now >= shaft.completesAt
  ).length;

  return (
    <main className="farm-page mine-page">
      {toastContext}
      <section className="farm-status-strip" aria-label="矿山状态">
        <span><i className="farm-status-dot" /> 存档：服务器实时持久化</span>
        <span>城镇：{game.townDefinition.name}</span>
        <span>矿主：{game.ownerName}</span>
        <span>矿山：LV {game.level} / {game.unlockedShafts} 条矿井</span>
        <span>农场：LV {game.farmLevel}</span>
        <span>牧场：LV {game.ranchLevel}</span>
        <span>
          修订：F{String(game.farmRevision).padStart(5, '0')} /
          R{String(game.ranchRevision).padStart(5, '0')} /
          M{String(game.revision).padStart(5, '0')}
        </span>
        <span role="status" aria-live="polite">
          {queuedActionCount > 0
            ? `后台保存队列 ${queuedActionCount} 项，可继续操作`
            : '操作就绪'}
        </span>
      </section>

      <section className="farm-metrics" aria-label="矿山经营指标">
        <article>
          <span>农场账户金币</span>
          <strong>◎ {game.economy.coins}</strong>
          <small>SHARED FARM COINS</small>
        </article>
        <article>
          <span>矿山经验</span>
          <strong>{game.experience}</strong>
          <Progress
            percent={experiencePercent(game)}
            size="small"
            showInfo={false}
            strokeColor="#111"
          />
        </article>
        <article>
          <span>采掘工具</span>
          <strong>LV {game.pickaxeLevel}</strong>
          <small>产量加成 +{game.pickaxeYieldBonus}</small>
        </article>
        <article>
          <span>矿山遗物</span>
          <strong>{game.economy.relics}</strong>
          <small>永久收藏 · 加固矿井有 8% 概率发现</small>
        </article>
      </section>

      {!game.unlocked ? (
        <section className="mine-lock">
          <span>MINE ACCESS CONTROL</span>
          <h2>
            农场 {game.requiredFarmLevel} 级 + 牧场 {game.requiredRanchLevel} 级后开放
          </h2>
          <p>
            当前为农场 {game.farmLevel} 级、牧场 {game.ranchLevel} 级。
            矿山是最后开放的高阶经营线，会同时消耗农场金币与牧场产品。
          </p>
          <div className="mine-lock__progress">
            <label>
              <span>农场进度</span>
              <Progress
                percent={Math.min(
                  100,
                  Math.round((game.farmLevel / game.requiredFarmLevel) * 100),
                )}
                strokeColor="#111"
              />
            </label>
            <label>
              <span>牧场进度</span>
              <Progress
                percent={Math.min(
                  100,
                  Math.round((game.ranchLevel / game.requiredRanchLevel) * 100),
                )}
                strokeColor="#111"
              />
            </label>
          </div>
        </section>
      ) : (
        <>
          <div className="farm-document-grid">
            <section className="farm-panel farm-panel--field">
              <header className="farm-panel__header">
                <div>
                  <span>SECTION 01</span>
                  <h2>实时矿井作业</h2>
                </div>
              </header>
              <div className="farm-tool-strip" aria-label="矿脉选择工具">
                <span className="farm-tool-strip__label">开采</span>
                {unlockedDeposits.map((depositId) => {
                  const deposit = game.deposits[depositId];
                  if (!deposit) return null;
                  return (
                    <Button
                      key={depositId}
                      aria-pressed={activeDepositId === depositId}
                      size="small"
                      type={activeDepositId === depositId ? 'primary' : 'default'}
                      onClick={() => {
                        setSelectedDeposit(depositId);
                        toast.info(`已选择${deposit.name}，请点击空闲矿井开采`);
                      }}
                    >
                      {activeDepositId === depositId && <span aria-hidden="true">✓</span>}
                      {deposit.name}
                      <small>◎{deposit.expeditionCost}</small>
                    </Button>
                  );
                })}
                <Button
                  disabled={hazardShaftCount === 0}
                  loading={pendingAction?.type === 'mine_reinforce_all'}
                  size="small"
                  onClick={() => void runAction({ type: 'mine_reinforce_all' })}
                >
                  一键加固 ({hazardShaftCount})
                </Button>
                <Button
                  disabled={readyShaftCount === 0}
                  loading={pendingAction?.type === 'mine_collect_all'}
                  size="small"
                  onClick={() => void runAction({ type: 'mine_collect_all' })}
                >
                  一键收取 ({readyShaftCount})
                </Button>
                <span className="farm-tool-strip__hint">
                  {pendingAction
                    ? '正在保存本次矿山操作…'
                    : startIssue
                      ? startIssue
                    : `点击空闲矿井开采${selectedDefinition.name}；需${
                      mineProductName(selectedDefinition.rationProductId)
                    }×${selectedDefinition.rationAmount}`}
                </span>
              </div>
              <div className="farm-plots mine-shafts">
                {game.shafts.map((shaft) => {
                  const deposit = shaft.depositId
                    ? game.deposits[shaft.depositId] ?? null
                    : null;
                  const runtime = mineShaftRuntime(
                    shaft,
                    deposit,
                    game.pickaxeYieldBonus,
                    now,
                  );
                  const shaftPending =
                    pendingAction !== undefined &&
                    'shaftIndex' in pendingAction &&
                    pendingAction.shaftIndex === shaft.index;
                  const canStartHere = !deposit && canStartSelected;
                  if (!shaft.unlocked) {
                    return (
                      <article className="farm-plot farm-plot--locked mine-shaft" key={shaft.index}>
                        <header>
                          <span>SHAFT-{String(shaft.index + 1).padStart(2, '0')}</span>
                          <i>LOCKED</i>
                        </header>
                        <div className="farm-plot__body">
                          <strong>待扩建矿井</strong>
                          <small>提升三业等级并支付金币后永久解锁</small>
                        </div>
                      </article>
                    );
                  }
                  return (
                    <article
                      className={`farm-plot mine-shaft${
                        runtime.ready ? ' farm-plot--ready' : ''
                      }${canStartHere ? ' farm-plot--tool-ready' : ''}${
                        shaftPending ? ' farm-plot--pending' : ''
                      }`}
                      key={shaft.index}
                      onClick={(event) => {
                        if (
                          !canStartHere ||
                          (event.target as HTMLElement).closest('button')
                        ) return;
                        void runAction({
                          type: 'mine_start',
                          depositId: activeDepositId,
                          shaftIndex: shaft.index,
                        });
                      }}
                    >
                      <header>
                        <span>SHAFT-{String(shaft.index + 1).padStart(2, '0')}</span>
                        <i>
                          {shaftPending
                            ? 'SYNCING'
                            : runtime.ready ? 'READY' : deposit ? 'MINING' : 'IDLE'}
                        </i>
                      </header>
                      <div className="farm-plot__body mine-shaft__body">
                        {deposit && (
                          <span className="mine-deposit-mark" aria-hidden="true">
                            {depositMark(deposit)}
                          </span>
                        )}
                        <strong>
                          {shaft.depositId
                            ? mineDepositName(game, shaft.depositId)
                            : '空闲矿井'}
                        </strong>
                        <small>
                          {deposit
                            ? `${remainingLabel(runtime.remainingMs)} · 预计 ${runtime.estimatedYield} 份`
                            : shaft.depositId
                              ? '矿脉目录正在同步，本地暂不估算产量'
                            : startIssue
                              ? startIssue
                            : `点击下方按钮开采${selectedDefinition.name}`}
                        </small>
                        <div className="farm-plot__tags">
                          {deposit && (
                            <ProductionModifierTag
                              yieldPercent={shaft.productionModifierPercent ?? 0}
                              durationPercent={shaft.durationModifierPercent ?? 0}
                            />
                          )}
                          {runtime.hasHazard && <Tag color="orange">需加固</Tag>}
                          {shaft.reinforced && <Tag color="green">已加固</Tag>}
                          {deposit && (
                            <Tag>
                              口粮 {mineProductName(deposit.rationProductId)}×{deposit.rationAmount}
                            </Tag>
                          )}
                        </div>
                        <div className="farm-progress" aria-label={`采掘进度 ${runtime.progress}%`}>
                          <span style={{ width: `${runtime.progress}%` }} />
                        </div>
                      </div>
                      <div className="farm-plot__actions">
                        {!deposit && (
                          <Button
                            block
                            size="small"
                            disabled={!canStartHere}
                            onClick={() => void runAction({
                              type: 'mine_start',
                              depositId: activeDepositId,
                              shaftIndex: shaft.index,
                            })}
                          >
                            开采{selectedDefinition.name} · {selectedDefinition.expeditionCost}
                          </Button>
                        )}
                        {deposit && runtime.hasHazard && (
                          <Button
                            size="small"
                            disabled={
                              inventoryCount(
                                game.economy.ranchProducts,
                                deposit.supportProductId,
                              ) <
                                deposit.supportAmount
                            }
                            onClick={() => void runAction({
                              type: 'mine_reinforce',
                              shaftIndex: shaft.index,
                            })}
                          >
                            用{mineProductName(deposit.supportProductId)}
                            ×{deposit.supportAmount}加固
                            （库存 {inventoryCount(
                              game.economy.ranchProducts,
                              deposit.supportProductId,
                            )}）
                          </Button>
                        )}
                        {deposit && (
                          <Popconfirm
                            title={`放弃${deposit.name}任务？`}
                            description="已投入的金币、口粮和加固材料不会返还。"
                            okText="确认放弃"
                            cancelText="取消"
                            onConfirm={() => void runAction({
                              type: 'mine_abandon',
                              shaftIndex: shaft.index,
                            })}
                          >
                            <Button danger size="small">
                              放弃任务
                            </Button>
                          </Popconfirm>
                        )}
                        {deposit && runtime.ready && (
                          <Button
                            type="primary"
                            size="small"
                            onClick={() => void runAction({
                              type: 'mine_collect',
                              shaftIndex: shaft.index,
                            })}
                          >
                            收取矿石
                          </Button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="farm-panel farm-panel--market">
              <header className="farm-panel__header">
                <div>
                  <span>SECTION 02</span>
                  <h2>矿脉与矿石市场</h2>
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
                      <th>矿脉</th>
                      <th>解锁</th>
                      <th>经费</th>
                      <th>补给</th>
                      <th>加固</th>
                      <th>周期</th>
                      <th>库存 / 售价</th>
                      <th>数量</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {depositIds.map((depositId) => {
                      const deposit = game.deposits[depositId];
                      if (!deposit) return null;
                      const quantity = quantities[depositId] ?? 1;
                      const unlocked = unlockedDeposits.includes(depositId);
                      return (
                        <tr key={depositId} className={unlocked ? '' : 'farm-row--locked'}>
                          <td>
                            <strong>{deposit.name}</strong>
                            <small>基础产量 {deposit.yield}</small>
                          </td>
                          <td>
                            农 {deposit.requiredFarmLevel} /
                            牧 {deposit.requiredRanchLevel} /
                            矿 {deposit.requiredMineLevel}
                          </td>
                          <td>{deposit.expeditionCost}</td>
                          <td>
                            {mineProductName(deposit.rationProductId)}×{deposit.rationAmount}
                          </td>
                          <td>
                            {mineProductName(deposit.supportProductId)}×{deposit.supportAmount}
                          </td>
                          <td>{durationLabel(deposit.durationSeconds)}</td>
                          <td>{inventoryCount(game.economy.ores, depositId)} / {deposit.orePrice}</td>
                          <td>
                            <InputNumber
                              aria-label={`${deposit.name}出售数量`}
                              min={1}
                              max={99}
                              size="small"
                              value={quantity}
                              onChange={(value) => setQuantities((current) => ({
                                ...current,
                                [depositId]: value ?? 1,
                              }))}
                            />
                          </td>
                          <td>
                            <Button
                              size="small"
                              disabled={
                                inventoryCount(game.economy.ores, depositId) < quantity
                              }
                              title={
                                inventoryCount(game.economy.ores, depositId) <
                                    quantity
                                    ? `库存不足，当前有 ${inventoryCount(game.economy.ores, depositId)}`
                                    : undefined
                              }
                              onClick={() => void runAction({
                                type: 'mine_sell',
                                depositId,
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

            <section className="farm-panel">
              <header className="farm-panel__header">
                <div>
                  <span>SECTION 03</span>
                  <h2>牧场补给台账</h2>
                </div>
              </header>
              <div className="mine-supply-grid">
                {supplyProductIds.map((productId) => (
                  <article key={productId}>
                    <span>{mineProductName(productId)}</span>
                    <strong>
                      {inventoryCount(game.economy.ranchProducts, productId)}
                    </strong>
                    <small>
                      {depositIds.some(
                        (depositId) =>
                          game.deposits[depositId]?.supportProductId ===
                          productId,
                      )
                        ? '矿道加固材料'
                        : '采掘队口粮'}
                    </small>
                  </article>
                ))}
              </div>
            </section>

            <section className="farm-panel">
              <header className="farm-panel__header">
                <div>
                  <span>SECTION 04</span>
                  <h2>永久建设</h2>
                </div>
              </header>
              <div className="farm-upgrades mine-upgrades">
                <article>
                  <span>矿井扩建</span>
                  <strong>
                    {game.nextExpansion
                      ? `第 ${game.nextExpansion.shaftIndex + 1} 条`
                      : '全部完成'}
                  </strong>
                  <small>
                    {game.nextExpansion
                      ? `农 ${game.nextExpansion.requiredFarmLevel} / 牧 ${game.nextExpansion.requiredRanchLevel} / 矿 ${game.nextExpansion.requiredMineLevel} · ${game.nextExpansion.coinCost} 金币`
                      : '全部矿井已永久开放'}
                  </small>
                  <Button
                    size="small"
                    disabled={!canExpand}
                    onClick={() => void runAction({ type: 'mine_expand_shaft' })}
                  >
                    永久扩建
                  </Button>
                </article>
                <article>
                  <span>采掘工具</span>
                  <strong>
                    {game.nextPickaxeUpgrade
                      ? `升级至 ${game.nextPickaxeUpgrade.level} 级`
                      : '最高等级'}
                  </strong>
                  <small>
                    {game.nextPickaxeUpgrade
                      ? `农 ${game.nextPickaxeUpgrade.requiredFarmLevel} / 牧 ${game.nextPickaxeUpgrade.requiredRanchLevel} / 矿 ${game.nextPickaxeUpgrade.requiredMineLevel} · ${game.nextPickaxeUpgrade.coinCost} 金币`
                      : `当前产量加成 +${game.pickaxeYieldBonus}`}
                  </small>
                  <Button
                    size="small"
                    disabled={!canUpgrade}
                    onClick={() => void runAction({ type: 'mine_upgrade_pickaxe' })}
                  >
                    升级工具
                  </Button>
                </article>
                <article>
                  <span>遗物收藏</span>
                  <strong>{game.economy.relics} 件</strong>
                  <small>
                    加固矿井完成采掘时有 8% 概率发现；遗物是永久收藏，
                    用于记录探索成就，不会消耗。
                  </small>
                </article>
              </div>
            </section>

            <section className="farm-panel farm-panel--field">
              <header className="farm-panel__header">
                <div>
                  <span>SECTION 05</span>
                  <h2>矿山经营记录</h2>
                </div>
                <small>LAST {game.logs.length}</small>
              </header>
              <ul className="farm-log">
                {game.logs.slice().reverse().map((entry) => (
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
