import type { TypeProvider } from "../checker/provider";
import type { Type as CheckerType } from "../checker/types";
export { wrapperTypeNameToKind } from "../checker/types";
export type { WrapperTypeKind } from "../checker/types";
import type { SourceInfo } from "../common/source";
import type { Activation } from "./activation";
import type { MapEntry } from "./values";
import {
  BoolValue,
  BytesValue,
  DoubleValue,
  DurationValue,
  EnumValue,
  ErrorValue,
  IntValue,
  ListValue,
  MapValue,
  NullValue,
  OptionalValue,
  StringValue,
  StructValue,
  TimestampValue,
  TypeValue,
  UintValue,
  type Value,
  resolveAnyValue,
} from "./values";

/**
 * Convert a native JavaScript value to a CEL Value.
 * Supports null, boolean, number, bigint, string, Uint8Array, Date, Array, Map, and objects.
 */
export function nativeToValue(value: unknown): Value {
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
    return ListValue.of(value.map((entry) => nativeToValue(entry)));
  }
  if (value instanceof Map) {
    const entries: MapEntry[] = [];
    for (const [key, entry] of value) {
      entries.push({
        key: nativeToValue(key),
        value: nativeToValue(entry),
      });
    }
    return MapValue.of(entries);
  }
  if (typeof value === "object") {
    const entries: MapEntry[] = Object.entries(value as object).map(([key, entry]) => ({
      key: StringValue.of(key),
      value: nativeToValue(entry),
    }));
    return MapValue.of(entries);
  }
  return ErrorValue.of(`cannot convert value of type ${typeof value}`);
}

/**
 * Convert a google.protobuf.Value struct to a CEL Value.
 * Handles null_value, number_value, string_value, bool_value, struct_value, and list_value.
 */
export function googleValueToValue(values: Map<string, Value>): Value {
  if (values.has("null_value")) {
    return NullValue.Instance;
  }
  const numberValue = unwrapOptional(values.get("number_value"));
  if (numberValue instanceof DoubleValue) {
    return numberValue;
  }
  if (numberValue instanceof IntValue || numberValue instanceof UintValue) {
    return DoubleValue.of(Number(numberValue.value()));
  }
  const stringValue = unwrapOptional(values.get("string_value"));
  if (stringValue instanceof StringValue) {
    return stringValue;
  }
  const boolValue = unwrapOptional(values.get("bool_value"));
  if (boolValue instanceof BoolValue) {
    return boolValue;
  }
  const structValue = unwrapOptional(values.get("struct_value"));
  if (structValue instanceof MapValue) {
    return structValue;
  }
  if (structValue instanceof StructValue) {
    return structValueToMapValue(structValue);
  }
  const listValue = unwrapOptional(values.get("list_value"));
  if (listValue instanceof ListValue) {
    return listValue;
  }
  return NullValue.Instance;
}

/**
 * Convert a google.protobuf.Struct to a CEL Value (MapValue).
 * Extracts the "fields" property and converts it to a map.
 */
export function googleStructToValue(values: Map<string, Value>): Value {
  const fieldsValue = unwrapOptional(values.get("fields"));
  if (fieldsValue === undefined || fieldsValue instanceof NullValue) {
    return MapValue.of([]);
  }
  if (fieldsValue instanceof MapValue) {
    return fieldsValue;
  }
  if (fieldsValue instanceof StructValue) {
    return structValueToMapValue(fieldsValue);
  }
  return ErrorValue.typeMismatch("map", fieldsValue);
}

/**
 * Convert a google.protobuf.ListValue to a CEL ListValue.
 * Extracts the "values" property from the struct.
 */
export function googleListToValue(values: Map<string, Value>): Value {
  const valuesValue = unwrapOptional(values.get("values"));
  if (valuesValue === undefined || valuesValue instanceof NullValue) {
    return ListValue.of([]);
  }
  if (valuesValue instanceof ListValue) {
    return valuesValue;
  }
  return ErrorValue.typeMismatch("list", valuesValue);
}

/**
 * Convert a google.protobuf.Any to a CEL Value.
 * Extracts type_url and value fields, then resolves the Any type.
 * Returns undefined if the conversion fails.
 */
export function googleAnyToValue(values: Map<string, Value>): Value | undefined {
  const typeUrl = unwrapOptional(values.get("type_url"));
  const bytesValue = unwrapOptional(values.get("value"));
  if (!(typeUrl instanceof StringValue) || !(bytesValue instanceof BytesValue)) {
    return undefined;
  }
  return resolveAnyValue(typeUrl.value(), bytesValue.value());
}

/**
 * Convert a CEL StructValue to a MapValue with string keys.
 */
export function structValueToMapValue(structValue: StructValue): MapValue {
  const entries: MapEntry[] = [];
  for (const [key, value] of Object.entries(structValue.value())) {
    entries.push({ key: StringValue.of(key), value });
  }
  return MapValue.of(entries);
}

/**
 * Convert a Value to a MapValue suitable for google.protobuf.Struct.
 * Validates that all map keys are strings. Returns an error if validation fails.
 */
export function googleStructToMapValue(value: Value): MapValue | ErrorValue {
  if (value instanceof MapValue) {
    if (!mapKeysAreStrings(value)) {
      return ErrorValue.of("bad key type");
    }
    return value;
  }
  if (value instanceof StructValue) {
    return structValueToMapValue(value);
  }
  return ErrorValue.typeMismatch("map", value);
}

/**
 * Format a runtime error with source location information.
 */
