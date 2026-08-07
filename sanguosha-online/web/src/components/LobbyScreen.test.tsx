import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { GAME_REGISTRY } from '../games/registry';
import type { RoomSummary } from '../types';
import { GameProjectCard, isRoomJoinable } from './LobbyScreen';

const waitingRoom: RoomSummary = {
  id: 'waiting-room',
  name: '桃园候场',
  gameType: 'sanguosha',
  status: 'waiting',
  hostId: 'host-1',
  hostName: '玄德',
  playerCount: 1,
  maxPlayers: 5,
};

const playingRoom: RoomSummary = {
  id: 'playing-room',
  name: '赤壁进行中',
  gameType: 'sanguosha',
  status: 'playing',
  hostId: 'host-2',
  hostName: '公瑾',
  playerCount: 5,
  maxPlayers: 5,
};

const rooms: RoomSummary[] = [
  waitingRoom,
  playingRoom,
  {
    id: 'other-game',
    name: '不应出现的够级房',
    gameType: 'gouji',
    status: 'waiting',
    hostId: 'host-3',
    hostName: '子龙',
    playerCount: 4,
    maxPlayers: 6,
  },
];

describe('LobbyScreen game project cards', () => {
  it('only marks waiting rooms with an available seat as joinable', () => {
    expect(isRoomJoinable(waitingRoom)).toBe(true);
    expect(isRoomJoinable(playingRoom)).toBe(false);
    expect(isRoomJoinable({ ...waitingRoom, playerCount: 5 })).toBe(false);
  });

  it('renders every matching room at the bottom of its card with a separate quick-join control', () => {
    const onEnter = vi.fn();
    const onJoin = vi.fn();
    const html = renderToStaticMarkup(
      <GameProjectCard
        gameType="sanguosha"
        registration={GAME_REGISTRY.sanguosha}
        rooms={rooms}
        onEnter={onEnter}
        onJoin={onJoin}
      />,
    );

    expect(html).toContain('桃园候场');
    expect(html).toContain('等待中 · 席位 1 / 5');
    expect(html).toContain('赤壁进行中');
    expect(html).toContain('对局中 · 席位 5 / 5');
    expect(html).not.toContain('不应出现的够级房');
    expect(html).toContain('快速加入');
    expect(html).toContain('</button><div class="game-project-card__rooms"');
  });
});
