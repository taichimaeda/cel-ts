// CEL Type Checker
// Type checks CEL expressions using the AST representation
// Ported from cel-go/checker/checker.go

import type { ExprId } from "../common/ast";
import {
  type AST,
  CallExpr,
  ComprehensionExpr,
  type Expr,
  FunctionReference,
  IdentExpr,
  ListExpr,
  LiteralExpr,
  MapExpr,
  Operators,
  type ReferenceInfo,
  SelectExpr,
  StructExpr,
  VariableReference,
} from "../common/ast";
import type { SourceInfo } from "../common/source";
import { type FunctionOverloadDecl, VariableDecl } from "./decls";
import type { CheckerEnv } from "./env";
import { CheckerErrors, type Location } from "./error";
import { TypeMapping } from "./mapping";
import {
  ListType,
  MapType,
  OptionalType,
  PrimitiveTypes,
  type Type,
  TypeParamType,
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
    private env: CheckerEnv,
    private readonly typeMap: Map<ExprId, Type>,
    private readonly refMap: Map<ExprId, ReferenceInfo>
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
    if (expr instanceof LiteralExpr) {
      this.checkLiteral(expr);
      return;
    }
    if (expr instanceof IdentExpr) {
      this.checkIdent(expr);
      return;
    }
    if (expr instanceof SelectExpr) {
      this.checkSelect(expr);
      return;
    }
    if (expr instanceof CallExpr) {
      this.checkCall(expr);
      return;
    }
    if (expr instanceof ListExpr) {
      this.checkList(expr);
      return;
    }
    if (expr instanceof MapExpr) {
      this.checkMap(expr);
      return;
    }
    if (expr instanceof StructExpr) {
      this.checkStruct(expr);
      return;
    }
    if (expr instanceof ComprehensionExpr) {
      this.checkComprehension(expr);
      return;
    }
    this.setType(expr.id, PrimitiveTypes.Dyn);
  }

  /**
   * Check a literal expression
   */
  private checkLiteral(expr: LiteralExpr): void {
    const value = expr.value;
    switch (value.kind) {
      case "bool":
        this.setType(expr.id, PrimitiveTypes.Bool);
        break;
      case "bytes":
        this.setType(expr.id, PrimitiveTypes.Bytes);
        break;
      case "double":
        this.setType(expr.id, PrimitiveTypes.Double);
        break;
      case "int":
        this.setType(expr.id, PrimitiveTypes.Int);
        break;
      case "null":
        this.setType(expr.id, PrimitiveTypes.Null);
        break;
      case "string":
        this.setType(expr.id, PrimitiveTypes.String);
        break;
      case "uint":
        this.setType(expr.id, PrimitiveTypes.Uint);
        break;
      default:
        this.setType(expr.id, PrimitiveTypes.Dyn);
    }
  }

  /**
   * Check an identifier expression
   */
  private checkIdent(expr: IdentExpr): void {
    const identName = expr.name;

    // Check if identifier is declared
    const ident = this.env.lookupIdent(identName);
    if (ident !== undefined) {
      const value = ident.kind === "enum" ? ident.value : undefined;
      this.setType(expr.id, ident.type);
      this.setRef(expr.id, new VariableReference(ident.name, value));
      return;
    }

    this.setType(expr.id, PrimitiveTypes.Error);
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
    if (name !== undefined) {
      const ident = this.env.lookupIdent(name);
      if (ident !== undefined) {
        const value = ident.kind === "enum" ? ident.value : undefined;
        this.setType(expr.id, ident.type);
        this.setRef(expr.id, new VariableReference(ident.name, value));
        return;
      }
    }

    // Check the operand first
    this.checkExpr(expr.operand);
    let operandType = this.mapping.substitute(this.getType(expr.operand.id), false);
    let wrapOptional = expr.optional;
    if (operandType.isOptionalType()) {
      wrapOptional = true;
      operandType = operandType.parameters[0] ?? PrimitiveTypes.Dyn;
    }

    // Check field selection
    let resultType = this.checkSelectField(expr.id, operandType, expr.field);

    // Presence test returns bool
    if (expr.testOnly) {
      resultType = PrimitiveTypes.Bool;
    } else if (wrapOptional) {
      resultType = new OptionalType(resultType);
    }

    this.setType(expr.id, this.mapping.substitute(resultType, false));
  }

  /**
   * Check field selection on a type
   */
  private checkSelectField(id: ExprId, targetType: Type, field: string): Type {
    // Default to error
    let resultType = PrimitiveTypes.Error;

    switch (targetType.kind) {
      case "map":
        // Maps yield their value type
        resultType = targetType.mapValueType() ?? PrimitiveTypes.Dyn;
        break;

      case "struct":
        // Structs yield their field type
        const fieldType = this.env.lookupFieldType(targetType, field);
        if (fieldType !== undefined) {
          resultType = fieldType;
        } else {
          this.errors.reportUndefinedField(id, field, this.getLocation(id));
        }
        break;

      case "type_param":
        // Type param gets treated as dyn
        this.mapping.isAssignable(PrimitiveTypes.Dyn, targetType);
        resultType = PrimitiveTypes.Dyn;
        break;

      default:
        // Dynamic/error values are treated as dyn
        if (!targetType.isDynOrError()) {
          this.errors.reportUnexpectedType(id, "struct or map", targetType, this.getLocation(id));
        }
        resultType = PrimitiveTypes.Dyn;
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
    const funcName = expr.funcName;

    // Special-case the conditional (ternary) operator.
    // Join differing branch types with joinTypes.
    if (funcName === Operators.Conditional && expr.args.length === 3) {
      this.checkConditional(expr);
      return;
    }

    // Check function exists
    const func = this.env.lookupFunction(funcName);
    if (func === undefined) {
      const maybeType = this.env.lookupIdent(funcName);
      if (maybeType?.kind === "type") {
        if (expr.args.length !== 1) {
          const argTypes = expr.args.map((arg) => this.getType(arg.id));
          this.errors.reportNoMatchingOverload(
            expr.id,
            funcName,
            argTypes,
            false,
            this.getLocation(expr.id)
          );
          this.setType(expr.id, PrimitiveTypes.Error);
          return;
        }
        const targetType = maybeType.type.parameters[0] ?? PrimitiveTypes.Dyn;
        this.setType(expr.id, targetType);
        this.setRef(expr.id, new VariableReference(maybeType.name));
        return;
      }
      this.errors.reportUndeclaredReference(
        expr.id,
        this.env.container.name,
        funcName,
        this.getLocation(expr.id)
      );
      this.setType(expr.id, PrimitiveTypes.Error);
      return;
    }

    // Resolve overload
    const argTypes = expr.args.map((arg) => this.getType(arg.id));
    const overloads = func.overloads().filter((o) => !o.isMemberFunction);
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
    if (!this.mapping.isAssignable(PrimitiveTypes.Bool, condType)) {
      this.errors.reportTypeMismatch(condArg.id, PrimitiveTypes.Bool, condType, this.getLocation(condArg.id));
    }

    // Retrieve branch types and join them
    const trueType = this.mapping.substitute(this.getType(trueArg.id), false);
    const falseType = this.mapping.substitute(this.getType(falseArg.id), false);
    const resultType = joinTypes(trueType, falseType);

    this.setType(expr.id, resultType);
    this.setRef(expr.id, new FunctionReference(["conditional"]));
  }

  /**
   * Check a member function call
   */
  private checkMemberCall(expr: CallExpr): void {
    const funcName = expr.funcName;
    const target = expr.target!;

    // Try qualified name interpretation
    const name = this.resolveQualifiedName(target);
    if (name !== undefined) {
      const maybeQualifiedName = `${name}.${funcName}`;
      const func = this.env.lookupFunction(maybeQualifiedName);
      if (func !== undefined) {
        const argTypes = expr.args.map((arg) => this.getType(arg.id));
        const overloads = func.overloads().filter((o) => !o.isMemberFunction);
        this.resolveOverloadOrError(expr, overloads, argTypes, false, maybeQualifiedName);
        return;
      }
      const maybeType = this.env.lookupIdent(maybeQualifiedName);
      if (maybeType?.kind === "type") {
        if (expr.args.length !== 1) {
          const argTypes = expr.args.map((arg) => this.getType(arg.id));
          this.errors.reportNoMatchingOverload(
            expr.id,
            maybeQualifiedName,
            argTypes,
            false,
            this.getLocation(expr.id)
          );
          this.setType(expr.id, PrimitiveTypes.Error);
          return;
        }
        const targetType = maybeType.type.parameters[0] ?? PrimitiveTypes.Dyn;
        this.setType(expr.id, targetType);
        this.setRef(expr.id, new VariableReference(maybeType.name));
        return;
      }
    }

    // Check target first
    this.checkExpr(target);

    // Regular member call
    const func = this.env.lookupFunction(funcName);
    if (func !== undefined) {
      const targetType = this.getType(target.id);
      const argTypes = [targetType, ...expr.args.map((arg) => this.getType(arg.id))];
      const overloads = func.overloads().filter((o) => o.isMemberFunction);
      this.resolveOverloadOrError(expr, overloads, argTypes, true);
      return;
    }

    // Check for type-specific methods
    const receiverType = this.getType(target.id);
    const methodType = this.resolveMethodType(receiverType, funcName, expr.args.length);
    if (methodType !== undefined) {
      this.setType(expr.id, methodType);
      return;
    }

    this.errors.reportUndeclaredReference(
      expr.id,
      this.env.container.name,
      funcName,
      this.getLocation(expr.id)
    );
    this.setType(expr.id, PrimitiveTypes.Error);
  }

  /**
   * Check list creation
   */
  private checkList(expr: ListExpr): void {
    const elemTypes: Type[] = [];
    const optionalIndices = new Set(expr.optionalIndices ?? []);

    for (let i = 0; i < expr.elements.length; i++) {
      const elem = expr.elements[i]!;
      this.checkExpr(elem);
      let elemType = this.getType(elem.id);
      if (optionalIndices.has(i)) {
        if (elemType.isOptionalType()) {
          elemType = elemType.parameters[0] ?? PrimitiveTypes.Dyn;
        } else if (!elemType.isDynOrError()) {
          this.errors.reportTypeMismatch(
            elem.id,
            new OptionalType(PrimitiveTypes.Dyn),
            elemType,
            this.getLocation(elem.id)
          );
        }
      }
      elemTypes.push(elemType);
    }

    if (elemTypes.length === 0) {
      const typeParam = new TypeParamType(`_list${expr.id}`);
      this.setType(expr.id, new ListType(typeParam));
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
      let valueType = this.getType(entry.value.id);
      if (entry.optional) {
        if (valueType.isOptionalType()) {
          valueType = valueType.parameters[0] ?? PrimitiveTypes.Dyn;
        } else if (!valueType.isDynOrError()) {
          this.errors.reportTypeMismatch(
            entry.value.id,
            new OptionalType(PrimitiveTypes.Dyn),
            valueType,
            this.getLocation(entry.value.id)
          );
        }
      }
      valueTypes.push(valueType);
    }

    if (keyTypes.length === 0) {
      this.setType(expr.id, new MapType(PrimitiveTypes.Dyn, PrimitiveTypes.Dyn));
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
    const typeName = expr.typeName.startsWith(".") ? expr.typeName.slice(1) : expr.typeName;

    // Look up struct type
    const structType = this.env.lookupStructType(typeName);
    if (structType === undefined) {
      this.errors.reportNotAMessageType(expr.id, typeName, this.getLocation(expr.id));
      this.setType(expr.id, PrimitiveTypes.Dyn);
      return;
    }

    // Check field initializers
    for (const field of expr.fields) {
      this.checkExpr(field.value);

      // Validate field exists
      const fieldType = this.env.lookupFieldType(structType, field.name);
      if (fieldType === undefined) {
        this.errors.reportUndefinedField(field.id, field.name, this.getLocation(field.id));
      } else {
        let valueType = this.getType(field.value.id);
        if (field.optional) {
          if (valueType.isOptionalType()) {
            valueType = valueType.parameters[0] ?? PrimitiveTypes.Dyn;
          } else if (!valueType.isDynOrError()) {
            this.errors.reportTypeMismatch(
              field.id,
              new OptionalType(fieldType),
              valueType,
              this.getLocation(field.id)
            );
            continue;
          }
        }
        if (valueType.kind === "null_type") {
          continue;
        }
        if (!valueType.isDynOrError() && !this.mapping.isAssignable(fieldType, valueType)) {
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
    const rangeType = this.mapping.substitute(this.getType(expr.iterRange.id), false);

    // Determine the iteration variable type from the range
    let iterVarType = PrimitiveTypes.Dyn;
    let iterVar2Type: Type | undefined;
    if (rangeType.kind === "list") {
      if (expr.iterVar2) {
        iterVarType = PrimitiveTypes.Int;
        iterVar2Type = rangeType.listElementType() ?? PrimitiveTypes.Dyn;
      } else {
        iterVarType = rangeType.listElementType() ?? PrimitiveTypes.Dyn;
      }
    } else if (rangeType.kind === "map") {
      iterVarType = rangeType.mapKeyType() ?? PrimitiveTypes.Dyn;
      if (expr.iterVar2) {
        iterVar2Type = rangeType.mapValueType() ?? PrimitiveTypes.Dyn;
      }
    }

    // Push iteration variable into scope
    this.env = this.env.enterScope();
    this.env.addVariables(new VariableDecl(expr.iterVar, iterVarType));
    if (expr.iterVar2) {
      this.env.addVariables(new VariableDecl(expr.iterVar2, iterVar2Type ?? PrimitiveTypes.Dyn));
    }

    // Check accumulator initializer
    this.checkExpr(expr.accuInit);
    const accuType = this.mapping.substitute(this.getType(expr.accuInit.id), false);

    // Push accumulator variable into scope
    this.env.addVariables(new VariableDecl(expr.accuVar, accuType));

    // Check loop condition
    this.checkExpr(expr.loopCondition);
    const condType = this.getType(expr.loopCondition.id);
    if (!condType.isDynOrError() && condType.kind !== "bool") {
      this.errors.reportTypeMismatch(
        expr.loopCondition.id,
        PrimitiveTypes.Bool,
        condType,
        this.getLocation(expr.loopCondition.id)
      );
    }

    // Check loop step
    this.checkExpr(expr.loopStep);
    const stepType = this.getType(expr.loopStep.id);
    if (!stepType.isDynOrError() && !accuType.isDynOrError()) {
      if (!this.mapping.isAssignable(accuType, stepType)) {
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
    this.env = this.env.exitScope();

    this.setType(expr.id, this.getType(expr.result.id));
  }

  /**
   * Resolve overload or report error
   */
  private resolveOverloadOrError(
    expr: CallExpr,
    overloads: FunctionOverloadDecl[],
    argTypes: Type[],
    isMemberCall: boolean,
    resolvedName?: string
  ): void {
    const resolved = this.resolveOverload(overloads, argTypes, isMemberCall);
    if (resolved === undefined) {
      this.errors.reportNoMatchingOverload(
        expr.id,
        expr.funcName,
        argTypes,
        isMemberCall,
        this.getLocation(expr.id)
      );
      this.setType(expr.id, PrimitiveTypes.Error);
      return;
    }

    this.setType(expr.id, resolved.resultType);
    if (resolvedName !== undefined) {
      this.setRef(expr.id, new FunctionReference(resolved.overloadIds, resolvedName));
    } else {
      this.setRef(expr.id, new FunctionReference(resolved.overloadIds));
    }
  }

  /**
   * Resolve overload from candidates
   */
  private resolveOverload(
    overloads: FunctionOverloadDecl[],
    argTypes: Type[],
    isMemberCall: boolean
  ): { resultType: Type; overloadIds: string[] } | undefined {
    const matchingOverloads: FunctionOverloadDecl[] = [];
    let resultType: Type | undefined;

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
        const overloadResultType = tempMapping.substitute(overload.resultType, false);
        if (resultType === undefined) {
          resultType = overloadResultType;
        } else if (!resultType.isEquivalentType(overloadResultType)) {
          resultType = PrimitiveTypes.Dyn;
        }
      }
    }

    if (matchingOverloads.length === 0) return undefined;

    return {
      resultType: resultType ?? PrimitiveTypes.Dyn,
      overloadIds: matchingOverloads.map((o) => o.id),
    };
  }

  /**
   * Resolve method type for built-in type methods
   */
  private resolveMethodType(
    receiverType: Type,
    methodName: string,
    argCount: number
  ): Type | undefined {
    if (receiverType.isDynOrError()) {
      return PrimitiveTypes.Dyn;
    }

    // List methods
    if (receiverType.kind === "list") {
      if (methodName === "size" && argCount === 0) {
        return PrimitiveTypes.Int;
      }
    }

    // String methods
    if (receiverType.kind === "string") {
      if (methodName === "size") return PrimitiveTypes.Int;
      if (methodName === "indexOf" || methodName === "lastIndexOf") return PrimitiveTypes.Int;
      if (["startsWith", "endsWith", "contains", "matches"].includes(methodName)) return PrimitiveTypes.Bool;
      if (["toLowerCase", "toUpperCase", "trim", "substring", "replace"].includes(methodName))
        return PrimitiveTypes.String;
      if (methodName === "split") return new ListType(PrimitiveTypes.String);
    }

    // Map methods
    if (receiverType.kind === "map") {
      if (methodName === "size" && argCount === 0) {
        return PrimitiveTypes.Int;
      }
    }

    // Timestamp methods
    if (receiverType.kind === "timestamp") {
      if (
        [
          "getFullYear",
          "getMonth",
          "getDate",
          "getDayOfMonth",
          "getDayOfWeek",
          "getDayOfYear",
          "getHours",
          "getMinutes",
          "getSeconds",
          "getMilliseconds",
        ].includes(methodName)
      ) {
        return PrimitiveTypes.Int;
      }
    }

    // Duration methods
    if (receiverType.kind === "duration") {
      if (["getHours", "getMinutes", "getSeconds", "getMilliseconds"].includes(methodName)) {
        return PrimitiveTypes.Int;
      }
    }

    return undefined;
  }

  /**
   * Try to convert an expression to a qualified name
   */
  private resolveQualifiedName(expr: Expr): string | undefined {
    if (expr instanceof IdentExpr) {
      return expr.name;
    }
    if (expr instanceof SelectExpr) {
      if (expr.testOnly || expr.optional) return undefined;
      const prefix = this.resolveQualifiedName(expr.operand);
      if (prefix !== undefined) {
        return `${prefix}.${expr.field}`;
      }
      return undefined;
    }
    return undefined;
  }

  // ============================================================================
  // Utility methods
  // ============================================================================

  private getType(id: ExprId): Type {
    return this.typeMap.get(id) ?? PrimitiveTypes.Dyn;
  }

  private setType(id: ExprId, type: Type): void {
    this.typeMap.set(id, type);
  }

  private setRef(id: ExprId, ref: ReferenceInfo): void {
    this.refMap.set(id, ref);
  }

  private getLocation(exprId: ExprId): Location | undefined {
    const position = this.sourceInfo.getPosition(exprId);
    if (position === undefined) {
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
