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
  normalizeIndexValue,
  structValueToMapValue,
} from "./utils";
import {
  BoolValue,
  BytesValue,
  DoubleValue,
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
  UintValue,
  type Value,
  isBoolValue,
  isBytesValue,
  isDoubleValue,
  isDurationValue,
  isEnumValue,
  isErrorValue,
  isIntValue,
  isListValue,
  isMapValue,
  isNullValue,
  isOptionalValue,
  isStringValue,
  isStructValue,
  isTimestampValue,
  isUintValue,
  isUnknownValue,
  toTypeValue,
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
  ) {}

  id(): ExprId {
    return this.exprId;
  }

  eval(_activation: Activation): Value {
    return this.val;
  }

  value(): Value {
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
  ) {}

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

  variableName(): string {
    return this.name;
  }
}

/**
 * Attribute access interpretable.
 */
export class AttrValue {
  readonly kind: InterpretableKind = "attr";

  constructor(private readonly attr: Attribute) {}

  id(): ExprId {
    return this.attr.id();
  }

  eval(activation: Activation): Value {
    return this.attr.resolve(activation);
  }

  attribute(): Attribute {
    return this.attr;
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
  ) {}

  id(): ExprId {
    return this.exprId;
  }

  eval(activation: Activation): Value {
    const val = this.operand.eval(activation);
    if (isErrorValue(val) || isUnknownValue(val)) {
      return val;
    }
    if (isBoolValue(val)) {
      return val.negate();
    }
    return ErrorValue.typeMismatch("bool", val, this.exprId);
  }

  cost(): number {
    return 1 + this.operand.cost();
  }

  operandValue(): Interpretable {
    return this.operand;
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
  ) {}

  id(): ExprId {
    return this.exprId;
  }

  eval(activation: Activation): Value {
    const val = this.operand.eval(activation);
    // Treat errors as true (keeps the loop running)
    if (val.kind === "error") {
      return BoolValue.True;
    }
    // Only literal false returns false
    if (isBoolValue(val)) {
      return val.value() === false ? BoolValue.False : BoolValue.True;
    }
    // Treat every other value as true
    return BoolValue.True;
  }

  cost(): number {
    return 1 + this.operand.cost();
  }

  operandValue(): Interpretable {
    return this.operand;
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
  ) {}

  id(): ExprId {
    return this.exprId;
  }

  eval(activation: Activation): Value {
    const val = this.operand.eval(activation);
    if (isErrorValue(val) || isUnknownValue(val)) {
      return val;
    }
    if (isIntValue(val)) {
      return val.negate();
    }
    if (isDoubleValue(val)) {
      return val.negate();
    }
    return ErrorValue.typeMismatch("int or double", val, this.exprId);
  }

  cost(): number {
    return 1 + this.operand.cost();
  }

  operandValue(): Interpretable {
    return this.operand;
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
  ) {}

  id(): ExprId {
    return this.exprId;
  }

  eval(activation: Activation): Value {
    const lhsVal = this.lhs.eval(activation);

    // Short-circuit evaluation: return false immediately if lhs is false
    if (isBoolValue(lhsVal) && !lhsVal.value()) {
      return BoolValue.False;
    }

    const rhsVal = this.rhs.eval(activation);

    // Short-circuit evaluation: return false if rhs is false (even if lhs is error/unknown)
    if (isBoolValue(rhsVal) && !rhsVal.value()) {
      return BoolValue.False;
    }

    // Both are true
    if (isBoolValue(lhsVal) && lhsVal.value()) {
      if (isBoolValue(rhsVal) && rhsVal.value()) {
        return BoolValue.True;
      }
      if (isErrorValue(rhsVal) || isUnknownValue(rhsVal)) {
        return rhsVal;
      }
      return ErrorValue.typeMismatch("bool", rhsVal, this.rhs.id());
    }

    // lhs is error or unknown
    if (isErrorValue(lhsVal) || isUnknownValue(lhsVal)) {
      if (isBoolValue(rhsVal) && rhsVal.value()) {
        return lhsVal;
      }
      if (isUnknownValue(lhsVal) && isUnknownValue(rhsVal)) {
        return lhsVal.merge(rhsVal);
      }
      return lhsVal;
    }

    return ErrorValue.typeMismatch("bool", lhsVal, this.lhs.id());
  }

  cost(): number {
    return 1 + this.lhs.cost() + this.rhs.cost();
  }

  left(): Interpretable {
    return this.lhs;
  }

  right(): Interpretable {
    return this.rhs;
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
  ) {}

  id(): ExprId {
    return this.exprId;
  }

