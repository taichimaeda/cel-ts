# cel-ts

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
const env = new Env(Variable("name", StringType), Variable("age", IntType));

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

## API Reference

### Environment

```typescript
import { DisableStandardLibrary, Env } from "cel-ts";

// Create environment with standard library
const env = new Env(...options);

// Create environment without standard library
const customEnv = new Env(DisableStandardLibrary(), ...options);

// Extend an existing environment
const extendedEnv = env.extend(...additionalOptions);
```

### Environment Options

```typescript
import {
  Variable,
  Function,
  Overload,
  MemberOverload,
  Container,
  DisableStandardLibrary,
  DisableTypeChecking,
} from "cel-ts";

// Declare a variable
Variable("name", StringType);

// Declare a function
Function(
  "greet",
  GlobalOverload(
    "greet_string",
    [StringType],
    StringType,
    (arg) => new StringValue(`Hello, ${arg.value()}!`)
  )
);

// Declare a member function
Function(
  "upper",
  MemberOverload(
    "string_upper",
    [StringType],
    StringType,
    (arg) => new StringValue(String(arg.value()).toUpperCase())
  )
);
```

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
  ListType,
  MapType,
} from "cel-ts";

// Parameterized types
ListType(StringType); // list(string)
MapType(StringType, IntType); // map(string, int)
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
```

## Custom Functions

```typescript
import {
  Env,
  Function,
  GlobalOverload,
  IntType,
  MemberOverload,
  StringType,
  StringValue,
} from "cel-ts";

const env = new Env(
  // Global function: repeat("ab", 3) -> "ababab"
  Function(
    "repeat",
    GlobalOverload(
      "repeat_string_int",
      [StringType, IntType],
      StringType,
      (args) => {
        const str = String(args[0].value());
        const count = Number(args[1].value());
        return new StringValue(str.repeat(count));
      }
    )
  ),

  // Member function: "hello".reverse() -> "olleh"
  Function(
    "reverse",
    MemberOverload(
      "string_reverse",
      [StringType],
      StringType,
      (arg) => new StringValue(String(arg.value()).split("").reverse().join(""))
    )
  )
);

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

### Functions

| Function                                             | Description                           |
| ---------------------------------------------------- | ------------------------------------- |
| `size()`                                             | Length of string, bytes, list, or map |
| `contains()`                                         | String contains substring             |
| `startsWith()`                                       | String starts with prefix             |
| `endsWith()`                                         | String ends with suffix               |
| `type()`                                             | Get type of value                     |
| `int()`, `uint()`, `double()`, `string()`, `bytes()` | Type conversions                      |

## Architecture

See [docs/cel-ts-architecture.md](docs/cel-ts-architecture.md) for detailed architecture documentation.

```
Expression � Parse � Check � Plan � Eval � Result
              �       �       �       �
             AST   Typed   Inter-   Value
                   AST    pretable
```

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

## Comparison with cel-go

| Feature          | cel-go                           | cel-ts      |
| ---------------- | -------------------------------- | ----------- |
| Language         | Go                               | TypeScript  |
| Error Handling   | `(result, error)` tuples         | Exceptions  |
| Integers         | `int64`                          | `bigint`    |
| API Style        | Method chaining                  | Same        |
| Standard Library | Full                             | Core subset |
| Macros           | `all`, `exists`, `map`, `filter` | Planned     |
| Proto Support    | Full                             | Planned     |

## License

Apache License 2.0

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Related Projects

- [cel-go](https://github.com/google/cel-go) - Go implementation (reference)
- [cel-spec](https://github.com/google/cel-spec) - CEL specification
- [cel-cpp](https://github.com/google/cel-cpp) - C++ implementation
