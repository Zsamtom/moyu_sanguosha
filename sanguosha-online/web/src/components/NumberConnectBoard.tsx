import { Button, Popconfirm } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import type {
  AnyGameAction,
  NumberConnectGameView,
  NumberConnectPlayerView,
  RoomDetail,
} from '../types';

interface NumberConnectBoardProps {
  game: NumberConnectGameView;
  room: RoomDetail | null;
  userId: string;
  connected: boolean;
  onAction: (action: AnyGameAction) => Promise<void>;
  onExit: () => Promise<void>;
  onRematch: () => Promise<void>;
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
  lineCount = player.lineCount,
}: {
  player: NumberConnectPlayerView;
  self: boolean;
  lineCount?: number;
}) {
  return (
    <article className={`number-connect-player${self ? ' is-self' : ''}`}>
      <span className="number-connect-player__seat">{String(player.seat + 1).padStart(2, '0')}</span>
      <div>
        <small>{self ? 'YOUR BOARD' : 'OPPONENT'}</small>
        <strong>{player.name}</strong>
        <span>{self ? '自由标记中' : '实时竞速中'}</span>
      </div>
      <b>
        {lineCount}
        <small>/ {TARGET_LINES} 线</small>
      </b>
      <i
        aria-label={`${lineCount} / ${TARGET_LINES} 条线`}
        style={{ '--number-connect-progress': `${Math.min(100, lineCount / TARGET_LINES * 100)}%` } as React.CSSProperties}
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
  room,
  userId,
  connected,
  onAction,
  onExit,
  onRematch,
}: NumberConnectBoardProps) {
  const [pendingNumbers, setPendingNumbers] = useState<Set<number>>(() => new Set());
  const [localLastNumber, setLocalLastNumber] = useState<number | null>(null);
  const [rematchBusy, setRematchBusy] = useState(false);
  const self = game.players.find((player) => player.id === userId);
  const opponent = game.players.find((player) => player.id !== userId);
  const canPlay = game.status === 'playing' &&
    game.prompt.type === 'call' &&
    game.prompt.playerId === userId;
  const canCall = connected && canPlay;
  const confirmedNumbersKey = game.calledNumbers.join(',');
  const displayedNumbers = useMemo(
    () => [...new Set([...game.calledNumbers, ...pendingNumbers])],
    [game.calledNumbers, pendingNumbers],
  );
  const called = useMemo(() => new Set(displayedNumbers), [displayedNumbers]);
  const availableCount = 25 - called.size;
  const displayedLastNumber = localLastNumber ?? game.lastNumber;
  const displayedLineCount = self?.board
    ? numberConnectCompletedLineIndexes(self.board, displayedNumbers).length
    : self?.lineCount ?? 0;
  const selfReadyForRematch =
    room?.members.find((member) => member.userId === userId)?.ready ?? false;

  useEffect(() => {
    const confirmed = new Set(game.calledNumbers);
    setPendingNumbers((current) => {
      const remaining = new Set([...current].filter((number) => !confirmed.has(number)));
      return remaining.size === current.size ? current : remaining;
    });
  }, [confirmedNumbersKey]);

  useEffect(() => {
    if (game.status === 'playing' && game.revision === 0 && game.calledNumbers.length === 0) {
      setPendingNumbers(new Set());
      setLocalLastNumber(null);
      setRematchBusy(false);
    }
  }, [game.revision, game.status]);

  const callNumber = async (number: number) => {
    if (!canCall || called.has(number)) return;
    setPendingNumbers((current) => new Set(current).add(number));
    setLocalLastNumber(number);
    try {
      await onAction({
        type: 'number_connect_call',
        playerId: userId,
        number,
      });
    } catch (error) {
      setPendingNumbers((current) => {
        const next = new Set(current);
        next.delete(number);
        return next;
      });
      setLocalLastNumber(game.lastNumber);
      throw error;
    }
  };

  const requestRematch = async () => {
    if (rematchBusy || selfReadyForRematch) return;
    setRematchBusy(true);
    try {
      await onRematch();
    } finally {
      setRematchBusy(false);
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
  const resultTitle = winners.has(userId)
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
          <p>双方自由点选 · 只标记自己的棋盘 · 横竖斜连成一线得 1 分</p>
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
            lineCount={player.id === userId ? displayedLineCount : player.lineCount}
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
                ? '一方退出，本局提前结束；双方最终棋盘已公开。'
                : winners.has(userId)
                  ? `你标记数字 ${game.lastNumber} 后率先完成五线；双方最终棋盘已公开。`
                  : '对手已经率先完成五线；双方最终棋盘已公开。'}
            </p>
          </section>
          <section className="number-connect-reveal" aria-label="双方最终棋盘">
            {game.players.map((player) => (
              <article key={player.id} className={winners.has(player.id) ? 'is-winner' : ''}>
                <header>
                  <div>
                    <span>{player.id === userId ? '你的棋盘' : '对手棋盘'}</span>
                    <strong>{player.name}</strong>
                  </div>
                  <b>{player.lineCount}<small>条线</small></b>
                </header>
                <NumberGrid
                  board={player.board}
                  calledNumbers={player.markedNumbers ?? (
                    player.id === userId ? game.calledNumbers : []
                  )}
                  lastNumber={player.id === userId ? game.lastNumber : null}
                  interactive={false}
                  label={`${player.name} 的最终棋盘`}
                />
              </article>
            ))}
          </section>
          <div className="number-connect-final-action">
            <Button
              type="primary"
              size="large"
              disabled={!connected || selfReadyForRematch}
              loading={rematchBusy}
              onClick={() => void requestRematch()}
            >
              {selfReadyForRematch ? '已确认，等待对方' : '再来一局'}
            </Button>
            <Button size="large" onClick={() => void onExit()}>返回游戏大厅</Button>
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
              calledNumbers={displayedNumbers}
              lastNumber={displayedLastNumber}
              interactive={canCall}
              onCall={(number) => void callNumber(number)}
              label="你的数字棋盘"
            />
            <footer>
              <span>已标记 <strong>{game.calledNumbers.length}</strong></span>
              <span>剩余 <strong>{availableCount}</strong></span>
              <span>上次 <strong>{game.lastNumber ?? '—'}</strong></span>
            </footer>
          </article>

          <aside className="number-connect-side">
            <section className="number-connect-turn is-mine" aria-live="polite">
              <span>LIVE RACE</span>
              <h2>随时选择自己棋盘上的数字</h2>
              <p>每次点击只会在你的棋盘上打叉，不会改变对手的棋盘；双方无需轮流等待。</p>
            </section>

            <section className="number-connect-rules">
              <span>得分说明</span>
              <ul>
                <li><i />横向 5 格全部打叉</li>
                <li><i />竖向 5 格全部打叉</li>
                <li><i />任一斜向 5 格全部打叉</li>
              </ul>
              <strong>先完成 {TARGET_LINES} 条线获胜</strong>
              <small>对局中棋盘独立保密，结算后公开双方最终棋盘。</small>
            </section>
          </aside>
        </section>
      )}
    </main>
  );
}
