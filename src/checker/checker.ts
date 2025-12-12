// CEL Type Checker
// Main checker implementation for type checking CEL expressions

import type { ParserRuleContext } from "antlr4";
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
  type ExprListContext,
  GlobalCallContext,
  // Primary context subclasses
  IdentContext,
  IndexContext,
  // Literal context subclasses
  IntContext,
  type ListInitContext,
  // Unary context subclasses
  LogicalNotContext,
  type MapInitializerListContext,
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
import type { OverloadDecl } from "./decls";
import type { CheckerEnv } from "./env";
import { CheckerErrors } from "./errors";
import { TypeMapping, isAssignableWithMapping, joinTypes, substitute } from "./mapping";
import { Type, TypeKind, isAssignable, isDynOrError } from "./types";

/**
 * Result of type checking
 */
export interface CheckResult {
  /** The inferred type of the expression */
  type: Type;
  /** Map from expression IDs to their types */
  typeMap: Map<number, Type>;
  /** Map from expression IDs to reference info */
  refMap: Map<number, ReferenceInfo>;
  /** Collected errors */
  errors: CheckerErrors;
}

/**
 * Reference information for an expression
 */
export interface ReferenceInfo {
  name: string;
  overloadIds: string[];
}

/**
 * Type checker implementation
 */
export class Checker {
  private readonly env: CheckerEnv;
  private readonly errors: CheckerErrors;
  private readonly typeMap: Map<number, Type> = new Map();
  private readonly refMap: Map<number, ReferenceInfo> = new Map();
  private mapping: TypeMapping = new TypeMapping();
  private typeVarCounter = 0;

  constructor(env: CheckerEnv) {
    this.env = env;
    this.errors = new CheckerErrors();
  }

  /**
   * Check a parsed CEL expression
   */
  check(tree: StartContext): CheckResult {
    const expr = tree.expr();
    const resultType = expr ? this.checkExpr(expr) : Type.Dyn;

    return {
      type: resultType,
      typeMap: this.typeMap,
      refMap: this.refMap,
      errors: this.errors,
    };
  }

  /**
   * Check an expression node
   */
  private checkExpr(ctx: ExprContext): Type {
    // Get first conditionalOr (always present)
    const conditionalOr = ctx.conditionalOr(0);
    if (!conditionalOr) {
      return this.setType(ctx, Type.Dyn);
    }

    const condType = this.checkConditionalOr(conditionalOr);

    // Check for ternary expression: e ? e1 : e2
    const questionMark = ctx.QUESTIONMARK();
    if (questionMark) {
      // e1 is the second conditionalOr (index 1)
      const e1 = ctx.conditionalOr(1);
      // e2 is the nested expr
      const e2 = ctx.expr();

      if (!e1 || !e2) {
        return this.setType(ctx, condType);
      }

      // Condition must be bool
      if (!isDynOrError(condType) && condType.kind !== TypeKind.Bool) {
        this.errors.reportTypeMismatch(this.nodeId(ctx), Type.Bool, condType);
      }

      const trueType = this.checkConditionalOr(e1);
      const falseType = this.checkExpr(e2);

      // Result type is the join of true and false branches
      const resultType = joinTypes(trueType, falseType);
      return this.setType(ctx, resultType);
    }

    return this.setType(ctx, condType);
  }

  /**
   * Check conditional OR expression (||)
   */
  private checkConditionalOr(ctx: ConditionalOrContext): Type {
    // Get all conditionalAnd children using the _list method
    const andExprs = ctx.conditionalAnd_list();

    if (andExprs.length === 0) {
      return this.setType(ctx, Type.Dyn);
    }

    let resultType = this.checkConditionalAnd(andExprs[0]!);

    // If there are multiple operands, result is bool
    for (let i = 1; i < andExprs.length; i++) {
      const operandType = this.checkConditionalAnd(andExprs[i]!);

      // Both operands must be bool
      if (!isDynOrError(resultType) && resultType.kind !== TypeKind.Bool) {
        this.errors.reportTypeMismatch(this.nodeId(ctx), Type.Bool, resultType);
      }
      if (!isDynOrError(operandType) && operandType.kind !== TypeKind.Bool) {
        this.errors.reportTypeMismatch(this.nodeId(ctx), Type.Bool, operandType);
      }

      resultType = Type.Bool;
    }

    return this.setType(ctx, resultType);
  }

