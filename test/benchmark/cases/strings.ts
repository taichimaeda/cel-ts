import { StringType, Variable } from "../../../src/cel";
import type { BenchCase } from "../cases";

export const stringCases: BenchCase[] = [
  {
    name: "string_predicates",
    expr: "s.startsWith('a') && s.endsWith('z')",
    env: {
      variables: [new Variable("s", StringType)],
    },
    activation: { s: "alphabetz" },
  },
  {
    name: "string_concat",
    expr: "prefix + '-' + suffix",
    env: {
      variables: [new Variable("prefix", StringType), new Variable("suffix", StringType)],
    },
    activation: { prefix: "cel", suffix: "ts" },
  },
  {
    name: "string_matches",
    expr: "s.matches('^a.*z$')",
    env: {
      variables: [new Variable("s", StringType)],
    },
    activation: { s: "alphabetz" },
  },
];
