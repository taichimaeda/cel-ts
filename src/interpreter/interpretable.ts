// CEL Interpretable Types
// Interpretable interface and implementations for expression evaluation
// Implemented with reference to cel-go's interpret/interpretable.go

import type { ExprId } from "../common/ast";
import { type Activation, MutableActivation } from "./activation";
import type { Attribute, Qualifier } from "./attribute";
import type { FunctionResolver } from "./dispatcher";
import {
  BoolValue,
  BytesValue,
  DoubleValue,
  ErrorValue,
  IntValue,
  ListValue,
  type MapEntry,
  MapValue,
  OptionalValue,
  StringValue,
  UintValue,
  type UnknownValue,
  type Value,
  ValueUtil,
} from "./value";

/**
 * Interpretable represents an evaluatable expression.
 */
export interface Interpretable {
  /**
   * Expression ID from the AST.
   */
  id(): ExprId;

  /**
   * Estimated evaluation cost.
   */
  cost(): number;

  /**
   * Evaluate the expression with the given activation.
   */
  eval(activation: Activation): Value;
}

/**
 * Constant literal interpretable.
 */
export class ConstValue implements Interpretable {

  constructor(private readonly exprId: ExprId, private readonly val: Value) { }

  id(): ExprId {
    return this.exprId;
  }

  eval(_activation: Activation): Value {
    return this.val;
  }

  cost(): number {
    return 1;
  }
}

/**
 * Variable/identifier interpretable.
 */
export class IdentValue implements Interpretable {

  constructor(private readonly exprId: ExprId, private readonly name: string) { }

  id(): ExprId {
    return this.exprId;
  }

  eval(activation: Activation): Value {
    const value = activation.resolve(this.name);
    if (value === undefined) {
      return ErrorValue.create(`undeclared variable: ${this.name}`, this.exprId);
    }
    return value;
  }

  cost(): number {
    return 1;
  }
}

/**
 * Attribute access interpretable.
 */
export class AttrValue implements Interpretable {

  constructor(private readonly attr: Attribute) { }

  id(): ExprId {
    return this.attr.id();
  }

  eval(activation: Activation): Value {
    return this.attr.resolve(activation);
  }

  cost(): number {
    return 1;
  }

  /**
   * Add a qualifier to the attribute.
   */
  addQualifier(qual: Qualifier): AttrValue {
    this.attr.addQualifier(qual);
    return this;
  }
}

/**
 * Logical NOT interpretable.
 */
export class NotValue implements Interpretable {

  constructor(private readonly exprId: ExprId, private readonly operand: Interpretable) { }

  id(): ExprId {
    return this.exprId;
  }

  eval(activation: Activation): Value {
    const val = this.operand.eval(activation);
    if (ValueUtil.isErrorOrUnknown(val)) {
      return val;
    }
    if (val instanceof BoolValue) {
      return val.negate();
    }
    return ErrorValue.typeMismatch("bool", val, this.exprId);
  }

  cost(): number {
    return 1 + this.operand.cost();
  }
}

/**
 * Evaluate @not_strictly_false.
 * Treat error values as true and only return false for literal false.
 * Used by comprehension loop conditions.
 */
export class NotStrictlyFalseValue implements Interpretable {

  constructor(private readonly exprId: ExprId, private readonly operand: Interpretable) { }

  id(): ExprId {
    return this.exprId;
  }

  eval(activation: Activation): Value {
    const val = this.operand.eval(activation);
    // Treat errors as true (keeps the loop running)
    if (val instanceof ErrorValue) {
      return BoolValue.True;
    }
    // Only literal false returns false
    if (val instanceof BoolValue) {
      return val.value() === false ? BoolValue.False : BoolValue.True;
    }
    // Treat every other value as true
    return BoolValue.True;
  }

  cost(): number {
    return 1 + this.operand.cost();
  }
}

/**
 * Numeric negation interpretable.
 */
export class NegValue implements Interpretable {

  constructor(private readonly exprId: ExprId, private readonly operand: Interpretable) { }

  id(): ExprId {
    return this.exprId;
  }

