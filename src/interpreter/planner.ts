// CEL Planner
// Conversion planner from AST to Interpretable
// Implemented with reference to cel-go's interpret/planner.go

import type { ParserRuleContext } from "antlr4";
import type { ReferenceInfo } from "../checker/checker";
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
  type ExprContext,
  GlobalCallContext,
  // Primary context subclasses
  IdentContext,
  IndexContext,
  // Literal context subclasses
  IntContext,
  // Unary context subclasses
  LogicalNotContext,
  // Member context subclasses
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
  type UnaryContext,
} from "../parser/gen/CELParser.js";
import { DefaultDispatcher, type Dispatcher, FunctionResolver } from "./dispatcher";
import {
  AndValue,
  BinaryValue,
  CallValue,
  ConditionalValue,
  ConstValue,
  CreateListValue,
  CreateMapValue,
  FieldValue,
  IdentValue,
  IndexValue,
  type Interpretable,
  NegValue,
  NotValue,
  OrValue,
  TypeConversionValue,
} from "./interpretable";
import {
  BoolValue,
  BytesValue,
  DoubleValue,
  ErrorValue,
  IntValue,
  NullValue,
  StringValue,
  UintValue,
} from "./values";

/**
 * Planner options for controlling interpretable generation.
 */
export interface PlannerOptions {
  /** Function dispatcher */
  dispatcher?: Dispatcher | undefined;
  /** Reference map from checker result */
  refMap?: Map<number, ReferenceInfo> | undefined;
}

/**
 * Planner converts parsed AST to interpretable expressions.
 */
export class Planner {
  private readonly refMap: Map<number, ReferenceInfo>;
  private readonly resolver: FunctionResolver;

  constructor(options: PlannerOptions = {}) {
    const dispatcher = options.dispatcher ?? new DefaultDispatcher();
    this.resolver = new FunctionResolver(dispatcher);
    this.refMap = options.refMap ?? new Map();
  }

  /**
   * Plan a parsed expression into an interpretable.
   */
  plan(tree: StartContext): Interpretable {
    const expr = tree.expr();
    if (!expr) {
      return new ConstValue(0, ErrorValue.create("empty expression"));
    }
    return this.planExpr(expr);
  }

  /**
   * Plan an expression.
   */
  private planExpr(ctx: ExprContext): Interpretable {
    const conditionalOr = ctx.conditionalOr(0);
    if (!conditionalOr) {
      return this.errorNode(ctx, "missing conditionalOr");
    }

    const condInterp = this.planConditionalOr(conditionalOr);

    // Check for ternary expression: e ? e1 : e2
    const questionMark = ctx.QUESTIONMARK();
    if (questionMark) {
      const e1 = ctx.conditionalOr(1);
      const e2 = ctx.expr();

      if (!e1 || !e2) {
        return condInterp;
      }

      const truthyInterp = this.planConditionalOr(e1);
      const falsyInterp = this.planExpr(e2);

      return new ConditionalValue(this.nodeId(ctx), condInterp, truthyInterp, falsyInterp);
    }

    return condInterp;
  }

  /**
   * Plan a conditionalOr expression.
   */
  private planConditionalOr(ctx: ConditionalOrContext): Interpretable {
    const andExprs = ctx.conditionalAnd_list();
    if (andExprs.length === 0) {
      return this.errorNode(ctx, "missing conditionalAnd");
    }

    let result = this.planConditionalAnd(andExprs[0]!);

    // Process multiple OR operands
    for (let i = 1; i < andExprs.length; i++) {
      const right = this.planConditionalAnd(andExprs[i]!);
      result = new OrValue(this.nodeId(ctx), result, right);
    }

    return result;
  }

  /**
   * Plan a conditionalAnd expression.
   */
  private planConditionalAnd(ctx: ConditionalAndContext): Interpretable {
    const relations = ctx.relation_list();
    if (relations.length === 0) {
      return this.errorNode(ctx, "missing relation");
    }

    let result = this.planRelation(relations[0]!);

    // Process multiple AND operands
    for (let i = 1; i < relations.length; i++) {
      const right = this.planRelation(relations[i]!);
      result = new AndValue(this.nodeId(ctx), result, right);
    }

    return result;
  }