  /**
   * Check conditional AND expression (&&)
   */
  private checkConditionalAnd(ctx: ConditionalAndContext): Type {
    // Get all relation children
    const relations = ctx.relation_list();

    if (relations.length === 0) {
      return this.setType(ctx, Type.Dyn);
    }

    let resultType = this.checkRelation(relations[0]!);

    // If there are multiple operands, result is bool
    for (let i = 1; i < relations.length; i++) {
      const operandType = this.checkRelation(relations[i]!);

      // Both operands must be bool
      if (!isDynOrError(resultType) && resultType.kind !== TypeKind.Bool) {
        this.errors.reportTypeMismatch(this.nodeId(ctx), Type.Bool, resultType);
      }
      if (!isDynOrError(operandType) && operandType.kind !== TypeKind.Bool) {
        this.errors.reportTypeMismatch(this.nodeId(ctx), Type.Bool, operandType);
      }

      resultType = Type.Bool;
    }

    return this.setType(ctx, resultType);
  }

  /**
   * Check relation expression (<, <=, >, >=, ==, !=, in)
   */
  private checkRelation(ctx: RelationContext): Type {
    // Get relation children - for binary relations, there are 2 relation children
    const relations = ctx.relation_list();

    // Check if this is a calc (base case - no operator, just pass through)
    const calc = ctx.calc();
    if (calc && relations.length === 0) {
      // Check if calc actually has content (for base case, calc.getText() should be defined)
      const calcText = calc.getText();
      if (calcText) {
        return this.setType(ctx, this.checkCalc(calc));
      }
    }

    // Binary relation: relation op relation (left-recursive)
    if (relations.length === 2) {
      const leftType = this.checkRelation(relations[0]!);
      const rightType = this.checkRelation(relations[1]!);
      const opText = this.getRelationOperator(ctx);

      // All relation operators return bool
      if (opText === "in") {
        // Right side must be a container
        if (
          !isDynOrError(rightType) &&
          rightType.kind !== TypeKind.List &&
          rightType.kind !== TypeKind.Map
        ) {
          this.errors.reportUnexpectedType(this.nodeId(ctx), "list or map", rightType);
        }
      } else {
        // Comparison operators
        if (!isDynOrError(leftType) && !isDynOrError(rightType)) {
          if (!leftType.isEquivalentType(rightType) && !this.areComparable(leftType, rightType)) {
            this.errors.reportIncompatibleTypes(this.nodeId(ctx), opText, leftType, rightType);
          }
        }
      }

      return this.setType(ctx, Type.Bool);
    }

    return this.setType(ctx, Type.Dyn);
  }

  /**
   * Check calc expression (+, -, *, /, %)
   */
  private checkCalc(ctx: CalcContext): Type {
    // Get calc children - for binary operations, there are 2 calc children
    const calcs = ctx.calc_list();

    // Check if this is a unary (base case - no operator, just pass through)
    const unary = ctx.unary();
    if (unary && calcs.length === 0) {
      return this.setType(ctx, this.checkUnary(unary));
    }

    // Binary calc: calc op calc (left-recursive, so both operands are calc children)
    if (calcs.length === 2) {
      const leftType = this.checkCalc(calcs[0]!);
      const rightType = this.checkCalc(calcs[1]!);

      const opText = this.getCalcOperator(ctx);
      const resultType = this.resolveArithmeticType(opText, leftType, rightType, ctx);
      return this.setType(ctx, resultType);
    }

    // Fallback for unexpected structure
    return this.setType(ctx, Type.Dyn);
  }

