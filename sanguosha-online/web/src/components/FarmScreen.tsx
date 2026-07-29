import { Button, InputNumber, Select, Spin, message } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { api, ApiError, errorMessage } from '../api';
import type {
  FarmClientAction,
  FarmCropId,
  FarmGameView,
  FarmSnapshot,
} from '../types';
import '../farm.css';

const CROP_IDS: FarmCropId[] = ['wheat', 'tomato', 'pumpkin'];
const CROPS: Record<FarmCropId, {
  code: string;
  name: string;
  seedCost: number;
  growthDays: number;
  yield: number;
}> = {
  wheat: { code: 'CR-01', name: '小麦', seedCost: 6, growthDays: 2, yield: 2 },
  tomato: { code: 'CR-02', name: '番茄', seedCost: 11, growthDays: 3, yield: 2 },
  pumpkin: { code: 'CR-03', name: '南瓜', seedCost: 18, growthDays: 4, yield: 3 },
};

const TREND_LABELS: Record<-1 | 0 | 1, string> = {
  [-1]: '↓ 下行',
  [0]: '— 持平',
  [1]: '↑ 上行',
};

function projectedWorth(game: FarmGameView): number {
  const player = game.players[0]!;
  const seeds = CROP_IDS.reduce(
    (sum, cropId) => sum + player.seeds[cropId] * CROPS[cropId].seedCost,
    0,
  );
  const produce = CROP_IDS.reduce(
    (sum, cropId) => sum + player.produce[cropId] * game.market[cropId].price,
    0,
  );
  const field = player.plots.reduce((sum, plot) => {
    if (!plot.cropId) return sum;
    const crop = CROPS[plot.cropId];
    return sum + Math.floor(
      game.market[plot.cropId].price * Math.min(plot.growth / crop.growthDays, 1),
    );
  }, 0);
  return player.coins + seeds + produce + field;
}