  /**
   * Plan a relation expression.
   */
  private planRelation(ctx: RelationContext): Interpretable {
    const relations = ctx.relation_list();
    const calc = ctx.calc();

    // Unary relation (calc only)
    if (calc && relations.length === 0) {
      return this.planCalc(calc);
    }

    // Binary relation
    if (relations.length === 2) {
      const left = this.planRelation(relations[0]!);
      const right = this.planRelation(relations[1]!);
      const op = this.getRelationOperator(ctx);
      return new BinaryValue(this.nodeId(ctx), op, left, right);
    }

    // Fallback
    if (calc) {
      return this.planCalc(calc);
    }
    if (relations.length > 0) {
      return this.planRelation(relations[0]!);
    }

    return this.errorNode(ctx, "invalid relation");
  }

  /**
   * Plan a calc expression.
   */
  private planCalc(ctx: CalcContext): Interpretable {
    const calcs = ctx.calc_list();
    const unary = ctx.unary();

    // Unary calculation (unary only)
    if (unary && calcs.length === 0) {
      return this.planUnary(unary);
    }

    // Binary calculation
    if (calcs.length === 2) {
      const left = this.planCalc(calcs[0]!);
      const right = this.planCalc(calcs[1]!);
      const op = this.getCalcOperator(ctx);
      return new BinaryValue(this.nodeId(ctx), op, left, right);
    }

    // Fallback
    if (unary) {
      return this.planUnary(unary);
    }
    if (calcs.length > 0) {
      return this.planCalc(calcs[0]!);
    }

    return this.errorNode(ctx, "invalid calc");
  }

  /**
   * Plan a unary expression.
   */
  private planUnary(ctx: UnaryContext): Interpretable {
    // LogicalNot: !e
    if (ctx instanceof LogicalNotContext) {
      const member = ctx.member();
      if (member) {
        const operand = this.planMember(member);
        // Process multiple ! operators
        const notCount = ctx.EXCLAM_list().length;
        let result = operand;
        for (let i = 0; i < notCount; i++) {
          result = new NotValue(this.nodeId(ctx), result);
        }
        return result;
      }
    }

    // Negate: -e
    if (ctx instanceof NegateContext) {
      const member = ctx.member();
      if (member) {
        const operand = this.planMember(member);
        // Process multiple - operators
        const negCount = ctx.MINUS_list().length;
        let result = operand;
        for (let i = 0; i < negCount; i++) {
          result = new NegValue(this.nodeId(ctx), result);
        }
        return result;
      }
    }

    // MemberExpr: member
    if (ctx instanceof MemberExprContext) {
      const member = ctx.member();
      if (member) {
        return this.planMember(member);
      }
    }

    return this.errorNode(ctx, "invalid unary");
  }

  /**
   * Plan a member expression.
   */
  private planMember(ctx: MemberContext): Interpretable {
    // PrimaryExpr: primary
    if (ctx instanceof PrimaryExprContext) {
      const primary = ctx.primary();
      if (primary) {
        return this.planPrimary(primary);
      }
    }

    // Select: member.id or member.id(args)
    if (ctx instanceof SelectContext) {
      const member = ctx.member();
      const id = ctx.escapeIdent();

      if (member && id) {
        const operand = this.planMember(member);
        const fieldName = id.getText();
        const opt = ctx.QUESTIONMARK();

        // Optional field access
        const optional = opt !== null;
        return new FieldValue(this.nodeId(ctx), operand, fieldName, optional);
      }
    }

    // MemberCall: member.id(args)
    if (ctx instanceof MemberCallContext) {
      const member = ctx.member();
      const id = ctx.IDENTIFIER();
      const exprList = ctx.exprList();

      if (member && id) {
        const target = this.planMember(member);
        const functionName = id.getText();
        const args: Interpretable[] = [target];

        // Plan arguments
        if (exprList) {
          const exprs = exprList.expr_list();
          for (const e of exprs) {
            args.push(this.planExpr(e));
          }
        }

        // Get overload ID from reference map
        const ref = this.refMap.get(this.nodeId(ctx));
        const overloadId = ref?.overloadIds[0] ?? `${functionName}_${args.length}`;

        return new CallValue(this.nodeId(ctx), functionName, overloadId, args, this.resolver);
      }
    }

    // Index: member[expr] or member[?expr]
    if (ctx instanceof IndexContext) {
      const member = ctx.member();
      const expr = ctx.expr();

      if (member && expr) {
        const operand = this.planMember(member);
        const index = this.planExpr(expr);
        const opt = ctx.QUESTIONMARK();
        const optional = opt !== null;
        return new IndexValue(this.nodeId(ctx), operand, index, optional);
      }
    }

    return this.errorNode(ctx, "invalid member");
  }