  /**
   * Check unary expression (!, -)
   */
  private checkUnary(ctx: UnaryContext): Type {
    // Use instanceof to determine the unary type
    if (ctx instanceof LogicalNotContext) {
      const member = ctx.member();
      if (!member) {
        return this.setType(ctx, Type.Dyn);
      }
      const memberType = this.checkMember(member);

      // Logical NOT requires bool
      if (!isDynOrError(memberType) && memberType.kind !== TypeKind.Bool) {
        this.errors.reportTypeMismatch(this.nodeId(ctx), Type.Bool, memberType);
      }
      return this.setType(ctx, Type.Bool);
    }

    if (ctx instanceof NegateContext) {
      const member = ctx.member();
      if (!member) {
        return this.setType(ctx, Type.Dyn);
      }
      const memberType = this.checkMember(member);

      // Numeric negation requires numeric type
      if (
        !isDynOrError(memberType) &&
        memberType.kind !== TypeKind.Int &&
        memberType.kind !== TypeKind.Double
      ) {
        this.errors.reportUnexpectedType(this.nodeId(ctx), "numeric type", memberType);
      }
      return this.setType(ctx, memberType);
    }

    if (ctx instanceof MemberExprContext) {
      const member = ctx.member();
      if (!member) {
        return this.setType(ctx, Type.Dyn);
      }
      return this.setType(ctx, this.checkMember(member));
    }

    return this.setType(ctx, Type.Dyn);
  }

  /**
   * Check member expression (field access, method calls, indexing)
   */
  private checkMember(ctx: MemberContext): Type {
    // Use instanceof to determine the member type
    if (ctx instanceof PrimaryExprContext) {
      const primary = ctx.primary();
      if (!primary) {
        return this.setType(ctx, Type.Dyn);
      }
      return this.setType(ctx, this.checkPrimary(primary));
    }

    if (ctx instanceof IndexContext) {
      const member = ctx.member();
      const expr = ctx.expr();
      if (!member || !expr) {
        return this.setType(ctx, Type.Dyn);
      }
      const baseType = this.checkMember(member);
      const indexType = this.checkExpr(expr);
      return this.setType(ctx, this.resolveIndexType(baseType, indexType, ctx));
    }

    if (ctx instanceof SelectContext) {
      const member = ctx.member();
      const escapeIdent = ctx.escapeIdent();
      if (!member || !escapeIdent) {
        return this.setType(ctx, Type.Dyn);
      }
      const baseType = this.checkMember(member);
      const fieldName = this.getIdentifierText(escapeIdent);
      return this.setType(ctx, this.resolveFieldType(baseType, fieldName, ctx));
    }

    if (ctx instanceof MemberCallContext) {
      const member = ctx.member();
      const idToken = ctx.IDENTIFIER();
      if (!member || !idToken) {
        return this.setType(ctx, Type.Dyn);
      }
      const baseType = this.checkMember(member);
      const methodName = idToken.getText();
      const exprList = ctx.exprList();
      return this.setType(ctx, this.checkMethodCall(baseType, methodName, exprList, ctx));
    }

    return this.setType(ctx, Type.Dyn);
  }

  /**
   * Check primary expression (literals, identifiers, function calls, etc.)
   */
  private checkPrimary(ctx: PrimaryContext): Type {
    // Use instanceof to determine the primary type
    if (ctx instanceof IdentContext) {
      return this.checkIdent(ctx);
    }
    if (ctx instanceof GlobalCallContext) {
      return this.checkGlobalCall(ctx);
    }
    if (ctx instanceof NestedContext) {
      const expr = ctx.expr();
      if (expr) {
        return this.setType(ctx, this.checkExpr(expr));
      }
      return this.setType(ctx, Type.Dyn);
    }
    if (ctx instanceof CreateListContext) {
      return this.checkCreateList(ctx);
    }
    if (ctx instanceof CreateStructContext) {
      return this.checkCreateMap(ctx);
    }
    if (ctx instanceof CreateMessageContext) {
      return this.checkCreateMessage(ctx);
    }
    if (ctx instanceof ConstantLiteralContext) {
      return this.checkLiteral(ctx);
    }

    return this.setType(ctx, Type.Dyn);
  }

  /**
   * Check identifier primary
   */
  private checkIdent(ctx: IdentContext): Type {
    const idToken = ctx.IDENTIFIER();
    if (!idToken) {
      return this.setType(ctx, Type.Dyn);
    }

    const name = idToken.getText();
    const hasLeadingDot = ctx.DOT() !== null;
    const fullName = hasLeadingDot ? `.${name}` : name;

    const result = this.env.lookupIdent(fullName);
    if (!result) {
      this.errors.reportUndeclaredReference(
        this.nodeId(ctx),
        this.env.getContainer().name,
        fullName
      );
      return this.setType(ctx, Type.Dyn);
    }

    this.setRef(ctx, result.name, []);
    return this.setType(ctx, result.type);
  }

