// CEL Abstract Syntax Tree
// Represents parsed CEL expressions in a form suitable for type checking and evaluation.
// This is the canonical representation used throughout cel-ts, similar to cel-go's ast package.
// Includes visitor pattern for AST traversal.

import type { Type } from "../checker/types";

/**
 * Expression kinds in the CEL AST.
 */
export enum ExprKind {
  Unspecified,
  Literal,
  Ident,
  Select,
  Call,
  List,
  Map,
  Struct,
  Comprehension,
}

/** Order to visit nodes during traversal. */
export enum VisitOrder {
  Pre = "pre",
  Post = "post",
}

/**
 * Base expression interface.
 */
export interface Expr {
  /** Unique ID for this expression node */
  readonly id: number;
  /** The kind of expression */
  readonly kind: ExprKind;
  /** Traverse the expression with a visitor. */
  accept(visitor: Visitor, order?: VisitOrder, depth?: number, maxDepth?: number): void;
}

/**
 * Base class providing shared behavior for expressions.
 */
export abstract class BaseExpr implements Expr {
  constructor(public readonly id: number, public readonly kind: ExprKind) {}

  accept(
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
    this.visitChildren(visitor, order, depth, maxDepth);
    if (order === VisitOrder.Post) {
      visitor.visitExpr(this);
    }
  }

  // Subclasses override to walk their child nodes.
  protected visitChildren(
    _visitor: Visitor,
    _order: VisitOrder,
    _depth: number,
    _maxDepth: number
  ): void {}

  // Type guard helpers
  static isLiteral(expr: Expr): expr is LiteralExpr {
    return expr.kind === ExprKind.Literal;
  }

  static isIdent(expr: Expr): expr is IdentExpr {
    return expr.kind === ExprKind.Ident;
  }

  static isSelect(expr: Expr): expr is SelectExpr {
    return expr.kind === ExprKind.Select;
  }

  static isCall(expr: Expr): expr is CallExpr {
    return expr.kind === ExprKind.Call;
  }

  static isList(expr: Expr): expr is ListExpr {
    return expr.kind === ExprKind.List;
  }

  static isMap(expr: Expr): expr is MapExpr {
    return expr.kind === ExprKind.Map;
  }

  static isStruct(expr: Expr): expr is StructExpr {
    return expr.kind === ExprKind.Struct;
  }

  static isComprehension(expr: Expr): expr is ComprehensionExpr {
    return expr.kind === ExprKind.Comprehension;
  }
}

/**
 * Placeholder expression representing unspecified nodes.
 */
export class UnspecifiedExpr extends BaseExpr {
  constructor(id: number) {
    super(id, ExprKind.Unspecified);
  }
}

/**
 * Literal value expression.
 */
export class LiteralExpr extends BaseExpr {
  constructor(id: number, public readonly value: LiteralValue) {
    super(id, ExprKind.Literal);
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
  constructor(id: number, public readonly name: string) {
    super(id, ExprKind.Ident);
  }
}

/**
 * Field selection expression (e.g., `obj.field`).
 */
export class SelectExpr extends BaseExpr {
  /** If true, this is a presence test (has()) rather than a selection */
  constructor(
    id: number,
    public readonly operand: Expr,
    public readonly field: string,
    public readonly testOnly: boolean
  ) {
    super(id, ExprKind.Select);
  }

  protected override visitChildren(
    visitor: Visitor,
    order: VisitOrder,
    depth: number,
    maxDepth: number
  ): void {
    this.operand.accept(visitor, order, depth + 1, maxDepth);
  }
}

/**
 * Function call expression.
 */
export class CallExpr extends BaseExpr {
  /** Target for member calls (e.g., the `obj` in `obj.method(args)`) */
  constructor(
    id: number,
    public readonly funcName: string,
    public readonly args: readonly Expr[],
    public readonly target?: Expr
  ) {
    super(id, ExprKind.Call);
  }

  protected override visitChildren(
    visitor: Visitor,
    order: VisitOrder,
    depth: number,
    maxDepth: number
  ): void {
    if (this.target) {
      this.target.accept(visitor, order, depth + 1, maxDepth);
    }
    for (const arg of this.args) {
      arg.accept(visitor, order, depth + 1, maxDepth);
    }
  }
}

/**
 * List creation expression.
 */
export class ListExpr extends BaseExpr {
  /** Indices of optional elements */
  constructor(
    id: number,
    public readonly elements: readonly Expr[],
    public readonly optionalIndices: readonly number[]
  ) {
    super(id, ExprKind.List);
  }

