import { describe, expect, test } from "bun:test";
import { CharStream, CommonTokenStream } from "antlr4";
import {
  CheckerEnv,
  CheckerErrors,
  Container,
  FunctionDecl,
  OverloadDecl,
  Type,
  TypeKind,
  VariableDecl,
  check,
  formatType,
  getStandardFunctions,
  isAssignable,
  isDynOrError,
} from "../src/checker";
import { CELLexer, CELParser, ParserHelper } from "../src/parser";

// Helper function: parse and type check an expression
const parseAndCheck = (expression: string, env: CheckerEnv = createDefaultEnv()) => {
  const chars = new CharStream(expression);
  const lexer = new CELLexer(chars);
  const tokens = new CommonTokenStream(lexer);
  const parser = new CELParser(tokens);
  const tree = parser.start();
  // Convert ANTLR parse tree to our AST with macro expansion
  const helper = new ParserHelper(expression);
  const ast = helper.parse(tree);
  const result = check(ast, env);
  // Return type from the root expression
  return {
    errors: result.errors,
    type: result.ast.typeMap.get(result.ast.expr.id) ?? Type.Dyn,
  };
};

// Create a default environment with standard library
const createDefaultEnv = () => {
  const env = new CheckerEnv();
  // Add standard library functions
  for (const fn of getStandardFunctions()) {
    env.addFunctions(fn);
  }
  return env;
};

// Create an environment with common declarations
const createTestEnv = () => {
  const env = createDefaultEnv();

  // Add variable declarations
  env.addIdents(
    new VariableDecl("x", Type.Int),
    new VariableDecl("y", Type.Int),
    new VariableDecl("s", Type.String),
    new VariableDecl("b", Type.Bool),
    new VariableDecl("d", Type.Double),
    new VariableDecl("list", Type.newListType(Type.Int)),
    new VariableDecl("map", Type.newMapType(Type.String, Type.Int))
  );

  return env;
};

describe("Type System", () => {
  test("primitive types should have correct kinds", () => {
    expect(Type.Bool.kind).toBe(TypeKind.Bool);
    expect(Type.Int.kind).toBe(TypeKind.Int);
    expect(Type.Uint.kind).toBe(TypeKind.Uint);
    expect(Type.Double.kind).toBe(TypeKind.Double);
    expect(Type.String.kind).toBe(TypeKind.String);
    expect(Type.Bytes.kind).toBe(TypeKind.Bytes);
    expect(Type.Null.kind).toBe(TypeKind.Null);
  });

  test("special types should have correct kinds", () => {
    expect(Type.Dyn.kind).toBe(TypeKind.Dyn);
    expect(Type.Error.kind).toBe(TypeKind.Error);
  });

  test("list type should preserve element type", () => {
    const listInt = Type.newListType(Type.Int);
    expect(listInt.kind).toBe(TypeKind.List);
    expect(listInt.listElementType()?.kind).toBe(TypeKind.Int);
  });

  test("map type should preserve key and value types", () => {
    const mapType = Type.newMapType(Type.String, Type.Int);
    expect(mapType.kind).toBe(TypeKind.Map);
    expect(mapType.mapKeyType()?.kind).toBe(TypeKind.String);
    expect(mapType.mapValueType()?.kind).toBe(TypeKind.Int);
  });

  test("type equivalence should work correctly", () => {
    expect(Type.Int.isEquivalentType(Type.Int)).toBe(true);
    expect(Type.Int.isEquivalentType(Type.Double)).toBe(false);
    expect(Type.newListType(Type.Int).isEquivalentType(Type.newListType(Type.Int))).toBe(true);
    expect(Type.newListType(Type.Int).isEquivalentType(Type.newListType(Type.String))).toBe(false);
  });

  test("isAssignable should handle dyn types", () => {
    expect(isAssignable(Type.Dyn, Type.Int)).toBe(true);
    expect(isAssignable(Type.Int, Type.Dyn)).toBe(true);
  });

  test("isDynOrError should identify special types", () => {
    expect(isDynOrError(Type.Dyn)).toBe(true);
    expect(isDynOrError(Type.Error)).toBe(true);
    expect(isDynOrError(Type.Int)).toBe(false);
  });

  test("formatType should produce readable strings", () => {
    expect(formatType(Type.Int)).toBe("int");
    expect(formatType(Type.String)).toBe("string");
    expect(formatType(Type.newListType(Type.Int))).toBe("list(int)");
    expect(formatType(Type.newMapType(Type.String, Type.Int))).toBe("map(string, int)");
  });
});

