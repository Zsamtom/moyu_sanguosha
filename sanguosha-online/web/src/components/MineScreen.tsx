import {
  Button,
  InputNumber,
  Progress,
  Spin,
  Tag,
  message,
} from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, errorMessage } from '../api';
import type {
  MineClientAction,
  MineDepositDefinition,
  MineDepositId,
  MineGameView,
  MineShaft,
  MineSnapshot,
  RanchProductId,
} from '../types';
import '../farm.css';
import '../mine.css';

const DEPOSIT_IDS: MineDepositId[] = [
  'coal',
  'iron',
  'copper',
  'silver',
  'gold',
  'crystal',
];

const PRODUCT_NAMES: Record<RanchProductId, string> = {
  egg: '鸡蛋',
  duck_egg: '鸭蛋',
  rabbit_fur: '兔绒',
  wool: '羊毛',
  milk: '牛奶',
  goat_milk: '羊奶',
};

const DEPOSIT_MARKS: Record<MineDepositId, string> = {
  coal: 'C',
  iron: 'Fe',
  copper: 'Cu',
  silver: 'Ag',
  gold: 'Au',
  crystal: '◇',
};

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
      deposit.yield + pickaxeYieldBonus - (hasHazard ? 1 : 0),
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
  const [busy, setBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState<MineClientAction>();
  const [now, setNow] = useState(Date.now());
  const clockOffset = useRef(0);
  const actionInFlight = useRef(false);
  const [selectedDeposit, setSelectedDeposit] = useState<MineDepositId>('coal');
  const [marketOpen, setMarketOpen] = useState(false);
  const [quantities, setQuantities] = useState<Record<MineDepositId, number>>(
    Object.fromEntries(DEPOSIT_IDS.map((depositId) => [depositId, 1])) as Record<MineDepositId, number>,
  );

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const next = await api.getMine();
      setSnapshot(next);
      clockOffset.current = next.mine.serverTime - Date.now();
      setNow(next.mine.serverTime);
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

  const runAction = async (action: MineClientAction) => {
    if (!snapshot || actionInFlight.current) return;
    actionInFlight.current = true;
    setBusy(true);
    setPendingAction(action);
    try {
      const game = snapshot.mine;
      const next = await api.applyMineAction(
        game.farmRevision,
        game.ranchRevision,
        game.revision,
        action,
      );
      setSnapshot(next);
      clockOffset.current = next.mine.serverTime - Date.now();
      setNow(next.mine.serverTime);
      if (action.type === 'mine_start') {
        toast.success(
          `已在 ${action.shaftIndex + 1} 号矿井开采${next.mine.deposits[action.depositId].name}`,
        );
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
        await load();
      }
      toast.error(errorMessage(error));
    } finally {
      actionInFlight.current = false;
      setBusy(false);
      setPendingAction(undefined);
    }
  };

  const game = snapshot?.mine;
  const unlockedDeposits = useMemo(
    () => game
      ? DEPOSIT_IDS.filter((depositId) => {
          const deposit = game.deposits[depositId];
          return game.farmLevel >= deposit.requiredFarmLevel &&
            game.ranchLevel >= deposit.requiredRanchLevel &&
            game.level >= deposit.requiredMineLevel;
        })
      : [],
    [game],
  );

  useEffect(() => {
    if (game && !unlockedDeposits.includes(selectedDeposit)) {
      setSelectedDeposit(unlockedDeposits[0] ?? 'coal');
    }
  }, [game?.farmLevel, game?.ranchLevel, game?.level]);

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

  const selectedDefinition = game.deposits[selectedDeposit];
  const canStartSelected =
    unlockedDeposits.includes(selectedDeposit) &&
    game.economy.coins >= selectedDefinition.expeditionCost &&
    game.economy.ranchProducts[selectedDefinition.rationProductId] >=
      selectedDefinition.rationAmount;
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

  return (
    <main className="farm-page mine-page">
      {toastContext}
      <section className="farm-status-strip" aria-label="矿山状态">
        <span><i className="farm-status-dot" /> 存档：服务器实时持久化</span>
        <span>矿主：{game.ownerName}</span>
        <span>矿山：LV {game.level} / {game.unlockedShafts} 条矿井</span>
        <span>农场：LV {game.farmLevel}</span>
        <span>牧场：LV {game.ranchLevel}</span>
        <span>
          修订：F{String(game.farmRevision).padStart(5, '0')} /
          R{String(game.ranchRevision).padStart(5, '0')} /
          M{String(game.revision).padStart(5, '0')}
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
          <small>REINFORCED DISCOVERY</small>
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
                  return (
                    <Button
                      key={depositId}
                      aria-pressed={selectedDeposit === depositId}
                      size="small"
                      type={selectedDeposit === depositId ? 'primary' : 'default'}
                      onClick={() => {
                        setSelectedDeposit(depositId);
                        toast.info(`已选择${deposit.name}，请点击空闲矿井开采`);
                      }}
                    >
                      {selectedDeposit === depositId && <span aria-hidden="true">✓</span>}
                      {deposit.name}
                      <small>◎{deposit.expeditionCost}</small>
                    </Button>
                  );
                })}
                <span className="farm-tool-strip__hint">
                  {pendingAction
                    ? '正在保存本次矿山操作…'
                    : `点击空闲矿井开采${selectedDefinition.name}；需${
                      PRODUCT_NAMES[selectedDefinition.rationProductId]
                    }×${selectedDefinition.rationAmount}`}
                </span>
              </div>
              <div className="farm-plots mine-shafts">
                {game.shafts.map((shaft) => {
                  const deposit = shaft.depositId
                    ? game.deposits[shaft.depositId]
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
                  const canStartHere = !deposit && !busy && canStartSelected;
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
                          depositId: selectedDeposit,
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
                            {DEPOSIT_MARKS[deposit.id]}
                          </span>
                        )}
                        <strong>{deposit?.name ?? '空闲矿井'}</strong>
                        <small>
                          {deposit
                            ? `${remainingLabel(runtime.remainingMs)} · 预计 ${runtime.estimatedYield} 份`
                            : `点击下方按钮开采${selectedDefinition.name}`}
                        </small>
                        <div className="farm-plot__tags">
                          {runtime.hasHazard && <Tag color="orange">需加固</Tag>}
                          {shaft.reinforced && <Tag color="green">已加固</Tag>}
                          {deposit && (
                            <Tag>
                              口粮 {PRODUCT_NAMES[deposit.rationProductId]}×{deposit.rationAmount}
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
                              depositId: selectedDeposit,
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
                              busy ||
                              game.economy.ranchProducts[deposit.supportProductId] <
                                deposit.supportAmount
                            }
                            onClick={() => void runAction({
                              type: 'mine_reinforce',
                              shaftIndex: shaft.index,
                            })}
                          >
                            用{PRODUCT_NAMES[deposit.supportProductId]}×{deposit.supportAmount}加固
                          </Button>
                        )}
                        {deposit && runtime.ready && (
                          <Button
                            type="primary"
                            size="small"
                            disabled={busy}
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
                    {DEPOSIT_IDS.map((depositId) => {
                      const deposit = game.deposits[depositId];
                      const quantity = quantities[depositId];
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
                            {PRODUCT_NAMES[deposit.rationProductId]}×{deposit.rationAmount}
                          </td>
                          <td>
                            {PRODUCT_NAMES[deposit.supportProductId]}×{deposit.supportAmount}
                          </td>
                          <td>{durationLabel(deposit.durationSeconds)}</td>
                          <td>{game.economy.ores[depositId]} / {deposit.orePrice}</td>
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
                              disabled={busy || game.economy.ores[depositId] < quantity}
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
                {([
                  'egg',
                  'duck_egg',
                  'milk',
                  'goat_milk',
                  'rabbit_fur',
                  'wool',
                ] as RanchProductId[]).map((productId) => (
                  <article key={productId}>
                    <span>{PRODUCT_NAMES[productId]}</span>
                    <strong>{game.economy.ranchProducts[productId]}</strong>
                    <small>
                      {productId === 'rabbit_fur' || productId === 'wool'
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
                    disabled={busy || !canExpand}
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
                    disabled={busy || !canUpgrade}
                    onClick={() => void runAction({ type: 'mine_upgrade_pickaxe' })}
                  >
                    升级工具
                  </Button>
                </article>
                <article>
                  <span>遗物收藏</span>
                  <strong>{game.economy.relics} 件</strong>
                  <small>加固后的矿井有概率发现遗物</small>
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
