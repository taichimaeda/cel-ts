# cel-ts Architecture

TypeScript implementation of the Common Expression Language (CEL), based on cel-go design.

## Project Structure

```
cel-ts/
├── src/
│   ├── index.ts              # Public API entry point
│   ├── cel.ts                # High-level CEL API (cel-go compatible)
│   ├── version.ts            # Version information
│   ├── parser/               # Lexer and parser (ANTLR-based)
│   │   ├── gen/              # Generated ANTLR code
│   │   │   ├── CELLexer.ts
│   │   │   ├── CELParser.ts
│   │   │   └── CELVisitor.ts
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
Expression String → Parse → Check → Plan → Eval → Result
                     ↓       ↓       ↓       ↓
                   AST    Typed    Inter-   Value
                          AST     pretable
```

### Step 1: Environment Setup

```typescript
import { newEnv, Variable, IntType, StringType } from "cel-ts";

const env = newEnv(
  Variable("name", StringType),
  Variable("age", IntType)
);
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

### 1. Parser (`/src/parser/`)

- **ANTLR4-based**: Uses generated lexer and parser from CEL.g4 grammar
- **Components**:
  - `CELLexer`: Tokenizes source code
  - `CELParser`: Builds parse tree from tokens
  - `CELVisitor`: Visitor pattern for AST traversal

### 2. Type System (`/src/checker/types.ts`)

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

### 3. Type Checker (`/src/checker/checker.ts`)

- **Purpose**: Validate expression types and build type annotations
- **Process**:
  1. Traverse AST from root to leaves
  2. Infer types based on operators and operands
  3. Validate operations against type traits
  4. Build type map: `Map<nodeId, Type>`

### 4. Interpreter (`/src/interpreter/`)

#### Planner (`planner.ts`)
Converts type-checked AST into optimized `Interpretable` tree:
- Constant folding
- Operator specialization
- Short-circuit optimization setup

#### Interpretable (`interpretable.ts`)
Evaluable expression nodes:
- `InterpretableConst`: Constant values
- `InterpretableAttribute`: Variable/field access
- `InterpretableCall`: Function invocations
- `InterpretableConstructor`: List/map creation
- `InterpretableAnd/Or`: Short-circuit logical ops
- `InterpretableTernary`: Conditional expressions

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

### 5. Function Dispatcher (`/src/interpreter/dispatcher.ts`)

- Resolves function calls to implementations
- Supports multiple overloads per function
- Handles unary, binary, and n-ary functions

## Public API (`/src/cel.ts`)

### Environment Options

```typescript
// Variable declaration
Variable(name: string, type: Type): EnvOption

// Function declaration with overloads
Function(name: string, ...overloads: OverloadOption[]): EnvOption

// Function overload
Overload(id: string, argTypes: Type[], resultType: Type, binding?: Function): OverloadOption

// Member function overload
MemberOverload(id: string, argTypes: Type[], resultType: Type, binding?: Function): OverloadOption

// Container for qualified names
Container(name: string): EnvOption

// Disable standard library
DisableStandardLibrary(): EnvOption

// Disable type checking
DisableTypeChecking(): EnvOption
```

### Type Helpers

```typescript
// Primitive types
BoolType, IntType, UintType, DoubleType, StringType, BytesType
DurationType, TimestampType, NullType, DynType, AnyType

// Parameterized types
ListType(elemType: Type): Type
MapType(keyType: Type, valueType: Type): Type
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
| Type | `type()`, `has()` |
| String | `size()`, `contains()`, `startsWith()`, `endsWith()` |
| Collection | `size()` |
| Conversion | `int()`, `uint()`, `double()`, `string()`, `bytes()` |

## Design Patterns

| Pattern | Usage |
|---------|-------|
| Factory | `newEnv()`, `newActivation()` |
| Visitor | Parse tree traversal, AST evaluation |
| Strategy | Function overloads, type adapters |
| Builder | `EnvOption` functional options |
| Pipeline | Parse → Check → Plan → Eval |

## Type Safety

cel-ts leverages TypeScript's type system:

- Generic type parameters for collections
- Discriminated unions for AST nodes
- Strict null checks
- Interface-based polymorphism

## Performance Considerations

1. **Compiled Programs**: Parse and type-check once, evaluate many times
2. **Constant Folding**: Pre-compute constant expressions during planning
3. **Short-Circuit Evaluation**: `&&` and `||` avoid unnecessary evaluation
4. **Lazy Activation**: Variables resolved only when accessed

## Example Usage

```typescript
import {
  newEnv,
  Variable,
  Function,
  Overload,
  IntType,
  StringType,
  BoolType,
  StringValue
} from "cel-ts";

// Create environment with custom function
const env = newEnv(
  Variable("user", StringType),
  Variable("age", IntType),
  Function("isAdult",
    Overload("isAdult_int", [IntType], BoolType,
      (arg) => new BoolValue(arg.value() >= 18n)
    )
  )
);

// Compile and run
const ast = env.compile('user + " is adult: " + string(isAdult(age))');
const program = env.program(ast);

const result = program.eval({
  user: "Alice",
  age: 25n
});

console.log(result.value()); // "Alice is adult: true"
```

## Future Enhancements

- [ ] Macro support (`all()`, `exists()`, `map()`, `filter()`)
- [ ] Optional field syntax (`?.field`, `[?index]`)
- [ ] Protocol Buffer message support
- [ ] Expression cost tracking
- [ ] Partial evaluation
