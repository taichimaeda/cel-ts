import type { AST } from "../common/ast";
import type { SourceInfo } from "../common/source";
import { ExprVisitor, VisitOrder } from "../common/visitor";
import { defaultRules } from "./rules";
import type { LintContext, LintDiagnostic, LintLocation, LintRule } from "./types";

export type { LintContext, LintDiagnostic, LintFix, LintRule, LintSeverity } from "./types";

export class Linter {
  constructor(private readonly rules: readonly LintRule[] = defaultRules) { }

  lint(ast: AST): LintDiagnostic[] {
    const diagnostics: LintDiagnostic[] = [];
    const ctx: LintContext = {
      sourceInfo: ast.sourceInfo,
      report: (diagnostic) => {
        diagnostics.push(this.decorateLocation(diagnostic, ast.sourceInfo));
      },
    };

    const visitor = new ExprVisitor((expr) => {
      for (const rule of this.rules) {
        rule.apply(expr, ctx);
      }
    });
    ast.expr.accept(visitor, VisitOrder.Pre);

    return diagnostics;
  }

  private decorateLocation(
    diagnostic: LintDiagnostic,
    sourceInfo: SourceInfo | undefined
  ): LintDiagnostic {
    if (!sourceInfo) {
      return diagnostic;
    }
    const range = sourceInfo.getPosition(diagnostic.exprId);
    if (!range) {
      return diagnostic;
    }
    const start = sourceInfo.getLocation(range.start);
    const location: LintLocation = { line: start.line, column: start.column };
    return { ...diagnostic, location };
  }
}
