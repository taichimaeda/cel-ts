// CEL Runtime Values
// TypeScript-native implementation of CEL runtime value types

import type { TypeProvider } from "../checker/provider";
import {
  BoolType as CheckerBoolType,
  BytesType as CheckerBytesType,
  DoubleType as CheckerDoubleType,
  DurationType as CheckerDurationType,
  ErrorType as CheckerErrorType,
  IntType as CheckerIntType,
  NullType as CheckerNullType,
  OptionalType as CheckerOptionalType,
  StringType as CheckerStringType,
  StructType as CheckerStructType,
  TimestampType as CheckerTimestampType,
  type Type as CheckerType,
  TypeKind as CheckerTypeKind,
  TypeType as CheckerTypeType,
  UintType as CheckerUintType,
  DynType,
  OpaqueType,
} from "../checker/types";
import type { ExprId } from "../common/ast";
import {
  GenericListType,
  GenericMapType,
  OptionalType as RuntimeOptionalType,
  UnknownType,
  type ValueType,
} from "./types";

/**
 * Base interface for all CEL runtime values
 */
export interface Value {
  /** Get the type of this value */
  type(): ValueType;

  /** Get a human-readable representation */
  toString(): string;

  /** Check equality with another value */
  equal(other: Value): Value;

  /** Convert to native JavaScript value */
  value(): unknown;
}

/**
 * Type adapter interface for converting native values to CEL values
 */
export interface TypeAdapter {
  nativeToValue(value: unknown): Value;
}

export type AnyResolver = (typeUrl: string, bytes: Uint8Array) => Value | null;

let anyResolver: AnyResolver | null = null;

export function setAnyResolver(resolver: AnyResolver | null): void {
  anyResolver = resolver;
}

export function resolveAnyValue(typeUrl: string, bytes: Uint8Array): Value | null {
  return anyResolver ? anyResolver(typeUrl, bytes) : null;
}

/**
 * Boolean value
 */
export class BoolValue implements Value {
  static readonly True = new BoolValue(true);
  static readonly False = new BoolValue(false);

  private constructor(private readonly val: boolean) {}

  static of(val: boolean): BoolValue {
    return val ? BoolValue.True : BoolValue.False;
  }

  type(): ValueType {
    return CheckerBoolType;
  }

  toString(): string {
    return String(this.val);
  }

  equal(other: Value): Value {
    if (other instanceof BoolValue) {
      return BoolValue.of(this.val === other.val);
    }
    return BoolValue.False;
  }

  value(): boolean {
    return this.val;
  }

  negate(): BoolValue {
    return BoolValue.of(!this.val);
  }

  and(other: BoolValue): BoolValue {
    return BoolValue.of(this.val && other.val);
  }

  or(other: BoolValue): BoolValue {
    return BoolValue.of(this.val || other.val);
  }
}

/**
 * 64-bit signed integer value
 */
export class IntValue implements Value {
  static readonly Zero = new IntValue(0n);
  static readonly One = new IntValue(1n);
  static readonly NegOne = new IntValue(-1n);

  private readonly val: bigint;

  constructor(val: bigint | number) {
    this.val = typeof val === "number" ? BigInt(Math.trunc(val)) : val;
  }

  static of(val: bigint | number): IntValue {
    const v = typeof val === "number" ? BigInt(Math.trunc(val)) : val;
    if (v === 0n) return IntValue.Zero;
    if (v === 1n) return IntValue.One;
    if (v === -1n) return IntValue.NegOne;
    return new IntValue(v);
  }

  type(): ValueType {
    return CheckerIntType;
  }

  toString(): string {
    return String(this.val);
  }

  equal(other: Value): Value {
    if (other instanceof IntValue) {
      return BoolValue.of(this.val === other.val);
    }
    if (other instanceof EnumValue) {
      return BoolValue.of(this.val === other.value());
    }
    if (other instanceof UintValue) {
      return BoolValue.of(this.val >= 0n && this.val === other.value());
    }
    if (other instanceof DoubleValue) {
      return BoolValue.of(Number(this.val) === other.value());
    }
    return BoolValue.False;
  }

  value(): bigint {
    return this.val;
  }

  add(other: IntValue): IntValue {
    return IntValue.of(this.val + other.val);
  }

  subtract(other: IntValue): IntValue {
    return IntValue.of(this.val - other.val);
  }

  multiply(other: IntValue): IntValue {
    return IntValue.of(this.val * other.val);
  }

  divide(other: IntValue): IntValue | ErrorValue {
    if (other.val === 0n) {
      return ErrorValue.divisionByZero();
    }
    return IntValue.of(this.val / other.val);
  }

  modulo(other: IntValue): IntValue | ErrorValue {
    if (other.val === 0n) {
      return ErrorValue.moduloByZero();
    }
    return IntValue.of(this.val % other.val);
  }

  negate(): IntValue {
    return IntValue.of(-this.val);
  }

  compare(other: IntValue): number {
    if (this.val < other.val) return -1;
    if (this.val > other.val) return 1;
    return 0;
  }
}

/**
 * 64-bit unsigned integer value
 */
export class UintValue implements Value {
  static readonly Zero = new UintValue(0n);
  static readonly One = new UintValue(1n);

  private readonly val: bigint;

