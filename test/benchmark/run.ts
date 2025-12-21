import { writeFileSync } from "node:fs";
import { bench, do_not_optimize, run, summary } from "mitata";
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

const prepared = cases.map((benchCase) => {
  const env = new Env(benchCase.env);
  const ast = env.compile(benchCase.expr);
  const program = env.program(ast);
  return { ...benchCase, program };
});

summary(() => {
  for (const benchCase of prepared) {
    bench(benchCase.name, () => {
      const value = benchCase.program.eval(benchCase.activation);
      do_not_optimize(value);
    });
  }
});

const runResult = await run({ format: "mitata" });

const results = runResult.benchmarks
  .flatMap((trial) =>
    trial.runs.map((run) => {
      if (!run.stats) return null;
      const opsPerSec = 1e9 / run.stats.avg;
      return {
        name: run.name,
        opsPerSec,
        avgNs: run.stats.avg,
        p50Ns: run.stats.p50,
        samples: run.stats.samples.length,
      };
    })
  )
  .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
  .sort((a, b) => b.opsPerSec - a.opsPerSec);

const output = {
  timestamp: new Date().toISOString(),
  results,
};

writeFileSync("test/benchmark/results.json", `${JSON.stringify(output, null, 2)}\n`);
