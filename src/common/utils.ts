import { CallExpr, type Expr, LiteralExpr, Operators } from "./ast";

/**
 * Return the literal boolean value if the expression is a bool literal.
 */
export function isBoolLiteral(expr: Expr): boolean | undefined {
  if (expr instanceof LiteralExpr && expr.value.kind === "bool") {
    return expr.value.value;
  }
  return undefined;
}

/**
 * Check if the expression is a logical not call.
 */
export function isLogicalNot(expr: Expr): expr is CallExpr {
  return expr instanceof CallExpr && expr.funcName === Operators.LogicalNot;
}
