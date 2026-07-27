import { Button, Popconfirm } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import type {
  AnyGameAction,
  NumberConnectGameView,
  NumberConnectPlayerView,
} from '../types';

interface NumberConnectBoardProps {
  game: NumberConnectGameView;
  userId: string;
  connected: boolean;
  onAction: (action: AnyGameAction) => Promise<void>;
  onExit: () => Promise<void>;
}

const BOARD_SIZE = 5;
const TARGET_LINES = 5;
const BOARD_LINES: readonly (readonly number[])[] = [
  ...Array.from({ length: BOARD_SIZE }, (_, row) =>
    Array.from({ length: BOARD_SIZE }, (_, column) => row * BOARD_SIZE + column),
  ),
  ...Array.from({ length: BOARD_SIZE }, (_, column) =>
    Array.from({ length: BOARD_SIZE }, (_, row) => row * BOARD_SIZE + column),
  ),
  Array.from({ length: BOARD_SIZE }, (_, index) => index * BOARD_SIZE + index),
  Array.from(
    { length: BOARD_SIZE },
    (_, index) => index * BOARD_SIZE + (BOARD_SIZE - 1 - index),
  ),
];

export function numberConnectCompletedLineIndexes(
  board: readonly number[],
  calledNumbers: readonly number[],
): number[][] {
  if (board.length !== BOARD_SIZE ** 2) return [];
  const called = new Set(calledNumbers);
  return BOARD_LINES
    .filter((line) => line.every((index) => called.has(board[index]!)))
    .map((line) => [...line]);
}

function ScoreCard({
  player,
  self,
  current,
}: {
  player: NumberConnectPlayerView;
  self: boolean;
  current: boolean;
}) {
  return (
    <article className={`number-connect-player${self ? ' is-self' : ''}${current ? ' is-current' : ''}`}>
      <span className="number-connect-player__seat">{String(player.seat + 1).padStart(2, '0')}</span>
      <div>
        <small>{self ? 'YOUR BOARD' : 'OPPONENT'}</small>
        <strong>{player.name}</strong>
        <span>{player.botTitle ?? (current ? '正在选择数字' : '等待回合')}</span>
      </div>
      <b>
        {player.lineCount}
        <small>/ {TARGET_LINES} 线</small>
      </b>
      <i
        aria-label={`${player.lineCount} / ${TARGET_LINES} 条线`}
        style={{ '--number-connect-progress': `${Math.min(100, player.lineCount / TARGET_LINES * 100)}%` } as React.CSSProperties}
      />
    </article>
  );
}

