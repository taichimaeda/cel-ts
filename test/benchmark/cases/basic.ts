import { BoolType, IntType, StringType, Types, Variable } from "../../../src/cel";
import type { BenchCase } from "../cases";

export const basicCases: BenchCase[] = [
  {
    name: "arith",
    expr: "a + b * 2",
    env: {
      variables: [new Variable("a", IntType), new Variable("b", IntType)],
    },
    activation: { a: 40n, b: 2n },
  },
  {
    name: "arith_chain",
    expr: "a * b + c * d + e",
    env: {
      variables: [
        new Variable("a", IntType),
        new Variable("b", IntType),
        new Variable("c", IntType),
        new Variable("d", IntType),
        new Variable("e", IntType),
      ],
    },
    activation: { a: 2n, b: 3n, c: 4n, d: 5n, e: 6n },
  },
  {
    name: "list_in",
    expr: "x in list",
    env: {
      variables: [new Variable("x", StringType), new Variable("list", Types.list(StringType))],
    },
    activation: { x: "c", list: ["a", "b", "c", "d"] },
  },
  {
    name: "list_index",
    expr: "nums[1] + nums[2]",
    env: {
      variables: [new Variable("nums", Types.list(IntType))],
    },
    activation: { nums: [3n, 5n, 7n] },
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
    name: "ternary",
    expr: "flag ? 1 : 2",
    env: {
      variables: [new Variable("flag", BoolType)],
    },
    activation: { flag: true },
  },
];
