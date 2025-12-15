// CEL Attributes and Qualifiers
// Attribute/qualifier system for field and index access
// Implementation based on cel-go's interpret/attribute.go

import type { ExprId } from "../common/ast";
import type { Activation } from "./activation";
import {
  BoolValue,
  DefaultTypeAdapter,
  ErrorValue,
  IntValue,
  ListValue,
  MapValue,
  StringValue,
  type TypeAdapter,
  UintValue,
  type UnknownValue,
  type Value,
  isError,
  isUnknown,
} from "./values";

/**
 * Attribute represents a qualified variable reference.
 */
export interface Attribute {
  /**
   * Add a qualifier to this attribute.
   */
  addQualifier(qualifier: Qualifier): Attribute;

  /**
   * Resolve the attribute value.
   */
  resolve(activation: Activation): Value;

  /**
   * Get the expression ID associated with this attribute.
   */
  id(): ExprId;

  /**
   * Get all qualifiers on this attribute.
   */
  qualifiers(): readonly Qualifier[];
}

/**
 * Qualifier represents a field access, index access, or method call.
 */
export interface Qualifier {
  /**
   * Get the expression ID for this qualifier.
   */
  id(): ExprId;

  /**
   * Qualify a value, returning the qualified result.
   */
  qualify(activation: Activation, obj: Value): Value;

  /**
   * Check if this is a constant qualifier (no runtime resolution needed).
   */
  isConstant(): boolean;
}

/**
 * AttributeFactory creates attributes and qualifiers.
 */
export interface AttributeFactory {
  /**
   * Create an absolute attribute (rooted at a variable).
   */
  absoluteAttribute(exprId: ExprId, names: string[]): Attribute;

  /**
   * Create a relative attribute (from a computed value).
   */
  relativeAttribute(exprId: ExprId, operand: Interpretable): Attribute;

  /**
   * Create a conditional attribute for ternary expressions.
   */
  conditionalAttribute(
    exprId: ExprId,
    condition: Interpretable,
    truthy: Attribute,
    falsy: Attribute
  ): Attribute;

  /**
   * Create a maybe attribute for optional access.
   */
  maybeAttribute(exprId: ExprId, name: string): Attribute;

  /**
   * Create a field qualifier.
   */
  newQualifier(exprId: ExprId, value: Value | Interpretable, isOptional?: boolean): Qualifier;
}

/**
 * Forward reference to Interpretable (defined in interpretable.ts).
 */
export interface Interpretable {
  id(): ExprId;
  eval(activation: Activation): Value;
}

/**
 * String qualifier for field access like obj.field.
 */
export class StringQualifier implements Qualifier {
  private readonly exprId: ExprId;
  private readonly field: string;
  private readonly optional: boolean;
  private readonly adapter: TypeAdapter;

  constructor(exprId: ExprId, field: string, optional = false, adapter?: TypeAdapter) {
    this.exprId = exprId;
    this.field = field;
    this.optional = optional;
    this.adapter = adapter ?? new DefaultTypeAdapter();
  }

  id(): ExprId {
    return this.exprId;
  }

  qualify(_activation: Activation, obj: Value): Value {
    // Propagate errors or unknown values
    if (isError(obj) || isUnknown(obj)) {
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
        return ErrorValue.noSuchKey(key, this.exprId);
      }
      return ErrorValue.noSuchKey(key, this.exprId);
    }

    // Object access (when converted from native JS value)
    const nativeVal = obj.value();
    if (typeof nativeVal === "object" && nativeVal !== null) {
      const record = nativeVal as Record<string, unknown>;
      if (this.field in record) {
        return this.adapter.nativeToValue(record[this.field]);
      }
    }

    return ErrorValue.noSuchField(this.field, this.exprId);
  }

  isConstant(): boolean {
    return true;
  }
}

/**
 * Index qualifier for index access like obj[index].
 */
export class IndexQualifier implements Qualifier {
  private readonly exprId: ExprId;
  private readonly index: Value;
  private readonly optional: boolean;

  constructor(exprId: ExprId, index: Value, optional = false) {
    this.exprId = exprId;
    this.index = index;
    this.optional = optional;
  }

  id(): ExprId {
    return this.exprId;
  }

  qualify(_activation: Activation, obj: Value): Value {
    // Propagate errors or unknown values
    if (isError(obj) || isUnknown(obj)) {
      return obj;
    }
    if (isError(this.index) || isUnknown(this.index)) {
      return this.index;
    }

    // List access
    if (obj instanceof ListValue) {
      if (this.index instanceof IntValue || this.index instanceof UintValue) {
        const idx =
          this.index instanceof IntValue ? this.index : IntValue.of(Number(this.index.value()));
        return obj.get(idx);
      }
      return ErrorValue.typeMismatch("int or uint", this.index, this.exprId);
    }

    // Map access
    if (obj instanceof MapValue) {
      const hasKey = obj.contains(this.index);
      if (hasKey.value()) {
        return obj.get(this.index);
      }
      if (this.optional) {
        return ErrorValue.noSuchKey(this.index, this.exprId);
      }
      return ErrorValue.noSuchKey(this.index, this.exprId);
    }

    // String access
    if (obj instanceof StringValue) {
      if (this.index instanceof IntValue) {
        return obj.charAt(this.index);
      }
      return ErrorValue.typeMismatch("int", this.index, this.exprId);
    }

    return ErrorValue.create(`type '${obj.type()}' does not support indexing`, this.exprId);
  }

  isConstant(): boolean {
    return true;
  }
}

/**
 * Computed qualifier for dynamic index access like obj[expr].
 */
export class ComputedQualifier implements Qualifier {
  private readonly exprId: ExprId;
  private readonly operand: Interpretable;
  private readonly optional: boolean;

