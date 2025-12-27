// CEL Runtime Values
// TypeScript-native implementation of CEL runtime value types

import type { TypeProvider } from "../checker/provider";
import {
  BoolType,
  BytesType,
  OptionalType as CheckerOptionalType,
  StructType as CheckerStructType,
  type Type as CheckerType,
  DoubleType,
  DurationType,
  DynType,
  ErrorType,
  IntType,
  NullType,
  OpaqueType,
  StringType,
  TimestampType,
  DynTypeType,
  UintType,
} from "../checker/types";
import type { ExprId } from "../common/ast";
import {
  GenericListType,
  GenericMapType,
  OptionalType as RuntimeOptionalType,
  type RuntimeType,
  UnknownType,
} from "./types";
import {
  defaultValueForType,
  formatTimestamp,
  parseTimeZoneOffset,
  protoDefaultToValue,
  weekdayToNumber,
  wrapperTypeNameToKind,
} from "./utils";

// ---------------------------------------------------------------------------
// Integer Limits
// ---------------------------------------------------------------------------

/**
 * Integer range limits for CEL types.
 */
export const IntLimits = {
  Int64Min: -(1n << 63n),
  Int64Max: (1n << 63n) - 1n,
  Uint64Max: (1n << 64n) - 1n,
  Int32Min: -2147483648n,
  Int32Max: 2147483647n,
  Uint32Max: 4294967295n,
} as const;
const DURATION_MAX_SECONDS = 315576000000n;
const DURATION_MAX_NANOS = DURATION_MAX_SECONDS * 1_000_000_000n;
const TIMESTAMP_MIN_SECONDS = -62135596800n;
const TIMESTAMP_MAX_SECONDS = 253402300799n;
const TIMESTAMP_MIN_NANOS = TIMESTAMP_MIN_SECONDS * 1_000_000_000n;
const TIMESTAMP_MAX_NANOS = TIMESTAMP_MAX_SECONDS * 1_000_000_000n + 999_999_999n;

// ---------------------------------------------------------------------------
// Value Kind Type
// ---------------------------------------------------------------------------

type ValueKind =
  | "bool"
  | "int"
  | "uint"
  | "enum"
  | "double"
  | "string"
  | "bytes"
  | "null"
  | "list"
  | "map"
  | "struct"
  | "type"
  | "duration"
  | "timestamp"
  | "error"
  | "unknown"
  | "optional";

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

function isDurationInRange(nanos: bigint): boolean {
  return (
    nanos >= -DURATION_MAX_NANOS &&
    nanos <= DURATION_MAX_NANOS &&
    nanos >= IntLimits.Int64Min &&
    nanos <= IntLimits.Int64Max
  );
}

function isTimestampInRange(nanos: bigint): boolean {
  return nanos >= TIMESTAMP_MIN_NANOS && nanos <= TIMESTAMP_MAX_NANOS;
}

// ---------------------------------------------------------------------------
// Base Value Class
// ---------------------------------------------------------------------------

/**
 * Base class for all CEL runtime values
 */
export abstract class BaseValue {
  abstract readonly kind: ValueKind;
  /** Get the type of this value */
  abstract type(): RuntimeType;

  /** Get a human-readable representation */
  abstract toString(): string;

  /** Check equality with another value */
  abstract equal(other: Value): Value;

  /** Convert to native JavaScript value */
  abstract value(): unknown;
}

/**
 * Type adapter interface for converting native values to CEL values
 */
type AnyResolver = (typeUrl: string, bytes: Uint8Array) => Value | undefined;

let anyResolver: AnyResolver | undefined;

/**
 * Register a resolver for google.protobuf.Any values.
 */
export function setAnyResolver(resolver?: AnyResolver): void {
  anyResolver = resolver;
}

/**
 * Resolve a google.protobuf.Any value into a CEL value.
 */
export function resolveAnyValue(typeUrl: string, bytes: Uint8Array): Value | undefined {
  return anyResolver ? anyResolver(typeUrl, bytes) : undefined;
}

/**
 * Boolean value
 */
export class BoolValue extends BaseValue {
  static readonly True = new BoolValue(true);
  static readonly False = new BoolValue(false);
  readonly kind: ValueKind = "bool";

  private constructor(private readonly val: boolean) {
    super();
  }

