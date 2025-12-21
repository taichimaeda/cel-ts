/// <reference path="./asciichart.d.ts" />

import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import * as asciichart from "asciichart";
import {
  BoolType,
  IntType,
  StringType,
  Types,
  Variable,
  Env,
} from "../../src/cel";

type BenchCase = {
  name: string;
  expr: string;
  env: ConstructorParameters<typeof Env>[0];
  activation: Record<string, unknown>;
};

const cases: BenchCase[] = [
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

const iterations = 20000;
const results: { name: string; opsPerSec: number }[] = [];

for (const bench of cases) {
  const env = new Env(bench.env);
  const ast = env.compile(bench.expr);
  const program = env.program(ast);

  for (let i = 0; i < 100; i++) {
    program.eval(bench.activation);
  }

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    program.eval(bench.activation);
  }
  const elapsedMs = performance.now() - start;
  const opsPerSec = iterations / (elapsedMs / 1000);

  results.push({ name: bench.name, opsPerSec });
}

results.sort((a, b) => b.opsPerSec - a.opsPerSec);

const chart = asciichart.plot(
  results.map((r) => r.opsPerSec),
  { height: 8 }
);

const output = {
  iterations,
  timestamp: new Date().toISOString(),
  results,
};

writeFileSync("test/benchmark/results.json", `${JSON.stringify(output, null, 2)}\n`);

console.log("Benchmark ops/sec (higher is better)");
console.log(chart);
for (const result of results) {
  console.log(`${result.name}: ${result.opsPerSec.toFixed(0)} ops/sec`);
}
