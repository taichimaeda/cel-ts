// CEL Planner
// Converts AST to Interpretable expressions
// Ported from cel-go/interpreter/planner.go

import type { TypeProvider } from "../checker/provider";
import { type Type as CheckerType, IntType, ListType, MapType } from "../checker/types";
import {
  type AST,
  CallExpr,
  ComprehensionExpr,
  ConstantReference,
  type Expr,
  type ExprId,
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
import {
  AbsoluteAttribute,
  type Attribute,
  ComputedQualifier,
  IndexQualifier,
  MaybeAttribute,
  RelativeAttribute,
  StringQualifier,
  type Qualifier,
} from "../interpreter/attributes";
import { Dispatcher } from "../interpreter/dispatcher";
import {
  AndValue,
  AttrValue,
  BinaryValue,
  BlockValue,
  CallValue,
  ComprehensionValue,
  ConditionalValue,
  ConstValue,
  CreateListValue,
  CreateMapValue,
  CreateStructValue,
  HasFieldValue,
  type Interpretable,
  NegValue,
  NotStrictlyFalseValue,
  NotValue,
  OrValue,
  TypeConversionValue,
} from "../interpreter/interpretable";
import {
  BoolValue,
  BytesValue,
  DoubleValue,
  EnumValue,
  ErrorValue,
  IntValue,
  isStringValue,
  isValue,
  NullValue,
  StringValue,
  toTypeValue,
  UintValue,
  type Value,
} from "../interpreter/values";

/**
 * Planner options for controlling interpretable generation.
 */
export interface PlannerOptions {
  /** Function dispatcher */
  dispatcher?: Dispatcher | undefined;
  /** Reference map from checker result */
  refMap?: Map<ExprId, ReferenceInfo> | undefined;
  /** Type provider for struct defaults */
  typeProvider?: TypeProvider | undefined;
  /** Type map from checker result */
  typeMap?: Map<ExprId, CheckerType> | undefined;
  /** Container name for qualified resolution in unchecked mode */
  container?: string | undefined;
  /** Treat enum values as ints (legacy semantics) */
  enumValuesAsInt?: boolean;
}

/**
 * Planner converts parsed AST to interpretable expressions.
 */
export class Planner {
  private readonly refMap: Map<ExprId, ReferenceInfo>;
  private readonly dispatcher: Dispatcher;
  private readonly typeProvider: TypeProvider | undefined;
  private readonly typeMap: Map<ExprId, CheckerType> | undefined;
  private readonly containerName: string;
  private readonly hasRefMap: boolean;
  private readonly enumValuesAsInt: boolean;

  constructor(options: PlannerOptions = {}) {
    this.dispatcher = options.dispatcher ?? new Dispatcher();
    this.refMap = options.refMap ?? new Map();
    this.hasRefMap = options.refMap !== undefined;
    this.typeProvider = options.typeProvider;
    this.typeMap = options.typeMap;
    this.containerName = options.container ?? "";
    this.enumValuesAsInt = options.enumValuesAsInt ?? false;
  }

  /**
   * Plan an AST into an interpretable.
   */
  plan(ast: AST): Interpretable {
    return this.planExpr(ast.expr);
  }

  /**
   * Plan an expression.
   */
  private planExpr(expr: Expr): Interpretable {
    if (expr instanceof LiteralExpr) {
      return this.planLiteral(expr);
    }
    if (expr instanceof IdentExpr) {
      return this.planIdent(expr);
    }
    if (expr instanceof SelectExpr) {
      return this.planSelect(expr);
    }
    if (expr instanceof CallExpr) {
      return this.planCall(expr);
    }
    if (expr instanceof ListExpr) {
      return this.planCreateList(expr);
    }
    if (expr instanceof MapExpr) {
      return this.planCreateMap(expr);
    }
    if (expr instanceof StructExpr) {
      return this.planCreateStruct(expr);
    }
    if (expr instanceof ComprehensionExpr) {
      return this.planComprehension(expr);
    }
    return this.errorNode(expr.id, "unknown expression kind");
  }

  /**
   * Plan a literal expression.
   */
  private planLiteral(expr: LiteralExpr): Interpretable {
    const value = expr.value;
    switch (value.kind) {
      case "bool":
        return new ConstValue(expr.id, value.value ? BoolValue.True : BoolValue.False);
      case "bytes":
        return new ConstValue(expr.id, BytesValue.of(value.value));
      case "double":
        return new ConstValue(expr.id, DoubleValue.of(value.value));
      case "int":
        return new ConstValue(expr.id, IntValue.of(value.value));
      case "null":
        return new ConstValue(expr.id, NullValue.Instance);
      case "string":
        return new ConstValue(expr.id, StringValue.of(value.value));
      case "uint":
        return new ConstValue(expr.id, UintValue.of(value.value));
      default:
        return this.errorNode(expr.id, "unknown literal kind");
    }
  }

  /**
   * Plan an identifier expression.
   */
  private planIdent(expr: IdentExpr): Interpretable {
    const ref = this.refMap.get(expr.id);
    if (ref instanceof ConstantReference) {
      return new ConstValue(expr.id, this.refValueToValue(ref, expr.id));
    }
    if (ref instanceof VariableReference && ref.name !== expr.name) {
      const attr = this.attributeForName(expr.id, ref.name);
      return new AttrValue(attr);
    }
    const identType = this.typeMap?.get(expr.id);
    if (identType?.kind === "type") {
      const targetType = identType.parameters[0];
      if (targetType !== undefined) {
        return new ConstValue(expr.id, toTypeValue(targetType));
      }
    }
    const attr = this.attributeForName(expr.id, expr.name);
    return new AttrValue(attr);
  }

  /**
   * Plan a select expression.
   */
  private planSelect(expr: SelectExpr): Interpretable {
    const ref = this.refMap.get(expr.id);
    if (ref instanceof ConstantReference) {
      return new ConstValue(expr.id, this.refValueToValue(ref, expr.id));
    }
    const selectType = this.typeMap?.get(expr.id);
    if (selectType?.kind === "type") {
      const targetType = selectType.parameters[0];
      if (targetType !== undefined) {
        return new ConstValue(expr.id, toTypeValue(targetType));
      }
    }
    if (!expr.testOnly && !expr.optional) {
      if (ref instanceof VariableReference) {
        const attr = this.attributeForName(expr.id, ref.name);
        return new AttrValue(attr);
      }
      if (!this.hasRefMap) {
        const qualified = this.resolveQualifiedName(expr);
        if (qualified !== undefined) {
          const attr = this.attributeForName(expr.id, qualified.join("."));
          return new AttrValue(attr);
        }
      }
    }
    const operand = this.planExpr(expr.operand);

    // Presence test (has() macro expansion)
    if (expr.testOnly) {
      // Return a presence test interpretable
      return new HasFieldValue(expr.id, operand, expr.field);
    }

    const attr = this.ensureAttribute(operand);
    const qualifier = this.newQualifier(expr.id, StringValue.of(expr.field), expr.optional);
    return attr.addQualifier(qualifier);
  }

  private attributeForName(exprId: ExprId, name: string): Attribute {
    const candidates = this.candidateNamePaths(name);
    if (candidates.length === 1) {
      return new AbsoluteAttribute(exprId, candidates[0]!);
    }
    const attrs = candidates.map((path) => new AbsoluteAttribute(exprId, path));
    return new MaybeAttribute(exprId, attrs);
  }

  private candidateNamePaths(name: string): string[][] {
    if (name.includes(".")) {
      const parts = name.split(".");
      if (this.containerName === "") {
        return [parts];
      }
      const candidates: string[][] = [];
      const containerParts = this.containerName.split(".");
      for (let i = containerParts.length; i >= 0; i--) {
        const prefix = containerParts.slice(0, i);
        candidates.push(prefix.length ? [...prefix, ...parts] : parts);
      }
      return candidates;
    }
    if (this.containerName === "") {
      return [[name]];
    }
    const candidates: string[][] = [];
    const parts = this.containerName.split(".");
    for (let i = parts.length; i >= 0; i--) {
      const prefix = parts.slice(0, i);
      candidates.push(prefix.length ? [...prefix, name] : [name]);
    }
    return candidates;
  }

  private resolveQualifiedName(expr: Expr): string[] | undefined {
    if (expr instanceof IdentExpr) {
      return [expr.name];
    }
    if (expr instanceof SelectExpr) {
      if (expr.testOnly || expr.optional) {
        return undefined;
      }
      const prefix = this.resolveQualifiedName(expr.operand);
      if (prefix === undefined) {
        return undefined;
      }
      return [...prefix, expr.field];
    }
    return undefined;
  }

  /**
   * Plan a call expression.
   */
  private planCall(expr: CallExpr): Interpretable {
    const funcName = expr.funcName;

    if (expr.target === undefined && funcName === "cel.@block") {
      const planned = this.planBlockCall(expr);
      if (planned !== undefined) {
        return planned;
      }
    }

    // Handle built-in operators
    switch (funcName) {
      case Operators.LogicalAnd:
        return this.planLogicalAnd(expr);
      case Operators.LogicalOr:
        return this.planLogicalOr(expr);
      case Operators.Conditional:
        return this.planConditional(expr);
      case Operators.LogicalNot:
        return this.planLogicalNot(expr);
      case Operators.Negate:
        return this.planNegate(expr);
      case Operators.Equals:
      case Operators.NotEquals:
      case Operators.Less:
      case Operators.LessEquals:
      case Operators.Greater:
      case Operators.GreaterEquals:
      case Operators.Add:
      case Operators.Subtract:
      case Operators.Multiply:
      case Operators.Divide:
      case Operators.Modulo:
      case Operators.In:
        return this.planBinaryOp(expr, funcName);
      case Operators.Index:
        return this.planIndex(expr, false);
      case Operators.OptIndex:
        return this.planIndex(expr, true);
      case Operators.NotStrictlyFalse:
        return this.planNotStrictlyFalse(expr);
    }

    // Member function call
    if (expr.target !== undefined) {
      return this.planMemberCall(expr);
    }

    // Global function call
    return this.planGlobalCall(expr);
  }

  private planBlockCall(expr: CallExpr): Interpretable | undefined {
    if (expr.args.length !== 2) {
      return undefined;
    }
    const bindings = expr.args[0];
    const result = expr.args[1];
    if (!(bindings instanceof ListExpr) || result === undefined) {
      return undefined;
    }
    if (bindings.elements.length === 0) {
      return this.planExpr(result);
    }
    const slots = bindings.elements.map((element) => this.planExpr(element));
    const plannedResult = this.planExpr(result);
    return new BlockValue(expr.id, slots, plannedResult);
  }

  /**
   * Plan logical AND.
   */
  private planLogicalAnd(expr: CallExpr): Interpretable {
    const left = this.planExpr(expr.args[0]!);
    const right = this.planExpr(expr.args[1]!);
    return new AndValue(expr.id, left, right);
  }

  /**
   * Plan logical OR.
   */
  private planLogicalOr(expr: CallExpr): Interpretable {
    const left = this.planExpr(expr.args[0]!);
    const right = this.planExpr(expr.args[1]!);
    return new OrValue(expr.id, left, right);
  }

  /**
   * Plan conditional (ternary).
   */
  private planConditional(expr: CallExpr): Interpretable {
    const cond = this.planExpr(expr.args[0]!);
    const truthy = this.planExpr(expr.args[1]!);
    const falsy = this.planExpr(expr.args[2]!);
    return new ConditionalValue(expr.id, cond, truthy, falsy);
  }

  /**
   * Plan logical NOT.
   */
  private planLogicalNot(expr: CallExpr): Interpretable {
    const operand = this.planExpr(expr.args[0]!);
    return new NotValue(expr.id, operand);
  }

  /**
   * Plan @not_strictly_false, which treats errors as true and only returns false for literal false.
   */
  private planNotStrictlyFalse(expr: CallExpr): Interpretable {
    const operand = this.planExpr(expr.args[0]!);
    return new NotStrictlyFalseValue(expr.id, operand);
  }

  /**
   * Plan numeric negation.
   */
  private planNegate(expr: CallExpr): Interpretable {
    const operand = this.planExpr(expr.args[0]!);
    return new NegValue(expr.id, operand);
  }

  /**
   * Plan binary operator.
   */
  private planBinaryOp(expr: CallExpr, op: string): Interpretable {
    const left = this.planExpr(expr.args[0]!);
    const right = this.planExpr(expr.args[1]!);

    // Convert internal operator names to external
    const opMap: Record<string, string> = {
      [Operators.Equals]: "==",
      [Operators.NotEquals]: "!=",
      [Operators.Less]: "<",
      [Operators.LessEquals]: "<=",
      [Operators.Greater]: ">",
      [Operators.GreaterEquals]: ">=",
      [Operators.Add]: "+",
      [Operators.Subtract]: "-",
      [Operators.Multiply]: "*",
      [Operators.Divide]: "/",
      [Operators.Modulo]: "%",
      [Operators.In]: "in",
    };

    return new BinaryValue(expr.id, opMap[op] ?? op, left, right);
  }

  /**
   * Plan index access.
   */
  private planIndex(expr: CallExpr, optional: boolean): Interpretable {
    const operand = this.planExpr(expr.args[0]!);
    const indexExpr = expr.args[1]!;
    const attr = this.ensureAttribute(operand);

    if (indexExpr instanceof LiteralExpr) {
      const value = this.literalValue(indexExpr);
      const qualifier = this.newQualifier(expr.id, value, optional);
      return attr.addQualifier(qualifier);
    }

    const index = this.planExpr(indexExpr);
    const qualifier = this.newQualifier(expr.id, index, optional);
    return attr.addQualifier(qualifier);
  }

  /**
   * Plan a member function call.
   */
  private planMemberCall(expr: CallExpr): Interpretable {
    const ref = this.refMap.get(expr.id);
    if (ref instanceof VariableReference && expr.args.length === 1) {
      const arg = this.planExpr(expr.args[0]!);
      return new TypeConversionValue(expr.id, arg, ref.name, this.typeProvider);
    }
    if (ref instanceof FunctionReference && ref.name !== undefined) {
      const args: Interpretable[] = [];
      for (const arg of expr.args) {
        args.push(this.planExpr(arg));
      }
      const overloadId = this.resolveOverloadId(ref, expr.args, `${ref.name}_${args.length}`);
      return new CallValue(expr.id, ref.name, overloadId, args, this.dispatcher);
    }

    const targetName = this.resolveQualifiedName(expr.target!);
    if (targetName !== undefined) {
      const qualified = `${targetName.join(".")}.${expr.funcName}`;
      if (this.dispatcher.findOverloadsByName(qualified).length > 0) {
        const args: Interpretable[] = [];
        for (const arg of expr.args) {
          args.push(this.planExpr(arg));
        }
        const candidate = this.refMap.get(expr.id);
        const overloadId =
          candidate instanceof FunctionReference
            ? this.resolveOverloadId(candidate, expr.args, `${qualified}_${args.length}`)
            : `${qualified}_${args.length}`;
        return new CallValue(expr.id, qualified, overloadId, args, this.dispatcher);
      }
    }

    const target = this.planExpr(expr.target!);
    const args: Interpretable[] = [target];

    for (const arg of expr.args) {
      args.push(this.planExpr(arg));
    }

    const memberRef = this.refMap.get(expr.id);
    const overloadId =
      memberRef instanceof FunctionReference
        ? this.resolveOverloadId(memberRef, expr.args, `${expr.funcName}_${args.length}`)
        : `${expr.funcName}_${args.length}`;

    return new CallValue(expr.id, expr.funcName, overloadId, args, this.dispatcher);
  }

  /**
   * Plan a global function call.
   */
  private planGlobalCall(expr: CallExpr): Interpretable {
    const args: Interpretable[] = [];

    for (const arg of expr.args) {
      args.push(this.planExpr(arg));
    }

    // Check for type conversion function
    if (this.isTypeConversion(expr.funcName) && args.length === 1) {
      return new TypeConversionValue(expr.id, args[0]!, expr.funcName, this.typeProvider);
    }

    const ref = this.refMap.get(expr.id);
    if (ref instanceof VariableReference && args.length === 1) {
      return new TypeConversionValue(expr.id, args[0]!, ref.name, this.typeProvider);
    }

    const functionName =
      ref instanceof FunctionReference && ref.name !== undefined ? ref.name : expr.funcName;
    const overloadId =
      ref instanceof FunctionReference
        ? this.resolveOverloadId(ref, expr.args, `${functionName}_${args.length}`)
        : `${functionName}_${args.length}`;

    return new CallValue(expr.id, functionName, overloadId, args, this.dispatcher);
  }

  private resolveOverloadId(
    ref: FunctionReference,
    args: readonly Expr[],
    fallback: string
  ): string {
    if (ref.overloadIds.length === 1) {
      return ref.overloadIds[0]!;
    }
    if (ref.overloadIds.length === 0) {
      return fallback;
    }
    if (this.hasDynArgs(args)) {
      return fallback;
    }
    return ref.overloadIds[0] ?? fallback;
  }

  private hasDynArgs(args: readonly Expr[]): boolean {
    if (this.typeMap === undefined) {
      return false;
    }
    for (const arg of args) {
      const argType = this.typeMap.get(arg.id);
      if (argType?.kind === "dyn") {
        return true;
      }
    }
    return false;
  }

  /**
   * Plan list creation.
   */
  private planCreateList(expr: ListExpr): Interpretable {
    const elements: Interpretable[] = [];
    const optionalIndices: number[] = [];

    for (let i = 0; i < expr.elements.length; i++) {
      elements.push(this.planExpr(expr.elements[i]!));
      if (expr.optionalIndices?.includes(i)) {
        optionalIndices.push(i);
      }
    }

    return new CreateListValue(expr.id, elements, optionalIndices);
  }

  /**
   * Plan map creation.
   */
  private planCreateMap(expr: MapExpr): Interpretable {
    const keys: Interpretable[] = [];
    const values: Interpretable[] = [];
    const optionalIndices: number[] = [];

    for (let i = 0; i < expr.entries.length; i++) {
      const entry = expr.entries[i]!;
      keys.push(this.planExpr(entry.key));
      values.push(this.planExpr(entry.value));
      if (entry.optional) {
        optionalIndices.push(i);
      }
    }

    return new CreateMapValue(expr.id, keys, values, optionalIndices);
  }

  /**
   * Plan struct creation.
   */
  private planCreateStruct(expr: StructExpr): Interpretable {
    const resolvedType = this.typeMap?.get(expr.id);
    const resolvedName =
      resolvedType?.kind === "struct"
        ? resolvedType.runtimeTypeName
        : this.resolveStructTypeName(expr.typeName);
    const fieldNames: string[] = [];
    const fieldValues: Interpretable[] = [];
    const optionalFieldIndices: number[] = [];
    const fieldTypes: Map<string, CheckerType> = new Map();

    if (this.typeProvider) {
      const fieldNamesForType = this.typeProvider.structFieldNames(resolvedName);
      for (const name of fieldNamesForType) {
        const fieldType = this.typeProvider.findStructFieldType(resolvedName, name);
        if (fieldType !== undefined) {
          fieldTypes.set(name, this.coerceEnumToInt(fieldType));
        }
      }
    }

    for (let i = 0; i < expr.fields.length; i++) {
      const field = expr.fields[i]!;
      fieldNames.push(field.name);
      fieldValues.push(this.planExpr(field.value));
      if (field.optional) {
        optionalFieldIndices.push(i);
      }
    }

    return new CreateStructValue(
      expr.id,
      resolvedName,
      fieldNames,
      fieldValues,
      fieldTypes,
      optionalFieldIndices,
      this.typeProvider
    );
  }

  private resolveStructTypeName(typeName: string): string {
    if (this.typeProvider === undefined || typeName.includes(".")) {
      return typeName;
    }
    if (this.containerName === "") {
      return typeName;
    }
    const parts = this.containerName.split(".");
    for (let i = parts.length; i >= 0; i--) {
      const prefix = parts.slice(0, i).join(".");
      const qualified = prefix ? `${prefix}.${typeName}` : typeName;
      if (this.typeProvider.findStructType(qualified) !== undefined) {
        return qualified;
      }
    }
    return typeName;
  }

  private coerceEnumToInt(type: CheckerType): CheckerType {
    if (!this.enumValuesAsInt) {
      return type;
    }
    if (type.kind === "opaque" && this.typeProvider?.findEnumType(type.runtimeTypeName)) {
      return IntType;
    }
    if (type.kind === "list") {
      const elem = type.parameters[0];
      if (elem === undefined) {
        return type;
      }
      const coerced = this.coerceEnumToInt(elem);
      return coerced === elem ? type : new ListType(coerced);
    }
    if (type.kind === "map") {
      const key = type.parameters[0];
      const val = type.parameters[1];
      if (key === undefined || val === undefined) {
        return type;
      }
      const newKey = this.coerceEnumToInt(key);
      const newVal = this.coerceEnumToInt(val);
      return newKey === key && newVal === val ? type : new MapType(newKey, newVal);
    }
    return type;
  }

  /**
   * Plan comprehension expression (from macro expansion).
   */
  private planComprehension(expr: ComprehensionExpr): Interpretable {
    const iterRange = this.planExpr(expr.iterRange);
    const accuInit = this.planExpr(expr.accuInit);
    const loopCondition = this.planExpr(expr.loopCondition);
    const loopStep = this.planExpr(expr.loopStep);
    const result = this.planExpr(expr.result);

    return new ComprehensionValue(
      expr.id,
      expr.iterVar,
      iterRange,
      expr.accuVar,
      accuInit,
      loopCondition,
      loopStep,
      result,
      expr.iterVar2
    );
  }

  /**
   * Check if function name is a type conversion.
   */
  private isTypeConversion(name: string): boolean {
    return ["int", "uint", "double", "string", "bytes", "bool", "type", "dyn"].includes(name);
  }

  private ensureAttribute(interpretable: Interpretable): AttrValue {
    if (interpretable instanceof AttrValue) {
      return interpretable;
    }
    const attr = new RelativeAttribute(interpretable.id(), interpretable);
    return new AttrValue(attr);
  }

  private literalValue(expr: LiteralExpr) {
    const value = expr.value;
    switch (value.kind) {
      case "bool":
        return value.value ? BoolValue.True : BoolValue.False;
      case "bytes":
        return BytesValue.of(value.value);
      case "double":
        return DoubleValue.of(value.value);
      case "int":
        return IntValue.of(value.value);
      case "null":
        return NullValue.Instance;
      case "string":
        return StringValue.of(value.value);
      case "uint":
        return UintValue.of(value.value);
      default:
        return ErrorValue.of("unknown literal kind", expr.id);
    }
  }

  private refValueToValue(ref: ConstantReference, exprId: ExprId): Value {
    const value = ref.value;

    // If value is already a Value object (constant), return it directly
    if (isValue(value)) {
      return value;
    }

    // Otherwise treat as enum value (numeric)
    const numeric = this.enumNumericValue(value);
    if (numeric === undefined) {
      return ErrorValue.of("invalid constant value", exprId);
    }
    const exprType = this.typeMap?.get(exprId);
    if (exprType?.kind === "int" || exprType?.kind === "uint") {
      return IntValue.of(numeric);
    }
    const enumType = exprType?.kind === "opaque" ? exprType.runtimeTypeName : undefined;
    const inferredType = enumType ?? this.enumTypeFromRef(ref);
    if (inferredType !== undefined) {
      return EnumValue.of(inferredType, numeric);
    }
    return IntValue.of(numeric);
  }

  private newQualifier(
    exprId: ExprId,
    value: Value | Interpretable,
    isOptional = false
  ): Qualifier {
    if ("type" in value && typeof value.type === "function") {
      const literal = value as Value;
      if (isStringValue(literal)) {
        return new StringQualifier(exprId, literal.value(), isOptional);
      }
      return new IndexQualifier(exprId, literal, isOptional);
    }
    return new ComputedQualifier(exprId, value as Interpretable, isOptional);
  }

  private enumNumericValue(value: unknown): bigint | undefined {
    if (typeof value === "number") {
      return BigInt(value);
    }
    if (typeof value === "bigint") {
      return value;
    }
    return undefined;
  }

  private enumTypeFromRef(ref: ConstantReference): string | undefined {
    const refName = ref.name;
    if (refName === "") {
      return undefined;
    }
    const lastDot = refName.lastIndexOf(".");
    if (lastDot === -1) {
      return undefined;
    }
    return refName.slice(0, lastDot);
  }

  /**
   * Create an error node.
   */
  private errorNode(id: ExprId, message: string): Interpretable {
    return new ConstValue(id, ErrorValue.of(message, id));
  }
}
