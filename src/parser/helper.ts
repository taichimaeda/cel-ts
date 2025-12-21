// CEL Parser Helper
// Converts ANTLR parse tree to CEL AST with macro expansion
// Ported from cel-go/parser/helper.go

import type { ParserRuleContext, TerminalNode } from "antlr4";
import {
  AST,
  AccumulatorName,
  CallExpr,
  ComprehensionExpr,
  type Expr,
  ExprId,
  IdentExpr,
  ListExpr,
  LiteralExpr,
  MapEntry,
  MapExpr,
  SelectExpr,
  StructExpr,
  StructField,
  UnspecifiedExpr,
} from "../common/ast";
import { SourceInfo } from "../common/source";
import {
  BoolFalseContext,
  BoolTrueContext,
  BytesContext,
  type CalcContext,
  type ConditionalAndContext,
  type ConditionalOrContext,
  ConstantLiteralContext,
  CreateListContext,
  CreateMessageContext,
  CreateStructContext,
  DoubleContext,
  type EscapeIdentContext,
  type ExprContext,
  GlobalCallContext,
  IdentContext,
  IndexContext,
  IntContext,
  LogicalNotContext,
  MemberCallContext,
  type MemberContext,
  MemberExprContext,
  NegateContext,
  NestedContext,
  NullContext,
  type PrimaryContext,
  PrimaryExprContext,
  type RelationContext,
  SelectContext,
  type StartContext,
  StringContext,
  UintContext,
  type UnaryContext
} from "./gen/CELParser.js";
import { AllMacros, type Macro, MacroError, MacroRegistry } from "./macro";
import { Operators } from "./operator";

/**
 * Options for the parser helper.
 */
export interface ParserHelperOptions {
  /** Macros to use (defaults to AllMacros) */
  macros?: Macro[];
  /** Whether to populate macro call info in source info */
  populateMacroCalls?: boolean;
}

/**
 * Parser helper that converts ANTLR parse tree to CEL AST.
 */
export class ParserHelper {
  private nextIdCounter: ExprId = 1;
  private readonly sourceInfo: SourceInfo;
  private readonly macroRegistry: MacroRegistry;
  private readonly populateMacroCalls: boolean;

  constructor(source: string, options: ParserHelperOptions = {}) {
    this.sourceInfo = new SourceInfo(source);
    this.macroRegistry = new MacroRegistry(options.macros ?? AllMacros);
    this.populateMacroCalls = options.populateMacroCalls ?? true;
  }

  /**
   * Parse a StartContext and produce an AST.
   */
  parse(tree: StartContext): AST {
    const exprCtx = tree.expr();
    if (!exprCtx) {
      // Empty expression
      const expr = this.createUnspecified();
      return new AST(expr, this.sourceInfo);
    }
    const expr = this.buildExpr(exprCtx);
    return new AST(expr, this.sourceInfo);
  }

  // ============================================================================
  // Builder methods used by macro expansion
  // ============================================================================

  nextId(): ExprId {
    return this.nextIdCounter++;
  }

  createUnspecified(): Expr {
    return new UnspecifiedExpr(this.nextId());
  }

  createLiteral(value: boolean | bigint | number | string | null): Expr {
    const id = this.nextId();
    if (value === null) {
      return new LiteralExpr(id, { kind: "null" });
    }
    if (typeof value === "boolean") {
      return new LiteralExpr(id, { kind: "bool", value });
    }
    if (typeof value === "bigint") {
      return new LiteralExpr(id, { kind: "int", value });
    }
    if (typeof value === "number") {
      return new LiteralExpr(id, { kind: "double", value });
    }
    return new LiteralExpr(id, { kind: "string", value });
  }

  createIdent(name: string): IdentExpr {
    return new IdentExpr(this.nextId(), name);
  }

  createCall(fn: string, ...args: Expr[]): CallExpr {
    return new CallExpr(this.nextId(), fn, args);
  }

  createMemberCall(fn: string, target: Expr, ...args: Expr[]): CallExpr {
    return new CallExpr(this.nextId(), fn, args, target);
  }

  createList(...elements: Expr[]): ListExpr {
    return new ListExpr(this.nextId(), elements, []);
  }

