import { describe, expect, it } from 'vitest';
import { numberConnectCompletedLineIndexes } from './NumberConnectBoard';

const board = Array.from({ length: 25 }, (_, index) => index + 1);

describe('NumberConnectBoard helpers', () => {
  it('detects horizontal, vertical, and diagonal completed lines', () => {
    const called = [
      1, 2, 3, 4, 5,
      6, 11, 16, 21,
      7, 13, 19, 25,
      9, 17,
    ];
    expect(numberConnectCompletedLineIndexes(board, called)).toEqual([
      [0, 1, 2, 3, 4],
      [0, 5, 10, 15, 20],
      [0, 6, 12, 18, 24],
      [4, 8, 12, 16, 20],
    ]);
  });

  it('returns no lines for an unavailable board', () => {
    expect(numberConnectCompletedLineIndexes([], [1, 2, 3, 4, 5])).toEqual([]);
  });
});
