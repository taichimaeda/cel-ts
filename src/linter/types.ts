import type { AST, ExprId } from "../common/ast";
import type { SourceInfo } from "../common/source";

export type LintSeverity = "info" | "warning";

export type LintFix = {
  title: string;
  replacement: string;
};

export type LintLocation = {
  line: number;
  column: number;
};

export type LintDiagnostic = {
  exprId: ExprId;
  message: string;
  severity: LintSeverity;
  location?: LintLocation;
  fix?: LintFix;
};

export type LintContext = {
  sourceInfo?: SourceInfo;
  report: (diagnostic: LintDiagnostic) => void;
};

export type LintRule = {
  name: string;
  apply: (expr: AST["expr"], ctx: LintContext) => void;
};
