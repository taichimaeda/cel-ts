import { Env } from "../api";
import {
  type AST,
  CallExpr,
  ComprehensionExpr,
  type Expr,
  IdentExpr,
  ListExpr,
  LiteralExpr,
  MapExpr,
  Operators,
  SelectExpr,
  StructExpr,
} from "../common/ast";

/**
 * Options controlling CEL formatting output.
 */
export interface FormatterOptions {
  /** Maximum line length before formatting switches to multiline. */
  maxLineLength?: number;
  /** Number of spaces to indent when breaking lines. */
  indentSize?: number;
  /** Break binary operators: none, logical-only, or all. */
  breakBinaryOperators?: "none" | "logical" | "all";
  /** Allow ternary formatting to break across multiple lines. */
  breakTernary?: boolean;
  /** Format chained member access and calls inline, vertically, or auto. */
  chainStyle?: "inline" | "vertical" | "auto";
  /** Format call arguments inline, multiline, or auto. */
  multilineCallArgs?: "never" | "always" | "auto";
  /** Format list/map/struct literals inline, multiline, or auto. */
  multilineLiterals?: "never" | "always" | "auto";
}

const defaultFormatterOptions: Required<FormatterOptions> = {
  maxLineLength: 80,
  indentSize: 2,
  breakBinaryOperators: "logical",
  breakTernary: true,
  chainStyle: "auto",
  multilineCallArgs: "auto",
  multilineLiterals: "auto",
};

/**
 * Formatter pretty-prints CEL expressions.
 */
export class Formatter {
  private readonly options: Required<FormatterOptions>;

  constructor(options: FormatterOptions = {}) {
    this.options = { ...defaultFormatterOptions, ...options };
  }

  /**
   * Parse and format a CEL source expression.
   */
  format(source: string): string {
    const env = new Env({ disableTypeChecking: true });
    const root = env.parse(source).root;
    return this.formatExpr(root.expr, root.sourceInfo, 0);
  }

  private formatExpr(
    expr: Expr,
    sourceInfo: AST["sourceInfo"] | undefined,
    indent: number
  ): string {
    const resolvedExpr = this.resolveMacroCall(expr, sourceInfo);
    const inline = this.formatInlineExpr(resolvedExpr, sourceInfo);

    if (resolvedExpr instanceof CallExpr) {
      const call = resolvedExpr;
      const op = this.operatorFromName(call.funcName, call.args.length);
      if (op?.kind === "ternary") {
        return this.formatTernary(call, sourceInfo, indent);
      }
      if (op?.kind === "binary") {
        return this.formatBinary(call, op, sourceInfo, indent);
      }
      if (op?.kind === "unary" || op?.kind === "index") {
        return inline;
      }
      if (call.target !== undefined) {
        const chain = this.collectChain(resolvedExpr);
        if (chain !== undefined) {
          return this.formatChain(chain, sourceInfo, indent);
        }
      }
      return this.formatCall(call, sourceInfo, indent);
    }

    if (resolvedExpr instanceof SelectExpr) {
      const chain = this.collectChain(resolvedExpr);
      if (chain !== undefined) {
        return this.formatChain(chain, sourceInfo, indent);
      }
    }

    if (resolvedExpr instanceof ListExpr) {
      return this.formatList(resolvedExpr, sourceInfo, indent);
    }

    if (resolvedExpr instanceof MapExpr) {
      return this.formatMap(resolvedExpr, sourceInfo, indent);
    }

    if (resolvedExpr instanceof StructExpr) {
      return this.formatStruct(resolvedExpr, sourceInfo, indent);
    }

    return inline;
  }