  createComprehension(
    iterRange: Expr,
    iterVar: string,
    accuVar: string,
    accuInit: Expr,
    loopCondition: Expr,
    loopStep: Expr,
    result: Expr
  ): ComprehensionExpr {
    return new ComprehensionExpr(
      this.nextId(),
      iterRange,
      iterVar,
      accuVar,
      accuInit,
      loopCondition,
      loopStep,
      result
    );
  }

  createAccuIdent(): IdentExpr {
    return this.createIdent(AccumulatorName);
  }

  createPresenceTest(operand: Expr, field: string): SelectExpr {
    return new SelectExpr(this.nextId(), operand, field, true);
  }

  createError(ctx: ParserRuleContext, message: string): Expr {
    // Create an error placeholder expression
    // In a full implementation, we'd collect errors
    console.error(`Parse error at ${ctx.start?.line}:${ctx.start?.column}: ${message}`);
    const expr = this.createUnspecified();
    this.setPosition(expr.id, ctx);
    return expr;
  }

  // ============================================================================
  // AST Building from ANTLR contexts
  // ============================================================================

  private buildExpr(ctx: ExprContext): Expr {
    const conditionalOr = ctx.conditionalOr(0);
    if (!conditionalOr) {
      return this.createError(ctx, "missing expression");
    }

    let result = this.buildConditionalOr(conditionalOr);

    // Check for ternary expression: e ? e1 : e2
    const questionMark = ctx.QUESTIONMARK();
    if (questionMark) {
      const trueExpr = ctx.conditionalOr(1);
      const falseExpr = ctx.expr();
      if (!trueExpr || !falseExpr) {
        return this.createError(ctx, "invalid ternary expression");
      }

      const id = this.nextId();
      const trueBranch = this.buildConditionalOr(trueExpr);
      const falseBranch = this.buildExpr(falseExpr);

      result = new CallExpr(id, Operators.Conditional, [result, trueBranch, falseBranch]);
      this.setPosition(id, ctx);
    }

    return result;
  }

  private buildConditionalOr(ctx: ConditionalOrContext): Expr {
    const andExprs = ctx.conditionalAnd_list();
    if (andExprs.length === 0) {
      return this.createError(ctx, "missing conditionalAnd");
    }

    let result = this.buildConditionalAnd(andExprs[0]!);

    for (const andExpr of andExprs.slice(1)) {
      const id = this.nextId();
      const right = this.buildConditionalAnd(andExpr!);
      result = new CallExpr(id, Operators.LogicalOr, [result, right]);
    }

    return result;
  }

  private buildConditionalAnd(ctx: ConditionalAndContext): Expr {
    const relations = ctx.relation_list();
    if (relations.length === 0) {
      return this.createError(ctx, "missing relation");
    }

    let result = this.buildRelation(relations[0]!);

    for (const relation of relations.slice(1)) {
      const id = this.nextId();
      const right = this.buildRelation(relation!);
      result = new CallExpr(id, Operators.LogicalAnd, [result, right]);
    }

    return result;
  }

  private buildRelation(ctx: RelationContext): Expr {
    const calcCtx = ctx.calc();
    if (calcCtx) {
      return this.buildCalc(calcCtx);
    }

    const relations = ctx.relation_list();
    if (relations.length !== 2) {
      return this.createError(ctx, "invalid relation");
    }

    const left = this.buildRelation(relations[0]!);
    const right = this.buildRelation(relations[1]!);
    const id = this.nextId();

    // Determine operator
    const op = this.getRelationOp(ctx);
    if (!op) {
      return this.createError(ctx, "invalid relation operator");
    }
    const result = new CallExpr(id, op, [left, right]);
    this.setPosition(id, ctx);
    return result;
  }

  private getRelationOp(ctx: RelationContext): string | null {
    if (ctx.LESS()) return Operators.Less;
    if (ctx.LESS_EQUALS()) return Operators.LessEquals;
    if (ctx.GREATER()) return Operators.Greater;
    if (ctx.GREATER_EQUALS()) return Operators.GreaterEquals;
    if (ctx.EQUALS()) return Operators.Equals;
    if (ctx.NOT_EQUALS()) return Operators.NotEquals;
    if (ctx.IN()) return Operators.In;
    return null;
  }

