// CEL Optimizer Pass
// Constant folding for calls with literal arguments.

import type { AST } from "../../common/ast";
import {
  CallExpr,
  type Expr,
  type ExprId,
  LiteralExpr,
  type LiteralValue,
  Operators,
} from "../../common/ast";
import { Rewriter } from "../../common/rewriter";
import type { PreOptimizerPass } from "../optimizer";

/**
 * Pre-plan pass that folds constant call expressions into literals.
 */
export class ConstantCallFoldPass implements PreOptimizerPass {
  private readonly rewriter = new Rewriter();

  /**
   * Fold constant call expressions within the AST.
   *
   * @example
   * ```ts
   * // !true -> false
   * // 1 + 2 -> 3
   * // "a" == "b" -> false
   * ```
   */
  run(ast: AST): AST {
    return this.rewriter.rewrite(ast, (expr) => this.tryFoldCall(expr));
  }

  private tryFoldCall(expr: Expr): Expr {
    if (!(expr instanceof CallExpr)) {
      return expr;
    }
    const args = expr.args;
    if (expr.funcName === Operators.LogicalNot && args.length === 1) {
      const argExpr = args[0];
      if (!argExpr) {
        return expr;
      }
      const arg = this.asLiteralBool(argExpr);
      if (arg !== undefined) {
        return this.boolLiteral(expr.id, !arg);
      }
    }
    if (args.length === 2) {
      const lhs = args[0];
      const rhs = args[1];
      if (!lhs || !rhs) {
        return expr;
      }
      if (expr.funcName === Operators.Equals) {
        const eq = this.equalsLiteral(lhs, rhs);
        if (eq !== undefined) {
          return this.boolLiteral(expr.id, eq);
        }
      }
      if (expr.funcName === Operators.NotEquals) {
        const eq = this.equalsLiteral(lhs, rhs);
        if (eq !== undefined) {
          return this.boolLiteral(expr.id, !eq);
        }
      }
      const numeric = this.binaryNumericLiteral(expr.id, expr.funcName, lhs, rhs);
      if (numeric) {
        return numeric;
      }
    }
    return expr;
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

  private boolLiteral(id: ExprId, value: boolean): LiteralExpr {
    return new LiteralExpr(id, { kind: "bool", value });
  }

  private equalsLiteral(lhs: Expr, rhs: Expr): boolean | undefined {
    const left = this.asLiteral(lhs);
    const right = this.asLiteral(rhs);
    if (!left || !right) {
      return undefined;
    }
    if (this.isLiteralNull(left) && this.isLiteralNull(right)) {
      return true;
    }
    if (this.isLiteralBool(left) && this.isLiteralBool(right)) {
      return left.value === right.value;
    }
    if (this.isLiteralDouble(left) && this.isLiteralDouble(right)) {
      return left.value === right.value;
    }
    if (this.isLiteralString(left) && this.isLiteralString(right)) {
      return left.value === right.value;
    }
    if (this.isLiteralInt(left) && this.isLiteralInt(right)) {
      return left.value === right.value;
    }
    if (this.isLiteralUint(left) && this.isLiteralUint(right)) {
      return left.value === right.value;
    }
    return undefined;
  }

  private binaryNumericLiteral(
    id: ExprId,
    op: string,
    lhs: Expr,
    rhs: Expr
  ): LiteralExpr | undefined {
    const left = this.asLiteral(lhs);
    const right = this.asLiteral(rhs);
    if (!left || !right || left.kind !== right.kind) {
      return undefined;
    }
    if (this.isLiteralDouble(left) && this.isLiteralDouble(right)) {
      const result = this.applyNumberOp(op, left.value, right.value);
      return result === undefined
        ? undefined
        : new LiteralExpr(id, { kind: "double", value: result });
    }
    return undefined;
  }

  private applyNumberOp(op: string, lhs: number, rhs: number): number | undefined {
    switch (op) {
      case Operators.Add:
        return lhs + rhs;
      case Operators.Subtract:
        return lhs - rhs;
      case Operators.Multiply:
        return lhs * rhs;
      default:
        return undefined;
    }
  }

  private isLiteralNull(value: LiteralValue): value is { kind: "null" } {
    return value.kind === "null";
  }

  private isLiteralBool(value: LiteralValue): value is { kind: "bool"; value: boolean } {
    return value.kind === "bool";
  }

  private isLiteralDouble(value: LiteralValue): value is { kind: "double"; value: number } {
    return value.kind === "double";
  }

  private isLiteralString(value: LiteralValue): value is { kind: "string"; value: string } {
    return value.kind === "string";
  }

  private isLiteralInt(value: LiteralValue): value is { kind: "int"; value: bigint } {
    return value.kind === "int";
  }

  private isLiteralUint(value: LiteralValue): value is { kind: "uint"; value: bigint } {
    return value.kind === "uint";
  }
}
