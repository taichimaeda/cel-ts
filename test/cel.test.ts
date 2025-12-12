// Tests for the cel-ts API (TypeScript native)

import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import {
  type BoolValue,
  CELError,
  CompileError,
  DisableStandardLibrary,
  DisableTypeChecking,
  EmptyActivation,
  Env,
  Function,
  GlobalOverload,
  IntType,
  type IntValue,
  ListType,
  MapType,
  MemberOverload,
  ParseError,
  StringType,
  type StringValue,
  Variable,
} from "../src/cel";

describe("CEL API - Env", () => {
  test("should create environment with standard library", () => {
    const env = new Env();
    expect(env).toBeDefined();
  });

  test("should create environment with variables", () => {
    const env = new Env(Variable("x", IntType), Variable("name", StringType));
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
    const env = new Env(Variable("x", IntType), Variable("y", IntType));

    const ast = env.compile("x + y");
    const prg = env.program(ast);

    const result = prg.eval({ x: 10, y: 20 });
    expect((result as IntValue).value()).toBe(30n);
  });

  test("should throw CompileError on type errors", () => {
    const env = new Env(Variable("x", IntType));

    // Using an undeclared variable
    expect(() => env.compile("y + 1")).toThrow(CompileError);
  });

  test("CompileError should have issues", () => {
    const env = new Env(Variable("x", IntType));

    try {
      env.compile("y + 1");
      expect(true).toBe(false); // should not reach
    } catch (e) {
      expect(e).toBeInstanceOf(CompileError);
      const err = e as CompileError;
      expect(err.issues.hasErrors).toBe(true);
      expect(err.issues.length).toBeGreaterThan(0);
    }
  });
});

describe("CEL API - Parse and Check", () => {
  test("should parse without type checking", () => {
    const env = new Env();

    const ast = env.parse("1 + 2");
    expect(ast.isChecked).toBe(false);
    expect(ast.source).toBe("1 + 2");
  });

  test("should type-check parsed AST", () => {
    const env = new Env();

    const parsedAst = env.parse("1 + 2");
    const checkedAst = env.check(parsedAst);

    expect(checkedAst.isChecked).toBe(true);
    expect(checkedAst.outputType?.toString()).toBe("int");
  });

  test("should throw ParseError on syntax error", () => {
    const env = new Env();
    expect(() => env.parse("1 +")).toThrow(ParseError);
  });
});

describe("CEL API - Extend Environment", () => {
  test("should extend environment with new variables", () => {
    const env = new Env(Variable("x", IntType));
    const extEnv = env.extend(Variable("y", IntType));

    const ast = extEnv.compile("x + y");
    const prg = extEnv.program(ast);

    const result = prg.eval({ x: 5, y: 10 });
    expect((result as IntValue).value()).toBe(15n);
  });
});

describe("CEL API - Custom Functions", () => {
  test("should declare custom function for type checking", () => {
    // Declare a custom function (for type checking only)
    const env = new Env(
      Function("greet", GlobalOverload("greet_string", [StringType], StringType))
    );

    // Type checking should succeed
    const ast = env.compile('greet("world")');
    expect(ast.outputType?.toString()).toBe("string");
  });

  test("should declare member function for type checking", () => {
    // Declare a member function (for type checking only)
    const env = new Env(
      Function("reverse", MemberOverload("string_reverse", [StringType], StringType))
    );

    // Type checking should succeed
    const ast = env.compile('"hello".reverse()');
    expect(ast.outputType?.toString()).toBe("string");
  });
});

describe("CEL API - Type Helpers", () => {
  test("should create list type", () => {
    const listType = ListType(IntType);
    expect(listType.toString()).toBe("list(int)");
  });

  test("should create map type", () => {
    const mapType = MapType(StringType, IntType);
    expect(mapType.toString()).toBe("map(string, int)");
  });

  test("should compile with list variable", () => {
    const env = new Env(Variable("numbers", ListType(IntType)));

    const ast = env.compile("size(numbers)");
    expect(ast.outputType?.toString()).toBe("int");
  });

  test("should compile with map variable", () => {
    const env = new Env(Variable("data", MapType(StringType, IntType)));

    const ast = env.compile("size(data)");
    expect(ast.outputType?.toString()).toBe("int");
  });
});

describe("CEL API - Custom Env (Without Stdlib)", () => {
  test("should create environment without standard library", () => {
    const env = new Env(DisableStandardLibrary(), Variable("x", IntType));

    // The standard `size` function should not be available
    expect(() => env.compile('size("hello")')).toThrow(CompileError);
  });
});

describe("CEL API - Disable Type Checking", () => {
  test("should skip type checking when disabled", () => {
    const env = new Env(DisableTypeChecking());

    // No error even with an undeclared variable
    const ast = env.compile("unknown_var + 1");
    expect(ast.isChecked).toBe(false);
  });
});

describe("CEL API - Empty Activation", () => {
  test("should evaluate with empty activation", () => {
    const env = new Env();

    const ast = env.compile("1 + 2 + 3");
    const prg = env.program(ast);

    const result = prg.eval(new EmptyActivation());
    expect((result as IntValue).value()).toBe(6n);
  });
});