  constructor(val: bigint | number) {
    const v = typeof val === "number" ? BigInt(Math.trunc(val)) : val;
    if (v < 0n) {
      throw new Error("UintValue cannot be negative");
    }
    this.val = v;
  }

  static of(val: bigint | number): UintValue {
    const v = typeof val === "number" ? BigInt(Math.trunc(val)) : val;
    if (v === 0n) return UintValue.Zero;
    if (v === 1n) return UintValue.One;
    return new UintValue(v);
  }

  type(): ValueType {
    return CheckerUintType;
  }

  toString(): string {
    return String(this.val) + "u";
  }

  equal(other: Value): Value {
    if (other instanceof UintValue) {
      return BoolValue.of(this.val === other.val);
    }
    if (other instanceof IntValue) {
      const otherVal = other.value();
      return BoolValue.of(otherVal >= 0n && this.val === otherVal);
    }
    if (other instanceof DoubleValue) {
      return BoolValue.of(Number(this.val) === other.value());
    }
    return BoolValue.False;
  }

  value(): bigint {
    return this.val;
  }

  add(other: UintValue): UintValue {
    return UintValue.of(this.val + other.val);
  }

  subtract(other: UintValue): UintValue | ErrorValue {
    if (this.val < other.val) {
      return ErrorValue.create("uint overflow on subtraction");
    }
    return UintValue.of(this.val - other.val);
  }

  multiply(other: UintValue): UintValue {
    return UintValue.of(this.val * other.val);
  }

  divide(other: UintValue): UintValue | ErrorValue {
    if (other.val === 0n) {
      return ErrorValue.divisionByZero();
    }
    return UintValue.of(this.val / other.val);
  }

  modulo(other: UintValue): UintValue | ErrorValue {
    if (other.val === 0n) {
      return ErrorValue.moduloByZero();
    }
    return UintValue.of(this.val % other.val);
  }

  compare(other: UintValue): number {
    if (this.val < other.val) return -1;
    if (this.val > other.val) return 1;
    return 0;
  }
}

/**
 * Enum value backed by a numeric value with a specific enum type.
 */
export class EnumValue implements Value {
  private readonly enumType: CheckerType;
  private readonly val: bigint;

  constructor(typeName: string, val: bigint | number) {
    this.enumType = new OpaqueType(typeName);
    this.val = typeof val === "number" ? BigInt(Math.trunc(val)) : val;
  }

  type(): ValueType {
    return this.enumType;
  }

  typeName(): string {
    return this.enumType.runtimeTypeName;
  }

  toString(): string {
    return this.val.toString();
  }

  equal(other: Value): Value {
    if (other instanceof EnumValue) {
      return BoolValue.of(
        this.enumType.runtimeTypeName === other.enumType.runtimeTypeName && this.val === other.val
      );
    }
    if (other instanceof IntValue) {
      return BoolValue.of(this.val === other.value());
    }
    if (other instanceof UintValue) {
      return BoolValue.of(this.val >= 0n && this.val === other.value());
    }
    if (other instanceof DoubleValue) {
      return BoolValue.of(Number(this.val) === other.value());
    }
    return BoolValue.False;
  }

  value(): bigint {
    return this.val;
  }
}

/**
 * Double-precision floating point value
 */
export class DoubleValue implements Value {
  static readonly Zero = new DoubleValue(0);
  static readonly One = new DoubleValue(1);
  static readonly NaN = new DoubleValue(Number.NaN);
  static readonly PositiveInfinity = new DoubleValue(Number.POSITIVE_INFINITY);
  static readonly NegativeInfinity = new DoubleValue(Number.NEGATIVE_INFINITY);

  private readonly val: number;

  constructor(val: number) {
    this.val = val;
  }

  static of(val: number): DoubleValue {
    if (val === 0) return DoubleValue.Zero;
    if (val === 1) return DoubleValue.One;
    if (Number.isNaN(val)) return DoubleValue.NaN;
    if (val === Number.POSITIVE_INFINITY) return DoubleValue.PositiveInfinity;
    if (val === Number.NEGATIVE_INFINITY) return DoubleValue.NegativeInfinity;
    return new DoubleValue(val);
  }

  type(): ValueType {
    return CheckerDoubleType;
  }

  toString(): string {
    if (Number.isInteger(this.val) && Number.isFinite(this.val)) {
      return this.val.toFixed(1);
    }
    return String(this.val);
  }

  equal(other: Value): Value {
    if (other instanceof DoubleValue) {
      return BoolValue.of(this.val === other.val);
    }
    if (other instanceof IntValue) {
      return BoolValue.of(this.val === Number(other.value()));
    }
    if (other instanceof UintValue) {
      return BoolValue.of(this.val === Number(other.value()));
    }
    return BoolValue.False;
  }

  value(): number {
    return this.val;
  }

  add(other: DoubleValue): DoubleValue {
    return DoubleValue.of(this.val + other.val);
  }

  subtract(other: DoubleValue): DoubleValue {
    return DoubleValue.of(this.val - other.val);
  }

  multiply(other: DoubleValue): DoubleValue {
    return DoubleValue.of(this.val * other.val);
  }

  divide(other: DoubleValue): DoubleValue {
    return DoubleValue.of(this.val / other.val);
  }