function NumberGrid({
  board,
  calledNumbers,
  lastNumber,
  interactive,
  onCall,
  label,
}: {
  board?: readonly number[];
  calledNumbers: readonly number[];
  lastNumber: number | null;
  interactive: boolean;
  onCall?: (number: number) => void;
  label: string;
}) {
  const called = new Set(calledNumbers);
  const completedLines = board
    ? numberConnectCompletedLineIndexes(board, calledNumbers)
    : [];
  const completedCells = new Set(completedLines.flat());

  if (!board) {
    return (
      <div className="number-connect-grid number-connect-grid--hidden" aria-label={`${label}，仅本人可见`}>
        {Array.from({ length: BOARD_SIZE ** 2 }, (_, index) => (
          <span key={index}><i aria-hidden="true" /></span>
        ))}
        <div>
          <strong>排列已隐藏</strong>
          <small>PRIVATE BOARD</small>
        </div>
      </div>
    );
  }

  return (
    <div className="number-connect-grid" aria-label={label}>
      {board.map((number, index) => {
        const marked = called.has(number);
        const inLine = completedCells.has(index);
        return (
          <button
            key={number}
            type="button"
            className={`${marked ? 'is-marked' : ''}${number === lastNumber ? ' is-last' : ''}${inLine ? ' is-line' : ''}`}
            disabled={!interactive || marked}
            aria-label={`${number}${marked ? '，已打叉' : interactive ? '，选择此数字' : ''}`}
            onClick={() => onCall?.(number)}
          >
            <span>{number}</span>
            {marked && <i aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}

export function NumberConnectBoard({
  game,
  userId,
  connected,
  onAction,
  onExit,
}: NumberConnectBoardProps) {
  const [busy, setBusy] = useState(false);
  const self = game.players.find((player) => player.id === userId);
  const opponent = game.players.find((player) => player.id !== userId);
  const isMyTurn = game.status === 'playing' &&
    game.prompt.type === 'call' &&
    game.prompt.playerId === userId;
  const canCall = connected && isMyTurn && !busy;
  const called = useMemo(() => new Set(game.calledNumbers), [game.calledNumbers]);
  const availableCount = 25 - called.size;

  useEffect(() => {
    setBusy(false);
  }, [game.actionPromptId]);

  const callNumber = async (number: number) => {
    if (!canCall || called.has(number)) return;
    setBusy(true);
    try {
      await onAction({
        type: 'number_connect_call',
        playerId: userId,
        number,
      });
    } finally {
      setBusy(false);
    }
  };

  if (!self || !opponent) {
    return (
      <main className="number-connect-board">
        <div className="number-connect-sync">正在同步数字棋盘……</div>
      </main>
    );
  }

  const winners = new Set(game.winner?.playerIds ?? []);
  const currentPlayer = game.players.find((player) => player.id === game.currentPlayerId);
  const resultTitle = winners.size > 1
    ? '双方同时完成五线'
    : winners.has(userId)
      ? '你率先完成五条线'
      : game.winner?.reason === 'forfeit'
        ? '对手赢得本局'
        : `${opponent.name} 率先完成五条线`;

  return (
    <main className={`number-connect-board${game.status === 'finished' ? ' number-connect-board--finished' : ''}`}>
      <div className="number-connect-board__pattern" aria-hidden="true" />
      <header className="number-connect-header">
        <div>
          <span>NUMBER LINK / FIVE BY FIVE</span>
          <h1>数字连连看</h1>
          <p>轮流叫号 · 双方同步打叉 · 横竖斜连成一线得 1 分</p>
        </div>
        <div className="number-connect-header__tools">
          <span className={connected ? 'is-online' : ''}>
            <i aria-hidden="true" />
            {connected ? '实时同步' : '正在重连'}
          </span>
          <Popconfirm
            title="确定退出数字连连看？"
            description="进行中的对局会按放弃处理。"
            onConfirm={() => void onExit()}
          >
            <Button danger>{game.status === 'finished' ? '返回大厅' : '退出对局'}</Button>
          </Popconfirm>
        </div>
      </header>

      <section className="number-connect-scoreboard" aria-label="双方连线得分">
        {game.players.map((player) => (
          <ScoreCard
            key={player.id}
            player={player}
            self={player.id === userId}
            current={player.id === game.currentPlayerId}
          />
        ))}
      </section>

      {game.status === 'finished' ? (
        <>
          <section className="number-connect-result" aria-live="polite">
            <span>{game.winner?.reason === 'forfeit' ? 'MATCH CLOSED' : 'FIVE LINES COMPLETE'}</span>
            <h2>{resultTitle}</h2>
            <p>
              {game.winner?.reason === 'forfeit'
                ? '一方退出，本局提前结束；双方棋盘仍各自保密。'
                : game.winner?.playerIds.length === 2
                  ? `最后叫出的 ${game.lastNumber} 同时令双方达到五线，本局并列获胜。`
                  : `最后叫出的数字是 ${game.lastNumber}；对方的数字排列不会公开。`}
            </p>
          </section>
          <section className="number-connect-reveal" aria-label="你的最终棋盘">
            <article className={winners.has(self.id) ? 'is-winner' : ''}>
              <header>
                <div>
                  <span>你的棋盘</span>
                  <strong>{self.name}</strong>
                </div>
                <b>{self.lineCount}<small>条线</small></b>
              </header>
              <NumberGrid
                board={self.board}
                calledNumbers={game.calledNumbers}
                lastNumber={game.lastNumber}
                interactive={false}
                label="你的最终棋盘"
              />
            </article>
          </section>
          <div className="number-connect-final-action">
            <Button type="primary" size="large" onClick={() => void onExit()}>返回游戏大厅</Button>
          </div>
        </>
      ) : (
        <section className="number-connect-table">
          <article className="number-connect-own-board">
            <header>
              <div>
                <span>YOUR NUMBER FIELD</span>
                <h2>你的 5×5 棋盘</h2>
              </div>
              <div>
                <strong>{self.lineCount}</strong>
                <span>已完成线</span>
              </div>
            </header>
            <NumberGrid
              board={self.board}
              calledNumbers={game.calledNumbers}
              lastNumber={game.lastNumber}
              interactive={canCall}
              onCall={(number) => void callNumber(number)}
              label="你的数字棋盘"
            />
            <footer>
              <span>已叫号 <strong>{game.calledNumbers.length}</strong></span>
              <span>剩余 <strong>{availableCount}</strong></span>
              <span>上次 <strong>{game.lastNumber ?? '—'}</strong></span>
            </footer>
          </article>

          <aside className="number-connect-side">
            <section className={`number-connect-turn${isMyTurn ? ' is-mine' : ''}`} aria-live="polite">
              <span>{isMyTurn ? 'YOUR TURN' : 'WAITING'}</span>
              <h2>{isMyTurn ? '请选择一个未打叉的数字' : `等待 ${currentPlayer?.name ?? '对手'} 叫号`}</h2>
              <p>
                {isMyTurn
                  ? '你选中的数字会同时在双方棋盘上标记，提交后不能撤销。'
                  : game.lastNumber
                    ? `上一回合选择了 ${game.lastNumber}，棋盘已经同步更新。`
                    : '首位玩家正在观察自己的数字排列。'}
              </p>
              {busy && <small>正在提交选择……</small>}
            </section>

            <section className="number-connect-rules">
              <span>得分说明</span>
              <ul>
                <li><i />横向 5 格全部打叉</li>
                <li><i />竖向 5 格全部打叉</li>
                <li><i />任一斜向 5 格全部打叉</li>
              </ul>
              <strong>先完成 {TARGET_LINES} 条线获胜</strong>
              <small>双方棋盘始终独立保密，只展示连线分数。</small>
            </section>
          </aside>
        </section>
      )}
    </main>
  );
}
