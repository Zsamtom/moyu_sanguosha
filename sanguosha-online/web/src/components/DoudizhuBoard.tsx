import { Button, Modal, Popconfirm, Select, Tag } from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AnyGameAction,
  DoudizhuCard,
  DoudizhuGameView,
  DoudizhuLlmRecommendation,
  DoudizhuPatternType,
  DoudizhuRank,
  RoomDetail,
} from '../types';

interface DoudizhuBoardProps {
  game: DoudizhuGameView;
  room: RoomDetail | null;
  userId: string;
  connected: boolean;
  onAction: (action: AnyGameAction) => Promise<void>;
  onLlmRecommendation: () => Promise<DoudizhuLlmRecommendation>;
  onExit: () => Promise<void>;
  onRematch: () => Promise<void>;
}

const rankLabel: Record<DoudizhuRank, string> = {
  '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
  '10': '10', J: 'J', Q: 'Q', K: 'K', A: 'A', '2': '2',
  small_joker: '小王', big_joker: '大王',
};
const suitSymbol: Record<DoudizhuCard['suit'], string> = {
  spade: '♠', heart: '♥', diamond: '♦', club: '♣', joker: '★',
};
const patternLabel: Record<DoudizhuPatternType, string> = {
  single: '单张', pair: '对子', triple: '三张', triple_single: '三带一',
  triple_pair: '三带二', straight: '顺子', consecutive_pairs: '连对',
  airplane: '飞机', airplane_singles: '飞机带单', airplane_pairs: '飞机带对',
  four_two_singles: '四带二', four_two_pairs: '四带两对', bomb: '炸弹', rocket: '王炸',
};

function CardFace({
  card,
  selected = false,
  compact = false,
  onClick,
}: {
  card: DoudizhuCard;
  selected?: boolean;
  compact?: boolean;
  onClick?: () => void;
}) {
  const red = card.suit === 'heart' || card.suit === 'diamond' || card.rank === 'big_joker';
  const classes = [
    'ddz-card',
    red ? 'ddz-card--red' : '',
    selected ? 'ddz-card--selected' : '',
    compact ? 'ddz-card--compact' : '',
    card.suit === 'joker' ? 'ddz-card--joker' : '',
  ].filter(Boolean).join(' ');
  const content = (
    <>
      <strong>{rankLabel[card.rank]}</strong>
      <span>{suitSymbol[card.suit]}</span>
    </>
  );
  return onClick ? (
    <button type="button" className={classes} aria-pressed={selected} onClick={onClick}>{content}</button>
  ) : <span className={classes}>{content}</span>;
}

function formatBeans(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(value);
}

function formatBeanDelta(value: number): string {
  return `${value >= 0 ? '+' : ''}${formatBeans(value)}`;
}

