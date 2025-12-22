import { CallExpr, type Expr, Operators } from "../common/ast";
import { isBoolLiteral, isLogicalNot } from "../common/utils";
import type { LintContext, LintRule } from "./types";

function applyBoolShortCircuit(expr: Expr, ctx: LintContext): void {
  if (!(expr instanceof CallExpr)) return;
  const op = expr.funcName;
  if (op !== Operators.LogicalAnd && op !== Operators.LogicalOr) return;
  if (expr.args.length < 2) return;

  const left = isBoolLiteral(expr.args[0]!);
  const right = isBoolLiteral(expr.args[1]!);

  if (left !== undefined) {
    const message =
      op === Operators.LogicalOr
        ? left
          ? "Left side is true, expression always true."
          : "Left side is false, expression is equivalent to right side."
        : left
          ? "Left side is true, expression is equivalent to right side."
          : "Left side is false, expression always false.";
    ctx.report({ exprId: expr.id, message, severity: "warning" });
    return;
  }

  if (right !== undefined) {
    const message =
      op === Operators.LogicalOr
        ? right
          ? "Right side is true, expression always true."
          : "Right side is false, expression is equivalent to left side."
        : right
          ? "Right side is true, expression is equivalent to left side."
          : "Right side is false, expression always false.";
    ctx.report({ exprId: expr.id, message, severity: "warning" });
  }
}

function applyConstantTernary(expr: Expr, ctx: LintContext): void {
  if (!(expr instanceof CallExpr)) return;
  if (expr.funcName !== Operators.Conditional) return;
  if (expr.args.length !== 3) return;
  const condition = isBoolLiteral(expr.args[0]!);
  if (condition === undefined) return;
  const message = condition
    ? "Ternary condition is always true; expression is equivalent to true branch."
    : "Ternary condition is always false; expression is equivalent to false branch.";
  ctx.report({ exprId: expr.id, message, severity: "warning" });
}

function applyDoubleNegation(expr: Expr, ctx: LintContext): void {
  if (!isLogicalNot(expr)) return;
  const inner = expr.args[0];
  if (!inner || !isLogicalNot(inner)) return;
  ctx.report({
    exprId: expr.id,
    message: "Double negation can be removed.",
    severity: "info",
  });
}

export const defaultRules: LintRule[] = [
  {
    name: "bool-short-circuit",
    apply: applyBoolShortCircuit,
  },
  {
    name: "constant-ternary",
    apply: applyConstantTernary,
  },
  {
    name: "double-negation",
    apply: applyDoubleNegation,
  },
];
