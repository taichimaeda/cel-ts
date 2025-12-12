import { describe, expect, test } from "bun:test";
import { CharStream, CommonTokenStream } from "antlr4";
import { CELLexer, CELParser } from "../src/parser";

describe("CEL Parser", () => {
  // Helper function: parse expression and return parse tree as string
  const parse = (expression: string) => {
    const chars = new CharStream(expression);
    const lexer = new CELLexer(chars);
    const tokens = new CommonTokenStream(lexer);
    const parser = new CELParser(tokens);
    const tree = parser.start();
    return tree.toStringTree(parser.ruleNames, parser);
  };

  test("should parse integer literals", () => {
    const result = parse("42");
    expect(result).toContain("42");
  });

  test("should parse string literals", () => {
    const result = parse('"hello"');
    expect(result).toContain('"hello"');
  });

  test("should parse boolean literals", () => {
    expect(parse("true")).toContain("true");
    expect(parse("false")).toContain("false");
  });

  test("should parse null literal", () => {
    const result = parse("null");
    expect(result).toContain("null");
  });

  test("should parse arithmetic expressions", () => {
    const result = parse("1 + 2 * 3");
    expect(result).toContain("+");
    expect(result).toContain("*");
  });

  test("should parse comparison expressions", () => {
    const result = parse("a > b");
    expect(result).toContain(">");
  });

  test("should parse logical expressions", () => {
    const result = parse("a && b || c");
    expect(result).toContain("&&");
    expect(result).toContain("||");
  });

  test("should parse ternary expressions", () => {
    const result = parse("a ? b : c");
    expect(result).toContain("?");
    expect(result).toContain(":");
  });

  test("should parse field access", () => {
    const result = parse("foo.bar.baz");
    expect(result).toContain("foo");
    expect(result).toContain("bar");
    expect(result).toContain("baz");
  });

  test("should parse function calls", () => {
    const result = parse("size(list)");
    expect(result).toContain("size");
    expect(result).toContain("list");
  });

  test("should parse method calls", () => {
    const result = parse('name.startsWith("prefix")');
    expect(result).toContain("startsWith");
  });

  test("should parse list literals", () => {
    const result = parse("[1, 2, 3]");
    expect(result).toContain("[");
    expect(result).toContain("]");
  });

  test("should parse map literals", () => {
    const result = parse('{"key": "value"}');
    expect(result).toContain("{");
    expect(result).toContain("}");
  });

  test("should parse index access", () => {
    const result = parse("list[0]");
    expect(result).toContain("list");
    expect(result).toContain("[");
    expect(result).toContain("0");
  });

  test("should parse negative numbers", () => {
    const result = parse("-42");
    expect(result).toContain("-");
    expect(result).toContain("42");
  });

  test("should parse nested expressions", () => {
    const result = parse("(a + b) * c");
    expect(result).toContain("(");
    expect(result).toContain(")");
  });
});
