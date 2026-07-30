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
  return (
    <>
      <Progress
        percent={Math.round(facility.progress * 100)}
        size="small"
        status={facility.ready ? 'success' : 'active'}
      />
      <span>
        {facility.ready
          ? '生产完成'
          : `剩余 ${formatHomesteadDuration(facility.job.completesAt - now)}`}
      </span>
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
  const [toast, toastContext] = message.useMessage();

  const load = async (quiet = false) => {
    if (quiet) setQuietLoading(true);
    else setLoading(true);
    try {
      setSnapshot(await api.getHomestead());
      setFailure(undefined);
      setNow(Date.now());
    } catch (error) {
      setFailure(errorMessage(error));
    } finally {
      setLoading(false);
      setQuietLoading(false);
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
  return (
    <main className="farm-page homestead-page">
      {toastContext}
      <header className="farm-hero homestead-hero">
        <div>
          <p className="farm-kicker">THREE-SECTOR ESTATE</p>
          <h1>三业庄园总览</h1>
          <p>
            用农作物、牧场产品和矿石建立加工链，完成联合订单并推动庄园研究。
          </p>
        </div>
        <div className="homestead-metrics">
          <div><strong>{homestead.coins}</strong><span>金币</span></div>
          <div><strong>{homestead.reputation}</strong><span>庄园声望</span></div>
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

      <section className="homestead-section homestead-advice">
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

      <section className="homestead-section homestead-event">
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
              <p className="homestead-reward">
                声望 +{option.reputationReward} · 研究 +{option.researchReward}
                {option.coinReward ? ` · 金币 +${option.coinReward}` : ''}
                {option.coinCost ? ` · 花费 ${option.coinCost} 金币` : ''}
              </p>
              <Button
                type="primary"
                disabled={homestead.worldEvent.selectedOptionId !== null}
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

      <section className="homestead-section">
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
                        <strong>{TOPIC_NAMES[fact.key] ?? fact.key}</strong>
                        {fact.value}
                      </p>
                    ))
                  : <p>尚无长期记忆</p>}
              </details>
            </article>
          ))}
        </div>
      </section>

      <section className="homestead-section">
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
                    {milestone.claimed ? '已领取' : '领取奖励'}
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

      <section className="homestead-section">
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

      <section className="homestead-section">
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

      <section className="homestead-section">
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
              ) : facility.job && facility.ready ? (
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

      <section className="homestead-section">
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

      <section className="homestead-section">
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

      <section className="homestead-section">
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
