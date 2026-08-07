import { useCallback, useEffect, useRef, useState } from 'react';

export const ESTATE_ACTION_TIMEOUT_MS = 20_000;

export class SerialActionTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`操作在 ${Math.ceil(timeoutMs / 1_000)} 秒内未完成，请刷新后确认状态。`);
    this.name = 'SerialActionTimeoutError';
  }
}

export class SerialActionQueueCancelledError extends Error {
  constructor() {
    super('已有操作的状态需要刷新，后续待处理操作已取消。');
    this.name = 'SerialActionQueueCancelledError';
  }
}

export function isSerialActionTimeoutError(
  error: unknown,
): error is SerialActionTimeoutError {
  return error instanceof SerialActionTimeoutError;
}

export function isSerialActionQueueCancelledError(
  error: unknown,
): error is SerialActionQueueCancelledError {
  return error instanceof SerialActionQueueCancelledError;
}

/**
 * Lets a UI action stop waiting when its queue slot is cancelled or times out.
 * The request itself may still finish on the network, so callers must not commit
 * a result after this rejects; they should refresh the authoritative snapshot.
 */
export function awaitWithAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(signal.reason ?? new SerialActionQueueCancelledError());
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(signal.reason ?? new SerialActionQueueCancelledError());
    };
    signal.addEventListener('abort', onAbort, { once: true });
    void promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

export class SerialActionQueue {
  private tail: Promise<void> = Promise.resolve();
  private count = 0;
  private generation = 0;
  private readonly listeners = new Set<(pendingCount: number) => void>();

  constructor(
    onPendingChange?: (pendingCount: number) => void,
    private readonly timeoutMs = ESTATE_ACTION_TIMEOUT_MS,
  ) {
    if (onPendingChange) this.listeners.add(onPendingChange);
  }

  get pendingCount(): number {
    return this.count;
  }

  /**
   * A serial queue can save one action at a time. Everything beyond the first
   * pending action is waiting for that save slot, so this is the number that
   * should be presented to players as a queue.
   */
  get queuedCount(): number {
    return Math.max(0, this.count - 1);
  }

  enqueue(task: (signal: AbortSignal) => Promise<void>): Promise<void> {
    const generation = this.generation;
    this.count += 1;
    this.notify();
    const scheduled = this.tail.then(
      () => this.run(task, generation),
      () => this.run(task, generation),
    );
    this.tail = scheduled
      .then(() => undefined, () => undefined)
      .finally(() => {
        this.count -= 1;
        this.notify();
      });
    return scheduled;
  }

  /** Cancels work that has not begun. The active caller must refresh state. */
  cancelPending(): void {
    this.generation += 1;
  }

  whenIdle(): Promise<void> {
    return this.tail;
  }

  subscribe(listener: (pendingCount: number) => void): () => void {
    this.listeners.add(listener);
    listener(this.count);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) listener(this.count);
  }

  private run(
    task: (signal: AbortSignal) => Promise<void>,
    generation: number,
  ): Promise<void> {
    if (generation !== this.generation) {
      return Promise.reject(new SerialActionQueueCancelledError());
    }
    const controller = new AbortController();
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const error = new SerialActionTimeoutError(this.timeoutMs);
        controller.abort(error);
        // A timed-out mutation can still reach the server. Do not let later,
        // non-idempotent actions run against an uncertain revision.
        this.cancelPending();
        reject(error);
      }, this.timeoutMs);
      void task(controller.signal).then(
        () => {
          clearTimeout(timeout);
          resolve();
        },
        (error: unknown) => {
          clearTimeout(timeout);
          reject(error);
        },
      );
    });
  }
}

export function useSerialActionQueue(providedQueue?: SerialActionQueue) {
  const ownedQueue = useRef<SerialActionQueue>();
  ownedQueue.current ??= new SerialActionQueue();
  const queue = providedQueue ?? ownedQueue.current;
  const [pendingCount, setPendingCount] = useState(queue.pendingCount);
  useEffect(() => queue.subscribe(setPendingCount), [queue]);
  const enqueue = useCallback((task: (signal: AbortSignal) => Promise<void>) => {
    void queue.enqueue(task).catch(() => undefined);
  }, [queue]);
  const cancelPending = useCallback(() => queue.cancelPending(), [queue]);
  return {
    enqueue,
    cancelPending,
    pendingCount,
    queuedCount: Math.max(0, pendingCount - 1),
  };
}