describe("Checker - Literals", () => {
  test("should type check integer literals", () => {
    const result = parseAndCheck("42");
    expect(result.errors.hasErrors()).toBe(false);
    expect(result.type.kind).toBe(TypeKind.Int);
  });

  test("should type check unsigned integer literals", () => {
    const result = parseAndCheck("42u");
    expect(result.errors.hasErrors()).toBe(false);
    expect(result.type.kind).toBe(TypeKind.Uint);
  });

  test("should type check double literals", () => {
    const result = parseAndCheck("3.14");
    expect(result.errors.hasErrors()).toBe(false);
    expect(result.type.kind).toBe(TypeKind.Double);
  });

  test("should type check string literals", () => {
    const result = parseAndCheck('"hello"');
    expect(result.errors.hasErrors()).toBe(false);
    expect(result.type.kind).toBe(TypeKind.String);
  });

  test("should type check boolean literals", () => {
    expect(parseAndCheck("true").type.kind).toBe(TypeKind.Bool);
    expect(parseAndCheck("false").type.kind).toBe(TypeKind.Bool);
  });

  test("should type check null literal", () => {
    const result = parseAndCheck("null");
    expect(result.errors.hasErrors()).toBe(false);
    expect(result.type.kind).toBe(TypeKind.Null);
  });
});

describe("Checker - Variables", () => {
  test("should type check declared variables", () => {
    const env = createTestEnv();
    const result = parseAndCheck("x", env);
    expect(result.errors.hasErrors()).toBe(false);
    expect(result.type.kind).toBe(TypeKind.Int);
  });

  test("should report error for undeclared variables", () => {
    const env = createTestEnv();
    const result = parseAndCheck("undeclared", env);
    expect(result.errors.hasErrors()).toBe(true);
    expect(result.type.kind).toBe(TypeKind.Error);
  });
});

describe("Checker - Arithmetic Operations", () => {
  test("should type check integer addition", () => {
    const env = createTestEnv();
    const result = parseAndCheck("x + y", env);
    expect(result.errors.hasErrors()).toBe(false);
    expect(result.type.kind).toBe(TypeKind.Int);
  });

  test("should type check integer subtraction", () => {
    const env = createTestEnv();
    const result = parseAndCheck("x - y", env);
    expect(result.errors.hasErrors()).toBe(false);
    expect(result.type.kind).toBe(TypeKind.Int);
  });

  test("should type check integer multiplication", () => {
    const env = createTestEnv();
    const result = parseAndCheck("x * y", env);
    expect(result.errors.hasErrors()).toBe(false);
    expect(result.type.kind).toBe(TypeKind.Int);
  });

  test("should type check integer division", () => {
    const env = createTestEnv();
    const result = parseAndCheck("x / y", env);
    expect(result.errors.hasErrors()).toBe(false);
    expect(result.type.kind).toBe(TypeKind.Int);
  });

  test("should type check integer modulo", () => {
    const env = createTestEnv();
    const result = parseAndCheck("x % y", env);
    expect(result.errors.hasErrors()).toBe(false);
    expect(result.type.kind).toBe(TypeKind.Int);
  });

  test("should type check string concatenation", () => {
    const env = createTestEnv();
    env.addIdents(new VariableDecl("s2", Type.String));
    const result = parseAndCheck("s + s2", env);
    expect(result.errors.hasErrors()).toBe(false);
    expect(result.type.kind).toBe(TypeKind.String);
  });

  test("should type check negation", () => {
    const env = createTestEnv();
    const result = parseAndCheck("-x", env);
    expect(result.errors.hasErrors()).toBe(false);
    expect(result.type.kind).toBe(TypeKind.Int);
  });

  test("should report error for incompatible arithmetic types", () => {
    const env = createTestEnv();
    const result = parseAndCheck("x + s", env);
    expect(result.errors.hasErrors()).toBe(true);
  });
});

