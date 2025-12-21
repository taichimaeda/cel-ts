# Source Layout

High-level overview of the `src/` directory.

- `cel.ts`: public API that mirrors cel-go usage.
- `checker/`: type-checking and type declarations.
- `common/`: shared AST, source info, and utilities.
- `formatter/`: formatter and emitter utilities.
- `interpreter/`: evaluation, dispatcher, values, and planner.
- `parser/`: ANTLR parser, macros, and helpers.
