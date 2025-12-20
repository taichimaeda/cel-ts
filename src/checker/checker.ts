// CEL Type Checker
// Type checks CEL expressions using the AST representation
// Ported from cel-go/checker/checker.go

import type { ExprId } from "../common/ast";
import {
  type AST,
  type CallExpr,
  type ComprehensionExpr,
  type Expr,
  ExprKind,
  FunctionReference,
  type IdentExpr,
  IdentReference,
  type ListExpr,
  type LiteralExpr,
  type MapExpr,
  type ReferenceInfo,
  type SelectExpr,
  type StructExpr,
} from "../common/ast";
import type { SourceInfo } from "../common/source";
import { type OverloadDecl, VariableDecl } from "./decls";
import type { CheckerEnv } from "./env";
import { CheckerErrors, type Location } from "./errors";
import { TypeMapping } from "./mapping";
import {
  BoolType,
  BytesType,
  DoubleType,
  DynType,
  ErrorType,
  IntType,
  ListType,
  MapType,
  NullType,
  StringType,
  Type,
  TypeKind,
  TypeParamType,
  UintType,
  isAssignable,
  joinTypes,
} from "./types";

/**
 * Result of type checking
 */
export interface CheckResult {
  /** The AST with type information */
  ast: AST;
  /** Collected errors */
  errors: CheckerErrors;
}

/**
 * Type checker implementation
 */
export class Checker {
  private sourceInfo!: SourceInfo;
  private mapping: TypeMapping = new TypeMapping();
  private errors: CheckerErrors = new CheckerErrors();
  private typeVarCounter = 0;

  constructor(
    private readonly env: CheckerEnv,
    private readonly typeMap: Map<ExprId, Type>,
    private readonly refMap: Map<ExprId, ReferenceInfo>,
  ) { }

  /**
   * Check an AST expression
   */
  check(ast: AST): CheckResult {
    this.sourceInfo = ast.sourceInfo;
    this.checkExpr(ast.expr);

    // Substitute type parameters in final type map
    for (const [id, typ] of this.typeMap) {
      this.typeMap.set(id, this.mapping.substitute(typ, true));
    }

    const errors = this.errors;
    return { ast, errors };
  }

  /**
   * Check an expression node
   */
  private checkExpr(expr: Expr): void {
    switch (expr.kind) {
      case ExprKind.Literal:
        this.checkLiteral(expr as LiteralExpr);
        break;
      case ExprKind.Ident:
        this.checkIdent(expr as IdentExpr);
        break;
      case ExprKind.Select:
        this.checkSelect(expr as SelectExpr);
        break;
      case ExprKind.Call:
        this.checkCall(expr as CallExpr);
        break;
      case ExprKind.List:
        this.checkList(expr as ListExpr);
        break;
      case ExprKind.Map:
        this.checkMap(expr as MapExpr);
        break;
      case ExprKind.Struct:
        this.checkStruct(expr as StructExpr);
        break;
      case ExprKind.Comprehension:
        this.checkComprehension(expr as ComprehensionExpr);
        break;
      default:
        this.setType(expr.id, DynType);
    }
  }

  /**
   * Check a literal expression
   */
  private checkLiteral(expr: LiteralExpr): void {
    const value = expr.value;
    switch (value.kind) {
      case "bool":
        this.setType(expr.id, BoolType);
        break;
      case "bytes":
        this.setType(expr.id, BytesType);
        break;
      case "double":
        this.setType(expr.id, DoubleType);
        break;
      case "int":
        this.setType(expr.id, IntType);
        break;
      case "null":
        this.setType(expr.id, NullType);
        break;
      case "string":
        this.setType(expr.id, StringType);
        break;
      case "uint":
        this.setType(expr.id, UintType);
        break;
      default:
        this.setType(expr.id, DynType);
    }
  }

  /**
   * Check an identifier expression
   */
  private checkIdent(expr: IdentExpr): void {
    const identName = expr.name;

    // Check if identifier is declared
    const ident = this.env.lookupIdent(identName);
    if (ident) {
      this.setType(expr.id, ident.type);
      this.setRef(expr.id, new IdentReference(ident.name));
      return;
    }

    this.setType(expr.id, ErrorType);
    this.errors.reportUndeclaredReference(
      expr.id,
      this.env.container.name,
      identName,
      this.getLocation(expr.id)
    );
  }

