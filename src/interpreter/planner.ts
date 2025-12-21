// CEL Planner
// Converts AST to Interpretable expressions
// Ported from cel-go/interpreter/planner.go

import {
  type AST,
  CallExpr,
  ComprehensionExpr,
  type Expr,
  ExprId,
  IdentExpr,
  ListExpr,
  LiteralExpr,
  MapExpr,
  Operators,
  type ReferenceInfo,
  SelectExpr,
  StructExpr,
} from "../common/ast";
import { DefaultAttributeFactory } from "./attribute";
import { DefaultDispatcher, type Dispatcher, FunctionResolver } from "./dispatcher";
import {
  AndValue,
  AttrValue,
  BinaryValue,
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
} from "./value";

/**
 * Planner options for controlling interpretable generation.
 */
export interface PlannerOptions {
  /** Function dispatcher */
  dispatcher?: Dispatcher | undefined;
  /** Reference map from checker result */
  refMap?: Map<ExprId, ReferenceInfo> | undefined;
}

/**
 * Planner converts parsed AST to interpretable expressions.
 */
export class Planner {
  private readonly refMap: Map<ExprId, ReferenceInfo>;
  private readonly resolver: FunctionResolver;
  private readonly attributeFactory: DefaultAttributeFactory;

  constructor(options: PlannerOptions = {}) {
    const dispatcher = options.dispatcher ?? new DefaultDispatcher();
    this.resolver = new FunctionResolver(dispatcher);
    this.refMap = options.refMap ?? new Map();
    this.attributeFactory = new DefaultAttributeFactory();
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
    const attr = this.attributeFactory.absoluteAttribute(e.id, [e.name]);
    return new AttrValue(attr);
  }

  /**
   * Plan a select expression.
   */
  private planSelect(e: SelectExpr): Interpretable {
    const operand = this.planExpr(e.operand);

    // Presence test (has() macro expansion)
    if (e.testOnly) {
      // Return a presence test interpretable
      return new HasFieldValue(e.id, operand, e.field);
    }

    const attr = this.ensureAttribute(operand);
    const qualifier = this.attributeFactory.newQualifier(e.id, StringValue.of(e.field), false);
    return attr.addQualifier(qualifier);
  }

  /**
   * Plan a call expression.
   */
  private planCall(e: CallExpr): Interpretable {
    const fnName = e.funcName;

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
        return this.planIndex(e);
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
  private planIndex(e: CallExpr): Interpretable {
    const operand = this.planExpr(e.args[0]!);
    const indexExpr = e.args[1]!;
    const attr = this.ensureAttribute(operand);

    if (indexExpr instanceof LiteralExpr) {
      const value = this.literalValue(indexExpr);
      const qualifier = this.attributeFactory.newQualifier(e.id, value, false);
      return attr.addQualifier(qualifier);
    }

    const index = this.planExpr(indexExpr);
    const qualifier = this.attributeFactory.newQualifier(e.id, index, false);
    return attr.addQualifier(qualifier);
  }

  /**
   * Plan a member function call.
   */
  private planMemberCall(e: CallExpr): Interpretable {
    const target = this.planExpr(e.target!);
    const args: Interpretable[] = [target];

    for (const arg of e.args) {
      args.push(this.planExpr(arg));
    }

    const ref = this.refMap.get(e.id);
    const overloadId = ref?.overloadIds[0] ?? `${e.funcName}_${args.length}`;

    return new CallValue(e.id, e.funcName, overloadId, args, this.resolver);
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
      return new TypeConversionValue(e.id, args[0]!, e.funcName);
    }

    const ref = this.refMap.get(e.id);
    const overloadId = ref?.overloadIds[0] ?? `${e.funcName}_${args.length}`;

    return new CallValue(e.id, e.funcName, overloadId, args, this.resolver);
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
    const fieldNames: string[] = [];
    const fieldValues: Interpretable[] = [];

    for (const field of e.fields) {
      fieldNames.push(field.name);
      fieldValues.push(this.planExpr(field.value));
    }

    return new CreateStructValue(e.id, e.typeName, fieldNames, fieldValues);
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

  /**
   * Create an error node.
   */
  private errorNode(id: ExprId, message: string): Interpretable {
    return new ConstValue(id, ErrorValue.create(message, id));
  }
}
