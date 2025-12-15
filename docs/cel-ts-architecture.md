# cel-ts Architecture

TypeScript implementation of the Common Expression Language (CEL), based on cel-go design.

## Project Structure

```
cel-ts/
├── src/
│   ├── index.ts              # Public API entry point
│   ├── cel.ts                # High-level CEL API (cel-go compatible)
│   ├── version.ts            # Version information
│   ├── common/               # Shared types and utilities
│   │   └── ast.ts            # Canonical AST representation
│   ├── parser/               # Lexer, parser, and macro expansion
│   │   ├── gen/              # Generated ANTLR code
│   │   │   ├── CELLexer.ts
│   │   │   ├── CELParser.ts
│   │   │   └── CELVisitor.ts
│   │   ├── parser.ts         # ANTLR parser wrapper
│   │   ├── helper.ts         # Parse tree to AST conversion
│   │   ├── macro.ts          # Macro definitions and expansion
│   │   └── index.ts
│   ├── checker/              # Type checking and validation
│   │   ├── checker.ts        # Main type checker
│   │   ├── types.ts          # CEL type system
│   │   ├── decls.ts          # Variable and function declarations
│   │   ├── env.ts            # Type checker environment
│   │   ├── errors.ts         # Type checking errors
│   │   ├── mapping.ts        # Type parameter mapping
│   │   ├── stdlib.ts         # Standard library declarations
│   │   └── index.ts
│   └── interpreter/          # Expression evaluation engine
│       ├── interpreter.ts    # Main interpreter
│       ├── planner.ts        # AST to Interpretable conversion
│       ├── interpretable.ts  # Evaluable expression nodes
│       ├── dispatcher.ts     # Function call dispatcher
│       ├── activation.ts     # Runtime variable bindings
│       ├── attributes.ts     # Attribute resolver
│       ├── functions.ts      # Standard function implementations
│       ├── values.ts         # Runtime value types
│       └── index.ts
├── test/                     # Test files
├── docs/                     # Documentation
│   ├── api/                  # TypeDoc generated API docs
│   └── *.md                  # Architecture docs
└── dist/                     # Build output
```

## Processing Pipeline

```
Expression String → Parse → AST → Check → Plan → Eval → Result
                     ↓        ↓       ↓        ↓       ↓
                  Parse    Common   Typed    Inter-   Value
                  Tree     AST      AST     pretable
                           + Macros
```

The cel-ts architecture follows the cel-go design pattern where:

1. **Parse**: ANTLR parses expression into a parse tree
2. **AST Conversion**: Parse tree is converted to a canonical AST representation with macro expansion
3. **Check**: Type checker validates and annotates the AST
4. **Plan**: Planner converts AST to optimized Interpretable tree
5. **Eval**: Interpreter evaluates the Interpretable with runtime bindings

### Step 1: Environment Setup

```typescript
import { Env, EnvVariable, IntType, StringType } from "cel-ts";

const env = new Env({
  variables: [new EnvVariable("name", StringType), new EnvVariable("age", IntType)],
});
```

### Step 2: Compile (Parse + Type Check)

```typescript
const ast = env.compile('name + " is " + string(age)');
```

### Step 3: Create Program

```typescript
const program = env.program(ast);
```

### Step 4: Evaluate

```typescript
const result = program.eval({ name: "Alice", age: 30n });
console.log(result.value()); // "Alice is 30"
```

## Core Components

### 1. Common AST (`/src/common/ast.ts`)

The canonical AST representation used throughout the system. All components (parser, checker, planner) work with this unified AST.

**Expression Kinds**:
```
ExprKind:
├── Literal      # Constants (int, string, bool, etc.)
├── Ident        # Variable references
├── Select       # Field access (obj.field)
├── Call         # Function calls
├── List         # List literals
├── Map          # Map literals
├── Struct       # Struct literals
└── Comprehension # Macro-expanded loops (all, exists, map, filter)
```

**Key Types**:
- `Expr`: Base expression type with `id` and `kind`
- `AST`: Container for root expression, source info, type map, and reference map
- `SourceInfo`: Position information for error reporting
- `ReferenceInfo`: Resolved references (variables, functions)

### 2. Parser (`/src/parser/`)

- **ANTLR4-based**: Uses generated lexer and parser from CEL.g4 grammar
- **Components**:
  - `CELLexer`: Tokenizes source code
  - `CELParser`: Builds parse tree from tokens
  - `ParserHelper`: Converts parse tree to canonical AST
  - `MacroRegistry`: Manages macro definitions and expansion

