import { Button, Popconfirm } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import type {
  AnyGameAction,
  DigitBombGameView,
  DigitBombGuessRecord,
  DigitBombPlayerView,
  DigitBombVote,
} from '../types';

interface DigitBombBoardProps {
  game: DigitBombGameView;
  userId: string;
  connected: boolean;
  onAction: (action: AnyGameAction) => Promise<void>;
  onExit: () => Promise<void>;
}

export function sanitizeDigitBombEntry(value: string, digits: number): string {
  return value.replace(/\D/g, '').slice(0, digits);
}

export function generateRandomDigitCode(
  digits: number,
  randomDigit?: () => number,
): string {
  if (!Number.isInteger(digits) || digits < 1 || digits > 8) {
    throw new Error('数字炸弹位数必须为 1 至 8');
  }
  const draw = randomDigit ?? (() => {
    if (!globalThis.crypto?.getRandomValues) return Math.floor(Math.random() * 10);
    const buffer = new Uint32Array(1);
    globalThis.crypto.getRandomValues(buffer);
    return buffer[0]! % 10;
  });
  return Array.from({ length: digits }, () => String(Math.abs(Math.trunc(draw())) % 10)).join('');
}

export function digitBombFeedbackOptions(digits: number): number[] {
  return Array.from({ length: digits + 1 }, (_, index) => index);
}

export function digitBombCardBackSlots(digits: number): number[] {
  return Array.from({ length: digits }, (_, index) => index);
}

export function digitBombVisibleSecretSlots(
  ownSecret: string | null,
  digits: number,
  visible: boolean,
  self: boolean,
): Array<string | null> {
  const concealed = digitBombCardBackSlots(digits).map(() => null);
  if (
    !self ||
    !visible ||
    ownSecret === null ||
    ownSecret.length !== digits ||
    !/^[0-9]+$/.test(ownSecret)
  ) {
    return concealed;
  }
  return [...ownSecret];
}

export function digitBombFeedbackLabel(record: DigitBombGuessRecord, digits: number): string {
  if (record.feedback === null) return '等待反馈';
  if (record.feedback === digits) return '完全命中';
  return `${record.feedback} 位命中`;
}

function voteLabel(vote: DigitBombVote | null): string {
  if (vote === 'rematch') return '再来一局';
  if (vote === 'settle') return '最终结算';
  return '尚未选择';
}

function PlayerCard({
  player,
  self,
  active,
  digits,
  ownSecret,
  secretVisible,
  onToggleSecret,
}: {
  player: DigitBombPlayerView;
  self: boolean;
  active: boolean;
  digits: number;
  ownSecret: string | null;
  secretVisible: boolean;
  onToggleSecret: () => void;
}) {
  const secretSlots = digitBombVisibleSecretSlots(ownSecret, digits, secretVisible, self);
  return (
    <article className={`digit-bomb-player${self ? ' is-self' : ''}${active ? ' is-active' : ''}`}>
      <div className="digit-bomb-avatar" aria-hidden="true">{player.name.slice(0, 1)}</div>
      <div className="digit-bomb-player__identity">
        <span>{self ? '你的频道' : `P${player.seat + 1}`}</span>
        <strong>{player.name}</strong>
        <small>{player.botTitle ?? (active ? '信号已锁定' : '等待指令')}</small>
      </div>
      <div className="digit-bomb-score">
        <strong>{player.score}</strong>
        <span>累计积分</span>
      </div>
      <div className={`digit-bomb-secret-light${player.secretSubmitted ? ' is-ready' : ''}`}>
        <i aria-hidden="true" />
        {player.secretSubmitted ? '密码已装载' : '正在设置'}
      </div>
      <div
        className={`digit-bomb-card-backs${player.secretSubmitted ? ' is-loaded' : ''}`}
        style={{ '--digit-bomb-digits': digits } as React.CSSProperties}
        aria-label={`${player.name} 的 ${digits} 位密码卡背`}
      >
        {secretSlots.map((digit, slot) => (
          <i
            key={slot}
            aria-hidden="true"
            className={digit === null ? undefined : 'is-revealed'}
          >
            {digit}
          </i>
        ))}
      </div>
      {self && ownSecret !== null && (
        <Button
          size="small"
          className="digit-bomb-secret-toggle"
          aria-label={secretVisible ? '隐藏我的秘密数字' : '查看我的秘密数字'}
          aria-pressed={secretVisible}
          onClick={onToggleSecret}
        >
          {secretVisible ? '隐藏我的数字' : '查看我的数字'}
        </Button>
      )}
    </article>
  );
}

