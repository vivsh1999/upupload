export class Semaphore {
  private running: number;
  private queue: Array<{ resolve: () => void; reject: (err: Error) => void }>;

  constructor(public readonly max: number) {
    this.running = 0;
    this.queue = [];
  }

  async acquire(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (this.running < this.max) {
      this.running++;
      return;
    }
    return new Promise<void>((resolve, reject) => {
      if (!signal) {
        this.queue.push({
          resolve: () => {
            this.running++;
            resolve();
          },
          reject,
        });
        return;
      }
      if (signal.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      const onAbort = () => {
        const idx = this.queue.findIndex((w) => w.resolve === resolve);
        if (idx !== -1) this.queue.splice(idx, 1);
        reject(new DOMException("Aborted", "AbortError"));
      };
      signal.addEventListener("abort", onAbort, { once: true });
      this.queue.push({
        resolve: () => {
          signal.removeEventListener("abort", onAbort);
          this.running++;
          resolve();
        },
        reject,
      });
    });
  }

  release(): void {
    this.running--;
    if (this.queue.length > 0) {
      this.queue.shift()!.resolve();
    }
  }

  async run<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    await this.acquire(signal);
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}
