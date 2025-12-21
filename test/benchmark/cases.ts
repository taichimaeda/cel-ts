import {
  BoolType,
  IntType,
  StringType,
  Types,
  Variable,
  Env,
} from "../../src/cel";

export type BenchCase = {
  name: string;
  expr: string;
  env: ConstructorParameters<typeof Env>[0];
  activation: Record<string, unknown>;
};

export type PreparedCase = BenchCase & {
  program: ReturnType<Env["program"]>;
};

export const cases: BenchCase[] = [
  {
    name: "arith",
    expr: "a + b * 2",
    env: {
      variables: [new Variable("a", IntType), new Variable("b", IntType)],
    },
    activation: { a: 40n, b: 2n },
  },
  {
    name: "list_in",
    expr: "x in list",
    env: {
      variables: [
        new Variable("x", StringType),
        new Variable("list", Types.list(StringType)),
      ],
    },
    activation: { x: "c", list: ["a", "b", "c", "d"] },
  },
  {
    name: "macro_exists",
    expr: "nums.exists(n, n > 10)",
    env: {
      variables: [new Variable("nums", Types.list(IntType))],
    },
    activation: { nums: [1n, 5n, 11n, 20n] },
  },
  {
    name: "string_predicates",
    expr: "s.startsWith('a') && s.endsWith('z')",
    env: {
      variables: [new Variable("s", StringType)],
    },
    activation: { s: "alphabetz" },
  },
  {
    name: "ternary",
    expr: "flag ? 1 : 2",
    env: {
      variables: [new Variable("flag", BoolType)],
    },
    activation: { flag: true },
  },
];

export const prepareCase = (benchCase: BenchCase): PreparedCase => {
  const env = new Env(benchCase.env);
  const ast = env.compile(benchCase.expr);
  return { ...benchCase, program: env.program(ast) };
};

export const preparedCases = cases.map(prepareCase);
