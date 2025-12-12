import { describe, expect, test } from "bun:test";
import { Env } from "../src/cel";
import { Linter } from "../src/linter";

describe("CEL Linter", () => {
  test("flags constant boolean short-circuit", () => {
    const env = new Env({ disableTypeChecking: true });
    const ast = env.parse("true || x");
    const diagnostics = new Linter().lint(ast.ast);

    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0]!.message).toContain("always true");
  });

  test("flags constant ternary condition", () => {
    const env = new Env({ disableTypeChecking: true });
    const ast = env.parse("false ? a : b");
    const diagnostics = new Linter().lint(ast.ast);

    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0]!.message).toContain("always false");
  });

  test("flags double negation", () => {
    const env = new Env({ disableTypeChecking: true });
    const ast = env.parse("!!x");
    const diagnostics = new Linter().lint(ast.ast);

    expect(diagnostics.some((d) => d.message.includes("Double negation"))).toBe(true);
  });
});