  eval(activation: Activation): Value {
    const val = this.operand.eval(activation);
    if (ValueUtil.isErrorOrUnknown(val)) {
      return val;
    }
    if (val instanceof IntValue) {
      return val.negate();
    }
    if (val instanceof DoubleValue) {
      return val.negate();
    }
    return ErrorValue.typeMismatch("int or double", val, this.exprId);
  }

  cost(): number {
    return 1 + this.operand.cost();
  }
}

/**
 * Logical AND interpretable with short-circuit evaluation.
 */
export class AndValue implements Interpretable {

  constructor(
    private readonly exprId: ExprId,
    private readonly lhs: Interpretable,
    private readonly rhs: Interpretable
  ) { }

  id(): ExprId {
    return this.exprId;
  }

  eval(activation: Activation): Value {
    const lhsVal = this.lhs.eval(activation);

    // Short-circuit evaluation: return false immediately if lhs is false
    if (lhsVal instanceof BoolValue && !lhsVal.value()) {
      return BoolValue.False;
    }

    const rhsVal = this.rhs.eval(activation);

    // Short-circuit evaluation: return false if rhs is false (even if lhs is error/unknown)
    if (rhsVal instanceof BoolValue && !rhsVal.value()) {
      return BoolValue.False;
    }

    // Both are true
    if (lhsVal instanceof BoolValue && lhsVal.value()) {
      if (rhsVal instanceof BoolValue && rhsVal.value()) {
        return BoolValue.True;
      }
      if (ValueUtil.isErrorOrUnknown(rhsVal)) {
        return rhsVal;
      }
      return ErrorValue.typeMismatch("bool", rhsVal, this.rhs.id());
    }

    // lhs is error or unknown
    if (ValueUtil.isErrorOrUnknown(lhsVal)) {
      if (rhsVal instanceof BoolValue && rhsVal.value()) {
        return lhsVal;
      }
      if (ValueUtil.isUnknown(lhsVal) && ValueUtil.isUnknown(rhsVal)) {
        return lhsVal.merge(rhsVal as UnknownValue);
      }
      return lhsVal;
    }

    return ErrorValue.typeMismatch("bool", lhsVal, this.lhs.id());
  }

  cost(): number {
    return 1 + this.lhs.cost() + this.rhs.cost();
  }
}

/**
 * Logical OR interpretable with short-circuit evaluation.
 */
export class OrValue implements Interpretable {

  constructor(
    private readonly exprId: ExprId,
    private readonly lhs: Interpretable,
    private readonly rhs: Interpretable
  ) { }

  id(): ExprId {
    return this.exprId;
  }

  eval(activation: Activation): Value {
    const lhsVal = this.lhs.eval(activation);

    // Short-circuit evaluation: return true immediately if lhs is true
    if (lhsVal instanceof BoolValue && lhsVal.value()) {
      return BoolValue.True;
    }

    const rhsVal = this.rhs.eval(activation);

    // Short-circuit evaluation: return true if rhs is true (even if lhs is error/unknown)
    if (rhsVal instanceof BoolValue && rhsVal.value()) {
      return BoolValue.True;
    }

    // Both are false
    if (lhsVal instanceof BoolValue && !lhsVal.value()) {
      if (rhsVal instanceof BoolValue && !rhsVal.value()) {
        return BoolValue.False;
      }
      if (ValueUtil.isErrorOrUnknown(rhsVal)) {
        return rhsVal;
      }
      return ErrorValue.typeMismatch("bool", rhsVal, this.rhs.id());
    }

    // lhs is error or unknown
    if (ValueUtil.isErrorOrUnknown(lhsVal)) {
      if (rhsVal instanceof BoolValue && !rhsVal.value()) {
        return lhsVal;
      }
      if (ValueUtil.isUnknown(lhsVal) && ValueUtil.isUnknown(rhsVal)) {
        return lhsVal.merge(rhsVal as UnknownValue);
      }
      return lhsVal;
    }

    return ErrorValue.typeMismatch("bool", lhsVal, this.lhs.id());
  }

  cost(): number {
    return 1 + this.lhs.cost() + this.rhs.cost();
  }
}

