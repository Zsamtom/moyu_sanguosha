import { describe, expect, it, vi } from 'vitest';
import {
  awaitWithAbort,
  SerialActionQueue,
  SerialActionQueueCancelledError,
  SerialActionTimeoutError,
} from './serialActionQueue';

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

  it('times out a stalled request, cancels stale work, and accepts a recovered action', async () => {
    vi.useFakeTimers();
    try {
      const order: string[] = [];
      const queue = new SerialActionQueue(undefined, 500);
      const never = new Promise<void>(() => undefined);
      const stalled = queue.enqueue(async (signal) => {
        order.push('stalled');
        await awaitWithAbort(never, signal);
      });
      const stale = queue.enqueue(async () => {
        order.push('stale');
      });

      await vi.advanceTimersByTimeAsync(500);
      await expect(stalled).rejects.toBeInstanceOf(SerialActionTimeoutError);
      await expect(stale).rejects.toBeInstanceOf(SerialActionQueueCancelledError);
      await queue.whenIdle();
      expect(queue.pendingCount).toBe(0);
      expect(order).toEqual(['stalled']);

      await queue.enqueue(async () => {
        order.push('recovered');
      });
      await queue.whenIdle();
      expect(order).toEqual(['stalled', 'recovered']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not start queued actions after an explicit state refresh cancellation', async () => {
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const queue = new SerialActionQueue();
    const first = queue.enqueue(async () => {
      order.push('first');
      await firstGate;
    });
    const stale = queue.enqueue(async () => {
      order.push('stale');
    });

    await Promise.resolve();
    queue.cancelPending();
    releaseFirst();
    await first;
    await expect(stale).rejects.toBeInstanceOf(SerialActionQueueCancelledError);
    await queue.whenIdle();
    expect(order).toEqual(['first']);
  });
});
