/** @module react/utils */

/**
 * Bounded concurrency semaphore.
 * Limits how many async operations run simultaneously.
 *
 * Useful for controlling upload concurrency outside the hook, e.g. when
 * uploading artifacts via fetch or XHR.
 *
 * @example
 * ```ts
 * import { Semaphore } from "@vivsh1999/upupload/react";
 *
 * const sem = new Semaphore(4); // max 4 concurrent uploads
 * await sem.run(() => fetch("/api/upload", { method: "PUT", body: blob }));
 * ```
 */
export class Semaphore {
  private running = 0;
  private queue: Array<() => void> = [];

  constructor(public readonly max: number) {}

  async acquire(): Promise<void> {
    if (this.running < this.max) {
      this.running++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.running++;
        resolve();
      });
    });
  }

  release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) next();
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}