/**
 * Ternary conditional interpretable.
 */
export class ConditionalValue implements Interpretable {

  constructor(
    private readonly exprId: ExprId,
    private readonly condition: Interpretable,
    private readonly truthy: Interpretable,
    private readonly falsy: Interpretable
  ) { }

  id(): ExprId {
    return this.exprId;
  }

  eval(activation: Activation): Value {
    const condVal = this.condition.eval(activation);

    if (ValueUtil.isError(condVal)) {
      return condVal;
    }

    if (ValueUtil.isUnknown(condVal)) {
      // Evaluate both branches
      const truthyVal = this.truthy.eval(activation);
      const falsyVal = this.falsy.eval(activation);

      // If both branches yield the same value, return that value
      if (truthyVal.equal(falsyVal).value() === true) {
        return truthyVal;
      }

      return condVal;
    }

    if (condVal instanceof BoolValue) {
      return condVal.value() ? this.truthy.eval(activation) : this.falsy.eval(activation);
    }

    return ErrorValue.typeMismatch("bool", condVal, this.exprId);
  }

  cost(): number {
    return 1 + this.condition.cost() + this.truthy.cost() + this.falsy.cost();
  }
}

/**
 * Binary operation interpretable.
 */
export class BinaryValue implements Interpretable {

  constructor(
    private readonly exprId: ExprId,
    private readonly operator: string,
    private readonly lhs: Interpretable,
    private readonly rhs: Interpretable
  ) { }

  id(): ExprId {
    return this.exprId;
  }

  eval(activation: Activation): Value {
    const lhsVal = this.lhs.eval(activation);
    if (ValueUtil.isErrorOrUnknown(lhsVal)) {
      return lhsVal;
    }

    const rhsVal = this.rhs.eval(activation);
    if (ValueUtil.isErrorOrUnknown(rhsVal)) {
      return rhsVal;
    }

    return this.applyOperator(lhsVal, rhsVal);
  }

  cost(): number {
    return 1 + this.lhs.cost() + this.rhs.cost();
  }

  private applyOperator(lhs: Value, rhs: Value): Value {
    switch (this.operator) {
      case "+":
        return this.add(lhs, rhs);
      case "-":
        return this.subtract(lhs, rhs);
      case "*":
        return this.multiply(lhs, rhs);
      case "/":
        return this.divide(lhs, rhs);
      case "%":
        return this.modulo(lhs, rhs);
      case "==":
        return lhs.equal(rhs);
      case "!=": {
        const eq = lhs.equal(rhs);
        if (eq instanceof BoolValue) {
          return eq.negate();
        }
        return eq;
      }
      case "<":
        return this.compare(lhs, rhs, (c) => c < 0);
      case "<=":
        return this.compare(lhs, rhs, (c) => c <= 0);
      case ">":
        return this.compare(lhs, rhs, (c) => c > 0);
      case ">=":
        return this.compare(lhs, rhs, (c) => c >= 0);
      case "in":
        return this.contains(rhs, lhs);
      default:
        return ErrorValue.create(`unknown operator: ${this.operator}`, this.exprId);
    }
  }

  private add(lhs: Value, rhs: Value): Value {
    if (lhs instanceof IntValue && rhs instanceof IntValue) {
      return lhs.add(rhs);
    }
    if (lhs instanceof UintValue && rhs instanceof UintValue) {
      return lhs.add(rhs);
    }
    if (lhs instanceof DoubleValue && rhs instanceof DoubleValue) {
      return lhs.add(rhs);
    }
    if (lhs instanceof StringValue && rhs instanceof StringValue) {
      return lhs.add(rhs);
    }
    if (lhs instanceof BytesValue && rhs instanceof BytesValue) {
      return lhs.add(rhs);
    }
    if (lhs instanceof ListValue && rhs instanceof ListValue) {
      return lhs.add(rhs);
    }
    return ErrorValue.create(`cannot add ${lhs.type()} and ${rhs.type()}`, this.exprId);
  }

