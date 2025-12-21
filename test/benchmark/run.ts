import { bench, do_not_optimize, run, summary } from "mitata";
import { writeFileSync } from "node:fs";
import { preparedCases } from "./cases";
import { buildResults } from "./results";

summary(() => {
  for (const benchCase of preparedCases) {
    bench(benchCase.name, () => {
      const value = benchCase.program.eval(benchCase.activation);
      do_not_optimize(value);
    });
  }
});

const runResult = await run({ format: "mitata" });

const output = {
  timestamp: new Date().toISOString(),
  results: buildResults(runResult),
};

const outputPath = "test/benchmark/results.json";
writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
