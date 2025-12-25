// Visitor utilities for traversing AST nodes.

import type { EntryExpr, Expr } from "./ast";

// ---------------------------------------------------------------------------
// Visit Order
// ---------------------------------------------------------------------------

/** Order to visit nodes during traversal. */
export type VisitOrder = "pre" | "post";

// ---------------------------------------------------------------------------
// Visitor Interface
// ---------------------------------------------------------------------------

/**
 * Visitor interface for traversing AST nodes.
 */
export interface Visitor {
  /** Visit an expression node. */
  visitExpr(expr: Expr): void;
  /** Visit an entry expression (map entry or struct field). */
  visitEntryExpr(entry: EntryExpr): void;
}

// ---------------------------------------------------------------------------
// Visitor Implementations
// ---------------------------------------------------------------------------

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
  constructor(private readonly exprFunc: (expr: Expr) => void) {}

  visitExpr(expr: Expr): void {
    this.exprFunc(expr);
  }

  visitEntryExpr(_entry: EntryExpr): void {
    // Ignore entries
  }
}

/**
 * Visitor implementation that only handles entry nodes.
 */
export class EntryVisitor implements Visitor {
  constructor(private readonly entryFunc: (entry: EntryExpr) => void) {}

  visitExpr(_expr: Expr): void {
    // Ignore expressions
  }

  visitEntryExpr(entry: EntryExpr): void {
    this.entryFunc(entry);
  }
}

/**
 * Visitor implementation that handles both expressions and entries.
 */
export class CompositeVisitor implements Visitor {
  constructor(
    private readonly exprFunc: (expr: Expr) => void,
    private readonly entryFunc: (entry: EntryExpr) => void
  ) {}

  visitExpr(expr: Expr): void {
    this.exprFunc(expr);
  }

  visitEntryExpr(entry: EntryExpr): void {
    this.entryFunc(entry);
  }
}