  private subtract(lhs: Value, rhs: Value): Value {
    if (lhs instanceof IntValue && rhs instanceof IntValue) {
      return lhs.subtract(rhs);
    }
    if (lhs instanceof UintValue && rhs instanceof UintValue) {
      return lhs.subtract(rhs);
    }
    if (lhs instanceof DoubleValue && rhs instanceof DoubleValue) {
      return lhs.subtract(rhs);
    }
    return ErrorValue.create(
      `cannot subtract ${rhs.type()} from ${lhs.type()}`,
      this.exprId
    );
  }

  private multiply(lhs: Value, rhs: Value): Value {
    if (lhs instanceof IntValue && rhs instanceof IntValue) {
      return lhs.multiply(rhs);
    }
    if (lhs instanceof UintValue && rhs instanceof UintValue) {
      return lhs.multiply(rhs);
    }
    if (lhs instanceof DoubleValue && rhs instanceof DoubleValue) {
      return lhs.multiply(rhs);
    }
    return ErrorValue.create(`cannot multiply ${lhs.type()} and ${rhs.type()}`, this.exprId);
  }

  private divide(lhs: Value, rhs: Value): Value {
    if (lhs instanceof IntValue && rhs instanceof IntValue) {
      return lhs.divide(rhs);
    }
    if (lhs instanceof UintValue && rhs instanceof UintValue) {
      return lhs.divide(rhs);
    }
    if (lhs instanceof DoubleValue && rhs instanceof DoubleValue) {
      return lhs.divide(rhs);
    }
    return ErrorValue.create(`cannot divide ${lhs.type()} by ${rhs.type()}`, this.exprId);
  }

  private modulo(lhs: Value, rhs: Value): Value {
    if (lhs instanceof IntValue && rhs instanceof IntValue) {
      return lhs.modulo(rhs);
    }
    if (lhs instanceof UintValue && rhs instanceof UintValue) {
      return lhs.modulo(rhs);
    }
    return ErrorValue.create(`cannot modulo ${lhs.type()} by ${rhs.type()}`, this.exprId);
  }

  private compare(lhs: Value, rhs: Value, predicate: (cmp: number) => boolean): Value {
    if (lhs instanceof IntValue && rhs instanceof IntValue) {
      return BoolValue.of(predicate(lhs.compare(rhs)));
    }
    if (lhs instanceof UintValue && rhs instanceof UintValue) {
      return BoolValue.of(predicate(lhs.compare(rhs)));
    }
    if (lhs instanceof DoubleValue && rhs instanceof DoubleValue) {
      const cmp = lhs.compare(rhs);
      if (Number.isNaN(cmp)) {
        return BoolValue.False;
      }
      return BoolValue.of(predicate(cmp));
    }
    if (lhs instanceof StringValue && rhs instanceof StringValue) {
      return BoolValue.of(predicate(lhs.compare(rhs)));
    }
    if (lhs instanceof BytesValue && rhs instanceof BytesValue) {
      // Byte comparison
      const lhsBytes = lhs.value();
      const rhsBytes = rhs.value();
      const len = Math.min(lhsBytes.length, rhsBytes.length);
      for (let i = 0; i < len; i++) {
        if (lhsBytes[i]! < rhsBytes[i]!) {
          return BoolValue.of(predicate(-1));
        }
        if (lhsBytes[i]! > rhsBytes[i]!) {
          return BoolValue.of(predicate(1));
        }
      }
      const cmp = lhsBytes.length - rhsBytes.length;
      return BoolValue.of(predicate(cmp === 0 ? 0 : cmp > 0 ? 1 : -1));
    }
    // Comparison between different types (int/uint/double)
    if (
      (lhs instanceof IntValue || lhs instanceof UintValue || lhs instanceof DoubleValue) &&
      (rhs instanceof IntValue || rhs instanceof UintValue || rhs instanceof DoubleValue)
    ) {
      const lhsNum = this.toNumber(lhs);
      const rhsNum = this.toNumber(rhs);
      const cmp = lhsNum < rhsNum ? -1 : lhsNum > rhsNum ? 1 : 0;
      return BoolValue.of(predicate(cmp));
    }
    return ErrorValue.create(`cannot compare ${lhs.type()} and ${rhs.type()}`, this.exprId);
  }

