# cel-ts

[![CI](https://github.com/s26057/cel-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/s26057/cel-ts/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/cel-ts.svg)](https://badge.fury.io/js/cel-ts)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

TypeScript implementation of the [Common Expression Language (CEL)](https://github.com/google/cel-spec).

CEL is a non-Turing complete expression language designed by Google for fast, safe, and portable evaluation of configuration and policy expressions.

## Features

- **cel-go Compatible API** - Familiar interface for cel-go users
- **Type Safe** - Full TypeScript support with strict typing
- **Zero Dependencies** - Only ANTLR4 runtime required
- **Fast** - Compile once, evaluate many times
- **Extensible** - Add custom functions and types

## Installation

```bash
npm install cel-ts
# or
pnpm add cel-ts
# or
bun add cel-ts
```

## Quick Start

```typescript
import { Env, Variable, IntType, StringType } from "cel-ts";

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
are available under [`examples/`](examples). Execute them with `bun` or your
preferred TS runner, e.g.:

```bash
bun run examples/cel-eval.ts
```

Formatting examples live in `examples/format.md`.

## API Reference

### Environment

```typescript
import {
  Env,
  Function,
  Variable,
  Overload,
  IntType,
  MemberOverload,
  StringType,
  StringValue,
} from "cel-ts";

// Create environment with standard library
const env = new Env({
  variables: [new Variable("name", StringType), new Variable("age", IntType)],
  functions: [
    new Function(
      "greet",
      new Overload(
        "greet_string",
        [StringType],
        StringType,
        (arg) => new StringValue(`Hello, ${arg.value()}!`)
      )
    ),
  ],
});

// Create environment without standard library
const customEnv = new Env({
  disableStandardLibrary: true,
  variables: [new Variable("id", IntType)],
});

// Extend an existing environment
const extendedEnv = env.extend({
  variables: [new Variable("country", StringType)],
});
```

### Struct Types

Declare struct types to enable message-style literals and field type checking:

```typescript
import { Env, Struct, StringType, IntType } from "cel-ts";

const env = new Env({
  structs: [
    new Struct("acme.Person", {
      name: StringType,
      age: IntType,
    }),
  ],
});

const ast = env.compile('acme.Person{ name: "Ada", age: 37 }');
```

### Protobuf Types

You can also resolve message types from protobuf descriptors by supplying a
protobuf-backed type provider:

```typescript
import * as protobuf from "protobufjs";
import { Env, ProtobufTypeProvider, Types, Variable } from "cel-ts";

const root = protobuf.loadSync(["./protos/acme/person.proto"]);
const env = new Env({
  typeProvider: new ProtobufTypeProvider(root),
  variables: [new Variable("person", Types.object("acme.Person"))],
});

const ast = env.compile("person.name");
```

### Environment Options

`Env` accepts a single options object:

```typescript
const env = new Env({
  container: "acme.types",
  disableTypeChecking: false,
  disableStandardLibrary: false,
  variables: [new Variable("name", StringType)],
  functions: [
    new Function(
      "upper",
      new MemberOverload(
        "string_upper",
        [StringType],
        StringType,
        (arg) => new StringValue(String(arg.value()).toUpperCase())
      )
    ),
  ],
});
```

### Extensions

cel-ts ships optional extension packs mirroring `cel-go/ext` (strings, lists, math, regex, etc.).
Use `mergeEnvOptions` to combine multiple extension option sets:

```typescript
import { Env } from "cel-ts";
import { Lists, Strings, mergeEnvOptions } from "cel-ts";

const env = new Env(mergeEnvOptions(Strings(), Lists()));
const ast = env.compile(`["a", "b", "a"].distinct().join("-")`);
```

### Linting

`Linter` flags redundant constructs like constant boolean short-circuits.

```typescript
import { Env, Linter } from "cel-ts";

const env = new Env({ disableTypeChecking: true });
const ast = env.parse("true || x");
const diagnostics = new Linter().lint(ast.ast);

console.log(diagnostics);
```

For advanced scenarios, you can still provide legacy `EnvOption` instances via the `extraOptions` field.

### Types

```typescript
import {
  BoolType,
  IntType,
  UintType,
  DoubleType,
  StringType,
  BytesType,
  DurationType,
  TimestampType,
  NullType,
  DynType,
  Types,
} from "cel-ts";

// Parameterized types
Types.list(StringType); // list(string)
Types.map(StringType, IntType); // map(string, int)
```

### Compilation and Evaluation

```typescript
// Parse only (no type checking)
const parsedAst = env.parse("1 + 2");

// Parse and type check
const checkedAst = env.compile("1 + 2");

// Type check a parsed AST
const typedAst = env.check(parsedAst);

// Create executable program
const program = env.program(checkedAst);

// Evaluate
const result = program.eval({ x: 10n });
console.log(result.value());
```

### Formatting

```typescript
import { Parser, ParserHelper, Formatter } from "cel-ts";

const expression = "users.filter(u, u.active).map(u, u.name)";
const parser = new Parser();
const result = parser.parse(expression);
if (!result.tree) {
  throw new Error(result.error ?? "parse failed");
}

const helper = new ParserHelper(expression);
const ast = helper.parse(result.tree);

const formatter = new Formatter({ maxLineLength: 40 });
console.log(formatter.format(ast));
```

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

### Error Handling

```typescript
import { CELError, CompileError, ParseError } from "cel-ts";

try {
  const ast = env.compile("invalid expression +++");
} catch (e) {
  if (e instanceof ParseError) {
    console.error("Parse error:", e.message);
  } else if (e instanceof CompileError) {
    console.error("Type error:", e.message);
    console.error("Issues:", e.issues.toString());
  }
}
```

## CEL Expression Examples

```cel
// Arithmetic
1 + 2 * 3              // 7
10 / 3                 // 3
10 % 3                 // 1

// Strings
"hello" + " " + "world"
"hello".size()         // 5
"hello".contains("ell") // true
"hello".startsWith("he") // true

// Comparisons
x > 10 && x < 20
name == "admin" || role == "superuser"

// Ternary
age >= 18 ? "adult" : "minor"

// Lists
[1, 2, 3].size()       // 3
[1, 2, 3][0]           // 1
2 in [1, 2, 3]         // true

// Maps
{"a": 1, "b": 2}["a"]  // 1
{"a": 1, "b": 2}.a     // 1

// Type conversions
int("42")              // 42
string(123)            // "123"
double(10)             // 10.0

// Macros - List comprehensions
[1, 2, 3, 4, 5].all(x, x > 0)           // true - all positive
[1, 2, 3, 4, 5].exists(x, x > 3)        // true - any > 3
[1, 2, 3, 4, 5].exists_one(x, x > 4)    // true - exactly one > 4
[1, 2, 3].map(x, x * 2)                 // [2, 4, 6]
[1, 2, 3, 4, 5].filter(x, x > 2)        // [3, 4, 5]
[1, 2, 3, 4, 5].map(x, x > 2, x * 10)   // [30, 40, 50] - filter then map

// Macros - Field presence
has(request.auth)      // true if auth field exists
```

## Custom Functions

```typescript
import { Env, Function, Overload, IntType, MemberOverload, StringType, StringValue } from "cel-ts";

const env = new Env({
  functions: [
    new Function(
      "repeat",
      // Global function: repeat("ab", 3) -> "ababab"
      new Overload(
        "repeat_string_int",
        [StringType, IntType],
        StringType,
        (strValue, countValue) => {
          const str = String(strValue.value());
          const count = Number(countValue.value());
          return new StringValue(str.repeat(count));
        }
      )
    ),
    new Function(
      "reverse",
      // Member function: "hello".reverse() -> "olleh"
      new MemberOverload(
        "string_reverse",
        [StringType],
        StringType,
        (arg) => new StringValue(String(arg.value()).split("").reverse().join(""))
      )
    ),
  ],
});

const ast = env.compile('repeat("ab", 3) + " - " + "hello".reverse()');
const program = env.program(ast);
console.log(program.eval().value()); // "ababab - olleh"
```

## Standard Library

### Operators

| Operator                | Description         |
| ----------------------- | ------------------- |
| `+`, `-`, `*`, `/`, `%` | Arithmetic          |
| `==`, `!=`              | Equality            |
| `<`, `<=`, `>`, `>=`    | Comparison          |
| `&&`, `\|\|`, `!`       | Logical             |
| `in`                    | Membership          |
| `? :`                   | Ternary conditional |
| `[]`                    | Index access        |

### Functions

| Function                                             | Description                           |
| ---------------------------------------------------- | ------------------------------------- |
| `size()`                                             | Length of string, bytes, list, or map |
| `contains()`                                         | String contains substring             |
| `startsWith()`                                       | String starts with prefix             |
| `endsWith()`                                         | String ends with suffix               |
| `matches()`                                          | String matches regex                  |
| `type()`                                             | Get type of value                     |
| `int()`, `uint()`, `double()`, `string()`, `bytes()` | Type conversions                      |

### Macros

| Macro                   | Description                               |
| ----------------------- | ----------------------------------------- |
| `has(e.f)`              | Test if field `f` exists on `e`           |
| `e.all(x, p)`           | True if all elements satisfy predicate    |
| `e.exists(x, p)`        | True if any element satisfies predicate   |
| `e.exists_one(x, p)`    | True if exactly one element matches       |
| `e.map(x, t)`           | Transform each element                    |
| `e.map(x, p, t)`        | Filter by predicate, then transform       |
| `e.filter(x, p)`        | Filter elements by predicate              |

## Architecture

See [doc/cel-ts-architecture.md](doc/cel-ts-architecture.md) for detailed architecture documentation.

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

## Development

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Type check
pnpm typecheck

# Lint
pnpm lint

# Build
pnpm build

# Generate documentation
pnpm docs
```

## License

MIT License

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Related Projects

- [cel-go](https://github.com/google/cel-go) - Go implementation (reference)
- [cel-spec](https://github.com/google/cel-spec) - CEL specification
- [cel-cpp](https://github.com/google/cel-cpp) - C++ implementation