function GuessHistory({
  player,
  digits,
  active,
}: {
  player: DigitBombPlayerView;
  digits: number;
  active: boolean;
}) {
  return (
    <section className={`digit-bomb-history${active ? ' is-active' : ''}`}>
      <header>
        <div>
          <span>GUESS LOG / P{player.seat + 1}</span>
          <strong>{player.name} 的拆弹记录</strong>
        </div>
        <b>{player.guesses.length}<small>次尝试</small></b>
      </header>
      {player.guesses.length ? (
        <ol>
          {[...player.guesses].reverse().map((record, reverseIndex) => {
            const attempt = player.guesses.length - reverseIndex;
            return (
              <li key={`${attempt}-${record.value}`} className={record.feedback === digits ? 'is-defused' : ''}>
                <span>{String(attempt).padStart(2, '0')}</span>
                <code>{record.value}</code>
                <b>{digitBombFeedbackLabel(record, digits)}</b>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="digit-bomb-history__empty">
          <i aria-hidden="true" />
          <strong>暂无扫描记录</strong>
          <span>第一组猜测将在这里出现</span>
        </div>
      )}
    </section>
  );
}

export function DigitBombBoard({
  game,
  userId,
  connected,
  onAction,
  onExit,
}: DigitBombBoardProps) {
  const self = game.players.find((player) => player.id === userId);
  const [entry, setEntry] = useState('');
  const [secretVisible, setSecretVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setEntry('');
    setSecretVisible(false);
    setBusy(false);
  }, [game.actionPromptId]);

  const resultWinner = game.roundResult
    ? game.players.find((player) => player.id === game.roundResult?.winnerId)
    : undefined;
  const promptIsMine = game.prompt.playerId === userId;
  const canSubmit = connected && promptIsMine && !busy;
  const rankings = useMemo(() => game.winner?.rankings ?? [], [game.winner]);

  const submit = async (action: AnyGameAction) => {
    if (busy) return;
    setBusy(true);
    try {
      await onAction(action);
    } finally {
      setBusy(false);
    }
  };

  if (!self) {
    return <main className="digit-bomb-board"><div className="digit-bomb-sync">正在接入拆弹频道……</div></main>;
  }

  if (game.status === 'finished' && game.winner) {
    const winners = new Set(game.winner.playerIds);
    return (
      <main className="digit-bomb-board digit-bomb-board--finished">
        <div className="digit-bomb-grid-bg" aria-hidden="true" />
        <section className="digit-bomb-final">
          <span className="digit-bomb-kicker">DIGIT BOMB FIELD MANUAL / FINAL RECORD</span>
          <h1>{winners.has(userId) ? '你赢得了拆弹对决' : '最终信号已结算'}</h1>
          <p>{game.winner.reason === 'forfeit' ? '对手退出，本次任务提前结束。' : `历经 ${game.round} 局后，积分排行已经锁定。`}</p>
          <ol className="digit-bomb-final__ranking">
            {rankings.map((ranking, index) => {
              const player = game.players.find((candidate) => candidate.id === ranking.playerId);
              const maxScore = Math.max(1, ...rankings.map((candidate) => candidate.score));
              return (
                <li
                  key={ranking.playerId}
                  className={winners.has(ranking.playerId) ? 'is-winner' : ''}
                  style={{ '--digit-score-ratio': `${Math.max(8, (ranking.score / maxScore) * 100)}%` } as React.CSSProperties}
                >
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <div><strong>{player?.name ?? '已离席玩家'}</strong><i aria-hidden="true" /></div>
                  <b>{ranking.score}<small>PTS</small></b>
                </li>
              );
            })}
          </ol>
          <Button type="primary" size="large" onClick={() => void onExit()}>返回游戏大厅</Button>
        </section>
      </main>
    );
  }

  const phaseLabel = game.phase === 'setup'
    ? '装载秘密数字'
    : game.phase === 'guess'
      ? '扫描数字信号'
      : game.phase === 'feedback'
        ? '等待人工反馈'
        : '本局拆弹完成';
  const waitingPlayer = game.currentPlayerId
    ? game.players.find((player) => player.id === game.currentPlayerId)
    : undefined;

  return (
    <main className="digit-bomb-board">
      <div className="digit-bomb-grid-bg" aria-hidden="true" />
      <header className="digit-bomb-header">
        <div>
          <span className="digit-bomb-kicker">DIGIT BOMB FIELD MANUAL / CONTROL SHEET</span>
          <h1>数字炸弹</h1>
          <p>第 {game.round} 局 · {game.digits} 位密码 · {phaseLabel}</p>
        </div>
        <div className="digit-bomb-header__status">
          <span className={connected ? 'is-online' : ''}><i aria-hidden="true" />{connected ? '频道在线' : '正在重连'}</span>
          <Popconfirm title="确定退出数字炸弹？" description="进行中的对决会按放弃处理。" onConfirm={() => void onExit()}>
            <Button danger>紧急退出</Button>
          </Popconfirm>
        </div>
      </header>

      <section className="digit-bomb-versus" aria-label="双方累计积分">
        <PlayerCard
          player={game.players[0]!}
          self={game.players[0]!.id === userId}
          active={game.currentPlayerId === game.players[0]!.id}
          digits={game.digits}
          ownSecret={game.ownSecret}
          secretVisible={secretVisible}
          onToggleSecret={() => setSecretVisible((visible) => !visible)}
        />
        <div className="digit-bomb-versus__mark" aria-hidden="true"><span>VS</span><i /></div>
        <PlayerCard
          player={game.players[1]!}
          self={game.players[1]!.id === userId}
          active={game.currentPlayerId === game.players[1]!.id}
          digits={game.digits}
          ownSecret={game.ownSecret}
          secretVisible={secretVisible}
          onToggleSecret={() => setSecretVisible((visible) => !visible)}
        />
      </section>

      <section className="digit-bomb-console" aria-live="polite">
        <div className="digit-bomb-console__scan" aria-hidden="true" />
        {game.prompt.type === 'set_secret' ? (
          <div className="digit-bomb-entry-panel">
            <span>ARM YOUR NUMBER</span>
            <h2>设置本局秘密数字</h2>
            <p>输入恰好 {game.digits} 位数字。可以 0 开头，也可以重复；密码不会显示给对手。</p>
            <div className="digit-bomb-entry">
              <input
                aria-label="秘密数字"
                type={secretVisible ? 'text' : 'password'}
                inputMode="numeric"
                autoComplete="off"
                maxLength={game.digits}
                value={entry}
                placeholder={'•'.repeat(game.digits)}
                onChange={(event) => setEntry(sanitizeDigitBombEntry(event.target.value, game.digits))}
              />
              <span>{entry.length} / {game.digits}</span>
            </div>
            <div className="digit-bomb-entry-actions">
              <Button onClick={() => setEntry(generateRandomDigitCode(game.digits))}>随机生成</Button>
              <Button onClick={() => setSecretVisible((visible) => !visible)}>{secretVisible ? '隐藏数字' : '显示数字'}</Button>
              <Button
                type="primary"
                disabled={!canSubmit || entry.length !== game.digits}
                loading={busy}
                onClick={() => void submit({ type: 'digit_bomb_set_secret', playerId: userId, secret: entry })}
              >
                装载炸弹
              </Button>
            </div>
          </div>
        ) : game.prompt.type === 'guess' ? (
          <div className="digit-bomb-entry-panel">
            <span>ENTER DISARM CODE</span>
            <h2>输入你的第 {self.guesses.length + 1} 次猜测</h2>
            <p>每一位都独立判断位置是否正确；提交后由对手人工反馈命中位数。</p>
            <div className="digit-bomb-entry digit-bomb-entry--guess">
              <input
                aria-label="猜测数字"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                autoFocus
                maxLength={game.digits}
                value={entry}
                placeholder={'0'.repeat(game.digits)}
                onChange={(event) => setEntry(sanitizeDigitBombEntry(event.target.value, game.digits))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && canSubmit && entry.length === game.digits) {
                    void submit({ type: 'digit_bomb_guess', playerId: userId, guess: entry });
                  }
                }}
              />
              <span>{entry.length} / {game.digits}</span>
            </div>
            <Button
              type="primary"
              size="large"
              disabled={!canSubmit || entry.length !== game.digits}
              loading={busy}
              onClick={() => void submit({ type: 'digit_bomb_guess', playerId: userId, guess: entry })}
            >
              发出扫描
            </Button>
          </div>
        ) : game.prompt.type === 'feedback' ? (
          <div className="digit-bomb-feedback-panel">
            <span>MANUAL RESPONSE REQUIRED</span>
            <h2>对手提交了第 {game.prompt.pendingGuess.attempt} 次猜测</h2>
            <code>{game.prompt.pendingGuess.value}</code>
            <p>请根据你设置的秘密数字，人工选择位置正确的位数。</p>
            <div className="digit-bomb-feedback-options">
              {digitBombFeedbackOptions(game.digits).map((correctPositions) => (
                <button
                  key={correctPositions}
                  type="button"
                  disabled={!canSubmit}
                  onClick={() => void submit({
                    type: 'digit_bomb_feedback',
                    playerId: userId,
                    correctPositions,
                  })}
                >
                  <strong>{correctPositions}</strong>
                  <span>{correctPositions === game.digits ? '全部正确' : '位正确'}</span>
                </button>
              ))}
            </div>
            <small>反馈由出题者确认，系统不会在浏览器中比对真实密码。</small>
          </div>
        ) : (
          <div className="digit-bomb-waiting">
            <div className="digit-bomb-radar" aria-hidden="true"><i /><i /></div>
            <span>{game.phase === 'setup' ? '密码已安全提交' : '信号正在传输'}</span>
            <h2>
              {game.phase === 'setup'
                ? '等待对手装载秘密数字'
                : game.phase === 'feedback'
                  ? '等待出题者反馈命中位数'
                  : `等待 ${waitingPlayer?.name ?? '对手'} 行动`}
            </h2>
            {game.pendingGuess && <code>{game.pendingGuess.value}</code>}
          </div>
        )}
      </section>

      {game.phase !== 'setup' && (
        <section className="digit-bomb-histories" aria-label="双方猜测历史">
          {game.players.map((player) => (
            <GuessHistory
              key={player.id}
              player={player}
              digits={game.digits}
              active={game.currentPlayerId === player.id || game.pendingGuess?.guesserId === player.id}
            />
          ))}
        </section>
      )}

      {game.phase === 'round_finished' && game.roundResult && (
        <section className="digit-bomb-round-modal" role="dialog" aria-modal="true" aria-labelledby="digit-bomb-round-result">
          <div className="digit-bomb-fireworks" aria-hidden="true">
            {Array.from({ length: 12 }, (_, index) => <i key={index} />)}
          </div>
          <div className="digit-bomb-round-modal__card">
            <span className="digit-bomb-kicker">BOMB DEFUSED</span>
            <h2 id="digit-bomb-round-result">{resultWinner?.name ?? '玩家'} 拆弹成功</h2>
            <p>第 {game.roundResult.attempts} 次猜测完全命中，获得 <strong>+{game.roundResult.points}</strong> 积分。</p>
            <div className="digit-bomb-vote-state">
              {game.players.map((player) => (
                <div key={player.id}>
                  <span>{player.name}</span>
                  <strong>{voteLabel(player.vote)}</strong>
                </div>
              ))}
            </div>
            <div className="digit-bomb-vote-actions">
              <Button
                type={self.vote === 'rematch' ? 'primary' : 'default'}
                disabled={!connected || busy}
                onClick={() => void submit({ type: 'digit_bomb_vote', playerId: userId, vote: 'rematch' })}
              >
                再来一局
              </Button>
              <Button
                type={self.vote === 'settle' ? 'primary' : 'default'}
                disabled={!connected || busy}
                onClick={() => void submit({ type: 'digit_bomb_vote', playerId: userId, vote: 'settle' })}
              >
                最终结算
              </Button>
            </div>
            <small>
              {self.vote
                ? game.players.every((player) => player.vote !== null)
                  ? '双方选择不同，可修改选择直至达成一致。'
                  : `你已选择“${voteLabel(self.vote)}”，等待对手。`
                : '双方选择一致后才会继续或结算。'}
            </small>
          </div>
        </section>
      )}
    </main>
  );
}