  private buildCalc(ctx: CalcContext): Expr {
    const unaryCtx = ctx.unary();
    if (unaryCtx) {
      return this.buildUnary(unaryCtx);
    }

    // Binary calc expression
    const calcs = ctx.calc_list();
    if (calcs.length !== 2) {
      return this.createError(ctx, "invalid calc");
    }

    const left = this.buildCalc(calcs[0]!);
    const right = this.buildCalc(calcs[1]!);
    const id = this.nextId();

    // Determine operator
    const op = this.getCalcOp(ctx);
    if (!op) {
      return this.createError(ctx, "invalid calc operator");
    }
    const result = new CallExpr(id, op, [left, right]);
    this.setPosition(id, ctx);
    return result;
  }

  private getCalcOp(ctx: CalcContext): string | null {
    if (ctx.STAR()) return Operators.Multiply;
    if (ctx.SLASH()) return Operators.Divide;
    if (ctx.PERCENT()) return Operators.Modulo;
    if (ctx.PLUS()) return Operators.Add;
    if (ctx.MINUS()) return Operators.Subtract;
    return null;
  }

  private buildUnary(ctx: UnaryContext): Expr {
    if (ctx instanceof MemberExprContext) {
      return this.buildMember(ctx.member());
    }

    if (ctx instanceof LogicalNotContext) {
      const inner = this.buildMember(ctx.member());
      const id = this.nextId();
      // Handle multiple consecutive ! operators
      let result = inner;
      const notCount = ctx.EXCLAM_list().length;
      for (let i = 0; i < notCount; i++) {
        result = new CallExpr(this.nextId(), Operators.LogicalNot, [result]);
      }
      this.setPosition(id, ctx);
      return result;
    }

    if (ctx instanceof NegateContext) {
      const inner = this.buildMember(ctx.member());
      const id = this.nextId();
      // Handle multiple consecutive - operators
      let result = inner;
      const negCount = ctx.MINUS_list().length;
      for (let i = 0; i < negCount; i++) {
        result = new CallExpr(this.nextId(), Operators.Negate, [result]);
      }
      this.setPosition(id, ctx);
      return result;
    }

    return this.createError(ctx, "unknown unary expression");
  }

  private buildMember(ctx: MemberContext): Expr {
    if (ctx instanceof PrimaryExprContext) {
      return this.buildPrimary(ctx.primary());
    }

    // SelectContext: member.field or member?.field
    if (ctx instanceof SelectContext) {
      const operand = this.buildMember(ctx.member());
      const id = this.nextId();

      // Get the field name from escapeIdent()
      const escapeIdentCtx = ctx.escapeIdent();
      if (!escapeIdentCtx) {
        return this.createError(ctx, "missing field name");
      }
      const field = this.getEscapeIdentName(escapeIdentCtx);

      if (ctx.QUESTIONMARK() !== null) {
        return this.createError(ctx, "optional field access (?.) is not supported");
      }

      const result = new SelectExpr(id, operand, field, false);
      this.setPosition(id, ctx);
      return result;
    }

    // MemberCallContext: member.method(args)
    if (ctx instanceof MemberCallContext) {
      const target = this.buildMember(ctx.member());
      const id = this.nextId();

      // Get method name - MemberCallContext has IDENTIFIER() not escapeIdent()
      const identToken = ctx.IDENTIFIER();
      if (!identToken) {
        return this.createError(ctx, "missing method name");
      }
      const methodName = identToken.getText();

      // Build arguments
      const exprList = ctx.exprList();
      const args = exprList ? exprList.expr_list().map((e) => this.buildExpr(e)) : [];

      // Try macro expansion first
      const expanded = this.expandMacro(id, methodName, target, args);
      if (expanded) {
        return expanded;
      }

      const result = new CallExpr(id, methodName, args, target);
      this.setPosition(id, ctx);
      return result;
    }

    // IndexContext: member[index]
    if (ctx instanceof IndexContext) {
      const operand = this.buildMember(ctx.member());
      const id = this.nextId();
      const index = this.buildExpr(ctx.expr());

      if (ctx.QUESTIONMARK() !== null) {
        return this.createError(ctx, "optional index access ([?]) is not supported");
      }

      const result = new CallExpr(id, Operators.Index, [operand, index]);
      this.setPosition(id, ctx);
      return result;
    }

    return this.createError(ctx, "unknown member expression");
  }

