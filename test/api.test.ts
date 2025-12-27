import { describe, expect, test } from "bun:test";
import * as protobuf from "protobufjs";
import {
  BoolType,
  Function as CelFunction,
  CompileError,
  Constant,
  EmptyActivation,
  Env,
  IntType,
  IntValue,
  ListType,
  MemberOverload,
  Overload,
  ParseError,
  PartialActivation,
  ProtobufTypeProvider,
  StringType,
  StringValue,
  Struct,
  StructType,
  Variable,
  isUnknownValue,
} from "../src/api";

describe("CEL API", () => {
  test("compiles and evaluates constant expressions", () => {
    const env = new Env();
    const ast = env.compile("1 + 2");
    const program = env.program(ast);
    const result = program.eval();

    expect(result.value()).toBe(3n);
  });

  test("compiles and evaluates expressions with constants", () => {
    const env = new Env({
      variables: [new Variable("x", IntType)],
    });
    const ast = env.compile("x + 1");
    const program = env.program(ast);
    const result = program.eval({ x: 2n });

    expect(result.value()).toBe(3n);
  });

  test("folds constants into compiled programs", () => {
    const env = new Env({
      constants: [new Constant("ANSWER", IntType, IntValue.of(42n))],
    });
    const ast = env.compile("ANSWER + 1");
    const program = env.program(ast);

    expect(program.eval().value()).toBe(43n);
  });

  test("throws ParseError on invalid syntax", () => {
    const env = new Env({ disableTypeChecking: true });

    expect(() => env.parse("x +")).toThrow(ParseError);
  });

  test("throws CompileError on type errors", () => {
    const env = new Env({
      variables: [new Variable("x", IntType)],
    });

    expect(() => env.compile('x + "oops"')).toThrow(CompileError);
  });

  test("builds type helpers", () => {
    const listType = new ListType(IntType);

    expect(listType.toString()).toBe("list(int)");
  });

  test("extends environments with additional variables", () => {
    const base = new Env({
      variables: [new Variable("x", IntType)],
    });
    const extended = base.extend({
      variables: [new Variable("y", IntType)],
    });
    const ast = extended.compile("x + y * 2");
    const program = extended.program(ast);

    expect(program.eval({ x: 2n, y: 5n }).value()).toBe(12n);
  });

  test("runs list macros like exists()", () => {
    const env = new Env({
      variables: [new Variable("nums", new ListType(IntType))],
    });
    const ast = env.compile("nums.exists(n, n % 2 == 0)");
    const program = env.program(ast);

    expect(program.eval({ nums: [1n, 3n, 4n] }).value()).toBe(true);
  });

  test("supports parse then check flow", () => {
    const env = new Env({
      variables: [new Variable("x", IntType), new Variable("items", new ListType(IntType))],
    });
    const parsed = env.parse("x in items && x > 0");
    const checked = env.check(parsed);

    expect(checked.outputType?.toString()).toBe("bool");
  });

  test("declares struct types and checks field access", () => {
    const env = new Env({
      structs: [
        new Struct("Person", {
          name: StringType,
          age: IntType,
        }),
      ],
      variables: [new Variable("person", new StructType("Person"))],
    });
    const ast = env.compile('person.age >= 21 && person.name != ""');
    const program = env.program(ast);

    expect(program.eval({ person: { name: "Ada", age: 36n } }).value()).toBe(true);
  });

  test("registers global overloads", () => {
    const env = new Env({
      variables: [new Variable("i", StringType), new Variable("you", StringType)],
      functions: [
        new CelFunction(
          "shake_hands",
          new Overload(
            "shake_hands_string_string",
            [StringType, StringType],
            StringType,
            (lhs, rhs) =>
              StringValue.of(`${String(lhs.value())} and ${String(rhs.value())} are shaking hands.`)
          )
        ),
      ],
    });
    const ast = env.compile("shake_hands(i, you)");
    const program = env.program(ast);

    expect(program.eval({ i: "CEL", you: "world" }).value()).toBe(
      "CEL and world are shaking hands."
    );
  });

  test("registers member overloads", () => {
    const env = new Env({
      variables: [new Variable("i", StringType), new Variable("you", StringType)],
      functions: [
        new CelFunction(
          "greet",
          new MemberOverload(
            "string_greet_string",
            [StringType, StringType],
            StringType,
            (lhs, rhs) =>
              StringValue.of(
                `Hello ${String(rhs.value())}! Nice to meet you, I'm ${String(lhs.value())}.`
              )
          )
        ),
      ],
    });
    const ast = env.compile("i.greet(you)");
    const program = env.program(ast);

    expect(program.eval({ i: "CEL", you: "world" }).value()).toBe(
      "Hello world! Nice to meet you, I'm CEL."
    );
  });

  test("handles protobuf-backed types", () => {
    const protoPath = new URL("../examples/protos/acme/person.proto", import.meta.url);
    const root = protobuf.loadSync([decodeURIComponent(protoPath.pathname)]);
    const env = new Env({
      typeProvider: new ProtobufTypeProvider(root),
      variables: [new Variable("person", new StructType("acme.Person"))],
    });
    const ast = env.compile('"Hello, " + person.name');
    const program = env.program(ast);

    expect(program.eval({ person: { name: "Ada" } }).value()).toBe("Hello, Ada");
  });

  test("propagates unknowns from partial activations", () => {
    const env = new Env({
      variables: [new Variable("x", BoolType), new Variable("y", BoolType)],
    });
    const ast = env.compile("x && y");
    const program = env.program(ast);

    const activation = new PartialActivation(new EmptyActivation(), ["x", "y"]);
    const result = program.eval(activation);

    expect(isUnknownValue(result)).toBe(true);
  });
});
