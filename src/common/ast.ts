// CEL Abstract Syntax Tree
// Represents parsed CEL expressions in a form suitable for type checking and evaluation.
// This is the canonical representation used throughout cel-ts, similar to cel-go's ast package.
// Includes visitor pattern for AST traversal.

import type { Type } from "../checker/types";
import type { SourceInfo } from "./source";
import { VisitOrder, type Visitor } from "./visitor";

/**
 * Operator names for CEL (shared between parser, checker, and interpreter).
 */
export enum Operators {
  // Arithmetic
  Add = "_+_",
  Subtract = "_-_",
  Multiply = "_*_",
  Divide = "_/_",
  Modulo = "_%_",
  Negate = "-_",

  // Comparison
  Equals = "_==_",
  NotEquals = "_!=_",
  Less = "_<_",
  LessEquals = "_<=_",
  Greater = "_>_",
  GreaterEquals = "_>=_",
  In = "_in_",

  // Logical
  LogicalAnd = "_&&_",
  LogicalOr = "_||_",
  LogicalNot = "!_",
  NotStrictlyFalse = "@not_strictly_false",
  Conditional = "_?_:_",

  // Index
  Index = "_[_]",
  OptIndex = "_[?_]",
  OptSelect = "_?._",
}

/**
 * Base expression interface.
 */
export type ExprId = number;

export interface Expr {
  /** Unique ID for this expression node */
  readonly id: ExprId;
  /** Traverse the expression with a visitor. */
  accept(visitor: Visitor, order?: VisitOrder, depth?: number, maxDepth?: number): void;
}

/**
 * Base class providing shared behavior for expressions.
 */
export abstract class BaseExpr implements Expr {
  constructor(readonly id: ExprId) { }

  abstract accept(
    visitor: Visitor,
    order?: VisitOrder,
    depth?: number,
    maxDepth?: number
  ): void;

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
  constructor(id: ExprId) {
    super(id);
  }

  override accept(
    visitor: Visitor,
    order: VisitOrder = VisitOrder.Pre,
    depth = 0,
    maxDepth = 0
  ): void {
    if (maxDepth > 0 && depth >= maxDepth) {
      return;
    }
    if (order === VisitOrder.Pre) {
      visitor.visitExpr(this);
    }
    if (order === VisitOrder.Post) {
      visitor.visitExpr(this);
    }
  }
}

/**
 * Literal value expression.
 */
export class LiteralExpr extends BaseExpr {
  constructor(id: ExprId, readonly value: LiteralValue) {
    super(id);
  }

