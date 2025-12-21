import * as protobuf from "protobufjs";
import {
  BoolType,
  BytesType,
  DoubleType,
  DurationType,
  DynType,
  ErrorType,
  IntType,
  ListType,
  MapType,
  NullType,
  OpaqueType,
  StringType,
  StructType,
  TimestampType,
  type Type,
  TypeParamType,
  TypeTypeWithParam,
  UintType,
} from "../../src/checker/types";
import {
  BoolValue,
  BytesValue,
  DoubleValue,
  DurationValue,
  EnumValue,
  IntValue,
  ListValue,
  type MapEntry,
  MapValue,
  NullValue,
  StringValue,
  StructValue,
  TimestampValue,
  TypeValue,
  UintValue,
  type Value,
} from "../../src/interpreter/values";
import { stripTypeUrl } from "./proto";
import { type ProtoObject, runtime } from "./runtime";

export function protoToValue(value: ProtoObject): Value | null {
  const kind = value["kind"] as string | undefined;
  if (!kind) {
    return null;
  }

  switch (kind) {
    case "null_value":
      return NullValue.Instance;
    case "bool_value":
      return BoolValue.of(Boolean(value["bool_value"]));
    case "int64_value":
      return IntValue.of(unknownToBigInt(value["int64_value"]));
    case "uint64_value":
      return UintValue.of(unknownToBigInt(value["uint64_value"]));
    case "double_value":
      return DoubleValue.of(Number(value["double_value"]));
    case "string_value":
      return StringValue.of(String(value["string_value"] ?? ""));
    case "bytes_value": {
      const bytes = value["bytes_value"] as Uint8Array | number[] | undefined;
      return BytesValue.of(bytes ? new Uint8Array(bytes) : new Uint8Array());
    }
    case "list_value": {
      const list = value["list_value"] as ProtoObject | undefined;
      const values = (list?.["values"] ?? []) as ProtoObject[];
      return ListValue.of(values.map((entry) => protoToValue(entry) ?? NullValue.Instance));
    }
    case "map_value": {
      const map = value["map_value"] as ProtoObject | undefined;
      const entries = (map?.["entries"] ?? []) as ProtoObject[];
      const mapEntries: MapEntry[] = entries.map((entry) => ({
        key: protoToValue(entry["key"] as ProtoObject) ?? NullValue.Instance,
        value: protoToValue(entry["value"] as ProtoObject) ?? NullValue.Instance,
      }));
      return MapValue.of(mapEntries);
    }
    case "object_value": {
      const objectValue = value["object_value"] as ProtoObject | undefined;
      if (!objectValue) {
        return null;
      }
      return protoToObjectValue(objectValue);
    }
    case "enum_value": {
      const enumValue = value["enum_value"] as ProtoObject | undefined;
      const typeName = enumValue?.["type"];
      const numeric = enumValue?.["value"];
      if (typeof typeName !== "string") {
        return null;
      }
      const numberValue = unknownToBigInt(numeric);
      return new EnumValue(normalizeTypeName(typeName), numberValue);
    }
    case "type_value":
      return typeNameToTypeValue(String(value["type_value"] ?? ""));
    default:
      return null;
  }
}

export function protoToObjectValue(anyValue: ProtoObject): Value | null {
  const typeUrl = anyValue["type_url"] ?? anyValue["typeUrl"];
  const bytes = anyValue["value"] as Uint8Array | number[] | undefined;
  if (!typeUrl || !bytes) {
    if (!typeUrl) {
      return null;
    }
  }
  const typeName = stripTypeUrl(String(typeUrl));
  let messageType: protobuf.Type;
  try {
    messageType = runtime.root.lookupType(typeName);
  } catch {
    return null;
  }
  if (!bytes) {
    return messageToValue(messageType, {});
  }
  const byteArray = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const decoded = messageType.decode(byteArray);
  const object = messageType.toObject(decoded, runtime.options) as ProtoObject;
  return messageToValue(messageType, object);
}

export function normalizeTypeName(typeName: string): string {
  return typeName.startsWith(".") ? typeName.slice(1) : typeName;
}

export function normalizeProtoFieldName(name: string): string {
  if (name.includes("_")) {
    return name;
  }
  return name.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
}

