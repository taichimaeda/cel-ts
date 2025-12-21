import { CallExpr, LiteralExpr, Operators, type Expr } from "./ast";

export function isBoolLiteral(expr: Expr): boolean | undefined {
  if (expr instanceof LiteralExpr && expr.value.kind === "bool") {
    return expr.value.value;
  }
  return undefined;
}

export function isLogicalNot(expr: Expr): expr is CallExpr {
  return expr instanceof CallExpr && expr.funcName === Operators.LogicalNot;
}