  private toNumber(val: Value): number {
    if (val instanceof IntValue) {
      return Number(val.value());
    }
    if (val instanceof UintValue) {
      return Number(val.value());
    }
    if (val instanceof DoubleValue) {
      return val.value();
    }
    return Number.NaN;
  }

  private contains(container: Value, elem: Value): Value {
    if (container instanceof ListValue) {
      return container.contains(elem);
    }
    if (container instanceof MapValue) {
      return container.contains(elem);
    }
    if (container instanceof StringValue && elem instanceof StringValue) {
      return container.contains(elem);
    }
    return ErrorValue.create(
      `type '${container.type()}' does not support 'in' operator`,
      this.exprId
    );
  }
}

/**
 * Function call interpretable.
 */
export class CallValue implements Interpretable {

  constructor(
    private readonly exprId: ExprId,
    private readonly functionName: string,
    private readonly overloadId: string,
    private readonly args: Interpretable[],
    private readonly resolver: FunctionResolver
  ) { }

  id(): ExprId {
    return this.exprId;
  }

  eval(activation: Activation): Value {
    // Evaluate arguments
    const argValues: Value[] = [];
    for (const arg of this.args) {
      const val = arg.eval(activation);
      // Return error/unknown immediately unless it's a non-strict function
      if (ValueUtil.isErrorOrUnknown(val)) {
        return val;
      }
      argValues.push(val);
    }

    // Resolve overload
    const call = this.resolver.resolveOverload(this.overloadId);
    if (!call) {
      // Try to resolve by name
      const byName = this.resolver.resolve(this.functionName, argValues);
      if (byName) {
        return byName.invoke(argValues);
      }
      return ErrorValue.create(
        `no such overload: ${this.functionName}/${this.overloadId}`,
        this.exprId
      );
    }

    return call.invoke(argValues);
  }

  cost(): number {
    return 1 + this.args.reduce((sum, arg) => sum + arg.cost(), 0);
  }
}

/**
 * List literal interpretable.
 */
export class CreateListValue implements Interpretable {
  private readonly optionalIndices: Set<number>;

  constructor(
    private readonly exprId: ExprId,
    private readonly elements: Interpretable[],
    optionalIndices: number[] = []
  ) {
    this.optionalIndices = new Set(optionalIndices);
  }

  id(): ExprId {
    return this.exprId;
  }

  eval(activation: Activation): Value {
    const values: Value[] = [];

    for (let i = 0; i < this.elements.length; i++) {
      const val = this.elements[i]!.eval(activation);

      if (ValueUtil.isError(val)) {
        return val;
      }

      // Process optional elements
      if (this.optionalIndices.has(i)) {
        if (val instanceof OptionalValue) {
          if (val.hasValue()) {
            values.push(val.value()!);
          }
          // Don't add element if hasValue is false
          continue;
        }
      }

      if (ValueUtil.isUnknown(val)) {
        return val;
      }

      values.push(val);
    }

    return ListValue.of(values);
  }

  cost(): number {
    return 1 + this.elements.reduce((sum, elem) => sum + elem.cost(), 0);
  }
}

/**
 * Map literal interpretable.
 */
export class CreateMapValue implements Interpretable {
  private readonly optionalIndices: Set<number>;

  constructor(
    private readonly exprId: ExprId,
    private readonly keys: Interpretable[],
    private readonly values: Interpretable[],
    optionalIndices: number[] = []
  ) {
    this.optionalIndices = new Set(optionalIndices);
  }

  id(): ExprId {
    return this.exprId;
  }

  eval(activation: Activation): Value {
    const entries: MapEntry[] = [];

    for (let i = 0; i < this.keys.length; i++) {
      const key = this.keys[i]!.eval(activation);
      if (ValueUtil.isErrorOrUnknown(key)) {
        return key;
      }

      const val = this.values[i]!.eval(activation);
      if (ValueUtil.isError(val)) {
        return val;
      }

      // Process optional entries
      if (this.optionalIndices.has(i)) {
        if (val instanceof OptionalValue) {
          if (val.hasValue()) {
            entries.push({ key, value: val.value()! });
          }
          // Don't add entry if hasValue is false
          continue;
        }
      }

      if (ValueUtil.isUnknown(val)) {
        return val;
      }

      entries.push({ key, value: val });
    }

    return MapValue.of(entries);
  }