  eval(activation: Activation): Value {
    const lhsVal = this.lhs.eval(activation);

    // Short-circuit evaluation: return true immediately if lhs is true
    if (isBoolValue(lhsVal) && lhsVal.value()) {
      return BoolValue.True;
    }

    const rhsVal = this.rhs.eval(activation);

    // Short-circuit evaluation: return true if rhs is true (even if lhs is error/unknown)
    if (isBoolValue(rhsVal) && rhsVal.value()) {
      return BoolValue.True;
    }

    // Both are false
    if (isBoolValue(lhsVal) && !lhsVal.value()) {
      if (isBoolValue(rhsVal) && !rhsVal.value()) {
        return BoolValue.False;
      }
      if (isErrorValue(rhsVal) || isUnknownValue(rhsVal)) {
        return rhsVal;
      }
      return ErrorValue.typeMismatch("bool", rhsVal, this.rhs.id());
    }

    // lhs is error or unknown
    if (isErrorValue(lhsVal) || isUnknownValue(lhsVal)) {
      if (isBoolValue(rhsVal) && !rhsVal.value()) {
        return lhsVal;
      }
      if (isUnknownValue(lhsVal) && isUnknownValue(rhsVal)) {
        return lhsVal.merge(rhsVal);
      }
      return lhsVal;
    }

    return ErrorValue.typeMismatch("bool", lhsVal, this.lhs.id());
  }

  cost(): number {
    return 1 + this.lhs.cost() + this.rhs.cost();
  }

  left(): Interpretable {
    return this.lhs;
  }

  right(): Interpretable {
    return this.rhs;
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
  ) {}

  id(): ExprId {
    return this.exprId;
  }

  eval(activation: Activation): Value {
    const condVal = this.condition.eval(activation);

    if (isErrorValue(condVal)) {
      return condVal;
    }

    if (isUnknownValue(condVal)) {
      // Evaluate both branches
      const truthyVal = this.truthy.eval(activation);
      const falsyVal = this.falsy.eval(activation);

      // If both branches yield the same value, return that value
      if (truthyVal.equal(falsyVal).value() === true) {
        return truthyVal;
      }
      return condVal;
    }

    if (isBoolValue(condVal)) {
      return condVal.value() ? this.truthy.eval(activation) : this.falsy.eval(activation);
    }

    return ErrorValue.typeMismatch("bool", condVal, this.exprId);
  }

  cost(): number {
    return 1 + this.condition.cost() + this.truthy.cost() + this.falsy.cost();
  }

  conditionValue(): Interpretable {
    return this.condition;
  }

  truthyValue(): Interpretable {
    return this.truthy;
  }

  falsyValue(): Interpretable {
    return this.falsy;
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
  ) {}

  id(): ExprId {
    return this.exprId;
  }

  eval(activation: Activation): Value {
    const lhsVal = this.lhs.eval(activation);
    if (isErrorValue(lhsVal) || isUnknownValue(lhsVal)) {
      return lhsVal;
    }

    const rhsVal = this.rhs.eval(activation);
    if (isErrorValue(rhsVal) || isUnknownValue(rhsVal)) {
      return rhsVal;
    }

    return this.applyOperator(lhsVal, rhsVal);
  }

  cost(): number {
    return 1 + this.lhs.cost() + this.rhs.cost();
  }

  operatorName(): string {
    return this.operator;
  }

  left(): Interpretable {
    return this.lhs;
  }

