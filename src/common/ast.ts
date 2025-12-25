// CEL Abstract Syntax Tree
// Represents parsed CEL expressions in a form suitable for type checking and evaluation.
// This is the canonical representation used throughout cel-ts, similar to cel-go's ast package.
// Includes visitor pattern for AST traversal.

import type { Type } from "../checker/types";
import type { SourceInfo } from "./source";
import type { VisitOrder, Visitor } from "./visitor";

// ---------------------------------------------------------------------------
// Operators
// ---------------------------------------------------------------------------

/**
 * Operator names for CEL (shared between parser, checker, and interpreter).
 * Maps human-readable operator names to internal CEL function names.
 */
export const Operators = {
  // Arithmetic
  Add: "_+_",
  Subtract: "_-_",
  Multiply: "_*_",
  Divide: "_/_",
  Modulo: "_%_",
  Negate: "-_",

  // Comparison
  Equals: "_==_",
  NotEquals: "_!=_",
  Less: "_<_",
  LessEquals: "_<=_",
  Greater: "_>_",
  GreaterEquals: "_>=_",
  In: "_in_",

  // Logical
  LogicalAnd: "_&&_",
  LogicalOr: "_||_",
  LogicalNot: "!_",
  NotStrictlyFalse: "@not_strictly_false",
  Conditional: "_?_:_",

  // Index
  Index: "_[_]",
  OptIndex: "_[?_]",
  OptSelect: "_?._",
} as const;

/** Type for operator string values */
export type OperatorName = (typeof Operators)[keyof typeof Operators];

// ---------------------------------------------------------------------------
// Expression Types
// ---------------------------------------------------------------------------

/**
 * Expression identifiers and kinds.
 */
export type ExprId = number;
export type ExprKind =
  | "unspecified"
  | "literal"
  | "ident"
  | "select"
  | "call"
  | "list"
  | "map"
  | "struct"
  | "comprehension";

export type Expr =
  | UnspecifiedExpr
  | LiteralExpr
  | IdentExpr
  | SelectExpr
  | CallExpr
  | ListExpr
  | MapExpr
  | StructExpr
  | ComprehensionExpr;

/**
 * Base class providing shared behavior for expressions.
 */
export abstract class BaseExpr {
  abstract readonly kind: ExprKind;
  abstract readonly id: ExprId;

  abstract accept(visitor: Visitor, order?: VisitOrder, depth?: number, maxDepth?: number): void;

  // Type guard helpers
  static isLiteral(expr: Expr): expr is LiteralExpr {
    return expr instanceof LiteralExpr;
  }

  static isIdent(expr: Expr): expr is IdentExpr {
    return expr instanceof IdentExpr;
  }

  static isSelect(expr: Expr): expr is SelectExpr {
    return expr instanceof SelectExpr;
  }

  static isCall(expr: Expr): expr is CallExpr {
    return expr instanceof CallExpr;
  }

  static isList(expr: Expr): expr is ListExpr {
    return expr instanceof ListExpr;
  }

  static isMap(expr: Expr): expr is MapExpr {
    return expr instanceof MapExpr;
  }

  static isStruct(expr: Expr): expr is StructExpr {
    return expr instanceof StructExpr;
  }

  static isComprehension(expr: Expr): expr is ComprehensionExpr {
    return expr instanceof ComprehensionExpr;
  }
}

/**
 * Placeholder expression representing unspecified nodes.
 */
export class UnspecifiedExpr extends BaseExpr {
  readonly kind: ExprKind = "unspecified";

  constructor(readonly id: ExprId) {
    super();
  }

  override accept(
    visitor: Visitor,
    order: VisitOrder = "pre",
    depth = 0,
    maxDepth = 0
  ): void {
    if (maxDepth > 0 && depth >= maxDepth) {
      return;
    }
    if (order === "pre") {
      visitor.visitExpr(this);
    }
    if (order === "post") {
      visitor.visitExpr(this);
    }
  }
}

/**
 * Literal value expression.
 */
export class LiteralExpr extends BaseExpr {
  readonly kind: ExprKind = "literal";

  constructor(
    readonly id: ExprId,
    readonly value: LiteralValue
  ) {
    super();
  }

