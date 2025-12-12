// AST Rewriter
// Walks AST nodes and rebuilds modified subtrees.

import {
  AST,
  CallExpr,
  ComprehensionExpr,
  type Expr,
  IdentExpr,
  ListExpr,
  LiteralExpr,
  MapEntry,
  MapExpr,
  SelectExpr,
  StructExpr,
  StructField,
} from "./ast";

/**
 * Rewriter walks an AST and rebuilds any nodes that change.
 */
export class Rewriter {
  /**
   * Rewrite an AST by applying a transformation to each expression.
   */
  rewrite(ast: AST, rewriteExpr: (expr: Expr) => Expr): AST {
    const expr = this.rewriteExpr(ast.expr, rewriteExpr);
    if (expr === ast.expr) {
      return ast;
    }
    return new AST(expr, ast.sourceInfo, ast.typeMap, ast.refMap);
  }

  private rewriteExpr(expr: Expr, rewriteExpr: (expr: Expr) => Expr): Expr {
    const rewritten = rewriteExpr(expr);
    if (rewritten !== expr) {
      return rewritten;
    }
    if (expr instanceof LiteralExpr || expr instanceof IdentExpr) {
      return expr;
    }
    if (expr instanceof SelectExpr) {
      const operand = this.rewriteExpr(expr.operand, rewriteExpr);
      if (operand === expr.operand) {
        return expr;
      }
      return new SelectExpr(expr.id, operand, expr.field, expr.testOnly, expr.optional);
    }
    if (expr instanceof CallExpr) {
      const target = expr.target ? this.rewriteExpr(expr.target, rewriteExpr) : undefined;
      let changed = target !== expr.target;
      const args = expr.args.map((arg) => {
        const next = this.rewriteExpr(arg, rewriteExpr);
        if (next !== arg) {
          changed = true;
        }
        return next;
      });
      return changed ? new CallExpr(expr.id, expr.funcName, args, target) : expr;
    }
    if (expr instanceof ListExpr) {
      let changed = false;
      const elements = expr.elements.map((elem) => {
        const next = this.rewriteExpr(elem, rewriteExpr);
        if (next !== elem) {
          changed = true;
        }
        return next;
      });
      if (!changed) {
        return expr;
      }
      return new ListExpr(expr.id, elements, expr.optionalIndices);
    }
    if (expr instanceof MapExpr) {
      let changed = false;
      const entries = expr.entries.map((entry) => {
        const nextEntry = this.rewriteEntry(entry, rewriteExpr);
        if (nextEntry !== entry) {
          changed = true;
        }
        return nextEntry;
      });
      if (!changed) {
        return expr;
      }
      return new MapExpr(expr.id, entries);
    }
    if (expr instanceof StructExpr) {
      let changed = false;
      const fields = expr.fields.map((field) => {
        const nextField = this.rewriteField(field, rewriteExpr);
        if (nextField !== field) {
          changed = true;
        }
        return nextField;
      });
      if (!changed) {
        return expr;
      }
      return new StructExpr(expr.id, expr.typeName, fields);
    }
    if (expr instanceof ComprehensionExpr) {
      const iterRange = this.rewriteExpr(expr.iterRange, rewriteExpr);
      const accuInit = this.rewriteExpr(expr.accuInit, rewriteExpr);
      const loopCondition = this.rewriteExpr(expr.loopCondition, rewriteExpr);
      const loopStep = this.rewriteExpr(expr.loopStep, rewriteExpr);
      const result = this.rewriteExpr(expr.result, rewriteExpr);
      if (
        iterRange === expr.iterRange &&
        accuInit === expr.accuInit &&
        loopCondition === expr.loopCondition &&
        loopStep === expr.loopStep &&
        result === expr.result
      ) {
        return expr;
      }
      return new ComprehensionExpr({
        id: expr.id,
        iterRange,
        iterVar: expr.iterVar,
        iterVar2: expr.iterVar2,
        accuVar: expr.accuVar,
        accuInit,
        loopCondition,
        loopStep,
        result,
      });
    }
    return expr;
  }

  private rewriteEntry(entry: MapEntry, rewriteExpr: (expr: Expr) => Expr): MapEntry {
    const key = this.rewriteExpr(entry.key, rewriteExpr);
    const value = this.rewriteExpr(entry.value, rewriteExpr);
    if (key === entry.key && value === entry.value) {
      return entry;
    }
    return new MapEntry(entry.id, key, value, entry.optional);
  }

  private rewriteField(field: StructField, rewriteExpr: (expr: Expr) => Expr): StructField {
    const value = this.rewriteExpr(field.value, rewriteExpr);
    if (value === field.value) {
      return field;
    }
    return new StructField(field.id, field.name, value, field.optional);
  }
}
