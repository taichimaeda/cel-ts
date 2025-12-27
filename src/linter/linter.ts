import { Env } from "../cel";
import type { SourceInfo } from "../common/source";
import { ExprVisitor } from "../common/visitor";
import { defaultRules } from "./rules";
import type { LintContext, LintDiagnostic, LintLocation, LintRule } from "./types";

/**
 * Public linter type exports.
 */
export type { LintContext, LintDiagnostic, LintFix, LintRule, LintSeverity } from "./types";

/**
 * Linter runs CEL lint rules over an AST.
 */
export class Linter {
  constructor(private readonly rules: readonly LintRule[] = defaultRules) { }

  /**
   * Parse and lint a CEL source expression.
   */
  lint(source: string): LintDiagnostic[] {
    const env = new Env({ disableTypeChecking: true });
    const root = env.parse(source).root;
    const diagnostics: LintDiagnostic[] = [];
    const ctx: LintContext = {
      sourceInfo: root.sourceInfo,
      report: (diagnostic) => {
        diagnostics.push(this.decorateLocation(diagnostic, root.sourceInfo));
      },
    };

    const visitor = new ExprVisitor((expr) => {
      for (const rule of this.rules) {
        rule.apply(expr, ctx);
      }
    });
    root.expr.accept(visitor, "pre");

    return diagnostics;
  }

  private decorateLocation(
    diagnostic: LintDiagnostic,
    sourceInfo: SourceInfo | undefined
  ): LintDiagnostic {
    if (sourceInfo === undefined) {
      return diagnostic;
    }
    const range = sourceInfo.getPosition(diagnostic.exprId);
    if (range === undefined) {
      return diagnostic;
    }
    const start = sourceInfo.getLocation(range.start);
    const location: LintLocation = { line: start.line, column: start.column };
    return { ...diagnostic, location };
  }
}
