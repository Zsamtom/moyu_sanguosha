import { Alert, Button, Card, Empty, Spin, Tag, message } from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '../api';
import type {
  EstateTownId,
  RestaurantClientAction,
  RestaurantIngredientId,
  RestaurantProcessingId,
  RestaurantRecipeId,
  RestaurantShopItemId,
  RestaurantSnapshot,
  RestaurantTechniqueId,
} from '../types';
import '../restaurant.css';

const TOWN_NAMES: Record<EstateTownId, string> = {
  greenvale: '青禾镇',
  frostpeak: '霜岭镇',
};

const INGREDIENT_NAMES: Record<RestaurantIngredientId, string> = {
  wheat: '小麦', rice: '稻谷', soybean: '大豆', tomato: '番茄', carrot: '胡萝卜',
  green_pepper: '青椒', cucumber: '黄瓜', onion: '洋葱', garlic: '大蒜', pumpkin: '南瓜',
  strawberry: '草莓', cloudberry: '云莓', snow_potato: '雪薯', ice_lettuce: '冰叶菜',
  alpine_herb: '高山药草', mountain_mushroom: '山地菌菇', egg: '鸡蛋', duck_egg: '鸭蛋',
  snow_cabbage: '雪地卷心菜', frost_onion: '霜地洋葱', alpine_pepper: '高山青椒',
  milk: '牛奶', goat_milk: '羊奶', yak_milk: '牦牛奶', raw_chicken: '整鸡原料',
  raw_pork: '猪肉原料', flour: '面粉', polished_rice: '精米', tofu: '豆腐',
  chicken_meat: '鸡肉', pork_slices: '猪肉片', butter: '黄油', mineral_salt: '精盐',
  soy_sauce: '酱油', vinegar: '香醋', sugar: '砂糖', pepper: '胡椒',
  freshwater_fish: '鲜鱼', snow_crab: '雪蟹', rare_mushroom: '珍稀菌菇',
};

const TECHNIQUES: Array<{
  id: RestaurantTechniqueId;
  name: string;
  townId: EstateTownId;
  detail: string;
  coinCost: number;
  requiredReputation: number;
  reputationCost: number;
}> = [
  { id: 'knife_basics', name: '基础刀工', townId: 'greenvale', detail: '餐厅的基础技法', coinCost: 0, requiredReputation: 0, reputationCost: 0 },
  { id: 'grain_milling', name: '谷物精制', townId: 'greenvale', detail: '加工面粉、精米与豆腐', coinCost: 120, requiredReputation: 5, reputationCost: 1 },
  { id: 'butchery', name: '肉类分割', townId: 'greenvale', detail: '把整鸡和猪肉原料加工为可烹饪肉类', coinCost: 240, requiredReputation: 15, reputationCost: 2 },
  { id: 'sauce_craft', name: '调味技法', townId: 'greenvale', detail: '解锁调味与乳制品加工', coinCost: 300, requiredReputation: 20, reputationCost: 2 },
  { id: 'cold_chain', name: '跨镇冷链', townId: 'frostpeak', detail: '使用霜岭食材制作跨镇菜品', coinCost: 420, requiredReputation: 25, reputationCost: 3 },
  { id: 'pastry', name: '烘焙技法', townId: 'frostpeak', detail: '制作高级面点与甜品', coinCost: 600, requiredReputation: 35, reputationCost: 4 },
];

const PROCESSING: Array<{
  id: RestaurantProcessingId;
  name: string;
  input: string;
}> = [
  { id: 'mill_wheat', name: '研磨面粉', input: '小麦×2 → 面粉×2' },
  { id: 'polish_rice', name: '碾制精米', input: '稻谷×2 → 精米×2' },
  { id: 'make_tofu', name: '制作豆腐', input: '大豆×2 → 豆腐×2' },
  { id: 'butcher_chicken', name: '分割鸡肉', input: '整鸡原料×1 → 鸡肉×3' },
  { id: 'butcher_pork', name: '分割猪肉', input: '猪肉原料×1 → 猪肉片×4' },
  { id: 'churn_butter', name: '搅制黄油', input: '牛奶×2 → 黄油×1' },
];

