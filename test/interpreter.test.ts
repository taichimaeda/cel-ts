import { describe, expect, test } from "bun:test";
import { VariableDecl } from "../src/checker";
import { Type } from "../src/checker/types";
import {
  BoolValue,
  BytesValue,
  DoubleValue,
  ErrorValue,
  IntValue,
  ListValue,
  MapValue,
  NullValue,
  StringValue,
  UintValue,
  evaluate,
  newEnv,
} from "../src/interpreter";

describe("CEL Interpreter", () => {
  describe("Literals", () => {
    test("should evaluate integer literals", () => {
      const result = evaluate("42");
      expect(result.success).toBe(true);
      expect(result.value).toBeInstanceOf(IntValue);
      expect((result.value as IntValue).value()).toBe(42n);
    });

    test("should evaluate negative integers", () => {
      const result = evaluate("-42");
      expect(result.success).toBe(true);
      expect(result.value).toBeInstanceOf(IntValue);
      expect((result.value as IntValue).value()).toBe(-42n);
    });

    test("should evaluate uint literals", () => {
      const result = evaluate("42u");
      expect(result.success).toBe(true);
      expect(result.value).toBeInstanceOf(UintValue);
      expect((result.value as UintValue).value()).toBe(42n);
    });

    test("should evaluate hex integers", () => {
      const result = evaluate("0xFF");
      expect(result.success).toBe(true);
      expect(result.value).toBeInstanceOf(IntValue);
      expect((result.value as IntValue).value()).toBe(255n);
    });

    test("should evaluate double literals", () => {
      const result = evaluate("3.14");
      expect(result.success).toBe(true);
      expect(result.value).toBeInstanceOf(DoubleValue);
      expect((result.value as DoubleValue).value()).toBeCloseTo(3.14);
    });

    test("should evaluate string literals", () => {
      const result = evaluate('"hello"');
      expect(result.success).toBe(true);
      expect(result.value).toBeInstanceOf(StringValue);
      expect((result.value as StringValue).value()).toBe("hello");
    });

    test("should evaluate single-quoted strings", () => {
      const result = evaluate("'world'");
      expect(result.success).toBe(true);
      expect(result.value).toBeInstanceOf(StringValue);
      expect((result.value as StringValue).value()).toBe("world");
    });

    test("should evaluate escape sequences in strings", () => {
      const result = evaluate('"hello\\nworld"');
      expect(result.success).toBe(true);
      expect((result.value as StringValue).value()).toBe("hello\nworld");
    });

    test("should evaluate boolean true", () => {
      const result = evaluate("true");
      expect(result.success).toBe(true);
      expect(result.value).toBeInstanceOf(BoolValue);
      expect((result.value as BoolValue).value()).toBe(true);
    });

    test("should evaluate boolean false", () => {
      const result = evaluate("false");
      expect(result.success).toBe(true);
      expect(result.value).toBeInstanceOf(BoolValue);
      expect((result.value as BoolValue).value()).toBe(false);
    });

    test("should evaluate null", () => {
      const result = evaluate("null");
      expect(result.success).toBe(true);
      expect(result.value).toBeInstanceOf(NullValue);
    });

    test("should evaluate bytes literals", () => {
      const result = evaluate('b"abc"');
      expect(result.success).toBe(true);
      expect(result.value).toBeInstanceOf(BytesValue);
    });
  });

  describe("Arithmetic Operations", () => {
    test("should evaluate addition", () => {
      const result = evaluate("1 + 2");
      expect(result.success).toBe(true);
      expect((result.value as IntValue).value()).toBe(3n);
    });

    test("should evaluate subtraction", () => {
      const result = evaluate("5 - 3");
      expect(result.success).toBe(true);
      expect((result.value as IntValue).value()).toBe(2n);
    });

    test("should evaluate multiplication", () => {
      const result = evaluate("4 * 3");
      expect(result.success).toBe(true);
      expect((result.value as IntValue).value()).toBe(12n);
    });

    test("should evaluate division", () => {
      const result = evaluate("10 / 3");
      expect(result.success).toBe(true);
      expect((result.value as IntValue).value()).toBe(3n);
    });

    test("should evaluate modulo", () => {
      const result = evaluate("10 % 3");
      expect(result.success).toBe(true);
      expect((result.value as IntValue).value()).toBe(1n);
    });

    test("should handle division by zero", () => {
      const result = evaluate("10 / 0");
      expect(result.success).toBe(false);
      expect(result.value).toBeInstanceOf(ErrorValue);
    });

    test("should evaluate double arithmetic", () => {
      const result = evaluate("3.14 + 2.86");
      expect(result.success).toBe(true);
      expect((result.value as DoubleValue).value()).toBeCloseTo(6.0);
    });

    test("should evaluate string concatenation", () => {
      const result = evaluate('"hello" + " " + "world"');
      expect(result.success).toBe(true);
      expect((result.value as StringValue).value()).toBe("hello world");
    });

    test("should respect operator precedence", () => {
      const result = evaluate("2 + 3 * 4");
      expect(result.success).toBe(true);
      expect((result.value as IntValue).value()).toBe(14n);
    });

    test("should respect parentheses", () => {
      const result = evaluate("(2 + 3) * 4");
      expect(result.success).toBe(true);
      expect((result.value as IntValue).value()).toBe(20n);
    });
  });

  describe("Comparison Operations", () => {
    test("should evaluate equality", () => {
      expect((evaluate("1 == 1").value as BoolValue).value()).toBe(true);
      expect((evaluate("1 == 2").value as BoolValue).value()).toBe(false);
    });

    test("should evaluate inequality", () => {
      expect((evaluate("1 != 2").value as BoolValue).value()).toBe(true);
      expect((evaluate("1 != 1").value as BoolValue).value()).toBe(false);
    });

    test("should evaluate less than", () => {
      expect((evaluate("1 < 2").value as BoolValue).value()).toBe(true);
      expect((evaluate("2 < 1").value as BoolValue).value()).toBe(false);
    });

    test("should evaluate less than or equal", () => {
      expect((evaluate("1 <= 2").value as BoolValue).value()).toBe(true);
      expect((evaluate("2 <= 2").value as BoolValue).value()).toBe(true);
      expect((evaluate("3 <= 2").value as BoolValue).value()).toBe(false);
    });

    test("should evaluate greater than", () => {
      expect((evaluate("2 > 1").value as BoolValue).value()).toBe(true);
      expect((evaluate("1 > 2").value as BoolValue).value()).toBe(false);
    });

    test("should evaluate greater than or equal", () => {
      expect((evaluate("2 >= 1").value as BoolValue).value()).toBe(true);
      expect((evaluate("2 >= 2").value as BoolValue).value()).toBe(true);
      expect((evaluate("1 >= 2").value as BoolValue).value()).toBe(false);
    });

    test("should evaluate string comparison", () => {
      expect((evaluate('"a" < "b"').value as BoolValue).value()).toBe(true);
      expect((evaluate('"abc" == "abc"').value as BoolValue).value()).toBe(true);
    });
  });

  describe("Logical Operations", () => {
    test("should evaluate logical AND", () => {
      expect((evaluate("true && true").value as BoolValue).value()).toBe(true);
      expect((evaluate("true && false").value as BoolValue).value()).toBe(false);
      expect((evaluate("false && true").value as BoolValue).value()).toBe(false);
      expect((evaluate("false && false").value as BoolValue).value()).toBe(false);
    });

    test("should evaluate logical OR", () => {
      expect((evaluate("true || true").value as BoolValue).value()).toBe(true);
      expect((evaluate("true || false").value as BoolValue).value()).toBe(true);
      expect((evaluate("false || true").value as BoolValue).value()).toBe(true);
      expect((evaluate("false || false").value as BoolValue).value()).toBe(false);
    });

    test("should evaluate logical NOT", () => {
      expect((evaluate("!true").value as BoolValue).value()).toBe(false);
      expect((evaluate("!false").value as BoolValue).value()).toBe(true);
    });

    test("should short-circuit AND", () => {
      // false && <error> should return false without evaluating right side
      const result = evaluate("false && (1/0 == 0)");
      expect(result.success).toBe(true);
      expect((result.value as BoolValue).value()).toBe(false);
    });

    test("should short-circuit OR", () => {
      // true || <error> should return true without evaluating right side
      const result = evaluate("true || (1/0 == 0)");
      expect(result.success).toBe(true);
      expect((result.value as BoolValue).value()).toBe(true);
    });
  });

  describe("Ternary Expressions", () => {
    test("should evaluate ternary true condition", () => {
      const result = evaluate("true ? 1 : 2");
      expect(result.success).toBe(true);
      expect((result.value as IntValue).value()).toBe(1n);
    });

    test("should evaluate ternary false condition", () => {
      const result = evaluate("false ? 1 : 2");
      expect(result.success).toBe(true);
      expect((result.value as IntValue).value()).toBe(2n);
    });

    test("should evaluate nested ternary", () => {
      const result = evaluate("true ? (false ? 1 : 2) : 3");
      expect(result.success).toBe(true);
      expect((result.value as IntValue).value()).toBe(2n);
    });
  });

  describe("Variables", () => {
    test("should resolve variables from context", () => {
      const result = evaluate("x + y", { x: 10, y: 20 });
      expect(result.success).toBe(true);
      expect((result.value as IntValue).value()).toBe(30n);
    });

    test("should resolve string variables", () => {
      const result = evaluate('greeting + " " + name', {
        greeting: "Hello",
        name: "World",
      });
      expect(result.success).toBe(true);
      expect((result.value as StringValue).value()).toBe("Hello World");
    });

    test("should error on undeclared variable", () => {
      // When type checking is enabled, undeclared variables raise an error
      const result = evaluate("unknown_var");
      expect(result.success).toBe(false);
    });
  });

  describe("List Operations", () => {
    test("should evaluate list literals", () => {
      const result = evaluate("[1, 2, 3]");
      expect(result.success).toBe(true);
      expect(result.value).toBeInstanceOf(ListValue);
      const list = result.value as ListValue;
      expect(list.size().value()).toBe(3n);
    });

    test("should evaluate list indexing", () => {
      const result = evaluate("[10, 20, 30][1]");
      expect(result.success).toBe(true);
      expect((result.value as IntValue).value()).toBe(20n);
    });

    test("should evaluate list concatenation", () => {
      const result = evaluate("[1, 2] + [3, 4]");
      expect(result.success).toBe(true);
      const list = result.value as ListValue;
      expect(list.size().value()).toBe(4n);
    });

    test("should evaluate in operator for lists", () => {
      expect((evaluate("2 in [1, 2, 3]").value as BoolValue).value()).toBe(true);
      expect((evaluate("4 in [1, 2, 3]").value as BoolValue).value()).toBe(false);
    });

    test("should error on index out of bounds", () => {
      const result = evaluate("[1, 2, 3][10]");
      expect(result.success).toBe(false);
    });
  });

  describe("Map Operations", () => {
    test("should evaluate map literals", () => {
      const result = evaluate('{"a": 1, "b": 2}');
      expect(result.success).toBe(true);
      expect(result.value).toBeInstanceOf(MapValue);
    });

    test("should evaluate map key access", () => {
      const result = evaluate('{"a": 1, "b": 2}["a"]');
      expect(result.success).toBe(true);
      expect((result.value as IntValue).value()).toBe(1n);
    });

    test("should evaluate in operator for maps", () => {
      expect((evaluate('"a" in {"a": 1, "b": 2}').value as BoolValue).value()).toBe(true);
      expect((evaluate('"c" in {"a": 1, "b": 2}').value as BoolValue).value()).toBe(false);
    });

    test("should error on missing key", () => {
      const result = evaluate('{"a": 1}["missing"]');
      expect(result.success).toBe(false);
    });
  });

  describe("Field Access", () => {
    test("should access map fields with dot notation", () => {
      const result = evaluate("obj.name", {
        obj: { name: "test" },
      });
      expect(result.success).toBe(true);
      expect((result.value as StringValue).value()).toBe("test");
    });

    test("should access nested fields", () => {
      const result = evaluate("obj.inner.value", {
        obj: { inner: { value: 42 } },
      });
      expect(result.success).toBe(true);
      expect((result.value as IntValue).value()).toBe(42n);
    });
  });

  describe("Function Calls", () => {
    test("should evaluate size function on strings", () => {
      const result = evaluate('size("hello")');
      expect(result.success).toBe(true);
      expect((result.value as IntValue).value()).toBe(5n);
    });

    test("should evaluate size function on lists", () => {
      const result = evaluate("size([1, 2, 3])");
      expect(result.success).toBe(true);
      expect((result.value as IntValue).value()).toBe(3n);
    });

    test("should evaluate size function on maps", () => {
      const result = evaluate('size({"a": 1, "b": 2})');
      expect(result.success).toBe(true);
      expect((result.value as IntValue).value()).toBe(2n);
    });
  });

  describe("String Methods", () => {
    test("should evaluate contains method", () => {
      expect((evaluate('"hello world".contains("world")').value as BoolValue).value()).toBe(true);
      expect((evaluate('"hello world".contains("xyz")').value as BoolValue).value()).toBe(false);
    });

    test("should evaluate startsWith method", () => {
      expect((evaluate('"hello".startsWith("he")').value as BoolValue).value()).toBe(true);
      expect((evaluate('"hello".startsWith("lo")').value as BoolValue).value()).toBe(false);
    });

    test("should evaluate endsWith method", () => {
      expect((evaluate('"hello".endsWith("lo")').value as BoolValue).value()).toBe(true);
      expect((evaluate('"hello".endsWith("he")').value as BoolValue).value()).toBe(false);
    });
  });

  describe("Type Conversions", () => {
    test("should convert string to int", () => {
      const result = evaluate('int("42")');
      expect(result.success).toBe(true);
      expect((result.value as IntValue).value()).toBe(42n);
    });

    test("should convert string to double", () => {
      const result = evaluate('double("3.14")');
      expect(result.success).toBe(true);
      expect((result.value as DoubleValue).value()).toBeCloseTo(3.14);
    });

    test("should convert int to string", () => {
      const result = evaluate("string(42)");
      expect(result.success).toBe(true);
      expect((result.value as StringValue).value()).toBe("42");
    });

    test("should convert int to double", () => {
      const result = evaluate("double(42)");
      expect(result.success).toBe(true);
      expect((result.value as DoubleValue).value()).toBe(42.0);
    });
  });

  describe("Environment and Programs", () => {
    test("should compile and evaluate with environment", () => {
      const env = newEnv({
        declarations: [new VariableDecl("x", Type.Int), new VariableDecl("y", Type.Int)],
      });

      const compileResult = env.compile("x + y");
      expect(compileResult.error).toBeUndefined();
      expect(compileResult.program).toBeDefined();

      const evalResult = compileResult.program!.eval({ x: 10, y: 20 });
      expect(evalResult.success).toBe(true);
      expect((evalResult.value as IntValue).value()).toBe(30n);
    });

    test("should report compilation errors", () => {
      const env = newEnv();
      const result = env.compile("1 + + 2");
      expect(result.error).toBeDefined();
    });
  });

  describe("Complex Expressions", () => {
    test("should evaluate complex boolean expressions", () => {
      const result = evaluate("(1 < 2) && (3 > 2) || false");
      expect(result.success).toBe(true);
      expect((result.value as BoolValue).value()).toBe(true);
    });

    test("should evaluate chained comparisons", () => {
      const result = evaluate("1 < 2 && 2 < 3 && 3 < 4");
      expect(result.success).toBe(true);
      expect((result.value as BoolValue).value()).toBe(true);
    });

    test("should handle complex variable expressions", () => {
      const result = evaluate("(a + b) * c - d / e", {
        a: 10,
        b: 5,
        c: 2,
        d: 10,
        e: 5,
      });
      expect(result.success).toBe(true);
      expect((result.value as IntValue).value()).toBe(28n);
    });
  });
});
