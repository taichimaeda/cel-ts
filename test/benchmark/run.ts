import { rmSync } from "node:fs";
import { BenchmarkRunner } from "./runner";

const resultsPath = "test/benchmark/results.json";

// Clean up previous results
rmSync(resultsPath, { force: true });

// Run benchmarks
const runner = new BenchmarkRunner();
await runner.run(resultsPath);