  negate(): DoubleValue {
    return DoubleValue.of(-this.val);
  }

  compare(other: DoubleValue): number {
    if (this.val < other.val) return -1;
    if (this.val > other.val) return 1;
    if (this.val === other.val) return 0;
    // NaN comparison
    return Number.NaN;
  }
}

/**
 * String value
 */
export class StringValue implements Value {
  static readonly Empty = new StringValue("");

  constructor(private readonly val: string) {}

  static of(val: string): StringValue {
    if (val === "") return StringValue.Empty;
    return new StringValue(val);
  }

  type(): ValueType {
    return CheckerStringType;
  }

  toString(): string {
    return JSON.stringify(this.val);
  }

  equal(other: Value): Value {
    if (other instanceof StringValue) {
      return BoolValue.of(this.val === other.val);
    }
    return BoolValue.False;
  }

  value(): string {
    return this.val;
  }

  add(other: StringValue): StringValue {
    return StringValue.of(this.val + other.val);
  }

  compare(other: StringValue): number {
    if (this.val < other.val) return -1;
    if (this.val > other.val) return 1;
    return 0;
  }

  size(): IntValue {
    // Return number of code points, not code units
    return IntValue.of([...this.val].length);
  }

  contains(substring: StringValue): BoolValue {
    return BoolValue.of(this.val.includes(substring.val));
  }

  startsWith(prefix: StringValue): BoolValue {
    return BoolValue.of(this.val.startsWith(prefix.val));
  }

  endsWith(suffix: StringValue): BoolValue {
    return BoolValue.of(this.val.endsWith(suffix.val));
  }

  matches(pattern: StringValue): BoolValue | ErrorValue {
    try {
      const regex = new RegExp(pattern.val);
      return BoolValue.of(regex.test(this.val));
    } catch {
      return ErrorValue.create(`invalid regex: ${pattern.val}`);
    }
  }

  charAt(index: IntValue): StringValue | ErrorValue {
    const idx = Number(index.value());
    const chars = [...this.val];
    if (idx < 0 || idx >= chars.length) {
      return ErrorValue.indexOutOfBounds(idx, chars.length);
    }
    return StringValue.of(chars[idx]!);
  }
}

/**
 * Bytes value
 */
export class BytesValue implements Value {
  static readonly Empty = new BytesValue(new Uint8Array(0));

  constructor(private readonly val: Uint8Array) {}

  static of(val: Uint8Array | number[]): BytesValue {
    const arr = val instanceof Uint8Array ? val : new Uint8Array(val);
    if (arr.length === 0) return BytesValue.Empty;
    return new BytesValue(arr);
  }

  static fromString(val: string): BytesValue {
    const encoder = new TextEncoder();
    return BytesValue.of(encoder.encode(val));
  }

  type(): ValueType {
    return CheckerBytesType;
  }

  toString(): string {
    return `b"${Array.from(this.val)
      .map((b) => String.fromCharCode(b))
      .join("")}"`;
  }

  equal(other: Value): Value {
    if (other instanceof BytesValue) {
      if (this.val.length !== other.val.length) {
        return BoolValue.False;
      }
      for (let i = 0; i < this.val.length; i++) {
        if (this.val[i] !== other.val[i]) {
          return BoolValue.False;
        }
      }
      return BoolValue.True;
    }
    return BoolValue.False;
  }

  value(): Uint8Array {
    return this.val;
  }

  add(other: BytesValue): BytesValue {
    const result = new Uint8Array(this.val.length + other.val.length);
    result.set(this.val);
    result.set(other.val, this.val.length);
    return BytesValue.of(result);
  }

  size(): IntValue {
    return IntValue.of(this.val.length);
  }

  byteAt(index: IntValue): IntValue | ErrorValue {
    const idx = Number(index.value());
    if (idx < 0 || idx >= this.val.length) {
      return ErrorValue.indexOutOfBounds(idx, this.val.length);
    }
    return IntValue.of(this.val[idx]!);
  }
}

/**
 * Null value singleton
 */
export class NullValue implements Value {
  static readonly Instance = new NullValue();

  private constructor() {}

  type(): ValueType {
    return CheckerNullType;
  }

  toString(): string {
    return "null";
  }

  equal(other: Value): Value {
    return BoolValue.of(other instanceof NullValue);
  }

  value(): null {
    return null;
  }
}

/**
 * List value
 */
export class ListValue implements Value {
  static readonly Empty = new ListValue([]);

  private readonly elements: readonly Value[];

  constructor(elements: Value[]) {
    this.elements = Object.freeze([...elements]);
  }

  static of(elements: Value[]): ListValue {
    if (elements.length === 0) return ListValue.Empty;
    return new ListValue(elements);
  }

  type(): ValueType {
    return GenericListType;
  }

  toString(): string {
    return `[${this.elements.map((e) => e.toString()).join(", ")}]`;
  }

  equal(other: Value): Value {
    if (other instanceof ListValue) {
      if (this.elements.length !== other.elements.length) {
        return BoolValue.False;
      }
      for (let i = 0; i < this.elements.length; i++) {
        const eq = this.elements[i]!.equal(other.elements[i]!);
        if (eq instanceof BoolValue && !eq.value()) {
          return BoolValue.False;
        }
        if (eq instanceof ErrorValue) {
          return eq;
        }
      }
      return BoolValue.True;
    }
    return BoolValue.False;
  }

