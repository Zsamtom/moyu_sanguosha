import {
  Alert,
  Button,
  Checkbox,
  Popconfirm,
  Progress,
  Select,
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
import type {
  HomesteadClientAction,
  HomesteadDisasterView,
  HomesteadFacilityView,
  HomesteadResourceView,
  HomesteadSnapshot,
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
  frost_barley: '霜麦',
  snow_potato: '雪薯',
  ice_turnip: '冰芜菁',
  highland_bean: '高原豆',
  cloudberry: '云莓',
  alpine_herb: '高山药草',
  ice_lettuce: '冰叶菜',
  juniper_berry: '杜松果',
  blue_rose: '寒地蓝蔷薇',
  silver_flax: '银麻',
  winter_melon: '寒香瓜',
  aurora_fruit: '极光果',
  snow_egg: '雪羽蛋',
  ptarmigan_egg: '雷鸟蛋',
  angora_fur: '高原兔绒',
  highland_wool: '高地羊毛',
  yak_milk: '牦牛奶',
  cashmere: '山羊绒',
  lignite: '褐煤',
  magnetite: '磁铁矿',
  tin: '锡矿',
  frost_silver: '霜银',
  glacier_gold: '冰川金',
  frost_crystal: '霜晶',
  flour: '面粉',
  coarse_feed: '粗饲料',
  fortified_feed: '强化饲料',
  soil_conditioner: '土壤改良剂',
  work_clothes: '工作服',
  iron_ingot: '铁锭',
  mining_kit: '矿工防护套装',
  festival_crate: '庆典食品箱',
  greenhouse_parts: '温室构件',
  frost_barley_flour: '霜麦粉',
  alpine_feed: '高原营养饲料',
  thermal_compost: '温床营养基',
  frost_felt: '御寒呢毡',
  frost_alloy: '耐寒合金锭',
  cloudberry_preserves: '云莓药草蜜饯',
  winter_provisions: '雪线远行口粮',
  insulated_mining_kit: '保温矿务套装',
  aurora_ceremonial_crate: '极光庆典礼箱',
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

const WEATHER_SOURCE_LABELS = {
  live: '实时天气',
  last_known_good: '最近有效天气',
  fallback: '安全回退',
  rules: '本地规则',
} as const;

const WEATHER_FALLBACK_REASON_LABELS: Record<string, string> = {
  provider_disabled: '服务端未配置天气服务',
  provider_timeout: '天气服务响应超时',
  provider_error: '天气服务返回异常',
};

const DISASTER_NAMES: Record<HomesteadDisasterView['eventId'], string> = {
  mountain_seepage: '矿山渗水',
  cold_snap: '突发寒潮',
  heatwave: '高温热浪',
  windstorm: '强风灾害',
  hail: '冰雹灾害',
  drought: '持续干旱',
};

const LIVE_MERCHANT_ITEMS = new Set([
  'priority_dispatch',
  'rail_pass',
  'merchant_banner',
]);

const DEFAULT_AI_PROFILE = {
  enabled: true,
  goal: 'balanced',
  risk: 'balanced',
  focus: 'processing',
} satisfies HomesteadSnapshot['homestead']['aiProfile'];

const DEFAULT_ADVICE_STEPS = [
  {
    id: 'review-event',
    title: '处理今日事件',
    reason: '先比较事件选项，确定今天的资源优先级。',
    panel: 'today',
    targetId: 'homestead-world-event',
  },
  {
    id: 'stabilize-processing',
    title: '检查加工队列',
    reason: '让已建成设施保持运转，减少原料闲置。',
    panel: 'operations',
    targetId: 'homestead-processing',
  },
  {
    id: 'prepare-growth',
    title: '规划下一项研究',
    reason: '根据当前瓶颈选择一个长期能力方向。',
    panel: 'growth',
    targetId: 'homestead-research',
  },
] satisfies HomesteadSnapshot['homestead']['advice']['steps'];

export function formatHomesteadDuration(milliseconds: number): string {
  if (milliseconds <= 0) return '可收取';
  const minutes = Math.ceil(milliseconds / 60_000);
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} 小时 ${rest} 分` : `${hours} 小时`;
}

export function formatWeatherObservedAt(timestamp?: number): string {
  if (!timestamp) return '等待首次同步';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(timestamp);
}

export function formatDisasterReputationImpact(
  disaster: Pick<
    HomesteadDisasterView,
    | 'reputationPenaltyPaid'
    | 'reputationPenaltyContinues'
    | 'nextReputationLoss'
  >,
): string {
  const paid = disaster.reputationPenaltyPaid ?? 0;
  const base = `本轮已扣声望 ${paid}/12`;
  if (!disaster.reputationPenaltyContinues) {
    return `${base} · 声望惩罚已达本次灾害上限`;
  }
  if (disaster.nextReputationLoss <= 0) {
    return `${base} · 声望惩罚仍继续，但当前声望已到底，下一跨日无实际扣除`;
  }
  return `${base} · 声望惩罚仍继续，下一跨日预计 -${disaster.nextReputationLoss}`;
}

export function isWeatherMechanicsEnabled(
  weather: Pick<
    HomesteadSnapshot['homestead']['weather'],
    'source' | 'mechanicsEnabled'
  >,
): boolean {
  return (
    (weather.source === 'live' || weather.source === 'rules') &&
    weather.mechanicsEnabled === true
  );
}

function merchantEffectLabel(
  effect: HomesteadSnapshot['homestead']['merchantShop']['items'][number]['numericEffect'],
): string {
  switch (effect.kind) {
    case 'facility_acceleration':
      return `单次缩短 ${effect.percent}%，最多 ${Math.round(effect.maximumSeconds / 60)} 分钟`;
    case 'travel_discount':
      return `下一次跨镇基础票价减免 ${effect.percent}%`;
    case 'cosmetic':
      return '纯收藏展示，不提供数值加成';
  }
}

function orderStrategyLabel(template: {
  coinReward: number;
  reputationReward: number;
  researchReward: number;
}): string {
  if (template.researchReward >= 10) return '研究优先';
  if (template.reputationReward >= 35) return '声望优先';
  if (template.coinReward >= 800) return '现金优先';
  return '综合收益';
}

function friendlyUnlockReason(reason: string): string {
  return reason.replace('完成研究 civic_network', '完成研究「城镇协作网络」');
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

export function canCommitHomesteadSnapshot(
  next: HomesteadSnapshot,
  current?: HomesteadSnapshot,
  authoritative = false,
): boolean {
  if (authoritative) return true;
  return isTownRevisionVectorAtLeast(
    next.homestead.activeTownId,
    [
      next.homestead.accountRevision,
      next.homestead.revision,
      next.homestead.revisions.farm,
      next.homestead.revisions.ranch,
      next.homestead.revisions.mine,
    ],
    current?.homestead.activeTownId,
    current
      ? [
          current.homestead.accountRevision,
          current.homestead.revision,
          current.homestead.revisions.farm,
          current.homestead.revisions.ranch,
          current.homestead.revisions.mine,
        ]
      : undefined,
  );
}

export async function runHomesteadActionWithConflictRetry<T>(
  initialSnapshot: HomesteadSnapshot,
  apply: (snapshot: HomesteadSnapshot) => Promise<T>,
  refresh: () => Promise<HomesteadSnapshot>,
): Promise<{ result: T; retried: boolean }> {
  try {
    return { result: await apply(initialSnapshot), retried: false };
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 409) throw error;
    const latestSnapshot = await refresh();
    return { result: await apply(latestSnapshot), retried: true };
  }
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
  const [showTownNetwork, setShowTownNetwork] = useState(false);
  const [toast, toastContext] = message.useMessage();
  const snapshotRef = useRef<HomesteadSnapshot>();
  const actionInFlight = useRef(false);
  const loadRequestSequence = useRef(0);

  const commitSnapshot = (
    next: HomesteadSnapshot,
    authoritative = false,
  ): boolean => {
    const current = snapshotRef.current;
    if (!canCommitHomesteadSnapshot(next, current, authoritative)) return false;
    const townChanged = Boolean(
      current &&
      current.homestead.activeTownId !== next.homestead.activeTownId,
    );
    snapshotRef.current = next;
    setSnapshot(next);
    setNow(next.homestead.serverTime);
    if (townChanged) {
      setUseFertilizer(false);
      setLegacyPanel('today');
      setShowTownNetwork(false);
    }
    return true;
  };

  const load = async (
    quiet = false,
    allowDuringAction = false,
    authoritative = false,
  ): Promise<HomesteadSnapshot | undefined> => {
    if (quiet && actionInFlight.current && !allowDuringAction) return undefined;
    const requestId = ++loadRequestSequence.current;
    if (quiet) setQuietLoading(true);
    else setLoading(true);
    let committed: HomesteadSnapshot | undefined;
    try {
      const next = await api.getHomestead();
      if (
        isLatestRequest(requestId, loadRequestSequence.current) &&
        (allowDuringAction || !actionInFlight.current) &&
        commitSnapshot(next, authoritative)
      ) {
        setFailure(undefined);
        committed = next;
      }
    } catch (error) {
      if (
        isLatestRequest(requestId, loadRequestSequence.current) &&
        (allowDuringAction || !actionInFlight.current)
      ) {
        setFailure(errorMessage(error));
      }
    } finally {
      setLoading(false);
      setQuietLoading(false);
    }
    return committed;
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
    const current = snapshotRef.current;
    if (!current || actionInFlight.current) return;
    actionInFlight.current = true;
    loadRequestSequence.current += 1;
    setBusyKey(key);
    try {
      const outcome = await runHomesteadActionWithConflictRetry(
        current,
        (baseSnapshot) => api.applyHomesteadAction(baseSnapshot, action),
        async () => {
          toast.warning('\u5e84\u56ed\u72b6\u6001\u5df2\u53d8\u5316\uff0c\u6b63\u5728\u540c\u6b65\u5e76\u91cd\u65b0\u6267\u884c\u672c\u6b21\u64cd\u4f5c');
          const refreshed = await load(true, true, true);
          if (!refreshed) {
            throw new Error('\u65e0\u6cd5\u83b7\u53d6\u6700\u65b0\u5e84\u56ed\u72b6\u6001\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5');
          }
          return refreshed;
        },
      );
      commitSnapshot(outcome.result, true);
      setFailure(undefined);
      toast.success(
        outcome.retried
          ? `${success}\uff08\u5df2\u540c\u6b65\u6700\u65b0\u72b6\u6001\uff09`
          : success,
      );
    } catch (error) {
      const text = error instanceof ApiError && error.status === 409
        ? '\u5e84\u56ed\u72b6\u6001\u4ecd\u5728\u53d8\u5316\uff0c\u8bf7\u7a0d\u540e\u91cd\u65b0\u64cd\u4f5c'
        : errorMessage(error);
      setFailure(text);
      toast.error(text);
    } finally {
      actionInFlight.current = false;
      setBusyKey(undefined);
    }
  };

  const openAdviceStep = (
    panel: 'today' | 'operations' | 'growth',
    targetId: string,
  ) => {
    setLegacyPanel(panel);
    window.setTimeout(() => {
      document.getElementById(targetId)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 0);
  };

  const completedGoods = useMemo(
    () => snapshot
      ? snapshot.homestead.activeGoodIds
          .map((itemId) => [
            itemId,
            snapshot.homestead.goods[itemId] ?? 0,
          ] as const)
          .filter(([, quantity]) => quantity > 0)
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
  const aiProfile = homestead.aiProfile ?? DEFAULT_AI_PROFILE;
  const adviceSteps = homestead.advice.steps?.length === 3
    ? homestead.advice.steps
    : DEFAULT_ADVICE_STEPS;
  const actionsBusy = Boolean(busyKey);
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
  const logisticsRemaining = Math.max(
    0,
    homestead.logistics.capacity - homestead.logistics.used,
  );
  const accelerationCards =
    homestead.merchantShop.items.find(({ id }) => id === 'priority_dispatch')
      ?.owned ?? 0;
  const weatherSource = homestead.weather.source ?? 'rules';
  const weatherMechanicsEnabled = isWeatherMechanicsEnabled(
    homestead.weather,
  );
  const todayActionCount =
    homestead.orders.filter(({ canComplete }) => canComplete).length +
    homestead.valueRoutes.filter(({ canComplete }) => canComplete).length +
    (
      homestead.worldEvent.selectedOptionId === null &&
      homestead.worldEvent.definition.options.some(({ canChoose }) => canChoose)
        ? 1
        : 0
    );
  const operationReadyCount =
    homestead.facilities.filter(({ ready }) => ready).length +
    (activeTown?.sectors.filter(({ ready }) => ready).length ?? 0);
  const townSwitcher = (
    <section className="homestead-town-network" aria-label="城镇交通与开发">
      <div className="homestead-section__heading">
        <div>
          <p className="farm-kicker">TOWN NETWORK</p>
          <h2>城镇庄园与交通</h2>
        </div>
        <div className="homestead-town-network__summary">
          <span>
            当前：{activeTown?.definition.name} ·
            {' '}{homestead.towns.filter(({ unlocked }) => unlocked).length}
            /{homestead.towns.length} 个城镇已开发
          </span>
          <Button
            size="small"
            aria-expanded={showTownNetwork}
            onClick={() => setShowTownNetwork((value) => !value)}
          >
            {showTownNetwork ? '收起城镇网络' : '展开切换与开发'}
          </Button>
        </div>
      </div>
      {showTownNetwork && (
        <div className="homestead-town-switcher">
        {homestead.towns.map((town) => {
          const travelDisabledReason = town.travel?.reason;
          const unlockReason = town.unlockMissing
            .map(friendlyUnlockReason)
            .join('；');
          const usesRailPass = Boolean(
            town.travel &&
            town.travel.payableFare < town.travel.baseFare,
          );
          return (
            <article
              key={town.definition.id}
              className={town.active ? 'is-active' : undefined}
            >
              <div className="homestead-town-card__status">
                <Tag color={town.active ? 'green' : town.unlocked ? 'blue' : 'default'}>
                  {town.active ? '当前所在地' : town.unlocked ? '已开发' : '待开发'}
                </Tag>
                <span>{town.definition.climate}</span>
              </div>
              <strong>{town.definition.name}</strong>
              <small>{town.definition.subtitle}</small>
              <p>{town.definition.description}</p>
              <div className="homestead-town-card__meta">
                <span>当地声望 {town.reputation}</span>
                <span>三业体系完整</span>
                <span>{town.definition.specialties.join(' · ')}</span>
              </div>
              {town.active ? (
                <Button disabled block>正在经营</Button>
              ) : town.unlocked && town.travel ? (
                <>
                  <div className="homestead-travel-fare">
                    <span>{town.travel.routeName}</span>
                    <strong>{town.travel.payableFare} 金币</strong>
                    {usesRailPass && (
                      <small>
                        原价 {town.travel.baseFare} · 本次自动使用商会联运票
                      </small>
                    )}
                  </div>
                  <Popconfirm
                    title={`确认乘车前往${town.definition.name}？`}
                    description={`将从共享余额 ${homestead.coins} 中支付 ${town.travel.payableFare} 金币。抵达后切换为当地独立庄园。`}
                    okText="确认出发"
                    cancelText="留在当前城镇"
                    disabled={actionsBusy || !town.travel.canTravel}
                    onConfirm={() => void act(
                      {
                        type: 'homestead_switch_town',
                        townId: town.definition.id,
                      },
                      `town:switch:${town.definition.id}`,
                      `已抵达${town.definition.name}`,
                    )}
                  >
                    <Button
                      type="primary"
                      block
                      disabled={actionsBusy || !town.travel.canTravel}
                      loading={busyKey === `town:switch:${town.definition.id}`}
                    >
                      {travelDisabledReason ?? `支付 ${town.travel.payableFare} 金币并出发`}
                    </Button>
                  </Popconfirm>
                  {travelDisabledReason && (
                    <small className="homestead-disabled-reason">
                      {travelDisabledReason}
                    </small>
                  )}
                </>
              ) : (
                <>
                  <div className="homestead-unlock-requirements">
                    <strong>开发条件</strong>
                    {town.unlockMissing.length
                      ? town.unlockMissing.map((reason) => (
                          <small key={reason}>· {friendlyUnlockReason(reason)}</small>
                        ))
                      : <small>条件已满足 · 开发资金 {town.unlockCoinCost} 金币</small>}
                  </div>
                  <Popconfirm
                    title={`开发${town.definition.name}？`}
                    description={`将支付 ${town.unlockCoinCost} 金币建立一套独立的农场、牧场、矿山与事件系统。解锁不会自动旅行。`}
                    okText="确认开发"
                    cancelText="暂不开发"
                    disabled={actionsBusy || !town.canUnlock}
                    onConfirm={() => void act(
                      {
                        type: 'homestead_unlock_town',
                        townId: town.definition.id,
                      },
                      `town:unlock:${town.definition.id}`,
                      `${town.definition.name}已完成开发`,
                    )}
                  >
                    <Button
                      block
                      type={town.canUnlock ? 'primary' : 'default'}
                      disabled={actionsBusy || !town.canUnlock}
                      loading={busyKey === `town:unlock:${town.definition.id}`}
                    >
                      {town.canUnlock
                        ? `支付 ${town.unlockCoinCost} 金币开发`
                        : '开发条件未满足'}
                    </Button>
                  </Popconfirm>
                  {unlockReason && (
                    <small className="homestead-disabled-reason">
                      {unlockReason}
                    </small>
                  )}
                </>
              )}
            </article>
          );
        })}
        {Object.values(homestead.plannedTowns).map((town) => (
          <article
            key={town.id}
            className="homestead-town-switcher__future"
            aria-disabled="true"
          >
            <div className="homestead-town-card__status">
              <Tag>后续更新</Tag>
              <span>{town.climate}</span>
            </div>
            <strong>{town.name}</strong>
            <small>{town.subtitle}</small>
            <p>{town.description}</p>
            <div className="homestead-town-card__meta">
              <span>{town.plannedSpecialties.join(' · ')}</span>
            </div>
            <Button disabled block>尚未开放</Button>
          </article>
        ))}
        </div>
      )}
    </section>
  );

  return (
    <main className={`farm-page homestead-page homestead-panel-${legacyPanel}`}>
      {toastContext}
      <header className="farm-hero homestead-hero">
        <div>
          <p className="farm-kicker">THREE-SECTOR ESTATE</p>
          <h1>{activeTown?.definition.name ?? '三业'}庄园</h1>
          <p>{activeTown?.definition.description}</p>
        </div>
        <div className="homestead-metrics">
          <div><strong>{homestead.coins}</strong><span>共享金币</span></div>
          <div><strong>{homestead.reputation}</strong><span>当地声望</span></div>
          <div><strong>{homestead.merchantRenown}</strong><span>商会名望</span></div>
          <div><strong>{homestead.researchPoints}</strong><span>研究点</span></div>
          <div>
            <strong>{logisticsRemaining}/{homestead.logistics.capacity}</strong>
            <span>今日物流点</span>
          </div>
          <Button
            disabled={actionsBusy}
            loading={quietLoading}
            onClick={() => void load(true)}
          >
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
      {actionsBusy && (
        <Alert
          className="homestead-alert homestead-operation-status"
          type="info"
          showIcon
          message="正在保存本次庄园操作，其他经营操作暂不可用"
        />
      )}

      <nav
        className="homestead-local-nav"
        aria-label={`${activeTown?.definition.name ?? '当前城镇'}经营分区`}
      >
        <Button
          type={legacyPanel === 'today' ? 'primary' : 'default'}
          onClick={() => setLegacyPanel('today')}
        >
          今日决策{todayActionCount > 0 ? ` (${todayActionCount})` : ''}
        </Button>
        <Button
          type={legacyPanel === 'operations' ? 'primary' : 'default'}
          onClick={() => setLegacyPanel('operations')}
        >
          产业经营{operationReadyCount > 0 ? ` (${operationReadyCount})` : ''}
        </Button>
        <Button
          type={legacyPanel === 'growth' ? 'primary' : 'default'}
          onClick={() => setLegacyPanel('growth')}
        >
          长期成长
        </Button>
      </nav>

      {townSwitcher}

      {activeTown?.definition.id === 'frostpeak' && activeTown.sectors.length > 0 && (
        <>
          <section
            id="homestead-town-local"
            className="homestead-section homestead-panel-item homestead-panel-item--operations"
          >
            <div className="homestead-section__heading">
              <div>
                <p className="farm-kicker">FROSTPEAK LOCAL INDUSTRIES</p>
                <h2>霜岭本地产业协作</h2>
              </div>
              <span>雪薯、牦牛奶与霜晶形成独立的民生生产链</span>
            </div>
            <div className="homestead-town-inventory" aria-label="霜岭本地库存">
              {([
                'snow_potato',
                'yak_milk',
                'frost_crystal',
              ] as const).map((resourceId) => (
                <article key={resourceId}>
                  <span>{ITEM_NAMES[resourceId]}</span>
                  <small>本地物资</small>
                  <strong>{activeTown.inventory[resourceId]}</strong>
                  <Popconfirm
                    title={`出售 1 份${ITEM_NAMES[resourceId]}？`}
                    description="出售所得进入全局共享金币账户。"
                    disabled={actionsBusy || activeTown.inventory[resourceId] < 1}
                    onConfirm={() => void act(
                      {
                        type: 'homestead_sell_town_resource',
                        resourceId,
                        quantity: 1,
                      },
                      `town-sell:${resourceId}`,
                      `${ITEM_NAMES[resourceId]}已出售`,
                    )}
                  >
                    <Button
                      size="small"
                      disabled={actionsBusy || activeTown.inventory[resourceId] < 1}
                      loading={busyKey === `town-sell:${resourceId}`}
                    >
                      出售 1 份
                    </Button>
                  </Popconfirm>
                </article>
              ))}
            </div>
            <div className="homestead-town-sector-grid">
              {activeTown.sectors.map((sector) => {
                const jobReady = Boolean(
                  sector.job && sector.job.completesAt <= now,
                );
                const liveProgress = !sector.job
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
                return (
                  <article key={sector.definition.id}>
                    <div className="homestead-card-title">
                      <h3>{sector.definition.name}</h3>
                      <Tag color={sector.job ? jobReady ? 'green' : 'blue' : 'default'}>
                        LV {sector.level}
                      </Tag>
                    </div>
                    <p>{sector.definition.actionName}</p>
                    <small>
                      产出 {ITEM_NAMES[sector.definition.output.itemId]}
                      {' '}×{sector.outputQuantity}
                      {sector.definition.input
                        ? ` · 消耗 ${ITEM_NAMES[sector.definition.input.itemId]} ×${sector.definition.input.quantity}`
                        : ' · 无前置物资'}
                    </small>
                    {sector.job && (
                      <>
                        <Progress
                          percent={Math.round(liveProgress * 100)}
                          size="small"
                          status={jobReady ? 'success' : 'active'}
                        />
                        <small>
                          {jobReady
                            ? '本轮生产已经完成'
                            : `剩余 ${formatHomesteadDuration(sector.job.completesAt - now)}`}
                        </small>
                      </>
                    )}
                    <div className="homestead-town-actions">
                      {sector.job ? (
                        <Button
                          type={jobReady ? 'primary' : 'default'}
                          disabled={actionsBusy || !jobReady}
                          loading={busyKey === `town-collect:${sector.definition.id}`}
                          onClick={() => void act(
                            {
                              type: 'homestead_collect_town_sector',
                              sectorId: sector.definition.id,
                            },
                            `town-collect:${sector.definition.id}`,
                            `${sector.definition.name}产物已收取`,
                          )}
                        >
                          {jobReady ? '收取产物' : '生产中'}
                        </Button>
                      ) : (
                        <Button
                          type={sector.canStart ? 'primary' : 'default'}
                          disabled={actionsBusy || !sector.canStart}
                          loading={busyKey === `town-start:${sector.definition.id}`}
                          onClick={() => void act(
                            {
                              type: 'homestead_start_town_sector',
                              sectorId: sector.definition.id,
                            },
                            `town-start:${sector.definition.id}`,
                            `${sector.definition.actionName}已开始`,
                          )}
                        >
                          开始{sector.definition.actionName}
                        </Button>
                      )}
                      {sector.nextUpgrade && (
                        <Popconfirm
                          title={`升级${sector.definition.name}到 LV ${sector.nextUpgrade.level}？`}
                          description={
                            `需要 ${sector.nextUpgrade.coinCost} 金币、` +
                            `${sector.nextUpgrade.crystalCost} 霜晶，` +
                            `并达到 ${sector.nextUpgrade.reputationRequired} 当地声望。`
                          }
                          disabled={actionsBusy || !sector.nextUpgrade.canUpgrade}
                          onConfirm={() => void act(
                            {
                              type: 'homestead_upgrade_town_sector',
                              sectorId: sector.definition.id,
                            },
                            `town-upgrade:${sector.definition.id}`,
                            `${sector.definition.name}已升级`,
                          )}
                        >
                          <Button
                            disabled={actionsBusy || !sector.nextUpgrade.canUpgrade}
                            loading={busyKey === `town-upgrade:${sector.definition.id}`}
                          >
                            升级产业
                          </Button>
                        </Popconfirm>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <div className="homestead-town-goal-grid homestead-panel-item homestead-panel-item--growth">
            <section className="homestead-section">
              <div className="homestead-section__heading">
                <div>
                  <p className="farm-kicker">LOCAL PROBLEM</p>
                  <h2>{activeTown.currentProblem?.title ?? '霜岭民生稳定'}</h2>
                </div>
                <Tag color={activeTown.currentProblem ? 'orange' : 'green'}>
                  {activeTown.currentProblem ? '待解决' : '全部完成'}
                </Tag>
              </div>
              {activeTown.currentProblem ? (
                <>
                  <p>{activeTown.currentProblem.description}</p>
                  <div className="homestead-town-requirements">
                    {activeTown.currentProblem.requirementsView.map((requirement) => (
                      <Tag
                        key={requirement.itemId}
                        color={requirement.sufficient ? 'green' : 'red'}
                      >
                        {ITEM_NAMES[requirement.itemId]}
                        {' '}{requirement.available}/{requirement.quantity}
                      </Tag>
                    ))}
                  </div>
                  <p className="homestead-reward">
                    金币 +{activeTown.currentProblem.coinReward}
                    {' '}· 当地声望 +{activeTown.currentProblem.reputationReward}
                    {' '}· 研究 +{activeTown.currentProblem.researchReward}
                  </p>
                  <Button
                    type={activeTown.currentProblem.canResolve ? 'primary' : 'default'}
                    disabled={actionsBusy || !activeTown.currentProblem.canResolve}
                    loading={busyKey === `town-problem:${activeTown.currentProblem.id}`}
                    onClick={() => void act(
                      {
                        type: 'homestead_resolve_town_problem',
                        problemId: activeTown.currentProblem!.id,
                      },
                      `town-problem:${activeTown.currentProblem!.id}`,
                      '霜岭民生问题已经解决',
                    )}
                  >
                    提交物资并解决问题
                  </Button>
                </>
              ) : (
                <p>当前规划中的三项民生问题均已解决。</p>
              )}
            </section>

            <section className="homestead-section">
              <div className="homestead-section__heading">
                <div>
                  <p className="farm-kicker">LANDMARK RESTORATION</p>
                  <h2>{activeTown.nextLandmark?.name ?? '山地热力站已修复'}</h2>
                </div>
                <Tag color={activeTown.landmarkComplete ? 'green' : 'blue'}>
                  阶段 {activeTown.landmarkStage}/3
                </Tag>
              </div>
              {activeTown.nextLandmark ? (
                <>
                  <p>
                    需要解决 {activeTown.nextLandmark.requiredProblems} 项民生问题，
                    达到 {activeTown.nextLandmark.requiredReputation} 当地声望，
                    并支付 {activeTown.nextLandmark.coinCost} 金币。
                  </p>
                  <div className="homestead-town-requirements">
                    {activeTown.nextLandmark.requirementsView.map((requirement) => (
                      <Tag
                        key={requirement.itemId}
                        color={requirement.sufficient ? 'green' : 'red'}
                      >
                        {ITEM_NAMES[requirement.itemId]}
                        {' '}{requirement.available}/{requirement.quantity}
                      </Tag>
                    ))}
                  </div>
                  <Button
                    type={activeTown.nextLandmark.canRestore ? 'primary' : 'default'}
                    disabled={actionsBusy || !activeTown.nextLandmark.canRestore}
                    loading={busyKey === 'town-landmark'}
                    onClick={() => void act(
                      { type: 'homestead_restore_town_landmark' },
                      'town-landmark',
                      `${activeTown.nextLandmark!.name}已经完成`,
                    )}
                  >
                    修复下一阶段
                  </Button>
                </>
              ) : (
                <p>热力站全部阶段已经恢复，霜岭公共服务进入稳定运行。</p>
              )}
            </section>
          </div>
        </>
      )}

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
        <div className="homestead-ai-profile" aria-label="庄园管家偏好">
          <Checkbox
            checked={aiProfile.enabled}
            disabled={actionsBusy}
            onChange={(event) => void act(
              {
                type: 'homestead_update_ai_profile',
                ...aiProfile,
                enabled: event.target.checked,
              },
              'ai-profile:enabled',
              event.target.checked ? '庄园管家已启用' : '庄园管家已暂停',
            )}
          >
            启用个性化庄园管家
          </Checkbox>
          <label>
            <span>经营目标</span>
            <Select
              value={aiProfile.goal}
              disabled={actionsBusy || !aiProfile.enabled}
              options={[
                { value: 'balanced', label: '均衡发展' },
                { value: 'wealth', label: '金币积累' },
                { value: 'reputation', label: '城镇声望' },
                { value: 'research', label: '研究成长' },
              ]}
              onChange={(goal) => void act(
                {
                  type: 'homestead_update_ai_profile',
                  ...aiProfile,
                  goal,
                },
                'ai-profile:goal',
                '经营目标已更新',
              )}
            />
          </label>
          <label>
            <span>风险偏好</span>
            <Select
              value={aiProfile.risk}
              disabled={actionsBusy || !aiProfile.enabled}
              options={[
                { value: 'safe', label: '稳健保守' },
                { value: 'balanced', label: '平衡取舍' },
                { value: 'bold', label: '积极扩张' },
              ]}
              onChange={(risk) => void act(
                {
                  type: 'homestead_update_ai_profile',
                  ...aiProfile,
                  risk,
                },
                'ai-profile:risk',
                '风险偏好已更新',
              )}
            />
          </label>
          <label>
            <span>优先产业</span>
            <Select
              value={aiProfile.focus}
              disabled={actionsBusy || !aiProfile.enabled}
              options={[
                { value: 'farm', label: '农场' },
                { value: 'ranch', label: '牧场' },
                { value: 'mine', label: '矿山' },
                { value: 'processing', label: '加工协作' },
              ]}
              onChange={(focus) => void act(
                {
                  type: 'homestead_update_ai_profile',
                  ...aiProfile,
                  focus,
                },
                'ai-profile:focus',
                '优先产业已更新',
              )}
            />
          </label>
        </div>
        <div className="homestead-advice-plan" aria-label="今日三步经营计划">
          {adviceSteps.map((step, index) => (
            <article key={step.id}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <div>
                <strong>{step.title}</strong>
                <small>{step.reason}</small>
              </div>
              <Button
                size="small"
                onClick={() => openAdviceStep(step.panel, step.targetId)}
              >
                前往
              </Button>
            </article>
          ))}
        </div>
        <p className="homestead-npc-line">
          {homestead.npcs.find(({ npcId }) => npcId === homestead.advice.npcId)
            ?.definition.name ?? '庄园顾问'}：{homestead.advice.npcLine}
        </p>
      </section>

      <section className="homestead-section homestead-panel-item homestead-panel-item--today">
        <div className="homestead-section__heading">
          <div>
            <p className="farm-kicker">DAILY LOGISTICS</p>
            <h2>今日物流调度</h2>
          </div>
          <Tag color={logisticsRemaining > 1 ? 'green' : logisticsRemaining ? 'orange' : 'red'}>
            剩余 {logisticsRemaining}/{homestead.logistics.capacity}
          </Tag>
        </div>
        <Progress
          percent={Math.round(
            (homestead.logistics.used / Math.max(1, homestead.logistics.capacity)) * 100,
          )}
          status={logisticsRemaining === 0 ? 'exception' : 'active'}
          format={() => `已用 ${homestead.logistics.used}`}
        />
        <p className="homestead-weather-summary">
          物流点每天恢复，用来迫使成熟庄园在订单、增值路线和灾期调度之间做选择；
          普通种植、养殖、采矿和加工不消耗物流点。
        </p>
        <div className="homestead-logistics-costs">
          <span><strong>2 点</strong><small>三业联合订单</small></span>
          <span><strong>1 点</strong><small>二级增值项目</small></span>
          <span><strong>2 点</strong><small>三级商路项目</small></span>
          <span><strong>1 点</strong><small>灾期单板块增产</small></span>
        </div>
      </section>

      <section
        id="homestead-weather"
        className="homestead-section homestead-panel-item homestead-panel-item--today"
      >
        <div className="homestead-section__heading">
          <div>
            <p className="farm-kicker">WEATHER & RESILIENCE</p>
            <h2>天气、灾害与庄园韧性</h2>
          </div>
          <Tag color={
            !weatherMechanicsEnabled
              ? 'default'
              : homestead.weather.definition.tone === 'warning'
                ? 'orange'
                : homestead.weather.definition.tone === 'good'
                  ? 'green'
                  : 'blue'
          }>
            {homestead.weather.anchorCity ?? activeTown?.definition.name}
            {' · '}{homestead.weather.conditionText ?? homestead.weather.definition.name}
          </Tag>
        </div>
        <p className="homestead-weather-summary">
          {weatherMechanicsEnabled
            ? homestead.weather.definition.description
            : homestead.weather.conditionText ??
              '未取得可信实况，本窗口按中性规则运行。'}
        </p>
        <div className="homestead-weather-live-grid">
          <div>
            <span>数据状态</span>
            <strong>{WEATHER_SOURCE_LABELS[weatherSource]}</strong>
            <small>
              {weatherSource === 'last_known_good'
                ? '最近可信数据，仅展示不参与数值'
                : weatherSource === 'fallback'
                  ? '未取得可信实况，使用中性规则'
                  : '每 8 小时同步一次'}
            </small>
          </div>
          <div>
            <span>气温</span>
            <strong>
              {homestead.weather.temperatureC == null
                ? '—'
                : `${homestead.weather.temperatureC}℃`}
            </strong>
            <small>{homestead.weather.anchorCity ?? '本地规则城市'}</small>
          </div>
          <div>
            <span>湿度 / 降水</span>
            <strong>
              {homestead.weather.humidityPercent == null
                ? '—'
                : `${homestead.weather.humidityPercent}%`}
              {' / '}
              {homestead.weather.precipitationMm == null
                ? '—'
                : `${homestead.weather.precipitationMm} mm`}
            </strong>
            <small>风速 {homestead.weather.windKph == null ? '—' : `${homestead.weather.windKph} km/h`}</small>
          </div>
          <div>
            <span>最近更新</span>
            <strong>{formatWeatherObservedAt(homestead.weather.observedAt)}</strong>
            <small>
              {weatherMechanicsEnabled ? '天气规则已参与生产' : '仅展示，不影响数值'}
            </small>
          </div>
        </div>
        {!weatherMechanicsEnabled && (
          <Alert
            className="homestead-weather-alert"
            type="warning"
            showIcon
            message={
              weatherSource === 'last_known_good'
                ? '实时接口暂不可用，最近可信天气仅作展示'
                : '实时天气暂不可用，已进入中性安全回退'
            }
            description={
              `最近可信天气及安全回退的缓存倍率已中和，不会据此获得天气增益、受到天气惩罚或新建灾害。此前由可信实况预警创建且尚未解决的既有灾害，其后果仍会继续结算，直至完成处置。${
                homestead.weather.fallbackReason
                  ? ` 当前状态：${
                    WEATHER_FALLBACK_REASON_LABELS[
                      homestead.weather.fallbackReason
                    ] ?? homestead.weather.fallbackReason
                  }。`
                  : ''
              }`
            }
          />
        )}
        {weatherSource === 'live' && homestead.weather.alertsAvailable === false && (
          <Alert
            className="homestead-weather-alert"
            type="info"
            showIcon
            message="实时天气已更新，但预警接口暂不可用"
            description="当前天气仍参与生产；本窗口不会依据缺失的预警数据新建灾害。"
          />
        )}
        {homestead.weather.tomorrow ? (
          <Alert
            className="homestead-weather-alert"
            type="info"
            showIcon
            message={`明日本地规则天气：${homestead.weather.tomorrow.name}`}
            description={homestead.weather.tomorrow.description}
          />
        ) : (
          <Alert
            className="homestead-weather-alert"
            type="info"
            showIcon
            message={
              weatherSource === 'live'
                ? '真实天气将在下一个 8 小时窗口重新同步'
                : weatherSource === 'rules'
                  ? '建设一级气象站后可查看明日本地规则天气'
                  : '下一个 8 小时窗口将重新尝试获取可信实况'
            }
            description={
              weatherSource === 'live'
                ? '气象站用于降低天气惩罚；系统不会伪造未来的真实天气。'
                : undefined
            }
          />
        )}
        {homestead.weather.liveHazards?.map((hazard) => (
          <Alert
            key={hazard.id}
            className="homestead-weather-alert"
            type={hazard.affectsGameplay ? 'warning' : 'info'}
            showIcon
            message={`${hazard.name} · ${hazard.severity} 级`}
            description={`${hazard.headline}。${
              hazard.affectsGameplay
                ? homestead.disaster?.eventId === hazard.mechanicId &&
                    homestead.disaster?.mitigated === false
                  ? '该预警已激活为当前庄园灾害。'
                  : '该预警符合灾害规则；已有持续事件时不会覆盖，后续窗口会重新评估。'
                : '当前仅作现实预警展示，不直接修改生产数值。'
            }`}
          />
        ))}
        {homestead.weather.providerAttributions?.length ? (
          <p className="homestead-weather-attribution">
            天气数据：{homestead.weather.providerAttributions.join(' · ')}
          </p>
        ) : null}
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
              `${
                homestead.disaster.contentEventId
                  ? homestead.worldEvent.definition.title
                  : DISASTER_NAMES[homestead.disaster.eventId]
              } · ` +
              `剩余 ${homestead.disaster.remainingDays} 天 · ` +
              `已延误 ${homestead.disaster.unresolvedDays} 天` +
              (
                homestead.disaster.mitigated
                  ? ''
                  : ` · ${formatDisasterReputationImpact(homestead.disaster)}` +
                    (
                      homestead.disaster.temporaryOptionId
                        ? ' · 已执行临时方案，灾害仍继续'
                        : ''
                    )
              )
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
                    工期 {operation.durationBonusPercent}% · 消耗 1 物流点
                  </small>
                  <Button
                    type={operation.canActivate ? 'primary' : 'default'}
                    disabled={actionsBusy || !operation.canActivate || logisticsRemaining < 1}
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
                    {operation.activated
                      ? '已生效'
                      : logisticsRemaining < 1
                        ? '今日物流点不足'
                        : '启动增产 · 1 点'}
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
                    disabled={actionsBusy || !entry.nextUpgrade.canUpgrade}
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

      <section
        id="homestead-world-event"
        className="homestead-section homestead-event homestead-panel-item homestead-panel-item--today"
      >
        <div className="homestead-section__heading">
          <div>
            <p className="farm-kicker">WORLD EVENT</p>
            <h2>{homestead.worldEvent.definition.title}</h2>
          </div>
          <div className="homestead-heading-tags">
            {homestead.worldEvent.parameters?.pacingId === 'two_day_follow_up' && (
              <Tag color="purple">
                {`\u4e24\u65e5\u8ddf\u8fdb \u00b7 \u7b2c ${Math.min(2, homestead.worldEvent.unresolvedDays + 1)}/2 \u65e5`}
              </Tag>
            )}
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
                {`声望 ${option.reputationReward >= 0 ? '+' : ''}${option.reputationReward}`}
                {' '}· 研究 +{option.researchReward}
                {option.coinReward ? ` · 金币 +${option.coinReward}` : ''}
                {option.coinCost ? ` · 花费 ${option.coinCost} 金币` : ''}
              </p>
              <Button
                type="primary"
                disabled={actionsBusy || !option.canChoose}
                loading={busyKey === `event:${option.id}`}
                onClick={() => void act(
                  { type: 'homestead_choose_event', optionId: option.id },
                  `event:${option.id}`,
                  option.resolvesHazard === false
                    ? '临时方案已执行，灾害仍将持续'
                    : '世界事件已经处理',
                )}
              >
                {homestead.worldEvent.selectedOptionId === option.id
                  ? '已选择'
                  : option.temporaryAlreadyUsed
                    ? '本次灾害已用临时方案'
                    : option.missingReputation > 0
                      ? `声望不足（还差 ${option.missingReputation}）`
                      : option.missingCoins > 0
                        ? `金币不足（还差 ${option.missingCoins}）`
                        : option.costsView.some(({ sufficient }) => !sufficient)
                          ? '资源不足'
                          : '选择方案'}
              </Button>
              {option.missingReputation > 0 && (
                <small className="homestead-disabled-reason">
                  该方案需要支付 {Math.max(0, -option.reputationReward)} 声望，
                  当前还差 {option.missingReputation}。
                </small>
              )}
              {option.resolvesHazard === false && (
                <small className="homestead-disabled-reason">
                  {option.temporaryAlreadyUsed
                    ? '本次灾害已执行过临时方案；灾害仍在持续，请改选彻底处置。'
                    : '临时方案不会解除灾害，且每次灾害只能执行一次。'}
                </small>
              )}
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
                    disabled={actionsBusy || !npc.canTalkToday}
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
                    disabled={actionsBusy || !milestone.canClaim}
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

      <section
        id="homestead-research"
        className="homestead-section homestead-panel-item homestead-panel-item--growth"
      >
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
                disabled={actionsBusy || node.unlocked || !node.canUnlock}
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

      <section className="homestead-section homestead-panel-item homestead-panel-item--growth">
        <div className="homestead-section__heading">
          <div>
            <p className="farm-kicker">MERCHANT GUILD</p>
            <h2>庄园商会</h2>
          </div>
          <div className="homestead-heading-tags">
            <Tag color={homestead.merchantShop.recommendationSource === 'llm' ? 'purple' : 'blue'}>
              {homestead.merchantShop.recommendationSource === 'llm'
                ? 'LLM 情境推荐'
                : '规则推荐'}
            </Tag>
            <span>商会名望 {homestead.merchantRenown}</span>
          </div>
        </div>
        <Alert
          className="homestead-weather-alert"
          type="info"
          showIcon
          message="商店只提供有限便利，不出售产量倍增或跳过成长的道具"
          description="限购、库存上限和金币成本共同回收成熟期货币；加速券只缩短一次加工任务的 10%，最多 30 分钟。"
        />
        <div className="homestead-merchant-grid">
          {homestead.merchantShop.items.map((item) => {
            const featureReady = LIVE_MERCHANT_ITEMS.has(item.id);
            const disabledReason = !featureReady
              ? '对应使用功能尚未开放，当前暂停售卖'
              : item.disabledReason;
            return (
              <article key={item.id} className={item.recommended ? 'is-recommended' : undefined}>
                <div className="homestead-card-title">
                  <h3>{item.name}</h3>
                  <div>
                    {item.recommended && <Tag color="purple">顾问推荐</Tag>}
                    <Tag>{item.category === 'cosmetic' ? '收藏' : '便利道具'}</Tag>
                  </div>
                </div>
                <p>{item.description}</p>
                <strong className="homestead-merchant-effect">
                  {merchantEffectLabel(item.numericEffect)}
                </strong>
                <div className="homestead-merchant-stock">
                  <span>持有 {item.owned}/{item.inventoryLimit}</span>
                  <span>本周 {item.purchasedThisWeek}/{item.weeklyPurchaseLimit}</span>
                  <span>名望要求 {item.requiredRenown}</span>
                </div>
                <Button
                  type={featureReady && item.canBuy ? 'primary' : 'default'}
                  disabled={actionsBusy || !featureReady || !item.canBuy}
                  loading={busyKey === `merchant:${item.id}`}
                  onClick={() => void act(
                    {
                      type: 'homestead_buy_merchant_item',
                      itemId: item.id,
                    },
                    `merchant:${item.id}`,
                    `已购买${item.name}`,
                  )}
                >
                  {disabledReason ?? `${item.coinPrice} 金币购买`}
                </Button>
                {disabledReason && (
                  <small className="homestead-disabled-reason">{disabledReason}</small>
                )}
              </article>
            );
          })}
        </div>
        {homestead.travelLogs.length > 0 && (
          <details className="homestead-travel-history">
            <summary>最近跨镇交通记录</summary>
            {homestead.travelLogs.slice(0, 5).map((entry) => (
              <p key={entry.id}>
                <span>{formatWeatherObservedAt(entry.at)}</span>
                <strong>
                  {entry.fromTownId === 'greenvale' ? '青禾镇' : '霜岭镇'}
                  {' → '}
                  {entry.toTownId === 'greenvale' ? '青禾镇' : '霜岭镇'}
                </strong>
                <small>
                  实付 {entry.paidFare} 金币
                  {entry.usedRailPass ? `（联运票，原价 ${entry.baseFare}）` : ''}
                </small>
              </p>
            ))}
          </details>
        )}
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
              disabled={actionsBusy || !fertilizerAvailable}
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
                    actionsBusy ||
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
                    disabled={actionsBusy || !program.canRun}
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
                disabled={
                  actionsBusy ||
                  !homestead.specializations.nextProtectionUpgrade.canUpgrade
                }
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
                    disabled={actionsBusy || !layer.canSurvey}
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

      <section
        id="homestead-processing"
        className="homestead-section homestead-panel-item homestead-panel-item--operations"
      >
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
                  {facility.job?.accelerated && <Tag color="purple">已加速</Tag>}
                  <Tag color={facility.built ? (facility.job ? 'blue' : 'green') : 'default'}>
                    {facility.built ? (facility.job ? '生产中' : '空闲') : '未建设'}
                  </Tag>
                </div>
              </div>
              <FacilityStatus facility={facility} now={now} />
              {!facility.built ? (
                <Button
                  disabled={actionsBusy || !facility.canBuild}
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
                  disabled={actionsBusy}
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
              {facility.job && facility.job.completesAt > now && (
                <>
                  <Popconfirm
                    title={`对${facility.definition.name}使用优先调度券？`}
                    description="本任务缩短原始工期的 10%，最多 30 分钟；每个任务只能使用一次。"
                    okText="确认使用"
                    cancelText="保留道具"
                    disabled={
                      actionsBusy ||
                      accelerationCards < 1 ||
                      Boolean(facility.job.accelerated)
                    }
                    onConfirm={() => void act(
                      {
                        type: 'homestead_use_acceleration_card',
                        facilityId: facility.id,
                      },
                      `accelerate:${facility.id}`,
                      `${facility.definition.name}已完成优先调度`,
                    )}
                  >
                    <Button
                      disabled={
                        actionsBusy ||
                        accelerationCards < 1 ||
                        Boolean(facility.job.accelerated)
                      }
                      loading={busyKey === `accelerate:${facility.id}`}
                    >
                      {facility.job.accelerated
                        ? '本任务已加速'
                        : accelerationCards < 1
                          ? '优先调度券不足'
                          : `使用加速券（持有 ${accelerationCards}）`}
                    </Button>
                  </Popconfirm>
                  {(facility.job.accelerated || accelerationCards < 1) && (
                    <small className="homestead-disabled-reason">
                      {facility.job.accelerated
                        ? '同一加工任务不能重复加速'
                        : '可在庄园商会限量购买'}
                    </small>
                  )}
                </>
              )}
              {facility.built && facility.nextUpgrade && (
                <Button
                  disabled={actionsBusy || !facility.nextUpgrade.canUpgrade}
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
              <p className="homestead-reward">
                运营成本 {recipe.coinCost} 金币
              </p>
              <Button
                type={recipe.canStart ? 'primary' : 'default'}
                disabled={actionsBusy || !recipe.canStart}
                loading={busyKey === `recipe:${recipe.id}`}
                onClick={() => void act(
                  { type: 'homestead_start_job', recipeId: recipe.id },
                  `recipe:${recipe.id}`,
                  `${recipe.name}已经开始`,
                )}
              >
                {actionsBusy
                  ? '其他操作处理中'
                  : !recipe.facilityBuilt
                    ? '设施未建设'
                    : recipe.facilityBusy
                      ? '设施忙碌'
                      : homestead.coins < recipe.coinCost
                        ? '运营金币不足'
                      : recipe.inputsView.some(({ sufficient }) => !sufficient)
                        ? '原料不足'
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
                <div>
                  <Tag color={route.kind === 'public_project' ? 'green' : 'gold'}>
                    {route.kind === 'public_project'
                      ? '公共建设'
                      : route.kind === 'specialty_order'
                        ? '特色订单'
                        : '加工变现'}
                  </Tag>
                  <Tag color={route.stage === 3 ? 'purple' : 'cyan'}>
                    {route.stage === 3 ? '三级商路' : '二级加工'}
                  </Tag>
                </div>
              </div>
              <p>{route.description}</p>
              <ResourceTags resources={route.requirementsView} />
              <p className="homestead-reward">
                {route.coinReward} 金币 · 当地声望 +{route.reputationReward}
                {route.researchReward > 0
                  ? ` · 研究 +${route.researchReward}`
                  : ''}
                {' '}· 物流 {route.logisticsCost} 点
              </p>
              <Button
                type={route.canComplete ? 'primary' : 'default'}
                disabled={
                  actionsBusy ||
                  !route.canComplete
                }
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
                {route.completedToday
                  ? '今日已完成'
                  : route.disabledReason ?? `交付增值项目 · ${route.logisticsCost} 点`}
              </Button>
              {route.disabledReason && !route.completedToday && (
                <small className="homestead-disabled-reason">
                  {route.disabledReason}
                </small>
              )}
            </article>
          ))}
        </div>
      </section>

      <section
        id="homestead-orders"
        className="homestead-section homestead-panel-item homestead-panel-item--operations"
      >
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
                <div>
                  <Tag color="blue">{orderStrategyLabel(order.template)}</Tag>
                  {order.completed && <Tag color="green">已完成</Tag>}
                </div>
              </div>
              <p>{order.template.description}</p>
              <ResourceTags resources={order.requirements} />
              <p className="homestead-reward">
                {order.template.coinReward} 金币 · 声望 +{order.template.reputationReward}
                {' '}· 研究 +{order.template.researchReward} · 物流 {order.logisticsCost} 点
              </p>
              <Button
                type={order.canComplete ? 'primary' : 'default'}
                disabled={actionsBusy || !order.canComplete}
                loading={busyKey === `order:${order.id}`}
                onClick={() => void act(
                  { type: 'homestead_complete_order', orderId: order.id },
                  `order:${order.id}`,
                  '联合订单完成',
                )}
              >
                {order.completed
                  ? '已交付'
                  : order.disabledReason ?? `交付订单 · ${order.logisticsCost} 点`}
              </Button>
              {order.disabledReason && !order.completed && (
                <small className="homestead-disabled-reason">
                  {order.disabledReason}
                </small>
              )}
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
