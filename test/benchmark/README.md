# Benchmarks

Run the benchmark suite:

```bash
pnpm benchmark
```

Results are written to `test/benchmark/results.json`, and a mitata summary is printed to stdout. Benchmark scenarios live in `test/benchmark/cases.ts` so you can add or adjust cases and re-run to compare results over time.

## Acknowledgements

Benchmark cases are adapted from the official CEL implementations, including [cel-go](https://github.com/google/cel-go).