  value(): readonly Value[] {
    return this.elements;
  }

  size(): IntValue {
    return IntValue.of(this.elements.length);
  }

  get(index: IntValue): Value {
    const idx = Number(index.value());
    if (idx < 0 || idx >= this.elements.length) {
      return ErrorValue.indexOutOfBounds(idx, this.elements.length);
    }
    return this.elements[idx]!;
  }

  contains(val: Value): BoolValue {
    for (const elem of this.elements) {
      const eq = elem.equal(val);
      if (eq instanceof BoolValue && eq.value()) {
        return BoolValue.True;
      }
    }
    return BoolValue.False;
  }

  add(other: ListValue): ListValue {
    return ListValue.of([...this.elements, ...other.elements]);
  }

  [Symbol.iterator](): Iterator<Value> {
    return this.elements[Symbol.iterator]();
  }
}

/**
 * Map entry for MapValue
 */
export interface MapEntry {
  key: Value;
  value: Value;
}

/**
 * Map value
 */
export class MapValue implements Value {
  static readonly Empty = new MapValue([]);

  private readonly entries: readonly MapEntry[];
  private readonly keyIndex: Map<string, number>;

  constructor(entries: MapEntry[]) {
    this.entries = Object.freeze([...entries]);
    this.keyIndex = new Map();
    for (let i = 0; i < entries.length; i++) {
      const key = this.keyToString(entries[i]!.key);
      this.keyIndex.set(key, i);
    }
  }

  static of(entries: MapEntry[]): MapValue {
    if (entries.length === 0) return MapValue.Empty;
    return new MapValue(entries);
  }

  static fromObject(obj: Record<string, Value>): MapValue {
    const entries: MapEntry[] = Object.entries(obj).map(([k, v]) => ({
      key: StringValue.of(k),
      value: v,
    }));
    return MapValue.of(entries);
  }

  private keyToString(key: Value): string {
    if (key instanceof IntValue) {
      return `num:${key.value().toString()}`;
    }
    if (key instanceof UintValue) {
      return `num:${key.value().toString()}`;
    }
    if (key instanceof DoubleValue) {
      const value = key.value();
      if (Number.isFinite(value) && Number.isInteger(value)) {
        return `num:${value}`;
      }
      return `double:${value}`;
    }
    // Create a unique string representation for the key
    return `${key.type()}:${key.value()}`;
  }

  type(): ValueType {
    return GenericMapType;
  }

  toString(): string {
    const pairs = this.entries.map((e) => `${e.key.toString()}: ${e.value.toString()}`);
    return `{${pairs.join(", ")}}`;
  }

  equal(other: Value): Value {
    if (other instanceof MapValue) {
      if (this.entries.length !== other.entries.length) {
        return BoolValue.False;
      }
      for (const entry of this.entries) {
        const otherVal = other.get(entry.key);
        if (otherVal instanceof ErrorValue) {
          return BoolValue.False;
        }
        const eq = entry.value.equal(otherVal);
        if (eq instanceof BoolValue && !eq.value()) {
          return BoolValue.False;
        }
      }
      return BoolValue.True;
    }
    return BoolValue.False;
  }

  value(): readonly MapEntry[] {
    return this.entries;
  }

  size(): IntValue {
    return IntValue.of(this.entries.length);
  }

  get(key: Value): Value {
    const keyStr = this.keyToString(key);
    const idx = this.keyIndex.get(keyStr);
    if (idx === undefined) {
      return ErrorValue.noSuchKey(key);
    }
    return this.entries[idx]!.value;
  }

  contains(key: Value): BoolValue {
    const keyStr = this.keyToString(key);
    return BoolValue.of(this.keyIndex.has(keyStr));
  }

  keys(): ListValue {
    return ListValue.of(this.entries.map((e) => e.key));
  }

  [Symbol.iterator](): Iterator<MapEntry> {
    return this.entries[Symbol.iterator]();
  }
}

/**
 * Struct value for protobuf/message-like objects with field presence info.
 */
export class StructValue implements Value {
  private readonly values: Map<string, Value>;
  private readonly presentFields: Set<string>;
  private readonly fieldTypes: Map<string, CheckerType>;
  private readonly typeProvider: TypeProvider | undefined;

  constructor(
    private readonly typeName: string,
    values: Map<string, Value>,
    presentFields: Set<string>,
    fieldTypes: Map<string, CheckerType> = new Map(),
    typeProvider?: TypeProvider
  ) {
    this.values = new Map(values);
    this.presentFields = new Set(presentFields);
    this.fieldTypes = new Map(fieldTypes);
    this.typeProvider = typeProvider;
  }

  type(): ValueType {
    return new CheckerStructType(this.typeName);
  }

  toString(): string {
    const entries = [...this.values.entries()].map(([key, value]) => `${key}: ${value.toString()}`);
    return `${this.typeName}{${entries.join(", ")}}`;
  }

