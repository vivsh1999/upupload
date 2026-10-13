import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  compressImageInWorker,
  compressVariantsInWorker,
  isOffscreenWorkerSupported,
  terminateWorkerPool,
} from "./worker-client";

class MockWorker {
  static instances: MockWorker[] = [];

  onmessage: ((event: { data: unknown }) => void) | null = null;
  posted: any[] = [];
  terminated = false;

  constructor(public url: string) {
    MockWorker.instances.push(this);
  }

  postMessage(data: any) {
    this.posted.push(data);
  }

  terminate() {
    this.terminated = true;
  }

  respond(data: unknown) {
    this.onmessage?.({ data });
  }
}

function installWorkerMock() {
  MockWorker.instances = [];
  vi.stubGlobal("Worker", MockWorker as unknown as typeof Worker);
  vi.stubGlobal("OffscreenCanvas", class {} as unknown as typeof OffscreenCanvas);
  vi.stubGlobal("createImageBitmap", vi.fn());
}

describe("worker-client", () => {
  beforeEach(() => {
    installWorkerMock();
  });

  afterEach(() => {
    terminateWorkerPool();
    vi.unstubAllGlobals();
  });

  it("should return false for isOffscreenWorkerSupported in standard JSDOM/Node environment", () => {
    vi.unstubAllGlobals();
    // Standard Node/JSDOM doesn't support OffscreenCanvas natively
    expect(isOffscreenWorkerSupported()).toBe(false);
  });

  it("should return true for isOffscreenWorkerSupported if mocks are present", () => {
    expect(isOffscreenWorkerSupported()).toBe(true);
  });

  it("posts a single-variant batch for compressImageInWorker", async () => {
    const fakeFile = new Blob(["test"], { type: "image/jpeg" });
    const promise = compressImageInWorker(fakeFile, {
      quality: 0.8,
      filename: "test.jpg",
      variant: "optimized",
    });

    const worker = MockWorker.instances[0]!;
    const posted = worker.posted[0]!;
    expect(posted.variants).toEqual([{ variant: "optimized", filename: "test.jpg", quality: 0.8 }]);

    worker.respond({
      id: posted.id,
      success: true,
      results: [{ variant: "optimized", filename: "test.jpg", blob: new Blob(["out"]) }],
    });

    await expect(promise).resolves.toBeInstanceOf(Blob);
  });

  it("sends every variant of one source file as a single job", async () => {
    const file = new Blob(["source"], { type: "image/jpeg" });
    const promise = compressVariantsInWorker(file, [
      { variant: "web", filename: "photo.web.jpg", quality: 0.82, maxLongEdge: 2560 },
      { variant: "thumb", filename: "photo.thumb.jpg", quality: 0.6, maxLongEdge: 400 },
    ]);

    // One job → exactly one worker, both variants on the same thread.
    expect(MockWorker.instances).toHaveLength(1);
    const worker = MockWorker.instances[0]!;
    const posted = worker.posted[0]!;
    expect(posted.variants).toHaveLength(2);
    expect(posted.variants.map((v: any) => v.variant)).toEqual(["web", "thumb"]);

    worker.respond({
      id: posted.id,
      success: true,
      results: posted.variants.map((v: any) => ({ ...v, blob: new Blob([v.variant]) })),
    });

    await expect(promise).resolves.toHaveLength(2);
  });

  it("spreads concurrent jobs across the pool instead of serialising them", async () => {
    Object.defineProperty(globalThis.navigator, "hardwareConcurrency", {
      value: 4,
      configurable: true,
    });

    const file = new Blob(["source"], { type: "image/jpeg" });
    const job = () =>
      compressVariantsInWorker(file, [{ variant: "web", filename: "photo.web.jpg", quality: 0.8 }]);

    const pending = [job(), job(), job()];

    // Each concurrent job gets its own worker while the pool is still growing.
    expect(MockWorker.instances).toHaveLength(3);

    MockWorker.instances.forEach((worker, index) => {
      const posted = worker.posted[0]!;
      worker.respond({
        id: posted.id,
        success: true,
        results: [{ variant: "web", filename: `p${index}.jpg`, blob: new Blob(["x"]) }],
      });
    });

    await expect(Promise.all(pending)).resolves.toHaveLength(3);
  });

  it("reuses an idle worker for sequential jobs", async () => {
    const file = new Blob(["source"], { type: "image/jpeg" });
    const specs = [{ variant: "web", filename: "photo.web.jpg", quality: 0.8 }];

    const first = compressVariantsInWorker(file, specs);
    const worker = MockWorker.instances[0]!;
    worker.respond({
      id: worker.posted[0]!.id,
      success: true,
      results: [{ variant: "web", filename: "a.jpg", blob: new Blob(["a"]) }],
    });
    await first;

    const second = compressVariantsInWorker(file, specs);
    expect(MockWorker.instances).toHaveLength(1);
    worker.respond({
      id: worker.posted[1]!.id,
      success: true,
      results: [{ variant: "web", filename: "b.jpg", blob: new Blob(["b"]) }],
    });
    await second;
  });

  it("rejects when the worker reports a failure", async () => {
    const file = new Blob(["source"], { type: "image/jpeg" });
    const promise = compressVariantsInWorker(file, [
      { variant: "web", filename: "photo.web.jpg", quality: 0.8 },
    ]);

    const worker = MockWorker.instances[0]!;
    worker.respond({ id: worker.posted[0]!.id, success: false, error: "boom" });

    await expect(promise).rejects.toThrow("boom");
  });

  it("terminates every pooled worker on teardown", async () => {
    const file = new Blob(["source"], { type: "image/jpeg" });
    void compressVariantsInWorker(file, [{ variant: "web", filename: "p.jpg", quality: 0.8 }]);

    terminateWorkerPool();

    expect(MockWorker.instances[0]!.terminated).toBe(true);
  });
});