export function DoudizhuBoard({
  game,
  room,
  userId,
  connected,
  onAction,
  onLlmRecommendation,
  onExit,
  onRematch,
}: DoudizhuBoardProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [recommendationMode, setRecommendationMode] =
    useState<'off' | 'rules' | 'llm'>('off');
  const [recommendationActive, setRecommendationActive] = useState(false);
  const [recommendationLabel, setRecommendationLabel] = useState<string>();
  const [recommendedBid, setRecommendedBid] = useState<0 | 1 | 2 | 3>();
  const [busy, setBusy] =
    useState<'bid' | 'play' | 'pass' | 'recommend' | 'exit' | 'rematch'>();
  const llmRecommendationPromptRef = useRef<string | undefined>(undefined);
  const self = game.players.find((player) => player.id === userId);
  const hand = self?.hand ?? [];
  const isTurn = game.status === 'playing' && game.currentPlayerId === userId;
  const current = game.players.find((player) => player.id === game.currentPlayerId);
  const selectedCards = useMemo(
    () => hand.filter((card) => selectedIds.includes(card.id)),
    [hand, selectedIds],
  );
  const opponents = game.players.filter((player) => player.id !== userId);
  const selfReadyForRematch = room?.members.find((member) => member.userId === userId)?.ready ?? false;

  useEffect(() => {
    const recommendation =
      recommendationMode === 'rules' ? game.prompt.recommendation : null;
    setSelectedIds(recommendation?.type === 'play' ? [...recommendation.cardIds] : []);
    setRecommendationActive(game.prompt.type === 'play' && recommendation !== null);
    setRecommendationLabel(
      recommendation?.type === 'pass'
        ? '推荐：不出'
        : recommendation?.type === 'play'
          ? `推荐：已选 ${recommendation.cardIds.length} 张`
          : undefined,
    );
    setRecommendedBid(undefined);
  }, [game.actionPromptId, recommendationMode]);

  const requestLlmRecommendation = useCallback(async () => {
    setBusy('recommend');
    try {
      const { action } = await onLlmRecommendation();
      setRecommendationActive(true);
      if (action.type === 'doudizhu_bid') {
        setSelectedIds([]);
        setRecommendedBid(action.score);
        setRecommendationLabel(
          action.score === 0 ? '大模型推荐：不叫' : `大模型推荐：${action.score} 分`,
        );
      } else if (action.type === 'doudizhu_pass') {
        setSelectedIds([]);
        setRecommendedBid(undefined);
        setRecommendationLabel('大模型推荐：不出');
      } else {
        setSelectedIds([...action.cardIds]);
        setRecommendedBid(undefined);
        setRecommendationLabel(`大模型推荐：已选 ${action.cardIds.length} 张`);
      }
    } finally {
      setBusy(undefined);
    }
  }, [onLlmRecommendation]);

  useEffect(() => {
    if (recommendationMode !== 'llm') {
      llmRecommendationPromptRef.current = undefined;
      return;
    }
    if (
      !connected ||
      !isTurn ||
      !room?.llmBot.available ||
      busy !== undefined ||
      llmRecommendationPromptRef.current === game.actionPromptId
    ) {
      return;
    }
    llmRecommendationPromptRef.current = game.actionPromptId;
    void requestLlmRecommendation().catch(() => undefined);
  }, [
    busy,
    connected,
    game.actionPromptId,
    isTurn,
    recommendationMode,
    requestLlmRecommendation,
    room?.llmBot.available,
  ]);

  if (!self) {
    return (
      <main className="page ddz-page">
        <section className="paper-card">
          <h1>无法读取斗地主座位</h1>
          <p>当前账号不在这局游戏的三个座位中。</p>
        </section>
      </main>
    );
  }

  const bid = async (score: 0 | 1 | 2 | 3) => {
    setBusy('bid');
    try {
      await onAction({ type: 'doudizhu_bid', playerId: userId, score });
    } finally {
      setBusy(undefined);
    }
  };

  const play = async () => {
    setBusy('play');
    try {
      await onAction({ type: 'doudizhu_play', playerId: userId, cardIds: selectedIds });
    } finally {
      setBusy(undefined);
    }
  };

  const pass = async () => {
    setBusy('pass');
    try {
      await onAction({ type: 'doudizhu_pass', playerId: userId });
    } finally {
      setBusy(undefined);
    }
  };

  const rematch = async () => {
    setBusy('rematch');
    try {
      await onRematch();
    } finally {
      setBusy(undefined);
    }
  };

  const exit = async () => {
    setBusy('exit');
    try {
      await onExit();
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <main className="page ddz-page">
      <header className="ddz-header paper-card">
        <div className="ddz-header__identity">
          <span className="section-kicker">SESSION / CARD TABLE / 03</span>
          <p>
            {game.phase === 'bidding' ? '状态：叫分阶段' : game.status === 'finished' ? '状态：牌局结束' : '状态：出牌阶段'}
            {' · '}逆时针牌序{' · '}服务端权威校验{' · '}REV {String(game.revision).padStart(4, '0')}
          </p>
        </div>
        <div className="ddz-header__meta">
          <label className="ddz-recommendation-toggle">
            <span>推荐方式</span>
            <Select
              size="small"
              value={recommendationMode}
              options={[
                { value: 'off', label: '关闭' },
                { value: 'rules', label: '规则推荐' },
                { value: 'llm', label: '大模型推荐' },
              ]}
              onChange={setRecommendationMode}
            />
          </label>
          <Tag color={connected ? 'green' : 'orange'}>{connected ? '实时同步' : '正在重连'}</Tag>
          <Tag color={self.role === 'landlord' ? 'gold' : 'blue'}>
            {self.role === 'landlord' ? '地主' : self.role === 'farmer' ? '农民' : '叫分中'}
          </Tag>
          <span>
            欢乐豆 {formatBeans(self.beans)}
            {game.status === 'finished' ? `（${formatBeanDelta(self.beanDelta)}）` : ''}
          </span>
          <span>底分 {game.baseScore} · 倍率 ×{game.multiplier}</span>
          <Popconfirm
            title={game.status === 'playing' ? '确定认输并离开？' : '离开已结束的房间？'}
            description={game.status === 'playing' ? '离席会立即判对方获胜。' : undefined}
            onConfirm={exit}
          >
            <Button danger loading={busy === 'exit'}>离开牌桌</Button>
          </Popconfirm>
        </div>
      </header>

      <section className="ddz-layout">
        <div className="ddz-main">
          <section className="ddz-table" aria-label="斗地主牌桌">
            <div className="ddz-opponents">
              {opponents.map((player) => (
                <article
                  key={player.id}
                  className={[
                    'ddz-player',
                    player.id === game.currentPlayerId ? 'ddz-player--current' : '',
                    room?.llmBot.thinkingPlayerId === player.id ? 'ddz-player--llm-thinking' : '',
                  ].filter(Boolean).join(' ')}
                >
                  <div className="ddz-player__avatar">{player.name.slice(0, 1)}</div>
                  <div>
                    <strong>{player.name}</strong>
                    <span>
                      {player.botTitle ? `${player.botTitle} · ` : ''}
                      {player.handCount} 张 · {formatBeans(player.beans)} 豆
                      {game.status === 'finished' ? `（${formatBeanDelta(player.beanDelta)}）` : ''}
                    </span>
                    {room?.llmBot.thinkingPlayerId === player.id && (
                      <span className="ddz-player__thinking" role="status" aria-live="polite">
                        <i aria-hidden="true" />
                        {player.name} 思考中...
                      </span>
                    )}
                  </div>
                  {player.role && <Tag color={player.role === 'landlord' ? 'gold' : 'blue'}>{player.role === 'landlord' ? '地主' : '农民'}</Tag>}
                  <div className="ddz-card-backs" aria-label={`${player.handCount} 张手牌`}>
                    {Array.from({ length: Math.min(player.handCount, 12) }, (_, index) => <i key={index} />)}
                  </div>
                </article>
              ))}
            </div>

            <div className="ddz-bottom">
              <span>底牌</span>
              {game.bottomCards.length ? (
                game.bottomCards.map((card) => <CardFace key={card.id} card={card} compact />)
              ) : (
                <><i /><i /><i /></>
              )}
            </div>

            <div className="ddz-trick">
              {game.trick ? (
                <>
                  <div className="ddz-trick__heading">
                    <strong>{game.players.find((player) => player.id === game.trick?.fromPlayerId)?.name}</strong>
                    <span>{patternLabel[game.trick.pattern.type]}</span>
                  </div>
                  <div className="ddz-trick__cards">
                    {game.trick.pattern.cards.map((card) => <CardFace key={card.id} card={card} compact />)}
                  </div>
                </>
              ) : (
                <div className="ddz-trick__empty">
                  <strong>{game.phase === 'bidding' ? `等待 ${current?.name ?? '玩家'} 叫分` : `等待 ${current?.name ?? '玩家'} 领牌`}</strong>
                  <span>REV {String(game.revision).padStart(4, '0')}</span>
                </div>
              )}
            </div>
          </section>

          <section className={`ddz-self${isTurn ? ' ddz-self--current' : ''}`}>
            <div className="ddz-self__heading">
              <div>
                <strong>{self.name} · 我</strong>
                <span>
                  {isTurn ? game.phase === 'bidding' ? '轮到你叫分' : '轮到你出牌' : `等待 ${current?.name ?? '其他玩家'}`}
                  {recommendationActive && recommendationLabel
                    ? ` · ${recommendationLabel}`
                    : selectedCards.length
                      ? ` · 已选 ${selectedCards.length} 张`
                      : ''}
                </span>
                {room?.llmBot.thinkingPlayerId === userId && (
                  <span className="ddz-player__thinking" role="status" aria-live="polite">
                    <i aria-hidden="true" />
                    大模型正在推荐...
                  </span>
                )}
              </div>
              <span>
                {hand.length} 张 · {formatBeans(self.beans)} 豆
                {game.status === 'finished' ? `（${formatBeanDelta(self.beanDelta)}）` : ''}
              </span>
            </div>
            <div className="ddz-hand" aria-label="我的手牌">
              {hand.map((card) => (
                <CardFace
                  key={card.id}
                  card={card}
                  selected={selectedIds.includes(card.id)}
                  onClick={() => {
                    setRecommendationActive(false);
                    setRecommendationLabel(undefined);
                    setRecommendedBid(undefined);
                    setSelectedIds((ids) =>
                      ids.includes(card.id) ? ids.filter((id) => id !== card.id) : [...ids, card.id]
                    );
                  }}
                />
              ))}
            </div>
            <div className="ddz-actions">
              {game.prompt.type === 'bid' ? (
                game.prompt.bidOptions.map((score) => (
                  <Button
                    key={score}
                    type={score === recommendedBid || (recommendedBid === undefined && score === 3)
                      ? 'primary'
                      : 'default'}
                    disabled={!connected || busy !== undefined}
                    loading={busy === 'bid'}
                    onClick={() => void bid(score)}
                  >
                    {score === 0 ? '不叫' : `${score} 分`}
                  </Button>
                ))
              ) : (
                <>
                  <Button
                    disabled={!recommendationActive && !selectedIds.length}
                    onClick={() => {
                      setSelectedIds([]);
                      setRecommendationActive(false);
                      setRecommendationLabel(undefined);
                      setRecommendedBid(undefined);
                    }}
                  >
                    {recommendationActive ? '取消推荐' : '清空选择'}
                  </Button>
                  <Button
                    disabled={!connected || !isTurn || !game.prompt.canPass || busy !== undefined}
                    loading={busy === 'pass'}
                    onClick={() => void pass()}
                  >
                    不出
                  </Button>
                  <Button
                    className="primary-ink-button"
                    type="primary"
                    disabled={!connected || !isTurn || !game.prompt.canPlay || !selectedIds.length || busy !== undefined}
                    loading={busy === 'play'}
                    onClick={() => void play()}
                  >
                    出牌
                  </Button>
                </>
              )}
            </div>
          </section>
        </div>

        <aside className="ddz-sidebar">
          {game.status === 'finished' && game.winner && (
            <section className="paper-card ddz-result">
              <span className="section-kicker">Round result</span>
              <h2>{game.winner.role === 'landlord' ? '地主获胜' : '农民获胜'}</h2>
              <p>
                底分 {game.winner.baseScore} · 倍率 ×{game.winner.multiplier}
                {game.winner.spring ? ' · 春天' : ''}
              </p>
            </section>
          )}
          <section className="paper-card ddz-log">
            <div className="section-title-row">
              <div>
                <span className="section-kicker">Round log</span>
                <h2>牌局记录</h2>
              </div>
            </div>
            <ol>
              {[...game.logs].reverse().map((entry) => (
                <li key={entry.id}>
                  <span>{String(entry.id).padStart(2, '0')}</span>
                  <p>{entry.message}</p>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </section>

      <Modal
        className="ddz-settlement-modal"
        open={game.status === 'finished' && Boolean(game.winner)}
        title="本局结算"
        closable={false}
        maskClosable={false}
        keyboard={false}
        footer={(
          <div className="ddz-settlement-modal__actions">
            <Button danger loading={busy === 'exit'} disabled={busy !== undefined && busy !== 'exit'} onClick={() => void exit()}>
              离开房间
            </Button>
            <Button
              type="primary"
              className="primary-ink-button"
              loading={busy === 'rematch'}
              disabled={!connected || selfReadyForRematch || (busy !== undefined && busy !== 'rematch')}
              onClick={() => void rematch()}
            >
              {selfReadyForRematch ? '已确认，等待其他玩家' : '继续下一局'}
            </Button>
          </div>
        )}
      >
        {game.winner && (
          <div className="ddz-settlement">
            <div className="ddz-settlement__summary">
              <span className="section-kicker">ROUND RESULT / BEAN ACCOUNT</span>
              <strong>{game.winner.role === 'landlord' ? '地主获胜' : '农民获胜'}</strong>
              <p>
                单份 {formatBeans(game.winner.beanStake)} 豆 · 底分 {game.winner.baseScore}
                {' · '}倍率 ×{game.winner.multiplier}
                {game.winner.spring ? ' · 春天' : ''}
              </p>
            </div>
            <div className="ddz-settlement__ledger">
              {game.winner.settlements.map((settlement) => {
                const player = game.players.find((candidate) => candidate.id === settlement.playerId);
                return (
                  <div key={settlement.playerId}>
                    <span>{player?.name ?? '玩家'}</span>
                    <strong className={settlement.delta >= 0 ? 'is-positive' : 'is-negative'}>
                      {formatBeanDelta(settlement.delta)}
                    </strong>
                    <span>余额 {formatBeans(settlement.balance)}</span>
                  </div>
                );
              })}
            </div>
            <p className="ddz-settlement__note">
              选择继续后，机器人会自动确认；所有真人玩家确认后立即发牌，并保留本局结算后的欢乐豆余额。
            </p>
          </div>
        )}
      </Modal>
    </main>
  );
}