  cost(): number {
    return (
      1 +
      this.keys.reduce((sum, key) => sum + key.cost(), 0) +
      this.values.reduce((sum, val) => sum + val.cost(), 0)
    );
  }
}

/**
 * Struct creation interpretable (for proto messages, etc.).
 */
export class CreateStructValue implements Interpretable {

  constructor(
    private readonly exprId: ExprId,
    readonly typeName: string,
    private readonly fields: string[],
    private readonly values: Interpretable[]
  ) { }

  id(): ExprId {
    return this.exprId;
  }

  eval(activation: Activation): Value {
    // Represent struct as a MapValue
    const entries: MapEntry[] = [];

    for (let i = 0; i < this.fields.length; i++) {
      const key = StringValue.of(this.fields[i]!);
      const val = this.values[i]!.eval(activation);
      if (ValueUtil.isErrorOrUnknown(val)) {
        return val;
      }
      entries.push({ key, value: val });
    }

    return MapValue.of(entries);
  }

  cost(): number {
    return 1 + this.values.reduce((sum, val) => sum + val.cost(), 0);
  }
}

/**
 * Index access interpretable.
 */
export class IndexValue implements Interpretable {

  constructor(
    private readonly exprId: ExprId,
    private readonly operand: Interpretable,
    private readonly index: Interpretable,
    private readonly optional = false
  ) { }

  id(): ExprId {
    return this.exprId;
  }

  eval(activation: Activation): Value {
    const obj = this.operand.eval(activation);
    if (ValueUtil.isErrorOrUnknown(obj)) {
      return obj;
    }

    const idx = this.index.eval(activation);
    if (ValueUtil.isErrorOrUnknown(idx)) {
      return idx;
    }

    // List access
    if (obj instanceof ListValue) {
      if (idx instanceof IntValue || idx instanceof UintValue) {
        const i = idx instanceof IntValue ? idx : IntValue.of(Number(idx.value()));
        return obj.get(i);
      }
      return ErrorValue.typeMismatch("int or uint", idx, this.index.id());
    }

    // Map access
    if (obj instanceof MapValue) {
      const hasKey = obj.contains(idx);
      if (hasKey.value()) {
        return obj.get(idx);
      }
      if (this.optional) {
        return OptionalValue.none();
      }
      return ErrorValue.noSuchKey(idx, this.exprId);
    }

    // String access
    if (obj instanceof StringValue && idx instanceof IntValue) {
      return obj.charAt(idx);
    }

    // Byte access
    if (obj instanceof BytesValue && idx instanceof IntValue) {
      return obj.byteAt(idx);
    }

    return ErrorValue.create(`type '${obj.type()}' does not support indexing`, this.exprId);
  }

  cost(): number {
    return 1 + this.operand.cost() + this.index.cost();
  }
}

/**
 * Field access interpretable.
 */
export class FieldValue implements Interpretable {

  constructor(
    private readonly exprId: ExprId,
    private readonly operand: Interpretable,
    private readonly field: string,
    private readonly optional = false
  ) { }

  id(): ExprId {
    return this.exprId;
  }

  eval(activation: Activation): Value {
    const obj = this.operand.eval(activation);
    if (ValueUtil.isErrorOrUnknown(obj)) {
      return obj;
    }

    // Map access
    if (obj instanceof MapValue) {
      const key = StringValue.of(this.field);
      const hasKey = obj.contains(key);
      if (hasKey.value()) {
        return obj.get(key);
      }
      if (this.optional) {
        return OptionalValue.none();
      }
      return ErrorValue.noSuchField(this.field, this.exprId);
    }

    return ErrorValue.noSuchField(this.field, this.exprId);
  }

