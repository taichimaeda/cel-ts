// CEL Planner
// Converts AST to Interpretable expressions
// Ported from cel-go/interpreter/planner.go

import {
  type AST,
  type CallExpr,
  type ComprehensionExpr,
  type Expr,
  ExprId,
  ExprKind,
  type IdentExpr,
  type ListExpr,
  type LiteralExpr,
  type MapExpr,
  type ReferenceInfo,
  type SelectExpr,
  type StructExpr,
} from "../common/ast";
import { DefaultDispatcher, type Dispatcher, FunctionResolver } from "./dispatcher";
import {
  AndValue,
  BinaryValue,
  CallValue,
  ComprehensionValue,
  ConditionalValue,
  ConstValue,
  CreateListValue,
  CreateMapValue,
  CreateStructValue,
  FieldValue,
  HasFieldValue,
  IdentValue,
  IndexValue,
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
} from "./values";

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

  constructor(options: PlannerOptions = {}) {
    const dispatcher = options.dispatcher ?? new DefaultDispatcher();
    this.resolver = new FunctionResolver(dispatcher);
    this.refMap = options.refMap ?? new Map();
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
    switch (e.kind) {
      case ExprKind.Literal:
        return this.planLiteral(e as LiteralExpr);
      case ExprKind.Ident:
        return this.planIdent(e as IdentExpr);
      case ExprKind.Select:
        return this.planSelect(e as SelectExpr);
      case ExprKind.Call:
        return this.planCall(e as CallExpr);
      case ExprKind.List:
        return this.planCreateList(e as ListExpr);
      case ExprKind.Map:
        return this.planCreateMap(e as MapExpr);
      case ExprKind.Struct:
        return this.planCreateStruct(e as StructExpr);
      case ExprKind.Comprehension:
        return this.planComprehension(e as ComprehensionExpr);
      default:
        return this.errorNode(e.id, "unknown expression kind");
    }
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
    return new IdentValue(e.id, e.name);
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

    return new FieldValue(e.id, operand, e.field, false);
  }

  /**
   * Plan a call expression.
   */
  private planCall(e: CallExpr): Interpretable {
    const fnName = e.funcName;

    // Handle built-in operators
    switch (fnName) {
      case "_&&_":
        return this.planLogicalAnd(e);
      case "_||_":
        return this.planLogicalOr(e);
      case "_?_:_":
        return this.planConditional(e);
      case "!_":
        return this.planLogicalNot(e);
      case "-_":
        return this.planNegate(e);
      case "_==_":
      case "_!=_":
      case "_<_":
      case "_<=_":
      case "_>_":
      case "_>=_":
      case "_+_":
      case "_-_":
      case "_*_":
      case "_/_":
      case "_%_":
      case "_in_":
        return this.planBinaryOp(e, fnName);
      case "_[_]":
        return this.planIndex(e);
      case "@not_strictly_false":
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
      "_==_": "==",
      "_!=_": "!=",
      "_<_": "<",
      "_<=_": "<=",
      "_>_": ">",
      "_>=_": ">=",
      "_+_": "+",
      "_-_": "-",
      "_*_": "*",
      "_/_": "/",
      "_%_": "%",
      _in_: "in",
    };

    return new BinaryValue(e.id, opMap[op] ?? op, left, right);
  }

  /**
   * Plan index access.
   */
  private planIndex(e: CallExpr): Interpretable {
    const operand = this.planExpr(e.args[0]!);
    const index = this.planExpr(e.args[1]!);
    return new IndexValue(e.id, operand, index, false);
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
      result
    );
  }

  /**
   * Check if function name is a type conversion.
   */
  private isTypeConversion(name: string): boolean {
    return ["int", "uint", "double", "string", "bytes", "bool", "type", "dyn"].includes(name);
  }

  /**
   * Create an error node.
   */
  private errorNode(id: ExprId, message: string): Interpretable {
    return new ConstValue(id, ErrorValue.create(message, id));
  }
}
