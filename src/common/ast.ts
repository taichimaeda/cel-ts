// CEL Abstract Syntax Tree
// Represents parsed CEL expressions in a form suitable for type checking and evaluation.
// This is the canonical representation used throughout cel-ts, similar to cel-go's ast package.
// Includes visitor pattern for AST traversal.

import type { Type } from "../checker/types";

/**
 * Expression kinds in the CEL AST.
 */
export enum ExprKind {
  Unspecified = 0,
  Literal = 1,
  Ident = 2,
  Select = 3,
  Call = 4,
  List = 5,
  Map = 6,
  Struct = 7,
  Comprehension = 8,
}

/**
 * Base expression interface.
 */
export interface Expr {
  /** Unique ID for this expression node */
  readonly id: number;
  /** The kind of expression */
  readonly kind: ExprKind;
}

/**
 * Literal value expression.
 */
export interface LiteralExpr extends Expr {
  readonly kind: ExprKind.Literal;
  readonly value: LiteralValue;
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
export interface IdentExpr extends Expr {
  readonly kind: ExprKind.Ident;
  readonly name: string;
}

/**
 * Field selection expression (e.g., `obj.field`).
 */
export interface SelectExpr extends Expr {
  readonly kind: ExprKind.Select;
  readonly operand: Expr;
  readonly field: string;
  /** If true, this is a presence test (has()) rather than a selection */
  readonly testOnly: boolean;
}

/**
 * Function call expression.
 */
export interface CallExpr extends Expr {
  readonly kind: ExprKind.Call;
  readonly function: string;
  /** Target for member calls (e.g., the `obj` in `obj.method(args)`) */
  readonly target?: Expr;
  readonly args: readonly Expr[];
}

/**
 * List creation expression.
 */
export interface ListExpr extends Expr {
  readonly kind: ExprKind.List;
  readonly elements: readonly Expr[];
  /** Indices of optional elements */
  readonly optionalIndices: readonly number[];
}

/**
 * Entry expression kinds.
 */
export enum EntryExprKind {
  Unspecified = 0,
  MapEntry = 1,
  StructField = 2,
}

/**
 * Base entry expression interface (for map entries and struct fields).
 */
export interface EntryExpr {
  readonly id: number;
  readonly entryKind: EntryExprKind;
}

/**
 * Map entry expression.
 */
export interface MapEntry extends EntryExpr {
  readonly entryKind: EntryExprKind.MapEntry;
  readonly key: Expr;
  readonly value: Expr;
  readonly optional: boolean;
}

/**
 * Map creation expression.
 */
export interface MapExpr extends Expr {
  readonly kind: ExprKind.Map;
  readonly entries: readonly MapEntry[];
}

/**
 * Struct field initializer.
 */
export interface StructField extends EntryExpr {
  readonly entryKind: EntryExprKind.StructField;
  readonly name: string;
  readonly value: Expr;
  readonly optional: boolean;
}

/**
 * Struct/message creation expression.
 */
export interface StructExpr extends Expr {
  readonly kind: ExprKind.Struct;
  readonly typeName: string;
  readonly fields: readonly StructField[];
}

/**
 * Comprehension (fold) expression.
 * Represents operations like all(), exists(), map(), filter().
 */
export interface ComprehensionExpr extends Expr {
  readonly kind: ExprKind.Comprehension;
  /** Expression that evaluates to the iterable (list or map) */
  readonly iterRange: Expr;
  /** Iteration variable name */
  readonly iterVar: string;
  /** Second iteration variable name (for two-variable comprehensions, optional) */
  readonly iterVar2?: string;
  /** Accumulator variable name */
  readonly accuVar: string;
  /** Initial accumulator value */
  readonly accuInit: Expr;
  /** Loop condition (evaluated each iteration, continues while true) */
  readonly loopCondition: Expr;
  /** Loop step (updates the accumulator) */
  readonly loopStep: Expr;
  /** Result expression (evaluated after the loop) */
  readonly result: Expr;
}

/**
 * Union type for all expression types.
 */
export type AnyExpr =
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
// Type Guards
// ============================================================================

export function isLiteral(expr: Expr): expr is LiteralExpr {
  return expr.kind === ExprKind.Literal;
}

export function isIdent(expr: Expr): expr is IdentExpr {
  return expr.kind === ExprKind.Ident;
}

export function isSelect(expr: Expr): expr is SelectExpr {
  return expr.kind === ExprKind.Select;
}

export function isCall(expr: Expr): expr is CallExpr {
  return expr.kind === ExprKind.Call;
}

export function isList(expr: Expr): expr is ListExpr {
  return expr.kind === ExprKind.List;
}

export function isMap(expr: Expr): expr is MapExpr {
  return expr.kind === ExprKind.Map;
}

export function isStruct(expr: Expr): expr is StructExpr {
  return expr.kind === ExprKind.Struct;
}

export function isComprehension(expr: Expr): expr is ComprehensionExpr {
  return expr.kind === ExprKind.Comprehension;
}

export function isMapEntry(entry: EntryExpr): entry is MapEntry {
  return entry.entryKind === EntryExprKind.MapEntry;
}

export function isStructField(entry: EntryExpr): entry is StructField {
  return entry.entryKind === EntryExprKind.StructField;
}

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
 * Create a visitor that only visits expression nodes.
 */
export function createExprVisitor(fn: (expr: Expr) => void): Visitor {
  return {
    visitExpr: fn,
    visitEntryExpr: () => {},
  };
}

/**
 * Create a visitor that visits both expressions and entries.
 */
export function createVisitor(
  exprFn: (expr: Expr) => void,
  entryFn: (entry: EntryExpr) => void
): Visitor {
  return {
    visitExpr: exprFn,
    visitEntryExpr: entryFn,
  };
}

type VisitOrder = "pre" | "post";

/**
 * Internal visit implementation.
 */
function visit(
  expr: Expr,
  visitor: Visitor,
  order: VisitOrder,
  depth: number,
  maxDepth: number
): void {
  if (maxDepth > 0 && depth >= maxDepth) {
    return;
  }

  if (order === "pre") {
    visitor.visitExpr(expr);
  }

  // Visit children based on expression kind
  switch (expr.kind) {
    case ExprKind.Select: {
      const sel = expr as SelectExpr;
      visit(sel.operand, visitor, order, depth + 1, maxDepth);
      break;
    }
    case ExprKind.Call: {
      const call = expr as CallExpr;
      if (call.target) {
        visit(call.target, visitor, order, depth + 1, maxDepth);
      }
      for (const arg of call.args) {
        visit(arg, visitor, order, depth + 1, maxDepth);
      }
      break;
    }
    case ExprKind.List: {
      const list = expr as ListExpr;
      for (const elem of list.elements) {
        visit(elem, visitor, order, depth + 1, maxDepth);
      }
      break;
    }
    case ExprKind.Map: {
      const map = expr as MapExpr;
      for (const entry of map.entries) {
        visitor.visitEntryExpr(entry);
        visit(entry.key, visitor, order, depth + 1, maxDepth);
        visit(entry.value, visitor, order, depth + 1, maxDepth);
      }
      break;
    }
    case ExprKind.Struct: {
      const struct = expr as StructExpr;
      for (const field of struct.fields) {
        visitor.visitEntryExpr(field);
        visit(field.value, visitor, order, depth + 1, maxDepth);
      }
      break;
    }
    case ExprKind.Comprehension: {
      const comp = expr as ComprehensionExpr;
      visit(comp.iterRange, visitor, order, depth + 1, maxDepth);
      visit(comp.accuInit, visitor, order, depth + 1, maxDepth);
      visit(comp.loopCondition, visitor, order, depth + 1, maxDepth);
      visit(comp.loopStep, visitor, order, depth + 1, maxDepth);
      visit(comp.result, visitor, order, depth + 1, maxDepth);
      break;
    }
    // Literal, Ident, Unspecified have no children
  }

  if (order === "post") {
    visitor.visitExpr(expr);
  }
}

/**
 * Visit expression tree in post-order (bottom-up).
 */
export function postOrderVisit(expr: Expr, visitor: Visitor): void {
  visit(expr, visitor, "post", 0, 0);
}

/**
 * Visit expression tree in pre-order (top-down).
 */
export function preOrderVisit(expr: Expr, visitor: Visitor): void {
  visit(expr, visitor, "pre", 0, 0);
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
  postOrderVisit(
    expr,
    createExprVisitor((e) => {
      if (matcher(e)) {
        matches.push(e);
      }
    })
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
  return (e) => e.kind === ExprKind.Call && (e as CallExpr).function === funcName;
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
  postOrderVisit(
    expr,
    createVisitor(
      (e) => {
        if (e.id > max) max = e.id;
      },
      (entry) => {
        if (entry.id > max) max = entry.id;
      }
    )
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

/**
 * AST factory for creating expression nodes.
 */
export class ExprFactory {
  private nextIdCounter = 1;

  /**
   * Generate the next unique ID.
   */
  nextId(): number {
    return this.nextIdCounter++;
  }

  /**
   * Get current ID counter.
   */
  currentId(): number {
    return this.nextIdCounter;
  }

  /**
   * Set the next ID counter (used when resuming from a given ID).
   */
  setNextId(id: number): void {
    this.nextIdCounter = id;
  }

  /**
   * Create an unspecified expression (placeholder).
   */
  createUnspecified(id: number): Expr {
    return { id, kind: ExprKind.Unspecified };
  }

  /**
   * Create a literal expression.
   */
  createLiteral(id: number, value: LiteralValue): LiteralExpr {
    return { id, kind: ExprKind.Literal, value };
  }

  /**
   * Create a null literal.
   */
  createNullLiteral(id: number): LiteralExpr {
    return this.createLiteral(id, { kind: "null" });
  }

  /**
   * Create a boolean literal.
   */
  createBoolLiteral(id: number, value: boolean): LiteralExpr {
    return this.createLiteral(id, { kind: "bool", value });
  }

  /**
   * Create an integer literal.
   */
  createIntLiteral(id: number, value: bigint): LiteralExpr {
    return this.createLiteral(id, { kind: "int", value });
  }

  /**
   * Create an unsigned integer literal.
   */
  createUintLiteral(id: number, value: bigint): LiteralExpr {
    return this.createLiteral(id, { kind: "uint", value });
  }

  /**
   * Create a double literal.
   */
  createDoubleLiteral(id: number, value: number): LiteralExpr {
    return this.createLiteral(id, { kind: "double", value });
  }

  /**
   * Create a string literal.
   */
  createStringLiteral(id: number, value: string): LiteralExpr {
    return this.createLiteral(id, { kind: "string", value });
  }

  /**
   * Create a bytes literal.
   */
  createBytesLiteral(id: number, value: Uint8Array): LiteralExpr {
    return this.createLiteral(id, { kind: "bytes", value });
  }

  /**
   * Create an identifier expression.
   */
  createIdent(id: number, name: string): IdentExpr {
    return { id, kind: ExprKind.Ident, name };
  }

  /**
   * Create an accumulator identifier (shorthand).
   */
  createAccuIdent(id: number): IdentExpr {
    return this.createIdent(id, AccumulatorName);
  }

  /**
   * Create a select expression.
   */
  createSelect(id: number, operand: Expr, field: string): SelectExpr {
    return { id, kind: ExprKind.Select, operand, field, testOnly: false };
  }

  /**
   * Create a presence test expression (for has()).
   */
  createPresenceTest(id: number, operand: Expr, field: string): SelectExpr {
    return { id, kind: ExprKind.Select, operand, field, testOnly: true };
  }

  /**
   * Create a global function call.
   */
  createCall(id: number, fn: string, ...args: Expr[]): CallExpr {
    return { id, kind: ExprKind.Call, function: fn, args };
  }

  /**
   * Create a member function call.
   */
  createMemberCall(id: number, fn: string, target: Expr, ...args: Expr[]): CallExpr {
    return { id, kind: ExprKind.Call, function: fn, target, args };
  }

  /**
   * Create a list expression.
   */
  createList(id: number, elements: Expr[], optionalIndices: number[] = []): ListExpr {
    return { id, kind: ExprKind.List, elements, optionalIndices };
  }

  /**
   * Create a map entry.
   */
  createMapEntry(id: number, key: Expr, value: Expr, optional = false): MapEntry {
    return { id, entryKind: EntryExprKind.MapEntry, key, value, optional };
  }

  /**
   * Create a map expression.
   */
  createMap(id: number, entries: MapEntry[]): MapExpr {
    return { id, kind: ExprKind.Map, entries };
  }

  /**
   * Create a struct field.
   */
  createStructField(id: number, name: string, value: Expr, optional = false): StructField {
    return { id, entryKind: EntryExprKind.StructField, name, value, optional };
  }

  /**
   * Create a struct expression.
   */
  createStruct(id: number, typeName: string, fields: StructField[]): StructExpr {
    return { id, kind: ExprKind.Struct, typeName, fields };
  }

  /**
   * Create a comprehension expression.
   */
  createComprehension(
    id: number,
    iterRange: Expr,
    iterVar: string,
    accuVar: string,
    accuInit: Expr,
    loopCondition: Expr,
    loopStep: Expr,
    result: Expr
  ): ComprehensionExpr {
    return {
      id,
      kind: ExprKind.Comprehension,
      iterRange,
      iterVar,
      accuVar,
      accuInit,
      loopCondition,
      loopStep,
      result,
    };
  }

  /**
   * Create a two-variable comprehension expression.
   */
  createComprehensionTwoVar(
    id: number,
    iterRange: Expr,
    iterVar: string,
    iterVar2: string,
    accuVar: string,
    accuInit: Expr,
    loopCondition: Expr,
    loopStep: Expr,
    result: Expr
  ): ComprehensionExpr {
    return {
      id,
      kind: ExprKind.Comprehension,
      iterRange,
      iterVar,
      iterVar2,
      accuVar,
      accuInit,
      loopCondition,
      loopStep,
      result,
    };
  }

  /**
   * Get the accumulator variable name.
   */
  accuIdentName(): string {
    return AccumulatorName;
  }
}

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
