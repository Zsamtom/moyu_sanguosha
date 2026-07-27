import { Button, Popconfirm } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import type {
  AnyGameAction,
  SplendorCard,
  SplendorCardLevel,
  SplendorColor,
  SplendorGameView,
  SplendorNoble,
  SplendorResourceMap,
} from '../types';

interface SplendorBoardProps {
  game: SplendorGameView;
  userId: string;
  connected: boolean;
  onAction: (action: AnyGameAction) => Promise<void>;
  onExit: () => Promise<void>;
}

const CLASSIC_COLORS: SplendorColor[] = ['white', 'blue', 'green', 'red', 'black', 'gold'];
const POKEMON_COLORS: SplendorColor[] = ['red', 'blue', 'black', 'pink', 'yellow', 'purple'];
const COLOR_LABELS: Record<SplendorColor, string> = {
  white: '钻石',
  blue: '蓝宝石',
  green: '祖母绿',
  red: '红宝石',
  black: '玛瑙',
  gold: '黄金',
  pink: '治愈球',
  yellow: '电气球',
  purple: '大师球',
};
const POKEMON_COLOR_LABELS: Partial<Record<SplendorColor, string>> = {
  red: '精灵球',
  blue: '超级球',
  black: '高级球',
  pink: '治愈球',
  yellow: '快速球',
  purple: '大师球',
};
const POKEMON_SPRITES: Record<string, number> = {
  小火龙: 4, 火球鼠: 155, 火稚鸡: 255, 小火猴: 390, 卡蒂狗: 58, 六尾: 37,
  杰尼龟: 7, 小锯鳄: 158, 水跃鱼: 258, 波加曼: 393, 鲤鱼王: 129, 可达鸭: 54,
  妙蛙种子: 1, 菊草叶: 152, 木守宫: 252, 草苗龟: 387, 走路草: 43,
  皮卡丘: 25, 咩利羊: 179, 电击怪: 239, 落雷兽: 309,
  伊布: 133, 胖丁: 39, 皮皮: 35, 吉利蛋: 113, 波克比: 175,
  腕力: 66, 小拳石: 74, 猴怪: 56, 凯西: 63, 拉鲁拉丝: 280, 鬼斯: 92,
  狃拉: 215, 小磁怪: 81, 独角犀牛: 111, 穿山鼠: 27, 迷你龙: 147,
  宝贝龙: 371, 绿毛虫: 10, 独角虫: 13, 飞天螳螂: 123,
  火恐龙: 5, 火岩鼠: 156, 力壮鸡: 256, 猛火猴: 391, 风速狗: 59, 九尾: 38,
  卡咪龟: 8, 蓝鳄: 159, 沼跃鱼: 259, 波皇子: 394, 暴鲤龙: 130, 哥达鸭: 55,
  妙蛙草: 2, 月桂叶: 153, 森林蜥蜴: 253, 树林龟: 388, 雷丘: 26,
  茸茸羊: 180, 电击兽: 125, 豪力: 67, 隆隆石: 75, 勇基拉: 64,
  奇鲁莉安: 281, 鬼斯通: 93, 三合一磁怪: 82, 哈克龙: 148, 甲壳龙: 372,
  铁甲蛹: 11, 大针蜂: 15, 喷火龙: 6, 水箭龟: 9, 妙蛙花: 3,
  怪力: 68, 胡地: 65, 耿鬼: 94, 快龙: 149, 暴飞龙: 373, 沙奈朵: 282,
  隆隆岩: 76, 火焰鸟: 146, 急冻鸟: 144, 闪电鸟: 145, 卡比兽: 143,
  拉普拉斯: 131, 超梦: 150, 梦幻: 151, 洛奇亚: 249, 凤王: 250, 烈空坐: 384,
};

function countResources(resources: SplendorResourceMap): number {
  return Object.values(resources).reduce((total, value) => total + (value ?? 0), 0);
}

export function splendorResourceLabel(color: SplendorColor, pokemon: boolean): string {
  return pokemon ? POKEMON_COLOR_LABELS[color] ?? COLOR_LABELS[color] : COLOR_LABELS[color];
}

