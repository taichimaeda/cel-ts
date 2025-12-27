// CEL Optimizer Pass
// Fold conditional expressions with literal conditions and branches.

import type { AST } from "../../common/ast";
import { CallExpr, type Expr, LiteralExpr, type LiteralValue, Operators } from "../../common/ast";
import { Rewriter } from "../../common/rewriter";
import type { PreOptimizerPass } from "../optimizer";

/**
 * Pre-plan pass that folds constant conditional expressions.
 */
export class ConstantCondFoldPass implements PreOptimizerPass {
  private readonly rewriter = new Rewriter();

  /**
   * Fold conditional expressions with literal branches.
   *
   * @example
   * ```ts
   * // true ? "a" : "b" -> "a"
   * // false ? 1 : 2 -> 2
   * ```
   */
  run(ast: AST): AST {
    return this.rewriter.rewrite(ast, (expr) => this.tryFoldConditional(expr));
  }

  private tryFoldConditional(expr: Expr): Expr {
    if (!(expr instanceof CallExpr)) {
      return expr;
    }
    if (expr.funcName !== Operators.Conditional || expr.args.length !== 3) {
      return expr;
    }
    const condExpr = expr.args[0];
    const trueExpr = expr.args[1];
    const falseExpr = expr.args[2];
    if (!condExpr || !trueExpr || !falseExpr) {
      return expr;
    }
    const cond = this.asLiteralBool(condExpr);
    if (cond === undefined) {
      return expr;
    }
    const chosen = cond ? trueExpr : falseExpr;
    const literal = this.asLiteral(chosen);
    if (!literal) {
      return expr;
    }
    return new LiteralExpr(expr.id, literal);
  }

  private asLiteral(expr: Expr): LiteralValue | undefined {
    return expr instanceof LiteralExpr ? expr.value : undefined;
  }

  private asLiteralBool(expr: Expr): boolean | undefined {
    const literal = this.asLiteral(expr);
    if (literal?.kind === "bool") {
      return literal.value;
    }
    return undefined;
  }
}
