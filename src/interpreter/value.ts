// CEL Runtime Values
// TypeScript-native implementation of CEL runtime value types

import {
  BoolType as CheckerBoolType,
  BytesType as CheckerBytesType,
  DoubleType as CheckerDoubleType,
  DurationType as CheckerDurationType,
  ErrorType as CheckerErrorType,
  IntType as CheckerIntType,
  NullType as CheckerNullType,
  StringType as CheckerStringType,
  TimestampType as CheckerTimestampType,
  TypeType as CheckerTypeType,
  UintType as CheckerUintType,
} from "../checker/type";
import type { ExprId } from "../common/ast";
import { GenericListType, GenericMapType, OptionalType, UnknownType, type ValueType } from "./type";

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

/**
 * Boolean value
 */
export class BoolValue implements Value {
  static readonly True = new BoolValue(true);
  static readonly False = new BoolValue(false);

  private constructor(private readonly val: boolean) { }

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

  constructor(private readonly val: string) { }

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

  constructor(private readonly val: Uint8Array) { }

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

  private constructor() { }

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

  constructor(private readonly typeName: ValueType) { }

  type(): ValueType {
    return CheckerTypeType;
  }

  toString(): string {
    return `type(${this.typeName.toString()})`;
  }

  equal(other: Value): Value {
    if (other instanceof TypeValue) {
      return BoolValue.of(this.typeName.toString() === other.typeName.toString());
    }
    return BoolValue.False;
  }

  value(): string {
    return this.typeName.toString();
  }
}

export type { ValueType } from "./type";

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

  constructor(private readonly nanos: bigint) { }

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
    return IntValue.of((this.nanos / 60_000_000_000n) % 60n);
  }

  getSeconds(): IntValue {
    return IntValue.of((this.nanos / 1_000_000_000n) % 60n);
  }

  getMilliseconds(): IntValue {
    return IntValue.of((this.nanos / 1_000_000n) % 1000n);
  }
}

/**
 * Timestamp value (Unix timestamp in nanoseconds)
 */
export class TimestampValue implements Value {
  constructor(private readonly nanos: bigint) { }

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
    const date = new Date(Number(this.nanos / 1_000_000n));
    return date.toISOString();
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
    const date = this.toDateWithTz(tz);
    return IntValue.of(date.getUTCFullYear());
  }

  getMonth(tz?: string): IntValue {
    const date = this.toDateWithTz(tz);
    return IntValue.of(date.getUTCMonth()); // 0-indexed
  }

  getDayOfMonth(tz?: string): IntValue {
    const date = this.toDateWithTz(tz);
    return IntValue.of(date.getUTCDate());
  }

  getDayOfWeek(tz?: string): IntValue {
    const date = this.toDateWithTz(tz);
    return IntValue.of(date.getUTCDay());
  }

  getDayOfYear(tz?: string): IntValue {
    const date = this.toDateWithTz(tz);
    const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 0));
    const diff = date.getTime() - start.getTime();
    const oneDay = 1000 * 60 * 60 * 24;
    return IntValue.of(Math.floor(diff / oneDay));
  }

  getHours(tz?: string): IntValue {
    const date = this.toDateWithTz(tz);
    return IntValue.of(date.getUTCHours());
  }

  getMinutes(tz?: string): IntValue {
    const date = this.toDateWithTz(tz);
    return IntValue.of(date.getUTCMinutes());
  }

  getSeconds(tz?: string): IntValue {
    const date = this.toDateWithTz(tz);
    return IntValue.of(date.getUTCSeconds());
  }

  getMilliseconds(tz?: string): IntValue {
    const date = this.toDateWithTz(tz);
    return IntValue.of(date.getUTCMilliseconds());
  }

  private toDateWithTz(_tz?: string): Date {
    // Note: Full timezone support would require additional library
    // For now, we use UTC
    return this.toDate();
  }
}

/**
 * Error value for runtime errors
 */
export class ErrorValue implements Value {
  constructor(private readonly message: string, private readonly exprId?: ExprId) { }

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

  private constructor(private readonly inner: Value | null) { }

  static of(val: Value): OptionalValue {
    return new OptionalValue(val);
  }

  static none(): OptionalValue {
    return OptionalValue.None;
  }

  type(): ValueType {
    return OptionalType;
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