  /**
   * Check global function call
   */
  private checkGlobalCall(ctx: GlobalCallContext): Type {
    const idToken = ctx.IDENTIFIER();
    if (!idToken) {
      return this.setType(ctx, Type.Dyn);
    }

    const funcName = idToken.getText();
    const hasLeadingDot = ctx.DOT() !== null;
    const fullName = hasLeadingDot ? `.${funcName}` : funcName;

    const fn = this.env.lookupFunction(fullName);
    if (!fn) {
      this.errors.reportUndeclaredReference(
        this.nodeId(ctx),
        this.env.getContainer().name,
        fullName
      );
      return this.setType(ctx, Type.Dyn);
    }

    // Check arguments
    const exprList = ctx.exprList();
    const argTypes = exprList ? this.checkExprList(exprList) : [];

    // Resolve overload
    const overloads = fn.overloads().filter((o) => !o.isMemberFunction);
    const resolved = this.resolveOverload(overloads, argTypes, false);

    if (!resolved) {
      this.errors.reportNoMatchingOverload(this.nodeId(ctx), fullName, argTypes, false);
      return this.setType(ctx, Type.Dyn);
    }

    this.setRef(ctx, fullName, resolved.overloadIds);
    return this.setType(ctx, resolved.resultType);
  }

  /**
   * Check list creation
   */
  private checkCreateList(ctx: CreateListContext): Type {
    const listInit = ctx.listInit();
    if (!listInit) {
      return this.setType(ctx, Type.newListType(Type.Dyn));
    }

    const elemTypes = this.checkListInit(listInit);
    if (elemTypes.length === 0) {
      return this.setType(ctx, Type.newListType(Type.Dyn));
    }

    // Join all element types
    let elemType = elemTypes[0]!;
    for (let i = 1; i < elemTypes.length; i++) {
      elemType = joinTypes(elemType, elemTypes[i]!);
    }

    return this.setType(ctx, Type.newListType(elemType));
  }

  /**
   * Check map creation
   */
  private checkCreateMap(ctx: CreateStructContext): Type {
    const mapInit = ctx.mapInitializerList();
    if (!mapInit) {
      return this.setType(ctx, Type.newMapType(Type.Dyn, Type.Dyn));
    }

    const { keyTypes, valueTypes } = this.checkMapInit(mapInit);
    if (keyTypes.length === 0) {
      return this.setType(ctx, Type.newMapType(Type.Dyn, Type.Dyn));
    }

    // Join all key and value types
    let keyType = keyTypes[0]!;
    let valueType = valueTypes[0]!;
    for (let i = 1; i < keyTypes.length; i++) {
      keyType = joinTypes(keyType, keyTypes[i]!);
      valueType = joinTypes(valueType, valueTypes[i]!);
    }

    return this.setType(ctx, Type.newMapType(keyType, valueType));
  }

  /**
   * Check message creation
   */
  private checkCreateMessage(ctx: CreateMessageContext): Type {
    const ids = ctx.IDENTIFIER_list();
    const typeName = ids.map((id) => id.getText()).join(".");
    const hasLeadingDot = ctx.DOT_list().length > ids.length;
    const fullTypeName = hasLeadingDot ? `.${typeName}` : typeName;

    // Look up the struct type
    const structType = this.env.getProvider().findStructType(fullTypeName);
    if (!structType) {
      this.errors.reportNotAMessageType(this.nodeId(ctx), fullTypeName);
      return this.setType(ctx, Type.Dyn);
    }

    // Check field initializers
    const fieldInit = ctx.fieldInitializerList();
    if (fieldInit) {
      this.checkFieldInit(fieldInit, fullTypeName);
    }

    return this.setType(ctx, structType);
  }