export function splendorCardDisplayName(card: SplendorCard, pokemon: boolean): string {
  return pokemon ? card.name : `${COLOR_LABELS[card.bonus]}工坊`;
}

export function shouldShowNobleGallery(nobles: readonly SplendorNoble[]): boolean {
  return nobles.length > 0;
}

function Resource({
  color,
  count,
  pokemon,
  compact = false,
}: {
  color: SplendorColor;
  count: number;
  pokemon: boolean;
  compact?: boolean;
}) {
  const label = splendorResourceLabel(color, pokemon);
  return (
    <span
      className={`splendor-resource splendor-resource--${color}${pokemon ? ' splendor-resource--ball' : ''}${compact ? ' splendor-resource--compact' : ''}`}
      title={`${label} ${count}`}
      aria-label={`${label} ${count}`}
    >
      <i aria-hidden="true" />
      <b>{count}</b>
    </span>
  );
}

function ResourceList({
  resources,
  colors,
  pokemon,
  compact,
}: {
  resources: SplendorResourceMap;
  colors: SplendorColor[];
  pokemon: boolean;
  compact?: boolean;
}) {
  return (
    <span className="splendor-resources">
      {colors.filter((color) => (resources[color] ?? 0) > 0).map((color) => (
        <Resource key={color} color={color} count={resources[color] ?? 0} pokemon={pokemon} compact={compact} />
      ))}
    </span>
  );
}

export function pokemonSprite(name: string): string | undefined {
  const number = POKEMON_SPRITES[name];
  return number ? `/assets/splendor-pokemon/pokemon/${number}.png` : undefined;
}

function levelLabel(level: SplendorCardLevel, pokemon: boolean): string {
  if (level === 'rare') return pokemon ? '稀有' : '贵重';
  if (level === 'legendary') return pokemon ? '传说' : '珍藏';
  return pokemon ? `Lv.${level}` : `第 ${level} 阶`;
}

function DevelopmentCard({
  card,
  pokemon,
  colors,
  canBuy,
  canReserve,
  disabled,
  onBuy,
  onReserve,
  compact = false,
}: {
  card: SplendorCard;
  pokemon: boolean;
  colors: SplendorColor[];
  canBuy?: boolean;
  canReserve?: boolean;
  disabled?: boolean;
  onBuy?: () => void;
  onReserve?: () => void;
  compact?: boolean;
}) {
  const sprite = pokemon ? pokemonSprite(card.name) : undefined;
  const displayName = splendorCardDisplayName(card, pokemon);
  return (
    <article className={`splendor-card splendor-card--${String(card.level)} splendor-card--${card.bonus}${compact ? ' splendor-card--compact' : ''}`}>
      <div className="splendor-card__top">
        <span className="splendor-card__level">{levelLabel(card.level, pokemon)}</span>
        <strong className="splendor-card__points">{card.points}<small>声望</small></strong>
      </div>
      {sprite ? (
        <div className="splendor-card__art">
          <img src={sprite} alt={displayName} loading="lazy" />
        </div>
      ) : (
        <div className="splendor-card__crest" aria-hidden="true"><i /></div>
      )}
      <div className="splendor-card__body">
        <strong>{displayName}</strong>
        {pokemon && card.evolutionOf && (
          <div className="splendor-card__evolution">
            <span>由 {card.evolutionOf} 进化</span>
            {card.evolutionReq && (
              <span>
                <small>进化需求</small>
                <ResourceList resources={card.evolutionReq} colors={colors} pokemon compact />
              </span>
            )}
          </div>
        )}
        <div className="splendor-card__economy">
          <Resource color={card.bonus} count={card.bonusCount} pokemon={pokemon} compact />
          <ResourceList resources={card.cost} colors={colors} pokemon={pokemon} compact />
        </div>
      </div>
      {(onBuy || onReserve) && (
        <div className="splendor-card__actions">
          {onBuy && <Button size="small" type="primary" disabled={disabled || !canBuy} onClick={onBuy}>购买</Button>}
          {onReserve && <Button size="small" disabled={disabled || !canReserve} onClick={onReserve}>预留</Button>}
        </div>
      )}
    </article>
  );
}