**Parse Flow**:
```
Source → ANTLR Lexer → Tokens → ANTLR Parser → Parse Tree → ParserHelper → AST
                                                                    ↓
                                                              Macro Expansion
```

### 3. Macros (`/src/parser/macro.ts`)

Macros are expanded at parse time into comprehension expressions.

**Standard Macros**:
| Macro | Expansion | Description |
|-------|-----------|-------------|
| `has(m.field)` | Presence test | Check if field exists |
| `list.all(x, pred)` | Comprehension | All elements match predicate |
| `list.exists(x, pred)` | Comprehension | Any element matches predicate |
| `list.exists_one(x, pred)` | Comprehension | Exactly one element matches |
| `list.map(x, expr)` | Comprehension | Transform each element |
| `list.map(x, pred, expr)` | Comprehension | Filter then transform |
| `list.filter(x, pred)` | Comprehension | Filter elements |

**Comprehension Structure**:
```typescript
interface ComprehensionExpr {
  iterRange: Expr;     // Collection to iterate
  iterVar: string;     // Loop variable name
  accuVar: string;     // Accumulator variable name
  accuInit: Expr;      // Initial accumulator value
  loopCondition: Expr; // Continue condition
  loopStep: Expr;      // Update accumulator
  result: Expr;        // Final result
}
```

### 4. Type System (`/src/checker/types.ts`)

```
Type Kinds:
├── Primitive: Bool, Bytes, Double, Int, Uint, String, Null
├── Temporal: Timestamp, Duration
├── Collections: List, Map
├── Special: Dyn, Error, Type, TypeParam
└── Structured: Message (future)
```

**Key Features**:
- Immutable type objects with static instances
- Type parameter support for generic functions
- Type traits for capability checking (Adder, Comparer, Indexer, etc.)

### 5. Type Checker (`/src/checker/checker.ts`)

- **Purpose**: Validate expression types and build type annotations
- **Process**:
  1. Traverse AST from root to leaves
  2. Infer types based on operators and operands
  3. Handle comprehension scoping (iteration and accumulator variables)
  4. Validate operations against type traits
  5. Build type map: `Map<nodeId, Type>`
  6. Build reference map: `Map<nodeId, ReferenceInfo>`

**Comprehension Type Checking**:
- Iteration variable type inferred from range (list element or map key)
- Accumulator type inferred from initializer
- Both variables scoped within the comprehension

### 6. Interpreter (`/src/interpreter/`)

#### Planner (`planner.ts`)
Converts type-checked AST into optimized `Interpretable` tree:
- Constant folding
- Operator specialization
- Short-circuit optimization setup
- Comprehension to iterative evaluation

#### Interpretable (`interpretable.ts`)
Evaluable expression nodes:
- `ConstValue`: Constant values
- `IdentValue`: Variable access
- `FieldValue` / `HasFieldValue`: Field access and presence tests
- `CallValue` / `BinaryValue`: Function invocations
- `CreateListValue` / `CreateMapValue`: Collection creation
- `AndValue` / `OrValue`: Short-circuit logical ops
- `ConditionalValue`: Ternary expressions
- `ComprehensionValue`: Macro-expanded iterations
- `NotStrictlyFalseValue`: Internal comprehension helper

#### Activation (`activation.ts`)
Runtime variable bindings:
- Map-based variable storage
- Hierarchical scoping (parent chain)
- Lazy evaluation support

#### Values (`values.ts`)
Runtime value types implementing the `Value` interface:
```typescript
interface Value {
  type(): ValueType;
  value(): unknown;
  equal(other: Value): Value;
  hasTrait(trait: ValueTrait): boolean;
}
```

**Value Types**: `IntValue`, `StringValue`, `BoolValue`, `ListValue`, `MapValue`, etc.

### 7. Function Dispatcher (`/src/interpreter/dispatcher.ts`)

- Resolves function calls to implementations
- Supports multiple overloads per function
- Handles unary, binary, and n-ary functions

## Public API (`/src/cel.ts`)

### Environment Options

```typescript
const env = new Env({
  container: "acme.types",
  disableStandardLibrary: false,
  disableTypeChecking: false,
  variables: [new EnvVariable("name", StringType)],
  functions: [
    new EnvFunction(
      "greet",
      new GlobalFunctionOverload(
        "greet_string",
        [StringType],
        StringType,
        (arg) => new StringValue(`Hello, ${arg.value()}!`)
      )
    ),
  ],
});
```