  cost(): number {
    return 1 + this.operand.cost();
  }
}

/**
 * Has field (presence test) interpretable.
 * Returns true if the field exists on the operand.
 */
export class HasFieldValue implements Interpretable {

  constructor(
    private readonly exprId: ExprId,
    private readonly operand: Interpretable,
    private readonly field: string
  ) { }

  id(): ExprId {
    return this.exprId;
  }

  eval(activation: Activation): Value {
    const obj = this.operand.eval(activation);
    if (ValueUtil.isErrorOrUnknown(obj)) {
      return obj;
    }

    // Map presence test
    if (obj instanceof MapValue) {
      const key = StringValue.of(this.field);
      return obj.contains(key);
    }

    // For other types, field doesn't exist
    return BoolValue.False;
  }

  cost(): number {
    return 1 + this.operand.cost();
  }
}

/**
 * Comprehension (list/map comprehension) interpretable.
 */
export class ComprehensionValue implements Interpretable {

  constructor(
    private readonly exprId: ExprId,
    private readonly iterVar: string,
    private readonly iterRange: Interpretable,
    private readonly accuVar: string,
    private readonly accuInit: Interpretable,
    private readonly loopCondition: Interpretable,
    private readonly loopStep: Interpretable,
    private readonly result: Interpretable
  ) { }

  id(): ExprId {
    return this.exprId;
  }

  eval(activation: Activation): Value {
    // Evaluate iteration range
    const range = this.iterRange.eval(activation);
    if (ValueUtil.isErrorOrUnknown(range)) {
      return range;
    }

    // Initialize accumulator
    let accu = this.accuInit.eval(activation);
    if (ValueUtil.isErrorOrUnknown(accu)) {
      return accu;
    }

    // Create mutable activation
    const loopActivation = new MutableActivation(activation);
    loopActivation.set(this.accuVar, accu);

    // Iteration
    let iterator: Iterable<Value>;
    if (range instanceof ListValue) {
      iterator = range;
    } else if (range instanceof MapValue) {
      iterator = range.keys();
    } else {
      return ErrorValue.create(`cannot iterate over ${range.type()}`, this.exprId);
    }

    for (const elem of iterator) {
      loopActivation.set(this.iterVar, elem);
      loopActivation.set(this.accuVar, accu);

      // Check loop condition
      const cond = this.loopCondition.eval(loopActivation);
      if (ValueUtil.isErrorOrUnknown(cond)) {
        return cond;
      }
      if (cond instanceof BoolValue && !cond.value()) {
        break;
      }

      // Evaluate loop step
      accu = this.loopStep.eval(loopActivation);
      if (ValueUtil.isErrorOrUnknown(accu)) {
        return accu;
      }
    }

    // Evaluate result
    loopActivation.set(this.accuVar, accu);
    return this.result.eval(loopActivation);
  }

  cost(): number {
    return (
      1 +
      this.iterRange.cost() +
      this.accuInit.cost() +
      this.loopCondition.cost() +
      this.loopStep.cost() +
      this.result.cost()
    );
  }
}

/**
 * Type conversion/assertion interpretable.
 */
export class TypeConversionValue implements Interpretable {

  constructor(
    private readonly exprId: ExprId,
    private readonly operand: Interpretable,
    private readonly targetType: string
  ) { }

  id(): ExprId {
    return this.exprId;
  }

  eval(activation: Activation): Value {
    const val = this.operand.eval(activation);
    if (ValueUtil.isErrorOrUnknown(val)) {
      return val;
    }

    switch (this.targetType) {
      case "int":
        return this.toInt(val);
      case "uint":
        return this.toUint(val);
      case "double":
        return this.toDouble(val);
      case "string":
        return this.toString(val);
      case "bytes":
        return this.toBytes(val);
      case "bool":
        return this.toBool(val);
      case "type":
        return this.getType(val);
      case "dyn":
        return val;
      default:
        return ErrorValue.create(`unknown type conversion: ${this.targetType}`, this.exprId);
    }
  }

  cost(): number {
    return 1 + this.operand.cost();
  }

