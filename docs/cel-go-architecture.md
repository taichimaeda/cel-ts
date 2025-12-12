# CEL-Go Architecture Overview

Architecture analysis document for cel-go, used as reference for the cel-ts implementation.

## 1. Project Structure

```
/cel-go/
├── /cel/                      # Public API / high-level orchestration
├── /parser/                   # Lexical analysis / parsing (ANTLR-based)
├── /checker/                  # Type checking / validation
├── /interpreter/              # Execution / evaluation engine
├── /common/                   # Shared utilities / types / AST
│   ├── /ast/                  # Abstract syntax tree structures
│   ├── /types/                # CEL type system
│   ├── /functions/            # Function definitions
│   ├── /operators/            # Operator definitions
│   └── /stdlib/               # Standard library
├── /ext/                      # Extension libraries
├── /policy/                   # Policy language support
└── /test/                     # Conformance tests
```

## 2. CEL Expression Processing Pipeline

Standard workflow:

```
Input Expression → Parse → Check → Plan → Eval → Result
                    ↓       ↓       ↓       ↓
                   AST   Typed    Exec    ref.Val
                         AST     Plan
```

### Step 1: Environment Setup

```go
env, _ := cel.NewEnv(
    cel.Variable("name", cel.StringType),
    cel.Function("greet", ...)
)
```

### Step 2: Expression Compilation (Parse + Check)

```go
ast, issues := env.Compile("expression")
```

### Step 3: Program Creation

```go
prg, _ := env.Program(ast)
```

### Step 4: Evaluation

```go
result, details, _ := prg.Eval(map[string]any{"name": "value"})
```

## 3. Parser Architecture

### Grammar

- **File**: `/parser/gen/CEL.g4` (ANTLR v4 grammar)
- Generates lexer/parser code with ANTLR4
- Supported syntax:
  - Operators (conditional, logical, relational, arithmetic)
  - Primary expressions (identifiers, literals, collections)
  - Member access (field selection, indexing, method calls)
  - Collections (lists, maps, structs)

### Key Components

- **Lexer**: Tokenizes source code
- **Parser**: Builds syntax tree from tokens
- **Visitor Pattern**: Transforms syntax tree to AST

### Macro Expansion

- **File**: `/parser/macro.go`
- Macros are parse-time transformations (not runtime)
- Examples: `all()`, `exists()`, `map()`, `filter()`, `has()`
- Two styles:
  - **Global**: `function(args)` - top-level function call
  - **Receiver**: `target.method(args)` - member-style call

## 4. AST (Abstract Syntax Tree) Structure

### Core Types (`/common/ast/`)

```
ExprKind enum:
├── CallKind              # Function call
├── ComprehensionKind     # Macro-expanded iteration
├── IdentKind             # Variable/identifier reference
├── ListKind              # List literal [...]
├── LiteralKind           # Primitive literal
├── MapKind               # Map literal {...}
├── SelectKind            # Field access (obj.field)
└── StructKind            # Message literal
```

### AST Node Interfaces

- **Expr**: Base interface for all expression nodes

  - Methods: `ID()`, `Kind()`, `AsCall()`, `AsIdent()`, `AsLiteral()`, etc.

- **CallExpr**: Function call

  - Properties: function name, target, arguments

- **SelectExpr**: Field access

  - Properties: operand, field name, test flag

- **ComprehensionExpr**: Loop/iteration expression
  - Properties: iteration variable, range expression, condition, accumulator, result

## 5. Type Checking (Checker Package)

### Core Components

- **File**: `/checker/checker.go`
- **Env**: Type environment (variables, functions, proto descriptors)
- **Entry Point**: `Check(parsed *ast.AST, source Source, env *Env)`

### Type System (`/common/types/`)

```
Type Kinds:
├── Primitive: Bool, Bytes, Double, Int, Uint, String, Null
├── Temporal: Timestamp, Duration
├── Collections: List, Map
├── Structured: Struct, Any
├── Dynamic: Dyn (runtime type resolution)
├── Special: Error, Unknown, Type, TypeParam
└── Opaque (abstract custom types)
```

### Type Operations - Traits

Behaviors that types can have:

- `AdderType`, `ComparerType`, `DividerType`, `MultiplierType`
- `FieldTesterType`, `IndexerType`, `IteratorType`, `SizerType`

### Checking Process

1. Traverse AST from root to leaves
2. Infer types based on children and operators
3. Validate operations against operand types
4. Build type map: `map[int64]*Type` (expression ID → type)
5. Build reference map: `map[int64]*ReferenceInfo`

## 6. Interpreter/Evaluation Architecture

### Core Concepts

- **Interpretable**: Compiled representation ready for evaluation

  - Interface: `Eval(Activation) ref.Val`

- **Planner**: Transforms checked AST → Interpretable tree

  - Performs optimization and specialization
  - Builds optimal execution plan

- **Activation**: Runtime variable bindings
  - Interface: `ResolveName(name string) (any, bool)`
  - Map-based or hierarchical (parent chain)
  - Lazy evaluation support

### Evaluation Process

1. Create Activation with input variables
2. Call `Interpretable.Eval(activation)` recursively
3. Evaluate child interpretables first
4. Apply operation to child results
5. Return `ref.Val` result

### Interpretable Specializations

- **InterpretableConst**: Constant value
- **InterpretableAttribute**: Variable/field access
- **InterpretableCall**: Function call
- **InterpretableConstructor**: List/map/struct creation

