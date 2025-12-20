import type {
  AST,
  CallExpr,
  Expr,
  ListExpr,
  MapExpr,
  SelectExpr,
  StructExpr,
} from "../common/ast";
import { ExprKind } from "../common/ast";
import { Emitter } from "../common/emitter";
import { Operators } from "../parser/operators";

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
  /** Prefer formatting macro calls captured in SourceInfo. */
  preferMacroCalls?: boolean;
  /** Emit presence tests as has(operand.field). */
  printPresenceTestAsHas?: boolean;
}

const defaultFormatterOptions: Required<FormatterOptions> = {
  maxLineLength: 80,
  indentSize: 2,
  breakBinaryOperators: "logical",
  breakTernary: true,
  chainStyle: "auto",
  multilineCallArgs: "auto",
  multilineLiterals: "auto",
  preferMacroCalls: true,
  printPresenceTestAsHas: true,
};

export class Formatter {
  private readonly options: Required<FormatterOptions>;
  private readonly emitter: Emitter;

  constructor(options: FormatterOptions = {}) {
    this.options = { ...defaultFormatterOptions, ...options };
    this.emitter = new Emitter({
      preferMacroCalls: this.options.preferMacroCalls,
      printPresenceTestAsHas: this.options.printPresenceTestAsHas,
    });
  }

  format(ast: AST): string {
    return this.formatExpr(ast.expr, ast.sourceInfo, 0);
  }

  private formatExpr(
    expr: Expr,
    sourceInfo: AST["sourceInfo"] | undefined,
    indent: number
  ): string {
    const resolvedExpr = this.resolveMacroCall(expr, sourceInfo);
    const inline = this.emitter.emitExpr(resolvedExpr, sourceInfo);

    if (resolvedExpr.kind === ExprKind.Call) {
      const call = resolvedExpr as CallExpr;
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
      if (call.target) {
        const chain = this.collectChain(resolvedExpr);
        if (chain) {
          return this.formatChain(chain, sourceInfo, indent);
        }
      }
      return this.formatCall(call, sourceInfo, indent);
    }

    if (resolvedExpr.kind === ExprKind.Select) {
      const chain = this.collectChain(resolvedExpr);
      if (chain) {
        return this.formatChain(chain, sourceInfo, indent);
      }
    }

    if (resolvedExpr.kind === ExprKind.List) {
      return this.formatList(resolvedExpr as ListExpr, sourceInfo, indent);
    }

    if (resolvedExpr.kind === ExprKind.Map) {
      return this.formatMap(resolvedExpr as MapExpr, sourceInfo, indent);
    }

    if (resolvedExpr.kind === ExprKind.Struct) {
      return this.formatStruct(resolvedExpr as StructExpr, sourceInfo, indent);
    }

    return inline;
  }

  private formatBinary(
    expr: CallExpr,
    op: OperatorSpec,
    sourceInfo: AST["sourceInfo"] | undefined,
    indent: number
  ): string {
    const inline = this.emitter.emitExpr(expr, sourceInfo);
    const shouldBreakByRule =
      this.options.breakBinaryOperators === "all" ||
      (this.options.breakBinaryOperators === "logical" && op.logical);
    if (!shouldBreakByRule || inline.length <= this.options.maxLineLength) {
      return inline;
    }

    const left = op.logical
      ? this.emitter.emitExpr(expr.args[0]!, sourceInfo)
      : this.formatExpr(expr.args[0]!, sourceInfo, indent);
    const right = this.formatExpr(
      expr.args[1]!,
      sourceInfo,
      indent + this.options.indentSize
    );
    return `${left} ${op.symbol}\n${this.indentText(right, indent + this.options.indentSize)}`;
  }

