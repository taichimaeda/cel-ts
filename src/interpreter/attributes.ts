// CEL Attributes and Qualifiers
// Attribute/qualifier system for field and index access
// Implementation based on cel-go's interpret/attribute.go

import type { ExprId } from "../common/ast";
import type { Activation } from "./activation";
import type { Interpretable } from "./interpretable";
import { nativeToValue, normalizeIndexValue } from "./utils";
import {
  ErrorValue,
  OptionalValue,
  StringValue,
  type Value,
  isBoolValue,
  isBytesValue,
  isErrorValue,
  isListValue,
  isMapValue,
  isOptionalValue,
  isStringValue,
  isStructValue,
  isUnknownValue,
} from "./values";

export type Attribute =
  | AbsoluteAttribute
  | RelativeAttribute
  | ConditionalAttribute
  | MaybeAttribute;

export type Qualifier = StringQualifier | IndexQualifier | ComputedQualifier;

export type AttributeKind = "absolute" | "relative" | "conditional" | "maybe";

export type QualifierKind = "string" | "index" | "computed";

/**
 * String qualifier for field access like obj.field.
 */
export class StringQualifier {
  readonly kind: QualifierKind = "string";

  constructor(
    private readonly exprId: ExprId,
    private readonly field: string,
    private readonly optional = false
  ) {}

  id(): ExprId {
    return this.exprId;
  }

  qualify(_activation: Activation, obj: Value): Value {
    // Propagate errors or unknown values
    if (isErrorValue(obj) || isUnknownValue(obj)) {
      return obj;
    }

    let current: Value = obj;
    const optionalSelection = this.optional || isOptionalValue(current);
    const optionalValue = isOptionalValue(current) ? current : undefined;
    if (optionalValue) {
      if (!optionalValue.hasValue()) {
        return OptionalValue.none();
      }
      const inner = optionalValue.value();
      if (!inner) {
        return OptionalValue.none();
      }
      current = inner;
    }

    // Struct access
    if (isStructValue(current)) {
      if (optionalSelection && !current.hasField(this.field)) {
        return OptionalValue.none();
      }
      const value = current.getField(this.field);
      if (optionalSelection && !(isErrorValue(value) || isUnknownValue(value))) {
        return OptionalValue.of(value);
      }
      return value;
    }

    // Map access
    if (isMapValue(current)) {
      const key = StringValue.of(this.field);
      const hasKey = current.contains(key);
      if (hasKey.value()) {
        const value = current.get(key);
        if (optionalSelection && !(isErrorValue(value) || isUnknownValue(value))) {
          return OptionalValue.of(value);
        }
        return value;
      }
      if (optionalSelection) {
        return OptionalValue.none();
      }
      return ErrorValue.noSuchKey(key, this.exprId);
    }

    // Object access (when converted from native JS value)
    const nativeVal = current.value();
    if (typeof nativeVal === "object" && nativeVal !== null) {
      const record = nativeVal as unknown as Record<string, unknown>;
      if (this.field in record) {
        const value = nativeToValue(record[this.field]);
        if (optionalSelection) {
          return OptionalValue.of(value);
        }
        return value;
      }
      if (optionalSelection) {
        return OptionalValue.none();
      }
    }

    return ErrorValue.noSuchField(this.field, this.exprId);
  }
}

/**
 * Index qualifier for index access like obj[index].
 */
export class IndexQualifier {
  readonly kind: QualifierKind = "index";

  constructor(
    private readonly exprId: ExprId,
    private readonly index: Value,
    private readonly optional = false
  ) {}

  id(): ExprId {
    return this.exprId;
  }