  private formatBinary(
    expr: CallExpr,
    op: OperatorSpec,
    sourceInfo: AST["sourceInfo"] | undefined,
    indent: number
  ): string {
    const inline = this.formatInlineExpr(expr, sourceInfo);
    const shouldBreakByRule =
      this.options.breakBinaryOperators === "all" ||
      (this.options.breakBinaryOperators === "logical" && op.logical);
    if (!shouldBreakByRule || inline.length <= this.options.maxLineLength) {
      return inline;
    }

    const left = op.logical
      ? this.formatInlineExpr(expr.args[0]!, sourceInfo)
      : this.formatExpr(expr.args[0]!, sourceInfo, indent);
    const right = this.formatExpr(expr.args[1]!, sourceInfo, indent + this.options.indentSize);
    return `${left} ${op.symbol}\n${this.indentText(right, indent + this.options.indentSize)}`;
  }

  private formatTernary(
    expr: CallExpr,
    sourceInfo: AST["sourceInfo"] | undefined,
    indent: number
  ): string {
    const inline = this.formatInlineExpr(expr, sourceInfo);
    if (!this.options.breakTernary || inline.length <= this.options.maxLineLength) {
      return inline;
    }

    const cond = this.formatExpr(expr.args[0]!, sourceInfo, indent);
    const truthy = this.formatExpr(expr.args[1]!, sourceInfo, indent + this.options.indentSize);
    const falsy = this.formatExpr(expr.args[2]!, sourceInfo, indent + this.options.indentSize);

    return `${cond}\n${this.formatTernaryBranch("?", truthy, indent)}\n${this.formatTernaryBranch(
      ":",
      falsy,
      indent
    )}`;
  }

  private formatCall(
    expr: CallExpr,
    sourceInfo: AST["sourceInfo"] | undefined,
    indent: number
  ): string {
    const inline = this.formatInlineExpr(expr, sourceInfo);
    const shouldBreak =
      this.options.multilineCallArgs === "always" ||
      (this.options.multilineCallArgs === "auto" && inline.length > this.options.maxLineLength);

    if (!shouldBreak) {
      return inline;
    }

    if (expr.args.length === 0) {
      return `${expr.funcName}()`;
    }

    const argIndent = indent + this.options.indentSize;
    const args = expr.args.map((arg) =>
      this.options.multilineCallArgs === "always"
        ? this.formatExpr(arg, sourceInfo, argIndent)
        : this.formatInlineExpr(arg, sourceInfo)
    );
    return `${expr.funcName}(\n${args
      .map((arg) => this.indentText(arg, argIndent))
      .join(",\n")}\n${this.indentText(")", indent)}`;
  }

  private formatList(
    expr: ListExpr,
    sourceInfo: AST["sourceInfo"] | undefined,
    indent: number
  ): string {
    const inline = this.formatInlineExpr(expr, sourceInfo);
    const shouldBreak =
      this.options.multilineLiterals === "always" ||
      (this.options.multilineLiterals === "auto" &&
        inline.length > this.options.maxLineLength &&
        expr.elements.length > 0);

    if (!shouldBreak) {
      return inline;
    }

    const optional = new Set(expr.optionalIndices);
    const itemIndent = indent + this.options.indentSize;
    const parts = expr.elements.map((elem, idx) => {
      const text = this.formatExpr(elem, sourceInfo, itemIndent);
      return optional.has(idx) ? `${text}?` : text;
    });

    return `[\n${parts
      .map((part) => this.indentText(part, itemIndent))
      .join(",\n")}\n${this.indentText("]", indent)}`;
  }

  private formatMap(
    expr: MapExpr,
    sourceInfo: AST["sourceInfo"] | undefined,
    indent: number
  ): string {
    const inline = this.formatInlineExpr(expr, sourceInfo);
    const shouldBreak =
      this.options.multilineLiterals === "always" ||
      (this.options.multilineLiterals === "auto" &&
        inline.length > this.options.maxLineLength &&
        expr.entries.length > 0);

    if (!shouldBreak) {
      return inline;
    }

    const itemIndent = indent + this.options.indentSize;
    const parts = expr.entries.map((entry) => {
      const key = this.formatExpr(entry.key, sourceInfo, itemIndent);
      const value = this.formatExpr(entry.value, sourceInfo, itemIndent);
      const optional = entry.optional ? "?" : "";
      return `${key}${optional}: ${value}`;
    });

    return `{\n${parts
      .map((part) => this.indentText(part, itemIndent))
      .join(",\n")}\n${this.indentText("}", indent)}`;
  }

