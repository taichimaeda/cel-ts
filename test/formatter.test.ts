import { describe, expect, test } from "bun:test";
import { Formatter } from "../src/formatter";

describe("CEL Formatter", () => {
  test("formats long logical expressions", () => {
    const formatter = new Formatter({ maxLineLength: 30 });
    const formatted = formatter.format('user.age >= 18 && user.country == "JP" || user.is_admin');

    expect(formatted).toBe(
      `user.age >= 18 && user.country == "JP" ||
  user.is_admin`
    );
  });

  test("formats chained calls vertically", () => {
    const formatter = new Formatter({ maxLineLength: 40, chainStyle: "auto" });
    const formatted = formatter.format(
      'users.filter(u, u.active && u.score > 80).map(u, u.name).exists_one(n, n.contains("vip"))'
    );

    expect(formatted).toBe(
      `users
  .filter(u, u.active && u.score > 80)
  .map(u, u.name)
  .exists_one(n, n.contains("vip"))`
    );
  });

  test("formats call arguments over multiple lines", () => {
    const formatter = new Formatter({ maxLineLength: 40, multilineCallArgs: "auto" });
    const formatted = formatter.format(
      'myFunc(user.name, user.address.city, user.preferences.theme, user.flags.filter(f, f != "deprecated"))'
    );

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
    const formatter = new Formatter({ maxLineLength: 80 });
    expect(formatter.format('a + 1 == 2 && b == "ok"')).toBe(`a + 1 == 2 && b == "ok"`);
  });

  test("formats ternary expressions when long", () => {
    const formatter = new Formatter({ maxLineLength: 20 });
    expect(formatter.format('user.is_admin ? "admin" : user.age >= 18 ? "adult" : "minor"')).toBe(
      `user.is_admin
  ? "admin"
  : user.age >= 18
    ? "adult"
    : "minor"`
    );
  });

  test("formats list literals across lines", () => {
    const formatter = new Formatter({ maxLineLength: 10, multilineLiterals: "auto" });
    expect(formatter.format("[1, 2, 3, 4, 5, 6]")).toBe(
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
    const formatter = new Formatter({ maxLineLength: 30, multilineLiterals: "auto" });
    expect(formatter.format('{"id": user.id, "name": user.name, "active": user.active}')).toBe(
      `{
  "id": user.id,
  "name": user.name,
  "active": user.active
}`
    );
  });

  test("formats struct literals across lines", () => {
    const formatter = new Formatter({ maxLineLength: 30, multilineLiterals: "auto" });
    expect(formatter.format("MyType{foo: bar, baz: qux, quux: corge}")).toBe(
      `MyType{
  foo: bar,
  baz: qux,
  quux: corge
}`
    );
  });

  test("keeps chain inline when configured", () => {
    const formatter = new Formatter({ chainStyle: "inline", maxLineLength: 10 });
    expect(formatter.format("users.filter(u, u.active).map(u, u.name)")).toBe(
      "users.filter(u, u.active).map(u, u.name)"
    );
  });
});
