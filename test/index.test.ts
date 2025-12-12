import { describe, expect, test } from "bun:test";
import { VERSION } from "../src/index";

describe("CEL API - Version", () => {
  test("should export VERSION", () => {
    // Ensure VERSION string follows semver format
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?(\+[a-zA-Z0-9.]+)?$/);
  });
});
