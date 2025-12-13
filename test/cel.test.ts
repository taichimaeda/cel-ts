// Tests for the cel-ts high-level API surface
// Detailed interpreter behavior tests are in interpreter.test.ts

import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import {
  type BoolValue,
  CELError,
  CompileError,
  DisableStandardLibraryOption,
  DisableTypeCheckingOption,
  EmptyActivation,
  Env,
  FunctionOption,
  FunctionOverload,
  IntType,
  type IntValue,
  IntValue as IntValueClass,
  ParseError,
  StringType,
  StringValue as StringValueClass,
  type Value,
  Types,
  VariableOption,
} from "../src/cel";

describe("CEL API - Env", () => {
  test("should create environment with standard library", () => {
    const env = new Env();
    expect(env).toBeDefined();
  });

  test("should create environment with variables", () => {
    const env = new Env(new VariableOption("x", IntType), new VariableOption("name", StringType));
    expect(env).toBeDefined();
  });

  test("should compile and evaluate simple expression", () => {
    const env = new Env();
    const ast = env.compile("1 + 2");
    expect(ast.isChecked).toBe(true);
    expect(ast.outputType?.toString()).toBe("int");

    const prg = env.program(ast);
    const result = prg.eval();
    expect((result as IntValue).value()).toBe(3n);
  });

  test("should compile and evaluate expression with variables", () => {
    const env = new Env(new VariableOption("x", IntType), new VariableOption("y", IntType));
    const ast = env.compile("x + y");
    const prg = env.program(ast);
    const result = prg.eval({ x: 10, y: 20 });
    expect((result as IntValue).value()).toBe(30n);
  });

  test("should throw CompileError on type errors", () => {
    const env = new Env(new VariableOption("x", IntType));
    expect(() => env.compile("y + 1")).toThrow(CompileError);
  });

  test("should throw ParseError on syntax error", () => {
    const env = new Env();
    expect(() => env.parse("1 +")).toThrow(ParseError);
  });

  test("should throw CELError on evaluation error", () => {
    const env = new Env(new VariableOption("x", IntType));
    const ast = env.compile("x / 0");
    const prg = env.program(ast);
    expect(() => prg.eval({ x: 10 })).toThrow(CELError);
  });
});

describe("CEL API - Parse and Check", () => {
  test("should parse without type checking", () => {
    const env = new Env();
    const ast = env.parse("1 + 2");
    expect(ast.isChecked).toBe(false);
  });

  test("should type-check parsed AST", () => {
    const env = new Env();
    const parsedAst = env.parse("1 + 2");
    const checkedAst = env.check(parsedAst);
    expect(checkedAst.isChecked).toBe(true);
    expect(checkedAst.outputType?.toString()).toBe("int");
  });
});

describe("CEL API - Extend Environment", () => {
  test("should extend environment with new variables", () => {
    const env = new Env(new VariableOption("x", IntType));
    const extEnv = env.extend(new VariableOption("y", IntType));
    const ast = extEnv.compile("x + y");
    const prg = extEnv.program(ast);
    const result = prg.eval({ x: 5, y: 10 });
    expect((result as IntValue).value()).toBe(15n);
  });
});

