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
  samples: unknown[];
};

type MitataRun = {
  name: string;
  stats?: MitataStats | undefined;
};

type MitataBenchmark = {
  runs: MitataRun[];
};

type MitataRunResult = {
  benchmarks: MitataBenchmark[];
};

export const buildResults = (runResult: MitataRunResult): BenchmarkResult[] =>
  runResult.benchmarks
    .flatMap((trial) =>
      trial.runs.flatMap((run) => {
        if (!run.stats) return [];
        const opsPerSec = 1e9 / run.stats.avg;
        return [
          {
            name: run.name,
            opsPerSec,
            avgNs: run.stats.avg,
            p50Ns: run.stats.p50,
            samples: run.stats.samples.length,
          },
        ];
      })
    )
    .sort((a, b) => b.opsPerSec - a.opsPerSec);