function NobleTile({ noble, colors, pokemon }: { noble: SplendorNoble; colors: SplendorColor[]; pokemon: boolean }) {
  return (
    <article className="splendor-noble">
      <span>{pokemon ? '荣耀徽章' : '贵族莅临'}</span>
      <strong>{noble.points} <small>声望</small></strong>
      <ResourceList resources={noble.requirement} colors={colors} pokemon={pokemon} compact />
    </article>
  );
}

export function SplendorBoard({ game, userId, connected, onAction, onExit }: SplendorBoardProps) {
  const pokemon = game.kind === 'splendor_pokemon';
  const colors = pokemon ? POKEMON_COLORS : CLASSIC_COLORS;
  const self = game.players.find((player) => player.id === userId);
  const promptIsMine = game.prompt.playerId === userId;
  const canAct = connected && game.status === 'playing' && promptIsMine;
  const [busy, setBusy] = useState(false);
  const [returnColors, setReturnColors] = useState<SplendorColor[]>([]);

  useEffect(() => {
    setReturnColors([]);
    setBusy(false);
  }, [game.actionPromptId]);

  const allCards = useMemo(() => [
    ...Object.values(game.market).flat(),
    ...game.players.flatMap((player) => [...player.cards, ...player.evolvedCards]),
    ...(self?.reservedCards ?? []),
  ], [game.market, game.players, self?.reservedCards]);
  const cardById = useMemo(() => new Map(allCards.map((card) => [card.id, card])), [allCards]);
  const mainPrompt = game.prompt.type === 'take' || game.prompt.type === 'buy' || game.prompt.type === 'reserve'
    ? game.prompt
    : null;
  const returnPrompt = game.prompt.type === 'return' ? game.prompt : null;
  const orderedLevels: SplendorCardLevel[] = pokemon
    ? ['legendary', 'rare', 3, 2, 1]
    : [3, 2, 1];

  const submit = async (action: AnyGameAction) => {
    if (busy) return;
    setBusy(true);
    try {
      await onAction(action);
    } finally {
      setBusy(false);
    }
  };

  const addReturnColor = (color: SplendorColor) => {
    if (game.prompt.type !== 'return' || returnColors.length >= game.prompt.count) return;
    const alreadySelected = returnColors.filter((candidate) => candidate === color).length;
    if (alreadySelected < (game.prompt.available[color] ?? 0)) {
      setReturnColors((current) => [...current, color]);
    }
  };
  const removeReturnColor = (color: SplendorColor) => {
    const index = returnColors.lastIndexOf(color);
    if (index < 0) return;
    setReturnColors((current) => current.filter((_, candidateIndex) => candidateIndex !== index));
  };

  if (!self) {
    return <main className="splendor-board"><div className="splendor-status-card">正在同步你的玩家席位……</div></main>;
  }

  if (game.status === 'finished' && game.winner) {
    const winners = new Set(game.winner.playerIds);
    return (
      <main className={`splendor-board ${pokemon ? 'splendor-board--pokemon' : 'splendor-board--classic'}`}>
        <section className="splendor-finale">
          <span className="splendor-eyebrow">{pokemon ? 'LEAGUE RESULT' : 'FINAL AUDIENCE'}</span>
          <h1>{winners.has(userId) ? (pokemon ? '训练家登顶！' : '荣膺首席珠宝商') : '本局尘埃落定'}</h1>
          <p>
            {game.winner.reason === 'forfeit'
              ? '因其他玩家退出，本局提前结算。'
              : pokemon
                ? '按声望排名；同分时，完成更多进化的训练家领先。'
                : '按声望排名；同分时，使用更少发展卡的珠宝商领先。'}
          </p>
          <ol className="splendor-ranking">
            {game.winner.rankings.map((ranking, index) => {
              const player = game.players.find((candidate) => candidate.id === ranking.playerId);
              return (
                <li key={ranking.playerId} className={winners.has(ranking.playerId) ? 'is-winner' : ''}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <strong>{player?.name ?? '已离席玩家'}</strong>
                  <b>{ranking.score} 分</b>
                  <small>{ranking.developmentCardCount} 张发展卡{pokemon ? ` · ${ranking.evolutionCount} 次进化` : ''}</small>
                </li>
              );
            })}
          </ol>
          <Button size="large" type="primary" onClick={() => void onExit()}>退出牌桌</Button>
        </section>
      </main>
    );
  }

  const currentPlayer = game.players.find((player) => player.id === game.currentPlayerId);
  return (
    <main className={`splendor-board ${pokemon ? 'splendor-board--pokemon' : 'splendor-board--classic'}`}>
      <header className="splendor-board__header">
        <div>
          <span className="splendor-eyebrow">{pokemon ? 'TRAINER ARENA' : 'THE GRAND SALON'}</span>
          <h1>{pokemon ? '璀璨宝石宝可梦' : '璀璨宝石'}</h1>
          <p>{game.finalRoundTriggered ? '最终轮已经开始，每一步都将决定冠军。' : `当前由 ${currentPlayer?.name ?? '玩家'} 行动`}</p>
        </div>
        <div className="splendor-board__header-actions">
          <span className={connected ? 'splendor-live is-connected' : 'splendor-live'}>{connected ? '实时在线' : '正在重连'}</span>
          <Popconfirm title="确定退出牌桌？" description="进行中的对局会按放弃处理。" onConfirm={() => void onExit()}>
            <Button danger>退出</Button>
          </Popconfirm>
        </div>
      </header>

      <section className="splendor-player-strip" aria-label="玩家资产">
        {game.players.map((player) => (
          <article key={player.id} className={`splendor-player${player.id === userId ? ' is-self' : ''}${player.id === game.currentPlayerId ? ' is-current' : ''}`}>
            <div className="splendor-player__head">
              <span className="splendor-player__seat">{player.seat + 1}</span>
              <div><strong>{player.name}</strong><small>{player.botTitle ?? (player.id === userId ? '你的资产' : '公开资产')}</small></div>
              <b>{player.score}<small>声望</small></b>
            </div>
            <ResourceList resources={player.tokens} colors={colors} pokemon={pokemon} compact />
            <div className="splendor-player__bonuses">
              <span>{pokemon ? '伙伴加成' : '永久折扣'}</span>
              <ResourceList resources={player.bonuses} colors={colors} pokemon={pokemon} compact />
            </div>
            <div className="splendor-player__counts">
              <span>{player.cards.length + player.evolvedCards.length} {pokemon ? '只伙伴' : '张发展卡'}</span>
              <span>{player.reservedCount} 张预留</span>
              <span>{player.nobles.length} {pokemon ? '枚徽章' : '位贵族'}</span>
              {pokemon && <span>{player.evolutionCount} 次进化</span>}
            </div>
            {player.id !== userId && player.publicReservedCards.length > 0 && (
              <div className="splendor-public-reserve">公开预留：{player.publicReservedCards.map((card) => splendorCardDisplayName(card, pokemon)).join('、')}</div>
            )}
          </article>
        ))}
      </section>

      <div className="splendor-table">
        <aside className="splendor-supply">
          <div className="splendor-section-title">
            <span>{pokemon ? '精灵球补给' : '宝石筹码'}</span>
            <small>点击行动区中的组合拿取</small>
          </div>
          <div className="splendor-supply__tokens">
            {colors.map((color) => (
              <div key={color}>
                <Resource color={color} count={game.tokenSupply[color] ?? 0} pokemon={pokemon} />
                <span>{splendorResourceLabel(color, pokemon)}</span>
              </div>
            ))}
          </div>
          {shouldShowNobleGallery(game.nobles) && (
            <div className="splendor-nobles">
              <div className="splendor-section-title"><span>{pokemon ? '联盟荣耀' : '贵族长廊'}</span></div>
              {game.nobles.map((noble) => <NobleTile key={noble.id} noble={noble} colors={colors} pokemon={pokemon} />)}
            </div>
          )}
        </aside>

        <section className="splendor-market" aria-label="公开市场">
          {orderedLevels.map((level) => {
            const cards = game.market[String(level)] ?? [];
            const deckCount = game.deckCounts[String(level)] ?? 0;
            if (!cards.length && !deckCount) return null;
            return (
              <div className={`splendor-market-row splendor-market-row--${String(level)}`} key={String(level)}>
                <button
                  type="button"
                  className="splendor-deck"
                  disabled={!canAct || busy || !mainPrompt?.reserveDeckLevels.includes(level) || deckCount < 1}
                  onClick={() => void submit({ type: 'splendor_reserve', playerId: userId, level })}
                  title={mainPrompt?.reserveDeckLevels.includes(level) ? '从该牌堆暗抽预留' : '当前不能从该牌堆预留'}
                >
                  <span>{levelLabel(level, pokemon)}</span>
                  <strong>{deckCount}</strong>
                  <small>暗抽预留</small>
                </button>
                <div className="splendor-market-row__cards">
                  {cards.map((card) => (
                    <DevelopmentCard
                      key={card.id}
                      card={card}
                      pokemon={pokemon}
                      colors={colors}
                      canBuy={mainPrompt?.buyCardIds.includes(card.id)}
                      canReserve={mainPrompt?.reserveCardIds.includes(card.id)}
                      disabled={!canAct || busy}
                      onBuy={() => void submit({ type: 'splendor_buy', playerId: userId, cardId: card.id })}
                      onReserve={() => void submit({ type: 'splendor_reserve', playerId: userId, cardId: card.id })}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </section>

        <aside className="splendor-action-panel">
          <div className="splendor-action-panel__head">
            <span>{promptIsMine ? '轮到你了' : '等待行动'}</span>
            <strong>
              {game.prompt.type === 'return' ? `返还 ${game.prompt.count} 枚筹码`
                : game.prompt.type === 'choose_noble' ? (pokemon ? '选择荣耀徽章' : '选择到访贵族')
                  : game.prompt.type === 'evolution' ? '选择一次进化'
                    : promptIsMine ? '选择一项主行动' : `${currentPlayer?.name ?? '玩家'} 正在思考`}
            </strong>
          </div>
          {!connected && <p className="splendor-action-hint">实时连接恢复前无法提交操作。</p>}

          {mainPrompt && (
            <>
              <div className="splendor-action-group">
                <span>拿取筹码</span>
                <div className="splendor-take-options">
                  {mainPrompt.takeOptions.map((option, index) => (
                    <button
                      key={`${option.colors.join('-')}-${index}`}
                      type="button"
                      disabled={!canAct || busy}
                      onClick={() => void submit({ type: 'splendor_take', playerId: userId, colors: option.colors })}
                    >
                      <ResourceList
                        resources={option.colors.reduce<SplendorResourceMap>((result, color) => {
                          result[color] = (result[color] ?? 0) + 1;
                          return result;
                        }, {})}
                        colors={colors}
                        pokemon={pokemon}
                        compact
                      />
                      <span>{new Set(option.colors).size === 1 ? '拿取两枚同色' : '拿取三枚异色'}</span>
                    </button>
                  ))}
                </div>
              </div>
              {mainPrompt.evolutionOptions.length > 0 && (
                <div className="splendor-action-group splendor-main-evolution">
                  <span>本回合直接进化</span>
                  <div className="splendor-evolution-list">
                    {mainPrompt.evolutionOptions.map((option) => {
                      const from = cardById.get(option.fromCardId);
                      const to = cardById.get(option.toCardId);
                      return (
                        <button
                          key={`${option.fromCardId}-${option.toCardId}`}
                          type="button"
                          disabled={!canAct || busy}
                          onClick={() => void submit({
                            type: 'splendor_evolve',
                            playerId: userId,
                            fromCardId: option.fromCardId,
                            toCardId: option.toCardId,
                          })}
                        >
                          <span>{from?.name ?? '现有伙伴'}</span>
                          <i aria-hidden="true">→</i>
                          <strong>{to?.name ?? '进化形态'}</strong>
                        </button>
                      );
                    })}
                  </div>
                  <p className="splendor-action-hint">直接进化会立即结束本回合。</p>
                </div>
              )}
              <p className="splendor-action-hint">也可直接在市场卡牌上选择购买或预留；点击牌堆可暗抽预留。</p>
              {mainPrompt.canPass && (
                <Button block disabled={!canAct || busy} onClick={() => void submit({ type: 'splendor_pass', playerId: userId })}>跳过本回合</Button>
              )}
            </>
          )}

          {returnPrompt && (
            <div className="splendor-return-panel">
              <p>你持有 {countResources(self.tokens)} 枚筹码。请选择准确的返还数量。</p>
              <div className="splendor-return-grid">
                {colors.filter((color) => (returnPrompt.available[color] ?? 0) > 0).map((color) => {
                  const selected = returnColors.filter((candidate) => candidate === color).length;
                  return (
                    <div key={color}>
                      <Resource color={color} count={returnPrompt.available[color] ?? 0} pokemon={pokemon} />
                      <div>
                        <button type="button" disabled={!canAct || selected === 0} onClick={() => removeReturnColor(color)}>−</button>
                        <b>{selected}</b>
                        <button type="button" disabled={!canAct || returnColors.length >= returnPrompt.count || selected >= (returnPrompt.available[color] ?? 0)} onClick={() => addReturnColor(color)}>+</button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <Button
                type="primary"
                block
                disabled={!canAct || busy || returnColors.length !== returnPrompt.count}
                onClick={() => void submit({ type: 'splendor_return', playerId: userId, colors: returnColors })}
              >
                返还 {returnColors.length} / {returnPrompt.count}
              </Button>
            </div>
          )}

          {game.prompt.type === 'choose_noble' && (
            <div className="splendor-choice-list">
              {game.nobles.filter((noble) => game.prompt.type === 'choose_noble' && game.prompt.nobleIds.includes(noble.id)).map((noble) => (
                <button
                  type="button"
                  key={noble.id}
                  disabled={!canAct || busy}
                  onClick={() => void submit({ type: 'splendor_choose_noble', playerId: userId, nobleId: noble.id })}
                >
                  <NobleTile noble={noble} colors={colors} pokemon={pokemon} />
                </button>
              ))}
            </div>
          )}

          {game.prompt.type === 'evolution' && (
            <div className="splendor-evolution-list">
              {game.prompt.options.map((option) => {
                const from = cardById.get(option.fromCardId);
                const to = cardById.get(option.toCardId);
                return (
                  <button
                    key={`${option.fromCardId}-${option.toCardId}`}
                    type="button"
                    disabled={!canAct || busy}
                    onClick={() => void submit({
                      type: 'splendor_evolve',
                      playerId: userId,
                      fromCardId: option.fromCardId,
                      toCardId: option.toCardId,
                    })}
                  >
                    <span>{from?.name ?? '现有伙伴'}</span>
                    <i aria-hidden="true">→</i>
                    <strong>{to?.name ?? '进化形态'}</strong>
                  </button>
                );
              })}
              <Button
                block
                disabled={!canAct || busy}
                onClick={() => void submit({ type: 'splendor_skip_evolution', playerId: userId })}
              >
                暂不进化
              </Button>
            </div>
          )}

          <div className="splendor-own-reserve">
            <div className="splendor-section-title"><span>我的预留</span><small>{self.reservedCount} / 3</small></div>
            {self.reservedCards?.length ? (
              <div className="splendor-own-reserve__cards">
                {self.reservedCards.map((card) => (
                  <DevelopmentCard
                    key={card.id}
                    card={card}
                    pokemon={pokemon}
                    colors={colors}
                    compact
                    canBuy={mainPrompt?.buyCardIds.includes(card.id)}
                    disabled={!canAct || busy}
                    onBuy={() => void submit({ type: 'splendor_buy', playerId: userId, cardId: card.id })}
                  />
                ))}
              </div>
            ) : <p>尚未预留卡牌</p>}
          </div>
        </aside>
      </div>
    </main>
  );
}
