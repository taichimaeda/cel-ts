# Tests

Property tests cover the core CEL API, while formatter and linter keep focused unit tests. Conformance and benchmark suites live under `test/conformance` and `test/benchmark` for broader compatibility and performance coverage.

- `pnpm test` runs the default suite.
- `pnpm conformance` runs CEL conformance tests.
- `pnpm conformance:serve` runs conformance tests and serves the Allure report at `http://localhost:8080`.
- `pnpm benchmark` runs the benchmark runner.
