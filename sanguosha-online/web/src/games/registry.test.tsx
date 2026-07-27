import { describe, expect, it } from 'vitest';
import { digitBombViewForRoom, GAME_REGISTRY, gameRegistration, splendorViewForRoom } from './registry';

const players = Array.from({ length: 2 }, (_, seat) => ({
  id: `player-${seat}`,
  seat,
  name: `玩家 ${seat + 1}`,
  tokens: {},
  bonuses: {},
  cards: [],
  evolvedCards: [],
  reservedCount: 0,
  publicReservedCards: [],
  nobles: [],
  score: 0,
  evolutionCount: 0,
}));

const pokemonView = {
  kind: 'splendor_pokemon',
  version: 1,
  revision: 0,
  actionPromptId: 'splendor:0:main:player-0',
  status: 'playing',
  phase: 'main',
  currentPlayerId: 'player-0',
  players,
  tokenSupply: {},
  market: {},
  deckCounts: {},
  nobles: [],
  finalRoundTriggered: false,
  winner: null,
  prompt: {
    type: 'take',
    playerId: 'player-0',
    takeOptions: [],
    buyCardIds: [],
    reserveCardIds: [],
    reserveDeckLevels: [],
    evolutionOptions: [],
    canPass: true,
  },
} as const;

describe('game registry', () => {
  it('defines authoritative create-room limits for all six games', () => {
    expect(Object.keys(GAME_REGISTRY)).toEqual([
      'sanguosha',
      'gouji',
      'doudizhu',
      'splendor',
      'splendor_pokemon',
      'digit_bomb',
    ]);
    expect(gameRegistration('splendor')).toMatchObject({
      minimumPlayers: 2,
      maximumPlayers: 4,
      defaultPlayers: 4,
      supportsLlmBots: false,
    });
    expect(gameRegistration('splendor_pokemon').label).toBe('璀璨宝石宝可梦');
    expect(gameRegistration('digit_bomb')).toMatchObject({
      label: '数字炸弹',
      minimumPlayers: 2,
      maximumPlayers: 2,
      defaultPlayers: 2,
      fixedPlayers: true,
      supportsLlmBots: false,
    });
  });

  it('matches a Splendor view only to a room with the same variant', () => {
    expect(splendorViewForRoom(pokemonView, 'splendor_pokemon')).toBe(pokemonView);
    expect(splendorViewForRoom(pokemonView, 'splendor')).toBeNull();
    expect(splendorViewForRoom({ ...pokemonView, kind: 'gouji' }, 'splendor_pokemon')).toBeNull();
  });

  it('matches a Digit Bomb view only to a Digit Bomb room', () => {
    const view = {
      kind: 'digit_bomb',
      version: 1,
      revision: 0,
      actionPromptId: 'digit-bomb:0:1:setup:player-0',
      status: 'playing',
      phase: 'setup',
      digits: 4,
      round: 1,
      roundStarterId: 'player-0',
      currentPlayerId: 'player-0',
      players: players.map((player) => ({
        id: player.id,
        seat: player.seat,
        name: player.name,
        score: 0,
        secretSubmitted: false,
        guesses: [],
        vote: null,
      })),
      ownSecret: null,
      pendingGuess: null,
      roundResult: null,
      winner: null,
      prompt: { type: 'set_secret', playerId: 'player-0' },
    } as const;
    expect(digitBombViewForRoom(view, 'digit_bomb')).toBe(view);
    expect(digitBombViewForRoom(view, 'sanguosha')).toBeNull();
  });
});