  private formatStruct(
    expr: StructExpr,
    sourceInfo: AST["sourceInfo"] | undefined,
    indent: number
  ): string {
    const inline = this.formatInlineExpr(expr, sourceInfo);
    const shouldBreak =
      this.options.multilineLiterals === "always" ||
      (this.options.multilineLiterals === "auto" &&
        inline.length > this.options.maxLineLength &&
        expr.fields.length > 0);

    if (!shouldBreak) {
      return inline;
    }

    const itemIndent = indent + this.options.indentSize;
    const parts = expr.fields.map((field) => {
      const value = this.formatExpr(field.value, sourceInfo, itemIndent);
      const optional = field.optional ? "?" : "";
      return `${field.name}${optional}: ${value}`;
    });

    const body = `{\n${parts
      .map((part) => this.indentText(part, itemIndent))
      .join(",\n")}\n${this.indentText("}", indent)}`;
    return expr.typeName ? `${expr.typeName}${body}` : body;
  }

  private formatChain(
    chain: Chain,
    sourceInfo: AST["sourceInfo"] | undefined,
    indent: number
  ): string {
    const inline = this.formatInlineExpr(chain.original, sourceInfo);
    if (
      this.options.chainStyle === "inline" ||
      (this.options.chainStyle === "auto" && inline.length <= this.options.maxLineLength)
    ) {
      return inline;
    }

    const base = this.formatExpr(chain.base, sourceInfo, indent);
    const lines = [base];
    const segmentIndent = indent + this.options.indentSize;

    for (const segment of chain.segments) {
      if (segment.kind === "select") {
        const op = segment.optional ? "?." : ".";
        lines.push(`${this.indentText(`${op}${segment.field}`, segmentIndent)}`);
        continue;
      }
      if (segment.kind === "call") {
        const callInline = this.formatInlineCall(segment.expr, sourceInfo);
        const shouldBreak =
          this.options.multilineCallArgs === "always" ||
          (this.options.multilineCallArgs === "auto" &&
            callInline.length > this.options.maxLineLength);

        if (!shouldBreak || segment.expr.args.length === 0) {
          lines.push(
            `${this.indentText(`.${this.formatInlineCall(segment.expr, sourceInfo)}`, segmentIndent)}`
          );
          continue;
        }

        lines.push(`${this.indentText(`.${segment.expr.funcName}(`, segmentIndent)}`);
        const argIndent = segmentIndent + this.options.indentSize;
        for (const arg of segment.expr.args) {
          const formatted = this.formatExpr(arg, sourceInfo, argIndent);
          lines.push(`${this.indentText(formatted, argIndent)},`);
        }
        const last = lines.pop();
        if (last !== undefined) {
          lines.push(last.replace(/,$/, ""));
        }
        lines.push(`${this.indentText(")", segmentIndent)}`);
        continue;
      }
      if (segment.kind === "index") {
        const indexText = this.formatExpr(
          segment.index,
          sourceInfo,
          segmentIndent + this.options.indentSize
        );
        const indexInline = this.formatInlineExpr(segment.index, sourceInfo);
        const prefix = segment.optional ? "[?" : "[";
        const suffix = "]";
        if (indexInline.length <= this.options.maxLineLength) {
          lines.push(`${this.indentText(`${prefix}${indexInline}${suffix}`, segmentIndent)}`);
        } else {
          lines.push(`${this.indentText(prefix, segmentIndent)}`);
          lines.push(`${this.indentText(indexText, segmentIndent + this.options.indentSize)}`);
          lines.push(`${this.indentText(suffix, segmentIndent)}`);
        }
      }
    }

    return lines.join("\n");
  }

  private collectChain(expr: Expr): Chain | undefined {
    const segments: ChainSegment[] = [];
    let current: Expr = expr;

    while (true) {
      if (current instanceof SelectExpr) {
        const select = current;
        if (select.testOnly) {
          break;
        }
        segments.unshift({ kind: "select", field: select.field, optional: select.optional });
        current = select.operand;
        continue;
      }

      if (current instanceof CallExpr) {
        const call = current;
        const op = this.operatorFromName(call.funcName, call.args.length);
        if (op?.kind === "index") {
          segments.unshift({
            kind: "index",
            index: call.args[1]!,
            optional: call.funcName === Operators.OptIndex,
          });
          current = call.args[0]!;
          continue;
        }
        if (call.target !== undefined) {
          segments.unshift({ kind: "call", expr: call });
          current = call.target;
          continue;
        }
      }

      break;
    }

    if (segments.length === 0) {
      return undefined;
    }

    return { base: current, segments, original: expr };
  }

  private operatorFromName(name: string, argCount: number): OperatorSpec | undefined {
    if (name === Operators.Negate && argCount === 1) {
      return { kind: "unary", symbol: "-", precedence: 7, associative: true, logical: false };
    }
    if (name === Operators.LogicalNot && argCount === 1) {
      return { kind: "unary", symbol: "!", precedence: 7, associative: true, logical: false };
    }
    if ((name === Operators.Index || name === Operators.OptIndex) && argCount === 2) {
      return { kind: "index", symbol: "[]", precedence: 9, associative: true, logical: false };
    }
    if (name === Operators.Conditional && argCount === 3) {
      return { kind: "ternary", symbol: "?:", precedence: 1, associative: false, logical: false };
    }

    const binaryMap: Record<string, Omit<OperatorSpec, "kind">> = {
      [Operators.Multiply]: { symbol: "*", precedence: 6, associative: true, logical: false },
      [Operators.Divide]: { symbol: "/", precedence: 6, associative: false, logical: false },
      [Operators.Modulo]: { symbol: "%", precedence: 6, associative: false, logical: false },
      [Operators.Add]: { symbol: "+", precedence: 5, associative: true, logical: false },
      [Operators.Subtract]: { symbol: "-", precedence: 5, associative: false, logical: false },
      [Operators.Less]: { symbol: "<", precedence: 4, associative: false, logical: false },
      [Operators.LessEquals]: { symbol: "<=", precedence: 4, associative: false, logical: false },
      [Operators.Greater]: { symbol: ">", precedence: 4, associative: false, logical: false },
      [Operators.GreaterEquals]: {
        symbol: ">=",
        precedence: 4,
        associative: false,
        logical: false,
      },
      [Operators.Equals]: { symbol: "==", precedence: 3, associative: false, logical: false },
      [Operators.NotEquals]: { symbol: "!=", precedence: 3, associative: false, logical: false },
      [Operators.In]: { symbol: "in", precedence: 3, associative: false, logical: false },
      [Operators.LogicalAnd]: { symbol: "&&", precedence: 2, associative: true, logical: true },
      [Operators.LogicalOr]: { symbol: "||", precedence: 1, associative: true, logical: true },
    };

    const entry = binaryMap[name];
    if (entry === undefined || argCount !== 2) {
      return undefined;
    }
    return { kind: "binary", ...entry };
  }

  private indentText(text: string, indent: number): string {
    const prefix = " ".repeat(indent);
    return text
      .split("\n")
      .map((line) => (line.length > 0 ? `${prefix}${line}` : line))
      .join("\n");
  }

  private formatTernaryBranch(marker: "?" | ":", value: string, indent: number): string {
    const lines = value.split("\n");
    const first = `${marker} ${lines[0] ?? ""}`;
    const output = [this.indentText(first, indent + this.options.indentSize)];

    for (const line of lines.slice(1)) {
      output.push(this.indentText(line, indent));
    }

    return output.join("\n");
  }

  private resolveMacroCall(expr: Expr, sourceInfo: AST["sourceInfo"] | undefined): Expr {
    if (!sourceInfo?.isMacroCall(expr.id)) {
      return expr;
    }

    const macroCall = sourceInfo.getMacroCall(expr.id);
    return macroCall ?? expr;
  }

  private formatInlineCall(expr: CallExpr, sourceInfo: AST["sourceInfo"] | undefined): string {
    const args = expr.args.map((arg) => this.formatInlineExpr(arg, sourceInfo)).join(", ");
    return `${expr.funcName}(${args})`;
  }

  private formatInlineExpr(expr: Expr, sourceInfo?: AST["sourceInfo"]): string {
    return this.formatInlineExprInner(expr, sourceInfo);
  }

  private formatInlineExprInner(expr: Expr, sourceInfo?: AST["sourceInfo"]): string {
    if (sourceInfo?.isMacroCall(expr.id)) {
      const macroCall = sourceInfo.getMacroCall(expr.id);
      if (macroCall !== undefined) {
        return this.formatInlineExprInner(macroCall, sourceInfo);
      }
    }

    if (expr instanceof ListExpr) {
      return this.formatInlineList(expr, sourceInfo);
    }
    if (expr instanceof MapExpr) {
      return this.formatInlineMap(expr, sourceInfo);
    }
    if (expr instanceof StructExpr) {
      return this.formatInlineStruct(expr, sourceInfo);
    }
    if (expr instanceof SelectExpr) {
      return this.formatInlineSelect(expr, sourceInfo);
    }
    if (expr instanceof CallExpr) {
      return this.formatInlineCallExpr(expr, sourceInfo);
    }
    if (expr instanceof LiteralExpr) {
      return this.formatInlineLiteral(expr);
    }
    if (expr instanceof IdentExpr) {
      return expr.name;
    }
    if (expr instanceof ComprehensionExpr) {
      return this.formatInlineComprehension(expr, sourceInfo);
    }
    return "_";
  }

  private formatInlineLiteral(expr: LiteralExpr): string {
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
      default:
        return "_";
    }
  }