  equal(other: Value): Value {
    if (!(other instanceof StructValue)) {
      return BoolValue.False;
    }
    if (this.typeName !== other.typeName) {
      return BoolValue.False;
    }

    const fieldNames = new Set<string>([
      ...this.presentFields,
      ...other.presentFields,
      ...this.values.keys(),
      ...other.values.keys(),
    ]);

    for (const name of fieldNames) {
      const left = this.getField(name);
      if (left instanceof ErrorValue) {
        return left;
      }
      const right = other.getField(name);
      if (right instanceof ErrorValue) {
        return right;
      }
      const eq = left.equal(right);
      if (eq instanceof BoolValue && !eq.value()) {
        return BoolValue.False;
      }
      if (eq instanceof ErrorValue) {
        return eq;
      }
    }

    return BoolValue.True;
  }

  value(): Record<string, Value> {
    const result: Record<string, Value> = {};
    for (const [name, value] of this.values) {
      result[name] = value;
    }
    return result;
  }

  hasField(name: string): boolean {
    return this.presentFields.has(name);
  }

  getField(name: string): Value {
    const value = this.values.get(name);
    if (value !== undefined) {
      return value;
    }
    const fieldType = this.fieldTypes.get(name);
    if (!fieldType) {
      return ErrorValue.noSuchField(name);
    }
    if (
      fieldType.kind === CheckerTypeKind.Struct &&
      wrapperKindFromTypeName(fieldType.runtimeTypeName) !== null
    ) {
      return NullValue.Instance;
    }
    if (fieldType.kind === CheckerTypeKind.Struct && this.typeProvider) {
      const nestedFields = new Map<string, CheckerType>();
      const nestedNames = this.typeProvider.structFieldNames(fieldType.runtimeTypeName);
      for (const fieldName of nestedNames) {
        const nestedType = this.typeProvider.findStructFieldType(
          fieldType.runtimeTypeName,
          fieldName
        );
        if (nestedType) {
          nestedFields.set(fieldName, nestedType);
        }
      }
      return new StructValue(
        fieldType.runtimeTypeName,
        new Map(),
        new Set(),
        nestedFields,
        this.typeProvider
      );
    }
    if (fieldType.kind === CheckerTypeKind.Opaque && this.typeProvider) {
      const enumType = this.typeProvider.findEnumType(fieldType.runtimeTypeName);
      if (enumType) {
        return new EnumValue(enumType.runtimeTypeName, 0n);
      }
    }
    return defaultValueForType(fieldType);
  }
}

function wrapperKindFromTypeName(
  typeName: string
): "bool" | "bytes" | "double" | "float" | "int" | "uint" | "string" | null {
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
    case "google.protobuf.Int64Value":
      return "int";
    case "google.protobuf.UInt32Value":
    case "google.protobuf.UInt64Value":
      return "uint";
    case "google.protobuf.StringValue":
      return "string";
    default:
      return null;
  }
}

/**
 * Type value - represents a type itself as a value
 */
export class TypeValue implements Value {
  static readonly BoolType = new TypeValue(CheckerBoolType);
  static readonly IntType = new TypeValue(CheckerIntType);
  static readonly UintType = new TypeValue(CheckerUintType);
  static readonly DoubleType = new TypeValue(CheckerDoubleType);
  static readonly StringType = new TypeValue(CheckerStringType);
  static readonly BytesType = new TypeValue(CheckerBytesType);
  static readonly NullType = new TypeValue(CheckerNullType);
  static readonly ListType = new TypeValue(GenericListType);
  static readonly MapType = new TypeValue(GenericMapType);
  static readonly TypeType = new TypeValue(CheckerTypeType);
  static readonly DurationType = new TypeValue(CheckerDurationType);
  static readonly TimestampType = new TypeValue(CheckerTimestampType);

  constructor(private readonly typeName: ValueType) {}

  type(): ValueType {
    return CheckerTypeType;
  }

  toString(): string {
    return `type(${this.typeName.toString()})`;
  }

  equal(other: Value): Value {
    if (other instanceof TypeValue) {
      if (this.typeName.toString() === other.typeName.toString()) {
        return BoolValue.True;
      }
      return BoolValue.False;
    }
    return BoolValue.False;
  }

  value(): string {
    return this.typeName.toString();
  }
}

export type { ValueType } from "./types";

export class ValueUtil {
  static toTypeValue(type: ValueType): TypeValue {
    if (type === CheckerBoolType) return TypeValue.BoolType;
    if (type === CheckerIntType) return TypeValue.IntType;
    if (type === CheckerUintType) return TypeValue.UintType;
    if (type === CheckerDoubleType) return TypeValue.DoubleType;
    if (type === CheckerStringType) return TypeValue.StringType;
    if (type === CheckerBytesType) return TypeValue.BytesType;
    if (type === CheckerNullType) return TypeValue.NullType;
    if (type === GenericListType) return TypeValue.ListType;
    if (type === GenericMapType) return TypeValue.MapType;
    if (type === CheckerTypeType) return TypeValue.TypeType;
    if (type === CheckerDurationType) return TypeValue.DurationType;
    if (type === CheckerTimestampType) return TypeValue.TimestampType;
    if (type === RuntimeOptionalType) {
      return new TypeValue(new CheckerOptionalType(DynType));
    }
    return new TypeValue(type);
  }

  static isError(val: Value): val is ErrorValue {
    return val instanceof ErrorValue;
  }