  /**
   * Check a select expression (field access or presence test)
   */
  private checkSelect(expr: SelectExpr): void {
    // Before traversing down the tree, try to interpret as qualified name
    const name = this.resolveQualifiedName(expr);
    if (name) {
      const ident = this.env.lookupIdent(name);
      if (ident) {
        this.setType(expr.id, ident.type);
        this.setRef(expr.id, new IdentReference(ident.name));
        return;
      }
    }

    // Check the operand first
    this.checkExpr(expr.operand);
    const operandType = this.mapping.substitute(this.getType(expr.operand.id), false);

    // Check field selection
    let resultType = this.checkSelectField(expr.id, operandType, expr.field);

    // Presence test returns bool
    if (expr.testOnly) {
      resultType = BoolType;
    }

    this.setType(expr.id, this.mapping.substitute(resultType, false));
  }

  /**
   * Check field selection on a type
   */
  private checkSelectField(id: ExprId, targetType: Type, field: string): Type {
    // Default to error
    let resultType = ErrorType;

    switch (targetType.kind) {
      case TypeKind.Map:
        // Maps yield their value type
        resultType = targetType.mapValueType() ?? DynType;
        break;

      case TypeKind.Struct:
        // Structs yield their field type
        const fieldType = this.env.lookupFieldType(targetType, field);
        if (fieldType) {
          resultType = fieldType;
        } else {
          this.errors.reportUndefinedField(id, field, this.getLocation(id));
        }
        break;

      case TypeKind.TypeParam:
        // Type param gets treated as dyn
        this.mapping.isAssignable(DynType, targetType);
        resultType = DynType;
        break;

      default:
        // Dynamic/error values are treated as dyn
        if (!targetType.isDynOrError()) {
          this.errors.reportUnexpectedType(id, "struct or map", targetType, this.getLocation(id));
        }
        resultType = DynType;
    }

    return resultType;
  }

  /**
   * Check a call expression
   */
  private checkCall(expr: CallExpr): void {
    // Check arguments
    for (const arg of expr.args) {
      this.checkExpr(arg);
    }

    // Member call vs global call
    if (expr.target) {
      this.checkMemberCall(expr);
    } else {
      this.checkGlobalCall(expr);
    }
  }

  /**
   * Check a global function call
   */
  private checkGlobalCall(expr: CallExpr): void {
    const fnName = expr.funcName;

    // Special-case the conditional (ternary) operator.
    // Join differing branch types with joinTypes.
    if (fnName === "_?_:_" && expr.args.length === 3) {
      this.checkConditional(expr);
      return;
    }

    // Check function exists
    const fn = this.env.lookupFunction(fnName);
    if (!fn) {
      this.errors.reportUndeclaredReference(
        expr.id,
        this.env.container.name,
        fnName,
        this.getLocation(expr.id)
      );
      this.setType(expr.id, ErrorType);
      return;
    }

    // Resolve overload
    const argTypes = expr.args.map((arg) => this.getType(arg.id));
    const overloads = fn.overloads().filter((o) => !o.isMemberFunction);
    this.resolveOverloadOrError(expr, overloads, argTypes, false);
  }

  /**
   * Check the conditional (ternary) operator.
   * Condition must be bool and the result type joins both branches.
   */
  private checkConditional(expr: CallExpr): void {
    const condArg = expr.args[0]!;
    const trueArg = expr.args[1]!;
    const falseArg = expr.args[2]!;

    // Condition must be bool
    const condType = this.getType(condArg.id);
    if (!this.mapping.isAssignable(BoolType, condType)) {
      this.errors.reportTypeMismatch(
        condArg.id,
        BoolType,
        condType,
        this.getLocation(condArg.id)
      );
    }

    // Retrieve branch types and join them
    const trueType = this.mapping.substitute(this.getType(trueArg.id), false);
    const falseType = this.mapping.substitute(this.getType(falseArg.id), false);
    const resultType = joinTypes(trueType, falseType);

    this.setType(expr.id, resultType);
    this.setRef(expr.id, new FunctionReference("conditional"));
  }

  /**
   * Check a member function call
   */
  private checkMemberCall(expr: CallExpr): void {
    const fnName = expr.funcName;
    const target = expr.target!;

    // Check target first
    this.checkExpr(target);

    // Try qualified name interpretation
    const name = this.resolveQualifiedName(target);
    if (name) {
      const maybeQualifiedName = `${name}.${fnName}`;
      const fn = this.env.lookupFunction(maybeQualifiedName);
      if (fn) {
        const argTypes = expr.args.map((arg) => this.getType(arg.id));
        const overloads = fn.overloads().filter((o) => !o.isMemberFunction);
        this.resolveOverloadOrError(expr, overloads, argTypes, false);
        return;
      }
    }

    // Regular member call
    const fn = this.env.lookupFunction(fnName);
    if (fn) {
      const targetType = this.getType(target.id);
      const argTypes = [targetType, ...expr.args.map((arg) => this.getType(arg.id))];
      const overloads = fn.overloads().filter((o) => o.isMemberFunction);
      this.resolveOverloadOrError(expr, overloads, argTypes, true);
      return;
    }

    // Check for type-specific methods
    const receiverType = this.getType(target.id);
    const methodType = this.resolveMethodType(receiverType, fnName, expr.args.length);
    if (methodType) {
      this.setType(expr.id, methodType);
      return;
    }

    this.errors.reportUndeclaredReference(
      expr.id,
      this.env.container.name,
      fnName,
      this.getLocation(expr.id)
    );
    this.setType(expr.id, ErrorType);
  }

