import { describe, expect, it, vi } from "vitest";
import { isOffscreenWorkerSupported, compressImageInWorker } from "./worker-client";

describe("worker-client", () => {
  it("should return false for isOffscreenWorkerSupported in standard JSDOM/Node environment", () => {
    // Standard Node/JSDOM doesn't support OffscreenCanvas natively
    expect(isOffscreenWorkerSupported()).toBe(false);
  });

  it("should return true for isOffscreenWorkerSupported if mocks are present", () => {
    // Setup temporary globals
    const originalWorker = globalThis.Worker;
    const originalOffscreen = (globalThis as any).OffscreenCanvas;
    const originalCreateImageBitmap = globalThis.createImageBitmap;

    globalThis.Worker = class {} as any;
    (globalThis as any).OffscreenCanvas = class {} as any;
    (globalThis as any).createImageBitmap = vi.fn();

    expect(isOffscreenWorkerSupported()).toBe(true);

    // Restore
    globalThis.Worker = originalWorker;
    (globalThis as any).OffscreenCanvas = originalOffscreen;
    (globalThis as any).createImageBitmap = originalCreateImageBitmap;
  });

  it("should trigger worker message post on compressImageInWorker", async () => {
    const originalWorker = globalThis.Worker;
    const originalOffscreen = (globalThis as any).OffscreenCanvas;
    const originalCreateImageBitmap = globalThis.createImageBitmap;

    const mockPostMessage = vi.fn();
    class MockWorker {
      postMessage = mockPostMessage;
      onmessage: any = null;
    }

    globalThis.Worker = MockWorker as any;
    (globalThis as any).OffscreenCanvas = class {} as any;
    (globalThis as any).createImageBitmap = vi.fn();

    const fakeFile = new Blob(["test"], { type: "image/jpeg" });
    void compressImageInWorker(fakeFile, {
      quality: 0.8,
      filename: "test.jpg",
      variant: "optimized",
    });

    expect(mockPostMessage).toHaveBeenCalled();
    const postedData = mockPostMessage.mock.calls[0]![0];
    expect(postedData.quality).toBe(0.8);
    expect(postedData.filename).toBe("test.jpg");
    expect(postedData.variant).toBe("optimized");

    // Clean up outstanding promise to avoid leak
    mockPostMessage.mockClear();
    globalThis.Worker = originalWorker;
    (globalThis as any).OffscreenCanvas = originalOffscreen;
    (globalThis as any).createImageBitmap = originalCreateImageBitmap;
  });
});