  protected override visitChildren(
    visitor: Visitor,
    order: VisitOrder,
    depth: number,
    maxDepth: number
  ): void {
    for (const elem of this.elements) {
      elem.accept(visitor, order, depth + 1, maxDepth);
    }
  }
}

/**
 * Entry expression kinds.
 */
export enum EntryExprKind {
  Unspecified,
  MapEntry,
  StructField,
}

/**
 * Base entry expression interface (for map entries and struct fields).
 */
export interface EntryExpr {
  readonly id: number;
  readonly entryKind: EntryExprKind;

  accept(visitor: Visitor, order?: VisitOrder, depth?: number, maxDepth?: number): void;
}

/**
 * Base class providing shared behavior for entries.
 */
export abstract class BaseEntry implements EntryExpr {
  constructor(public readonly id: number, public readonly entryKind: EntryExprKind) {}

  accept(
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
    this.visitChildren(visitor, order, depth, maxDepth);
    if (order === VisitOrder.Post) {
      visitor.visitEntryExpr(this);
    }
  }

  protected visitChildren(
    _visitor: Visitor,
    _order: VisitOrder,
    _depth: number,
    _maxDepth: number
  ): void {}

  static isMapEntry(entry: EntryExpr): entry is MapEntry {
    return entry.entryKind === EntryExprKind.MapEntry;
  }

  static isStructField(entry: EntryExpr): entry is StructField {
    return entry.entryKind === EntryExprKind.StructField;
  }
}

/**
 * Map entry expression.
 * Example: `{ "a": 1 ? }`
 */
export class MapEntry extends BaseEntry {
  constructor(
    id: number,
    public readonly key: Expr,
    public readonly value: Expr,
    public readonly optional: boolean
  ) {
    super(id, EntryExprKind.MapEntry);
  }

  protected override visitChildren(
    visitor: Visitor,
    order: VisitOrder,
    depth: number,
    maxDepth: number
  ): void {
    this.key.accept(visitor, order, depth + 1, maxDepth);
    this.value.accept(visitor, order, depth + 1, maxDepth);
  }
}

/**
 * Map creation expression.
 */
export class MapExpr extends BaseExpr {
  constructor(id: number, public readonly entries: readonly MapEntry[]) {
    super(id, ExprKind.Map);
  }

  protected override visitChildren(
    visitor: Visitor,
    order: VisitOrder,
    depth: number,
    maxDepth: number
  ): void {
    for (const entry of this.entries) {
      entry.accept(visitor, order, depth, maxDepth);
    }
  }
}

/**
 * Struct field initializer.
 * Example: `{foo: bar?}`
 */
export class StructField extends BaseEntry {
  constructor(
    id: number,
    public readonly name: string,
    public readonly value: Expr,
    public readonly optional: boolean
  ) {
    super(id, EntryExprKind.StructField);
  }

  protected override visitChildren(
    visitor: Visitor,
    order: VisitOrder,
    depth: number,
    maxDepth: number
  ): void {
    this.value.accept(visitor, order, depth + 1, maxDepth);
  }
}

/**
 * Struct/message creation expression.
 */
export class StructExpr extends BaseExpr {
  constructor(
    id: number,
    public readonly typeName: string,
    public readonly fields: readonly StructField[]
  ) {
    super(id, ExprKind.Struct);
  }

  protected override visitChildren(
    visitor: Visitor,
    order: VisitOrder,
    depth: number,
    maxDepth: number
  ): void {
    for (const field of this.fields) {
      field.accept(visitor, order, depth, maxDepth);
    }
  }
}

/**
 * Comprehension (fold) expression.
 * Example: `list.all(x, x > 0)`
 */
export class ComprehensionExpr extends BaseExpr {
  constructor(
    id: number,
    /** Expression that evaluates to the iterable (list or map) */
    public readonly iterRange: Expr,
    /** Iteration variable name */
    public readonly iterVar: string,
    /** Accumulator variable name */
    public readonly accuVar: string,
    /** Initial accumulator value */
    public readonly accuInit: Expr,
    /** Loop condition (evaluated each iteration, continues while true) */
    public readonly loopCondition: Expr,
    /** Loop step (updates the accumulator) */
    public readonly loopStep: Expr,
    /** Result expression (evaluated after the loop) */
    public readonly result: Expr,
    /** Second iteration variable name (optional) */
    public readonly iterVar2?: string
  ) {
    super(id, ExprKind.Comprehension);
  }