describe("Checker - Comparison Operations", () => {
  test("should type check equality", () => {
    const env = createTestEnv();
    const result = parseAndCheck("x == y", env);
    expect(result.errors.hasErrors()).toBe(false);
    expect(result.type.kind).toBe(TypeKind.Bool);
  });

  test("should type check inequality", () => {
    const env = createTestEnv();
    const result = parseAndCheck("x != y", env);
    expect(result.errors.hasErrors()).toBe(false);
    expect(result.type.kind).toBe(TypeKind.Bool);
  });

  test("should type check less than", () => {
    const env = createTestEnv();
    const result = parseAndCheck("x < y", env);
    expect(result.errors.hasErrors()).toBe(false);
    expect(result.type.kind).toBe(TypeKind.Bool);
  });

  test("should type check greater than", () => {
    const env = createTestEnv();
    const result = parseAndCheck("x > y", env);
    expect(result.errors.hasErrors()).toBe(false);
    expect(result.type.kind).toBe(TypeKind.Bool);
  });

  test("should type check less than or equal", () => {
    const env = createTestEnv();
    const result = parseAndCheck("x <= y", env);
    expect(result.errors.hasErrors()).toBe(false);
    expect(result.type.kind).toBe(TypeKind.Bool);
  });

  test("should type check greater than or equal", () => {
    const env = createTestEnv();
    const result = parseAndCheck("x >= y", env);
    expect(result.errors.hasErrors()).toBe(false);
    expect(result.type.kind).toBe(TypeKind.Bool);
  });
});

describe("Checker - Logical Operations", () => {
  test("should type check logical AND", () => {
    const env = createTestEnv();
    const result = parseAndCheck("b && true", env);
    expect(result.errors.hasErrors()).toBe(false);
    expect(result.type.kind).toBe(TypeKind.Bool);
  });

  test("should type check logical OR", () => {
    const env = createTestEnv();
    const result = parseAndCheck("b || false", env);
    expect(result.errors.hasErrors()).toBe(false);
    expect(result.type.kind).toBe(TypeKind.Bool);
  });

  test("should type check logical NOT", () => {
    const env = createTestEnv();
    const result = parseAndCheck("!b", env);
    expect(result.errors.hasErrors()).toBe(false);
    expect(result.type.kind).toBe(TypeKind.Bool);
  });

  test("should report error for non-boolean operands in AND", () => {
    const env = createTestEnv();
    const result = parseAndCheck("x && y", env);
    expect(result.errors.hasErrors()).toBe(true);
  });

  test("should report error for non-boolean operand in NOT", () => {
    const env = createTestEnv();
    const result = parseAndCheck("!x", env);
    expect(result.errors.hasErrors()).toBe(true);
  });
});

describe("Checker - Ternary Expressions", () => {
  test("should type check ternary with matching branch types", () => {
    const env = createTestEnv();
    const result = parseAndCheck("b ? x : y", env);
    expect(result.errors.hasErrors()).toBe(false);
    expect(result.type.kind).toBe(TypeKind.Int);
  });

  test("should report error for non-boolean condition", () => {
    const env = createTestEnv();
    const result = parseAndCheck("x ? y : y", env);
    expect(result.errors.hasErrors()).toBe(true);
  });

  test("should join types for different branch types", () => {
    const env = createTestEnv();
    const result = parseAndCheck("b ? x : s", env);
    // Different types should result in Dyn
    expect(result.type.kind).toBe(TypeKind.Dyn);
  });
});

describe("Checker - List Expressions", () => {
  test("should type check empty list", () => {
    const result = parseAndCheck("[]");
    expect(result.errors.hasErrors()).toBe(false);
    expect(result.type.kind).toBe(TypeKind.List);
  });

  test("should type check list with integer elements", () => {
    const result = parseAndCheck("[1, 2, 3]");
    expect(result.errors.hasErrors()).toBe(false);
    expect(result.type.kind).toBe(TypeKind.List);
    expect(result.type.listElementType()?.kind).toBe(TypeKind.Int);
  });

  test("should type check list indexing", () => {
    const env = createTestEnv();
    const result = parseAndCheck("list[0]", env);
    expect(result.errors.hasErrors()).toBe(false);
    expect(result.type.kind).toBe(TypeKind.Int);
  });

  test("should report error for non-integer list index", () => {
    const env = createTestEnv();
    const result = parseAndCheck("list[s]", env);
    expect(result.errors.hasErrors()).toBe(true);
  });
});

