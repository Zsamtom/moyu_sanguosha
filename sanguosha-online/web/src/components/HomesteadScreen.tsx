import {
  Alert,
  Button,
  Checkbox,
  Progress,
  Spin,
  Tag,
  message,
} from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { api, ApiError, errorMessage } from '../api';
import type {
  HomesteadClientAction,
  HomesteadFacilityView,
  HomesteadResourceView,
  HomesteadSnapshot,
  HomesteadTownEstateView,
  HomesteadTownResourceId,
} from '../types';
import '../farm.css';
import '../homestead.css';

const ITEM_NAMES: Record<string, string> = {
  wheat: '小麦',
  carrot: '胡萝卜',
  tomato: '番茄',
  corn: '玉米',
  pumpkin: '南瓜',
  strawberry: '草莓',
  sunflower: '向日葵',
  watermelon: '西瓜',
  grape: '葡萄',
  blueberry: '蓝莓',
  cotton: '棉花',
  dragonfruit: '火龙果',
  egg: '鸡蛋',
  duck_egg: '鸭蛋',
  rabbit_fur: '兔绒',
  wool: '羊毛',
  milk: '牛奶',
  goat_milk: '羊奶',
  coal: '煤矿',
  iron: '铁矿',
  copper: '铜矿',
  silver: '银矿',
  gold: '金矿',
  crystal: '晶簇',
  flour: '面粉',
  coarse_feed: '粗饲料',
  fortified_feed: '强化饲料',
  soil_conditioner: '土壤改良剂',
  work_clothes: '工作服',
  iron_ingot: '铁锭',
  mining_kit: '矿工防护套装',
  festival_crate: '庆典食品箱',
  greenhouse_parts: '温室构件',
};

const TOWN_ITEM_NAMES: Record<HomesteadTownResourceId, string> = {
  snow_potato: '雪薯',
  yak_milk: '牦牛奶',
  frost_crystal: '霜晶',
};

const TOWN_ITEM_PRICES: Record<HomesteadTownResourceId, number> = {
  snow_potato: 8,
  yak_milk: 26,
  frost_crystal: 50,
};

const SOURCE_LABELS: Record<HomesteadResourceView['source'], string> = {
  farm: '农',
  ranch: '牧',
  mine: '矿',
  goods: '加工',
};

const TRAIT_NAMES: Record<string, string> = {
  steady: '性情稳定',
  productive: '高产',
  resilient: '强健',
  fertile: '繁育力',
  rare_coat: '稀有毛色',
};

const TOPIC_NAMES: Record<string, string> = {
  soil: '土壤诊断',
  rotation: '轮作规划',
  nutrition: '饲料营养',
  traits: '动物特质',
  layers: '矿层判断',
  safety: '矿井防护',
};

const COLLECTION_CATEGORY_NAMES: Record<string, string> = {
  facility: '设施',
  recipe: '配方',
  farm: '农场',
  ranch: '牧场',
  mine: '矿山',
  research: '研究',
  npc: '伙伴',
  season: '赛季',
};

