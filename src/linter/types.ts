import type { AST, ExprId } from "../common/ast";
import type { SourceInfo } from "../common/source";

/**
 * Severity levels used by lint diagnostics.
 */
export type LintSeverity = "info" | "warning";

/**
 * Source location for a diagnostic.
 */
export type LintLocation = {
  line: number;
  column: number;
};

/**
 * Reported lint issue for an expression.
 */
export type LintDiagnostic = {
  exprId: ExprId;
  message: string;
  severity: LintSeverity;
  location?: LintLocation;
};

/**
 * Lint context passed to rules.
 */
export type LintContext = {
  sourceInfo?: SourceInfo;
  report: (diagnostic: LintDiagnostic) => void;
};

/**
 * Lint rule implementation.
 */
export type LintRule = {
  name: string;
  apply: (expr: AST["expr"], ctx: LintContext) => void;
};
