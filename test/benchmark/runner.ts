import { bench, do_not_optimize, run, summary } from "mitata";
import { writeFileSync } from "node:fs";
import { Env } from "../../src/cel";
import { type BenchCase, cases } from "./cases";

export type BenchmarkResult = {
  name: string;
  opsPerSec: number;
  avgNs: number;
  p50Ns: number;
  samples: number;
};

type MitataStats = {
  avg: number;
  p50: number;
  samples: number[];
};

type MitataRun = {
  name: string;
  stats?: MitataStats;
};

type MitataBenchmark = {
  runs: MitataRun[];
};

type MitataRunResult = {
  benchmarks: MitataBenchmark[];
};

/**
 * Benchmark runner for CEL expression evaluation.
 */
export class BenchmarkRunner {
  private readonly cases: BenchCase[];
  private results: BenchmarkResult[] = [];

  constructor() {
    this.cases = this.prepareCases();
  }

  async run(): Promise<BenchmarkResult[]> {
    summary(() => {
      for (const benchCase of this.cases) {
        bench(benchCase.name, () => {
          const value = benchCase.program!.eval(benchCase.activation);
          do_not_optimize(value);
        });
      }
    });

    const runResult = (await run({ format: "mitata" })) as MitataRunResult;
    this.results = this.buildResults(runResult);
    return this.results;
  }

  writeResults(outputPath: string): void {
    const output = {
      timestamp: new Date().toISOString(),
      results: this.results,
    };
    writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  }

  private prepareCases(): BenchCase[] {
    return cases.map((benchCase) => this.prepareCase(benchCase));
  }

  private prepareCase(benchCase: BenchCase): BenchCase {
    const env = new Env(benchCase.env);
    const ast = env.compile(benchCase.expr);
    return { ...benchCase, program: env.program(ast) };
  }

  private buildResults(runResult: MitataRunResult): BenchmarkResult[] {
    const results: BenchmarkResult[] = [];

    for (const benchmark of runResult.benchmarks) {
      for (const benchRun of benchmark.runs) {
        if (!benchRun.stats) continue;

        const NS_PER_SEC = 1e9;
        results.push({
          name: benchRun.name,
          opsPerSec: NS_PER_SEC / benchRun.stats.avg,
          avgNs: benchRun.stats.avg,
          p50Ns: benchRun.stats.p50,
          samples: benchRun.stats.samples.length,
        });
      }
    }

    return results.sort((a, b) => b.opsPerSec - a.opsPerSec);
  }
}
