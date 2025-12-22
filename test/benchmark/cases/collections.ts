import { IntType, StringType, Types, Variable } from "../../../src/cel";
import type { BenchCase } from "../cases";

export const collectionCases: BenchCase[] = [
  {
    name: "map_lookup",
    expr: "m['k1'] + m['k2']",
    env: {
      variables: [new Variable("m", Types.map(StringType, IntType))],
    },
    activation: { m: { k1: 10n, k2: 32n } },
  },
  {
    name: "map_in",
    expr: "'k3' in m",
    env: {
      variables: [new Variable("m", Types.map(StringType, IntType))],
    },
    activation: { m: { k1: 1n, k2: 2n, k3: 3n } },
  },
  {
    name: "list_map_macro",
    expr: "nums.map(n, n * n)",
    env: {
      variables: [new Variable("nums", Types.list(IntType))],
    },
    activation: { nums: [1n, 2n, 3n, 4n] },
  },
  {
    name: "list_filter_macro",
    expr: "nums.filter(n, n % 2 == 0)",
    env: {
      variables: [new Variable("nums", Types.list(IntType))],
    },
    activation: { nums: [1n, 2n, 3n, 4n, 5n, 6n] },
  },
  {
    name: "nested_maps",
    expr: "[1, 2, 3].map(x, [4, 5].map(y, x + y))",
    env: {},
    activation: {},
  },
  {
    name: "exists_dual",
    expr: "nums.exists(n, n > limit) && nums.exists(n, n == exact)",
    env: {
      variables: [
        new Variable("nums", Types.list(IntType)),
        new Variable("limit", IntType),
        new Variable("exact", IntType),
      ],
    },
    activation: { nums: [1n, 3n, 5n, 9n], limit: 4n, exact: 9n },
  },
];