export function FarmScreen() {
  const [toast, toastContext] = message.useMessage();
  const [snapshot, setSnapshot] = useState<FarmSnapshot>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selectedCrop, setSelectedCrop] = useState<FarmCropId>('wheat');
  const [quantities, setQuantities] = useState<Record<FarmCropId, number>>({
    wheat: 1,
    tomato: 1,
    pumpkin: 1,
  });

  const load = async () => {
    setLoading(true);
    try {
      setSnapshot(await api.getFarm());
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const runAction = async (action: FarmClientAction) => {
    if (!snapshot || busy) return;
    setBusy(true);
    try {
      const next = await api.applyFarmAction(snapshot.farm.revision, action);
      setSnapshot(next);
      if (action.type === 'farm_end_turn') {
        if (next.farm.status === 'finished') {
          toast.success('本期经营已完成结算');
        } else {
          toast.success(
            next.farm.marketEvent.source === 'llm'
              ? '新的一日已开始，市场导演已发布行情'
              : '新的一日已开始，已采用规则基准行情',
          );
        }
      }
    } catch (error) {
      if (error instanceof ApiError && error.code === 'FARM_REVISION_CONFLICT') {
        await load();
      }
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    try {
      setSnapshot(await api.resetFarm());
      toast.success('新的经营周期已建立');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const worth = useMemo(
    () => snapshot ? projectedWorth(snapshot.farm) : 0,
    [snapshot],
  );

  if (loading && !snapshot) {
    return (
      <main className="farm-page farm-page--loading">
        {toastContext}
        <Spin />
        <span>正在读取持久化经营档案…</span>
      </main>
    );
  }

  if (!snapshot) {
    return (
      <main className="farm-page farm-page--loading">
        {toastContext}
        <p>未能读取农场档案。</p>
        <Button onClick={() => void load()}>重新读取</Button>
      </main>
    );
  }

  const game = snapshot.farm;
  const player = game.players[0]!;
  const canSpendAction = game.status === 'playing' && player.actionsRemaining > 0 && !busy;
  const finalWorth = game.winner?.rankings[0]?.netWorth;

  return (
    <main className="farm-page">
      {toastContext}
      <header className="farm-hero">
        <div>
          <p className="farm-kicker">PERSISTENT MODULE / FARM-01</p>
          <h1>农场经营控制台</h1>
          <p className="farm-subtitle">
            单人常驻经营档案 · 自动保存 · 每日三项操作
          </p>
        </div>
        <div className="farm-day-block" aria-label="经营日">
          <span>OPERATING DAY</span>
          <strong>{String(game.day).padStart(2, '0')}</strong>
          <small>/ {String(game.finalDay).padStart(2, '0')}</small>
        </div>
      </header>

      <section className="farm-status-strip" aria-label="存档状态">
        <span><i className="farm-status-dot" /> 存档：服务器持久化</span>
        <span>行情：{snapshot.marketDirectorAvailable ? '大模型导演 / 规则回退' : '规则引擎'}</span>
        <span>版本：FARM-SAVE-V1</span>
        <span>修订：{String(game.revision).padStart(4, '0')}</span>
      </section>

      <section className="farm-metrics" aria-label="经营指标">
        <article>
          <span>可用资金</span>
          <strong>¥ {player.coins}</strong>
          <small>CASH AVAILABLE</small>
        </article>
        <article>
          <span>累计营收</span>
          <strong>¥ {player.totalRevenue}</strong>
          <small>GROSS REVENUE</small>
        </article>
        <article>
          <span>剩余行动</span>
          <strong>{player.actionsRemaining} / 3</strong>
          <small>ACTION POINTS</small>
        </article>
        <article>
          <span>估算总资产</span>
          <strong>¥ {worth}</strong>
          <small>EST. NET WORTH</small>
        </article>
      </section>

      <section className={`farm-market-event farm-market-event--${game.marketEvent.tone}`}>
        <div>
          <span>MARKET BULLETIN · {game.marketEvent.source === 'llm' ? 'LLM' : 'RULES'}</span>
          <h2>{game.marketEvent.title}</h2>
        </div>
        <p>{game.marketEvent.summary}</p>
      </section>

      {game.status === 'finished' && (
        <section className="farm-settlement">
          <span>OPERATING CYCLE CLOSED</span>
          <h2>本期经营已结算</h2>
          <p>最终估值 ¥ {finalWorth ?? worth}。当前档案会一直保留，开始新周期后才会建立新的经营状态。</p>
          <Button type="primary" loading={busy} onClick={() => void reset()}>
            开始新经营周期
          </Button>
        </section>
      )}

      <div className="farm-document-grid">
        <section className="farm-panel farm-panel--market">
          <header className="farm-panel__header">
            <div>
              <span>SECTION 01</span>
              <h2>现货与种子市场</h2>
            </div>
            <small>UNIT / ¥</small>
          </header>
          <div className="farm-table-wrap">
            <table className="farm-table">
              <thead>
                <tr>
                  <th>作物</th>
                  <th>现价</th>
                  <th>趋势</th>
                  <th>库存</th>
                  <th>数量</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {CROP_IDS.map((cropId) => {
                  const crop = CROPS[cropId];
                  const quote = game.market[cropId];
                  const quantity = quantities[cropId];
                  return (
                    <tr key={cropId}>
                      <td>
                        <strong>{crop.name}</strong>
                        <small>{crop.code} · 种价 ¥{crop.seedCost}</small>
                      </td>
                      <td>
                        <strong>¥ {quote.price}</strong>
                        <small>前值 {quote.previousPrice}</small>
                      </td>
                      <td>{TREND_LABELS[quote.trend]}</td>
                      <td>
                        种 {player.seeds[cropId]}
                        <small>货 {player.produce[cropId]}</small>
                      </td>
                      <td>
                        <InputNumber
                          aria-label={`${crop.name}交易数量`}
                          min={1}
                          max={20}
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
                            disabled={!canSpendAction || player.coins < crop.seedCost * quantity}
                            onClick={() => void runAction({
                              type: 'farm_buy_seed',
                              cropId,
                              quantity,
                            })}
                          >
                            买种
                          </Button>
                          <Button
                            size="small"
                            type="primary"
                            disabled={!canSpendAction || player.produce[cropId] < quantity}
                            onClick={() => void runAction({
                              type: 'farm_sell',
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
          </div>
        </section>

        <section className="farm-panel farm-panel--field">
          <header className="farm-panel__header">
            <div>
              <span>SECTION 02</span>
              <h2>田块作业表</h2>
            </div>
            <Select
              aria-label="播种作物"
              size="small"
              value={selectedCrop}
              options={CROP_IDS.map((cropId) => ({
                value: cropId,
                label: `播种：${CROPS[cropId].name}`,
              }))}
              onChange={setSelectedCrop}
            />
          </header>
          <div className="farm-plots">
            {player.plots.map((plot, index) => {
              const crop = plot.cropId ? CROPS[plot.cropId] : null;
              const ready = crop ? plot.growth >= crop.growthDays : false;
              const progress = crop
                ? Math.round((plot.growth / crop.growthDays) * 100)
                : 0;
              return (
                <article className={`farm-plot${ready ? ' farm-plot--ready' : ''}`} key={index}>
                  <header>
                    <span>PLOT-{String(index + 1).padStart(2, '0')}</span>
                    <i>{plot.watered ? 'WATERED' : crop ? 'DRY' : 'IDLE'}</i>
                  </header>
                  <div className="farm-plot__body">
                    <strong>{crop?.name ?? '空置田块'}</strong>
                    <small>
                      {crop
                        ? `生长 ${plot.growth}/${crop.growthDays} · 产出 ${crop.yield}`
                        : '等待播种指令'}
                    </small>
                    <div className="farm-progress" aria-label={`生长进度 ${progress}%`}>
                      <span style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                  {ready ? (
                    <Button
                      block
                      size="small"
                      type="primary"
                      disabled={!canSpendAction}
                      onClick={() => void runAction({
                        type: 'farm_harvest',
                        plotIndex: index,
                      })}
                    >
                      收获
                    </Button>
                  ) : (
                    <Button
                      block
                      size="small"
                      disabled={!canSpendAction || Boolean(crop) || player.seeds[selectedCrop] < 1}
                      onClick={() => void runAction({
                        type: 'farm_plant',
                        cropId: selectedCrop,
                        plotIndex: index,
                      })}
                    >
                      {crop ? '生长中' : `播种${CROPS[selectedCrop].name}`}
                    </Button>
                  )}
                </article>
              );
            })}
          </div>
          <footer className="farm-field-controls">
            <Button
              disabled={!canSpendAction || !player.plots.some((plot) => {
                if (!plot.cropId || plot.watered) return false;
                return plot.growth < CROPS[plot.cropId].growthDays;
              })}
              onClick={() => void runAction({ type: 'farm_water' })}
            >
              全田灌溉 / 1 行动
            </Button>
            <Button
              type="primary"
              loading={busy}
              disabled={game.status !== 'playing'}
              onClick={() => void runAction({ type: 'farm_end_turn' })}
            >
              结束本日并更新市场
            </Button>
          </footer>
        </section>

        <section className="farm-panel farm-panel--ledger">
          <header className="farm-panel__header">
            <div>
              <span>SECTION 03</span>
              <h2>库存台账</h2>
            </div>
          </header>
          <dl className="farm-ledger">
            {CROP_IDS.map((cropId) => (
              <div key={cropId}>
                <dt>{CROPS[cropId].name}</dt>
                <dd><span>种子</span><strong>{player.seeds[cropId]}</strong></dd>
                <dd><span>农产</span><strong>{player.produce[cropId]}</strong></dd>
                <dd><span>市值</span><strong>¥ {player.produce[cropId] * game.market[cropId].price}</strong></dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="farm-panel farm-panel--log">
          <header className="farm-panel__header">
            <div>
              <span>SECTION 04</span>
              <h2>操作日志</h2>
            </div>
            <small>LAST {Math.min(game.logs.length, 12)}</small>
          </header>
          <ol className="farm-log">
            {game.logs.slice(-12).reverse().map((entry) => (
              <li key={`${entry.id}-${entry.day}`}>
                <span>D{String(entry.day).padStart(2, '0')} / {String(entry.id).padStart(3, '0')}</span>
                <p>{entry.text}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}
