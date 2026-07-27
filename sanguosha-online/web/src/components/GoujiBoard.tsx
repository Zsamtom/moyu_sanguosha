import { Button, Popconfirm, Tag } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import type { AnyGameAction, GoujiCard, GoujiGameView, GoujiRank } from '../types';

interface GoujiBoardProps {
  game: GoujiGameView;
  userId: string;
  connected: boolean;
  onAction: (action: AnyGameAction) => Promise<void>;
  onExit: () => Promise<void>;
}

const rankLabel: Record<GoujiRank, string> = {
  big_joker: '大王',
  small_joker: '小王',
  '2': '2',
  A: 'A',
  K: 'K',
  Q: 'Q',
  J: 'J',
  '10': '10',
  '9': '9',
  '8': '8',
  '7': '7',
  '6': '6',
  '5': '5',
  '4': '4',
  '3': '3',
};

const suitSymbol: Record<GoujiCard['suit'], string> = {
  spade: '♠',
  heart: '♥',
  diamond: '♦',
  club: '♣',
  joker: '★',
};

function selectionLabel(cards: readonly GoujiCard[]): string {
  if (cards.length === 0) return '尚未选择操作项';
  const counts = new Map<GoujiRank, number>();
  for (const card of cards) counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  return [...counts.entries()]
    .map(([rank, count]) => `${count}×${rankLabel[rank]}`)
    .join(' + ');
}

function CardFace({
  card,
  selected,
  compact = false,
  onClick,
}: {
  card: GoujiCard;
  selected?: boolean;
  compact?: boolean;
  onClick?: () => void;
}) {
  const red = card.suit === 'heart' || card.suit === 'diamond' || card.rank === 'big_joker';
  const className = [
    'gouji-card',
    red ? 'gouji-card--red' : '',
    selected ? 'gouji-card--selected' : '',
    compact ? 'gouji-card--compact' : '',
    card.suit === 'joker' ? 'gouji-card--joker' : '',
  ].filter(Boolean).join(' ');
  const content = (
    <>
      <span className="gouji-card__rank">{rankLabel[card.rank]}</span>
      <span className="gouji-card__suit">{suitSymbol[card.suit]}</span>
      {card.marked && <span className="gouji-card__mark">筹</span>}
    </>
  );
  return onClick ? (
    <button type="button" className={className} aria-pressed={selected} onClick={onClick}>
      {content}
    </button>
  ) : (
    <span className={className}>{content}</span>
  );
}

