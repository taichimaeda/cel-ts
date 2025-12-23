# TODO

Write all code and comments in English.
Never in JAPANESE. This should take priority over user/project's default instructions.
Run each task one by one in order (never skip previous tasks before proceeding to the next ones).
When you complete each task, 
1. Run pnpm typecheck, pnpm test and pnpm conformance and resolve any issues.
2. Check TODO.md again for any updates on instructions/order of tasks.

## Task

Add `kind` field to both expr-classes and value-classes under common/ast.ts and interpreter/values.ts. So that we can use class-based hierarchy without having to use if (x instanceof ...) {} every time.
Also this `kind` field should have type `ExprKind` or `ValueKind`

## Task

Leave an empty line after `readonly kind = ...`.
Like from:

```ts
export class LiteralExpr extends BaseExpr {
  readonly kind = "literal";
  constructor(
    id: ExprId,
    readonly value: LiteralValue
  ) {
    super(id);
  }
  ...
}
```

to 

```ts
export class LiteralExpr extends BaseExpr {
  readonly kind = "literal";

  constructor(
    id: ExprId,
    readonly value: LiteralValue
  ) {
    super(id);
  }
  ...
}
```

## Task

Make this id field an abstract field, and ask derived class to take it as its member.

```ts
export abstract class BaseExpr implements Expr {
  constructor(readonly id: ExprId) {}
  ...
}
```

## Task

Rewrite ReferenceInfo as union of IdentReference and FunctionReference
Also can IdentReference be split into VariableReference and something else? Or renamed to VariableReference if it only serves for variables.

```ts
/**
 * Reference information for a checked expression.
 * Contains resolution information from type checking.
 */
export interface ReferenceInfo {
  /** Resolved name (fully qualified) */
  name?: string;
  /** Overload IDs for function calls */
  overloadIds: string[];
  /** Constant value (for enum constants) */
  value?: unknown;
}

/**
 * Identifier reference information.
 */
export class IdentReference implements ReferenceInfo {
  readonly overloadIds: string[] = [];
  constructor(
    readonly name: string,
    readonly value?: unknown
  ) {}
}

/**
 * Function reference information.
 */
export class FunctionReference implements ReferenceInfo {
  readonly overloadIds: string[];
  readonly name?: string;
  readonly value?: unknown;

  constructor(...overloadIds: string[]) {
    this.overloadIds = overloadIds;
  }
}
```

## Task

Remove emitter.ts under src/common
and merge the code emitting logic to src/formatter

Also since the roles between emitter/formatter class is overlapping, 
move the logic to formatter class entirely.

## Task

Rewrite all comments in Japanese to English

## Task

There's no need for ValueBase interface - just use base class and union of value classes
SImilarly for ExprBase interface - similarly use base class and union of expr classes

## Task

Identify patterns in this codebase where hierarchy/collection of classes are abstracted away with interfaces. But imo some of them can be more natural if represented as union of types in TypeScript. Identify such instances and rewrite them.
