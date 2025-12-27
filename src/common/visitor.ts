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