  /**
   * Check list creation
   */
  private checkList(expr: ListExpr): void {
    const elemTypes: Type[] = [];

    for (const elem of expr.elements) {
      this.checkExpr(elem);
      elemTypes.push(this.getType(elem.id));
    }

    if (elemTypes.length === 0) {
      this.setType(expr.id, new ListType(DynType));
      return;
    }

    // Join all element types
    let elemType = elemTypes[0]!;
    for (let i = 1; i < elemTypes.length; i++) {
      elemType = joinTypes(elemType, elemTypes[i]!);
    }

    this.setType(expr.id, new ListType(elemType));
  }

  /**
   * Check map creation
   */
  private checkMap(expr: MapExpr): void {
    const keyTypes: Type[] = [];
    const valueTypes: Type[] = [];

    for (const entry of expr.entries) {
      this.checkExpr(entry.key);
      this.checkExpr(entry.value);
      keyTypes.push(this.getType(entry.key.id));
      valueTypes.push(this.getType(entry.value.id));
    }

    if (keyTypes.length === 0) {
      this.setType(expr.id, new MapType(DynType, DynType));
      return;
    }

    // Join all key and value types
    let keyType = keyTypes[0]!;
    let valueType = valueTypes[0]!;
    for (let i = 1; i < keyTypes.length; i++) {
      keyType = joinTypes(keyType, keyTypes[i]!);
      valueType = joinTypes(valueType, valueTypes[i]!);
    }

    this.setType(expr.id, new MapType(keyType, valueType));
  }

  /**
   * Check struct creation
   */
  private checkStruct(expr: StructExpr): void {
    const typeName = expr.typeName;

    // Look up struct type
    const structType = this.env.provider?.findStructType(typeName);
    if (!structType) {
      this.errors.reportNotAMessageType(expr.id, typeName, this.getLocation(expr.id));
      this.setType(expr.id, DynType);
      return;
    }

    // Check field initializers
    for (const field of expr.fields) {
      this.checkExpr(field.value);

      // Validate field exists
      const fieldType = this.env.lookupFieldType(structType, field.name);
      if (!fieldType) {
        this.errors.reportUndefinedField(field.id, field.name, this.getLocation(field.id));
      } else {
        const valueType = this.getType(field.value.id);
        if (!valueType.isDynOrError() && !isAssignable(fieldType, valueType)) {
          this.errors.reportTypeMismatch(
            field.id,
            fieldType,
            valueType,
            this.getLocation(field.id)
          );
        }
      }
    }

    this.setType(expr.id, structType);
  }

  /**
   * Check comprehension expression (from macro expansion)
   */
  private checkComprehension(expr: ComprehensionExpr): void {
    // Check the iteration range
    this.checkExpr(expr.iterRange);
    const rangeType = this.getType(expr.iterRange.id);

    // Determine the iteration variable type from the range
    let iterVarType = DynType;
    if (rangeType.kind === TypeKind.List) {
      iterVarType = rangeType.listElementType() ?? DynType;
    } else if (rangeType.kind === TypeKind.Map) {
      iterVarType = rangeType.mapKeyType() ?? DynType;
    }

    // Push iteration variable into scope
    this.env.enterScope();
    this.env.addVariables(new VariableDecl(expr.iterVar, iterVarType));

    // Check accumulator initializer
    this.checkExpr(expr.accuInit);
    const accuType = this.getType(expr.accuInit.id);

    // Push accumulator variable into scope
    this.env.addVariables(new VariableDecl(expr.accuVar, accuType));

    // Check loop condition
    this.checkExpr(expr.loopCondition);
    const condType = this.getType(expr.loopCondition.id);
    if (!condType.isDynOrError() && condType.kind !== TypeKind.Bool) {
      this.errors.reportTypeMismatch(
        expr.loopCondition.id,
        BoolType,
        condType,
        this.getLocation(expr.loopCondition.id)
      );
    }

    // Check loop step
    this.checkExpr(expr.loopStep);
    const stepType = this.getType(expr.loopStep.id);
    if (!stepType.isDynOrError() && !accuType.isDynOrError()) {
      if (!isAssignable(accuType, stepType)) {
        this.errors.reportTypeMismatch(
          expr.loopStep.id,
          accuType,
          stepType,
          this.getLocation(expr.loopStep.id)
        );
      }
    }

    // Check result
    this.checkExpr(expr.result);

    // Pop scope
    this.env.exitScope();

    this.setType(expr.id, this.getType(expr.result.id));
  }

