import { Operators } from "../parser/operators";
import {
  AST,
  ExprKind,
  type CallExpr,
  type ComprehensionExpr,
  type Expr,
  type IdentExpr,
  type ListExpr,
  type LiteralExpr,
  type MapExpr,
  type SelectExpr,
  type StructExpr,
} from "./ast";

export interface EmitterOptions {
  /** Prefer formatting macro calls captured in SourceInfo. */
  preferMacroCalls?: boolean;
  /** Emit presence tests as has(operand.field). */
  printPresenceTestAsHas?: boolean;
}

const defaultEmitterOptions: Required<EmitterOptions> = {
  preferMacroCalls: true,
  printPresenceTestAsHas: true,
};

export class Emitter {
  private readonly options: Required<EmitterOptions>;

  constructor(options: EmitterOptions = {}) {
    this.options = { ...defaultEmitterOptions, ...options };
  }

  emitAst(ast: AST): string {
    return this.emitExpr(ast.expr, ast.sourceInfo);
  }

  emitExpr(expr: Expr, sourceInfo?: AST["sourceInfo"]): string {
    return this.emitExprInner(expr, sourceInfo);
  }

  private emitExprInner(expr: Expr, sourceInfo?: AST["sourceInfo"]): string {
    if (this.options.preferMacroCalls && sourceInfo?.isMacroCall(expr.id)) {
      const macroCall = sourceInfo.getMacroCall(expr.id);
      if (macroCall) {
        return this.emitExprInner(macroCall, sourceInfo);
      }
    }

    switch (expr.kind) {
      case ExprKind.Unspecified:
        return "_";
      case ExprKind.Literal:
        return this.emitLiteral(expr as LiteralExpr);
      case ExprKind.Ident:
        return (expr as IdentExpr).name;
      case ExprKind.Select:
        return this.emitSelect(expr as SelectExpr, sourceInfo);
      case ExprKind.Call:
        return this.emitCall(expr as CallExpr, sourceInfo);
      case ExprKind.List:
        return this.emitList(expr as ListExpr, sourceInfo);
      case ExprKind.Map:
        return this.emitMap(expr as MapExpr, sourceInfo);
      case ExprKind.Struct:
        return this.emitStruct(expr as StructExpr, sourceInfo);
      case ExprKind.Comprehension:
        return this.emitComprehension(expr as ComprehensionExpr, sourceInfo);
      default:
        return "_";
    }
  }

  private emitLiteral(expr: LiteralExpr): string {
    const { kind } = expr.value;
    switch (kind) {
      case "null":
        return "null";
      case "bool":
        return expr.value.value ? "true" : "false";
      case "int":
        return expr.value.value.toString();
      case "uint":
        return `${expr.value.value.toString()}u`;
      case "double":
        return Number.isFinite(expr.value.value)
          ? String(expr.value.value)
          : expr.value.value > 0
            ? "inf"
            : "-inf";
      case "string":
        return `"${this.escapeString(expr.value.value)}"`;
      case "bytes":
        return `b"${this.escapeString(this.bytesToString(expr.value.value))}"`;
    }
  }

  private emitSelect(expr: SelectExpr, sourceInfo?: AST["sourceInfo"]): string {
    if (expr.testOnly && this.options.printPresenceTestAsHas) {
      return `has(${this.emitExprInner(expr.operand, sourceInfo)}.${this.escapeIdent(expr.field)})`;
    }
    return `${this.emitExprInner(expr.operand, sourceInfo)}.${this.escapeIdent(expr.field)}`;
  }

  private emitCall(expr: CallExpr, sourceInfo?: AST["sourceInfo"]): string {
    const op = this.operatorFromName(expr.funcName, expr.args.length);
    if (op?.kind === "index") {
      const target = this.emitExprInner(expr.args[0]!, sourceInfo);
      const index = this.emitExprInner(expr.args[1]!, sourceInfo);
      return `${this.maybeWrap(target, expr.args[0]!, op)}[${index}]`;
    }
    if (op?.kind === "unary") {
      const inner = this.emitExprInner(expr.args[0]!, sourceInfo);
      return `${op.symbol}${this.maybeWrap(inner, expr.args[0]!, op)}`;
    }
    if (op?.kind === "binary") {
      const left = this.emitExprInner(expr.args[0]!, sourceInfo);
      const right = this.emitExprInner(expr.args[1]!, sourceInfo);
      return `${this.maybeWrap(left, expr.args[0]!, op)} ${op.symbol} ${this.maybeWrap(
        right,
        expr.args[1]!,
        op,
        "right"
      )}`;
    }
    if (op?.kind === "ternary") {
      const cond = this.emitExprInner(expr.args[0]!, sourceInfo);
      const t = this.emitExprInner(expr.args[1]!, sourceInfo);
      const f = this.emitExprInner(expr.args[2]!, sourceInfo);
      return `${cond} ? ${t} : ${f}`;
    }

    const args = expr.args.map((arg) => this.emitExprInner(arg, sourceInfo)).join(", ");
    if (expr.target) {
      return `${this.emitExprInner(expr.target, sourceInfo)}.${expr.funcName}(${args})`;
    }
    return `${expr.funcName}(${args})`;
  }

  private emitList(expr: ListExpr, sourceInfo?: AST["sourceInfo"]): string {
    const optional = new Set(expr.optionalIndices);
    const parts = expr.elements.map((elem, idx) => {
      const text = this.emitExprInner(elem, sourceInfo);
      return optional.has(idx) ? `${text}?` : text;
    });
    return `[${parts.join(", ")}]`;
  }

