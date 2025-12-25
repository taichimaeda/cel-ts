// CEL Interpretable Types
// Interpretable interface and implementations for expression evaluation
// Implemented with reference to cel-go's interpret/interpretable.go

import type { TypeProvider } from "../checker/provider";
import type { Type as CheckerType } from "../checker/types";
import type { ExprId } from "../common/ast";
import { type Activation, MutableActivation } from "./activation";
import type { Attribute, Qualifier } from "./attributes";
import type { Dispatcher } from "./dispatcher";
import {
  googleAnyToValue,
  googleListToValue,
  googleStructToMapValue,
  googleStructToValue,
  googleValueToValue,
  structValueToMapValue,
} from "./utils";
import {
  BoolValue,
  BytesValue,
  DoubleValue,
  DurationValue,
  EnumValue,
  ErrorValue,
  IntLimits,
  IntValue,
  ListValue,
  type MapEntry,
  MapValue,
  NullValue,
  OptionalValue,
  StringValue,
  StructValue,
  TimestampValue,
  UintValue,
  type UnknownValue,
  type Value,
  ValueUtil,
} from "./values";

export type InterpretableKind =
  | "const"
  | "ident"
  | "attr"
  | "not"
  | "not_strictly_false"
  | "neg"
  | "and"
  | "or"
  | "conditional"
  | "binary"
  | "call"
  | "block"
  | "list"
  | "map"
  | "struct"
  | "index"
  | "field"
  | "has_field"
  | "comprehension"
  | "type_conversion";

export type Interpretable =
  | ConstValue
  | IdentValue
  | AttrValue
  | NotValue
  | NotStrictlyFalseValue
  | NegValue
  | AndValue
  | OrValue
  | ConditionalValue
  | BinaryValue
  | CallValue
  | BlockValue
  | CreateListValue
  | CreateMapValue
  | CreateStructValue
  | IndexValue
  | FieldValue
  | HasFieldValue
  | ComprehensionValue
  | TypeConversionValue;

/**
 * Constant literal interpretable.
 */
export class ConstValue {
  readonly kind: InterpretableKind = "const";

  constructor(
    private readonly exprId: ExprId,
    private readonly val: Value
  ) { }

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
export class IdentValue {
  readonly kind: InterpretableKind = "ident";

  constructor(
    private readonly exprId: ExprId,
    private readonly name: string
  ) { }

  id(): ExprId {
    return this.exprId;
  }