const RECIPES: Array<{
  id: RestaurantRecipeId;
  name: string;
  townId: EstateTownId;
  ingredients: string;
  coinCost: number;
  requiredReputation: number;
  reputationCost: number;
}> = [
  { id: 'tomato_carrot_salad', name: '番茄胡萝卜沙拉', townId: 'greenvale', ingredients: '番茄、胡萝卜、精盐', coinCost: 0, requiredReputation: 0, reputationCost: 0 },
  { id: 'cucumber_garlic_salad', name: '蒜香黄瓜', townId: 'greenvale', ingredients: '黄瓜、大蒜、香醋', coinCost: 60, requiredReputation: 4, reputationCost: 0 },
  { id: 'green_pepper_egg', name: '青椒炒蛋', townId: 'greenvale', ingredients: '青椒、鸡蛋、酱油', coinCost: 100, requiredReputation: 8, reputationCost: 1 },
  { id: 'pumpkin_milk_soup', name: '南瓜奶汤', townId: 'greenvale', ingredients: '南瓜、牛奶、精盐', coinCost: 150, requiredReputation: 12, reputationCost: 1 },
  { id: 'duck_egg_tofu', name: '鸭蛋蒸豆腐', townId: 'greenvale', ingredients: '鸭蛋、豆腐、酱油', coinCost: 190, requiredReputation: 15, reputationCost: 1 },
  { id: 'strawberry_goat_pudding', name: '草莓羊乳布丁', townId: 'greenvale', ingredients: '草莓、羊奶、砂糖', coinCost: 280, requiredReputation: 21, reputationCost: 2 },
  { id: 'tofu_vegetable_pot', name: '田园豆腐煲', townId: 'greenvale', ingredients: '豆腐、番茄、洋葱、酱油', coinCost: 180, requiredReputation: 14, reputationCost: 1 },
  { id: 'river_fish_soup', name: '河鲜香草汤', townId: 'greenvale', ingredients: '鲜鱼、洋葱、高山药草、精盐', coinCost: 320, requiredReputation: 22, reputationCost: 2 },
  { id: 'farmhouse_bread', name: '农庄面包', townId: 'greenvale', ingredients: '面粉、黄油、砂糖', coinCost: 160, requiredReputation: 12, reputationCost: 1 },
  { id: 'chicken_skewer', name: '青椒鸡肉串', townId: 'greenvale', ingredients: '鸡肉、青椒、酱油', coinCost: 260, requiredReputation: 18, reputationCost: 2 },
  { id: 'pork_rice_bowl', name: '猪肉盖饭', townId: 'greenvale', ingredients: '猪肉片、精米、酱油', coinCost: 360, requiredReputation: 25, reputationCost: 3 },
  { id: 'frost_berry_tart', name: '霜岭云莓挞', townId: 'frostpeak', ingredients: '云莓、面粉、黄油、砂糖', coinCost: 520, requiredReputation: 35, reputationCost: 4 },
  { id: 'yak_milk_stew', name: '牦牛奶雪薯炖菜', townId: 'frostpeak', ingredients: '牦牛奶、雪薯、高山青椒、胡椒', coinCost: 480, requiredReputation: 32, reputationCost: 3 },
  { id: 'mountain_mushroom_grill', name: '高山香草烤菌', townId: 'frostpeak', ingredients: '山地菌菇、高山药草、黄油、精盐', coinCost: 390, requiredReputation: 27, reputationCost: 3 },
  { id: 'snow_crab_salad', name: '雪蟹冰叶沙拉', townId: 'frostpeak', ingredients: '雪蟹、冰叶菜、雪地卷心菜、香醋', coinCost: 560, requiredReputation: 38, reputationCost: 4 },
  { id: 'rare_mushroom_stew', name: '珍菌雪薯浓汤', townId: 'frostpeak', ingredients: '珍稀菌菇、雪薯、霜地洋葱、牛奶、胡椒', coinCost: 500, requiredReputation: 34, reputationCost: 3 },
];

