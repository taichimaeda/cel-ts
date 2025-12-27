import { describe, expect, test } from "bun:test";
import { Linter } from "../src/linter";

describe("CEL Linter", () => {
  test("flags constant boolean short-circuit", () => {
    const diagnostics = new Linter().lint("true || x");

    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0]!.message).toContain("always true");
  });

  test("flags constant ternary condition", () => {
    const diagnostics = new Linter().lint("false ? a : b");

    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0]!.message).toContain("always false");
  });

  test("flags double negation", () => {
    const diagnostics = new Linter().lint("!!x");

    expect(diagnostics.some((d) => d.message.includes("Double negation"))).toBe(true);
  });
});