  static of(val: boolean): BoolValue {
    return val ? BoolValue.True : BoolValue.False;
  }

  type(): RuntimeType {
    return BoolType;
  }

  toString(): string {
    return String(this.val);
  }

  equal(other: Value): Value {
    if (isBoolValue(other)) {
      return BoolValue.of(this.val === other.value());
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
export class IntValue extends BaseValue {
  static readonly Zero = new IntValue(0n);
  static readonly One = new IntValue(1n);
  static readonly NegOne = new IntValue(-1n);
  readonly kind: ValueKind = "int";

  private readonly val: bigint;

  private constructor(val: bigint | number) {
    super();
    this.val = typeof val === "number" ? BigInt(Math.trunc(val)) : val;
  }

  static of(val: bigint | number): IntValue {
    const normalizedValue = typeof val === "number" ? BigInt(Math.trunc(val)) : val;
    if (normalizedValue === 0n) return IntValue.Zero;
    if (normalizedValue === 1n) return IntValue.One;
    if (normalizedValue === -1n) return IntValue.NegOne;
    return new IntValue(normalizedValue);
  }

  type(): RuntimeType {
    return IntType;
  }

  toString(): string {
    return String(this.val);
  }

  equal(other: Value): Value {
    if (isIntValue(other)) {
      return BoolValue.of(this.val === other.value());
    }
    if (isEnumValue(other)) {
      return BoolValue.of(this.val === other.value());
    }
    if (isUintValue(other)) {
      return BoolValue.of(this.val >= 0n && this.val === other.value());
    }
    if (isDoubleValue(other)) {
      return BoolValue.of(Number(this.val) === other.value());
    }
    return BoolValue.False;
  }

  value(): bigint {
    return this.val;
  }

  add(other: IntValue): IntValue | ErrorValue {
    const result = this.val + other.val;
    if (result < IntLimits.Int64Min || result > IntLimits.Int64Max) {
      return ErrorValue.of("int overflow");
    }
    return IntValue.of(result);
  }

  subtract(other: IntValue): IntValue | ErrorValue {
    const result = this.val - other.val;
    if (result < IntLimits.Int64Min || result > IntLimits.Int64Max) {
      return ErrorValue.of("int overflow");
    }
    return IntValue.of(result);
  }

  multiply(other: IntValue): IntValue | ErrorValue {
    const result = this.val * other.val;
    if (result < IntLimits.Int64Min || result > IntLimits.Int64Max) {
      return ErrorValue.of("int overflow");
    }
    return IntValue.of(result);
  }

  divide(other: IntValue): IntValue | ErrorValue {
    if (other.val === 0n) {
      return ErrorValue.divisionByZero();
    }
    if (this.val === IntLimits.Int64Min && other.val === -1n) {
      return ErrorValue.of("int overflow");
    }
    return IntValue.of(this.val / other.val);
  }

  modulo(other: IntValue): IntValue | ErrorValue {
    if (other.val === 0n) {
      return ErrorValue.moduloByZero();
    }
    return IntValue.of(this.val % other.val);
  }

  negate(): IntValue | ErrorValue {
    if (this.val === IntLimits.Int64Min) {
      return ErrorValue.of("int overflow");
    }
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
export class UintValue extends BaseValue {
  static readonly Zero = new UintValue(0n);
  static readonly One = new UintValue(1n);
  readonly kind: ValueKind = "uint";

  private readonly val: bigint;

  private constructor(val: bigint | number) {
    super();
    const normalizedValue = typeof val === "number" ? BigInt(Math.trunc(val)) : val;
    if (normalizedValue < 0n) {
      throw new Error("UintValue cannot be negative");
    }
    this.val = normalizedValue;
  }

  static of(val: bigint | number): UintValue {
    const normalizedValue = typeof val === "number" ? BigInt(Math.trunc(val)) : val;
    if (normalizedValue === 0n) return UintValue.Zero;
    if (normalizedValue === 1n) return UintValue.One;
    return new UintValue(normalizedValue);
  }

  type(): RuntimeType {
    return UintType;
  }

  toString(): string {
    return `${this.val}u`;
  }

  equal(other: Value): Value {
    if (isUintValue(other)) {
      return BoolValue.of(this.val === other.value());
    }
    if (isIntValue(other)) {
      const otherVal = other.value();
      return BoolValue.of(otherVal >= 0n && this.val === otherVal);
    }
    if (isDoubleValue(other)) {
      return BoolValue.of(Number(this.val) === other.value());
    }
    return BoolValue.False;
  }

  value(): bigint {
    return this.val;
  }

  add(other: UintValue): UintValue | ErrorValue {
    const result = this.val + other.val;
    if (result > IntLimits.Uint64Max) {
      return ErrorValue.of("uint overflow");
    }
    return UintValue.of(result);
  }

  subtract(other: UintValue): UintValue | ErrorValue {
    if (this.val < other.val) {
      return ErrorValue.of("uint overflow on subtraction");
    }
    return UintValue.of(this.val - other.val);
  }

  multiply(other: UintValue): UintValue | ErrorValue {
    const result = this.val * other.val;
    if (result > IntLimits.Uint64Max) {
      return ErrorValue.of("uint overflow");
    }
    return UintValue.of(result);
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
export class EnumValue extends BaseValue {
  readonly kind: ValueKind = "enum";

  private readonly enumType: CheckerType;
  private readonly val: bigint;

  private constructor(typeName: string, val: bigint | number) {
    super();
    this.enumType = new OpaqueType(typeName);
    this.val = typeof val === "number" ? BigInt(Math.trunc(val)) : val;
  }

  static of(typeName: string, val: bigint | number): EnumValue {
    return new EnumValue(typeName, val);
  }

  type(): RuntimeType {
    return this.enumType;
  }

  typeName(): string {
    return this.enumType.runtimeTypeName;
  }

  toString(): string {
    return this.val.toString();
  }

  equal(other: Value): Value {
    if (isEnumValue(other)) {
      return BoolValue.of(
        this.enumType.runtimeTypeName === other.enumType.runtimeTypeName && this.val === other.val
      );
    }
    if (isIntValue(other)) {
      return BoolValue.of(this.val === other.value());
    }
    if (isUintValue(other)) {
      return BoolValue.of(this.val >= 0n && this.val === other.value());
    }
    if (isDoubleValue(other)) {
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
export class DoubleValue extends BaseValue {
  static readonly Zero = new DoubleValue(0);
  static readonly One = new DoubleValue(1);
  static readonly NaN = new DoubleValue(Number.NaN);
  static readonly PositiveInfinity = new DoubleValue(Number.POSITIVE_INFINITY);
  static readonly NegativeInfinity = new DoubleValue(Number.NEGATIVE_INFINITY);
  readonly kind: ValueKind = "double";

  private readonly val: number;

  private constructor(val: number) {
    super();
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

  type(): RuntimeType {
    return DoubleType;
  }

  toString(): string {
    if (Number.isInteger(this.val) && Number.isFinite(this.val)) {
      return this.val.toFixed(1);
    }
    return String(this.val);
  }

  equal(other: Value): Value {
    if (isDoubleValue(other)) {
      return BoolValue.of(this.val === other.value());
    }
    if (isIntValue(other)) {
      return BoolValue.of(this.val === Number(other.value()));
    }
    if (isUintValue(other)) {
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
export class StringValue extends BaseValue {
  static readonly Empty = new StringValue("");
  readonly kind: ValueKind = "string";

  private constructor(private readonly val: string) {
    super();
  }

  static of(val: string): StringValue {
    if (val === "") return StringValue.Empty;
    return new StringValue(val);
  }

  type(): RuntimeType {
    return StringType;
  }

  toString(): string {
    return JSON.stringify(this.val);
  }

  equal(other: Value): Value {
    if (isStringValue(other)) {
      return BoolValue.of(this.val === other.value());
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
      return ErrorValue.of(`invalid regex: ${pattern.val}`);
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
export class BytesValue extends BaseValue {
  static readonly Empty = new BytesValue(new Uint8Array(0));
  readonly kind: ValueKind = "bytes";

  private constructor(private readonly val: Uint8Array) {
    super();
  }

  static of(val: Uint8Array | number[]): BytesValue {
    const arr = val instanceof Uint8Array ? val : new Uint8Array(val);
    if (arr.length === 0) return BytesValue.Empty;
    return new BytesValue(arr);
  }

  static fromString(val: string): BytesValue {
    const encoder = new TextEncoder();
    return BytesValue.of(encoder.encode(val));
  }

  type(): RuntimeType {
    return BytesType;
  }

  toString(): string {
    return `b"${Array.from(this.val)
      .map((b) => String.fromCharCode(b))
      .join("")}"`;
  }

  equal(other: Value): Value {
    if (isBytesValue(other)) {
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
export class NullValue extends BaseValue {
  static readonly Instance = new NullValue();
  readonly kind: ValueKind = "null";

  private constructor() {
    super();
  }

  type(): RuntimeType {
    return NullType;
  }

  toString(): string {
    return "null";
  }

  equal(other: Value): Value {
    return BoolValue.of(other.kind === "null");
  }

  value(): null {
    return null;
  }
}

/**
 * List value
 */
export class ListValue extends BaseValue {
  static readonly Empty = new ListValue([]);
  readonly kind: ValueKind = "list";

  private readonly elements: readonly Value[];

  private constructor(elements: Value[]) {
    super();
    this.elements = [...elements];
  }

  static of(elements: Value[]): ListValue {
    if (elements.length === 0) return ListValue.Empty;
    return new ListValue(elements);
  }

  type(): RuntimeType {
    return GenericListType;
  }

  toString(): string {
    return `[${this.elements.map((e) => e.toString()).join(", ")}]`;
  }

  equal(other: Value): Value {
    if (isListValue(other)) {
      if (this.elements.length !== other.elements.length) {
        return BoolValue.False;
      }
      for (let i = 0; i < this.elements.length; i++) {
        const eq = this.elements[i]!.equal(other.elements[i]!);
        if (isBoolValue(eq) && !eq.value()) {
          return BoolValue.False;
        }
        if (isErrorValue(eq)) {
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
      if (isBoolValue(eq) && eq.value()) {
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
export class MapValue extends BaseValue {
  static readonly Empty = new MapValue([]);
  readonly kind: ValueKind = "map";

  private readonly entries: readonly MapEntry[];
  private readonly keyIndex: Map<string, number>;

  private constructor(entries: MapEntry[]) {
    super();
    this.entries = [...entries];
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
    if (isIntValue(key)) {
      return `num:${key.value().toString()}`;
    }
    if (isUintValue(key)) {
      return `num:${key.value().toString()}`;
    }
    if (isDoubleValue(key)) {
      const value = key.value();
      if (Number.isFinite(value) && Number.isInteger(value)) {
        return `num:${value}`;
      }
      return `double:${value}`;
    }
    // Create a unique string representation for the key
    return `${key.type()}:${key.value()}`;
  }

  type(): RuntimeType {
    return GenericMapType;
  }

  toString(): string {
    const pairs = this.entries.map((e) => `${e.key.toString()}: ${e.value.toString()}`);
    return `{${pairs.join(", ")}}`;
  }

  equal(other: Value): Value {
    if (isMapValue(other)) {
      if (this.entries.length !== other.entries.length) {
        return BoolValue.False;
      }
      for (const entry of this.entries) {
        const otherVal = other.get(entry.key);
        if (isErrorValue(otherVal)) {
          return BoolValue.False;
        }
        const eq = entry.value.equal(otherVal);
        if (isBoolValue(eq) && !eq.value()) {
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
export class StructValue extends BaseValue {
  readonly kind: ValueKind = "struct";

  private readonly values: Map<string, Value>;
  private readonly presentFields: Set<string>;
  private readonly fieldTypes: Map<string, CheckerType>;
  private readonly typeProvider: TypeProvider | undefined;

  private constructor(
    private readonly typeName: string,
    values: Map<string, Value>,
    presentFields: Set<string>,
    fieldTypes: Map<string, CheckerType> = new Map(),
    typeProvider?: TypeProvider
  ) {
    super();
    this.values = new Map(values);
    this.presentFields = new Set(presentFields);
    this.fieldTypes = new Map(fieldTypes);
    this.typeProvider = typeProvider;
  }

  static of(
    typeName: string,
    values: Map<string, Value>,
    presentFields: Set<string>,
    fieldTypes: Map<string, CheckerType> = new Map(),
    typeProvider?: TypeProvider
  ): StructValue {
    return new StructValue(typeName, values, presentFields, fieldTypes, typeProvider);
  }

  type(): RuntimeType {
    return new CheckerStructType(this.typeName);
  }

  toString(): string {
    const entries = [...this.values.entries()].map(([key, value]) => `${key}: ${value.toString()}`);
    return `${this.typeName}{${entries.join(", ")}}`;
  }

  equal(other: Value): Value {
    if (!isStructValue(other)) {
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
      if (left.kind === "error") {
        return left;
      }
      const right = other.getField(name);
      if (right.kind === "error") {
        return right;
      }
      const eq = left.equal(right);
      if (isBoolValue(eq) && !eq.value()) {
        return BoolValue.False;
      }
      if (isErrorValue(eq)) {
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

  hasFieldDefinition(name: string): boolean {
    return this.fieldTypes.has(name);
  }

  hasFieldDefinitions(): boolean {
    return this.fieldTypes.size > 0;
  }

  getField(name: string): Value {
    const value = this.values.get(name);
    if (value !== undefined) {
      return value;
    }
    const fieldType = this.fieldTypes.get(name);
    if (fieldType === undefined) {
      return ErrorValue.noSuchField(name);
    }
    if (this.typeProvider) {
      const rawDefault = this.typeProvider.findStructFieldDefaultValue(this.typeName, name);
      if (rawDefault !== undefined) {
        const value = protoDefaultToValue(fieldType, rawDefault, this.typeProvider);
        if (value !== undefined) {
          return value;
        }
      }
    }
    if (
      fieldType.kind === "struct" &&
      wrapperTypeNameToKind(fieldType.runtimeTypeName) !== undefined
    ) {
      return NullValue.Instance;
    }
    if (fieldType.kind === "struct" && this.typeProvider) {
      const nestedFields = new Map<string, CheckerType>();
      const nestedNames = this.typeProvider.structFieldNames(fieldType.runtimeTypeName);
      for (const fieldName of nestedNames) {
        const nestedType = this.typeProvider.findStructFieldType(
          fieldType.runtimeTypeName,
          fieldName
        );
        if (nestedType !== undefined) {
          nestedFields.set(fieldName, nestedType);
        }
      }
      return StructValue.of(
        fieldType.runtimeTypeName,
        new Map(),
        new Set(),
        nestedFields,
        this.typeProvider
      );
    }
    if (fieldType.kind === "opaque" && this.typeProvider) {
      const enumType = this.typeProvider.findEnumType(fieldType.runtimeTypeName);
      if (enumType !== undefined) {
        return EnumValue.of(enumType.runtimeTypeName, 0n);
      }
    }
    return defaultValueForType(fieldType);
  }
}

/**
 * Type value - represents a type itself as a value
 */
export class TypeValue extends BaseValue {
  static readonly BoolType = new TypeValue(BoolType);
  static readonly IntType = new TypeValue(IntType);
  static readonly UintType = new TypeValue(UintType);
  static readonly DoubleType = new TypeValue(DoubleType);
  static readonly StringType = new TypeValue(StringType);
  static readonly BytesType = new TypeValue(BytesType);
  static readonly NullType = new TypeValue(NullType);
  static readonly ListType = new TypeValue(GenericListType);
  static readonly MapType = new TypeValue(GenericMapType);
  static readonly TypeType = new TypeValue(DynTypeType);
  static readonly DurationType = new TypeValue(DurationType);
  static readonly TimestampType = new TypeValue(TimestampType);
  readonly kind: ValueKind = "type";

  private constructor(private readonly typeName: RuntimeType) {
    super();
  }

  static of(typeName: RuntimeType): TypeValue {
    return new TypeValue(typeName);
  }

  type(): RuntimeType {
    return DynTypeType;
  }

  toString(): string {
    return `type(${this.typeName.toString()})`;
  }

  equal(other: Value): Value {
    if (isTypeValue(other)) {
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

/**
 * Convert a ValueType to a TypeValue.
 */
export function toTypeValue(type: RuntimeType): TypeValue {
  if (type === BoolType) return TypeValue.BoolType;
  if (type === IntType) return TypeValue.IntType;
  if (type === UintType) return TypeValue.UintType;
  if (type === DoubleType) return TypeValue.DoubleType;
  if (type === StringType) return TypeValue.StringType;
  if (type === BytesType) return TypeValue.BytesType;
  if (type === NullType) return TypeValue.NullType;
  if (type === GenericListType) return TypeValue.ListType;
  if (type === GenericMapType) return TypeValue.MapType;
  if (type === DynTypeType) return TypeValue.TypeType;
  if (type === DurationType) return TypeValue.DurationType;
  if (type === TimestampType) return TypeValue.TimestampType;
  if (type === RuntimeOptionalType) {
    return TypeValue.of(new CheckerOptionalType(DynType));
  }
  return TypeValue.of(type);
}

// ------------------------------
// Type Guards / Type Checks
// ------------------------------

/**
 * Check if a value is a BoolValue.
 */
export function isBoolValue(value: Value): value is BoolValue {
  return value.kind === "bool";
}

/**
 * Check if a value is an IntValue.
 */
export function isIntValue(value: Value): value is IntValue {
  return value.kind === "int";
}

/**
 * Check if a value is a UintValue.
 */
export function isUintValue(value: Value): value is UintValue {
  return value.kind === "uint";
}

/**
 * Check if a value is an EnumValue.
 */
export function isEnumValue(value: Value): value is EnumValue {
  return value.kind === "enum";
}

/**
 * Check if a value is a DoubleValue.
 */
export function isDoubleValue(value: Value): value is DoubleValue {
  return value.kind === "double";
}

/**
 * Check if a value is a StringValue.
 */
export function isStringValue(value: Value): value is StringValue {
  return value.kind === "string";
}

/**
 * Check if a value is a BytesValue.
 */
export function isBytesValue(value: Value): value is BytesValue {
  return value.kind === "bytes";
}

/**
 * Check if a value is a NullValue.
 */
export function isNullValue(value: Value): value is NullValue {
  return value.kind === "null";
}

/**
 * Check if a value is a ListValue.
 */
export function isListValue(value: Value): value is ListValue {
  return value.kind === "list";
}

/**
 * Check if a value is a MapValue.
 */
export function isMapValue(value: Value): value is MapValue {
  return value.kind === "map";
}

/**
 * Check if a value is a StructValue.
 */
export function isStructValue(value: Value): value is StructValue {
  return value.kind === "struct";
}

/**
 * Check if a value is a TypeValue.
 */
export function isTypeValue(value: Value): value is TypeValue {
  return value.kind === "type";
}

/**
 * Check if a value is a DurationValue.
 */
export function isDurationValue(value: Value): value is DurationValue {
  return value.kind === "duration";
}

/**
 * Check if a value is a TimestampValue.
 */
export function isTimestampValue(value: Value): value is TimestampValue {
  return value.kind === "timestamp";
}

/**
 * Check if a value is an ErrorValue.
 */
export function isErrorValue(value: Value): value is ErrorValue {
  return value.kind === "error";
}

/**
 * Check if a value is an UnknownValue.
 */
export function isUnknownValue(value: Value): value is UnknownValue {
  return value.kind === "unknown";
}

/**
 * Check if a value is an OptionalValue.
 */
export function isOptionalValue(value: Value): value is OptionalValue {
  return value.kind === "optional";
}

/**
 * Check if an unknown value is a Value object.
 * Useful for distinguishing Value objects from other values like numbers or strings.
 */
export function isValue(value: unknown): value is Value {
  return (
    value !== null &&
    typeof value === "object" &&
    "type" in value &&
    typeof (value as Value).type === "function"
  );
}

/**
 * Check if a value is comparable.
 */
export function isComparableValue(value: Value): boolean {
  switch (value.kind) {
    case "int":
    case "uint":
    case "double":
    case "bool":
    case "duration":
    case "timestamp":
    case "string":
    case "bytes":
      return true;
    default:
      return false;
  }
}

/**
 * Compare two values.
 */
export function compareValues(lhs: Value, rhs: Value): number | ErrorValue {
  if (isIntValue(lhs) && isIntValue(rhs)) {
    return lhs.compare(rhs);
  }
  if (isUintValue(lhs) && isUintValue(rhs)) {
    return lhs.compare(rhs);
  }
  if (isDoubleValue(lhs) && isDoubleValue(rhs)) {
    const cmp = lhs.compare(rhs);
    if (Number.isNaN(cmp)) {
      return ErrorValue.of("cannot compare NaN");
    }
    return cmp;
  }
  if (isIntValue(lhs) && isUintValue(rhs)) {
    return compareIntUint(lhs, rhs);
  }
  if (isUintValue(lhs) && isIntValue(rhs)) {
    return -compareIntUint(rhs, lhs);
  }
  if (isStringValue(lhs) && isStringValue(rhs)) {
    return lhs.compare(rhs);
  }
  if (isBytesValue(lhs) && isBytesValue(rhs)) {
    const left = lhs.value();
    const right = rhs.value();
    const len = Math.min(left.length, right.length);
    for (let i = 0; i < len; i++) {
      if (left[i]! < right[i]!) return -1;
      if (left[i]! > right[i]!) return 1;
    }
    if (left.length === right.length) return 0;
    return left.length < right.length ? -1 : 1;
  }
  if (isBoolValue(lhs) && isBoolValue(rhs)) {
    const left = lhs.value();
    const right = rhs.value();
    if (left === right) return 0;
    return left ? 1 : -1;
  }
  if (isDurationValue(lhs) && isDurationValue(rhs)) {
    return lhs.compare(rhs);
  }
  if (isTimestampValue(lhs) && isTimestampValue(rhs)) {
    return lhs.compare(rhs);
  }
  if (isNumericKind(lhs.kind) && isNumericKind(rhs.kind)) {
    const left = toNumber(lhs);
    const right = toNumber(rhs);
    if (Number.isNaN(left) || Number.isNaN(right)) {
      return ErrorValue.of("cannot compare NaN");
    }
    return left < right ? -1 : left > right ? 1 : 0;
  }
  return ErrorValue.of(`cannot compare ${lhs.type()} with ${rhs.type()}`);
}

function isNumericKind(kind: ValueKind): boolean {
  return kind === "int" || kind === "uint" || kind === "double";
}

function toNumber(value: Value): number {
  if (isDoubleValue(value)) return value.value();
  if (isIntValue(value) || isUintValue(value)) {
    return Number(value.value());
  }
  return Number.NaN;
}

function compareIntUint(lhs: IntValue, rhs: UintValue): number {
  const left = lhs.value();
  if (left < 0n) {
    return -1;
  }
  const right = rhs.value();
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/**
 * Duration value (nanoseconds)
 */
export class DurationValue extends BaseValue {
  static readonly Zero = new DurationValue(0n);
  readonly kind: ValueKind = "duration";

  private constructor(private readonly nanos: bigint) {
    super();
  }

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

  type(): RuntimeType {
    return DurationType;
  }

  toString(): string {
    const seconds = Number(this.nanos) / 1e9;
    return `${seconds}s`;
  }

  equal(other: Value): Value {
    if (isDurationValue(other)) {
      return BoolValue.of(this.nanos === other.nanos);
    }
    return BoolValue.False;
  }

  value(): bigint {
    return this.nanos;
  }

  add(other: DurationValue): DurationValue | ErrorValue {
    const result = this.nanos + other.nanos;
    if (!isDurationInRange(result)) {
      return ErrorValue.of("duration out of range");
    }
    return DurationValue.of(result);
  }

  subtract(other: DurationValue): DurationValue | ErrorValue {
    const result = this.nanos - other.nanos;
    if (!isDurationInRange(result)) {
      return ErrorValue.of("duration out of range");
    }
    return DurationValue.of(result);
  }

  negate(): DurationValue | ErrorValue {
    const result = -this.nanos;
    if (!isDurationInRange(result)) {
      return ErrorValue.of("duration out of range");
    }
    return DurationValue.of(result);
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
export class TimestampValue extends BaseValue {
  readonly kind: ValueKind = "timestamp";

  private constructor(private readonly nanos: bigint) {
    super();
  }

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

  type(): RuntimeType {
    return TimestampType;
  }

  toString(): string {
    return formatTimestamp(this.nanos);
  }

  equal(other: Value): Value {
    if (isTimestampValue(other)) {
      return BoolValue.of(this.nanos === other.nanos);
    }
    return BoolValue.False;
  }

  value(): bigint {
    return this.nanos;
  }

  add(duration: DurationValue): TimestampValue | ErrorValue {
    const result = this.nanos + duration.value();
    if (!isTimestampInRange(result)) {
      return ErrorValue.of("timestamp out of range");
    }
    return TimestampValue.of(result);
  }

  subtract(other: TimestampValue | DurationValue): TimestampValue | DurationValue | ErrorValue {
    if (isTimestampValue(other)) {
      const diff = this.nanos - other.nanos;
      if (!isDurationInRange(diff)) {
        return ErrorValue.of("duration out of range");
      }
      return DurationValue.of(diff);
    }
    const result = this.nanos - other.value();
    if (!isTimestampInRange(result)) {
      return ErrorValue.of("timestamp out of range");
    }
    return TimestampValue.of(result);
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
    if (tz !== undefined && tz !== "") {
      const offsetMinutes = parseTimeZoneOffset(tz);
      if (offsetMinutes !== undefined) {
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
    if (tz === undefined || tz === "") {
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
    if (offsetMinutes !== undefined) {
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

/**
 * Error value for runtime errors
 */
export class ErrorValue extends BaseValue {
  readonly kind: ValueKind = "error";

  private constructor(
    private readonly message: string,
    readonly exprId?: ExprId
  ) {
    super();
  }

  /**
   * Create an ErrorValue with the given message.
   */
  static of(message: string, exprId?: ExprId): ErrorValue {
    return new ErrorValue(message, exprId);
  }

  static divisionByZero(exprId?: ExprId): ErrorValue {
    return ErrorValue.of("division by zero", exprId);
  }

  static moduloByZero(exprId?: ExprId): ErrorValue {
    return ErrorValue.of("modulo by zero", exprId);
  }

  static indexOutOfBounds(index: number, size: number, exprId?: ExprId): ErrorValue {
    return ErrorValue.of(`index out of bounds: ${index}, size: ${size}`, exprId);
  }

  static noSuchKey(key: Value, exprId?: ExprId): ErrorValue {
    return ErrorValue.of(`no such key: ${key.toString()}`, exprId);
  }

  static noSuchField(field: string, exprId?: ExprId): ErrorValue {
    return ErrorValue.of(`no such field: ${field}`, exprId);
  }

  static typeMismatch(expected: string, actual: Value, exprId?: ExprId): ErrorValue {
    return ErrorValue.of(`type mismatch: expected ${expected}, got ${actual.type()}`, exprId);
  }

  type(): RuntimeType {
    return ErrorType;
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

  withExprId(exprId: ExprId): ErrorValue {
    if (this.exprId !== undefined) {
      return this;
    }
    return ErrorValue.of(this.message, exprId);
  }
}

/**
 * Unknown value for partial evaluation
 */
export class UnknownValue extends BaseValue {
  static readonly Instance = new UnknownValue([]);
  readonly kind: ValueKind = "unknown";

  private readonly attributeIds: readonly number[];

  private constructor(attributeIds: number[]) {
    super();
    this.attributeIds = [...attributeIds];
  }

  static of(attributeIds: number[]): UnknownValue {
    if (attributeIds.length === 0) return UnknownValue.Instance;
    return new UnknownValue(attributeIds);
  }

  type(): RuntimeType {
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
export class OptionalValue extends BaseValue {
  static readonly None = new OptionalValue(undefined);
  readonly kind: ValueKind = "optional";

  private constructor(private readonly inner: Value | undefined) {
    super();
  }

  static of(val: Value): OptionalValue {
    return new OptionalValue(val);
  }

  static none(): OptionalValue {
    return OptionalValue.None;
  }

  type(): RuntimeType {
    return RuntimeOptionalType;
  }

  toString(): string {
    if (this.inner === undefined) {
      return "optional.none()";
    }
    return `optional.of(${this.inner.toString()})`;
  }

  equal(other: Value): Value {
    if (isOptionalValue(other)) {
      if (this.inner === undefined && other.inner === undefined) {
        return BoolValue.True;
      }
      if (this.inner === undefined || other.inner === undefined) {
        return BoolValue.False;
      }
      return this.inner.equal(other.inner);
    }
    return BoolValue.False;
  }

  value(): Value | undefined {
    return this.inner;
  }

  hasValue(): boolean {
    return this.inner !== undefined;
  }

  getOrElse(defaultValue: Value): Value {
    return this.inner ?? defaultValue;
  }
}

/**
 * Union of all CEL runtime values.
 */
export type Value =
  | BoolValue
  | IntValue
  | UintValue
  | EnumValue
  | DoubleValue
  | StringValue
  | BytesValue
  | NullValue
  | ListValue
  | MapValue
  | StructValue
  | TypeValue
  | DurationValue
  | TimestampValue
  | ErrorValue
  | UnknownValue
  | OptionalValue;
