// Visitor utilities for traversing AST nodes.

import type { EntryExpr, Expr } from "./ast";

/** Order to visit nodes during traversal. */
export enum VisitOrder {
  Pre = "pre",
  Post = "post",
}

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