  /**
   * Plan a primary expression.
   */
  private planPrimary(ctx: PrimaryContext): Interpretable {
    // Ident: identifier
    if (ctx instanceof IdentContext) {
      const id = ctx.IDENTIFIER();
      if (id) {
        return new IdentValue(this.nodeId(ctx), id.getText());
      }
    }

    // Nested: (expr)
    if (ctx instanceof NestedContext) {
      const expr = ctx.expr();
      if (expr) {
        return this.planExpr(expr);
      }
    }

    // GlobalCall: id(args)
    if (ctx instanceof GlobalCallContext) {
      const id = ctx.IDENTIFIER();
      const exprList = ctx.exprList();

      if (id) {
        const functionName = id.getText();
        const args: Interpretable[] = [];

        if (exprList) {
          const exprs = exprList.expr_list();
          for (const e of exprs) {
            args.push(this.planExpr(e));
          }
        }

        // Check for type conversion function
        if (this.isTypeConversion(functionName) && args.length === 1) {
          return new TypeConversionValue(this.nodeId(ctx), args[0]!, functionName);
        }

        // Get overload ID from reference map
        const ref = this.refMap.get(this.nodeId(ctx));
        const overloadId = ref?.overloadIds[0] ?? `${functionName}_${args.length}`;

        return new CallValue(this.nodeId(ctx), functionName, overloadId, args, this.resolver);
      }
    }

    // CreateList: [e1, e2, ...]
    if (ctx instanceof CreateListContext) {
      const listInit = ctx.listInit();
      const elements: Interpretable[] = [];
      const optionalIndices: number[] = [];

      if (listInit) {
        const elems = listInit.optExpr_list();
        for (let i = 0; i < elems.length; i++) {
          const optExpr = elems[i]!;
          const expr = optExpr.expr();
          if (expr) {
            elements.push(this.planExpr(expr));
            if (optExpr.QUESTIONMARK()) {
              optionalIndices.push(i);
            }
          }
        }
      }

      return new CreateListValue(this.nodeId(ctx), elements, optionalIndices);
    }

    // CreateStruct: {k1: v1, k2: v2, ...}
    if (ctx instanceof CreateStructContext) {
      const mapInit = ctx.mapInitializerList();
      const keys: Interpretable[] = [];
      const values: Interpretable[] = [];
      const optionalIndices: number[] = [];

      if (mapInit) {
        const entries = mapInit.optExpr_list();
        for (let i = 0; i < entries.length; i++) {
          const optExpr = entries[i]!;
          const expr = optExpr.expr();
          if (expr) {
            // Get key and value of map entry
            // MapInitializerList has key : value pairs
            const key = this.planExpr(expr);
            keys.push(key);

            // Value is the i-th element of mapInit.expr_list() (next to key)
            const valueExprs = mapInit.expr_list();
            if (valueExprs[i]) {
              values.push(this.planExpr(valueExprs[i]!));
            } else {
              values.push(new ConstValue(this.nodeId(ctx), NullValue.Instance));
            }

            if (optExpr.QUESTIONMARK()) {
              optionalIndices.push(i);
            }
          }
        }
      }

      return new CreateMapValue(this.nodeId(ctx), keys, values, optionalIndices);
    }

    // CreateMessage: TypeName{field1: v1, ...}
    if (ctx instanceof CreateMessageContext) {
      // Message creation (proto messages) is treated as a simple map for now
      const keys: Interpretable[] = [];
      const values: Interpretable[] = [];

      const fieldInits = ctx.fieldInitializerList();
      if (fieldInits) {
        const optFields = fieldInits.optField_list();
        const exprs = fieldInits.expr_list();
        for (let i = 0; i < optFields.length; i++) {
          const optField = optFields[i];
          const expr = exprs[i];
          if (optField && expr) {
            // Get escapeIdent from optField
            const ident = optField.escapeIdent();
            if (ident) {
              keys.push(new ConstValue(this.nodeId(ctx), StringValue.of(ident.getText())));
              values.push(this.planExpr(expr));
            }
          }
        }
      }

      return new CreateMapValue(this.nodeId(ctx), keys, values);
    }

    // ConstantLiteral
    if (ctx instanceof ConstantLiteralContext) {
      const literal = ctx.literal();
      if (literal) {
        return this.planLiteral(literal);
      }
    }

    return this.errorNode(ctx, "invalid primary");
  }