  override accept(
    visitor: Visitor,
    order: VisitOrder = "pre",
    depth = 0,
    maxDepth = 0
  ): void {
    if (maxDepth > 0 && depth >= maxDepth) {
      return;
    }
    if (order === "pre") {
      visitor.visitExpr(this);
    }
    if (order === "post") {
      visitor.visitExpr(this);
    }
  }
}

/**
 * Literal value types.
 */
export type LiteralValue =
  | { kind: "null" }
  | { kind: "bool"; value: boolean }
  | { kind: "int"; value: bigint }
  | { kind: "uint"; value: bigint }
  | { kind: "double"; value: number }
  | { kind: "string"; value: string }
  | { kind: "bytes"; value: Uint8Array };

/**
 * Identifier expression.
 */
export class IdentExpr extends BaseExpr {
  readonly kind: ExprKind = "ident";

  constructor(
    readonly id: ExprId,
    readonly name: string
  ) {
    super();
  }

  override accept(
    visitor: Visitor,
    order: VisitOrder = "pre",
    depth = 0,
    maxDepth = 0
  ): void {
    if (maxDepth > 0 && depth >= maxDepth) {
      return;
    }
    if (order === "pre") {
      visitor.visitExpr(this);
    }
    if (order === "post") {
      visitor.visitExpr(this);
    }
  }
}

/**
 * Field selection expression (e.g., `obj.field`).
 */
export class SelectExpr extends BaseExpr {
  readonly kind: ExprKind = "select";

  /** If true, this is a presence test (has()) rather than a selection */
  constructor(
    readonly id: ExprId,
    readonly operand: Expr,
    readonly field: string,
    readonly testOnly: boolean,
    readonly optional = false
  ) {
    super();
  }

  override accept(
    visitor: Visitor,
    order: VisitOrder = "pre",
    depth = 0,
    maxDepth = 0
  ): void {
    if (maxDepth > 0 && depth >= maxDepth) {
      return;
    }
    if (order === "pre") {
      visitor.visitExpr(this);
    }
    this.operand.accept(visitor, order, depth + 1, maxDepth);
    if (order === "post") {
      visitor.visitExpr(this);
    }
  }
}

/**
 * Function call expression.
 */
export class CallExpr extends BaseExpr {
  readonly kind: ExprKind = "call";

  /** Target for member calls (e.g., the `obj` in `obj.method(args)`) */
  constructor(
    readonly id: ExprId,
    readonly funcName: string,
    readonly args: readonly Expr[],
    readonly target?: Expr
  ) {
    super();
  }

  override accept(
    visitor: Visitor,
    order: VisitOrder = "pre",
    depth = 0,
    maxDepth = 0
  ): void {
    if (maxDepth > 0 && depth >= maxDepth) {
      return;
    }
    if (order === "pre") {
      visitor.visitExpr(this);
    }
    if (this.target !== undefined) {
      this.target.accept(visitor, order, depth + 1, maxDepth);
    }
    for (const arg of this.args) {
      arg.accept(visitor, order, depth + 1, maxDepth);
    }
    if (order === "post") {
      visitor.visitExpr(this);
    }
  }
}

/**
 * List creation expression.
 */
export class ListExpr extends BaseExpr {
  readonly kind: ExprKind = "list";

  /** Indices of optional elements */
  constructor(
    readonly id: ExprId,
    readonly elements: readonly Expr[],
    readonly optionalIndices: readonly number[]
  ) {
    super();
  }

  override accept(
    visitor: Visitor,
    order: VisitOrder = "pre",
    depth = 0,
    maxDepth = 0
  ): void {
    if (maxDepth > 0 && depth >= maxDepth) {
      return;
    }
    if (order === "pre") {
      visitor.visitExpr(this);
    }
    for (const elem of this.elements) {
      elem.accept(visitor, order, depth + 1, maxDepth);
    }
    if (order === "post") {
      visitor.visitExpr(this);
    }
  }
}

/**
 * Entry expression kinds.
 */
/**
 * Base entry expression interface (for map entries and struct fields).
 */
export interface EntryExpr {
  readonly id: ExprId;