  /**
   * Check literal expression
   */
  private checkLiteral(ctx: ConstantLiteralContext): Type {
    const literal = ctx.literal();
    if (!literal) {
      return this.setType(ctx, Type.Dyn);
    }

    if (literal instanceof IntContext) {
      return this.setType(ctx, Type.Int);
    }
    if (literal instanceof UintContext) {
      return this.setType(ctx, Type.Uint);
    }
    if (literal instanceof DoubleContext) {
      return this.setType(ctx, Type.Double);
    }
    if (literal instanceof StringContext) {
      return this.setType(ctx, Type.String);
    }
    if (literal instanceof BytesContext) {
      return this.setType(ctx, Type.Bytes);
    }
    if (literal instanceof BoolTrueContext || literal instanceof BoolFalseContext) {
      return this.setType(ctx, Type.Bool);
    }
    if (literal instanceof NullContext) {
      return this.setType(ctx, Type.Null);
    }

    return this.setType(ctx, Type.Dyn);
  }

  // === Helper Methods ===

  private checkExprList(ctx: ExprListContext): Type[] {
    const exprs = ctx.expr_list();
    return exprs.map((expr) => this.checkExpr(expr));
  }

  private checkListInit(ctx: ListInitContext): Type[] {
    const optExprs = ctx.optExpr_list();
    return optExprs.map((opt) => {
      const expr = opt.expr();
      return expr ? this.checkExpr(expr) : Type.Dyn;
    });
  }

  private checkMapInit(ctx: MapInitializerListContext): { keyTypes: Type[]; valueTypes: Type[] } {
    const keyTypes: Type[] = [];
    const valueTypes: Type[] = [];

    const optExprs = ctx.optExpr_list();
    const exprs = ctx.expr_list();

    // Map entries are: optExpr : expr pairs
    for (let i = 0; i < optExprs.length; i++) {
      const keyOpt = optExprs[i]!;
      const keyExpr = keyOpt.expr();
      keyTypes.push(keyExpr ? this.checkExpr(keyExpr) : Type.Dyn);

      if (i < exprs.length) {
        valueTypes.push(this.checkExpr(exprs[i]!));
      } else {
        valueTypes.push(Type.Dyn);
      }
    }

    return { keyTypes, valueTypes };
  }

  private checkFieldInit(_ctx: ParserRuleContext, _typeName: string): void {
    // Field initialization checking - validate fields exist on the type
    // Implementation would check each field against TypeProvider
  }

  private checkMethodCall(
    receiverType: Type,
    methodName: string,
    args: ExprListContext | null,
    ctx: ParserRuleContext
  ): Type {
    const argTypes = args ? this.checkExprList(args) : [];

    // Prepend receiver type for member function resolution
    const allArgTypes = [receiverType, ...argTypes];

    const fn = this.env.lookupFunction(methodName);
    if (fn) {
      const overloads = fn.overloads().filter((o) => o.isMemberFunction);
      const resolved = this.resolveOverload(overloads, allArgTypes, true);

      if (resolved) {
        this.setRef(ctx, methodName, resolved.overloadIds);
        return resolved.resultType;
      }
    }

    // Check for type-specific methods
    if (isDynOrError(receiverType)) {
      return Type.Dyn;
    }

    // List methods
    if (receiverType.kind === TypeKind.List) {
      if (methodName === "size") {
        return Type.Int;
      }
    }

    // String methods
    if (receiverType.kind === TypeKind.String) {
      if (methodName === "size" || methodName === "indexOf" || methodName === "lastIndexOf") {
        return Type.Int;
      }
      if (
        methodName === "startsWith" ||
        methodName === "endsWith" ||
        methodName === "contains" ||
        methodName === "matches"
      ) {
        return Type.Bool;
      }
      if (
        methodName === "toLowerCase" ||
        methodName === "toUpperCase" ||
        methodName === "trim" ||
        methodName === "substring" ||
        methodName === "replace"
      ) {
        return Type.String;
      }
      if (methodName === "split") {
        return Type.newListType(Type.String);
      }
    }

    // Map methods
    if (receiverType.kind === TypeKind.Map) {
      if (methodName === "size") {
        return Type.Int;
      }
    }

    // Timestamp methods
    if (receiverType.kind === TypeKind.Timestamp) {
      if (
        methodName === "getFullYear" ||
        methodName === "getMonth" ||
        methodName === "getDayOfMonth" ||
        methodName === "getDayOfWeek" ||
        methodName === "getDayOfYear" ||
        methodName === "getHours" ||
        methodName === "getMinutes" ||
        methodName === "getSeconds" ||
        methodName === "getMilliseconds"
      ) {
        return Type.Int;
      }
    }

    // Duration methods
    if (receiverType.kind === TypeKind.Duration) {
      if (
        methodName === "getHours" ||
        methodName === "getMinutes" ||
        methodName === "getSeconds" ||
        methodName === "getMilliseconds"
      ) {
        return Type.Int;
      }
    }

    this.errors.reportNoMatchingOverload(this.nodeId(ctx), methodName, allArgTypes, true);
    return Type.Dyn;
  }