describe("Checker - Map Expressions", () => {
  test("should type check empty map", () => {
    const result = parseAndCheck("{}");
    expect(result.errors.hasErrors()).toBe(false);
    expect(result.type.kind).toBe(TypeKind.Map);
  });

  test("should type check map with entries", () => {
    const result = parseAndCheck('{"a": 1, "b": 2}');
    expect(result.errors.hasErrors()).toBe(false);
    expect(result.type.kind).toBe(TypeKind.Map);
    expect(result.type.mapKeyType()?.kind).toBe(TypeKind.String);
    expect(result.type.mapValueType()?.kind).toBe(TypeKind.Int);
  });

  test("should type check map indexing", () => {
    const env = createTestEnv();
    const result = parseAndCheck('map["key"]', env);
    expect(result.errors.hasErrors()).toBe(false);
    expect(result.type.kind).toBe(TypeKind.Int);
  });
});

describe("Checker - Function Calls", () => {
  test("should type check known function", () => {
    const env = createTestEnv();
    const result = parseAndCheck("size(list)", env);
    expect(result.errors.hasErrors()).toBe(false);
    expect(result.type.kind).toBe(TypeKind.Int);
  });

  test("should report error for unknown function", () => {
    const env = createTestEnv();
    const result = parseAndCheck("unknown(x)", env);
    expect(result.errors.hasErrors()).toBe(true);
  });

  test("should type check size on string", () => {
    const env = createTestEnv();
    const result = parseAndCheck("size(s)", env);
    expect(result.errors.hasErrors()).toBe(false);
    expect(result.type.kind).toBe(TypeKind.Int);
  });
});

describe("Checker - In Operator", () => {
  test("should type check 'in' with list", () => {
    const env = createTestEnv();
    const result = parseAndCheck("x in list", env);
    expect(result.errors.hasErrors()).toBe(false);
    expect(result.type.kind).toBe(TypeKind.Bool);
  });

  test("should type check 'in' with map", () => {
    const env = createTestEnv();
    const result = parseAndCheck('"key" in map', env);
    expect(result.errors.hasErrors()).toBe(false);
    expect(result.type.kind).toBe(TypeKind.Bool);
  });

  test("should report error for 'in' with non-container", () => {
    const env = createTestEnv();
    const result = parseAndCheck("x in y", env);
    expect(result.errors.hasErrors()).toBe(true);
  });
});

describe("Checker Errors", () => {
  test("should collect and report errors", () => {
    const errors = new CheckerErrors();
    expect(errors.hasErrors()).toBe(false);
    expect(errors.count()).toBe(0);

    errors.reportError("test error", 1);
    expect(errors.hasErrors()).toBe(true);
    expect(errors.count()).toBe(1);
  });

  test("should format errors as string", () => {
    const errors = new CheckerErrors();
    errors.reportTypeMismatch(1, Type.Int, Type.String);
    const output = errors.toString();
    expect(output).toContain("type mismatch");
    expect(output).toContain("int");
    expect(output).toContain("string");
  });
});

describe("Container", () => {
  test("should resolve candidate names", () => {
    const container = new Container("com.example");
    const candidates = container.resolveCandidateNames("Foo");
    expect(candidates).toContain("com.example.Foo");
    expect(candidates).toContain("com.Foo");
    expect(candidates).toContain("Foo");
  });

  test("should handle aliases", () => {
    const container = new Container();
    container.addAlias("MyType", "com.example.FullyQualifiedType");
    const candidates = container.resolveCandidateNames("MyType");
    expect(candidates).toEqual(["com.example.FullyQualifiedType"]);
  });
});

describe("Declarations", () => {
  test("should create variable declarations", () => {
    const decl = new VariableDecl("myVar", Type.Int);
    expect(decl.name).toBe("myVar");
    expect(decl.type.kind).toBe(TypeKind.Int);
  });

  test("should create function declarations with overloads", () => {
    const fn = new FunctionDecl("myFunc");
    fn.addOverload(new OverloadDecl("myFunc_int", [Type.Int], Type.Bool));
    fn.addOverload(new OverloadDecl("myFunc_string", [Type.String], Type.Bool));

    expect(fn.name).toBe("myFunc");
    expect(fn.overloads().length).toBe(2);
  });

  test("should merge function declarations", () => {
    const fn1 = new FunctionDecl("myFunc");
    fn1.addOverload(new OverloadDecl("myFunc_int", [Type.Int], Type.Bool));

    const fn2 = new FunctionDecl("myFunc");
    fn2.addOverload(new OverloadDecl("myFunc_string", [Type.String], Type.Bool));

    fn1.merge(fn2);
    expect(fn1.overloads().length).toBe(2);
  });
});