  private formatTernary(
    expr: CallExpr,
    sourceInfo: AST["sourceInfo"] | undefined,
    indent: number
  ): string {
    const inline = this.emitter.emitExpr(expr, sourceInfo);
    if (!this.options.breakTernary || inline.length <= this.options.maxLineLength) {
      return inline;
    }

    const cond = this.formatExpr(expr.args[0]!, sourceInfo, indent);
    const truthy = this.formatExpr(
      expr.args[1]!,
      sourceInfo,
      indent + this.options.indentSize
    );
    const falsy = this.formatExpr(
      expr.args[2]!,
      sourceInfo,
      indent + this.options.indentSize
    );

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
    const inline = this.emitter.emitExpr(expr, sourceInfo);
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
        : this.emitter.emitExpr(arg, sourceInfo)
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
    const inline = this.emitter.emitExpr(expr, sourceInfo);
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
    const inline = this.emitter.emitExpr(expr, sourceInfo);
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
    const inline = this.emitter.emitExpr(expr, sourceInfo);
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
    const inline = this.emitter.emitExpr(chain.original, sourceInfo);
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
        lines.push(`${this.indentText(`.${segment.field}`, segmentIndent)}`);
        continue;
      }
      if (segment.kind === "call") {
        const callInline = this.emitCallInline(segment.expr, sourceInfo);
        const shouldBreak =
          this.options.multilineCallArgs === "always" ||
          (this.options.multilineCallArgs === "auto" &&
            callInline.length > this.options.maxLineLength);

        if (!shouldBreak || segment.expr.args.length === 0) {
          lines.push(
            `${this.indentText(
              `.${this.emitCallInline(segment.expr, sourceInfo)}`,
              segmentIndent
            )}`
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
        if (last) {
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
        const indexInline = this.emitter.emitExpr(segment.index, sourceInfo);
        if (indexInline.length <= this.options.maxLineLength) {
          lines.push(`${this.indentText(`[${indexInline}]`, segmentIndent)}`);
        } else {
          lines.push(`${this.indentText("[", segmentIndent)}`);
          lines.push(`${this.indentText(indexText, segmentIndent + this.options.indentSize)}`);
          lines.push(`${this.indentText("]", segmentIndent)}`);
        }
      }
    }

    return lines.join("\n");
  }

  private collectChain(expr: Expr): Chain | null {
    const segments: ChainSegment[] = [];
    let current: Expr = expr;

    while (true) {
      if (current.kind === ExprKind.Select) {
        const select = current as SelectExpr;
        if (select.testOnly) {
          break;
        }
        segments.unshift({ kind: "select", field: select.field });
        current = select.operand;
        continue;
      }

      if (current.kind === ExprKind.Call) {
        const call = current as CallExpr;
        const op = this.operatorFromName(call.funcName, call.args.length);
        if (op?.kind === "index") {
          segments.unshift({ kind: "index", index: call.args[1]! });
          current = call.args[0]!;
          continue;
        }
        if (call.target) {
          segments.unshift({ kind: "call", expr: call });
          current = call.target;
          continue;
        }
      }

      break;
    }

    if (segments.length === 0) {
      return null;
    }

    return { base: current, segments, original: expr };
  }

  private operatorFromName(name: string, argCount: number): OperatorSpec | null {
    if (name === Operators.Negate && argCount === 1) {
      return { kind: "unary", symbol: "-", precedence: 7, associative: true, logical: false };
    }
    if (name === Operators.LogicalNot && argCount === 1) {
      return { kind: "unary", symbol: "!", precedence: 7, associative: true, logical: false };
    }
    if (name === Operators.Index && argCount === 2) {
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
      [Operators.GreaterEquals]: { symbol: ">=", precedence: 4, associative: false, logical: false },
      [Operators.Equals]: { symbol: "==", precedence: 3, associative: false, logical: false },
      [Operators.NotEquals]: { symbol: "!=", precedence: 3, associative: false, logical: false },
      [Operators.In]: { symbol: "in", precedence: 3, associative: false, logical: false },
      [Operators.LogicalAnd]: { symbol: "&&", precedence: 2, associative: true, logical: true },
      [Operators.LogicalOr]: { symbol: "||", precedence: 1, associative: true, logical: true },
    };

    const entry = binaryMap[name];
    if (!entry || argCount !== 2) {
      return null;
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

  private resolveMacroCall(
    expr: Expr,
    sourceInfo: AST["sourceInfo"] | undefined
  ): Expr {
    if (!this.options.preferMacroCalls || !sourceInfo?.isMacroCall(expr.id)) {
      return expr;
    }

    const macroCall = sourceInfo.getMacroCall(expr.id);
    return macroCall ?? expr;
  }

  private emitCallInline(expr: CallExpr, sourceInfo: AST["sourceInfo"] | undefined): string {
    const args = expr.args.map((arg) => this.emitter.emitExpr(arg, sourceInfo)).join(", ");
    return `${expr.funcName}(${args})`;
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
  | { kind: "select"; field: string }
  | { kind: "call"; expr: CallExpr }
  | { kind: "index"; index: Expr };

type Chain = { base: Expr; segments: ChainSegment[]; original: Expr };
