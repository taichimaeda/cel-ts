import type { TypeProvider } from "../checker/provider";
import { type Type as CheckerType, TypeKind as CheckerTypeKind } from "../checker/types";
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
  return ErrorValue.create(`cannot convert value of type ${typeof value}`);
}

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

export function googleAnyToValue(values: Map<string, Value>): Value | undefined {
  const typeUrl = unwrapOptional(values.get("type_url"));
  const bytesValue = unwrapOptional(values.get("value"));
  if (!(typeUrl instanceof StringValue) || !(bytesValue instanceof BytesValue)) {
    return undefined;
  }
  return resolveAnyValue(typeUrl.value(), bytesValue.value());
}

export function structValueToMapValue(structValue: StructValue): MapValue {
  const entries: MapEntry[] = [];
  for (const [key, value] of Object.entries(structValue.value())) {
    entries.push({ key: StringValue.of(key), value });
  }
  return MapValue.of(entries);
}

export function googleStructToMapValue(value: Value): MapValue | ErrorValue {
  if (value instanceof MapValue) {
    if (!mapKeysAreStrings(value)) {
      return ErrorValue.create("bad key type");
    }
    return value;
  }
  if (value instanceof StructValue) {
    return structValueToMapValue(value);
  }
  return ErrorValue.typeMismatch("map", value);
}

export function getWrapperTypeKind(
  typeName: string
): "bool" | "bytes" | "double" | "float" | "int" | "uint" | "string" | undefined {
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
      return undefined;
  }
}

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

export function weekdayToNumber(weekday: string): number {
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

export function defaultValueForType(type: CheckerType): Value {
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

export function protoDefaultToValue(
  type: CheckerType,
  raw: unknown,
  typeProvider: TypeProvider
): Value | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  switch (type.kind) {
    case CheckerTypeKind.Bool:
      return BoolValue.of(Boolean(raw));
    case CheckerTypeKind.Int:
      return IntValue.of(defaultToBigInt(raw));
    case CheckerTypeKind.Uint:
      return UintValue.of(defaultToBigInt(raw));
    case CheckerTypeKind.Double:
      return DoubleValue.of(Number(raw));
    case CheckerTypeKind.String:
      return StringValue.of(String(raw));
    case CheckerTypeKind.Bytes:
      if (raw instanceof Uint8Array || Array.isArray(raw)) {
        return BytesValue.of(raw as Uint8Array | number[]);
      }
      if (typeof raw === "string") {
        return BytesValue.fromString(raw);
      }
      return undefined;
    case CheckerTypeKind.Opaque: {
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

function unwrapOptional(value: Value | undefined): Value | undefined {
  if (value instanceof OptionalValue) {
    return value.hasValue() ? (value.value() ?? NullValue.Instance) : NullValue.Instance;
  }
  return value;
}

function mapKeysAreStrings(value: MapValue): boolean {
  for (const entry of value.value()) {
    if (!(entry.key instanceof StringValue)) {
      return false;
    }
  }
  return true;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function pad4(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  return `${sign}${String(abs).padStart(4, "0")}`;
}

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