export function objectToGoogleValue(object: ProtoObject): Value {
  const kind = object["kind"];
  const nullValue = protoFieldToValue(object, "null_value", "nullValue");
  if (kind === "null_value" || nullValue !== undefined) {
    return NullValue.Instance;
  }
  const numberValue = protoFieldToValue(object, "number_value", "numberValue");
  if (kind === "number_value" || numberValue !== undefined) {
    return DoubleValue.of(Number(numberValue ?? 0));
  }
  const stringValue = protoFieldToValue(object, "string_value", "stringValue");
  if (kind === "string_value" || stringValue !== undefined) {
    return StringValue.of(String(stringValue ?? ""));
  }
  const boolValue = protoFieldToValue(object, "bool_value", "boolValue");
  if (kind === "bool_value" || boolValue !== undefined) {
    return BoolValue.of(Boolean(boolValue));
  }
  const structValue = protoFieldToValue(object, "struct_value", "structValue");
  if (kind === "struct_value" || structValue !== undefined) {
    const structObj = structValue as ProtoObject | undefined;
    return objectToGoogleStruct(structObj ?? {});
  }
  const listValue = protoFieldToValue(object, "list_value", "listValue");
  if (kind === "list_value" || listValue !== undefined) {
    const listObj = listValue as ProtoObject | undefined;
    return objectToGoogleList(listObj ?? {});
  }
  return NullValue.Instance;
}

export function objectToGoogleStruct(object: ProtoObject): Value {
  const fieldsRaw = protoFieldToValue(object, "fields");
  if (!fieldsRaw || typeof fieldsRaw !== "object") {
    return MapValue.of([]);
  }
  const entries: MapEntry[] = [];
  if (Array.isArray(fieldsRaw)) {
    for (const entry of fieldsRaw) {
      if (!entry || typeof entry !== "object") continue;
      const key = entry["key"];
      const value = entry["value"];
      if (typeof key !== "string" || !value || typeof value !== "object") {
        continue;
      }
      entries.push({
        key: StringValue.of(key),
        value: objectToGoogleValue(value as ProtoObject),
      });
    }
    return MapValue.of(entries);
  }
  for (const [key, value] of Object.entries(fieldsRaw)) {
    if (!value || typeof value !== "object") {
      continue;
    }
    entries.push({
      key: StringValue.of(key),
      value: objectToGoogleValue(value as ProtoObject),
    });
  }
  return MapValue.of(entries);
}

export function objectToGoogleList(object: ProtoObject): Value {
  const values = (protoFieldToValue(object, "values") ?? []) as ProtoObject[];
  const entries = values.map((entry) => objectToGoogleValue(entry));
  return ListValue.of(entries);
}

export function objectToGoogleAny(object: ProtoObject): Value | null {
  const typeUrl = protoFieldToValue(object, "type_url", "typeUrl");
  const bytes = protoFieldToValue(object, "value") as Uint8Array | number[] | undefined;
  if (!typeUrl || !bytes) {
    return null;
  }
  const byteArray = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return anyToValue(String(typeUrl), byteArray);
}

export function anyToValue(typeUrl: string, bytes: Uint8Array): Value | null {
  const typeName = stripTypeUrl(typeUrl);
  let messageType: protobuf.Type;
  try {
    messageType = runtime.root.lookupType(typeName);
  } catch {
    return null;
  }
  const decoded = messageType.decode(bytes);
  const object = messageType.toObject(decoded, runtime.options) as ProtoObject;
  return messageToValue(messageType, object);
}

export function protoFieldToValue(object: ProtoObject, ...names: string[]): unknown {
  for (const name of names) {
    if (object[name] !== undefined) {
      return object[name];
    }
  }
  return undefined;
}

export function roundFloat32(value: number): number {
  const buffer = new Float32Array(1);
  buffer[0] = value;
  return buffer[0]!;
}