  static isUnknown(val: Value): val is UnknownValue {
    return val instanceof UnknownValue;
  }

  static isErrorOrUnknown(val: Value): boolean {
    return ValueUtil.isError(val) || ValueUtil.isUnknown(val);
  }
}

/**
 * Duration value (nanoseconds)
 */
export class DurationValue implements Value {
  static readonly Zero = new DurationValue(0n);

  constructor(private readonly nanos: bigint) {}

  static of(nanos: bigint): DurationValue {
    if (nanos === 0n) return DurationValue.Zero;
    return new DurationValue(nanos);
  }

  static fromSeconds(seconds: number): DurationValue {
    return new DurationValue(BigInt(Math.trunc(seconds * 1e9)));
  }

  static fromMillis(millis: number): DurationValue {
    return new DurationValue(BigInt(Math.trunc(millis * 1e6)));
  }

  type(): ValueType {
    return CheckerDurationType;
  }

  toString(): string {
    const seconds = Number(this.nanos) / 1e9;
    return `${seconds}s`;
  }

  equal(other: Value): Value {
    if (other instanceof DurationValue) {
      return BoolValue.of(this.nanos === other.nanos);
    }
    return BoolValue.False;
  }

  value(): bigint {
    return this.nanos;
  }

  add(other: DurationValue): DurationValue {
    return DurationValue.of(this.nanos + other.nanos);
  }

  subtract(other: DurationValue): DurationValue {
    return DurationValue.of(this.nanos - other.nanos);
  }

  negate(): DurationValue {
    return DurationValue.of(-this.nanos);
  }

  compare(other: DurationValue): number {
    if (this.nanos < other.nanos) return -1;
    if (this.nanos > other.nanos) return 1;
    return 0;
  }

  getHours(): IntValue {
    return IntValue.of(this.nanos / 3_600_000_000_000n);
  }

  getMinutes(): IntValue {
    return IntValue.of(this.nanos / 60_000_000_000n);
  }

  getSeconds(): IntValue {
    return IntValue.of(this.nanos / 1_000_000_000n);
  }

  getMilliseconds(): IntValue {
    return IntValue.of((this.nanos / 1_000_000n) % 1000n);
  }
}

/**
 * Timestamp value (Unix timestamp in nanoseconds)
 */
export class TimestampValue implements Value {
  constructor(private readonly nanos: bigint) {}

  static of(nanos: bigint): TimestampValue {
    return new TimestampValue(nanos);
  }

  static fromDate(date: Date): TimestampValue {
    return new TimestampValue(BigInt(date.getTime()) * 1_000_000n);
  }

  static fromSeconds(seconds: number): TimestampValue {
    return new TimestampValue(BigInt(Math.trunc(seconds * 1e9)));
  }

  static now(): TimestampValue {
    return TimestampValue.fromDate(new Date());
  }

  type(): ValueType {
    return CheckerTimestampType;
  }

  toString(): string {
    return formatTimestamp(this.nanos);
  }

  equal(other: Value): Value {
    if (other instanceof TimestampValue) {
      return BoolValue.of(this.nanos === other.nanos);
    }
    return BoolValue.False;
  }

  value(): bigint {
    return this.nanos;
  }

  add(duration: DurationValue): TimestampValue {
    return TimestampValue.of(this.nanos + duration.value());
  }

  subtract(other: TimestampValue | DurationValue): TimestampValue | DurationValue {
    if (other instanceof TimestampValue) {
      return DurationValue.of(this.nanos - other.nanos);
    }
    return TimestampValue.of(this.nanos - other.value());
  }

  compare(other: TimestampValue): number {
    if (this.nanos < other.nanos) return -1;
    if (this.nanos > other.nanos) return 1;
    return 0;
  }

  toDate(): Date {
    return new Date(Number(this.nanos / 1_000_000n));
  }

  getFullYear(tz?: string): IntValue {
    const parts = this.getZonedParts(tz);
    return IntValue.of(parts.year);
  }

  getMonth(tz?: string): IntValue {
    const parts = this.getZonedParts(tz);
    return IntValue.of(parts.month - 1);
  }

  getDate(tz?: string): IntValue {
    const parts = this.getZonedParts(tz);
    return IntValue.of(parts.day);
  }

  getDayOfMonth(tz?: string): IntValue {
    const parts = this.getZonedParts(tz);
    return IntValue.of(parts.day - 1);
  }

  getDayOfWeek(tz?: string): IntValue {
    const parts = this.getZonedParts(tz);
    return IntValue.of(parts.dayOfWeek);
  }

  getDayOfYear(tz?: string): IntValue {
    const parts = this.getZonedParts(tz);
    const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
    const start = new Date(Date.UTC(parts.year, 0, 1));
    const diff = date.getTime() - start.getTime();
    const oneDay = 1000 * 60 * 60 * 24;
    return IntValue.of(Math.floor(diff / oneDay));
  }

  getHours(tz?: string): IntValue {
    const parts = this.getZonedParts(tz);
    return IntValue.of(parts.hour);
  }

  getMinutes(tz?: string): IntValue {
    const parts = this.getZonedParts(tz);
    return IntValue.of(parts.minute);
  }

  getSeconds(tz?: string): IntValue {
    const parts = this.getZonedParts(tz);
    return IntValue.of(parts.second);
  }