  protected override visitChildren(
    visitor: Visitor,
    order: VisitOrder,
    depth: number,
    maxDepth: number
  ): void {
    this.iterRange.accept(visitor, order, depth + 1, maxDepth);
    this.accuInit.accept(visitor, order, depth + 1, maxDepth);
    this.loopCondition.accept(visitor, order, depth + 1, maxDepth);
    this.loopStep.accept(visitor, order, depth + 1, maxDepth);
    this.result.accept(visitor, order, depth + 1, maxDepth);
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
// ============================================================================
// Visitor Pattern
// ============================================================================

/**
 * Visitor interface for traversing AST nodes.
 */
export interface Visitor {
  /** Visit an expression node. */
  visitExpr(expr: Expr): void;
  /** Visit an entry expression (map entry or struct field). */
  visitEntryExpr(entry: EntryExpr): void;
}

/**
 * Base visitor implementation that can be extended.
 */
export class BaseVisitor implements Visitor {
  visitExpr(_expr: Expr): void {
    // Override in subclass
  }
  visitEntryExpr(_entry: EntryExpr): void {
    // Override in subclass
  }
}

/**
 * Visitor implementation that only handles expressions.
 */
export class ExprVisitor implements Visitor {
  constructor(private readonly exprFn: (expr: Expr) => void) {}

  visitExpr(expr: Expr): void {
    this.exprFn(expr);
  }

  visitEntryExpr(_entry: EntryExpr): void {
    // Ignore entries
  }
}

/**
 * Visitor implementation that only handles entry nodes.
 */
export class EntryVisitor implements Visitor {
  constructor(private readonly entryFn: (entry: EntryExpr) => void) {}

  visitExpr(_expr: Expr): void {
    // Ignore expressions
  }

  visitEntryExpr(entry: EntryExpr): void {
    this.entryFn(entry);
  }
}

/**
 * Visitor implementation that handles both expressions and entries.
 */
export class CompositeVisitor implements Visitor {
  constructor(
    private readonly exprFn: (expr: Expr) => void,
    private readonly entryFn: (entry: EntryExpr) => void
  ) {}

  visitExpr(expr: Expr): void {
    this.exprFn(expr);
  }

  visitEntryExpr(entry: EntryExpr): void {
    this.entryFn(entry);
  }
}

/**
 * Convenience helper that traverses the expression with the given visitor.
 */
export function traverseExpr(
  expr: Expr,
  visitor: Visitor,
  order: VisitOrder = VisitOrder.Pre,
  maxDepth = 0
): void {
  expr.accept(visitor, order, 0, maxDepth);
}

/**
 * Expression matcher function type.
 */
export type ExprMatcher = (expr: Expr) => boolean;

/**
 * Match all descendant expressions that satisfy the matcher.
 * Returns matches in post-order (bottom-up).
 */
export function matchDescendants(expr: Expr, matcher: ExprMatcher): Expr[] {
  const matches: Expr[] = [];
  traverseExpr(
    expr,
    new ExprVisitor((e) => {
      if (matcher(e)) {
        matches.push(e);
      }
    }),
    VisitOrder.Post
  );
  return matches;
}

/**
 * Matcher that matches all expressions.
 */
export function allMatcher(): ExprMatcher {
  return () => true;
}

/**
 * Matcher that matches expressions of a specific kind.
 */
export function kindMatcher(kind: ExprKind): ExprMatcher {
  return (e) => e.kind === kind;
}

/**
 * Matcher that matches function calls with a specific name.
 */
export function functionMatcher(funcName: string): ExprMatcher {
  return (e) => e.kind === ExprKind.Call && (e as CallExpr).funcName === funcName;
}

/**
 * Matcher that matches constant values (literals).
 */
export function constantValueMatcher(): ExprMatcher {
  return (e) => e.kind === ExprKind.Literal;
}

/**
 * Find the maximum expression ID in the AST.
 */
export function maxId(expr: Expr): number {
  let max = 0;
  traverseExpr(
    expr,
    new CompositeVisitor(
      (e) => {
        if (e.id > max) max = e.id;
      },
      (entry) => {
        if (entry.id > max) max = entry.id;
      }
    ),
    VisitOrder.Post
  );
  return max;
}

// ============================================================================
// Expression Factory
// ============================================================================

/**
 * Standard accumulator variable name used in comprehensions.
 */
export const AccumulatorName = "__result__";

// ============================================================================
// Source Information
// ============================================================================

/**
 * Offset range in source.
 */
export interface OffsetRange {
  start: number;
  end: number;
}

/**
 * Source information for error reporting and unparsing.
 */
export class SourceInfo {
  /** Original source expression */
  readonly source: string;
  /** Description (filename, etc.) */
  readonly description: string;
  /** Line offsets for computing location */
  private readonly lineOffsets: number[];
  /** Map from expression ID to offset range */
  private readonly positions: Map<number, OffsetRange> = new Map();
  /** Map from expression ID to macro call (original call before expansion) */
  private readonly macroCalls: Map<number, Expr> = new Map();

  constructor(source: string, description = "<input>") {
    this.source = source;
    this.description = description;
    this.lineOffsets = this.computeLineOffsets(source);
  }

  private computeLineOffsets(source: string): number[] {
    const offsets: number[] = [];
    for (let i = 0; i < source.length; i++) {
      if (source[i] === "\n") {
        offsets.push(i + 1);
      }
    }
    return offsets;
  }

  /**
   * Set position for an expression ID.
   */
  setPosition(id: number, range: OffsetRange): void {
    this.positions.set(id, range);
  }

  /**
   * Get position for an expression ID.
   */
  getPosition(id: number): OffsetRange | undefined {
    return this.positions.get(id);
  }

  /**
   * Get all positions.
   */
  getPositions(): Map<number, OffsetRange> {
    return this.positions;
  }

  /**
   * Record a macro call (original call expression before expansion).
   */
  setMacroCall(id: number, call: Expr): void {
    this.macroCalls.set(id, call);
  }

  /**
   * Get the original macro call for an expression ID.
   */
  getMacroCall(id: number): Expr | undefined {
    return this.macroCalls.get(id);
  }

  /**
   * Check if an expression ID was a macro call.
   */
  isMacroCall(id: number): boolean {
    return this.macroCalls.has(id);
  }

  /**
   * Get all macro calls.
   */
  getMacroCalls(): Map<number, Expr> {
    return this.macroCalls;
  }

  /**
   * Clear a macro call.
   */
  clearMacroCall(id: number): void {
    this.macroCalls.delete(id);
  }

  /**
   * Compute offset from line and column (1-based line, 0-based column).
   */
  computeOffset(line: number, column: number): number {
    if (line === 1) {
      return column;
    }
    if (line < 1 || line > this.lineOffsets.length + 1) {
      return -1;
    }
    return this.lineOffsets[line - 2]! + column;
  }

  /**
   * Get location (line, column) from offset.
   */
  getLocation(offset: number): { line: number; column: number } {
    let line = 1;
    let col = offset;
    for (const lineOffset of this.lineOffsets) {
      if (lineOffset > offset) {
        break;
      }
      line++;
      col = offset - lineOffset;
    }
    return { line, column: col };
  }

  /**
   * Get the start location for an expression ID.
   */
  getStartLocation(id: number): { line: number; column: number } | undefined {
    const range = this.positions.get(id);
    if (!range) {
      return undefined;
    }
    return this.getLocation(range.start);
  }
}

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
 * Create an identifier reference.
 */
export function createIdentReference(name: string, value?: unknown): ReferenceInfo {
  return { name, overloadIds: [], value };
}

/**
 * Create a function reference with overload IDs.
 */
export function createFunctionReference(...overloadIds: string[]): ReferenceInfo {
  return { overloadIds };
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
    readonly typeMap: Map<number, Type> = new Map(),
    readonly refMap: Map<number, ReferenceInfo> = new Map()
  ) {}

  /**
   * Get the type for an expression ID.
   */
  getType(id: number): Type | undefined {
    return this.typeMap.get(id);
  }

  /**
   * Set the type for an expression ID.
   */
  setType(id: number, t: Type): void {
    this.typeMap.set(id, t);
  }

  /**
   * Get the reference for an expression ID.
   */
  getReference(id: number): ReferenceInfo | undefined {
    return this.refMap.get(id);
  }

  /**
   * Set the reference for an expression ID.
   */
  setReference(id: number, ref: ReferenceInfo): void {
    this.refMap.set(id, ref);
  }

  /**
   * Get overload IDs for an expression.
   */
  getOverloadIds(id: number): string[] {
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
