# Source Layout

High-level overview of the `src/` directory.

- `cel.ts`: public API that mirrors cel-go usage.
- `checker/`: type-checking and type declarations.
- `common/`: shared AST, source info, and utilities.
- `formatter/`: formatter and emitter utilities.
- `interpreter/`: evaluation, dispatcher, values, and planner.
- `linter/`: lint rules for redundant or simplifiable expressions.
- `parser/`: ANTLR parser, macros, and helpers.
- `extension/`: cel-go-style extension libraries (strings, lists, math, regex, etc.).
