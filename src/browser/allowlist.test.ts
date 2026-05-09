import { describe, expect, it } from "vitest";
import { fileExtensionLower } from "./allowlist";

describe("fileExtensionLower", () => {
  it("returns lowercase extension including dot", () => {
    expect(fileExtensionLower("IMG.JPG")).toBe(".jpg");
  });

  it("returns empty string when there is no extension", () => {
    expect(fileExtensionLower("README")).toBe("");
  });

  it("uses the last dot for compound names", () => {
    expect(fileExtensionLower("archive.tar.gz")).toBe(".gz");
  });
});
