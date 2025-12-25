import { parse as marcbachmannParse } from "@marcbachmann/cel-js";
import { evaluate as chromeggEvaluate, parse as chromeggParse } from "cel-js";
import type { CstNode } from "chevrotain";
import { bench, do_not_optimize, run, summary } from "mitata";
import { writeFileSync } from "node:fs";
import {
  DynType,
  Env,
  Program,
  Type,
  Variable
} from "../../src/cel";
import { ListType, MapType, builtinTypeNameToType } from "../../src/checker/types";
import { type BenchmarkCase, type BenchmarkEngineId, cases } from "./cases";

export type BenchmarkResult = {
  name: string;
  opsPerSec: number;
  avgNs: number;
  p25Ns: number;
  p50Ns: number;
  p75Ns: number;
  samples: number;
};

type MitataStats = {
  avg: number;
  p25: number;
  p50: number;
  p75: number;
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

class CelTsBenchmarakEngine {
  readonly id: BenchmarkEngineId = "taichimaeda/cel-ts";

  build(benchCase: BenchmarkCase): Program | undefined {
    try {
      const env = new Env(this.buildEnvOptions(benchCase));
      const ast = env.compile(benchCase.expr);
      return env.program(ast);
    } catch {
      return undefined;
    }
  }

  eval(benchCase: BenchmarkCase, program: unknown): unknown {
    return (program as Program).eval(benchCase.activation);
  }

  private buildEnvOptions(
    benchCase: BenchmarkCase
  ): ConstructorParameters<typeof Env>[0] {
    const variables = this.buildVarEnvOptions(benchCase);
    return {
      ...(variables.length > 0 && { variables }),
    };
  }

  private buildVarEnvOptions(benchCase: BenchmarkCase): Variable[] {
    if (!benchCase.environment) {
      return [];
    }
    return Object.entries(benchCase.environment).map(([name, spec]) => {
      return new Variable(name, this.typeSpecToType(spec));
    });
  }

  private typeSpecToType(spec: unknown): Type {
    if (this.isTypeSpecRecord(spec)) {
      if ("list" in spec) {
        return new ListType(this.typeSpecToType(spec["list"]));
      }
      if ("map" in spec && this.isTypeSpecRecord(spec["map"])) {
        const mapSpec = spec["map"];
        return new MapType(
          this.typeSpecToType(mapSpec["key"]),
          this.typeSpecToType(mapSpec["value"])
        );
      }
    }
    return builtinTypeNameToType(String(spec)) ?? DynType;
  }

  private isTypeSpecRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }
}

class ChromeGgBenchmarkEngine {
  readonly id: BenchmarkEngineId = "chromegg/cel-js";

  build(benchCase: BenchmarkCase): unknown | undefined {
    try {
      const parsed = chromeggParse(benchCase.expr);
      if (!parsed.isSuccess) {
        return undefined;
      }
      return parsed.cst;
    } catch {
      return undefined;
    }
  }

  eval(benchCase: BenchmarkCase, cst: unknown): unknown {
    return chromeggEvaluate(cst as CstNode, benchCase.activation);
  }
}

class MarcbachmannBenchmarkEngine {
  readonly id: BenchmarkEngineId = "marcbachmann/cel-js";

  build(benchCase: BenchmarkCase): unknown | undefined {
    try {
      return marcbachmannParse(benchCase.expr);
    } catch {
      return undefined;
    }
  }

  eval(benchCase: BenchmarkCase, evalFn: unknown): unknown {
    type EvalFn = (activation: Record<string, unknown>) => unknown;
    return (evalFn as EvalFn)(benchCase.activation);
  }
}

/**
 * Benchmark runner for CEL expression evaluation.
 */
export class BenchmarkRunner {
  private results: BenchmarkResult[] = [];

  async run(outputPath?: string): Promise<BenchmarkResult[]> {
    const engines = [
      new CelTsBenchmarakEngine(),
      new ChromeGgBenchmarkEngine(),
      new MarcbachmannBenchmarkEngine(),
    ];

    for (const benchCase of cases) {
      summary(() => {
        for (const engineId of benchCase.engineIds) {
          const engine = engines.find((item) => item.id === engineId);
          if (!engine) continue;

          const compiled = engine.build(benchCase);
          if (!compiled) continue;

          bench(`${engine.id}/${benchCase.name}`, () => {
            const value = engine.eval(benchCase, compiled);
            do_not_optimize(value);
          });
        }
      });
    }

    const runResult = (await run({ format: "mitata" })) as MitataRunResult;
    this.results = this.buildResults(runResult);
    if (outputPath) {
      const output = {
        timestamp: new Date().toISOString(),
        results: this.results,
      };
      writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
    }
    return this.results;
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
          p25Ns: benchRun.stats.p25,
          p50Ns: benchRun.stats.p50,
          p75Ns: benchRun.stats.p75,
          samples: benchRun.stats.samples.length,
        });
      }
    }

    return results.sort((a, b) => b.opsPerSec - a.opsPerSec);
  }
}