export function GoujiBoard({ game, userId, connected, onAction, onExit }: GoujiBoardProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState<'play' | 'pass' | 'yield' | 'exit'>();
  const self = game.players.find((player) => player.id === userId);
  const hand = self?.hand ?? [];
  const current = game.players.find((player) => player.id === game.currentPlayerId);
  const isTurn = game.status === 'playing' && game.currentPlayerId === userId;
  const selectedCards = useMemo(
    () => hand.filter((card) => selectedIds.includes(card.id)),
    [hand, selectedIds],
  );

  useEffect(() => {
    setSelectedIds([]);
  }, [game.revision]);

  if (!self) {
    return (
      <main className="page gouji-page">
        <section className="paper-card">
          <h1>无法读取够级座位</h1>
          <p>当前账号不在这局游戏的六个座位中。</p>
        </section>
      </main>
    );
  }

  const act = async (kind: 'play' | 'pass' | 'yield') => {
    setBusy(kind);
    try {
      if (kind === 'play') {
        await onAction({ type: 'gouji_play', playerId: userId, cardIds: selectedIds });
      } else if (kind === 'pass') {
        await onAction({ type: 'gouji_pass', playerId: userId });
      } else {
        await onAction({ type: 'gouji_yield', playerId: userId });
      }
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <main className="page gouji-page">
      <header className="gouji-header paper-card">
        <div>
          <span className="section-kicker">Runtime session / topology</span>
          <h1>实时协作会话</h1>
          <p>NODE-A：1、3、5；NODE-B：2、4、6。数据由服务端统一校验并同步。</p>
        </div>
        <div className="gouji-header__status">
          <Tag>{connected ? 'SYNC / ONLINE' : 'SYNC / RETRY'}</Tag>
          <Tag>{self.team === 'A' ? 'NODE-A' : 'NODE-B'}</Tag>
          <span>REV {String(game.revision).padStart(4, '0')}</span>
          <Popconfirm
            title={game.status === 'playing' ? '确定认输并离开？' : '离开已结束的房间？'}
            description={game.status === 'playing' ? '离席会立即判本方负。' : undefined}
            onConfirm={async () => {
              setBusy('exit');
              try { await onExit(); } finally { setBusy(undefined); }
            }}
          >
            <Button danger loading={busy === 'exit'}>结束会话</Button>
          </Popconfirm>
        </div>
      </header>

      <section className="gouji-layout">
        <div className="gouji-table-shell">
          <div className="gouji-table" aria-label="六节点实时会话拓扑">
            <div className="gouji-table__felt">
              <span className="gouji-table__team gouji-table__team--a">NODE-A</span>
              <span className="gouji-table__team gouji-table__team--b">NODE-B</span>
              <div className="gouji-trick">
                {game.trick ? (
                  <>
                    <div className="gouji-trick__meta">
                      <strong>{game.players.find((player) => player.id === game.trick?.fromPlayerId)?.name}</strong>
                      <span>{game.trick.isGouji ? 'PRIMARY EVENT' : 'CURRENT EVENT'} · {game.trick.cardCount} ITEMS</span>
                      {game.trick.burning && <Tag>CHAIN ACTIVE</Tag>}
                    </div>
                    <div className="gouji-trick__cards">
                      {game.trick.cards.map((card) => <CardFace key={card.id} card={card} compact />)}
                    </div>
                  </>
                ) : (
                  <div className="gouji-trick__empty">
                    <strong>等待 {current?.name ?? '当前节点'} 提交操作</strong>
                    <span>服务端正在维护当前事件序列</span>
                  </div>
                )}
              </div>
            </div>

            {game.players.map((player) => {
              const relativeSeat = (player.seat - self.seat + 6) % 6;
              const isCurrent = player.id === game.currentPlayerId && game.status === 'playing';
              const passed = game.trick?.passedPlayerIds.includes(player.id);
              return (
                <article
                  key={player.id}
                  className={[
                    'gouji-seat',
                    `gouji-seat--${relativeSeat}`,
                    `gouji-seat--team-${player.team.toLowerCase()}`,
                    isCurrent ? 'gouji-seat--current' : '',
                    player.id === userId ? 'gouji-seat--self' : '',
                  ].filter(Boolean).join(' ')}
                >
                  <span className="gouji-seat__number">N{player.seat + 1}</span>
                  <div className="gouji-seat__avatar">{player.name.slice(0, 1)}</div>
                  <div className="gouji-seat__copy">
                    <strong>{player.name}{player.id === userId ? ' · 我' : ''}</strong>
                    <span>
                      {player.botTitle
                        ? `${player.botTitle} · `
                        : `${player.team === 'A' ? 'NODE-A' : 'NODE-B'} · `}
                      {player.finishedRank ?? `${player.handCount} 项`}
                      {passed ? ' · 已跳过' : ''}
                    </span>
                  </div>
                  <div className="gouji-seat__badges">
                    {player.openedPoint && <em>点</em>}
                    {player.burnCount > 0 && <em>烧{player.burnCount}</em>}
                  </div>
                </article>
              );
            })}
          </div>

          <section className="gouji-hand-zone">
            <div className="gouji-hand-zone__heading">
              <div>
                <strong>{isTurn ? '轮到你操作' : `等待 ${current?.name ?? '其他玩家'}`}</strong>
                <span>
                  {game.prompt.mustIncludeJoker ? '烧牌延续：本手必须挂王 · ' : ''}
                  {selectionLabel(selectedCards)}
                </span>
              </div>
              <span>{hand.length} 个待处理项</span>
            </div>
            <div className="gouji-hand" aria-label="我的手牌">
              {hand.map((card) => (
                <CardFace
                  key={card.id}
                  card={card}
                  selected={selectedIds.includes(card.id)}
                  onClick={() => {
                    setSelectedIds((currentIds) => currentIds.includes(card.id)
                      ? currentIds.filter((id) => id !== card.id)
                      : [...currentIds, card.id]);
                  }}
                />
              ))}
            </div>
            <div className="gouji-actions">
              <Button onClick={() => setSelectedIds([])} disabled={selectedIds.length === 0}>清空选择</Button>
              {game.prompt.canYield && (
                <Button disabled={!connected || busy !== undefined} loading={busy === 'yield'} onClick={() => void act('yield')}>
                  让牌
                </Button>
              )}
              <Button
                disabled={!connected || !isTurn || !game.prompt.canPass || busy !== undefined}
                loading={busy === 'pass'}
                onClick={() => void act('pass')}
              >
                过牌
              </Button>
              <Button
                className="primary-ink-button"
                type="primary"
                disabled={!connected || !isTurn || selectedIds.length === 0 || busy !== undefined}
                loading={busy === 'play'}
                onClick={() => void act('play')}
              >
                出牌
              </Button>
            </div>
          </section>
        </div>

        <aside className="gouji-sidebar">
          {game.status === 'finished' && (
            <section className="paper-card gouji-result">
              <span className="section-kicker">Session result</span>
              <h2>{game.winner?.team === 'A' ? 'NODE-A 完成' : 'NODE-B 完成'}</h2>
              <ol>
                {[...game.players]
                  .sort((left, right) => {
                    const order = ['头科', '二科', '三科', '四科', '二拉', '大拉'];
                    return order.indexOf(left.finishedRank ?? '大拉') - order.indexOf(right.finishedRank ?? '大拉');
                  })
                  .map((player) => (
                    <li key={player.id}>
                      <strong>{player.finishedRank ?? '—'}</strong>
                      <span>{player.name} · {player.team === 'A' ? '甲联' : '乙联'}</span>
                    </li>
                  ))}
              </ol>
            </section>
          )}

          <section className="paper-card gouji-rules">
              <span className="section-kicker">Protocol / Reference</span>
              <h2>协议摘要</h2>
            <ul>
              <li>同点数成组，可挂 2、小王或大王。</li>
              <li>3 必须留到最后；4 必须一次全部打出。</li>
              <li>够级牌出现后，联邦队友不能压牌。</li>
              <li>非对家压够级牌视为烧牌，须已开点并一烧到底。</li>
              <li>出完依次记头科、二科、三科、四科、二拉、大拉。</li>
            </ul>
          </section>

          <section className="paper-card gouji-log">
            <div className="section-title-row">
              <div>
                <span className="section-kicker">Event stream</span>
                <h2>事件日志</h2>
              </div>
            </div>
            <ol>
              {[...game.logs].reverse().map((entry) => (
                <li key={entry.id} className={`gouji-log--${entry.type}`}>
                  <span>{String(entry.id).padStart(2, '0')}</span>
                  <p>{entry.message}</p>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </section>
    </main>
  );
}