  private resolveIndexType(baseType: Type, indexType: Type, ctx: ParserRuleContext): Type {
    if (isDynOrError(baseType)) {
      return Type.Dyn;
    }

    if (baseType.kind === TypeKind.List) {
      // List index must be int
      if (!isDynOrError(indexType) && indexType.kind !== TypeKind.Int) {
        this.errors.reportTypeMismatch(this.nodeId(ctx), Type.Int, indexType);
      }
      return baseType.listElementType() ?? Type.Dyn;
    }

    if (baseType.kind === TypeKind.Map) {
      const keyType = baseType.mapKeyType();
      if (keyType && !isDynOrError(indexType)) {
        if (!isAssignable(keyType, indexType)) {
          this.errors.reportTypeMismatch(this.nodeId(ctx), keyType, indexType);
        }
      }
      return baseType.mapValueType() ?? Type.Dyn;
    }

    if (baseType.kind === TypeKind.String) {
      if (!isDynOrError(indexType) && indexType.kind !== TypeKind.Int) {
        this.errors.reportTypeMismatch(this.nodeId(ctx), Type.Int, indexType);
      }
      return Type.String;
    }

    if (baseType.kind === TypeKind.Bytes) {
      if (!isDynOrError(indexType) && indexType.kind !== TypeKind.Int) {
        this.errors.reportTypeMismatch(this.nodeId(ctx), Type.Int, indexType);
      }
      return Type.Int;
    }

    return Type.Dyn;
  }

  private resolveFieldType(baseType: Type, fieldName: string, ctx: ParserRuleContext): Type {
    if (isDynOrError(baseType)) {
      return Type.Dyn;
    }

    // Map field access (same as indexing with string key)
    if (baseType.kind === TypeKind.Map) {
      return baseType.mapValueType() ?? Type.Dyn;
    }

    // Struct field access
    if (baseType.kind === TypeKind.Struct) {
      const fieldType = this.env.lookupFieldType(baseType, fieldName);
      if (!fieldType) {
        this.errors.reportUndefinedField(this.nodeId(ctx), fieldName);
        return Type.Dyn;
      }
      return fieldType;
    }

    return Type.Dyn;
  }

  private getIdentifierText(ctx: ParserRuleContext): string {
    // Get identifier from escape_ident context
    const text = ctx.getText();
    // Handle backtick-escaped identifiers
    if (text.startsWith("`") && text.endsWith("`")) {
      return text.slice(1, -1);
    }
    return text;
  }

  /**
   * Resolve overload from candidates
   */
  private resolveOverload(
    overloads: OverloadDecl[],
    argTypes: Type[],
    isMemberCall: boolean
  ): { resultType: Type; overloadIds: string[] } | null {
    const matchingOverloads: OverloadDecl[] = [];
    let resultType: Type | null = null;

    for (const overload of overloads) {
      if (this.env.isOverloadDisabled(overload.id)) continue;
      if (overload.isMemberFunction !== isMemberCall) continue;
      if (overload.argTypes.length !== argTypes.length) continue;

      const tempMapping = this.mapping.copy();

      if (overload.isParametric()) {
        for (const param of overload.typeParams) {
          const typeParam = Type.newTypeParamType(param);
          const freshVar = Type.newTypeParamType(`_var${this.typeVarCounter++}`);
          tempMapping.add(typeParam, freshVar);
        }
      }

      let matches = true;
      for (let i = 0; i < argTypes.length; i++) {
        const paramType = substitute(overload.argTypes[i]!, tempMapping, false);
        if (!isAssignableWithMapping(tempMapping, paramType, argTypes[i]!)) {
          matches = false;
          break;
        }
      }

      if (matches) {
        matchingOverloads.push(overload);
        const overloadResultType = substitute(overload.resultType, tempMapping, true);
        if (resultType === null) {
          resultType = overloadResultType;
        } else if (!resultType.isEquivalentType(overloadResultType)) {
          resultType = Type.Dyn;
        }
      }
    }

    if (matchingOverloads.length === 0) return null;

    return {
      resultType: resultType ?? Type.Dyn,
      overloadIds: matchingOverloads.map((o) => o.id),
    };
  }