  private formatInlineSelect(expr: SelectExpr, sourceInfo?: AST["sourceInfo"]): string {
    if (expr.testOnly) {
      const operator = expr.optional ? "?." : ".";
      return `has(${this.formatInlineExprInner(expr.operand, sourceInfo)}${operator}${this.escapeIdent(
        expr.field
      )})`;
    }
    const operator = expr.optional ? "?." : ".";
    return `${this.formatInlineExprInner(expr.operand, sourceInfo)}${operator}${this.escapeIdent(
      expr.field
    )}`;
  }

  private formatInlineCallExpr(expr: CallExpr, sourceInfo?: AST["sourceInfo"]): string {
    const op = this.operatorFromName(expr.funcName, expr.args.length);
    if (expr.funcName === Operators.OptIndex && expr.args.length === 2) {
      const target = this.formatInlineExprInner(expr.args[0]!, sourceInfo);
      const index = this.formatInlineExprInner(expr.args[1]!, sourceInfo);
      return `${this.parenthesizeExpr(target, expr.args[0]!, op!)}[?${index}]`;
    }
    if (op?.kind === "index") {
      const target = this.formatInlineExprInner(expr.args[0]!, sourceInfo);
      const index = this.formatInlineExprInner(expr.args[1]!, sourceInfo);
      return `${this.parenthesizeExpr(target, expr.args[0]!, op)}[${index}]`;
    }
    if (op?.kind === "unary") {
      const inner = this.formatInlineExprInner(expr.args[0]!, sourceInfo);
      return `${op.symbol}${this.parenthesizeExpr(inner, expr.args[0]!, op)}`;
    }
    if (op?.kind === "binary") {
      const left = this.formatInlineExprInner(expr.args[0]!, sourceInfo);
      const right = this.formatInlineExprInner(expr.args[1]!, sourceInfo);
      return `${this.parenthesizeExpr(left, expr.args[0]!, op)} ${op.symbol} ${this.parenthesizeExpr(
        right,
        expr.args[1]!,
        op,
        "right"
      )}`;
    }
    if (op?.kind === "ternary") {
      const cond = this.formatInlineExprInner(expr.args[0]!, sourceInfo);
      const truthyText = this.formatInlineExprInner(expr.args[1]!, sourceInfo);
      const falsyText = this.formatInlineExprInner(expr.args[2]!, sourceInfo);
      return `${cond} ? ${truthyText} : ${falsyText}`;
    }

    const args = expr.args.map((arg) => this.formatInlineExprInner(arg, sourceInfo)).join(", ");
    if (expr.target) {
      return `${this.formatInlineExprInner(expr.target, sourceInfo)}.${expr.funcName}(${args})`;
    }
    return `${expr.funcName}(${args})`;
  }