  private buildPrimary(ctx: PrimaryContext): Expr {
    // IdentContext
    if (ctx instanceof IdentContext) {
      const id = this.nextId();
      const leadingDot = ctx.DOT() !== null;
      // IdentContext has IDENTIFIER() not escapeIdent()
      const identToken = ctx.IDENTIFIER();
      if (!identToken) {
        return this.createError(ctx, "missing identifier");
      }
      let name = identToken.getText();
      if (leadingDot) {
        name = "." + name;
      }
      const result = new IdentExpr(id, name);
      this.setPosition(id, ctx);
      return result;
    }

    // NestedContext: (expr)
    if (ctx instanceof NestedContext) {
      return this.buildExpr(ctx.expr());
    }

    // GlobalCallContext: function(args)
    if (ctx instanceof GlobalCallContext) {
      const id = this.nextId();
      const leadingDot = ctx.DOT() !== null;
      // GlobalCallContext has IDENTIFIER() not escapeIdent()
      const identToken = ctx.IDENTIFIER();
      if (!identToken) {
        return this.createError(ctx, "missing function name");
      }
      let functionName = identToken.getText();
      if (leadingDot) {
        functionName = "." + functionName;
      }

      // Build arguments
      const exprList = ctx.exprList();
      const args = exprList ? exprList.expr_list().map((e) => this.buildExpr(e)) : [];

      // Try macro expansion first (global macros like has())
      const expanded = this.expandMacro(id, functionName, null, args);
      if (expanded) {
        return expanded;
      }

      const result = new CallExpr(id, functionName, args);
      this.setPosition(id, ctx);
      return result;
    }

    // CreateListContext: [...]
    if (ctx instanceof CreateListContext) {
      return this.buildCreateList(ctx);
    }

    // CreateStructContext: {...}
    if (ctx instanceof CreateStructContext) {
      return this.buildCreateStruct(ctx);
    }

    // CreateMessageContext: TypeName{...}
    if (ctx instanceof CreateMessageContext) {
      return this.buildCreateMessage(ctx);
    }

    // ConstantLiteralContext
    if (ctx instanceof ConstantLiteralContext) {
      return this.buildLiteral(ctx);
    }

    return this.createError(ctx, "unknown primary expression");
  }

  private buildCreateList(ctx: CreateListContext): Expr {
    const id = this.nextId();
    const listInit = ctx.listInit();

    if (!listInit) {
      const result = new ListExpr(id, [], []);
      this.setPosition(id, ctx);
      return result;
    }

    const elements: Expr[] = [];
    const optionalIndices: number[] = [];
    const optExprs = listInit.optExpr_list();

    for (let i = 0; i < optExprs.length; i++) {
      const optExpr = optExprs[i]!;
      const expr = this.buildExpr(optExpr.expr());
      elements.push(expr);

      // Check for optional marker (?)
      if (optExpr.QUESTIONMARK()) {
        optionalIndices.push(i);
      }
    }

    const result = new ListExpr(id, elements, optionalIndices);
    this.setPosition(id, ctx);
    return result;
  }

  private buildCreateStruct(ctx: CreateStructContext): Expr {
    const id = this.nextId();
    const mapInit = ctx.mapInitializerList();

    if (!mapInit) {
      const result = new MapExpr(id, []);
      this.setPosition(id, ctx);
      return result;
    }

    const entries: MapEntry[] = [];
    const keys = mapInit.optExpr_list(); // Keys are OptExprContext
    const values = mapInit.expr_list(); // Values are ExprContext

    // Keys and values are stored in separate lists
    for (let i = 0; i < keys.length; i++) {
      const keyOptExpr = keys[i];
      const valueExpr = values[i];

      if (!keyOptExpr || !valueExpr) continue;

      const key = this.buildExpr(keyOptExpr.expr());
      const value = this.buildExpr(valueExpr);
      const optional = keyOptExpr.QUESTIONMARK() !== null;
      const entryId = this.nextId();

      entries.push(new MapEntry(entryId, key, value, optional));
    }

    const result = new MapExpr(id, entries);
    this.setPosition(id, ctx);
    return result;
  }