  private resolveArithmeticType(
    op: string,
    leftType: Type,
    rightType: Type,
    ctx: ParserRuleContext
  ): Type {
    if (isDynOrError(leftType) || isDynOrError(rightType)) {
      return Type.Dyn;
    }

    // String concatenation
    if (op === "+" && leftType.kind === TypeKind.String && rightType.kind === TypeKind.String) {
      return Type.String;
    }

    // Bytes concatenation
    if (op === "+" && leftType.kind === TypeKind.Bytes && rightType.kind === TypeKind.Bytes) {
      return Type.Bytes;
    }

    // List concatenation
    if (op === "+" && leftType.kind === TypeKind.List && rightType.kind === TypeKind.List) {
      const leftElem = leftType.listElementType() ?? Type.Dyn;
      const rightElem = rightType.listElementType() ?? Type.Dyn;
      return Type.newListType(joinTypes(leftElem, rightElem));
    }

    // Numeric operations
    const numericKinds = [TypeKind.Int, TypeKind.Uint, TypeKind.Double];
    if (numericKinds.includes(leftType.kind) && numericKinds.includes(rightType.kind)) {
      if (leftType.kind === TypeKind.Double || rightType.kind === TypeKind.Double) {
        return Type.Double;
      }
      if (leftType.kind === rightType.kind) {
        return leftType;
      }
      // Mixed int/uint - result depends on operation, default to left type
      return leftType;
    }

    // Duration/timestamp arithmetic
    if (op === "+" || op === "-") {
      if (leftType.kind === TypeKind.Timestamp && rightType.kind === TypeKind.Duration) {
        return Type.Timestamp;
      }
      if (
        leftType.kind === TypeKind.Duration &&
        rightType.kind === TypeKind.Timestamp &&
        op === "+"
      ) {
        return Type.Timestamp;
      }
      if (
        leftType.kind === TypeKind.Timestamp &&
        rightType.kind === TypeKind.Timestamp &&
        op === "-"
      ) {
        return Type.Duration;
      }
      if (leftType.kind === TypeKind.Duration && rightType.kind === TypeKind.Duration) {
        return Type.Duration;
      }
    }

    this.errors.reportIncompatibleTypes(this.nodeId(ctx), op, leftType, rightType);
    return Type.Dyn;
  }

  private areComparable(t1: Type, t2: Type): boolean {
    if (t1.kind === t2.kind) return true;
    const numericKinds = [TypeKind.Int, TypeKind.Uint, TypeKind.Double];
    return numericKinds.includes(t1.kind) && numericKinds.includes(t2.kind);
  }

  private getRelationOperator(ctx: RelationContext): string {
    if (ctx.LESS()) return "<";
    if (ctx.LESS_EQUALS()) return "<=";
    if (ctx.GREATER()) return ">";
    if (ctx.GREATER_EQUALS()) return ">=";
    if (ctx.EQUALS()) return "==";
    if (ctx.NOT_EQUALS()) return "!=";
    if (ctx.IN()) return "in";
    return "";
  }

  private getCalcOperator(ctx: CalcContext): string {
    if (ctx.PLUS()) return "+";
    if (ctx.MINUS()) return "-";
    if (ctx.STAR()) return "*";
    if (ctx.SLASH()) return "/";
    if (ctx.PERCENT()) return "%";
    return "";
  }

  // === Utility Methods ===

  private nodeId(ctx: ParserRuleContext): number {
    return ctx.start?.tokenIndex ?? 0;
  }

  private setType(ctx: ParserRuleContext, type: Type): Type {
    this.typeMap.set(this.nodeId(ctx), type);
    return type;
  }

  private setRef(ctx: ParserRuleContext, name: string, overloadIds: string[]): void {
    this.refMap.set(this.nodeId(ctx), { name, overloadIds });
  }
}

/**
 * Type check a parsed CEL expression
 */
export function check(tree: StartContext, env: CheckerEnv): CheckResult {
  const checker = new Checker(env);
  return checker.check(tree);
}