  /**
   * Plan a literal value.
   */
  private planLiteral(ctx: ParserRuleContext): Interpretable {
    // Int literal
    if (ctx instanceof IntContext) {
      const text = ctx.getText();
      const isNegative = text.startsWith("-");
      const cleanText = isNegative ? text.substring(1) : text;

      let value: bigint;
      if (cleanText.startsWith("0x") || cleanText.startsWith("0X")) {
        value = BigInt(cleanText);
      } else if (cleanText.startsWith("0") && cleanText.length > 1 && !cleanText.includes(".")) {
        // Octal
        value = BigInt(cleanText);
      } else {
        value = BigInt(cleanText);
      }

      if (isNegative) {
        value = -value;
      }

      return new ConstValue(this.nodeId(ctx), IntValue.of(value));
    }

    // Uint literal
    if (ctx instanceof UintContext) {
      const text = ctx.getText();
      // Remove trailing 'u' or 'U'
      const cleanText = text.replace(/[uU]$/, "");
      let value: bigint;
      if (cleanText.startsWith("0x") || cleanText.startsWith("0X")) {
        value = BigInt(cleanText);
      } else {
        value = BigInt(cleanText);
      }
      return new ConstValue(this.nodeId(ctx), UintValue.of(value));
    }

    // Double literal
    if (ctx instanceof DoubleContext) {
      const text = ctx.getText();
      const value = Number.parseFloat(text);
      return new ConstValue(this.nodeId(ctx), DoubleValue.of(value));
    }

    // String literal
    if (ctx instanceof StringContext) {
      const text = ctx.getText();
      const value = this.parseStringLiteral(text);
      return new ConstValue(this.nodeId(ctx), StringValue.of(value));
    }

    // Bytes literal
    if (ctx instanceof BytesContext) {
      const text = ctx.getText();
      const value = this.parseBytesLiteral(text);
      return new ConstValue(this.nodeId(ctx), BytesValue.of(value));
    }

    // Boolean true
    if (ctx instanceof BoolTrueContext) {
      return new ConstValue(this.nodeId(ctx), BoolValue.True);
    }

    // Boolean false
    if (ctx instanceof BoolFalseContext) {
      return new ConstValue(this.nodeId(ctx), BoolValue.False);
    }

    // Null
    if (ctx instanceof NullContext) {
      return new ConstValue(this.nodeId(ctx), NullValue.Instance);
    }

    return this.errorNode(ctx, "unknown literal type");
  }

  /**
   * Get the relation operator from a relation context.
   */
  private getRelationOperator(ctx: RelationContext): string {
    if (ctx.LESS()) return "<";
    if (ctx.LESS_EQUALS()) return "<=";
    if (ctx.GREATER_EQUALS()) return ">=";
    if (ctx.GREATER()) return ">";
    if (ctx.EQUALS()) return "==";
    if (ctx.NOT_EQUALS()) return "!=";
    if (ctx.IN()) return "in";
    return "==";
  }