describe("CEL API - Issues", () => {
  test("should have working Issues in CompileError", () => {
    const env = new Env();

    try {
      env.compile("undefined_var");
      expect(true).toBe(false);
    } catch (e) {
      expect(e).toBeInstanceOf(CompileError);
      const err = e as CompileError;
      expect(err.issues.hasErrors).toBe(true);
      expect(err.issues.length).toBeGreaterThan(0);
      expect(err.issues.errors.length).toBeGreaterThan(0);
      expect(err.issues.toString()).toContain("undefined_var");
    }
  });
});

describe("CEL API - AST", () => {
  test("should have working Ast properties", () => {
    const env = new Env();
    const ast = env.compile("true && false");

    expect(ast.isChecked).toBe(true);
    expect(ast.source).toBe("true && false");
    expect(ast.outputType?.toString()).toBe("bool");
  });
});

describe("CEL API - Standard Library Functions", () => {
  test("should use size function", () => {
    const env = new Env();
    const ast = env.compile('size("hello")');
    const prg = env.program(ast);

    const result = prg.eval();
    expect((result as IntValue).value()).toBe(5n);
  });

  test("should use contains function", () => {
    const env = new Env();
    const ast = env.compile('"hello world".contains("world")');
    const prg = env.program(ast);

    const result = prg.eval();
    expect((result as BoolValue).value()).toBe(true);
  });

  test("should use int conversion", () => {
    const env = new Env();
    const ast = env.compile('int("42")');
    const prg = env.program(ast);

    const result = prg.eval();
    expect((result as IntValue).value()).toBe(42n);
  });
});

describe("CEL API - Complex Expressions", () => {
  test("should evaluate nested arithmetic with lists and maps", () => {
    const env = new Env(
      Variable("scores", ListType(IntType)),
      Variable("config", MapType(StringType, IntType)),
      Variable("limit", IntType)
    );

    const expr =
      'size(scores) > 1 ? scores[0] * config["multiplier"] + scores[1] + (limit > config["bonus"] ? limit : config["bonus"]) : size(scores) == 1 ? scores[0] + config["bonus"] : config["bonus"]';
    const ast = env.compile(expr);
    const prg = env.program(ast);

    const activation = {
      scores: [4, 7, 9],
      config: { multiplier: 2, bonus: 3 },
      limit: 5,
    };

    const result = prg.eval(activation) as IntValue;
    const expected = BigInt(4 * 2 + 7 + (5 > 3 ? 5 : 3));
    expect(result.value()).toBe(expected);
  });

  test("should combine string operations with numeric comparisons", () => {
    const env = new Env(
      Variable("name", StringType),
      Variable("scores", ListType(IntType)),
      Variable("config", MapType(StringType, IntType))
    );

    const expr =
      '(name.contains("admin") ? "priority:" : "user:") + string(size(name)) + "-" + string(scores[0] + config["bonus"])';
    const ast = env.compile(expr);
    const prg = env.program(ast);

    const activation = {
      name: "administrator",
      scores: [10, 5],
      config: { bonus: 2 },
    };

    const result = prg.eval(activation) as StringValue;
    expect(result.value()).toBe("priority:13-12");
  });

  test("should evaluate membership driven scoring logic", () => {
    const env = new Env(
      Variable("roles", ListType(StringType)),
      Variable("scores", ListType(IntType)),
      Variable("config", MapType(StringType, IntType)),
      Variable("limit", IntType)
    );

    const expr =
      '("admin" in roles ? scores[0] + config["bonus"] : scores[1] - config["penalty"]) + (limit > scores[2] ? limit : scores[2]) + size(roles)';
    const ast = env.compile(expr);
    const prg = env.program(ast);

    const activation = {
      roles: ["user", "admin", "editor"],
      scores: [12, 6, 9],
      config: { bonus: 5, penalty: 2 },
      limit: 8,
    };

    const [score0 = 0, score1 = 0, score2 = 0] = activation.scores;
    const expected =
      BigInt(
        activation.roles.includes("admin")
          ? score0 + activation.config.bonus
          : score1 - activation.config.penalty
      ) +
      BigInt(activation.limit > score2 ? activation.limit : score2) +
      BigInt(activation.roles.length);
    const result = prg.eval(activation) as IntValue;
    expect(result.value()).toBe(expected);
  });

  test("should evaluate nested map access with conversions", () => {
    const env = new Env(
      Variable("profile", MapType(StringType, MapType(StringType, StringType))),
      Variable("fallback", IntType)
    );

    const expr =
      'int(profile.address.suite) + size(profile.address.zip) + (profile.address.zip.contains("0") ? fallback : 0)';
    const ast = env.compile(expr);
    const prg = env.program(ast);

    const activation = {
      profile: {
        address: {
          zip: "94105",
          suite: "15",
        },
      },
      fallback: 4,
    };

    const expected = BigInt(15 + 5 + 4);
    const result = prg.eval(activation) as IntValue;
    expect(result.value()).toBe(expected);
  });
});

describe("CEL API - Property-Based Expressions", () => {
  test("should agree with JS arithmetic for arbitrary activations", () => {
    const env = new Env(Variable("a", IntType), Variable("b", IntType), Variable("c", IntType));
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
    const env = new Env(Variable("numbers", ListType(IntType)));
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
    const env = new Env(Variable("roles", ListType(StringType)), Variable("target", StringType));
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

describe("CEL API - Eval Throws On Error", () => {
  test("should throw CELError on evaluation error", () => {
    const env = new Env(Variable("x", IntType));
    const ast = env.compile("x / 0");
    const prg = env.program(ast);

    expect(() => prg.eval({ x: 10 })).toThrow(CELError);
  });
});
