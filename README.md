# cel-ts

[![CI](https://github.com/taichimaeda/cel-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/s26057/cel-ts/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/cel-ts.svg)](https://badge.fury.io/js/cel-ts)
[![Licence](https://img.shields.io/badge/Licence-Apache_2.0-blue.svg)](https://opensource.org/licences/Apache-2.0)

Production-grade TypeScript implementation of the [Common Expression Language (CEL)](https://github.com/google/cel-spec).

## Features

- **cel-go Compatible API** - Full documentation
- **Type Checking** - Full compile-time type checking
- **100% Conformance Test Coverage** - Full CEL conformance suite coverage
- **Full Macro Support** - [cel-go](https://github.com/google/cel-go) parity macros (including `cel.block` etc.)
- **Full Extension Support** - [cel-go](https://github.com/google/cel-go) parity extension packs
- **Minimal Runtime Dependency** - [antlr4](https://github.com/tunnelvisionlabs/antlr4ts) package only
- **Licence Alignment** - Apache-2.0, compatible with [cel-spec](https://github.com/google/cel-spec)

## Comparison

[ChromeGG/cel-js](https://github.com/ChromeGG/cel-js) is an alternative TypeScript CEL interpreter, but it feels closer to a proof of concept than a production-grade engine. It does not aim for full CEL feature coverage and is missing baseline capabilities like type checking, environments, conformance testing, and tooling that official implementations treat as standard.

[marcbachmann/cel-js](https://github.com/marcbachmann/cel-js) is another JavaScript CEL interpreter. It emphasises fast evaluation and includes a type checker, but it does not cover the full CEL feature set or the conformance test suite, which makes production adoption harder.

Both [ChromeGG/cel-js](https://github.com/ChromeGG/cel-js) and [marcbachmann/cel-js](https://github.com/marcbachmann/cel-js) are MIT licensed without explicit notice, yet they derive from official implementations and incorporate parts of [cel-spec](https://github.com/google/cel-spec) artifacts (e.g., `langdef.md`).

[taichimaeda/cel-ts](https://github.com/taichimaeda/cel-ts) tracks official CEL implementations ([cel-go](https://github.com/google/cel-go), [cel-cpp](https://github.com/google/cel-cpp), [cel-java](https://github.com/google/cel-java)) and provides the complete workflow: parsing, type checking, optimisation, evaluation, conformance tests, and tooling. It also keeps Apache-2.0 licensing aligned with [cel-spec](https://github.com/google/cel-spec), unlike the MIT-licensed alternatives above. If you need a production-grade CEL engine in the JS/TS ecosystem, `cel-ts` is the practical choice.

`cel-ts` is consistently faster than [ChromeGG/cel-js](https://github.com/ChromeGG/cel-js) in the benchmark suite and generally close to [marcbachmann/cel-js](https://github.com/marcbachmann/cel-js) in throughput.

### Checklist

| Item | taichimaeda/cel-ts | ChromeGG/cel-js | marcbachmann/cel-js |
| --- | --- | --- | --- |
| Type checking | Yes | No | Yes (Basic) |
| Conformance tests | Yes (100%) | No | No |
| Benchmarking | Yes | No | Yes (Basic) |
| Profiling | Yes | No | No |
| Raw string and byte literals | Yes | No | Yes (Partial) |
| cel-go compatible API | Yes | No | No |
| Error reporting with source positions | Yes | No | Yes (Limited) |
| Macro support | Full (Same as cel-go) | Limited | Partial |
| Extension packs | Full (Same as cel-go) | Limited | Limited |
| Formatter | Yes | No | No |
| Linter | Yes | No | No |
| Speed | Fast | Slow | Fast |
| Licence | Apache-2.0 | MIT | MIT |

### Performance

| Case | taichimaeda/cel-ts (avg ns) | ChromeGG/cel-js (avg ns) | marcbachmann/cel-js (avg ns) |
| --- | --- | --- | --- |
| string_eq | 108.69 | 427.64 | 97.06 |
| string_neq | 104.82 | 344.76 | 61.40 |
| value_in_list_value | 162.88 | 349.15 | 91.34 |
| value_not_in_list_value | 165.76 | 411.19 | 99.60 |
| x_in_literal_list | 140.33 | 569.23 | 155.69 |
| x_not_in_literal_list | 145.04 | 643.12 | 114.03 |
| x_in_list_value | 224.05 | 369.86 | 111.11 |
| x_not_in_list_value | 227.87 | 438.70 | 128.14 |
| list_exists_contains | 484.24 | - | 384.23 |
| list_exists_starts | 409.51 | - | 393.76 |
| list_exists_matches | 299.50 | - | 209.14 |
| list_filter_matches | 756.28 | - | 812.53 |


## Installation

```bash
npm install cel-ts
# or
pnpm add cel-ts
```

## Quick Start

```typescript
import * as cel from "cel-ts";

// Create an environment with variable declarations
const env = new cel.Env({
  variables: [new cel.Variable("name", cel.StringType), new cel.Variable("age", cel.IntType)],
});

// Compile an expression
const ast = env.compile('name + " is " + string(age) + " years old"');

// Create a program
const program = env.program(ast);

// Evaluate with variables
const result = program.eval({
  name: "Alice",
  age: 30n, // CEL integers are bigint
});

console.log(result.value()); // "Alice is 30 years old"
```

## Examples

Additional runnable snippets that mirror the [`cel-go` examples](https://github.com/google/cel-go/tree/master/examples)
are available under [`examples/README.md`](examples/README.md). Execute them with `bun` or your
preferred TS runner, e.g.:

```bash
bun run examples/cel-eval.ts
```

Formatting and linting examples live in `examples/formatting.ts` and `examples/linting.ts`.

### Conformance

Conformance suites from `cel.dev/expr` live under `test/conformance/` and can be run via:

```bash
pnpm conformance
```

### Benchmarking

Run the lightweight benchmark suite and write results to `test/benchmark/results.json`:

```bash
pnpm benchmark
```

### Documentation

Run `pnpm docs` to build the TypeDoc output and launch a local HTTP server at `http://localhost:8000`, or use `pnpm docs:build` to generate docs without serving.

## Development

```bash
pnpm install      # Install dependencies
pnpm typecheck    # Run TypeScript type checks
pnpm lint         # Run lint rules
pnpm test         # Run unit tests
pnpm test:watch   # Run tests in watch mode
pnpm conformance  # Run CEL conformance suite
pnpm benchmark    # Run benchmarks (writes results.json)
pnpm build        # Build package artifacts
pnpm docs         # Generate documentation
```

## Architecture

```
Expression → Parse → AST → Check → Plan → Eval → Result
               ↓       ↓       ↓       ↓       ↓
            Parse   Common   Typed   Inter-   Value
            Tree    AST      AST    pretable
                   +Macros
```

The architecture follows cel-go's design:
1. **Parse**: ANTLR parses expression into parse tree
2. **AST**: Convert to canonical AST with macro expansion
3. **Check**: Type check and annotate the AST
4. **Plan**: Convert to optimised Interpretable tree
5. **Eval**: Evaluate with runtime bindings

## Licence

Apache-2.0 Licence (same as [cel-go](https://github.com/google/cel-go))

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Code of Conduct

See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)

## Acknowledgments

This project began as a TypeScript port of [cel-go](https://github.com/google/cel-go), which was originally developed by Google.

## Related Projects

- [cel-go](https://github.com/google/cel-go) - Go implementation (reference)
- [cel-spec](https://github.com/google/cel-spec) - CEL specification