## 7. ref.Val Interface

Base value type returned from evaluation:

```go
type Val interface {
    Type() ref.Type
    Value() any
    Equal(Val) Val
    // String representation, arithmetic, etc.
}
```

### Primitive Value Types

- StringValue, Int64Value, Uint64Value, BoolValue, BytesValue
- DoubleValue, NullValue, ErrorValue
- Built-in overflow checking

### Collection Value Types

- **List**: Dynamic array (Indexer, Iterator, Sizer, Comparer)
- **Map**: Key-value store (FieldTester, Indexer, Iterator)
- **Struct**: Typed message object

## 8. Public API Entry Points

### Main API (`/cel/`)

**Key Types**:

- `Environment` (`Env`): Execution environment builder

  - `NewEnv(...EnvOption)`: Create environment
  - `Compile(expression)`: Parse + type check → `Ast`
  - `Program(ast)`: Create executable program
  - `Extend(opts)`: Extend with additional options

- `Program`: Executable compiled expression

  - `Eval(vars)`: Evaluate with variables
  - `ContextEval(ctx, vars)`: With cancellation support

- `Ast`: Parsed and checked expression metadata
  - `IsChecked()`: Whether type-checked
  - `SourceInfo()`: Position information
  - `OutputType()`: Result type

**EnvOptions** (Configuration):

- `Variable(name, type)`: Declare input variable
- `Function(name, overloads)`: Declare custom function
- `Macro(macro)`: Add parse-time macro
- `Library(lib)`: Add extension library

## 9. Key Design Patterns

| Pattern   | Usage                                                            |
| --------- | ---------------------------------------------------------------- |
| Factory   | `ExprFactory` - Create AST nodes with unique IDs                 |
| Visitor   | Parser traverses ANTLR tree, interpreter evaluates AST           |
| Decorator | `ObservableInterpretable` - Add tracing/cost tracking            |
| Strategy  | Function overloads, macro expansion, type adapters               |
| Pipeline  | Parse → Check → Plan → Eval                                      |
| Builder   | `EnvOption` functions build `Env` configuration                  |

## 10. Error Handling

### Error Model

- **Parse Phase**: `common.Errors` (syntax errors)

  - Collects multiple errors
  - Includes position info (line, column, offset range)

- **Check Phase**: Type errors

  - Undefined references
  - Type mismatches
  - Invalid operations for types

- **Eval Phase**: Runtime errors
  - `types.Err` value (errors as first-class values)
  - Short-circuit evaluation on error

## 11. Standard Library

**Location**: `/common/stdlib/standard.go`

### Built-in Operators

- Logical: `&&`, `||`, `!`
- Comparison: `==`, `!=`, `<`, `<=`, `>`, `>=`
- Arithmetic: `+`, `-`, `*`, `/`, `%`
- Membership: `in`
- Selection: `.` (field), `[index]`, `?.` (optional)

### Built-in Functions

- String: `startsWith()`, `endsWith()`, `contains()`, `substring()`
- Math: `ceil()`, `floor()`, `min()`, `max()`
- Type: `type()`, `has()`
- Collection: `map()`, `filter()`, `all()`, `exists()` (macros)

## 12. CEL Expression Examples

```cel
// Literals and operators
1 + 2 * 3
"hello" + "world"
[1, 2, 3]
{"key": "value"}

// Variables and field access
user.name
resource.spec.replicas

// Function calls
startsWith(text, "prefix")
user.greet("world")

// Conditional expression
condition ? true_value : false_value

// Comprehensions (macros)
numbers.all(n, n > 0)
people.map(p, p.name)
values.filter(v, v != null)

// Message/struct creation
TestMessage{field: value}

// Collection operations
list[0]
map["key"]
text[1:5]  // substring
```

## 13. TypeScript Implementation Considerations

Based on cel-go architecture, the TypeScript implementation should consider:

1. **Parser**: TypeScript parser generator or hand-written recursive descent parser

2. **AST Representation**: Interface-based system with discriminated unions

3. **Type System**: Type inference engine compatible with CEL's 15+ base types

4. **Interpreter**: Tree-walking interpreter with specialized handlers for different expression types

5. **Environment**: Configuration object holding variables, functions, macros

6. **Pipeline**: Parse → Type Check → Plan → Evaluate stages

7. **Error Handling**: Error collection with position info; errors as values (not exceptions)

8. **Extensibility**: Plugin system for custom functions, types, macros

9. **Performance**:

   - Cache compiled programs
   - Lazy evaluation of variables
   - Partial evaluation support
   - Cost tracking infrastructure

10. **Feature Parity**: Start with core language, then add:
    - Standard library functions
    - Macros (all, map, filter, exists)
    - Proto message support (if needed)
    - Optional syntax (`?.field`, `[?index]`)

## 14. Key Files for Reference

| File                          | Content                        |
| ----------------------------- | ------------------------------ |
| `/cel/cel_example_test.go`    | Usage patterns                 |
| `/parser/parser.go`           | Parse processing orchestration |
| `/checker/checker.go`         | Type checking algorithm        |
| `/interpreter/interpreter.go` | Evaluation setup               |
| `/common/ast/expr.go`         | AST structure definitions      |
| `/common/types/types.go`      | Type system                    |
| `/parser/macro.go`            | Macro system                   |