  private buildCreateMessage(ctx: CreateMessageContext): Expr {
    const id = this.nextId();

    // Get type name (possibly qualified) - uses IDENTIFIER_list()
    const leadingDot = ctx.DOT(0) !== null;
    const identParts = ctx.IDENTIFIER_list();
    if (identParts.length === 0) {
      return this.createError(ctx, "missing message name");
    }
    let typeName = identParts.map((part: TerminalNode) => part.getText()).join(".");
    if (leadingDot) {
      typeName = "." + typeName;
    }

    const fieldInit = ctx.fieldInitializerList();
    if (!fieldInit) {
      const result = new StructExpr(id, typeName, []);
      this.setPosition(id, ctx);
      return result;
    }

    // FieldInitializerListContext has optField_list() and expr_list() as separate arrays
    const fields: StructField[] = [];
    const optFields = fieldInit.optField_list();
    const exprs = fieldInit.expr_list();

    for (let i = 0; i < optFields.length; i++) {
      const optField = optFields[i]!;
      const fieldIdent = optField.escapeIdent();
      if (!fieldIdent) {
        this.createError(optField, "missing field name");
        continue;
      }
      const fieldName = this.getEscapeIdentName(fieldIdent);
      const fieldExpr = exprs[i]
        ? this.buildExpr(exprs[i]!)
        : this.createError(ctx, "missing field value");
      const optional = optField.QUESTIONMARK() !== null;
      const fieldId = this.nextId();

      fields.push(new StructField(fieldId, fieldName, fieldExpr, optional));
    }

    const result = new StructExpr(id, typeName, fields);
    this.setPosition(id, ctx);
    return result;
  }

  private buildLiteral(ctx: ConstantLiteralContext): Expr {
    const literal = ctx.literal();
    const id = this.nextId();

    if (literal instanceof IntContext) {
      const value = this.parseIntLiteral(literal.getText());
      const result = new LiteralExpr(id, { kind: "int", value });
      this.setPosition(id, ctx);
      return result;
    }

    if (literal instanceof UintContext) {
      const text = literal.getText();
      // Remove trailing 'u' or 'U'
      const value = this.parseUintLiteral(text.slice(0, -1));
      const result = new LiteralExpr(id, { kind: "uint", value });
      this.setPosition(id, ctx);
      return result;
    }

    if (literal instanceof DoubleContext) {
      const value = this.parseDoubleLiteral(literal.getText());
      const result = new LiteralExpr(id, { kind: "double", value });
      this.setPosition(id, ctx);
      return result;
    }

    if (literal instanceof StringContext) {
      const value = this.parseStringLiteral(literal.getText());
      const result = new LiteralExpr(id, { kind: "string", value });
      this.setPosition(id, ctx);
      return result;
    }

    if (literal instanceof BytesContext) {
      const value = this.parseBytesLiteral(literal.getText());
      const result = new LiteralExpr(id, { kind: "bytes", value });
      this.setPosition(id, ctx);
      return result;
    }

    if (literal instanceof BoolTrueContext) {
      const result = new LiteralExpr(id, { kind: "bool", value: true });
      this.setPosition(id, ctx);
      return result;
    }

    if (literal instanceof BoolFalseContext) {
      const result = new LiteralExpr(id, { kind: "bool", value: false });
      this.setPosition(id, ctx);
      return result;
    }

    if (literal instanceof NullContext) {
      const result = new LiteralExpr(id, { kind: "null" });
      this.setPosition(id, ctx);
      return result;
    }

    return this.createError(ctx, "unknown literal type");
  }

  // ============================================================================
  // Macro expansion
  // ============================================================================