  /**
   * Resolve overload or report error
   */
  private resolveOverloadOrError(
    expr: CallExpr,
    overloads: OverloadDecl[],
    argTypes: Type[],
    isMemberCall: boolean
  ): void {
    const resolved = this.resolveOverload(overloads, argTypes, isMemberCall);
    if (!resolved) {
      this.errors.reportNoMatchingOverload(
        expr.id,
        expr.funcName,
        argTypes,
        isMemberCall,
        this.getLocation(expr.id)
      );
      this.setType(expr.id, ErrorType);
      return;
    }

    this.setType(expr.id, resolved.resultType);
    this.setRef(expr.id, new FunctionReference(...resolved.overloadIds));
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
          const typeParam = new TypeParamType(param);
          const freshVar = new TypeParamType(`_var${this.typeVarCounter++}`);
          tempMapping.add(typeParam, freshVar);
        }
      }

      let matches = true;
      for (let i = 0; i < argTypes.length; i++) {
        const paramType = tempMapping.substitute(overload.argTypes[i]!, false);
        if (!tempMapping.isAssignable(paramType, argTypes[i]!)) {
          matches = false;
          break;
        }
      }

      if (matches) {
        matchingOverloads.push(overload);
        const overloadResultType = tempMapping.substitute(overload.resultType, true);
        if (resultType === null) {
          resultType = overloadResultType;
        } else if (!resultType.isEquivalentType(overloadResultType)) {
          resultType = DynType;
        }
      }
    }

    if (matchingOverloads.length === 0) return null;

    return {
      resultType: resultType ?? DynType,
      overloadIds: matchingOverloads.map((o) => o.id),
    };
  }

  /**
   * Resolve method type for built-in type methods
   */
  private resolveMethodType(receiverType: Type, methodName: string, argCount: number): Type | null {
    if (receiverType.isDynOrError()) {
      return DynType;
    }

    // List methods
    if (receiverType.kind === TypeKind.List) {
      if (methodName === "size" && argCount === 0) {
        return IntType;
      }
    }

    // String methods
    if (receiverType.kind === TypeKind.String) {
      if (methodName === "size") return IntType;
      if (methodName === "indexOf" || methodName === "lastIndexOf") return IntType;
      if (["startsWith", "endsWith", "contains", "matches"].includes(methodName)) return BoolType;
      if (["toLowerCase", "toUpperCase", "trim", "substring", "replace"].includes(methodName))
        return StringType;
      if (methodName === "split") return new ListType(StringType);
    }

    // Map methods
    if (receiverType.kind === TypeKind.Map) {
      if (methodName === "size" && argCount === 0) {
        return IntType;
      }
    }

    // Timestamp methods
    if (receiverType.kind === TypeKind.Timestamp) {
      if (
        [
          "getFullYear",
          "getMonth",
          "getDayOfMonth",
          "getDayOfWeek",
          "getDayOfYear",
          "getHours",
          "getMinutes",
          "getSeconds",
          "getMilliseconds",
        ].includes(methodName)
      ) {
        return IntType;
      }
    }

    // Duration methods
    if (receiverType.kind === TypeKind.Duration) {
      if (["getHours", "getMinutes", "getSeconds", "getMilliseconds"].includes(methodName)) {
        return IntType;
      }
    }

    return null;
  }

  /**
   * Try to convert an expression to a qualified name
   */
  private resolveQualifiedName(expr: Expr): string | null {
    switch (expr.kind) {
      case ExprKind.Ident:
        return (expr as IdentExpr).name;
      case ExprKind.Select: {
        const select = expr as SelectExpr;
        if (select.testOnly) return null;
        const prefix = this.resolveQualifiedName(select.operand);
        if (prefix) {
          return `${prefix}.${select.field}`;
        }
        return null;
      }
      default:
        return null;
    }
  }

  // ============================================================================
  // Utility methods
  // ============================================================================

  private getType(id: ExprId): Type {
    return this.typeMap.get(id) ?? DynType;
  }

  private setType(id: ExprId, type: Type): void {
    this.typeMap.set(id, type);
  }

  private setRef(id: ExprId, ref: ReferenceInfo): void {
    this.refMap.set(id, ref);
  }

  private getLocation(exprId: ExprId): Location | undefined {
    const position = this.sourceInfo.getPosition(exprId);
    if (!position) {
      return undefined;
    }
    const { line, column } = this.sourceInfo.getLocation(position.start);
    return {
      line,
      column,
      offset: position.start,
    };
  }
}
