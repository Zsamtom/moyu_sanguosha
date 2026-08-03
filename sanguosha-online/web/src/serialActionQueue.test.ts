import { describe, expect, it } from 'vitest';
import { SerialActionQueue } from './serialActionQueue';

describe('SerialActionQueue', () => {
  it('accepts later clicks immediately but executes saves in order', async () => {
    const pending: number[] = [];
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const queue = new SerialActionQueue((count) => pending.push(count));

    queue.enqueue(async () => {
      order.push('first:start');
      await firstGate;
      order.push('first:end');
    });
    queue.enqueue(async () => {
      order.push('second');
    });

    await Promise.resolve();
    expect(queue.pendingCount).toBe(2);
    expect(order).toEqual(['first:start']);
    releaseFirst();
    await queue.whenIdle();

    expect(order).toEqual(['first:start', 'first:end', 'second']);
    expect(pending).toEqual([1, 2, 1, 0]);
  });

  it('continues with the next save after a failed task', async () => {
    const order: string[] = [];
    const queue = new SerialActionQueue();
    void queue.enqueue(async () => {
      order.push('failed');
      throw new Error('expected failure');
    }).catch(() => undefined);
    queue.enqueue(async () => {
      order.push('continued');
    });

    await queue.whenIdle();
    expect(order).toEqual(['failed', 'continued']);
  });
});
