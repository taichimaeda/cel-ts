import { describe, expect, test } from "bun:test";
import {
  BoolType,
  FunctionDecl,
  IntType,
  ListType,
  MapType,
  OverloadDecl,
  StringType,
  VariableDecl
} from "../src/checker";
import {
  BinaryDispatcherOverload,
  BoolValue,
  BytesValue,
  DefaultDispatcher,
  DoubleValue,
  Env,
  ErrorValue,
  IntValue,
  ListValue,
  MapValue,
  NullValue,
  StringValue,
  UintValue,
  UnaryDispatcherOverload,
  VariadicDispatcherOverload,
} from "../src/interpreter";
import { evaluate } from "./utils";

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

  describe("Environment with Custom Variables", () => {
    test("should compile and evaluate with environment", () => {
      const env = new Env({
        declarations: [new VariableDecl("x", IntType), new VariableDecl("y", IntType)],
      });

      const compileResult = env.compile("x + y");
      expect(compileResult.error).toBeUndefined();
      expect(compileResult.program).toBeDefined();

      const evalResult = compileResult.program!.eval({ x: 10, y: 20 });
      expect(evalResult.success).toBe(true);
      expect((evalResult.value as IntValue).value()).toBe(30n);
    });

    test("should report compilation errors", () => {
      const env = new Env();
      const result = env.compile("1 + + 2");
      expect(result.error).toBeDefined();
    });
  });

  describe("Environment with Custom Functions", () => {
    describe("Global functions with unary binding", () => {
      test("should evaluate custom unary function", () => {
        const greetFn = new FunctionDecl("greet");
        greetFn.addOverload(new OverloadDecl("greet_string", [StringType], StringType));

        const dispatcher = new DefaultDispatcher();
        dispatcher.add(
          new UnaryDispatcherOverload("greet_string", (arg) => new StringValue(`Hello, ${arg.value()}!`))
        );

        const env = new Env({
          declarations: [greetFn],
          functions: dispatcher,
        });

        const compileResult = env.compile('greet("world")');
        expect(compileResult.error).toBeUndefined();
        const evalResult = compileResult.program!.eval();
        expect(evalResult.success).toBe(true);
        expect((evalResult.value as StringValue).value()).toBe("Hello, world!");
      });

      test("should evaluate custom function returning int", () => {
        const doubleItFn = new FunctionDecl("doubleIt");
        doubleItFn.addOverload(new OverloadDecl("doubleIt_int", [IntType], IntType));

        const dispatcher = new DefaultDispatcher();
        dispatcher.add(
          new UnaryDispatcherOverload("doubleIt_int", (arg) => IntValue.of((arg.value() as bigint) * 2n))
        );

        const env = new Env({
          declarations: [doubleItFn],
          functions: dispatcher,
        });

        const compileResult = env.compile("doubleIt(21)");
        expect(compileResult.error).toBeUndefined();
        const evalResult = compileResult.program!.eval();
        expect(evalResult.success).toBe(true);
        expect((evalResult.value as IntValue).value()).toBe(42n);
      });
    });

    describe("Global functions with binary binding", () => {
      test("should evaluate custom binary function", () => {
        const addFn = new FunctionDecl("myAdd");
        addFn.addOverload(new OverloadDecl("myAdd_int_int", [IntType, IntType], IntType));

        const dispatcher = new DefaultDispatcher();
        dispatcher.add(
          new BinaryDispatcherOverload("myAdd_int_int", (lhs, rhs) =>
            IntValue.of((lhs.value() as bigint) + (rhs.value() as bigint))
          )
        );

        const env = new Env({
          declarations: [addFn],
          functions: dispatcher,
        });

        const compileResult = env.compile("myAdd(10, 32)");
        expect(compileResult.error).toBeUndefined();
        const evalResult = compileResult.program!.eval();
        expect(evalResult.success).toBe(true);
        expect((evalResult.value as IntValue).value()).toBe(42n);
      });

      test("should evaluate custom string concat function", () => {
        const concatFn = new FunctionDecl("concat");
        concatFn.addOverload(
          new OverloadDecl("concat_string_string", [StringType, StringType], StringType)
        );

        const dispatcher = new DefaultDispatcher();
        dispatcher.add(
          new BinaryDispatcherOverload(
            "concat_string_string",
            (lhs, rhs) => new StringValue(`${lhs.value()}${rhs.value()}`)
          )
        );

        const env = new Env({
          declarations: [concatFn],
          functions: dispatcher,
        });

        const compileResult = env.compile('concat("hello", "world")');
        expect(compileResult.error).toBeUndefined();
        const evalResult = compileResult.program!.eval();
        expect(evalResult.success).toBe(true);
        expect((evalResult.value as StringValue).value()).toBe("helloworld");
      });
    });

    describe("Global functions with n-ary binding", () => {
      test("should evaluate custom function with 3 arguments", () => {
        const sumFn = new FunctionDecl("sum3");
        sumFn.addOverload(
          new OverloadDecl("sum3_int_int_int", [IntType, IntType, IntType], IntType)
        );

        const dispatcher = new DefaultDispatcher();
        dispatcher.add(
          new VariadicDispatcherOverload("sum3_int_int_int", (args) => {
            const a = args[0]!.value() as bigint;
            const b = args[1]!.value() as bigint;
            const c = args[2]!.value() as bigint;
            return IntValue.of(a + b + c);
          })
        );

        const env = new Env({
          declarations: [sumFn],
          functions: dispatcher,
        });

        const compileResult = env.compile("sum3(10, 20, 12)");
        expect(compileResult.error).toBeUndefined();
        const evalResult = compileResult.program!.eval();
        expect(evalResult.success).toBe(true);
        expect((evalResult.value as IntValue).value()).toBe(42n);
      });
    });

    describe("Member functions", () => {
      test("should evaluate custom member function (unary)", () => {
        const reverseFn = new FunctionDecl("reverse");
        reverseFn.addOverload(
          new OverloadDecl("string_reverse", [StringType], StringType, [], true)
        );

        const dispatcher = new DefaultDispatcher();
        dispatcher.add(
          new UnaryDispatcherOverload(
            "string_reverse",
            (arg) => new StringValue(String(arg.value()).split("").reverse().join(""))
          )
        );

        const env = new Env({
          declarations: [reverseFn],
          functions: dispatcher,
        });

        const compileResult = env.compile('"hello".reverse()');
        expect(compileResult.error).toBeUndefined();
        const evalResult = compileResult.program!.eval();
        expect(evalResult.success).toBe(true);
        expect((evalResult.value as StringValue).value()).toBe("olleh");
      });

      test("should evaluate custom member function (binary)", () => {
        const repeatFn = new FunctionDecl("repeat");
        repeatFn.addOverload(
          new OverloadDecl("string_repeat_int", [StringType, IntType], StringType, [], true)
        );

        const dispatcher = new DefaultDispatcher();
        dispatcher.add(
          new BinaryDispatcherOverload(
            "string_repeat_int",
            (str, count) => new StringValue(String(str.value()).repeat(Number(count.value())))
          )
        );

        const env = new Env({
          declarations: [repeatFn],
          functions: dispatcher,
        });

        const compileResult = env.compile('"ab".repeat(3)');
        expect(compileResult.error).toBeUndefined();
        const evalResult = compileResult.program!.eval();
        expect(evalResult.success).toBe(true);
        expect((evalResult.value as StringValue).value()).toBe("ababab");
      });
    });

    describe("Custom functions with variables", () => {
      test("should use custom function with variable arguments", () => {
        const isPositiveFn = new FunctionDecl("isPositive");
        isPositiveFn.addOverload(new OverloadDecl("isPositive_int", [IntType], BoolType));

        const dispatcher = new DefaultDispatcher();
        dispatcher.add(
          new UnaryDispatcherOverload("isPositive_int", (arg) => BoolValue.of((arg.value() as bigint) > 0n))
        );

        const env = new Env({
          declarations: [isPositiveFn, new VariableDecl("x", IntType)],
          functions: dispatcher,
        });

        const compileResult = env.compile("isPositive(x)");
        expect(compileResult.error).toBeUndefined();

        const result1 = compileResult.program!.eval({ x: 10 });
        expect(result1.success).toBe(true);
        expect((result1.value as BoolValue).value()).toBe(true);

        const result2 = compileResult.program!.eval({ x: -5 });
        expect(result2.success).toBe(true);
        expect((result2.value as BoolValue).value()).toBe(false);
      });
    });

    describe("Custom function error handling", () => {
      test("should return error from custom function", () => {
        const safeDivFn = new FunctionDecl("safeDiv");
        safeDivFn.addOverload(new OverloadDecl("safeDiv_int_int", [IntType, IntType], IntType));

        const dispatcher = new DefaultDispatcher();
        dispatcher.add(
          new BinaryDispatcherOverload("safeDiv_int_int", (lhs, rhs) => {
            const divisor = rhs.value() as bigint;
            if (divisor === 0n) {
              return ErrorValue.create("division by zero");
            }
            return IntValue.of((lhs.value() as bigint) / divisor);
          })
        );

        const env = new Env({
          declarations: [safeDivFn],
          functions: dispatcher,
        });

        const compileResult = env.compile("safeDiv(10, 0)");
        expect(compileResult.error).toBeUndefined();
        const evalResult = compileResult.program!.eval();
        expect(evalResult.success).toBe(false);
        expect(evalResult.error).toContain("division by zero");
      });
    });
  });

  describe("Macros", () => {
    describe("has() macro", () => {
      test("should return true for existing map key", () => {
        const env = new Env({
          declarations: [new VariableDecl("m", new MapType(StringType, IntType))],
        });
        const compileResult = env.compile("has(m.foo)");
        expect(compileResult.error).toBeUndefined();
        const evalResult = compileResult.program!.eval({ m: { foo: 42 } });
        expect(evalResult.success).toBe(true);
        expect((evalResult.value as BoolValue).value()).toBe(true);
      });

      test("should return false for missing map key", () => {
        const env = new Env({
          declarations: [new VariableDecl("m", new MapType(StringType, IntType))],
        });
        const compileResult = env.compile("has(m.bar)");
        expect(compileResult.error).toBeUndefined();
        const evalResult = compileResult.program!.eval({ m: { foo: 42 } });
        expect(evalResult.success).toBe(true);
        expect((evalResult.value as BoolValue).value()).toBe(false);
      });
    });

    describe("all() macro", () => {
      test("should return true when all elements match predicate", () => {
        const env = new Env({
          declarations: [new VariableDecl("list", new ListType(IntType))],
        });
        const compileResult = env.compile("list.all(x, x > 0)");
        expect(compileResult.error).toBeUndefined();
        const evalResult = compileResult.program!.eval({ list: [1, 2, 3, 4, 5] });
        expect(evalResult.success).toBe(true);
        expect((evalResult.value as BoolValue).value()).toBe(true);
      });

      test("should return false when some elements do not match", () => {
        const env = new Env({
          declarations: [new VariableDecl("list", new ListType(IntType))],
        });
        const compileResult = env.compile("list.all(x, x > 0)");
        expect(compileResult.error).toBeUndefined();
        const evalResult = compileResult.program!.eval({ list: [1, 2, -1, 4, 5] });
        expect(evalResult.success).toBe(true);
        expect((evalResult.value as BoolValue).value()).toBe(false);
      });

      test("should return true for empty list", () => {
        const env = new Env({
          declarations: [new VariableDecl("list", new ListType(IntType))],
        });
        const compileResult = env.compile("list.all(x, x > 0)");
        expect(compileResult.error).toBeUndefined();
        const evalResult = compileResult.program!.eval({ list: [] });
        expect(evalResult.success).toBe(true);
        expect((evalResult.value as BoolValue).value()).toBe(true);
      });
    });

    describe("exists() macro", () => {
      test("should return true when any element matches predicate", () => {
        const env = new Env({
          declarations: [new VariableDecl("list", new ListType(IntType))],
        });
        const compileResult = env.compile("list.exists(x, x > 3)");
        expect(compileResult.error).toBeUndefined();
        const evalResult = compileResult.program!.eval({ list: [1, 2, 3, 4, 5] });
        expect(evalResult.success).toBe(true);
        expect((evalResult.value as BoolValue).value()).toBe(true);
      });

      test("should return false when no elements match", () => {
        const env = new Env({
          declarations: [new VariableDecl("list", new ListType(IntType))],
        });
        const compileResult = env.compile("list.exists(x, x > 10)");
        expect(compileResult.error).toBeUndefined();
        const evalResult = compileResult.program!.eval({ list: [1, 2, 3, 4, 5] });
        expect(evalResult.success).toBe(true);
        expect((evalResult.value as BoolValue).value()).toBe(false);
      });

      test("should return false for empty list", () => {
        const env = new Env({
          declarations: [new VariableDecl("list", new ListType(IntType))],
        });
        const compileResult = env.compile("list.exists(x, x > 0)");
        expect(compileResult.error).toBeUndefined();
        const evalResult = compileResult.program!.eval({ list: [] });
        expect(evalResult.success).toBe(true);
        expect((evalResult.value as BoolValue).value()).toBe(false);
      });
    });

    describe("exists_one() macro", () => {
      test("should return true when exactly one element matches", () => {
        const env = new Env({
          declarations: [new VariableDecl("list", new ListType(IntType))],
        });
        const compileResult = env.compile("list.exists_one(x, x > 4)");
        expect(compileResult.error).toBeUndefined();
        const evalResult = compileResult.program!.eval({ list: [1, 2, 3, 4, 5] });
        expect(evalResult.success).toBe(true);
        expect((evalResult.value as BoolValue).value()).toBe(true);
      });

      test("should return false when zero elements match", () => {
        const env = new Env({
          declarations: [new VariableDecl("list", new ListType(IntType))],
        });
        const compileResult = env.compile("list.exists_one(x, x > 10)");
        expect(compileResult.error).toBeUndefined();
        const evalResult = compileResult.program!.eval({ list: [1, 2, 3, 4, 5] });
        expect(evalResult.success).toBe(true);
        expect((evalResult.value as BoolValue).value()).toBe(false);
      });

      test("should return false when multiple elements match", () => {
        const env = new Env({
          declarations: [new VariableDecl("list", new ListType(IntType))],
        });
        const compileResult = env.compile("list.exists_one(x, x > 3)");
        expect(compileResult.error).toBeUndefined();
        const evalResult = compileResult.program!.eval({ list: [1, 2, 3, 4, 5] });
        expect(evalResult.success).toBe(true);
        expect((evalResult.value as BoolValue).value()).toBe(false);
      });
    });

    describe("map() macro", () => {
      test("should transform list elements", () => {
        const env = new Env({
          declarations: [new VariableDecl("list", new ListType(IntType))],
        });
        const compileResult = env.compile("list.map(x, x * 2)");
        expect(compileResult.error).toBeUndefined();
        const evalResult = compileResult.program!.eval({ list: [1, 2, 3] });
        expect(evalResult.success).toBe(true);
        expect(evalResult.value).toBeInstanceOf(ListValue);
        const resultList = evalResult.value as ListValue;
        expect(resultList.size().value()).toBe(3n);
        expect((resultList.get(IntValue.of(0n)) as IntValue).value()).toBe(2n);
        expect((resultList.get(IntValue.of(1n)) as IntValue).value()).toBe(4n);
        expect((resultList.get(IntValue.of(2n)) as IntValue).value()).toBe(6n);
      });

      test("should handle map with filter", () => {
        const env = new Env({
          declarations: [new VariableDecl("list", new ListType(IntType))],
        });
        const compileResult = env.compile("list.map(x, x > 2, x * 10)");
        expect(compileResult.error).toBeUndefined();
        const evalResult = compileResult.program!.eval({ list: [1, 2, 3, 4, 5] });
        expect(evalResult.success).toBe(true);
        expect(evalResult.value).toBeInstanceOf(ListValue);
        const resultList = evalResult.value as ListValue;
        expect(resultList.size().value()).toBe(3n);
        expect((resultList.get(IntValue.of(0n)) as IntValue).value()).toBe(30n);
        expect((resultList.get(IntValue.of(1n)) as IntValue).value()).toBe(40n);
        expect((resultList.get(IntValue.of(2n)) as IntValue).value()).toBe(50n);
      });
    });

    describe("filter() macro", () => {
      test("should filter list elements", () => {
        const env = new Env({
          declarations: [new VariableDecl("list", new ListType(IntType))],
        });
        const compileResult = env.compile("list.filter(x, x > 2)");
        expect(compileResult.error).toBeUndefined();
        const evalResult = compileResult.program!.eval({ list: [1, 2, 3, 4, 5] });
        expect(evalResult.success).toBe(true);
        expect(evalResult.value).toBeInstanceOf(ListValue);
        const resultList = evalResult.value as ListValue;
        expect(resultList.size().value()).toBe(3n);
        expect((resultList.get(IntValue.of(0n)) as IntValue).value()).toBe(3n);
        expect((resultList.get(IntValue.of(1n)) as IntValue).value()).toBe(4n);
        expect((resultList.get(IntValue.of(2n)) as IntValue).value()).toBe(5n);
      });

      test("should return empty list when no elements match", () => {
        const env = new Env({
          declarations: [new VariableDecl("list", new ListType(IntType))],
        });
        const compileResult = env.compile("list.filter(x, x > 10)");
        expect(compileResult.error).toBeUndefined();
        const evalResult = compileResult.program!.eval({ list: [1, 2, 3, 4, 5] });
        expect(evalResult.success).toBe(true);
        expect(evalResult.value).toBeInstanceOf(ListValue);
        const resultList = evalResult.value as ListValue;
        expect(resultList.size().value()).toBe(0n);
      });
    });
  });
});