  getMilliseconds(tz?: string): IntValue {
    const date = this.toDate();
    if (tz) {
      const offsetMinutes = parseTimeZoneOffset(tz);
      if (offsetMinutes !== null) {
        const shifted = new Date(date.getTime() + offsetMinutes * 60_000);
        return IntValue.of(shifted.getUTCMilliseconds());
      }
    }
    const millis = date.getUTCMilliseconds();
    return IntValue.of(millis);
  }

  private getZonedParts(tz?: string): {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
    dayOfWeek: number;
  } {
    const date = this.toDate();
    if (!tz) {
      return {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate(),
        hour: date.getUTCHours(),
        minute: date.getUTCMinutes(),
        second: date.getUTCSeconds(),
        dayOfWeek: date.getUTCDay(),
      };
    }

    const offsetMinutes = parseTimeZoneOffset(tz);
    if (offsetMinutes !== null) {
      const shifted = new Date(date.getTime() + offsetMinutes * 60_000);
      return {
        year: shifted.getUTCFullYear(),
        month: shifted.getUTCMonth() + 1,
        day: shifted.getUTCDate(),
        hour: shifted.getUTCHours(),
        minute: shifted.getUTCMinutes(),
        second: shifted.getUTCSeconds(),
        dayOfWeek: shifted.getUTCDay(),
      };
    }

    try {
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        weekday: "short",
        hour12: false,
      });
      const parts = formatter.formatToParts(date);
      const lookup = (type: string): string | undefined =>
        parts.find((part) => part.type === type)?.value;
      const year = Number(lookup("year"));
      const month = Number(lookup("month"));
      const day = Number(lookup("day"));
      const hour = Number(lookup("hour"));
      const minute = Number(lookup("minute"));
      const second = Number(lookup("second"));
      const weekday = lookup("weekday") ?? "Sun";
      return {
        year,
        month,
        day,
        hour,
        minute,
        second,
        dayOfWeek: weekdayToNumber(weekday),
      };
    } catch {
      return {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate(),
        hour: date.getUTCHours(),
        minute: date.getUTCMinutes(),
        second: date.getUTCSeconds(),
        dayOfWeek: date.getUTCDay(),
      };
    }
  }
}