  private formatInlineList(expr: ListExpr, sourceInfo?: AST["sourceInfo"]): string {
    const optional = new Set(expr.optionalIndices);
    const parts = expr.elements.map((elem, idx) => {
      const text = this.formatInlineExprInner(elem, sourceInfo);
      return optional.has(idx) ? `${text}?` : text;
    });
    return `[${parts.join(", ")}]`;
  }

  private formatInlineMap(expr: MapExpr, sourceInfo?: AST["sourceInfo"]): string {
    const entries = expr.entries.map((entry) => {
      const key = this.formatInlineExprInner(entry.key, sourceInfo);
      const optional = entry.optional ? "?" : "";
      const value = this.formatInlineExprInner(entry.value, sourceInfo);
      return `${key}${optional}: ${value}`;
    });
    return `{${entries.join(", ")}}`;
  }

  private formatInlineStruct(expr: StructExpr, sourceInfo?: AST["sourceInfo"]): string {
    const fields = expr.fields.map((field) => {
      const name = this.escapeIdent(field.name);
      const optional = field.optional ? "?" : "";
      const value = this.formatInlineExprInner(field.value, sourceInfo);
      return `${name}${optional}: ${value}`;
    });
    const body = `{${fields.join(", ")}}`;
    return expr.typeName ? `${expr.typeName}${body}` : body;
  }