export function formatHomesteadDuration(milliseconds: number): string {
  if (milliseconds <= 0) return '可收取';
  const minutes = Math.ceil(milliseconds / 60_000);
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} 小时 ${rest} 分` : `${hours} 小时`;
}

function ResourceTags({
  resources,
}: {
  resources: readonly HomesteadResourceView[];
}) {
  return (
    <div className="homestead-resources">
      {resources.map((resource) => (
        <Tag
          key={`${resource.source}:${resource.itemId}`}
          color={resource.sufficient ? 'green' : 'red'}
        >
          {SOURCE_LABELS[resource.source]} · {ITEM_NAMES[resource.itemId] ?? resource.itemId}
          {' '}{resource.available}/{resource.quantity}
        </Tag>
      ))}
    </div>
  );
}

function FacilityStatus({
  facility,
  now,
}: {
  facility: HomesteadFacilityView;
  now: number;
}) {
  if (!facility.built) {
    return (
      <span>
        需要声望 {facility.definition.requiredReputation} · {facility.definition.coinCost} 金币
      </span>
    );
  }
  if (!facility.job) return <span>队列空闲</span>;
  const ready = facility.job.completesAt <= now;
  const progress = Math.max(
    0,
    Math.min(
      1,
      (now - facility.job.startedAt) /
        Math.max(1, facility.job.completesAt - facility.job.startedAt),
    ),
  );
  return (
    <>
      <Progress
        percent={Math.round(progress * 100)}
        size="small"
        status={ready ? 'success' : 'active'}
      />
      <span>
        {ready
          ? '生产完成'
          : `剩余 ${formatHomesteadDuration(facility.job.completesAt - now)}`}
      </span>
    </>
  );
}

function FrostpeakDashboard({
  town,
  now,
  busyKey,
  advice,
  act,
}: {
  town: HomesteadTownEstateView;
  now: number;
  busyKey?: string;
  advice: HomesteadSnapshot['homestead']['advice'];
  act: (
    action: HomesteadClientAction,
    key: string,
    success: string,
  ) => Promise<void>;
}) {
  return (
    <>
      <section className="homestead-section homestead-advice homestead-panel-item homestead-panel-item--today">
        <div className="homestead-section__heading">
          <div>
            <p className="farm-kicker">LOCAL DIRECTOR</p>
            <h2>{advice.headline}</h2>
          </div>
          <Tag color={advice.source === 'llm' ? 'purple' : 'blue'}>
            {advice.source === 'llm' ? 'LLM 城镇建议' : '规则城镇建议'}
          </Tag>
        </div>
        <p>{advice.narrative}</p>
        <blockquote>{advice.recommendation}</blockquote>
      </section>

      <section className="homestead-section homestead-weather-section homestead-panel-item homestead-panel-item--today">
        <div className="homestead-section__heading">
          <div>
            <p className="farm-kicker">LOCAL ECONOMY</p>
            <h2>霜岭产业库存</h2>
          </div>
          <span>金币全城镇通用；物资与当地声望留在霜岭镇</span>
        </div>
        <div className="homestead-town-inventory">
          {(Object.keys(TOWN_ITEM_NAMES) as HomesteadTownResourceId[]).map(
            (resourceId) => (
              <article key={resourceId}>
                <span>{TOWN_ITEM_NAMES[resourceId]}</span>
                <strong>{town.inventory[resourceId]}</strong>
                <small>商路单价 {TOWN_ITEM_PRICES[resourceId]} 金币</small>
                <Button
                  disabled={town.inventory[resourceId] < 1}
                  loading={busyKey === `town:sell:${resourceId}`}
                  onClick={() => void act(
                    {
                      type: 'homestead_sell_town_resource',
                      resourceId,
                      quantity: 1,
                    },
                    `town:sell:${resourceId}`,
                    `已售出 1 份${TOWN_ITEM_NAMES[resourceId]}`,
                  )}
                >
                  售出 1 份
                </Button>
              </article>
            ),
          )}
        </div>
      </section>

      <section className="homestead-section">
        <div className="homestead-section__heading">
          <div>
            <p className="farm-kicker">THREE-SECTOR LOOP</p>
            <h2>高寒三业生产链</h2>
          </div>
          <span>雪薯 → 牦牛奶 → 霜晶；冻土农场无需投入，可防止经济死锁</span>
        </div>
        <div className="homestead-town-sector-grid">
          {town.sectors.map((sector) => {
            const ready = Boolean(
              sector.job && sector.job.completesAt <= now,
            );
            const progress = !sector.job
              ? 0
              : Math.max(
                  0,
                  Math.min(
                    1,
                    (now - sector.job.startedAt) /
                      Math.max(
                        1,
                        sector.job.completesAt - sector.job.startedAt,
                      ),
                  ),
                );
            const input = sector.definition.input;
            const output = sector.definition.output;
            return (
              <article key={sector.definition.id}>
                <div className="homestead-card-title">
                  <h3>{sector.definition.name}</h3>
                  <Tag color="blue">LV {sector.level}/3</Tag>
                </div>
                <p>
                  {input
                    ? `消耗 ${TOWN_ITEM_NAMES[input.itemId]} ×${input.quantity}`
                    : '无需原料投入'}
                  {' · '}
                  产出 {TOWN_ITEM_NAMES[output.itemId]} ×{sector.outputQuantity}
                </p>
                {sector.job ? (
                  <>
                    <Progress
                      percent={Math.round(progress * 100)}
                      size="small"
                      status={ready ? 'success' : 'active'}
                    />
                    <small>
                      {ready
                        ? '生产完成，可立即收取'
                        : `剩余 ${formatHomesteadDuration(
                            sector.job.completesAt - now,
                          )}`}
                    </small>
                  </>
                ) : (
                  <small>
                    基础工期 {formatHomesteadDuration(
                      sector.definition.durationSeconds * 1_000,
                    )}；每次升级缩短 10%
                  </small>
                )}
                <div className="homestead-town-actions">
                  {ready ? (
                    <Button
                      type="primary"
                      loading={
                        busyKey === `town:collect:${sector.definition.id}`
                      }
                      onClick={() => void act(
                        {
                          type: 'homestead_collect_town_sector',
                          sectorId: sector.definition.id,
                        },
                        `town:collect:${sector.definition.id}`,
                        `${sector.definition.name}已收取`,
                      )}
                    >
                      收取产出
                    </Button>
                  ) : (
                    <Button
                      type="primary"
                      disabled={!sector.canStart}
                      loading={
                        busyKey === `town:start:${sector.definition.id}`
                      }
                      onClick={() => void act(
                        {
                          type: 'homestead_start_town_sector',
                          sectorId: sector.definition.id,
                        },
                        `town:start:${sector.definition.id}`,
                        `${sector.definition.actionName}已开始`,
                      )}
                    >
                      {sector.job ? '生产中' : sector.definition.actionName}
                    </Button>
                  )}
                  {sector.nextUpgrade && (
                    <Button
                      disabled={!sector.nextUpgrade.canUpgrade}
                      loading={
                        busyKey === `town:upgrade:${sector.definition.id}`
                      }
                      onClick={() => void act(
                        {
                          type: 'homestead_upgrade_town_sector',
                          sectorId: sector.definition.id,
                        },
                        `town:upgrade:${sector.definition.id}`,
                        `${sector.definition.name}已升级`,
                      )}
                    >
                      升至 LV {sector.nextUpgrade.level}
                    </Button>
                  )}
                </div>
                {sector.nextUpgrade && (
                  <small>
                    升级：{sector.nextUpgrade.coinCost} 金币 ·
                    当地声望 {sector.nextUpgrade.reputationRequired} ·
                    霜晶 {sector.nextUpgrade.crystalCost}
                  </small>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <div className="homestead-town-goal-grid">
        <section className="homestead-section">
          <p className="farm-kicker">LOCAL PROBLEM</p>
          {town.currentProblem ? (
            <>
              <h2>{town.currentProblem.title}</h2>
              <p>{town.currentProblem.description}</p>
              <div className="homestead-resources">
                {town.currentProblem.requirementsView.map((resource) => (
                  <Tag
                    key={resource.itemId}
                    color={resource.sufficient ? 'green' : 'red'}
                  >
                    {TOWN_ITEM_NAMES[resource.itemId]}{' '}
                    {resource.available}/{resource.quantity}
                  </Tag>
                ))}
              </div>
              <p className="homestead-reward">
                奖励 {town.currentProblem.coinReward} 金币 ·
                当地声望 +{town.currentProblem.reputationReward} ·
                研究点 +{town.currentProblem.researchReward}
              </p>
              <Button
                type="primary"
                disabled={!town.currentProblem.canResolve}
                loading={busyKey === `town:problem:${town.currentProblem.id}`}
                onClick={() => void act(
                  {
                    type: 'homestead_resolve_town_problem',
                    problemId: town.currentProblem!.id,
                  },
                  `town:problem:${town.currentProblem!.id}`,
                  '当地问题已经解决',
                )}
              >
                提交物资并解决
              </Button>
            </>
          ) : (
            <Alert
              type="success"
              showIcon
              message="霜岭镇当前问题已全部解决"
            />
          )}
        </section>

        <section className="homestead-section">
          <p className="farm-kicker">LANDMARK RESTORATION</p>
          <h2>山地热力站 · {town.landmarkStage}/3</h2>
          {town.nextLandmark ? (
            <>
              <h3>{town.nextLandmark.name}</h3>
              <p>
                前置：解决 {town.nextLandmark.requiredProblems} 个问题 ·
                当地声望 {town.nextLandmark.requiredReputation} ·
                金币 {town.nextLandmark.coinCost}
              </p>
              <div className="homestead-resources">
                {town.nextLandmark.requirementsView.map((resource) => (
                  <Tag
                    key={resource.itemId}
                    color={resource.sufficient ? 'green' : 'red'}
                  >
                    {TOWN_ITEM_NAMES[resource.itemId]}{' '}
                    {resource.available}/{resource.quantity}
                  </Tag>
                ))}
              </div>
              <p className="homestead-reward">
                完成后当地声望 +{town.nextLandmark.reputationReward} ·
                全局商会名望 +{town.nextLandmark.renownReward}
              </p>
              <Button
                type="primary"
                disabled={!town.nextLandmark.canRestore}
                loading={busyKey === 'town:landmark'}
                onClick={() => void act(
                  { type: 'homestead_restore_town_landmark' },
                  'town:landmark',
                  `${town.nextLandmark!.name}已完成`,
                )}
              >
                修复本阶段
              </Button>
            </>
          ) : (
            <Alert
              type="success"
              showIcon
              message="山地热力站已经完全恢复"
            />
          )}
        </section>
      </div>
    </>
  );
}

export function HomesteadScreen() {
  const [snapshot, setSnapshot] = useState<HomesteadSnapshot>();
  const [loading, setLoading] = useState(true);
  const [quietLoading, setQuietLoading] = useState(false);
  const [busyKey, setBusyKey] = useState<string>();
  const [failure, setFailure] = useState<string>();
  const [now, setNow] = useState(Date.now());
  const [useFertilizer, setUseFertilizer] = useState(false);
  const [legacyPanel, setLegacyPanel] = useState<
    'today' | 'operations' | 'growth'
  >('today');
  const [toast, toastContext] = message.useMessage();

  const load = async (quiet = false) => {
    if (quiet) setQuietLoading(true);
    else setLoading(true);
    try {
      const next = await api.getHomestead();
      setSnapshot(next);
      setFailure(undefined);
      setNow(next.homestead.serverTime);
    } catch (error) {
      setFailure(errorMessage(error));
    } finally {
      setLoading(false);
      setQuietLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const clock = window.setInterval(() => setNow((value) => value + 1_000), 1_000);
    const refresh = window.setInterval(() => void load(true), 30_000);
    return () => {
      window.clearInterval(clock);
      window.clearInterval(refresh);
    };
  }, []);

  const act = async (
    action: HomesteadClientAction,
    key: string,
    success: string,
  ) => {
    if (!snapshot || busyKey) return;
    setBusyKey(key);
    try {
      const next = await api.applyHomesteadAction(snapshot, action);
      setSnapshot(next);
      setNow(next.homestead.serverTime);
      setFailure(undefined);
      toast.success(success);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        await load(true);
        toast.warning('庄园状态已经变化，已为你刷新');
      } else {
        const text = errorMessage(error);
        setFailure(text);
        toast.error(text);
      }
    } finally {
      setBusyKey(undefined);
    }
  };

  const completedGoods = useMemo(
    () => snapshot
      ? Object.entries(snapshot.homestead.goods).filter(([, quantity]) => quantity > 0)
      : [],
    [snapshot],
  );

  const unlockedCollections = useMemo(
    () => snapshot?.homestead.collections.filter(({ unlocked }) => unlocked) ?? [],
    [snapshot],
  );

  if (loading && !snapshot) {
    return (
      <main className="farm-page farm-page--loading">
        <Spin size="large" />
        <span>正在汇总三业庄园数据…</span>
      </main>
    );
  }

  if (!snapshot) {
    return (
      <main className="farm-page">
        <Alert
          type="error"
          showIcon
          message="庄园总览加载失败"
          description={failure}
          action={<Button onClick={() => void load()}>重试</Button>}
        />
      </main>
    );
  }

  const { homestead } = snapshot;
  const unlockedResearch = new Set(
    homestead.research
      .filter(({ unlocked }) => unlocked)
      .map(({ definition }) => definition.id),
  );
  const researchNames = Object.fromEntries(
    homestead.research.map(({ definition }) => [
      definition.id,
      definition.name,
    ]),
  );
  const fertilizerAvailable =
    unlockedResearch.has('soil_science') &&
    homestead.goods.soil_conditioner > 0;
  const activeTown = homestead.towns.find(({ active }) => active)
    ?? homestead.towns[0];
  const townSwitcher = (
    <section className="homestead-town-switcher" aria-label="城镇选择">
      {homestead.towns.map((town) => (
        <button
          key={town.definition.id}
          type="button"
          className={town.active ? 'is-active' : undefined}
          disabled={Boolean(busyKey)}
          onClick={() => {
            if (!town.active) {
              void act(
                {
                  type: 'homestead_switch_town',
                  townId: town.definition.id,
                },
                `town:switch:${town.definition.id}`,
                `已前往${town.definition.name}`,
              );
            }
          }}
        >
          <span>{town.definition.climate}</span>
          <strong>{town.definition.name}</strong>
          <small>{town.definition.subtitle}</small>
          <em>
            当地声望 {town.reputation}
            {town.definition.id === 'frostpeak'
              ? ` · 地标 ${town.landmarkStage}/3`
              : ' · 完整产业'}
          </em>
        </button>
      ))}
      <div className="homestead-town-switcher__future">
        <span>后续更新预留</span>
        <strong>潮汐港 · 赤岩城</strong>
        <small>海产加工与沙地能源路线</small>
      </div>
    </section>
  );

  if (homestead.activeTownId === 'frostpeak' && activeTown) {
    return (
      <main className="farm-page homestead-page">
        {toastContext}
        <header className="farm-hero homestead-hero homestead-hero--compact">
          <div>
            <p className="farm-kicker">FROSTPEAK EXPEDITION</p>
            <h1>{activeTown.definition.name}</h1>
            <p>{activeTown.definition.description}</p>
          </div>
          <div className="homestead-metrics">
            <div><strong>{homestead.coins}</strong><span>全局金币</span></div>
            <div><strong>{homestead.reputation}</strong><span>当地声望</span></div>
            <div><strong>{homestead.merchantRenown}</strong><span>商会名望</span></div>
            <div><strong>{homestead.researchPoints}</strong><span>研究点</span></div>
            <Button loading={quietLoading} onClick={() => void load(true)}>
              刷新
            </Button>
          </div>
        </header>
        {failure && (
          <Alert
            className="homestead-alert"
            type="warning"
            showIcon
            closable
            message={failure}
            onClose={() => setFailure(undefined)}
          />
        )}
        {townSwitcher}
        <FrostpeakDashboard
          town={activeTown}
          now={now}
          busyKey={busyKey}
          advice={homestead.advice}
          act={act}
        />
      </main>
    );
  }

  return (
    <main className={`farm-page homestead-page homestead-panel-${legacyPanel}`}>
      {toastContext}
      <header className="farm-hero homestead-hero">
        <div>
          <p className="farm-kicker">THREE-SECTOR ESTATE</p>
          <h1>青禾镇庄园</h1>
          <p>
            经营农、牧、矿与加工网络，解决当地问题，并从这里开拓新的城镇庄园。
          </p>
        </div>
        <div className="homestead-metrics">
          <div><strong>{homestead.coins}</strong><span>金币</span></div>
          <div><strong>{homestead.reputation}</strong><span>当地声望</span></div>
          <div><strong>{homestead.merchantRenown}</strong><span>商会名望</span></div>
          <div><strong>{homestead.researchPoints}</strong><span>研究点</span></div>
          <Button loading={quietLoading} onClick={() => void load(true)}>刷新</Button>
        </div>
      </header>

      {failure && (
        <Alert
          className="homestead-alert"
          type="warning"
          showIcon
          closable
          message={failure}
          onClose={() => setFailure(undefined)}
        />
      )}

      {townSwitcher}

      <nav className="homestead-local-nav" aria-label="青禾镇经营分区">
        <Button
          type={legacyPanel === 'today' ? 'primary' : 'default'}
          onClick={() => setLegacyPanel('today')}
        >
          今日决策
        </Button>
        <Button
          type={legacyPanel === 'operations' ? 'primary' : 'default'}
          onClick={() => setLegacyPanel('operations')}
        >
          产业经营
        </Button>
        <Button
          type={legacyPanel === 'growth' ? 'primary' : 'default'}
          onClick={() => setLegacyPanel('growth')}
        >
          长期成长
        </Button>
      </nav>

      <section className="homestead-section homestead-advice homestead-panel-item homestead-panel-item--today">
        <div className="homestead-section__heading">
          <div>
            <p className="farm-kicker">ESTATE ADVISORY</p>
            <h2>{homestead.advice.headline}</h2>
          </div>
          <Tag color={homestead.advice.source === 'llm' ? 'purple' : 'blue'}>
            {homestead.advice.source === 'llm' ? 'LLM 动态建议' : '规则经营建议'}
          </Tag>
        </div>
        <p>{homestead.advice.narrative}</p>
        <blockquote>{homestead.advice.recommendation}</blockquote>
        <p className="homestead-npc-line">
          {homestead.npcs.find(({ npcId }) => npcId === homestead.advice.npcId)
            ?.definition.name ?? '庄园顾问'}：{homestead.advice.npcLine}
        </p>
      </section>

      <section className="homestead-section homestead-panel-item homestead-panel-item--today">
        <div className="homestead-section__heading">
          <div>
            <p className="farm-kicker">WEATHER & RESILIENCE</p>
            <h2>天气、灾害与庄园韧性</h2>
          </div>
          <Tag color={
            homestead.weather.definition.tone === 'warning'
              ? 'orange'
              : homestead.weather.definition.tone === 'good'
                ? 'green'
                : 'blue'
          }>
            今日 · {homestead.weather.definition.name}
          </Tag>
        </div>
        <p className="homestead-weather-summary">
          {homestead.weather.definition.description}
        </p>
        {homestead.weather.tomorrow ? (
          <Alert
            className="homestead-weather-alert"
            type="info"
            showIcon
            message={`气象站预报：明日 ${homestead.weather.tomorrow.name}`}
            description={homestead.weather.tomorrow.description}
          />
        ) : (
          <Alert
            className="homestead-weather-alert"
            type="info"
            showIcon
            message="建设一级气象站后可查看次日天气"
          />
        )}
        {homestead.disaster && (
          <Alert
            className="homestead-weather-alert"
            type={homestead.disaster.mitigated ? 'success' : 'warning'}
            showIcon
            message={
              homestead.disaster.mitigated
                ? '灾害已处置，环境正在恢复'
                : `灾害持续中 · ${homestead.disaster.severity} 级`
            }
            description={
              `${homestead.disaster.eventId === 'mountain_seepage' ? '矿山渗水' : '突发寒潮'} · ` +
              `剩余 ${homestead.disaster.remainingDays} 天 · ` +
              `已延误 ${homestead.disaster.unresolvedDays} 天`
            }
          />
        )}
        <div className="homestead-subsection-heading">
          <div>
            <span>01</span>
            <div>
              <strong>今日环境影响</strong>
              <small>以下数值会在生产开始时固化到本轮</small>
            </div>
          </div>
        </div>
        <div className="homestead-weather-rule-grid">
          {([
            ['farm', '农场'],
            ['ranch', '牧场'],
            ['mine', '矿山'],
          ] as const).map(([id, name]) => {
            const rule = homestead.productionRules[id];
            return (
              <article
                key={id}
                className={`homestead-weather-rule homestead-weather-rule--${id}`}
              >
                <div className="homestead-weather-rule__title">
                  <span>{id === 'farm' ? '农' : id === 'ranch' ? '牧' : '矿'}</span>
                  <h3>{name}</h3>
                </div>
                <div className="homestead-weather-rule__metrics">
                  <div>
                    <span>预计产量</span>
                    <strong className={rule.yieldPercent < 0 ? 'is-negative' : 'is-positive'}>
                      {rule.yieldPercent >= 0 ? '+' : ''}{rule.yieldPercent}%
                    </strong>
                  </div>
                  <div>
                    <span>生产工期</span>
                    <strong className={rule.durationPercent > 0 ? 'is-negative' : 'is-positive'}>
                      {rule.durationPercent >= 0 ? '+' : ''}{rule.durationPercent}%
                    </strong>
                  </div>
                </div>
                <small>{rule.label}</small>
              </article>
            );
          })}
        </div>
        {homestead.disaster && (
          <>
            <div className="homestead-section__heading">
              <div>
                <p className="farm-kicker">EMERGENCY PRODUCTION</p>
                <h3>灾期三业增产行动</h3>
              </div>
              <span>每次灾害、每个板块可启动一次</span>
            </div>
            <div className="homestead-depth-grid">
              {homestead.emergencyOperations.map((operation) => (
                <article key={operation.id}>
                  <div className="homestead-card-title">
                    <h3>{operation.name}</h3>
                    {operation.activated && <Tag color="green">本次灾害已启动</Tag>}
                  </div>
                  <p>{operation.description}</p>
                  <ResourceTags resources={operation.costsView} />
                  <small>
                    当前灾期产量 +{operation.yieldBonusPercent}% ·
                    工期 {operation.durationBonusPercent}%
                  </small>
                  <Button
                    type={operation.canActivate ? 'primary' : 'default'}
                    disabled={!operation.canActivate}
                    loading={busyKey === `emergency:${operation.id}`}
                    onClick={() => void act(
                      {
                        type: 'homestead_activate_emergency_boost',
                        sectorId: operation.id,
                      },
                      `emergency:${operation.id}`,
                      `${operation.name}已启动`,
                    )}
                  >
                    {operation.activated ? '已生效' : '启动增产'}
                  </Button>
                </article>
              ))}
            </div>
          </>
        )}
        <div className="homestead-subsection-heading homestead-subsection-heading--spaced">
          <div>
            <span>02</span>
            <div>
              <strong>长期抗灾设施</strong>
              <small>投入金币与研究资源，永久降低恶劣环境损失</small>
            </div>
          </div>
          <em>{homestead.resilience.filter(({ level }) => level > 0).length}/3 已建设</em>
        </div>
        <div className="homestead-resilience-grid">
          {homestead.resilience.map((entry) => (
            <article
              key={entry.definition.id}
              className={`homestead-resilience-card homestead-resilience-card--${entry.definition.id}`}
            >
              <div className="homestead-card-title">
                <h3>{entry.definition.name}</h3>
                <Tag color={entry.level ? 'cyan' : 'default'}>
                  LV {entry.level}/{entry.maximumLevel}
                </Tag>
              </div>
              <p>{entry.definition.description}</p>
              {entry.nextUpgrade ? (
                <>
                  <div className="homestead-upgrade-costs" aria-label="升级消耗">
                    <span><small>金币</small><strong>{entry.nextUpgrade.coinCost}</strong></span>
                    <span><small>研究</small><strong>{entry.nextUpgrade.researchCost}</strong></span>
                    <span><small>铁锭</small><strong>{entry.nextUpgrade.ironIngotCost}</strong></span>
                  </div>
                  <Button
                    block
                    type={entry.nextUpgrade.canUpgrade ? 'primary' : 'default'}
                    disabled={!entry.nextUpgrade.canUpgrade}
                    loading={busyKey === `resilience:${entry.definition.id}`}
                    onClick={() => void act(
                      {
                        type: 'homestead_upgrade_resilience',
                        resilienceId: entry.definition.id,
                      },
                      `resilience:${entry.definition.id}`,
                      `${entry.definition.name}已升级`,
                    )}
                  >
                    升到 LV {entry.nextUpgrade.level}
                  </Button>
                </>
              ) : <Tag color="green">已满级</Tag>}
            </article>
          ))}
        </div>
      </section>

      <section className="homestead-section homestead-event homestead-panel-item homestead-panel-item--today">
        <div className="homestead-section__heading">
          <div>
            <p className="farm-kicker">WORLD EVENT</p>
            <h2>{homestead.worldEvent.definition.title}</h2>
          </div>
          <Tag color={
            homestead.worldEvent.definition.tone === 'risk'
              ? 'orange'
              : homestead.worldEvent.definition.tone === 'opportunity'
                ? 'green'
                : 'default'
          }>
            {homestead.worldEvent.source === 'llm' ? '世界导演' : '规则事件'}
          </Tag>
        </div>
        <p>{homestead.worldEvent.narrative}</p>
        <div className="homestead-option-grid">
          {homestead.worldEvent.definition.options.map((option) => (
            <article key={option.id}>
              <h3>{option.label}</h3>
              <p>{option.description}</p>
              <ResourceTags resources={option.costsView} />
              <p className="homestead-reward">
                声望 +{option.reputationReward} · 研究 +{option.researchReward}
                {option.coinReward ? ` · 金币 +${option.coinReward}` : ''}
                {option.coinCost ? ` · 花费 ${option.coinCost} 金币` : ''}
              </p>
              <Button
                type="primary"
                disabled={!option.canChoose}
                loading={busyKey === `event:${option.id}`}
                onClick={() => void act(
                  { type: 'homestead_choose_event', optionId: option.id },
                  `event:${option.id}`,
                  '世界事件已经处理',
                )}
              >
                {homestead.worldEvent.selectedOptionId === option.id ? '已选择' : '选择方案'}
              </Button>
            </article>
          ))}
        </div>
      </section>

      <section className="homestead-section homestead-panel-item homestead-panel-item--growth">
        <div className="homestead-section__heading">
          <div>
            <p className="farm-kicker">NPC MEMORY</p>
            <h2>庄园顾问与结构化记忆</h2>
          </div>
          <span>每日每位顾问一次深入交流</span>
        </div>
        <div className="homestead-npc-grid">
          {homestead.npcs.map((npc) => (
            <article key={npc.npcId}>
              <div className="homestead-card-title">
                <h3>{npc.definition.name} · {npc.definition.role}</h3>
                <Tag color={npc.trust >= 2 ? 'purple' : 'default'}>
                  信任 {npc.trust}/5
                </Tag>
              </div>
              <Progress percent={npc.affinity} size="small" />
              <blockquote>{npc.lastDialogue}</blockquote>
              <div className="homestead-action-list homestead-action-list--inline">
                {npc.definition.topics.map((topicId) => (
                  <Button
                    key={topicId}
                    disabled={!npc.canTalkToday}
                    loading={busyKey === `npc:${npc.npcId}:${topicId}`}
                    onClick={() => void act(
                      {
                        type: 'homestead_talk_npc',
                        npcId: npc.npcId,
                        topicId,
                      },
                      `npc:${npc.npcId}:${topicId}`,
                      `已与${npc.definition.name}交流`,
                    )}
                  >
                    {TOPIC_NAMES[topicId] ?? topicId}
                  </Button>
                ))}
              </div>
              <details>
                <summary>已记住的经营事实（{npc.facts.length}）</summary>
                {npc.facts.length
                  ? npc.facts.map((fact) => (
                      <p key={fact.key}>
                        <strong>{TOPIC_NAMES[fact.key.split(':')[0]!] ?? fact.key}</strong>
                        {fact.value}
                      </p>
                    ))
                  : <p>尚无长期记忆</p>}
              </details>
            </article>
          ))}
        </div>
      </section>

      <section className="homestead-section homestead-panel-item homestead-panel-item--growth">
        <div className="homestead-section__heading">
          <div>
            <p className="farm-kicker">SOFT SEASON & COLLECTION</p>
            <h2>{homestead.season.id} 软赛季与庄园图鉴</h2>
          </div>
          <span>
            图鉴 {unlockedCollections.length}/{homestead.collections.length}
          </span>
        </div>
        <div className="homestead-season-layout">
          <article className="homestead-season-card">
            <div className="homestead-card-title">
              <h3>赛季进度 · {homestead.season.score} 分</h3>
              <span>
                至 {new Date(homestead.season.endsAt).toLocaleDateString('zh-CN')}
              </span>
            </div>
            <Progress percent={homestead.season.progressPercent} />
            <div className="homestead-season-counters">
              <span>加工 {homestead.season.counters.jobs}</span>
              <span>订单 {homestead.season.counters.orders}</span>
              <span>专精 {homestead.season.counters.specializations}</span>
              <span>社区 {homestead.season.counters.community}</span>
            </div>
            <div className="homestead-milestone-grid">
              {homestead.season.milestones.map((milestone) => (
                <div key={milestone.definition.id}>
                  <strong>{milestone.definition.name}</strong>
                  <small>
                    {milestone.definition.score} 分 ·
                    {milestone.definition.coinReward} 金币 ·
                    研究 +{milestone.definition.researchReward}
                    {milestone.definition.goodReward
                      ? ` · ${ITEM_NAMES[milestone.definition.goodReward.itemId]} ×${milestone.definition.goodReward.quantity}`
                      : ''}
                  </small>
                  <Button
                    type={milestone.canClaim ? 'primary' : 'default'}
                    disabled={!milestone.canClaim}
                    loading={busyKey === `season:${milestone.definition.id}`}
                    onClick={() => void act(
                      {
                        type: 'homestead_claim_season_reward',
                        milestoneId: milestone.definition.id,
                      },
                      `season:${milestone.definition.id}`,
                      `已领取“${milestone.definition.name}”`,
                    )}
                  >
                    {milestone.claimed
                      ? '已领取'
                      : milestone.lockedByResearch
                        ? '需完成赛季精通'
                        : '领取奖励'}
                  </Button>
                </div>
              ))}
            </div>
          </article>

          <details className="homestead-collection-card">
            <summary>
              展开完整庄园图鉴（已解锁 {unlockedCollections.length} 项）
            </summary>
            <div className="homestead-collection-grid">
              {homestead.collections.map((entry) => (
                <article key={entry.id} className={entry.unlocked ? 'is-unlocked' : ''}>
                  <Tag>{COLLECTION_CATEGORY_NAMES[entry.category] ?? entry.category}</Tag>
                  <strong>{entry.unlocked ? entry.name : '未发现条目'}</strong>
                  <small>{entry.description}</small>
                  <span>{entry.unlocked ? '已收录' : '待探索'}</span>
                </article>
              ))}
            </div>
          </details>
        </div>
      </section>

      <section className="homestead-section homestead-panel-item homestead-panel-item--growth">
        <div className="homestead-section__heading">
          <div>
            <p className="farm-kicker">RESEARCH TREE</p>
            <h2>三业研究树</h2>
          </div>
          <span>
            {homestead.research.filter(({ unlocked }) => unlocked).length}/
            {homestead.research.length} 已完成
          </span>
        </div>
        <div className="homestead-research-grid">
          {homestead.research.map((node) => (
            <article
              key={node.definition.id}
              className={node.unlocked ? 'is-complete' : ''}
            >
              <div className="homestead-card-title">
                <h3>{node.definition.name}</h3>
                <Tag color={
                  node.definition.branch === 'farm'
                    ? 'green'
                    : node.definition.branch === 'ranch'
                      ? 'orange'
                      : node.definition.branch === 'mine'
                        ? 'geekblue'
                        : node.definition.branch === 'community'
                          ? 'purple'
                          : 'gold'
                }>
                  {node.definition.branch}
                </Tag>
              </div>
              <p>{node.definition.description}</p>
              <p className="homestead-reward">
                研究点 {node.definition.researchCost} · 声望要求 {node.definition.requiredReputation}
              </p>
              {node.missingPrerequisites.length > 0 && (
                <small>
                  前置：{node.missingPrerequisites
                    .map((nodeId) => researchNames[nodeId] ?? nodeId)
                    .join('、')}
                </small>
              )}
              <Button
                type={node.canUnlock ? 'primary' : 'default'}
                disabled={node.unlocked || !node.canUnlock}
                loading={busyKey === `research:${node.definition.id}`}
                onClick={() => void act(
                  {
                    type: 'homestead_unlock_research',
                    nodeId: node.definition.id,
                  },
                  `research:${node.definition.id}`,
                  `研究“${node.definition.name}”完成`,
                )}
              >
                {node.unlocked ? '已完成' : '投入研究'}
              </Button>
            </article>
          ))}
        </div>
      </section>

      <section className="homestead-section homestead-panel-item homestead-panel-item--operations">
        <div className="homestead-section__heading">
          <div>
            <p className="farm-kicker">DEEP OPERATIONS</p>
            <h2>三板块深度经营</h2>
          </div>
          <span>每个板块每日一次长期行动</span>
        </div>
        <div className="homestead-depth-grid">
          <article className="homestead-depth-card homestead-depth-card--farm">
            <div className="homestead-card-title">
              <h3>农场 · 土壤与轮作</h3>
              <Tag color={homestead.specializations.canManageFarmToday ? 'green' : 'default'}>
                {homestead.specializations.canManageFarmToday ? '今日可规划' : '今日已完成'}
              </Tag>
            </div>
            <Progress
              percent={homestead.specializations.farm.soilHealth}
              strokeColor="#4d8b50"
              format={(value) => `土壤 ${value}`}
            />
            <p>
              连续轮作 {homestead.specializations.farm.rotationStreak} 次 ·
              经营加成 +{homestead.specializations.farm.yieldBonusPercent}%
            </p>
            <Checkbox
              checked={useFertilizer}
              disabled={!fertilizerAvailable}
              onChange={(event) => setUseFertilizer(event.target.checked)}
            >
              使用土壤改良剂（库存 {homestead.goods.soil_conditioner}）
            </Checkbox>
            {!unlockedResearch.has('soil_science') && (
              <small>完成“土壤科学”后可使用改良剂。</small>
            )}
            <div className="homestead-action-list">
              {homestead.specializations.cropFamilies.map((family) => (
                <Button
                  key={family.definition.id}
                  type={family.rotationImprovesSoil ? 'primary' : 'default'}
                  disabled={
                    !family.canPlan ||
                    (useFertilizer && !fertilizerAvailable)
                  }
                  loading={busyKey === `rotation:${family.definition.id}`}
                  onClick={() => void act(
                    {
                      type: 'homestead_plan_rotation',
                      cropFamily: family.definition.id,
                      useFertilizer,
                    },
                    `rotation:${family.definition.id}`,
                    `${family.definition.name}轮作计划完成`,
                  )}
                >
                  {family.definition.name}
                  {family.rotationImprovesSoil ? ' · 推荐轮作' : ''}
                </Button>
              ))}
            </div>
          </article>

          <article className="homestead-depth-card homestead-depth-card--ranch">
            <div className="homestead-card-title">
              <h3>牧场 · 营养与特质</h3>
              <Tag color={homestead.specializations.canManageRanchToday ? 'orange' : 'default'}>
                {homestead.specializations.canManageRanchToday ? '今日可饲喂' : '今日已完成'}
              </Tag>
            </div>
            <Progress
              percent={homestead.specializations.ranch.herdHealth}
              strokeColor="#bc7a30"
              format={(value) => `健康 ${value}`}
            />
            <p>
              产品加成 +{homestead.specializations.ranch.productBonusPercent}% ·
              已发现 {homestead.specializations.ranch.discoveredTraits.length} 种特质
            </p>
            <div className="homestead-traits">
              {homestead.specializations.ranch.discoveredTraits.length
                ? homestead.specializations.ranch.discoveredTraits.map((trait) => (
                    <Tag key={trait} color="gold">{TRAIT_NAMES[trait] ?? trait}</Tag>
                  ))
                : <small>尚未发现动物特质</small>}
            </div>
            <div className="homestead-action-list">
              {homestead.specializations.feedPrograms.map((program) => (
                <div key={program.definition.id}>
                  <strong>{program.definition.name}</strong>
                  <small>
                    健康 +{program.definition.healthGain} ·
                    特质机会 {program.definition.traitChance}%
                    {program.definition.goodCost
                      ? ` · ${ITEM_NAMES[program.definition.goodCost.itemId]} ${program.definition.goodCost.quantity}`
                      : ' · 无消耗'}
                  </small>
                  <Button
                    disabled={!program.canRun}
                    loading={busyKey === `feed:${program.definition.id}`}
                    onClick={() => void act(
                      {
                        type: 'homestead_run_feed_program',
                        programId: program.definition.id,
                      },
                      `feed:${program.definition.id}`,
                      `${program.definition.name}执行完成`,
                    )}
                  >
                    {program.lockedByResearch
                      ? '研究未解锁'
                      : !program.hasResources
                        ? '饲料不足'
                        : '执行方案'}
                  </Button>
                </div>
              ))}
            </div>
          </article>

          <article className="homestead-depth-card homestead-depth-card--mine">
            <div className="homestead-card-title">
              <h3>矿山 · 矿层与防护</h3>
              <Tag color={homestead.specializations.canManageMineToday ? 'geekblue' : 'default'}>
                {homestead.specializations.canManageMineToday ? '今日可勘探' : '今日已完成'}
              </Tag>
            </div>
            <p>
              防护 LV {homestead.specializations.mine.protectionLevel} ·
              勘探进度 {homestead.specializations.mine.surveyProgress} ·
              矿石加成 +{homestead.specializations.mine.oreBonusPercent}%
            </p>
            {homestead.specializations.nextProtectionUpgrade ? (
              <Button
                disabled={!homestead.specializations.nextProtectionUpgrade.canUpgrade}
                loading={busyKey === 'mine-protection'}
                onClick={() => void act(
                  { type: 'homestead_upgrade_mine_protection' },
                  'mine-protection',
                  '矿山防护已升级',
                )}
              >
                防护升至 LV {homestead.specializations.nextProtectionUpgrade.level}
                {' '}· {homestead.specializations.nextProtectionUpgrade.coinCost} 金币
                {' '}· 铁锭 {homestead.specializations.nextProtectionUpgrade.ironIngotCost}
                {' '}· 套装 {homestead.specializations.nextProtectionUpgrade.miningKitCost}
              </Button>
            ) : <Tag color="green">防护满级</Tag>}
            <div className="homestead-action-list">
              {homestead.specializations.mineLayers.map((layer) => (
                <div key={layer.definition.id}>
                  <strong>
                    {layer.definition.name}
                    {layer.discovered && <Tag color="cyan">已发现</Tag>}
                  </strong>
                  <small>
                    防护要求 LV {layer.definition.requiredProtection} ·
                    套装 {layer.definition.kitCost} ·
                    产出 {ITEM_NAMES[layer.definition.rewardDepositId]}
                    ×{layer.definition.rewardQuantity}
                  </small>
                  <Button
                    disabled={!layer.canSurvey}
                    loading={busyKey === `survey:${layer.definition.id}`}
                    onClick={() => void act(
                      {
                        type: 'homestead_survey_layer',
                        layerId: layer.definition.id,
                      },
                      `survey:${layer.definition.id}`,
                      `${layer.definition.name}勘探完成`,
                    )}
                  >
                    {layer.lockedByResearch
                      ? '研究未解锁'
                      : layer.lockedByProtection
                        ? '防护不足'
                        : !layer.hasResources
                          ? '套装不足'
                          : '开始勘探'}
                  </Button>
                </div>
              ))}
            </div>
          </article>
        </div>
      </section>

      <section className="homestead-section homestead-panel-item homestead-panel-item--operations">
        <div className="homestead-section__heading">
          <div>
            <p className="farm-kicker">FACILITIES</p>
            <h2>加工设施</h2>
          </div>
          <span>{homestead.facilities.filter(({ built }) => built).length}/{homestead.facilities.length} 已建成</span>
        </div>
        <div className="homestead-facility-grid">
          {homestead.facilities.map((facility) => (
            <article key={facility.id}>
              <div className="homestead-card-title">
                <h3>{facility.definition.name}</h3>
                <div>
                  {facility.built && <Tag color="gold">LV {facility.level}</Tag>}
                  <Tag color={facility.built ? (facility.job ? 'blue' : 'green') : 'default'}>
                    {facility.built ? (facility.job ? '生产中' : '空闲') : '未建设'}
                  </Tag>
                </div>
              </div>
              <FacilityStatus facility={facility} now={now} />
              {!facility.built ? (
                <Button
                  disabled={!facility.canBuild}
                  loading={busyKey === `build:${facility.id}`}
                  onClick={() => void act(
                    { type: 'homestead_build_facility', facilityId: facility.id },
                    `build:${facility.id}`,
                    `${facility.definition.name}建成`,
                  )}
                >
                  建设
                </Button>
              ) : facility.job && facility.job.completesAt <= now ? (
                <Button
                  type="primary"
                  loading={busyKey === `collect:${facility.id}`}
                  onClick={() => void act(
                    { type: 'homestead_collect_job', facilityId: facility.id },
                    `collect:${facility.id}`,
                    '加工品已入库',
                  )}
                >
                  收取
                </Button>
              ) : null}
              {facility.built && facility.nextUpgrade && (
                <Button
                  disabled={!facility.nextUpgrade.canUpgrade}
                  loading={busyKey === `upgrade:${facility.id}`}
                  onClick={() => void act(
                    { type: 'homestead_upgrade_facility', facilityId: facility.id },
                    `upgrade:${facility.id}`,
                    `${facility.definition.name}已升级`,
                  )}
                >
                  升到 LV {facility.nextUpgrade.level} · {facility.nextUpgrade.coinCost} 金币
                  {' '}· 铁锭 {facility.nextUpgrade.ironIngotCost}
                </Button>
              )}
              {facility.built && !facility.nextUpgrade && (
                <span className="homestead-complete-label">设施已满级</span>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="homestead-section homestead-panel-item homestead-panel-item--operations">
        <div className="homestead-section__heading">
          <div>
            <p className="farm-kicker">PRODUCTION CHAINS</p>
            <h2>跨产业配方</h2>
          </div>
          <span>设施队列是主要生产瓶颈</span>
        </div>
        <div className="homestead-recipe-grid">
          {homestead.recipes.map((recipe) => (
            <article key={recipe.id}>
              <div className="homestead-card-title">
                <h3>{recipe.name}</h3>
                <span>{formatHomesteadDuration(recipe.effectiveDurationSeconds * 1_000)}</span>
              </div>
              <ResourceTags resources={recipe.inputsView} />
              <p className="homestead-output">
                产出：{ITEM_NAMES[recipe.output.itemId]} × {recipe.effectiveOutputQuantity}
              </p>
              <Button
                type={recipe.canStart ? 'primary' : 'default'}
                disabled={!recipe.canStart}
                loading={busyKey === `recipe:${recipe.id}`}
                onClick={() => void act(
                  { type: 'homestead_start_job', recipeId: recipe.id },
                  `recipe:${recipe.id}`,
                  `${recipe.name}已经开始`,
                )}
              >
                {!recipe.facilityBuilt
                  ? '设施未建设'
                  : recipe.facilityBusy
                    ? '设施忙碌'
                    : '开始加工'}
              </Button>
            </article>
          ))}
        </div>
      </section>

      <section className="homestead-section homestead-panel-item homestead-panel-item--operations">
        <div className="homestead-section__heading">
          <div>
            <p className="farm-kicker">VALUE-ADDED PORTFOLIO</p>
            <h2>全品类增值项目</h2>
          </div>
          <span>每项每日一次；所有农产品、牧场产品和矿物均有非直售用途</span>
        </div>
        <div className="homestead-value-grid">
          {homestead.valueRoutes.map((route) => (
            <article
              key={route.id}
              className={route.completedToday ? 'is-complete' : undefined}
            >
              <div className="homestead-card-title">
                <h3>{route.title}</h3>
                <Tag color={route.stage === 3 ? 'purple' : 'cyan'}>
                  {route.stage === 3 ? '三级商路' : '二级加工'}
                </Tag>
              </div>
              <p>{route.description}</p>
              <ResourceTags resources={route.requirementsView} />
              <p className="homestead-reward">
                {route.coinReward} 金币 · 当地声望 +{route.reputationReward}
                {route.researchReward > 0
                  ? ` · 研究 +${route.researchReward}`
                  : ''}
              </p>
              <Button
                type={route.canComplete ? 'primary' : 'default'}
                disabled={!route.canComplete}
                loading={busyKey === `value-route:${route.id}`}
                onClick={() => void act(
                  {
                    type: 'homestead_complete_value_route',
                    routeId: route.id,
                  },
                  `value-route:${route.id}`,
                  `${route.title}已交付`,
                )}
              >
                {route.completedToday ? '今日已完成' : '交付增值项目'}
              </Button>
            </article>
          ))}
        </div>
      </section>

      <section className="homestead-section homestead-panel-item homestead-panel-item--operations">
        <div className="homestead-section__heading">
          <div>
            <p className="farm-kicker">JOINT CONTRACTS</p>
            <h2>三业联合订单</h2>
          </div>
          <span>每日轮换</span>
        </div>
        <div className="homestead-order-grid">
          {homestead.orders.map((order) => (
            <article key={order.id} className={order.completed ? 'is-complete' : ''}>
              <div className="homestead-card-title">
                <h3>{order.template.title}</h3>
                {order.completed && <Tag color="green">已完成</Tag>}
              </div>
              <p>{order.template.description}</p>
              <ResourceTags resources={order.requirements} />
              <p className="homestead-reward">
                {order.template.coinReward} 金币 · 声望 +{order.template.reputationReward}
                {' '}· 研究 +{order.template.researchReward}
              </p>
              <Button
                type={order.canComplete ? 'primary' : 'default'}
                disabled={!order.canComplete}
                loading={busyKey === `order:${order.id}`}
                onClick={() => void act(
                  { type: 'homestead_complete_order', orderId: order.id },
                  `order:${order.id}`,
                  '联合订单完成',
                )}
              >
                {order.completed ? '已交付' : '交付订单'}
              </Button>
            </article>
          ))}
        </div>
      </section>

      <section className="homestead-section homestead-panel-item homestead-panel-item--operations">
        <div className="homestead-section__heading">
          <div>
            <p className="farm-kicker">WAREHOUSE & LOG</p>
            <h2>加工库存与庄园记录</h2>
          </div>
        </div>
        <div className="homestead-ledger">
          <div>
            <h3>加工品</h3>
            {completedGoods.length ? completedGoods.map(([itemId, quantity]) => (
              <p key={itemId}>{ITEM_NAMES[itemId] ?? itemId}<strong>{quantity}</strong></p>
            )) : <p>尚无加工品</p>}
          </div>
          <div>
            <h3>最近记录</h3>
            {homestead.logs.slice(0, 8).map((entry) => (
              <p key={entry.id}>
                <span>{new Date(entry.at).toLocaleString()}</span>
                {entry.message}
              </p>
            ))}
            {!homestead.logs.length && <p>庄园刚刚开始运转</p>}
          </div>
        </div>
      </section>
    </main>
  );
}