export function messageToValue(messageType: protobuf.Type, object: ProtoObject): Value {
  if (messageType.fullName === ".google.protobuf.Timestamp") {
    return protoToTimestamp(object);
  }
  if (messageType.fullName === ".google.protobuf.Duration") {
    return protoToDuration(object);
  }
  if (messageType.fullName === ".google.protobuf.Value") {
    return objectToGoogleValue(object);
  }
  if (messageType.fullName === ".google.protobuf.Struct") {
    return objectToGoogleStruct(object);
  }
  if (messageType.fullName === ".google.protobuf.ListValue") {
    return objectToGoogleList(object);
  }
  if (messageType.fullName === ".google.protobuf.Any") {
    const anyValue = objectToGoogleAny(object);
    if (anyValue) {
      return anyValue;
    }
  }

  const wrapperValue = messageToWrapperValue(messageType, object);
  if (wrapperValue) {
    return wrapperValue;
  }

  const values = new Map<string, Value>();
  const presentFields = new Set<string>();
  const fieldTypes = new Map<string, Type>();
  const typeName = normalizeTypeName(messageType.fullName ?? "");

  for (const field of messageType.fieldsArray) {
    const fieldName = normalizeProtoFieldName(field.name);
    const fieldType = runtime.protobufTypeProvider.findStructFieldType(typeName, fieldName);
    if (fieldType) {
      fieldTypes.set(fieldName, fieldType);
    }
    const raw = object[field.name] ?? object[fieldName];
    if (raw === undefined || raw === null) {
      continue;
    }
    const fieldValue = fieldToValue(field, raw);
    if (fieldValue) {
      values.set(fieldName, fieldValue);
      presentFields.add(fieldName);
    }
  }
  return new StructValue(typeName, values, presentFields, fieldTypes, runtime.protobufTypeProvider);
}

export function messageToWrapperValue(
  messageType: protobuf.Type,
  object: ProtoObject
): Value | null {
  const kind = typeNameToWrapperKind(messageType.fullName ?? "");
  if (!kind) {
    return null;
  }
  const raw = object["value"];
  if (raw === undefined || raw === null) {
    return wrapperKindToDefaultValue(kind);
  }
  switch (kind) {
    case "bool":
      return BoolValue.of(Boolean(raw));
    case "bytes":
      return BytesValue.of(rawToBytes(raw));
    case "double":
      return DoubleValue.of(Number(raw));
    case "float":
      return DoubleValue.of(roundFloat32(Number(raw)));
    case "int":
      return IntValue.of(unknownToBigInt(raw));
    case "uint":
      return UintValue.of(unknownToBigInt(raw));
    case "string":
      return StringValue.of(String(raw ?? ""));
    default:
      return null;
  }
}

export function typeNameToWrapperKind(
  typeName: string
): "bool" | "bytes" | "double" | "float" | "int" | "uint" | "string" | null {
  const normalized = normalizeTypeName(typeName);
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

export function wrapperKindToDefaultValue(
  kind: "bool" | "bytes" | "double" | "float" | "int" | "uint" | "string"
): Value {
  switch (kind) {
    case "bool":
      return BoolValue.False;
    case "bytes":
      return BytesValue.of(new Uint8Array());
    case "double":
      return DoubleValue.of(0);
    case "float":
      return DoubleValue.of(0);
    case "int":
      return IntValue.of(0);
    case "uint":
      return UintValue.of(0);
    case "string":
      return StringValue.of("");
  }
}

export function fieldToValue(field: protobuf.Field, raw: unknown): Value | null {
  if (field.map) {
    return mapFieldToValue(field, raw);
  }
  if (field.repeated) {
    const values = Array.isArray(raw) ? raw : [];
    const entries = values.map((value) => fieldScalarOrMessageToValue(field, value));
    return ListValue.of(entries.map((entry) => entry ?? NullValue.Instance));
  }
  return fieldScalarOrMessageToValue(field, raw);
}

export function mapFieldToValue(field: protobuf.Field, raw: unknown): Value | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const entries: MapEntry[] = [];
  const keyType = (field as protobuf.Field & { keyType?: string }).keyType;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const keyValue = mapKeyToValue(keyType, key);
    const valueValue = fieldScalarOrMessageToValue(field, value);
    if (keyValue && valueValue) {
      entries.push({ key: keyValue, value: valueValue });
    }
  }
  return MapValue.of(entries);
}

