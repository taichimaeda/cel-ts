// CEL Planner
// Converts AST to Interpretable expressions
// Ported from cel-go/interpreter/planner.go

import type { TypeProvider } from "../checker/provider";
import { type Type as CheckerType, IntType, ListType, MapType, TypeKind } from "../checker/types";
import {
  type AST,
  CallExpr,
  ComprehensionExpr,
  type Expr,
  type ExprId,
  IdentExpr,
  ListExpr,
  LiteralExpr,
  MapExpr,
  Operators,
  FunctionReference,
  type ReferenceInfo,
  SelectExpr,
  StructExpr,
  VariableReference,
} from "../common/ast";
import { type Attribute, DefaultAttributeFactory, MaybeAttribute } from "../interpreter/attributes";
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
  NullValue,
  StringValue,
  UintValue,
  type Value,
  ValueUtil,
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
  private readonly attributeFactory: DefaultAttributeFactory;
  private readonly typeProvider: TypeProvider | undefined;
  private readonly typeMap: Map<ExprId, CheckerType> | undefined;
  private readonly containerName: string;
  private readonly hasRefMap: boolean;
  private readonly enumValuesAsInt: boolean;

  constructor(options: PlannerOptions = {}) {
    this.dispatcher = options.dispatcher ?? new Dispatcher();
    this.refMap = options.refMap ?? new Map();
    this.hasRefMap = options.refMap !== undefined;
    this.attributeFactory = new DefaultAttributeFactory();
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
  private planExpr(e: Expr): Interpretable {
    if (e instanceof LiteralExpr) {
      return this.planLiteral(e);
    }
    if (e instanceof IdentExpr) {
      return this.planIdent(e);
    }
    if (e instanceof SelectExpr) {
      return this.planSelect(e);
    }
    if (e instanceof CallExpr) {
      return this.planCall(e);
    }
    if (e instanceof ListExpr) {
      return this.planCreateList(e);
    }
    if (e instanceof MapExpr) {
      return this.planCreateMap(e);
    }
    if (e instanceof StructExpr) {
      return this.planCreateStruct(e);
    }
    if (e instanceof ComprehensionExpr) {
      return this.planComprehension(e);
    }
    return this.errorNode(e.id, "unknown expression kind");
  }

  /**
   * Plan a literal expression.
   */
  private planLiteral(e: LiteralExpr): Interpretable {
    const value = e.value;
    switch (value.kind) {
      case "bool":
        return new ConstValue(e.id, value.value ? BoolValue.True : BoolValue.False);
      case "bytes":
        return new ConstValue(e.id, BytesValue.of(value.value));
      case "double":
        return new ConstValue(e.id, DoubleValue.of(value.value));
      case "int":
        return new ConstValue(e.id, IntValue.of(value.value));
      case "null":
        return new ConstValue(e.id, NullValue.Instance);
      case "string":
        return new ConstValue(e.id, StringValue.of(value.value));
      case "uint":
        return new ConstValue(e.id, UintValue.of(value.value));
      default:
        return this.errorNode(e.id, "unknown literal kind");
    }
  }

  /**
   * Plan an identifier expression.
   */
  private planIdent(e: IdentExpr): Interpretable {
    const ref = this.refMap.get(e.id);
    if (ref instanceof VariableReference && ref.value !== undefined) {
      return new ConstValue(e.id, this.enumValueToValue(ref, e.id));
    }
    if (ref instanceof VariableReference && ref.name !== e.name) {
      const attr = this.attributeForName(e.id, ref.name);
      return new AttrValue(attr);
    }
    const identType = this.typeMap?.get(e.id);
    if (identType?.kind === TypeKind.Type) {
      const targetType = identType.parameters[0] ?? null;
      if (targetType) {
        return new ConstValue(e.id, ValueUtil.toTypeValue(targetType));
      }
    }
    const attr = this.attributeForName(e.id, e.name);
    return new AttrValue(attr);
  }

  /**
   * Plan a select expression.
   */
  private planSelect(e: SelectExpr): Interpretable {
    const ref = this.refMap.get(e.id);
    if (ref instanceof VariableReference && ref.value !== undefined) {
      return new ConstValue(e.id, this.enumValueToValue(ref, e.id));
    }
    const selectType = this.typeMap?.get(e.id);
    if (selectType?.kind === TypeKind.Type) {
      const targetType = selectType.parameters[0] ?? null;
      if (targetType) {
        return new ConstValue(e.id, ValueUtil.toTypeValue(targetType));
      }
    }
    if (!e.testOnly && !e.optional) {
      if (ref instanceof VariableReference) {
        const attr = this.attributeForName(e.id, ref.name);
        return new AttrValue(attr);
      }
      if (!this.hasRefMap) {
        const qualified = this.resolveQualifiedName(e);
        if (qualified) {
          const attr = this.attributeForName(e.id, qualified.join("."));
          return new AttrValue(attr);
        }
      }
    }
    const operand = this.planExpr(e.operand);

    // Presence test (has() macro expansion)
    if (e.testOnly) {
      // Return a presence test interpretable
      return new HasFieldValue(e.id, operand, e.field);
    }

    const attr = this.ensureAttribute(operand);
    const qualifier = this.attributeFactory.newQualifier(e.id, StringValue.of(e.field), e.optional);
    return attr.addQualifier(qualifier);
  }

  private attributeForName(exprId: ExprId, name: string): Attribute {
    const candidates = this.candidateNamePaths(name);
    if (candidates.length === 1) {
      return this.attributeFactory.absoluteAttribute(exprId, candidates[0]!);
    }
    const attrs = candidates.map((path) => this.attributeFactory.absoluteAttribute(exprId, path));
    return new MaybeAttribute(exprId, attrs);
  }

  private candidateNamePaths(name: string): string[][] {
    if (name.includes(".")) {
      const parts = name.split(".");
      if (!this.containerName) {
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
    if (!this.containerName) {
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

  private resolveQualifiedName(expr: Expr): string[] | null {
    if (expr instanceof IdentExpr) {
      return [expr.name];
    }
    if (expr instanceof SelectExpr) {
      if (expr.testOnly || expr.optional) {
        return null;
      }
      const prefix = this.resolveQualifiedName(expr.operand);
      if (!prefix) {
        return null;
      }
      return [...prefix, expr.field];
    }
    return null;
  }

  /**
   * Plan a call expression.
   */
  private planCall(e: CallExpr): Interpretable {
    const fnName = e.funcName;

    if (!e.target && fnName === "cel.@block") {
      const planned = this.planBlockCall(e);
      if (planned) {
        return planned;
      }
    }

    // Handle built-in operators
    switch (fnName) {
      case Operators.LogicalAnd:
        return this.planLogicalAnd(e);
      case Operators.LogicalOr:
        return this.planLogicalOr(e);
      case Operators.Conditional:
        return this.planConditional(e);
      case Operators.LogicalNot:
        return this.planLogicalNot(e);
      case Operators.Negate:
        return this.planNegate(e);
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
        return this.planBinaryOp(e, fnName);
      case Operators.Index:
        return this.planIndex(e, false);
      case Operators.OptIndex:
        return this.planIndex(e, true);
      case Operators.NotStrictlyFalse:
        return this.planNotStrictlyFalse(e);
    }

    // Member function call
    if (e.target) {
      return this.planMemberCall(e);
    }

    // Global function call
    return this.planGlobalCall(e);
  }

  private planBlockCall(e: CallExpr): Interpretable | null {
    if (e.args.length !== 2) {
      return null;
    }
    const bindings = e.args[0];
    const result = e.args[1];
    if (!(bindings instanceof ListExpr) || !result) {
      return null;
    }
    if (bindings.elements.length === 0) {
      return this.planExpr(result);
    }
    const slots = bindings.elements.map((element) => this.planExpr(element));
    const plannedResult = this.planExpr(result);
    return new BlockValue(e.id, slots, plannedResult);
  }

  /**
   * Plan logical AND.
   */
  private planLogicalAnd(e: CallExpr): Interpretable {
    const left = this.planExpr(e.args[0]!);
    const right = this.planExpr(e.args[1]!);
    return new AndValue(e.id, left, right);
  }

  /**
   * Plan logical OR.
   */
  private planLogicalOr(e: CallExpr): Interpretable {
    const left = this.planExpr(e.args[0]!);
    const right = this.planExpr(e.args[1]!);
    return new OrValue(e.id, left, right);
  }

  /**
   * Plan conditional (ternary).
   */
  private planConditional(e: CallExpr): Interpretable {
    const cond = this.planExpr(e.args[0]!);
    const truthy = this.planExpr(e.args[1]!);
    const falsy = this.planExpr(e.args[2]!);
    return new ConditionalValue(e.id, cond, truthy, falsy);
  }

  /**
   * Plan logical NOT.
   */
  private planLogicalNot(e: CallExpr): Interpretable {
    const operand = this.planExpr(e.args[0]!);
    return new NotValue(e.id, operand);
  }

  /**
   * Plan @not_strictly_false, which treats errors as true and only returns false for literal false.
   */
  private planNotStrictlyFalse(e: CallExpr): Interpretable {
    const operand = this.planExpr(e.args[0]!);
    return new NotStrictlyFalseValue(e.id, operand);
  }

  /**
   * Plan numeric negation.
   */
  private planNegate(e: CallExpr): Interpretable {
    const operand = this.planExpr(e.args[0]!);
    return new NegValue(e.id, operand);
  }

  /**
   * Plan binary operator.
   */
  private planBinaryOp(e: CallExpr, op: string): Interpretable {
    const left = this.planExpr(e.args[0]!);
    const right = this.planExpr(e.args[1]!);

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

    return new BinaryValue(e.id, opMap[op] ?? op, left, right);
  }

  /**
   * Plan index access.
   */
  private planIndex(e: CallExpr, optional: boolean): Interpretable {
    const operand = this.planExpr(e.args[0]!);
    const indexExpr = e.args[1]!;
    const attr = this.ensureAttribute(operand);

    if (indexExpr instanceof LiteralExpr) {
      const value = this.literalValue(indexExpr);
      const qualifier = this.attributeFactory.newQualifier(e.id, value, optional);
      return attr.addQualifier(qualifier);
    }

    const index = this.planExpr(indexExpr);
    const qualifier = this.attributeFactory.newQualifier(e.id, index, optional);
    return attr.addQualifier(qualifier);
  }

  /**
   * Plan a member function call.
   */
  private planMemberCall(e: CallExpr): Interpretable {
    const ref = this.refMap.get(e.id);
    if (ref instanceof VariableReference && e.args.length === 1) {
      const arg = this.planExpr(e.args[0]!);
      return new TypeConversionValue(e.id, arg, ref.name, this.typeProvider);
    }
    if (ref instanceof FunctionReference && ref.name) {
      const args: Interpretable[] = [];
      for (const arg of e.args) {
        args.push(this.planExpr(arg));
      }
      const overloadId = this.resolveOverloadId(ref, e.args, `${ref.name}_${args.length}`);
      return new CallValue(e.id, ref.name, overloadId, args, this.dispatcher);
    }

    const targetName = this.resolveQualifiedName(e.target!);
    if (targetName) {
      const qualified = `${targetName.join(".")}.${e.funcName}`;
      if (this.dispatcher.findOverloadsByName(qualified).length > 0) {
        const args: Interpretable[] = [];
        for (const arg of e.args) {
          args.push(this.planExpr(arg));
        }
        const candidate = this.refMap.get(e.id);
        const overloadId =
          candidate instanceof FunctionReference
            ? this.resolveOverloadId(candidate, e.args, `${qualified}_${args.length}`)
            : `${qualified}_${args.length}`;
        return new CallValue(e.id, qualified, overloadId, args, this.dispatcher);
      }
    }

    const target = this.planExpr(e.target!);
    const args: Interpretable[] = [target];

    for (const arg of e.args) {
      args.push(this.planExpr(arg));
    }

    const memberRef = this.refMap.get(e.id);
    const overloadId =
      memberRef instanceof FunctionReference
        ? this.resolveOverloadId(memberRef, e.args, `${e.funcName}_${args.length}`)
        : `${e.funcName}_${args.length}`;

    return new CallValue(e.id, e.funcName, overloadId, args, this.dispatcher);
  }

  /**
   * Plan a global function call.
   */
  private planGlobalCall(e: CallExpr): Interpretable {
    const args: Interpretable[] = [];

    for (const arg of e.args) {
      args.push(this.planExpr(arg));
    }

    // Check for type conversion function
    if (this.isTypeConversion(e.funcName) && args.length === 1) {
      return new TypeConversionValue(e.id, args[0]!, e.funcName, this.typeProvider);
    }

    const ref = this.refMap.get(e.id);
    if (ref instanceof VariableReference && args.length === 1) {
      return new TypeConversionValue(e.id, args[0]!, ref.name, this.typeProvider);
    }

    const functionName = ref instanceof FunctionReference && ref.name ? ref.name : e.funcName;
    const overloadId =
      ref instanceof FunctionReference
        ? this.resolveOverloadId(ref, e.args, `${functionName}_${args.length}`)
        : `${functionName}_${args.length}`;

    return new CallValue(e.id, functionName, overloadId, args, this.dispatcher);
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
    if (!this.typeMap) {
      return false;
    }
    for (const arg of args) {
      const argType = this.typeMap.get(arg.id);
      if (argType?.kind === TypeKind.Dyn) {
        return true;
      }
    }
    return false;
  }

  /**
   * Plan list creation.
   */
  private planCreateList(e: ListExpr): Interpretable {
    const elements: Interpretable[] = [];
    const optionalIndices: number[] = [];

    for (let i = 0; i < e.elements.length; i++) {
      elements.push(this.planExpr(e.elements[i]!));
      if (e.optionalIndices?.includes(i)) {
        optionalIndices.push(i);
      }
    }

    return new CreateListValue(e.id, elements, optionalIndices);
  }

  /**
   * Plan map creation.
   */
  private planCreateMap(e: MapExpr): Interpretable {
    const keys: Interpretable[] = [];
    const values: Interpretable[] = [];
    const optionalIndices: number[] = [];

    for (let i = 0; i < e.entries.length; i++) {
      const entry = e.entries[i]!;
      keys.push(this.planExpr(entry.key));
      values.push(this.planExpr(entry.value));
      if (entry.optional) {
        optionalIndices.push(i);
      }
    }

    return new CreateMapValue(e.id, keys, values, optionalIndices);
  }

  /**
   * Plan struct creation.
   */
  private planCreateStruct(e: StructExpr): Interpretable {
    const resolvedType = this.typeMap?.get(e.id);
    const resolvedName =
      resolvedType?.kind === TypeKind.Struct
        ? resolvedType.runtimeTypeName
        : this.resolveStructTypeName(e.typeName);
    const fieldNames: string[] = [];
    const fieldValues: Interpretable[] = [];
    const optionalFieldIndices: number[] = [];
    const fieldTypes: Map<string, CheckerType> = new Map();

    if (this.typeProvider) {
      const fieldNamesForType = this.typeProvider.structFieldNames(resolvedName);
      for (const name of fieldNamesForType) {
        const fieldType = this.typeProvider.findStructFieldType(resolvedName, name);
        if (fieldType) {
          fieldTypes.set(name, this.coerceEnumToInt(fieldType));
        }
      }
    }

    for (let i = 0; i < e.fields.length; i++) {
      const field = e.fields[i]!;
      fieldNames.push(field.name);
      fieldValues.push(this.planExpr(field.value));
      if (field.optional) {
        optionalFieldIndices.push(i);
      }
    }

    return new CreateStructValue(
      e.id,
      resolvedName,
      fieldNames,
      fieldValues,
      fieldTypes,
      optionalFieldIndices,
      this.typeProvider
    );
  }

  private resolveStructTypeName(typeName: string): string {
    if (!this.typeProvider || typeName.includes(".")) {
      return typeName;
    }
    if (!this.containerName) {
      return typeName;
    }
    const parts = this.containerName.split(".");
    for (let i = parts.length; i >= 0; i--) {
      const prefix = parts.slice(0, i).join(".");
      const qualified = prefix ? `${prefix}.${typeName}` : typeName;
      if (this.typeProvider.findStructType(qualified)) {
        return qualified;
      }
    }
    return typeName;
  }

  private coerceEnumToInt(type: CheckerType): CheckerType {
    if (!this.enumValuesAsInt) {
      return type;
    }
    if (type.kind === TypeKind.Opaque && this.typeProvider?.findEnumType(type.runtimeTypeName)) {
      return IntType;
    }
    if (type.kind === TypeKind.List) {
      const elem = type.parameters[0];
      if (!elem) {
        return type;
      }
      const coerced = this.coerceEnumToInt(elem);
      return coerced === elem ? type : new ListType(coerced);
    }
    if (type.kind === TypeKind.Map) {
      const key = type.parameters[0];
      const val = type.parameters[1];
      if (!(key && val)) {
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
  private planComprehension(e: ComprehensionExpr): Interpretable {
    const iterRange = this.planExpr(e.iterRange);
    const accuInit = this.planExpr(e.accuInit);
    const loopCondition = this.planExpr(e.loopCondition);
    const loopStep = this.planExpr(e.loopStep);
    const result = this.planExpr(e.result);

    return new ComprehensionValue(
      e.id,
      e.iterVar,
      iterRange,
      e.accuVar,
      accuInit,
      loopCondition,
      loopStep,
      result,
      e.iterVar2
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
    const attr = this.attributeFactory.relativeAttribute(interpretable.id(), interpretable);
    return new AttrValue(attr);
  }

  private literalValue(e: LiteralExpr) {
    const value = e.value;
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
        return ErrorValue.create("unknown literal kind", e.id);
    }
  }

  private enumValueToValue(ref: VariableReference, exprId: ExprId): Value {
    const value = ref.value;
    const numeric = this.enumNumericValue(value);
    if (numeric === null) {
      return ErrorValue.create("invalid enum value", exprId);
    }
    const exprType = this.typeMap?.get(exprId);
    if (exprType?.kind === TypeKind.Int || exprType?.kind === TypeKind.Uint) {
      return IntValue.of(numeric);
    }
    const enumType = exprType?.kind === TypeKind.Opaque ? exprType.runtimeTypeName : null;
    const inferredType = enumType ?? this.enumTypeFromRef(ref);
    if (inferredType) {
      return new EnumValue(inferredType, numeric);
    }
    return IntValue.of(numeric);
  }

  private enumNumericValue(value: unknown): bigint | null {
    if (typeof value === "number") {
      return BigInt(value);
    }
    if (typeof value === "bigint") {
      return value;
    }
    return null;
  }

  private enumTypeFromRef(ref: VariableReference): string | null {
    const refName = ref.name;
    if (!refName) {
      return null;
    }
    const lastDot = refName.lastIndexOf(".");
    if (lastDot === -1) {
      return null;
    }
    return refName.slice(0, lastDot);
  }

  /**
   * Create an error node.
   */
  private errorNode(id: ExprId, message: string): Interpretable {
    return new ConstValue(id, ErrorValue.create(message, id));
  }
}
