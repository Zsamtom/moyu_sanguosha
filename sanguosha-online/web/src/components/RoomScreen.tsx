import { Alert, Button, Popconfirm, Tag, Tooltip } from 'antd';
import { useMemo, useState } from 'react';
import { getRoomStartBlockReason } from '../interactionRules';
import type { AuthUser, RoomDetail } from '../types';

interface RoomScreenProps {
  room: RoomDetail;
  user: AuthUser;
  connected: boolean;
  onReady: (ready: boolean) => Promise<void>;
  onStart: () => Promise<void>;
  onLeave: () => Promise<void>;
  onAddBot: () => Promise<void>;
  onRemoveBot: (botId: string) => Promise<void>;
}

export function RoomScreen({ room, user, connected, onReady, onStart, onLeave, onAddBot, onRemoveBot }: RoomScreenProps) {
  const [busy, setBusy] = useState<'ready' | 'start' | 'leave'>();
  const self = room.members.find((member) => member.userId === user.id || member.username === user.username);
  const isHost = self?.isHost || room.hostId === user.id;
  const allReady = room.members.every((member) => member.ready);
  const allOnline = room.members.every((member) => member.online);
  const startBlockReason = getRoomStartBlockReason(room, connected);
  const canStart = Boolean(isHost && !startBlockReason);

  const seats = useMemo(() => {
    const bySeat = new Map(room.members.map((member) => [member.seat, member]));
    return Array.from({ length: room.maxPlayers }, (_, index) => ({ seat: index, member: bySeat.get(index) }));
  }, [room.maxPlayers, room.members]);

  const copyRoomId = async () => {
    try {
      await navigator.clipboard.writeText(room.id);
    } catch {
      // Clipboard access is optional; the visible room id remains selectable.
    }
  };

  const ready = async () => {
    setBusy('ready');
    try {
      await onReady(!self?.ready);
    } finally {
      setBusy(undefined);
    }
  };

  const start = async () => {
    setBusy('start');
    try {
      await onStart();
    } finally {
      setBusy(undefined);
    }
  };

  const leave = async () => {
    setBusy('leave');
    try {
      await onLeave();
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <main className="page room-page">
      <section className="room-heading paper-card">
        <div>
          <span className="section-kicker">候战席</span>
          <h1>{room.name}</h1>
          <button className="room-id" type="button" onClick={() => void copyRoomId()} title="复制房间号">
            房间号 {room.id} · 点击复制
          </button>
        </div>
        <div className="room-heading__status">
          <Tag color="green">等待开始</Tag>
          <span>{room.playerCount} / {room.maxPlayers} 人</span>
        </div>
      </section>

      {!connected && (
        <Alert className="connection-alert" type="warning" showIcon message="实时连接暂时中断，恢复前无法准备或开始游戏。" />
      )}

      <section className="seat-section">
        <div className="section-title-row">
          <div>
            <h2>在席玩家</h2>
            <p>房主开始游戏后，身份与武将将由系统分配。</p>
          </div>
          <span className="ready-summary">
            {room.members.filter((member) => member.ready).length} / {room.members.length} 已就绪
          </span>
        </div>
        <div className="seat-grid">
          {seats.map(({ seat, member }) => (
            <article
              key={seat}
              className={member ? `seat-card${member.userId === user.id ? ' seat-card--self' : ''}` : 'seat-card seat-card--empty'}
            >
              <span className="seat-number">{seat + 1}</span>
              {member ? (
                <>
                  <div className="player-monogram" aria-hidden="true">{member.displayName.slice(0, 1)}</div>
                  <div className="seat-card__identity">
                    <h3>{member.displayName}</h3>
                    <p>@{member.username || 'player'}</p>
                  </div>
                  <div className="seat-card__tags">
                    {member.isHost && <Tag color="gold">房主</Tag>}
                    {member.isBot && <Tag color="blue">机器人</Tag>}
                    <Tag color={member.ready ? 'green' : 'default'}>
                      {member.ready ? '已准备' : '未准备'}
                    </Tag>
                    {!member.online && <Tag>离线</Tag>}
                    {isHost && member.isBot && (
                      <Button size="small" danger onClick={() => void onRemoveBot(member.userId)}>移除</Button>
                    )}
                  </div>
                </>
              ) : (
                <div className="empty-seat">
                  <span>空</span>
                  <p>等待玩家加入</p>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="paper-card room-actions">
        <div>
          <h2>{self?.ready ? '你已准备就绪' : '准备好了吗？'}</h2>
          <p>
            {isHost && startBlockReason
              ? `${startBlockReason}。`
              : isHost && allReady && allOnline
                ? '所有玩家已准备，可以开始。'
                : self?.ready
                  ? '请等待房主开始游戏。'
                  : '准备后仍可在开局前取消。'}
          </p>
        </div>
        <div className="room-actions__buttons">
          <Button
            type={self?.ready ? 'default' : 'primary'}
            size="large"
            disabled={!connected}
            loading={busy === 'ready'}
            onClick={() => void ready()}
          >
            {self?.ready ? '取消准备' : '准备'}
          </Button>
          {isHost && (
            <Tooltip title={startBlockReason}>
              <Button
                className="primary-ink-button"
                type="primary"
                size="large"
                disabled={!canStart}
                loading={busy === 'start'}
                onClick={() => void start()}
              >
                开始游戏
              </Button>
            </Tooltip>
          )}
          {isHost && room.playerCount < room.maxPlayers && (
            <Button size="large" disabled={!connected} onClick={() => void onAddBot()}>添加机器人</Button>
          )}
          <Popconfirm title="确定离开房间？" description={isHost ? '房主离开后，房主身份将移交或房间关闭。' : undefined} onConfirm={() => void leave()}>
            <Button danger size="large" loading={busy === 'leave'}>离开房间</Button>
          </Popconfirm>
        </div>
      </section>
    </main>
  );
}