const SHOP: Record<RestaurantShopItemId, {
  name: string;
  townId: EstateTownId;
  price: number;
  reputation: number;
  reputationCost: number;
  result: string;
}> = {
  mineral_salt_pack: { name: '精盐包', townId: 'greenvale', price: 24, reputation: 0, reputationCost: 0, result: '精盐×4' },
  soy_sauce_pack: { name: '酱油坛', townId: 'greenvale', price: 36, reputation: 5, reputationCost: 0, result: '酱油×3' },
  vinegar_pack: { name: '香醋坛', townId: 'greenvale', price: 32, reputation: 8, reputationCost: 0, result: '香醋×3' },
  sugar_pack: { name: '砂糖包', townId: 'greenvale', price: 40, reputation: 10, reputationCost: 0, result: '砂糖×3' },
  butter_pack: { name: '黄油块', townId: 'greenvale', price: 56, reputation: 12, reputationCost: 0, result: '黄油×2' },
  pepper_pack: { name: '高原胡椒', townId: 'frostpeak', price: 52, reputation: 10, reputationCost: 0, result: '胡椒×3' },
  freshwater_fish_crate: { name: '河鲜箱', townId: 'greenvale', price: 90, reputation: 20, reputationCost: 1, result: '鲜鱼×2' },
  snow_crab_crate: { name: '雪蟹箱', townId: 'frostpeak', price: 130, reputation: 28, reputationCost: 2, result: '雪蟹×2' },
  rare_mushroom_basket: { name: '珍稀菌菇篮', townId: 'frostpeak', price: 110, reputation: 22, reputationCost: 1, result: '珍稀菌菇×2' },
};

function sourceName(source: 'farm' | 'ranch' | 'goods'): string {
  return source === 'farm' ? '农场' : source === 'ranch' ? '牧场' : '庄园加工';
}