  private emitMap(expr: MapExpr, sourceInfo?: AST["sourceInfo"]): string {
    const entries = expr.entries.map((entry) => {
      const key = this.emitExprInner(entry.key, sourceInfo);
      const optional = entry.optional ? "?" : "";
      const value = this.emitExprInner(entry.value, sourceInfo);
      return `${key}${optional}: ${value}`;
    });
    return `{${entries.join(", ")}}`;
  }

  private emitStruct(expr: StructExpr, sourceInfo?: AST["sourceInfo"]): string {
    const fields = expr.fields.map((field) => {
      const name = this.escapeIdent(field.name);
      const optional = field.optional ? "?" : "";
      const value = this.emitExprInner(field.value, sourceInfo);
      return `${name}${optional}: ${value}`;
    });
    const body = `{${fields.join(", ")}}`;
    return expr.typeName ? `${expr.typeName}${body}` : body;
  }

  private emitComprehension(
    expr: ComprehensionExpr,
    sourceInfo?: AST["sourceInfo"]
  ): string {
    const iterRange = this.emitExprInner(expr.iterRange, sourceInfo);
    const accuInit = this.emitExprInner(expr.accuInit, sourceInfo);
    const loopCondition = this.emitExprInner(expr.loopCondition, sourceInfo);
    const loopStep = this.emitExprInner(expr.loopStep, sourceInfo);
    const result = this.emitExprInner(expr.result, sourceInfo);
    return `comprehension(${iterRange}, "${this.escapeString(expr.iterVar)}", "${this.escapeString(
      expr.accuVar
    )}", ${accuInit}, ${loopCondition}, ${loopStep}, ${result})`;
  }

  private operatorFromName(name: string, argCount: number): OperatorSpec | null {
    if (name === Operators.Negate && argCount === 1) {
      return { kind: "unary", symbol: "-", precedence: 7, associative: true };
    }
    if (name === Operators.LogicalNot && argCount === 1) {
      return { kind: "unary", symbol: "!", precedence: 7, associative: true };
    }
    if (name === Operators.Index && argCount === 2) {
      return { kind: "index", symbol: "[]", precedence: 9, associative: true };
    }
    if (name === Operators.Conditional && argCount === 3) {
      return { kind: "ternary", symbol: "?:", precedence: 1, associative: false };
    }

    const binaryMap: Record<
      string,
      { symbol: string; precedence: number; associative: boolean }
    > = {
      [Operators.Multiply]: { symbol: "*", precedence: 6, associative: true },
      [Operators.Divide]: { symbol: "/", precedence: 6, associative: false },
      [Operators.Modulo]: { symbol: "%", precedence: 6, associative: false },
      [Operators.Add]: { symbol: "+", precedence: 5, associative: true },
      [Operators.Subtract]: { symbol: "-", precedence: 5, associative: false },
      [Operators.Less]: { symbol: "<", precedence: 4, associative: false },
      [Operators.LessEquals]: { symbol: "<=", precedence: 4, associative: false },
      [Operators.Greater]: { symbol: ">", precedence: 4, associative: false },
      [Operators.GreaterEquals]: { symbol: ">=", precedence: 4, associative: false },
      [Operators.Equals]: { symbol: "==", precedence: 3, associative: false },
      [Operators.NotEquals]: { symbol: "!=", precedence: 3, associative: false },
      [Operators.In]: { symbol: "in", precedence: 3, associative: false },
      [Operators.LogicalAnd]: { symbol: "&&", precedence: 2, associative: true },
      [Operators.LogicalOr]: { symbol: "||", precedence: 1, associative: true },
    };

    const entry = binaryMap[name];
    if (!entry || argCount !== 2) {
      return null;
    }
    return { kind: "binary", ...entry };
  }

  private maybeWrap(
    text: string,
    expr: Expr,
    parent: { precedence: number; associative: boolean; kind: string },
    side: "left" | "right" = "left"
  ): string {
    const childPrecedence = this.getPrecedence(expr);
    if (childPrecedence === null) {
      return text;
    }
    if (childPrecedence < parent.precedence) {
      return `(${text})`;
    }
    if (childPrecedence === parent.precedence && side === "right" && !parent.associative) {
      return `(${text})`;
    }
    return text;
  }

  private getPrecedence(expr: Expr): number | null {
    if (expr.kind === ExprKind.Call) {
      const call = expr as CallExpr;
      const op = this.operatorFromName(call.funcName, call.args.length);
      return op?.precedence ?? 9;
    }
    if (expr.kind === ExprKind.Select) {
      return 9;
    }
    if (expr.kind === ExprKind.Comprehension) {
      return 0;
    }
    if (
      expr.kind === ExprKind.List ||
      expr.kind === ExprKind.Map ||
      expr.kind === ExprKind.Struct
    ) {
      return 9;
    }
    if (
      expr.kind === ExprKind.Literal ||
      expr.kind === ExprKind.Ident ||
      expr.kind === ExprKind.Unspecified
    ) {
      return 9;
    }
    return null;
  }

  private escapeString(value: string): string {
    return value
      .replace(/\\/g, "\\\\")
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/\t/g, "\\t")
      .replace(/"/g, "\\\"");
  }

  private escapeIdent(value: string): string {
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
      return value;
    }
    return `\`${value.replace(/`/g, "``")}\``;
  }

  private bytesToString(bytes: Uint8Array): string {
    try {
      return new TextDecoder().decode(bytes);
    } catch {
      return Array.from(bytes)
        .map((b) => String.fromCharCode(b))
        .join("");
    }
  }
}

type OperatorSpec = {
  kind: "unary" | "binary" | "ternary" | "index";
  symbol: string;
  precedence: number;
  associative: boolean;
};