  override accept(
    visitor: Visitor,
    order: VisitOrder = VisitOrder.Pre,
    depth = 0,
    maxDepth = 0
  ): void {
    if (maxDepth > 0 && depth >= maxDepth) {
      return;
    }
    if (order === VisitOrder.Pre) {
      visitor.visitExpr(this);
    }
    if (order === VisitOrder.Post) {
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
  constructor(id: ExprId, readonly name: string) {
    super(id);
  }

  override accept(
    visitor: Visitor,
    order: VisitOrder = VisitOrder.Pre,
    depth = 0,
    maxDepth = 0
  ): void {
    if (maxDepth > 0 && depth >= maxDepth) {
      return;
    }
    if (order === VisitOrder.Pre) {
      visitor.visitExpr(this);
    }
    if (order === VisitOrder.Post) {
      visitor.visitExpr(this);
    }
  }
}

/**
 * Field selection expression (e.g., `obj.field`).
 */
export class SelectExpr extends BaseExpr {
  /** If true, this is a presence test (has()) rather than a selection */
  constructor(
    id: ExprId,
    readonly operand: Expr,
    readonly field: string,
    readonly testOnly: boolean,
    readonly optional = false
  ) {
    super(id);
  }

  override accept(
    visitor: Visitor,
    order: VisitOrder = VisitOrder.Pre,
    depth = 0,
    maxDepth = 0
  ): void {
    if (maxDepth > 0 && depth >= maxDepth) {
      return;
    }
    if (order === VisitOrder.Pre) {
      visitor.visitExpr(this);
    }
    this.operand.accept(visitor, order, depth + 1, maxDepth);
    if (order === VisitOrder.Post) {
      visitor.visitExpr(this);
    }
  }
}

/**
 * Function call expression.
 */
export class CallExpr extends BaseExpr {
  /** Target for member calls (e.g., the `obj` in `obj.method(args)`) */
  constructor(
    id: ExprId,
    readonly funcName: string,
    readonly args: readonly Expr[],
    readonly target?: Expr
  ) {
    super(id);
  }

  override accept(
    visitor: Visitor,
    order: VisitOrder = VisitOrder.Pre,
    depth = 0,
    maxDepth = 0
  ): void {
    if (maxDepth > 0 && depth >= maxDepth) {
      return;
    }
    if (order === VisitOrder.Pre) {
      visitor.visitExpr(this);
    }
    if (this.target) {
      this.target.accept(visitor, order, depth + 1, maxDepth);
    }
    for (const arg of this.args) {
      arg.accept(visitor, order, depth + 1, maxDepth);
    }
    if (order === VisitOrder.Post) {
      visitor.visitExpr(this);
    }
  }
}

/**
 * List creation expression.
 */
export class ListExpr extends BaseExpr {
  /** Indices of optional elements */
  constructor(
    id: ExprId,
    readonly elements: readonly Expr[],
    readonly optionalIndices: readonly number[]
  ) {
    super(id);
  }

  override accept(
    visitor: Visitor,
    order: VisitOrder = VisitOrder.Pre,
    depth = 0,
    maxDepth = 0
  ): void {
    if (maxDepth > 0 && depth >= maxDepth) {
      return;
    }
    if (order === VisitOrder.Pre) {
      visitor.visitExpr(this);
    }
    for (const elem of this.elements) {
      elem.accept(visitor, order, depth + 1, maxDepth);
    }
    if (order === VisitOrder.Post) {
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

  abstract accept(
    visitor: Visitor,
    order?: VisitOrder,
    depth?: number,
    maxDepth?: number
  ): void;

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
    order: VisitOrder = VisitOrder.Pre,
    depth = 0,
    maxDepth = 0
  ): void {
    if (maxDepth > 0 && depth >= maxDepth) {
      return;
    }
    if (order === VisitOrder.Pre) {
      visitor.visitEntryExpr(this);
    }
    this.key.accept(visitor, order, depth + 1, maxDepth);
    this.value.accept(visitor, order, depth + 1, maxDepth);
    if (order === VisitOrder.Post) {
      visitor.visitEntryExpr(this);
    }
  }
}

/**
 * Map creation expression.
 */
export class MapExpr extends BaseExpr {
  constructor(id: ExprId, readonly entries: readonly MapEntry[]) {
    super(id);
  }

  override accept(
    visitor: Visitor,
    order: VisitOrder = VisitOrder.Pre,
    depth = 0,
    maxDepth = 0
  ): void {
    if (maxDepth > 0 && depth >= maxDepth) {
      return;
    }
    if (order === VisitOrder.Pre) {
      visitor.visitExpr(this);
    }
    for (const entry of this.entries) {
      entry.accept(visitor, order, depth, maxDepth);
    }
    if (order === VisitOrder.Post) {
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
    order: VisitOrder = VisitOrder.Pre,
    depth = 0,
    maxDepth = 0
  ): void {
    if (maxDepth > 0 && depth >= maxDepth) {
      return;
    }
    if (order === VisitOrder.Pre) {
      visitor.visitEntryExpr(this);
    }
    this.value.accept(visitor, order, depth + 1, maxDepth);
    if (order === VisitOrder.Post) {
      visitor.visitEntryExpr(this);
    }
  }
}

/**
 * Struct/message creation expression.
 */
export class StructExpr extends BaseExpr {
  constructor(
    id: ExprId,
    readonly typeName: string,
    readonly fields: readonly StructField[]
  ) {
    super(id);
  }

  override accept(
    visitor: Visitor,
    order: VisitOrder = VisitOrder.Pre,
    depth = 0,
    maxDepth = 0
  ): void {
    if (maxDepth > 0 && depth >= maxDepth) {
      return;
    }
    if (order === VisitOrder.Pre) {
      visitor.visitExpr(this);
    }
    for (const field of this.fields) {
      field.accept(visitor, order, depth, maxDepth);
    }
    if (order === VisitOrder.Post) {
      visitor.visitExpr(this);
    }
  }
}

/**
 * Comprehension (fold) expression.
 * Example: `list.all(x, x > 0)`
 */
export class ComprehensionExpr extends BaseExpr {
  constructor(
    id: ExprId,
    /** Expression that evaluates to the iterable (list or map) */
    readonly iterRange: Expr,
    /** Iteration variable name */
    readonly iterVar: string,
    /** Accumulator variable name */
    readonly accuVar: string,
    /** Initial accumulator value */
    readonly accuInit: Expr,
    /** Loop condition (evaluated each iteration, continues while true) */
    readonly loopCondition: Expr,
    /** Loop step (updates the accumulator) */
    readonly loopStep: Expr,
    /** Result expression (evaluated after the loop) */
    readonly result: Expr,
    /** Second iteration variable name (optional) */
    readonly iterVar2?: string
  ) {
    super(id);
  }

  override accept(
    visitor: Visitor,
    order: VisitOrder = VisitOrder.Pre,
    depth = 0,
    maxDepth = 0
  ): void {
    if (maxDepth > 0 && depth >= maxDepth) {
      return;
    }
    if (order === VisitOrder.Pre) {
      visitor.visitExpr(this);
    }
    this.iterRange.accept(visitor, order, depth + 1, maxDepth);
    this.accuInit.accept(visitor, order, depth + 1, maxDepth);
    this.loopCondition.accept(visitor, order, depth + 1, maxDepth);
    this.loopStep.accept(visitor, order, depth + 1, maxDepth);
    this.result.accept(visitor, order, depth + 1, maxDepth);
    if (order === VisitOrder.Post) {
      visitor.visitExpr(this);
    }
  }
}

/**
 * Union type for all expression types.
 */
export type AnyExpr =
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
  constructor(readonly name: string, readonly value?: unknown) { }
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
    return ref?.overloadIds ?? [];
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