  qualify(_activation: Activation, obj: Value): Value {
    // Propagate errors or unknown values
    if (isErrorValue(obj) || isUnknownValue(obj)) {
      return obj;
    }
    if (isErrorValue(this.index) || isUnknownValue(this.index)) {
      return this.index;
    }

    let current: Value = obj;
    const optionalSelection = this.optional || isOptionalValue(current);
    const optionalValue = isOptionalValue(current) ? current : undefined;
    if (optionalValue) {
      if (!optionalValue.hasValue()) {
        return OptionalValue.none();
      }
      const inner = optionalValue.value();
      if (!inner) {
        return OptionalValue.none();
      }
      current = inner;
    }

    // List access
    if (isListValue(current)) {
      const idx = normalizeIndexValue(this.index);
      if (isErrorValue(idx)) {
        return idx;
      }
      const value = current.get(idx);
      if (optionalSelection && value.kind === "error") {
        return OptionalValue.none();
      }
      if (optionalSelection && !(isErrorValue(value) || isUnknownValue(value))) {
        return OptionalValue.of(value);
      }
      return value;
    }

    // Map access
    if (isMapValue(current)) {
      const hasKey = current.contains(this.index);
      if (hasKey.value()) {
        const value = current.get(this.index);
        if (optionalSelection && !(isErrorValue(value) || isUnknownValue(value))) {
          return OptionalValue.of(value);
        }
        return value;
      }
      if (optionalSelection) {
        return OptionalValue.none();
      }
      return ErrorValue.noSuchKey(this.index, this.exprId);
    }

    // String access
    if (isStringValue(obj)) {
      const idx = normalizeIndexValue(this.index);
      if (isErrorValue(idx)) {
        return idx;
      }
      const value = obj.charAt(idx);
      if (optionalSelection && value.kind === "error") {
        return OptionalValue.none();
      }
      if (optionalSelection && !(isErrorValue(value) || isUnknownValue(value))) {
        return OptionalValue.of(value);
      }
      return value;
    }

    if (isBytesValue(obj)) {
      const idx = normalizeIndexValue(this.index);
      if (isErrorValue(idx)) {
        return idx;
      }
      const value = obj.byteAt(idx);
      if (optionalSelection && value.kind === "error") {
        return OptionalValue.none();
      }
      if (optionalSelection && !(isErrorValue(value) || isUnknownValue(value))) {
        return OptionalValue.of(value);
      }
      return value;
    }

    return ErrorValue.of(`type '${obj.type()}' does not support indexing`, this.exprId);
  }
}

/**
 * Computed qualifier for dynamic index access like obj[expr].
 */
export class ComputedQualifier {
  readonly kind: QualifierKind = "computed";

  constructor(
    private readonly exprId: ExprId,
    private readonly operand: Interpretable,
    private readonly optional = false
  ) {}

  id(): ExprId {
    return this.exprId;
  }

  qualify(activation: Activation, obj: Value): Value {
    // Propagate errors or unknown values
    if (isErrorValue(obj) || isUnknownValue(obj)) {
      return obj;
    }

    // Evaluate the index
    const index = this.operand.eval(activation);
    if (isErrorValue(index) || isUnknownValue(index)) {
      return index;
    }

    // Delegate to IndexQualifier
    const indexQual = new IndexQualifier(this.exprId, index, this.optional);
    return indexQual.qualify(activation, obj);
  }

  isConstant(): boolean {
    return false;
  }
}

/**
 * Absolute attribute rooted at a variable.
 */
export class AbsoluteAttribute {
  readonly kind: AttributeKind = "absolute";

  private readonly namePath: readonly string[];
  private readonly quals: Qualifier[];

  constructor(
    private readonly exprId: ExprId,
    namePath: string[],
    qualifiers: Qualifier[] = []
  ) {
    this.namePath = [...namePath];
    this.quals = [...qualifiers];
  }

  id(): ExprId {
    return this.exprId;
  }

  qualifiers(): readonly Qualifier[] {
    return this.quals;
  }

  addQualifier(qualifier: Qualifier): Attribute {
    this.quals.push(qualifier);
    return this;
  }

  resolve(activation: Activation): Value {
    // Resolve the variable
    const rootName = this.namePath[0]!;
    let value = activation.resolve(rootName);

    if (value === undefined) {
      // Try multi-level path (e.g., a.b.c as root variable)
      const fullName = this.namePath.join(".");
      value = activation.resolve(fullName);
      if (value === undefined) {
        return ErrorValue.of(`undeclared variable: ${rootName}`, this.exprId);
      }
    } else {
      // Apply remaining path elements as qualifiers
      for (let i = 1; i < this.namePath.length; i++) {
        const qual = new StringQualifier(this.exprId, this.namePath[i]!, false);
        value = qual.qualify(activation, value);
        if (isErrorValue(value) || isUnknownValue(value)) {
          return value;
        }
      }
    }

    // Apply additional qualifiers
    for (const qual of this.quals) {
      value = qual.qualify(activation, value);
      if (isErrorValue(value) || isUnknownValue(value)) {
        return value;
      }
    }

    return value;
  }
}