export function formatRuntimeError(error: ErrorValue, sourceInfo: SourceInfo): string {
  const exprId = error.exprId;
  if (exprId === undefined) {
    return error.getMessage();
  }
  const position = sourceInfo.getPosition(exprId);
  if (position === undefined) {
    return error.getMessage();
  }
  const { line, column } = sourceInfo.getLocation(position.start);
  return `${line}:${column}: ${error.getMessage()}`;
}

/**
 * Format a timestamp (in nanoseconds since Unix epoch) as an RFC 3339 string.
 * Example output: "2023-01-15T10:30:00.123456789Z"
 */
export function formatTimestamp(nanos: bigint): string {
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

/**
 * Parse a timezone offset string and return the offset in minutes.
 * Accepts "UTC", "Z", or "+HH:MM"/"-HH:MM" format.
 * Returns undefined if the format is invalid.
 */
export function parseTimeZoneOffset(tz: string): number | undefined {
  const normalized = tz.trim();
  if (normalized === "UTC" || normalized === "Z") {
    return 0;
  }
  const match = /^([+-]?)(\d{2}):(\d{2})$/.exec(normalized);
  if (match === null) {
    return undefined;
  }
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  return sign * (hours * 60 + minutes);
}


/**
 * Convert a weekday name to a number (0=Sunday, 6=Saturday).
 * Only the first 3 characters are checked (e.g., "Sun", "Mon").
 */
export function weekdayToNumber(weekday: string): number {
  const WEEKDAY_MAP: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return WEEKDAY_MAP[weekday.slice(0, 3)] ?? 0;
}

/**
 * Get the default (zero) value for a CEL type.
 * Used for proto3 default field values.
 */
export function defaultValueForType(type: CheckerType): Value {
  if (type.isOptionalType()) {
    return OptionalValue.none();
  }

  switch (type.kind) {
    case "bool":
      return BoolValue.False;
    case "int":
      return IntValue.of(0);
    case "uint":
      return UintValue.of(0);
    case "double":
      return DoubleValue.of(0);
    case "string":
      return StringValue.of("");
    case "bytes":
      return BytesValue.of(new Uint8Array());
    case "duration":
      return DurationValue.Zero;
    case "timestamp":
      return TimestampValue.of(0n);
    case "list":
      return ListValue.of([]);
    case "map":
      return MapValue.of([]);
    case "struct":
      return NullValue.Instance;
    case "null_type":
      return NullValue.Instance;
    case "type":
      return TypeValue.TypeType;
    case "dyn":
    case "error":
    case "type_param":
    case "any":
    case "opaque":
      return NullValue.Instance;
    default:
      return NullValue.Instance;
  }
}

/**
 * Convert a proto default value to a CEL Value based on the expected type.
 * Handles primitive types and enum types.
 * Returns undefined if conversion is not possible.
 */
export function protoDefaultToValue(
  type: CheckerType,
  raw: unknown,
  typeProvider: TypeProvider
): Value | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  switch (type.kind) {
    case "bool":
      return BoolValue.of(Boolean(raw));
    case "int":
      return IntValue.of(defaultToBigInt(raw));
    case "uint":
      return UintValue.of(defaultToBigInt(raw));
    case "double":
      return DoubleValue.of(Number(raw));
    case "string":
      return StringValue.of(String(raw));
    case "bytes":
      if (raw instanceof Uint8Array || Array.isArray(raw)) {
        return BytesValue.of(raw as Uint8Array | number[]);
      }
      if (typeof raw === "string") {
        return BytesValue.fromString(raw);
      }
      return undefined;
    case "opaque": {
      const enumType = typeProvider.findEnumType(type.runtimeTypeName);
      if (enumType === undefined) {
        return undefined;
      }
      if (typeof raw === "number" || typeof raw === "bigint") {
        return EnumValue.of(enumType.runtimeTypeName, BigInt(raw));
      }
      if (typeof raw === "string") {
        const numeric = typeProvider.findEnumValue(enumType.runtimeTypeName, raw);
        if (numeric !== undefined) {
          return EnumValue.of(enumType.runtimeTypeName, BigInt(numeric));
        }
      }
      return undefined;
    }
    default:
      return undefined;
  }
}

/**
 * Unwrap an OptionalValue to its inner value, or return the value as-is.
 */
function unwrapOptional(value: Value | undefined): Value | undefined {
  if (value instanceof OptionalValue) {
    return value.hasValue() ? (value.value() ?? NullValue.Instance) : NullValue.Instance;
  }
  return value;
}

/**
 * Check if all keys in a MapValue are StringValues.
 */
function mapKeysAreStrings(value: MapValue): boolean {
  for (const entry of value.value()) {
    if (!(entry.key instanceof StringValue)) {
      return false;
    }
  }
  return true;
}

/**
 * Pad a number to 2 digits with leading zeros.
 */
function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Pad a number to 4 digits with leading zeros, preserving sign for negative values.
 */
function pad4(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  return `${sign}${String(abs).padStart(4, "0")}`;
}

/**
 * Convert a raw value to bigint for default value handling.
 * Supports bigint, number, string, and objects with toString.
 */
function defaultToBigInt(raw: unknown): bigint {
  if (typeof raw === "bigint") {
    return raw;
  }
  if (typeof raw === "number") {
    return BigInt(Math.trunc(raw));
  }
  if (typeof raw === "string") {
    return BigInt(raw);
  }
  if (raw !== null && typeof raw === "object" && "toString" in raw) {
    return BigInt(String(raw));
  }
  return 0n;
}

/**
 * Check if a value implements the Activation interface.
 */
export function isActivation(value: unknown): value is Activation {
  return (
    typeof value === "object" &&
    value !== null &&
    "resolve" in (value as Record<string, unknown>) &&
    typeof (value as Activation).resolve === "function"
  );
}