export function mapKeyToValue(keyType: string | undefined, key: string): Value | null {
  switch (keyType) {
    case "bool":
      return BoolValue.of(key === "true");
    case "string":
      return StringValue.of(key);
    case "int32":
    case "sint32":
    case "sfixed32":
    case "int64":
    case "sint64":
    case "sfixed64":
      return IntValue.of(unknownToBigInt(key));
    case "uint32":
    case "uint64":
    case "fixed32":
    case "fixed64":
      return UintValue.of(unknownToBigInt(key));
    default:
      return StringValue.of(key);
  }
}

export function fieldScalarOrMessageToValue(field: protobuf.Field, raw: unknown): Value | null {
  const scalar = scalarToValue(field.type, raw);
  if (scalar) {
    return scalar;
  }

  const resolved = field.resolvedType;
  if (resolved instanceof protobuf.Enum) {
    return enumToValue(resolved, raw);
  }
  if (resolved instanceof protobuf.Type) {
    const object = raw as ProtoObject;
    return messageToValue(resolved, object);
  }
  return null;
}

export function scalarToValue(typeName: string, raw: unknown): Value | null {
  switch (typeName) {
    case "bool":
      return BoolValue.of(Boolean(raw));
    case "string":
      return StringValue.of(String(raw ?? ""));
    case "bytes":
      return BytesValue.of(rawToBytes(raw));
    case "double":
      return DoubleValue.of(Number(raw));
    case "float":
      return DoubleValue.of(roundFloat32(Number(raw)));
    case "int32":
    case "sint32":
    case "sfixed32":
    case "int64":
    case "sint64":
    case "sfixed64":
      return IntValue.of(unknownToBigInt(raw));
    case "uint32":
    case "uint64":
    case "fixed32":
    case "fixed64":
      return UintValue.of(unknownToBigInt(raw));
    default:
      return null;
  }
}

export function rawToBytes(raw: unknown): Uint8Array {
  if (raw instanceof Uint8Array) {
    return raw;
  }
  if (Array.isArray(raw)) {
    return new Uint8Array(raw as number[]);
  }
  if (typeof raw === "string") {
    return new TextEncoder().encode(raw);
  }
  return new Uint8Array();
}

export function enumToValue(enumType: protobuf.Enum, raw: unknown): Value | null {
  const typeName = normalizeTypeName(enumType.fullName ?? "");
  if (typeof raw === "string") {
    const numeric = enumType.values[raw];
    if (numeric !== undefined) {
      return new EnumValue(typeName, BigInt(numeric));
    }
    return null;
  }
  if (typeof raw === "number") {
    return new EnumValue(typeName, BigInt(raw));
  }
  if (typeof raw === "bigint") {
    return new EnumValue(typeName, raw);
  }
  return null;
}

export function protoToTimestamp(object: ProtoObject): Value {
  const seconds = unknownToBigInt(object["seconds"]);
  const nanos = unknownToBigInt(object["nanos"]);
  return TimestampValue.of(seconds * 1_000_000_000n + nanos);
}

export function protoToDuration(object: ProtoObject): Value {
  const seconds = unknownToBigInt(object["seconds"]);
  const nanos = unknownToBigInt(object["nanos"]);
  return DurationValue.of(seconds * 1_000_000_000n + nanos);
}

export function unknownToBigInt(value: unknown): bigint {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number") {
    return BigInt(value);
  }
  if (typeof value === "string") {
    return BigInt(value);
  }
  if (value && typeof value === "object" && "toString" in value) {
    return BigInt(String(value));
  }
  return 0n;
}

