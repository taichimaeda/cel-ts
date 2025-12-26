import { describe, expect, test } from "bun:test";
import { Env } from "../src/cel";
import { Formatter } from "../src/formatter";

const env = new Env();
const parseAst = (expression: string) => env.parse(expression).ast;

describe("CEL Formatter", () => {
  test("formats long logical expressions", () => {
    const ast = parseAst('user.age >= 18 && user.country == "JP" || user.is_admin');
    const formatter = new Formatter({ maxLineLength: 30 });
    const formatted = formatter.format(ast);

    expect(formatted).toBe(
      `user.age >= 18 && user.country == "JP" ||
  user.is_admin`
    );
  });

  test("formats chained calls vertically", () => {
    const ast = parseAst(
      'users.filter(u, u.active && u.score > 80).map(u, u.name).exists_one(n, n.contains("vip"))'
    );
    const formatter = new Formatter({ maxLineLength: 40, chainStyle: "auto" });
    const formatted = formatter.format(ast);

    expect(formatted).toBe(
      `users
  .filter(u, u.active && u.score > 80)
  .map(u, u.name)
  .exists_one(n, n.contains("vip"))`
    );
  });

  test("formats call arguments over multiple lines", () => {
    const ast = parseAst(
      'myFunc(user.name, user.address.city, user.preferences.theme, user.flags.filter(f, f != "deprecated"))'
    );
    const formatter = new Formatter({ maxLineLength: 40, multilineCallArgs: "auto" });
    const formatted = formatter.format(ast);

    expect(formatted).toBe(
      `myFunc(
  user.name,
  user.address.city,
  user.preferences.theme,
  user.flags.filter(f, f != "deprecated")
)`
    );
  });

  test("keeps short expressions on one line", () => {
    const ast = parseAst('a + 1 == 2 && b == "ok"');
    const formatter = new Formatter({ maxLineLength: 80 });
    expect(formatter.format(ast)).toBe(`a + 1 == 2 && b == "ok"`);
  });

  test("formats ternary expressions when long", () => {
    const ast = parseAst('user.is_admin ? "admin" : user.age >= 18 ? "adult" : "minor"');
    const formatter = new Formatter({ maxLineLength: 20 });
    expect(formatter.format(ast)).toBe(
      `user.is_admin
  ? "admin"
  : user.age >= 18
    ? "adult"
    : "minor"`
    );
  });

  test("formats list literals across lines", () => {
    const ast = parseAst("[1, 2, 3, 4, 5, 6]");
    const formatter = new Formatter({ maxLineLength: 10, multilineLiterals: "auto" });
    expect(formatter.format(ast)).toBe(
      `[
  1,
  2,
  3,
  4,
  5,
  6
]`
    );
  });

  test("formats map literals across lines", () => {
    const ast = parseAst('{"id": user.id, "name": user.name, "active": user.active}');
    const formatter = new Formatter({ maxLineLength: 30, multilineLiterals: "auto" });
    expect(formatter.format(ast)).toBe(
      `{
  "id": user.id,
  "name": user.name,
  "active": user.active
}`
    );
  });

  test("formats struct literals across lines", () => {
    const ast = parseAst("MyType{foo: bar, baz: qux, quux: corge}");
    const formatter = new Formatter({ maxLineLength: 30, multilineLiterals: "auto" });
    expect(formatter.format(ast)).toBe(
      `MyType{
  foo: bar,
  baz: qux,
  quux: corge
}`
    );
  });

  test("keeps chain inline when configured", () => {
    const ast = parseAst("users.filter(u, u.active).map(u, u.name)");
    const formatter = new Formatter({ chainStyle: "inline", maxLineLength: 10 });
    expect(formatter.format(ast)).toBe("users.filter(u, u.active).map(u, u.name)");
  });
});
