// CEL Type Checker
// Type checks CEL expressions using the AST representation
// Ported from cel-go/checker/checker.go

import type { SourceInfo } from "../common/ast";
import {
  type AST,
  type CallExpr,
  type ComprehensionExpr,
  type Expr,
  ExprKind,
  type IdentExpr,
  type ListExpr,
  type LiteralExpr,
  type MapExpr,
  type ReferenceInfo,
  type SelectExpr,
  type StructExpr,
  createFunctionReference,
  createIdentReference,
} from "../common/ast";
import { type OverloadDecl, VariableDecl } from "./decls";
import type { CheckerEnv } from "./env";
import { CheckerErrors, type Location } from "./errors";
import { TypeMapping, isAssignableWithMapping, joinTypes, substitute } from "./mapping";
import { Type, TypeKind, isAssignable, isDynOrError } from "./types";

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
  private readonly env: CheckerEnv;
  private readonly errors: CheckerErrors;
  private readonly typeMap: Map<number, Type>;
  private readonly refMap: Map<number, ReferenceInfo>;
  private sourceInfo!: SourceInfo;
  private mapping: TypeMapping = new TypeMapping();
  private typeVarCounter = 0;

  constructor(env: CheckerEnv, typeMap: Map<number, Type>, refMap: Map<number, ReferenceInfo>) {
    this.env = env;
    this.errors = new CheckerErrors();
    this.typeMap = typeMap;
    this.refMap = refMap;
  }

  /**
   * Check an AST expression
   */
  check(ast: AST): CheckResult {
    this.sourceInfo = ast.sourceInfo;
    this.checkExpr(ast.expr);

    // Substitute type parameters in final type map
    for (const [id, t] of this.typeMap) {
      this.typeMap.set(id, substitute(t, this.mapping, true));
    }

    return {
      ast,
      errors: this.errors,
    };
  }

  /**
   * Check an expression node
   */
  private checkExpr(e: Expr): void {
    switch (e.kind) {
      case ExprKind.Literal:
        this.checkLiteral(e as LiteralExpr);
        break;
      case ExprKind.Ident:
        this.checkIdent(e as IdentExpr);
        break;
      case ExprKind.Select:
        this.checkSelect(e as SelectExpr);
        break;
      case ExprKind.Call:
        this.checkCall(e as CallExpr);
        break;
      case ExprKind.List:
        this.checkCreateList(e as ListExpr);
        break;
      case ExprKind.Map:
        this.checkCreateMap(e as MapExpr);
        break;
      case ExprKind.Struct:
        this.checkCreateStruct(e as StructExpr);
        break;
      case ExprKind.Comprehension:
        this.checkComprehension(e as ComprehensionExpr);
        break;
      default:
        this.setType(e.id, Type.Dyn);
    }
  }

  /**
   * Check a literal expression
   */
  private checkLiteral(e: LiteralExpr): void {
    const value = e.value;
    switch (value.kind) {
      case "bool":
        this.setType(e.id, Type.Bool);
        break;
      case "bytes":
        this.setType(e.id, Type.Bytes);
        break;
      case "double":
        this.setType(e.id, Type.Double);
        break;
      case "int":
        this.setType(e.id, Type.Int);
        break;
      case "null":
        this.setType(e.id, Type.Null);
        break;
      case "string":
        this.setType(e.id, Type.String);
        break;
      case "uint":
        this.setType(e.id, Type.Uint);
        break;
      default:
        this.setType(e.id, Type.Dyn);
    }
  }

  /**
   * Check an identifier expression
   */
  private checkIdent(e: IdentExpr): void {
    const identName = e.name;

    // Check if identifier is declared
    const ident = this.env.lookupIdent(identName);
    if (ident) {
      this.setType(e.id, ident.type);
      this.setRef(e.id, createIdentReference(ident.name));
      return;
    }

    this.setType(e.id, Type.Error);
    this.errors.reportUndeclaredReference(
      e.id,
      this.env.getContainer().name,
      identName,
      this.getLocation(e.id)
    );
  }

  /**
   * Check a select expression (field access or presence test)
   */
  private checkSelect(e: SelectExpr): void {
    // Before traversing down the tree, try to interpret as qualified name
    const qname = this.toQualifiedName(e);
    if (qname) {
      const ident = this.env.lookupIdent(qname);
      if (ident) {
        this.setType(e.id, ident.type);
        this.setRef(e.id, createIdentReference(ident.name));
        return;
      }
    }

    // Check the operand first
    this.checkExpr(e.operand);
    const operandType = substitute(this.getType(e.operand.id), this.mapping, false);

    // Check field selection
    let resultType = this.checkSelectField(e.id, operandType, e.field);

    // Presence test returns bool
    if (e.testOnly) {
      resultType = Type.Bool;
    }

    this.setType(e.id, substitute(resultType, this.mapping, false));
  }

  /**
   * Check field selection on a type
   */
  private checkSelectField(id: number, targetType: Type, field: string): Type {
    // Default to error
    let resultType = Type.Error;

    switch (targetType.kind) {
      case TypeKind.Map:
        // Maps yield their value type
        resultType = targetType.mapValueType() ?? Type.Dyn;
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
        this.isAssignable(Type.Dyn, targetType);
        resultType = Type.Dyn;
        break;

      default:
        // Dynamic/error values are treated as dyn
        if (!isDynOrError(targetType)) {
          this.errors.reportUnexpectedType(id, "struct or map", targetType, this.getLocation(id));
        }
        resultType = Type.Dyn;
    }

    return resultType;
  }

  /**
   * Check a call expression
   */
  private checkCall(e: CallExpr): void {
    // Check arguments
    for (const arg of e.args) {
      this.checkExpr(arg);
    }

    // Member call vs global call
    if (e.target) {
      this.checkMemberCall(e);
    } else {
      this.checkGlobalCall(e);
    }
  }

  /**
   * Check a global function call
   */
  private checkGlobalCall(e: CallExpr): void {
    const fnName = e.funcName;

    // Special-case the conditional (ternary) operator.
    // Join differing branch types with joinTypes.
    if (fnName === "_?_:_" && e.args.length === 3) {
      this.checkConditional(e);
      return;
    }

    // Check function exists
    const fn = this.env.lookupFunction(fnName);
    if (!fn) {
      this.errors.reportUndeclaredReference(
        e.id,
        this.env.getContainer().name,
        fnName,
        this.getLocation(e.id)
      );
      this.setType(e.id, Type.Error);
      return;
    }

    // Resolve overload
    const argTypes = e.args.map((arg) => this.getType(arg.id));
    const overloads = fn.overloads().filter((o) => !o.isMemberFunction);
    this.resolveOverloadOrError(e, overloads, argTypes, false);
  }

  /**
   * Check the conditional (ternary) operator.
   * Condition must be bool and the result type joins both branches.
   */
  private checkConditional(e: CallExpr): void {
    const condArg = e.args[0]!;
    const trueArg = e.args[1]!;
    const falseArg = e.args[2]!;

    // Condition must be bool
    const condType = this.getType(condArg.id);
    if (!this.isAssignable(Type.Bool, condType)) {
      this.errors.reportTypeMismatch(
        condArg.id,
        Type.Bool,
        condType,
        this.getLocation(condArg.id)
      );
    }

    // Retrieve branch types and join them
    const trueType = substitute(this.getType(trueArg.id), this.mapping, false);
    const falseType = substitute(this.getType(falseArg.id), this.mapping, false);
    const resultType = joinTypes(trueType, falseType);

    this.setType(e.id, resultType);
    this.setRef(e.id, createFunctionReference("conditional"));
  }

  /**
   * Check a member function call
   */
  private checkMemberCall(e: CallExpr): void {
    const fnName = e.funcName;
    const target = e.target!;

    // Check target first
    this.checkExpr(target);

    // Try qualified name interpretation
    const qname = this.toQualifiedName(target);
    if (qname) {
      const maybeQualifiedName = `${qname}.${fnName}`;
      const fn = this.env.lookupFunction(maybeQualifiedName);
      if (fn) {
        const argTypes = e.args.map((arg) => this.getType(arg.id));
        const overloads = fn.overloads().filter((o) => !o.isMemberFunction);
        this.resolveOverloadOrError(e, overloads, argTypes, false);
        return;
      }
    }

    // Regular member call
    const fn = this.env.lookupFunction(fnName);
    if (fn) {
      const targetType = this.getType(target.id);
      const argTypes = [targetType, ...e.args.map((arg) => this.getType(arg.id))];
      const overloads = fn.overloads().filter((o) => o.isMemberFunction);
      this.resolveOverloadOrError(e, overloads, argTypes, true);
      return;
    }

    // Check for type-specific methods
    const receiverType = this.getType(target.id);
    const methodType = this.resolveMethodType(receiverType, fnName, e.args.length);
    if (methodType) {
      this.setType(e.id, methodType);
      return;
    }

    this.errors.reportUndeclaredReference(
      e.id,
      this.env.getContainer().name,
      fnName,
      this.getLocation(e.id)
    );
    this.setType(e.id, Type.Error);
  }

  /**
   * Check list creation
   */
  private checkCreateList(e: ListExpr): void {
    const elemTypes: Type[] = [];

    for (const elem of e.elements) {
      this.checkExpr(elem);
      elemTypes.push(this.getType(elem.id));
    }

    if (elemTypes.length === 0) {
      this.setType(e.id, Type.newListType(Type.Dyn));
      return;
    }

    // Join all element types
    let elemType = elemTypes[0]!;
    for (let i = 1; i < elemTypes.length; i++) {
      elemType = joinTypes(elemType, elemTypes[i]!);
    }

    this.setType(e.id, Type.newListType(elemType));
  }

  /**
   * Check map creation
   */
  private checkCreateMap(e: MapExpr): void {
    const keyTypes: Type[] = [];
    const valueTypes: Type[] = [];

    for (const entry of e.entries) {
      this.checkExpr(entry.key);
      this.checkExpr(entry.value);
      keyTypes.push(this.getType(entry.key.id));
      valueTypes.push(this.getType(entry.value.id));
    }

    if (keyTypes.length === 0) {
      this.setType(e.id, Type.newMapType(Type.Dyn, Type.Dyn));
      return;
    }

    // Join all key and value types
    let keyType = keyTypes[0]!;
    let valueType = valueTypes[0]!;
    for (let i = 1; i < keyTypes.length; i++) {
      keyType = joinTypes(keyType, keyTypes[i]!);
      valueType = joinTypes(valueType, valueTypes[i]!);
    }

    this.setType(e.id, Type.newMapType(keyType, valueType));
  }

  /**
   * Check struct creation
   */
  private checkCreateStruct(e: StructExpr): void {
    const typeName = e.typeName;

    // Look up struct type
    const structType = this.env.getProvider().findStructType(typeName);
    if (!structType) {
      this.errors.reportNotAMessageType(e.id, typeName, this.getLocation(e.id));
      this.setType(e.id, Type.Dyn);
      return;
    }

    // Check field initializers
    for (const field of e.fields) {
      this.checkExpr(field.value);

      // Validate field exists
      const fieldType = this.env.lookupFieldType(structType, field.name);
      if (!fieldType) {
        this.errors.reportUndefinedField(field.id, field.name, this.getLocation(field.id));
      } else {
        const valueType = this.getType(field.value.id);
        if (!isDynOrError(valueType) && !isAssignable(fieldType, valueType)) {
          this.errors.reportTypeMismatch(
            field.id,
            fieldType,
            valueType,
            this.getLocation(field.id)
          );
        }
      }
    }

    this.setType(e.id, structType);
  }

  /**
   * Check comprehension expression (from macro expansion)
   */
  private checkComprehension(e: ComprehensionExpr): void {
    // Check the iteration range
    this.checkExpr(e.iterRange);
    const rangeType = this.getType(e.iterRange.id);

    // Determine the iteration variable type from the range
    let iterVarType = Type.Dyn;
    if (rangeType.kind === TypeKind.List) {
      iterVarType = rangeType.listElementType() ?? Type.Dyn;
    } else if (rangeType.kind === TypeKind.Map) {
      iterVarType = rangeType.mapKeyType() ?? Type.Dyn;
    }

    // Push iteration variable into scope
    this.env.enterScope();
    this.env.addIdents(new VariableDecl(e.iterVar, iterVarType));

    // Check accumulator initializer
    this.checkExpr(e.accuInit);
    const accuType = this.getType(e.accuInit.id);

    // Push accumulator variable into scope
    this.env.addIdents(new VariableDecl(e.accuVar, accuType));

    // Check loop condition
    this.checkExpr(e.loopCondition);
    const condType = this.getType(e.loopCondition.id);
    if (!isDynOrError(condType) && condType.kind !== TypeKind.Bool) {
      this.errors.reportTypeMismatch(
        e.loopCondition.id,
        Type.Bool,
        condType,
        this.getLocation(e.loopCondition.id)
      );
    }

    // Check loop step
    this.checkExpr(e.loopStep);
    const stepType = this.getType(e.loopStep.id);
    if (!isDynOrError(stepType) && !isDynOrError(accuType)) {
      if (!isAssignable(accuType, stepType)) {
        this.errors.reportTypeMismatch(
          e.loopStep.id,
          accuType,
          stepType,
          this.getLocation(e.loopStep.id)
        );
      }
    }

    // Check result
    this.checkExpr(e.result);

    // Pop scope
    this.env.exitScope();

    this.setType(e.id, this.getType(e.result.id));
  }

  /**
   * Resolve overload or report error
   */
  private resolveOverloadOrError(
    e: CallExpr,
    overloads: OverloadDecl[],
    argTypes: Type[],
    isMemberCall: boolean
  ): void {
    const resolved = this.resolveOverload(overloads, argTypes, isMemberCall);
    if (!resolved) {
      this.errors.reportNoMatchingOverload(
        e.id,
        e.funcName,
        argTypes,
        isMemberCall,
        this.getLocation(e.id)
      );
      this.setType(e.id, Type.Error);
      return;
    }

    this.setType(e.id, resolved.resultType);
    this.setRef(e.id, createFunctionReference(...resolved.overloadIds));
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

  /**
   * Resolve method type for built-in type methods
   */
  private resolveMethodType(receiverType: Type, methodName: string, argCount: number): Type | null {
    if (isDynOrError(receiverType)) {
      return Type.Dyn;
    }

    // List methods
    if (receiverType.kind === TypeKind.List) {
      if (methodName === "size" && argCount === 0) {
        return Type.Int;
      }
    }

    // String methods
    if (receiverType.kind === TypeKind.String) {
      if (methodName === "size") return Type.Int;
      if (methodName === "indexOf" || methodName === "lastIndexOf") return Type.Int;
      if (["startsWith", "endsWith", "contains", "matches"].includes(methodName)) return Type.Bool;
      if (["toLowerCase", "toUpperCase", "trim", "substring", "replace"].includes(methodName))
        return Type.String;
      if (methodName === "split") return Type.newListType(Type.String);
    }

    // Map methods
    if (receiverType.kind === TypeKind.Map) {
      if (methodName === "size" && argCount === 0) {
        return Type.Int;
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
        return Type.Int;
      }
    }

    // Duration methods
    if (receiverType.kind === TypeKind.Duration) {
      if (["getHours", "getMinutes", "getSeconds", "getMilliseconds"].includes(methodName)) {
        return Type.Int;
      }
    }

    return null;
  }

  /**
   * Try to convert an expression to a qualified name
   */
  private toQualifiedName(e: Expr): string | null {
    switch (e.kind) {
      case ExprKind.Ident:
        return (e as IdentExpr).name;
      case ExprKind.Select: {
        const sel = e as SelectExpr;
        if (sel.testOnly) return null;
        const prefix = this.toQualifiedName(sel.operand);
        if (prefix) {
          return `${prefix}.${sel.field}`;
        }
        return null;
      }
      default:
        return null;
    }
  }

  /**
   * Check if t1 is assignable to t2
   */
  private isAssignable(t1: Type, t2: Type): boolean {
    return isAssignableWithMapping(this.mapping, t1, t2);
  }

  // === Utility Methods ===

  private getType(id: number): Type {
    return this.typeMap.get(id) ?? Type.Dyn;
  }

  private setType(id: number, type: Type): void {
    this.typeMap.set(id, type);
  }

  private setRef(id: number, ref: ReferenceInfo): void {
    this.refMap.set(id, ref);
  }

  private getLocation(exprId: number): Location | undefined {
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

/**
 * Type check an AST
 */
export function check(ast: AST, env: CheckerEnv): CheckResult {
  const checker = new Checker(env, ast.typeMap, ast.refMap);
  return checker.check(ast);
}