Advanced scenarios can pass legacy `EnvOption` instances through the `extraOptions` field.

### Type Helpers

```typescript
// Primitive types
BoolType, IntType, UintType, DoubleType, StringType, BytesType
DurationType, TimestampType, NullType, DynType, AnyType

// Parameterized types via builder
Types.list(elemType: Type): Type
Types.map(keyType: Type, valueType: Type): Type
```

### Error Handling

```typescript
// Base error class
class CELError extends Error {
  readonly issues: Issues;
}

// Compilation errors
class CompileError extends CELError { }

// Parse errors
class ParseError extends CELError { }
```

## Standard Library

### Operators

| Category | Operators |
|----------|-----------|
| Logical | `&&`, `\|\|`, `!` |
| Comparison | `==`, `!=`, `<`, `<=`, `>`, `>=` |
| Arithmetic | `+`, `-`, `*`, `/`, `%` |
| Membership | `in` |
| Selection | `.field`, `[index]` |
| Ternary | `? :` |

### Built-in Functions

| Category | Functions |
|----------|-----------|
| Type | `type()` |
| String | `size()`, `contains()`, `startsWith()`, `endsWith()`, `matches()` |
| Collection | `size()` |
| Conversion | `int()`, `uint()`, `double()`, `string()`, `bytes()` |

### Macros

| Macro | Description |
|-------|-------------|
| `has(e.f)` | Test field presence |
| `e.all(x, p)` | True if all elements satisfy predicate |
| `e.exists(x, p)` | True if any element satisfies predicate |
| `e.exists_one(x, p)` | True if exactly one element satisfies predicate |
| `e.map(x, t)` | Transform elements |
| `e.map(x, p, t)` | Filter then transform |
| `e.filter(x, p)` | Filter elements by predicate |

## Design Patterns

| Pattern | Usage |
|---------|-------|
| Factory | `new Env()`, `new LazyActivation()` |
| Visitor | Parse tree traversal, AST evaluation |
| Strategy | Function overloads, type adapters |
| Builder | `EnvOption` functional options |
| Pipeline | Parse → AST → Check → Plan → Eval |

## Type Safety

cel-ts leverages TypeScript's type system:

- Generic type parameters for collections
- Discriminated unions for AST nodes (`ExprKind`)
- Strict null checks
- Interface-based polymorphism

## Performance Considerations

1. **Compiled Programs**: Parse and type-check once, evaluate many times
2. **Constant Folding**: Pre-compute constant expressions during planning
3. **Short-Circuit Evaluation**: `&&` and `||` avoid unnecessary evaluation
4. **Lazy Activation**: Variables resolved only when accessed
5. **Comprehension Optimization**: Early termination for `all`/`exists`

## Example Usage

```typescript
import {
  BoolType,
  BoolValue,
  Env,
  EnvFunction,
  EnvVariable,
  GlobalFunctionOverload,
  IntType,
  StringType,
} from "cel-ts";

// Create environment with custom function
const env = new Env({
  variables: [new EnvVariable("user", StringType), new EnvVariable("age", IntType)],
  functions: [
    new EnvFunction(
      "isAdult",
      new GlobalFunctionOverload("isAdult_int", [IntType], BoolType, (value) =>
        new BoolValue(value.value() >= 18n)
      )
    ),
  ],
});

// Compile and run
const ast = env.compile('user + " is adult: " + string(isAdult(age))');
const program = env.program(ast);

const result = program.eval({
  user: "Alice",
  age: 25n
});

console.log(result.value()); // "Alice is adult: true"
```

### Macro Example

```typescript
import { Env, EnvVariable, IntType, Types } from "cel-ts";

const env = new Env({
  variables: [new EnvVariable("numbers", Types.list(IntType))],
});

// Filter positive numbers and double them
const ast = env.compile('numbers.filter(x, x > 0).map(x, x * 2)');
const program = env.program(ast);

const result = program.eval({
  numbers: [-1, 2, -3, 4, 5]
});

console.log(result.value()); // [4, 8, 10]
```

## Future Enhancements

- [x] Macro support (`all()`, `exists()`, `map()`, `filter()`, `has()`)
- [ ] Optional field syntax (`?.field`, `[?index]`)
- [ ] Protocol Buffer message support
- [ ] Expression cost tracking
- [ ] Partial evaluation
