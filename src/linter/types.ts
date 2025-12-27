import type { AST, ExprId } from "../common/ast";
import type { SourceInfo } from "../common/source";

/**
 * Severity levels used by lint diagnostics.
 */
export type LintSeverity = "info" | "warning";

/**
 * Optional fix for a lint diagnostic.
 */
export type LintFix = {
  title: string;
  replacement: string;
};

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
  fix?: LintFix;
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