  /**
   * Get the calc operator from a calc context.
   */
  private getCalcOperator(ctx: CalcContext): string {
    if (ctx.PLUS()) return "+";
    if (ctx.MINUS()) return "-";
    if (ctx.STAR()) return "*";
    if (ctx.SLASH()) return "/";
    if (ctx.PERCENT()) return "%";
    return "+";
  }

  /**
   * Check if function name is a type conversion.
   */
  private isTypeConversion(name: string): boolean {
    return ["int", "uint", "double", "string", "bytes", "bool", "type", "dyn"].includes(name);
  }

  /**
   * Parse a CEL string literal.
   */
  private parseStringLiteral(text: string): string {
    // Raw string (r"..." or r'...')
    if (text.startsWith('r"') || text.startsWith("r'")) {
      return text.slice(2, -1);
    }

    // Triple-quoted string
    if (text.startsWith('"""') || text.startsWith("'''")) {
      return this.unescapeString(text.slice(3, -3));
    }

    // Normal string
    if (text.startsWith('"') || text.startsWith("'")) {
      return this.unescapeString(text.slice(1, -1));
    }

    return text;
  }

  /**
   * Unescape a string literal.
   */
  private unescapeString(str: string): string {
    let result = "";
    let i = 0;
    while (i < str.length) {
      if (str[i] === "\\") {
        i++;
        if (i >= str.length) {
          result += "\\";
          break;
        }
        switch (str[i]) {
          case "n":
            result += "\n";
            break;
          case "r":
            result += "\r";
            break;
          case "t":
            result += "\t";
            break;
          case "\\":
            result += "\\";
            break;
          case '"':
            result += '"';
            break;
          case "'":
            result += "'";
            break;
          case "x":
            // \xHH hex escape
            if (i + 2 < str.length) {
              const hex = str.substring(i + 1, i + 3);
              const code = Number.parseInt(hex, 16);
              if (!isNaN(code)) {
                result += String.fromCharCode(code);
                i += 2;
              } else {
                result += "\\x";
              }
            } else {
              result += "\\x";
            }
            break;
          case "u":
            // \uHHHH unicode escape
            if (i + 4 < str.length) {
              const hex = str.substring(i + 1, i + 5);
              const code = Number.parseInt(hex, 16);
              if (!isNaN(code)) {
                result += String.fromCharCode(code);
                i += 4;
              } else {
                result += "\\u";
              }
            } else {
              result += "\\u";
            }
            break;
          case "U":
            // \UHHHHHHHH unicode escape
            if (i + 8 < str.length) {
              const hex = str.substring(i + 1, i + 9);
              const code = Number.parseInt(hex, 16);
              if (!isNaN(code)) {
                result += String.fromCodePoint(code);
                i += 8;
              } else {
                result += "\\U";
              }
            } else {
              result += "\\U";
            }
            break;
          default:
            // Unknown escape, keep as-is
            result += str[i];
        }
      } else {
        result += str[i];
      }
      i++;
    }
    return result;
  }

  /**
   * Parse a CEL bytes literal.
   */
  private parseBytesLiteral(text: string): Uint8Array {
    // b"..." or b'...'
    const prefix = text[0];
    if (prefix !== "b" && prefix !== "B") {
      return new Uint8Array(0);
    }

    const strContent = text.slice(1);
    const str = this.parseStringLiteral(strContent);
    const encoder = new TextEncoder();
    return encoder.encode(str);
  }

  /**
   * Get node ID for an AST node.
   */
  private nodeId(ctx: ParserRuleContext): number {
    // Generate unique ID from ANTLR context
    // In actual implementation, should use the same ID as the checker
    const startLine = ctx.start?.line ?? 0;
    const startColumn = ctx.start?.column ?? 0;
    return (startLine << 16) | startColumn;
  }

  /**
   * Create an error node.
   */
  private errorNode(ctx: ParserRuleContext, message: string): Interpretable {
    return new ConstValue(this.nodeId(ctx), ErrorValue.create(message));
  }
}