  private toInt(val: Value): Value {
    if (val instanceof IntValue) {
      return val;
    }
    if (val instanceof UintValue) {
      return IntValue.of(val.value());
    }
    if (val instanceof DoubleValue) {
      const d = val.value();
      if (!Number.isFinite(d)) {
        return ErrorValue.create("cannot convert infinity or NaN to int", this.exprId);
      }
      return IntValue.of(Math.trunc(d));
    }
    if (val instanceof StringValue) {
      try {
        const n = BigInt(val.value());
        return IntValue.of(n);
      } catch {
        return ErrorValue.create(`cannot parse '${val.value()}' as int`, this.exprId);
      }
    }
    return ErrorValue.create(`cannot convert ${val.type()} to int`, this.exprId);
  }

  private toUint(val: Value): Value {
    if (val instanceof UintValue) {
      return val;
    }
    if (val instanceof IntValue) {
      const n = val.value();
      if (n < 0n) {
        return ErrorValue.create("cannot convert negative int to uint", this.exprId);
      }
      return UintValue.of(n);
    }
    if (val instanceof DoubleValue) {
      const d = val.value();
      if (!Number.isFinite(d) || d < 0) {
        return ErrorValue.create("cannot convert to uint", this.exprId);
      }
      return UintValue.of(Math.trunc(d));
    }
    if (val instanceof StringValue) {
      try {
        const n = BigInt(val.value());
        if (n < 0n) {
          return ErrorValue.create("cannot parse negative number as uint", this.exprId);
        }
        return UintValue.of(n);
      } catch {
        return ErrorValue.create(`cannot parse '${val.value()}' as uint`, this.exprId);
      }
    }
    return ErrorValue.create(`cannot convert ${val.type()} to uint`, this.exprId);
  }

  private toDouble(val: Value): Value {
    if (val instanceof DoubleValue) {
      return val;
    }
    if (val instanceof IntValue) {
      return DoubleValue.of(Number(val.value()));
    }
    if (val instanceof UintValue) {
      return DoubleValue.of(Number(val.value()));
    }
    if (val instanceof StringValue) {
      const d = Number.parseFloat(val.value());
      if (Number.isNaN(d)) {
        return ErrorValue.create(`cannot parse '${val.value()}' as double`, this.exprId);
      }
      return DoubleValue.of(d);
    }
    return ErrorValue.create(`cannot convert ${val.type()} to double`, this.exprId);
  }

  private toString(val: Value): Value {
    if (val instanceof StringValue) {
      return val;
    }
    if (val instanceof IntValue) {
      return StringValue.of(val.value().toString());
    }
    if (val instanceof UintValue) {
      return StringValue.of(val.value().toString());
    }
    if (val instanceof DoubleValue) {
      return StringValue.of(val.value().toString());
    }
    if (val instanceof BytesValue) {
      const decoder = new TextDecoder();
      try {
        return StringValue.of(decoder.decode(val.value()));
      } catch {
        return ErrorValue.create("invalid UTF-8 in bytes", this.exprId);
      }
    }
    if (val instanceof BoolValue) {
      return StringValue.of(val.value() ? "true" : "false");
    }
    return ErrorValue.create(`cannot convert ${val.type()} to string`, this.exprId);
  }

  private toBytes(val: Value): Value {
    if (val instanceof BytesValue) {
      return val;
    }
    if (val instanceof StringValue) {
      return BytesValue.fromString(val.value());
    }
    return ErrorValue.create(`cannot convert ${val.type()} to bytes`, this.exprId);
  }

  private toBool(val: Value): Value {
    if (val instanceof BoolValue) {
      return val;
    }
    if (val instanceof StringValue) {
      const s = val.value().toLowerCase();
      if (s === "true") {
        return BoolValue.True;
      }
      if (s === "false") {
        return BoolValue.False;
      }
      return ErrorValue.create(`cannot parse '${val.value()}' as bool`, this.exprId);
    }
    return ErrorValue.create(`cannot convert ${val.type()} to bool`, this.exprId);
  }

  private getType(val: Value): Value {
    return ValueUtil.toTypeValue(val.type());
  }
}