  eval(activation: Activation): Value {
    const value = activation.resolve(this.name);
    if (value === undefined) {
      return ErrorValue.of(`undeclared variable: ${this.name}`, this.exprId);
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
export class AttrValue {
  readonly kind: InterpretableKind = "attr";

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
export class NotValue {
  readonly kind: InterpretableKind = "not";

  constructor(
    private readonly exprId: ExprId,
    private readonly operand: Interpretable
  ) { }

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
export class NotStrictlyFalseValue {
  readonly kind: InterpretableKind = "not_strictly_false";

  constructor(
    private readonly exprId: ExprId,
    private readonly operand: Interpretable
  ) { }

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
export class NegValue {
  readonly kind: InterpretableKind = "neg";

  constructor(
    private readonly exprId: ExprId,
    private readonly operand: Interpretable
  ) { }

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
export class AndValue {
  readonly kind: InterpretableKind = "and";

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
export class OrValue {
  readonly kind: InterpretableKind = "or";

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
export class ConditionalValue {
  readonly kind: InterpretableKind = "conditional";

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
export class BinaryValue {
  readonly kind: InterpretableKind = "binary";

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
        return ErrorValue.of(`unknown operator: ${this.operator}`, this.exprId);
    }
  }

  private add(lhs: Value, rhs: Value): Value {
    const leftInt = this.asIntValue(lhs);
    const rightInt = this.asIntValue(rhs);
    if (leftInt !== undefined && rightInt !== undefined) {
      return leftInt.add(rightInt);
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
    if (lhs instanceof DurationValue && rhs instanceof DurationValue) {
      return lhs.add(rhs);
    }
    if (lhs instanceof TimestampValue && rhs instanceof DurationValue) {
      return lhs.add(rhs);
    }
    if (lhs instanceof DurationValue && rhs instanceof TimestampValue) {
      return rhs.add(lhs);
    }
    return ErrorValue.of(`cannot add ${lhs.type()} and ${rhs.type()}`, this.exprId);
  }

  private subtract(lhs: Value, rhs: Value): Value {
    const leftInt = this.asIntValue(lhs);
    const rightInt = this.asIntValue(rhs);
    if (leftInt !== undefined && rightInt !== undefined) {
      return leftInt.subtract(rightInt);
    }
    if (lhs instanceof UintValue && rhs instanceof UintValue) {
      return lhs.subtract(rhs);
    }
    if (lhs instanceof DoubleValue && rhs instanceof DoubleValue) {
      return lhs.subtract(rhs);
    }
    if (lhs instanceof DurationValue && rhs instanceof DurationValue) {
      return lhs.subtract(rhs);
    }
    if (lhs instanceof TimestampValue && rhs instanceof DurationValue) {
      return lhs.subtract(rhs);
    }
    if (lhs instanceof TimestampValue && rhs instanceof TimestampValue) {
      return lhs.subtract(rhs);
    }
    return ErrorValue.of(`cannot subtract ${rhs.type()} from ${lhs.type()}`, this.exprId);
  }

  private multiply(lhs: Value, rhs: Value): Value {
    const leftInt = this.asIntValue(lhs);
    const rightInt = this.asIntValue(rhs);
    if (leftInt !== undefined && rightInt !== undefined) {
      return leftInt.multiply(rightInt);
    }
    if (lhs instanceof UintValue && rhs instanceof UintValue) {
      return lhs.multiply(rhs);
    }
    if (lhs instanceof DoubleValue && rhs instanceof DoubleValue) {
      return lhs.multiply(rhs);
    }
    return ErrorValue.of(`cannot multiply ${lhs.type()} and ${rhs.type()}`, this.exprId);
  }

  private divide(lhs: Value, rhs: Value): Value {
    const leftInt = this.asIntValue(lhs);
    const rightInt = this.asIntValue(rhs);
    if (leftInt !== undefined && rightInt !== undefined) {
      return leftInt.divide(rightInt);
    }
    if (lhs instanceof UintValue && rhs instanceof UintValue) {
      return lhs.divide(rhs);
    }
    if (lhs instanceof DoubleValue && rhs instanceof DoubleValue) {
      return lhs.divide(rhs);
    }
    return ErrorValue.of(`cannot divide ${lhs.type()} by ${rhs.type()}`, this.exprId);
  }

  private modulo(lhs: Value, rhs: Value): Value {
    const leftInt = this.asIntValue(lhs);
    const rightInt = this.asIntValue(rhs);
    if (leftInt !== undefined && rightInt !== undefined) {
      return leftInt.modulo(rightInt);
    }
    if (lhs instanceof UintValue && rhs instanceof UintValue) {
      return lhs.modulo(rhs);
    }
    return ErrorValue.of(`cannot modulo ${lhs.type()} by ${rhs.type()}`, this.exprId);
  }

  private compare(lhs: Value, rhs: Value, predicate: (cmp: number) => boolean): Value {
    const leftInt = this.asIntValue(lhs);
    const rightInt = this.asIntValue(rhs);
    if (leftInt !== undefined && rightInt !== undefined) {
      return BoolValue.of(predicate(leftInt.compare(rightInt)));
    }
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
    if (lhs instanceof BoolValue && rhs instanceof BoolValue) {
      const cmp = lhs.value() === rhs.value() ? 0 : lhs.value() ? 1 : -1;
      return BoolValue.of(predicate(cmp));
    }
    if (lhs instanceof DurationValue && rhs instanceof DurationValue) {
      return BoolValue.of(predicate(lhs.compare(rhs)));
    }
    if (lhs instanceof TimestampValue && rhs instanceof TimestampValue) {
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
    return ErrorValue.of(`cannot compare ${lhs.type()} and ${rhs.type()}`, this.exprId);
  }

  private asIntValue(val: Value): IntValue | undefined {
    if (val instanceof IntValue) {
      return val;
    }
    if (val instanceof EnumValue) {
      return IntValue.of(val.value());
    }
    return undefined;
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
    return ErrorValue.of(
      `type '${container.type()}' does not support 'in' operator`,
      this.exprId
    );
  }
}

/**
 * Function call interpretable.
 */
export class CallValue {
  readonly kind: InterpretableKind = "call";

  constructor(
    private readonly exprId: ExprId,
    private readonly functionName: string,
    private readonly overloadId: string,
    private readonly args: Interpretable[],
    private readonly dispatcher: Dispatcher
  ) { }

  id(): ExprId {
    return this.exprId;
  }

  eval(activation: Activation): Value {
    if (this.functionName === "or" && this.overloadId === "optional_or_optional") {
      const lhs = this.args[0]!.eval(activation);
      if (ValueUtil.isErrorOrUnknown(lhs)) {
        return lhs;
      }
      if (lhs instanceof OptionalValue && lhs.hasValue()) {
        return lhs;
      }
      const rhs = this.args[1]!.eval(activation);
      if (ValueUtil.isErrorOrUnknown(rhs)) {
        return rhs;
      }
      return rhs;
    }

    if (this.functionName === "orValue" && this.overloadId === "optional_orValue_value") {
      const lhs = this.args[0]!.eval(activation);
      if (ValueUtil.isErrorOrUnknown(lhs)) {
        return lhs;
      }
      if (lhs instanceof OptionalValue && lhs.hasValue()) {
        return lhs.value() ?? NullValue.Instance;
      }
      const rhs = this.args[1]!.eval(activation);
      if (ValueUtil.isErrorOrUnknown(rhs)) {
        return rhs;
      }
      return rhs;
    }

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
    const call = this.dispatcher.resolveOverload(this.overloadId);
    if (call === undefined) {
      // Try to resolve by name
      const byName = this.dispatcher.resolve(this.functionName, argValues);
      if (byName !== undefined) {
        return byName.invoke(argValues);
      }
      return ErrorValue.of(
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
 * cel.@block interpretable.
 */
export class BlockValue {
  readonly kind: InterpretableKind = "block";

  constructor(
    private readonly exprId: ExprId,
    private readonly slots: Interpretable[],
    private readonly result: Interpretable
  ) { }

  id(): ExprId {
    return this.exprId;
  }

  eval(activation: Activation): Value {
    if (this.slots.length === 0) {
      return this.result.eval(activation);
    }
    const blockActivation = new MutableActivation(activation);
    for (let i = 0; i < this.slots.length; i += 1) {
      const val = this.slots[i]!.eval(blockActivation);
      if (ValueUtil.isErrorOrUnknown(val)) {
        return val;
      }
      blockActivation.set(`@index${i}`, val);
    }
    return this.result.eval(blockActivation);
  }

  cost(): number {
    return 1 + this.slots.reduce((sum, slot) => sum + slot.cost(), 0) + this.result.cost();
  }
}

/**
 * List literal interpretable.
 */
export class CreateListValue {
  readonly kind: InterpretableKind = "list";

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
export class CreateMapValue {
  readonly kind: InterpretableKind = "map";

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
    const seenKeys = new Set<string>();

    for (let i = 0; i < this.keys.length; i++) {
      const key = this.keys[i]!.eval(activation);
      if (ValueUtil.isErrorOrUnknown(key)) {
        return key;
      }
      if (!isSupportedMapKey(key)) {
        return ErrorValue.of("unsupported key type", this.exprId);
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

      const keyId = mapKeyId(key);
      if (seenKeys.has(keyId)) {
        return ErrorValue.of("Failed with repeated key", this.exprId);
      }
      seenKeys.add(keyId);
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
export class CreateStructValue {
  readonly kind: InterpretableKind = "struct";

  private readonly optionalFields: Set<number>;

  constructor(
    private readonly exprId: ExprId,
    readonly typeName: string,
    private readonly fields: string[],
    private readonly values: Interpretable[],
    private readonly fieldTypes: Map<string, CheckerType> = new Map(),
    optionalFieldIndices: number[] = [],
    private readonly typeProvider?: TypeProvider
  ) {
    this.optionalFields = new Set(optionalFieldIndices);
  }

  id(): ExprId {
    return this.exprId;
  }

  eval(activation: Activation): Value {
    const entries: MapEntry[] = [];
    const presentFields = new Set<string>();
    const valueMap = new Map<string, Value>();

    for (let i = 0; i < this.fields.length; i++) {
      const key = StringValue.of(this.fields[i]!);
      let val = this.values[i]!.eval(activation);
      if (ValueUtil.isErrorOrUnknown(val)) {
        return val;
      }
      const fieldType = this.fieldTypes.get(this.fields[i]!);
      const protoFieldType =
        this.typeProvider?.fieldProtoType(this.typeName, this.fields[i]!) ?? undefined;
      if (val instanceof NullValue) {
        if (fieldType !== undefined) {
          if (!isNullAssignableField(fieldType, protoFieldType)) {
            return ErrorValue.of("unsupported field type", this.exprId);
          }
          continue;
        }
        if (protoFieldType === "google.protobuf.ListValue" || protoFieldType === "google.protobuf.Struct") {
          return ErrorValue.of("unsupported field type", this.exprId);
        }
        continue;
      }
      if (fieldType?.kind === "struct") {
        const wrapperKind = wrapperKindFromTypeName(fieldType.runtimeTypeName);
        if (wrapperKind !== undefined) {
          const coerced = coerceWrapperValue(wrapperKind, val);
          if (coerced instanceof ErrorValue) {
            return coerced;
          }
          val = coerced;
        }
      }
      if (fieldType?.kind === "opaque" && this.typeProvider) {
        const enumType = this.typeProvider.findEnumType(fieldType.runtimeTypeName);
        if (enumType !== undefined) {
          const numeric = enumNumericValue(val);
          if (numeric !== undefined && !isEnumInt32Range(numeric)) {
            return ErrorValue.of("range error", this.exprId);
          }
        }
      }
      if (protoFieldType !== undefined && this.typeProvider) {
        const enumType = this.typeProvider.findEnumType(protoFieldType);
        if (enumType !== undefined) {
          const numeric = enumNumericValue(val);
          if (numeric !== undefined && !isEnumInt32Range(numeric)) {
            return ErrorValue.of("range error", this.exprId);
          }
        }
      }
      if (fieldType?.kind === "double" && protoFieldType === "float") {
        val = coerceFloatValue(val);
      }
      if (protoFieldType === "google.protobuf.Value") {
        val = coerceGoogleValue(val);
      }
      if (protoFieldType === "google.protobuf.Struct") {
        const mapValue = googleStructToMapValue(val);
        if (mapValue instanceof ErrorValue) {
          return mapValue;
        }
      }
      if (this.optionalFields.has(i)) {
        if (val instanceof OptionalValue) {
          if (val.hasValue()) {
            const inner = val.value()!;
            entries.push({ key, value: inner });
            valueMap.set(this.fields[i]!, inner);
            presentFields.add(this.fields[i]!);
          }
          continue;
        }
      }
      const isOneofField = this.typeProvider?.fieldIsOneof(this.typeName, this.fields[i]!) ?? false;
      const hasPresence =
        this.typeProvider?.fieldHasPresence(this.typeName, this.fields[i]!) ?? false;
      if (
        !isOneofField &&
        !hasPresence &&
        fieldType !== undefined &&
        isDefaultFieldValue(fieldType, val)
      ) {
        continue;
      }
      entries.push({ key, value: val });
      valueMap.set(this.fields[i]!, val);
      presentFields.add(this.fields[i]!);
    }

    const wrapperValue = wrapperValueFromStruct(this.typeName, valueMap);
    if (wrapperValue !== undefined) {
      return wrapperValue;
    }

    const normalizedType = normalizeTypeName(this.typeName);
    if (normalizedType === "google.protobuf.Value") {
      return googleValueToValue(valueMap);
    }
    if (normalizedType === "google.protobuf.Struct") {
      return googleStructToValue(valueMap);
    }
    if (normalizedType === "google.protobuf.ListValue") {
      return googleListToValue(valueMap);
    }
    if (normalizedType === "google.protobuf.Any") {
      const anyValue = googleAnyToValue(valueMap);
      if (anyValue !== undefined) {
        return anyValue;
      }
      return ErrorValue.of("conversion error", this.exprId);
    }

    return StructValue.of(
      this.typeName,
      valueMap,
      presentFields,
      this.fieldTypes,
      this.typeProvider
    );
  }

  cost(): number {
    return 1 + this.values.reduce((sum, val) => sum + val.cost(), 0);
  }
}

function wrapperValueFromStruct(typeName: string, values: Map<string, Value>): Value | undefined {
  const kind = wrapperKindFromTypeName(typeName);
  if (kind === undefined) {
    return undefined;
  }
  let value = values.get("value");
  if (value instanceof OptionalValue) {
    value = value.hasValue() ? (value.value() ?? NullValue.Instance) : undefined;
  }
  if (value instanceof NullValue) {
    return NullValue.Instance;
  }
  if (value === undefined) {
    return wrapperDefaultValue(kind);
  }
  return coerceWrapperValue(kind, value);
}

function normalizeTypeName(typeName: string): string {
  return typeName.startsWith(".") ? typeName.slice(1) : typeName;
}

type WrapperScalarKind =
  | "bool"
  | "bytes"
  | "double"
  | "float"
  | "int32"
  | "int64"
  | "uint32"
  | "uint64"
  | "string";

function wrapperKindFromTypeName(typeName: string): WrapperScalarKind | undefined {
  const normalized = typeName.startsWith(".") ? typeName.slice(1) : typeName;
  switch (normalized) {
    case "google.protobuf.BoolValue":
      return "bool";
    case "google.protobuf.BytesValue":
      return "bytes";
    case "google.protobuf.DoubleValue":
      return "double";
    case "google.protobuf.FloatValue":
      return "float";
    case "google.protobuf.Int32Value":
      return "int32";
    case "google.protobuf.Int64Value":
      return "int64";
    case "google.protobuf.UInt32Value":
      return "uint32";
    case "google.protobuf.UInt64Value":
      return "uint64";
    case "google.protobuf.StringValue":
      return "string";
    default:
      return undefined;
  }
}

function wrapperDefaultValue(kind: WrapperScalarKind): Value {
  switch (kind) {
    case "bool":
      return BoolValue.False;
    case "bytes":
      return BytesValue.of(new Uint8Array());
    case "double":
      return DoubleValue.of(0);
    case "float":
      return DoubleValue.of(0);
    case "int32":
    case "int64":
      return IntValue.of(0);
    case "uint32":
    case "uint64":
      return UintValue.of(0);
    case "string":
      return StringValue.of("");
  }
}

function coerceWrapperValue(kind: WrapperScalarKind, value: Value): Value {
  if (kind === "float") {
    const numeric = extractNumericValue(value);
    if (numeric instanceof ErrorValue) {
      return numeric;
    }
    return DoubleValue.of(fround(numeric));
  }
  if (kind === "int32" || kind === "int64") {
    const numeric = intValueFromNumeric(value);
    if (numeric instanceof ErrorValue) {
      return numeric;
    }
    const min = kind === "int32" ? -2147483648n : -(1n << 63n);
    const max = kind === "int32" ? 2147483647n : (1n << 63n) - 1n;
    if (numeric < min || numeric > max) {
      return ErrorValue.of("range error");
    }
    return IntValue.of(numeric);
  }
  if (kind === "uint32" || kind === "uint64") {
    const numeric = intValueFromNumeric(value);
    if (numeric instanceof ErrorValue) {
      return numeric;
    }
    const max = kind === "uint32" ? 4294967295n : (1n << 64n) - 1n;
    if (numeric < 0n || numeric > max) {
      return ErrorValue.of("range error");
    }
    return UintValue.of(numeric);
  }
  return value;
}

function coerceFloatValue(value: Value): Value {
  if (value instanceof DoubleValue) {
    return DoubleValue.of(fround(value.value()));
  }
  if (value instanceof IntValue) {
    return DoubleValue.of(fround(Number(value.value())));
  }
  if (value instanceof UintValue) {
    return DoubleValue.of(fround(Number(value.value())));
  }
  return value;
}

function isNullAssignableField(fieldType: CheckerType, protoFieldType?: string): boolean {
  if (fieldType.isOptionalType()) {
    return true;
  }
  if (fieldType.kind === "struct") {
    const runtimeName = fieldType.runtimeTypeName;
    if (runtimeName === "google.protobuf.Struct" || runtimeName === "google.protobuf.ListValue") {
      return false;
    }
    if (runtimeName === "google.protobuf.Value" || runtimeName === "google.protobuf.Any") {
      return true;
    }
  }
  if (protoFieldType === "google.protobuf.Value" || protoFieldType === "google.protobuf.Any") {
    return true;
  }
  switch (fieldType.kind) {
    case "struct":
    case "duration":
    case "timestamp":
    case "dyn":
      return true;
    default:
      return false;
  }
}

function isDefaultFieldValue(fieldType: CheckerType, value: Value): boolean {
  switch (fieldType.kind) {
    case "bool":
      return value instanceof BoolValue && !value.value();
    case "int":
      return value instanceof IntValue && value.value() === 0n;
    case "uint":
      return value instanceof UintValue && value.value() === 0n;
    case "double":
      return value instanceof DoubleValue && value.value() === 0;
    case "string":
      return value instanceof StringValue && value.value() === "";
    case "bytes":
      return value instanceof BytesValue && value.value().length === 0;
    case "list":
      return value instanceof ListValue && value.value().length === 0;
    case "map":
      return value instanceof MapValue && value.value().length === 0;
    case "opaque": {
      if (value instanceof EnumValue) {
        return value.value() === 0n;
      }
      if (value instanceof IntValue) {
        return value.value() === 0n;
      }
      return false;
    }
    default:
      return false;
  }
}

function coerceGoogleValue(value: Value): Value {
  if (value instanceof NullValue) {
    return value;
  }
  if (value instanceof BoolValue) {
    return value;
  }
  if (value instanceof DoubleValue) {
    return value;
  }
  if (value instanceof IntValue) {
    return intToJsonValue(value.value());
  }
  if (value instanceof UintValue) {
    return uintToJsonValue(value.value());
  }
  if (value instanceof EnumValue) {
    return intToJsonValue(value.value());
  }
  if (value instanceof StringValue) {
    return value;
  }
  if (value instanceof BytesValue) {
    return StringValue.of(encodeBase64(value.value()));
  }
  if (value instanceof DurationValue) {
    return StringValue.of(value.toString());
  }
  if (value instanceof TimestampValue) {
    return StringValue.of(value.toString());
  }
  if (value instanceof ListValue) {
    return value;
  }
  if (value instanceof MapValue) {
    return value;
  }
  if (value instanceof StructValue) {
    const typeName = (value.type() as CheckerType).runtimeTypeName;
    if (typeName === "google.protobuf.Empty") {
      return MapValue.of([]);
    }
    if (typeName === "google.protobuf.FieldMask") {
      const paths = value.getField("paths");
      if (paths instanceof ListValue) {
        const parts: string[] = [];
        for (const entry of paths.value()) {
          if (entry instanceof StringValue) {
            parts.push(entry.value());
          }
        }
        return StringValue.of(parts.join(","));
      }
    }
    if (typeName === "google.protobuf.Struct") {
      return structValueToMapValue(value);
    }
    if (typeName === "google.protobuf.Value") {
      return googleValueToValue(new Map(Object.entries(value.value())));
    }
  }
  return value;
}

function encodeBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  if (typeof btoa !== "undefined") {
    let binary = "";
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary);
  }
  throw new Error("base64 encoding not supported");
}

const maxSafeInteger = BigInt(Number.MAX_SAFE_INTEGER);

function intToJsonValue(value: bigint): Value {
  if (value > maxSafeInteger || value < -maxSafeInteger) {
    return StringValue.of(value.toString());
  }
  return DoubleValue.of(Number(value));
}

function uintToJsonValue(value: bigint): Value {
  if (value > maxSafeInteger) {
    return StringValue.of(value.toString());
  }
  return DoubleValue.of(Number(value));
}

function intValueFromNumeric(value: Value): bigint | ErrorValue {
  if (value instanceof IntValue) {
    return value.value();
  }
  if (value instanceof UintValue) {
    return value.value();
  }
  if (value instanceof DoubleValue) {
    const num = value.value();
    if (!Number.isFinite(num) || !Number.isInteger(num)) {
      return ErrorValue.typeMismatch("numeric", value);
    }
    return BigInt(num);
  }
  return ErrorValue.typeMismatch("numeric", value);
}

function extractNumericValue(value: Value): number | ErrorValue {
  if (value instanceof DoubleValue) {
    return value.value();
  }
  if (value instanceof IntValue || value instanceof UintValue) {
    return Number(value.value());
  }
  return ErrorValue.typeMismatch("numeric", value);
}

function fround(value: number): number {
  const buffer = new Float32Array(1);
  buffer[0] = value;
  return buffer[0]!;
}

function enumNumericValue(value: Value): bigint | undefined {
  if (value instanceof IntValue) {
    return value.value();
  }
  if (value instanceof UintValue) {
    return value.value();
  }
  if (value instanceof DoubleValue) {
    const num = value.value();
    if (!Number.isFinite(num) || !Number.isInteger(num)) {
      return undefined;
    }
    return BigInt(num);
  }
  if (value instanceof EnumValue) {
    return value.value();
  }
  return undefined;
}

function isEnumInt32Range(value: bigint): boolean {
  return value >= -2147483648n && value <= 2147483647n;
}

function isSupportedMapKey(key: Value): boolean {
  return (
    key instanceof BoolValue ||
    key instanceof IntValue ||
    key instanceof UintValue ||
    key instanceof StringValue
  );
}

function mapKeyId(key: Value): string {
  if (key instanceof IntValue) {
    return `num:${key.value().toString()}`;
  }
  if (key instanceof UintValue) {
    return `num:${key.value().toString()}`;
  }
  if (key instanceof BoolValue) {
    return `bool:${key.value()}`;
  }
  if (key instanceof StringValue) {
    return `string:${key.value()}`;
  }
  return `${key.type()}:${String(key.value())}`;
}

/**
 * Index access interpretable.
 */
export class IndexValue {
  readonly kind: InterpretableKind = "index";

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
      const normalized = normalizeIndexValue(idx);
      if (normalized instanceof ErrorValue) {
        return normalized;
      }
      return obj.get(normalized);
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
    if (obj instanceof StringValue) {
      const normalized = normalizeIndexValue(idx);
      if (normalized instanceof ErrorValue) {
        return normalized;
      }
      return obj.charAt(normalized);
    }

    // Byte access
    if (obj instanceof BytesValue) {
      const normalized = normalizeIndexValue(idx);
      if (normalized instanceof ErrorValue) {
        return normalized;
      }
      return obj.byteAt(normalized);
    }

    return ErrorValue.of(`type '${obj.type()}' does not support indexing`, this.exprId);
  }

  cost(): number {
    return 1 + this.operand.cost() + this.index.cost();
  }
}

function normalizeIndexValue(value: Value): IntValue | ErrorValue {
  if (value instanceof IntValue) {
    return value;
  }
  if (value instanceof UintValue) {
    return IntValue.of(value.value());
  }
  if (value instanceof DoubleValue) {
    const num = value.value();
    if (Number.isFinite(num) && Number.isInteger(num)) {
      return IntValue.of(num);
    }
    return ErrorValue.of("invalid_argument");
  }
  return ErrorValue.typeMismatch("int or uint", value);
}

/**
 * Field access interpretable.
 */
export class FieldValue {
  readonly kind: InterpretableKind = "field";

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
export class HasFieldValue {
  readonly kind: InterpretableKind = "has_field";

  constructor(
    private readonly exprId: ExprId,
    private readonly operand: Interpretable,
    private readonly field: string
  ) { }

  id(): ExprId {
    return this.exprId;
  }

  eval(activation: Activation): Value {
    let obj = this.operand.eval(activation);
    if (ValueUtil.isErrorOrUnknown(obj)) {
      return obj;
    }
    if (obj instanceof OptionalValue) {
      if (!obj.hasValue()) {
        return BoolValue.False;
      }
      obj = obj.value()!;
    }

    // Map presence test
    if (obj instanceof MapValue) {
      const key = StringValue.of(this.field);
      return obj.contains(key);
    }

    if (obj instanceof StructValue) {
      if (obj.hasFieldDefinitions() && !obj.hasFieldDefinition(this.field)) {
        return ErrorValue.noSuchField(this.field, this.exprId);
      }
      return BoolValue.of(obj.hasField(this.field));
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
export class ComprehensionValue {
  readonly kind: InterpretableKind = "comprehension";

  constructor(
    private readonly exprId: ExprId,
    private readonly iterVar: string,
    private readonly iterRange: Interpretable,
    private readonly accuVar: string,
    private readonly accuInit: Interpretable,
    private readonly loopCondition: Interpretable,
    private readonly loopStep: Interpretable,
    private readonly result: Interpretable,
    private readonly iterVar2?: string
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
    if (range instanceof ListValue) {
      if (this.iterVar2) {
        const elements = range.value();
        for (let i = 0; i < elements.length; i++) {
          loopActivation.set(this.iterVar, IntValue.of(i));
          loopActivation.set(this.iterVar2, elements[i]!);
          loopActivation.set(this.accuVar, accu);

          const cond = this.loopCondition.eval(loopActivation);
          if (ValueUtil.isErrorOrUnknown(cond)) {
            return cond;
          }
          if (cond instanceof BoolValue && !cond.value()) {
            break;
          }

          accu = this.loopStep.eval(loopActivation);
          if (ValueUtil.isUnknown(accu)) {
            return accu;
          }
        }
      } else {
        for (const elem of range) {
          loopActivation.set(this.iterVar, elem);
          loopActivation.set(this.accuVar, accu);

          const cond = this.loopCondition.eval(loopActivation);
          if (ValueUtil.isErrorOrUnknown(cond)) {
            return cond;
          }
          if (cond instanceof BoolValue && !cond.value()) {
            break;
          }

          accu = this.loopStep.eval(loopActivation);
          if (ValueUtil.isUnknown(accu)) {
            return accu;
          }
        }
      }
    } else if (range instanceof MapValue) {
      if (this.iterVar2) {
        for (const entry of range) {
          loopActivation.set(this.iterVar, entry.key);
          loopActivation.set(this.iterVar2, entry.value);
          loopActivation.set(this.accuVar, accu);

          const cond = this.loopCondition.eval(loopActivation);
          if (ValueUtil.isErrorOrUnknown(cond)) {
            return cond;
          }
          if (cond instanceof BoolValue && !cond.value()) {
            break;
          }

          accu = this.loopStep.eval(loopActivation);
          if (ValueUtil.isUnknown(accu)) {
            return accu;
          }
        }
      } else {
        for (const elem of range.keys()) {
          loopActivation.set(this.iterVar, elem);
          loopActivation.set(this.accuVar, accu);

          const cond = this.loopCondition.eval(loopActivation);
          if (ValueUtil.isErrorOrUnknown(cond)) {
            return cond;
          }
          if (cond instanceof BoolValue && !cond.value()) {
            break;
          }

          accu = this.loopStep.eval(loopActivation);
          if (ValueUtil.isUnknown(accu)) {
            return accu;
          }
        }
      }
    } else {
      return ErrorValue.of(`cannot iterate over ${range.type()}`, this.exprId);
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
export class TypeConversionValue {
  readonly kind: InterpretableKind = "type_conversion";

  constructor(
    private readonly exprId: ExprId,
    private readonly operand: Interpretable,
    private readonly targetType: string,
    private readonly typeProvider?: TypeProvider
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
        return this.convertEnum(val);
    }
  }

  cost(): number {
    return 1 + this.operand.cost();
  }

  private toInt(val: Value): Value {
    if (val instanceof IntValue) {
      return val;
    }
    if (val instanceof EnumValue) {
      const raw = val.value();
      if (raw < IntLimits.Int64Min || raw > IntLimits.Int64Max) {
        return ErrorValue.of("range error", this.exprId);
      }
      return IntValue.of(raw);
    }
    if (val instanceof UintValue) {
      const raw = val.value();
      if (raw > IntLimits.Int64Max) {
        return ErrorValue.of("range error", this.exprId);
      }
      return IntValue.of(raw);
    }
    if (val instanceof DoubleValue) {
      const d = val.value();
      if (!Number.isFinite(d)) {
        return ErrorValue.of("cannot convert infinity or NaN to int", this.exprId);
      }
      if (d <= Number(IntLimits.Int64Min) || d >= Number(IntLimits.Int64Max)) {
        return ErrorValue.of("range error", this.exprId);
      }
      const truncated = BigInt(Math.trunc(d));
      if (truncated < IntLimits.Int64Min || truncated > IntLimits.Int64Max) {
        return ErrorValue.of("range error", this.exprId);
      }
      return IntValue.of(truncated);
    }
    if (val instanceof StringValue) {
      try {
        const n = BigInt(val.value());
        if (n < IntLimits.Int64Min || n > IntLimits.Int64Max) {
          return ErrorValue.of("range error", this.exprId);
        }
        return IntValue.of(n);
      } catch {
        return ErrorValue.of(`cannot parse '${val.value()}' as int`, this.exprId);
      }
    }
    if (val instanceof TimestampValue) {
      return IntValue.of(val.value() / 1_000_000_000n);
    }
    return ErrorValue.of(`cannot convert ${val.type()} to int`, this.exprId);
  }

  private toUint(val: Value): Value {
    if (val instanceof UintValue) {
      return val;
    }
    if (val instanceof EnumValue) {
      const n = val.value();
      if (n < 0n) {
        return ErrorValue.of("cannot convert negative enum to uint", this.exprId);
      }
      if (n > IntLimits.Uint64Max) {
        return ErrorValue.of("range error", this.exprId);
      }
      return UintValue.of(n);
    }
    if (val instanceof IntValue) {
      const n = val.value();
      if (n < 0n) {
        return ErrorValue.of("cannot convert negative int to uint", this.exprId);
      }
      if (n > IntLimits.Uint64Max) {
        return ErrorValue.of("range error", this.exprId);
      }
      return UintValue.of(n);
    }
    if (val instanceof DoubleValue) {
      const d = val.value();
      if (!Number.isFinite(d) || d < 0) {
        return ErrorValue.of("cannot convert to uint", this.exprId);
      }
      const truncated = BigInt(Math.trunc(d));
      if (truncated > IntLimits.Uint64Max) {
        return ErrorValue.of("range error", this.exprId);
      }
      return UintValue.of(truncated);
    }
    if (val instanceof StringValue) {
      try {
        const n = BigInt(val.value());
        if (n < 0n) {
          return ErrorValue.of("cannot parse negative number as uint", this.exprId);
        }
        if (n > IntLimits.Uint64Max) {
          return ErrorValue.of("range error", this.exprId);
        }
        return UintValue.of(n);
      } catch {
        return ErrorValue.of(`cannot parse '${val.value()}' as uint`, this.exprId);
      }
    }
    return ErrorValue.of(`cannot convert ${val.type()} to uint`, this.exprId);
  }

  private toDouble(val: Value): Value {
    if (val instanceof DoubleValue) {
      return val;
    }
    if (val instanceof EnumValue) {
      return DoubleValue.of(Number(val.value()));
    }
    if (val instanceof IntValue) {
      return DoubleValue.of(Number(val.value()));
    }
    if (val instanceof UintValue) {
      return DoubleValue.of(Number(val.value()));
    }
    if (val instanceof StringValue) {
      const text = val.value();
      const d = Number.parseFloat(text);
      if (Number.isNaN(d) && text !== "NaN") {
        return ErrorValue.of(`cannot parse '${text}' as double`, this.exprId);
      }
      return DoubleValue.of(d);
    }
    return ErrorValue.of(`cannot convert ${val.type()} to double`, this.exprId);
  }

  private toString(val: Value): Value {
    if (val instanceof StringValue) {
      return val;
    }
    if (val instanceof EnumValue) {
      return StringValue.of(val.toString());
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
      const decoder = new TextDecoder("utf-8", { fatal: true });
      try {
        return StringValue.of(decoder.decode(val.value()));
      } catch {
        return ErrorValue.of("invalid UTF-8 in bytes", this.exprId);
      }
    }
    if (val instanceof BoolValue) {
      return StringValue.of(val.value() ? "true" : "false");
    }
    if (val instanceof TimestampValue) {
      return StringValue.of(val.toString());
    }
    if (val instanceof DurationValue) {
      return StringValue.of(val.toString());
    }
    return ErrorValue.of(`cannot convert ${val.type()} to string`, this.exprId);
  }

  private toBytes(val: Value): Value {
    if (val instanceof BytesValue) {
      return val;
    }
    if (val instanceof StringValue) {
      return BytesValue.fromString(val.value());
    }
    return ErrorValue.of(`cannot convert ${val.type()} to bytes`, this.exprId);
  }

  private toBool(val: Value): Value {
    if (val instanceof BoolValue) {
      return val;
    }
    if (val instanceof StringValue) {
      const s = val.value();
      if (s === "true" || s === "TRUE" || s === "True" || s === "t" || s === "1") {
        return BoolValue.True;
      }
      if (s === "false" || s === "FALSE" || s === "False" || s === "f" || s === "0") {
        return BoolValue.False;
      }
      return ErrorValue.of(`cannot parse '${val.value()}' as bool`, this.exprId);
    }
    return ErrorValue.of(`cannot convert ${val.type()} to bool`, this.exprId);
  }

  private convertEnum(val: Value): Value {
    if (this.typeProvider === undefined) {
      return ErrorValue.of(`unknown type conversion: ${this.targetType}`, this.exprId);
    }
    const enumType = this.typeProvider.findEnumType(this.targetType);
    if (enumType === undefined) {
      return ErrorValue.of(`unknown type conversion: ${this.targetType}`, this.exprId);
    }
    if (val instanceof EnumValue && val.typeName() === enumType.runtimeTypeName) {
      return val;
    }
    const numeric = this.enumNumericValue(val);
    if (numeric === undefined) {
      if (val instanceof StringValue) {
        const name = val.value();
        const enumValue = this.typeProvider.findEnumValue(enumType.runtimeTypeName, name);
        if (enumValue === undefined) {
          return ErrorValue.of("invalid enum value", this.exprId);
        }
        return EnumValue.of(enumType.runtimeTypeName, BigInt(enumValue));
      }
      return ErrorValue.of("invalid enum value", this.exprId);
    }
    if (!isEnumInt32Range(numeric)) {
      return ErrorValue.of("enum value out of range", this.exprId);
    }
    return EnumValue.of(enumType.runtimeTypeName, numeric);
  }

  private enumNumericValue(val: Value): bigint | undefined {
    if (val instanceof IntValue) {
      return val.value();
    }
    if (val instanceof UintValue) {
      return val.value();
    }
    if (val instanceof DoubleValue) {
      const num = val.value();
      if (!Number.isFinite(num) || !Number.isInteger(num)) {
        return undefined;
      }
      return BigInt(num);
    }
    if (val instanceof EnumValue) {
      return val.value();
    }
    return undefined;
  }

  private getType(val: Value): Value {
    return ValueUtil.toTypeValue(val.type());
  }
}