function formatTimestamp(nanos: bigint): string {
  let seconds = nanos / 1_000_000_000n;
  let nanosRem = nanos % 1_000_000_000n;
  if (nanosRem < 0n) {
    nanosRem += 1_000_000_000n;
    seconds -= 1n;
  }
  const date = new Date(Number(seconds) * 1000);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const hour = date.getUTCHours();
  const minute = date.getUTCMinutes();
  const second = date.getUTCSeconds();
  let result = `${pad4(year)}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}:${pad2(second)}`;
  if (nanosRem !== 0n) {
    let fraction = nanosRem.toString().padStart(9, "0");
    fraction = fraction.replace(/0+$/, "");
    result += `.${fraction}`;
  }
  return `${result}Z`;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function pad4(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  return `${sign}${String(abs).padStart(4, "0")}`;
}

function parseTimeZoneOffset(tz: string): number | null {
  const normalized = tz.trim();
  if (normalized === "UTC" || normalized === "Z") {
    return 0;
  }
  const match = /^([+-]?)(\d{2}):(\d{2})$/.exec(normalized);
  if (!match) {
    return null;
  }
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  return sign * (hours * 60 + minutes);
}

function weekdayToNumber(weekday: string): number {
  switch (weekday.slice(0, 3)) {
    case "Sun":
      return 0;
    case "Mon":
      return 1;
    case "Tue":
      return 2;
    case "Wed":
      return 3;
    case "Thu":
      return 4;
    case "Fri":
      return 5;
    case "Sat":
      return 6;
    default:
      return 0;
  }
}

/**
 * Error value for runtime errors
 */
export class ErrorValue implements Value {
  constructor(
    private readonly message: string,
    private readonly exprId?: ExprId
  ) {}

  static create(message: string, exprId?: ExprId): ErrorValue {
    return new ErrorValue(message, exprId);
  }

  static divisionByZero(exprId?: ExprId): ErrorValue {
    return new ErrorValue("division by zero", exprId);
  }

  static moduloByZero(exprId?: ExprId): ErrorValue {
    return new ErrorValue("modulo by zero", exprId);
  }

  static indexOutOfBounds(index: number, size: number, exprId?: ExprId): ErrorValue {
    return new ErrorValue(`index out of bounds: ${index}, size: ${size}`, exprId);
  }

  static noSuchKey(key: Value, exprId?: ExprId): ErrorValue {
    return new ErrorValue(`no such key: ${key.toString()}`, exprId);
  }

  static noSuchField(field: string, exprId?: ExprId): ErrorValue {
    return new ErrorValue(`no such field: ${field}`, exprId);
  }

  static typeMismatch(expected: string, actual: Value, exprId?: ExprId): ErrorValue {
    return new ErrorValue(`type mismatch: expected ${expected}, got ${actual.type()}`, exprId);
  }

  type(): ValueType {
    return CheckerErrorType;
  }

  toString(): string {
    return `error: ${this.message}`;
  }

  equal(_other: Value): Value {
    return BoolValue.False;
  }

  value(): string {
    return this.message;
  }

  getMessage(): string {
    return this.message;
  }

  getExprId(): ExprId | undefined {
    return this.exprId;
  }

  withExprId(exprId: ExprId): ErrorValue {
    if (this.exprId !== undefined) {
      return this;
    }
    return new ErrorValue(this.message, exprId);
  }
}

/**
 * Unknown value for partial evaluation
 */
export class UnknownValue implements Value {
  static readonly Instance = new UnknownValue([]);

  private readonly attributeIds: readonly number[];

  constructor(attributeIds: number[]) {
    this.attributeIds = Object.freeze([...attributeIds]);
  }

  static of(attributeIds: number[]): UnknownValue {
    if (attributeIds.length === 0) return UnknownValue.Instance;
    return new UnknownValue(attributeIds);
  }

  type(): ValueType {
    return UnknownType;
  }

  toString(): string {
    return "unknown";
  }

  equal(_other: Value): Value {
    return this;
  }

  value(): readonly number[] {
    return this.attributeIds;
  }

  merge(other: UnknownValue): UnknownValue {
    const merged = new Set([...this.attributeIds, ...other.attributeIds]);
    return UnknownValue.of([...merged]);
  }
}

/**
 * Optional value wrapper
 */
export class OptionalValue implements Value {
  static readonly None = new OptionalValue(null);

  private constructor(private readonly inner: Value | null) {}

  static of(val: Value): OptionalValue {
    return new OptionalValue(val);
  }

  static none(): OptionalValue {
    return OptionalValue.None;
  }

  type(): ValueType {
    return RuntimeOptionalType;
  }

  toString(): string {
    if (this.inner === null) {
      return "optional.none()";
    }
    return `optional.of(${this.inner.toString()})`;
  }

  equal(other: Value): Value {
    if (other instanceof OptionalValue) {
      if (this.inner === null && other.inner === null) {
        return BoolValue.True;
      }
      if (this.inner === null || other.inner === null) {
        return BoolValue.False;
      }
      return this.inner.equal(other.inner);
    }
    return BoolValue.False;
  }

  value(): Value | null {
    return this.inner;
  }

  hasValue(): boolean {
    return this.inner !== null;
  }

  getOrElse(defaultValue: Value): Value {
    return this.inner ?? defaultValue;
  }
}

function defaultValueForType(type: CheckerType): Value {
  if (type.isOptionalType()) {
    return OptionalValue.none();
  }

  switch (type.kind) {
    case CheckerTypeKind.Bool:
      return BoolValue.False;
    case CheckerTypeKind.Int:
      return IntValue.of(0);
    case CheckerTypeKind.Uint:
      return UintValue.of(0);
    case CheckerTypeKind.Double:
      return DoubleValue.of(0);
    case CheckerTypeKind.String:
      return StringValue.of("");
    case CheckerTypeKind.Bytes:
      return BytesValue.of(new Uint8Array());
    case CheckerTypeKind.Duration:
      return DurationValue.Zero;
    case CheckerTypeKind.Timestamp:
      return TimestampValue.of(0n);
    case CheckerTypeKind.List:
      return ListValue.of([]);
    case CheckerTypeKind.Map:
      return MapValue.of([]);
    case CheckerTypeKind.Struct:
      return NullValue.Instance;
    case CheckerTypeKind.Null:
      return NullValue.Instance;
    case CheckerTypeKind.Type:
      return TypeValue.TypeType;
    case CheckerTypeKind.Dyn:
    case CheckerTypeKind.Error:
    case CheckerTypeKind.TypeParam:
    case CheckerTypeKind.Any:
    case CheckerTypeKind.Opaque:
      return NullValue.Instance;
    default:
      return NullValue.Instance;
  }
}

/**
 * Default type adapter for converting native values to CEL values
 */
export class DefaultTypeAdapter implements TypeAdapter {
  nativeToValue(value: unknown): Value {
    if (value === null || value === undefined) {
      return NullValue.Instance;
    }
    if (typeof value === "boolean") {
      return BoolValue.of(value);
    }
    if (typeof value === "number") {
      if (Number.isInteger(value)) {
        return IntValue.of(value);
      }
      return DoubleValue.of(value);
    }
    if (typeof value === "bigint") {
      return IntValue.of(value);
    }
    if (typeof value === "string") {
      return StringValue.of(value);
    }
    if (value instanceof Uint8Array) {
      return BytesValue.of(value);
    }
    if (value instanceof Date) {
      return TimestampValue.fromDate(value);
    }
    if (Array.isArray(value)) {
      return ListValue.of(value.map((v) => this.nativeToValue(v)));
    }
    if (value instanceof Map) {
      const entries: MapEntry[] = [];
      for (const [k, v] of value) {
        entries.push({
          key: this.nativeToValue(k),
          value: this.nativeToValue(v),
        });
      }
      return MapValue.of(entries);
    }
    if (typeof value === "object") {
      const entries: MapEntry[] = Object.entries(value as object).map(([k, v]) => ({
        key: StringValue.of(k),
        value: this.nativeToValue(v),
      }));
      return MapValue.of(entries);
    }
    return ErrorValue.create(`cannot convert value of type ${typeof value}`);
  }
}
