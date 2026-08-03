import { useCallback, useEffect, useState } from 'react';

export class SerialActionQueue {
  private tail: Promise<void> = Promise.resolve();
  private count = 0;
  private readonly listeners = new Set<(pendingCount: number) => void>();

  constructor(
    onPendingChange?: (pendingCount: number) => void,
  ) {
    if (onPendingChange) this.listeners.add(onPendingChange);
  }

  get pendingCount(): number {
    return this.count;
  }

  enqueue(task: () => Promise<void>): Promise<void> {
    this.count += 1;
    this.notify();
    const scheduled = this.tail.then(task, task);
    this.tail = scheduled
      .then(() => undefined, () => undefined)
      .finally(() => {
        this.count -= 1;
        this.notify();
      });
    return scheduled;
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
}

const estateActionQueue = new SerialActionQueue();

export function useSerialActionQueue(queue = estateActionQueue) {
  const [pendingCount, setPendingCount] = useState(queue.pendingCount);
  useEffect(() => queue.subscribe(setPendingCount), [queue]);
  const enqueue = useCallback((task: () => Promise<void>) => {
    void queue.enqueue(task);
  }, [queue]);
  return { enqueue, pendingCount };
}
