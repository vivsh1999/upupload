import { describe, expect, it } from "vitest";
import { resolveInitialConfig } from "./_config";
import { DEFAULT_BROWSER_PIPELINE_OPTIONS } from "../browser/pipeline";

describe("resolveInitialConfig", () => {
  it("returns the documented defaults when no pipelineConfig is passed", () => {
    expect(resolveInitialConfig()).toEqual(DEFAULT_BROWSER_PIPELINE_OPTIONS);
  });

  it("forwards useWorker, not just logLevel (regression: it used to be dropped)", () => {
    expect(resolveInitialConfig({ useWorker: true })).toEqual({
      logLevel: DEFAULT_BROWSER_PIPELINE_OPTIONS.logLevel,
      useWorker: true,
    });
  });

  it("lets pipelineConfig override the defaults", () => {
    expect(resolveInitialConfig({ logLevel: "debug", useWorker: true })).toEqual({
      logLevel: "debug",
      useWorker: true,
    });
  });
});