  private expandMacro(
    callId: ExprId,
    functionName: string,
    target: Expr | null,
    args: Expr[]
  ): Expr | null {
    const receiverStyle = target !== null;
    const argCount = args.length;

    const macro = this.macroRegistry.findMacro(functionName, argCount, receiverStyle);
    if (!macro) {
      return null;
    }

    try {
      const expanded = macro.expander(this, target, args);
      if (expanded && this.populateMacroCalls) {
        // Record the original call expression for unparsing
        const originalCall = receiverStyle
          ? new CallExpr(callId, functionName, args, target!)
          : new CallExpr(callId, functionName, args);
        this.sourceInfo.setMacroCall(expanded.id, originalCall);
      }
      return expanded;
    } catch (e) {
      if (e instanceof MacroError) {
        // Return an error placeholder - in a real implementation we'd report this properly
        return null;
      }
      throw e;
    }
  }

  // ============================================================================
  // Helper methods
  // ============================================================================

  private getEscapeIdentName(ctx: EscapeIdentContext): string {
    // Get text and remove backticks if present (for escaped identifiers)
    const text = ctx.getText();
    return text.replace(/^`|`$/g, "");
  }

  private setPosition(id: ExprId, ctx: ParserRuleContext): void {
    const start = ctx.start?.start ?? 0;
    const stop = ctx.stop?.stop ?? start;
    this.sourceInfo.setPosition(id, { start, end: stop + 1 });
  }

  // ============================================================================
  // Literal parsing
  // ============================================================================

  private parseIntLiteral(text: string): bigint {
    // Handle hex (0x...), octal (0...), and decimal
    if (text.startsWith("0x") || text.startsWith("0X")) {
      return BigInt(text);
    }
    if (text.startsWith("0") && text.length > 1 && !text.includes(".")) {
      // Octal
      return BigInt("0o" + text.slice(1));
    }
    return BigInt(text);
  }

  private parseUintLiteral(text: string): bigint {
    return this.parseIntLiteral(text);
  }

  private parseDoubleLiteral(text: string): number {
    return Number.parseFloat(text);
  }

  private parseStringLiteral(text: string): string {
    // Remove quotes and handle escape sequences
    let str = text;

    // Handle raw strings (r"..." or r'...')
    if (str.startsWith("r") || str.startsWith("R")) {
      str = str.slice(1);
      // Raw strings don't process escapes, just remove quotes
      if (str.startsWith('"""') || str.startsWith("'''")) {
        return str.slice(3, -3);
      }
      return str.slice(1, -1);
    }

    // Handle triple-quoted strings
    if (str.startsWith('"""') || str.startsWith("'''")) {
      str = str.slice(3, -3);
    } else {
      // Single or double quoted
      str = str.slice(1, -1);
    }

    // Process escape sequences
    return this.processEscapes(str);
  }

  private parseBytesLiteral(text: string): Uint8Array {
    // Remove b prefix and quotes
    let str = text.slice(1); // Remove 'b'

    // Handle raw bytes (br"..." or rb"...")
    if (str.startsWith("r") || str.startsWith("R")) {
      str = str.slice(1);
    }

    // Handle triple-quoted
    if (str.startsWith('"""') || str.startsWith("'''")) {
      str = str.slice(3, -3);
    } else {
      str = str.slice(1, -1);
    }

    // Process escapes and convert to bytes
    const processed = this.processEscapes(str);
    return new TextEncoder().encode(processed);
  }

  private processEscapes(str: string): string {
    const escapeRegex =
      /\\(u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|x[0-9a-fA-F]{2}|[0-7]{1,3}|[nrt\\'"])/g;

    return str.replace(escapeRegex, (_match, seq: string) => {
      switch (seq[0]) {
        case "n":
          return "\n";
        case "r":
          return "\r";
        case "t":
          return "\t";
        case "\\":
          return "\\";
        case '"':
          return '"';
        case "'":
          return "'";
        case "x":
          return String.fromCharCode(Number.parseInt(seq.slice(1), 16));
        case "u":
          return String.fromCharCode(Number.parseInt(seq.slice(1), 16));
        case "U":
          return String.fromCodePoint(Number.parseInt(seq.slice(1), 16));
        default:
          // Octal escape
          return String.fromCharCode(Number.parseInt(seq, 8));
      }
    });
  }
}
