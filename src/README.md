# Source Layout

High-level overview of the `src/` directory.

- `cel.ts`: public API that mirrors cel-go usage.
- `checker/`: type-checking and type declarations.
- `common/`: shared AST, source info, and utilities.
- `formatter/`: formatting utilities.
- `interpreter/`: evaluation, dispatcher, values, and planner.
- `linter/`: lint rules for redundant or simplifiable expressions.
- `planner/`: planner and optimiser passes.
- `parser/`: ANTLR parser, macros, and helpers.
- `extensions/`: cel-go-style extension libraries (strings, lists, math, regex, etc.).

## Acknowledgements

`src/parser/gen/CEL.g4` is copied from [cel-go](https://github.com/google/cel-go) for the ANTLR parser generator.