  accept(visitor: Visitor, order?: VisitOrder, depth?: number, maxDepth?: number): void;
}

/**
 * Base class providing shared behavior for entries.
 */
export abstract class BaseEntry implements EntryExpr {
  constructor(readonly id: ExprId) { }

  abstract accept(visitor: Visitor, order?: VisitOrder, depth?: number, maxDepth?: number): void;

  static isMapEntry(entry: EntryExpr): entry is MapEntry {
    return entry instanceof MapEntry;
  }

  static isStructField(entry: EntryExpr): entry is StructField {
    return entry instanceof StructField;
  }
}

/**
 * Map entry expression.
 * Example: `{ "a": 1 ? }`
 */
export class MapEntry extends BaseEntry {
  constructor(
    id: ExprId,
    readonly key: Expr,
    readonly value: Expr,
    readonly optional: boolean
  ) {
    super(id);
  }

  override accept(
    visitor: Visitor,
    order: VisitOrder = "pre",
    depth = 0,
    maxDepth = 0
  ): void {
    if (maxDepth > 0 && depth >= maxDepth) {
      return;
    }
    if (order === "pre") {
      visitor.visitEntryExpr(this);
    }
    this.key.accept(visitor, order, depth + 1, maxDepth);
    this.value.accept(visitor, order, depth + 1, maxDepth);
    if (order === "post") {
      visitor.visitEntryExpr(this);
    }
  }
}

/**
 * Map creation expression.
 */
export class MapExpr extends BaseExpr {
  readonly kind: ExprKind = "map";

  constructor(
    readonly id: ExprId,
    readonly entries: readonly MapEntry[]
  ) {
    super();
  }

  override accept(
    visitor: Visitor,
    order: VisitOrder = "pre",
    depth = 0,
    maxDepth = 0
  ): void {
    if (maxDepth > 0 && depth >= maxDepth) {
      return;
    }
    if (order === "pre") {
      visitor.visitExpr(this);
    }
    for (const entry of this.entries) {
      entry.accept(visitor, order, depth, maxDepth);
    }
    if (order === "post") {
      visitor.visitExpr(this);
    }
  }
}

/**
 * Struct field initializer.
 * Example: `{foo: bar?}`
 */
export class StructField extends BaseEntry {
  constructor(
    id: ExprId,
    readonly name: string,
    readonly value: Expr,
    readonly optional: boolean
  ) {
    super(id);
  }

  override accept(
    visitor: Visitor,
    order: VisitOrder = "pre",
    depth = 0,
    maxDepth = 0
  ): void {
    if (maxDepth > 0 && depth >= maxDepth) {
      return;
    }
    if (order === "pre") {
      visitor.visitEntryExpr(this);
    }
    this.value.accept(visitor, order, depth + 1, maxDepth);
    if (order === "post") {
      visitor.visitEntryExpr(this);
    }
  }
}

/**
 * Struct/message creation expression.
 */
export class StructExpr extends BaseExpr {
  readonly kind: ExprKind = "struct";

  constructor(
    readonly id: ExprId,
    readonly typeName: string,
    readonly fields: readonly StructField[]
  ) {
    super();
  }

  override accept(
    visitor: Visitor,
    order: VisitOrder = "pre",
    depth = 0,
    maxDepth = 0
  ): void {
    if (maxDepth > 0 && depth >= maxDepth) {
      return;
    }
    if (order === "pre") {
      visitor.visitExpr(this);
    }
    for (const field of this.fields) {
      field.accept(visitor, order, depth, maxDepth);
    }
    if (order === "post") {
      visitor.visitExpr(this);
    }
  }
}

/**
 * Comprehension (fold) expression.
 * Example: `list.all(x, x > 0)`
 */
export class ComprehensionExpr extends BaseExpr {
  readonly kind: ExprKind = "comprehension";

  readonly id: ExprId;
  /** Expression that evaluates to the iterable (list or map). */
  readonly iterRange: Expr;
  /** Iteration variable name. */
  readonly iterVar: string;
  /** Accumulator variable name. */
  readonly accuVar: string;
  /** Initial accumulator value. */
  readonly accuInit: Expr;
  /** Loop condition (evaluated each iteration, continues while true). */
  readonly loopCondition: Expr;
  /** Loop step (updates the accumulator). */
  readonly loopStep: Expr;
  /** Result expression (evaluated after the loop). */
  readonly result: Expr;
  /** Second iteration variable name (optional). */
  readonly iterVar2: string | undefined;