export function RestaurantScreen() {
  const [toast, toastContext] = message.useMessage();
  const [snapshot, setSnapshot] = useState<RestaurantSnapshot>();
  const [failure, setFailure] = useState<string>();
  const [busyKey, setBusyKey] = useState<string>();

  const load = useCallback(async () => {
    try {
      setFailure(undefined);
      setSnapshot(await api.getRestaurant());
    } catch (error) {
      setFailure(errorMessage(error));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const act = useCallback(async (
    action: RestaurantClientAction,
    key: string,
    success: string,
  ) => {
    if (!snapshot || busyKey) return;
    setBusyKey(key);
    try {
      const next = await api.applyRestaurantAction(snapshot, action);
      setSnapshot(next);
      setFailure(undefined);
      void toast.success(success);
    } catch (error) {
      setFailure(errorMessage(error));
    } finally {
      setBusyKey(undefined);
    }
  }, [busyKey, snapshot, toast]);

  const inventoryEntries = useMemo(() => snapshot
    ? Object.entries(snapshot.restaurant.inventory)
      .filter((entry): entry is [RestaurantIngredientId, number] => entry[1] > 0)
    : [], [snapshot]);

  if (!snapshot && !failure) return <div className="restaurant-loading"><Spin size="large" /></div>;
  if (!snapshot) return <Alert type="error" showIcon message="餐厅加载失败" description={failure} action={<Button onClick={() => void load()}>重试</Button>} />;

  const game = snapshot.restaurant;
  const usedCapacity = Object.values(game.inventory).reduce((sum, value) => sum + value, 0);
  const service = game.service?.status === 'serving' ? game.service : null;
  const unlockedTownIds = new Set(snapshot.supplySources.map(({ townId }) => townId));

  return (
    <main className="restaurant-page">
      {toastContext}
      <header className="restaurant-hero">
        <div>
          <p className="restaurant-kicker">CROSS-TOWN RESTAURANT</p>
          <h1>跨镇食堂</h1>
          <p>从不同城镇调配农牧食材，加工原料、研发菜谱并完成每日营业。</p>
        </div>
        <div className="restaurant-metrics">
          <span><strong>Lv.{game.level}</strong>餐厅等级</span>
          <span><strong>{snapshot.coins}</strong>金币</span>
          <span><strong>{usedCapacity}/{game.warehouseCapacity}</strong>仓库</span>
          <span><strong>{game.statistics.customersServed}</strong>累计上菜</span>
          <Button onClick={() => void load()} loading={busyKey === 'refresh'}>刷新</Button>
        </div>
      </header>

      {failure && <Alert closable onClose={() => setFailure(undefined)} type="error" showIcon message={failure} />}

      <section className="restaurant-section">
        <div className="restaurant-section-heading">
          <div><p className="restaurant-kicker">SUPPLY</p><h2>跨镇供货</h2></div>
          <div className="restaurant-reputation">
            {Object.entries(snapshot.localReputation).map(([townId, value]) => (
              <Tag key={townId}>{TOWN_NAMES[townId as EstateTownId]}声望 {value}</Tag>
            ))}
          </div>
        </div>
        <Alert type="info" showIcon message="餐厅只有一份全局仓库" description="每次从一个城镇原子扣除真实库存；两镇货物到仓后可以混合用于同一道菜。" />
        <div className="restaurant-town-grid">
          {snapshot.supplySources.map((town) => (
            <Card key={town.townId} title={TOWN_NAMES[town.townId]} size="small">
              <div className="restaurant-list">
                {town.lines.filter((line) => line.quantity > 0).map((line) => (
                  <div className="restaurant-row" key={`${line.source}:${line.itemId}`}>
                    <span><Tag>{sourceName(line.source)}</Tag>{INGREDIENT_NAMES[line.ingredientId]} · 库存 {line.quantity}</span>
                    <Button
                      size="small"
                      loading={busyKey === `supply:${town.townId}:${line.source}:${line.itemId}`}
                      disabled={Boolean(busyKey)}
                      onClick={async () => {
                        const key = `supply:${town.townId}:${line.source}:${line.itemId}`;
                        setBusyKey(key);
                        try {
                          const next = await api.supplyRestaurantFromTown(snapshot, {
                            type: 'restaurant_supply_from_town',
                            sourceTownId: town.townId,
                            lines: [{ source: line.source, itemId: line.itemId, quantity: 1 }],
                          });
                          setSnapshot(next);
                          setFailure(undefined);
                          void toast.success(`已从${TOWN_NAMES[town.townId]}发出 ${INGREDIENT_NAMES[line.ingredientId]}`);
                        } catch (error) {
                          setFailure(errorMessage(error));
                        } finally {
                          setBusyKey(undefined);
                        }
                      }}
                    >发货 1</Button>
                  </div>
                ))}
                {town.lines.every((line) => line.quantity <= 0) && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无可发食材" />}
              </div>
            </Card>
          ))}
        </div>
        {game.shipments.filter((item) => item.status === 'in_transit').map((shipment) => {
          const ready = shipment.arrivesAt <= Date.now();
          return (
            <div className="restaurant-shipment" key={shipment.id}>
              <span>{TOWN_NAMES[shipment.sourceTownId]}运输单 · {shipment.manifest.map((item) => `${INGREDIENT_NAMES[item.ingredientId]}×${item.quantity}`).join('、')}</span>
              <Button
                size="small"
                disabled={!ready || Boolean(busyKey)}
                loading={busyKey === `shipment:${shipment.id}`}
                onClick={() => void act({ type: 'restaurant_collect_supply', shipmentId: shipment.id }, `shipment:${shipment.id}`, '食材已收入餐厅仓库')}
              >{ready ? '收货' : '运输中'}</Button>
            </div>
          );
        })}
      </section>

      <section className="restaurant-section">
        <div className="restaurant-section-heading"><div><p className="restaurant-kicker">PANTRY</p><h2>食材仓与加工</h2></div></div>
        <div className="restaurant-inventory">
          {inventoryEntries.map(([id, quantity]) => <Tag key={id}>{INGREDIENT_NAMES[id]} × {quantity}</Tag>)}
          {inventoryEntries.length === 0 && <span>仓库暂时为空</span>}
        </div>
        <div className="restaurant-card-grid">
          {PROCESSING.map((item) => (
            <Card key={item.id} title={item.name} size="small">
              <p>{item.input}</p>
              <Button
                disabled={Boolean(busyKey)}
                loading={busyKey === `processing:${item.id}`}
                onClick={() => void act({ type: 'restaurant_start_processing', processingId: item.id, quantity: 1 }, `processing:${item.id}`, `已开始${item.name}`)}
              >加工 1 批</Button>
            </Card>
          ))}
        </div>
        {game.processingJobs.filter((job) => !job.collected).map((job) => {
          const ready = job.completesAt <= Date.now();
          const definition = PROCESSING.find((item) => item.id === job.processingId);
          return (
            <div className="restaurant-shipment" key={job.id}>
              <span>{definition?.name ?? job.processingId} · {job.quantity} 批</span>
              <Button
                size="small"
                disabled={!ready || Boolean(busyKey)}
                loading={busyKey === `job:${job.id}`}
                onClick={() => void act({ type: 'restaurant_collect_processing', jobId: job.id }, `job:${job.id}`, '加工成品已入库')}
              >{ready ? '领取' : '加工中'}</Button>
            </div>
          );
        })}
      </section>

      <section className="restaurant-section">
        <div className="restaurant-section-heading"><div><p className="restaurant-kicker">MARKET</p><h2>餐厅专属商店</h2></div></div>
        <div className="restaurant-card-grid">
          {game.shop.offers.map((offer) => {
            const item = SHOP[offer.itemId];
            const eligible = snapshot.localReputation[item.townId] >= item.reputation;
            return (
              <Card key={offer.itemId} title={item.name} size="small">
                <p>{item.result} · {TOWN_NAMES[item.townId]}供货</p>
                <p>金币 {item.price} · 当地声望要求 {item.reputation} · 声望消耗 {item.reputationCost} · 今日余量 {offer.remaining}</p>
                <Button
                  disabled={!eligible || offer.remaining <= 0 || Boolean(busyKey)}
                  loading={busyKey === `shop:${offer.itemId}`}
                  onClick={() => void act({ type: 'restaurant_buy_shop_item', itemId: offer.itemId, quantity: 1 }, `shop:${offer.itemId}`, `已购买${item.name}`)}
                >{eligible ? '购买' : '当地声望不足'}</Button>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="restaurant-section">
        <div className="restaurant-section-heading"><div><p className="restaurant-kicker">RESEARCH</p><h2>技法与菜谱</h2></div></div>
        <h3>烹饪技法</h3>
        <div className="restaurant-card-grid">
          {TECHNIQUES.map((item) => {
            const unlocked = game.unlockedTechniqueIds.includes(item.id);
            return (
              <Card key={item.id} title={item.name} extra={<Tag>{TOWN_NAMES[item.townId]}</Tag>} size="small">
                <p>{item.detail}</p>
                <p>金币 {item.coinCost} · 声望门槛 {item.requiredReputation} · 学习消耗 {item.reputationCost}</p>
                <Button
                  disabled={unlocked || !unlockedTownIds.has(item.townId) || Boolean(busyKey)}
                  loading={busyKey === `technique:${item.id}`}
                  onClick={() => void act({ type: 'restaurant_learn_technique', techniqueId: item.id, sponsorTownId: item.townId }, `technique:${item.id}`, `已掌握${item.name}`)}
                >{unlocked ? '已掌握' : '学习'}</Button>
              </Card>
            );
          })}
        </div>
        <h3>菜谱</h3>
        <div className="restaurant-card-grid">
          {RECIPES.map((recipe) => {
            const unlocked = game.unlockedRecipeIds.includes(recipe.id);
            const onMenu = game.menu.includes(recipe.id);
            const prepared = game.preparedDishes[recipe.id] ?? 0;
            return (
              <Card key={recipe.id} title={recipe.name} extra={<Tag>{TOWN_NAMES[recipe.townId]}</Tag>} size="small">
                <p>{recipe.ingredients}</p>
                <p>解锁 {recipe.coinCost} 金币 · 声望门槛 {recipe.requiredReputation} · 消耗 {recipe.reputationCost}</p>
                <p>备菜 {prepared} 份</p>
                <div className="restaurant-actions">
                  <Button
                    size="small"
                    disabled={unlocked || !unlockedTownIds.has(recipe.townId) || Boolean(busyKey)}
                    onClick={() => void act({ type: 'restaurant_unlock_recipe', recipeId: recipe.id, sponsorTownId: recipe.townId }, `recipe:${recipe.id}`, `已解锁${recipe.name}`)}
                  >{unlocked ? '已解锁' : '解锁'}</Button>
                  <Button
                    size="small"
                    disabled={!unlocked || Boolean(busyKey)}
                    onClick={() => void act({ type: 'restaurant_prepare_dish', recipeId: recipe.id, quantity: 1 }, `prepare:${recipe.id}`, `已完成${recipe.name}备菜`)}
                  >备菜</Button>
                  <Button
                    size="small"
                    type={onMenu ? 'primary' : 'default'}
                    disabled={!unlocked || Boolean(service) || (!onMenu && game.menu.length >= game.menuSlots) || Boolean(busyKey)}
                    onClick={() => void act({
                      type: 'restaurant_set_menu',
                      recipeIds: onMenu ? game.menu.filter((id) => id !== recipe.id) : [...game.menu, recipe.id],
                    }, `menu:${recipe.id}`, onMenu ? '已从菜单移除' : '已加入今日菜单')}
                  >{onMenu ? '已上菜单' : '加入菜单'}</Button>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="restaurant-section restaurant-service">
        <div className="restaurant-section-heading">
          <div><p className="restaurant-kicker">SERVICE</p><h2>营业与上菜</h2></div>
          <Tag color={service ? 'green' : 'default'}>{service ? `${TOWN_NAMES[service.townId]}营业中` : '未营业'}</Tag>
        </div>
        {!service ? (
          <div className="restaurant-actions">
            {snapshot.supplySources.map(({ townId }) => (
              <Button
                key={townId}
                type="primary"
                disabled={game.menu.length === 0 || Boolean(busyKey)}
                onClick={() => void act({ type: 'restaurant_open_service', serviceTownId: townId }, `open:${townId}`, `已在${TOWN_NAMES[townId]}开店`)}
              >在{TOWN_NAMES[townId]}开店</Button>
            ))}
          </div>
        ) : (
          <>
            <div className="restaurant-order-grid">
              {service.orders.map((order) => {
                const recipe = RECIPES.find((item) => item.id === order.recipeId);
                return (
                  <Card key={order.id} title={recipe?.name ?? order.recipeId} size="small">
                    <p>奖励 {order.coinReward} 金币 / {order.localReputationReward} 当地声望</p>
                    <Button
                      type="primary"
                      disabled={order.status !== 'pending' || Boolean(busyKey)}
                      loading={busyKey === `order:${order.id}`}
                      onClick={() => void act({ type: 'restaurant_serve_order', orderId: order.id }, `order:${order.id}`, '上菜成功')}
                    >{order.status === 'pending' ? '上菜' : order.status === 'served' ? '已上菜' : '已过期'}</Button>
                  </Card>
                );
              })}
            </div>
            <Button danger disabled={Boolean(busyKey)} onClick={() => void act({ type: 'restaurant_close_service' }, 'close', '本次营业已结算')}>结束营业</Button>
          </>
        )}
      </section>

      <section className="restaurant-section">
        <div className="restaurant-section-heading"><div><p className="restaurant-kicker">LOG</p><h2>经营记录</h2></div></div>
        <div className="restaurant-log">
          {game.logs.slice(0, 12).map((log) => <p key={log.id}>{new Date(log.at).toLocaleString('zh-CN')} · {log.text}</p>)}
        </div>
      </section>
    </main>
  );
}
