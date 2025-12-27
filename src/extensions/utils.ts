import { type Expr, IdentExpr, SelectExpr } from "../common/ast";

/**
 * Check whether a macro target expression matches a namespace prefix.
 */
export function macroTargetMatchesNamespace(namespace: string, target: Expr | undefined): boolean {
  if (target === undefined) return false;
  if (target instanceof IdentExpr) {
    return target.name === namespace;
  }
  if (target instanceof SelectExpr) {
    const base = target.operand;
    if (base instanceof IdentExpr && base.name === namespace) {
      return true;
    }
  }
  return false;
}

/**
 * Extract an identifier name from an expression if available.
 */
export function extractIdentName(expr: Expr | undefined): string | undefined {
  if (expr instanceof IdentExpr) {
    return expr.name;
  }
  return undefined;
}