  constructor(exprId: ExprId, operand: Interpretable, optional = false) {
    this.exprId = exprId;
    this.operand = operand;
    this.optional = optional;
  }

  id(): ExprId {
    return this.exprId;
  }

  qualify(activation: Activation, obj: Value): Value {
    // Propagate errors or unknown values
    if (isError(obj) || isUnknown(obj)) {
      return obj;
    }

    // Evaluate the index
    const index = this.operand.eval(activation);
    if (isError(index) || isUnknown(index)) {
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
export class AbsoluteAttribute implements Attribute {
  private readonly exprId: ExprId;
  private readonly namePath: readonly string[];
  private readonly quals: Qualifier[];
  private readonly adapter: TypeAdapter;

  constructor(
    exprId: ExprId,
    namePath: string[],
    qualifiers: Qualifier[] = [],
    adapter?: TypeAdapter
  ) {
    this.exprId = exprId;
    this.namePath = Object.freeze([...namePath]);
    this.quals = [...qualifiers];
    this.adapter = adapter ?? new DefaultTypeAdapter();
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
        return ErrorValue.create(`undeclared variable: ${rootName}`, this.exprId);
      }
    } else {
      // Apply remaining path elements as qualifiers
      for (let i = 1; i < this.namePath.length; i++) {
        const qual = new StringQualifier(this.exprId, this.namePath[i]!, false, this.adapter);
        value = qual.qualify(activation, value);
        if (isError(value) || isUnknown(value)) {
          return value;
        }
      }
    }

    // Apply additional qualifiers
    for (const qual of this.quals) {
      value = qual.qualify(activation, value);
      if (isError(value) || isUnknown(value)) {
        return value;
      }
    }

    return value;
  }
}

/**
 * Relative attribute from a computed operand.
 */
export class RelativeAttribute implements Attribute {
  private readonly exprId: ExprId;
  private readonly operand: Interpretable;
  private readonly quals: Qualifier[];

  constructor(exprId: ExprId, operand: Interpretable, qualifiers: Qualifier[] = []) {
    this.exprId = exprId;
    this.operand = operand;
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
    if (isError(value) || isUnknown(value)) {
      return value;
    }

    // Apply qualifiers
    for (const qual of this.quals) {
      value = qual.qualify(activation, value);
      if (isError(value) || isUnknown(value)) {
        return value;
      }
    }

    return value;
  }
}

/**
 * Conditional attribute for ternary expressions.
 */
export class ConditionalAttribute implements Attribute {
  private readonly exprId: ExprId;
  private readonly condition: Interpretable;
  private readonly truthy: Attribute;
  private readonly falsy: Attribute;
  private readonly quals: Qualifier[];

  constructor(exprId: ExprId, condition: Interpretable, truthy: Attribute, falsy: Attribute) {
    this.exprId = exprId;
    this.condition = condition;
    this.truthy = truthy;
    this.falsy = falsy;
    this.quals = [];
  }

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

    if (isError(condValue)) {
      return condValue;
    }
    if (isUnknown(condValue)) {
      // Evaluate both branches and merge
      const truthyVal = this.truthy.resolve(activation);
      const falsyVal = this.falsy.resolve(activation);
      if (isUnknown(truthyVal) && isUnknown(falsyVal)) {
        return truthyVal.merge(falsyVal as UnknownValue);
      }
      return condValue;
    }

    if (condValue instanceof BoolValue) {
      return condValue.value() ? this.truthy.resolve(activation) : this.falsy.resolve(activation);
    }

    return ErrorValue.typeMismatch("bool", condValue, this.exprId);
  }
}

/**
 * Maybe attribute for optional field access.
 */
export class MaybeAttribute implements Attribute {
  private readonly exprId: ExprId;
  private readonly candidates: Attribute[];
  private readonly quals: Qualifier[];

  constructor(exprId: ExprId, candidates: Attribute[] = []) {
    this.exprId = exprId;
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
      if (!isError(value)) {
        return value;
      }
    }

    // If all failed, return the last error
    if (this.candidates.length > 0) {
      return this.candidates[this.candidates.length - 1]!.resolve(activation);
    }

    return ErrorValue.create("no candidates for maybe attribute", this.exprId);
  }
}

/**
 * Default AttributeFactory implementation.
 */
export class DefaultAttributeFactory implements AttributeFactory {
  private readonly adapter: TypeAdapter;

  constructor(adapter?: TypeAdapter) {
    this.adapter = adapter ?? new DefaultTypeAdapter();
  }

  absoluteAttribute(exprId: ExprId, names: string[]): Attribute {
    return new AbsoluteAttribute(exprId, names, [], this.adapter);
  }

  relativeAttribute(exprId: ExprId, operand: Interpretable): Attribute {
    return new RelativeAttribute(exprId, operand);
  }

  conditionalAttribute(
    exprId: ExprId,
    condition: Interpretable,
    truthy: Attribute,
    falsy: Attribute
  ): Attribute {
    return new ConditionalAttribute(exprId, condition, truthy, falsy);
  }

  maybeAttribute(exprId: ExprId, name: string): Attribute {
    const candidate = new AbsoluteAttribute(exprId, [name], [], this.adapter);
    return new MaybeAttribute(exprId, [candidate]);
  }

  newQualifier(exprId: ExprId, value: Value | Interpretable, isOptional = false): Qualifier {
    // For constant values
    if ("type" in value && typeof value.type === "function") {
      const v = value as Value;
      if (v instanceof StringValue) {
        return new StringQualifier(exprId, v.value(), isOptional, this.adapter);
      }
      return new IndexQualifier(exprId, v, isOptional);
    }

    // For Interpretable
    return new ComputedQualifier(exprId, value as Interpretable, isOptional);
  }
}
