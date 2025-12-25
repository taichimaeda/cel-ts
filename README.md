# cel-ts

[![CI](https://github.com/s26057/cel-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/s26057/cel-ts/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/cel-ts.svg)](https://badge.fury.io/js/cel-ts)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

Production-grade TypeScript implementation of the [Common Expression Language (CEL)](https://github.com/google/cel-spec).

## Features

- **cel-go Compatible API** - Full documentation
- **Type Checking** - Full compile-time type checking
- **100% Conformance Test Coverage** - Full CEL conformance suite coverage
- **Full Macro Support** - [cel-go](https://github.com/google/cel-go) parity macros (including `cel.block` etc.)
- **Full Extension Support** - [cel-go](https://github.com/google/cel-go) parity extension packs
- **Minimal Runtime Dependency** - [antlr4](https://github.com/tunnelvisionlabs/antlr4ts) package only

## Comparison

[ChromeGG/cel-js](https://github.com/ChromeGG/cel-js) is a TypeScript CEL interpreter useful for experimentation, but it reads more like a proof-of-concept than a production-grade engine. It does not target full CEL feature parity and lacks the pipeline features (type checking, environments, conformance testing, and tooling) that official implementations treat as baseline.

[marcbachmann/cel-js](https://github.com/marcbachmann/cel-js) is an alternative JavaScript CEL interpreter. It emphasizes fast evaluation and includes a type checker, and while it exposes TypeScript type definitions, the interpreter itself is implemented in plain JavaScript. It does not cover conformance tests or [cel-go](https://github.com/google/cel-go) compatible interface, making it challenging for production adoption.

Both [ChromeGG/cel-js](https://github.com/ChromeGG/cel-js) and [marcbachmann/cel-js](https://github.com/marcbachmann/cel-js) are MIT licensed, yet they derive from official implementations and incorporate parts of [cel-spec](https://github.com/google/cel-spec) artifacts (e.g., `langdef.md`), which are Apache-2.0 licensed. This licensing mismatch can be a concern for business use.

[taichimaeda/cel-ts](https://github.com/taichimaeda/cel-ts) tracks official CEL implementations ([cel-go](https://github.com/google/cel-go), [cel-cpp](https://github.com/google/cel-cpp), [cel-java](https://github.com/google/cel-java)) and provides the complete workflow: parsing, type checking, optimisation, evaluation, conformance tests, and tooling. If you need a production-grade CEL engine in the JS/TS ecosystem, `cel-ts` is the practical choice.

| Capability | taichimaeda/cel-ts | ChromeGG/cel-js | marcbachmann/cel-js |
| --- | --- | --- | --- |
| Type checking and environments | Yes | No | Yes (limited) |
| Conformance test suite | Yes (100%) | No | No |
| Benchmark suite | Yes | No | Yes (basic) |
| Raw string and byte literals | Yes | No | Partial |
| cel-go compatible API | Yes | No | No |
| Error reporting with source positions | Yes | No | Limited |
| Macro support | Full (cel-go parity) | Limited | Partial |
| Extension packs | Full (cel-go parity) | Limited | Limited |
| Formatter | Yes | No | No |
| Linter | Yes (basic) | No | No |
| Optimizations | Yes (basic) | No | Limited |
| License (cel-spec is Apache-2.0) | Apache-2.0 | MIT | MIT |

## Installation

```bash
npm install cel-ts
# or
pnpm add cel-ts
```

## Quick Start

```typescript
import { Env, IntType, StringType, Variable } from "cel-ts";

// Create an environment with variable declarations
const env = new Env({
  variables: [new Variable("name", StringType), new Variable("age", IntType)],
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
4. **Plan**: Convert to optimized Interpretable tree
5. **Eval**: Evaluate with runtime bindings

## License

Apache-2.0 License (same as [cel-go](https://github.com/google/cel-go))

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Code of Conduct

See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)

## Related Projects

- [cel-go](https://github.com/google/cel-go) - Go implementation (reference)
- [cel-spec](https://github.com/google/cel-spec) - CEL specification