describe("CEL API - Custom Functions", () => {
  test("should declare and evaluate global function with unary binding", () => {
    const env = new Env(
      new FunctionOption(
        "greet",
        FunctionOverload.global(
          "greet_string",
          [StringType],
          StringType,
          (arg: Value) => new StringValueClass(`Hello, ${arg.value()}!`)
        )
      )
    );
    const ast = env.compile('greet("world")');
    expect(ast.outputType?.toString()).toBe("string");
    const prg = env.program(ast);
    const result = prg.eval();
    expect(result.value()).toBe("Hello, world!");
  });

  test("should declare and evaluate global function with binary binding", () => {
    const env = new Env(
      new FunctionOption(
        "add",
        FunctionOverload.global("add_int_int", [IntType, IntType], IntType, (lhs, rhs) =>
          IntValueClass.of((lhs.value() as bigint) + (rhs.value() as bigint))
        )
      )
    );
    const ast = env.compile("add(10, 20)");
    const prg = env.program(ast);
    const result = prg.eval();
    expect(result.value()).toBe(30n);
  });

  test("should declare and evaluate member function", () => {
    const env = new Env(
      new FunctionOption(
        "reverse",
        FunctionOverload.member(
          "string_reverse",
          [StringType],
          StringType,
          (arg: Value) => new StringValueClass(String(arg.value()).split("").reverse().join(""))
        )
      )
    );
    const ast = env.compile('"hello".reverse()');
    expect(ast.outputType?.toString()).toBe("string");
    const prg = env.program(ast);
    const result = prg.eval();
    expect(result.value()).toBe("olleh");
  });
});

describe("CEL API - Type Helpers", () => {
  test("should create list type", () => {
    const listType = Types.list(IntType);
    expect(listType.toString()).toBe("list(int)");
  });

  test("should create map type", () => {
    const mapType = Types.map(StringType, IntType);
    expect(mapType.toString()).toBe("map(string, int)");
  });
});

describe("CEL API - Environment Options", () => {
  test("should create environment without standard library", () => {
    const env = new Env(new DisableStandardLibraryOption(), new VariableOption("x", IntType));
    expect(() => env.compile('size("hello")')).toThrow(CompileError);
  });

  test("should skip type checking when disabled", () => {
    const env = new Env(new DisableTypeCheckingOption());
    const ast = env.compile("unknown_var + 1");
    expect(ast.isChecked).toBe(false);
  });

  test("should evaluate with empty activation", () => {
    const env = new Env();
    const ast = env.compile("1 + 2 + 3");
    const prg = env.program(ast);
    const result = prg.eval(new EmptyActivation());
    expect((result as IntValue).value()).toBe(6n);
  });
});

describe("CEL API - Property-Based Tests", () => {
  test("should agree with JS arithmetic for arbitrary activations", () => {
    const env = new Env(new VariableOption("a", IntType), new VariableOption("b", IntType), new VariableOption("c", IntType));
    const ast = env.compile("(a * b) - c + (a > c ? a : c)");
    const prg = env.program(ast);

    const activationArb = fc.record({
      a: fc.integer({ min: -100, max: 100 }),
      b: fc.integer({ min: -100, max: 100 }),
      c: fc.integer({ min: -100, max: 100 }),
    });

    fc.assert(
      fc.property(activationArb, (activation) => {
        const result = prg.eval(activation) as IntValue;
        const expected = BigInt(
          activation.a * activation.b -
            activation.c +
            (activation.a > activation.c ? activation.a : activation.c)
        );
        return result.value() === expected;
      })
    );
  });

  test("should report list length via size()", () => {
    const env = new Env(new VariableOption("numbers", Types.list(IntType)));
    const ast = env.compile("size(numbers)");
    const prg = env.program(ast);

    fc.assert(
      fc.property(fc.array(fc.integer({ min: -20, max: 20 }), { maxLength: 12 }), (numbers) => {
        const result = prg.eval({ numbers }) as IntValue;
        return result.value() === BigInt(numbers.length);
      })
    );
  });

  test("should match JS includes for `in` operator on lists", () => {
    const env = new Env(new VariableOption("roles", Types.list(StringType)), new VariableOption("target", StringType));
    const ast = env.compile("target in roles");
    const prg = env.program(ast);

    const activationArb = fc.record({
      roles: fc.array(fc.string({ maxLength: 6 }), { maxLength: 8 }),
      target: fc.string({ maxLength: 6 }),
    });

    fc.assert(
      fc.property(activationArb, ({ roles, target }) => {
        const result = prg.eval({ roles, target }) as BoolValue;
        return result.value() === roles.includes(target);
      })
    );
  });
});