/**
 * Relative attribute from a computed operand.
 */
export class RelativeAttribute {
  readonly kind: AttributeKind = "relative";

  private readonly quals: Qualifier[];

  constructor(
    private readonly exprId: ExprId,
    private readonly operand: Interpretable,
    qualifiers: Qualifier[] = []
  ) {
    this.quals = [...qualifiers];
  }

  id(): ExprId {
    return this.exprId;
  }

  qualifiers(): readonly Qualifier[] {
    return this.quals;
  }

  addQualifier(qualifier: Qualifier): Attribute {
    this.quals.push(qualifier);
    return this;
  }

  resolve(activation: Activation): Value {
    // Evaluate the operand
    let value = this.operand.eval(activation);
    if (isErrorValue(value) || isUnknownValue(value)) {
      return value;
    }

    // Apply qualifiers
    for (const qual of this.quals) {
      value = qual.qualify(activation, value);
      if (isErrorValue(value) || isUnknownValue(value)) {
        return value;
      }
    }

    return value;
  }
}

/**
 * Conditional attribute for ternary expressions.
 */
export class ConditionalAttribute {
  readonly kind: AttributeKind = "conditional";

  private readonly quals: Qualifier[] = [];

  constructor(
    private readonly exprId: ExprId,
    private readonly condition: Interpretable,
    private readonly truthy: Attribute,
    private readonly falsy: Attribute
  ) {}

  id(): ExprId {
    return this.exprId;
  }

  qualifiers(): readonly Qualifier[] {
    return this.quals;
  }

  addQualifier(qualifier: Qualifier): Attribute {
    // Adding a qualifier to conditional attribute adds it to both branches
    this.truthy.addQualifier(qualifier);
    this.falsy.addQualifier(qualifier);
    this.quals.push(qualifier);
    return this;
  }

  resolve(activation: Activation): Value {
    // Evaluate the condition
    const condValue = this.condition.eval(activation);

    if (isErrorValue(condValue)) {
      return condValue;
    }
    if (isUnknownValue(condValue)) {
      // Evaluate both branches and merge
      const truthyVal = this.truthy.resolve(activation);
      const falsyVal = this.falsy.resolve(activation);
      if (isUnknownValue(truthyVal) && isUnknownValue(falsyVal)) {
        return truthyVal.merge(falsyVal);
      }
      return condValue;
    }

    if (isBoolValue(condValue)) {
      return condValue.value() ? this.truthy.resolve(activation) : this.falsy.resolve(activation);
    }

    return ErrorValue.typeMismatch("bool", condValue, this.exprId);
  }
}

/**
 * Maybe attribute for optional field access.
 */
export class MaybeAttribute {
  readonly kind: AttributeKind = "maybe";

  private readonly candidates: Attribute[];
  private readonly quals: Qualifier[];

  constructor(
    private readonly exprId: ExprId,
    candidates: Attribute[] = []
  ) {
    this.candidates = candidates;
    this.quals = [];
  }

  id(): ExprId {
    return this.exprId;
  }

  qualifiers(): readonly Qualifier[] {
    return this.quals;
  }

  addQualifier(qualifier: Qualifier): Attribute {
    for (const candidate of this.candidates) {
      candidate.addQualifier(qualifier);
    }
    this.quals.push(qualifier);
    return this;
  }

  addCandidate(attr: Attribute): void {
    this.candidates.push(attr);
  }

  resolve(activation: Activation): Value {
    // Try each candidate and return the first one that succeeds
    for (const candidate of this.candidates) {
      const value = candidate.resolve(activation);
      if (!isErrorValue(value)) {
        return value;
      }
    }

    // If all failed, return the last error
    if (this.candidates.length > 0) {
      return this.candidates[this.candidates.length - 1]!.resolve(activation);
    }

    return ErrorValue.of("no candidates for maybe attribute", this.exprId);
  }
}