  right(): Interpretable {
    return this.rhs;
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
        if (isBoolValue(eq)) {
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
    if (isUintValue(lhs) && isUintValue(rhs)) {
      return lhs.add(rhs);
    }
    if (isDoubleValue(lhs) && isDoubleValue(rhs)) {
      return lhs.add(rhs);
    }
    if (isStringValue(lhs) && isStringValue(rhs)) {
      return lhs.add(rhs);
    }
    if (isBytesValue(lhs) && isBytesValue(rhs)) {
      return lhs.add(rhs);
    }
    if (isListValue(lhs) && isListValue(rhs)) {
      return lhs.add(rhs);
    }
    if (isDurationValue(lhs) && isDurationValue(rhs)) {
      return lhs.add(rhs);
    }
    if (isTimestampValue(lhs) && isDurationValue(rhs)) {
      return lhs.add(rhs);
    }
    if (isDurationValue(lhs) && isTimestampValue(rhs)) {
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
    if (isUintValue(lhs) && isUintValue(rhs)) {
      return lhs.subtract(rhs);
    }
    if (isDoubleValue(lhs) && isDoubleValue(rhs)) {
      return lhs.subtract(rhs);
    }
    if (isDurationValue(lhs) && isDurationValue(rhs)) {
      return lhs.subtract(rhs);
    }
    if (isTimestampValue(lhs) && isDurationValue(rhs)) {
      return lhs.subtract(rhs);
    }
    if (isTimestampValue(lhs) && isTimestampValue(rhs)) {
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
    if (isUintValue(lhs) && isUintValue(rhs)) {
      return lhs.multiply(rhs);
    }
    if (isDoubleValue(lhs) && isDoubleValue(rhs)) {
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
    if (isUintValue(lhs) && isUintValue(rhs)) {
      return lhs.divide(rhs);
    }
    if (isDoubleValue(lhs) && isDoubleValue(rhs)) {
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
    if (isUintValue(lhs) && isUintValue(rhs)) {
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
    if (isIntValue(lhs) && isIntValue(rhs)) {
      return BoolValue.of(predicate(lhs.compare(rhs)));
    }
    if (isUintValue(lhs) && isUintValue(rhs)) {
      return BoolValue.of(predicate(lhs.compare(rhs)));
    }
    if (isDoubleValue(lhs) && isDoubleValue(rhs)) {
      const cmp = lhs.compare(rhs);
      if (Number.isNaN(cmp)) {
        return BoolValue.False;
      }
      return BoolValue.of(predicate(cmp));
    }
    if (isStringValue(lhs) && isStringValue(rhs)) {
      return BoolValue.of(predicate(lhs.compare(rhs)));
    }
    if (isBoolValue(lhs) && isBoolValue(rhs)) {
      const leftBool = lhs.value();
      const rightBool = rhs.value();
      const cmp = leftBool === rightBool ? 0 : leftBool ? 1 : -1;
      return BoolValue.of(predicate(cmp));
    }
    if (isDurationValue(lhs) && isDurationValue(rhs)) {
      return BoolValue.of(predicate(lhs.compare(rhs)));
    }
    if (isTimestampValue(lhs) && isTimestampValue(rhs)) {
      return BoolValue.of(predicate(lhs.compare(rhs)));
    }
    if (isBytesValue(lhs) && isBytesValue(rhs)) {
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
      (isIntValue(lhs) || isUintValue(lhs) || isDoubleValue(lhs)) &&
      (isIntValue(rhs) || isUintValue(rhs) || isDoubleValue(rhs))
    ) {
      const lhsNum = this.toNumber(lhs);
      const rhsNum = this.toNumber(rhs);
      const cmp = lhsNum < rhsNum ? -1 : lhsNum > rhsNum ? 1 : 0;
      return BoolValue.of(predicate(cmp));
    }
    return ErrorValue.of(`cannot compare ${lhs.type()} and ${rhs.type()}`, this.exprId);
  }

  private asIntValue(val: Value): IntValue | undefined {
    if (isIntValue(val)) {
      return val;
    }
    if (isEnumValue(val)) {
      return IntValue.of(val.value());
    }
    return undefined;
  }

  private toNumber(val: Value): number {
    if (isIntValue(val)) {
      return Number(val.value());
    }
    if (isUintValue(val)) {
      return Number(val.value());
    }
    if (isDoubleValue(val)) {
      return val.value();
    }
    return Number.NaN;
  }

  private contains(container: Value, elem: Value): Value {
    if (isListValue(container)) {
      return container.contains(elem);
    }
    if (isMapValue(container)) {
      return container.contains(elem);
    }
    if (isStringValue(container) && isStringValue(elem)) {
      return container.contains(elem);
    }
    return ErrorValue.of(`type '${container.type()}' does not support 'in' operator`, this.exprId);
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
  ) {}

  id(): ExprId {
    return this.exprId;
  }

  eval(activation: Activation): Value {
    if (this.functionName === "or" && this.overloadId === "optional_or_optional") {
      const lhs = this.args[0]!.eval(activation);
      if (isErrorValue(lhs) || isUnknownValue(lhs)) {
        return lhs;
      }
      if (isOptionalValue(lhs) && lhs.hasValue()) {
        return lhs;
      }
      const rhs = this.args[1]!.eval(activation);
      if (isErrorValue(rhs) || isUnknownValue(rhs)) {
        return rhs;
      }
      return rhs;
    }

    if (this.functionName === "orValue" && this.overloadId === "optional_orValue_value") {
      const lhs = this.args[0]!.eval(activation);
      if (isErrorValue(lhs) || isUnknownValue(lhs)) {
        return lhs;
      }
      if (isOptionalValue(lhs) && lhs.hasValue()) {
        return lhs.value() ?? NullValue.Instance;
      }
      const rhs = this.args[1]!.eval(activation);
      if (isErrorValue(rhs) || isUnknownValue(rhs)) {
        return rhs;
      }
      return rhs;
    }

    // Evaluate arguments
    const argValues: Value[] = [];
    for (const arg of this.args) {
      const val = arg.eval(activation);
      // Return error/unknown immediately unless it's a non-strict function
      if (isErrorValue(val) || isUnknownValue(val)) {
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

  name(): string {
    return this.functionName;
  }

  overload(): string {
    return this.overloadId;
  }

  argList(): Interpretable[] {
    return this.args;
  }

  overloadDispatcher(): Dispatcher {
    return this.dispatcher;
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
  ) {}

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
      if (isErrorValue(val) || isUnknownValue(val)) {
        return val;
      }
      blockActivation.set(`@index${i}`, val);
    }
    return this.result.eval(blockActivation);
  }

  cost(): number {
    return 1 + this.slots.reduce((sum, slot) => sum + slot.cost(), 0) + this.result.cost();
  }

  slotValues(): Interpretable[] {
    return this.slots;
  }

  resultValue(): Interpretable {
    return this.result;
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

      if (isErrorValue(val)) {
        return val;
      }

      // Process optional elements
      if (this.optionalIndices.has(i)) {
        if (isOptionalValue(val)) {
          if (val.hasValue()) {
            values.push(val.value()!);
          }
          // Don't add element if hasValue is false
          continue;
        }
      }

      if (isUnknownValue(val)) {
        return val;
      }

      values.push(val);
    }

    return ListValue.of(values);
  }

  cost(): number {
    return 1 + this.elements.reduce((sum, elem) => sum + elem.cost(), 0);
  }

  elementValues(): Interpretable[] {
    return this.elements;
  }

  optionalIndexList(): number[] {
    return Array.from(this.optionalIndices);
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
      if (isErrorValue(key) || isUnknownValue(key)) {
        return key;
      }
      if (!isSupportedMapKey(key)) {
        return ErrorValue.of("unsupported key type", this.exprId);
      }

      const val = this.values[i]!.eval(activation);
      if (isErrorValue(val)) {
        return val;
      }

      // Process optional entries
      if (this.optionalIndices.has(i)) {
        if (isOptionalValue(val)) {
          if (val.hasValue()) {
            entries.push({ key, value: val.value()! });
          }
          // Don't add entry if hasValue is false
          continue;
        }
      }

      if (isUnknownValue(val)) {
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

  keyExpressions(): Interpretable[] {
    return this.keys;
  }

  valueExpressions(): Interpretable[] {
    return this.values;
  }

  optionalIndexList(): number[] {
    return Array.from(this.optionalIndices);
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
      if (isErrorValue(val) || isUnknownValue(val)) {
        return val;
      }
      const fieldType = this.fieldTypes.get(this.fields[i]!);
      const protoFieldType =
        this.typeProvider?.fieldProtoType(this.typeName, this.fields[i]!) ?? undefined;
      if (isNullValue(val)) {
        if (fieldType !== undefined) {
          if (!isNullAssignableField(fieldType, protoFieldType)) {
            return ErrorValue.of("unsupported field type", this.exprId);
          }
          continue;
        }
        if (
          protoFieldType === "google.protobuf.ListValue" ||
          protoFieldType === "google.protobuf.Struct"
        ) {
          return ErrorValue.of("unsupported field type", this.exprId);
        }
        continue;
      }
      if (fieldType?.kind === "struct") {
        const wrapperKind = wrapperKindFromTypeName(fieldType.runtimeTypeName);
        if (wrapperKind !== undefined) {
          const coerced = coerceWrapperValue(wrapperKind, val);
          if (isErrorValue(coerced)) {
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
        if (isErrorValue(mapValue)) {
          return mapValue;
        }
      }
      if (this.optionalFields.has(i)) {
        if (isOptionalValue(val)) {
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

  fieldNames(): string[] {
    return this.fields;
  }

  valueExpressions(): Interpretable[] {
    return this.values;
  }

  fieldTypeMap(): Map<string, CheckerType> {
    return this.fieldTypes;
  }

  optionalFieldIndices(): number[] {
    return Array.from(this.optionalFields);
  }

  provider(): TypeProvider | undefined {
    return this.typeProvider;
  }
}

function wrapperValueFromStruct(typeName: string, values: Map<string, Value>): Value | undefined {
  const kind = wrapperKindFromTypeName(typeName);
  if (kind === undefined) {
    return undefined;
  }
  let value = values.get("value");
  if (value !== undefined && isOptionalValue(value)) {
    value = value.hasValue() ? (value.value() ?? NullValue.Instance) : undefined;
  }
  if (value !== undefined && isNullValue(value)) {
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
    if (typeof numeric !== "number") {
      return numeric;
    }
    return DoubleValue.of(fround(numeric));
  }
  if (kind === "int32" || kind === "int64") {
    const numeric = intValueFromNumeric(value);
    if (typeof numeric !== "bigint") {
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
    if (typeof numeric !== "bigint") {
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
  if (isDoubleValue(value)) {
    return DoubleValue.of(fround(value.value()));
  }
  if (isIntValue(value)) {
    return DoubleValue.of(fround(Number(value.value())));
  }
  if (isUintValue(value)) {
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
      return isBoolValue(value) && !value.value();
    case "int":
      return isIntValue(value) && value.value() === 0n;
    case "uint":
      return isUintValue(value) && value.value() === 0n;
    case "double":
      return isDoubleValue(value) && value.value() === 0;
    case "string":
      return isStringValue(value) && value.value() === "";
    case "bytes":
      return isBytesValue(value) && value.value().length === 0;
    case "list":
      return isListValue(value) && value.value().length === 0;
    case "map":
      return isMapValue(value) && value.value().length === 0;
    case "opaque": {
      if (isEnumValue(value)) {
        return value.value() === 0n;
      }
      if (isIntValue(value)) {
        return value.value() === 0n;
      }
      return false;
    }
    default:
      return false;
  }
}

function coerceGoogleValue(value: Value): Value {
  if (isNullValue(value)) {
    return value;
  }
  if (isBoolValue(value)) {
    return value;
  }
  if (isDoubleValue(value)) {
    return value;
  }
  if (isIntValue(value)) {
    return intToJsonValue(value.value());
  }
  if (isUintValue(value)) {
    return uintToJsonValue(value.value());
  }
  if (isEnumValue(value)) {
    return intToJsonValue(value.value());
  }
  if (isStringValue(value)) {
    return value;
  }
  if (isBytesValue(value)) {
    return StringValue.of(encodeBase64(value.value()));
  }
  if (isDurationValue(value)) {
    return StringValue.of(value.toString());
  }
  if (isTimestampValue(value)) {
    return StringValue.of(value.toString());
  }
  if (isListValue(value)) {
    return value;
  }
  if (isMapValue(value)) {
    return value;
  }
  if (isStructValue(value)) {
    const typeName = (value.type() as CheckerType).runtimeTypeName;
    if (typeName === "google.protobuf.Empty") {
      return MapValue.of([]);
    }
    if (typeName === "google.protobuf.FieldMask") {
      const paths = value.getField("paths");
      if (isListValue(paths)) {
        const parts: string[] = [];
        for (const entry of paths.value()) {
          if (isStringValue(entry)) {
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
  if (isIntValue(value)) {
    return value.value();
  }
  if (isUintValue(value)) {
    return value.value();
  }
  if (isDoubleValue(value)) {
    const num = value.value();
    if (!Number.isFinite(num) || !Number.isInteger(num)) {
      return ErrorValue.typeMismatch("numeric", value);
    }
    return BigInt(num);
  }
  return ErrorValue.typeMismatch("numeric", value);
}

function extractNumericValue(value: Value): number | ErrorValue {
  if (isDoubleValue(value)) {
    return value.value();
  }
  if (isIntValue(value) || isUintValue(value)) {
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
  if (isIntValue(value)) {
    return value.value();
  }
  if (isUintValue(value)) {
    return value.value();
  }
  if (isDoubleValue(value)) {
    const num = value.value();
    if (!Number.isFinite(num) || !Number.isInteger(num)) {
      return undefined;
    }
    return BigInt(num);
  }
  if (isEnumValue(value)) {
    return value.value();
  }
  return undefined;
}

function isEnumInt32Range(value: bigint): boolean {
  return value >= -2147483648n && value <= 2147483647n;
}

function isSupportedMapKey(key: Value): boolean {
  return isBoolValue(key) || isIntValue(key) || isUintValue(key) || isStringValue(key);
}

function mapKeyId(key: Value): string {
  if (isIntValue(key)) {
    return `num:${key.value().toString()}`;
  }
  if (isUintValue(key)) {
    return `num:${key.value().toString()}`;
  }
  if (isBoolValue(key)) {
    return `bool:${key.value()}`;
  }
  if (isStringValue(key)) {
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
  ) {}

  id(): ExprId {
    return this.exprId;
  }

  eval(activation: Activation): Value {
    const obj = this.operand.eval(activation);
    if (isErrorValue(obj) || isUnknownValue(obj)) {
      return obj;
    }

    const idx = this.index.eval(activation);
    if (isErrorValue(idx) || isUnknownValue(idx)) {
      return idx;
    }

    // List access
    if (isListValue(obj)) {
      const normalized = normalizeIndexValue(idx);
      if (isErrorValue(normalized)) {
        return normalized;
      }
      return obj.get(normalized);
    }

    // Map access
    if (isMapValue(obj)) {
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
    if (isStringValue(obj)) {
      const normalized = normalizeIndexValue(idx);
      if (isErrorValue(normalized)) {
        return normalized;
      }
      return obj.charAt(normalized);
    }

    // Byte access
    if (isBytesValue(obj)) {
      const normalized = normalizeIndexValue(idx);
      if (isErrorValue(normalized)) {
        return normalized;
      }
      return obj.byteAt(normalized);
    }

    return ErrorValue.of(`type '${obj.type()}' does not support indexing`, this.exprId);
  }

  cost(): number {
    return 1 + this.operand.cost() + this.index.cost();
  }

  operandValue(): Interpretable {
    return this.operand;
  }

  indexValue(): Interpretable {
    return this.index;
  }

  isOptional(): boolean {
    return this.optional;
  }
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
  ) {}

  id(): ExprId {
    return this.exprId;
  }

  eval(activation: Activation): Value {
    const obj = this.operand.eval(activation);
    if (isErrorValue(obj) || isUnknownValue(obj)) {
      return obj;
    }

    // Map access
    if (isMapValue(obj)) {
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

  operandValue(): Interpretable {
    return this.operand;
  }

  fieldName(): string {
    return this.field;
  }

  isOptional(): boolean {
    return this.optional;
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
  ) {}

  id(): ExprId {
    return this.exprId;
  }

  eval(activation: Activation): Value {
    let obj = this.operand.eval(activation);
    if (isErrorValue(obj) || isUnknownValue(obj)) {
      return obj;
    }
    if (isOptionalValue(obj)) {
      if (!obj.hasValue()) {
        return BoolValue.False;
      }
      obj = obj.value()!;
    }

    // Map presence test
    if (isMapValue(obj)) {
      const key = StringValue.of(this.field);
      return obj.contains(key);
    }

    if (isStructValue(obj)) {
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

  operandValue(): Interpretable {
    return this.operand;
  }

  fieldName(): string {
    return this.field;
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
  ) {}

  id(): ExprId {
    return this.exprId;
  }

  eval(activation: Activation): Value {
    // Evaluate iteration range
    const range = this.iterRange.eval(activation);
    if (isErrorValue(range) || isUnknownValue(range)) {
      return range;
    }

    // Initialize accumulator
    let accu = this.accuInit.eval(activation);
    if (isErrorValue(accu) || isUnknownValue(accu)) {
      return accu;
    }

    // Create mutable activation
    const loopActivation = new MutableActivation(activation);
    loopActivation.set(this.accuVar, accu);

    // Iteration
    if (isListValue(range)) {
      if (this.iterVar2) {
        const elements = range.value();
        for (let i = 0; i < elements.length; i++) {
          loopActivation.set(this.iterVar, IntValue.of(i));
          loopActivation.set(this.iterVar2, elements[i]!);
          loopActivation.set(this.accuVar, accu);

          const cond = this.loopCondition.eval(loopActivation);
          if (isErrorValue(cond) || isUnknownValue(cond)) {
            return cond;
          }
          if (isBoolValue(cond) && !cond.value()) {
            break;
          }

          accu = this.loopStep.eval(loopActivation);
          if (isUnknownValue(accu)) {
            return accu;
          }
        }
      } else {
        for (const elem of range) {
          loopActivation.set(this.iterVar, elem);
          loopActivation.set(this.accuVar, accu);

          const cond = this.loopCondition.eval(loopActivation);
          if (isErrorValue(cond) || isUnknownValue(cond)) {
            return cond;
          }
          if (isBoolValue(cond) && !cond.value()) {
            break;
          }

          accu = this.loopStep.eval(loopActivation);
          if (isUnknownValue(accu)) {
            return accu;
          }
        }
      }
    } else if (isMapValue(range)) {
      if (this.iterVar2) {
        for (const entry of range) {
          loopActivation.set(this.iterVar, entry.key);
          loopActivation.set(this.iterVar2, entry.value);
          loopActivation.set(this.accuVar, accu);

          const cond = this.loopCondition.eval(loopActivation);
          if (isErrorValue(cond) || isUnknownValue(cond)) {
            return cond;
          }
          if (isBoolValue(cond) && !cond.value()) {
            break;
          }

          accu = this.loopStep.eval(loopActivation);
          if (isUnknownValue(accu)) {
            return accu;
          }
        }
      } else {
        for (const elem of range.keys()) {
          loopActivation.set(this.iterVar, elem);
          loopActivation.set(this.accuVar, accu);

          const cond = this.loopCondition.eval(loopActivation);
          if (isErrorValue(cond) || isUnknownValue(cond)) {
            return cond;
          }
          if (isBoolValue(cond) && !cond.value()) {
            break;
          }

          accu = this.loopStep.eval(loopActivation);
          if (isUnknownValue(accu)) {
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

  iterationVariable(): string {
    return this.iterVar;
  }

  iterationVariable2(): string | undefined {
    return this.iterVar2;
  }

  iterationRange(): Interpretable {
    return this.iterRange;
  }

  accumulatorVariable(): string {
    return this.accuVar;
  }

  accumulatorInit(): Interpretable {
    return this.accuInit;
  }

  loopConditionValue(): Interpretable {
    return this.loopCondition;
  }

  loopStepValue(): Interpretable {
    return this.loopStep;
  }

  resultValue(): Interpretable {
    return this.result;
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
  ) {}

  id(): ExprId {
    return this.exprId;
  }

  eval(activation: Activation): Value {
    const val = this.operand.eval(activation);
    if (isErrorValue(val) || isUnknownValue(val)) {
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

  operandValue(): Interpretable {
    return this.operand;
  }

  targetTypeName(): string {
    return this.targetType;
  }

  provider(): TypeProvider | undefined {
    return this.typeProvider;
  }

  private toInt(val: Value): Value {
    if (isIntValue(val)) {
      return val;
    }
    if (isEnumValue(val)) {
      const raw = val.value();
      if (raw < IntLimits.Int64Min || raw > IntLimits.Int64Max) {
        return ErrorValue.of("range error", this.exprId);
      }
      return IntValue.of(raw);
    }
    if (isUintValue(val)) {
      const raw = val.value();
      if (raw > IntLimits.Int64Max) {
        return ErrorValue.of("range error", this.exprId);
      }
      return IntValue.of(raw);
    }
    if (isDoubleValue(val)) {
      const doubleValue = val.value();
      if (!Number.isFinite(doubleValue)) {
        return ErrorValue.of("cannot convert infinity or NaN to int", this.exprId);
      }
      if (doubleValue <= Number(IntLimits.Int64Min) || doubleValue >= Number(IntLimits.Int64Max)) {
        return ErrorValue.of("range error", this.exprId);
      }
      const truncated = BigInt(Math.trunc(doubleValue));
      if (truncated < IntLimits.Int64Min || truncated > IntLimits.Int64Max) {
        return ErrorValue.of("range error", this.exprId);
      }
      return IntValue.of(truncated);
    }
    if (isStringValue(val)) {
      try {
        const numericValue = BigInt(val.value());
        if (numericValue < IntLimits.Int64Min || numericValue > IntLimits.Int64Max) {
          return ErrorValue.of("range error", this.exprId);
        }
        return IntValue.of(numericValue);
      } catch {
        return ErrorValue.of(`cannot parse '${val.value()}' as int`, this.exprId);
      }
    }
    if (isTimestampValue(val)) {
      return IntValue.of(val.value() / 1_000_000_000n);
    }
    return ErrorValue.of(`cannot convert ${val.type()} to int`, this.exprId);
  }

  private toUint(val: Value): Value {
    if (isUintValue(val)) {
      return val;
    }
    if (isEnumValue(val)) {
      const numericValue = val.value();
      if (numericValue < 0n) {
        return ErrorValue.of("cannot convert negative enum to uint", this.exprId);
      }
      if (numericValue > IntLimits.Uint64Max) {
        return ErrorValue.of("range error", this.exprId);
      }
      return UintValue.of(numericValue);
    }
    if (isIntValue(val)) {
      const numericValue = val.value();
      if (numericValue < 0n) {
        return ErrorValue.of("cannot convert negative int to uint", this.exprId);
      }
      if (numericValue > IntLimits.Uint64Max) {
        return ErrorValue.of("range error", this.exprId);
      }
      return UintValue.of(numericValue);
    }
    if (isDoubleValue(val)) {
      const doubleValue = val.value();
      if (!Number.isFinite(doubleValue) || doubleValue < 0) {
        return ErrorValue.of("cannot convert to uint", this.exprId);
      }
      const truncated = BigInt(Math.trunc(doubleValue));
      if (truncated > IntLimits.Uint64Max) {
        return ErrorValue.of("range error", this.exprId);
      }
      return UintValue.of(truncated);
    }
    if (isStringValue(val)) {
      try {
        const numericValue = BigInt(val.value());
        if (numericValue < 0n) {
          return ErrorValue.of("cannot parse negative number as uint", this.exprId);
        }
        if (numericValue > IntLimits.Uint64Max) {
          return ErrorValue.of("range error", this.exprId);
        }
        return UintValue.of(numericValue);
      } catch {
        return ErrorValue.of(`cannot parse '${val.value()}' as uint`, this.exprId);
      }
    }
    return ErrorValue.of(`cannot convert ${val.type()} to uint`, this.exprId);
  }

  private toDouble(val: Value): Value {
    if (isDoubleValue(val)) {
      return val;
    }
    if (isEnumValue(val)) {
      return DoubleValue.of(Number(val.value()));
    }
    if (isIntValue(val)) {
      return DoubleValue.of(Number(val.value()));
    }
    if (isUintValue(val)) {
      return DoubleValue.of(Number(val.value()));
    }
    if (isStringValue(val)) {
      const text = val.value();
      const doubleValue = Number.parseFloat(text);
      if (Number.isNaN(doubleValue) && text !== "NaN") {
        return ErrorValue.of(`cannot parse '${text}' as double`, this.exprId);
      }
      return DoubleValue.of(doubleValue);
    }
    return ErrorValue.of(`cannot convert ${val.type()} to double`, this.exprId);
  }

  private toString(val: Value): Value {
    if (isStringValue(val)) {
      return val;
    }
    if (isEnumValue(val)) {
      return StringValue.of(val.toString());
    }
    if (isIntValue(val)) {
      return StringValue.of(val.value().toString());
    }
    if (isUintValue(val)) {
      return StringValue.of(val.value().toString());
    }
    if (isDoubleValue(val)) {
      return StringValue.of(val.value().toString());
    }
    if (isBytesValue(val)) {
      const decoder = new TextDecoder("utf-8", { fatal: true });
      try {
        return StringValue.of(decoder.decode(val.value()));
      } catch {
        return ErrorValue.of("invalid UTF-8 in bytes", this.exprId);
      }
    }
    if (isBoolValue(val)) {
      return StringValue.of(val.value() ? "true" : "false");
    }
    if (isTimestampValue(val)) {
      return StringValue.of(val.toString());
    }
    if (isDurationValue(val)) {
      return StringValue.of(val.toString());
    }
    return ErrorValue.of(`cannot convert ${val.type()} to string`, this.exprId);
  }

  private toBytes(val: Value): Value {
    if (isBytesValue(val)) {
      return val;
    }
    if (isStringValue(val)) {
      return BytesValue.fromString(val.value());
    }
    return ErrorValue.of(`cannot convert ${val.type()} to bytes`, this.exprId);
  }

  private toBool(val: Value): Value {
    if (isBoolValue(val)) {
      return val;
    }
    if (isStringValue(val)) {
      const stringValue = val.value();
      if (
        stringValue === "true" ||
        stringValue === "TRUE" ||
        stringValue === "True" ||
        stringValue === "t" ||
        stringValue === "1"
      ) {
        return BoolValue.True;
      }
      if (
        stringValue === "false" ||
        stringValue === "FALSE" ||
        stringValue === "False" ||
        stringValue === "f" ||
        stringValue === "0"
      ) {
        return BoolValue.False;
      }
      return ErrorValue.of(`cannot parse '${stringValue}' as bool`, this.exprId);
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
    if (isEnumValue(val) && val.typeName() === enumType.runtimeTypeName) {
      return val;
    }
    const numeric = this.enumNumericValue(val);
    if (numeric === undefined) {
      if (isStringValue(val)) {
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
    if (isIntValue(val)) {
      return val.value();
    }
    if (isUintValue(val)) {
      return val.value();
    }
    if (isDoubleValue(val)) {
      const num = val.value();
      if (!Number.isFinite(num) || !Number.isInteger(num)) {
        return undefined;
      }
      return BigInt(num);
    }
    if (isEnumValue(val)) {
      return val.value();
    }
    return undefined;
  }

  private getType(val: Value): Value {
    return toTypeValue(val.type());
  }
}