export function protoToType(type: ProtoObject): Type | null {
  const typeKind = (type["type_kind"] ?? type["typeKind"]) as string | undefined;
  if (!typeKind) {
    return null;
  }

  switch (typeKind) {
    case "dyn":
      return DynType;
    case "null":
      return NullType;
    case "error":
      return ErrorType;
    case "primitive":
      return protoPrimitiveToType(type["primitive"] as string);
    case "wrapper":
      return protoWrapperToType(type["wrapper"] as string);
    case "well_known":
      return protoWellKnownToType(type["well_known"] as string);
    case "list_type": {
      const listType = type["list_type"] as ProtoObject | undefined;
      const elemType = listType ? protoToType(listType["elem_type"] as ProtoObject) : null;
      return new ListType(elemType ?? DynType);
    }
    case "map_type": {
      const mapType = type["map_type"] as ProtoObject | undefined;
      if (!mapType) {
        return new MapType(DynType, DynType);
      }
      const key = protoToType(mapType["key_type"] as ProtoObject);
      const value = protoToType(mapType["value_type"] as ProtoObject);
      return new MapType(key ?? DynType, value ?? DynType);
    }
    case "message_type":
      return protoMessageNameToType(String(type["message_type"] ?? ""));
    case "type_param":
      return new TypeParamType(String(type["type_param"] ?? ""));
    case "type": {
      const nested = protoToType(type["type"] as ProtoObject);
      return new TypeTypeWithParam(nested ?? DynType);
    }
    case "opaque":
    case "abstract_type": {
      const opaque = type["abstract_type"] as ProtoObject | undefined;
      const name = opaque?.["name"] as string | undefined;
      if (!name) {
        return new OpaqueType("unknown");
      }
      const params = (opaque?.["parameter_types"] ?? []) as ProtoObject[];
      return new OpaqueType(name, ...params.map((param) => protoToType(param) ?? DynType));
    }
    default:
      return DynType;
  }
}

export function protoMessageNameToType(name: string): Type {
  switch (name) {
    case "google.protobuf.Timestamp":
      return TimestampType;
    case "google.protobuf.Duration":
      return DurationType;
    case "google.protobuf.Any":
      return DynType;
    case "google.protobuf.Struct":
    case "google.protobuf.Value":
      return DynType;
    case "google.protobuf.ListValue":
      return new ListType(DynType);
    default:
      return new StructType(name);
  }
}

export function protoPrimitiveToType(value: string | undefined): Type {
  switch (value) {
    case "BOOL":
      return BoolType;
    case "BYTES":
      return BytesType;
    case "DOUBLE":
      return DoubleType;
    case "INT64":
    case "INT32":
      return IntType;
    case "NULL_TYPE":
      return NullType;
    case "STRING":
      return StringType;
    case "UINT64":
    case "UINT32":
      return UintType;
    default:
      return DynType;
  }
}

export function protoWrapperToType(value: string | undefined): Type {
  switch (value) {
    case "BOOL":
      return new StructType("google.protobuf.BoolValue");
    case "INT64":
      return new StructType("google.protobuf.Int64Value");
    case "UINT64":
      return new StructType("google.protobuf.UInt64Value");
    case "INT32":
      return new StructType("google.protobuf.Int32Value");
    case "UINT32":
      return new StructType("google.protobuf.UInt32Value");
    case "DOUBLE":
      return new StructType("google.protobuf.DoubleValue");
    case "FLOAT":
      return new StructType("google.protobuf.FloatValue");
    case "STRING":
      return new StructType("google.protobuf.StringValue");
    case "BYTES":
      return new StructType("google.protobuf.BytesValue");
    default:
      return DynType;
  }
}

export function protoWellKnownToType(value: string | undefined): Type {
  switch (value) {
    case "DURATION":
      return DurationType;
    case "TIMESTAMP":
      return TimestampType;
    default:
      return DynType;
  }
}

export function typeNameToTypeValue(name: string): Value | null {
  switch (name) {
    case "bool":
      return TypeValue.BoolType;
    case "int":
      return TypeValue.IntType;
    case "uint":
      return TypeValue.UintType;
    case "double":
      return TypeValue.DoubleType;
    case "string":
      return TypeValue.StringType;
    case "bytes":
      return TypeValue.BytesType;
    case "null_type":
      return TypeValue.NullType;
    case "list":
      return TypeValue.ListType;
    case "map":
      return TypeValue.MapType;
    case "type":
      return TypeValue.TypeType;
    case "google.protobuf.Duration":
      return TypeValue.DurationType;
    case "google.protobuf.Timestamp":
      return TypeValue.TimestampType;
    default:
      break;
  }
  const enumType = runtime.protobufTypeProvider.findEnumType(name);
  if (enumType) {
    return new TypeValue(enumType);
  }
  return null;
}