  constructor({
    id,
    iterRange,
    iterVar,
    iterVar2,
    accuVar,
    accuInit,
    loopCondition,
    loopStep,
    result,
  }: {
    id: ExprId;
    iterRange: Expr;
    iterVar: string;
    iterVar2?: string | undefined;
    accuVar: string;
    accuInit: Expr;
    loopCondition: Expr;
    loopStep: Expr;
    result: Expr;
  }) {
    super();
    this.id = id;
    this.iterRange = iterRange;
    this.iterVar = iterVar;
    this.iterVar2 = iterVar2;
    this.accuVar = accuVar;
    this.accuInit = accuInit;
    this.loopCondition = loopCondition;
    this.loopStep = loopStep;
    this.result = result;
  }

  override accept(
    visitor: Visitor,
    order: VisitOrder = "pre",
    depth = 0,
    maxDepth = 0
  ): void {
    if (maxDepth > 0 && depth >= maxDepth) {
      return;
    }
    if (order === "pre") {
      visitor.visitExpr(this);
    }
    this.iterRange.accept(visitor, order, depth + 1, maxDepth);
    this.accuInit.accept(visitor, order, depth + 1, maxDepth);
    this.loopCondition.accept(visitor, order, depth + 1, maxDepth);
    this.loopStep.accept(visitor, order, depth + 1, maxDepth);
    this.result.accept(visitor, order, depth + 1, maxDepth);
    if (order === "post") {
      visitor.visitExpr(this);
    }
  }
}

/**
 * Union type for all entry expression types.
 */
export type AnyEntryExpr = MapEntry | StructField;

// ============================================================================
// Expression Factory
// ============================================================================

/**
 * Standard accumulator variable name used in comprehensions.
 */
export const AccumulatorName = "__result__";

// ============================================================================
// Reference Information
// ============================================================================

/**
 * Reference information for a checked expression.
 * Contains resolution information from type checking.
 */
export type ReferenceInfo = VariableReference | FunctionReference;

/**
 * Variable reference information.
 */
export class VariableReference {
  constructor(
    readonly name: string,
    readonly value?: unknown
  ) { }
}

/**
 * Function reference information.
 */
export class FunctionReference {
  constructor(
    readonly overloadIds: string[],
    readonly name?: string | undefined,
  ) { }
}

// ============================================================================
// AST Class
// ============================================================================

/**
 * CEL Abstract Syntax Tree.
 * Contains the root expression, source info, and optional type/reference maps.
 */
export class AST {
  constructor(
    readonly expr: Expr,
    readonly sourceInfo: SourceInfo,
    readonly typeMap: Map<ExprId, Type> = new Map(),
    readonly refMap: Map<ExprId, ReferenceInfo> = new Map()
  ) { }

  /**
   * Get the type for an expression ID.
   */
  getType(id: ExprId): Type | undefined {
    return this.typeMap.get(id);
  }

  /**
   * Set the type for an expression ID.
   */
  setType(id: ExprId, t: Type): void {
    this.typeMap.set(id, t);
  }

  /**
   * Get the reference for an expression ID.
   */
  getReference(id: ExprId): ReferenceInfo | undefined {
    return this.refMap.get(id);
  }

  /**
   * Set the reference for an expression ID.
   */
  setReference(id: ExprId, ref: ReferenceInfo): void {
    this.refMap.set(id, ref);
  }

  /**
   * Get overload IDs for an expression.
   */
  getOverloadIds(id: ExprId): string[] {
    const ref = this.refMap.get(id);
    return ref instanceof FunctionReference ? ref.overloadIds : [];
  }

  /**
   * Check if this AST has been type-checked.
   */
  isChecked(): boolean {
    return this.typeMap.size > 0;
  }

  /**
   * Get the source expression text.
   */
  source(): string {
    return this.sourceInfo.source;
  }
}
