import { bench, describe } from "vitest";
import { Semaphore } from "./utils";

describe("Semaphore", () => {
  bench("new Semaphore(4)", () => {
    new Semaphore(4);
  });

  bench("acquire + release — uncontended (concurrency=10, 1 task)", async () => {
    const sem = new Semaphore(10);
    await sem.acquire();
    sem.release();
  });

  bench("acquire — contended (concurrency=1, 2 tasks)", async () => {
    const sem = new Semaphore(1);
    await sem.acquire();
    const p = sem.acquire();
    sem.release();
    await p;
  });

  bench("run() — 10 concurrent resolved promises", async () => {
    const sem = new Semaphore(4);
    const tasks = Array.from({ length: 10 }, () => sem.run(async () => "ok"));
    await Promise.all(tasks);
  });
});