  private formatInlineComprehension(
    expr: ComprehensionExpr,
    sourceInfo?: AST["sourceInfo"]
  ): string {
    const iterRange = this.formatInlineExprInner(expr.iterRange, sourceInfo);
    const accuInit = this.formatInlineExprInner(expr.accuInit, sourceInfo);
    const loopCondition = this.formatInlineExprInner(expr.loopCondition, sourceInfo);
    const loopStep = this.formatInlineExprInner(expr.loopStep, sourceInfo);
    const result = this.formatInlineExprInner(expr.result, sourceInfo);
    const args = [
      iterRange,
      `"${this.escapeString(expr.iterVar)}"`,
      ...(expr.iterVar2 ? [`"${this.escapeString(expr.iterVar2)}"`] : []),
      `"${this.escapeString(expr.accuVar)}"`,
      accuInit,
      loopCondition,
      loopStep,
      result,
    ];
    return `comprehension(${args.join(", ")})`;
  }

  private getPrecedence(expr: Expr): number | undefined {
    switch (expr.kind) {
      case "call": {
        const call = expr as CallExpr;
        const op = this.operatorFromName(call.funcName, call.args.length);
        return op?.precedence ?? 9;
      }
      case "comprehension":
        return 0;
      case "select":
      case "list":
      case "map":
      case "struct":
      case "literal":
      case "ident":
      case "unspecified":
        return 9;
      default:
        return undefined;
    }
  }

  private parenthesizeExpr(
    text: string,
    expr: Expr,
    parent: { precedence: number; associative: boolean },
    side: "left" | "right" = "left"
  ): string {
    const childPrecedence = this.getPrecedence(expr);
    if (childPrecedence === undefined) {
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

  private escapeString(value: string): string {
    return value
      .replace(/\\/g, "\\\\")
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/\t/g, "\\t")
      .replace(/"/g, '\\"');
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
  logical: boolean;
};

type ChainSegment =
  | { kind: "select"; field: string; optional: boolean }
  | { kind: "call"; expr: CallExpr }
  | { kind: "index"; index: Expr; optional: boolean };

type Chain = { base: Expr; segments: ChainSegment[]; original: Expr };
